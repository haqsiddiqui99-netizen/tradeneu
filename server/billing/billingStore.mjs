import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { BILLING_CYCLES, PAID_PLANS, planLabel, planMrr, periodEndMs } from './planCatalog.mjs'

const BILLING_DIR = 'billing'
const SUBSCRIPTIONS_FILE = 'subscriptions.json'
const TRANSACTIONS_FILE = 'transactions.jsonl'
const MAX_TX_READ_BYTES = 512 * 1024

function billingDir(dataDir) {
  return path.join(dataDir, BILLING_DIR)
}

function subscriptionsPath(dataDir) {
  return path.join(billingDir(dataDir), SUBSCRIPTIONS_FILE)
}

function transactionsPath(dataDir) {
  return path.join(billingDir(dataDir), TRANSACTIONS_FILE)
}

function newId(prefix) {
  if (typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

/** @param {string} dataDir */
export function readSubscriptionsMap(dataDir) {
  const raw = readJsonFile(subscriptionsPath(dataDir), {})
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw
}

/** @param {string} dataDir @param {Record<string, object>} map */
function writeSubscriptionsMap(dataDir, map) {
  writeJsonFile(subscriptionsPath(dataDir), map)
}

/** @param {string} dataDir @param {{ limit?: number, since?: number }} opts */
export function readTransactions(dataDir, opts = {}) {
  const filePath = transactionsPath(dataDir)
  if (!fs.existsSync(filePath)) return []
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
  const since = opts.since ?? 0
  try {
    const stat = fs.statSync(filePath)
    const start = Math.max(0, stat.size - MAX_TX_READ_BYTES)
    const fd = fs.openSync(filePath, 'r')
    let text
    try {
      const buf = Buffer.alloc(stat.size - start)
      fs.readSync(fd, buf, 0, buf.length, start)
      text = buf.toString('utf8')
    } finally {
      fs.closeSync(fd)
    }
    const lines = text.split('\n').filter((l) => l.trim())
    if (start > 0 && lines.length) lines.shift()
    const rows = []
    for (let i = lines.length - 1; i >= 0 && rows.length < limit; i--) {
      try {
        const row = JSON.parse(lines[i])
        if (!row || typeof row !== 'object') continue
        if (since && typeof row.ts === 'number' && row.ts < since) continue
        rows.push(row)
      } catch {
        /* skip */
      }
    }
    return rows
  } catch {
    return []
  }
}

/**
 * @param {string} dataDir
 * @param {string} email
 * @param {{ plan: string, cycle: string, amount: number, baseAmount: number, taxAmount: number, total: number, couponCode?: string|null, discountPct?: number, method?: string }} order
 */
export function recordCheckout(dataDir, email, order) {
  const key = String(email || '')
    .trim()
    .toLowerCase()
  if (!key) return { ok: false, error: 'missing_email' }

  const plan = String(order.plan || 'free')
  const cycle = String(order.cycle || 'monthly')
  if (!PAID_PLANS.has(plan)) return { ok: false, error: 'invalid_plan' }
  if (!BILLING_CYCLES.has(cycle)) return { ok: false, error: 'invalid_cycle' }

  const now = Date.now()
  const mrr = planMrr(plan, cycle)
  const subs = readSubscriptionsMap(dataDir)
  subs[key] = {
    email: key,
    plan,
    cycle,
    status: 'active',
    mrr,
    startedAt: subs[key]?.startedAt ?? now,
    currentPeriodEnd: periodEndMs(cycle, now),
    updatedAt: now,
  }
  writeSubscriptionsMap(dataDir, subs)

  const tx = {
    id: newId('pay'),
    email: key,
    plan,
    cycle,
    amount: Number(order.amount) || 0,
    baseAmount: Number(order.baseAmount) || 0,
    taxAmount: Number(order.taxAmount) || 0,
    total: Number(order.total) || 0,
    couponCode: order.couponCode || null,
    discountPct: Number(order.discountPct) || 0,
    method: order.method || 'card',
    status: 'paid',
    ts: now,
  }

  try {
    fs.mkdirSync(billingDir(dataDir), { recursive: true })
    fs.appendFileSync(transactionsPath(dataDir), `${JSON.stringify(tx)}\n`, 'utf8')
  } catch (e) {
    console.warn('[billing] transaction append failed:', e?.message || e)
    return { ok: false, error: 'persist_failed' }
  }

  return { ok: true, subscription: subs[key], transaction: tx }
}

/** @param {string} dataDir @param {Array<{ email: string, createdAt?: number|null, lastLoginAt?: number|null, provider?: string }>} users */
export function summarizeGrowth(users) {
  const now = Date.now()
  const d7 = now - 7 * 86_400_000
  const d30 = now - 30 * 86_400_000
  let signupsLast7d = 0
  let signupsLast30d = 0
  let activeLast7d = 0
  let activeLast30d = 0
  const byProvider = { local: 0, google: 0, other: 0 }

  for (const u of users) {
    const created = u.createdAt ?? 0
    const lastLogin = u.lastLoginAt ?? 0
    if (created >= d7) signupsLast7d++
    if (created >= d30) signupsLast30d++
    if (lastLogin >= d7) activeLast7d++
    if (lastLogin >= d30) activeLast30d++
    const p = String(u.provider || 'local').toLowerCase()
    if (p === 'google') byProvider.google++
    else if (p === 'local') byProvider.local++
    else byProvider.other++
  }

  return {
    totalUsers: users.length,
    signupsLast7d,
    signupsLast30d,
    activeLast7d,
    activeLast30d,
    byProvider,
  }
}

/**
 * @param {string} dataDir
 * @param {Array<{ email: string, name?: string, createdAt?: number|null, lastLoginAt?: number|null, provider?: string }>} users
 */
export function summarizeRevenue(dataDir, users) {
  const subs = readSubscriptionsMap(dataDir)
  const transactions = readTransactions(dataDir, { limit: 500 })
  const now = Date.now()
  const d30 = now - 30 * 86_400_000

  const byPlan = { free: 0, intermediate: 0, pro: 0 }
  let mrr = 0
  let payingUsers = 0
  const subscriptionRows = []

  for (const u of users) {
    const key = String(u.email || '').toLowerCase()
    const sub = subs[key]
    const plan = sub?.status === 'active' && PAID_PLANS.has(sub.plan) ? sub.plan : 'free'
    byPlan[plan] = (byPlan[plan] ?? 0) + 1

    if (plan !== 'free' && sub?.status === 'active') {
      payingUsers++
      mrr += sub.mrr ?? planMrr(sub.plan, sub.cycle)
    }

    subscriptionRows.push({
      email: key,
      name: u.name || '',
      provider: u.provider || 'local',
      plan,
      planLabel: planLabel(plan),
      cycle: sub?.cycle ?? null,
      status: sub?.status ?? (plan === 'free' ? 'free' : 'active'),
      mrr: plan === 'free' ? 0 : (sub?.mrr ?? planMrr(plan, sub?.cycle)),
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      startedAt: sub?.startedAt ?? null,
      lastLoginAt: u.lastLoginAt ?? null,
      createdAt: u.createdAt ?? null,
    })
  }

  // Orphan subscriptions (paid but user deleted)
  for (const [key, sub] of Object.entries(subs)) {
    if (!users.some((u) => String(u.email).toLowerCase() === key) && sub?.status === 'active') {
      payingUsers++
      mrr += sub.mrr ?? planMrr(sub.plan, sub.cycle)
      if (sub.plan in byPlan) byPlan[sub.plan]++
      subscriptionRows.push({
        email: key,
        name: '',
        provider: 'unknown',
        plan: sub.plan,
        planLabel: planLabel(sub.plan),
        cycle: sub.cycle ?? null,
        status: sub.status,
        mrr: sub.mrr ?? planMrr(sub.plan, sub.cycle),
        currentPeriodEnd: sub.currentPeriodEnd ?? null,
        startedAt: sub.startedAt ?? null,
        lastLoginAt: null,
        createdAt: null,
      })
    }
  }

  subscriptionRows.sort((a, b) => (b.mrr ?? 0) - (a.mrr ?? 0) || String(a.email).localeCompare(b.email))

  let totalRevenue = 0
  let revenueLast30d = 0
  for (const tx of transactions) {
    const total = Number(tx.total) || 0
    totalRevenue += total
    if (typeof tx.ts === 'number' && tx.ts >= d30) revenueLast30d += total
  }

  const totalUsers = users.length
  const conversionRate = totalUsers > 0 ? Math.round((payingUsers / totalUsers) * 1000) / 10 : 0
  const arpu = payingUsers > 0 ? Math.round((mrr / payingUsers) * 100) / 100 : 0

  return {
    mrr: Math.round(mrr * 100) / 100,
    arr: Math.round(mrr * 12 * 100) / 100,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    revenueLast30d: Math.round(revenueLast30d * 100) / 100,
    payingUsers,
    freeUsers: byPlan.free,
    proUsers: byPlan.intermediate,
    proMaxUsers: byPlan.pro,
    byPlan,
    conversionRate,
    arpu,
    transactionCount: transactions.length,
    subscriptions: subscriptionRows,
    recentTransactions: transactions.slice(0, 50),
  }
}
