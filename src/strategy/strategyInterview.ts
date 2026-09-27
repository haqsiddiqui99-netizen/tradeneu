/**
 * src/strategy/strategyInterview.ts
 *
 * The guided Q&A behind "I'll type it out". The questions are scripted rather
 * than model-generated so the interview is deterministic and always reaches the
 * fields a StrategyDefinition needs; the single AI call happens at the end, once
 * every answer is collected (see buildInterviewDescription).
 */
import { t, type MessageKey } from '../i18n'

export type InterviewOption = { id: string; msgKey: MessageKey }

export type InterviewAnswers = Record<string, string[]>

export type InterviewQuestion = {
  id: string
  promptKey: MessageKey
  /** Summary label used when replaying the answer back into the AI prompt. */
  summaryKey: MessageKey
  multi?: boolean
  options: InterviewOption[]
  /** Skipped entirely when this returns false for the answers gathered so far. */
  when?: (answers: InterviewAnswers) => boolean
}

/** Recorded when the trader picks "I don't know — suggest one". */
export const SUGGEST_ANSWER = 'Not sure \u2014 pick whatever fits the rest of the strategy'

function picked(answers: InterviewAnswers, questionId: string, optionId: string): boolean {
  return (answers[questionId] ?? []).includes(optionId)
}

