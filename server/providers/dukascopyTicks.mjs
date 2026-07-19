/**
 * Dukascopy historical quote ticks via `dukascopy-node` (FX, metals, crypto).
 * @see https://www.dukascopy-node.app/output-formats/json
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { getHistoricalRates } from 'dukascopy-node'
import {
  appSymbolToDukascopyInstrument,
  isDukascopyMappableSymbol,
} from './dukascopy.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_CACHE_DIR = path.join(__dirname, '..', '..', 'server-data', 'dukascopy-cache')

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

function tickPageSize() {
  return Math.min(
    200_000,
    Math.max(1000, Number.parseInt(process.env.DUKASCOPY_TICK_PAGE_SIZE || '50000', 10) || 50_000),
  )
}

function maxTickRangeSec() {
  return Math.min(
    604_800,
    Math.max(300, Number.parseInt(process.env.DUKASCOPY_MAX_TICK_RANGE_SEC || '21600', 10) || 21_600),
  )
}

/** @param {number} px */
function decimalsForPrice(px) {
  return Number(px) >= 100 ? 3 : 5
}

/**
 * @param {unknown} rows
 * @returns {import('../../src/types.ts').QuoteTick[]}
 */
export function normalizeDukascopyTickRows(rows) {
  if (!Array.isArray(rows) || rows.length < 1) return []

  const out = []
  let lastMs = -1

  for (const row of rows) {
    let timeMs
    let ask
    let bid
    let askVol
    let bidVol

    if (Array.isArray(row)) {
      if (row.length < 4) continue
      timeMs = Number(row[0])
      ask = Number(row[1])
      bid = Number(row[2])
      askVol = row.length > 3 ? Number(row[3]) : undefined
      bidVol = row.length > 4 ? Number(row[4]) : undefined
    } else if (row && typeof row === 'object') {
      timeMs = Number(row.timestamp ?? row.time ?? row.t)
      ask = Number(row.askPrice ?? row.ask ?? row.a)
      bid = Number(row.bidPrice ?? row.bid ?? row.b)
      askVol = row.askVolume ?? row.askVol
      bidVol = row.bidVolume ?? row.bidVol
      if (askVol != null) askVol = Number(askVol)
      if (bidVol != null) bidVol = Number(bidVol)
    } else {
      continue
    }

    if (!Number.isFinite(timeMs) || timeMs < 1e11) continue
    if (!Number.isFinite(bid) || !Number.isFinite(ask)) continue
    if (bid > ask) continue
    if (timeMs <= lastMs) continue

    lastMs = timeMs
    const dp = decimalsForPrice((bid + ask) / 2)
    const tick = {
      timeMs,
      bid: +Number(bid).toFixed(dp),
      ask: +Number(ask).toFixed(dp),
    }
    if (Number.isFinite(askVol) && askVol >= 0) tick.askVol = askVol
    if (Number.isFinite(bidVol) && bidVol >= 0) tick.bidVol = bidVol
    out.push(tick)
  }

  return out
}

/**
 * @param {object} opts
 * @param {string} opts.symbol
 * @param {number} opts.startSec unix seconds UTC (inclusive)
 * @param {number} opts.endSec unix seconds UTC (inclusive)
 * @param {number} [opts.limit] max ticks returned (default DUKASCOPY_TICK_PAGE_SIZE)
 * @param {number} [opts.cursor] resume from this timeMs (inclusive)
 * @param {'bid'|'ask'|'both'} [opts.side] reserved — ticks always include bid+ask
 */
export async function fetchDukascopyTicks({
  symbol,
  startSec,
  endSec,
  limit,
  cursor,
  side = 'both',
}) {
  if (!isDukascopyMappableSymbol(symbol)) {
    return { ok: false, error: 'unmapped_symbol', code: 'unmapped_symbol' }
  }

  const instrument = appSymbolToDukascopyInstrument(symbol)
  if (!instrument) {
    return { ok: false, error: 'unmapped_symbol', code: 'unmapped_symbol' }
  }

  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
    return { ok: false, error: 'invalid_range', code: 'invalid_range' }
  }

  const spanSec = endSec - startSec
  if (spanSec > maxTickRangeSec()) {
    return {
      ok: false,
      error: `range_too_large (max ${maxTickRangeSec()}s per request)`,
      code: 'range_too_large',
      maxRangeSec: maxTickRangeSec(),
    }
  }

  const pageLimit = Math.min(tickPageSize(), Math.max(1, Number(limit) || tickPageSize()))
  const cursorMs = cursor != null && Number.isFinite(Number(cursor)) ? Math.floor(Number(cursor)) : null

  let fromMs = startSec * 1000
  if (cursorMs != null && cursorMs > fromMs) fromMs = cursorMs

  if (fromMs >= endSec * 1000) {
    return {
      ok: false,
      error: 'no_ticks',
      code: 'no_ticks',
    }
  }

  let rows
  try {
    rows = await getHistoricalRates({
      instrument,
      dates: {
        from: new Date(fromMs),
        to: new Date(endSec * 1000),
      },
      timeframe: 'tick',
      format: 'json',
      utcOffset: 0,
      batchSize: batchSize(),
      pauseBetweenBatchesMs: pauseBetweenBatchesMs(),
      retryCount: retryCount(),
      pauseBetweenRetriesMs: 400,
      useCache: useDukascopyDiskCache(),
      cacheFolderPath: dukascopyCachePath(),
    })
  } catch (e) {
    return { ok: false, error: `dukascopy network: ${e?.message || e}`, code: 'network_error' }
  }

  let ticks = normalizeDukascopyTickRows(rows)
  if (cursorMs != null) {
    ticks = ticks.filter((t) => t.timeMs >= cursorMs)
  }

  if (ticks.length < 1) {
    return { ok: false, error: 'no_ticks', code: 'no_ticks' }
  }

  const truncated = ticks.length > pageLimit
  const page = truncated ? ticks.slice(0, pageLimit) : ticks
  const last = page[page.length - 1]
  const hasMore = truncated || (last && last.timeMs < endSec * 1000 && ticks.length > page.length)

  const app = String(symbol).trim().toUpperCase()
  return {
    ok: true,
    ticks: page,
    symbol: app,
    source: `dukascopy:ticks:${instrument}`,
    count: page.length,
    truncated: Boolean(truncated || hasMore),
    nextCursor: hasMore && last ? last.timeMs + 1 : undefined,
    dukascopy_request: {
      instrument,
      app_symbol: app,
      timeframe: 'tick',
      side,
      startSec,
      endSec,
      cursorMs,
      from: new Date(fromMs).toISOString(),
      to: new Date(endSec * 1000).toISOString(),
      fetched: ticks.length,
      returned: page.length,
    },
  }
}

export { isDukascopyMappableSymbol }
