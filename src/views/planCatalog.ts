/**
 * Single source of truth for plan pricing, limits and the feature comparison
 * grid. The standalone subscription page and the Subscription tab inside
 * Profile Settings both render from here so the two can never quote different
 * numbers for the same plan.
 */

export type AccountTier = 'free' | 'intermediate' | 'pro'

export type BillingCycle = 'monthly' | 'quarterly' | 'yearly'

export type PlanPrice = {
  amount: number
  label: string
  period: string
  original: string
  billed: string
  save: string
}

export function isBillingCycle(value: string | null): value is BillingCycle {
  return value === 'monthly' || value === 'quarterly' || value === 'yearly'
}

export const BILLING_CYCLES: ReadonlyArray<BillingCycle> = ['monthly', 'quarterly', 'yearly']

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

export const PRICING: Record<BillingCycle, { intermediate: PlanPrice; pro: PlanPrice }> = {
  monthly: {
    intermediate: {
      amount: 9,
      label: '9',
      period: '/month',
      original: '$19',
      billed: "That's $0.30/day",
      save: 'Save $10/monthly',
    },
    pro: {
      amount: 19,
      label: '19',
      period: '/month',
      original: '$29',
      billed: "That's $0.63/day",
      save: 'Save $10/monthly',
    },
  },
  quarterly: {
    intermediate: {
      amount: 24,
      label: '24',
      period: '/quarter',
      original: '$57',
      billed: "That's $8/month",
      // List $19×3 = $57 − $24 billed = $33
      save: 'Save $33/quarterly',
    },
    pro: {
      amount: 51,
      label: '51',
      period: '/quarter',
      original: '$87',
      billed: "That's $17/month",
      // List $29×3 = $87 − $51 billed = $36
      save: 'Save $36/quarterly',
    },
  },
  yearly: {
    intermediate: {
      amount: 84,
      label: '84',
      period: '/year',
      original: '$228',
      billed: "That's $7/month",
      // List $19×12 = $228 − $84 billed = $144
      save: 'Save $144/yearly',
    },
    pro: {
      amount: 180,
      label: '180',
      period: '/year',
      original: '$348',
      billed: "That's $15/month",
      // List $29×12 = $348 − $180 billed = $168
      save: 'Save $168/yearly',
    },
  },
}

export const PLAN_NAMES: Record<AccountTier, string> = {
  free: 'Basic Plan',
  intermediate: 'Ultra Plan',
  pro: 'Premium Plan',
}

export const PLAN_BLURBS: Record<AccountTier, string> = {
  free: 'Start improving your trading skills',
  intermediate: 'Optimize and scale your trading game',
  pro: 'Everything you need to achieve profitability',
}

/** Headline entitlements, used for the "what you get" meters and stat rows. */
export const PLAN_LIMITS: Record<
  AccountTier,
  { indicators: string; charts: string; retention: string; trades: string; strategies: string }
> = {
  free: { indicators: '1', charts: '1', retention: '1 week', trades: '50', strategies: 'None' },
  intermediate: { indicators: '3', charts: '2', retention: '6 months', trades: '200', strategies: '3' },
  pro: {
    indicators: 'Unlimited',
    charts: 'Unlimited',
    retention: 'Unlimited',
    trades: 'Unlimited',
    strategies: 'Unlimited',
  },
}

/** Short bullet list shown on the plan cards. */
export const PLAN_HIGHLIGHTS: Record<AccountTier, ReadonlyArray<string>> = {
  free: ['2 backtesting sessions', '1 indicator', '1 week data retention'],
  intermediate: ['10 backtesting sessions', '3 indicators', '6 months data retention', '2 charts'],
  pro: ['Unlimited sessions', 'Unlimited indicators & charts', 'Seconds data · futures / CME', 'Unlimited retention'],
}

export type FeatureRow = { label: string; free: string; mid: string; pro: string }

export const FEATURE_GROUPS: ReadonlyArray<{ title: string; rows: ReadonlyArray<FeatureRow> }> = [
  {
    title: 'Backtesting Features',
    rows: [
      { label: 'Backtesting Sessions', free: '2', mid: '10', pro: 'Unlimited' },
      { label: 'Indicators', free: '1', mid: '3', pro: 'Unlimited' },
      { label: 'Max session duration', free: '1 Month', mid: '6 Months', pro: 'Unlimited' },
      { label: 'Go to feature', free: '3 Times Per Hour', mid: 'Unlimited', pro: 'Unlimited' },
      { label: 'Trades per session', free: '50', mid: '200', pro: 'Unlimited' },
      { label: 'Data retention', free: '1 Week', mid: '6 Months', pro: 'Unlimited' },
      { label: 'Multichart', free: '×', mid: '2 Charts', pro: 'Unlimited' },
      {
        label: 'Economic calendar',
        free: 'One Country, Only Past News, No Chart Bubbles',
        mid: 'Only Two Countries',
        pro: 'Unlimited',
      },
      { label: 'Auto break even', free: '×', mid: '✓', pro: '✓' },
      { label: 'Rewind price', free: '×', mid: '✓', pro: '✓' },
      { label: 'Seconds data', free: '×', mid: '×', pro: '✓' },
      { label: 'Futures and CME data', free: '×', mid: '×', pro: '✓' },
      { label: 'Custom timeframes', free: '×', mid: '×', pro: '✓' },
    ],
  },
  {
    title: 'Analytics Features',
    rows: [
      { label: 'Analytics dashboard', free: 'Limited', mid: 'Unlimited', pro: 'Unlimited' },
      { label: 'Strategies', free: '×', mid: '3', pro: 'Unlimited' },
      { label: 'Strategy analytics', free: '×', mid: '✓', pro: '✓' },
      { label: 'Seconds data', free: '×', mid: '×', pro: '✓' },
      { label: 'Montecarlo Simulator', free: '×', mid: '✓', pro: '✓' },
      { label: 'RR Simulator', free: '×', mid: '✓', pro: '✓' },
      { label: 'Futures and CME data', free: '×', mid: '×', pro: '✓' },
    ],
  },
  {
    title: 'AI Features',
    rows: [
      { label: 'AI Chat Assistant', free: '×', mid: '150 messages / month', pro: '400 messages / month' },
      { label: 'Strategy AI Parser ("make objective")', free: '×', mid: '10 parses / month', pro: '40 parses / month' },
      { label: 'Chat model', free: '—', mid: 'Haiku 4.5', pro: 'Haiku 4.5' },
      { label: 'Strategy parser model', free: '—', mid: 'Sonnet 5', pro: 'Sonnet 5' },
      { label: 'Daily message cap', free: '—', mid: '15 / day', pro: '30 / day' },
      { label: 'Trading-only scope guard', free: '—', mid: '✓', pro: '✓' },
      { label: 'Off-topic refusal logging', free: '—', mid: '✓', pro: '✓' },
    ],
  },
  {
    title: 'Journal Features',
    rows: [
      { label: 'Journal', free: '✓', mid: '✓', pro: '✓' },
      { label: 'Screenshots', free: '1', mid: '2', pro: 'Unlimited' },
      { label: 'Checklists', free: '1', mid: '3', pro: 'Unlimited' },
    ],
  },
]
