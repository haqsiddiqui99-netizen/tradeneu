/**
 * Tick ↔ bar index mapping for Sprint 5 replay/scissors on real quote ticks.
 */

import type { UTCTimestamp } from 'lightweight-charts'
import type { Bar, QuoteTick } from '../types'
import { quoteTickMid } from './quoteTicks'

export type TickBarSeries = {
  bars: Bar[]
  /** First source tick index for each bar (`bars.length` entries). */
  barToFirstTick: number[]
  /** Ticks aggregated per bar (`1` for `1t`, `10` for `10t`, …). */
  ticksPerBar: number
  /** Source ticks used to build `bars` (may be a window slice). */
  quoteTicks: QuoteTick[] | null
}

function tickVolume(t: QuoteTick): number {
  const bv = Number(t.bidVol)
  const av = Number(t.askVol)
  const b = Number.isFinite(bv) && bv >= 0 ? bv : 0
  const a = Number.isFinite(av) && av >= 0 ? av : 0
  return b + a
}

function decimalsForPrice(px: number): number {
  return Number(px) >= 100 ? 3 : 5
}

/** Build 1t point bars with stable tick index mapping (handles bumped bar times). */
export function buildPointBarsFromQuoteTicks(ticks: QuoteTick[]): TickBarSeries {
  const bars: Bar[] = []
  const barToFirstTick: number[] = []
  let lastSec = -1

  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i]!
    const timeMs = Number(t.timeMs)
    if (!Number.isFinite(timeMs)) continue
    const mid = quoteTickMid(t)
    if (!Number.isFinite(mid)) continue
    const dp = decimalsForPrice(mid)
    const r = (x: number) => +Number(x).toFixed(dp)
    const px = r(mid)
    let sec = Math.floor(timeMs / 1000)
    if (sec <= lastSec) sec = lastSec + 1
    lastSec = sec
    const vol = tickVolume(t)
    barToFirstTick.push(i)
    bars.push({
      time: sec as UTCTimestamp,
      open: px,
      high: px,
      low: px,
      close: px,
      volume: Math.max(0, Math.round(vol)),
    })
  }

  return { bars, barToFirstTick, ticksPerBar: 1, quoteTicks: ticks }
}

/** Build N-tick OHLCV bars with mapping to the first tick in each bucket. */
export function buildTickBarsFromQuoteTicks(ticks: QuoteTick[], tickCount: number): TickBarSeries {
  const n = Math.max(1, Math.round(Number(tickCount) || 1))
  if (n === 1) return buildPointBarsFromQuoteTicks(ticks)

  const bars: Bar[] = []
  const barToFirstTick: number[] = []

  for (let i = 0; i < ticks.length; i += n) {
    const chunk = ticks.slice(i, i + n)
    if (!chunk.length) continue
    let open: number | null = null
    let high = -Infinity
    let low = Infinity
    let close: number | null = null
    let volume = 0
    let timeMs = Number(chunk[0]!.timeMs)

    for (const t of chunk) {
      const mid = quoteTickMid(t)
      if (!Number.isFinite(mid)) continue
      if (open == null) open = mid
      high = Math.max(high, mid)
      low = Math.min(low, mid)
      close = mid
      volume += tickVolume(t)
      const tm = Number(t.timeMs)
      if (Number.isFinite(tm)) timeMs = tm
    }

    if (open == null || close == null || !Number.isFinite(high) || !Number.isFinite(low)) continue
    const dp = decimalsForPrice(close)
    const r = (x: number) => +Number(x).toFixed(dp)
    barToFirstTick.push(i)
    bars.push({
      time: Math.floor(timeMs / 1000) as UTCTimestamp,
      open: r(open),
      high: r(high),
      low: r(low),
      close: r(close),
      volume: Math.max(0, Math.round(volume)),
    })
  }

  return { bars, barToFirstTick, ticksPerBar: n, quoteTicks: ticks }
}

