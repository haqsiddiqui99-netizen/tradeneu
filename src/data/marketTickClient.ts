/**
 * Client fetch for Dukascopy quote ticks via same-origin `/api/market/ticks`.
 * Paginates automatically and chunks wide ranges to respect server max span.
 */

import type { QuoteTick, TickSeries } from '../types'

function apiOrigin(): string {
  const o = import.meta.env.VITE_HISTORIC_GOLD_API as string | undefined
  if (o && String(o).trim()) return String(o).replace(/\/$/, '')
  return ''
}

const TICKS_CACHE_TTL_MS = Math.max(
  15_000,
  Number.parseInt(String(import.meta.env.VITE_MARKET_TICKS_CACHE_TTL_MS ?? '300000'), 10) || 300_000,
)
const TICKS_CACHE_HISTORICAL_TTL_MS = Math.max(
  TICKS_CACHE_TTL_MS,
  Number.parseInt(String(import.meta.env.VITE_MARKET_TICKS_CACHE_HISTORICAL_TTL_MS ?? '900000'), 10) ||
    900_000,
)
const TICKS_CACHE_MAX = 24

/** Matches server default `DUKASCOPY_MAX_TICK_RANGE_SEC`. */
const MAX_TICK_RANGE_SEC = Math.max(
  300,
  Number.parseInt(String(import.meta.env.VITE_DUKASCOPY_MAX_TICK_RANGE_SEC ?? '21600'), 10) || 21_600,
)

const DEFAULT_PAGE_LIMIT = Math.max(
  1000,
  Number.parseInt(String(import.meta.env.VITE_DUKASCOPY_TICK_PAGE_SIZE ?? '50000'), 10) || 50_000,
)

/** Client-side safety cap — prevents main-thread freeze on wide sessions. */
export const DEFAULT_MAX_CHART_TICKS = Math.max(
  10_000,
  Number.parseInt(String(import.meta.env.VITE_CHART_MAX_TICKS ?? '120000'), 10) || 120_000,
)

type CachedTicks = { at: number; data: MarketTicksSeries }
const ticksCache = new Map<string, CachedTicks>()

export type MarketTicksSeries = TickSeries

export type TickLoadBatchInfo = {
  total: number
  truncated: boolean
  done: boolean
}

export type MarketTicksFetchOpts = {
  /** Max ticks per HTTP page (server may cap lower). */
  limit?: number
  /** Resume from this tick timeMs (inclusive). */
  cursor?: number
  /** When true (default), follow `nextCursor` until the range is complete. */
  fetchAll?: boolean
  /** Stop after this many ticks (chart safety cap). */
  maxTicks?: number
  /** Skip in-memory cache. */
  noCache?: boolean
  /** Called after each fetched chunk (and once more with `done: true`). */
  onBatch?: (batch: QuoteTick[], info: TickLoadBatchInfo) => void | Promise<void>
  /** Abort in-flight pagination. */
  signal?: AbortSignal
}

