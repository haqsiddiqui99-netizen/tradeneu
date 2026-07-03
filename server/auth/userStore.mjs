import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const USERS_FILE = 'users.json'

/** @typedef {{ id: string, name: string, email: string, mobile: string, country: string, passwordHash: string, passwordSalt: string, createdAt: number, lastLoginAt: number }} StoredUser */

export function usersFilePath(dataDir) {
  return path.join(dataDir, USERS_FILE)
}

function readUsers(dataDir) {
  const file = usersFilePath(dataDir)
  try {
    if (!fs.existsSync(file)) return []
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeUsers(dataDir, users) {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(usersFilePath(dataDir), JSON.stringify(users, null, 2))
}

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

export function findUserByEmail(dataDir, email) {
  const e = normalizeEmail(email)
  return readUsers(dataDir).find((u) => u && u.email === e) ?? null
}

export function findUserByMobile(dataDir, mobile) {
  const m = normalizeMobile(mobile)
  if (!m) return null
  return readUsers(dataDir).find((u) => u && normalizeMobile(u.mobile) === m) ?? null
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

/**
 * @returns {{ ok: true, user: StoredUser } | { ok: false, error: string, status?: number }}
 */
export function registerUser(dataDir, input) {
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

  const users = readUsers(dataDir)
  if (users.some((u) => u.email === email)) {
    return { ok: false, error: 'An account with this email already exists. Sign in instead.', status: 409 }
  }
  if (users.some((u) => normalizeMobile(u.mobile) === mobile)) {
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
  users.push(user)
  writeUsers(dataDir, users)
  return { ok: true, user }
}

/**
 * Login with email + password.
 */
export function authenticateUser(dataDir, email, password) {
  const e = normalizeEmail(email)
  if (!e || !password) {
    return { ok: false, error: 'Enter your email and password.', status: 400 }
  }
  const users = readUsers(dataDir)
  const user = users.find((u) => u.email === e)
  if (!user) {
    return { ok: false, error: 'No account found for this email. Sign up first.', status: 401 }
  }
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return { ok: false, error: 'Incorrect password.', status: 401 }
  }
  user.lastLoginAt = Date.now()
  writeUsers(dataDir, users)
  return { ok: true, user }
}
