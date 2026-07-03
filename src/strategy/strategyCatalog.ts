import { BUILT_IN_STRATEGIES } from '../backtest/ExampleStrategies'
import type { StrategyDefinition } from '../backtest/BacktestTypes'
import { getCustomStrategy, listCustomStrategies } from './strategyStore'

const BUILT_IN_IDS = new Set(BUILT_IN_STRATEGIES.map((s) => s.id))

export function isBuiltInStrategy(id: string): boolean {
  return BUILT_IN_IDS.has(id)
}

export function isCustomStrategy(id: string): boolean {
  return id.startsWith('custom_')
}

/** Built-in templates first, then user-saved custom strategies (newest first). */
export function listAllStrategies(): StrategyDefinition[] {
  return [...BUILT_IN_STRATEGIES, ...listCustomStrategies()]
}

export function resolveStrategy(id: string): StrategyDefinition | null {
  const builtIn = BUILT_IN_STRATEGIES.find((s) => s.id === id)
  if (builtIn) return builtIn
  return getCustomStrategy(id) ?? null
}

export function strategySelectLabel(s: StrategyDefinition): string {
  return isBuiltInStrategy(s.id) ? s.name : `${s.name} (custom)`
}