function labelForPick(question: InterviewQuestion, pick: string): string {
  if (pick === SUGGEST_ANSWER) return pick
  const opt = question.options.find((o) => o.id === pick)
  if (opt) return t(opt.msgKey)
  return pick
}

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'markets',
    promptKey: 'strategy.interview.q.markets.prompt',
    summaryKey: 'strategy.interview.q.markets.summary',
    multi: true,
    options: [
      { id: 'forex', msgKey: 'strategy.interview.q.markets.opt.forex' },
      { id: 'futures', msgKey: 'strategy.interview.q.markets.opt.futures' },
      { id: 'crypto', msgKey: 'strategy.interview.q.markets.opt.crypto' },
      { id: 'stocks', msgKey: 'strategy.interview.q.markets.opt.stocks' },
    ],
  },
  {
    id: 'futuresContracts',
    promptKey: 'strategy.interview.q.futuresContracts.prompt',
    summaryKey: 'strategy.interview.q.futuresContracts.summary',
    multi: true,
    when: (a) => picked(a, 'markets', 'futures'),
    options: [
      { id: 'nq', msgKey: 'strategy.interview.q.futuresContracts.opt.nq' },
      { id: 'es', msgKey: 'strategy.interview.q.futuresContracts.opt.es' },
      { id: 'gc', msgKey: 'strategy.interview.q.futuresContracts.opt.gc' },
    ],
  },
  {
    id: 'forexPairs',
    promptKey: 'strategy.interview.q.forexPairs.prompt',
    summaryKey: 'strategy.interview.q.forexPairs.summary',
    multi: true,
    when: (a) => picked(a, 'markets', 'forex'),
    options: [
      { id: 'eurusd', msgKey: 'strategy.interview.q.forexPairs.opt.eurusd' },
      { id: 'gbpusd', msgKey: 'strategy.interview.q.forexPairs.opt.gbpusd' },
      { id: 'xauusd', msgKey: 'strategy.interview.q.forexPairs.opt.xauusd' },
      { id: 'usdjpy', msgKey: 'strategy.interview.q.forexPairs.opt.usdjpy' },
    ],
  },
  {
    id: 'cryptoPairs',
    promptKey: 'strategy.interview.q.cryptoPairs.prompt',
    summaryKey: 'strategy.interview.q.cryptoPairs.summary',
    multi: true,
    when: (a) => picked(a, 'markets', 'crypto'),
    options: [
      { id: 'btc', msgKey: 'strategy.interview.q.cryptoPairs.opt.btc' },
      { id: 'eth', msgKey: 'strategy.interview.q.cryptoPairs.opt.eth' },
      { id: 'sol', msgKey: 'strategy.interview.q.cryptoPairs.opt.sol' },
    ],
  },
  {
    id: 'tickers',
    promptKey: 'strategy.interview.q.tickers.prompt',
    summaryKey: 'strategy.interview.q.tickers.summary',
    multi: true,
    when: (a) => picked(a, 'markets', 'stocks'),
    options: [
      { id: 'spy', msgKey: 'strategy.interview.q.tickers.opt.spy' },
      { id: 'qqq', msgKey: 'strategy.interview.q.tickers.opt.qqq' },
      { id: 'aapl', msgKey: 'strategy.interview.q.tickers.opt.aapl' },
      { id: 'nvda', msgKey: 'strategy.interview.q.tickers.opt.nvda' },
    ],
  },
  {
    id: 'timeframe',
    promptKey: 'strategy.interview.q.timeframe.prompt',
    summaryKey: 'strategy.interview.q.timeframe.summary',
    options: [
      { id: '1m', msgKey: 'strategy.interview.q.timeframe.opt.1m' },
      { id: '5m', msgKey: 'strategy.interview.q.timeframe.opt.5m' },
      { id: '15m', msgKey: 'strategy.interview.q.timeframe.opt.15m' },
      { id: '1h', msgKey: 'strategy.interview.q.timeframe.opt.1h' },
      { id: '4h', msgKey: 'strategy.interview.q.timeframe.opt.4h' },
      { id: '1d', msgKey: 'strategy.interview.q.timeframe.opt.1d' },
    ],
  },
  {
    id: 'session',
    promptKey: 'strategy.interview.q.session.prompt',
    summaryKey: 'strategy.interview.q.session.summary',
    options: [
      { id: 'london', msgKey: 'strategy.interview.q.session.opt.london' },
      { id: 'ny', msgKey: 'strategy.interview.q.session.opt.ny' },
      { id: 'asia', msgKey: 'strategy.interview.q.session.opt.asia' },
      { id: 'any', msgKey: 'strategy.interview.q.session.opt.any' },
    ],
  },
  {
    id: 'style',
    promptKey: 'strategy.interview.q.style.prompt',
    summaryKey: 'strategy.interview.q.style.summary',
    options: [
      { id: 'trend', msgKey: 'strategy.interview.q.style.opt.trend' },
      { id: 'meanrev', msgKey: 'strategy.interview.q.style.opt.meanrev' },
      { id: 'breakout', msgKey: 'strategy.interview.q.style.opt.breakout' },
      { id: 'scalp', msgKey: 'strategy.interview.q.style.opt.scalp' },
    ],
  },
  {
    id: 'entry',
    promptKey: 'strategy.interview.q.entry.prompt',
    summaryKey: 'strategy.interview.q.entry.summary',
    multi: true,
    options: [
      { id: 'ma', msgKey: 'strategy.interview.q.entry.opt.ma' },
      { id: 'rsi', msgKey: 'strategy.interview.q.entry.opt.rsi' },
      { id: 'break', msgKey: 'strategy.interview.q.entry.opt.break' },
      { id: 'pullback', msgKey: 'strategy.interview.q.entry.opt.pullback' },
    ],
  },
  {
    id: 'stop',
    promptKey: 'strategy.interview.q.stop.prompt',
    summaryKey: 'strategy.interview.q.stop.summary',
    options: [
      { id: 'swing', msgKey: 'strategy.interview.q.stop.opt.swing' },
      { id: 'atr', msgKey: 'strategy.interview.q.stop.opt.atr' },
      { id: 'pct', msgKey: 'strategy.interview.q.stop.opt.pct' },
      { id: 'points', msgKey: 'strategy.interview.q.stop.opt.points' },
    ],
  },
  {
    id: 'target',
    promptKey: 'strategy.interview.q.target.prompt',
    summaryKey: 'strategy.interview.q.target.summary',
    options: [
      { id: 'r', msgKey: 'strategy.interview.q.target.opt.r' },
      { id: 'atr', msgKey: 'strategy.interview.q.target.opt.atr' },
      { id: 'opposite', msgKey: 'strategy.interview.q.target.opt.opposite' },
      { id: 'pct', msgKey: 'strategy.interview.q.target.opt.pct' },
    ],
  },
  {
    id: 'risk',
    promptKey: 'strategy.interview.q.risk.prompt',
    summaryKey: 'strategy.interview.q.risk.summary',
    options: [
      { id: 'half', msgKey: 'strategy.interview.q.risk.opt.half' },
      { id: 'one', msgKey: 'strategy.interview.q.risk.opt.one' },
      { id: 'two', msgKey: 'strategy.interview.q.risk.opt.two' },
      { id: 'lot', msgKey: 'strategy.interview.q.risk.opt.lot' },
    ],
  },
]

/** The next question that still applies, or null once the interview is done. */
export function nextInterviewQuestion(
  answers: InterviewAnswers,
  askedIds: string[],
): InterviewQuestion | null {
  for (const q of INTERVIEW_QUESTIONS) {
    if (askedIds.includes(q.id)) continue
    if (q.when && !q.when(answers)) continue
    return q
  }
  return null
}

/**
 * Flattens the interview into the free-text description the objectify endpoint
 * expects, so the guided path reuses the same server route as pasted rules.
 */
export function buildInterviewDescription(answers: InterviewAnswers): string {
  const lines: string[] = [
    t('strategy.interview.descIntro1'),
    t('strategy.interview.descIntro2'),
    '',
  ]
  for (const q of INTERVIEW_QUESTIONS) {
    const picks = answers[q.id]
    if (!picks?.length) continue
    lines.push(`${t(q.summaryKey)}: ${picks.map((p) => labelForPick(q, p)).join(', ')}`)
  }
  return lines.join('\n')
}
