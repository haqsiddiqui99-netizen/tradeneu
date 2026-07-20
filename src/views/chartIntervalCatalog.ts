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
  { pill: '20s', kind: 'time', stepSec: 20, label: '20 seconds' },
  { pill: '30s', kind: 'time', stepSec: 30, label: '30 seconds' },
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

/** Flat list for replay dock compact menu (seconds + common minutes). Fallback when dynamic dock is off. */
export const REPLAY_DOCK_INTERVALS: IntervalPick[] = [
  ...SECOND_INTERVALS.map((i) => ({ ...i, label: i.pill })),
  { pill: '1m', kind: 'time', stepSec: 60, label: '1m' },
  { pill: '3m', kind: 'time', stepSec: 180, label: '3m' },
  { pill: '5m', kind: 'time', stepSec: 300, label: '5m' },
  { pill: '10m', kind: 'time', stepSec: 600, label: '10m' },
]

/**
 * Feature flag — set `false` to restore static `REPLAY_DOCK_INTERVALS` for all charts (easy rollback).
 * Dynamic matrix currently covers chart 1m / 2m / 3m only.
 */
export const USE_DYNAMIC_REPLAY_DOCK_1M_3M = true

/** Seconds shared by the 1m–3m dynamic replay dock. */
const REPLAY_DOCK_SECONDS_1M_3M = ['1s', '5s', '10s', '15s', '30s'] as const

/** Chart-interval → replay dock pills (phase 1: 1m / 2m / 3m only). */
const REPLAY_DOCK_BY_CHART_1M_3M: Record<string, readonly string[]> = {
  '1m': [...REPLAY_DOCK_SECONDS_1M_3M, '1m', '2m', '3m', '5m', '10m'],
  '2m': [...REPLAY_DOCK_SECONDS_1M_3M, '1m', '2m', '3m', '5m', '10m'],
  '3m': [...REPLAY_DOCK_SECONDS_1M_3M, '1m', '2m', '3m', '5m', '10m', '15m'],
}

function replayDockPickFromPill(pill: string): IntervalPick | null {
  const hit = findIntervalPickByPill(pill)
  if (!hit) return null
  return { ...hit, label: hit.pill }
}

/**
 * Replay dock rows for the current TV chart interval.
 * Returns `null` when the static `REPLAY_DOCK_INTERVALS` list should be used.
 */
export function replayDockIntervalsForChart(chartPill: string): IntervalPick[] | null {
  if (!USE_DYNAMIC_REPLAY_DOCK_1M_3M) return null
  const pills = REPLAY_DOCK_BY_CHART_1M_3M[chartPill.trim()]
  if (!pills) return null
  const out: IntervalPick[] = []
  for (const pill of pills) {
    const pick = replayDockPickFromPill(pill)
    if (pick) out.push(pick)
  }
  return out.length ? out : null
}

function findIntervalPickByPill(pill: string): IntervalPick | null {
  const p = pill.trim()
  for (const section of CHART_INTERVAL_SECTIONS) {
    const hit = section.items.find((i) => i.pill === p)
    if (hit) return hit
  }
  return null
}

/** Map a TradingView resolution string to our interval pick (for TV header interval changes). */
export function tvResolutionToIntervalPill(resolution: string): IntervalPick | null {
  const r = resolution.trim()
  const secMatch = /^(\d+)S$/i.exec(r)
  if (secMatch) {
    const pill = `${secMatch[1]}s`
    return (
      findIntervalPickByPill(pill) ?? {
        pill,
        kind: 'time',
        stepSec: Number.parseInt(secMatch[1]!, 10),
        label: `${secMatch[1]} second${secMatch[1] === '1' ? '' : 's'}`,
      }
    )
  }
  if (r === '1D') return findIntervalPickByPill('1D')
  if (r === '1W') return findIntervalPickByPill('1W')
  if (r === '1M') return findIntervalPickByPill('1M')
  const mins = Number.parseInt(r, 10)
  if (Number.isFinite(mins) && mins > 0) {
    return findIntervalPickByPill(`${mins}m`)
  }
  return null
}

/** Bar duration in seconds for replay scissors / TV feed (tick bars use 1s minimum). */
export function intervalPickBarPeriodSec(pick: IntervalPick): number {
  if (pick.kind === 'tick') return 1
  return Math.max(1, pick.stepSec ?? 60)
}

/** True when the chart time axis should show seconds (tick or sub-minute intervals). */
export function intervalPickNeedsSecondsAxis(pick: IntervalPick | null | undefined): boolean {
  if (!pick) return false
  if (pick.kind === 'tick') return true
  return (pick.stepSec ?? 60) < 60
}

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
