import type { Bar } from '../types'

/** Forex session opens in UTC (hour, minute). */
export const FX_SESSION_OPENS_UTC = {
  asian: [0, 0] as const,
  london: [8, 0] as const,
  newyork: [13, 0] as const,
} as const

export type ReplayGoToTarget =
  | 'next_day_open'
  | 'next_session'
  | 'asian'
  | 'london'
  | 'newyork'

/** Forex daily open — 17:00 America/New_York (5pm ET). */
export const FOREX_DAY_OPEN_HOUR_ET = 17

function nyLocalYmdHm(unixSec: number): { y: number; m: number; d: number; hh: number; mm: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(unixSec * 1000))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour'), mm: get('minute') }
}

/** Map a NY-local wall clock to unix seconds (handles DST). */
function nyLocalToUnixSec(y: number, m: number, d: number, hh: number, mm: number): number {
  let lo = Date.UTC(y, m - 1, d - 1, 0, 0) / 1000
  let hi = Date.UTC(y, m - 1, d + 1, 23, 59) / 1000
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const p = nyLocalYmdHm(mid)
    const cmp =
      p.y !== y ? p.y - y : p.m !== m ? p.m - m : p.d !== d ? p.d - d : p.hh !== hh ? p.hh - hh : p.mm - mm
    if (cmp < 0) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Next UTC calendar moment at or after `fromSec` with the given hour/minute. */
export function nextUtcTimeOnOrAfter(fromSec: number, hourUtc: number, minuteUtc: number): number {
  const d = new Date(fromSec * 1000)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  let t = Date.UTC(y, m, day, hourUtc, minuteUtc, 0) / 1000
  if (t <= fromSec) {
    t = Date.UTC(y, m, day + 1, hourUtc, minuteUtc, 0) / 1000
  }
  return t
}

/** Next forex day open (5pm ET) strictly after `fromSec`. */
export function nextForexDayOpenSec(fromSec: number): number {
  const start = nyLocalYmdHm(fromSec)
  for (let dayOffset = 0; dayOffset <= 366; dayOffset++) {
    const base = new Date(Date.UTC(start.y, start.m - 1, start.d + dayOffset))
    const y = base.getUTCFullYear()
    const m = base.getUTCMonth() + 1
    const d = base.getUTCDate()
    const boundary = nyLocalToUnixSec(y, m, d, FOREX_DAY_OPEN_HOUR_ET, 0)
    if (boundary > fromSec) return boundary
  }
  return fromSec + 86_400
}

/** Smallest upcoming session boundary after `fromSec`. */
export function nextSessionBoundarySec(fromSec: number): number {
  const candidates = (
    Object.values(FX_SESSION_OPENS_UTC) as ReadonlyArray<readonly [number, number]>
  ).map(([h, m]) => nextUtcTimeOnOrAfter(fromSec, h, m))
  return Math.min(...candidates)
}

export function targetSecForGoTo(fromSec: number, target: ReplayGoToTarget): number {
  switch (target) {
    case 'next_day_open':
      return nextForexDayOpenSec(fromSec)
    case 'next_session':
      return nextSessionBoundarySec(fromSec)
    case 'asian':
      return nextUtcTimeOnOrAfter(fromSec, ...FX_SESSION_OPENS_UTC.asian)
    case 'london':
      return nextUtcTimeOnOrAfter(fromSec, ...FX_SESSION_OPENS_UTC.london)
    case 'newyork':
      return nextUtcTimeOnOrAfter(fromSec, ...FX_SESSION_OPENS_UTC.newyork)
  }
}

/** 1-based bar index for the first bar at or after `targetSec`. */
export function barIndexAtOrAfterTime(bars: Bar[], targetSec: number, minIndex = 1): number {
  if (bars.length === 0) return 1
  const start = Math.max(0, minIndex - 1)
  for (let i = start; i < bars.length; i++) {
    if (bars[i]!.time >= targetSec) return i + 1
  }
  return bars.length
}

export function resolveGoToBarIndex(bars: Bar[], cursorSec: number, target: ReplayGoToTarget): number {
  const targetSec = targetSecForGoTo(cursorSec, target)
  return barIndexAtOrAfterTime(bars, targetSec)
}
