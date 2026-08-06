import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { guestTelemetryEmail, isGuestTelemetryEmail } from './requestMeta.mjs'

const GUEST_DIR = 'guest'
const SESSIONS_FILE = 'sessions.json'
const MAX_GUESTS = 5000

function guestDir(dataDir) {
  return path.join(dataDir, GUEST_DIR)
}

function sessionsPath(dataDir) {
  return path.join(guestDir(dataDir), SESSIONS_FILE)
}

function newGuestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `gst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function readStore(dataDir) {
  try {
    const file = sessionsPath(dataDir)
    if (!fs.existsSync(file)) return {}
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(dataDir, store) {
  fs.mkdirSync(guestDir(dataDir), { recursive: true })
  fs.writeFileSync(sessionsPath(dataDir), `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

/**
 * @param {string} dataDir
 * @param {{ guestId?: string, ip?: string, country?: string, timezone?: string, locale?: string, userAgent?: string, page?: string }} row
 */
export function upsertGuestSession(dataDir, row) {
  const store = readStore(dataDir)
  const now = Date.now()
  let guestId = String(row.guestId || '').trim()
  if (!guestId) guestId = newGuestId()

  const prev = store[guestId] || {}
  const isFirstRecord = !prev.id
  const incrementVisit = row.incrementVisit === true
  const next = {
    id: guestId,
    ip: row.ip || prev.ip || '',
    country: row.country || prev.country || '',
    timezone: row.timezone || prev.timezone || '',
    locale: row.locale || prev.locale || '',
    userAgent: row.userAgent || prev.userAgent || '',
    lastPage: row.page || prev.lastPage || '',
    firstSeenAt: prev.firstSeenAt ?? now,
    lastSeenAt: now,
    visitCount: isFirstRecord ? 1 : (prev.visitCount ?? 1) + (incrementVisit ? 1 : 0),
    sessionCreates: prev.sessionCreates ?? 0,
  }

  store[guestId] = next

  const ids = Object.keys(store)
  if (ids.length > MAX_GUESTS) {
    ids.sort((a, b) => (store[a].lastSeenAt ?? 0) - (store[b].lastSeenAt ?? 0))
    for (let i = 0; i < ids.length - MAX_GUESTS; i++) delete store[ids[i]]
  }

  writeStore(dataDir, store)
  return next
}

/** @param {string} dataDir @param {string} guestId */
export function incrementGuestSessionCreates(dataDir, guestId) {
  const store = readStore(dataDir)
  const id = String(guestId || '').trim()
  if (!id || !store[id]) return
  store[id].sessionCreates = (store[id].sessionCreates ?? 0) + 1
  store[id].lastSeenAt = Date.now()
  writeStore(dataDir, store)
}

/** @param {string} dataDir */
export function listGuestSessions(dataDir) {
  const store = readStore(dataDir)
  return Object.values(store).sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0))
}

/** @param {string} dataDir @param {string} guestId */
export function getGuestSession(dataDir, guestId) {
  const store = readStore(dataDir)
  return store[String(guestId || '').trim()] || null
}

/** @param {Array<{ email: string, isLive?: boolean, liveAsset?: string | null, livePage?: string | null, assets?: unknown[], totalPracticeMs?: number, lastActivityAt?: number | null }>} activityUsers */
export function summarizeGuests(dataDir, activityUsers = []) {
  const sessions = listGuestSessions(dataDir)
  const activityByEmail = new Map(
    activityUsers
      .filter((u) => isGuestTelemetryEmail(u.email))
      .map((u) => [String(u.email).toLowerCase(), u]),
  )
  const now = Date.now()
  const LIVE_THRESHOLD_MS = 2 * 60 * 1000

  return sessions.map((s) => {
    const email = guestTelemetryEmail(s.id).toLowerCase()
    const act = activityByEmail.get(email)
    const seenRecently = s.lastSeenAt != null && now - s.lastSeenAt <= LIVE_THRESHOLD_MS
    const isLive = act?.isLive === true || (!act && seenRecently)

    return {
      id: s.id,
      ip: s.ip || '',
      country: s.country || '',
      timezone: s.timezone || '',
      locale: s.locale || '',
      userAgent: s.userAgent || '',
      lastPage: s.lastPage || '',
      firstSeenAt: s.firstSeenAt ?? null,
      lastSeenAt: s.lastSeenAt ?? null,
      visitCount: s.visitCount ?? 1,
      sessionCreates: s.sessionCreates ?? 0,
      isLive,
      liveAsset: act?.liveAsset ?? null,
      livePage: act?.livePage ?? null,
      assets: act?.assets ?? [],
      totalPracticeMs: act?.totalPracticeMs ?? 0,
      lastActivityAt: act?.lastActivityAt ?? s.lastSeenAt ?? null,
    }
  })
}

export { newGuestId }
