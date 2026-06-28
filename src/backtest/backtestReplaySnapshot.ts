import type { BacktestResult, TradeResult } from './BacktestTypes'

export type OpenPositionSnapshot = {
  direction: 'long' | 'short'
  entry: number
  stop: number
  target: number
  units: number
  unrealizedPnl: number
  tradeNum: number
}

export type BacktestReplaySnapshot = {
  barTime: number
  openPosition: OpenPositionSnapshot | null
  closedTrades: TradeResult[]
  netPnl: number
  realizedPnl: number
  winRate: number
  sharpe: number
  strategyName: string
}

function closedTradesAtTime(result: BacktestResult, barTime: number): TradeResult[] {
  return result.trades.filter((t) => t.exitTime <= barTime)
}

function openTradeAtTime(result: BacktestResult, barTime: number): TradeResult | null {
  return (
    result.trades.find((t) => t.entryTime <= barTime && t.exitTime > barTime) ?? null
  )
}

function unrealizedPnl(trade: TradeResult, markPrice: number): number {
  if (trade.direction === 'long') return (markPrice - trade.entryPrice) * trade.units
  return (trade.entryPrice - markPrice) * trade.units
}

/** Per-trade Sharpe on closed P&L (rough annualized, Rf=0). */
function sharpeFromClosedTrades(closed: TradeResult[], initialCapital: number): number {
  if (closed.length < 2 || initialCapital <= 0) return 0
  const rets = closed.map((t) => t.pnl / initialCapital)
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)
  const std = Math.sqrt(variance)
  if (std <= 0) return 0
  return +((mean / std) * Math.sqrt(252)).toFixed(2)
}

/** Point-in-time backtest view for replay bar `barTime` (unix seconds, bar close). */
export function getBacktestSnapshotAtTime(
  result: BacktestResult,
  barTime: number,
  markPrice: number,
): BacktestReplaySnapshot {
  const closed = closedTradesAtTime(result, barTime)
  const open = openTradeAtTime(result, barTime)
  const realizedPnl = closed.reduce((s, t) => s + t.pnl, 0)
  const openUnrealized = open ? unrealizedPnl(open, markPrice) : 0
  const wins = closed.filter((t) => t.pnl > 0).length
  const winRate = closed.length ? (wins / closed.length) * 100 : 0

  return {
    barTime,
    closedTrades: closed,
    openPosition: open
      ? {
          direction: open.direction,
          entry: open.entryPrice,
          stop: open.stopPrice,
          target: open.targetPrice,
          units: open.units,
          unrealizedPnl: openUnrealized,
          tradeNum: open.tradeNum,
        }
      : null,
    realizedPnl,
    netPnl: realizedPnl + openUnrealized,
    winRate,
    sharpe: sharpeFromClosedTrades(closed, result.summary.initialCapital),
    strategyName: result.strategy.name,
  }
}
