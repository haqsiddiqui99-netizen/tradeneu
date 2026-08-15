import type { Bar } from '../types'
import { readUserTimezone } from '../home/dashboardUserPrefs'

/** Browser IANA timezone (e.g. `Asia/Kolkata`) — matches date pickers and LWC chart axis. */
export function browserIanaTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim()
    return tz || 'Etc/UTC'
  } catch {
    return 'Etc/UTC'
  }
}

/** Map legacy IANA ids to TradingView-supported zones. */
const TV_TIMEZONE_ALIASES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
}

/** IANA timezone for chart display (TV widget + symbol + pick labels). Honors Settings → timezone. */
export function resolveChartTimezone(): string {
  const pref = readUserTimezone()
  let tz: string
  if (pref === 'local') tz = browserIanaTimezone()
  else if (pref === 'UTC') tz = 'Etc/UTC'
  else tz = pref
  return TV_TIMEZONE_ALIASES[tz] ?? tz
}

/** Format unix seconds as local `YYYY-MM-DD` for date inputs. */
export function localYmdFromSec(sec: number): string {
  const d = new Date(sec * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Format unix seconds as local `HH:mm`. */
export function localHmFromSec(sec: number): string {
  const d = new Date(sec * 1000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Local calendar date/time → unix seconds (matches session modal interpretation). */
export function localDatetimeToSec(y: number, m0: number, d: number, hh: number, mm: number): number {
  return Math.floor(new Date(y, m0, d, hh, mm, 0).getTime() / 1000)
}

/** Format unix seconds for chart crosshair / tooltips (local time, matches session dates). */
export function formatChartCrosshairTime(sec: number, withSeconds = false): string {
  const d = new Date(sec * 1000)
  const day = String(d.getDate()).padStart(2, '0')
  const mon = d.toLocaleString(undefined, { month: 'short' })
  const y2 = String(d.getFullYear() % 100).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (withSeconds) {
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${day} ${mon} '${y2} ${hh}:${mm}:${ss}`
  }
  return `${day} ${mon} '${y2} ${hh}:${mm}`
}

/** Human-readable session modal datetime for loading UI (local). */
export function formatSessionModalDate(iso?: string): string {
  const s = iso?.trim()
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Replay bar-pick pill — matches chart axis timezone (session modal / Settings). */
export function formatChartPickLabelUtc(sec: number): string {
  const tz = resolveChartTimezone()
  const d = new Date(sec * 1000)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `Re: ${get('weekday')} ${get('day')} ${get('month')} '${get('year')} ${get('hour')}:${get('minute')}`
}

/** Browser timezone label for chart chrome (e.g. IST, GMT+5:30). */
export function localTimezoneLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date())
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value
    return tz?.trim() || 'local'
  } catch {
    return 'local'
  }
}

/** Parse session modal dates (local `YYYY-MM-DDTHH:mm` or legacy calendar days). */
export function parseSessionDateToSec(iso: string, edge: 'start' | 'end'): number | null {
  const s = iso.trim()
  if (!s) return null
  const dtMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s)
  if (dtMatch) {
    const y = Number(dtMatch[1])
    const m0 = Number(dtMatch[2]) - 1
    const d = Number(dtMatch[3])
    const hh = Number(dtMatch[4])
    const mm = Number(dtMatch[5])
    const ss = edge === 'end' ? 59 : 0
    const t = new Date(y, m0, d, hh, mm, ss).getTime()
    return Number.isFinite(t) ? t / 1000 : null
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const t = Date.parse(s)
    return Number.isFinite(t) ? t / 1000 : null
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    if (!y || !m || !d) return null
    const t =
      edge === 'start'
        ? new Date(y, m - 1, d, 0, 0, 0).getTime()
        : new Date(y, m - 1, d, 23, 59, 59).getTime()
    return Number.isFinite(t) ? t / 1000 : null
  }
  return null
}

export function sessionDateRangeSec(
  startDate?: string,
  endDate?: string,
): { startSec?: number; endSec?: number } {
  const startSec = startDate?.trim() ? parseSessionDateToSec(startDate, 'start') : null
  const endSec = endDate?.trim() ? parseSessionDateToSec(endDate, 'end') : null
  return {
    ...(startSec != null && Number.isFinite(startSec) ? { startSec } : {}),
    ...(endSec != null && Number.isFinite(endSec) ? { endSec } : {}),
  }
}

/** 1-minute bar count for a session span (capped for demo / API hints). */
export function minuteBarCountForRange(startSec: number, endSec: number, cap = 50_000): number {
  const span = Math.max(60, endSec - startSec)
  return Math.min(cap, Math.max(16, Math.ceil(span / 60) + 1))
}

export function hasSessionDateRange(startDate?: string, endDate?: string): boolean {
  const { startSec, endSec } = sessionDateRangeSec(startDate, endDate)
  return startSec != null || endSec != null
}

/** Look back far enough to load the candle immediately before session start (weekend gaps on 1m). */
export const SESSION_FETCH_PRE_ROLL_SEC = 7 * 86_400

/** 1m bars of chart context before session start (24 hours). */
export const SESSION_CHART_LOOKBACK_BARS = 24 * 60

export const SESSION_CHART_LOOKBACK_SEC = SESSION_CHART_LOOKBACK_BARS * 60

/** Default chart lookback for dated sessions (~60 minutes on 1m). */
export const SESSION_CHART_CONTEXT_LOOKBACK_BARS = 60

export const SESSION_CHART_CONTEXT_LOOKBACK_SEC = SESSION_CHART_CONTEXT_LOOKBACK_BARS * 60

/** Context bars before session start — 60 bars for short/medium sessions, 24h for multi-day. */
export function sessionChartLookbackBars(startIso?: string, endIso?: string): number {
  const { startSec, endSec } = sessionDateRangeSec(startIso, endIso)
  if (startSec == null || endSec == null || endSec <= startSec) {
    return SESSION_CHART_CONTEXT_LOOKBACK_BARS
  }
  const span = endSec - startSec
  if (span > 86_400) return SESSION_CHART_LOOKBACK_BARS
  return SESSION_CHART_CONTEXT_LOOKBACK_BARS
}

export function sessionChartLookbackSec(startIso?: string, endIso?: string): number {
  return sessionChartLookbackBars(startIso, endIso) * 60
}

export function sessionFetchStartSec(startSec: number): number {
  return Math.max(0, startSec - SESSION_FETCH_PRE_ROLL_SEC)
}

export function localYmdString(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Map a local date/time pick to a 1-based replay bar index.
 * Midnight picks use the first bar on that calendar day (local time).
 */
export function findReplayBarIndex(
  bars: Bar[],
  y: number,
  m0: number,
  d: number,
  hh: number,
  mm: number,
): { index: number; clamped: boolean } {
  if (bars.length === 0) return { index: 1, clamped: false }

  const targetYmd = localYmdString(y, m0, d)
  const tSec = localDatetimeToSec(y, m0, d, hh, mm)
  const lastT = bars[bars.length - 1]!.time
  const clamped = tSec > lastT

  if (hh === 0 && mm === 0) {
    for (let i = 0; i < bars.length; i++) {
      if (localYmdFromSec(bars[i]!.time) === targetYmd) return { index: i + 1, clamped }
    }
    for (let i = 0; i < bars.length; i++) {
      if (bars[i]!.time >= tSec) return { index: i + 1, clamped: true }
    }
    return { index: bars.length, clamped: true }
  }

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
  if (best < 0) return { index: 1, clamped: tSec < bars[0]!.time }
  return { index: best + 1, clamped }
}

/** Keep session bars plus one prior candle for chart context; drop bars after end. */
export function filterBarsBySessionDates(
  bars: Bar[],
  startIso?: string,
  endIso?: string,
  /** Unfiltered fetch (defaults to `bars`) — used to find the candle before session start. */
  contextPool?: Bar[],
): Bar[] {
  if (!bars.length) return bars
  const s = startIso?.trim()
  const e = endIso?.trim()
  if (!s && !e) return bars

  const startSec = s ? parseSessionDateToSec(s, 'start') : null
  const endSec = e ? parseSessionDateToSec(e, 'end') : null
  const pool = contextPool?.length ? contextPool : bars
  const lookbackBars = sessionChartLookbackBars(s, e)

  let session = bars
  if (startSec != null && Number.isFinite(startSec)) {
    session = session.filter((b) => b.time >= startSec)
  }
  if (endSec != null && Number.isFinite(endSec)) {
    session = session.filter((b) => b.time <= endSec)
  }
  if (!session.length) {
    if (startSec != null && Number.isFinite(startSec)) {
      const prior = pool.filter((b) => b.time < startSec)
      if (prior.length) {
        const lookbackFrom = Math.max(0, prior.length - lookbackBars)
        return prior.slice(lookbackFrom)
      }
    }
    return []
  }

  if (startSec != null && Number.isFinite(startSec)) {
    const firstInPool = pool.findIndex((b) => b.time >= startSec)
    if (firstInPool >= 0) {
      const lookbackFrom = Math.max(0, firstInPool - lookbackBars)
      const prefix = pool.slice(lookbackFrom, firstInPool)
      if (prefix.length) {
        return [...prefix, ...session]
      }
      if (firstInPool > 0) {
        const prior = pool[firstInPool - 1]!
        if (prior.time < session[0]!.time) {
          return [prior, ...session]
        }
      }
    }
  }

  return session
}

/** True when at least one bar falls inside the session start/end window (±1 min slack). */
export function sessionWindowHasBars(
  bars: Bar[],
  startIso?: string,
  endIso?: string,
): boolean {
  if (!bars.length) return false
  const startSec = startIso?.trim() ? parseSessionDateToSec(startIso, 'start') : null
  const endSec = endIso?.trim() ? parseSessionDateToSec(endIso, 'end') : null
  if (startSec == null && endSec == null) return bars.length > 0
  const lo = startSec != null && Number.isFinite(startSec) ? startSec : -Infinity
  const hi = endSec != null && Number.isFinite(endSec) ? endSec : Infinity
  return bars.some((b) => b.time >= lo && b.time <= hi)
}

/** True when the loaded series ends well before wall-clock now (dated historical session). */
export function isHistoricalSessionBars(bars: Bar[]): boolean {
  if (!bars.length) return false
  const lastBarSec = Math.floor(Number(bars[bars.length - 1]!.time))
  const nowSec = Math.floor(Date.now() / 1000)
  return lastBarSec < nowSec - 3600
}

/** 1-based replay index at the first in-session bar (includes the prior context candle in the slice). */
export function sessionStartReplayIndex(bars: Bar[], startIso?: string): number {
  if (!bars.length) return 1
  const s = startIso?.trim()
  if (!s) return bars.length
  const startSec = parseSessionDateToSec(s, 'start')
  if (startSec == null || !Number.isFinite(startSec)) return bars.length
  const firstSession = bars.findIndex((b) => b.time >= startSec)
  if (firstSession < 0) return bars.length
  return Math.min(bars.length, firstSession + 1)
}
