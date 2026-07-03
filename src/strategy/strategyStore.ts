import type { StrategyDefinition } from '../backtest/BacktestTypes'

const LS_CUSTOM_STRATEGIES = 'suplexity-custom-strategies-v1'

function readRaw(): StrategyDefinition[] {
  try {
    const raw = localStorage.getItem(LS_CUSTOM_STRATEGIES)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidStrategy)
  } catch {
    return []
  }
}

function writeRaw(strategies: StrategyDefinition[]): void {
  try {
    localStorage.setItem(LS_CUSTOM_STRATEGIES, JSON.stringify(strategies))
  } catch {
    /* quota / private mode */
  }
}

function isValidStrategy(v: unknown): v is StrategyDefinition {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<StrategyDefinition>
  return (
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    (s.direction === 'long' || s.direction === 'short' || s.direction === 'both') &&
    Array.isArray(s.entryConditions) &&
    Array.isArray(s.exitConditions) &&
    !!s.stopLoss &&
    !!s.takeProfit &&
    !!s.positionSize
  )
}

export function newCustomStrategyId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `custom_${crypto.randomUUID()}`
  }
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function listCustomStrategies(): StrategyDefinition[] {
  return readRaw()
}

export function getCustomStrategy(id: string): StrategyDefinition | null {
  return readRaw().find((s) => s.id === id) ?? null
}

export function saveCustomStrategy(strategy: StrategyDefinition): StrategyDefinition {
  const sessions = readRaw()
  const idx = sessions.findIndex((s) => s.id === strategy.id)
  const next = { ...strategy, id: strategy.id || newCustomStrategyId() }
  if (idx >= 0) sessions[idx] = next
  else sessions.unshift(next)
  writeRaw(sessions)
  return next
}

export function deleteCustomStrategy(id: string): boolean {
  const prev = readRaw()
  const next = prev.filter((s) => s.id !== id)
  if (next.length === prev.length) return false
  writeRaw(next)
  return true
}
