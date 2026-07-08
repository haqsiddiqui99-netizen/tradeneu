import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { get, list, put } from '@vercel/blob'

const USERS_FILE = 'users.json'
const USERS_DIR = 'users'
const LEGACY_BLOB_PATHNAME = 'tradeneu/auth/users.json'
const USER_BLOB_PREFIX = 'tradeneu/auth/users/'

/** Serialize blob operations on this instance (per-user blobs avoid cross-instance array races). */
let blobQueue = Promise.resolve()
let legacyBlobMigrated = false

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || ''
}

function blobStoreId() {
  return process.env.BLOB_STORE_ID?.trim() || ''
}

function useBlobStorage() {
  if (blobToken()) return true
  if (process.env.VERCEL && blobStoreId()) return true
  return false
}

function runBlobExclusive(fn) {
  const next = blobQueue.then(fn, fn)
  blobQueue = next.catch(() => {})
  return next
}

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

/** Safe blob pathname segment from email (no slashes or reserved chars). */
export function emailToStorageKey(email) {
  const e = normalizeEmailKey(email)
  if (!e) return ''
  if (typeof crypto.randomUUID === 'function') {
    return crypto.createHash('sha256').update(e).digest('base64url').slice(0, 43)
  }
  return Buffer.from(e).toString('base64url').replace(/=/g, '')
}

function userBlobPathname(email) {
  return `${USER_BLOB_PREFIX}${emailToStorageKey(email)}.json`
}

function userFilePath(dataDir, email) {
  return path.join(usersDirPath(dataDir), `${emailToStorageKey(email)}.json`)
}

/**
 * @returns {{ ready: boolean, backend: 'blob' | 'file' | 'none', message?: string }}
 */
export function authStorageStatus() {
  if (useBlobStorage()) {
    return { ready: true, backend: 'blob' }
  }
  if (process.env.VERCEL) {
    return {
      ready: false,
      backend: 'none',
      message:
        'Account storage is not configured on Vercel. Open your project → Storage → Create Blob store → Connect to tradeneu, then redeploy.',
    }
  }
  return { ready: true, backend: 'file' }
}

function blobGetOptions() {
  const token = blobToken()
  return {
    access: 'private',
    useCache: false,
    ...(token ? { token } : {}),
  }
}

function blobPutOptions() {
  const token = blobToken()
  return {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    ...(token ? { token } : {}),
  }
}

function blobListOptions() {
  const token = blobToken()
  return {
    prefix: USER_BLOB_PREFIX,
    ...(token ? { token } : {}),
  }
}

function isBlobNotFound(err) {
  const name = err?.name || ''
  const msg = String(err?.message || err || '').toLowerCase()
  return name === 'BlobNotFoundError' || msg.includes('not found') || msg.includes('does not exist')
}

async function streamToText(stream) {
  const reader = stream.getReader()
  const chunks = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function readJsonFromBlobPath(pathname) {
  try {
    const result = await get(pathname, blobGetOptions())
    if (!result || result.statusCode !== 200 || !result.stream) return null
    const text = await streamToText(result.stream)
    if (!text.trim()) return null
    return JSON.parse(text)
  } catch (err) {
    if (isBlobNotFound(err)) return null
    throw err
  }
}

async function writeJsonToBlobPath(pathname, data) {
  await put(pathname, JSON.stringify(data, null, 2), blobPutOptions())
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

async function migrateLegacyBlobUsersIfNeeded() {
  if (legacyBlobMigrated) return
  legacyBlobMigrated = true
  const legacy = await readJsonFromBlobPath(LEGACY_BLOB_PATHNAME)
  if (!Array.isArray(legacy) || !legacy.length) return
  for (const row of legacy) {
    if (!row?.email) continue
    const pathname = userBlobPathname(row.email)
    const existing = await readJsonFromBlobPath(pathname)
    if (!existing) await writeJsonToBlobPath(pathname, row)
  }
}

async function readUserFromBlob(email) {
  await migrateLegacyBlobUsersIfNeeded()
  return readJsonFromBlobPath(userBlobPathname(email))
}

async function writeUserToBlob(user) {
  await writeJsonToBlobPath(userBlobPathname(user.email), user)
}

async function listAllUsersFromBlob() {
  await migrateLegacyBlobUsersIfNeeded()
  const users = []
  let cursor
  do {
    const page = await list({ ...blobListOptions(), cursor })
    for (const blob of page.blobs) {
      if (!blob.pathname?.endsWith('.json')) continue
      const row = await readJsonFromBlobPath(blob.pathname)
      if (row?.email) users.push(row)
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return users
}

/** @returns {Promise<import('./userStore.mjs').StoredUser | null>} */
export async function getUserByEmail(dataDir, email) {
  const e = normalizeEmailKey(email)
  if (!e) return null
  if (useBlobStorage()) {
    return runBlobExclusive(() => readUserFromBlob(e))
  }
  let user = readUserFromFile(dataDir, e)
  if (user) return user
  const legacy = readUsersFromFile(dataDir)
  return legacy.find((u) => u && normalizeEmailKey(u.email) === e) ?? null
}

/** @returns {Promise<import('./userStore.mjs').StoredUser | null>} */
export async function getUserByMobile(dataDir, mobileDigits) {
  const m = String(mobileDigits || '').replace(/\D/g, '')
  if (m.length < 10) return null
  if (useBlobStorage()) {
    const users = await runBlobExclusive(() => listAllUsersFromBlob())
    return users.find((u) => String(u.mobile || '').replace(/\D/g, '') === m) ?? null
  }
  const users = readUsersFromFile(dataDir)
  return users.find((u) => String(u.mobile || '').replace(/\D/g, '') === m) ?? null
}

/** @param {import('./userStore.mjs').StoredUser} user */
export async function saveUser(dataDir, user) {
  if (useBlobStorage()) {
    return runBlobExclusive(async () => {
      await writeUserToBlob(user)
    })
  }
  writeUserToFile(dataDir, user)
}

/** @returns {Promise<import('./userStore.mjs').StoredUser[]>} */
export async function readUsers(dataDir) {
  if (useBlobStorage()) {
    return runBlobExclusive(() => listAllUsersFromBlob())
  }
  return readUsersFromFile(dataDir)
}

/** @param {import('./userStore.mjs').StoredUser[]} users */
export async function writeUsers(dataDir, users) {
  if (useBlobStorage()) {
    return runBlobExclusive(async () => {
      for (const user of users) {
        if (user?.email) await writeUserToBlob(user)
      }
    })
    return
  }
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
  if (useBlobStorage()) {
    return runBlobExclusive(async () => {
      await migrateLegacyBlobUsersIfNeeded()
      const user = await readUserFromBlob(e)
      const outcome = await work(user)
      if (!outcome.ok) return outcome
      if (outcome.user) await writeUserToBlob(outcome.user)
      return { ok: true, result: outcome.result }
    })
  }
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