/** Synthetic tick bars: bar index equals tick index (no quote metadata). */
export function buildSyntheticTickBarSeries(pointBars: Bar[], ticksPerBar: number): TickBarSeries {
  const n = Math.max(1, Math.round(ticksPerBar) || 1)
  if (n === 1) {
    return {
      bars: pointBars,
      barToFirstTick: pointBars.map((_, i) => i),
      ticksPerBar: 1,
      quoteTicks: null,
    }
  }
  const bars: Bar[] = []
  const barToFirstTick: number[] = []
  for (let i = 0; i < pointBars.length; i += n) {
    const chunk = pointBars.slice(i, i + n)
    if (!chunk.length) continue
    let open = chunk[0]!.open
    let high = -Infinity
    let low = Infinity
    let close = chunk[chunk.length - 1]!.close
    let volume = 0
    for (const b of chunk) {
      high = Math.max(high, b.high)
      low = Math.min(low, b.low)
      volume += b.volume
    }
    barToFirstTick.push(i)
    bars.push({
      time: chunk[chunk.length - 1]!.time,
      open,
      high,
      low,
      close,
      volume,
    })
  }
  return { bars, barToFirstTick, ticksPerBar: n, quoteTicks: null }
}

export function quoteTickAtBar(series: TickBarSeries, barIndex: number): QuoteTick | null {
  const ticks = series.quoteTicks
  if (!ticks?.length) return null
  const bi = Math.max(0, Math.min(series.bars.length - 1, Math.round(barIndex)))
  const ti = series.barToFirstTick[bi]
  if (ti == null || ti < 0 || ti >= ticks.length) return null
  return ticks[ti] ?? null
}

export function tickTimeMsAtBar(series: TickBarSeries, barIndex: number): number | null {
  const tick = quoteTickAtBar(series, barIndex)
  if (tick) return Number(tick.timeMs)
  const bar = series.bars[Math.max(0, Math.min(series.bars.length - 1, Math.round(barIndex)))]
  return bar ? Number(bar.time) * 1000 : null
}

/**
 * OHLC of ticks from the start of the current minute through `upToBarIndex` (0-based inclusive).
 * Used so TV 1m candles visibly update during tick replay.
 */
export function formingMinuteOhlcFromTicks(
  series: TickBarSeries,
  upToBarIndex: number,
): { minuteSec: number; open: number; high: number; low: number; close: number; volume: number } | null {
  if (!series.bars.length) return null
  const end = Math.max(0, Math.min(series.bars.length - 1, Math.round(upToBarIndex)))
  const endMs = tickTimeMsAtBar(series, end)
  if (endMs == null) return null
  const minuteSec = Math.floor(endMs / 1000 / 60) * 60
  const minuteStartMs = minuteSec * 1000

  let open: number | null = null
  let high = -Infinity
  let low = Infinity
  let close: number | null = null
  let volume = 0

  for (let i = 0; i <= end; i++) {
    const ms = tickTimeMsAtBar(series, i)
    if (ms == null || ms < minuteStartMs) continue
    const bar = series.bars[i]!
    if (open == null) open = bar.open
    high = Math.max(high, bar.high)
    low = Math.min(low, bar.low)
    close = bar.close
    volume += bar.volume
  }

  if (open == null || close == null || !Number.isFinite(high) || !Number.isFinite(low)) return null
  return { minuteSec, open, high, low, close, volume: Math.max(0, Math.round(volume)) }
}

export function barIndexForTickTimeMs(series: TickBarSeries, timeMs: number): number {
  const ticks = series.quoteTicks
  if (ticks?.length) {
    let lo = 0
    let hi = ticks.length - 1
    let best = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (Number(ticks[mid]!.timeMs) <= timeMs) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    for (let bi = 0; bi < series.barToFirstTick.length; bi++) {
      const start = series.barToFirstTick[bi]!
      const nextStart =
        bi < series.barToFirstTick.length - 1
          ? series.barToFirstTick[bi + 1]!
          : ticks.length
      if (best >= start && best < nextStart) return bi
    }
    return Math.max(0, Math.min(series.bars.length - 1, series.barToFirstTick.length - 1))
  }
  const sec = Math.floor(timeMs / 1000)
  let lo = 0
  let hi = series.bars.length - 1
  let best = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (Number(series.bars[mid]!.time) <= sec) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

/** 1-based replay index for a wall-clock pick (local session modal time). */
export function replayIndexForPickTime(
  series: TickBarSeries,
  y: number,
  m0: number,
  d: number,
  hh: number,
  mm: number,
  ss = 0,
): { index: number; clamped: boolean } {
  if (!series.bars.length) return { index: 1, clamped: false }
  const tSec = Math.floor(new Date(y, m0, d, hh, mm, ss, 0).getTime() / 1000)
  const lastBar = series.bars[series.bars.length - 1]!
  const lastMs = tickTimeMsAtBar(series, series.bars.length - 1) ?? Number(lastBar.time) * 1000
  const targetMs = tSec * 1000
  const clamped = targetMs > lastMs
  const barIdx = barIndexForTickTimeMs(series, targetMs)
  return { index: barIdx + 1, clamped }
}

export function formatQuoteTickPickLabelLocal(timeMs: number): string {
  const d = new Date(timeMs)
  const wk = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]!
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ]!
  const day = String(d.getDate()).padStart(2, '0')
  const y2 = String(d.getFullYear() % 100).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `Re: ${wk} ${day} ${mon} '${y2} ${hh}:${mm}:${ss}.${ms}`
}

