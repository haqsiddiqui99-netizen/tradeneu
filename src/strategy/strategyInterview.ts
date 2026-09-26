/**
 * src/strategy/strategyInterview.ts
 *
 * The guided Q&A behind "I'll type it out". The questions are scripted rather
 * than model-generated so the interview is deterministic and always reaches the
 * fields a StrategyDefinition needs; the single AI call happens at the end, once
 * every answer is collected (see buildInterviewDescription).
 */

export type InterviewOption = { id: string; label: string }

export type InterviewAnswers = Record<string, string[]>

export type InterviewQuestion = {
  id: string
  prompt: string
  /** Summary label used when replaying the answer back into the AI prompt. */
  summary: string
  multi?: boolean
  options: InterviewOption[]
  /** Skipped entirely when this returns false for the answers gathered so far. */
  when?: (answers: InterviewAnswers) => boolean
}

/** Recorded when the trader picks "I don't know — suggest one". */
export const SUGGEST_ANSWER = "Not sure \u2014 pick whatever fits the rest of the strategy"

function picked(answers: InterviewAnswers, questionId: string, label: string): boolean {
  return (answers[questionId] ?? []).includes(label)
}

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: 'markets',
    prompt: 'Which markets do you trade?',
    summary: 'Markets',
    multi: true,
    options: [
      { id: 'forex', label: 'Forex' },
      { id: 'futures', label: 'Futures' },
      { id: 'crypto', label: 'Crypto' },
      { id: 'stocks', label: 'Stocks/Equities' },
    ],
  },
  {
    id: 'futuresContracts',
    prompt: 'Which futures contract(s) do you trade?',
    summary: 'Futures contracts',
    multi: true,
    when: (a) => picked(a, 'markets', 'Futures'),
    options: [
      { id: 'nq', label: 'NQ (Nasdaq)' },
      { id: 'es', label: 'ES (S&P 500)' },
      { id: 'gc', label: 'Gold (GC)' },
    ],
  },
  {
    id: 'forexPairs',
    prompt: 'Which pairs do you trade?',
    summary: 'Forex pairs',
    multi: true,
    when: (a) => picked(a, 'markets', 'Forex'),
    options: [
      { id: 'eurusd', label: 'EUR/USD' },
      { id: 'gbpusd', label: 'GBP/USD' },
      { id: 'xauusd', label: 'XAU/USD (Gold)' },
      { id: 'usdjpy', label: 'USD/JPY' },
    ],
  },
  {
    id: 'cryptoPairs',
    prompt: 'Which crypto pairs do you trade?',
    summary: 'Crypto pairs',
    multi: true,
    when: (a) => picked(a, 'markets', 'Crypto'),
    options: [
      { id: 'btc', label: 'BTC/USD' },
      { id: 'eth', label: 'ETH/USD' },
      { id: 'sol', label: 'SOL/USD' },
    ],
  },
  {
    id: 'tickers',
    prompt: 'Which tickers or ETFs do you trade?',
    summary: 'Tickers',
    multi: true,
    when: (a) => picked(a, 'markets', 'Stocks/Equities'),
    options: [
      { id: 'spy', label: 'SPY' },
      { id: 'qqq', label: 'QQQ' },
      { id: 'aapl', label: 'AAPL' },
      { id: 'nvda', label: 'NVDA' },
    ],
  },
  {
    id: 'timeframe',
    prompt: 'What timeframe do you make your decisions on?',
    summary: 'Timeframe',
    options: [
      { id: '1m', label: '1 minute' },
      { id: '5m', label: '5 minute' },
      { id: '15m', label: '15 minute' },
      { id: '1h', label: '1 hour' },
      { id: '4h', label: '4 hour' },
      { id: '1d', label: 'Daily' },
    ],
  },
  {
    id: 'session',
    prompt: 'When during the day do you usually trade?',
    summary: 'Session',
    options: [
      { id: 'london', label: 'London open' },
      { id: 'ny', label: 'New York open' },
      { id: 'asia', label: 'Asian session' },
      { id: 'any', label: 'Any time the setup appears' },
    ],
  },
  {
    id: 'style',
    prompt: 'How would you describe your edge?',
    summary: 'Style',
    options: [
      { id: 'trend', label: 'Trend following' },
      { id: 'meanrev', label: 'Mean reversion' },
      { id: 'breakout', label: 'Breakout' },
      { id: 'scalp', label: 'Scalping' },
    ],
  },
  {
    id: 'entry',
    prompt: 'What has to happen before you take an entry?',
    summary: 'Entry trigger',
    multi: true,
    options: [
      { id: 'ma', label: 'A moving average cross or touch' },
      { id: 'rsi', label: 'RSI reaches an extreme' },
      { id: 'break', label: 'Price breaks a prior high or low' },
      { id: 'pullback', label: 'Price pulls back into a level' },
    ],
  },
  {
    id: 'stop',
    prompt: 'Where does your stop loss go?',
    summary: 'Stop placement',
    options: [
      { id: 'swing', label: 'Beyond the recent swing high/low' },
      { id: 'atr', label: 'A fixed ATR multiple' },
      { id: 'pct', label: 'A fixed percentage' },
      { id: 'points', label: 'A fixed number of points/pips' },
    ],
  },
  {
    id: 'target',
    prompt: 'How do you take profit?',
    summary: 'Profit target',
    options: [
      { id: 'r', label: 'A fixed R multiple (e.g. 2R)' },
      { id: 'atr', label: 'An ATR-based target' },
      { id: 'opposite', label: 'When the opposite signal appears' },
      { id: 'pct', label: 'A fixed percentage' },
    ],
  },
  {
    id: 'risk',
    prompt: 'How much do you risk per trade?',
    summary: 'Risk per trade',
    options: [
      { id: 'half', label: '0.5% of the account' },
      { id: 'one', label: '1% of the account' },
      { id: 'two', label: '2% of the account' },
      { id: 'lot', label: 'A fixed position size' },
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
    'I answered a guided questionnaire about how I trade. Build an objective, testable strategy from these answers.',
    'Where an answer says I am not sure, choose a sensible default that fits the rest of the answers.',
    '',
  ]
  for (const q of INTERVIEW_QUESTIONS) {
    const picks = answers[q.id]
    if (!picks?.length) continue
    lines.push(`${q.summary}: ${picks.join(', ')}`)
  }
  return lines.join('\n')
}
