import type { Bar } from '../types'
import type { TradeResult } from './BacktestTypes'

/** 1-based bar index for the last bar at or before `tSec`. */
export function barIndexAtOrBeforeTime(bars: Bar[], tSec: number): number {
  if (bars.length === 0) return 1
  let lo = 0
  let hi = bars.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (bars[mid]!.time <= tSec) {
      best = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return best < 0 ? 1 : best + 1
}

/** 0-based trade index whose entry is at or before cursor time, or -1 if none yet. */
export function tradeIndexAtOrBeforeTime(trades: TradeResult[], barTimeSec: number): number {
  if (trades.length === 0) return -1
  let lo = 0
  let hi = trades.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (trades[mid]!.entryTime <= barTimeSec) {
      best = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return best
}
