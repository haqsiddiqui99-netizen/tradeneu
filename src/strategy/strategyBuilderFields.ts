import type {
  IndicatorKey,
  StrategyCondition,
  StrategyDefinition,
  TargetMode,
  StopMode,
  PositionSizeConfig,
} from '../backtest/BacktestTypes'
import { newCustomStrategyId } from './strategyStore'
import { t, type MessageKey } from '../i18n'

const INDICATOR_SPECS: { value: IndicatorKey; labelKey: MessageKey }[] = [
  { value: 'close', labelKey: 'strategy.fields.ind.close' },
  { value: 'open', labelKey: 'strategy.fields.ind.open' },
  { value: 'high', labelKey: 'strategy.fields.ind.high' },
  { value: 'low', labelKey: 'strategy.fields.ind.low' },
  { value: 'volume', labelKey: 'strategy.fields.ind.volume' },
  { value: 'ema9', labelKey: 'strategy.fields.ind.ema9' },
  { value: 'ema21', labelKey: 'strategy.fields.ind.ema21' },
  { value: 'ema50', labelKey: 'strategy.fields.ind.ema50' },
  { value: 'ema200', labelKey: 'strategy.fields.ind.ema200' },
  { value: 'sma9', labelKey: 'strategy.fields.ind.sma9' },
  { value: 'sma21', labelKey: 'strategy.fields.ind.sma21' },
  { value: 'sma50', labelKey: 'strategy.fields.ind.sma50' },
  { value: 'sma200', labelKey: 'strategy.fields.ind.sma200' },
  { value: 'rsi14', labelKey: 'strategy.fields.ind.rsi14' },
  { value: 'atr14', labelKey: 'strategy.fields.ind.atr14' },
  { value: 'macd_line', labelKey: 'strategy.mb.ind.macdLine' },
  { value: 'macd_signal', labelKey: 'strategy.mb.ind.macdSignal' },
  { value: 'macd_hist', labelKey: 'strategy.mb.ind.macdHist' },
  { value: 'bb_upper', labelKey: 'strategy.mb.ind.bollUpper' },
  { value: 'bb_middle', labelKey: 'strategy.fields.ind.bbMiddle' },
  { value: 'bb_lower', labelKey: 'strategy.mb.ind.bollLower' },
  { value: 'vwap', labelKey: 'strategy.fields.ind.vwap' },
  { value: 'adx14', labelKey: 'strategy.fields.ind.adx14' },
]

const OPERATOR_SPECS: { value: StrategyCondition['op']; labelKey: MessageKey }[] = [
  { value: 'cross_above', labelKey: 'strategy.mb.op.xabove' },
  { value: 'cross_below', labelKey: 'strategy.mb.op.xbelow' },
  { value: '>', labelKey: 'strategy.mb.op.gt' },
  { value: '<', labelKey: 'strategy.mb.op.lt' },
  { value: '>=', labelKey: 'strategy.mb.op.gte' },
  { value: '<=', labelKey: 'strategy.mb.op.lte' },
  { value: 'equals', labelKey: 'strategy.fields.op.equals' },
]

export function getIndicatorOptions(): { value: IndicatorKey; label: string }[] {
  return INDICATOR_SPECS.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))
}

export function getOperatorOptions(): { value: StrategyCondition['op']; label: string }[] {
  return OPERATOR_SPECS.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))
}

export function indicatorLabel(key: IndicatorKey | string): string {
  const spec = INDICATOR_SPECS.find((o) => o.value === key)
  return spec ? t(spec.labelKey) : key
}

export function operatorLabel(op: StrategyCondition['op']): string {
  const spec = OPERATOR_SPECS.find((o) => o.value === op)
  return spec ? t(spec.labelKey) : op
}

export function createBlankStrategy(): StrategyDefinition {
  return {
    id: newCustomStrategyId(),
    name: t('strategy.ui.defaultName'),
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
    name: name ?? t('strategy.ui.copyOfName', { name: source.name }),
  }
}

export function isIndicatorRhs(v: StrategyCondition['rhs']): v is IndicatorKey {
  return typeof v === 'string'
}

export function rhsNeedsIndicatorOnly(op: StrategyCondition['op']): boolean {
  return op === 'cross_above' || op === 'cross_below'
}

export function parseStrategyJson(raw: string): StrategyDefinition {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('strategy.ui.error.invalidJson')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('strategy.ui.error.invalidStrategyJson')
  const s = parsed as StrategyDefinition
  if (!s.name?.trim()) throw new Error('strategy.ui.error.nameRequired')
  if (!Array.isArray(s.entryConditions) || !s.entryConditions.length) {
    throw new Error('strategy.ui.error.entryRequired')
  }
  if (!Array.isArray(s.exitConditions) || !s.exitConditions.length) {
    throw new Error('strategy.ui.error.exitRequired')
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
      return t('strategy.fields.stopPct', { pct: stop.value })
    case 'atr_mult':
      return t('strategy.fields.stopAtr', { mult: stop.value })
    case 'fixed_price':
      return t('strategy.fields.stopPts', { pts: stop.value })
  }
}

export function formatTargetLabel(tp: TargetMode): string {
  switch (tp.type) {
    case 'rr_ratio':
      return t('strategy.fields.targetRr', { ratio: tp.value })
    case 'fixed_pct':
      return t('strategy.fields.targetPct', { pct: tp.value })
    case 'fixed_price':
      return t('strategy.fields.targetPts', { pts: tp.value })
    case 'none':
      return t('strategy.fields.targetSignalOnly')
  }
}

export function formatPositionLabel(ps: PositionSizeConfig): string {
  switch (ps.type) {
    case 'fixed_units':
      return t('strategy.fields.sizeUnits', { units: ps.units })
    case 'fixed_risk':
      return t('strategy.fields.sizeRiskPct', { pct: ps.riskPct })
    case 'pct_equity':
      return t('strategy.fields.sizeEquityPct', { pct: ps.pct })
  }
}
