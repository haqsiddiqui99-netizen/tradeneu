/**
 * Unified server-side market history (local SQLite + Dukascopy + Twelve Data + optional gold CSV upload).
 * Sends `chain=local,dukascopy,twelvedata` by default so `/api/market/bars` serves pre-synced
 * second bars from SQLite before remote providers (override with `VITE_MARKET_BAR_CHAIN` or `chain`).
 */

/** Default provider chain — local SQLite (disk) first, then Dukascopy, Twelve Data fallback. */
export const DEFAULT_MARKET_BAR_CHAIN = 'local,dukascopy,twelvedata'

import type { Bar } from '../types'

function apiOrigin(): string {
  const o = import.meta.env.VITE_HISTORIC_GOLD_API as string | undefined
  if (o && String(o).trim()) return String(o).replace(/\/$/, '')
  return ''
}

function marketBarsUrl(symbol: string, chain: string, opts?: MarketBarsFetchOpts): string {
  const params = new URLSearchParams({ symbol, chain })
  if (opts?.range?.trim()) params.set('range', opts.range.trim())
  if (opts?.interval?.trim()) params.set('interval', opts.interval.trim())
  if (opts?.startSec != null && Number.isFinite(opts.startSec)) {
    params.set('start', String(Math.floor(opts.startSec)))
  }
  if (opts?.endSec != null && Number.isFinite(opts.endSec)) {
    params.set('end', String(Math.floor(opts.endSec)))
  }
  if (opts?.sessionStartSec != null && Number.isFinite(opts.sessionStartSec)) {
    params.set('sessionStart', String(Math.floor(opts.sessionStartSec)))
  }
  const path = `/api/market/bars?${params.toString()}`
  const base = apiOrigin()
  if (base) return `${base}${path}`
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`
  }
  return path
}

export type MarketBarsSeries = { bars: Bar[]; timeframe: string; dataSource?: string }

export type MarketBarsFetchOpts = {
  range?: string
  interval?: string
  /** Unix seconds (session initial date, local interpretation on client). */
  startSec?: number
  /** Unix seconds (session end date, local interpretation on client). */
  endSec?: number
  /** Actual session start (for server prior-candle backfill). */
  sessionStartSec?: number
  /** Minimum bars required (default 16). Use 1 when fetching a single prior candle. */
  minBars?: number
  /** Skip in-memory cache (e.g. force refresh). */
  noCache?: boolean
}

const BARS_CACHE_TTL_MS = Math.max(
  30_000,
  Number.parseInt(String(import.meta.env.VITE_MARKET_BARS_CACHE_TTL_MS ?? '300000'), 10) || 300_000,
)
const BARS_CACHE_HISTORICAL_TTL_MS = Math.max(
  BARS_CACHE_TTL_MS,
  Number.parseInt(String(import.meta.env.VITE_MARKET_BARS_CACHE_HISTORICAL_TTL_MS ?? '86400000'), 10) ||
    86_400_000,
)
const BARS_CACHE_MAX = 32

type CachedSeries = { at: number; data: MarketBarsSeries }
const seriesCache = new Map<string, CachedSeries>()

function barsCacheKey(symbol: string, chainParam: string, opts?: MarketBarsFetchOpts): string {
  return [
    symbol.trim().toUpperCase(),
    chainParam.trim().toLowerCase(),
    opts?.range?.trim() || '',
    opts?.interval?.trim() || '',
    opts?.startSec ?? '',
    opts?.endSec ?? '',
    opts?.sessionStartSec ?? '',
    opts?.minBars ?? 16,
  ].join('|')
}

function barsCacheTtlMs(endSec?: number): number {
  const nowSec = Math.floor(Date.now() / 1000)
  if (endSec != null && Number.isFinite(endSec) && endSec < nowSec - 300) {
    return BARS_CACHE_HISTORICAL_TTL_MS
  }
  return BARS_CACHE_TTL_MS
}

function pruneSeriesCache() {
  const now = Date.now()
  for (const [k, v] of seriesCache) {
    if (now - v.at > BARS_CACHE_HISTORICAL_TTL_MS) seriesCache.delete(k)
  }
  while (seriesCache.size > BARS_CACHE_MAX) {
    const first = seriesCache.keys().next().value
    if (first == null) break
    seriesCache.delete(first)
  }
}

/** Abort hung Dukascopy / historic API fetches so saved-session chart boot can fall back. */
const BARS_FETCH_TIMEOUT_MS = Math.max(
  5_000,
  Number.parseInt(String(import.meta.env.VITE_MARKET_BARS_FETCH_TIMEOUT_MS ?? '120000'), 10) || 120_000,
)

export async function fetchMarketBarsSeries(
  symbol: string,
  chain?: string,
  opts?: MarketBarsFetchOpts,
): Promise<MarketBarsSeries | null> {
  const chainParam =
    (chain ?? (import.meta.env.VITE_MARKET_BAR_CHAIN as string | undefined))?.trim() ||
    DEFAULT_MARKET_BAR_CHAIN
  const cacheKey = barsCacheKey(symbol, chainParam, opts)
  if (!opts?.noCache) {
    const hit = seriesCache.get(cacheKey)
    if (hit && Date.now() - hit.at < barsCacheTtlMs(opts?.endSec)) {
      return hit.data
    }
  }
  const ac = new AbortController()
  const timer = window.setTimeout(() => ac.abort(), BARS_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(marketBarsUrl(symbol, chainParam, opts), {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: ac.signal,
    })
    if (!res.ok) {
      console.warn('[Tradeneu] /api/market/bars request failed', {
        status: res.status,
        url: res.url,
      })
      return null
    }
    const json: unknown = await res.json()
    if (!json || typeof json !== 'object' || !('ok' in json) || (json as { ok: unknown }).ok !== true) return null
    const bars = (json as { bars?: unknown }).bars
    const timeframe = (json as { timeframe?: unknown }).timeframe
    if (!Array.isArray(bars) || bars.length < (opts?.minBars ?? 16)) return null
    const tf = typeof timeframe === 'string' && timeframe.trim() ? timeframe.trim() : '1m'
    const src = (json as { source?: unknown }).source
    const dataSource = typeof src === 'string' && src.trim() ? src.trim() : undefined
    const data: MarketBarsSeries = {
      bars: bars as Bar[],
      timeframe: tf,
      dataSource,
    }
    if (!opts?.noCache) {
      pruneSeriesCache()
      seriesCache.set(cacheKey, { at: Date.now(), data })
    }
    return data
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

/** Stock UI timeframe id → `range` / `interval` query params for `/api/market/bars`. */
const STOCK_UI_TF: Record<string, { range: string; interval: string }> = {
  '1m': { range: '5d', interval: '1m' },
  '5m': { range: '1mo', interval: '5m' },
  '15m': { range: '3mo', interval: '15m' },
  '1h': { range: '1y', interval: '1h' },
  '1d': { range: '5y', interval: '1d' },
  '1w': { range: '10y', interval: '1w' },
  '1M': { range: 'max', interval: '1M' },
}

/**
 * OHLCV for the standalone stock chart page (same-origin historic API + Twelve Data).
 */
export async function fetchMarketBarsForStockApp(
  symbol: string,
  uiTf: string,
): Promise<{ bars: Bar[]; symbol: string; meta: string }> {
  const p = STOCK_UI_TF[uiTf] ?? STOCK_UI_TF['1m']!
  const s = await fetchMarketBarsSeries(symbol.trim().toUpperCase(), undefined, p)
  if (!s) {
    throw new Error(
      'Market data unavailable. Start the historic API (npm run server:historic or npm run dev) and set TWELVE_DATA_API_KEY on the server.',
    )
  }
  return {
    bars: s.bars,
    symbol: symbol.trim().toUpperCase(),
    meta: `${s.timeframe} · ${s.dataSource ?? 'market'} · ${s.bars.length} bars`,
  }
}
