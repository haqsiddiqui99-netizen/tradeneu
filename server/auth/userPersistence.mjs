import fs from 'fs'
import path from 'path'
import { get, put } from '@vercel/blob'

const USERS_FILE = 'users.json'
/** Fixed blob path — must use addRandomSuffix: false on every put. */
const USERS_BLOB_PATHNAME = 'tradeneu/auth/users.json'

/** Serialize blob read-modify-write so concurrent requests cannot overwrite users. */
let blobQueue = Promise.resolve()

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || ''
}

function blobStoreId() {
  return process.env.BLOB_STORE_ID?.trim() || ''
}

/** True when Blob SDK can read/write (token locally, or linked store on Vercel via OIDC). */
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

function readUsersFromFile(dataDir) {
  const file = usersFilePath(dataDir)
  try {
    if (!fs.existsSync(file)) return []
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeUsersToFile(dataDir, users) {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(usersFilePath(dataDir), JSON.stringify(users, null, 2), 'utf8')
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

async function readUsersFromBlob() {
  try {
    const result = await get(USERS_BLOB_PATHNAME, blobGetOptions())
    if (!result || result.statusCode !== 200 || !result.stream) return []
    const text = await streamToText(result.stream)
    if (!text.trim()) return []
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    if (isBlobNotFound(err)) return []
    throw err
  }
}

async function writeUsersToBlob(users) {
  await put(USERS_BLOB_PATHNAME, JSON.stringify(users, null, 2), blobPutOptions())
}

/** @returns {Promise<import('./userStore.mjs').StoredUser[]>} */
export async function readUsers(dataDir) {
  if (useBlobStorage()) {
    return runBlobExclusive(() => readUsersFromBlob())
  }
  return readUsersFromFile(dataDir)
}

/** @param {import('./userStore.mjs').StoredUser[]} users */
export async function writeUsers(dataDir, users) {
  if (useBlobStorage()) {
    return runBlobExclusive(async () => {
      await writeUsersToBlob(users)
    })
  }
  writeUsersToFile(dataDir, users)
}

/**
 * Atomic read → mutate → write for blob (prevents lost updates on login/register races).
 * @template T
 * @param {string} dataDir
 * @param {(users: import('./userStore.mjs').StoredUser[]) => Promise<T>} mutate
 * @returns {Promise<T>}
 */
export async function mutateUsers(dataDir, mutate) {
  if (!useBlobStorage()) {
    const users = readUsersFromFile(dataDir)
    const result = await mutate(users)
    writeUsersToFile(dataDir, users)
    return result
  }

  return runBlobExclusive(async () => {
    const users = await readUsersFromBlob()
    const result = await mutate(users)
    await writeUsersToBlob(users)
    return result
  })
}
