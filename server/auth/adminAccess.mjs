import { readSessionFromRequest } from './sessionCookie.mjs'

/** Comma-separated admin emails — e.g. ADMIN_EMAILS=you@example.com,ops@example.com */
export function parseAdminEmails() {
  const raw = process.env.ADMIN_EMAILS?.trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email) {
  const e = String(email || '')
    .trim()
    .toLowerCase()
  if (!e) return false
  const admins = parseAdminEmails()
  if (!admins.length) return false
  return admins.includes(e)
}

/** @returns {{ ok: true, session: object } | { ok: false, status: number, error: string }} */
export function requireAuthedSession(req) {
  const session = readSessionFromRequest(req)
  if (!session?.email) {
    return { ok: false, status: 401, error: 'not_authenticated' }
  }
  return { ok: true, session }
}

/** @returns {{ ok: true, session: object } | { ok: false, status: number, error: string }} */
export function requireAdminSession(req) {
  const auth = requireAuthedSession(req)
  if (!auth.ok) return auth
  if (!isAdminEmail(auth.session.email)) {
    return { ok: false, status: 403, error: 'not_admin' }
  }
  return auth
}
