/**
 * Email + password auth — users stored in server-data/users.json (local)
 * or Vercel Blob (production). Requires AUTH_SESSION_SECRET in env (min 16 chars).
 */

import {
  clearSessionCookie,
  readSessionFromRequest,
  setSessionCookie,
} from './sessionCookie.mjs'
import { authStorageStatus, authenticateUser, publicUser, registerUser } from './userStore.mjs'

function isSecureRequest(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http'
  return proto === 'https'
}

function sessionUserFromRow(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    mobile: row.mobile,
    country: row.country || '',
    provider: 'local',
    loggedInAt: row.lastLoginAt ?? Date.now(),
  }
}

export function mountLocalAuthRoutes(app, { dataDir }) {
  app.set('trust proxy', 1)

  app.get('/api/auth/config', (_req, res) => {
    const storage = authStorageStatus()
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      ok: true,
      authMode: 'local',
      storageBackend: storage.backend,
      storageReady: storage.ready,
      storageMessage: storage.message,
    })
  })

  app.get('/api/auth/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const session = readSessionFromRequest(req)
    if (!session) {
      res.status(401).json({ ok: false, error: 'not_authenticated' })
      return
    }
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
      setSessionCookie(res, sessionUserFromRow(result.user), { secure })
      res.json({ ok: true, user: publicUser(result.user) })
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
      setSessionCookie(res, sessionUserFromRow(result.user), { secure })
      res.json({ ok: true, user: publicUser(result.user) })
    } catch (e) {
      console.error('[auth] login error:', e?.message || e)
      res.status(500).json({ ok: false, error: 'Sign-in failed on the server. Try again.' })
    }
  })

  app.post('/api/auth/logout', (req, res) => {
    const secure = isSecureRequest(req)
    clearSessionCookie(res, { secure })
    res.json({ ok: true })
  })
}
