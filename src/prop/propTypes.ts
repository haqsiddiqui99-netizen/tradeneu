/** Challenge limits configured when creating a prop firm session. */
export type PropChallengeConfig = {
  /** Profit target as % gain on starting equity (e.g. 10 = +10%). */
  profitTargetPct: number
  /** Max drawdown from equity peak as % (e.g. 5 = −5% from peak). */
  maxDrawdownPct: number
  /** Max loss from start-of-day equity as % (e.g. 2 = −2% today). */
  maxDailyLossPct: number
}

export type PropChallengeStatus = 'active' | 'passed' | 'failed'

export type PropBreachReason = 'max_drawdown' | 'daily_loss'

export type PropChallengeState = {
  status: PropChallengeStatus
  startingEquity: number
  peakEquity: number
  dayStartEquity: number
  /** Local calendar day `YYYY-MM-DD` for daily loss tracking. */
  tradingDayYmd: string
  breachReason?: PropBreachReason
  endedAt?: number
}

export type PropChallengeEval = {
  status: PropChallengeStatus
  profitPct: number
  drawdownPct: number
  dailyLossPct: number
  profitProgressPct: number
  headline: string
  detail: string
}
