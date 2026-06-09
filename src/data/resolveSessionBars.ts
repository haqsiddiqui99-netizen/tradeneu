import type { Bar } from '../types'
import { fetchMarketBarsSeries } from './marketDataClient'
import {
  generateBtcUsdDemoMinuteBars,
  generateGoldSpotMinuteBars,
  generateMockMinuteBars,
  seedFromSymbol,
} from './mockBars'

const DEFAULT_BAR_COUNT = 1500

/** Gold session: bars + timeframe label for the chart chrome. */
export type ResolvedSeries = {
  bars: Bar[]
  timeframe: string
  /** Where bars came from (e.g. twelvedata:BTC/USD, upload:server-data, synthetic:…). */
  dataSource?: string
}

/** Symbols that use gold browser history (static JSON or gold generator). */
export function isGoldBrowserSymbol(symbol: string): boolean {
  const u = symbol.trim().toUpperCase()
  return u === 'XAUUSD' || u === 'GC'
}

/**
 * US-style equity tickers for `/api/market/bars`.
 * Keep filter rules aligned with `appSymbolToTwelveDataSymbol` fall-through in `server/providers/twelveData.mjs`.
 */
export function isLikelyUsStockSymbol(symbol: string): boolean {
  const raw = symbol.trim()
  const u = raw.toUpperCase()
  if (!raw || raw.length > 12 || raw.length < 1) return false
  const nonStock = new Set(['XAUUSD', 'GC', 'BTCUSD', 'SI', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'CL'])
  if (nonStock.has(u)) return false
  if (/^[A-Z]{6}$/.test(u)) return false
  if (u.includes('=') || u.includes(':') || u.includes('/')) return false
  return /^[A-Z0-9.-]+$/i.test(raw)
}

/** Symbols that load live OHLCV from `/api/market/bars` (Twelve Data) before static / synthetic fallbacks. */
export function usesMarketDataSession(symbol: string): boolean {
  const u = symbol.trim().toUpperCase()
  return isGoldBrowserSymbol(u) || u === 'BTCUSD' || isLikelyUsStockSymbol(u)
}

type RawBar = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

function normalizeBar(b: RawBar): Bar | null {
  if (
    typeof b.time !== 'number' ||
    !Number.isFinite(b.open) ||
    !Number.isFinite(b.high) ||
    !Number.isFinite(b.low) ||
    !Number.isFinite(b.close)
  ) {
    return null
  }
  const v = Number(b.volume)
  const volume = Number.isFinite(v) && v >= 0 ? Math.round(v) : 0
  return {
    time: b.time as Bar['time'],
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume,
  }
}

function parseBarsPayload(data: unknown): Bar[] | null {
  const list: unknown[] = Array.isArray(data)
    ? data
    : data &&
        typeof data === 'object' &&
        data !== null &&
        'bars' in data &&
        Array.isArray((data as { bars: unknown }).bars)
      ? (data as { bars: unknown[] }).bars
      : []
  if (!list.length) return null
  const out: Bar[] = []
  let lastT = -1
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const b = normalizeBar(row as RawBar)
    if (!b || b.time <= lastT) continue
    lastT = b.time
    out.push(b)
  }
  return out.length >= 16 ? out : null
}

export function inferTimeframeFromBars(bars: Bar[]): string {
  if (bars.length < 8) return '1h'
  const gaps: number[] = []
  for (let i = 1; i < Math.min(120, bars.length); i++) {
    gaps.push(bars[i]!.time - bars[i - 1]!.time)
  }
  gaps.sort((a, b) => a - b)
  const med = gaps[Math.floor(gaps.length / 2)] ?? 3600
  if (med <= 90) return '1m'
  if (med <= 360) return '5m'
  if (med <= 780) return '10m'
  if (med <= 1200) return '15m'
  if (med <= 7200) return '1h'
  if (med <= 129_600) return '1D'
  return '1W'
}

function parseSeriesPayload(data: unknown): ResolvedSeries | null {
  const bars = parseBarsPayload(data)
  if (!bars) return null
  let timeframe = inferTimeframeFromBars(bars)
  let dataSource: string | undefined
  if (data && typeof data === 'object' && data !== null) {
    const o = data as { timeframe?: unknown; source?: unknown }
    if (typeof o.timeframe === 'string' && o.timeframe.trim()) timeframe = o.timeframe.trim()
    if (typeof o.source === 'string' && o.source.trim()) dataSource = o.source.trim()
  }
  return { bars, timeframe, dataSource }
}

/** Prefer 1m bundled sample; fall back to hourly JSON only if minute file is missing or invalid. */
const GOLD_DATA_URLS = ['data/xauusd-bars.json', 'data/xauusd-1h.json'] as const

async function fetchGoldStaticJson(): Promise<ResolvedSeries | null> {
  const base = import.meta.env.BASE_URL
  for (const path of GOLD_DATA_URLS) {
    const url = `${base}${path}`
    try {
      const res = await fetch(url)
      if (res.ok) {
        const json: unknown = await res.json()
        const parsed = parseSeriesPayload(json)
        if (!parsed) continue
        return parsed
      }
    } catch {
      /* offline */
    }
  }
  return null
}

/**
 * Gold (XAUUSD / GC): `/api/market/bars` first (`1m` intraday by default), then bundled
 * `public/data/xauusd-bars.json` or `xauusd-1h.json`, then synthetic 1m demo bars.
 * Historic API: `npm run server:historic` (or Vite sidecar) on port 3001.
 * BTCUSD: `/api/market/bars` then synthetic mock 1m bars.
 * US-style stocks (e.g. AAPL): `/api/market/bars` (Twelve Data), then synthetic 1m mock bars.
 * Other symbols: synthetic 1m mock bars.
 */
export async function resolveSessionBars(
  symbol: string,
  sessionName: string,
  count = DEFAULT_BAR_COUNT,
): Promise<ResolvedSeries> {
  const u = symbol.trim().toUpperCase()
  const seed = seedFromSymbol(u) + sessionName.length * 17

  if (isGoldBrowserSymbol(u)) {
    const fromMarket = await fetchMarketBarsSeries(u, undefined, { range: '5d', interval: '1m' })
    if (fromMarket) {
      return {
        bars: fromMarket.bars,
        timeframe: fromMarket.timeframe,
        dataSource: fromMarket.dataSource,
      }
    }

    const fromFile = await fetchGoldStaticJson()
    if (fromFile) return fromFile

    return { bars: generateGoldSpotMinuteBars(count, seed), timeframe: '1m', dataSource: 'synthetic:gold-demo' }
  }

  if (u === 'BTCUSD') {
    const fromMarket = await fetchMarketBarsSeries(u)
    if (fromMarket) {
      return {
        bars: fromMarket.bars,
        timeframe: fromMarket.timeframe,
        dataSource: fromMarket.dataSource,
      }
    }
    return {
      bars: generateBtcUsdDemoMinuteBars(count, seed),
      timeframe: '1m',
      dataSource: 'synthetic:btc-demo',
    }
  }

  if (isLikelyUsStockSymbol(u)) {
    const fromMarket = await fetchMarketBarsSeries(u, undefined, { range: '5d', interval: '1m' })
    if (fromMarket) {
      return {
        bars: fromMarket.bars,
        timeframe: fromMarket.timeframe,
        dataSource: fromMarket.dataSource,
      }
    }
    return {
      bars: generateMockMinuteBars(count, seed),
      timeframe: '1m',
      dataSource: 'synthetic:equity-demo',
    }
  }

  return { bars: generateMockMinuteBars(count, seed), timeframe: '1m' }
}
