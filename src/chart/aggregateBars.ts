import type { UTCTimestamp } from 'lightweight-charts'
import type { Bar } from '../types'

const r3 = (x: number) => +x.toFixed(3)

const DAY_SEC = 86_400
const WEEK_SEC = 7 * DAY_SEC
/** Catalog length of one month (`1M` pill); months are bucketed by calendar, not by this span. */
const MONTH_SEC = 30 * DAY_SEC
const YEAR_SEC = 365 * DAY_SEC
/** 1970-01-01 was a Thursday; weeks open Monday 00:00 UTC like Dukascopy / TradingView FX. */
const MONDAY_OFFSET_SEC = 4 * DAY_SEC

/** Calendar months per bar for month-style steps (1M, 3M, 6M, 12M), else null. */
export function monthsPerBar(stepSec: number): number | null {
  if (stepSec === YEAR_SEC) return 12
  if (stepSec >= MONTH_SEC && stepSec % MONTH_SEC === 0) return stepSec / MONTH_SEC
  return null
}

/** UTC start of the bar that contains `tSec`. */
export function barBucketStartSec(tSec: number, stepSec: number): number {
  const months = monthsPerBar(stepSec)
  if (months != null) {
    const d = new Date(tSec * 1000)
    const idx = d.getUTCFullYear() * 12 + d.getUTCMonth()
    const startIdx = Math.floor(idx / months) * months
    return Date.UTC(Math.floor(startIdx / 12), startIdx % 12, 1) / 1000
  }
  if (stepSec >= WEEK_SEC && stepSec % WEEK_SEC === 0) {
    return Math.floor((tSec - MONDAY_OFFSET_SEC) / stepSec) * stepSec + MONDAY_OFFSET_SEC
  }
  return Math.floor(tSec / stepSec) * stepSec
}

/** Exclusive UTC end of the bar that opens at `startSec`. */
export function barBucketEndSec(startSec: number, stepSec: number): number {
  const months = monthsPerBar(stepSec)
  if (months == null) return startSec + stepSec
  const d = new Date(startSec * 1000)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1) / 1000
}

/** Bucket OHLCV into fixed-duration bars (e.g. 300 for 5-minute candles). */
export function aggregateOHLCV(bars: Bar[], stepSec: number): Bar[] {
  if (bars.length === 0 || stepSec < 60) return bars
  const map = new Map<number, Bar>()
  for (const b of bars) {
    const t = Number(b.time)
    if (!Number.isFinite(t)) continue
    const k = barBucketStartSec(t, stepSec)
    const ex = map.get(k)
    if (!ex) {
      map.set(k, {
        time: k as UTCTimestamp,
        open: r3(b.open),
        high: r3(b.high),
        low: r3(b.low),
        close: r3(b.close),
        volume: b.volume,
      })
    } else {
      map.set(k, {
        time: k as UTCTimestamp,
        open: ex.open,
        high: r3(Math.max(ex.high, b.high)),
        low: r3(Math.min(ex.low, b.low)),
        close: r3(b.close),
        volume: ex.volume + b.volume,
      })
    }
  }
  return [...map.keys()]
    .sort((a, b) => a - b)
    .map((k) => map.get(k)!)
}

/** Alias for callers that pass bar length in seconds (e.g. 300 = 5 minutes). */
export const aggregateBarsBySeconds = aggregateOHLCV
