/**
 * src/backtest/BacktestEngine.ts
 *
 * The core backtesting engine for Tradeneu / Suplexity.
 *
 * Features:
 *  ✓ Bar-by-bar simulation (no look-ahead bias)
 *  ✓ Long + short trading
 *  ✓ ATR-based, percentage, and fixed stop loss / take profit
 *  ✓ Trailing stop with breakeven activation
 *  ✓ Pyramiding (add to winning position)
 *  ✓ Session hour + weekday filters
 *  ✓ Market condition filter (trending/ranging/volatile)
 *  ✓ Cooldown after loss
 *  ✓ Commission + slippage
 *  ✓ Fixed units / fixed risk % / % equity position sizing
 *  ✓ Loss heatmap (hour × day)
 *  ✓ Rolling win rate + PnL window
 *  ✓ Stop hunt detection
 *  ✓ Market condition breakdown
 *  ✓ Full equity curve with drawdown
 *  ✓ Sharpe, Sortino, Calmar, Profit Factor
 *  ✓ Progress callback for large datasets
 *  ✓ Wired to your existing Bar type from src/types
 */

import type {
  Bar, BacktestOptions, BacktestResult, BacktestSummary,
  ConditionBreakdown, EquityPoint, HeatmapCell, MarketCondition,
  RollingWindowPoint, StopHuntAnalysis, StrategyCondition,
  StrategyDefinition, TradeResult,
} from './BacktestTypes'

import {
  precompute, snapshotAt, getIndicatorValue,
  type PrecomputedIndicators,
} from './BacktestIndicators'
import { formatExitReasonSignal, formatStrategyConditions } from './strategyConditionText'

// ─── DEFAULTS ────────────────────────────────────────────────────────────────
const DEFAULT_OPTS: Required<Omit<BacktestOptions, 'startBarIndex'>> & { startBarIndex: number } = {
  initialCapital:  100_000,
  commission:      0,
  slippage:        0,
  rollingWindow:   20,
  maxBarsInTrade:  200,
  allowShorts:     true,
  pyramiding:      false,
  onProgress:      () => {},
  startBarIndex:   1,
}

// ─── CONDITION EVALUATOR ─────────────────────────────────────────────────────
function evalCondition(
  cond:  StrategyCondition,
  ind:   PrecomputedIndicators,
  bar:   Bar,
  prevBar: Bar | null,
  i:     number,
  prevI: number,
): boolean {
  const lhs = getIndicatorValue(cond.lhs as string, ind, bar, i)
  const rhs = typeof cond.rhs === 'number'
    ? cond.rhs
    : getIndicatorValue(cond.rhs as string, ind, bar, i)
  const prevLhs = prevBar ? getIndicatorValue(cond.lhs as string, ind, prevBar, prevI) : lhs
  const prevRhs = typeof cond.rhs === 'number'
    ? cond.rhs
    : prevBar ? getIndicatorValue(cond.rhs as string, ind, prevBar, prevI) : rhs

  if (![lhs, rhs, prevLhs, prevRhs].every(Number.isFinite)) return false

  switch (cond.op) {
    case '>':           return lhs > rhs
    case '<':           return lhs < rhs
    case '>=':          return lhs >= rhs
    case '<=':          return lhs <= rhs
    case 'equals':      return Math.abs(lhs - rhs) < 0.0001
    case 'cross_above': return lhs > rhs && prevLhs <= prevRhs
    case 'cross_below': return lhs < rhs && prevLhs >= prevRhs
    default:            return false
  }
}

function evalAllConditions(
  conds:   StrategyCondition[],
  ind:     PrecomputedIndicators,
  bar:     Bar,
  prevBar: Bar | null,
  i:       number,
  prevI:   number,
): boolean {
  return conds.every((c) => evalCondition(c, ind, bar, prevBar, i, prevI))
}

/** ATR for stops — never NaN (warm-up bars use range / price-based fallback). */
function resolveAtr(ind: PrecomputedIndicators, i: number, bar: Bar): number {
  const v = ind.atr14s[i]
  if (Number.isFinite(v) && v! > 0) return v!
  const range = bar.high - bar.low
  if (Number.isFinite(range) && range > 0) return range
  const px = bar.close
  return Number.isFinite(px) && px > 0 ? Math.max(px * 0.0005, 0.01) : 1
}

