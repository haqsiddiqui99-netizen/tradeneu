import { isCommodityMarketSymbol, isGoldBrowserSymbol, usesMarketDataSession } from './resolveSessionBars'
import type { MarketDataHealth } from './marketDataHealth'

export type FeedMode = 'loading' | 'live' | 'demo' | 'replay' | 'error'

export type FeedBannerKind = 'none' | 'demo' | 'empty-range' | 'api-error'

export type FeedStatus = {
  mode: FeedMode
  pillLabel: string
  pillClass: string
  tooltip: string
  bannerKind: FeedBannerKind
  bannerClass: string
  bannerMessage: string
  showBanner: boolean
}

export type ResolveFeedStatusInput = {
  symbol: string
  dataSource?: string
  barCount?: number
  timeframe?: string
  health: MarketDataHealth | null
  isProd: boolean
  loading?: boolean
  emptyDateRange?: boolean
  loadFailed?: boolean
}

function isSyntheticSource(src?: string): boolean {
  return Boolean(src?.includes('synthetic'))
}

function isTwelveDataLive(src?: string): boolean {
  return Boolean(src && /twelvedata/i.test(src) && !isSyntheticSource(src))
}

function isReplaySource(symbol: string, src?: string): boolean {
  if (isTwelveDataLive(src)) return false
  if (isSyntheticSource(src)) return false
  if (src && /upload:/i.test(src)) return true
  if (isGoldBrowserSymbol(symbol) && !isTwelveDataLive(src) && !isSyntheticSource(src)) {
    return true
  }
  if (!usesMarketDataSession(symbol)) return true
  return false
}

function buildTooltip(
  mode: FeedMode,
  src: string | undefined,
  timeframe: string | undefined,
  barCount: number | undefined,
): string {
  const parts: string[] = []
  if (src) parts.push(src)
  if (timeframe) parts.push(timeframe)
  if (barCount != null && barCount > 0) parts.push(`${barCount} bars`)
  if (parts.length) return parts.join(' · ')
  if (mode === 'loading') return 'Fetching market data…'
  if (mode === 'live') return 'Live Twelve Data feed'
  if (mode === 'demo') return 'Synthetic demo bars'
  if (mode === 'replay') return 'Bundled or replay history'
  return 'Market data status'
}

function buildDemoBannerMessage(opts: {
  isProd: boolean
  health: MarketDataHealth | null
  commodity: boolean
}): string {
  const lines: string[] = ['Live market data unavailable — showing demo bars.']

  if (opts.commodity) {
    lines.push('Silver, oil, and other commodities require a Twelve Data Grow+ plan.')
  }

  if (opts.health && !opts.health.apiReachable) {
    lines.push(
      opts.isProd
        ? 'The market API is unreachable. Confirm Vercel serverless routes are deployed.'
        : 'Start the historic API (npm run dev or npm run server:historic on port 3001).',
    )
  } else if (opts.health && opts.health.twelveDataKeyConfigured === false) {
    lines.push(
      opts.isProd
        ? 'Set TWELVE_DATA_API_KEY in Vercel → Environment Variables, then redeploy.'
        : 'Add TWELVE_DATA_API_KEY to .env.local at the repo root, then restart the dev server.',
    )
  } else if (!opts.commodity) {
    lines.push(
      opts.isProd
        ? 'Verify TWELVE_DATA_API_KEY on Vercel and that your plan includes this symbol.'
        : 'Check TWELVE_DATA_API_KEY and your Twelve Data plan for this symbol.',
    )
  }

  lines.push('Reload after fixing.')
  return lines.join(' ')
}

function buildApiErrorBanner(isProd: boolean): string {
  return isProd
    ? 'Market API unreachable. Check deployment and /api/market/providers, then reload.'
    : 'Market API unreachable. Run npm run dev (or npm run server:historic) and reload.'
}