function marketTicksUrl(
  symbol: string,
  startSec: number,
  endSec: number,
  opts?: MarketTicksFetchOpts,
): string {
  const params = new URLSearchParams({
    symbol: symbol.trim().toUpperCase(),
    start: String(Math.floor(startSec)),
    end: String(Math.floor(endSec)),
  })
  if (opts?.cursor != null && Number.isFinite(opts.cursor)) {
    params.set('cursor', String(Math.floor(opts.cursor)))
  }
  if (opts?.limit != null && Number.isFinite(opts.limit)) {
    params.set('limit', String(Math.max(1, Math.floor(opts.limit))))
  }
  const query = params.toString()
  const path = `api/market/ticks?${query}`
  const base = apiOrigin()
  if (base) return `${base}/${path}`
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/${path}`
  }
  return `/${path}`
}

function ticksCacheKey(
  symbol: string,
  startSec: number,
  endSec: number,
  opts?: MarketTicksFetchOpts,
): string {
  return [
    symbol.trim().toUpperCase(),
    Math.floor(startSec),
    Math.floor(endSec),
    opts?.cursor ?? '',
    opts?.limit ?? DEFAULT_PAGE_LIMIT,
    opts?.maxTicks ?? '',
    opts?.fetchAll === false ? 'page' : 'all',
  ].join('|')
}

function ticksCacheTtlMs(endSec: number): number {
  const nowSec = Math.floor(Date.now() / 1000)
  if (endSec < nowSec - 300) return TICKS_CACHE_HISTORICAL_TTL_MS
  return TICKS_CACHE_TTL_MS
}

function pruneTicksCache() {
  const now = Date.now()
  for (const [k, v] of ticksCache) {
    if (now - v.at > TICKS_CACHE_HISTORICAL_TTL_MS) ticksCache.delete(k)
  }
  while (ticksCache.size > TICKS_CACHE_MAX) {
    const first = ticksCache.keys().next().value
    if (first == null) break
    ticksCache.delete(first)
  }
}

function normalizeQuoteTick(row: unknown): QuoteTick | null {
  if (!row || typeof row !== 'object') return null
  const o = row as Record<string, unknown>
  const timeMs = Number(o.timeMs)
  const bid = Number(o.bid)
  const ask = Number(o.ask)
  if (!Number.isFinite(timeMs) || timeMs < 1e11) return null
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid > ask) return null
  const tick: QuoteTick = { timeMs, bid, ask }
  const bidVol = Number(o.bidVol)
  const askVol = Number(o.askVol)
  if (Number.isFinite(bidVol) && bidVol >= 0) tick.bidVol = bidVol
  if (Number.isFinite(askVol) && askVol >= 0) tick.askVol = askVol
  return tick
}

function parseTicksPage(json: unknown): MarketTicksSeries | null {
  if (!json || typeof json !== 'object' || !('ok' in json) || (json as { ok: unknown }).ok !== true) {
    return null
  }
  const o = json as {
    ticks?: unknown
    symbol?: unknown
    source?: unknown
    count?: unknown
    truncated?: unknown
    nextCursor?: unknown
  }
  const raw = Array.isArray(o.ticks) ? o.ticks : []
  const ticks: QuoteTick[] = []
  let lastMs = -1
  for (const row of raw) {
    const t = normalizeQuoteTick(row)
    if (!t || t.timeMs <= lastMs) continue
    lastMs = t.timeMs
    ticks.push(t)
  }
  if (!ticks.length) return null
  const symbol =
    typeof o.symbol === 'string' && o.symbol.trim() ? o.symbol.trim().toUpperCase() : ''
  const source = typeof o.source === 'string' && o.source.trim() ? o.source.trim() : undefined
  const count = typeof o.count === 'number' && Number.isFinite(o.count) ? o.count : ticks.length
  const truncated = o.truncated === true
  const nextCursor =
    o.nextCursor != null && Number.isFinite(Number(o.nextCursor))
      ? Math.floor(Number(o.nextCursor))
      : undefined
  return { ticks, symbol, source: source ?? 'dukascopy:ticks', count, truncated, nextCursor }
}

async function fetchMarketTicksPage(
  symbol: string,
  startSec: number,
  endSec: number,
  opts?: MarketTicksFetchOpts,
): Promise<MarketTicksSeries | null> {
  try {
    const res = await fetch(marketTicksUrl(symbol, startSec, endSec, opts), {
      credentials: 'same-origin',
    })
    if (!res.ok) return null
    const json: unknown = await res.json()
    return parseTicksPage(json)
  } catch {
    return null
  }
}

function mergeTicks(...groups: QuoteTick[][]): QuoteTick[] {
  const out: QuoteTick[] = []
  let lastMs = -1
  for (const group of groups) {
    for (const t of group) {
      if (t.timeMs <= lastMs) continue
      lastMs = t.timeMs
      out.push(t)
    }
  }
  return out
}

function chunkTickRange(startSec: number, endSec: number): Array<{ startSec: number; endSec: number }> {
  const out: Array<{ startSec: number; endSec: number }> = []
  let cur = Math.floor(startSec)
  const end = Math.floor(endSec)
  while (cur < end) {
    const chunkEnd = Math.min(end, cur + MAX_TICK_RANGE_SEC)
    out.push({ startSec: cur, endSec: chunkEnd })
    cur = chunkEnd
  }
  return out
}

async function fetchMarketTicksChunk(
  symbol: string,
  startSec: number,
  endSec: number,
  opts?: MarketTicksFetchOpts,
): Promise<MarketTicksSeries | null> {
  const limit = opts?.limit ?? DEFAULT_PAGE_LIMIT
  const fetchAll = opts?.fetchAll !== false
  const maxTicks = Math.max(1, Number(opts?.maxTicks) || Number.POSITIVE_INFINITY)
  let cursor = opts?.cursor
  const allTicks: QuoteTick[] = []
  let source: string | undefined
  let sym = symbol.trim().toUpperCase()
  let capped = false

  for (let page = 0; page < 512; page++) {
    const pageOpts: MarketTicksFetchOpts = { limit, cursor, fetchAll: false, noCache: true }
    const hit = await fetchMarketTicksPage(symbol, startSec, endSec, pageOpts)
    if (!hit?.ticks.length) break

    if (hit.source) source = hit.source
    if (hit.symbol) sym = hit.symbol
    for (const t of hit.ticks) {
      allTicks.push(t)
      if (allTicks.length >= maxTicks) {
        capped = true
        break
      }
    }

    if (capped) {
      return {
        ticks: allTicks,
        symbol: sym,
        source: source ?? 'dukascopy:ticks',
        count: allTicks.length,
        truncated: true,
      }
    }

    if (!fetchAll || !hit.truncated || hit.nextCursor == null) {
      return {
        ticks: allTicks,
        symbol: sym,
        source: source ?? 'dukascopy:ticks',
        count: allTicks.length,
        truncated: hit.truncated ?? false,
        nextCursor: hit.nextCursor,
      }
    }
    if (hit.nextCursor === cursor) break
    cursor = hit.nextCursor
  }

  if (!allTicks.length) return null
  return {
    ticks: allTicks,
    symbol: sym,
    source: source ?? 'dukascopy:ticks',
    count: allTicks.length,
    truncated: false,
  }
}

/**
 * Fetch Dukascopy quote ticks for `[startSec, endSec]` (unix UTC seconds).
 * Wide ranges are split into server-sized chunks; pages are merged when `fetchAll` is true.
 */
export async function fetchMarketTicksSeries(
  symbol: string,
  startSec: number,
  endSec: number,
  opts?: MarketTicksFetchOpts,
): Promise<MarketTicksSeries | null> {
  const start = Math.floor(startSec)
  const end = Math.floor(endSec)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null

  const cacheKey = ticksCacheKey(symbol, start, end, opts)
  if (!opts?.noCache) {
    const hit = ticksCache.get(cacheKey)
    if (hit && Date.now() - hit.at < ticksCacheTtlMs(end)) return hit.data
  }

  const chunks = chunkTickRange(start, end)
  const parts: QuoteTick[][] = []
  let source: string | undefined
  let sym = symbol.trim().toUpperCase()
  let truncated = false
  const maxTicks = Math.max(1, Number(opts?.maxTicks) || Number.POSITIVE_INFINITY)
  let total = 0

  for (const chunk of chunks) {
    if (opts?.signal?.aborted) return null
    if (total >= maxTicks) {
      truncated = true
      break
    }
    const part = await fetchMarketTicksChunk(symbol, chunk.startSec, chunk.endSec, {
      ...opts,
      maxTicks: maxTicks - total,
    })
    if (!part?.ticks.length) continue
    if (part.source) source = part.source
    if (part.symbol) sym = part.symbol
    parts.push(part.ticks)
    total += part.ticks.length
    if (part.truncated || total >= maxTicks) truncated = true
    if (opts?.onBatch) {
      await opts.onBatch(part.ticks, { total, truncated, done: false })
    }
    if (total >= maxTicks) break
  }

  const merged = mergeTicks(...parts)
  if (!merged.length) return null
  const ticks = merged.length > maxTicks ? merged.slice(0, maxTicks) : merged

  const data: MarketTicksSeries = {
    ticks,
    symbol: sym,
    source: source ?? 'dukascopy:ticks',
    count: ticks.length,
    truncated,
  }

  if (opts?.onBatch) {
    await opts.onBatch([], { total: ticks.length, truncated, done: true })
  }

  if (!opts?.noCache) {
    pruneTicksCache()
    ticksCache.set(cacheKey, { at: Date.now(), data })
  }

  return data
}
