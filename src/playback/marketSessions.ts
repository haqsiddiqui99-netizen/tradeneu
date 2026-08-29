import {
  formatUtcOffsetLabel,
  resolvedSessionOpen,
  type GoToSessionId,
} from './replayGoTo'

export type FxSessionChipId = 'sydney' | 'asian' | 'london' | 'newyork'

export type SessionChipStatus = 'open' | 'closed' | 'weekend'
export type TradingVolumeLevel = 'low' | 'medium' | 'high'

/** Header strip order matches the usual Sydney → Tokyo → London → New York board. */
export const HEADER_SESSION_ORDER: FxSessionChipId[] = ['sydney', 'asian', 'london', 'newyork']

export const HEADER_SESSION_LABEL: Record<FxSessionChipId, string> = {
  sydney: 'Sydney',
  asian: 'Tokyo',
  london: 'London',
  newyork: 'New York',
}

export const HEADER_SESSION_FLAG: Record<FxSessionChipId, string> = {
  sydney: 'icons/session-sydney.png',
  asian: 'icons/session-tokyo.png',
  london: 'icons/session-london.png',
  newyork: 'icons/session-newyork.png',
}

/** Bump when the flag PNGs are re-exported — /public assets are served unhashed. */
const FLAG_ASSET_VERSION = '2'

const SESSION_HOURS = 9

const weekdayFmtCache = new Map<string, Intl.DateTimeFormat>()
const clockFmtCache = new Map<string, Intl.DateTimeFormat>()

function weekdayFmt(timeZone: string): Intl.DateTimeFormat {
  let fmt = weekdayFmtCache.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour12: false })
    weekdayFmtCache.set(timeZone, fmt)
  }
  return fmt
}

function clockFmt(timeZone: string): Intl.DateTimeFormat {
  let fmt = clockFmtCache.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    clockFmtCache.set(timeZone, fmt)
  }
  return fmt
}

function zonedWeekday(unixSec: number, timeZone: string): number {
  const label = weekdayFmt(timeZone).format(new Date(unixSec * 1000)).slice(0, 3)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[label] ?? 1
}

function zonedMinutes(unixSec: number, timeZone: string): number {
  const parts = clockFmt(timeZone).formatToParts(new Date(unixSec * 1000))
  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  if (hour === 24) hour = 0
  return hour * 60 + minute
}

/** Forex week: Sunday 17:00 ET through Friday 17:00 ET. */
export function isForexWeekOpenAt(unixSec: number): boolean {
  const wd = zonedWeekday(unixSec, 'America/New_York')
  const mins = zonedMinutes(unixSec, 'America/New_York')
  if (wd === 6) return false
  if (wd === 0) return mins >= 17 * 60
  if (wd === 5) return mins < 17 * 60
  return true
}

function inLocalWindow(mins: number, openMin: number, closeMin: number): boolean {
  if (openMin === closeMin) return true
  if (openMin < closeMin) return mins >= openMin && mins < closeMin
  return mins >= openMin || mins < closeMin
}

export function sessionChipStatus(id: FxSessionChipId, unixSec: number): SessionChipStatus {
  if (!isForexWeekOpenAt(unixSec)) return 'weekend'
  const spec = resolvedSessionOpen(id as GoToSessionId)
  const openMin = spec.hour * 60 + spec.minute
  const closeMin = (openMin + SESSION_HOURS * 60) % (24 * 60)
  const mins = zonedMinutes(unixSec, spec.timeZone)
  return inLocalWindow(mins, openMin, closeMin) ? 'open' : 'closed'
}

export function sessionChipTitle(id: FxSessionChipId, unixSec: number): string {
  const spec = resolvedSessionOpen(id as GoToSessionId)
  const closeTotal = spec.hour * 60 + spec.minute + SESSION_HOURS * 60
  const closeH = String(Math.floor(closeTotal / 60) % 24).padStart(2, '0')
  const closeM = String(closeTotal % 60).padStart(2, '0')
  const open = `${String(spec.hour).padStart(2, '0')}:${String(spec.minute).padStart(2, '0')}`
  const offset = formatUtcOffsetLabel(spec.timeZone, unixSec) ?? ''
  const status = sessionChipStatus(id, unixSec)
  const word = status === 'open' ? 'open' : status === 'weekend' ? 'closed (weekend)' : 'closed'
  return `${HEADER_SESSION_LABEL[id]} session ${word} · ${open}–${closeH}:${closeM} ${offset}`.trim()
}

/**
 * Approximate FX liquidity from the active regional session. London and New
 * York carry the highest volume, Tokyo is medium, and Sydney-only/off-hours
 * are low. The same DST-aware, user-configurable windows drive both displays.
 */
export function tradingVolumeLevel(unixSec: number): TradingVolumeLevel {
  if (!isForexWeekOpenAt(unixSec)) return 'low'
  if (
    sessionChipStatus('london', unixSec) === 'open' ||
    sessionChipStatus('newyork', unixSec) === 'open'
  ) {
    return 'high'
  }
  if (sessionChipStatus('asian', unixSec) === 'open') return 'medium'
  return 'low'
}

export function tradingVolumeTitle(unixSec: number): string {
  const level = tradingVolumeLevel(unixSec)
  if (!isForexWeekOpenAt(unixSec)) return 'Trading volume: Low · Market closed for the weekend'

  const active = HEADER_SESSION_ORDER
    .filter((id) => sessionChipStatus(id, unixSec) === 'open')
    .map((id) => HEADER_SESSION_LABEL[id])
  const detail = active.length ? `${active.join(' + ')} session open` : 'No major session open'
  return `Trading volume: ${level[0].toUpperCase()}${level.slice(1)} · ${detail}`
}

export function sessionHeaderStripHtml(unixSec: number, assetUrl: (pathFromRoot: string) => string): string {
  const volume = tradingVolumeLevel(unixSec)
  const volumeLabel = `${volume[0].toUpperCase()}${volume.slice(1)}`
  const volumeTitle = tradingVolumeTitle(unixSec).replace(/"/g, '&quot;')
  const flags = HEADER_SESSION_ORDER.map((id) => {
    const status = sessionChipStatus(id, unixSec)
    const title = sessionChipTitle(id, unixSec).replace(/"/g, '&quot;')
    const src = `${assetUrl(HEADER_SESSION_FLAG[id])}?v=${FLAG_ASSET_VERSION}`
    return `<span class="rw-tv-session" data-status="${status}" title="${title}"><img class="rw-tv-session__flag" src="${src}" alt="" width="18" height="18" decoding="async" draggable="false"/><span class="rw-tv-session__dot" aria-hidden="true"></span></span>`
  }).join('')
  return `<span class="rw-tv-sessions">${flags}<span class="rw-tv-volume" data-level="${volume}" title="${volumeTitle}"><span class="rw-tv-volume__dot" aria-hidden="true"></span><span class="rw-tv-volume__label">${volumeLabel}</span></span></span>`
}
