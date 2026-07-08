import crypto from 'crypto'
import {
  authStorageStatus,
  getUserByEmail,
  getUserByMobile,
  saveUser,
  withUserByEmail,
} from './userPersistence.mjs'

/** @typedef {{ id: string, name: string, email: string, mobile: string, country: string, passwordHash: string, passwordSalt: string, createdAt: number, lastLoginAt: number }} StoredUser */

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

/**
 * Login with email + password.
 * @returns {Promise<{ ok: true, user: StoredUser } | { ok: false, error: string, status?: number }>}
 */
export async function authenticateUser(dataDir, email, password) {
  const storage = authStorageStatus()
  if (!storage.ready) return storageUnavailableResult()

  const e = normalizeEmail(email)
  if (!e || !password) {
    return { ok: false, error: 'Enter your email and password.', status: 400 }
  }

  const outcome = await withUserByEmail(dataDir, e, async (user) => {
    if (!user) {
      return { ok: false, error: 'No account found for this email. Sign up first.', status: 401 }
    }
    if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return { ok: false, error: 'Incorrect password.', status: 401 }
    }
    user.lastLoginAt = Date.now()
    return { ok: true, result: user, user }
  })

  if (!outcome.ok) return outcome
  return { ok: true, user: outcome.result }
}
