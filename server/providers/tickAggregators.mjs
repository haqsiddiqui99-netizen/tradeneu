/**
 * Reusable tick → OHLCV aggregators for Dukascopy quote ticks.
 * Bars use UTC unix seconds and mid price `(bid + ask) / 2` unless noted.
 */

/** @param {import('../../src/types.ts').QuoteTick} t */
export function quoteTickMid(t) {
  return (Number(t.bid) + Number(t.ask)) / 2
}

/** @param {import('../../src/types.ts').QuoteTick} t */
function tickVolume(t) {
  const bv = Number(t.bidVol)
  const av = Number(t.askVol)
  const b = Number.isFinite(bv) && bv >= 0 ? bv : 0
  const a = Number.isFinite(av) && av >= 0 ? av : 0
  return b + a
}

/** @param {number} px */
function decimalsForPrice(px) {
  return Number(px) >= 100 ? 3 : 5
}

/**
 * @param {import('../../src/types.ts').QuoteTick[]} ticks
 * @returns {import('../../src/types.ts').Bar[]}
 */
export function ticksToBars1m(ticks) {
  return ticksToBarsBySeconds(ticks, 60)
}

/**
 * @param {import('../../src/types.ts').QuoteTick[]} ticks
 * @param {number} stepSec bucket size in seconds (e.g. 1, 5)
 * @returns {import('../../src/types.ts').Bar[]}
 */
export function ticksToBarsBySeconds(ticks, stepSec) {
  if (!Array.isArray(ticks) || ticks.length < 1) return []
  const step = Math.max(1, Math.round(Number(stepSec) || 1))
  const stepMs = step * 1000

  /** @type {Map<number, { open: number; high: number; low: number; close: number; volume: number }>} */
  const buckets = new Map()

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
  const out = []
  for (const bucketMs of keys) {
    const b = buckets.get(bucketMs)
    if (!b) continue
    const dp = decimalsForPrice(b.close)
    const r = (x) => +Number(x).toFixed(dp)
    out.push({
      time: Math.floor(bucketMs / 1000),
      open: r(b.open),
      high: r(b.high),
      low: r(b.low),
      close: r(b.close),
      volume: Math.max(0, Math.round(b.volume)),
    })
  }
  return out
}

/**
 * @param {import('../../src/types.ts').QuoteTick[]} ticks
 * @param {number} tickCount ticks per bar (e.g. 10, 100)
 * @returns {import('../../src/types.ts').Bar[]}
 */
export function ticksToBarsByTickCount(ticks, tickCount) {
  if (!Array.isArray(ticks) || ticks.length < 1) return []
  const n = Math.max(1, Math.round(Number(tickCount) || 1))
  const out = []

  for (let i = 0; i < ticks.length; i += n) {
    const chunk = ticks.slice(i, i + n)
    if (!chunk.length) continue
    let open = null
    let high = -Infinity
    let low = Infinity
    let close = null
    let volume = 0
    let timeMs = Number(chunk[0].timeMs)

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
    const r = (x) => +Number(x).toFixed(dp)
    out.push({
      time: Math.floor(timeMs / 1000),
      open: r(open),
      high: r(high),
      low: r(low),
      close: r(close),
      volume: Math.max(0, Math.round(volume)),
    })
  }

  return out
}
