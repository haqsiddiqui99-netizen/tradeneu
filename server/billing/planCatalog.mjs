/** Plan catalog — mirrors src/views/subscriptionCheckout.ts pricing. */
export const PLANS = {
  free: {
    id: 'free',
    label: 'Free',
    monthlyPrice: 0,
    yearlyTotal: 0,
    yearlyMonthlyEquiv: 0,
  },
  intermediate: {
    id: 'intermediate',
    label: 'Pro',
    monthlyPrice: 9,
    yearlyTotal: 84,
    yearlyMonthlyEquiv: 7,
  },
  pro: {
    id: 'pro',
    label: 'Pro Max',
    monthlyPrice: 19,
    yearlyTotal: 180,
    yearlyMonthlyEquiv: 15,
  },
}

export const PAID_PLANS = new Set(['intermediate', 'pro'])
export const BILLING_CYCLES = new Set(['monthly', 'yearly'])

/** @param {'free'|'intermediate'|'pro'} plan @param {'monthly'|'yearly'|null|undefined} cycle */
export function planMrr(plan, cycle) {
  if (!plan || plan === 'free') return 0
  const p = PLANS[plan]
  if (!p) return 0
  if (cycle === 'yearly') return p.yearlyMonthlyEquiv
  return p.monthlyPrice
}

/** @param {'free'|'intermediate'|'pro'} plan */
export function planLabel(plan) {
  return PLANS[plan]?.label ?? plan
}

/** @param {'monthly'|'yearly'} cycle @param {number} ts */
export function periodEndMs(cycle, ts = Date.now()) {
  const days = cycle === 'yearly' ? 365 : 30
  return ts + days * 86_400_000
}
