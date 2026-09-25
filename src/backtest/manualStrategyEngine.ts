/**
 * src/backtest/manualStrategyEngine.ts
 *
 * A small, self-contained bar-by-bar simulator for the manual strategy
 * builder's own rule model (`src/strategy/manualStrategyBuilder.ts`).
 *
 * Why not `BacktestEngine.ts`? That engine's `StrategyDefinition` only
 * supports a closed set of indicators with fixed periods (`ema9`, `ema21`,
 * `rsi14`, …) — see `BacktestTypes.ts`. The manual builder lets a user pick
 * *any* indicator with *any* period (e.g. `EMA(37)`), plus several
 * indicators (`stochk`, `donchianhi`, `supertrend`, `orh`, …) that
 * `BacktestEngine.ts` doesn't compute at all. Rather than lossily downcast
 * every rule to the nearest fixed-period indicator, this module evaluates
 * the builder's rules directly against real bars, reusing the low-level
 * math from `BacktestIndicators.ts` wherever it already fits (EMA, SMA,
 * RSI, ATR, MACD, Bollinger, VWAP, ADX all accept an arbitrary period).
 *
 * This is intentionally simpler than `BacktestEngine.ts` (no pyramiding,
 * no per-bar equity curve, approximate position sizing for "fixed lots" /
 * "fractional Kelly") — see inline notes for each simplification.
 */
import type { Bar } from '../types'
import { ema, sma, rsi, atr, macd, bollingerBands, vwap, adx } from './BacktestIndicators'

// ─── Shapes matching manualStrategyBuilder.ts's own types (structural, no import needed) ──
export type ManualOperand =
  | { kind: 'ind'; ind: string; p: Record<string, number> }
  | { kind: 'num'; value: number }
export type ManualLeftOperand = { ind: string; p: Record<string, number> }
export type ManualRule = { id: string; left: ManualLeftOperand; op: string; rhs: ManualOperand }
export type ManualRiskField = [type: string, value: number]
export interface ManualStrategyLike {
  name: string
  dir: 'long' | 'short' | 'both'
  entryJoin: 'all' | 'any'
  exitJoin: 'all' | 'any'
  entry: ManualRule[]
  exit: ManualRule[]
  risk: { size: ManualRiskField; stop: ManualRiskField; tp: ManualRiskField; trail: ManualRiskField }
}

export interface ManualBacktestTrade {
  tradeNum: number
  direction: 'long' | 'short'
  entryTime: number
  exitTime: number
  entryPrice: number
  exitPrice: number
  stopPrice: number
  targetPrice: number
  units: number
  pnl: number
  pnlPct: number
  exitReason: 'stop' | 'target' | 'signal' | 'max_bars'
  barsHeld: number
}

export interface ManualEquityPoint {
  time: number
  equity: number
}

export interface ManualBacktestSummary {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  netPnl: number
  grossWin: number
  grossLoss: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  expectancy: number
  maxDrawdownPct: number
  bestTrade: number
  worstTrade: number
  avgBarsInTrade: number
  initialCapital: number
  finalEquity: number
  returnPct: number
}

export interface ManualBacktestResult {
  trades: ManualBacktestTrade[]
  equity: ManualEquityPoint[]
  summary: ManualBacktestSummary
  barsUsed: number
  warmupBars: number
}

export interface ManualBacktestOptions {
  initialCapital?: number
  /** Only allow new entries during this UTC hour window (inclusive). Omit = all hours. Wraps past midnight if fromHour > toHour. */
  sessionFilter?: { fromHour: number; toHour: number } | null
  maxBarsInTrade?: number
}

// ─── Generic per-run indicator cache ──────────────────────────────────────────
type SeriesCache = Map<string, number[]>

function keyFor(ind: string, p: Record<string, number>): string {
  const parts = Object.keys(p)
    .sort()
    .map((k) => `${k}=${p[k]}`)
  return `${ind}(${parts.join(',')})`
}

function rollingMax(vals: number[], period: number): number[] {
  const out = new Array<number>(vals.length).fill(NaN)
  for (let i = 0; i < vals.length; i++) {
    if (i < period - 1) continue
    let m = -Infinity
    for (let j = i - period + 1; j <= i; j++) m = Math.max(m, vals[j]!)
    out[i] = m
  }
  return out
}
function rollingMin(vals: number[], period: number): number[] {
  const out = new Array<number>(vals.length).fill(NaN)
  for (let i = 0; i < vals.length; i++) {
    if (i < period - 1) continue
    let m = Infinity
    for (let j = i - period + 1; j <= i; j++) m = Math.min(m, vals[j]!)
    out[i] = m
  }
  return out
}
function sumSeries(vals: number[], period: number): number[] {
  const out = new Array<number>(vals.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i]!
    if (i >= period) sum -= vals[i - period]!
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/** Median gap between consecutive bar timestamps — used for opening-range indicators. */
function estimateBarIntervalSec(bars: Bar[]): number {
  const n = Math.min(200, bars.length)
  if (n < 2) return 60
  const gaps: number[] = []
  for (let i = 1; i < n; i++) gaps.push(Number(bars[i]!.time) - Number(bars[i - 1]!.time))
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)] || 60
}

