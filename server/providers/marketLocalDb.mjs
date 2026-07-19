/**
 * SQLite local market store — ticks + OHLCV bars (Phase 1: XAUUSD).
 * Path: server-data/market.db (override with MARKET_DB_PATH).
 */

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import {
  LOCAL_SECOND_STEPS,
  chartIntervalToSecondStep,
  localTimeframeToInterval,
  secondStepToTimeframe,
} from './localSecondBars.mjs'

const require = createRequire(import.meta.url)

/** @type {typeof import('better-sqlite3') | null} */
let BetterSqlite3 = null
try {
  BetterSqlite3 = require('better-sqlite3')
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.warn(`[market-local] better-sqlite3 unavailable — local SQLite store disabled (${msg})`)
}

function sqliteAvailable() {
  return BetterSqlite3 != null
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'server-data', 'market.db')

/** @type {Database.Database | null} */
let dbInstance = null

export const BAR_TIMEFRAMES = [
  ...LOCAL_SECOND_STEPS.map((s) => secondStepToTimeframe(s)),
  'm1',
  'h1',
  'd1',
  'mn1',
]

export function marketLocalEnabled() {
  if (!sqliteAvailable()) return false
  const v = process.env.MARKET_LOCAL_FIRST?.trim().toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'no'
}

export function marketLocalFallbackDukascopy() {
  const v = process.env.MARKET_FALLBACK_DUKASCOPY?.trim().toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'no'
}

export function marketDbPath() {
  const custom = process.env.MARKET_DB_PATH?.trim()
  return custom || DEFAULT_DB_PATH
}

export function normalizeMarketSymbol(symbol) {
  return String(symbol || '')
    .trim()
    .toUpperCase()
}

/** Map chart UI interval → stored bar timeframe (null when not stored locally). */
export function chartIntervalToLocalTimeframe(interval) {
  const step = chartIntervalToSecondStep(interval)
  if (step != null) return secondStepToTimeframe(step)
  const raw = String(interval || '1m').trim()
  const s = raw.toLowerCase()
  if (s === '1m') return 'm1'
  if (s === '1h' || s === '60m') return 'h1'
  if (s === '1d') return 'd1'
  if (raw === '1M' || s === '1mo' || s === '1mth' || s === '1month') return 'mn1'
  return null
}

