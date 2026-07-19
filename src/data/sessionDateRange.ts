import type { Bar } from '../types'

/** Browser IANA timezone (e.g. `Asia/Kolkata`) — matches date pickers and LWC chart axis. */
export function browserIanaTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim()
    return tz || 'Etc/UTC'
  } catch {
    return 'Etc/UTC'
  }
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

/** Replay bar-pick pill — UTC to match TradingView time axis. */
export function formatChartPickLabelUtc(sec: number): string {
  const d = new Date(sec * 1000)
  const wk = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]!
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getUTCMonth()
  ]!
  const day = String(d.getUTCDate()).padStart(2, '0')
  const y2 = String(d.getUTCFullYear() % 100).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `Re: ${wk} ${day} ${mon} '${y2} ${hh}:${mm}`
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

/** 1m bars of chart context before session start (3 hours). */
export const SESSION_CHART_LOOKBACK_BARS = 180

export const SESSION_CHART_LOOKBACK_SEC = SESSION_CHART_LOOKBACK_BARS * 60

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

  let session = bars
  if (startSec != null && Number.isFinite(startSec)) {
    session = session.filter((b) => b.time >= startSec)
  }
  if (endSec != null && Number.isFinite(endSec)) {
    session = session.filter((b) => b.time <= endSec)
  }
  if (!session.length) return []

  if (startSec != null && Number.isFinite(startSec)) {
    const firstInPool = pool.findIndex((b) => b.time >= startSec)
    if (firstInPool >= 0) {
      const lookbackFrom = Math.max(0, firstInPool - SESSION_CHART_LOOKBACK_BARS)
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
