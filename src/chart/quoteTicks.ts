/**
 * Client-side quote tick helpers — mirrors `server/providers/tickAggregators.mjs`.
 * Used by tick-interval charts (`1t`, `10t`, `1s`, …) once real ticks replace synthetic bars.
 */

import type { UTCTimestamp } from 'lightweight-charts'
import type { Bar, QuoteTick } from '../types'

export function quoteTickMid(t: QuoteTick): number {
  return (Number(t.bid) + Number(t.ask)) / 2
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

/**
 * One OHLCV bar per quote tick (mid price) for `1t` replay/chart steps.
 * Duplicate unix seconds are bumped forward so Lightweight Charts keeps strict ordering.
 */
export function quoteTicksToPointBars(ticks: QuoteTick[]): Bar[] {
  if (!ticks.length) return []
  const out: Bar[] = []
  let lastSec = -1

  for (const t of ticks) {
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
    out.push({
      time: sec as UTCTimestamp,
      open: px,
      high: px,
      low: px,
      close: px,
      volume: Math.max(0, Math.round(vol)),
    })
  }

  return out
}

/** Bucket ticks into time-based OHLCV bars (e.g. `1s`, `5s`, `1m`). */
export function aggregateTicksToTimeBars(ticks: QuoteTick[], stepSec: number): Bar[] {
  if (!ticks.length) return []
  const step = Math.max(1, Math.round(Number(stepSec) || 1))
  const stepMs = step * 1000

  const buckets = new Map<
    number,
    { open: number; high: number; low: number; close: number; volume: number }
  >()

  for (const t of ticks) {
    const timeMs = Number(t.timeMs)
    if (!Number.isFinite(timeMs)) continue
    const mid = quoteTickMid(t)
    if (!Number.isFinite(mid)) continue
    const bucketMs = Math.floor(timeMs / stepMs) * stepMs
    const vol = tickVolume(t)
    const cur = buckets.get(bucketMs)
    if (!cur) {
      buckets.set(bucketMs, { open: mid, high: mid, low: mid, close: mid, volume: vol })
    } else {
      cur.high = Math.max(cur.high, mid)
      cur.low = Math.min(cur.low, mid)
      cur.close = mid
      cur.volume += vol
    }
  }

  const keys = [...buckets.keys()].sort((a, b) => a - b)
  const out: Bar[] = []
  for (const bucketMs of keys) {
    const b = buckets.get(bucketMs)
    if (!b) continue
    const dp = decimalsForPrice(b.close)
    const r = (x: number) => +Number(x).toFixed(dp)
    out.push({
      time: Math.floor(bucketMs / 1000) as UTCTimestamp,
      open: r(b.open),
      high: r(b.high),
      low: r(b.low),
      close: r(b.close),
      volume: Math.max(0, Math.round(b.volume)),
    })
  }
  return out
}

/** Bucket every `tickCount` consecutive ticks into one OHLCV bar (`10t`, `100t`, …). */
export function aggregateTicksToTickBars(ticks: QuoteTick[], tickCount: number): Bar[] {
  if (!ticks.length) return []
  const n = Math.max(1, Math.round(Number(tickCount) || 1))
  const out: Bar[] = []

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
    out.push({
      time: Math.floor(timeMs / 1000) as UTCTimestamp,
      open: r(open),
      high: r(high),
      low: r(low),
      close: r(close),
      volume: Math.max(0, Math.round(volume)),
    })
  }

  return out
}
