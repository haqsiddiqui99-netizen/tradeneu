import type { ExitReason, StrategyCondition } from './BacktestTypes'
import { indicatorLabel, operatorLabel } from '../strategy/strategyBuilderFields'
import { t } from '../i18n'

export function formatStrategyCondition(c: StrategyCondition): string {
  const lhs = indicatorLabel(c.lhs)
  const op = operatorLabel(c.op)
  const rhs = typeof c.rhs === 'number' ? String(c.rhs) : indicatorLabel(c.rhs)
  return t('strategy.cond.pattern', { lhs, op, rhs })
}

export function formatStrategyConditions(conditions: StrategyCondition[], join = ' · '): string {
  if (!conditions.length) return t('strategy.cond.empty')
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
      return t('strategy.cond.stopHit', { price: stopPrice.toFixed(2) })
    case 'take_profit':
      return targetPrice > 0
        ? t('strategy.cond.tpHit', { price: targetPrice.toFixed(2) })
        : t('strategy.cond.tpHitGeneric')
    case 'signal_exit':
      return t('strategy.cond.signalExit', { rules: formatStrategyConditions(exitConditions) })
    case 'max_bars':
      return t('strategy.cond.maxBars', { count: maxBarsInTrade })
    case 'session_end':
      return t('strategy.cond.sessionEnd')
    case 'trailing_stop':
      return t('strategy.cond.trailingStop')
    default:
      return reason
  }
}
