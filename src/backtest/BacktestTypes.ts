/**
 * src/backtest/BacktestTypes.ts
 *
 * All TypeScript interfaces for the backtesting engine.
 * Matches your existing Bar type from src/types exactly.
 * Import these in BacktestEngine.ts, StrategyRunner.ts, and BacktestPanel.ts.
 */

import type { Bar } from '../types'

// ─── RE-EXPORT so callers only need one import ────────────────────────────────
export type { Bar }

// ─── MARKET CONDITION ────────────────────────────────────────────────────────
export type MarketCondition = 'trending-up' | 'trending-down' | 'ranging' | 'volatile'

// ─── STRATEGY CONDITION BLOCK ────────────────────────────────────────────────
/** One logical condition: e.g. "EMA9 > EMA21" */
export interface StrategyCondition {
  /** Left-hand indicator value name: 'ema9' | 'ema21' | 'rsi' | 'close' | 'open' | 'high' | 'low' | 'atr' | 'vwap' */
  lhs: IndicatorKey
  /** Comparison operator */
  op: '>' | '<' | '>=' | '<=' | 'cross_above' | 'cross_below' | 'equals'
  /** Right-hand value — another indicator or a fixed number */
  rhs: IndicatorKey | number
}

export type IndicatorKey =
  | 'close' | 'open' | 'high' | 'low' | 'volume'
  | 'ema9' | 'ema21' | 'ema50' | 'ema200'
  | 'sma9' | 'sma21' | 'sma50' | 'sma200'
  | 'rsi14'
  | 'atr14'
  | 'macd_line' | 'macd_signal' | 'macd_hist'
  | 'bb_upper' | 'bb_middle' | 'bb_lower'
  | 'vwap'
  | 'adx14'

// ─── STOP / TARGET CONFIG ────────────────────────────────────────────────────
export type StopMode =
  | { type: 'fixed_pct';   value: number }   // e.g. 0.5 = 0.5% below entry
  | { type: 'atr_mult';    value: number }   // e.g. 1.5 × ATR14
  | { type: 'fixed_price'; value: number }   // absolute price distance

export type TargetMode =
  | { type: 'rr_ratio';    value: number }   // e.g. 2.0 = 2× the stop distance
  | { type: 'fixed_pct';   value: number }
  | { type: 'fixed_price'; value: number }
  | { type: 'none' }                          // no take profit — exit on signal only

// ─── FULL STRATEGY DEFINITION ────────────────────────────────────────────────
export interface StrategyDefinition {
  id:   string
  name: string

  /** Direction: trade longs only, shorts only, or both */
  direction: 'long' | 'short' | 'both'

  /** All conditions must be true simultaneously to trigger entry */
  entryConditions:  StrategyCondition[]

  /** All conditions must be true simultaneously to trigger exit */
  exitConditions:   StrategyCondition[]

  /** Stop loss config */
  stopLoss:   StopMode

  /** Take profit config */
  takeProfit: TargetMode

  /** Trailing stop — after price moves X ATRs in profit, move stop to breakeven */
  trailingStop?: { activateAtRR: number; trailBy: StopMode }

  /** Position sizing */
  positionSize: PositionSizeConfig

  /** Only trade during these UTC hours (inclusive). Omit = all hours. */
  sessionFilter?: { fromHour: number; toHour: number }

  /** Only trade on these weekdays (0=Sun,1=Mon…6=Sat). Omit = all days. */
  dayFilter?: number[]

  /** Only trade when market condition matches. Omit = all conditions. */
  conditionFilter?: MarketCondition[]

  /** Max concurrent open trades */
  maxOpenTrades?: number

  /** Cooldown bars after a loss before next entry is allowed */
  cooldownBarsAfterLoss?: number
}

export type PositionSizeConfig =
  | { type: 'fixed_units';  units: number }           // always trade N lots/units
  | { type: 'fixed_risk';   riskPct: number }          // risk X% of equity per trade
  | { type: 'pct_equity';   pct: number }              // use X% of equity as notional

// ─── TRADE RESULT ────────────────────────────────────────────────────────────
export interface TradeResult {
  /** Sequential trade number */
  tradeNum:     number
  direction:    'long' | 'short'
  entryTime:    number   // unix seconds
  exitTime:     number   // unix seconds
  entryPrice:   number
  exitPrice:    number
  stopPrice:    number
  targetPrice:  number   // 0 if no take profit
  units:        number
  pnl:          number   // net dollars after commission
  pnlPct:       number   // % return on entry notional
  commission:   number
  exitReason:   ExitReason
  entryBar:     Bar
  exitBar:      Bar
  /** Bars from 20 bars before entry to exit+8 — used for replay-from-trade */
  contextBars:  Bar[]
  /** Market condition at entry */
  condition:    MarketCondition
  /** Indicator snapshot at entry */
  indicators:   IndicatorSnapshot
  /** Was this trade stopped out but price returned to target within 8 bars? */
  stopHunted:   boolean
  /** Human-readable entry rules that fired (all must be true). */
  entrySignal:  string
  /** Human-readable exit explanation. */
  exitSignal:   string
}