export function formatQuoteTickPickLabelUtc(timeMs: number): string {
  const d = new Date(timeMs)
  const wk = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]!
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getUTCMonth()
  ]!
  const day = String(d.getUTCDate()).padStart(2, '0')
  const y2 = String(d.getUTCFullYear() % 100).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  const ms = String(d.getUTCMilliseconds()).padStart(3, '0')
  return `Re: ${wk} ${day} ${mon} '${y2} ${hh}:${mm}:${ss}.${ms}`
}

/** Trim mapped series after `capBarsAroundTime` shortens the bar array. */
export function alignTickBarSeries(series: TickBarSeries, bars: Bar[]): TickBarSeries {
  if (!bars.length) {
    return { bars: [], barToFirstTick: [], ticksPerBar: series.ticksPerBar, quoteTicks: series.quoteTicks }
  }
  if (series.bars.length === bars.length && series.bars[0]?.time === bars[0]?.time) return series
  const start = barIndexForTickTimeMs(series, Number(bars[0]!.time) * 1000)
  const end = Math.min(series.bars.length, start + bars.length)
  return {
    bars,
    barToFirstTick: series.barToFirstTick.slice(start, end),
    ticksPerBar: series.ticksPerBar,
    quoteTicks: series.quoteTicks,
  }
}

/**
 * TradingView at resolution `'1'` only keeps one bar per minute.
 * Flooring all ticks to calendar minutes collapses them — use sequential
 * minute slots instead so every tick bar stays visible.
 */
export function remapBarsForTvMinuteSlots(bars: Bar[]): Bar[] {
  if (bars.length < 2) return bars
  const lastSec = Number(bars[bars.length - 1]!.time)
  const n = bars.length
  return bars.map((b, i) => ({
    ...b,
    time: (lastSec - (n - 1 - i) * 60) as Bar['time'],
  }))
}

/** Prepend 1m history before a tick window so 1m→1t keeps past candles on chart. */
export function merge1mLeadInBars(
  history1m: Bar[],
  tickBars: Bar[],
): { bars: Bar[]; leadInCount: number } {
  if (!tickBars.length) {
    return { bars: history1m.length ? history1m.slice() : tickBars, leadInCount: history1m.length }
  }
  if (!history1m.length) return { bars: tickBars.slice(), leadInCount: 0 }
  const tickStartSec = Number(tickBars[0]!.time)
  const history = history1m.filter((b) => Number(b.time) < tickStartSec)
  if (!history.length) return { bars: tickBars.slice(), leadInCount: 0 }
  return { bars: [...history, ...tickBars], leadInCount: history.length }
}

/**
 * TV series: keep 1m lead-in at real wall times, then place tick bars in
 * unique sequential minute slots after the last lead-in candle so past history
 * stays visible and ticks don't collapse onto the same minute.
 */
export function tvBarsWith1mLeadIn(bars: Bar[], leadInCount: number): Bar[] {
  if (leadInCount <= 0) return remapBarsForTvMinuteSlots(bars)
  if (leadInCount >= bars.length) return bars.slice()
  const lead = bars.slice(0, leadInCount)
  const ticks = bars.slice(leadInCount)
  const lastLeadSec = Number(lead[lead.length - 1]!.time)
  const remappedTicks = ticks.map((b, i) => ({
    ...b,
    time: (lastLeadSec + (i + 1) * 60) as Bar['time'],
  }))
  return [...lead, ...remappedTicks]
}

/** Merge tick pages by `timeMs` (stable sort). */
export function mergeQuoteTicksByTime(existing: QuoteTick[], incoming: QuoteTick[]): QuoteTick[] {
  if (!incoming.length) return existing
  if (!existing.length) return incoming.slice()
  const map = new Map<number, QuoteTick>()
  for (const t of existing) map.set(Number(t.timeMs), t)
  for (const t of incoming) map.set(Number(t.timeMs), t)
  return [...map.values()].sort((a, b) => Number(a.timeMs) - Number(b.timeMs))
}
