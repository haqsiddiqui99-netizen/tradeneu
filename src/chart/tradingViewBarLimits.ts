import type { TvBar, TvPeriodParams } from './tradingViewTypes'

/** Hard cap per getBars response — larger payloads freeze TradingView on the main thread. */
export const MAX_TV_BARS_PER_REQUEST = 500

export function tvRequestBarLimit(periodParams: TvPeriodParams): number {
  return Math.min(Math.max(periodParams.countBack || 0, 120), MAX_TV_BARS_PER_REQUEST)
}

/** True when the requested TV window could contain any of the loaded bars. */
export function tvBarsOverlapPeriod(bars: TvBar[], periodParams: TvPeriodParams): boolean {
  if (!bars.length) return false
  const fromMs = periodParams.from * 1000
  const toMs = periodParams.to * 1000
  const pad = 86_400_000
  return bars[bars.length - 1]!.time >= fromMs - pad && bars[0]!.time <= toMs + pad
}

/** Strict overlap — bars must intersect [from, to] (seconds → ms). */
export function tvBarsStrictlyOverlapPeriod(bars: TvBar[], periodParams: TvPeriodParams): boolean {
  if (!bars.length) return false
  const fromMs = periodParams.from * 1000
  const toMs = periodParams.to * 1000
  return bars[bars.length - 1]!.time >= fromMs && bars[0]!.time <= toMs
}

/**
 * When getBars returns empty, TV needs nextTime or it may request the same window forever.
 * Times are unix seconds.
 */
export function tvNextTimeForEmptyRequest(bars: TvBar[], periodParams: TvPeriodParams): number | undefined {
  if (!bars.length) return undefined
  const firstSec = Math.floor(bars[0]!.time / 1000)
  const lastSec = Math.floor(bars[bars.length - 1]!.time / 1000)
  const from = periodParams.from
  const to = periodParams.to

  if (to < firstSec) return firstSec
  if (from > lastSec) return lastSec

  for (const bar of bars) {
    const sec = Math.floor(bar.time / 1000)
    if (sec >= from && sec <= to) return sec
  }
  if (from > lastSec) return lastSec
  if (to < firstSec) return firstSec
  return firstSec
}

/** Trim a bar array to a TV-safe size (no period filter). */
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

/**
 * Return only bars whose timestamps fall inside TV's requested [from, to] window.
 * TradingView rejects out-of-range payloads ("Returned data should be in the requested range").
 */
export function filterTvBarsStrictlyInPeriod(
  bars: TvBar[],
  periodParams: TvPeriodParams,
  preferStart = false,
  anchorIndex = 0,
): TvBar[] {
  if (!bars.length) return []
  if (!tvBarsStrictlyOverlapPeriod(bars, periodParams)) return []

  const fromMs = periodParams.from * 1000
  const toMs = periodParams.to * 1000
  let filtered = bars.filter((b) => b.time >= fromMs && b.time <= toMs + 60_000)
  if (!filtered.length) return []

  const limit = tvRequestBarLimit(periodParams)
  if (limit > 0 && filtered.length > limit) {
    if (preferStart) {
      const anchorSourceIdx = Math.min(Math.max(0, anchorIndex), bars.length - 1)
      const anchorTime = bars[anchorSourceIdx]!.time
      let anchorIdx = filtered.findIndex((b) => b.time === anchorTime)
      if (anchorIdx < 0) anchorIdx = Math.min(filtered.length - 1, anchorSourceIdx)
      const start = Math.max(0, anchorIdx - Math.floor(limit * 0.2))
      filtered = filtered.slice(start, Math.min(filtered.length, start + limit))
    } else {
      filtered = filtered.slice(-limit)
    }
  }
  return filtered
}

/** @deprecated Prefer filterTvBarsStrictlyInPeriod — kept for non-replay market fetches. */
export function filterTvBarsForPeriod(
  bars: TvBar[],
  periodParams: TvPeriodParams,
  preferStart = false,
  anchorIndex = 0,
): TvBar[] {
  return filterTvBarsStrictlyInPeriod(bars, periodParams, preferStart, anchorIndex)
}
