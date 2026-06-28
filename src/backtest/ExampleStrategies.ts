/**
 * src/backtest/ExampleStrategies.ts
 *
 * Ready-to-run strategy definitions.
 * Pass any of these directly to runBacktest(bars, strategy, opts).
 *
 * Users can copy and modify these as templates in your strategy builder UI.
 */

import type { StrategyDefinition } from './BacktestTypes'

// ─── 1. EMA CROSSOVER ─────────────────────────────────────────────────────────
/** Classic EMA9 × EMA21 crossover. Long only. ATR stop. 2:1 R:R */
export const EMA_CROSS: StrategyDefinition = {
  id:        'ema_cross',
  name:      'EMA 9/21 Crossover',
  direction: 'long',

  entryConditions: [
    { lhs: 'ema9', op: 'cross_above', rhs: 'ema21' },
  ],
  exitConditions: [
    { lhs: 'ema9', op: 'cross_below', rhs: 'ema21' },
  ],

  stopLoss:    { type: 'atr_mult',  value: 1.5 },
  takeProfit:  { type: 'rr_ratio',  value: 2.0 },

  positionSize: { type: 'fixed_risk', riskPct: 1 },   // risk 1% equity per trade

  sessionFilter: { fromHour: 8, toHour: 18 },
  dayFilter:     [1, 2, 3, 4, 5],                      // Mon–Fri only

  cooldownBarsAfterLoss: 3,
}

// ─── 2. RSI MEAN REVERSION ────────────────────────────────────────────────────
/** Buy oversold RSI14 < 30, exit at RSI > 60. Works best in ranging markets. */
export const RSI_MEAN_REVERSION: StrategyDefinition = {
  id:        'rsi_mean_rev',
  name:      'RSI Mean Reversion',
  direction: 'both',

  entryConditions: [
    { lhs: 'rsi14', op: '<', rhs: 30 },
    { lhs: 'close', op: '>', rhs: 'bb_lower' },   // not breaking below lower band
  ],
  exitConditions: [
    { lhs: 'rsi14', op: '>', rhs: 60 },
  ],

  stopLoss:   { type: 'fixed_pct', value: 0.5 },
  takeProfit: { type: 'rr_ratio',  value: 1.5 },

  positionSize: { type: 'fixed_risk', riskPct: 0.5 },

  conditionFilter: ['ranging'],   // only trade in ranging markets
  maxOpenTrades:   1,
}

// ─── 3. BOLLINGER BAND BREAKOUT ───────────────────────────────────────────────
/** Price closes above upper band after squeeze (low ATR period) → long. */
export const BB_BREAKOUT: StrategyDefinition = {
  id:        'bb_breakout',
  name:      'Bollinger Band Breakout',
  direction: 'long',

  entryConditions: [
    { lhs: 'close',    op: 'cross_above', rhs: 'bb_upper' },
    { lhs: 'rsi14',    op: '>',           rhs: 50 },
    { lhs: 'macd_hist',op: '>',           rhs: 0 },
  ],
  exitConditions: [
    { lhs: 'close', op: 'cross_below', rhs: 'bb_middle' },
  ],

  stopLoss:    { type: 'atr_mult', value: 2.0 },
  takeProfit:  { type: 'rr_ratio', value: 2.5 },

  trailingStop: {
    activateAtRR: 1.5,
    trailBy: { type: 'atr_mult', value: 1.0 },
  },

  positionSize: { type: 'fixed_risk', riskPct: 1 },

  conditionFilter:       ['trending-up', 'volatile'],
  cooldownBarsAfterLoss:  5,
}

// ─── 4. MACD + EMA TREND ──────────────────────────────────────────────────────
/** MACD histogram crosses positive while price above EMA50. Trend-following. */
export const MACD_TREND: StrategyDefinition = {
  id:        'macd_trend',
  name:      'MACD + EMA50 Trend',
  direction: 'both',

  entryConditions: [
    { lhs: 'macd_hist', op: 'cross_above', rhs: 0 },
    { lhs: 'close',     op: '>',           rhs: 'ema50' },
    { lhs: 'adx14',     op: '>',           rhs: 20 },
  ],
  exitConditions: [
    { lhs: 'macd_hist', op: 'cross_below', rhs: 0 },
  ],

  stopLoss:    { type: 'atr_mult', value: 1.5 },
  takeProfit:  { type: 'none' },                  // exit on signal only

  trailingStop: {
    activateAtRR: 1.0,
    trailBy: { type: 'atr_mult', value: 1.5 },
  },

  positionSize: { type: 'fixed_risk', riskPct: 1.5 },

  conditionFilter:       ['trending-up', 'trending-down'],
  sessionFilter:         { fromHour: 7, toHour: 20 },
  cooldownBarsAfterLoss:  2,
}

// ─── 5. VWAP REVERSION (intraday) ────────────────────────────────────────────
/** Price touches VWAP from above after a pullback in an uptrend. */
export const VWAP_REVERSION: StrategyDefinition = {
  id:        'vwap_rev',
  name:      'VWAP Pullback',
  direction: 'long',

  entryConditions: [
    { lhs: 'close',  op: 'cross_above', rhs: 'vwap' },
    { lhs: 'ema9',   op: '>',           rhs: 'ema21' },
    { lhs: 'rsi14',  op: '>',           rhs: 45 },
  ],
  exitConditions: [
    { lhs: 'close', op: '<', rhs: 'vwap' },
  ],

  stopLoss:    { type: 'atr_mult', value: 1.0 },
  takeProfit:  { type: 'rr_ratio', value: 2.0 },

  positionSize:  { type: 'fixed_risk', riskPct: 1 },
  sessionFilter: { fromHour: 9, toHour: 15 },   // intraday hours only
  dayFilter:     [1, 2, 3, 4, 5],

  cooldownBarsAfterLoss: 4,
}

// ─── STRATEGY CATALOG ────────────────────────────────────────────────────────
/** All built-in strategies — display in your strategy picker UI */
export const BUILT_IN_STRATEGIES: StrategyDefinition[] = [
  EMA_CROSS,
  RSI_MEAN_REVERSION,
  BB_BREAKOUT,
  MACD_TREND,
  VWAP_REVERSION,
]