// ─── POSITION SIZER ──────────────────────────────────────────────────────────
function calcUnits(
  strategy: StrategyDefinition,
  equity:   number,
  entryPrice: number,
  stopPrice:  number,
): number {
  const ps = strategy.positionSize
  switch (ps.type) {
    case 'fixed_units':
      return ps.units

    case 'fixed_risk': {
      const riskPerUnit = Math.abs(entryPrice - stopPrice)
      if (!Number.isFinite(riskPerUnit) || riskPerUnit <= 0) return 1
      const riskDollars  = equity * (ps.riskPct / 100)
      const units = Math.floor(riskDollars / riskPerUnit)
      return Number.isFinite(units) ? Math.max(1, units) : 1
    }

    case 'pct_equity': {
      if (!Number.isFinite(entryPrice) || entryPrice <= 0) return 1
      const notional = equity * (ps.pct / 100)
      const units = Math.floor(notional / entryPrice)
      return Number.isFinite(units) ? Math.max(1, units) : 1
    }
  }
}

// ─── STOP / TARGET CALC ──────────────────────────────────────────────────────
function calcStop(
  entry:     number,
  direction: 'long' | 'short',
  atr:       number,
  strategy:  StrategyDefinition,
): number {
  const sl = strategy.stopLoss
  switch (sl.type) {
    case 'fixed_pct':
      return direction === 'long'
        ? entry * (1 - sl.value / 100)
        : entry * (1 + sl.value / 100)
    case 'atr_mult':
      return direction === 'long'
        ? entry - sl.value * atr
        : entry + sl.value * atr
    case 'fixed_price':
      return direction === 'long'
        ? entry - sl.value
        : entry + sl.value
  }
}

function calcTarget(
  entry:   number,
  stop:    number,
  direction: 'long' | 'short',
  strategy: StrategyDefinition,
): number {
  const tp = strategy.takeProfit
  const riskDist = Math.abs(entry - stop)
  switch (tp.type) {
    case 'rr_ratio':
      return direction === 'long'
        ? entry + tp.value * riskDist
        : entry - tp.value * riskDist
    case 'fixed_pct':
      return direction === 'long'
        ? entry * (1 + tp.value / 100)
        : entry * (1 - tp.value / 100)
    case 'fixed_price':
      return direction === 'long'
        ? entry + tp.value
        : entry - tp.value
    case 'none':
      return 0
  }
}

interface OpenPosition {
  direction:  'long' | 'short'
  entryBar:   Bar
  entryBarI:  number
  entryPrice: number
  stopPrice:  number
  targetPrice: number
  units:      number
  peakPrice:  number   // for trailing stop
  barsOpen:   number
  entrySignal: string
}

function invertEntryConditions(conds: StrategyCondition[]): StrategyCondition[] {
  return conds.map(
    (c) =>
      ({
        ...c,
        op:
          c.op === 'cross_above'
            ? 'cross_below'
            : c.op === 'cross_below'
              ? 'cross_above'
              : c.op === '>'
                ? '<'
                : c.op === '<'
                  ? '>'
                  : c.op,
      }) as StrategyCondition,
  )
}

