import crypto from 'crypto'
import {
  authStorageStatus,
  getUserByEmail,
  getUserByMobile,
  getUserByUsername,
  moveUserEmail,
  saveUser,
  withUserByEmail,
} from './userPersistence.mjs'

/** @typedef {{ id: string, name: string, email: string, username: string, mobile: string, country: string, passwordHash: string, passwordSalt: string, createdAt: number, lastLoginAt: number }} StoredUser */

export { authStorageStatus, usersFilePath } from './userPersistence.mjs'

export function newUserId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `usr-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
}

export function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('base64url')
}

export function createPasswordCreds(password) {
  const salt = crypto.randomBytes(16).toString('base64url')
  const passwordHash = hashPassword(password, salt)
  return { passwordSalt: salt, passwordHash }
}

export function verifyPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) return false
  const actual = hashPassword(password, salt)
  try {
    const a = Buffer.from(actual)
    const b = Buffer.from(expectedHash)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function findUserByEmail(dataDir, email) {
  return getUserByEmail(dataDir, email)
}

export async function findUserByMobile(dataDir, mobile) {
  const m = normalizeMobile(mobile)
  if (!m) return null
  return getUserByMobile(dataDir, m)
}

export function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
}

export function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

export const USERNAME_MIN = 3
export const USERNAME_MAX = 32

export function normalizeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase()
}

/**
 * Lowercase letters, digits and single inner hyphens. Kept narrow because a
 * username is a sign-in identifier here, so anything that can be confused with
 * an email address or a path segment is rejected rather than escaped later.
 *
 * @returns {string} empty when valid, otherwise the reason to show the user
 */
export function usernameProblem(username) {
  const u = normalizeUsername(username)
  if (u.length < USERNAME_MIN || u.length > USERNAME_MAX) {
    return `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`
  }
  if (!/^[a-z0-9-]+$/.test(u)) {
    return 'Username can only contain lowercase letters, numbers, and hyphens.'
  }
  if (u.startsWith('-') || u.endsWith('-')) {
    return 'Username cannot start or end with a hyphen.'
  }
  if (u.includes('--')) {
    return 'Username cannot contain two hyphens in a row.'
  }
  return ''
}

/**
 * Builds a starting username for accounts created before usernames existed,
 * and for new sign-ups. The random suffix is what keeps it collision-free
 * without asking the caller to retry.
 */
export function suggestUsername(name, email) {
  const base = normalizeUsername(name || String(email || '').split('@')[0])
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, USERNAME_MAX - 7)
  const stem = base.length >= USERNAME_MIN - 1 ? base : 'trader'
  return `${stem}-${crypto.randomBytes(3).toString('hex')}`
}

export function normalizeMobile(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '')
  return digits.length >= 10 ? digits : ''
}

export function publicUser(row) {
  const digits = String(row.mobile || '').replace(/\D/g, '')
  const displayMobile = digits ? `+${digits}` : ''
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username || '',
    mobile: displayMobile,
    country: row.country || '',
    provider: 'local',
    loggedInAt: row.lastLoginAt ?? row.createdAt,
  }
}

function storageUnavailableResult() {
  const status = authStorageStatus()
  return {
    ok: false,
    error: status.message || 'Account storage is unavailable. Try again later.',
    status: 503,
  }
}

/**
 * @returns {Promise<{ ok: true, user: StoredUser } | { ok: false, error: string, status?: number }>}
 */
export async function registerUser(dataDir, input) {
  const storage = authStorageStatus()
  if (!storage.ready) return storageUnavailableResult()

  const name = String(input.name || '').trim()
  const email = normalizeEmail(input.email)
  const mobile = normalizeMobile(input.mobile)
  const country = String(input.country || '').trim().slice(0, 64)
  const password = String(input.password || '')

  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: 'Enter your full name (2–80 characters).', status: 400 }
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Enter a valid email address.', status: 400 }
  }
  if (!mobile) {
    return { ok: false, error: 'Enter a valid mobile number (at least 10 digits).', status: 400 }
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.', status: 400 }
  }

  const existingEmail = await getUserByEmail(dataDir, email)
  if (existingEmail) {
    return { ok: false, error: 'An account with this email already exists. Sign in instead.', status: 409 }
  }
  const existingMobile = await getUserByMobile(dataDir, mobile)
  if (existingMobile) {
    return { ok: false, error: 'An account with this mobile number already exists.', status: 409 }
  }

  const { passwordHash, passwordSalt } = createPasswordCreds(password)
  const now = Date.now()
  const user = {
    id: newUserId(),
    name,
    email,
    username: await freeUsername(dataDir, name, email),
    mobile,
    country,
    passwordHash,
    passwordSalt,
    createdAt: now,
    lastLoginAt: now,
  }
  await saveUser(dataDir, user)
  return { ok: true, user }
}

/** Retries `suggestUsername` until it lands on one nobody holds. */
async function freeUsername(dataDir, name, email) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = suggestUsername(name, email)
    if (!(await getUserByUsername(dataDir, candidate))) return candidate
  }
  return `trader-${newUserId().replace(/-/g, '').slice(0, 12)}`
}

/**
 * Resolves whatever the sign-in form was given — an email address or a
 * username — to the account's email, which is the storage key everything
 * else works from.
 *
 * @returns {Promise<string>} the email, or '' when nothing matches
 */
export async function resolveLoginEmail(dataDir, identifier) {
  const raw = String(identifier || '').trim()
  if (!raw) return ''
  if (looksLikeEmail(raw)) return normalizeEmail(raw)
  const byUsername = await getUserByUsername(dataDir, raw)
  return byUsername?.email ? normalizeEmail(byUsername.email) : ''
}

/**
 * Login with email or username, plus password.
 * @returns {Promise<{ ok: true, user: StoredUser } | { ok: false, error: string, status?: number }>}
 */
export async function authenticateUser(dataDir, identifier, password) {
  const storage = authStorageStatus()
  if (!storage.ready) return storageUnavailableResult()

  if (!String(identifier || '').trim() || !password) {
    return { ok: false, error: 'Enter your email and password.', status: 400 }
  }
  const notFound = {
    ok: false,
    error: 'No account found for that email or username. Sign up first.',
    status: 401,
  }
  const e = await resolveLoginEmail(dataDir, identifier)
  if (!e) return notFound

  const outcome = await withUserByEmail(dataDir, e, async (user) => {
    if (!user) return notFound
    if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return { ok: false, error: 'Incorrect password.', status: 401 }
    }
    user.lastLoginAt = Date.now()
    return { ok: true, result: user, user }
  })

  if (!outcome.ok) return outcome
  return { ok: true, user: outcome.result }
}

/**
 * Change password for an authenticated email account.
 * @returns {Promise<{ ok: true } | { ok: false, error: string, status?: number }>}
 */
export async function changeUserPassword(dataDir, email, currentPassword, nextPassword) {
  const storage = authStorageStatus()
  if (!storage.ready) return storageUnavailableResult()

  const e = normalizeEmail(email)
  const current = String(currentPassword || '')
  const next = String(nextPassword || '')
  if (!e) return { ok: false, error: 'Not signed in.', status: 401 }
  if (!current) return { ok: false, error: 'Enter your current password.', status: 400 }
  if (next.length < 8) return { ok: false, error: 'New password must be at least 8 characters.', status: 400 }
  if (current === next) {
    return { ok: false, error: 'New password must be different from the current password.', status: 400 }
  }

  const outcome = await withUserByEmail(dataDir, e, async (user) => {
    if (!user) {
      return { ok: false, error: 'No account found for this email.', status: 401 }
    }
    if (!verifyPassword(current, user.passwordSalt, user.passwordHash)) {
      return { ok: false, error: 'Current password is incorrect.', status: 401 }
    }
    const creds = createPasswordCreds(next)
    user.passwordHash = creds.passwordHash
    user.passwordSalt = creds.passwordSalt
    return { ok: true, result: true, user }
  })

  if (!outcome.ok) return outcome
  return { ok: true }
}

/**
 * Reads the profile for the Account tab, minting a username for accounts
 * created before usernames existed so the field is never blank.
 *
 * @returns {Promise<{ ok: true, profile: { name: string, username: string, email: string } } | { ok: false, error: string, status?: number }>}
 */
export async function getAccountProfile(dataDir, email) {
  const storage = authStorageStatus()
  if (!storage.ready) return storageUnavailableResult()

  const existing = await getUserByEmail(dataDir, email)
  if (!existing) return { ok: false, error: 'No account found.', status: 404 }
  const backfill = existing.username ? '' : await freeUsername(dataDir, existing.name, existing.email)

  const outcome = await withUserByEmail(dataDir, email, async (user) => {
    if (!user) return { ok: false, error: 'No account found.', status: 404 }
    if (!user.username && backfill) {
      user.username = backfill
      return { ok: true, result: user, user }
    }
    return { ok: true, result: user }
  })
  if (!outcome.ok) return outcome
  const row = outcome.result
  return {
    ok: true,
    profile: { name: row.name || '', username: row.username || '', email: row.email },
  }
}

/**
 * Updates the name and username together, the way the Account tab saves them.
 *
 * @returns {Promise<{ ok: true, profile: { name: string, username: string, email: string } } | { ok: false, error: string, status?: number }>}
 */
export async function updateAccountProfile(dataDir, email, input) {
  const storage = authStorageStatus()
  if (!storage.ready) return storageUnavailableResult()

  const name = String(input?.name ?? '').trim()
  const username = normalizeUsername(input?.username)
  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: 'Enter your full name (2–80 characters).', status: 400 }
  }
  const problem = usernameProblem(username)
  if (problem) return { ok: false, error: problem, status: 400 }

  const holder = await getUserByUsername(dataDir, username)
  if (holder && normalizeEmail(holder.email) !== normalizeEmail(email)) {
    return { ok: false, error: 'That username is already taken.', status: 409 }
  }

  const outcome = await withUserByEmail(dataDir, email, async (user) => {
    if (!user) return { ok: false, error: 'No account found.', status: 404 }
    user.name = name
    user.username = username
    return { ok: true, result: user, user }
  })
  if (!outcome.ok) return outcome
  const row = outcome.result
  return {
    ok: true,
    profile: { name: row.name, username: row.username, email: row.email },
  }
}

/**
 * Moves the account to a new email address.
 *
 * The password check is the point of the operation — the email is the sign-in
 * identifier and the password-reset target, so taking it on a live session
 * alone would turn a borrowed browser into an account takeover.
 *
 * @returns {Promise<{ ok: true, user: StoredUser } | { ok: false, error: string, status?: number }>}
 */
export async function changeUserEmail(dataDir, currentEmail, password, nextEmail) {
  const storage = authStorageStatus()
  if (!storage.ready) return storageUnavailableResult()

  const from = normalizeEmail(currentEmail)
  const to = normalizeEmail(nextEmail)
  if (!from) return { ok: false, error: 'Not signed in.', status: 401 }
  if (!password) return { ok: false, error: 'Enter your password to confirm.', status: 400 }
  if (!looksLikeEmail(to)) return { ok: false, error: 'Enter a valid email address.', status: 400 }
  if (from === to) {
    return { ok: false, error: 'That is already your email address.', status: 400 }
  }
  if ((await getUserByEmail(dataDir, to)) !== null) {
    return { ok: false, error: 'An account with this email already exists.', status: 409 }
  }

  const current = await getUserByEmail(dataDir, from)
  if (!current) return { ok: false, error: 'No account found.', status: 404 }
  if (!verifyPassword(password, current.passwordSalt, current.passwordHash)) {
    return { ok: false, error: 'Password is incorrect.', status: 401 }
  }

  const moved = { ...current, email: to }
  await moveUserEmail(dataDir, from, moved)
  return { ok: true, user: moved }
}
