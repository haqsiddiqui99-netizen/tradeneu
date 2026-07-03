import { resolveIntervalPick } from '../views/chartIntervalStore'
import { resolveStrategy } from '../strategy/strategyCatalog'

const LS_DISPLAY_NAME = 'suplexity-user-display-name'
const LS_DEFAULT_INTERVAL = 'suplexity-default-chart-interval'
const LS_DEFAULT_STRATEGY = 'suplexity-default-strategy-id'

export const DEFAULT_DISPLAY_NAME = 'Alpha_Trader'

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