function retentionDays(kind) {
  if (kind === 'ticks') {
    const raw = process.env.MARKET_TICK_RETENTION_DAYS
    const n = raw != null ? Number.parseInt(String(raw), 10) : 14
    return Math.max(1, Number.isFinite(n) ? n : 14)
  }
  const tf = String(kind || '').trim().toLowerCase()
  const secLabel = localTimeframeToInterval(tf)
  if (secLabel) {
    const envKey = `MARKET_BARS_${tf.toUpperCase()}_RETENTION_DAYS`
    const defaults = { s1: 14, s5: 14, s10: 14, s15: 14, s20: 14, s30: 14 }
    const raw = process.env[envKey]
    const n = raw != null ? Number.parseInt(String(raw), 10) : defaults[tf] ?? 14
    return Math.max(1, Number.isFinite(n) ? n : defaults[tf] ?? 14)
  }
  const envKey =
    tf === 'm1'
      ? 'MARKET_BARS_1M_RETENTION_DAYS'
      : tf === 'h1'
        ? 'MARKET_BARS_H1_RETENTION_DAYS'
        : tf === 'd1'
          ? 'MARKET_BARS_D1_RETENTION_DAYS'
          : 'MARKET_BARS_MN1_RETENTION_DAYS'
  const defaults = { m1: 90, h1: 730, d1: 1825, mn1: 3650 }
  const raw = process.env[envKey]
  const n = raw != null ? Number.parseInt(String(raw), 10) : defaults[tf] ?? 90
  return Math.max(1, Number.isFinite(n) ? n : defaults[tf] ?? 90)
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS ticks (
  symbol   TEXT NOT NULL,
  time_ms  INTEGER NOT NULL,
  bid      REAL NOT NULL,
  ask      REAL NOT NULL,
  bid_vol  REAL,
  ask_vol  REAL,
  PRIMARY KEY (symbol, time_ms)
);
CREATE INDEX IF NOT EXISTS idx_ticks_symbol_time ON ticks(symbol, time_ms);

CREATE TABLE IF NOT EXISTS bars (
  symbol    TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  time_sec  INTEGER NOT NULL,
  open      REAL NOT NULL,
  high      REAL NOT NULL,
  low       REAL NOT NULL,
  close     REAL NOT NULL,
  volume    REAL,
  PRIMARY KEY (symbol, timeframe, time_sec)
);
CREATE INDEX IF NOT EXISTS idx_bars_symbol_tf_time ON bars(symbol, timeframe, time_sec);

CREATE TABLE IF NOT EXISTS sync_manifest (
  symbol      TEXT NOT NULL,
  data_kind   TEXT NOT NULL,
  range_start INTEGER NOT NULL,
  range_end   INTEGER NOT NULL,
  row_count   INTEGER NOT NULL,
  synced_at   TEXT NOT NULL,
  source      TEXT NOT NULL,
  PRIMARY KEY (symbol, data_kind, range_start, range_end)
);
`

export function getMarketDb() {
  if (!BetterSqlite3) {
    throw new Error('better-sqlite3 is not installed')
  }
  if (dbInstance) return dbInstance
  const dbPath = marketDbPath()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  dbInstance = new BetterSqlite3(dbPath)
  dbInstance.pragma('journal_mode = WAL')
  dbInstance.exec(SCHEMA)
  return dbInstance
}

export function closeMarketDb() {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

const insertTickStmt = () =>
  getMarketDb().prepare(`
    INSERT OR REPLACE INTO ticks (symbol, time_ms, bid, ask, bid_vol, ask_vol)
    VALUES (@symbol, @time_ms, @bid, @ask, @bid_vol, @ask_vol)
  `)

const insertBarStmt = () =>
  getMarketDb().prepare(`
    INSERT OR REPLACE INTO bars (symbol, timeframe, time_sec, open, high, low, close, volume)
    VALUES (@symbol, @timeframe, @time_sec, @open, @high, @low, @close, @volume)
  `)

/**
 * @param {string} symbol
 * @param {import('../../src/types.ts').QuoteTick[]} ticks
 */
export function insertTicks(symbol, ticks) {
  const sym = normalizeMarketSymbol(symbol)
  if (!sym || !Array.isArray(ticks) || !ticks.length) return 0
  const stmt = insertTickStmt()
  const insertMany = getMarketDb().transaction((rows) => {
    let n = 0
    for (const t of rows) {
      const timeMs = Number(t.timeMs)
      const bid = Number(t.bid)
      const ask = Number(t.ask)
      if (!Number.isFinite(timeMs) || !Number.isFinite(bid) || !Number.isFinite(ask)) continue
      stmt.run({
        symbol: sym,
        time_ms: Math.floor(timeMs),
        bid,
        ask,
        bid_vol: t.bidVol != null && Number.isFinite(Number(t.bidVol)) ? Number(t.bidVol) : null,
        ask_vol: t.askVol != null && Number.isFinite(Number(t.askVol)) ? Number(t.askVol) : null,
      })
      n++
    }
    return n
  })
  return insertMany(ticks)
}

/**
 * @param {string} symbol
 * @param {string} timeframe m1|h1|d1|mn1
 * @param {object[]} bars
 */
export function insertBars(symbol, timeframe, bars) {
  const sym = normalizeMarketSymbol(symbol)
  const tf = String(timeframe || '').trim().toLowerCase()
  if (!sym || !BAR_TIMEFRAMES.includes(tf) || !Array.isArray(bars) || !bars.length) return 0
  const stmt = insertBarStmt()
  const insertMany = getMarketDb().transaction((rows) => {
    let n = 0
    for (const b of rows) {
      const timeSec = Number(b.time)
      const open = Number(b.open)
      const high = Number(b.high)
      const low = Number(b.low)
      const close = Number(b.close)
      if (![timeSec, open, high, low, close].every(Number.isFinite)) continue
      stmt.run({
        symbol: sym,
        timeframe: tf,
        time_sec: Math.floor(timeSec),
        open,
        high,
        low,
        close,
        volume: b.volume != null && Number.isFinite(Number(b.volume)) ? Number(b.volume) : null,
      })
      n++
    }
    return n
  })
  return insertMany(bars)
}

/**
 * @param {object} p
 */
export function recordSyncManifest({ symbol, dataKind, rangeStart, rangeEnd, rowCount, source = 'dukascopy' }) {
  getMarketDb()
    .prepare(
      `INSERT OR REPLACE INTO sync_manifest
       (symbol, data_kind, range_start, range_end, row_count, synced_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      normalizeMarketSymbol(symbol),
      dataKind,
      Math.floor(rangeStart),
      Math.floor(rangeEnd),
      Math.max(0, rowCount),
      new Date().toISOString(),
      source,
    )
}

/**
 * @param {string} symbol
 * @param {number} startSec
 * @param {number} endSec
 * @param {number} [limit]
 * @param {number} [cursorMs]
 */