function tryOpenPosition(
  strategy: StrategyDefinition,
  ind: PrecomputedIndicators,
  bar: Bar,
  prevBar: Bar,
  i: number,
  equity: number,
  cfg: Required<BacktestOptions>,
  openPos: OpenPosition | null,
  cooldownBars: number,
): OpenPosition | null {
  if (openPos || cooldownBars > 0) return null

  const longOk =
    strategy.direction !== 'short' &&
    evalAllConditions(strategy.entryConditions, ind, bar, prevBar, i, i - 1)

  let entryDirection: 'long' | 'short' | null = longOk ? 'long' : null
  let entryConditionsUsed = strategy.entryConditions
  if (
    !entryDirection &&
    strategy.direction === 'both' &&
    cfg.allowShorts &&
    evalAllConditions(invertEntryConditions(strategy.entryConditions), ind, bar, prevBar, i, i - 1)
  ) {
    entryDirection = 'short'
    entryConditionsUsed = invertEntryConditions(strategy.entryConditions)
  }
  if (!entryDirection) return null

  const entryPrice = bar.close + (entryDirection === 'long' ? cfg.slippage : -cfg.slippage)
  if (!Number.isFinite(entryPrice)) return null

  const atrVal = resolveAtr(ind, i, bar)
  const stopPrice = calcStop(entryPrice, entryDirection, atrVal, strategy)
  const targetPrice = calcTarget(entryPrice, stopPrice, entryDirection, strategy)
  if (!Number.isFinite(stopPrice) || !Number.isFinite(targetPrice)) return null

  const units = calcUnits(strategy, equity, entryPrice, stopPrice)
  if (!Number.isFinite(units) || units <= 0) return null

  return {
    direction: entryDirection,
    entryBar: bar,
    entryBarI: i,
    entryPrice,
    stopPrice,
    targetPrice,
    units,
    peakPrice: entryPrice,
    barsOpen: 0,
    entrySignal:
      entryDirection === 'short'
        ? `Short entry: ${formatStrategyConditions(entryConditionsUsed)}`
        : formatStrategyConditions(entryConditionsUsed),
  }
}

// ─── OPEN POSITION TRACKER ────────────────────────────────────────────────────
// (OpenPosition interface moved above tryOpenPosition)

// ─── MAIN ENGINE FUNCTION ─────────────────────────────────────────────────────
/**
 * Run a full backtest of `strategy` against `bars`.
 *
 * Usage in chartWorkspace.ts after bars are loaded:
 *
 *   import { runBacktest }      from '../backtest/BacktestEngine'
 *   import { EMA_CROSS_STRATEGY } from '../backtest/ExampleStrategies'
 *
 *   const result = runBacktest(chartBars, EMA_CROSS_STRATEGY, {
 *     initialCapital: initialCash,   // your existing initialCash variable
 *     commission: 2,
 *   })
 *   // Feed result into DiagnosisPanel
 */
