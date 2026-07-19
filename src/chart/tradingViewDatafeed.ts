import { ASSET_CATALOG, findAsset, catalogMarketDataLabel, type AssetCategory, type CatalogAsset } from '../assetCatalog'
import { fetchMarketBarsSeries } from '../data/marketDataClient'
import type { Bar } from '../types'
import {
  disposeTvQuoteListeners,
  fetchTvQuotes,
  subscribeTvQuotes,
  unsubscribeTvQuotes,
} from './tradingViewQuotes'
import {
  TvReplayFeedController,
  baseTicker,
  isFutureTicker,
} from './tradingViewReplayFeed'
import { providerLabelFromDataSource } from '../data/marketDataSourceLabel'
import type {
  TvBar,
  TvDatafeed,
  TvDatafeedConfiguration,
  TvLibrarySymbolInfo,
  TvPeriodParams,
  TvSearchSymbolResultItem,
} from './tradingViewTypes'

const SUPPORTED_RESOLUTIONS = [
  '1S',
  '5S',
  '10S',
  '15S',
  '20S',
  '30S',
  '1',
  '2',
  '3',
  '5',
  '10',
  '15',
  '30',
  '45',
  '60',
  '120',
  '180',
  '240',
  '1D',
  '1W',
  '1M',
] as const

/** Compare TV resolution strings (`10S`, `10`, `1`, …). */
export function tvResolutionMatches(actual: string | undefined, expected: string): boolean {
  if (!actual?.trim() || !expected?.trim()) return false
  const a = actual.trim().toUpperCase()
  const e = expected.trim().toUpperCase()
  if (a === e) return true
  const secA = /^(\d+)S$/.exec(a)
  const secE = /^(\d+)S$/.exec(e)
  if (secA && secE && secA[1] === secE[1]) return true
  if (secE && a === secE[1]) return true
  if (secA && e === secA[1]) return true
  return false
}

/** Bar duration in seconds for a TradingView resolution string (`'1'` = 1 minute, `'1S'` = 1 second). */
export function tvResolutionPeriodSec(resolution: string): number {
  const r = resolution.trim()
  if (r === '1D' || r === 'D') return 86_400
  if (r === '1W' || r === 'W') return 604_800
  if (r === '1M' || r === 'M') return 2_592_000
  const secMatch = /^(\d+)S$/i.exec(r)
  if (secMatch) {
    const sec = Number.parseInt(secMatch[1]!, 10)
    if (Number.isFinite(sec) && sec > 0) return sec
  }
  const mins = Number.parseInt(r, 10)
  if (Number.isFinite(mins) && mins > 0) return mins * 60
  return 60
}

export function intervalPillToTvResolution(pill: string): string {
  const p = pill.trim()
  if (/t$/i.test(p)) return '1'
  const secMatch = /^(\d+)s$/i.exec(p)
  if (secMatch) return `${secMatch[1]}S`
  if (p === '1m') return '1'
  if (p === '2m') return '2'
  if (p === '3m') return '3'
  if (p === '5m') return '5'
  if (p === '10m') return '10'
  if (p === '15m') return '15'
  if (p === '30m') return '30'
  if (p === '45m') return '45'
  if (p === '1h') return '60'
  if (p === '2h') return '120'
  if (p === '3h') return '180'
  if (p === '4h') return '240'
  if (p === '5h') return '300'
  if (p === '1D') return '1D'
  if (p === '1W') return '1W'
  if (p === '1M') return '1M'
  if (p === '3M') return '1M'
  if (p === '6M') return '1M'
  if (p === '12M') return '1M'
  return '60'
}

function tvResolutionToMarketParams(resolution: string): { interval: string; range: string } {
  const secMatch = /^(\d+)S$/i.exec(resolution.trim())
  if (secMatch) return { interval: `${secMatch[1]}s`, range: '5d' }
  if (resolution === '1D') return { interval: '1d', range: '5y' }
  if (resolution === '1W') return { interval: '1w', range: '10y' }
  if (resolution === '1M') return { interval: '1M', range: 'max' }
  const mins = Number.parseInt(resolution, 10)
  if (Number.isFinite(mins)) {
    if (mins <= 1) return { interval: '1m', range: '5d' }
    if (mins <= 5) return { interval: '5m', range: '1mo' }
    if (mins <= 15) return { interval: '15m', range: '3mo' }
    return { interval: '1h', range: '1y' }
  }
  return { interval: '1h', range: '1y' }
}

function toTvBar(bar: Bar): TvBar {
  return {
    time: Number(bar.time) * 1000,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }
}

