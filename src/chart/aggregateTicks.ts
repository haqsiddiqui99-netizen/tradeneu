import type { UTCTimestamp } from 'lightweight-charts'
import type { Bar } from '../types'

const r3 = (x: number) => +x.toFixed(5)

/**
 * Expand each 1-minute bar into four synthetic ticks (O → H → L → C) so tick
 * intervals work on replay sessions that only have minute history.
 */
export function syntheticTicksFromMinuteBars(bars: Bar[]): Bar[] {
  const out: Bar[] = []
  for (const b of bars) {
    const t0 = Number(b.time)
    if (!Number.isFinite(t0)) continue
    const volQ = (b.volume ?? 0) / 4
    const seq: Array<{ offset: number; price: number }> = [
      { offset: 0, price: b.open },
      { offset: 15, price: b.high },
      { offset: 30, price: b.low },
      { offset: 45, price: b.close },
    ]
    for (const { offset, price } of seq) {
      const px = r3(price)
      out.push({
        time: (t0 + offset) as UTCTimestamp,
        open: px,
        high: px,
        low: px,
        close: px,
        volume: volQ,
      })
    }
  }
  return out
}

/** Bucket every `tickCount` consecutive tick bars into one OHLCV candle. */
export function aggregateBarsByTicks(bars: Bar[], tickCount: number): Bar[] {
  if (bars.length === 0 || tickCount < 1) return bars
  const out: Bar[] = []
  for (let i = 0; i < bars.length; i += tickCount) {
    const chunk = bars.slice(i, i + tickCount)
    if (chunk.length === 0) continue
    const first = chunk[0]!
    const last = chunk[chunk.length - 1]!
    let high = first.high
    let low = first.low
    let volume = 0
    for (const b of chunk) {
      high = Math.max(high, b.high)
      low = Math.min(low, b.low)
      volume += b.volume ?? 0
    }
    out.push({
      time: first.time,
      open: r3(first.open),
      high: r3(high),
      low: r3(low),
      close: r3(last.close),
      volume,
    })
  }
  return out
}
