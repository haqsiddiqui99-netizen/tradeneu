import { readSessionFromRequest } from '../auth/sessionCookie.mjs'
import { recordCheckout } from './billingStore.mjs'

export function mountBillingRoutes(app, { dataDir }) {
  app.post('/api/billing/checkout-complete', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const session = readSessionFromRequest(req)
    if (!session?.email) {
      res.status(401).json({ ok: false, error: 'not_authenticated' })
      return
    }
    const body = req.body ?? {}
    const result = recordCheckout(dataDir, session.email, {
      plan: body.plan,
      cycle: body.cycle,
      amount: body.amount,
      baseAmount: body.baseAmount,
      taxAmount: body.taxAmount,
      total: body.total,
      couponCode: body.couponCode ?? null,
      discountPct: body.discountPct ?? 0,
      method: body.method ?? 'card',
    })
    if (!result.ok) {
      res.status(400).json(result)
      return
    }
    res.json({ ok: true, subscription: result.subscription })
  })
}
