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
import type { MessageKey } from '../i18n'
import { t } from '../i18n'

export type PlaybookMarket = 'forex' | 'futures' | 'crypto' | 'stocks'
export type PlaybookPace = 'scalp' | 'intraday' | 'swing'
export type PlaybookSession = 'asia' | 'london' | 'newyork' | 'overlap' | 'any'
export type PlaybookRisk = 'conservative' | 'balanced' | 'aggressive'
export type PlaybookLevel = 'beginner' | 'intermediate' | 'advanced'
/** Smallest daily commitment the strategy realistically needs. */
export type PlaybookCommitment = 'under1' | '1to3' | 'full'

type PlaybookEntryCore = {
  id: string
  name: string
  blurbKey: MessageKey
  /** Short, plain-language rule summaries rendered as chips on the match card. */
  tagKeys: MessageKey[]
  markets: PlaybookMarket[]
  pace: PlaybookPace
  sessions: PlaybookSession[]
  risk: PlaybookRisk
  level: PlaybookLevel
  commitment: PlaybookCommitment
  definition: Omit<StrategyDefinition, 'id' | 'name'>
}

export type PlaybookEntry = PlaybookEntryCore & {
  blurb: string
  tags: string[]
}

function definePlaybookEntry(core: PlaybookEntryCore): PlaybookEntry {
  const entry = core as PlaybookEntry
  Object.defineProperties(entry, {
    blurb: {
      get(): string {
        return t(core.blurbKey)
      },
      enumerable: true,
    },
    tags: {
      get(): string[] {
        return core.tagKeys.map((key) => t(key))
      },
      enumerable: true,
    },
  })
  return entry
}

export const STRATEGY_PLAYBOOK: PlaybookEntry[] = [
  definePlaybookEntry({
    id: 'asia-range-break',
    name: 'Asia Range Breakout',
    blurbKey: 'strategy.playbook.asiaRangeBreak.blurb',
    tagKeys: [
      'strategy.playbook.asiaRangeBreak.tag0',
      'strategy.playbook.asiaRangeBreak.tag1',
      'strategy.playbook.asiaRangeBreak.tag2',
    ],
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
  }),
  definePlaybookEntry({
    id: 'london-ignition',
    name: 'London Momentum Ignition',
    blurbKey: 'strategy.playbook.londonIgnition.blurb',
    tagKeys: [
      'strategy.playbook.londonIgnition.tag0',
      'strategy.playbook.londonIgnition.tag1',
      'strategy.playbook.londonIgnition.tag2',
    ],
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
  }),
  definePlaybookEntry({
    id: 'ny-open-drive',
    name: 'New York Opening Drive',
    blurbKey: 'strategy.playbook.nyOpenDrive.blurb',
    tagKeys: [
      'strategy.playbook.nyOpenDrive.tag0',
      'strategy.playbook.nyOpenDrive.tag1',
      'strategy.playbook.nyOpenDrive.tag2',
    ],
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
  }),
  definePlaybookEntry({
    id: 'vwap-fade',
    name: 'VWAP Snap-Back Fade',
    blurbKey: 'strategy.playbook.vwapFade.blurb',
    tagKeys: [
      'strategy.playbook.vwapFade.tag0',
      'strategy.playbook.vwapFade.tag1',
      'strategy.playbook.vwapFade.tag2',
    ],
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
  }),
  definePlaybookEntry({
    id: 'trend-pullback-50',
    name: 'Trend Pullback to the 50',
    blurbKey: 'strategy.playbook.trendPullback50.blurb',
    tagKeys: [
      'strategy.playbook.trendPullback50.tag0',
      'strategy.playbook.trendPullback50.tag1',
      'strategy.playbook.trendPullback50.tag2',
    ],
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
  }),
  definePlaybookEntry({
    id: 'rsi-mean-reversion',
    name: 'RSI Mean Reversion',
    blurbKey: 'strategy.playbook.rsiMeanReversion.blurb',
    tagKeys: [
      'strategy.playbook.rsiMeanReversion.tag0',
      'strategy.playbook.rsiMeanReversion.tag1',
      'strategy.playbook.rsiMeanReversion.tag2',
    ],
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
  }),
  definePlaybookEntry({
    id: 'squeeze-expansion',
    name: 'Squeeze Expansion',
    blurbKey: 'strategy.playbook.squeezeExpansion.blurb',
    tagKeys: [
      'strategy.playbook.squeezeExpansion.tag0',
      'strategy.playbook.squeezeExpansion.tag1',
      'strategy.playbook.squeezeExpansion.tag2',
    ],
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
  }),
  definePlaybookEntry({
    id: 'macd-swing-rider',
    name: 'MACD Swing Rider',
    blurbKey: 'strategy.playbook.macdSwingRider.blurb',
    tagKeys: [
      'strategy.playbook.macdSwingRider.tag0',
      'strategy.playbook.macdSwingRider.tag1',
      'strategy.playbook.macdSwingRider.tag2',
    ],
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
  }),
  definePlaybookEntry({
    id: 'overlap-continuation',
    name: 'Overlap Continuation',
    blurbKey: 'strategy.playbook.overlapContinuation.blurb',
    tagKeys: [
      'strategy.playbook.overlapContinuation.tag0',
      'strategy.playbook.overlapContinuation.tag1',
      'strategy.playbook.overlapContinuation.tag2',
    ],
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
  }),
]