export type ExitReason =
  | 'stop_loss'
  | 'take_profit'
  | 'signal_exit'
  | 'trailing_stop'
  | 'session_end'
  | 'max_bars'

// ─── INDICATOR VALUES AT A GIVEN BAR ─────────────────────────────────────────
export interface IndicatorSnapshot {
  ema9:       number; ema21:      number; ema50:  number; ema200: number
  sma9:       number; sma21:      number; sma50:  number; sma200: number
  rsi14:      number
  atr14:      number
  macdLine:   number; macdSignal: number; macdHist: number
  bbUpper:    number; bbMiddle:   number; bbLower:  number
  vwap:       number
  adx14:      number
}

// ─── EQUITY CURVE POINT ──────────────────────────────────────────────────────
export interface EquityPoint {
  time:     number   // unix seconds
  equity:   number   // total portfolio value
  drawdown: number   // current drawdown from peak, as positive pct (e.g. 12.4)
}

// ─── LOSS HEATMAP ────────────────────────────────────────────────────────────
export interface HeatmapCell {
  day:        number   // 0=Mon…4=Fri
  hour:       number   // 0–23
  avgPnl:     number
  tradeCount: number
  winRate:    number
}

// ─── CONDITION BREAKDOWN ─────────────────────────────────────────────────────
export interface ConditionBreakdown {
  condition:  MarketCondition
  trades:     number
  winRate:    number
  avgPnl:     number
  totalPnl:   number
}

// ─── STOP HUNT ANALYSIS ──────────────────────────────────────────────────────
export interface StopHuntAnalysis {
  /** % of losing trades where price recovered to target within 8 bars */
  pct:              number
  count:            number
  /** Estimated PnL if stop were 1.4× wider */
  estimatedRecovery: number
  /** Optimal ATR multiplier found by brute-force */
  optimalAtrMult:   number
}

// ─── ROLLING WINDOW STAT ─────────────────────────────────────────────────────
export interface RollingWindowPoint {
  tradeNum: number
  time:     number
  winRate:  number   // rolling N-trade win rate
  avgPnl:   number   // rolling N-trade avg PnL
}

// ─── FULL BACKTEST RESULT ────────────────────────────────────────────────────
export interface BacktestResult {
  strategy:        StrategyDefinition
  trades:          TradeResult[]
  equity:          EquityPoint[]
  heatmap:         HeatmapCell[]
  conditions:      ConditionBreakdown[]
  stopHunt:        StopHuntAnalysis
  rolling:         RollingWindowPoint[]
  summary:         BacktestSummary
  /** Bars used — same reference passed in, for replay wiring */
  bars:            Bar[]
  durationMs:      number   // how long the engine took to run
}

// ─── SUMMARY STATS ───────────────────────────────────────────────────────────
export interface BacktestSummary {
  totalTrades:      number
  winningTrades:    number
  losingTrades:     number
  winRate:          number   // 0–100
  netPnl:           number
  grossWin:         number
  grossLoss:        number
  profitFactor:     number   // grossWin / |grossLoss|
  avgWin:           number
  avgLoss:          number
  avgWLRatio:       number   // avgWin / |avgLoss|
  maxDrawdown:      number   // as positive pct, e.g. 18.4
  maxDrawdownAbs:   number   // in dollars
  sharpe:           number   // annualised Sharpe (Rf=0)
  sortino:          number   // annualised Sortino
  calmar:           number   // CAGR / maxDrawdown
  expectancy:       number   // avg $ per trade
  maxConsecWins:    number
  maxConsecLosses:  number
  avgBarsInTrade:   number
  bestTrade:        number
  worstTrade:       number
  totalCommission:  number
  initialCapital:   number
  finalEquity:      number
  returnPct:        number
}

// ─── ENGINE OPTIONS ───────────────────────────────────────────────────────────
export interface BacktestOptions {
  /** Starting equity in dollars. Defaults to 100,000 */
  initialCapital?:    number
  /** Commission per trade in dollars (round-trip). Defaults to 0 */
  commission?:        number
  /** Slippage in price units (added to buy, subtracted from sell). Defaults to 0 */
  slippage?:          number
  /** Rolling window size for win-rate/PnL stats. Defaults to 20 */
  rollingWindow?:     number
  /** Max bars a trade can stay open before forced exit. Defaults to 200 */
  maxBarsInTrade?:    number
  /** Allow short selling. Defaults to true */
  allowShorts?:       boolean
  /** Pyramid: allow adding to an open position. Defaults to false */
  pyramiding?:        boolean
  /** Progress callback, called every 1000 bars (useful for large datasets) */
  onProgress?:        (pct: number) => void
  /** 1-based bar index to begin entries (indicators still warm on full series). Defaults to 1 */
  startBarIndex?:     number
}
