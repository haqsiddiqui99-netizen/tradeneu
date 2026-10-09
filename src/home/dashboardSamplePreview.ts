import type { StoredSession } from '../data/sessionStore'
import type { ClosedReplayTrade, PositionDirection } from '../replay/replayPositions'

const DAY = 86_400_000
const HOUR = 3_600_000

type SampleTrade = {
  daysAgo: number
  /** Months back inside the current year, used so the equity curve has history in January too. */
  monthsBack?: number
  pnl: number
  direction: PositionDirection
}

type SampleDesk = {
  name: string
  symbol: string
  daysAgo: number
  practiceHours: number
  historyDays: number
  trades: SampleTrade[]
}

/**
 * One fixed desk. Every first login sees these same sessions, so the Performance
 * charts teach the layout before the trader has a replay of their own.
 * Timestamps are offsets from "now", which keeps 7d / 30d / All populated.
 */
const SAMPLE_DESK: SampleDesk[] = [
  {
    name: 'London gold',
    symbol: 'XAUUSD',
    daysAgo: 0,
    practiceHours: 2.6,
    historyDays: 18,
    trades: [
      { daysAgo: 0, pnl: 480, direction: 'long' },
      { daysAgo: 1, pnl: -160, direction: 'short' },
      { daysAgo: 3, pnl: 240, direction: 'long' },
    ],
  },
  {
    name: 'Euro open',
    symbol: 'EURUSD',
    daysAgo: 1,
    practiceHours: 1.2,
    historyDays: 12,
    trades: [
      { daysAgo: 1, pnl: 90, direction: 'long' },
      { daysAgo: 2, pnl: -140, direction: 'short' },
      { daysAgo: 5, pnl: 210, direction: 'long' },
    ],
  },
  {
    name: 'Nasdaq drive',
    symbol: 'NAS100',
    daysAgo: 2,
    practiceHours: 3.4,
    historyDays: 30,
    trades: [
      { daysAgo: 2, pnl: 620, direction: 'long' },
      { daysAgo: 4, pnl: -280, direction: 'short' },
      { daysAgo: 6, pnl: 180, direction: 'long' },
    ],
  },
  {
    name: 'Sterling fade',
    symbol: 'GBPUSD',
    daysAgo: 4,
    practiceHours: 1.8,
    historyDays: 14,
    trades: [
      { daysAgo: 4, pnl: 130, direction: 'short' },
      { daysAgo: 8, pnl: -70, direction: 'long' },
    ],
  },
  {
    name: 'Bitcoin range',
    symbol: 'BTCUSD',
    daysAgo: 6,
    practiceHours: 4.1,
    historyDays: 21,
    trades: [
      { daysAgo: 6, pnl: 340, direction: 'long' },
      { daysAgo: 12, pnl: -220, direction: 'short' },
      { daysAgo: 18, pnl: 150, direction: 'long' },
    ],
  },
  {
    name: 'Gold continuation',
    symbol: 'XAUUSD',
    daysAgo: 16,
    practiceHours: 2.2,
    historyDays: 20,
    trades: [
      { daysAgo: 16, pnl: 390, direction: 'long' },
      { daysAgo: 22, pnl: 110, direction: 'short' },
      { monthsBack: 2, daysAgo: 0, pnl: -260, direction: 'long' },
    ],
  },
  {
    name: 'Index swing',
    symbol: 'NAS100',
    daysAgo: 26,
    practiceHours: 2.8,
    historyDays: 40,
    trades: [
      { monthsBack: 1, daysAgo: 0, pnl: 540, direction: 'long' },
      { monthsBack: 3, daysAgo: 0, pnl: 280, direction: 'short' },
      { monthsBack: 4, daysAgo: 0, pnl: -190, direction: 'long' },
    ],
  },
  {
    name: 'Euro drift',
    symbol: 'EURUSD',
    daysAgo: 48,
    practiceHours: 1.5,
    historyDays: 16,
    trades: [
      { monthsBack: 2, daysAgo: 4, pnl: 160, direction: 'long' },
      { monthsBack: 5, daysAgo: 0, pnl: 420, direction: 'long' },
    ],
  },
  {
    name: 'Last year tape',
    symbol: 'SPX',
    daysAgo: 400,
    practiceHours: 5,
    historyDays: 25,
    trades: [
      { daysAgo: 400, pnl: 260, direction: 'long' },
      { daysAgo: 390, pnl: -120, direction: 'short' },
    ],
  },
]

function atDaysAgo(now: number, daysAgo: number): number {
  const d = new Date(now)
  d.setHours(15, 20, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return d.getTime()
}

function atMonthsBack(now: number, monthsBack: number): number {
  const d = new Date(now)
  const month = Math.max(0, d.getMonth() - monthsBack)
  const day = Math.min(22, 8 + monthsBack)
  return new Date(d.getFullYear(), month, day, 15, 20, 0, 0).getTime()
}

function tradeStamp(now: number, trade: SampleTrade): number {
  if (trade.monthsBack != null && trade.monthsBack > 0) return atMonthsBack(now, trade.monthsBack)
  return atDaysAgo(now, trade.daysAgo)
}

function closedTrade(id: string, index: number, exitMs: number, trade: SampleTrade): ClosedReplayTrade {
  const entryMs = exitMs - 40 * 60_000
  return {
    tradeNum: index,
    positionId: id,
    direction: trade.direction,
    qty: 1,
    entryPrice: 100,
    exitPrice: 100,
    entryTime: Math.floor(entryMs / 1000),
    exitTime: Math.floor(exitMs / 1000),
    pnl: trade.pnl,
    exitReason: trade.pnl >= 0 ? 'take_profit' : 'stop_loss',
  }
}

export function buildDashboardSampleSessions(now = Date.now()): StoredSession[] {
  return SAMPLE_DESK.map((row, index) => {
    const opened = atDaysAgo(now, row.daysAgo)
    const practiceMs = Math.round(row.practiceHours * HOUR)
    const trades = row.trades.map((trade, tradeIndex) =>
      closedTrade(`sample-${index + 1}-${tradeIndex + 1}`, tradeIndex + 1, tradeStamp(now, trade), trade),
    )
    const realized = trades.reduce((sum, trade) => sum + trade.pnl, 0)
    const wins = trades.filter((trade) => trade.pnl > 0).length
    return {
      id: `sample-preview-${index + 1}`,
      name: row.name,
      balance: '100000',
      assets: row.symbol,
      layout: null,
      sessionType: 'backtest',
      startDate: new Date(opened - row.historyDays * DAY).toISOString(),
      endDate: new Date(opened).toISOString(),
      createdAt: opened - practiceMs,
      updatedAt: opened,
      // Practice length is savedAt minus lastOpenedAt. Keep the open on this day
      // so the time-invested bars land on the intended dates.
      lastOpenedAt: opened - practiceMs,
      lastBacktest: {
        netPnl: realized,
        totalTrades: trades.length,
        winRate: trades.length ? (wins / trades.length) * 100 : 0,
        strategyId: 'sample',
        ranAt: opened,
      },
      replayState: {
        savedAt: opened,
        account: {
          cash: 100_000 + realized,
          realizedPnL: realized,
          positions: [],
          closedTrades: trades,
          nextId: trades.length + 1,
        },
      },
    }
  })
}
