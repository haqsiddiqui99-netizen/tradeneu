import '../home/traderLocal.css'
import '../home/dashboardTheme.css'
import { clearAllAuthSessions, getAuthUser } from '../auth/authSession'
import { resolveAppPath } from '../appPaths'
import {
  deriveGrowthFromUsers,
  emptyAdminActivity,
  emptyAdminGuests,
  emptyRevenueFromUsers,
  fetchAdminActivity,
  fetchAdminGuests,
  fetchAdminGrowth,
  fetchAdminRevenue,
  fetchAdminStats,
  fetchAdminTelemetry,
  fetchAdminUsers,
  type AdminActivity,
  type AdminGuestRow,
  type AdminGuests,
  type AdminGrowth,
  type AdminRevenue,
  type AdminStats,
  type AdminSubscriptionRow,
  type AdminTransactionRow,
  type AdminUserRow,
  type TelemetryRow,
} from '../admin/adminApi'
import { formatPulseDuration } from '../home/dashboardPerfStats'
import { readDisplayName } from '../home/dashboardUserPrefs'

type AdminTab = 'overview' | 'revenue' | 'users' | 'guests' | 'activity'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatTs(ts: number | null | undefined): string {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return '—'
  }
}

function formatMobile(mobile: string | null | undefined): string {
  const raw = String(mobile || '').trim()
  if (!raw) return '—'
  const digits = raw.replace(/\D/g, '')
  if (!digits) return raw
  if (raw.startsWith('+')) return raw
  return `+${digits}`
}

function formatPracticeDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`
  return formatPulseDuration(ms)
}

function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`
}

