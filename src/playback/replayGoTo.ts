import type { Bar } from '../types'

/** A recurring daily boundary expressed on a market's own wall clock. */
export type ZonedOpenSpec = {
  timeZone: string
  hour: number
  minute: number
}

/**
 * Session opens on each market's local clock, so the boundary follows that city's
 * DST rules instead of drifting an hour twice a year. Tokyo has no DST, so Asia
 * resolves to a constant 00:00 UTC either way.
 */
export type GoToSessionId = 'asian' | 'london' | 'newyork' | 'sydney'

export type GoToClock = { hour: number; minute: number }

export const FX_SESSION_OPENS: Record<GoToSessionId, ZonedOpenSpec> = {
  asian: { timeZone: 'Asia/Tokyo', hour: 9, minute: 0 },
  london: { timeZone: 'Europe/London', hour: 8, minute: 0 },
  newyork: { timeZone: 'America/New_York', hour: 8, minute: 0 },
  /** 7:00 AEST = 2:30 IST; AEDT shifts the IST clock by one hour. */
  sydney: { timeZone: 'Australia/Sydney', hour: 7, minute: 0 },
}

/** Menu / settings order: Sydney sits under London. */
export const GO_TO_SESSION_ORDER: GoToSessionId[] = ['asian', 'london', 'sydney', 'newyork']

/** Forex daily open — 17:00 America/New_York (5pm ET). */
export const FOREX_DAY_OPEN: ZonedOpenSpec = {
  timeZone: 'America/New_York',
  hour: 17,
  minute: 0,
}

const LS_GOTO_TIMES = 'suplexity-goto-session-times'

export type GoToTimePrefs = {
  sessions: Partial<Record<GoToSessionId, GoToClock>>
  dayOpen?: GoToClock
  /** JS weekday (0 = Sunday) skipped by Next Day Open. */
  skipWeekdays: number[]
}

function clampClock(hour: unknown, minute: unknown): GoToClock | null {
  const h = Number(hour)
  const m = Number(minute)
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null
  return { hour: h, minute: m }
}

export function defaultGoToTimePrefs(): GoToTimePrefs {
  return { sessions: {}, skipWeekdays: [] }
}

export function readGoToTimePrefs(): GoToTimePrefs {
  const out = defaultGoToTimePrefs()
  try {
    const raw = localStorage.getItem(LS_GOTO_TIMES)
    if (!raw) return out
    const parsed = JSON.parse(raw) as Partial<GoToTimePrefs>
    for (const id of GO_TO_SESSION_ORDER) {
      const c = parsed.sessions?.[id]
      const clock = c ? clampClock(c.hour, c.minute) : null
      if (clock) out.sessions[id] = clock
    }
    if (parsed.dayOpen) {
      const clock = clampClock(parsed.dayOpen.hour, parsed.dayOpen.minute)
      if (clock) out.dayOpen = clock
    }
    if (Array.isArray(parsed.skipWeekdays)) {
      out.skipWeekdays = [
        ...new Set(parsed.skipWeekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
      ]
    }
  } catch {
    /* keep defaults */
  }
  return out
}

export function writeGoToTimePrefs(prefs: GoToTimePrefs): void {
  try {
    localStorage.setItem(LS_GOTO_TIMES, JSON.stringify(prefs))
  } catch {
    /* quota / private mode */
  }
}

export function resetGoToTimePrefs(): void {
  try {
    localStorage.removeItem(LS_GOTO_TIMES)
  } catch {
    /* noop */
  }
}

export function resolvedSessionOpen(id: GoToSessionId, prefs = readGoToTimePrefs()): ZonedOpenSpec {
  const base = FX_SESSION_OPENS[id]
  const o = prefs.sessions[id]
  return o ? { ...base, hour: o.hour, minute: o.minute } : { ...base }
}

export function resolvedDayOpen(prefs = readGoToTimePrefs()): ZonedOpenSpec {
  const o = prefs.dayOpen
  return o ? { ...FOREX_DAY_OPEN, hour: o.hour, minute: o.minute } : { ...FOREX_DAY_OPEN }
}

export function hmInputValue(clock: GoToClock): string {
  return `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`
}

export function parseHmInput(value: string): GoToClock | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!m) return null
  return clampClock(Number(m[1]), Number(m[2]))
}

export type ReplayGoToTarget =
  | 'next_day_open'
  | 'next_session'
  | 'asian'
  | 'london'
  | 'newyork'
  | 'sydney'

const zonedFormatters = new Map<string, Intl.DateTimeFormat>()

function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = zonedFormatters.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    zonedFormatters.set(timeZone, fmt)
  }
  return fmt
}

type ZonedYmdHm = { y: number; m: number; d: number; hh: number; mm: number }

