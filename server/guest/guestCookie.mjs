import crypto from 'crypto'

const GUEST_COOKIE = 'suplexity_guest'
const MAX_AGE_SEC = 60 * 60 * 24 * 7 // 7 days

function guestSecret() {
  const s = process.env.AUTH_SESSION_SECRET?.trim()
  if (s && s.length >= 16) return s
  return 'suplexity-dev-session-secret-change-me'
}

function sign(value) {
  return crypto.createHmac('sha256', guestSecret()).update(value).digest('base64url')
}

function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`)
  parts.push('Path=/')
  if (opts.httpOnly) parts.push('HttpOnly')
  if (opts.secure) parts.push('Secure')
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`)
  return parts.join('; ')
}

export function createGuestToken(guestId) {
  const exp = Date.now() + MAX_AGE_SEC * 1000
  const body = Buffer.from(JSON.stringify({ guestId, provider: 'guest', exp }), 'utf8').toString('base64url')
  return `${body}.${sign(body)}`
}

export function verifyGuestToken(token) {
  if (!token || typeof token !== 'string') return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = sign(body)
  if (sig.length !== expected.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  try {
    const json = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!json || typeof json !== 'object') return null
    if (typeof json.exp !== 'number' || json.exp < Date.now()) return null
    if (typeof json.guestId !== 'string' || !json.guestId) return null
    return json
  } catch {
    return null
  }
}

export function parseCookies(header) {
  const out = {}
  if (!header || typeof header !== 'string') return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim()
    const val = part.slice(idx + 1).trim()
    if (!key) continue
    try {
      out[key] = decodeURIComponent(val)
    } catch {
      out[key] = val
    }
  }
  return out
}

export function readGuestFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie)
  return verifyGuestToken(cookies[GUEST_COOKIE])
}

export function setGuestCookie(res, guestId, { secure }) {
  const token = createGuestToken(guestId)
  res.setHeader(
    'Set-Cookie',
    serializeCookie(GUEST_COOKIE, token, {
      maxAge: MAX_AGE_SEC,
      httpOnly: true,
      secure,
      sameSite: 'Lax',
    }),
  )
}

export function clearGuestCookie(res, { secure } = {}) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(GUEST_COOKIE, '', {
      maxAge: 0,
      httpOnly: true,
      secure,
      sameSite: 'Lax',
    }),
  )
}

export { GUEST_COOKIE, MAX_AGE_SEC }
