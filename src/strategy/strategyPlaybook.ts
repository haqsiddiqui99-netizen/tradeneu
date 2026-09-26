/**
 * src/strategy/strategyPlaybook.ts
 *
 * Curated, Tradeneu-authored strategy templates that the "I need a strategy"
 * flow ranks against a trader's profile.
 *
 * Every entry carries a real StrategyDefinition, so adding a match produces a
 * strategy the backtest engine can run immediately — the profile metadata above
 * it exists purely so strategyMatch.ts can score and explain the fit.
 */
import type { StrategyDefinition } from '../backtest/BacktestTypes'

export type PlaybookMarket = 'forex' | 'futures' | 'crypto' | 'stocks'
export type PlaybookPace = 'scalp' | 'intraday' | 'swing'
export type PlaybookSession = 'asia' | 'london' | 'newyork' | 'overlap' | 'any'
export type PlaybookRisk = 'conservative' | 'balanced' | 'aggressive'
export type PlaybookLevel = 'beginner' | 'intermediate' | 'advanced'
/** Smallest daily commitment the strategy realistically needs. */
export type PlaybookCommitment = 'under1' | '1to3' | 'full'

export type PlaybookEntry = {
  id: string
  name: string
  blurb: string
  /** Short, plain-language rule summaries rendered as chips on the match card. */
  tags: string[]
  markets: PlaybookMarket[]
  pace: PlaybookPace
  sessions: PlaybookSession[]
  risk: PlaybookRisk
  level: PlaybookLevel
  commitment: PlaybookCommitment
  definition: Omit<StrategyDefinition, 'id' | 'name'>
}

