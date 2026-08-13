import type { TvBar, TvPeriodParams } from './tradingViewTypes'

/** Hard cap per getBars response — larger payloads freeze TradingView on the main thread. */
export const MAX_TV_BARS_PER_REQUEST = 500

export function tvRequestBarLimit(periodParams: TvPeriodParams): number {
  return Math.min(Math.max(periodParams.countBack || 0, 120), MAX_TV_BARS_PER_REQUEST)
}

/** True when the requested TV window could contain any of the loaded bars. */
export function tvBarsOverlapPeriod(bars: TvBar[], periodParams: TvPeriodParams): boolean {
  if (!bars.length) return false
  if (periodParams.firstDataRequest) return true
  const fromMs = periodParams.from * 1000
  const toMs = periodParams.to * 1000
  const pad = 86_400_000
  return bars[bars.length - 1]!.time >= fromMs - pad && bars[0]!.time <= toMs + pad
}

/** Strict overlap — no padding. Used to stop TV from spinning on mismatched windows. */
export function tvBarsStrictlyOverlapPeriod(bars: TvBar[], periodParams: TvPeriodParams): boolean {
  if (!bars.length) return false
  if (periodParams.firstDataRequest) return true
  const fromMs = periodParams.from * 1000
  const toMs = periodParams.to * 1000
  return bars[bars.length - 1]!.time >= fromMs && bars[0]!.time <= toMs
}

/**
 * When getBars returns empty, TV needs nextTime or it may request the same window forever
 * ("Page Unresponsive" on past sessions that end well before wall-clock now).
 */
export function tvNextTimeForEmptyRequest(bars: TvBar[], periodParams: TvPeriodParams): number | undefined {
  if (!bars.length) return undefined
  const firstSec = Math.floor(bars[0]!.time / 1000)
  const lastSec = Math.floor(bars[bars.length - 1]!.time / 1000)
  const from = periodParams.from
  const to = periodParams.to

  if (to < firstSec) return firstSec
  if (from > lastSec) return firstSec

  for (const bar of bars) {
    const sec = Math.floor(bar.time / 1000)
    if (sec >= from) return sec
  }
  return firstSec
}

/** Trim a bar array to a TV-safe size for the requested period. */
export function capTvBarsForRequest(
  bars: TvBar[],
  periodParams: TvPeriodParams,
  preferStart = false,
  anchorIndex = 0,
): TvBar[] {
  if (!bars.length) return []
  const limit = tvRequestBarLimit(periodParams)
  if (bars.length <= limit) return bars
  if (preferStart) {
    const anchor = Math.min(Math.max(0, anchorIndex), bars.length - 1)
    const start = Math.max(0, anchor - Math.floor(limit * 0.2))
    return bars.slice(start, Math.min(bars.length, start + limit))
  }
  return bars.slice(-limit)
}

export function filterTvBarsForPeriod(
  bars: TvBar[],
  periodParams: TvPeriodParams,
  preferStart = false,
  anchorIndex = 0,
): TvBar[] {
  if (!bars.length) return []
  if (periodParams.firstDataRequest) {
    return capTvBarsForRequest(bars, periodParams, preferStart, anchorIndex)
  }

  const toMs = periodParams.to * 1000
  let filtered = bars.filter((b) => b.time <= toMs + 60_000)
  const fromMs = periodParams.from * 1000
  const inWindow = filtered.filter((b) => b.time >= fromMs)
  if (inWindow.length >= 2) filtered = inWindow

  const limit = tvRequestBarLimit(periodParams)
  if (limit > 0 && filtered.length > limit) {
    if (preferStart) {
      const anchor = Math.min(Math.max(0, anchorIndex), filtered.length - 1)
      const start = Math.max(0, anchor - Math.floor(limit * 0.2))
      filtered = filtered.slice(start, Math.min(filtered.length, start + limit))
    } else {
      filtered = filtered.slice(-limit)
    }
  }
  if (!filtered.length) {
    return capTvBarsForRequest(bars, periodParams, preferStart, anchorIndex)
  }
  return filtered
}
