/**
 * TimescaleDB / PostgreSQL market store — ticks + OHLCV bars.
 * Connection: TIMESCALE_DATABASE_URL or DATABASE_URL.
 */

import pg from 'pg'
import {
  LOCAL_SECOND_STEPS,
  chartIntervalToSecondStep,
  localTimeframeToInterval,
  secondStepToTimeframe,
} from './localSecondBars.mjs'
import { localBarStepSec, localMaxBarsPerRequest, trimLocalBarRows } from './marketLocalLimits.mjs'

const { Pool } = pg

/** @type {import('pg').Pool | null} */
let pool = null
/** @type {Promise<void> | null} */
let schemaReady = null

export const BAR_TIMEFRAMES = [
  ...LOCAL_SECOND_STEPS.map((s) => secondStepToTimeframe(s)),
  'm1',
  'h1',
  'd1',
  'mn1',
]

export function marketTimescaleConnectionString() {
  return (
    process.env.TIMESCALE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    ''
  )
}

export function marketTimescaleConfigured() {
  return Boolean(marketTimescaleConnectionString())
}

export function marketTimescaleEnabled() {
  if (!marketTimescaleConfigured()) return false
  const store = process.env.MARKET_STORE?.trim().toLowerCase()
  if (store === 'sqlite') return false
  const v = process.env.MARKET_TIMESCALE_FIRST?.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

function resolveSsl() {
  const mode = (process.env.PGSSLMODE || process.env.DATABASE_SSL || '').trim().toLowerCase()
  if (mode === 'disable' || mode === 'false' || mode === '0') return false
  const conn = marketTimescaleConnectionString()
  if (/sslmode=disable/i.test(conn)) return false
  if (/localhost|127\.0\.0\.1/.test(conn) && !process.env.TIMESCALE_DATABASE_URL?.trim()) return false
  return { rejectUnauthorized: false }
}

export function getTimescalePool() {
  if (!pool) {
    const connStr = marketTimescaleConnectionString()
    if (!connStr) throw new Error('Timescale DATABASE_URL is not configured')
    pool = new Pool({
      connectionString: connStr,
      max: Math.max(2, Number.parseInt(process.env.PG_POOL_MAX || '10', 10) || 10),
      ssl: resolveSsl(),
      connectionTimeoutMillis: 15_000,
    })
    pool.on('error', (err) => {
      console.warn('[market-timescale] pool error:', err?.message || err)
    })
  }
  return pool
}

async function tryCreateHypertable(client, table, column) {
  try {
    await client.query(
      `SELECT create_hypertable($1::regclass, $2, if_not_exists => TRUE, migrate_data => TRUE)`,
      [table, column],
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/already a hypertable|duplicate/i.test(msg)) return
    console.warn(`[market-timescale] hypertable ${table}: ${msg}`)
  }
}

export async function initTimescaleSchema() {
  if (schemaReady) return schemaReady
  schemaReady = (async () => {
    const client = await getTimescalePool().connect()
    try {
      try {
        await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[market-timescale] timescaledb extension unavailable (${msg}) — using plain Postgres tables`)
      }

      await client.query(`
        CREATE TABLE IF NOT EXISTS market_ticks (
          symbol   TEXT NOT NULL,
          time_ms  BIGINT NOT NULL,
          bid      DOUBLE PRECISION NOT NULL,
          ask      DOUBLE PRECISION NOT NULL,
          bid_vol  DOUBLE PRECISION,
          ask_vol  DOUBLE PRECISION,
          PRIMARY KEY (symbol, time_ms)
        );
      `)
      await tryCreateHypertable(client, 'market_ticks', 'time_ms')

      await client.query(`
        CREATE TABLE IF NOT EXISTS market_bars (
          symbol    TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          time_sec  BIGINT NOT NULL,
          open      DOUBLE PRECISION NOT NULL,
          high      DOUBLE PRECISION NOT NULL,
          low       DOUBLE PRECISION NOT NULL,
          close     DOUBLE PRECISION NOT NULL,
          volume    DOUBLE PRECISION,
          PRIMARY KEY (symbol, timeframe, time_sec)
        );
      `)
      await tryCreateHypertable(client, 'market_bars', 'time_sec')

      await client.query(`
        CREATE TABLE IF NOT EXISTS sync_manifest (
          symbol      TEXT NOT NULL,
          data_kind   TEXT NOT NULL,
          range_start BIGINT NOT NULL,
          range_end   BIGINT NOT NULL,
          row_count   INTEGER NOT NULL,
          synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          source      TEXT NOT NULL,
          PRIMARY KEY (symbol, data_kind, range_start, range_end)
        );
      `)

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_market_ticks_symbol_time ON market_ticks (symbol, time_ms);
        CREATE INDEX IF NOT EXISTS idx_market_bars_symbol_tf_time ON market_bars (symbol, timeframe, time_sec);
      `)
    } finally {
      client.release()
    }
  })()
  return schemaReady
}

export async function closeTimescalePool() {
  if (pool) {
    await pool.end()
    pool = null
  }
  schemaReady = null
}

export function normalizeMarketSymbol(symbol) {
  return String(symbol || '')
    .trim()
    .toUpperCase()
}

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

const INSERT_TICK_BATCH = 2000
const INSERT_BAR_BATCH = 2000

/**
 * @param {string} symbol
 * @param {import('../../src/types.ts').QuoteTick[]} ticks
 */
export async function insertTicks(symbol, ticks) {
  await initTimescaleSchema()
  const sym = normalizeMarketSymbol(symbol)
  if (!sym || !Array.isArray(ticks) || !ticks.length) return 0
  let total = 0
  for (let off = 0; off < ticks.length; off += INSERT_TICK_BATCH) {
    const batch = ticks.slice(off, off + INSERT_TICK_BATCH)
    const symbols = []
    const times = []
    const bids = []
    const asks = []
    const bidVols = []
    const askVols = []
    for (const t of batch) {
      const timeMs = Number(t.timeMs)
      const bid = Number(t.bid)
      const ask = Number(t.ask)
      if (!Number.isFinite(timeMs) || !Number.isFinite(bid) || !Number.isFinite(ask)) continue
      symbols.push(sym)
      times.push(Math.floor(timeMs))
      bids.push(bid)
      asks.push(ask)
      bidVols.push(t.bidVol != null && Number.isFinite(Number(t.bidVol)) ? Number(t.bidVol) : null)
      askVols.push(t.askVol != null && Number.isFinite(Number(t.askVol)) ? Number(t.askVol) : null)
    }
    if (!symbols.length) continue
    const res = await getTimescalePool().query(
      `INSERT INTO market_ticks (symbol, time_ms, bid, ask, bid_vol, ask_vol)
       SELECT * FROM UNNEST($1::text[], $2::bigint[], $3::float8[], $4::float8[], $5::float8[], $6::float8[])
       ON CONFLICT (symbol, time_ms) DO UPDATE SET
         bid = EXCLUDED.bid,
         ask = EXCLUDED.ask,
         bid_vol = EXCLUDED.bid_vol,
         ask_vol = EXCLUDED.ask_vol`,
      [symbols, times, bids, asks, bidVols, askVols],
    )
    total += res.rowCount ?? symbols.length
  }
  return total
}

/**
 * @param {string} symbol
 * @param {string} timeframe
 * @param {object[]} bars
 */
export async function insertBars(symbol, timeframe, bars) {
  await initTimescaleSchema()
  const sym = normalizeMarketSymbol(symbol)
  const tf = String(timeframe || '').trim().toLowerCase()
  if (!sym || !BAR_TIMEFRAMES.includes(tf) || !Array.isArray(bars) || !bars.length) return 0
  let total = 0
  for (let off = 0; off < bars.length; off += INSERT_BAR_BATCH) {
    const batch = bars.slice(off, off + INSERT_BAR_BATCH)
    const symbols = []
    const timeframes = []
    const times = []
    const opens = []
    const highs = []
    const lows = []
    const closes = []
    const volumes = []
    for (const b of batch) {
      const timeSec = Number(b.time)
      const open = Number(b.open)
      const high = Number(b.high)
      const low = Number(b.low)
      const close = Number(b.close)
      if (![timeSec, open, high, low, close].every(Number.isFinite)) continue
      symbols.push(sym)
      timeframes.push(tf)
      times.push(Math.floor(timeSec))
      opens.push(open)
      highs.push(high)
      lows.push(low)
      closes.push(close)
      volumes.push(b.volume != null && Number.isFinite(Number(b.volume)) ? Number(b.volume) : null)
    }
    if (!symbols.length) continue
    const res = await getTimescalePool().query(
      `INSERT INTO market_bars (symbol, timeframe, time_sec, open, high, low, close, volume)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::bigint[], $4::float8[], $5::float8[], $6::float8[], $7::float8[], $8::float8[])
       ON CONFLICT (symbol, timeframe, time_sec) DO UPDATE SET
         open = EXCLUDED.open,
         high = EXCLUDED.high,
         low = EXCLUDED.low,
         close = EXCLUDED.close,
         volume = EXCLUDED.volume`,
      [symbols, timeframes, times, opens, highs, lows, closes, volumes],
    )
    total += res.rowCount ?? symbols.length
  }
  return total
}

export async function recordSyncManifest({ symbol, dataKind, rangeStart, rangeEnd, rowCount, source = 'dukascopy' }) {
  await initTimescaleSchema()
  await getTimescalePool().query(
    `INSERT INTO sync_manifest (symbol, data_kind, range_start, range_end, row_count, synced_at, source)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6)
     ON CONFLICT (symbol, data_kind, range_start, range_end) DO UPDATE SET
       row_count = EXCLUDED.row_count,
       synced_at = EXCLUDED.synced_at,
       source = EXCLUDED.source`,
    [
      normalizeMarketSymbol(symbol),
      dataKind,
      Math.floor(rangeStart),
      Math.floor(rangeEnd),
      Math.max(0, rowCount),
      source,
    ],
  )
}

export async function readLocalTicks(symbol, startSec, endSec, limit = 50_000, cursorMs) {
  await initTimescaleSchema()
  const sym = normalizeMarketSymbol(symbol)
  const startMs = Math.floor(startSec * 1000)
  const endMs = Math.floor(endSec * 1000)
  const pageLimit = Math.max(1, Math.min(200_000, Math.floor(limit) || 50_000))
  const cursor = cursorMs != null && Number.isFinite(Number(cursorMs)) ? Math.floor(Number(cursorMs)) : null
  const fromMs = cursor != null ? Math.max(startMs, cursor) : startMs

  const { rows } = await getTimescalePool().query(
    `SELECT time_ms, bid, ask, bid_vol, ask_vol FROM market_ticks
     WHERE symbol = $1 AND time_ms >= $2 AND time_ms <= $3
     ORDER BY time_ms ASC LIMIT $4`,
    [sym, fromMs, endMs, pageLimit + 1],
  )

  if (!rows.length) {
    return { ok: false, code: 'no_ticks', error: 'no local ticks for range' }
  }

  const truncated = rows.length > pageLimit
  const page = truncated ? rows.slice(0, pageLimit) : rows
  const ticks = page.map((r) => {
    /** @type {import('../../src/types.ts').QuoteTick} */
    const t = { timeMs: Number(r.time_ms), bid: r.bid, ask: r.ask }
    if (r.bid_vol != null) t.bidVol = r.bid_vol
    if (r.ask_vol != null) t.askVol = r.ask_vol
    return t
  })
  const last = ticks[ticks.length - 1]
  const hasMore = truncated || (last && last.timeMs < endMs - 1)

  return {
    ok: true,
    symbol: sym,
    source: 'local:timescale',
    count: ticks.length,
    ticks,
    truncated: Boolean(hasMore),
    nextCursor: hasMore && last ? last.timeMs + 1 : undefined,
  }
}

export async function readLocalBars(symbol, timeframe, startSec, endSec) {
  await initTimescaleSchema()
  const sym = normalizeMarketSymbol(symbol)
  const tf = String(timeframe || '').trim().toLowerCase()
  if (!BAR_TIMEFRAMES.includes(tf)) {
    return { ok: false, error: `local bars: unsupported timeframe ${tf}` }
  }

  const maxBars = localMaxBarsPerRequest()
  const step = localBarStepSec(tf)
  const maxSpan = maxBars * step

  let effectiveStart = Number.isFinite(startSec) ? Math.floor(startSec) : null
  let effectiveEnd = Number.isFinite(endSec) ? Math.floor(endSec) : null

  if (effectiveStart == null || effectiveEnd == null) {
    const bounds = await getLocalBarTimeBounds(sym, tf)
    if (bounds) {
      if (effectiveEnd == null) effectiveEnd = bounds.maxSec
      if (effectiveStart == null) {
        effectiveStart = Math.max(bounds.minSec, effectiveEnd - maxSpan)
      }
    } else if (effectiveStart == null && effectiveEnd != null) {
      effectiveStart = Math.max(0, effectiveEnd - maxSpan)
    }
  }

  if (effectiveStart != null && effectiveEnd != null && effectiveEnd > effectiveStart) {
    const span = effectiveEnd - effectiveStart
    if (span > maxSpan) effectiveStart = effectiveEnd - maxSpan
  }

  /** @type {Array<string | number>} */
  const params = [sym, tf]
  let sql = `SELECT time_sec, open, high, low, close, volume FROM market_bars WHERE symbol = $1 AND timeframe = $2`
  if (effectiveStart != null) {
    params.push(effectiveStart)
    sql += ` AND time_sec >= $${params.length}`
  }
  if (effectiveEnd != null) {
    params.push(effectiveEnd)
    sql += ` AND time_sec <= $${params.length}`
  }
  sql += ` ORDER BY time_sec ASC`
  params.push(maxBars + 1)
  sql += ` LIMIT $${params.length}`

  const { rows: rawRows } = await getTimescalePool().query(sql, params)
  const { rows, truncated } = trimLocalBarRows(rawRows, maxBars)
  const minRows = tf.startsWith('s') ? 2 : 16
  if (rows.length < minRows) {
    return { ok: false, error: `local bars: too few rows (${rows.length})` }
  }

  const bars = rows.map((r) => ({
    time: Number(r.time_sec),
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
    source: truncated ? `local:timescale:${tf}:truncated` : `local:timescale:${tf}`,
    count: bars.length,
    truncated,
  }
}

export async function countLocalTicksInRange(symbol, startSec, endSec) {
  await initTimescaleSchema()
  const sym = normalizeMarketSymbol(symbol)
  const { rows } = await getTimescalePool().query(
    `SELECT COUNT(*)::int AS n FROM market_ticks
     WHERE symbol = $1 AND time_ms >= $2 AND time_ms < $3`,
    [sym, Math.floor(startSec * 1000), Math.floor(endSec * 1000)],
  )
  return rows[0]?.n ?? 0
}

export async function getLocalBarTimeBounds(symbol, timeframe) {
  await initTimescaleSchema()
  const sym = normalizeMarketSymbol(symbol)
  const tf = String(timeframe || '').trim().toLowerCase()
  if (!BAR_TIMEFRAMES.includes(tf)) return null
  const { rows } = await getTimescalePool().query(
    `SELECT MIN(time_sec) AS min_s, MAX(time_sec) AS max_s FROM market_bars
     WHERE symbol = $1 AND timeframe = $2`,
    [sym, tf],
  )
  const row = rows[0]
  const minSec = row?.min_s != null ? Number(row.min_s) : NaN
  const maxSec = row?.max_s != null ? Number(row.max_s) : NaN
  if (!Number.isFinite(minSec) || !Number.isFinite(maxSec) || maxSec < minSec) return null
  return { minSec, maxSec }
}

export async function countLocalBarsInRange(symbol, timeframe, startSec, endSec) {
  await initTimescaleSchema()
  const sym = normalizeMarketSymbol(symbol)
  const tf = String(timeframe || '').trim().toLowerCase()
  const { rows } = await getTimescalePool().query(
    `SELECT COUNT(*)::int AS n FROM market_bars
     WHERE symbol = $1 AND timeframe = $2 AND time_sec >= $3 AND time_sec < $4`,
    [sym, tf, Math.floor(startSec), Math.floor(endSec)],
  )
  return rows[0]?.n ?? 0
}

export async function readLocalTicksBulk(symbol, startSec, endSec, maxRows = 800_000) {
  await initTimescaleSchema()
  const sym = normalizeMarketSymbol(symbol)
  const startMs = Math.floor(startSec * 1000)
  const endMs = Math.floor(endSec * 1000)
  const limit = Math.max(1, Math.min(2_000_000, Math.floor(maxRows) || 800_000))
  const { rows } = await getTimescalePool().query(
    `SELECT time_ms, bid, ask, bid_vol, ask_vol FROM market_ticks
     WHERE symbol = $1 AND time_ms >= $2 AND time_ms < $3
     ORDER BY time_ms ASC LIMIT $4`,
    [sym, startMs, endMs, limit],
  )
  if (!rows.length) {
    return { ok: false, code: 'no_ticks', error: 'no local ticks for range', ticks: [] }
  }
  const ticks = rows.map((r) => {
    /** @type {import('../../src/types.ts').QuoteTick} */
    const t = { timeMs: Number(r.time_ms), bid: r.bid, ask: r.ask }
    if (r.bid_vol != null) t.bidVol = r.bid_vol
    if (r.ask_vol != null) t.askVol = r.ask_vol
    return t
  })
  return {
    ok: true,
    symbol: sym,
    source: 'local:timescale',
    count: ticks.length,
    ticks,
    truncated: rows.length >= limit,
  }
}

function minTicksPerChunk() {
  return Math.max(1, Number.parseInt(process.env.MARKET_SYNC_MIN_TICKS_PER_CHUNK || '1000', 10) || 1000)
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

export async function localChunkSatisfied(symbol, kind, startSec, endSec) {
  if (kind === 'ticks') {
    return (await countLocalTicksInRange(symbol, startSec, endSec)) >= minTicksPerChunk()
  }
  const tf = String(kind).trim().toLowerCase()
  if (!BAR_TIMEFRAMES.includes(tf)) return false
  return (await countLocalBarsInRange(symbol, tf, startSec, endSec)) >= minBarsPerChunk(tf)
}

export async function getLocalStoreStats(symbol) {
  await initTimescaleSchema()
  const sym = normalizeMarketSymbol(symbol)
  const tickRes = await getTimescalePool().query(
    `SELECT COUNT(*)::int AS n FROM market_ticks WHERE symbol = $1`,
    [sym],
  )
  const tickCount = tickRes.rows[0]?.n ?? 0
  const barCounts = {}
  for (const tf of BAR_TIMEFRAMES) {
    const { rows } = await getTimescalePool().query(
      `SELECT COUNT(*)::int AS n FROM market_bars WHERE symbol = $1 AND timeframe = $2`,
      [sym, tf],
    )
    barCounts[tf] = rows[0]?.n ?? 0
  }
  const tickRangeRes = await getTimescalePool().query(
    `SELECT MIN(time_ms) AS lo, MAX(time_ms) AS hi FROM market_ticks WHERE symbol = $1`,
    [sym],
  )
  return { symbol: sym, tickCount, barCounts, tickRangeMs: tickRangeRes.rows[0] ?? null, backend: 'timescale' }
}

export async function pruneLocalRetention(symbol) {
  await initTimescaleSchema()
  const sym = normalizeMarketSymbol(symbol)
  const nowSec = Math.floor(Date.now() / 1000)
  const tickCutoffMs = (nowSec - retentionDays('ticks') * 86_400) * 1000
  const tickDel = await getTimescalePool().query(`DELETE FROM market_ticks WHERE symbol = $1 AND time_ms < $2`, [
    sym,
    tickCutoffMs,
  ])

  let barDel = 0
  for (const tf of BAR_TIMEFRAMES) {
    const cut = nowSec - retentionDays(tf) * 86_400
    const res = await getTimescalePool().query(
      `DELETE FROM market_bars WHERE symbol = $1 AND timeframe = $2 AND time_sec < $3`,
      [sym, tf, cut],
    )
    barDel += res.rowCount ?? 0
  }

  return { tickDeleted: tickDel.rowCount ?? 0, barDeleted: barDel }
}

export async function testTimescaleConnection() {
  await initTimescaleSchema()
  const { rows } = await getTimescalePool().query('SELECT NOW() AS now')
  return { ok: true, now: rows[0]?.now }
}
