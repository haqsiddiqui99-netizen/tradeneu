import type { CheckoutOrder, CheckoutPaymentMethod } from '../views/subscriptionCheckout'
import type { BillingCycle } from '../views/planCatalog'

export type BillingSubscription = {
  email: string
  plan: 'intermediate' | 'pro'
  cycle: BillingCycle
  status: 'active' | 'paused' | 'canceled' | string
  mrr: number
  startedAt: number
  currentPeriodEnd: number
  updatedAt: number
  pausedAt?: number | null
  canceledAt?: number | null
}

export type BillingTransaction = {
  id: string
  email: string
  plan: 'intermediate' | 'pro'
  cycle: BillingCycle
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

export type BillingAddress = {
  fullName: string
  line1: string
  line2: string
  city: string
  region: string
  postalCode: string
  country: string
  updatedAt: number
}

export type MyBilling = {
  subscription: BillingSubscription | null
  transactions: BillingTransaction[]
  address: BillingAddress | null
}

type ActionResult<T extends object = object> = { ok: true } & T | { ok: false; error: string }

async function postBillingAction<T extends object = object>(path: string, body?: object): Promise<ActionResult<T>> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    const parsed = (await res.json().catch(() => null)) as (ActionResult<T> & { ok?: boolean }) | null
    if (!parsed) return { ok: false, error: 'network_error' }
    if (parsed.ok !== true) return { ok: false, error: (parsed as { error?: string }).error || 'request_failed' }
    return parsed as ActionResult<T>
  } catch {
    return { ok: false, error: 'network_error' }
  }
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
      address: body.address ?? null,
    }
  } catch {
    return null
  }
}

export async function recordCheckoutComplete(
  order: CheckoutOrder,
  method: CheckoutPaymentMethod,
): Promise<boolean> {
  const result = await postBillingAction('/api/billing/checkout-complete', {
    plan: order.plan,
    cycle: order.cycle,
    amount: order.amount,
    baseAmount: order.baseAmount,
    taxAmount: order.taxAmount,
    total: order.total,
    couponCode: order.couponCode,
    discountPct: order.discountPct,
    method,
  })
  return result.ok
}

/** Switches an active paid subscription's billing cycle, starting a fresh period from now. */
export async function changeBillingCycle(
  cycle: BillingCycle,
): Promise<ActionResult<{ subscription: BillingSubscription }>> {
  return postBillingAction('/api/billing/change-cycle', { cycle })
}

export async function pauseBillingSubscription(): Promise<ActionResult<{ subscription: BillingSubscription }>> {
  return postBillingAction('/api/billing/pause')
}

export async function resumeBillingSubscription(): Promise<ActionResult<{ subscription: BillingSubscription }>> {
  return postBillingAction('/api/billing/resume')
}

export async function cancelBillingSubscription(): Promise<ActionResult<{ subscription: BillingSubscription }>> {
  return postBillingAction('/api/billing/cancel')
}

export async function saveBillingAddress(
  address: Omit<BillingAddress, 'updatedAt'>,
): Promise<ActionResult<{ address: BillingAddress }>> {
  return postBillingAction('/api/billing/address', address)
}
