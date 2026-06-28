/**
 * Unified server-side market history (Twelve Data + optional gold CSV upload).
 * Sends `chain=twelvedata` by default so `/api/market/bars` always hits Twelve Data (override with
 * `VITE_MARKET_BAR_CHAIN` or the `chain` argument, e.g. `twelvedata,upload` for gold CSV fallback).
 */

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
  const path = `api/market/bars?${params.toString()}`
  const base = apiOrigin()
  if (base) return `${base}/${path}`
  return new URL(path, document.baseURI).href
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
}

export async function fetchMarketBarsSeries(
  symbol: string,
  chain?: string,
  opts?: MarketBarsFetchOpts,
): Promise<MarketBarsSeries | null> {
  const chainParam =
    (chain ?? (import.meta.env.VITE_MARKET_BAR_CHAIN as string | undefined))?.trim() || 'twelvedata'
  try {
    const res = await fetch(marketBarsUrl(symbol, chainParam, opts), {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json: unknown = await res.json()
    if (!json || typeof json !== 'object' || !('ok' in json) || (json as { ok: unknown }).ok !== true) return null
    const bars = (json as { bars?: unknown }).bars
    const timeframe = (json as { timeframe?: unknown }).timeframe
    if (!Array.isArray(bars) || bars.length < (opts?.minBars ?? 16)) return null
    const tf = typeof timeframe === 'string' && timeframe.trim() ? timeframe.trim() : '1m'
    const src = (json as { source?: unknown }).source
    const dataSource = typeof src === 'string' && src.trim() ? src.trim() : undefined
    return {
      bars: bars as Bar[],
      timeframe: tf,
      dataSource,
    }
  } catch {
    return null
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