/** Rough pip-size heuristic from price magnitude — used only for the "Fixed pips" stop/target mode. */
function pipSizeForPrice(price: number): number {
  if (price >= 1000) return 1 // gold/indices-scale instruments
  if (price >= 20) return 0.1
  if (price >= 1) return 0.01
  return 0.0001 // FX-style quotes
}

function computeSeries(bars: Bar[], ind: string, p: Record<string, number>, cache: SeriesCache): number[] {
  const key = keyFor(ind, p)
  const hit = cache.get(key)
  if (hit) return hit
  let out: number[]
  switch (ind) {
    case 'close': out = bars.map((b) => b.close); break
    case 'open': out = bars.map((b) => b.open); break
    case 'high': out = bars.map((b) => b.high); break
    case 'low': out = bars.map((b) => b.low); break
    case 'volume': out = bars.map((b) => b.volume ?? 0); break
    case 'hour': out = bars.map((b) => new Date(Number(b.time) * 1000).getUTCHours()); break
    case 'ema': out = ema(bars, Math.max(1, Math.round(p.period ?? 9))); break
    case 'sma': out = sma(bars, Math.max(1, Math.round(p.period ?? 50))); break
    case 'rsi': out = rsi(bars, Math.max(2, Math.round(p.period ?? 14))); break
    case 'atr': out = atr(bars, Math.max(1, Math.round(p.period ?? 14))); break
    case 'adx': out = adx(bars, Math.max(2, Math.round(p.period ?? 14))); break
    case 'vwap': out = vwap(bars); break
    case 'volsma': out = sumSeries(bars.map((b) => b.volume ?? 0), Math.max(1, Math.round(p.period ?? 20))); break
    case 'macd': out = macd(bars, p.fast ?? 12, p.slow ?? 26, p.signal ?? 9).line; break
    case 'macdsig': out = macd(bars, p.fast ?? 12, p.slow ?? 26, p.signal ?? 9).signal_; break
    case 'macdhist': out = macd(bars, p.fast ?? 12, p.slow ?? 26, p.signal ?? 9).hist; break
    case 'bbu': out = bollingerBands(bars, Math.max(2, Math.round(p.period ?? 20)), p.sd ?? 2).upper; break
    case 'bbl': out = bollingerBands(bars, Math.max(2, Math.round(p.period ?? 20)), p.sd ?? 2).lower; break
    case 'bbwidth': {
      const { upper, middle, lower } = bollingerBands(bars, Math.max(2, Math.round(p.period ?? 20)), p.sd ?? 2)
      out = upper.map((u, i) => (middle[i] ? ((u - lower[i]!) / middle[i]!) * 100 : NaN))
      break
    }
    case 'donchianhi': out = rollingMax(bars.map((b) => b.high), Math.max(1, Math.round(p.period ?? 20))); break
    case 'donchianlo': out = rollingMin(bars.map((b) => b.low), Math.max(1, Math.round(p.period ?? 20))); break
    case 'stochk': {
      const period = Math.max(1, Math.round(p.period ?? 14))
      const highs = rollingMax(bars.map((b) => b.high), period)
      const lows = rollingMin(bars.map((b) => b.low), period)
      out = bars.map((b, i) => {
        const h = highs[i]!; const l = lows[i]!
        return h - l > 0 ? ((b.close - l) / (h - l)) * 100 : NaN
      })
      break
    }
    case 'stochd': {
      const k = computeSeries(bars, 'stochk', p, cache)
      out = sumSeries(k.map((v) => (isNaN(v) ? 0 : v)), Math.max(1, Math.round(p.smooth ?? 3)))
      break
    }
    case 'supertrend': {
      const period = Math.max(1, Math.round(p.period ?? 10))
      const mult = p.mult ?? 3
      const atrs = atr(bars, period)
      out = new Array<number>(bars.length).fill(NaN)
      let trend = 1 // 1 = up (line below price), -1 = down (line above price)
      let line = NaN
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i]!
        const a = atrs[i]!
        if (isNaN(a)) continue
        const mid = (b.high + b.low) / 2
        const upperBand = mid + mult * a
        const lowerBand = mid - mult * a
        if (isNaN(line)) { line = trend === 1 ? lowerBand : upperBand; out[i] = line; continue }
        if (trend === 1) {
          line = Math.max(line, lowerBand)
          if (b.close < line) { trend = -1; line = upperBand }
        } else {
          line = Math.min(line, upperBand)
          if (b.close > line) { trend = 1; line = lowerBand }
        }
        out[i] = line
      }
      break
    }
    case 'orh': case 'orl': {
      const intervalSec = estimateBarIntervalSec(bars)
      const numBars = Math.max(1, Math.ceil(((p.mins ?? 30) * 60) / intervalSec))
      out = new Array<number>(bars.length).fill(NaN)
      let dayKey = -1
      let dayStartIdx = -1
      let hi = -Infinity
      let lo = Infinity
      for (let i = 0; i < bars.length; i++) {
        const day = Math.floor(Number(bars[i]!.time) / 86400)
        if (day !== dayKey) { dayKey = day; dayStartIdx = i; hi = -Infinity; lo = Infinity }
        if (i - dayStartIdx < numBars) {
          hi = Math.max(hi, bars[i]!.high)
          lo = Math.min(lo, bars[i]!.low)
        }
        out[i] = ind === 'orh' ? hi : lo
      }
      break
    }
    default: out = new Array<number>(bars.length).fill(NaN)
  }
  cache.set(key, out)
  return out
}