function classifyMode(input: ResolveFeedStatusInput): FeedMode {
  const { symbol, dataSource, health, loading, loadFailed, emptyDateRange } = input
  const src = dataSource?.trim() || undefined

  if (loading) return 'loading'
  if (loadFailed) return 'error'
  if (health && !health.apiReachable && usesMarketDataSession(symbol) && !isTwelveDataLive(src)) {
    return isSyntheticSource(src) ? 'demo' : 'error'
  }
  if (isTwelveDataLive(src)) return 'live'
  if (isSyntheticSource(src)) return 'demo'
  if (isReplaySource(symbol, src)) return 'replay'
  if (emptyDateRange && usesMarketDataSession(symbol)) return 'demo'
  if (!usesMarketDataSession(symbol)) return 'replay'
  return 'demo'
}

export function resolveFeedStatus(input: ResolveFeedStatusInput): FeedStatus {
  const {
    symbol,
    dataSource,
    barCount,
    timeframe,
    health,
    isProd,
    loading,
    emptyDateRange,
    loadFailed,
  } = input
  const src = dataSource?.trim() || undefined
  const commodity = isCommodityMarketSymbol(symbol)
  const usesMarket = usesMarketDataSession(symbol)
  const mode = classifyMode(input)
  const tooltip = buildTooltip(mode, src, timeframe, barCount)

  if (loading) {
    return {
      mode: 'loading',
      pillLabel: 'Loading…',
      pillClass: 'rw-feed-pill--loading',
      tooltip,
      bannerKind: 'none',
      bannerClass: '',
      bannerMessage: '',
      showBanner: false,
    }
  }

  if (loadFailed) {
    return {
      mode: 'error',
      pillLabel: 'Error',
      pillClass: 'rw-feed-pill--error',
      tooltip: 'Failed to load bars for this symbol',
      bannerKind: 'api-error',
      bannerClass: 'rw-data-banner--error',
      bannerMessage: buildApiErrorBanner(isProd),
      showBanner: usesMarket,
    }
  }

  if (emptyDateRange) {
    const emptyMode = isTwelveDataLive(src) ? 'live' : isSyntheticSource(src) ? 'demo' : 'replay'
    return {
      mode: emptyMode,
      pillLabel: emptyMode === 'live' ? 'Live' : emptyMode === 'demo' ? 'Demo' : 'Replay',
      pillClass: `rw-feed-pill--${emptyMode}`,
      tooltip,
      bannerKind: 'empty-range',
      bannerClass: 'rw-data-banner--warning',
      bannerMessage:
        'No bars in the selected date range. Adjust session start/end dates or pick a symbol with data in that window.',
      showBanner: true,
    }
  }

  if (mode === 'live') {
    return {
      mode: 'live',
      pillLabel: 'Live',
      pillClass: 'rw-feed-pill--live',
      tooltip,
      bannerKind: 'none',
      bannerClass: '',
      bannerMessage: '',
      showBanner: false,
    }
  }

  if (mode === 'replay') {
    return {
      mode: 'replay',
      pillLabel: 'Replay',
      pillClass: 'rw-feed-pill--replay',
      tooltip,
      bannerKind: 'none',
      bannerClass: '',
      bannerMessage: '',
      showBanner: false,
    }
  }

  if (mode === 'error') {
    return {
      mode: 'error',
      pillLabel: 'Error',
      pillClass: 'rw-feed-pill--error',
      tooltip,
      bannerKind: 'api-error',
      bannerClass: 'rw-data-banner--error',
      bannerMessage: buildApiErrorBanner(isProd),
      showBanner: usesMarket,
    }
  }

  // demo
  const showBanner = usesMarket || isSyntheticSource(src)
  return {
    mode: 'demo',
    pillLabel: 'Demo',
    pillClass: 'rw-feed-pill--demo',
    tooltip,
    bannerKind: 'demo',
    bannerClass: 'rw-data-banner--demo',
    bannerMessage: buildDemoBannerMessage({ isProd, health, commodity }),
    showBanner,
  }
}
