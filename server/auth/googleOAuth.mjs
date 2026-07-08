/**
 * Google OAuth 2.0 redirect flow.
 *
 * Required env (set in .env.local or Vercel):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   AUTH_SESSION_SECRET   — min 16 chars, random string
 *   AUTH_BASE_URL         — e.g. http://localhost:5199 (dev via Vite) or https://tradeneu.com
 *
 * Google Cloud Console → OAuth client → Authorized redirect URI:
 *   {AUTH_BASE_URL}/api/auth/google/callback
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  readOAuthState,
  readSessionFromRequest,
  setOAuthStateCookie,
  setSessionCookie,
} from './sessionCookie.mjs'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo'

function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim())
}

function requestBaseUrl(req) {
  const fromEnv = process.env.AUTH_BASE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http'
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost'
  return `${proto}://${host}`
}

function isSecureRequest(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http'
  return proto === 'https'
}

function loginPath() {
  return '/loginPage'
}

function homePath() {
  return '/HomePage'
}

function redirectUri(req) {
  return `${requestBaseUrl(req)}/api/auth/google/callback`
}

function appendUsersFile(dataDir, user) {
  try {
    const file = path.join(dataDir, 'google-users.json')
    let rows = []
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (Array.isArray(parsed)) rows = parsed
    }
    const idx = rows.findIndex((r) => r && r.email === user.email)
    const row = {
      email: user.email,
      name: user.name ?? '',
      picture: user.picture ?? '',
      sub: user.sub ?? '',
      provider: 'google',
      lastLoginAt: Date.now(),
      createdAt: idx >= 0 ? rows[idx].createdAt ?? Date.now() : Date.now(),
    }
    if (idx >= 0) rows[idx] = row
    else rows.push(row)
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(file, JSON.stringify(rows, null, 2))
  } catch (e) {
    console.warn('[auth] could not persist google user:', e?.message || e)
  }
}

async function exchangeCodeForTokens(code, redirect) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) throw new Error('google_not_configured')

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirect,
    grant_type: 'authorization_code',
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error_description || json?.error || 'token_exchange_failed')
  }
  return json
}

async function verifyIdToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const res = await fetch(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error_description || 'invalid_id_token')
  if (json.aud !== clientId) throw new Error('invalid_audience')
  const iss = String(json.iss || '')
  if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') {
    throw new Error('invalid_issuer')
  }
  return {
    email: String(json.email || '').toLowerCase(),
    name: String(json.name || ''),
    picture: String(json.picture || ''),
    sub: String(json.sub || ''),
    emailVerified: json.email_verified === 'true' || json.email_verified === true,
  }
}

function publicUser(session) {
  return {
    email: session.email,
    name: session.name || '',
    picture: session.picture || '',
    provider: session.provider || 'google',
    loggedInAt: session.loggedInAt ?? Date.now(),
  }
}

export function mountGoogleAuthRoutes(app, { dataDir }) {
  app.set('trust proxy', 1)

  app.get('/api/auth/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      ok: true,
      googleEnabled: googleConfigured(),
    })
  })

  app.get('/api/auth/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const session = readSessionFromRequest(req)
    if (!session) {
      res.status(401).json({ ok: false, error: 'not_authenticated' })
      return
    }
    res.json({ ok: true, user: publicUser(session) })
  })

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(res)
    res.json({ ok: true })
  })

  app.get('/api/auth/google', (req, res) => {
    if (!googleConfigured()) {
      res.redirect(`${loginPath()}?auth_error=google_not_configured`)
      return
    }
    const state = crypto.randomBytes(24).toString('base64url')
    const secure = isSecureRequest(req)
    setOAuthStateCookie(res, state, { secure })

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID.trim(),
      redirect_uri: redirectUri(req),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    })
    res.redirect(`${GOOGLE_AUTH_URL}?${params}`)
  })

  app.get('/api/auth/google/callback', async (req, res) => {
    const secure = isSecureRequest(req)
    const fail = (code) => {
      clearOAuthStateCookie(res)
      res.redirect(`${loginPath()}?auth_error=${encodeURIComponent(code)}`)
    }

    if (!googleConfigured()) {
      fail('google_not_configured')
      return
    }

    const err = typeof req.query.error === 'string' ? req.query.error : null
    if (err) {
      fail(err === 'access_denied' ? 'access_denied' : err)
      return
    }

    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const savedState = readOAuthState(req)
    clearOAuthStateCookie(res)

    if (!code || !state || !savedState || state !== savedState) {
      fail('invalid_state')
      return
    }

    try {
      const tokens = await exchangeCodeForTokens(code, redirectUri(req))
      if (!tokens.id_token) {
        fail('missing_id_token')
        return
      }
      const profile = await verifyIdToken(tokens.id_token)
      if (!profile.email) {
        fail('missing_email')
        return
      }
      if (!profile.emailVerified) {
        fail('email_not_verified')
        return
      }

      const user = {
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        sub: profile.sub,
        loggedInAt: Date.now(),
      }
      appendUsersFile(dataDir, user)
      setSessionCookie(res, user, { secure })
      res.redirect(homePath())
    } catch (e) {
      console.error('[auth] google callback error:', e?.message || e)
      fail('oauth_failed')
    }
  })
}

export { googleConfigured }