export const STRATEGY_PLAYBOOK: PlaybookEntry[] = [
  {
    id: 'asia-range-break',
    name: 'Asia Range Breakout',
    blurb:
      'Mark the quiet Asian range, then trade the first clean push out of it. Mechanical, early, and easy to judge because the level is set before you sit down.',
    tags: ['Asia session window', 'Breaks the overnight range', 'Volatility-scaled stop'],
    markets: ['forex', 'futures'],
    pace: 'scalp',
    sessions: ['asia'],
    risk: 'balanced',
    level: 'beginner',
    commitment: 'under1',
    definition: {
      direction: 'both',
      entryConditions: [{ lhs: 'close', op: 'cross_above', rhs: 'bb_upper' }],
      exitConditions: [{ lhs: 'close', op: 'cross_below', rhs: 'bb_middle' }],
      stopLoss: { type: 'atr_mult', value: 1.2 },
      takeProfit: { type: 'rr_ratio', value: 1.8 },
      positionSize: { type: 'fixed_risk', riskPct: 1 },
      sessionFilter: { fromHour: 0, toHour: 6 },
      dayFilter: [1, 2, 3, 4, 5],
      maxOpenTrades: 1,
    },
  },
  {
    id: 'london-ignition',
    name: 'London Momentum Ignition',
    blurb:
      'The London open often sets the day\u2019s direction. Wait for the fast average to take the slow one with trend strength confirming, then ride the impulse.',
    tags: ['EMA 9/21 cross', 'ADX trend filter', 'London session only'],
    markets: ['forex'],
    pace: 'intraday',
    sessions: ['london'],
    risk: 'aggressive',
    level: 'intermediate',
    commitment: '1to3',
    definition: {
      direction: 'both',
      entryConditions: [
        { lhs: 'ema9', op: 'cross_above', rhs: 'ema21' },
        { lhs: 'adx14', op: '>', rhs: 22 },
      ],
      exitConditions: [{ lhs: 'ema9', op: 'cross_below', rhs: 'ema21' }],
      stopLoss: { type: 'atr_mult', value: 1.5 },
      takeProfit: { type: 'rr_ratio', value: 2 },
      positionSize: { type: 'fixed_risk', riskPct: 1 },
      sessionFilter: { fromHour: 7, toHour: 11 },
      dayFilter: [1, 2, 3, 4, 5],
      maxOpenTrades: 1,
    },
  },
  {
    id: 'ny-open-drive',
    name: 'New York Opening Drive',
    blurb:
      'Trade the directional shove off the US cash open while price holds the session mean. Short window, high attention, quick decisions.',
    tags: ['Above VWAP', 'MACD momentum flip', 'First hours of NY'],
    markets: ['futures', 'stocks'],
    pace: 'scalp',
    sessions: ['newyork'],
    risk: 'aggressive',
    level: 'intermediate',
    commitment: 'under1',
    definition: {
      direction: 'both',
      entryConditions: [
        { lhs: 'close', op: '>', rhs: 'vwap' },
        { lhs: 'macd_line', op: 'cross_above', rhs: 'macd_signal' },
      ],
      exitConditions: [{ lhs: 'close', op: 'cross_below', rhs: 'vwap' }],
      stopLoss: { type: 'atr_mult', value: 1.2 },
      takeProfit: { type: 'rr_ratio', value: 1.5 },
      positionSize: { type: 'fixed_risk', riskPct: 1 },
      sessionFilter: { fromHour: 13, toHour: 16 },
      dayFilter: [1, 2, 3, 4, 5],
      maxOpenTrades: 1,
    },
  },
  {
    id: 'vwap-fade',
    name: 'VWAP Snap-Back Fade',
    blurb:
      'When price stretches far below the session mean and momentum is washed out, fade the move back toward VWAP. Patient, counter-trend, tight risk.',
    tags: ['Oversold RSI', 'Outside lower band', 'Targets the session mean'],
    markets: ['futures', 'stocks'],
    pace: 'scalp',
    sessions: ['overlap', 'newyork'],
    risk: 'conservative',
    level: 'advanced',
    commitment: 'full',
    definition: {
      direction: 'long',
      entryConditions: [
        { lhs: 'close', op: '<', rhs: 'bb_lower' },
        { lhs: 'rsi14', op: '<', rhs: 32 },
      ],
      exitConditions: [{ lhs: 'close', op: 'cross_above', rhs: 'vwap' }],
      stopLoss: { type: 'atr_mult', value: 1 },
      takeProfit: { type: 'rr_ratio', value: 1.5 },
      positionSize: { type: 'fixed_risk', riskPct: 0.5 },
      sessionFilter: { fromHour: 12, toHour: 17 },
      maxOpenTrades: 1,
      cooldownBarsAfterLoss: 5,
    },
  },
  {
    id: 'trend-pullback-50',
    name: 'Trend Pullback to the 50',
    blurb:
      'Only trade with the long-term trend, and only when price comes back to the 50-period average. Few signals, but each one is easy to sit through.',
    tags: ['Above the 200 EMA', 'Reclaims the 50 EMA', 'Wide volatility stop'],
    markets: ['forex', 'stocks', 'crypto'],
    pace: 'swing',
    sessions: ['any'],
    risk: 'balanced',
    level: 'beginner',
    commitment: 'under1',
    definition: {
      direction: 'long',
      entryConditions: [
        { lhs: 'close', op: '>', rhs: 'ema200' },
        { lhs: 'close', op: 'cross_above', rhs: 'ema50' },
      ],
      exitConditions: [{ lhs: 'close', op: 'cross_below', rhs: 'ema50' }],
      stopLoss: { type: 'atr_mult', value: 2 },
      takeProfit: { type: 'rr_ratio', value: 2.5 },
      positionSize: { type: 'fixed_risk', riskPct: 1 },
      maxOpenTrades: 2,
    },
  },
  {
    id: 'rsi-mean-reversion',
    name: 'RSI Mean Reversion',
    blurb:
      'Buy genuine exhaustion and let price revert to the middle. About as simple as a rule set gets, which makes it a good first system to study.',
    tags: ['RSI below 30', 'Exits near the midline', 'Fixed percentage stop'],
    markets: ['crypto', 'stocks'],
    pace: 'swing',
    sessions: ['any'],
    risk: 'conservative',
    level: 'beginner',
    commitment: 'under1',
    definition: {
      direction: 'long',
      entryConditions: [{ lhs: 'rsi14', op: '<', rhs: 30 }],
      exitConditions: [{ lhs: 'rsi14', op: '>', rhs: 55 }],
      stopLoss: { type: 'fixed_pct', value: 2 },
      takeProfit: { type: 'rr_ratio', value: 2 },
      positionSize: { type: 'fixed_risk', riskPct: 0.5 },
      maxOpenTrades: 2,
    },
  },
  {
    id: 'squeeze-expansion',
    name: 'Squeeze Expansion',
    blurb:
      'Quiet, compressed ranges tend to resolve violently. Enter as the bands give way with trend strength building, and hold for a larger multiple.',
    tags: ['Band expansion break', 'ADX rising', 'Runs for 2.5R'],
    markets: ['crypto', 'futures'],
    pace: 'intraday',
    sessions: ['any'],
    risk: 'aggressive',
    level: 'advanced',
    commitment: '1to3',
    definition: {
      direction: 'both',
      entryConditions: [
        { lhs: 'close', op: 'cross_above', rhs: 'bb_upper' },
        { lhs: 'adx14', op: '>', rhs: 20 },
      ],
      exitConditions: [{ lhs: 'close', op: 'cross_below', rhs: 'bb_middle' }],
      stopLoss: { type: 'atr_mult', value: 1.8 },
      takeProfit: { type: 'rr_ratio', value: 2.5 },
      positionSize: { type: 'fixed_risk', riskPct: 1.5 },
      maxOpenTrades: 1,
    },
  },
  {
    id: 'macd-swing-rider',
    name: 'MACD Swing Rider',
    blurb:
      'Catch the momentum turn in the direction of the trend and stay in until momentum rolls over. No fixed target — the exit signal does the work.',
    tags: ['MACD signal cross', 'Above the 50 EMA', 'Exits on signal, no target'],
    markets: ['stocks', 'forex'],
    pace: 'swing',
    sessions: ['any'],
    risk: 'balanced',
    level: 'intermediate',
    commitment: 'under1',
    definition: {
      direction: 'long',
      entryConditions: [
        { lhs: 'macd_line', op: 'cross_above', rhs: 'macd_signal' },
        { lhs: 'close', op: '>', rhs: 'ema50' },
      ],
      exitConditions: [{ lhs: 'macd_line', op: 'cross_below', rhs: 'macd_signal' }],
      stopLoss: { type: 'atr_mult', value: 2.5 },
      takeProfit: { type: 'none' },
      positionSize: { type: 'fixed_risk', riskPct: 1 },
      maxOpenTrades: 2,
    },
  },
  {
    id: 'overlap-continuation',
    name: 'Overlap Continuation',
    blurb:
      'The London/New York overlap is the deepest liquidity of the day. Join the established direction while price stays on the right side of the mean.',
    tags: ['Above 21 EMA and VWAP', 'ADX confirmation', 'Overlap hours only'],
    markets: ['forex', 'futures'],
    pace: 'intraday',
    sessions: ['overlap'],
    risk: 'balanced',
    level: 'intermediate',
    commitment: '1to3',
    definition: {
      direction: 'both',
      entryConditions: [
        { lhs: 'close', op: '>', rhs: 'ema21' },
        { lhs: 'close', op: '>', rhs: 'vwap' },
        { lhs: 'adx14', op: '>', rhs: 20 },
      ],
      exitConditions: [{ lhs: 'close', op: 'cross_below', rhs: 'ema21' }],
      stopLoss: { type: 'atr_mult', value: 1.5 },
      takeProfit: { type: 'rr_ratio', value: 2 },
      positionSize: { type: 'fixed_risk', riskPct: 1 },
      sessionFilter: { fromHour: 12, toHour: 16 },
      dayFilter: [1, 2, 3, 4, 5],
      maxOpenTrades: 1,
    },
  },
]
