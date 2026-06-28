/**
 * Smoke test: BacktestEngine + backtestReplayUtils helpers.
 * Run: npx tsx scripts/backtest-replay-smoke.mjs
 */
import { runBacktest, numberTrades } from '../src/backtest/BacktestEngine.ts'
import { EMA_CROSS } from '../src/backtest/ExampleStrategies.ts'
import {
  barIndexAtOrBeforeTime,
  tradeIndexAtOrBeforeTime,
} from '../src/backtest/backtestReplayUtils.ts'

const BAR_COUNT = 5000

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

const trade0 = result.trades[0] ?? null
const idx = trade0 ? barIndexAtOrBeforeTime(bars, trade0.entryTime) : -1
const ti = tradeIndexAtOrBeforeTime(result.trades, trade0?.entryTime ?? 0)

const barAtIdx = idx >= 0 ? bars[idx - 1] : null
const barTimeOk =
  trade0 && barAtIdx ? Number(barAtIdx.time) <= trade0.entryTime : trade0 === null

console.log(
  JSON.stringify(
    {
      barCount: BAR_COUNT,
      elapsedMs,
      trades: result.trades.length,
      equityPts: result.equity.length,
      maxDrawdown: result.summary.maxDrawdown,
      firstTradeBarIdx: idx,
      firstTradeIdx: ti,
      barTimeOk,
      ok: barTimeOk && (result.trades.length === 0 || (idx >= 1 && ti >= 0)),
    },
    null,
    2,
  ),
)
