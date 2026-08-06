import { dashboardPathForUser, resolveAppPath } from '../appPaths'
import { fetchServerAuthUser } from '../auth/authApi'

export type AdminUserRow = {
  email: string
  name: string
  provider: string
  mobile: string
  country: string
  picture: string
  createdAt: number | null
  lastLoginAt: number | null
}

export type TelemetryRow = {
  id: string
  event: 'login' | 'session_created' | 'backtest_completed'
  email: string
  provider: string
  ts: number
  payload: Record<string, unknown>
}

export type AdminStats = {
  totalEvents: number
  byEvent: { login: number; session_created: number; backtest_completed: number }
  uniqueUsers: number
  lastEventAt: number | null
}

export type AdminGrowth = {
  totalUsers: number
  signupsLast7d: number
  signupsLast30d: number
  activeLast7d: number
  activeLast30d: number
  byProvider: { local: number; google: number; other: number }
}

export type AdminSubscriptionRow = {
  email: string
  name: string
  provider: string
  plan: string
  planLabel: string
  cycle: string | null
  status: string
  mrr: number
  currentPeriodEnd: number | null
  startedAt: number | null
  lastLoginAt: number | null
  createdAt: number | null
}

export type AdminTransactionRow = {
  id: string
  email: string
  plan: string
  cycle: string
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

export type AdminRevenue = {
  mrr: number
  arr: number
  totalRevenue: number
  revenueLast30d: number
  payingUsers: number
  freeUsers: number
  proUsers: number
  proMaxUsers: number
  byPlan: { free: number; intermediate: number; pro: number }
  conversionRate: number
  arpu: number
  transactionCount: number
  subscriptions: AdminSubscriptionRow[]
  recentTransactions: AdminTransactionRow[]
}

export type AdminAssetTotal = {
  asset: string
  totalMs: number
  userCount: number
  sessionCount: number
}

export type AdminUserAssetRow = {
  asset: string
  totalMs: number
  sessionCount: number
  lastAt: number | null
}

export type AdminUserActivityRow = {
  email: string
  name: string
  lastActivityAt: number | null
  isLive: boolean
  liveAsset: string | null
  livePage: string | null
  liveAt: number | null
  assets: AdminUserAssetRow[]
  totalPracticeMs: number
}

export type AdminActivity = {
  liveCount: number
  testingToday: number
  topAsset: string | null
  totals: AdminAssetTotal[]
  users: AdminUserActivityRow[]
  liveUsers: AdminUserActivityRow[]
}

export type AdminGuestRow = {
  id: string
  ip: string
  country: string
  timezone: string
  locale: string
  userAgent: string
  lastPage: string
  firstSeenAt: number | null
  lastSeenAt: number | null
  visitCount: number
  sessionCreates: number
  isLive: boolean
  liveAsset: string | null
  livePage: string | null
  assets: AdminUserAssetRow[]
  totalPracticeMs: number
  lastActivityAt: number | null
}

export type AdminGuests = {
  guests: AdminGuestRow[]
  count: number
  liveCount: number
}

export async function fetchAdminMe(): Promise<{ isAdmin: boolean; email: string } | null> {
  try {
    const res = await fetch('/api/admin/me', { credentials: 'include', cache: 'no-store' })
    if (res.ok) {
      const body = (await res.json()) as { ok?: boolean; isAdmin?: boolean; email?: string }
      if (body.ok && body.email) {
        return { isAdmin: body.isAdmin === true, email: body.email }
      }
    }
    const user = await fetchServerAuthUser()
    if (user?.email) {
      return { isAdmin: user.isAdmin === true, email: user.email }
    }
    return null
  } catch {
    return null
  }
}

export async function resolveAuthedHomePath(): Promise<string> {
  const user = await fetchServerAuthUser()
  if (user?.isAdmin) return resolveAppPath('admin')
  const admin = await fetchAdminMe()
  if (admin?.isAdmin) return resolveAppPath('admin')
  return dashboardPathForUser()
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const res = await fetch('/api/admin/users', { credentials: 'include', cache: 'no-store' })
  if (!res.ok) throw new Error('Could not load users')
  const body = (await res.json()) as { ok?: boolean; users?: AdminUserRow[] }
  if (!body.ok || !Array.isArray(body.users)) throw new Error('Invalid users response')
  return body.users
}

export async function fetchAdminTelemetry(opts?: {
  limit?: number
  event?: string
}): Promise<TelemetryRow[]> {
  const params = new URLSearchParams()
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.event) params.set('event', opts.event)
  const qs = params.toString()
  const res = await fetch(`/api/admin/telemetry${qs ? `?${qs}` : ''}`, {
    credentials: 'include',
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Could not load telemetry')
  const body = (await res.json()) as { ok?: boolean; events?: TelemetryRow[] }
  if (!body.ok || !Array.isArray(body.events)) throw new Error('Invalid telemetry response')
  return body.events
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const res = await fetch('/api/admin/stats', { credentials: 'include', cache: 'no-store' })
  if (!res.ok) throw new Error('Could not load stats')
  const body = (await res.json()) as { ok?: boolean; stats?: AdminStats }
  if (!body.ok || !body.stats) throw new Error('Invalid stats response')
  return body.stats
}

export async function fetchAdminGrowth(): Promise<AdminGrowth | null> {
  const res = await fetch('/api/admin/growth', { credentials: 'include', cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Could not load growth stats')
  const body = (await res.json()) as { ok?: boolean; growth?: AdminGrowth }
  if (!body.ok || !body.growth) throw new Error('Invalid growth response')
  return body.growth
}

export async function fetchAdminRevenue(): Promise<AdminRevenue | null> {
  const res = await fetch('/api/admin/revenue', { credentials: 'include', cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Could not load revenue')
  const body = (await res.json()) as { ok?: boolean; revenue?: AdminRevenue }
  if (!body.ok || !body.revenue) throw new Error('Invalid revenue response')
  return body.revenue
}

export function deriveGrowthFromUsers(users: AdminUserRow[]): AdminGrowth {
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
  return { totalUsers: users.length, signupsLast7d, signupsLast30d, activeLast7d, activeLast30d, byProvider }
}

export function emptyRevenueFromUsers(users: AdminUserRow[]): AdminRevenue {
  const subscriptions = users.map((u) => ({
    email: u.email.toLowerCase(),
    name: u.name || '',
    provider: u.provider || 'local',
    plan: 'free',
    planLabel: 'Free',
    cycle: null,
    status: 'free',
    mrr: 0,
    currentPeriodEnd: null,
    startedAt: null,
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt ?? null,
  }))
  return {
    mrr: 0,
    arr: 0,
    totalRevenue: 0,
    revenueLast30d: 0,
    payingUsers: 0,
    freeUsers: users.length,
    proUsers: 0,
    proMaxUsers: 0,
    byPlan: { free: users.length, intermediate: 0, pro: 0 },
    conversionRate: 0,
    arpu: 0,
    transactionCount: 0,
    subscriptions,
    recentTransactions: [],
  }
}

export function emptyAdminActivity(): AdminActivity {
  return {
    liveCount: 0,
    testingToday: 0,
    topAsset: null,
    totals: [],
    users: [],
    liveUsers: [],
  }
}

export async function fetchAdminActivity(): Promise<AdminActivity | null> {
  const res = await fetch('/api/admin/activity', { credentials: 'include', cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Could not load activity')
  const body = (await res.json()) as { ok?: boolean; activity?: AdminActivity }
  if (!body.ok || !body.activity) throw new Error('Invalid activity response')
  return body.activity
}

export function emptyAdminGuests(): AdminGuests {
  return { guests: [], count: 0, liveCount: 0 }
}

export async function fetchAdminGuests(): Promise<AdminGuests | null> {
  const res = await fetch('/api/admin/guests', { credentials: 'include', cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Could not load guests')
  const body = (await res.json()) as {
    ok?: boolean
    guests?: AdminGuestRow[]
    count?: number
    liveCount?: number
  }
  if (!body.ok || !Array.isArray(body.guests)) throw new Error('Invalid guests response')
  return {
    guests: body.guests,
    count: body.count ?? body.guests.length,
    liveCount: body.liveCount ?? 0,
  }
}
