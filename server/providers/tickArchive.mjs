/**
 * Reads from the on-volume tick archive (Dukascopy .bi5 files kept by the S3 importer).
 * SQLite keeps only the recent tick window; older ticks are decoded from these files on demand.
 */

import fs from 'fs'
import path from 'path'
import { normalizeMarketSymbol } from './marketLocalDb.mjs'
import { readArchivedDayTicks, tickArchiveDir, tickArchiveEnabled } from './dukascopyS3.mjs'

const DAY_SEC = 86_400
/** Longest span one request may walk through (empty weekends / holidays included). */
const MAX_SCAN_DAYS = 62

/** Decoded days kept in memory so paging through one day does not re-decompress it. */
const DAY_CACHE_SIZE = 4
/** @type {Map<string, object[]>} */
const dayCache = new Map()

async function dayTicks(sym, day) {
  const key = `${sym}|${day}`
  const hit = dayCache.get(key)
  if (hit) {
    dayCache.delete(key)
    dayCache.set(key, hit)
    return hit
  }
  const ticks = await readArchivedDayTicks(sym, day)
  if (ticks == null) return null
  dayCache.set(key, ticks)
  while (dayCache.size > DAY_CACHE_SIZE) dayCache.delete(dayCache.keys().next().value)
  return ticks
}

/**
 * Same response shape as `readLocalTicks`, served from archived day files.
 * @param {string} symbol
 * @param {number} startSec
 * @param {number} endSec
 * @param {number} [limit]
 * @param {number} [cursorMs]
 */
export async function readArchiveTicks(symbol, startSec, endSec, limit = 50_000, cursorMs) {
  if (!tickArchiveEnabled()) return { ok: false, code: 'no_ticks', error: 'tick archive disabled' }
  const sym = normalizeMarketSymbol(symbol)
  const pageLimit = Math.max(1, Math.min(200_000, Math.floor(limit) || 50_000))
  const cursor = cursorMs != null && Number.isFinite(Number(cursorMs)) ? Math.floor(Number(cursorMs)) : null
  const fromMs = Math.max(Math.floor(startSec * 1000), cursor ?? Number.NEGATIVE_INFINITY)
  const endMs = Math.floor(endSec * 1000)

  const out = []
  let truncated = false
  let anyArchived = false
  const firstDay = Math.floor(fromMs / 1000 / DAY_SEC) * DAY_SEC
  const lastDay = Math.min(Math.floor(endMs / 1000 / DAY_SEC) * DAY_SEC, firstDay + (MAX_SCAN_DAYS - 1) * DAY_SEC)
  for (let day = firstDay; day <= lastDay && !truncated; day += DAY_SEC) {
    const ticks = await dayTicks(sym, day)
    if (ticks == null) continue
    anyArchived = true
    for (const t of ticks) {
      if (t.timeMs < fromMs) continue
      if (t.timeMs > endMs) break
      if (out.length >= pageLimit) {
        truncated = true
        break
      }
      out.push(t)
    }
  }
  if (!out.length) {
    return { ok: false, code: 'no_ticks', error: anyArchived ? 'no archived ticks in range' : 'range not in tick archive' }
  }
  const last = out[out.length - 1]
  const scanCut = lastDay + DAY_SEC <= Math.floor(endMs / 1000)
  const hasMore = truncated || scanCut
  return {
    ok: true,
    symbol: sym,
    source: 'local:archive',
    count: out.length,
    ticks: out,
    truncated: hasMore,
    nextCursor: hasMore ? (truncated ? last.timeMs + 1 : (lastDay + DAY_SEC) * 1000) : undefined,
  }
}

const STATS_TTL_MS = 5 * 60_000
/** @type {Map<string, { at: number; data: object }>} */
const statsCache = new Map()

/** Day count, size and span of one symbol's archive (directory walk, cached for 5 min). */
export function tickArchiveStats(symbol) {
  const sym = normalizeMarketSymbol(symbol)
  const hit = statsCache.get(sym)
  if (hit && Date.now() - hit.at < STATS_TTL_MS) return hit.data
  const root = path.join(tickArchiveDir(), sym)
  let days = 0
  let bytes = 0
  let first = null
  let last = null
  const note = (y, m, d) => {
    const key = Date.UTC(Number(y), Number(m), Number(d)) / 1000
    days += 1
    if (first == null || key < first) first = key
    if (last == null || key > last) last = key
  }
  const ls = (dir) => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return []
    }
  }
  for (const y of ls(root)) {
    if (!y.isDirectory()) continue
    for (const m of ls(path.join(root, y.name))) {
      if (!m.isDirectory()) continue
      const monthDir = path.join(root, y.name, m.name)
      for (const entry of ls(monthDir)) {
        const daily = /^(\d{2})_ticks\.bi5$/.exec(entry.name)
        if (daily && entry.isFile()) {
          bytes += fs.statSync(path.join(monthDir, entry.name)).size
          note(y.name, m.name, daily[1])
        } else if (entry.isDirectory() && /^\d{2}$/.test(entry.name)) {
          let hours = 0
          for (const h of ls(path.join(monthDir, entry.name))) {
            if (!h.name.endsWith('h_ticks.bi5')) continue
            hours += 1
            bytes += fs.statSync(path.join(monthDir, entry.name, h.name)).size
          }
          if (hours) note(y.name, m.name, entry.name)
        }
      }
    }
  }
  const iso = (s) => (s == null ? null : new Date(s * 1000).toISOString().slice(0, 10))
  const data = { enabled: tickArchiveEnabled(), dir: root, days, bytes, firstDay: iso(first), lastDay: iso(last) }
  statsCache.set(sym, { at: Date.now(), data })
  return data
}
