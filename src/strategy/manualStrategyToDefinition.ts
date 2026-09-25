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
    warnings.push(`${kind.toUpperCase()}(${period}) isn't available on the chart engine — approximated as ${kind.toUpperCase()}(${best})`)
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
      if ((p.period ?? 14) !== 14) warnings.push(`RSI(${p.period}) approximated as RSI(14) — the chart engine only computes a 14-period RSI`)
      return 'rsi14'
    case 'atr':
      if ((p.period ?? 14) !== 14) warnings.push(`ATR(${p.period}) approximated as ATR(14) — the chart engine only computes a 14-period ATR`)
      return 'atr14'
    case 'adx':
      if ((p.period ?? 14) !== 14) warnings.push(`ADX(${p.period}) approximated as ADX(14) — the chart engine only computes a 14-period ADX`)
      return 'adx14'
    case 'vwap': return 'vwap'
    case 'macd':
      if ((p.fast ?? 12) !== 12 || (p.slow ?? 26) !== 26 || (p.signal ?? 9) !== 9) {
        warnings.push('Custom MACD periods approximated as the standard 12/26/9 MACD')
      }
      return 'macd_line'
    case 'macdsig':
      if ((p.fast ?? 12) !== 12 || (p.slow ?? 26) !== 26 || (p.signal ?? 9) !== 9) {
        warnings.push('Custom MACD periods approximated as the standard 12/26/9 MACD signal')
      }
      return 'macd_signal'
    case 'bbu':
      if ((p.period ?? 20) !== 20 || (p.sd ?? 2) !== 2) warnings.push('Custom Bollinger settings approximated as the standard 20-period, 2σ upper band')
      return 'bb_upper'
    case 'bbl':
      if ((p.period ?? 20) !== 20 || (p.sd ?? 2) !== 2) warnings.push('Custom Bollinger settings approximated as the standard 20-period, 2σ lower band')
      return 'bb_lower'
    case 'macdhist':
      warnings.push('MACD histogram approximated as the standard 12/26/9 MACD histogram')
      return 'macd_hist'
    default:
      warnings.push(`"${ind}" isn't supported by the chart's backtest engine — a condition using it was dropped`)
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
    warnings.push(`The "${rule.op === 'rise' ? 'rises for' : 'falls for'}" comparison isn't supported by the chart's backtest engine — a condition using it was dropped`)
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
      warnings.push('"Fixed pips" stop isn\u2019t supported by the chart engine — approximated as a 0.3% price stop')
      return { type: 'fixed_pct', value: 0.3 }
    case 'swing':
      warnings.push('"Last swing low/high" stop isn\u2019t supported by the chart engine — approximated as 1.5\u00d7 ATR')
      return { type: 'atr_mult', value: 1.5 }
    default:
      warnings.push('No hard stop was set \u2014 the chart engine requires one, so a 2\u00d7 ATR safety stop was added')
      return { type: 'atr_mult', value: 2 }
  }
}

function mapTakeProfit(risk: ManualStrategyLike['risk'], warnings: string[]): TargetMode {
  const [type, value] = risk.tp
  switch (type) {
    case 'rr': return { type: 'rr_ratio', value }
    case 'pct': return { type: 'fixed_pct', value }
    case 'atr':
      warnings.push('ATR-multiple target isn\u2019t supported by the chart engine — approximated as an equivalent R:R ratio')
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
      warnings.push('"Fixed cash" sizing isn\u2019t supported by the chart engine — approximated as 1% equity risk per trade')
      return { type: 'fixed_risk', riskPct: 1 }
    default:
      warnings.push('"Fractional Kelly" sizing isn\u2019t supported by the chart engine — approximated as a scaled equity-risk percentage')
      return { type: 'fixed_risk', riskPct: Math.min(5, Math.max(0.25, value * 2)) }
  }
}

function mapTrailingStop(risk: ManualStrategyLike['risk'], warnings: string[]): StrategyDefinition['trailingStop'] {
  const [type, value] = risk.trail
  if (type === 'none') return undefined
  if (type === 'be') return { activateAtRR: value, trailBy: { type: 'fixed_pct', value: 0 } }
  warnings.push(`"${type === 'atr' ? 'Trail by ATR' : 'Chandelier exit'}" is approximated on the chart engine as breakeven-at-1R plus an ATR trail`)
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
    warnings.push('None of the entry conditions could be represented on the chart engine \u2014 it will never open a trade until you adjust them')
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
