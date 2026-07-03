import crypto from 'crypto'

const COOKIE_NAME = 'suplexity_session'
const STATE_COOKIE = 'suplexity_oauth_state'
const MAX_AGE_SEC = 60 * 60 * 24 * 30 // 30 days

function sessionSecret() {
  const s = process.env.AUTH_SESSION_SECRET?.trim()
  if (s && s.length >= 16) return s
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    console.warn('[auth] AUTH_SESSION_SECRET is missing or too short — using ephemeral dev fallback')
  }
  return 'suplexity-dev-session-secret-change-me'
}

function sign(value) {
  return crypto.createHmac('sha256', sessionSecret()).update(value).digest('base64url')
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

export function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`)
  if (opts.path) parts.push(`Path=${opts.path}`)
  else parts.push('Path=/')
  if (opts.httpOnly) parts.push('HttpOnly')
  if (opts.secure) parts.push('Secure')
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`)
  return parts.join('; ')
}

export function clearCookie(name) {
  return serializeCookie(name, '', { maxAge: 0, path: '/', httpOnly: true, sameSite: 'Lax' })
}

export function createSessionToken(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = sign(body)
  return `${body}.${sig}`
}

export function verifySessionToken(token) {
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
    if (typeof json.email !== 'string' || !json.email) return null
    return json
  } catch {
    return null
  }
}

export function readSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie)
  return verifySessionToken(cookies[COOKIE_NAME])
}

export function setSessionCookie(res, user, { secure }) {
  const exp = Date.now() + MAX_AGE_SEC * 1000
  const token = createSessionToken({
    email: user.email,
    name: user.name ?? '',
    picture: user.picture ?? '',
    mobile: user.mobile ?? '',
    country: user.country ?? '',
    sub: user.id ?? user.sub ?? '',
    provider: user.provider ?? 'local',
    loggedInAt: user.loggedInAt ?? Date.now(),
    exp,
  })
  res.setHeader(
    'Set-Cookie',
    serializeCookie(COOKIE_NAME, token, {
      maxAge: MAX_AGE_SEC,
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
    }),
  )
}

function appendSetCookie(res, value) {
  if (typeof res.append === 'function') res.append('Set-Cookie', value)
  else res.setHeader('Set-Cookie', value)
}

export function clearSessionCookie(res) {
  appendSetCookie(res, clearCookie(COOKIE_NAME))
}

export function setOAuthStateCookie(res, state, { secure }) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(STATE_COOKIE, state, {
      maxAge: 600,
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
    }),
  )
}

export function readOAuthState(req) {
  const cookies = parseCookies(req.headers.cookie)
  return cookies[STATE_COOKIE] ?? null
}

export function clearOAuthStateCookie(res) {
  appendSetCookie(res, clearCookie(STATE_COOKIE))
}

export { COOKIE_NAME, STATE_COOKIE, MAX_AGE_SEC }
