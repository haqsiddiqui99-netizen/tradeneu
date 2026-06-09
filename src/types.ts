import type { UTCTimestamp } from 'lightweight-charts'

export type Bar = {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
  volume: number
}