export function readLocalTicks(symbol, startSec, endSec, limit = 50_000, cursorMs) {
  const sym = normalizeMarketSymbol(symbol)
  const startMs = Math.floor(startSec * 1000)
  const endMs = Math.floor(endSec * 1000)
  const pageLimit = Math.max(1, Math.min(200_000, Math.floor(limit) || 50_000))
  const cursor = cursorMs != null && Number.isFinite(Number(cursorMs)) ? Math.floor(Number(cursorMs)) : null

  let rows
  if (cursor != null) {
    rows = getMarketDb()
      .prepare(
        `SELECT time_ms, bid, ask, bid_vol, ask_vol FROM ticks
         WHERE symbol = ? AND time_ms >= ? AND time_ms <= ?
         ORDER BY time_ms ASC LIMIT ?`,
      )
      .all(sym, Math.max(startMs, cursor), endMs, pageLimit + 1)
  } else {
    rows = getMarketDb()
      .prepare(
        `SELECT time_ms, bid, ask, bid_vol, ask_vol FROM ticks
         WHERE symbol = ? AND time_ms >= ? AND time_ms <= ?
         ORDER BY time_ms ASC LIMIT ?`,
      )
      .all(sym, startMs, endMs, pageLimit + 1)
  }

  if (!rows.length) {
    return { ok: false, code: 'no_ticks', error: 'no local ticks for range' }
  }

  const truncated = rows.length > pageLimit
  const page = truncated ? rows.slice(0, pageLimit) : rows
  const ticks = page.map((r) => {
    /** @type {import('../../src/types.ts').QuoteTick} */
    const t = { timeMs: r.time_ms, bid: r.bid, ask: r.ask }
    if (r.bid_vol != null) t.bidVol = r.bid_vol
    if (r.ask_vol != null) t.askVol = r.ask_vol
    return t
  })
  const last = ticks[ticks.length - 1]
  const hasMore = truncated || (last && last.timeMs < endMs - 1)

  return {
    ok: true,
    symbol: sym,
    source: 'local:sqlite',
    count: ticks.length,
    ticks,
    truncated: Boolean(hasMore),
    nextCursor: hasMore && last ? last.timeMs + 1 : undefined,
  }
}

/**
 * @param {string} symbol
 * @param {string} timeframe
 * @param {number} [startSec]
 * @param {number} [endSec]
 */
export function readLocalBars(symbol, timeframe, startSec, endSec) {
  const sym = normalizeMarketSymbol(symbol)
  const tf = String(timeframe || '').trim().toLowerCase()
  if (!BAR_TIMEFRAMES.includes(tf)) {
    return { ok: false, error: `local bars: unsupported timeframe ${tf}` }
  }

  let sql = `SELECT time_sec, open, high, low, close, volume FROM bars WHERE symbol = ? AND timeframe = ?`
  /** @type {Array<string | number>} */
  const params = [sym, tf]
  if (Number.isFinite(startSec)) {
    sql += ` AND time_sec >= ?`
    params.push(Math.floor(startSec))
  }
  if (Number.isFinite(endSec)) {
    sql += ` AND time_sec <= ?`
    params.push(Math.floor(endSec))
  }
  sql += ` ORDER BY time_sec ASC`

  const rows = getMarketDb().prepare(sql).all(...params)
  const minRows = tf.startsWith('s') ? 2 : 16
  if (rows.length < minRows) {
    return { ok: false, error: `local bars: too few rows (${rows.length})` }
  }

  const bars = rows.map((r) => ({
    time: r.time_sec,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume ?? 0,
  }))

  const tfLabel =
    localTimeframeToInterval(tf) ??
    (tf === 'm1'
      ? '1m'
      : tf === 'h1'
        ? '1h'
        : tf === 'd1'
          ? '1d'
          : tf === 'mn1'
            ? '1M'
            : tf)

  return {
    ok: true,
    bars,
    timeframe: tfLabel,
    source: `local:sqlite:${tf}`,
    count: bars.length,
  }
}

/**
 * @param {string} symbol
 * @param {number} startSec
 * @param {number} endSec
 */
export function countLocalTicksInRange(symbol, startSec, endSec) {
  const sym = normalizeMarketSymbol(symbol)
  const row = getMarketDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM ticks
       WHERE symbol = ? AND time_ms >= ? AND time_ms < ?`,
    )
    .get(sym, Math.floor(startSec * 1000), Math.floor(endSec * 1000))
  return row?.n ?? 0
}

/**
 * @param {string} symbol
 * @param {string} timeframe
 * @param {number} startSec
 * @param {number} endSec
 */
export function countLocalBarsInRange(symbol, timeframe, startSec, endSec) {
  const sym = normalizeMarketSymbol(symbol)
  const tf = String(timeframe || '').trim().toLowerCase()
  const row = getMarketDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM bars
       WHERE symbol = ? AND timeframe = ? AND time_sec >= ? AND time_sec < ?`,
    )
    .get(sym, tf, Math.floor(startSec), Math.floor(endSec))
  return row?.n ?? 0
}

