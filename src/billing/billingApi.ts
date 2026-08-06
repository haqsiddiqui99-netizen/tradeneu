import type { CheckoutOrder, CheckoutPaymentMethod } from '../views/subscriptionCheckout'

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
