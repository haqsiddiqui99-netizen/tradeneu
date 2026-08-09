import type { Bar } from '../types'
import { fetchMarketBarsSeries } from './marketDataClient'
import {
  generateBtcUsdDemoMinuteBars,
  generateGoldSpotMinuteBars,
  generateMockMinuteBars,
  generateOilDemoMinuteBars,
  generateSilverSpotMinuteBars,
  seedFromSymbol,
} from './mockBars'
import {
  minuteBarCountForRange,
  parseSessionDateToSec,
  sessionDateRangeSec,
  sessionFetchStartSec,
  SESSION_CHART_LOOKBACK_SEC,
  SESSION_FETCH_PRE_ROLL_SEC,
  filterBarsBySessionDates,
} from './sessionDateRange'

const DEFAULT_BAR_COUNT = 1500
/** Cap client-side session bar payload so chart boot stays responsive. */
const MAX_SESSION_CHART_BARS = 60_000

export type SessionBarsOpts = {
  startDate?: string
  endDate?: string
}

function resolveFetchRange(startDate?: string, endDate?: string): { startSec?: number; endSec?: number } {
  const { startSec, endSec } = sessionDateRangeSec(startDate, endDate)
  const nowSec = Math.floor(Date.now() / 1000)
  const lookback = (sec: number) => Math.max(0, sec - SESSION_CHART_LOOKBACK_SEC)
  // Fetch session window plus 3h lookback for chart context; prior bar also backfilled server-side via sessionStartSec.
  if (startSec != null && endSec != null) return { startSec: lookback(startSec), endSec }
  if (startSec != null) {
    const capEnd = Math.min(nowSec, startSec + 90 * 86_400)
    return { startSec: lookback(startSec), endSec: capEnd }
  }
  if (endSec != null) return { startSec: Math.max(0, endSec - 5 * 86_400), endSec }
  return {}
}

function syntheticParams(
  startDate?: string,
  endDate?: string,
  defaultCount = DEFAULT_BAR_COUNT,
): { count: number; startSec?: number } {
  const { startSec, endSec } = sessionDateRangeSec(startDate, endDate)
  if (startSec != null && endSec != null && endSec > startSec) {
    return { count: minuteBarCountForRange(startSec, endSec) + 1, startSec: startSec - 60 }
  }
  return { count: defaultCount }
}

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
 * Keep filter rules aligned with `appSymbolToTwelveDataSymbol` / `appSymbolToDukascopyInstrument` on the server.
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

/** Silver / oil symbols mapped in `server/providers/twelveData.mjs`. */
export function isCommodityMarketSymbol(symbol: string): boolean {
  const u = symbol.trim().toUpperCase()
  return u === 'SI' || u === 'XAGUSD' || u === 'CL'
}

/** Six-letter FX pairs (EURUSD → EUR/USD on the server). */
export function isForexPairSymbol(symbol: string): boolean {
  const u = symbol.trim().toUpperCase()
  return /^[A-Z]{6}$/.test(u)
}

