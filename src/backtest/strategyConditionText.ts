import type { ExitReason, StrategyCondition } from './BacktestTypes'
import { INDICATOR_OPTIONS, OPERATOR_OPTIONS } from '../strategy/strategyBuilderFields'

function indicatorLabel(key: string): string {
  return INDICATOR_OPTIONS.find((o) => o.value === key)?.label ?? key
}

function operatorLabel(op: StrategyCondition['op']): string {
  return OPERATOR_OPTIONS.find((o) => o.value === op)?.label ?? op
}

export function formatStrategyCondition(c: StrategyCondition): string {
  const lhs = indicatorLabel(c.lhs)
  const op = operatorLabel(c.op)
  const rhs = typeof c.rhs === 'number' ? String(c.rhs) : indicatorLabel(c.rhs)
  return `${lhs} ${op} ${rhs}`
}

export function formatStrategyConditions(conditions: StrategyCondition[], join = ' · '): string {
  if (!conditions.length) return '—'
  return conditions.map(formatStrategyCondition).join(join)
}

export function formatExitReasonSignal(
  reason: ExitReason,
  exitConditions: StrategyCondition[],
  stopPrice: number,
  targetPrice: number,
  maxBarsInTrade: number,
): string {
  switch (reason) {
    case 'stop_loss':
      return `Stop loss hit at ${stopPrice.toFixed(2)}`
    case 'take_profit':
      return targetPrice > 0 ? `Take profit hit at ${targetPrice.toFixed(2)}` : 'Take profit hit'
    case 'signal_exit':
      return `Exit rules met: ${formatStrategyConditions(exitConditions)}`
    case 'max_bars':
      return `Max bars in trade (${maxBarsInTrade})`
    case 'session_end':
      return 'Closed at session end'
    case 'trailing_stop':
      return 'Trailing stop hit'
    default:
      return reason
  }
}