function zonedYmdHm(unixSec: number, timeZone: string): ZonedYmdHm {
  const parts = zonedFormatter(timeZone).formatToParts(new Date(unixSec * 1000))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const hh = get('hour')
  return {
    y: get('year'),
    m: get('month'),
    d: get('day'),
    // Some ICU builds render midnight as hour 24 under hour12: false.
    hh: hh === 24 ? 0 : hh,
    mm: get('minute'),
  }
}

/**
 * Map a zone-local wall clock to unix seconds. Binary search beats offset arithmetic
 * because the offset that applies is itself a function of the instant we are solving
 * for. Skipped local times (spring-forward gap) resolve to the first instant after
 * the gap; ambiguous ones (fall-back) resolve to the earlier occurrence.
 */
function zonedLocalToUnixSec(spec: ZonedOpenSpec, y: number, m: number, d: number): number {
  const { timeZone, hour, minute } = spec
  let lo = Date.UTC(y, m - 1, d - 1, 0, 0) / 1000
  let hi = Date.UTC(y, m - 1, d + 1, 23, 59) / 1000
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const p = zonedYmdHm(mid, timeZone)
    const cmp =
      p.y !== y
        ? p.y - y
        : p.m !== m
          ? p.m - m
          : p.d !== d
            ? p.d - d
            : p.hh !== hour
              ? p.hh - hour
              : p.mm - minute
    if (cmp < 0) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Next occurrence of a zone-local daily boundary strictly after `fromSec`. */
export function nextZonedOpenSec(fromSec: number, spec: ZonedOpenSpec): number {
  const start = zonedYmdHm(fromSec, spec.timeZone)
  for (let dayOffset = 0; dayOffset <= 366; dayOffset++) {
    const base = new Date(Date.UTC(start.y, start.m - 1, start.d + dayOffset))
    const boundary = zonedLocalToUnixSec(
      spec,
      base.getUTCFullYear(),
      base.getUTCMonth() + 1,
      base.getUTCDate(),
    )
    if (boundary > fromSec) return boundary
  }
  return fromSec + 86_400
}

function zonedWeekday(unixSec: number, timeZone: string): number {
  const label = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(
    new Date(unixSec * 1000),
  )
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[label.slice(0, 3)] ?? 0
}

/** Next forex day open (5pm ET by default) strictly after `fromSec`. */
export function nextForexDayOpenSec(fromSec: number, prefs = readGoToTimePrefs()): number {
  const spec = resolvedDayOpen(prefs)
  const skip = new Set(prefs.skipWeekdays)
  const start = zonedYmdHm(fromSec, spec.timeZone)
  for (let dayOffset = 0; dayOffset <= 366; dayOffset++) {
    const base = new Date(Date.UTC(start.y, start.m - 1, start.d + dayOffset))
    const boundary = zonedLocalToUnixSec(
      spec,
      base.getUTCFullYear(),
      base.getUTCMonth() + 1,
      base.getUTCDate(),
    )
    if (boundary <= fromSec) continue
    if (skip.size && skip.has(zonedWeekday(boundary, spec.timeZone))) continue
    return boundary
  }
  return fromSec + 86_400
}

/** Smallest upcoming session boundary after `fromSec`. */
export function nextSessionBoundarySec(fromSec: number, prefs = readGoToTimePrefs()): number {
  const candidates = GO_TO_SESSION_ORDER.map((id) =>
    nextZonedOpenSec(fromSec, resolvedSessionOpen(id, prefs)),
  )
  return Math.min(...candidates)
}

export function targetSecForGoTo(fromSec: number, target: ReplayGoToTarget): number {
  const prefs = readGoToTimePrefs()
  switch (target) {
    case 'next_day_open':
      return nextForexDayOpenSec(fromSec, prefs)
    case 'next_session':
      return nextSessionBoundarySec(fromSec, prefs)
    case 'asian':
    case 'london':
    case 'newyork':
    case 'sydney':
      return nextZonedOpenSec(fromSec, resolvedSessionOpen(target, prefs))
  }
}

/** `UTC+5:30` / `UTC-4:00` for a zone at a given instant (DST-aware). */
export function formatUtcOffsetLabel(timeZone: string, unixSec: number): string | null {
  try {
    const raw = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(new Date(unixSec * 1000))
      .find((p) => p.type === 'timeZoneName')?.value
    if (!raw) return null
    const m = raw.replace(/GMT/i, 'UTC').match(/UTC([+-])(\d{1,2})(?::?(\d{2}))?/)
    if (!m) return raw.replace(/^GMT/i, 'UTC')
    return `UTC${m[1]}${Number(m[2])}:${m[3] ?? '00'}`
  } catch {
    return null
  }
}

/** Offset of that market's clock at the jump — only for named session opens. */
export function goToUtcOffsetHint(fromSec: number, target: ReplayGoToTarget): string | null {
  if (target !== 'asian' && target !== 'london' && target !== 'newyork' && target !== 'sydney') return null
  const spec = resolvedSessionOpen(target)
  return formatUtcOffsetLabel(spec.timeZone, targetSecForGoTo(fromSec, target))
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
