import { resolveIntervalPick } from '../views/chartIntervalStore'
import { resolveStrategy } from '../strategy/strategyCatalog'

const LS_DISPLAY_NAME = 'suplexity-user-display-name'
const LS_DEFAULT_INTERVAL = 'suplexity-default-chart-interval'
const LS_DEFAULT_STRATEGY = 'suplexity-default-strategy-id'
const LS_TIMEZONE = 'suplexity-user-timezone'
const LS_DEFAULT_BALANCE = 'suplexity-default-session-balance'
const LS_CONFIRM_CLOSE = 'suplexity-confirm-close-trade'

const LS_AVATAR = 'suplexity-user-avatar'

export const DEFAULT_DISPLAY_NAME = 'Alpha_Trader'
export const DEFAULT_SESSION_BALANCE = 100000
export const MAX_AVATAR_DATA_URL_CHARS = 350_000

export function readUserAvatar(): string | null {
  try {
    const v = localStorage.getItem(LS_AVATAR)?.trim()
    if (v && v.startsWith('data:image/') && v.length <= MAX_AVATAR_DATA_URL_CHARS) return v
  } catch {
    /* noop */
  }
  return null
}

export function writeUserAvatar(dataUrl: string | null): void {
  try {
    if (!dataUrl) {
      localStorage.removeItem(LS_AVATAR)
      return
    }
    if (!dataUrl.startsWith('data:image/') || dataUrl.length > MAX_AVATAR_DATA_URL_CHARS) return
    localStorage.setItem(LS_AVATAR, dataUrl)
  } catch {
    /* noop */
  }
}

export const SETTINGS_TIMEZONE_OPTIONS = [
  { id: 'local', label: 'Browser local time' },
  { id: 'UTC', label: 'UTC' },
  { id: 'America/New_York', label: 'New York (EST/EDT)' },
  { id: 'Europe/London', label: 'London (GMT/BST)' },
  { id: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { id: 'Asia/Dubai', label: 'Dubai (GST)' },
  { id: 'Asia/Kolkata', label: 'India (IST)' },
  { id: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { id: 'Asia/Tokyo', label: 'Tokyo (JST)' },
] as const

/** Common intervals offered in Settings (must exist in interval catalog). */
export const SETTINGS_INTERVAL_OPTIONS = ['1m', '5m', '15m', '30m', '1h', '4h', '1D'] as const

export function readDisplayName(): string {
  try {
    const v = localStorage.getItem(LS_DISPLAY_NAME)?.trim()
    if (v && v.length <= 48) return v
  } catch {
    /* noop */
  }
  return DEFAULT_DISPLAY_NAME
}

export function writeDisplayName(name: string): void {
  const trimmed = name.trim().slice(0, 48)
  try {
    if (trimmed) localStorage.setItem(LS_DISPLAY_NAME, trimmed)
    else localStorage.removeItem(LS_DISPLAY_NAME)
  } catch {
    /* noop */
  }
}

export function readUserTimezone(): string {
  try {
    const v = localStorage.getItem(LS_TIMEZONE)?.trim()
    if (v && SETTINGS_TIMEZONE_OPTIONS.some((z) => z.id === v)) return v
  } catch {
    /* noop */
  }
  return 'local'
}

export function writeUserTimezone(id: string): void {
  const next = SETTINGS_TIMEZONE_OPTIONS.some((z) => z.id === id) ? id : 'local'
  try {
    localStorage.setItem(LS_TIMEZONE, next)
  } catch {
    /* noop */
  }
}

export function readDefaultSessionBalance(): number {
  try {
    const raw = localStorage.getItem(LS_DEFAULT_BALANCE)
    const n = raw ? Number(raw) : NaN
    if (Number.isFinite(n) && n >= 1000 && n <= 10_000_000) return Math.round(n)
  } catch {
    /* noop */
  }
  return DEFAULT_SESSION_BALANCE
}

export function writeDefaultSessionBalance(value: number): void {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n < 1000 || n > 10_000_000) return
  try {
    localStorage.setItem(LS_DEFAULT_BALANCE, String(n))
  } catch {
    /* noop */
  }
}

export function readConfirmCloseTrade(): boolean {
  try {
    const v = localStorage.getItem(LS_CONFIRM_CLOSE)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    /* noop */
  }
  return true
}

export function writeConfirmCloseTrade(on: boolean): void {
  try {
    localStorage.setItem(LS_CONFIRM_CLOSE, on ? '1' : '0')
  } catch {
    /* noop */
  }
}

export function readDefaultChartInterval(): string {
  try {
    const v = localStorage.getItem(LS_DEFAULT_INTERVAL)?.trim()
    if (v && resolveIntervalPick(v)) return v
  } catch {
    /* noop */
  }
  return '1m'
}

export function writeDefaultChartInterval(pill: string): void {
  const p = pill.trim()
  if (!resolveIntervalPick(p)) return
  try {
    localStorage.setItem(LS_DEFAULT_INTERVAL, p)
  } catch {
    /* noop */
  }
}

export function readDefaultStrategyId(): string | null {
  try {
    const v = localStorage.getItem(LS_DEFAULT_STRATEGY)?.trim()
    if (v && resolveStrategy(v)) return v
  } catch {
    /* noop */
  }
  return null
}

export function writeDefaultStrategyId(id: string): void {
  const trimmed = id.trim()
  if (!resolveStrategy(trimmed)) return
  try {
    localStorage.setItem(LS_DEFAULT_STRATEGY, trimmed)
  } catch {
    /* noop */
  }
}
