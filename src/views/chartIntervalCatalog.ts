export type IntervalKind = 'time' | 'tick'

export type IntervalPick = {
  /** Compact label on the pill (e.g. 1m, 5m, 1h, 1D, 10t). */
  pill: string
  /** Row label inside the menu. */
  label: string
  kind: IntervalKind
  /** Bar length in seconds for time-based bucketing. */
  stepSec?: number
  /** Number of ticks per bar when kind === 'tick'. */
  tickCount?: number
}

export type IntervalSection = {
  id: string
  title: string
  items: IntervalPick[]
}

export const TICK_INTERVALS: IntervalPick[] = [
  { pill: '1t', kind: 'tick', tickCount: 1, label: '1 tick' },
  { pill: '10t', kind: 'tick', tickCount: 10, label: '10 ticks' },
  { pill: '100t', kind: 'tick', tickCount: 100, label: '100 ticks' },
  { pill: '1000t', kind: 'tick', tickCount: 1000, label: '1000 ticks' },
]

export const SECOND_INTERVALS: IntervalPick[] = [
  { pill: '1s', kind: 'time', stepSec: 1, label: '1 second' },
  { pill: '5s', kind: 'time', stepSec: 5, label: '5 seconds' },
  { pill: '10s', kind: 'time', stepSec: 10, label: '10 seconds' },
  { pill: '15s', kind: 'time', stepSec: 15, label: '15 seconds' },
  { pill: '30s', kind: 'time', stepSec: 30, label: '30 seconds' },
  { pill: '45s', kind: 'time', stepSec: 45, label: '45 seconds' },
]

export const MINUTE_INTERVALS: IntervalPick[] = [
  { pill: '1m', kind: 'time', stepSec: 60, label: '1 minute' },
  { pill: '2m', kind: 'time', stepSec: 120, label: '2 minutes' },
  { pill: '3m', kind: 'time', stepSec: 180, label: '3 minutes' },
  { pill: '5m', kind: 'time', stepSec: 300, label: '5 minutes' },
  { pill: '10m', kind: 'time', stepSec: 600, label: '10 minutes' },
  { pill: '15m', kind: 'time', stepSec: 900, label: '15 minutes' },
  { pill: '30m', kind: 'time', stepSec: 1800, label: '30 minutes' },
  { pill: '45m', kind: 'time', stepSec: 2700, label: '45 minutes' },
]

export const HOUR_INTERVALS: IntervalPick[] = [
  { pill: '1h', kind: 'time', stepSec: 3600, label: '1 hour' },
  { pill: '2h', kind: 'time', stepSec: 7200, label: '2 hours' },
  { pill: '3h', kind: 'time', stepSec: 10_800, label: '3 hours' },
  { pill: '4h', kind: 'time', stepSec: 14_400, label: '4 hours' },
]

export const DAY_INTERVALS: IntervalPick[] = [
  { pill: '1D', kind: 'time', stepSec: 86_400, label: '1 day' },
  { pill: '1W', kind: 'time', stepSec: 604_800, label: '1 week' },
  { pill: '1M', kind: 'time', stepSec: 2_592_000, label: '1 month' },
  { pill: '3M', kind: 'time', stepSec: 7_776_000, label: '3 months' },
  { pill: '6M', kind: 'time', stepSec: 15_552_000, label: '6 months' },
  { pill: '12M', kind: 'time', stepSec: 31_536_000, label: '12 months' },
]

export const CHART_INTERVAL_SECTIONS: IntervalSection[] = [
  { id: 'ticks', title: 'TICKS', items: TICK_INTERVALS },
  { id: 'seconds', title: 'SECONDS', items: SECOND_INTERVALS },
  { id: 'minutes', title: 'MINUTES', items: MINUTE_INTERVALS },
  { id: 'hours', title: 'HOURS', items: HOUR_INTERVALS },
  { id: 'days', title: 'DAYS', items: DAY_INTERVALS },
]

/** Flat list for replay dock compact menu. */
export const REPLAY_DOCK_INTERVALS: IntervalPick[] = [
  { pill: '1m', kind: 'time', stepSec: 60, label: '1m' },
  { pill: '2m', kind: 'time', stepSec: 120, label: '2m' },
  { pill: '3m', kind: 'time', stepSec: 180, label: '3m' },
  { pill: '5m', kind: 'time', stepSec: 300, label: '5m' },
  { pill: '10m', kind: 'time', stepSec: 600, label: '10m' },
  { pill: '15m', kind: 'time', stepSec: 900, label: '15m' },
  { pill: '30m', kind: 'time', stepSec: 1800, label: '30m' },
  { pill: '1h', kind: 'time', stepSec: 3600, label: '1h' },
  { pill: '2h', kind: 'time', stepSec: 7200, label: '2h' },
  { pill: '5h', kind: 'time', stepSec: 18_000, label: '5h' },
]

export function findIntervalSectionForPill(pill: string): string | null {
  const p = pill.trim()
  for (const section of CHART_INTERVAL_SECTIONS) {
    if (section.items.some((i) => i.pill === p)) return section.id
  }
  if (/t$/i.test(p)) return 'ticks'
  if (/s$/i.test(p)) return 'seconds'
  if (/m$/i.test(p) && !/M$/.test(p)) return 'minutes'
  if (/h$/i.test(p)) return 'hours'
  if (/D$|W$|M$/.test(p)) return 'days'
  return null
}
