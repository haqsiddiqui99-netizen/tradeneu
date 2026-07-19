/**
 * Build chart bars from synthetic or Dukascopy quote ticks (Sprint 4).
 */

import { syntheticTicksFromMinuteBars } from '../chart/aggregateTicks'
import {
  buildPointBarsFromQuoteTicks,
  buildSyntheticTickBarSeries,
  buildTickBarsFromQuoteTicks,
  type TickBarSeries,
} from '../chart/tickReplayIndex'
import { aggregateTicksToTimeBars } from '../chart/quoteTicks'
import type { Bar, QuoteTick } from '../types'

export type { TickBarSeries } from '../chart/tickReplayIndex'

export type TickChartData =
  | { kind: 'synthetic'; pointBars: Bar[] }
  | { kind: 'dukascopy'; quoteTicks: QuoteTick[]; pointBars?: Bar[] }

export function syntheticTickChartData(
  source1mBars: Bar[],
): Extract<TickChartData, { kind: 'synthetic' }> {
  return { kind: 'synthetic', pointBars: syntheticTicksFromMinuteBars(source1mBars) }
}

export function dukascopyTickChartData(quoteTicks: QuoteTick[]): TickChartData {
  return { kind: 'dukascopy', quoteTicks }
}

export function tickPointBars(data: TickChartData): Bar[] {
  if (data.kind === 'dukascopy') {
    if (!data.pointBars) data.pointBars = buildPointBarsFromQuoteTicks(data.quoteTicks).bars
    return data.pointBars
  }
  return data.pointBars
}

/** Mapped tick bar series for replay/scissors (Sprint 5). */
export function tickBarSeriesForInterval(data: TickChartData, tickCount: number): TickBarSeries | null {
  const n = Math.max(1, Math.round(tickCount) || 1)
  if (data.kind === 'dukascopy') {
    return n === 1
      ? buildPointBarsFromQuoteTicks(data.quoteTicks)
      : buildTickBarsFromQuoteTicks(data.quoteTicks, n)
  }
  if (data.pointBars.length < 2) return null
  return buildSyntheticTickBarSeries(data.pointBars, n)
}

/** Bars for `1t` / `10t` / `100t` interval picks. */
export function barsForTickInterval(data: TickChartData, tickCount: number): Bar[] {
  const series = tickBarSeriesForInterval(data, tickCount)
  return series?.bars ?? []
}

function aggregatePointBarsToStep(bars: Bar[], stepSec: number): Bar[] {
  if (!bars.length) return []
  const step = Math.max(1, Math.round(stepSec))
  const map = new Map<number, Bar>()
  for (const b of bars) {
    const t = Number(b.time)
    if (!Number.isFinite(t)) continue
    const k = Math.floor(t / step) * step
    const ex = map.get(k)
    if (!ex) {
      map.set(k, {
        time: k as Bar['time'],
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      })
    } else {
      map.set(k, {
        time: k as Bar['time'],
        open: ex.open,
        high: Math.max(ex.high, b.high),
        low: Math.min(ex.low, b.low),
        close: b.close,
        volume: ex.volume + b.volume,
      })
    }
  }
  return [...map.keys()]
    .sort((a, b) => a - b)
    .map((k) => map.get(k)!)
}

/** Bars for `1s` / `5s` / … from Dukascopy ticks, local sync, or synthetic point bars. */
export function barsForSubMinuteInterval(data: TickChartData, stepSec: number): Bar[] {
  const step = Math.max(1, Math.round(stepSec))
  if (data.kind === 'dukascopy') return aggregateTicksToTimeBars(data.quoteTicks, step)
  if (data.kind === 'synthetic' && data.pointBars.length >= 2) {
    return aggregatePointBarsToStep(data.pointBars, step)
  }
  return []
}
