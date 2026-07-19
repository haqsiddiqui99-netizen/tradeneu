/**
 * Dukascopy tick loader for backtest sessions (used by chart tick/sub-minute intervals).
 */

import { isDukascopyPrimarySymbol } from './dukascopySymbols'
import { fetchMarketTicksSeries, DEFAULT_MAX_CHART_TICKS, type MarketTicksFetchOpts, type MarketTicksSeries } from './marketTickClient'
import type { SessionBarsOpts } from './resolveSessionBars'
import { sessionDateRangeSec } from './sessionDateRange'

export type SessionTicksOpts = SessionBarsOpts & {
  /** Override session date range (unix UTC seconds). */
  startSec?: number
  endSec?: number
  /** Skip in-memory tick cache. */
  noCache?: boolean
  /** Max ticks per HTTP page (default 50k). */
  limit?: number
  /** Client safety cap (default 120k). */
  maxTicks?: number
  /** Progressive callback — chart can paint while ticks stream in. */
  onBatch?: MarketTicksFetchOpts['onBatch']
  signal?: AbortSignal
}

/** True when `/api/market/ticks` can serve this symbol (Dukascopy-mapped FX/metals/crypto). */
export function canLoadDukascopyTicks(symbol: string): boolean {
  return isDukascopyPrimarySymbol(symbol)
}

/** Session modal dates → unix seconds for tick fetch, or null when range is undefined. */
export function sessionTickRangeSec(
  startDate?: string,
  endDate?: string,
): { startSec: number; endSec: number } | null {
  const { startSec, endSec } = sessionDateRangeSec(startDate, endDate)
  if (startSec == null || endSec == null || endSec <= startSec) return null
  return { startSec, endSec }
}

/**
 * Fetch real quote ticks for the session window. Returns null for non-Dukascopy symbols
 * or when session dates do not define a valid range.
 */
function resolveSessionTickFetchRange(
  opts?: SessionTicksOpts,
): { startSec: number; endSec: number } | null {
  if (
    opts?.startSec != null &&
    opts?.endSec != null &&
    Number.isFinite(opts.startSec) &&
    Number.isFinite(opts.endSec) &&
    opts.endSec > opts.startSec
  ) {
    return { startSec: Math.floor(opts.startSec), endSec: Math.floor(opts.endSec) }
  }
  return sessionTickRangeSec(opts?.startDate, opts?.endDate)
}

export async function loadSessionTicks(
  symbol: string,
  opts?: SessionTicksOpts,
): Promise<MarketTicksSeries | null> {
  if (!canLoadDukascopyTicks(symbol)) return null
  const range = resolveSessionTickFetchRange(opts)
  if (!range) return null
  return fetchMarketTicksSeries(symbol, range.startSec, range.endSec, {
    limit: opts?.limit,
    noCache: opts?.noCache,
    fetchAll: true,
    maxTicks: opts?.maxTicks ?? DEFAULT_MAX_CHART_TICKS,
    onBatch: opts?.onBatch,
    signal: opts?.signal,
  })
}
