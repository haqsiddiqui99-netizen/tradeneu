import { isCommodityMarketSymbol, usesMarketDataSession } from './resolveSessionBars'
import type { MarketDataHealth } from './marketDataHealth'
import { APP_BAR_COVERAGE_FALLBACK_MIN } from './symbolBarCoverage'

export function sessionUsesLiveMarketData(symbols: string[]): boolean {
  return symbols.some((s) => usesMarketDataSession(s.trim().toUpperCase()))
}

export function buildSessionModalHealthMessage(
  health: MarketDataHealth | null,
  symbols: string[],
  isProd: boolean,
): string | null {
  if (!sessionUsesLiveMarketData(symbols)) return null

  const commodity = symbols.some((s) => isCommodityMarketSymbol(s.trim().toUpperCase()))
  const lines: string[] = []

  if (!health?.apiReachable) {
    lines.push(
      isProd
        ? 'Market API is unreachable. Sessions on live symbols may load demo or empty bars until /api/market is deployed on Vercel.'
        : 'Market API is offline. Run npm run dev (historic API on port 3001) for live Twelve Data bars.',
    )
  } else if (health.twelveDataKeyConfigured === false) {
    lines.push(
      isProd
        ? 'TWELVE_DATA_API_KEY is not set on Vercel. Add it under Environment Variables and redeploy.'
        : 'Add TWELVE_DATA_API_KEY to .env.local and restart the dev server for live quotes.',
    )
  }

  if (commodity && health?.twelveDataKeyConfigured !== true) {
    lines.push('Commodities (silver, oil, etc.) need a Twelve Data Grow+ plan when live data is enabled.')
  }

  if (!lines.length) return null
  return lines.join(' ')
}

export function buildCoverageFallbackHint(minIso: string): string | null {
  if (minIso !== APP_BAR_COVERAGE_FALLBACK_MIN) return null
  return 'Using estimated date range — live bar coverage could not be confirmed for the selected symbol(s).'
}
