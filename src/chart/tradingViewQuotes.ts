import { findAsset, type CatalogAsset } from '../assetCatalog'
import { fetchMarketBarsSeries } from '../data/marketDataClient'
import type { Bar } from '../types'
import type { TvQuoteData } from './tradingViewTypes'

const quoteCache = new Map<string, { at: number; quote: TvQuoteData }>()
const QUOTE_CACHE_MS = 45_000

type QuoteListener = {
  all: string[]
  fast: string[]
  timer: ReturnType<typeof setInterval>
  onData: (quotes: TvQuoteData[]) => void
}

const quoteListeners = new Map<string, QuoteListener>()

function catalogExchange(asset: CatalogAsset): string {
  if (asset.badge?.kind === 'broker') return asset.badge.label
  if (asset.badge?.kind === 'pro') return asset.badge.sub ?? asset.badge.label
  return 'Tradeneu'
}

function quoteValuesFromBars(symbol: string, bars: Bar[]): TvQuoteData['v'] | null {
  if (!bars.length) return null
  const last = bars[bars.length - 1]!
  const prev = bars.length >= 2 ? bars[bars.length - 2]! : null
  const asset = findAsset(symbol)
  const ch = prev ? last.close - prev.close : 0
  const chp = prev && prev.close !== 0 ? (ch / prev.close) * 100 : 0
  const spread = Math.max(0.02, last.close * 0.00004)
  return {
    short_name: symbol,
    description: asset?.name ?? symbol,
    exchange: asset ? catalogExchange(asset) : 'Tradeneu',
    lp: last.close,
    bid: last.close - spread / 2,
    ask: last.close + spread / 2,
    spread,
    open_price: last.open,
    high_price: last.high,
    low_price: last.low,
    ch,
    chp,
  }
}

async function fetchQuoteForSymbol(symbol: string): Promise<TvQuoteData> {
  const key = symbol.trim().toUpperCase()
  const cached = quoteCache.get(key)
  if (cached && Date.now() - cached.at < QUOTE_CACHE_MS) return cached.quote

  try {
    const series = await fetchMarketBarsSeries(key, undefined, {
      interval: '1d',
      range: '5d',
      minBars: 1,
    })
    const values = quoteValuesFromBars(key, series?.bars ?? [])
    if (values) {
      const quote: TvQuoteData = { s: 'ok', n: key, v: values }
      quoteCache.set(key, { at: Date.now(), quote })
      return quote
    }
  } catch {
    /* fall through */
  }

  return { s: 'error', n: key, v: {} }
}

export async function fetchTvQuotes(symbols: string[]): Promise<TvQuoteData[]> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))]
  return Promise.all(unique.map((s) => fetchQuoteForSymbol(s)))
}

export function subscribeTvQuotes(
  symbols: string[],
  fastSymbols: string[],
  onData: (quotes: TvQuoteData[]) => void,
  listenerGuid: string,
): void {
  unsubscribeTvQuotes(listenerGuid)

  const all = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))]
  const fast = [...new Set(fastSymbols.map((s) => s.trim().toUpperCase()).filter(Boolean))]

  const push = () => {
    void fetchTvQuotes(all).then(onData).catch(() => {})
  }

  push()
  const timer = window.setInterval(push, fast.length ? 12_000 : 45_000)
  quoteListeners.set(listenerGuid, { all, fast, timer, onData })
}

export function unsubscribeTvQuotes(listenerGuid: string): void {
  const row = quoteListeners.get(listenerGuid)
  if (!row) return
  clearInterval(row.timer)
  quoteListeners.delete(listenerGuid)
}

export function disposeTvQuoteListeners(): void {
  for (const id of [...quoteListeners.keys()]) unsubscribeTvQuotes(id)
}