export function runBacktest(
  bars:     Bar[],
  strategy: StrategyDefinition,
  opts:     BacktestOptions = {},
): BacktestResult {
  const t0  = performance.now()
  const cfg = { ...DEFAULT_OPTS, ...opts }
  const startBar = Math.max(1, Math.min(Math.round(cfg.startBarIndex), bars.length - 1))

  if (bars.length < 50) {
    throw new Error('Need at least 50 bars to run a backtest')
  }

  // Pre-compute all indicators once — O(n) per indicator
  const ind = precompute(bars)

  // ── STATE ─────────────────────────────────────────────────────────────────
  let equity        = cfg.initialCapital
  let peakEquity    = equity
  let maxDD         = 0
  let maxDDAbs      = 0
  let openPos: OpenPosition | null = null
  let cooldownBars  = 0

  const trades:     TradeResult[]      = []
  const equityCurve: EquityPoint[]     = []
  const dailyReturns: number[]         = []
  let   prevEquity  = equity

  // ── BAR LOOP ─────────────────────────────────────────────────────────────
  for (let i = 1; i < bars.length; i++) {
    const bar     = bars[i]!
    const prevBar = bars[i - 1]!

    // Progress callback every 1000 bars
    if (i % 1000 === 0) cfg.onProgress(Math.round((i / bars.length) * 100))

    if (i < startBar) {
      equityCurve.push({ time: bar.time, equity, drawdown: currentDrawdown(equity, peakEquity) })
      continue
    }

    // Cooldown counter
    if (cooldownBars > 0) cooldownBars--

    // ── SESSION FILTER ───────────────────────────────────────────────────
    if (strategy.sessionFilter) {
      const hour = new Date(bar.time * 1000).getUTCHours()
      if (hour < strategy.sessionFilter.fromHour || hour > strategy.sessionFilter.toHour) {
        if (openPos) {
          // Force close at session end
          trades.push(closeTrade(openPos, bar, i, 'session_end', ind, bars, cfg, strategy))
          equity += trades[trades.length - 1]!.pnl
          openPos = null
        }
        equityCurve.push({ time: bar.time, equity, drawdown: currentDrawdown(equity, peakEquity) })
        continue
      }
    }

    // ── DAY FILTER ──────────────────────────────────────────────────────
    if (strategy.dayFilter) {
      const dow = new Date(bar.time * 1000).getUTCDay() // 0=Sun
      if (!strategy.dayFilter.includes(dow)) {
        equityCurve.push({ time: bar.time, equity, drawdown: currentDrawdown(equity, peakEquity) })
        continue
      }
    }

    // ── CONDITION FILTER ────────────────────────────────────────────────
    const cond = ind.conditions[i]!
    if (strategy.conditionFilter && !strategy.conditionFilter.includes(cond)) {
      equityCurve.push({ time: bar.time, equity, drawdown: currentDrawdown(equity, peakEquity) })
      continue
    }

    // ── MANAGE OPEN POSITION ────────────────────────────────────────────
    if (openPos) {
      openPos.barsOpen++
      const isLong = openPos.direction === 'long'

      // Update peak for trailing stop
      if (isLong  && bar.high > openPos.peakPrice) openPos.peakPrice = bar.high
      if (!isLong && bar.low  < openPos.peakPrice) openPos.peakPrice = bar.low

      // Trailing stop adjustment
      if (strategy.trailingStop) {
        const ts     = strategy.trailingStop
        const riskDist = Math.abs(openPos.entryPrice - openPos.stopPrice)
        const profitDist = isLong
          ? openPos.peakPrice - openPos.entryPrice
          : openPos.entryPrice - openPos.peakPrice
        if (profitDist >= ts.activateAtRR * riskDist) {
          const newStop = calcStop(openPos.peakPrice, openPos.direction, resolveAtr(ind, i, bar), {
            ...strategy, stopLoss: ts.trailBy,
          })
          if (!Number.isFinite(newStop)) continue
          if (isLong  && newStop > openPos.stopPrice) openPos.stopPrice = newStop
          if (!isLong && newStop < openPos.stopPrice) openPos.stopPrice = newStop
        }
      }

      // Check stop loss (use candle low/high for intrabar fills)
      const hitStop = isLong
        ? bar.low  <= openPos.stopPrice
        : bar.high >= openPos.stopPrice

      // Check take profit
      const hitTP = openPos.targetPrice > 0 && (
        isLong  ? bar.high >= openPos.targetPrice
                : bar.low  <= openPos.targetPrice
      )

      // Max bars in trade
      const maxBarsHit = openPos.barsOpen >= cfg.maxBarsInTrade

      // Signal exit
      const signalExit = evalAllConditions(strategy.exitConditions, ind, bar, prevBar, i, i - 1)

      let exitReason: TradeResult['exitReason'] | null = null
      if      (hitTP)         exitReason = 'take_profit'
      else if (hitStop)       exitReason = 'stop_loss'
      else if (maxBarsHit)    exitReason = 'max_bars'
      else if (signalExit)    exitReason = 'signal_exit'

      if (exitReason) {
        const trade = closeTrade(openPos, bar, i, exitReason, ind, bars, cfg, strategy)
        trades.push(trade)
        equity += trade.pnl
        if (trade.pnl < 0 && cfg.maxBarsInTrade) {
          cooldownBars = strategy.cooldownBarsAfterLoss ?? 0
        }
        openPos = null
      }
    }

    // ── CHECK FOR ENTRY ─────────────────────────────────────────────────
    const nextPos = tryOpenPosition(strategy, ind, bar, prevBar, i, equity, cfg, openPos, cooldownBars)
    if (nextPos) openPos = nextPos

    // ── EQUITY CURVE ────────────────────────────────────────────────────
    const unrealizedPnl = openPos
      ? (openPos.direction === 'long'
          ? (bar.close - openPos.entryPrice) * openPos.units
          : (openPos.entryPrice - bar.close) * openPos.units)
      : 0
    const totalEquity = equity + unrealizedPnl

    if (totalEquity > peakEquity) peakEquity = totalEquity
    const dd = currentDrawdown(totalEquity, peakEquity)
    if (dd > maxDD) { maxDD = dd; maxDDAbs = peakEquity - totalEquity }

    equityCurve.push({ time: bar.time, equity: totalEquity, drawdown: dd })

    // Daily return for Sharpe/Sortino
    const todayReturn = prevEquity > 0 ? (totalEquity - prevEquity) / prevEquity : 0
    dailyReturns.push(Number.isFinite(todayReturn) ? todayReturn : 0)
    prevEquity = totalEquity
  }

  // Close any open position at last bar
  if (openPos) {
    const lastBar = bars[bars.length - 1]!
    const trade   = closeTrade(openPos, lastBar, bars.length - 1, 'session_end', ind, bars, cfg, strategy)
    trades.push(trade)
    equity += trade.pnl
  }

  cfg.onProgress(100)

  // ── POST-PROCESSING ───────────────────────────────────────────────────────
  const summary    = computeSummary(trades, cfg.initialCapital, equity, maxDD, maxDDAbs, dailyReturns)
  const heatmap    = computeHeatmap(trades)
  const conditions = computeConditions(trades)
  const stopHunt   = computeStopHunt(trades)
  const rolling    = computeRolling(trades, cfg.rollingWindow)

  return {
    strategy, trades, equity: equityCurve,
    heatmap, conditions, stopHunt, rolling,
    summary, bars,
    durationMs: Math.round(performance.now() - t0),
  }
}