/** Live mode currently supports gold spot only (XAUUSD). */
export function usesMarketDataSession(symbol: string): boolean {
  return isGoldBrowserSymbol(symbol.trim().toUpperCase())
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

function mergeBarsByTime(...groups: Bar[][]): Bar[] {
  const out: Bar[] = []
  let lastT = -1
  for (const group of groups) {
    for (const b of group) {
      if (b.time <= lastT) continue
      lastT = b.time
      out.push(b)
    }
  }
  return out
}

/** When the main fetch begins exactly at session start, load one earlier candle for chart context. */
async function ensurePriorBarInPool(symbol: string, bars: Bar[], startDate?: string): Promise<Bar[]> {
  const startSec = startDate?.trim() ? parseSessionDateToSec(startDate, 'start') : null
  if (startSec == null || !Number.isFinite(startSec) || !bars.length) return bars
  if (bars.some((b) => b.time < startSec)) return bars

  const pad = await fetchMarketBarsSeries(symbol, undefined, {
    interval: '1m',
    startSec: sessionFetchStartSec(startSec),
    endSec: startSec,
    minBars: 1,
  })
  if (!pad?.bars.length) return bars
  return mergeBarsByTime(pad.bars, bars)
}

function barsOverlapSessionWindow(bars: Bar[], sessionStartSec: number, sessionEndSec: number): boolean {
  if (!bars.length) return false
  const first = bars[0]!.time
  const last = bars[bars.length - 1]!.time
  return last >= sessionStartSec - 86_400 && first <= sessionEndSec + 86_400
}

/** Trim API bars to session window + pre-roll; cap count for chart boot. */
export function trimBarsForSessionChart(
  bars: Bar[],
  startDate?: string,
  endDate?: string,
  maxBars = MAX_SESSION_CHART_BARS,
): Bar[] {
  if (!bars.length) return bars
  const startSec = startDate?.trim() ? parseSessionDateToSec(startDate, 'start') : null
  const endSec = endDate?.trim() ? parseSessionDateToSec(endDate, 'end') : null
  let out = bars
  if (startSec != null && Number.isFinite(startSec)) {
    const lo = Math.max(0, startSec - SESSION_FETCH_PRE_ROLL_SEC)
    out = out.filter((b) => b.time >= lo)
  }
  if (endSec != null && Number.isFinite(endSec)) {
    const hi = endSec + 3600
    out = out.filter((b) => b.time <= hi)
  }
  if (out.length > maxBars) out = out.slice(0, maxBars)
  if (out.length >= 16) return out
  if (bars.length > maxBars) return bars.slice(0, maxBars)
  return bars
}

/** Client-side session filter with trim fallback (matches server trim when filter is strict). */
export function resolveChartBarsForSession(
  rawBars: Bar[],
  startDate?: string,
  endDate?: string,
  minBars = 8,
): Bar[] {
  if (!rawBars.length) return []
  const hasDates = Boolean(startDate?.trim() || endDate?.trim())
  if (!hasDates) return rawBars

  const filtered = filterBarsBySessionDates(rawBars, startDate, endDate, rawBars)
  if (filtered.length >= minBars) return filtered

  const trimmed = trimBarsForSessionChart(rawBars, startDate, endDate)
  if (trimmed.length >= minBars) return trimmed

  return filtered.length ? filtered : trimmed
}

const LIVE_GOLD_HISTORY_SEC = Math.floor(10 * 365.25 * 86400)

async function fetchLiveMarketSeries(
  symbol: string,
  startDate?: string,
  endDate?: string,
): Promise<ResolvedSeries | null> {
  const { startSec, endSec } = resolveFetchRange(startDate, endDate)
  const sessionStartSec = startDate?.trim() ? parseSessionDateToSec(startDate, 'start') : undefined
  const hasRange = startSec != null && endSec != null && endSec > startSec
  const nowSec = Math.floor(Date.now() / 1000)
  const fromMarket = await fetchMarketBarsSeries(symbol, undefined, {
    interval: '1m',
    ...(hasRange
      ? { startSec, endSec, sessionStartSec: sessionStartSec ?? undefined }
      : { startSec: nowSec - LIVE_GOLD_HISTORY_SEC, endSec: nowSec }),
  })
  if (!fromMarket) return null

  const sessionRange = sessionDateRangeSec(startDate, endDate)
  if (
    hasRange &&
    fromMarket.bars.length &&
    sessionRange.startSec != null &&
    sessionRange.endSec != null
  ) {
    if (!barsOverlapSessionWindow(fromMarket.bars, sessionRange.startSec, sessionRange.endSec)) {
      return null
    }
  }

  const bars = trimBarsForSessionChart(fromMarket.bars, startDate, endDate)
  if (bars.length < 16) return null

  return {
    bars,
    timeframe: fromMarket.timeframe,
    dataSource: fromMarket.dataSource,
  }
}

function syntheticFallbackForSymbol(
  symbol: string,
  count: number,
  seed: number,
  startSec?: number,
): ResolvedSeries {
  const u = symbol.trim().toUpperCase()
  if (isGoldBrowserSymbol(u)) {
    return {
      bars: generateGoldSpotMinuteBars(count, seed, startSec),
      timeframe: '1m',
      dataSource: 'synthetic:gold-demo',
    }
  }
  if (u === 'BTCUSD') {
    return {
      bars: generateBtcUsdDemoMinuteBars(count, seed, startSec),
      timeframe: '1m',
      dataSource: 'synthetic:btc-demo',
    }
  }
  if (u === 'SI' || u === 'XAGUSD') {
    return {
      bars: generateSilverSpotMinuteBars(count, seed, startSec),
      timeframe: '1m',
      dataSource: 'synthetic:silver-demo',
    }
  }
  if (u === 'CL') {
    return {
      bars: generateOilDemoMinuteBars(count, seed, startSec),
      timeframe: '1m',
      dataSource: 'synthetic:oil-demo',
    }
  }
  if (isForexPairSymbol(u)) {
    return {
      bars: generateMockMinuteBars(count, seed, startSec),
      timeframe: '1m',
      dataSource: 'synthetic:forex-demo',
    }
  }
  if (isLikelyUsStockSymbol(u)) {
    return {
      bars: generateMockMinuteBars(count, seed, startSec),
      timeframe: '1m',
      dataSource: 'synthetic:equity-demo',
    }
  }
  return { bars: generateMockMinuteBars(count, seed, startSec), timeframe: '1m', dataSource: 'synthetic:demo' }
}

/**
 * Gold (XAUUSD / GC): `/api/market/bars` first (`1m` intraday by default), then bundled
 * `public/data/xauusd-bars.json` or `xauusd-1h.json`, then synthetic 1m demo bars.
 * Commodities (SI, XAGUSD, CL), crypto, forex, and US stocks: `/api/market/bars` then symbol-shaped demo bars.
 * Other symbols: synthetic 1m mock bars.
 */
export async function resolveSessionBars(
  symbol: string,
  sessionName: string,
  count = DEFAULT_BAR_COUNT,
  opts?: SessionBarsOpts,
): Promise<ResolvedSeries> {
  const u = symbol.trim().toUpperCase()
  const seed = seedFromSymbol(u) + sessionName.length * 17
  const startDate = opts?.startDate
  const endDate = opts?.endDate
  const synth = syntheticParams(startDate, endDate, count)

  if (isGoldBrowserSymbol(u)) {
    const live = await fetchLiveMarketSeries(u, startDate, endDate)
    if (live) return live

    const fromFile = await fetchGoldStaticJson()
    if (fromFile) {
      let bars = await ensurePriorBarInPool(u, fromFile.bars, startDate)
      const sessionRange = sessionDateRangeSec(startDate, endDate)
      if (
        sessionRange.startSec != null &&
        sessionRange.endSec != null &&
        bars.length
      ) {
        if (!barsOverlapSessionWindow(bars, sessionRange.startSec, sessionRange.endSec)) {
          bars = []
        } else {
          bars = trimBarsForSessionChart(bars, startDate, endDate)
        }
      }
      if (bars.length >= 16) return { ...fromFile, bars }
    }

    return syntheticFallbackForSymbol(u, synth.count, seed, synth.startSec)
  }

  if (usesMarketDataSession(u)) {
    const live = await fetchLiveMarketSeries(u, startDate, endDate)
    if (live) return live
    return syntheticFallbackForSymbol(u, synth.count, seed, synth.startSec)
  }

  return {
    bars: generateMockMinuteBars(synth.count, seed, synth.startSec),
    timeframe: '1m',
  }
}
