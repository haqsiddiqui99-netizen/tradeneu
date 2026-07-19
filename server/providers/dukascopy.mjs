/**
 * Dukascopy historical OHLCV via `dukascopy-node` (FX, metals, crypto).
 * API runs server-side only — no browser key required.
 *
 * @see https://www.dukascopy-node.app/config/node
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { getHistoricalRates } from 'dukascopy-node'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_CACHE_DIR = path.join(__dirname, '..', '..', 'server-data', 'dukascopy-cache')

/** App symbols → Dukascopy instrument ids (lowercase). */
const EXPLICIT_INSTRUMENT = {
  XAUUSD: 'xauusd',
  GC: 'xauusd',
  XAGUSD: 'xagusd',
  SI: 'xagusd',
  BTCUSD: 'btcusd',
  EURUSD: 'eurusd',
  GBPUSD: 'gbpusd',
  USDJPY: 'usdjpy',
  USDCHF: 'usdchf',
  AUDUSD: 'audusd',
  USDCAD: 'usdcad',
  NZDUSD: 'nzdusd',
  CL: 'wtiusd',
  WTI: 'wtiusd',
}

/**
 * @param {string} rawSymbol
 * @returns {string | null}
 */
export function appSymbolToDukascopyInstrument(rawSymbol) {
  const raw = String(rawSymbol || '').trim()
  if (!raw) return null
  const u = raw.toUpperCase()
  if (EXPLICIT_INSTRUMENT[u]) return EXPLICIT_INSTRUMENT[u]
  if (/^[A-Z]{6}$/.test(u)) return u.toLowerCase()
  return null
}

/** @param {string} symbol */
export function isDukascopyMappableSymbol(symbol) {
  return appSymbolToDukascopyInstrument(symbol) != null
}

/**
 * Map chart UI / query `interval` to Dukascopy `timeframe`.
 * Returns `null` when the interval must be resampled elsewhere (e.g. 2m, 10m).
 * @param {string} chartInterval
 * @returns {string | null}
 */
export function chartIntervalToDukascopyTimeframe(chartInterval) {
  const s = String(chartInterval || '1m').trim()
  if (s === '1M') return 'mn1'
  const x = s.toLowerCase()
  const map = {
    '1m': 'm1',
    '5m': 'm5',
    '15m': 'm15',
    '30m': 'm30',
    '60m': 'h1',
    '1h': 'h1',
    '2h': 'h1',
    '3h': 'h1',
    '4h': 'h4',
    '5h': 'h4',
    '1d': 'd1',
    '1w': 'd1',
    '1wk': 'd1',
    '1mo': 'mn1',
    '1mth': 'mn1',
    '1month': 'mn1',
  }
  return map[x] ?? null
}

/** @param {string} dcTimeframe */
function dcTimeframeToLabel(dcTimeframe) {
  if (dcTimeframe === 'm1') return '1m'
  if (dcTimeframe === 'm5') return '5m'
  if (dcTimeframe === 'm15') return '15m'
  if (dcTimeframe === 'm30') return '30m'
  if (dcTimeframe === 'h1') return '1h'
  if (dcTimeframe === 'h4') return '4h'
  if (dcTimeframe === 'd1') return '1D'
  if (dcTimeframe === 'mn1') return '1M'
  return dcTimeframe
}

/** @param {number} x */
function decimalsForPrice(x) {
  return Number(x) >= 100 ? 3 : 5
}

function dukascopyCachePath() {
  const custom = process.env.DUKASCOPY_CACHE_PATH?.trim()
  return custom || DEFAULT_CACHE_DIR
}

function useDukascopyDiskCache() {
  const v = process.env.DUKASCOPY_USE_CACHE?.trim().toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'no'
}

function batchSize() {
  return Math.min(20, Math.max(2, Number.parseInt(process.env.DUKASCOPY_BATCH_SIZE || '8', 10) || 8))
}

function pauseBetweenBatchesMs() {
  return Math.min(5000, Math.max(100, Number.parseInt(process.env.DUKASCOPY_BATCH_PAUSE_MS || '600', 10) || 600))
}

function retryCount() {
  return Math.min(8, Math.max(0, Number.parseInt(process.env.DUKASCOPY_RETRY_COUNT || '3', 10) || 3))
}

/**
 * @param {string} range
 * @returns {{ from: Date, to: Date }}
 */
function rangeToDateWindow(range) {
  const to = new Date()
  const from = new Date(to.getTime())
  const r = String(range || '5d').trim().toLowerCase()
  if (r === '1d') from.setUTCDate(from.getUTCDate() - 1)
  else if (r === '3d') from.setUTCDate(from.getUTCDate() - 3)
  else if (r === '5d') from.setUTCDate(from.getUTCDate() - 5)
  else if (r === '7d') from.setUTCDate(from.getUTCDate() - 7)
  else if (r === '1mo' || r === '30d') from.setUTCMonth(from.getUTCMonth() - 1)
  else if (r === '3mo') from.setUTCMonth(from.getUTCMonth() - 3)
  else if (r === '6mo') from.setUTCMonth(from.getUTCMonth() - 6)
  else if (r === '1y' || r === '12mo') from.setUTCFullYear(from.getUTCFullYear() - 1)
  else if (r === '2y') from.setUTCFullYear(from.getUTCFullYear() - 2)
  else if (r === '5y') from.setUTCFullYear(from.getUTCFullYear() - 5)
  else if (r === '10y' || r === 'max') from.setUTCFullYear(from.getUTCFullYear() - 10)
  else from.setUTCDate(from.getUTCDate() - 5)
  return { from, to }
}