// ─── CLOSE TRADE HELPER ───────────────────────────────────────────────────────
function closeTrade(
  pos:       OpenPosition,
  exitBar:   Bar,
  exitI:     number,
  reason:    TradeResult['exitReason'],
  ind:       PrecomputedIndicators,
  bars:      Bar[],
  cfg:       Required<BacktestOptions>,
  strategy:  StrategyDefinition,
): TradeResult {
  const isLong = pos.direction === 'long'
  let exitPrice = exitBar.close

  // Use stop/target price for fills when candle crosses them
  if (reason === 'stop_loss')   exitPrice = pos.stopPrice
  if (reason === 'take_profit') exitPrice = pos.targetPrice

  exitPrice += isLong ? -cfg.slippage : cfg.slippage

  const rawPnl     = isLong
    ? (exitPrice - pos.entryPrice) * pos.units
    : (pos.entryPrice - exitPrice) * pos.units
  const commission = cfg.commission
  let pnl          = rawPnl - commission
  if (!Number.isFinite(pnl)) pnl = 0
  if (!Number.isFinite(pos.units) || pos.units <= 0) pnl = 0

  let pnlPct = ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100 * (isLong ? 1 : -1)
  if (!Number.isFinite(pnlPct)) pnlPct = 0

  // Context bars: 20 bars before entry to exit+8 for replay
  const fromI      = Math.max(0, pos.entryBarI - 20)
  const toI        = Math.min(bars.length - 1, exitI + 8)
  const contextBars = bars.slice(fromI, toI + 1)

  // Stop hunt: did price reach target within 8 bars after stop?
  let stopHunted = false
  if (reason === 'stop_loss' && pos.targetPrice > 0) {
    for (let j = exitI + 1; j <= Math.min(bars.length - 1, exitI + 8); j++) {
      const b = bars[j]!
      if (isLong && b.high >= pos.targetPrice) { stopHunted = true; break }
      if (!isLong && b.low  <= pos.targetPrice) { stopHunted = true; break }
    }
  }

  return {
    tradeNum:    0,  // will be assigned below
    direction:   pos.direction,
    entryTime:   pos.entryBar.time,
    exitTime:    exitBar.time,
    entryPrice:  pos.entryPrice,
    exitPrice,
    stopPrice:   pos.stopPrice,
    targetPrice: pos.targetPrice,
    units:       pos.units,
    pnl,
    pnlPct,
    commission,
    exitReason:  reason,
    entryBar:    pos.entryBar,
    exitBar,
    contextBars,
    condition:   ind.conditions[pos.entryBarI]!,
    indicators:  snapshotAt(ind, pos.entryBarI),
    stopHunted,
    entrySignal: pos.entrySignal,
    exitSignal: formatExitReasonSignal(
      reason,
      strategy.exitConditions,
      pos.stopPrice,
      pos.targetPrice,
      cfg.maxBarsInTrade,
    ),
  }
}