function minTicksPerChunk() {
  return Math.max(1, Number.parseInt(process.env.MARKET_SYNC_MIN_TICKS_PER_CHUNK || '1000', 10) || 1000)
}

/**
 * @param {string} symbol
 * @param {number} startSec
 * @param {number} endSec
 * @param {number} [maxRows]
 */
export function readLocalTicksBulk(symbol, startSec, endSec, maxRows = 800_000) {
  const sym = normalizeMarketSymbol(symbol)
  const startMs = Math.floor(startSec * 1000)
  const endMs = Math.floor(endSec * 1000)
  const limit = Math.max(1, Math.min(2_000_000, Math.floor(maxRows) || 800_000))
  const rows = getMarketDb()
    .prepare(
      `SELECT time_ms, bid, ask, bid_vol, ask_vol FROM ticks
       WHERE symbol = ? AND time_ms >= ? AND time_ms < ?
       ORDER BY time_ms ASC LIMIT ?`,
    )
    .all(sym, startMs, endMs, limit)
  if (!rows.length) {
    return { ok: false, code: 'no_ticks', error: 'no local ticks for range', ticks: [] }
  }
  const ticks = rows.map((r) => {
    /** @type {import('../../src/types.ts').QuoteTick} */
    const t = { timeMs: r.time_ms, bid: r.bid, ask: r.ask }
    if (r.bid_vol != null) t.bidVol = r.bid_vol
    if (r.ask_vol != null) t.askVol = r.ask_vol
    return t
  })
  return {
    ok: true,
    symbol: sym,
    source: 'local:sqlite',
    count: ticks.length,
    ticks,
    truncated: rows.length >= limit,
  }
}

function minBarsPerChunk(timeframe) {
  const defaults = {
    s1: 60,
    s5: 200,
    s10: 100,
    s15: 80,
    s20: 60,
    s30: 40,
    m1: 500,
    h1: 50,
    d1: 10,
    mn1: 3,
  }
  const envKey = `MARKET_SYNC_MIN_BARS_${String(timeframe).toUpperCase()}_PER_CHUNK`
  const raw = process.env[envKey]
  if (raw != null) {
    const n = Number.parseInt(String(raw), 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  return defaults[timeframe] ?? 10
}

/**
 * @param {string} symbol
 * @param {'ticks' | string} kind ticks | m1|h1|d1|mn1
 * @param {number} startSec
 * @param {number} endSec
 */
export function localChunkSatisfied(symbol, kind, startSec, endSec) {
  if (kind === 'ticks') {
    return countLocalTicksInRange(symbol, startSec, endSec) >= minTicksPerChunk()
  }
  const tf = String(kind).trim().toLowerCase()
  if (!BAR_TIMEFRAMES.includes(tf)) return false
  return countLocalBarsInRange(symbol, tf, startSec, endSec) >= minBarsPerChunk(tf)
}

/** @param {string} symbol */
export function getLocalStoreStats(symbol) {
  const sym = normalizeMarketSymbol(symbol)
  if (!sqliteAvailable()) {
    return { symbol: sym, tickCount: 0, barCounts: {}, tickRangeMs: null, unavailable: true }
  }
  const db = getMarketDb()
  const tickCount = db.prepare(`SELECT COUNT(*) AS n FROM ticks WHERE symbol = ?`).get(sym)?.n ?? 0
  const barCounts = {}
  for (const tf of BAR_TIMEFRAMES) {
    barCounts[tf] = db.prepare(`SELECT COUNT(*) AS n FROM bars WHERE symbol = ? AND timeframe = ?`).get(sym, tf)?.n ?? 0
  }
  const tickRange = db
    .prepare(`SELECT MIN(time_ms) AS lo, MAX(time_ms) AS hi FROM ticks WHERE symbol = ?`)
    .get(sym)
  return { symbol: sym, tickCount, barCounts, tickRangeMs: tickRange }
}

export function pruneLocalRetention(symbol) {
  const sym = normalizeMarketSymbol(symbol)
  const nowSec = Math.floor(Date.now() / 1000)
  const db = getMarketDb()

  const tickCutoffMs = (nowSec - retentionDays('ticks') * 86_400) * 1000
  const tickDel = db.prepare(`DELETE FROM ticks WHERE symbol = ? AND time_ms < ?`).run(sym, tickCutoffMs)

  const cuts = {}
  for (const tf of BAR_TIMEFRAMES) {
    cuts[tf] = nowSec - retentionDays(tf) * 86_400
  }
  let barDel = 0
  for (const [tf, cut] of Object.entries(cuts)) {
    barDel += db.prepare(`DELETE FROM bars WHERE symbol = ? AND timeframe = ? AND time_sec < ?`).run(sym, tf, cut)
      .changes
  }

  return { tickDeleted: tickDel.changes, barDeleted: barDel }
}
