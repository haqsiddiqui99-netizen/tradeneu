import type { CheckoutOrder, CheckoutPaymentMethod } from '../views/subscriptionCheckout'

export type BillingSubscription = {
  email: string
  plan: 'intermediate' | 'pro'
  cycle: 'monthly' | 'quarterly' | 'yearly'
  status: string
  mrr: number
  startedAt: number
  currentPeriodEnd: number
  updatedAt: number
}

export type BillingTransaction = {
  id: string
  email: string
  plan: 'intermediate' | 'pro'
  cycle: 'monthly' | 'quarterly' | 'yearly'
  amount: number
  baseAmount: number
  taxAmount: number
  total: number
  couponCode: string | null
  discountPct: number
  method: string
  status: string
  ts: number
}

export type MyBilling = {
  subscription: BillingSubscription | null
  transactions: BillingTransaction[]
}

export async function fetchMyBilling(): Promise<MyBilling | null> {
  try {
    const res = await fetch('/api/billing/me', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { ok?: boolean } & Partial<MyBilling>
    if (body.ok !== true) return null
    return {
      subscription: body.subscription ?? null,
      transactions: Array.isArray(body.transactions) ? body.transactions : [],
    }
  } catch {
    return null
  }
}

export async function recordCheckoutComplete(
  order: CheckoutOrder,
  method: CheckoutPaymentMethod,
): Promise<boolean> {
  try {
    const res = await fetch('/api/billing/checkout-complete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        plan: order.plan,
        cycle: order.cycle,
        amount: order.amount,
        baseAmount: order.baseAmount,
        taxAmount: order.taxAmount,
        total: order.total,
        couponCode: order.couponCode,
        discountPct: order.discountPct,
        method,
      }),
    })
    if (!res.ok) return false
    const body = (await res.json()) as { ok?: boolean }
    return body.ok === true
  } catch {
    return false
  }
}
