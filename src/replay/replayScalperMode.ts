import type { OpenPosition, PositionDirection } from './replayPositions'

export type ScalperDistanceUnit = 'percent' | 'pips'

export type ScalperProtectionSetting = {
  enabled: boolean
  value: number
  unit: ScalperDistanceUnit
}

export type ReplayScalperModePrefs = {
  version: 1
  stopLoss: ScalperProtectionSetting
  takeProfit: ScalperProtectionSetting
  autoBreakEven: boolean
}

const LS_SCALPER_MODE = 'suplexity-replay-scalper-mode-v1'
const LS_ACCOUNT_TIER = 'suplexity-account-tier'

export const DEFAULT_SCALPER_MODE_PREFS: ReplayScalperModePrefs = {
  version: 1,
  stopLoss: { enabled: false, value: 0, unit: 'percent' },
  takeProfit: { enabled: false, value: 0, unit: 'percent' },
  autoBreakEven: false,
}

function normalizeSetting(
  value: unknown,
  fallback: ScalperProtectionSetting,
): ScalperProtectionSetting {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const amount = Number(record.value)
  return {
    enabled: record.enabled === true,
    value: Number.isFinite(amount) && amount >= 0 ? amount : fallback.value,
    unit: record.unit === 'pips' ? 'pips' : 'percent',
  }
}

export function normalizeScalperModePrefs(value: unknown): ReplayScalperModePrefs {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    version: 1,
    stopLoss: normalizeSetting(record.stopLoss, DEFAULT_SCALPER_MODE_PREFS.stopLoss),
    takeProfit: normalizeSetting(record.takeProfit, DEFAULT_SCALPER_MODE_PREFS.takeProfit),
    autoBreakEven: record.autoBreakEven === true,
  }
}

export function readScalperModePrefs(): ReplayScalperModePrefs {
  try {
    const raw = localStorage.getItem(LS_SCALPER_MODE)
    return raw ? normalizeScalperModePrefs(JSON.parse(raw)) : normalizeScalperModePrefs(null)
  } catch {
    return normalizeScalperModePrefs(null)
  }
}

export function writeScalperModePrefs(prefs: ReplayScalperModePrefs): void {
  try {
    localStorage.setItem(LS_SCALPER_MODE, JSON.stringify(normalizeScalperModePrefs(prefs)))
  } catch {
    /* Storage can be unavailable in private/restricted browser contexts. */
  }
}

export function canUseScalperAutoBreakEven(): boolean {
  try {
    return localStorage.getItem(LS_ACCOUNT_TIER) === 'pro'
  } catch {
    return false
  }
}

export function isScalperModeActive(prefs: ReplayScalperModePrefs): boolean {
  return (
    (prefs.stopLoss.enabled && prefs.stopLoss.value > 0) ||
    (prefs.takeProfit.enabled && prefs.takeProfit.value > 0)
  )
}

function distanceFromEntry(entryPrice: number, setting: ScalperProtectionSetting): number {
  if (!setting.enabled || !(setting.value > 0) || !Number.isFinite(entryPrice)) return 0
  return setting.unit === 'pips'
    ? setting.value / 1000
    : entryPrice * (setting.value / 100)
}

function directedPrice(
  entryPrice: number,
  direction: PositionDirection,
  distance: number,
  kind: 'stopLoss' | 'takeProfit',
): number | null {
  if (!(distance > 0)) return null
  const favorable = kind === 'takeProfit'
  const add = direction === 'long' ? favorable : !favorable
  const price = add ? entryPrice + distance : entryPrice - distance
  return Number.isFinite(price) && price > 0 ? price : null
}

export function scalperProtectionPrices(
  entryPrice: number,
  direction: PositionDirection,
  prefs: ReplayScalperModePrefs,
  pipSize = 0.001,
): { stopLoss: number | null; takeProfit: number | null } {
  const stopDistance =
    prefs.stopLoss.unit === 'pips' && prefs.stopLoss.enabled
      ? prefs.stopLoss.value * pipSize
      : distanceFromEntry(entryPrice, prefs.stopLoss)
  const targetDistance =
    prefs.takeProfit.unit === 'pips' && prefs.takeProfit.enabled
      ? prefs.takeProfit.value * pipSize
      : distanceFromEntry(entryPrice, prefs.takeProfit)
  return {
    stopLoss: directedPrice(
      entryPrice,
      direction,
      stopDistance,
      'stopLoss',
    ),
    takeProfit: directedPrice(
      entryPrice,
      direction,
      targetDistance,
      'takeProfit',
    ),
  }
}

export function applyScalperProtection(
  position: Pick<
    OpenPosition,
    'id' | 'entryPrice' | 'direction' | 'stopLoss' | 'takeProfit' | 'pipSize'
  >,
  prefs: ReplayScalperModePrefs,
  account: {
    setStopLoss: (id: string, value: number | null) => void
    setTakeProfit: (id: string, value: number | null) => void
    setAutoBreakEven?: (id: string, enabled: boolean) => void
  },
): boolean {
  const prices = scalperProtectionPrices(
    position.entryPrice,
    position.direction,
    prefs,
    position.pipSize ?? 0.001,
  )
  let changed = false
  if (position.stopLoss == null && prices.stopLoss != null) {
    account.setStopLoss(position.id, prices.stopLoss)
    changed = true
  }
  if (position.takeProfit == null && prices.takeProfit != null) {
    account.setTakeProfit(position.id, prices.takeProfit)
    changed = true
  }
  if (prefs.autoBreakEven && prices.stopLoss != null) {
    account.setAutoBreakEven?.(position.id, true)
    changed = true
  }
  return changed
}