function formatAssetSummary(ms: number, sessionCount: number): string {
  const parts: string[] = []
  if (ms > 0) parts.push(formatPracticeDuration(ms))
  if (sessionCount > 0) parts.push(`${sessionCount} session${sessionCount === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : '—'
}

function formatEventLabel(event: string): string {
  if (event === 'session_created') return 'Session created'
  if (event === 'backtest_completed') return 'Backtest completed'
  if (event === 'login') return 'Login'
  return event
}

function planBadgeClass(plan: string): string {
  if (plan === 'pro') return 'sx-admin-plan-badge--max'
  if (plan === 'intermediate') return 'sx-admin-plan-badge--pro'
  return 'sx-admin-plan-badge--free'
}

function appendElementsFromHtml(host: HTMLElement, html: string) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  for (const node of Array.from(t.content.children)) {
    host.appendChild(node)
  }
}

function renderPulseKpi(
  titleId: string,
  title: string,
  sub: string,
  items: { label: string; value: string; meta: string; tone?: 'ok' | 'warn' }[],
): string {
  return `
    <section class="sx-dash-pulse sx-dash-pulse--pro sx-dash-pulse--kpi-only" aria-labelledby="${titleId}">
      <div class="sx-dash-pulse__head">
        <div>
          <h3 id="${titleId}" class="sx-dash-pulse__title">${escapeHtml(title)}</h3>
          <p class="sx-dash-pulse__sub">${escapeHtml(sub)}</p>
        </div>
      </div>
      <div class="sx-dash-pulse__kpi" role="group" aria-label="${escapeHtml(title)}">
        ${items
          .map(
            (item) => `
          <div class="sx-dash-pulse__kpi-item">
            <div class="sx-dash-pulse__kpi-top">
              <span class="sx-dash-pulse__kpi-label">${escapeHtml(item.label)}</span>
            </div>
            <p class="sx-dash-pulse__kpi-value${item.tone === 'ok' ? ' sx-dash-pulse__kpi-value--ok' : item.tone === 'warn' ? ' sx-dash-pulse__kpi-value--warn' : ''}">${escapeHtml(item.value)}</p>
            <p class="sx-dash-pulse__kpi-meta">${escapeHtml(item.meta)}</p>
          </div>`,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderRevenueKpis(revenue: AdminRevenue): string {
  return renderPulseKpi('sx-admin-revenue-kpi', 'Revenue', 'Subscription income and plan mix.', [
    { label: 'MRR', value: formatMoney(revenue.mrr), meta: 'Monthly recurring revenue', tone: revenue.mrr > 0 ? 'ok' : undefined },
    { label: 'ARR', value: formatMoney(revenue.arr), meta: 'Annual run rate (MRR × 12)' },
    { label: 'Total collected', value: formatMoney(revenue.totalRevenue), meta: `${revenue.transactionCount} payments` },
    { label: 'Last 30 days', value: formatMoney(revenue.revenueLast30d), meta: 'Recent cash collected' },
    { label: 'Paying users', value: String(revenue.payingUsers), meta: `${revenue.conversionRate}% conversion` },
    { label: 'ARPU', value: formatMoney(revenue.arpu), meta: 'Avg revenue per paying user' },
  ])
}

function renderGrowthKpis(growth: AdminGrowth): string {
  return renderPulseKpi('sx-admin-growth-kpi', 'User growth', 'Registrations and active accounts.', [
    { label: 'Total users', value: String(growth.totalUsers), meta: 'Registered accounts' },
    { label: 'Signups (7d)', value: String(growth.signupsLast7d), meta: 'New this week' },
    { label: 'Signups (30d)', value: String(growth.signupsLast30d), meta: 'New this month' },
    { label: 'Active (7d)', value: String(growth.activeLast7d), meta: 'Logged in recently' },
    { label: 'Active (30d)', value: String(growth.activeLast30d), meta: 'Monthly actives' },
    {
      label: 'Providers',
      value: `${growth.byProvider.local}L / ${growth.byProvider.google}G`,
      meta: 'Local vs Google sign-in',
    },
  ])
}

function renderEngagementKpis(stats: AdminStats): string {
  return renderPulseKpi('sx-admin-engage-kpi', 'Product activity', 'Telemetry from backtests and sessions.', [
    { label: 'Logins', value: String(stats.byEvent.login), meta: 'Auth events' },
    { label: 'Sessions created', value: String(stats.byEvent.session_created), meta: 'New backtests' },
    { label: 'Backtests run', value: String(stats.byEvent.backtest_completed), meta: 'Completed runs' },
    { label: 'Unique users', value: String(stats.uniqueUsers), meta: 'With telemetry' },
    { label: 'Events tracked', value: String(stats.totalEvents), meta: 'All event types' },
    { label: 'Last event', value: formatTs(stats.lastEventAt), meta: 'Most recent activity' },
  ])
}

function renderLiveDeskKpis(activity: AdminActivity): string {
  return renderPulseKpi('sx-admin-live-kpi', 'Live desk', 'Who is testing now and top assets by practice time.', [
    {
      label: 'Live now',
      value: String(activity.liveCount),
      meta: 'On chart in last 2 min',
      tone: activity.liveCount > 0 ? 'ok' : undefined,
    },
    { label: 'Active today', value: String(activity.testingToday), meta: 'Users with activity' },
    { label: 'Top asset', value: activity.topAsset || '—', meta: 'Most practice time' },
    {
      label: 'Tracked assets',
      value: String(activity.totals.length),
      meta: 'With sessions or practice',
    },
  ])
}

function renderAssetTotalsTable(totals: AdminActivity['totals']): string {
  if (!totals.length) {
    return `
      <div class="sx-admin-empty">
        <p class="sx-admin-empty__title">No asset usage yet</p>
        <p class="sx-admin-empty__sub">Open a chart session to start tracking practice time per symbol.</p>
      </div>
    `
  }
  const rows = totals
    .map(
      (t) => `
      <tr>
        <td class="sx-admin-table__email">${escapeHtml(t.asset)}</td>
        <td>${formatPracticeDuration(t.totalMs)}</td>
        <td>${t.userCount}</td>
        <td>${t.sessionCount}</td>
      </tr>`,
    )
    .join('')
  return `
    <div class="sx-admin-table-wrap">
      <table class="sx-admin-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Practice time</th>
            <th>Users</th>
            <th>Sessions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function renderUserActivityTable(users: AdminActivity['users']): string {
  if (!users.length) {
    return `
      <div class="sx-admin-empty">
        <p class="sx-admin-empty__title">No user activity yet</p>
        <p class="sx-admin-empty__sub">Per-user asset breakdown appears after sessions and chart usage.</p>
      </div>
    `
  }
  const rows = users
    .map((u) => {
      const assetChips = u.assets.length
        ? u.assets
            .slice(0, 4)
            .map(
              (a) =>
                `<span class="sx-admin-asset-chip">${escapeHtml(a.asset)} <span class="sx-admin-asset-chip__dur">(${escapeHtml(formatAssetSummary(a.totalMs, a.sessionCount))})</span></span>`,
            )
            .join('')
        : '<span class="sx-admin-table__muted">—</span>'
      const liveCell = u.isLive
        ? `<span class="sx-admin-live"><span class="sx-admin-live__dot" aria-hidden="true"></span>${escapeHtml(u.liveAsset || '—')}</span>`
        : '<span class="sx-admin-table__muted">—</span>'
      return `
      <tr>
        <td>
          <div class="sx-admin-user-cell">
            <span class="sx-admin-table__email">${escapeHtml(u.name || u.email)}</span>
            ${u.name ? `<span class="sx-admin-user-cell__sub">${escapeHtml(u.email)}</span>` : ''}
          </div>
        </td>
        <td>${liveCell}</td>
        <td class="sx-admin-asset-chips">${assetChips}</td>
        <td class="sx-admin-table__muted">${formatPracticeDuration(u.totalPracticeMs)}</td>
        <td class="sx-admin-table__muted">${formatTs(u.lastActivityAt)}</td>
      </tr>`
    })
    .join('')
  return `
    <div class="sx-admin-table-wrap">
      <table class="sx-admin-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Live asset</th>
            <th>Assets tested</th>
            <th>Total practice</th>
            <th>Last activity</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function renderActivitySections(activity: AdminActivity): string {
  return `
    ${renderLiveDeskKpis(activity)}
    <section class="sx-dash-recent-sessions sx-dash-card-surface overflow-hidden rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] px-5 py-4 sm:px-6 sm:py-5" aria-labelledby="sx-admin-asset-totals">
      <h3 id="sx-admin-asset-totals" class="mb-3 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Asset usage (totals)</h3>
      ${renderAssetTotalsTable(activity.totals)}
    </section>
    <section class="sx-dash-recent-sessions sx-dash-card-surface overflow-hidden rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] px-5 py-4 sm:px-6 sm:py-5" aria-labelledby="sx-admin-user-activity">
      <h3 id="sx-admin-user-activity" class="mb-3 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Who is testing what</h3>
      ${renderUserActivityTable(activity.users)}
    </section>
  `
}

function renderPlanMix(revenue: AdminRevenue): string {
  const total = revenue.freeUsers + revenue.proUsers + revenue.proMaxUsers || 1
  const rows = [
    { label: 'Free', count: revenue.freeUsers, pct: Math.round((revenue.freeUsers / total) * 100), cls: 'free' },
    { label: 'Ultra Plan', count: revenue.proUsers, pct: Math.round((revenue.proUsers / total) * 100), cls: 'pro' },
    { label: 'Premium Plan', count: revenue.proMaxUsers, pct: Math.round((revenue.proMaxUsers / total) * 100), cls: 'max' },
  ]
  return `
    <section class="sx-dash-recent-sessions sx-dash-card-surface overflow-hidden rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] px-5 py-4 sm:px-6 sm:py-5" aria-labelledby="sx-admin-plan-mix">
      <h3 id="sx-admin-plan-mix" class="mb-3 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Plan distribution</h3>
      <div class="sx-admin-plan-mix">
        ${rows
          .map(
            (r) => `
          <div class="sx-admin-plan-mix__row">
            <div class="sx-admin-plan-mix__head">
              <span class="sx-admin-plan-badge sx-admin-plan-badge--${r.cls}">${escapeHtml(r.label)}</span>
              <span class="sx-admin-plan-mix__count">${r.count} users · ${r.pct}%</span>
            </div>
            <div class="sx-admin-plan-mix__track" role="presentation">
              <div class="sx-admin-plan-mix__fill sx-admin-plan-mix__fill--${r.cls}" style="width:${Math.max(r.pct, r.count > 0 ? 4 : 0)}%"></div>
            </div>
          </div>`,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderTransactionsTable(transactions: AdminTransactionRow[]): string {
  if (!transactions.length) {
    return `
      <div class="sx-admin-empty">
        <p class="sx-admin-empty__title">No payments recorded yet</p>
        <p class="sx-admin-empty__sub">Payments appear here when users complete checkout while signed in.</p>
      </div>
    `
  }
  const rows = transactions
    .map(
      (tx) => `
      <tr>
        <td class="sx-admin-table__muted">${formatTs(tx.ts)}</td>
        <td class="sx-admin-table__email">${escapeHtml(tx.email)}</td>
        <td><span class="sx-admin-plan-badge ${planBadgeClass(tx.plan)}">${escapeHtml(tx.plan === 'pro' ? 'Premium Plan' : tx.plan === 'intermediate' ? 'Ultra Plan' : tx.plan)}</span></td>
        <td>${escapeHtml(tx.cycle)}</td>
        <td>${formatMoney(tx.total)}</td>
        <td><span class="sx-admin-provider-badge">${escapeHtml(tx.method)}</span></td>
        <td><span class="sx-admin-tx-status sx-admin-tx-status--paid">${escapeHtml(tx.status)}</span></td>
      </tr>`,
    )
    .join('')
  return `
    <div class="sx-admin-table-wrap">
      <table class="sx-admin-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>User</th>
            <th>Plan</th>
            <th>Cycle</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function renderSubscriptionsTable(subs: AdminSubscriptionRow[]): string {
  const paid = subs.filter((s) => s.plan !== 'free')
  if (!paid.length) {
    return `
      <div class="sx-admin-empty">
        <p class="sx-admin-empty__title">No active paid subscriptions</p>
        <p class="sx-admin-empty__sub">Upgrade a test account via Subscription → checkout to populate this list.</p>
      </div>
    `
  }
  const rows = paid
    .map(
      (s) => `
      <tr>
        <td class="sx-admin-table__email">${escapeHtml(s.email)}</td>
        <td>${escapeHtml(s.name || '—')}</td>
        <td><span class="sx-admin-plan-badge ${planBadgeClass(s.plan)}">${escapeHtml(s.planLabel)}</span></td>
        <td>${escapeHtml(s.cycle || '—')}</td>
        <td>${formatMoney(s.mrr)}/mo</td>
        <td class="sx-admin-table__muted">${formatTs(s.currentPeriodEnd)}</td>
        <td><span class="sx-admin-tx-status sx-admin-tx-status--active">${escapeHtml(s.status)}</span></td>
      </tr>`,
    )
    .join('')
  return `
    <div class="sx-admin-table-wrap">
      <table class="sx-admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Plan</th>
            <th>Billing</th>
            <th>MRR</th>
            <th>Renews</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function formatLocation(country: string, timezone: string, locale: string): string {
  const parts: string[] = []
  if (country) parts.push(country)
  if (timezone) parts.push(timezone)
  else if (locale) parts.push(locale)
  return parts.length ? parts.join(' · ') : '—'
}

function formatUserAgentShort(ua: string): string {
  const raw = String(ua || '').trim()
  if (!raw) return '—'
  if (raw.length <= 48) return raw
  return `${raw.slice(0, 45)}…`
}

function renderGuestKpis(guests: AdminGuests): string {
  const todayStart = Date.now() - 86_400_000
  const guestsToday = guests.guests.filter((g) => (g.firstSeenAt ?? 0) >= todayStart).length
  const withSessions = guests.guests.filter((g) => g.sessionCreates > 0).length
  return renderPulseKpi('sx-admin-guest-kpi', 'Guest traffic', 'Anonymous skip-login visitors and their sessions.', [
    {
      label: 'Total guests',
      value: String(guests.count),
      meta: 'Unique browser sessions tracked',
    },
    {
      label: 'Live now',
      value: String(guests.liveCount),
      meta: 'Active in last 2 min',
      tone: guests.liveCount > 0 ? 'ok' : undefined,
    },
    { label: 'New today', value: String(guestsToday), meta: 'First seen in 24h' },
    { label: 'With backtests', value: String(withSessions), meta: 'Created at least one session' },
  ])
}

function renderGuestsTable(guests: AdminGuestRow[]): string {
  if (!guests.length) {
    return `
      <div class="sx-admin-empty">
        <p class="sx-admin-empty__title">No guest sessions yet</p>
        <p class="sx-admin-empty__sub">Visitors who skip login will appear here with IP, location hints, and activity.</p>
      </div>
    `
  }
  const rows = guests
    .map((g) => {
      const assetChips = g.assets.length
        ? g.assets
            .slice(0, 3)
            .map(
              (a) =>
                `<span class="sx-admin-asset-chip">${escapeHtml(a.asset)} <span class="sx-admin-asset-chip__dur">(${escapeHtml(formatAssetSummary(a.totalMs, a.sessionCount))})</span></span>`,
            )
            .join('')
        : '<span class="sx-admin-table__muted">—</span>'
      const liveCell = g.isLive
        ? `<span class="sx-admin-live"><span class="sx-admin-live__dot" aria-hidden="true"></span>${escapeHtml(g.liveAsset || g.lastPage || 'online')}</span>`
        : '<span class="sx-admin-table__muted">—</span>'
      return `
      <tr>
        <td class="sx-admin-table__email" title="${escapeHtml(g.id)}">${escapeHtml(g.id.slice(0, 8))}…</td>
        <td>${escapeHtml(g.ip || '—')}</td>
        <td>${escapeHtml(formatLocation(g.country, g.timezone, g.locale))}</td>
        <td>${liveCell}</td>
        <td class="sx-admin-asset-chips">${assetChips}</td>
        <td>${g.sessionCreates}</td>
        <td>${g.visitCount}</td>
        <td class="sx-admin-table__muted">${formatPracticeDuration(g.totalPracticeMs)}</td>
        <td class="sx-admin-table__muted" title="${escapeHtml(g.userAgent)}">${escapeHtml(formatUserAgentShort(g.userAgent))}</td>
        <td class="sx-admin-table__muted">${formatTs(g.firstSeenAt)}</td>
        <td class="sx-admin-table__muted">${formatTs(g.lastSeenAt)}</td>
      </tr>`
    })
    .join('')
  return `
    <div class="sx-admin-table-wrap">
      <table class="sx-admin-table">
        <thead>
          <tr>
            <th>Guest ID</th>
            <th>IP</th>
            <th>Location</th>
            <th>Live</th>
            <th>Assets</th>
            <th>Sessions</th>
            <th>Visits</th>
            <th>Practice</th>
            <th>Browser</th>
            <th>First seen</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function renderUsersTable(users: AdminUserRow[], subs: AdminSubscriptionRow[]): string {
  if (!users.length) {
    return `
      <div class="sx-admin-empty">
        <p class="sx-admin-empty__title">No registered users yet</p>
        <p class="sx-admin-empty__sub">Accounts will appear here after sign-up.</p>
      </div>
    `
  }
  const subByEmail = new Map(subs.map((s) => [s.email.toLowerCase(), s]))
  const rows = users
    .map((u) => {
      const sub = subByEmail.get(u.email.toLowerCase())
      const plan = sub?.plan ?? 'free'
      const planLabel = sub?.planLabel ?? 'Free'
      return `
      <tr>
        <td>${escapeHtml(u.name || '—')}</td>
        <td class="sx-admin-table__email">${escapeHtml(u.email)}</td>
        <td class="sx-admin-table__muted">${escapeHtml(formatMobile(u.mobile))}</td>
        <td>${escapeHtml(u.country || '—')}</td>
        <td><span class="sx-admin-plan-badge ${planBadgeClass(plan)}">${escapeHtml(planLabel)}</span></td>
        <td><span class="sx-admin-provider-badge">${escapeHtml(u.provider)}</span></td>
        <td class="sx-admin-table__muted">${formatTs(u.createdAt)}</td>
        <td class="sx-admin-table__muted">${formatTs(u.lastLoginAt)}</td>
        <td>${sub && plan !== 'free' ? formatMoney(sub.mrr) + '/mo' : '—'}</td>
      </tr>`
    })
    .join('')
  return `
    <div class="sx-admin-table-wrap">
      <table class="sx-admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Mobile</th>
            <th>Country</th>
            <th>Plan</th>
            <th>Provider</th>
            <th>Created</th>
            <th>Last login</th>
            <th>MRR</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function renderTelemetryTable(events: TelemetryRow[]): string {
  if (!events.length) {
    return `
      <div class="sx-admin-empty">
        <p class="sx-admin-empty__title">No telemetry events yet</p>
        <p class="sx-admin-empty__sub">Logins, sessions, and backtests will show up here.</p>
      </div>
    `
  }
  const rows = events
    .map((e) => {
      const payload =
        e.payload && Object.keys(e.payload).length
          ? escapeHtml(JSON.stringify(e.payload))
          : '—'
      return `
      <tr>
        <td class="sx-admin-table__muted">${formatTs(e.ts)}</td>
        <td><span class="sx-admin-event-badge sx-admin-event-badge--${escapeHtml(e.event)}">${escapeHtml(formatEventLabel(e.event))}</span></td>
        <td class="sx-admin-table__email">${escapeHtml(e.email)}</td>
        <td><span class="sx-admin-provider-badge">${escapeHtml(e.provider)}</span></td>
        <td class="sx-admin-payload">${payload}</td>
      </tr>`
    })
    .join('')
  return `
    <div class="sx-admin-table-wrap">
      <table class="sx-admin-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Event</th>
            <th>User</th>
            <th>Provider</th>
            <th>Payload</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `
}

function buildAdminShellHtml(): string {
  const user = getAuthUser()
  const displayName = readDisplayName() || user?.name || 'Admin'
  const email = user?.email || '—'

  return `
<div class="flex h-full min-h-0 flex-col overflow-hidden bg-[#f5f3ff] text-slate-800" id="sx-app-root" data-dashboard-theme="light">
  <div id="view-admin" class="sx-dash relative flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-slate-800 selection:bg-indigo-500/20">
    <div class="sx-dash__mesh" aria-hidden="true"></div>
    <div class="sx-dash__noise" aria-hidden="true"></div>
    <div class="sx-dash__orb sx-dash__orb--a" aria-hidden="true"></div>
    <div class="sx-dash__orb sx-dash__orb--b" aria-hidden="true"></div>
    <div class="sx-dash__orb sx-dash__orb--c" aria-hidden="true"></div>

    <div class="sx-dash__layer flex min-h-0 flex-1 flex-col overflow-hidden">
      <header class="sx-dash-header sx-dash-topbar relative z-[45] w-full shrink-0 border-b border-slate-200/90 bg-white">
        <div class="sx-dash-header__bar relative mx-auto flex w-full max-w-[1440px] items-center gap-3 px-4 py-2.5 sm:gap-5 sm:px-6 sm:py-3 lg:px-8">
          <div class="sx-dash__brand-mark relative z-[1] min-w-0 shrink-0">
            <div class="sx-dash-account" data-sx-account-menu>
              <span class="sx-dash-cta-ai sx-dash-account-ai">
                <span class="sx-dash-cta-ai__glow" aria-hidden="true"></span>
                <span class="sx-dash-cta-ai__border" aria-hidden="true"><span class="sx-dash-cta-ai__ring" style="animation-delay:-0.8s"></span></span>
                <button type="button" class="sx-dash-account-btn sx-dash-account-btn--ai" data-sx-account-toggle aria-label="Account menu" aria-haspopup="menu" aria-expanded="false" aria-controls="sx-admin-account-panel" title="Account">
                  <span class="sx-dash-account-btn__icon" aria-hidden="true"><i class="fa-solid fa-user"></i></span>
                  <span class="sx-dash-account-btn__label">Account</span>
                  <span class="sx-dash-account-btn__plan sx-dash-account-btn__plan--pro">Admin</span>
                  <i class="fa-solid fa-chevron-down sx-dash-account-btn__chev" aria-hidden="true"></i>
                </button>
              </span>
              <div class="sx-dash-account__menu" id="sx-admin-account-panel" role="menu" hidden>
                <div class="sx-dash-account__identity">
                  <p class="sx-dash-account__name">${escapeHtml(displayName)}</p>
                  <p class="sx-dash-account__email">${escapeHtml(email)}</p>
                </div>
                <div class="sx-dash-account__divider" role="separator"></div>
                <button type="button" role="menuitem" class="sx-dash-account__item sx-dash-account__item--danger" data-sx-admin-signout>
                  <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i><span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
          <div class="sx-dash-wordmark pointer-events-none absolute inset-x-0 top-1/2 z-0 flex -translate-y-1/2 justify-center px-28 sm:px-36">
            <div class="sx-dash-wordmark__stack">
              <p class="sx-dash-wordmark__tag">Operator</p>
              <p class="sx-dash-wordmark__mark sx-dash-wordmark__mark--e">
                <span class="sx-dash-wordmark__mono" aria-hidden="true">TN</span>
                <span class="sx-dash-wordmark__trade">TRADE</span><span class="sx-dash-wordmark__neu">NEU</span>
                <span class="sr-only">Tradeneu Admin</span>
              </p>
            </div>
          </div>
          <div class="relative z-[1] ml-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <button type="button" class="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45" data-sx-admin-refresh>
              <i class="fa-solid fa-rotate-right text-[0.75rem]" aria-hidden="true"></i>Refresh
            </button>
          </div>
        </div>
      </header>

      <div class="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <main class="mx-auto min-h-0 min-w-0 w-full max-w-[1440px] flex-1 overflow-y-auto overflow-x-hidden px-4 pt-1 pb-4 sm:px-6 sm:pt-2 sm:pb-6 lg:px-8 lg:pb-10">
          <div class="sx-dash__panel sx-dash-home-panel min-h-0 space-y-3 p-3 sm:space-y-4 sm:p-4 lg:space-y-4 lg:p-5 lg:pt-3">
            <div class="sx-admin-intro">
              <div>
                <h1 class="sx-admin-intro__title">Admin dashboard</h1>
                <p class="sx-admin-intro__sub">Revenue, users, subscriptions, and product telemetry.</p>
              </div>
              <p class="sx-admin-status" data-sx-admin-status aria-live="polite">Loading…</p>
            </div>

            <nav class="sx-admin-tabs" role="tablist" aria-label="Admin sections">
              <button type="button" role="tab" class="sx-admin-tab sx-admin-tab--active" data-sx-admin-tab="overview" aria-selected="true">Overview</button>
              <button type="button" role="tab" class="sx-admin-tab" data-sx-admin-tab="revenue" aria-selected="false">Revenue</button>
              <button type="button" role="tab" class="sx-admin-tab" data-sx-admin-tab="users" aria-selected="false">Users</button>
              <button type="button" role="tab" class="sx-admin-tab" data-sx-admin-tab="guests" aria-selected="false">Guests</button>
              <button type="button" role="tab" class="sx-admin-tab" data-sx-admin-tab="activity" aria-selected="false">Activity</button>
            </nav>

            <div class="sx-admin-tab-panel" data-sx-admin-panel="overview">
              <div class="space-y-3 sm:space-y-4" data-sx-admin-overview></div>
            </div>
            <div class="sx-admin-tab-panel hidden" data-sx-admin-panel="revenue" hidden>
              <div class="space-y-3 sm:space-y-4" data-sx-admin-revenue-panel></div>
            </div>
            <div class="sx-admin-tab-panel hidden" data-sx-admin-panel="users" hidden>
              <section class="sx-dash-recent-sessions sx-dash-card-surface overflow-hidden rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] px-5 py-4 sm:px-6 sm:py-5">
                <h3 class="mb-3 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Users <span class="text-base font-semibold text-slate-500" data-sx-admin-user-count></span></h3>
                <div data-sx-admin-users></div>
              </section>
            </div>
            <div class="sx-admin-tab-panel hidden" data-sx-admin-panel="guests" hidden>
              <div class="space-y-3 sm:space-y-4" data-sx-admin-guests-panel></div>
            </div>
            <div class="sx-admin-tab-panel hidden" data-sx-admin-panel="activity" hidden>
              <section class="sx-dash-recent-sessions sx-dash-card-surface overflow-hidden rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] px-5 py-4 sm:px-6 sm:py-5">
                <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 class="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Recent events</h3>
                  <label class="sx-admin-filter">
                    <span class="sx-admin-filter__label">Filter</span>
                    <select data-sx-admin-event-filter class="sx-admin-filter__select">
                      <option value="">All events</option>
                      <option value="login">Login</option>
                      <option value="session_created">Session created</option>
                      <option value="backtest_completed">Backtest completed</option>
                    </select>
                  </label>
                </div>
                <div data-sx-admin-events></div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</div>
  `
}

function wireAccountMenu(root: HTMLElement): () => void {
  const menuRoot = root.querySelector('[data-sx-account-menu]')
  const toggle = root.querySelector('[data-sx-account-toggle]') as HTMLButtonElement | null
  const panel = root.querySelector('#sx-admin-account-panel') as HTMLElement | null
  if (!menuRoot || !toggle || !panel) return () => {}

  const close = () => {
    panel.hidden = true
    toggle.setAttribute('aria-expanded', 'false')
    toggle.classList.remove('sx-dash-account-btn--open')
  }
  const open = () => {
    panel.hidden = false
    toggle.setAttribute('aria-expanded', 'true')
    toggle.classList.add('sx-dash-account-btn--open')
  }
  const onToggle = (e: Event) => {
    e.stopPropagation()
    if (panel.hidden) open()
    else close()
  }
  const onDocClick = (e: MouseEvent) => {
    if (!menuRoot.contains(e.target as Node)) close()
  }
  toggle.addEventListener('click', onToggle)
  document.addEventListener('click', onDocClick)
  return () => {
    toggle.removeEventListener('click', onToggle)
    document.removeEventListener('click', onDocClick)
  }
}

export function mountAdminPage(root: HTMLElement): () => void {
  document.documentElement.removeAttribute('data-theme')
  document.title = 'Tradeneu — Admin'

  root.replaceChildren()
  appendElementsFromHtml(root, buildAdminShellHtml())

  const appRoot = root.querySelector('#sx-app-root') as HTMLElement
  const statusEl = appRoot.querySelector('[data-sx-admin-status]') as HTMLElement
  const overviewEl = appRoot.querySelector('[data-sx-admin-overview]') as HTMLElement
  const revenuePanelEl = appRoot.querySelector('[data-sx-admin-revenue-panel]') as HTMLElement
  const usersEl = appRoot.querySelector('[data-sx-admin-users]') as HTMLElement
  const userCountEl = appRoot.querySelector('[data-sx-admin-user-count]') as HTMLElement
  const guestsPanelEl = appRoot.querySelector('[data-sx-admin-guests-panel]') as HTMLElement
  const eventsEl = appRoot.querySelector('[data-sx-admin-events]') as HTMLElement
  const filterEl = appRoot.querySelector('[data-sx-admin-event-filter]') as HTMLSelectElement
  const refreshBtn = appRoot.querySelector('[data-sx-admin-refresh]') as HTMLButtonElement
  const tabButtons = Array.from(appRoot.querySelectorAll<HTMLButtonElement>('[data-sx-admin-tab]'))
  const tabPanels = Array.from(appRoot.querySelectorAll<HTMLElement>('[data-sx-admin-panel]'))

  let disposed = false
  const unwireAccount = wireAccountMenu(appRoot)

  function setTab(tab: AdminTab) {
    tabButtons.forEach((btn) => {
      const on = btn.dataset.sxAdminTab === tab
      btn.classList.toggle('sx-admin-tab--active', on)
      btn.setAttribute('aria-selected', on ? 'true' : 'false')
    })
    tabPanels.forEach((panel) => {
      const on = panel.dataset.sxAdminPanel === tab
      panel.classList.toggle('hidden', !on)
      panel.hidden = !on
    })
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.sxAdminTab as AdminTab | undefined
      if (tab) setTab(tab)
    })
  })

  function renderOverview(
    activity: AdminActivity,
    revenue: AdminRevenue,
    growth: AdminGrowth,
    stats: AdminStats,
  ) {
    overviewEl.innerHTML = `
      ${renderActivitySections(activity)}
      ${renderRevenueKpis(revenue)}
      ${renderGrowthKpis(growth)}
      ${renderPlanMix(revenue)}
      ${renderEngagementKpis(stats)}
    `
  }

  function renderGuestsTab(guests: AdminGuests) {
    guestsPanelEl.innerHTML = `
      ${renderGuestKpis(guests)}
      <section class="sx-dash-recent-sessions sx-dash-card-surface overflow-hidden rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] px-5 py-4 sm:px-6 sm:py-5">
        <h3 class="mb-3 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Guest sessions <span class="text-base font-semibold text-slate-500">(${guests.count})</span></h3>
        ${renderGuestsTable(guests.guests)}
      </section>
    `
  }

  function renderRevenueTab(revenue: AdminRevenue) {
    revenuePanelEl.innerHTML = `
      ${renderRevenueKpis(revenue)}
      <section class="sx-dash-recent-sessions sx-dash-card-surface overflow-hidden rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] px-5 py-4 sm:px-6 sm:py-5">
        <h3 class="mb-3 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Recent payments</h3>
        ${renderTransactionsTable(revenue.recentTransactions)}
      </section>
      <section class="sx-dash-recent-sessions sx-dash-card-surface overflow-hidden rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] px-5 py-4 sm:px-6 sm:py-5">
        <h3 class="mb-3 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Active subscriptions</h3>
        ${renderSubscriptionsTable(revenue.subscriptions)}
      </section>
      ${renderPlanMix(revenue)}
    `
  }

  async function loadEvents() {
    const event = filterEl.value || undefined
    const events = await fetchAdminTelemetry({ limit: 100, event })
    if (disposed) return
    eventsEl.innerHTML = renderTelemetryTable(events)
  }

  async function loadAll() {
    statusEl.textContent = 'Loading…'
    refreshBtn.disabled = true
    try {
      const [stats, users] = await Promise.all([fetchAdminStats(), fetchAdminUsers()])
      if (disposed) return

      let growthResult: AdminGrowth | null = null
      let revenueResult: AdminRevenue | null = null
      let activityResult: AdminActivity | null = null
      let guestsResult: AdminGuests | null = null
      try {
        ;[growthResult, revenueResult, activityResult, guestsResult] = await Promise.all([
          fetchAdminGrowth(),
          fetchAdminRevenue(),
          fetchAdminActivity(),
          fetchAdminGuests(),
        ])
      } catch {
        /* fall back to derived values below */
      }
      const needsApiRestart =
        growthResult === null ||
        revenueResult === null ||
        activityResult === null ||
        guestsResult === null
      const growth = growthResult ?? deriveGrowthFromUsers(users)
      const revenue = revenueResult ?? emptyRevenueFromUsers(users)
      const activity = activityResult ?? emptyAdminActivity()
      const guests = guestsResult ?? emptyAdminGuests()

      renderOverview(activity, revenue, growth, stats)
      renderRevenueTab(revenue)
      renderGuestsTab(guests)
      usersEl.innerHTML = renderUsersTable(users, revenue.subscriptions)
      userCountEl.textContent = `(${users.length})`
      await loadEvents()
      const time = new Date().toLocaleTimeString()
      statusEl.textContent = needsApiRestart
        ? `Updated ${time} · restart API for full revenue data (npm run dev)`
        : `Updated ${time}`
    } catch (e) {
      if (disposed) return
      statusEl.textContent = e instanceof Error ? e.message : 'Failed to load admin data'
    } finally {
      if (!disposed) refreshBtn.disabled = false
    }
  }

  refreshBtn.addEventListener('click', () => {
    void loadAll()
  })
  filterEl.addEventListener('change', () => {
    void loadEvents()
  })
  appRoot.querySelector('[data-sx-admin-signout]')?.addEventListener('click', () => {
    void clearAllAuthSessions().then(() => {
      window.location.assign(resolveAppPath('login'))
    })
  })

  void loadAll()

  return () => {
    disposed = true
    unwireAccount()
    root.replaceChildren()
  }
}