function catalogTypeToTv(category: AssetCategory): string {
  if (category === 'stocks') return 'stock'
  if (category === 'forex') return 'forex'
  if (category === 'crypto') return 'crypto'
  if (category === 'indices') return 'index'
  return 'futures'
}

function catalogExchange(asset: CatalogAsset): string {
  if (asset.badge?.kind === 'broker') return asset.badge.label
  if (asset.badge?.kind === 'pro') return asset.badge.sub ?? asset.badge.label
  return catalogMarketDataLabel(asset.symbol)
}

function symbolInfoFor(symbol: string, exchangeOverride?: string): TvLibrarySymbolInfo {
  const s = symbol.trim().toUpperCase()
  const asset = findAsset(s)
  const isGold = /XAU|GOLD/i.test(s)
  const exchange =
    exchangeOverride?.trim() ||
    (asset ? catalogExchange(asset) : catalogMarketDataLabel(s))
  return {
    name: s,
    ticker: s,
    description: asset?.name ?? s,
    type: asset ? catalogTypeToTv(asset.category) : 'stock',
    session: '24x7',
    timezone: 'Etc/UTC',
    exchange,
    minmov: 1,
    pricescale: isGold ? 1000 : 100,
    has_intraday: true,
    has_seconds: true,
    seconds_multipliers: ['1', '5', '10', '15', '20', '30'],
    has_daily: true,
    has_weekly_and_monthly: true,
    supported_resolutions: [...SUPPORTED_RESOLUTIONS],
    volume_precision: 0,
    data_status: 'pulsed',
  }
}

function catalogToSearchItem(asset: CatalogAsset): TvSearchSymbolResultItem {
  return {
    symbol: asset.symbol,
    full_name: asset.symbol,
    description: asset.name,
    exchange: catalogExchange(asset),
    ticker: asset.symbol,
    type: catalogTypeToTv(asset.category),
  }
}

function searchCatalogSymbols(
  userInput: string,
  exchange: string,
  symbolType: string,
): TvSearchSymbolResultItem[] {
  const q = userInput.trim().toLowerCase()
  const ex = exchange.trim()
  const type = symbolType.trim().toLowerCase()

  let rows = ASSET_CATALOG
  if (q) {
    rows = rows.filter(
      (a) =>
        a.symbol.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        catalogExchange(a).toLowerCase().includes(q),
    )
  }
  if (ex) {
    rows = rows.filter((a) => catalogExchange(a) === ex)
  }
  if (type) {
    rows = rows.filter((a) => catalogTypeToTv(a.category) === type)
  }

  return rows
    .slice()
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .slice(0, 30)
    .map(catalogToSearchItem)
}

const READY_CONFIG: TvDatafeedConfiguration = {
  supported_resolutions: [...SUPPORTED_RESOLUTIONS],
  supports_search: true,
  supports_seconds: true,
  supports_marks: false,
  supports_timescale_marks: false,
  supports_time: false,
  exchanges: [
    { value: '', name: 'All exchanges', desc: '' },
    { value: 'Tradeneu', name: 'Tradeneu', desc: 'Tradeneu' },
    { value: 'Dukascopy', name: 'Dukascopy', desc: 'Dukascopy' },
    { value: 'OANDA', name: 'OANDA', desc: 'OANDA' },
    { value: 'Twelve Data', name: 'Twelve Data', desc: 'Twelve Data' },
    { value: 'Pro', name: 'Pro', desc: 'Pro' },
  ],
  symbols_types: [
    { name: 'All types', value: '' },
    { name: 'Stock', value: 'stock' },
    { name: 'Forex', value: 'forex' },
    { name: 'Crypto', value: 'crypto' },
    { name: 'Index', value: 'index' },
    { name: 'Futures', value: 'futures' },
  ],
}

export type TradeneuTvDatafeedOpts = {
  getSymbol: () => string
  sessionStartSec?: () => number | undefined
  sessionEndSec?: () => number | undefined
  onDataSourceResolved?: (dataSource: string) => void
  /** True while app is rebucketing replay bars for a new TV interval. */
  isIntervalSwapInProgress?: () => boolean
}

export type TradeneuTvDatafeedBundle = {
  datafeed: TvDatafeed
  replayFeed: TvReplayFeedController
  setProviderExchangeLabel: (dataSource?: string) => void
  getProviderExchangeLabel: () => string | undefined
}

