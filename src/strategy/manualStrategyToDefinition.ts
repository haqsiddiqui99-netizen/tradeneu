/**
 * src/strategy/manualStrategyToDefinition.ts
 *
 * Best-effort converter from the manual strategy builder's own rule model
 * (`manualStrategyBuilder.ts`'s `Strategy`, matched here structurally via
 * `ManualStrategyLike` from `manualStrategyEngine.ts`) into a
 * `StrategyDefinition` (`BacktestTypes.ts`) — the shape the chart page's
 * `BacktestEngine.ts` understands.
 *
 * This is inherently lossy: the manual builder allows any indicator with
 * any period (e.g. `EMA(37)`), while `IndicatorKey` is a closed enum of
 * fixed-period variants (`ema9`, `ema21`, …), and several manual-builder
 * indicators (`stochk`, `donchianhi`, `supertrend`, `orh`, `hour`,
 * `barsheld`, `pnlr`, `bbwidth`, …) have no equivalent at all. Every
 * approximation or drop is reported back in `warnings` so the caller can
 * show the user what changed before opening the chart.
 */
import type {
  IndicatorKey,
  PositionSizeConfig,
  StopMode,
  StrategyCondition,
  StrategyDefinition,
  TargetMode,
} from '../backtest/BacktestTypes'
import type { ManualLeftOperand, ManualOperand, ManualRule, ManualStrategyLike } from '../backtest/manualStrategyEngine'
import { newCustomStrategyId } from './strategyStore'
import { t } from '../i18n'

const FIXED_PERIODS: Record<'ema' | 'sma', number[]> = { ema: [9, 21, 50, 200], sma: [9, 21, 50, 200] }

function nearestFixedKey(kind: 'ema' | 'sma', period: number, warnings: string[]): IndicatorKey {
  const options = FIXED_PERIODS[kind]
  let best = options[0]!
  let bestDiff = Infinity
  for (const p of options) {
    const diff = Math.abs(p - period)
    if (diff < bestDiff) { bestDiff = diff; best = p }
  }
  if (best !== Math.round(period)) {
    warnings.push(
      t('strategy.convert.emaApprox', {
        kind: kind.toUpperCase(),
        period,
        best,
      }),
    )
  }
  return `${kind}${best}` as IndicatorKey
}

/** Returns a real IndicatorKey, or `null` if this operand has no representable equivalent. */
function mapIndicator(ind: string, p: Record<string, number>, warnings: string[]): IndicatorKey | null {
  switch (ind) {
    case 'close': case 'open': case 'high': case 'low': case 'volume': return ind as IndicatorKey
    case 'ema': return nearestFixedKey('ema', p.period ?? 9, warnings)
    case 'sma': return nearestFixedKey('sma', p.period ?? 50, warnings)
    case 'rsi':
      if ((p.period ?? 14) !== 14) warnings.push(t('strategy.convert.rsiApprox', { period: p.period ?? 14 }))
      return 'rsi14'
    case 'atr':
      if ((p.period ?? 14) !== 14) warnings.push(t('strategy.convert.atrApprox', { period: p.period ?? 14 }))
      return 'atr14'
    case 'adx':
      if ((p.period ?? 14) !== 14) warnings.push(t('strategy.convert.adxApprox', { period: p.period ?? 14 }))
      return 'adx14'
    case 'vwap': return 'vwap'
    case 'macd':
      if ((p.fast ?? 12) !== 12 || (p.slow ?? 26) !== 26 || (p.signal ?? 9) !== 9) {
        warnings.push(t('strategy.convert.macdApprox'))
      }
      return 'macd_line'
    case 'macdsig':
      if ((p.fast ?? 12) !== 12 || (p.slow ?? 26) !== 26 || (p.signal ?? 9) !== 9) {
        warnings.push(t('strategy.convert.macdSigApprox'))
      }
      return 'macd_signal'
    case 'bbu':
      if ((p.period ?? 20) !== 20 || (p.sd ?? 2) !== 2) warnings.push(t('strategy.convert.bollUpperApprox'))
      return 'bb_upper'
    case 'bbl':
      if ((p.period ?? 20) !== 20 || (p.sd ?? 2) !== 2) warnings.push(t('strategy.convert.bollLowerApprox'))
      return 'bb_lower'
    case 'macdhist':
      warnings.push(t('strategy.convert.macdHistApprox'))
      return 'macd_hist'
    default:
      warnings.push(t('strategy.convert.indUnsupported', { ind }))
      return null
  }
}

function mapOperand(op: ManualLeftOperand | ManualOperand, warnings: string[]): IndicatorKey | number | null {
  if ('kind' in op && op.kind === 'num') return op.value
  const ind = (op as ManualLeftOperand).ind
  const p = (op as ManualLeftOperand).p ?? {}
  return mapIndicator(ind, p, warnings)
}

