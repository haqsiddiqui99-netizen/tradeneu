import type { UTCTimestamp } from 'lightweight-charts'
import type { Bar } from '../types'

const r3 = (x: number) => +x.toFixed(3)

/** Bucket OHLCV into fixed-duration bars (e.g. 300 for 5-minute candles). */
export function aggregateOHLCV(bars: Bar[], stepSec: number): Bar[] {
  if (bars.length === 0 || stepSec < 60) return bars
  const map = new Map<number, Bar>()
  for (const b of bars) {
    const t = Number(b.time)
    if (!Number.isFinite(t)) continue
    const k = Math.floor(t / stepSec) * stepSec
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
