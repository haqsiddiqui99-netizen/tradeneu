import type { UTCTimestamp } from 'lightweight-charts'

export type Bar = {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** Dukascopy quote tick (bid/ask at millisecond resolution). */
export type QuoteTick = {
  timeMs: number
  bid: number
  ask: number
  bidVol?: number
  askVol?: number
}

/** Server tick series payload metadata. */
export type TickSeries = {
  ticks: QuoteTick[]
  symbol: string
  source: string
  count: number
  nextCursor?: number
  truncated?: boolean
}