const OP_MAP: Record<string, StrategyCondition['op'] | undefined> = {
  xabove: 'cross_above',
  xbelow: 'cross_below',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
}

function mapRule(rule: ManualRule, warnings: string[]): StrategyCondition | null {
  const lhs = mapOperand(rule.left, warnings)
  if (lhs == null || typeof lhs === 'number') return null // left side is always an indicator in the manual model
  const op = OP_MAP[rule.op]
  if (!op) {
    const opLabel =
      rule.op === 'rise' ? t('strategy.mb.op.rise') : t('strategy.mb.op.fall')
    warnings.push(t('strategy.convert.riseFallUnsupported', { op: opLabel }))
    return null
  }
  const rhs = mapOperand(rule.rhs, warnings)
  if (rhs == null) return null
  return { lhs, op, rhs }
}

function mapStopLoss(risk: ManualStrategyLike['risk'], warnings: string[]): StopMode {
  const [type, value] = risk.stop
  switch (type) {
    case 'atr': return { type: 'atr_mult', value }
    case 'pct': return { type: 'fixed_pct', value }
    case 'pips':
      warnings.push(t('strategy.convert.stopPipsApprox'))
      return { type: 'fixed_pct', value: 0.3 }
    case 'swing':
      warnings.push(t('strategy.convert.stopSwingApprox'))
      return { type: 'atr_mult', value: 1.5 }
    default:
      warnings.push(t('strategy.convert.stopNoneAdded'))
      return { type: 'atr_mult', value: 2 }
  }
}

function mapTakeProfit(risk: ManualStrategyLike['risk'], warnings: string[]): TargetMode {
  const [type, value] = risk.tp
  switch (type) {
    case 'rr': return { type: 'rr_ratio', value }
    case 'pct': return { type: 'fixed_pct', value }
    case 'atr':
      warnings.push(t('strategy.convert.tpAtrApprox'))
      return { type: 'rr_ratio', value }
    default: return { type: 'none' }
  }
}

function mapPositionSize(risk: ManualStrategyLike['risk'], warnings: string[]): PositionSizeConfig {
  const [type, value] = risk.size
  switch (type) {
    case 'riskpct': return { type: 'fixed_risk', riskPct: value }
    case 'fixedlot': return { type: 'fixed_units', units: value }
    case 'fixedcash':
      warnings.push(t('strategy.convert.sizeFixedCashApprox'))
      return { type: 'fixed_risk', riskPct: 1 }
    default:
      warnings.push(t('strategy.convert.sizeKellyApprox'))
      return { type: 'fixed_risk', riskPct: Math.min(5, Math.max(0.25, value * 2)) }
  }
}

function mapTrailingStop(risk: ManualStrategyLike['risk'], warnings: string[]): StrategyDefinition['trailingStop'] {
  const [type, value] = risk.trail
  if (type === 'none') return undefined
  if (type === 'be') return { activateAtRR: value, trailBy: { type: 'fixed_pct', value: 0 } }
  const label =
    type === 'atr' ? t('strategy.convert.trailAtrLabel') : t('strategy.convert.trailChandelierLabel')
  warnings.push(t('strategy.convert.trailApprox', { label }))
  return { activateAtRR: 1, trailBy: { type: 'atr_mult', value } }
}

export interface ManualToDefinitionResult {
  definition: StrategyDefinition
  warnings: string[]
}

/** Converts a manual-builder strategy into the chart page's `StrategyDefinition` shape. See file header for caveats. */
export function manualStrategyToDefinition(strategy: ManualStrategyLike, existingId?: string): ManualToDefinitionResult {
  const warnings: string[] = []
  const entryConditions = strategy.entry.map((r) => mapRule(r, warnings)).filter((c): c is StrategyCondition => c !== null)
  const exitConditions = strategy.exit.map((r) => mapRule(r, warnings)).filter((c): c is StrategyCondition => c !== null)
  if (strategy.entry.length && !entryConditions.length) {
    warnings.push(t('strategy.convert.noEntryMapped'))
  }
  const definition: StrategyDefinition = {
    id: existingId?.trim() || newCustomStrategyId(),
    name: strategy.name,
    direction: strategy.dir,
    entryConditions,
    exitConditions,
    stopLoss: mapStopLoss(strategy.risk, warnings),
    takeProfit: mapTakeProfit(strategy.risk, warnings),
    positionSize: mapPositionSize(strategy.risk, warnings),
    trailingStop: mapTrailingStop(strategy.risk, warnings),
  }
  return { definition, warnings }
}