/** Runtime-only state for the currently open trade — feeds `barsheld` / `pnlr` operands. */
interface RuntimeCtx {
  openBarIndex: number
  openDirection: 'long' | 'short' | null
  entryPrice: number
  stopDistance: number
}

function valueOf(op: ManualLeftOperand | ManualOperand, i: number, cache: SeriesCache, bars: Bar[], rt: RuntimeCtx): number {
  if ('kind' in op && op.kind === 'num') return op.value
  const ind = 'ind' in op ? op.ind : (op as ManualOperand & { kind: 'ind' }).ind
  const p = 'p' in op ? op.p : {}
  if (ind === 'barsheld') return rt.openDirection ? i - rt.openBarIndex : 0
  if (ind === 'pnlr') {
    if (!rt.openDirection || rt.stopDistance <= 0) return 0
    const close = bars[i]!.close
    const raw = rt.openDirection === 'long' ? close - rt.entryPrice : rt.entryPrice - close
    return raw / rt.stopDistance
  }
  return computeSeries(bars, ind, p, cache)[i] ?? NaN
}

function evalRule(rule: ManualRule, i: number, cache: SeriesCache, bars: Bar[], rt: RuntimeCtx): boolean {
  const left = valueOf(rule.left, i, cache, bars, rt)
  const right = valueOf(rule.rhs, i, cache, bars, rt)
  if (Number.isNaN(left) || Number.isNaN(right)) return false
  switch (rule.op) {
    case 'gt': return left > right
    case 'lt': return left < right
    case 'gte': return left >= right
    case 'lte': return left <= right
    case 'xabove': case 'xbelow': {
      if (i === 0) return false
      const pLeft = valueOf(rule.left, i - 1, cache, bars, rt)
      const pRight = valueOf(rule.rhs, i - 1, cache, bars, rt)
      if (Number.isNaN(pLeft) || Number.isNaN(pRight)) return false
      return rule.op === 'xabove' ? pLeft <= pRight && left > right : pLeft >= pRight && left < right
    }
    case 'rise': case 'fall': {
      if (i === 0) return false
      const pLeft = valueOf(rule.left, i - 1, cache, bars, rt)
      if (Number.isNaN(pLeft)) return false
      return rule.op === 'rise' ? left > pLeft : left < pLeft
    }
    default: return false
  }
}

function evalRuleSet(rules: ManualRule[], join: 'all' | 'any', i: number, cache: SeriesCache, bars: Bar[], rt: RuntimeCtx): boolean {
  if (!rules.length) return false
  return join === 'all' ? rules.every((r) => evalRule(r, i, cache, bars, rt)) : rules.some((r) => evalRule(r, i, cache, bars, rt))
}

function longestLookbackBars(strategy: ManualStrategyLike): number {
  let m = 0
  for (const r of [...strategy.entry, ...strategy.exit]) {
    for (const o of [r.left as ManualLeftOperand, r.rhs as ManualOperand]) {
      const p = 'p' in o ? o.p : {}
      for (const v of Object.values(p || {})) if (v > m) m = v
    }
  }
  return m
}

