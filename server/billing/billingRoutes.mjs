import { readSessionFromRequest } from '../auth/sessionCookie.mjs'
import {
  cancelSubscription,
  changeSubscriptionCycle,
  pauseSubscription,
  readBillingForEmail,
  recordCheckout,
  resumeSubscription,
  saveBillingAddress,
} from './billingStore.mjs'

/**
 * The built-in checkout is a demo: it activates a plan without taking any payment. It must
 * never be reachable in production until a real gateway (with a verified webhook) replaces
 * it, so it is only enabled outside production, or when explicitly forced on for staging
 * with ALLOW_DEMO_CHECKOUT=1.
 */
function demoCheckoutEnabled() {
  if (String(process.env.ALLOW_DEMO_CHECKOUT || '').trim() === '1') return true
  return process.env.NODE_ENV !== 'production'
}

export function mountBillingRoutes(app, { dataDir }) {
  function requireEmail(req, res) {
    const session = readSessionFromRequest(req)
    if (!session?.email) {
      res.status(401).json({ ok: false, error: 'not_authenticated' })
      return null
    }
    return session.email
  }

  app.get('/api/billing/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const email = requireEmail(req, res)
    if (!email) return
    res.json({ ok: true, ...readBillingForEmail(dataDir, email) })
  })

  app.post('/api/billing/checkout-complete', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const email = requireEmail(req, res)
    if (!email) return
    if (!demoCheckoutEnabled()) {
      res.status(403).json({ ok: false, error: 'payments_unavailable' })
      return
    }
    const body = req.body ?? {}
    const result = recordCheckout(dataDir, email, {
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

  app.post('/api/billing/change-cycle', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const email = requireEmail(req, res)
    if (!email) return
    const cycle = String(req.body?.cycle || '')
    const result = changeSubscriptionCycle(dataDir, email, cycle)
    if (!result.ok) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  })

  app.post('/api/billing/pause', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const email = requireEmail(req, res)
    if (!email) return
    const result = pauseSubscription(dataDir, email)
    if (!result.ok) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  })

  app.post('/api/billing/resume', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const email = requireEmail(req, res)
    if (!email) return
    const result = resumeSubscription(dataDir, email)
    if (!result.ok) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  })

  app.post('/api/billing/cancel', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const email = requireEmail(req, res)
    if (!email) return
    const result = cancelSubscription(dataDir, email)
    if (!result.ok) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  })

  app.post('/api/billing/address', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const email = requireEmail(req, res)
    if (!email) return
    const body = req.body ?? {}
    const result = saveBillingAddress(dataDir, email, {
      fullName: body.fullName,
      line1: body.line1,
      line2: body.line2,
      city: body.city,
      region: body.region,
      postalCode: body.postalCode,
      country: body.country,
    })
    if (!result.ok) {
      res.status(400).json(result)
      return
    }
    res.json(result)
  })
}
