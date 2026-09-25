/**
 * Email + password auth — file-backed user store on server-data/ or Railway /data volume.
 * Requires AUTH_SESSION_SECRET in env (min 16 chars).
 */

import {
  clearSessionCookie,
  readSessionFromRequest,
  setSessionCookie,
} from './sessionCookie.mjs'
import {
  authStorageStatus,
  authenticateUser,
  changeUserEmail,
  changeUserPassword,
  getAccountProfile,
  publicUser,
  registerUser,
  updateAccountProfile,
} from './userStore.mjs'
import { googleConfigured } from './googleOAuth.mjs'
import { recordAuthLogin } from '../telemetry/telemetryRoutes.mjs'
import { isAdminEmail } from './adminAccess.mjs'
import {
  clientIp,
  listDevices,
  newDeviceId,
  recordDeviceLogin,
  revokeDevice,
  sessionDeviceActive,
  touchDevice,
} from './deviceRegistry.mjs'

function isSecureRequest(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http'
  return proto === 'https'
}

function sessionUserFromRow(row, deviceId) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    mobile: row.mobile,
    country: row.country || '',
    provider: 'local',
    loggedInAt: row.lastLoginAt ?? Date.now(),
    did: deviceId,
  }
}

/** Mints a device for this sign-in and records it against the account. */
async function startDeviceSession(dataDir, req, user) {
  const deviceId = newDeviceId()
  await recordDeviceLogin(dataDir, user.email, {
    deviceId,
    userAgent: req.headers['user-agent'],
    ip: clientIp(req),
  })
  return deviceId
}

