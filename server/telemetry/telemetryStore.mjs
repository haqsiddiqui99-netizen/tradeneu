import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const TELEMETRY_DIR = 'telemetry'
const EVENTS_FILE = 'events.jsonl'
const MAX_READ_BYTES = 2 * 1024 * 1024

export const TELEMETRY_EVENTS = new Set([
  'login',
  'session_created',
  'backtest_completed',
  'asset_practice',
  'presence_ping',
])

function telemetryDir(dataDir) {
  return path.join(dataDir, TELEMETRY_DIR)
}

function eventsFilePath(dataDir) {
  return path.join(telemetryDir(dataDir), EVENTS_FILE)
}

function newEventId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `tel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * @param {string} dataDir
 * @param {{ event: string, email: string, provider?: string, payload?: Record<string, unknown> }} row
 */
export function appendTelemetryEvent(dataDir, row) {
  const event = String(row.event || '').trim()
  if (!TELEMETRY_EVENTS.has(event)) return { ok: false, error: 'invalid_event' }
  const email = String(row.email || '')
    .trim()
    .toLowerCase()
  if (!email) return { ok: false, error: 'missing_email' }

  const entry = {
    id: newEventId(),
    event,
    email,
    provider: row.provider || 'unknown',
    ts: Date.now(),
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
  }

  try {
    const dir = telemetryDir(dataDir)
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(eventsFilePath(dataDir), `${JSON.stringify(entry)}\n`, 'utf8')
    return { ok: true, id: entry.id }
  } catch (e) {
    console.warn('[telemetry] append failed:', e?.message || e)
    return { ok: false, error: 'persist_failed' }
  }
}

function readTailLines(filePath, maxBytes) {
  if (!fs.existsSync(filePath)) return []
  const stat = fs.statSync(filePath)
  const size = stat.size
  const start = Math.max(0, size - maxBytes)
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(size - start)
    fs.readSync(fd, buf, 0, buf.length, start)
    const text = buf.toString('utf8')
    const lines = text.split('\n').filter((l) => l.trim())
    if (start > 0 && lines.length) lines.shift()
    return lines
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * @param {string} dataDir
 * @param {{ limit?: number, event?: string, email?: string, since?: number }} opts
 */
export function readTelemetryEvents(dataDir, opts = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 2000)
  const lines = readTailLines(eventsFilePath(dataDir), MAX_READ_BYTES)
  const events = []
  for (let i = lines.length - 1; i >= 0 && events.length < limit; i--) {
    try {
      const row = JSON.parse(lines[i])
      if (!row || typeof row !== 'object') continue
      if (opts.event && row.event !== opts.event) continue
      if (opts.email && String(row.email).toLowerCase() !== String(opts.email).toLowerCase()) continue
      if (opts.since && typeof row.ts === 'number' && row.ts < opts.since) continue
      events.push(row)
    } catch {
      /* skip corrupt line */
    }
  }
  return events
}

/** @param {string} dataDir */
export function summarizeTelemetry(dataDir) {
  const events = readTelemetryEvents(dataDir, { limit: 2000 })
  const byEvent = {
    login: 0,
    session_created: 0,
    backtest_completed: 0,
    asset_practice: 0,
    presence_ping: 0,
  }
  const uniqueEmails = new Set()
  let lastEventAt = 0
  for (const e of events) {
    if (e.event in byEvent) byEvent[e.event]++
    if (e.email) uniqueEmails.add(String(e.email).toLowerCase())
    if (typeof e.ts === 'number' && e.ts > lastEventAt) lastEventAt = e.ts
  }
  return {
    totalEvents: events.length,
    byEvent,
    uniqueUsers: uniqueEmails.size,
    lastEventAt: lastEventAt || null,
  }
}