export function createTradeneuTvDatafeed(opts: TradeneuTvDatafeedOpts): TradeneuTvDatafeedBundle {
  const replayFeed = new TvReplayFeedController()
  let providerExchangeLabel: string | undefined

  const setProviderExchangeLabel = (dataSource?: string) => {
    const label = providerLabelFromDataSource(dataSource)
    providerExchangeLabel = label || undefined
  }

  const datafeed: TvDatafeed = {
    onReady(cb) {
      setTimeout(() => cb(READY_CONFIG), 0)
    },

    searchSymbols(userInput, exchange, symbolType, onResult) {
      setTimeout(() => onResult(searchCatalogSymbols(userInput, exchange, symbolType)), 0)
    },

    resolveSymbol(symbolName, onResolve, onError) {
      const s = symbolName.trim().toUpperCase()
      const base = baseTicker(s)
      if (!base) {
        onError('Invalid symbol')
        return
      }
      setTimeout(() => onResolve(symbolInfoFor(base, providerExchangeLabel)), 0)
    },

    getBars(symbolInfo, resolution, periodParams, onResult, onError) {
      void loadBars(symbolInfo.ticker, resolution, periodParams, opts, replayFeed)
        .then((bars) => {
          if (!bars.length) {
            const swapping = opts.isIntervalSwapInProgress?.() ?? false
            onResult([], { noData: !swapping })
            return
          }
          onResult(bars, { noData: false })
        })
        .catch((err) => {
          onError(err instanceof Error ? err.message : 'Failed to load bars')
        })
    },

    subscribeBars(symbolInfo, _resolution, onTick, listenerGuid, onResetCacheNeededCallback) {
      if (isFutureTicker(symbolInfo.ticker)) return
      replayFeed.setBarListener(listenerGuid, onTick, onResetCacheNeededCallback)
    },

    unsubscribeBars(listenerGuid) {
      replayFeed.removeBarListener(listenerGuid)
    },

    getQuotes(symbols, onData, onError) {
      void fetchTvQuotes(symbols)
        .then(onData)
        .catch((err) => onError(err instanceof Error ? err.message : 'Failed to load quotes'))
    },

    subscribeQuotes(symbols, fastSymbols, onRealtimeCallback, listenerGUID) {
      subscribeTvQuotes(symbols, fastSymbols, onRealtimeCallback, listenerGUID)
    },

    unsubscribeQuotes(listenerGUID) {
      unsubscribeTvQuotes(listenerGUID)
    },
  }

  return {
    datafeed,
    replayFeed,
    setProviderExchangeLabel,
    getProviderExchangeLabel: () => providerExchangeLabel,
  }
}

export function disposeTradeneuTvDatafeed(): void {
  disposeTvQuoteListeners()
}

async function loadBars(
  symbol: string,
  resolution: string,
  periodParams: TvPeriodParams,
  opts: TradeneuTvDatafeedOpts,
  replayFeed: TvReplayFeedController,
): Promise<TvBar[]> {
  if (replayFeed.hasSessionBars()) {
    const feedRes = replayFeed.getResolution()
    if (!tvResolutionMatches(resolution, feedRes)) {
      // During interval swap, defer until feed catches up; otherwise serve feed bars
      // so the chart never stays blank on a resolution string mismatch.
      if (opts.isIntervalSwapInProgress?.()) {
        return []
      }
    }
    return replayFeed.getBarsForRequest(symbol, periodParams)
  }

  const market = tvResolutionToMarketParams(resolution)
  const sessionStart = opts.sessionStartSec?.()
  const sessionEnd = opts.sessionEndSec?.()
  const countBack = Math.max(periodParams.countBack || 0, 16)
  const fetchSymbol = baseTicker(symbol)

  const fetchOpts: Parameters<typeof fetchMarketBarsSeries>[2] = {
    range: market.range,
    interval: market.interval,
    minBars: 1,
    noCache: !periodParams.firstDataRequest,
  }
  if (sessionStart != null && Number.isFinite(sessionStart)) {
    fetchOpts.startSec = sessionStart
  }
  if (sessionEnd != null && Number.isFinite(sessionEnd)) {
    fetchOpts.endSec = sessionEnd
  }

  const series = await fetchMarketBarsSeries(fetchSymbol, undefined, fetchOpts)
  if (!series?.bars?.length) return []

  if (series.dataSource) {
    opts.onDataSourceResolved?.(series.dataSource)
  }

  let bars = series.bars.map(toTvBar).sort((a, b) => a.time - b.time)

  if (periodParams.firstDataRequest) {
    return bars
  }

  const toMs = periodParams.to * 1000
  bars = bars.filter((b) => b.time <= toMs + 60_000)

  const fromMs = periodParams.from * 1000
  const inWindow = bars.filter((b) => b.time >= fromMs)
  if (inWindow.length >= 2) {
    bars = inWindow
  }

  if (countBack > 0 && bars.length > countBack) {
    bars = bars.slice(-countBack)
  }

  return bars
}