/**
 * @param {unknown} rows
 * @param {number} [startSec]
 * @param {number} [endSec]
 * @returns {object[]}
 */
export function normalizeDukascopyRows(rows, startSec, endSec) {
  if (!Array.isArray(rows) || rows.length < 1) return []

  const bars = []
  let lastT = -1

  for (const row of rows) {
    let timeMs
    let open
    let high
    let low
    let close
    let volume = 0

    if (Array.isArray(row)) {
      if (row.length < 5) continue
      timeMs = Number(row[0])
      open = Number(row[1])
      high = Number(row[2])
      low = Number(row[3])
      close = Number(row[4])
      volume = row.length > 5 ? Number(row[5]) : 0
    } else if (row && typeof row === 'object') {
      timeMs = Number(row.timestamp ?? row.time ?? row.t)
      open = Number(row.open ?? row.openPrice)
      high = Number(row.high ?? row.highPrice)
      low = Number(row.low ?? row.lowPrice)
      close = Number(row.close ?? row.closePrice)
      volume = Number(row.volume ?? row.vol ?? 0)
    } else {
      continue
    }

    if (!Number.isFinite(timeMs) || timeMs < 1e11) continue
    const t = Math.floor(timeMs / 1000)
    if (![open, high, low, close].every(Number.isFinite)) continue
    if (t <= lastT) continue
    if (Number.isFinite(startSec) && t < startSec) continue
    if (Number.isFinite(endSec) && t > endSec) continue

    lastT = t
    const dp = decimalsForPrice(close)
    const volM = Number.isFinite(volume) && volume >= 0 ? volume : 0
    const volUnits = Math.round(volM * 1_000_000)
    bars.push({
      time: t,
      open: +Number(open).toFixed(dp),
      high: +Number(high).toFixed(dp),
      low: +Number(low).toFixed(dp),
      close: +Number(close).toFixed(dp),
      volume: volUnits,
    })
  }

  return bars
}

/**
 * @param {object} opts
 * @param {string} opts.symbol
 * @param {string} [opts.range]
 * @param {string} [opts.interval]
 * @param {number} [opts.startSec]
 * @param {number} [opts.endSec]
 * @param {number} [opts.sessionStartSec]
 */
export async function fetchDukascopyBars({
  symbol,
  range = '5d',
  interval = '1m',
  startSec,
  endSec,
  sessionStartSec,
}) {
  const instrument = appSymbolToDukascopyInstrument(symbol)
  if (!instrument) {
    return { ok: false, error: 'dukascopy: symbol not mapped' }
  }

  const timeframe = chartIntervalToDukascopyTimeframe(interval)
  if (!timeframe) {
    return { ok: false, error: `dukascopy: interval not supported (${interval})` }
  }

  const hasRange =
    Number.isFinite(startSec) && Number.isFinite(endSec) && endSec > startSec

  const dates = hasRange
    ? { from: new Date(startSec * 1000), to: new Date(endSec * 1000) }
    : rangeToDateWindow(range)

  let rows
  try {
    rows = await getHistoricalRates({
      instrument,
      dates,
      timeframe,
      priceType: 'bid',
      format: 'array',
      utcOffset: 0,
      volumes: true,
      volumeUnits: 'millions',
      ignoreFlats: true,
      batchSize: batchSize(),
      pauseBetweenBatchesMs: pauseBetweenBatchesMs(),
      retryCount: retryCount(),
      pauseBetweenRetriesMs: 400,
      useCache: useDukascopyDiskCache(),
      cacheFolderPath: dukascopyCachePath(),
    })
  } catch (e) {
    return { ok: false, error: `dukascopy network: ${e?.message || e}` }
  }

  let bars = normalizeDukascopyRows(rows, hasRange ? startSec : undefined, hasRange ? endSec : undefined)
  if (bars.length < 16) {
    return { ok: false, error: `dukascopy: parsed too few bars (${bars.length})` }
  }

  if (Number.isFinite(sessionStartSec) && !bars.some((b) => b.time < sessionStartSec)) {
    const lookbackSec = 7 * 86_400
    const priorFrom = Math.max(0, sessionStartSec - lookbackSec)
    try {
      const priorRows = await getHistoricalRates({
        instrument,
        dates: {
          from: new Date(priorFrom * 1000),
          to: new Date(sessionStartSec * 1000),
        },
        timeframe,
        priceType: 'bid',
        format: 'array',
        utcOffset: 0,
        volumes: true,
        volumeUnits: 'millions',
        ignoreFlats: true,
        batchSize: batchSize(),
        pauseBetweenBatchesMs: pauseBetweenBatchesMs(),
        retryCount: retryCount(),
        pauseBetweenRetriesMs: 400,
        useCache: useDukascopyDiskCache(),
        cacheFolderPath: dukascopyCachePath(),
      })
      const priorBars = normalizeDukascopyRows(priorRows, priorFrom, sessionStartSec)
      let prior = null
      for (const b of priorBars) {
        if (b.time < sessionStartSec) prior = b
      }
      if (prior && prior.time < bars[0].time) {
        bars = [prior, ...bars]
      }
    } catch {
      /* prior candle optional */
    }
  }

  const app = String(symbol).trim()
  return {
    ok: true,
    bars,
    timeframe: dcTimeframeToLabel(timeframe),
    source: `dukascopy:${instrument}`,
    dukascopy_request: {
      instrument,
      app_symbol: app,
      timeframe,
      priceType: 'bid',
      timezone: 'UTC',
      startSec: hasRange ? startSec : undefined,
      endSec: hasRange ? endSec : undefined,
      from: dates.from.toISOString(),
      to: dates.to.toISOString(),
    },
  }
}