function inSessionHour(hour: number, filter: { fromHour: number; toHour: number } | null | undefined): boolean {
  if (!filter) return true
  const { fromHour, toHour } = filter
  if (fromHour <= toHour) return hour >= fromHour && hour <= toHour
  return hour >= fromHour || hour <= toHour // wraps past midnight (e.g. Asia session)
}

export function runManualStrategy(bars: Bar[], strategy: ManualStrategyLike, opts: ManualBacktestOptions = {}): ManualBacktestResult {
  const initialCapital = opts.initialCapital ?? 100_000
  const maxBarsInTrade = opts.maxBarsInTrade ?? 400
  const cache: SeriesCache = new Map()
  const atr14 = atr(bars, 14)
  const warmupBars = Math.max(30, longestLookbackBars(strategy) + 5)
  const start = Math.min(bars.length - 1, warmupBars)

  const trades: ManualBacktestTrade[] = []
  const equity: ManualEquityPoint[] = bars.length ? [{ time: Number(bars[start]?.time ?? bars[0]!.time), equity: initialCapital }] : []
  let capital = initialCapital

  let direction: 'long' | 'short' | null = null
  let entryPrice = 0
  let entryBarIndex = 0
  let stopPrice = 0
  let targetPrice = 0
  let stopDistance = 0
  let units = 0
  let highestClose = 0
  let lowestClose = 0

  const canOpenLong = strategy.dir === 'long' || strategy.dir === 'both'
  const canOpenShort = strategy.dir === 'short' || strategy.dir === 'both'

  const closePosition = (i: number, exitPrice: number, reason: ManualBacktestTrade['exitReason']) => {
    if (!direction) return
    const pnl = (direction === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice) * units
    capital += pnl
    trades.push({
      tradeNum: trades.length + 1,
      direction,
      entryTime: Number(bars[entryBarIndex]!.time),
      exitTime: Number(bars[i]!.time),
      entryPrice,
      exitPrice,
      stopPrice,
      targetPrice,
      units,
      pnl,
      pnlPct: entryPrice ? (pnl / (entryPrice * units)) * 100 : 0,
      exitReason: reason,
      barsHeld: i - entryBarIndex,
    })
    equity.push({ time: Number(bars[i]!.time), equity: capital })
    direction = null
  }

  const openPosition = (i: number, dir: 'long' | 'short') => {
    const price = bars[i]!.close
    const a = atr14[i] ?? 0
    const [stopType, stopVal] = strategy.risk.stop
    const [tpType, tpVal] = strategy.risk.tp
    const [sizeType, sizeVal] = strategy.risk.size

    let dist: number
    switch (stopType) {
      case 'atr': dist = stopVal * (a || price * 0.005)
        break
      case 'pct': dist = (stopVal / 100) * price
        break
      case 'pips': dist = stopVal * pipSizeForPrice(price)
        break
      case 'swing': {
        const lookback = 10
        const lo = Math.max(0, i - lookback)
        let ext = dir === 'long' ? Infinity : -Infinity
        for (let j = lo; j < i; j++) {
          ext = dir === 'long' ? Math.min(ext, bars[j]!.low) : Math.max(ext, bars[j]!.high)
        }
        dist = dir === 'long' ? price - ext : ext - price
        if (!(dist > 0)) dist = (a || price * 0.005) * 1.5
        break
      }
      default: dist = (a || price * 0.005) * 3 // 'none' — still need a sane loss cap internally
    }
    if (!(dist > 0)) dist = price * 0.01

    let tDist: number
    switch (tpType) {
      case 'rr': tDist = tpVal * dist; break
      case 'atr': tDist = tpVal * (a || price * 0.005); break
      case 'pct': tDist = (tpVal / 100) * price; break
      default: tDist = Infinity // 'none' — exit rules / max bars only
    }

    let u: number
    switch (sizeType) {
      case 'riskpct': u = (capital * (sizeVal / 100)) / dist; break
      case 'kelly': u = (capital * (Math.min(1, sizeVal) * 0.02)) / dist; break // approximation — no trade history to size true Kelly against
      case 'fixedcash': u = sizeVal / price; break
      default: u = sizeVal // 'fixedlot' — treated as raw position units (see file header)
    }
    if (!(u > 0) || !Number.isFinite(u)) u = 0

    direction = dir
    entryPrice = price
    entryBarIndex = i
    stopDistance = dist
    stopPrice = dir === 'long' ? price - dist : price + dist
    targetPrice = tDist === Infinity ? (dir === 'long' ? Infinity : -Infinity) : dir === 'long' ? price + tDist : price - tDist
    units = u
    highestClose = price
    lowestClose = price
  }

  const applyTrailing = (i: number) => {
    if (!direction) return
    const [trailType, trailVal] = strategy.risk.trail
    if (trailType === 'none') return
    const close = bars[i]!.close
    const a = atr14[i] ?? 0
    highestClose = Math.max(highestClose, close)
    lowestClose = Math.min(lowestClose, close)
    if (trailType === 'be') {
      const profitR = stopDistance > 0 ? ((direction === 'long' ? close - entryPrice : entryPrice - close) / stopDistance) : 0
      if (profitR >= trailVal) {
        stopPrice = direction === 'long' ? Math.max(stopPrice, entryPrice) : Math.min(stopPrice, entryPrice)
      }
    } else if (trailType === 'atr' && a) {
      const candidate = direction === 'long' ? close - trailVal * a : close + trailVal * a
      stopPrice = direction === 'long' ? Math.max(stopPrice, candidate) : Math.min(stopPrice, candidate)
    } else if (trailType === 'chandelier' && a) {
      const candidate = direction === 'long' ? highestClose - trailVal * a : lowestClose + trailVal * a
      stopPrice = direction === 'long' ? Math.max(stopPrice, candidate) : Math.min(stopPrice, candidate)
    }
  }

  for (let i = start; i < bars.length; i++) {
    const bar = bars[i]!
    const rt: RuntimeCtx = { openBarIndex: entryBarIndex, openDirection: direction, entryPrice, stopDistance }

    if (direction) {
      applyTrailing(i)
      const exitRules = direction === 'long' ? strategy.exit : strategy.entry
      const exitJoin = direction === 'long' ? strategy.exitJoin : strategy.entryJoin
      const hitStop = direction === 'long' ? bar.low <= stopPrice : bar.high >= stopPrice
      const hitTarget = Number.isFinite(targetPrice) && (direction === 'long' ? bar.high >= targetPrice : bar.low <= targetPrice)
      const signalExit = evalRuleSet(exitRules, exitJoin, i, cache, bars, rt)
      const maxBars = i - entryBarIndex >= maxBarsInTrade

      if (hitStop) closePosition(i, stopPrice, 'stop')
      else if (hitTarget) closePosition(i, targetPrice, 'target')
      else if (signalExit) closePosition(i, bar.close, 'signal')
      else if (maxBars) closePosition(i, bar.close, 'max_bars')
      continue
    }

    if (!inSessionHour(new Date(Number(bar.time) * 1000).getUTCHours(), opts.sessionFilter)) continue

    if (canOpenLong && evalRuleSet(strategy.entry, strategy.entryJoin, i, cache, bars, rt)) {
      openPosition(i, 'long')
    } else if (canOpenShort && strategy.dir === 'both' && evalRuleSet(strategy.exit, strategy.exitJoin, i, cache, bars, rt)) {
      openPosition(i, 'short')
    } else if (canOpenShort && strategy.dir === 'short' && evalRuleSet(strategy.entry, strategy.entryJoin, i, cache, bars, rt)) {
      openPosition(i, 'short')
    }
  }
  // Close any still-open position at the last bar so the equity curve reflects it.
  if (direction && bars.length) closePosition(bars.length - 1, bars[bars.length - 1]!.close, 'max_bars')

  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl <= 0)
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0)
  const grossLoss = losses.reduce((a, t) => a + t.pnl, 0)
  let peak = initialCapital
  let maxDD = 0
  for (const p of equity) {
    peak = Math.max(peak, p.equity)
    if (peak > 0) maxDD = Math.max(maxDD, ((peak - p.equity) / peak) * 100)
  }
  const finalEquity = capital
  const summary: ManualBacktestSummary = {
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    netPnl: finalEquity - initialCapital,
    grossWin,
    grossLoss,
    profitFactor: grossLoss < 0 ? grossWin / Math.abs(grossLoss) : grossWin > 0 ? Infinity : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    expectancy: trades.length ? (finalEquity - initialCapital) / trades.length : 0,
    maxDrawdownPct: maxDD,
    bestTrade: trades.length ? Math.max(...trades.map((t) => t.pnl)) : 0,
    worstTrade: trades.length ? Math.min(...trades.map((t) => t.pnl)) : 0,
    avgBarsInTrade: trades.length ? trades.reduce((a, t) => a + t.barsHeld, 0) / trades.length : 0,
    initialCapital,
    finalEquity,
    returnPct: ((finalEquity - initialCapital) / initialCapital) * 100,
  }

  return { trades, equity, summary, barsUsed: bars.length - start, warmupBars: start }
}