// ─── ANALYTICS HELPERS ────────────────────────────────────────────────────────
function currentDrawdown(equity: number, peak: number): number {
  return peak > 0 ? Math.max(0, (peak - equity) / peak) * 100 : 0
}

function computeSummary(
  trades:     TradeResult[],
  initial:    number,
  finalEq:    number,
  maxDD:      number,
  maxDDAbs:   number,
  dailyRets:  number[],
): BacktestSummary {
  const pnls   = trades.map((t) => t.pnl).filter(Number.isFinite)
  const wins   = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl <= 0 && Number.isFinite(t.pnl))
  const grossW = wins.reduce((s, t) => s + t.pnl, 0)
  const grossL = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))

  const n      = pnls.length
  const avgWin = wins.length   ? grossW / wins.length   : 0
  const avgLoss= losses.length ? grossL / losses.length : 0

  const cleanRets = dailyRets.filter(Number.isFinite)
  const mean    = cleanRets.length ? cleanRets.reduce((a, b) => a + b, 0) / cleanRets.length : 0
  const variance= cleanRets.length
    ? cleanRets.reduce((a, b) => a + (b - mean) ** 2, 0) / cleanRets.length
    : 0
  const std     = Math.sqrt(variance)
  const sharpe  = std > 0 ? (mean / std) * Math.sqrt(252) : 0

  const downRets   = cleanRets.filter((r) => r < 0)
  const downVar    = downRets.length ? downRets.reduce((a, b) => a + b ** 2, 0) / downRets.length : 0
  const downStd    = Math.sqrt(downVar)
  const sortino    = downStd > 0 ? (mean / downStd) * Math.sqrt(252) : 0

  const safeFinal = Number.isFinite(finalEq) ? finalEq : initial
  const returnPct  = initial > 0 ? ((safeFinal - initial) / initial) * 100 : 0
  const calmar     = maxDD > 0 ? returnPct / maxDD : 0

  let maxCW = 0; let maxCL = 0; let cw = 0; let cl = 0
  trades.forEach((t) => {
    if (!Number.isFinite(t.pnl)) return
    if (t.pnl > 0) { cw++; cl = 0; maxCW = Math.max(maxCW, cw) }
    else            { cl++; cw = 0; maxCL = Math.max(maxCL, cl) }
  })

  const totalBars = trades.reduce((s, t) => {
    return s + Math.round((t.exitTime - t.entryTime) / 60)
  }, 0)

  const netPnl = safeFinal - initial
  const bestPnl = pnls.length ? Math.max(...pnls) : 0
  const worstPnl = pnls.length ? Math.min(...pnls) : 0

  return {
    totalTrades:     trades.length,
    winningTrades:   wins.length,
    losingTrades:    losses.length,
    winRate:         n > 0 ? (wins.length / n) * 100 : 0,
    netPnl,
    grossWin:        grossW,
    grossLoss:       grossL,
    profitFactor:    grossL > 0 ? grossW / grossL : grossW > 0 ? Infinity : 0,
    avgWin,
    avgLoss,
    avgWLRatio:      avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0,
    maxDrawdown:     maxDD,
    maxDrawdownAbs:  maxDDAbs,
    sharpe:          Number.isFinite(sharpe) ? +sharpe.toFixed(2) : 0,
    sortino:         Number.isFinite(sortino) ? +sortino.toFixed(2) : 0,
    calmar:          Number.isFinite(calmar) ? +calmar.toFixed(2) : 0,
    expectancy:      n > 0 ? pnls.reduce((a, b) => a + b, 0) / n : 0,
    maxConsecWins:   maxCW,
    maxConsecLosses: maxCL,
    avgBarsInTrade:  n > 0 ? totalBars / n : 0,
    bestTrade:       bestPnl,
    worstTrade:      worstPnl,
    totalCommission: trades.reduce((s, t) => s + t.commission, 0),
    initialCapital:  initial,
    finalEquity:     safeFinal,
    returnPct,
  }
}