export function mountLocalAuthRoutes(app, { dataDir }) {
  app.set('trust proxy', 1)

  app.get('/api/auth/config', (_req, res) => {
    const storage = authStorageStatus()
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      ok: true,
      authMode: 'local',
      googleEnabled: googleConfigured(),
      storageBackend: storage.backend,
      storageReady: storage.ready,
      storageMessage: storage.message,
    })
  })

  app.get('/api/auth/me', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const session = readSessionFromRequest(req)
    if (!session) {
      res.status(401).json({ ok: false, error: 'not_authenticated' })
      return
    }
    // A device revoked from another browser only takes effect here, which is
    // the first call every client makes on boot.
    if (!(await sessionDeviceActive(dataDir, session))) {
      clearSessionCookie(res, { secure: isSecureRequest(req) })
      res.status(401).json({ ok: false, error: 'device_revoked' })
      return
    }
    void touchDevice(dataDir, session.email, session.did)
    res.json({
      ok: true,
      user: {
        id: session.sub || '',
        email: session.email,
        name: session.name || '',
        mobile: session.mobile || '',
        country: session.country || '',
        picture: session.picture || '',
        provider: session.provider || 'local',
        loggedInAt: session.loggedInAt ?? Date.now(),
        isAdmin: isAdminEmail(session.email),
      },
    })
  })

  app.post('/api/auth/register', async (req, res) => {
    try {
      const result = await registerUser(dataDir, req.body ?? {})
      if (!result.ok) {
        res.status(result.status ?? 400).json({ ok: false, error: result.error })
        return
      }
      const secure = isSecureRequest(req)
      const deviceId = await startDeviceSession(dataDir, req, result.user)
      setSessionCookie(res, sessionUserFromRow(result.user, deviceId), { secure })
      recordAuthLogin(dataDir, result.user, 'local')
      res.json({
        ok: true,
        user: { ...publicUser(result.user), isAdmin: isAdminEmail(result.user.email) },
      })
    } catch (e) {
      console.error('[auth] register error:', e?.message || e)
      res.status(500).json({ ok: false, error: 'Registration failed on the server. Try again.' })
    }
  })

  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = req.body?.email
      const password = req.body?.password
      const result = await authenticateUser(dataDir, email, password)
      if (!result.ok) {
        res.status(result.status ?? 401).json({ ok: false, error: result.error })
        return
      }
      const secure = isSecureRequest(req)
      const deviceId = await startDeviceSession(dataDir, req, result.user)
      setSessionCookie(res, sessionUserFromRow(result.user, deviceId), { secure })
      recordAuthLogin(dataDir, result.user, 'local')
      res.json({
        ok: true,
        user: { ...publicUser(result.user), isAdmin: isAdminEmail(result.user.email) },
      })
    } catch (e) {
      console.error('[auth] login error:', e?.message || e)
      res.status(500).json({ ok: false, error: 'Sign-in failed on the server. Try again.' })
    }
  })

  app.post('/api/auth/logout', async (req, res) => {
    const session = readSessionFromRequest(req)
    // Signing out should take the device off the list, not leave it showing as
    // still connected.
    if (session?.email && session.did) {
      await revokeDevice(dataDir, session.email, session.did).catch(() => {})
    }
    const secure = isSecureRequest(req)
    clearSessionCookie(res, { secure })
    res.json({ ok: true })
  })

  app.get('/api/auth/devices', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const session = readSessionFromRequest(req)
    if (!session?.email) {
      res.status(401).json({ ok: false, error: 'Sign in to see your devices.' })
      return
    }
    if ((session.provider || 'local') === 'guest') {
      res.status(400).json({ ok: false, error: 'Guest sessions are not tied to an account.' })
      return
    }
    try {
      const outcome = await listDevices(dataDir, session.email, session.did)
      if (!outcome.ok) {
        res.status(outcome.status ?? 400).json({ ok: false, error: outcome.error })
        return
      }
      res.json({ ok: true, devices: outcome.result })
    } catch (e) {
      console.error('[auth] list devices error:', e?.message || e)
      res.status(500).json({ ok: false, error: 'Could not load your devices. Try again.' })
    }
  })

  app.delete('/api/auth/devices/:id', async (req, res) => {
    const session = readSessionFromRequest(req)
    if (!session?.email) {
      res.status(401).json({ ok: false, error: 'Sign in to manage your devices.' })
      return
    }
    const deviceId = String(req.params.id || '')
    try {
      const outcome = await revokeDevice(dataDir, session.email, deviceId)
      if (!outcome.ok) {
        res.status(outcome.status ?? 400).json({ ok: false, error: outcome.error })
        return
      }
      // Revoking the device you are on is a sign-out, so drop the cookie too.
      if (deviceId === session.did) clearSessionCookie(res, { secure: isSecureRequest(req) })
      res.json({ ok: true, signedOutSelf: deviceId === session.did })
    } catch (e) {
      console.error('[auth] revoke device error:', e?.message || e)
      res.status(500).json({ ok: false, error: 'Could not sign out that device. Try again.' })
    }
  })

  app.post('/api/auth/change-password', async (req, res) => {
    try {
      const session = readSessionFromRequest(req)
      if (!session?.email) {
        res.status(401).json({ ok: false, error: 'Sign in to update your password.' })
        return
      }
      if ((session.provider || 'local') === 'guest') {
        res.status(400).json({ ok: false, error: 'Guest accounts cannot change password.' })
        return
      }
      const currentPassword = req.body?.currentPassword
      const newPassword = req.body?.newPassword
      const result = await changeUserPassword(dataDir, session.email, currentPassword, newPassword)
      if (!result.ok) {
        res.status(result.status ?? 400).json({ ok: false, error: result.error })
        return
      }
      res.json({ ok: true })
    } catch (e) {
      console.error('[auth] change-password error:', e?.message || e)
      res.status(500).json({ ok: false, error: 'Could not update password. Try again.' })
    }
  })

  /**
   * Rejects anyone the Account tab's account-level actions cannot serve.
   * @returns {{ email: string } | null} null once a response has been sent
   */
  function requireAccountSession(req, res, verb) {
    const session = readSessionFromRequest(req)
    if (!session?.email) {
      res.status(401).json({ ok: false, error: `Sign in to ${verb}.` })
      return null
    }
    if ((session.provider || 'local') === 'guest') {
      res.status(400).json({ ok: false, error: 'Guest accounts are stored in this browser only.' })
      return null
    }
    if ((session.provider || 'local') !== 'local') {
      res.status(400).json({
        ok: false,
        error: 'This account signs in through Google. Manage these details there.',
      })
      return null
    }
    return session
  }

  app.get('/api/auth/profile', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const session = requireAccountSession(req, res, 'see your profile')
    if (!session) return
    try {
      const result = await getAccountProfile(dataDir, session.email)
      if (!result.ok) {
        res.status(result.status ?? 400).json({ ok: false, error: result.error })
        return
      }
      res.json({ ok: true, profile: result.profile })
    } catch (e) {
      console.error('[auth] profile read error:', e?.message || e)
      res.status(500).json({ ok: false, error: 'Could not load your profile. Try again.' })
    }
  })

  app.post('/api/auth/profile', async (req, res) => {
    const session = requireAccountSession(req, res, 'update your profile')
    if (!session) return
    try {
      const result = await updateAccountProfile(dataDir, session.email, req.body ?? {})
      if (!result.ok) {
        res.status(result.status ?? 400).json({ ok: false, error: result.error })
        return
      }
      // The name rides in the session token, so it has to be re-minted or the
      // old one comes back on the next page load.
      setSessionCookie(res, { ...session, name: result.profile.name }, { secure: isSecureRequest(req) })
      res.json({ ok: true, profile: result.profile })
    } catch (e) {
      console.error('[auth] profile update error:', e?.message || e)
      res.status(500).json({ ok: false, error: 'Could not update your profile. Try again.' })
    }
  })

  app.post('/api/auth/change-email', async (req, res) => {
    const session = requireAccountSession(req, res, 'change your email')
    if (!session) return
    try {
      const result = await changeUserEmail(
        dataDir,
        session.email,
        req.body?.password,
        req.body?.newEmail,
      )
      if (!result.ok) {
        res.status(result.status ?? 400).json({ ok: false, error: result.error })
        return
      }
      // The old cookie still names the old address, which no longer resolves
      // to a stored account — re-issue before replying or the next request
      // signs them out.
      setSessionCookie(res, sessionUserFromRow(result.user, session.did), {
        secure: isSecureRequest(req),
      })
      res.json({ ok: true, email: result.user.email })
    } catch (e) {
      console.error('[auth] change-email error:', e?.message || e)
      res.status(500).json({ ok: false, error: 'Could not change your email. Try again.' })
    }
  })
}
