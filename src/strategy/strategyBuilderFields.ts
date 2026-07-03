import type {
  IndicatorKey,
  StrategyCondition,
  StrategyDefinition,
  TargetMode,
  StopMode,
  PositionSizeConfig,
} from '../backtest/BacktestTypes'
import { newCustomStrategyId } from './strategyStore'

export const INDICATOR_OPTIONS: { value: IndicatorKey; label: string }[] = [
  { value: 'close', label: 'Close' },
  { value: 'open', label: 'Open' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'volume', label: 'Volume' },
  { value: 'ema9', label: 'EMA 9' },
  { value: 'ema21', label: 'EMA 21' },
  { value: 'ema50', label: 'EMA 50' },
  { value: 'ema200', label: 'EMA 200' },
  { value: 'sma9', label: 'SMA 9' },
  { value: 'sma21', label: 'SMA 21' },
  { value: 'sma50', label: 'SMA 50' },
  { value: 'sma200', label: 'SMA 200' },
  { value: 'rsi14', label: 'RSI 14' },
  { value: 'atr14', label: 'ATR 14' },
  { value: 'macd_line', label: 'MACD line' },
  { value: 'macd_signal', label: 'MACD signal' },
  { value: 'macd_hist', label: 'MACD histogram' },
  { value: 'bb_upper', label: 'BB upper' },
  { value: 'bb_middle', label: 'BB middle' },
  { value: 'bb_lower', label: 'BB lower' },
  { value: 'vwap', label: 'VWAP' },
  { value: 'adx14', label: 'ADX 14' },
]

export const OPERATOR_OPTIONS: { value: StrategyCondition['op']; label: string }[] = [
  { value: 'cross_above', label: 'crosses above' },
  { value: 'cross_below', label: 'crosses below' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
  { value: 'equals', label: '=' },
]

export function createBlankStrategy(): StrategyDefinition {
  return {
    id: newCustomStrategyId(),
    name: 'My Strategy',
    direction: 'long',
    entryConditions: [{ lhs: 'ema9', op: 'cross_above', rhs: 'ema21' }],
    exitConditions: [{ lhs: 'ema9', op: 'cross_below', rhs: 'ema21' }],
    stopLoss: { type: 'atr_mult', value: 1.5 },
    takeProfit: { type: 'rr_ratio', value: 2 },
    positionSize: { type: 'fixed_risk', riskPct: 1 },
  }
}

export function duplicateStrategy(source: StrategyDefinition, name?: string): StrategyDefinition {
  return {
    ...structuredClone(source),
    id: newCustomStrategyId(),
    name: name ?? `Copy of ${source.name}`,
  }
}

export function isIndicatorRhs(v: StrategyCondition['rhs']): v is IndicatorKey {
  return typeof v === 'string'
}

export function rhsNeedsIndicatorOnly(op: StrategyCondition['op']): boolean {
  return op === 'cross_above' || op === 'cross_below'
}

export function parseStrategyJson(raw: string): StrategyDefinition {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid strategy JSON')
  const s = parsed as StrategyDefinition
  if (!s.name?.trim()) throw new Error('Strategy name is required')
  if (!Array.isArray(s.entryConditions) || !s.entryConditions.length) {
    throw new Error('At least one entry condition is required')
  }
  if (!Array.isArray(s.exitConditions) || !s.exitConditions.length) {
    throw new Error('At least one exit condition is required')
  }
  return {
    ...createBlankStrategy(),
    ...s,
    id: s.id?.startsWith('custom_') ? s.id : newCustomStrategyId(),
  }
}

export function formatStopLabel(stop: StopMode): string {
  switch (stop.type) {
    case 'fixed_pct':
      return `${stop.value}%`
    case 'atr_mult':
      return `${stop.value}× ATR`
    case 'fixed_price':
      return `${stop.value} pts`
  }
}

export function formatTargetLabel(tp: TargetMode): string {
  switch (tp.type) {
    case 'rr_ratio':
      return `${tp.value}:1 R:R`
    case 'fixed_pct':
      return `${tp.value}%`
    case 'fixed_price':
      return `${tp.value} pts`
    case 'none':
      return 'Signal exit only'
  }
}

export function formatPositionLabel(ps: PositionSizeConfig): string {
  switch (ps.type) {
    case 'fixed_units':
      return `${ps.units} units`
    case 'fixed_risk':
      return `${ps.riskPct}% risk`
    case 'pct_equity':
      return `${ps.pct}% equity`
  }
}
