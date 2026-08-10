import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const USERS_FILE = 'users.json'
const USERS_DIR = 'users'

export function usersFilePath(dataDir) {
  return path.join(dataDir, USERS_FILE)
}

function usersDirPath(dataDir) {
  return path.join(dataDir, USERS_DIR)
}

function normalizeEmailKey(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
}

/** Safe filename segment from email (no slashes or reserved chars). */
export function emailToStorageKey(email) {
  const e = normalizeEmailKey(email)
  if (!e) return ''
  if (typeof crypto.randomUUID === 'function') {
    return crypto.createHash('sha256').update(e).digest('base64url').slice(0, 43)
  }
  return Buffer.from(e).toString('base64url').replace(/=/g, '')
}

function userFilePath(dataDir, email) {
  return path.join(usersDirPath(dataDir), `${emailToStorageKey(email)}.json`)
}

/**
 * @returns {{ ready: boolean, backend: 'file', message?: string }}
 */
export function authStorageStatus() {
  return { ready: true, backend: 'file' }
}

function readUsersFromFile(dataDir) {
  const dir = usersDirPath(dataDir)
  if (fs.existsSync(dir)) {
    const users = []
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
        if (parsed && typeof parsed === 'object' && parsed.email) users.push(parsed)
      } catch {
        /* skip corrupt file */
      }
    }
    if (users.length) return users
  }
  const legacy = usersFilePath(dataDir)
  try {
    if (!fs.existsSync(legacy)) return []
    const parsed = JSON.parse(fs.readFileSync(legacy, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeUserToFile(dataDir, user) {
  const dir = usersDirPath(dataDir)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(userFilePath(dataDir, user.email), JSON.stringify(user, null, 2), 'utf8')
}

function readUserFromFile(dataDir, email) {
  const file = userFilePath(dataDir, email)
  try {
    if (!fs.existsSync(file)) return null
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** @returns {Promise<import('./userStore.mjs').StoredUser | null>} */
export async function getUserByEmail(dataDir, email) {
  const e = normalizeEmailKey(email)
  if (!e) return null
  let user = readUserFromFile(dataDir, e)
  if (user) return user
  const legacy = readUsersFromFile(dataDir)
  return legacy.find((u) => u && normalizeEmailKey(u.email) === e) ?? null
}

/** @returns {Promise<import('./userStore.mjs').StoredUser | null>} */
export async function getUserByMobile(dataDir, mobileDigits) {
  const m = String(mobileDigits || '').replace(/\D/g, '')
  if (m.length < 10) return null
  const users = readUsersFromFile(dataDir)
  return users.find((u) => String(u.mobile || '').replace(/\D/g, '') === m) ?? null
}

/** @param {import('./userStore.mjs').StoredUser} user */
export async function saveUser(dataDir, user) {
  writeUserToFile(dataDir, user)
}

/** @returns {Promise<import('./userStore.mjs').StoredUser[]>} */
export async function readUsers(dataDir) {
  return readUsersFromFile(dataDir)
}

/** @param {import('./userStore.mjs').StoredUser[]} users */
export async function writeUsers(dataDir, users) {
  const dir = usersDirPath(dataDir)
  fs.mkdirSync(dir, { recursive: true })
  for (const user of users) {
    if (user?.email) writeUserToFile(dataDir, user)
  }
  fs.writeFileSync(usersFilePath(dataDir), JSON.stringify(users, null, 2), 'utf8')
}

/**
 * @template T
 * @param {string} dataDir
 * @param {(user: import('./userStore.mjs').StoredUser | null) => Promise<{ ok: true, result: T, user?: import('./userStore.mjs').StoredUser } | { ok: false, error: string, status?: number }>>} work
 */
export async function withUserByEmail(dataDir, email, work) {
  const e = normalizeEmailKey(email)
  let user = readUserFromFile(dataDir, e)
  if (!user) {
    const legacy = readUsersFromFile(dataDir)
    user = legacy.find((u) => u && normalizeEmailKey(u.email) === e) ?? null
  }
  const outcome = await work(user)
  if (!outcome.ok) return outcome
  if (outcome.user) writeUserToFile(dataDir, outcome.user)
  return { ok: true, result: outcome.result }
}