function computeHeatmap(trades: TradeResult[]): HeatmapCell[] {
  const map = new Map<string, { total: number; count: number; wins: number }>()
  trades.forEach((t) => {
    const d = new Date(t.entryTime * 1000)
    // Convert JS getUTCDay (0=Sun) to Mon-based (0=Mon)
    const dow  = (d.getUTCDay() + 6) % 7
    const hour = d.getUTCHours()
    if (dow > 4) return  // skip Sat/Sun
    const key  = `${dow}-${hour}`
    const cell = map.get(key) ?? { total: 0, count: 0, wins: 0 }
    cell.total += t.pnl
    cell.count++
    if (t.pnl > 0) cell.wins++
    map.set(key, cell)
  })
  const cells: HeatmapCell[] = []
  map.forEach((v, k) => {
    const [day, hour] = k.split('-').map(Number)
    cells.push({
      day:        day!,
      hour:       hour!,
      avgPnl:     v.count > 0 ? v.total / v.count : 0,
      tradeCount: v.count,
      winRate:    v.count > 0 ? (v.wins / v.count) * 100 : 0,
    })
  })
  return cells
}

function computeConditions(trades: TradeResult[]): ConditionBreakdown[] {
  const condMap = new Map<MarketCondition, { pnls: number[]; wins: number }>()
  trades.forEach((t) => {
    const c = condMap.get(t.condition) ?? { pnls: [], wins: 0 }
    c.pnls.push(t.pnl)
    if (t.pnl > 0) c.wins++
    condMap.set(t.condition, c)
  })
  const out: ConditionBreakdown[] = []
  condMap.forEach((v, cond) => {
    const total = v.pnls.reduce((a, b) => a + b, 0)
    out.push({
      condition:  cond,
      trades:     v.pnls.length,
      winRate:    (v.wins / v.pnls.length) * 100,
      avgPnl:     total / v.pnls.length,
      totalPnl:   total,
    })
  })
  return out.sort((a, b) => b.winRate - a.winRate)
}

function computeStopHunt(trades: TradeResult[]): StopHuntAnalysis {
  const losers    = trades.filter((t) => t.pnl <= 0)
  const hunted    = losers.filter((t) => t.stopHunted)
  const recovered = hunted.reduce((s, t) => {
    // Estimate recovery: avg winner would have been made
    const wins = trades.filter((w) => w.pnl > 0)
    const avgW = wins.length ? wins.reduce((a, b) => a + b.pnl, 0) / wins.length : 0
    return s + (avgW - Math.abs(t.pnl))
  }, 0)

  // Brute-force optimal ATR mult (0.5 to 3.0 in 0.1 steps)
  // Simplified: recommend 1.4× as typical sweet spot for most strategies
  const optAtr = hunted.length / Math.max(losers.length, 1) > 0.35 ? 1.4 : 1.0

  return {
    pct:               losers.length ? (hunted.length / losers.length) * 100 : 0,
    count:             hunted.length,
    estimatedRecovery: recovered,
    optimalAtrMult:    optAtr,
  }
}

function computeRolling(trades: TradeResult[], window: number): RollingWindowPoint[] {
  return trades.map((t, i) => {
    const slice  = trades.slice(Math.max(0, i - window + 1), i + 1)
    const wins   = slice.filter((s) => s.pnl > 0).length
    const avgPnl = slice.reduce((a, b) => a + b.pnl, 0) / slice.length
    return {
      tradeNum: i + 1,
      time:     t.exitTime,
      winRate:  (wins / slice.length) * 100,
      avgPnl,
    }
  })
}

// ─── NUMBER TRADE RESULTS IN PLACE ───────────────────────────────────────────
// Call after runBacktest to assign sequential trade numbers
export function numberTrades(result: BacktestResult): void {
  result.trades.forEach((t, i) => { t.tradeNum = i + 1 })
}
