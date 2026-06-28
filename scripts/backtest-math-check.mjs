/**
 * One-off sanity check: netPnl vs sum(trade.pnl), profit factor recalc.
 * Run: npx tsx scripts/backtest-math-check.mjs
 */
import { runBacktest, numberTrades } from '../src/backtest/BacktestEngine.ts'
import { EMA_CROSS } from '../src/backtest/ExampleStrategies.ts'

const BAR_COUNT = 14_400

const bars = []
let t = 1_717_200_000
let p = 4400
for (let i = 0; i < BAR_COUNT; i++) {
  const o = p
  const c = p + Math.sin(i / 50) * 2 + (Math.random() - 0.5) * 3
  const h = Math.max(o, c) + Math.random()
  const l = Math.min(o, c) - Math.random()
  bars.push({ time: t, open: o, high: h, low: l, close: c, volume: 100 })
  p = c
  t += 60
}

const t0 = performance.now()
const result = runBacktest(bars, EMA_CROSS, {
  initialCapital: 100_000,
  commission: 2,
  slippage: 0.05,
  startBarIndex: 1,
})
numberTrades(result)
const elapsedMs = Math.round(performance.now() - t0)

const s = result.summary
const sumPnL = result.trades.reduce((a, tr) => a + tr.pnl, 0)
const pfRecalc = s.grossLoss > 0 ? s.grossWin / s.grossLoss : 0

console.log(
  JSON.stringify(
    {
      barCount: BAR_COUNT,
      elapsedMs,
      totalTrades: s.totalTrades,
      netPnl: s.netPnl,
      sumTradePnL: sumPnL,
      netMatchesSum: Math.abs(s.netPnl - sumPnL) < 0.01,
      winRate: Number(s.winRate.toFixed(1)),
      profitFactor: Number(s.profitFactor.toFixed(2)),
      pfRecalc: Number(pfRecalc.toFixed(2)),
      pfMatches: Math.abs(s.profitFactor - pfRecalc) < 0.01,
      totalCommission: s.totalCommission,
      commissionPerTrade: s.totalTrades ? s.totalCommission / s.totalTrades : 0,
      finalEquity: s.finalEquity,
      maxDrawdownPct: Number(s.maxDrawdown.toFixed(2)),
    },
    null,
    2,
  ),
)
