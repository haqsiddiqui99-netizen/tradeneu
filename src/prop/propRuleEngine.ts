import { localYmdFromSec } from '../data/sessionDateRange'
import type {
  PropBreachReason,
  PropChallengeConfig,
  PropChallengeEval,
  PropChallengeState,
  PropChallengeStatus,
} from './propTypes'

export const DEFAULT_PROP_RULES: PropChallengeConfig = {
  profitTargetPct: 10,
  maxDrawdownPct: 5,
  maxDailyLossPct: 2,
}

export function normalizePropRules(rules?: Partial<PropChallengeConfig> | null): PropChallengeConfig {
  const profit = Number(rules?.profitTargetPct)
  const dd = Number(rules?.maxDrawdownPct)
  const daily = Number(rules?.maxDailyLossPct)
  return {
    profitTargetPct: Number.isFinite(profit) && profit > 0 ? Math.min(100, profit) : DEFAULT_PROP_RULES.profitTargetPct,
    maxDrawdownPct: Number.isFinite(dd) && dd > 0 ? Math.min(50, dd) : DEFAULT_PROP_RULES.maxDrawdownPct,
    maxDailyLossPct: Number.isFinite(daily) && daily > 0 ? Math.min(20, daily) : DEFAULT_PROP_RULES.maxDailyLossPct,
  }
}

export function createInitialPropState(startingEquity: number, barTimeSec?: number): PropChallengeState {
  const ymd = barTimeSec != null && Number.isFinite(barTimeSec) ? localYmdFromSec(barTimeSec) : ''
  return {
    status: 'active',
    startingEquity,
    peakEquity: startingEquity,
    dayStartEquity: startingEquity,
    tradingDayYmd: ymd,
  }
}

function pctChange(from: number, to: number): number {
  if (!Number.isFinite(from) || from <= 0) return 0
  return ((to - from) / from) * 100
}

function breachLabel(reason: PropBreachReason): string {
  return reason === 'max_drawdown' ? 'Max drawdown breached' : 'Daily loss limit breached'
}

function buildActiveCopy(
  rules: PropChallengeConfig,
  profitPct: number,
  drawdownPct: number,
  dailyLossPct: number,
): { headline: string; detail: string } {
  const profitLeft = Math.max(0, rules.profitTargetPct - profitPct)
  const ddLeft = Math.max(0, rules.maxDrawdownPct - drawdownPct)
  const dailyLeft = Math.max(0, rules.maxDailyLossPct - dailyLossPct)
  return {
    headline: `Prop challenge · ${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(2)}% / ${rules.profitTargetPct}% target`,
    detail: `Drawdown ${drawdownPct.toFixed(2)}% of ${rules.maxDrawdownPct}% max · Today −${dailyLossPct.toFixed(2)}% of ${rules.maxDailyLossPct}% daily limit · ${profitLeft.toFixed(1)}% to pass · ${ddLeft.toFixed(1)}% DD buffer · ${dailyLeft.toFixed(1)}% daily buffer`,
  }
}

export function evaluatePropChallenge(args: {
  rules: PropChallengeConfig
  state: PropChallengeState
  equity: number
  barTimeSec: number
  now?: number
}): { state: PropChallengeState; eval: PropChallengeEval } {
  const rules = normalizePropRules(args.rules)
  const equity = args.equity
  const barTimeSec = args.barTimeSec
  const now = args.now ?? Date.now()

  if (args.state.status !== 'active') {
    const profitPct = pctChange(args.state.startingEquity, equity)
    const drawdownPct =
      args.state.peakEquity > 0 ? ((args.state.peakEquity - equity) / args.state.peakEquity) * 100 : 0
    const dailyLossPct =
      args.state.dayStartEquity > 0
        ? Math.max(0, ((args.state.dayStartEquity - equity) / args.state.dayStartEquity) * 100)
        : 0
    const profitProgressPct = Math.min(100, (profitPct / rules.profitTargetPct) * 100)
    const headline =
      args.state.status === 'passed'
        ? `Challenge passed — +${profitPct.toFixed(2)}% profit target reached`
        : `Challenge failed — ${args.state.breachReason ? breachLabel(args.state.breachReason) : 'Rule breached'}`
    const detail =
      args.state.status === 'passed'
        ? `Target was +${rules.profitTargetPct}% on $${args.state.startingEquity.toLocaleString('en-US')}.`
        : `Limits: +${rules.profitTargetPct}% target · ${rules.maxDrawdownPct}% max drawdown · ${rules.maxDailyLossPct}% daily loss.`
    return {
      state: args.state,
      eval: {
        status: args.state.status,
        profitPct,
        drawdownPct,
        dailyLossPct,
        profitProgressPct,
        headline,
        detail,
      },
    }
  }

  let state: PropChallengeState = { ...args.state }
  const ymd = Number.isFinite(barTimeSec) ? localYmdFromSec(barTimeSec) : state.tradingDayYmd

  if (ymd && ymd !== state.tradingDayYmd) {
    state = {
      ...state,
      tradingDayYmd: ymd,
      dayStartEquity: equity,
    }
  } else if (!state.tradingDayYmd && ymd) {
    state = { ...state, tradingDayYmd: ymd }
  }

  state = {
    ...state,
    peakEquity: Math.max(state.peakEquity, equity),
  }

  const profitPct = pctChange(state.startingEquity, equity)
  const drawdownPct = state.peakEquity > 0 ? ((state.peakEquity - equity) / state.peakEquity) * 100 : 0
  const dailyLossPct =
    state.dayStartEquity > 0
      ? Math.max(0, ((state.dayStartEquity - equity) / state.dayStartEquity) * 100)
      : 0
  const profitProgressPct = Math.min(100, Math.max(0, (profitPct / rules.profitTargetPct) * 100))

  let status: PropChallengeStatus = 'active'
  let breachReason: PropBreachReason | undefined
  let headline = ''
  let detail = ''

  if (drawdownPct >= rules.maxDrawdownPct) {
    status = 'failed'
    breachReason = 'max_drawdown'
    headline = `Challenge failed — max drawdown breached (${drawdownPct.toFixed(2)}% / ${rules.maxDrawdownPct}%)`
    detail = `Equity fell ${drawdownPct.toFixed(2)}% from the session peak. Limit was ${rules.maxDrawdownPct}%.`
  } else if (dailyLossPct >= rules.maxDailyLossPct) {
    status = 'failed'
    breachReason = 'daily_loss'
    headline = `Challenge failed — daily loss limit breached (−${dailyLossPct.toFixed(2)}% / ${rules.maxDailyLossPct}%)`
    detail = `Today's loss exceeded the ${rules.maxDailyLossPct}% daily limit.`
  } else if (profitPct >= rules.profitTargetPct) {
    status = 'passed'
    headline = `Challenge passed — +${profitPct.toFixed(2)}% profit target reached`
    detail = `Target was +${rules.profitTargetPct}% on starting equity.`
  } else {
    const copy = buildActiveCopy(rules, profitPct, drawdownPct, dailyLossPct)
    headline = copy.headline
    detail = copy.detail
  }

  if (status !== 'active') {
    state = {
      ...state,
      status,
      breachReason,
      endedAt: now,
    }
  }

  return {
    state,
    eval: {
      status,
      profitPct,
      drawdownPct,
      dailyLossPct,
      profitProgressPct,
      headline,
      detail,
    },
  }
}
