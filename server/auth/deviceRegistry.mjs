/**
 * Per-account device list.
 *
 * Session cookies are stateless signed tokens, so revoking a device works by
 * minting a device id at login, embedding it in the token, and keeping the
 * authoritative list on the user record. A token whose device id is no longer
 * listed is treated as signed out — see `sessionDeviceActive`.
 */

import crypto from 'crypto'
import { withUserByEmail } from './userPersistence.mjs'

/** Oldest entries fall off once an account has this many devices. */
const MAX_DEVICES = 20

export function newDeviceId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `dev-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
}

/**
 * Coarse user-agent read. Enough to tell one of your own devices from another
 * in a list; not a fingerprinting library.
 */
export function describeUserAgent(userAgent) {
  const ua = String(userAgent || '')

  let browser = 'Unknown browser'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) browser = 'Opera'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  else if (/Safari\//.test(ua)) browser = 'Safari'

  let os = 'Unknown OS'
  if (/Windows NT 10/.test(ua)) os = 'Windows'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Linux/.test(ua)) os = 'Linux'

  const kind = /iPhone|iPod|Android.*Mobile/.test(ua)
    ? 'phone'
    : /iPad|Tablet|Android/.test(ua)
      ? 'tablet'
      : 'desktop'

  return { browser, os, kind }
}

export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim()
  const raw = forwarded || req.ip || req.socket?.remoteAddress || ''
  // Express reports IPv4 loopback as ::ffff:127.0.0.1 behind the IPv6 stack.
  return raw.replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1')
}

function publicDevice(row, currentDeviceId) {
  return {
    id: row.id,
    browser: row.browser || 'Unknown browser',
    os: row.os || 'Unknown OS',
    kind: row.kind || 'desktop',
    ip: row.ip || '',
    firstSeenAt: row.firstSeenAt ?? row.lastSeenAt ?? 0,
    lastSeenAt: row.lastSeenAt ?? 0,
    current: row.id === currentDeviceId,
  }
}

function devicesOf(user) {
  return Array.isArray(user?.devices) ? user.devices : []
}

/** Adds or refreshes the device behind this request. Best effort. */
export async function recordDeviceLogin(dataDir, email, { deviceId, userAgent, ip }) {
  const { browser, os, kind } = describeUserAgent(userAgent)
  const now = Date.now()
  try {
    await withUserByEmail(dataDir, email, async (user) => {
      if (!user) return { ok: false, error: 'not_found', status: 404 }
      const devices = devicesOf(user)
      const existing = devices.find((d) => d && d.id === deviceId)
      if (existing) {
        existing.browser = browser
        existing.os = os
        existing.kind = kind
        existing.ip = ip
        existing.lastSeenAt = now
      } else {
        devices.unshift({ id: deviceId, browser, os, kind, ip, firstSeenAt: now, lastSeenAt: now })
      }
      user.devices = devices
        .filter(Boolean)
        .sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0))
        .slice(0, MAX_DEVICES)
      return { ok: true, result: true, user }
    })
  } catch (e) {
    console.error('[auth] recordDeviceLogin failed:', e?.message || e)
  }
}

/** Bumps lastSeenAt without rewriting the rest of the record. Best effort. */
export async function touchDevice(dataDir, email, deviceId) {
  if (!deviceId) return
  try {
    await withUserByEmail(dataDir, email, async (user) => {
      if (!user) return { ok: false, error: 'not_found', status: 404 }
      const device = devicesOf(user).find((d) => d && d.id === deviceId)
      if (!device) return { ok: false, error: 'not_found', status: 404 }
      device.lastSeenAt = Date.now()
      return { ok: true, result: true, user }
    })
  } catch {
    /* best effort */
  }
}

export async function listDevices(dataDir, email, currentDeviceId) {
  const outcome = await withUserByEmail(dataDir, email, async (user) => {
    if (!user) return { ok: false, error: 'No account found.', status: 404 }
    return {
      ok: true,
      result: devicesOf(user)
        .filter(Boolean)
        .sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0))
        .map((d) => publicDevice(d, currentDeviceId)),
    }
  })
  return outcome
}

export async function revokeDevice(dataDir, email, deviceId) {
  return withUserByEmail(dataDir, email, async (user) => {
    if (!user) return { ok: false, error: 'No account found.', status: 404 }
    const devices = devicesOf(user)
    if (!devices.some((d) => d && d.id === deviceId)) {
      return { ok: false, error: 'That device is already signed out.', status: 404 }
    }
    user.devices = devices.filter((d) => d && d.id !== deviceId)
    return { ok: true, result: true, user }
  })
}

/**
 * Whether a session token's device is still authorised.
 *
 * Tokens minted before device tracking existed carry no device id; those stay
 * valid so an upgrade does not sign everybody out. Storage errors also return
 * true, because a read failure must not lock people out of their own account.
 */
export async function sessionDeviceActive(dataDir, session) {
  const deviceId = session?.did
  if (!deviceId) return true
  try {
    const outcome = await withUserByEmail(dataDir, session.email, async (user) => {
      if (!user) return { ok: true, result: true }
      const devices = devicesOf(user)
      if (!devices.length) return { ok: true, result: true }
      return { ok: true, result: devices.some((d) => d && d.id === deviceId) }
    })
    return outcome.ok ? outcome.result : true
  } catch {
    return true
  }
}
