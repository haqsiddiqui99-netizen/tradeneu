import './accountPage.css'
import { defaultBacktestSlippage } from '../backtest/backtestChartUi'
import { resolveAppPath } from '../appPaths'
import {
  cancelBillingSubscription,
  changeBillingCycle,
  fetchMyBilling,
  pauseBillingSubscription,
  recordCheckoutComplete,
  resumeBillingSubscription,
  saveBillingAddress,
  type BillingAddress,
  type MyBilling,
} from '../billing/billingApi'
import {
  BILLING_CYCLES,
  CYCLE_LABELS,
  FEATURE_GROUPS,
  isBillingCycle,
  PLAN_BLURBS,
  PLAN_HIGHLIGHTS,
  PLAN_LIMITS,
  PLAN_NAMES,
  PRICING,
  type AccountTier,
  type BillingCycle,
  type FeatureRow,
} from './planCatalog'
import { createCheckoutOverlay, type CheckoutPlan } from './subscriptionCheckout'
import {
  changeAuthEmail,
  changePassword,
  fetchAuthDevices,
  fetchAuthProfile,
  revokeAuthDevice,
  updateAuthProfile,
  type AuthDevice,
} from '../auth/authApi'
import type { AuthUser } from '../auth/authSession'
import { GUEST_AUTH_EMAIL } from '../auth/authSession'
import { dashLocaleMenuLabel } from '../home/dashboardLocales'
import {
  readConfirmCloseTrade,
  readDefaultChartInterval,
  readDefaultCommission,
  readDefaultSessionBalance,
  readDefaultStrategyId,
  readDisplayName,
  readFixedSlippage,
  readSlippageMode,
  readUserAvatar,
  readUserTimezone,
  SETTINGS_INTERVAL_OPTIONS,
  SETTINGS_TIMEZONE_OPTIONS,
  writeConfirmCloseTrade,
  writeDefaultChartInterval,
  writeDefaultCommission,
  writeDefaultSessionBalance,
  writeDefaultStrategyId,
  writeDisplayName,
  writeFixedSlippage,
  writeSlippageMode,
  writeUserAvatar,
  writeUserTimezone,
} from '../home/dashboardUserPrefs'
import { listAllStrategies, strategySelectLabel } from '../strategy/strategyCatalog'
import {
  deletedSessionRetentionDays,
  listDeletedSessions,
  purgeAllDeletedSessions,
  purgeDeletedSession,
  restoreSession,
  type DeletedSession,
} from '../data/sessionStore'

export type ProfileSessionStats = {
  total: number
  backtest: number
  prop: number
  withBacktest: number
  withJournal: number
  memberSinceMs: number | null
}

export type AccountTabKey =
  | 'account'
  | 'security'
  | 'devices'
  | 'subscription'
  | 'backtesting'
  | 'costs'
  | 'usage'
  | 'deleted'

export type MountAccountPageOptions = {
  onBack?: () => void
  embedded?: boolean
  initialTab?: AccountTabKey
  readLocale: () => string
  writeLocale: (code: string) => void
  localeOptions: ReadonlyArray<{ code: string; name: string }>
  readTier?: () => AccountTier
  /** Persist the plan after a (demo) checkout completes in the Subscription tab. */
  writeTier?: (tier: AccountTier) => void
  /** Fired once the checkout overlay closes so the host can refresh tier-gated UI. */
  onTierChange?: (tier: AccountTier) => void
  getSessionStats?: () => ProfileSessionStats
  getAuthUser?: () => AuthUser | null
  onOpenSubscription?: () => void
  onDisplayNameChange?: (name: string) => void
  onAvatarChange?: () => void
  /** Fired when a session is restored from the recycle bin. */
  onSessionsChange?: () => void
  freeSessionLimit?: number
  showAdminLink?: boolean
  adminHref?: string
}

const TABS: ReadonlyArray<{ key: AccountTabKey; label: string; icon: string }> = [
  { key: 'account', label: 'Account', icon: 'fa-regular fa-user' },
  { key: 'security', label: 'Security', icon: 'fa-solid fa-shield-halved' },
  { key: 'devices', label: 'Devices', icon: 'fa-solid fa-desktop' },
  { key: 'subscription', label: 'Subscription', icon: 'fa-regular fa-credit-card' },
  { key: 'backtesting', label: 'Backtesting', icon: 'fa-solid fa-chart-simple' },
  { key: 'costs', label: 'Spreads & Commissions', icon: 'fa-solid fa-percent' },
  { key: 'usage', label: 'Usage', icon: 'fa-solid fa-gauge-high' },
  { key: 'deleted', label: 'Deleted Sessions', icon: 'fa-regular fa-trash-can' },
]

const DEVICE_ICONS: Record<AuthDevice['kind'], string> = {
  desktop: 'fa-solid fa-desktop',
  tablet: 'fa-solid fa-tablet-screen-button',
  phone: 'fa-solid fa-mobile-screen',
}

/** Reference rows for the auto slippage estimate, mirroring defaultBacktestSlippage. */
const SLIPPAGE_REFERENCE = [
  { label: 'FX pairs', sample: 'EURUSD' },
  { label: 'Gold', sample: 'XAUUSD' },
  { label: 'Silver', sample: 'XAGUSD' },
  { label: 'Crude oil', sample: 'CL' },
  { label: 'Bitcoin', sample: 'BTCUSD' },
  { label: 'Everything else', sample: 'AAPL' },
]

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;')
}

function formatMoney(n: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `$${Math.round(n)}`
  }
}

function formatMemberSince(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  } catch {
    return '—'
  }
}

function formatDateTime(ms: number): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return '—'
  }
}

function formatRelative(ms: number): string {
  if (!ms) return 'unknown'
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  const mins = Math.round(diff / 60_000)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

function initialsFrom(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || 'TN'
  )
}

const eyeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`

function passwordChecks(pw: string) {
  return {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /\d/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  }
}

function passwordStrengthLabel(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: '' }
  const c = passwordChecks(pw)
  const score = [c.length, c.upper, c.lower, c.number, c.special].filter(Boolean).length
  if (score <= 2) return { score, label: 'Weak' }
  if (score <= 4) return { score, label: 'Medium' }
  return { score, label: 'Strong' }
}

function compressAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Choose an image file (PNG, JPG, or WebP).'))
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      reject(new Error('Image must be under 4 MB.'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not load that image.'))
      img.onload = () => {
        const max = 256
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not process image.'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = String(reader.result || '')
    }
    reader.readAsDataURL(file)
  })
}

/** Comparison cells carry ✓/× glyphs that deserve colour rather than raw text. */
function compareCell(value: string): string {
  if (value === '✓') return '<span class="sx-acct-cmp__yes" aria-label="Included">✓</span>'
  if (value === '×') return '<span class="sx-acct-cmp__no" aria-label="Not included">×</span>'
  if (value === '—') return '<span class="sx-acct-cmp__no" aria-label="Not applicable">—</span>'
  return `<span class="sx-acct-cmp__val">${escapeHtml(value)}</span>`
}

/** Full feature matrix, with the column the user is actually on called out. */
function comparisonHtml(tier: AccountTier): string {
  const columns: ReadonlyArray<{ key: AccountTier; pick: (row: FeatureRow) => string }> = [
    { key: 'free', pick: (r) => r.free },
    { key: 'intermediate', pick: (r) => r.mid },
    { key: 'pro', pick: (r) => r.pro },
  ]
  const head = columns
    .map(
      (c) =>
        `<th scope="col"${c.key === tier ? ' class="is-current"' : ''}>${escapeHtml(PLAN_NAMES[c.key])}${
          c.key === tier ? '<span class="sx-acct-cmp__tag">You</span>' : ''
        }</th>`,
    )
    .join('')
  return FEATURE_GROUPS.map(
    (group, i) => `
      <details class="sx-acct-accordion"${i === 0 ? ' open' : ''}>
        <summary class="sx-acct-accordion__summary">
          <span>${escapeHtml(group.title)}</span>
          <i class="fa-solid fa-chevron-down sx-acct-accordion__chev" aria-hidden="true"></i>
        </summary>
        <div class="sx-acct-accordion__body">
          <table class="sx-acct-table sx-acct-cmp">
            <thead><tr><th scope="col">Feature</th>${head}</tr></thead>
            <tbody>${group.rows
              .map(
                (row) =>
                  `<tr><th scope="row">${escapeHtml(row.label)}</th>${columns
                    .map((c) => `<td${c.key === tier ? ' class="is-current"' : ''}>${compareCell(c.pick(row))}</td>`)
                    .join('')}</tr>`,
              )
              .join('')}</tbody>
          </table>
        </div>
      </details>`,
  ).join('')
}

function formatDate(ms: number): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' })
  } catch {
    return '—'
  }
}

function formatAmount(n: number): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n)
  } catch {
    return `$${n.toFixed(2)}`
  }
}

function avatarMarkup(initials: string, avatarUrl: string | null): string {
  if (avatarUrl) return `<img src="${escapeAttr(avatarUrl)}" alt="" />`
  return `<span data-sx-acct-avatar-fallback>${escapeHtml(initials)}</span>`
}

export function mountAccountPage(root: HTMLElement, opts: MountAccountPageOptions): () => void {
  root.replaceChildren()

  const tier = opts.readTier?.() ?? 'free'
  const stats = opts.getSessionStats?.()
  const authUser = opts.getAuthUser?.() ?? null
  const displayName = readDisplayName()
  const email = authUser?.email ?? '—'
  const isGuest = !authUser || authUser.provider === 'guest' || authUser.email === GUEST_AUTH_EMAIL
  const sessionLimit = opts.freeSessionLimit ?? 10
  const sessionsUsed = stats?.total ?? 0
  const sessionPct =
    tier === 'pro' ? 100 : Math.min(100, Math.round((sessionsUsed / Math.max(1, sessionLimit)) * 100))
  const planLabel = PLAN_NAMES[tier]
  const planLimits = PLAN_LIMITS[tier]
  const planPriceLine =
    tier === 'free' ? 'Free forever' : `${formatAmount(PRICING.monthly[tier].amount)} / month`
  const initials = initialsFrom(displayName)
  const avatarUrl = readUserAvatar()
  const memberSinceLabel = stats?.memberSinceMs ? formatMemberSince(stats.memberSinceMs) : '—'

  const freeFeatures = [
    { ok: true, text: `${sessionLimit} backtesting sessions` },
    { ok: true, text: '1 indicator · 1 week data retention' },
    { ok: false, text: 'Unlimited sessions & multi-chart' },
    { ok: false, text: 'Seconds data & custom timeframes' },
  ]
  const midFeatures = [
    { ok: true, text: '10 backtesting sessions' },
    { ok: true, text: '3 indicators · 6 months retention' },
    { ok: true, text: '2 charts' },
    { ok: false, text: 'Unlimited sessions & futures data' },
  ]
  const proFeatures = [
    { ok: true, text: 'Unlimited backtesting sessions' },
    { ok: true, text: 'Unlimited indicators & charts' },
    { ok: true, text: 'Seconds data · futures / CME' },
    { ok: true, text: 'Advanced analytics & journal tools' },
  ]
  const features = tier === 'pro' ? proFeatures : tier === 'intermediate' ? midFeatures : freeFeatures

  const strategies = listAllStrategies()
  const defaultStrategyId = readDefaultStrategyId()
  const defaultInterval = readDefaultChartInterval()
  const slippageMode = readSlippageMode()

  const shell = document.createElement('div')
  shell.className = opts.embedded ? 'sx-acct sx-acct--embedded' : 'sx-acct'
  shell.innerHTML = `
    <header class="sx-acct__head">
      ${opts.onBack ? `<button type="button" class="sx-acct__back" data-sx-acct-back aria-label="Back to dashboard"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Dashboard</span></button>` : ''}
      <div class="sx-acct__head-copy">
        <p class="sx-acct__eyebrow">Account center</p>
        <h1 class="sx-acct__title">Profile Settings<span class="sx-acct__email">${escapeHtml(email)}</span></h1>
      </div>
      ${opts.showAdminLink && opts.adminHref ? `<div class="sx-acct__head-actions"><a class="sx-acct-btn" href="${escapeAttr(opts.adminHref)}">Admin</a></div>` : ''}
    </header>

    <nav class="sx-acct__tabs" role="tablist" aria-label="Profile settings sections">
      ${TABS.map(
        (t) => `<button
        type="button"
        class="sx-acct__tab"
        role="tab"
        id="sx-acct-tab-${t.key}"
        aria-controls="sx-acct-panel-${t.key}"
        aria-selected="false"
        tabindex="-1"
        data-sx-acct-tab="${t.key}"
      ><i class="${t.icon}" aria-hidden="true"></i>${t.label}</button>`,
      ).join('')}
    </nav>

    <div class="sx-acct__body">
      <section class="sx-acct__panel" role="tabpanel" id="sx-acct-panel-account" aria-labelledby="sx-acct-tab-account" data-sx-acct-panel="account" hidden tabindex="0">
        <div class="sx-acct__grid">
          <div class="sx-acct__col">
            <div class="sx-acct-card">
              <div class="sx-acct-card__head">
                <h2 class="sx-acct-card__title">Profile</h2>
                <p class="sx-acct-card__lead">How you appear inside Tradeneu.</p>
              </div>
              <div class="sx-acct-identity">
                <div class="sx-acct-avatar-wrap">
                  <div class="sx-acct-avatar" data-sx-acct-dp-preview>${avatarMarkup(initials, avatarUrl)}</div>
                  <button type="button" class="sx-acct-avatar-edit" data-sx-acct-dp-change aria-label="Change photo" title="Change photo"><i class="fa-solid fa-camera" aria-hidden="true"></i></button>
                </div>
                <div class="sx-acct-identity__copy">
                  <p class="sx-acct-identity__name" data-sx-acct-name-display>${escapeHtml(displayName)}</p>
                  <p class="sx-acct-identity__meta">${isGuest ? 'Guest mode · stored in this browser only' : 'Signed in'}</p>
                  <button type="button" class="sx-acct-linkbtn" data-sx-acct-dp-remove ${avatarUrl ? '' : 'hidden'}>Remove photo</button>
                </div>
              </div>
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden data-sx-acct-dp-file />
              <div class="sx-acct-fields">
                <div class="sx-acct-field">
                  <label class="sx-acct-label" for="sx-acct-displayname">Display name</label>
                  <input id="sx-acct-displayname" class="sx-acct-input" type="text" maxlength="48" value="${escapeAttr(displayName)}" autocomplete="nickname" data-sx-acct-username />
                  <p class="sx-acct-hint">Shown in the sidebar and on your sessions.</p>
                </div>
                <div class="sx-acct-field">
                  <label class="sx-acct-label" for="sx-acct-handle">Username</label>
                  <input id="sx-acct-handle" class="sx-acct-input" type="text" maxlength="32" spellcheck="false" autocapitalize="none" autocomplete="username" placeholder="${isGuest ? 'Create an account to claim one' : 'Loading…'}" ${isGuest ? 'disabled' : ''} data-sx-acct-handle />
                  <p class="sx-acct-hint" data-sx-acct-handle-hint>${isGuest ? 'Guest mode has no username.' : 'Lowercase letters, numbers, and hyphens. You can sign in with this instead of your email.'}</p>
                </div>
              </div>
            </div>

            <div class="sx-acct-card">
              <div class="sx-acct-card__head">
                <h2 class="sx-acct-card__title">Email</h2>
                <p class="sx-acct-card__lead">The address you sign in with and receive account notices at.</p>
              </div>
              <div class="sx-acct-fields">
                <div class="sx-acct-field">
                  <label class="sx-acct-label" for="sx-acct-email">Email address</label>
                  <input id="sx-acct-email" class="sx-acct-input" type="email" value="${escapeAttr(email)}" readonly data-sx-acct-email-current />
                </div>
              </div>
              ${
                isGuest
                  ? `<p class="sx-acct-hint">Placeholder address for guest mode. Create an account to set a real one.</p>`
                  : `<div class="sx-acct-actions">
                <button type="button" class="sx-acct-btn" data-sx-acct-email-open><i class="fa-regular fa-envelope" aria-hidden="true"></i>Change email</button>
              </div>
              <div class="sx-acct-fields" data-sx-acct-email-form hidden>
                <div class="sx-acct-field">
                  <label class="sx-acct-label" for="sx-acct-email-new">New email address</label>
                  <input id="sx-acct-email-new" class="sx-acct-input" type="email" autocomplete="email" data-sx-acct-email-new />
                </div>
                <div class="sx-acct-field">
                  <label class="sx-acct-label" for="sx-acct-email-pass">Confirm with your password</label>
                  <div class="sx-acct-input-row">
                    <input id="sx-acct-email-pass" class="sx-acct-input" type="password" autocomplete="current-password" data-sx-acct-email-pass />
                    <button type="button" class="sx-acct-icon-btn" data-sx-acct-pass-toggle="email" aria-label="Show password" title="Show password">${eyeIcon}</button>
                  </div>
                  <p class="sx-acct-hint">Email is how you sign in and reset your password, so it needs your password to change.</p>
                </div>
                <div class="sx-acct-actions">
                  <button type="button" class="sx-acct-btn sx-acct-btn--primary" data-sx-acct-email-save>Update email</button>
                  <button type="button" class="sx-acct-btn" data-sx-acct-email-cancel>Cancel</button>
                </div>
              </div>`
              }
              <p class="sx-acct-saved" data-sx-acct-email-msg aria-live="polite"></p>
            </div>
          </div>

          <div class="sx-acct__col">
            <div class="sx-acct-card">
              <div class="sx-acct-card__head">
                <h2 class="sx-acct-card__title">Regional</h2>
                <p class="sx-acct-card__lead">Applied across every chart, session, and replay clock.</p>
              </div>
              <div class="sx-acct-fields">
                <div class="sx-acct-field">
                  <label class="sx-acct-label" for="sx-acct-timezone">Timezone</label>
                  <select id="sx-acct-timezone" class="sx-acct-select" data-sx-acct-timezone>
                    ${SETTINGS_TIMEZONE_OPTIONS.map((z) => `<option value="${z.id}">${escapeHtml(z.label)}</option>`).join('')}
                  </select>
                  <p class="sx-acct-hint">Used for session date labels and replay clocks.</p>
                </div>
                <div class="sx-acct-field">
                  <span class="sx-acct-label" id="sx-acct-locale-label">Language</span>
                  <div class="sx-acct-locale" data-sx-acct-locale-picker>
                    <button type="button" class="sx-acct-locale__trigger" id="sx-acct-locale-trigger" aria-labelledby="sx-acct-locale-label" aria-haspopup="listbox" aria-expanded="false">
                      <span data-sx-acct-locale-value>English (EN)</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                    <div class="sx-acct-locale__menu" id="sx-acct-locale-menu" hidden role="listbox" aria-labelledby="sx-acct-locale-label"></div>
                  </div>
                  <p class="sx-acct-hint">Language shown in the header.</p>
                </div>
              </div>
            </div>

            <div class="sx-acct-savebar">
              <p class="sx-acct-saved" data-sx-acct-account-saved aria-live="polite"></p>
              <div class="sx-acct-savebar__actions">
                ${isGuest ? `<a class="sx-acct-btn" href="${resolveAppPath('login')}">Create account</a>` : ''}
                <button type="button" class="sx-acct-btn sx-acct-btn--primary" data-sx-acct-save-account>Save changes</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="sx-acct__panel" role="tabpanel" id="sx-acct-panel-security" aria-labelledby="sx-acct-tab-security" data-sx-acct-panel="security" hidden tabindex="0">
        <div class="sx-acct__grid">
          <div class="sx-acct-card">
            <div class="sx-acct-card__head">
              <h2 class="sx-acct-card__title">Password</h2>
              <p class="sx-acct-card__lead">${isGuest ? 'Guest sessions live only in this browser.' : 'Choose something you do not reuse elsewhere.'}</p>
            </div>
            ${
              isGuest
                ? `<div class="sx-acct-guest">
              <ul class="sx-acct-checklist">
                <li><i class="fa-solid fa-check" aria-hidden="true"></i> Sync strategies across devices</li>
                <li><i class="fa-solid fa-check" aria-hidden="true"></i> Keep session history after browser clears</li>
                <li><i class="fa-solid fa-check" aria-hidden="true"></i> Enable password + billing controls</li>
              </ul>
              <div class="sx-acct-actions" style="margin-top:0">
                <a class="sx-acct-btn sx-acct-btn--primary" href="${resolveAppPath('login')}">Sign in or create account</a>
              </div>
            </div>`
                : `<div class="sx-acct-fields">
              <div class="sx-acct-field">
                <label class="sx-acct-label" for="sx-acct-pass-current">Current password</label>
                <div class="sx-acct-input-row">
                  <input id="sx-acct-pass-current" class="sx-acct-input" type="password" autocomplete="current-password" data-sx-acct-pass-current />
                  <button type="button" class="sx-acct-icon-btn" data-sx-acct-pass-toggle="current" aria-label="Show password" title="Show password">${eyeIcon}</button>
                </div>
              </div>
              <div class="sx-acct-field">
                <label class="sx-acct-label" for="sx-acct-pass-new">New password</label>
                <div class="sx-acct-input-row">
                  <input id="sx-acct-pass-new" class="sx-acct-input" type="password" autocomplete="new-password" minlength="8" data-sx-acct-pass-new />
                  <button type="button" class="sx-acct-icon-btn" data-sx-acct-pass-toggle="new" aria-label="Show password" title="Show password">${eyeIcon}</button>
                </div>
                <div class="sx-acct-strength" data-sx-acct-strength hidden>
                  <div class="sx-acct-strength__bar" aria-hidden="true"><span data-sx-acct-strength-fill></span></div>
                  <p class="sx-acct-strength__label"><span data-sx-acct-strength-label></span></p>
                  <ul class="sx-acct-strength__rules" aria-label="Password requirements">
                    <li data-sx-acct-pass-rule="length">At least 8 characters</li>
                    <li data-sx-acct-pass-rule="upper">One uppercase letter</li>
                    <li data-sx-acct-pass-rule="lower">One lowercase letter</li>
                    <li data-sx-acct-pass-rule="number">One number</li>
                    <li data-sx-acct-pass-rule="special">One special character</li>
                  </ul>
                </div>
              </div>
              <div class="sx-acct-field">
                <label class="sx-acct-label" for="sx-acct-pass-confirm">Confirm password</label>
                <div class="sx-acct-input-row">
                  <input id="sx-acct-pass-confirm" class="sx-acct-input" type="password" autocomplete="new-password" minlength="8" data-sx-acct-pass-confirm />
                  <button type="button" class="sx-acct-icon-btn" data-sx-acct-pass-toggle="confirm" aria-label="Show password" title="Show password">${eyeIcon}</button>
                </div>
              </div>
            </div>
            <div class="sx-acct-actions">
              <button type="button" class="sx-acct-btn sx-acct-btn--primary" data-sx-acct-pass-save>Update password</button>
            </div>
            <p class="sx-acct-saved" data-sx-acct-pass-msg aria-live="polite"></p>`
            }
          </div>

          <div class="sx-acct-card">
            <div class="sx-acct-card__head">
              <h2 class="sx-acct-card__title">Where your data lives</h2>
              <p class="sx-acct-card__lead">Tradeneu keeps sessions, strategies, and journals in this browser.</p>
            </div>
            <ul class="sx-acct-checklist">
              <li><i class="fa-solid fa-check" aria-hidden="true"></i> Market data is fetched locally and never leaves your machine</li>
              <li><i class="fa-solid fa-check" aria-hidden="true"></i> Clearing site data removes saved sessions permanently</li>
              <li class="${isGuest ? '' : 'is-muted'}"><i class="fa-solid ${isGuest ? 'fa-minus' : 'fa-check'}" aria-hidden="true"></i> ${isGuest ? 'Sign in to keep history across browsers' : 'Signed in — history survives a browser reset'}</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="sx-acct__panel" role="tabpanel" id="sx-acct-panel-devices" aria-labelledby="sx-acct-tab-devices" data-sx-acct-panel="devices" hidden tabindex="0">
        <div class="sx-acct__grid">
          <div class="sx-acct-card sx-acct-card--span">
            <div class="sx-acct-card__head">
              <h2 class="sx-acct-card__title">Signed-in devices</h2>
              <p class="sx-acct-card__lead">Every browser currently holding a session for this account. Signing one out ends its session immediately.</p>
            </div>
            <div data-sx-acct-devices></div>
          </div>
        </div>
      </section>

      <section class="sx-acct__panel" role="tabpanel" id="sx-acct-panel-subscription" aria-labelledby="sx-acct-tab-subscription" data-sx-acct-panel="subscription" hidden tabindex="0">
        <div class="sx-acct__grid">
          <div class="sx-acct-card">
            <div class="sx-acct-card__head">
              <h2 class="sx-acct-card__title">Current plan</h2>
              <p class="sx-acct-card__lead">${escapeHtml(PLAN_BLURBS[tier])}</p>
            </div>
            <div class="sx-acct-plan-now">
              <span class="sx-acct-plan-now__name">${escapeHtml(planLabel)}</span>
              <span class="sx-acct-pill sx-acct-pill--plan">${escapeHtml(planPriceLine)}</span>
            </div>
            <ul class="sx-acct-checklist">
              ${features
                .map(
                  (f) =>
                    `<li class="${f.ok ? '' : 'is-muted'}"><i class="fa-solid ${f.ok ? 'fa-check' : 'fa-minus'}" aria-hidden="true"></i>${escapeHtml(f.text)}</li>`,
                )
                .join('')}
            </ul>
            <dl class="sx-acct-stats sx-acct-stats--tight" data-sx-acct-plan-stats>
              <div><dt>Billing cycle</dt><dd data-sx-acct-plan-cycle>${tier === 'free' ? '—' : '…'}</dd></div>
              <div><dt>Renews on</dt><dd data-sx-acct-plan-renews>${tier === 'free' ? '—' : '…'}</dd></div>
              <div><dt>Status</dt><dd data-sx-acct-plan-status>${tier === 'free' ? 'No subscription' : '…'}</dd></div>
              <div><dt>Member since</dt><dd>${escapeHtml(memberSinceLabel)}</dd></div>
            </dl>
          </div>

          <div class="sx-acct-card">
            <div class="sx-acct-card__head">
              <h2 class="sx-acct-card__title">Entitlement</h2>
              <p class="sx-acct-card__lead">What your plan allows and how much of it you have used.</p>
            </div>
            <div class="sx-acct-usage">
              <div class="sx-acct-usage__top">
                <span>Session capacity</span>
                <strong>${tier === 'pro' ? `${sessionsUsed} sessions` : `${sessionsUsed} / ${sessionLimit}`}</strong>
              </div>
              <div class="sx-acct-usage__bar" role="progressbar" aria-valuemin="0" aria-valuemax="${tier === 'pro' ? Math.max(sessionsUsed, 1) : sessionLimit}" aria-valuenow="${sessionsUsed}"><span style="width:${sessionPct}%"></span></div>
            </div>
            <dl class="sx-acct-stats sx-acct-stats--tight" style="margin-top:16px">
              <div><dt>Indicators</dt><dd>${escapeHtml(planLimits.indicators)}</dd></div>
              <div><dt>Charts</dt><dd>${escapeHtml(planLimits.charts)}</dd></div>
              <div><dt>Data retention</dt><dd>${escapeHtml(planLimits.retention)}</dd></div>
              <div><dt>Trades / session</dt><dd>${escapeHtml(planLimits.trades)}</dd></div>
            </dl>
            <p class="sx-acct-hint" style="margin-top:14px">
              ${
                tier === 'pro'
                  ? 'You are on Premium Plan — nothing here is capped. Manage billing, pause, or cancel below.'
                  : tier === 'intermediate'
                    ? 'You are on Ultra Plan. Premium removes every cap and adds seconds data and futures.'
                    : 'Upgrade when you need more sessions, charts, and analytics.'
              }
            </p>
          </div>

          <div class="sx-acct-card sx-acct-card--span" data-sx-acct-plans>
            <div class="sx-acct-card__head sx-acct-card__head--row">
              <div>
                <h2 class="sx-acct-card__title">Plans</h2>
              </div>
              <div class="sx-acct-cycle" role="group" aria-label="Billing cycle">
                ${BILLING_CYCLES.map(
                  (c) =>
                    `<button type="button" class="sx-acct-cycle__btn${c === 'monthly' ? ' is-active' : ''}" data-sx-acct-cycle="${c}">${CYCLE_LABELS[c]}</button>`,
                ).join('')}
              </div>
              <div class="sx-acct-manage" data-sx-acct-manage-picker>
                <button type="button" class="sx-acct-btn" id="sx-acct-manage-trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="sx-acct-manage-menu" data-sx-acct-manage-toggle>
                  <i class="fa-regular fa-credit-card" aria-hidden="true"></i>
                  Manage Subscription
                  <i class="fa-solid fa-chevron-down sx-acct-manage__chev" aria-hidden="true"></i>
                </button>
                <div class="sx-acct-manage__menu" id="sx-acct-manage-menu" hidden role="menu" aria-label="Manage Subscription">
                  <button type="button" role="menuitem" class="sx-acct-manage__item" data-sx-acct-manage-item="billing">
                    <i class="fa-solid fa-rotate" aria-hidden="true"></i>
                    <span><strong>Billing option</strong><em>Change your billing cycle</em></span>
                  </button>
                  <button type="button" role="menuitem" class="sx-acct-manage__item" data-sx-acct-manage-item="history">
                    <i class="fa-regular fa-clock" aria-hidden="true"></i>
                    <span><strong>Payment history</strong><em>Invoices and receipts</em></span>
                  </button>
                  <button type="button" role="menuitem" class="sx-acct-manage__item" data-sx-acct-manage-item="address">
                    <i class="fa-regular fa-map" aria-hidden="true"></i>
                    <span><strong>Billing &amp; shipping address</strong><em>Update your contact details</em></span>
                  </button>
                  <button type="button" role="menuitem" class="sx-acct-manage__item" data-sx-acct-manage-item="pause">
                    <i class="fa-solid fa-pause" aria-hidden="true" data-sx-acct-manage-pause-ico></i>
                    <span><strong data-sx-acct-manage-pause-title>Pause subscription</strong><em data-sx-acct-manage-pause-sub>Temporarily stop billing</em></span>
                  </button>
                  <button type="button" role="menuitem" class="sx-acct-manage__item sx-acct-manage__item--danger" data-sx-acct-manage-item="cancel">
                    <i class="fa-regular fa-circle-xmark" aria-hidden="true"></i>
                    <span><strong>Cancel subscription</strong><em>End renewals at period end</em></span>
                  </button>
                </div>
              </div>
            </div>

            <div class="sx-acct-manage-panel" data-sx-acct-manage-panel hidden>
              <div class="sx-acct-manage-panel__bar">
                <h3 class="sx-acct-manage-panel__title" data-sx-acct-manage-panel-title>Manage Subscription</h3>
                <button type="button" class="sx-acct-manage-panel__close" data-sx-acct-manage-panel-close aria-label="Close">
                  <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
              </div>
              <div class="sx-acct-manage-panel__body" data-sx-acct-manage-panel-body></div>
            </div>

            <div class="sx-acct-plans">
              <article class="sx-acct-plan${tier === 'free' ? ' is-current' : ''}">
                <header class="sx-acct-plan__head">
                  <h3 class="sx-acct-plan__name">${PLAN_NAMES.free}</h3>
                  ${tier === 'free' ? '<span class="sx-acct-pill sx-acct-pill--ok">Current</span>' : ''}
                </header>
                <p class="sx-acct-plan__price"><strong>Free</strong><span class="sx-acct-plan__unit">forever</span></p>
                <p class="sx-acct-plan__desc">${PLAN_BLURBS.free}</p>
                <ul class="sx-acct-plan__features">
                  ${PLAN_HIGHLIGHTS.free.map((f) => `<li><i class="fa-solid fa-check" aria-hidden="true"></i>${escapeHtml(f)}</li>`).join('')}
                </ul>
                ${
                  tier === 'free'
                    ? '<button type="button" class="sx-acct-btn" disabled>Included with your account</button>'
                    : '<button type="button" class="sx-acct-btn" data-sx-acct-manage-plan>Switch to Basic</button>'
                }
              </article>

              <article class="sx-acct-plan${tier === 'intermediate' ? ' is-current' : ''}">
                <header class="sx-acct-plan__head">
                  <h3 class="sx-acct-plan__name">${PLAN_NAMES.intermediate}</h3>
                  ${
                    tier === 'intermediate'
                      ? '<span class="sx-acct-pill sx-acct-pill--ok">Current</span>'
                      : `<span class="sx-acct-plan__save" data-sx-acct-save="intermediate">${PRICING.monthly.intermediate.save}</span>`
                  }
                </header>
                <p class="sx-acct-plan__price">
                  <strong data-sx-acct-price="intermediate">${PRICING.monthly.intermediate.label}</strong>
                  <span class="sx-acct-plan__unit">$<span data-sx-acct-period="intermediate">${PRICING.monthly.intermediate.period}</span></span>
                </p>
                <p class="sx-acct-plan__meta">
                  <s data-sx-acct-was="intermediate">${PRICING.monthly.intermediate.original}</s>
                  <span data-sx-acct-billed="intermediate">${PRICING.monthly.intermediate.billed}</span>
                </p>
                <p class="sx-acct-plan__desc">${PLAN_BLURBS.intermediate}</p>
                <ul class="sx-acct-plan__features">
                  ${PLAN_HIGHLIGHTS.intermediate.map((f) => `<li><i class="fa-solid fa-check" aria-hidden="true"></i>${escapeHtml(f)}</li>`).join('')}
                </ul>
                ${
                  tier === 'intermediate'
                    ? '<button type="button" class="sx-acct-btn" data-sx-acct-manage-plan>Manage plan</button>'
                    : tier === 'pro'
                      ? '<button type="button" class="sx-acct-btn" disabled>Included in Premium Plan</button>'
                      : '<button type="button" class="sx-acct-btn sx-acct-btn--primary" data-sx-acct-upgrade="intermediate">Upgrade to Ultra</button>'
                }
              </article>

              <article class="sx-acct-plan sx-acct-plan--best${tier === 'pro' ? ' is-current' : ''}">
                <header class="sx-acct-plan__head">
                  <h3 class="sx-acct-plan__name">${PLAN_NAMES.pro}</h3>
                  ${
                    tier === 'pro'
                      ? '<span class="sx-acct-pill sx-acct-pill--ok">Current</span>'
                      : `<span class="sx-acct-plan__save" data-sx-acct-save="pro">${PRICING.monthly.pro.save}</span>`
                  }
                </header>
                <p class="sx-acct-plan__price">
                  <strong data-sx-acct-price="pro">${PRICING.monthly.pro.label}</strong>
                  <span class="sx-acct-plan__unit">$<span data-sx-acct-period="pro">${PRICING.monthly.pro.period}</span></span>
                </p>
                <p class="sx-acct-plan__meta">
                  <s data-sx-acct-was="pro">${PRICING.monthly.pro.original}</s>
                  <span data-sx-acct-billed="pro">${PRICING.monthly.pro.billed}</span>
                </p>
                <p class="sx-acct-plan__desc">${PLAN_BLURBS.pro}</p>
                <ul class="sx-acct-plan__features">
                  ${PLAN_HIGHLIGHTS.pro.map((f) => `<li><i class="fa-solid fa-check" aria-hidden="true"></i>${escapeHtml(f)}</li>`).join('')}
                </ul>
                ${
                  tier === 'pro'
                    ? '<button type="button" class="sx-acct-btn" data-sx-acct-manage-plan>Manage plan</button>'
                    : '<button type="button" class="sx-acct-btn sx-acct-btn--primary" data-sx-acct-upgrade="pro">Upgrade to Premium</button>'
                }
              </article>
            </div>
            <p class="sx-acct-hint" style="margin-top:14px">Taxes may apply at checkout. Plan changes take effect immediately; the new cycle starts on your next renewal.</p>
          </div>

          <div class="sx-acct-card sx-acct-card--span">
            <div class="sx-acct-card__head">
              <h2 class="sx-acct-card__title">Compare plans</h2>
              <p class="sx-acct-card__lead">Every limit side by side. Your current plan is highlighted.</p>
            </div>
            ${comparisonHtml(tier)}
          </div>

          <div class="sx-acct-card sx-acct-card--span" data-sx-acct-billing-card>
            <div class="sx-acct-card__head">
              <h2 class="sx-acct-card__title">Billing &amp; invoices</h2>
              <p class="sx-acct-card__lead">Payments recorded against this account.</p>
            </div>
            <div data-sx-acct-billing><p class="sx-acct-hint">Loading billing history…</p></div>
          </div>
        </div>
      </section>

      <section class="sx-acct__panel" role="tabpanel" id="sx-acct-panel-backtesting" aria-labelledby="sx-acct-tab-backtesting" data-sx-acct-panel="backtesting" hidden tabindex="0">
        <div class="sx-acct__grid">
          <div class="sx-acct-card sx-acct-card--span">
            <div class="sx-acct-card__head">
              <h2 class="sx-acct-card__title">New session defaults</h2>
              <p class="sx-acct-card__lead">Pre-filled every time you create a backtesting session.</p>
            </div>
            <div class="sx-acct-fields sx-acct-fields--3">
              <div class="sx-acct-field">
                <label class="sx-acct-label" for="sx-acct-balance">Default account balance</label>
                <input id="sx-acct-balance" class="sx-acct-input" type="number" min="1000" max="10000000" step="1000" value="${readDefaultSessionBalance()}" data-sx-acct-balance />
                <p class="sx-acct-hint">Currently ${formatMoney(readDefaultSessionBalance())}.</p>
              </div>
              <div class="sx-acct-field">
                <label class="sx-acct-label" for="sx-acct-interval">Default timeframe</label>
                <select id="sx-acct-interval" class="sx-acct-select" data-sx-acct-interval>
                  ${SETTINGS_INTERVAL_OPTIONS.map((p) => `<option value="${p}"${p === defaultInterval ? ' selected' : ''}>${p}</option>`).join('')}
                </select>
                <p class="sx-acct-hint">Timeframe a new chart opens on.</p>
              </div>
              <div class="sx-acct-field">
                <label class="sx-acct-label" for="sx-acct-strategy">Default strategy</label>
                <select id="sx-acct-strategy" class="sx-acct-select" data-sx-acct-strategy>
                  <option value="">No strategy preselected</option>
                  ${strategies
                    .map(
                      (s) =>
                        `<option value="${escapeAttr(s.id)}"${s.id === defaultStrategyId ? ' selected' : ''}>${escapeHtml(strategySelectLabel(s))}</option>`,
                    )
                    .join('')}
                </select>
                <p class="sx-acct-hint">Loaded into the chart's strategy picker.</p>
              </div>
            </div>
            <label class="sx-acct-toggle" for="sx-acct-confirm-close">
              <input id="sx-acct-confirm-close" type="checkbox" data-sx-acct-confirm-close ${readConfirmCloseTrade() ? 'checked' : ''} />
              <span>
                <strong>Confirm before closing trades</strong>
                <em>Ask for confirmation when closing paper positions in replay.</em>
              </span>
            </label>
            <div class="sx-acct-actions">
              <button type="button" class="sx-acct-btn sx-acct-btn--primary" data-sx-acct-save-backtesting>Save defaults</button>
            </div>
            <p class="sx-acct-saved" data-sx-acct-backtesting-saved aria-live="polite"></p>
          </div>
        </div>
      </section>

      <section class="sx-acct__panel" role="tabpanel" id="sx-acct-panel-costs" aria-labelledby="sx-acct-tab-costs" data-sx-acct-panel="costs" hidden tabindex="0">
        <div class="sx-acct__grid">
          <div class="sx-acct-card">
            <div class="sx-acct-card__head">
              <h2 class="sx-acct-card__title">Trading costs</h2>
              <p class="sx-acct-card__lead">Applied to every backtest run so results match your broker.</p>
            </div>
            <div class="sx-acct-fields">
              <div class="sx-acct-field">
                <label class="sx-acct-label" for="sx-acct-commission">Commission per trade</label>
                <input id="sx-acct-commission" class="sx-acct-input" type="number" min="0" max="1000" step="0.5" value="${readDefaultCommission()}" data-sx-acct-commission />
                <p class="sx-acct-hint">US dollars, round-trip. Deducted from each trade's net P&amp;L.</p>
              </div>
              <div class="sx-acct-field">
                <label class="sx-acct-label" for="sx-acct-slippage-mode">Spread / slippage</label>
                <select id="sx-acct-slippage-mode" class="sx-acct-select" data-sx-acct-slippage-mode>
                  <option value="auto"${slippageMode === 'auto' ? ' selected' : ''}>Automatic per symbol</option>
                  <option value="fixed"${slippageMode === 'fixed' ? ' selected' : ''}>Fixed for all symbols</option>
                </select>
                <p class="sx-acct-hint">Added to buy fills and subtracted from sell fills.</p>
              </div>
              <div class="sx-acct-field" data-sx-acct-slippage-fixed-field ${slippageMode === 'fixed' ? '' : 'hidden'}>
                <label class="sx-acct-label" for="sx-acct-slippage-fixed">Fixed slippage (price units)</label>
                <input id="sx-acct-slippage-fixed" class="sx-acct-input" type="number" min="0" max="100" step="0.0001" value="${readFixedSlippage()}" data-sx-acct-slippage-fixed />
              </div>
            </div>
            <div class="sx-acct-actions">
              <button type="button" class="sx-acct-btn sx-acct-btn--primary" data-sx-acct-save-costs>Save costs</button>
            </div>
            <p class="sx-acct-saved" data-sx-acct-costs-saved aria-live="polite"></p>
          </div>

          <div class="sx-acct-card">
            <div class="sx-acct-card__head">
              <h2 class="sx-acct-card__title">Automatic slippage</h2>
              <p class="sx-acct-card__lead">What "Automatic per symbol" resolves to.</p>
            </div>
            <table class="sx-acct-table">
              <thead><tr><th scope="col">Instrument</th><th scope="col">Example</th><th scope="col">Slippage</th></tr></thead>
              <tbody>
                ${SLIPPAGE_REFERENCE.map(
                  (r) =>
                    `<tr><td>${escapeHtml(r.label)}</td><td>${escapeHtml(r.sample)}</td><td>${defaultBacktestSlippage(r.sample)}</td></tr>`,
                ).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="sx-acct__panel" role="tabpanel" id="sx-acct-panel-usage" aria-labelledby="sx-acct-tab-usage" data-sx-acct-panel="usage" hidden tabindex="0">
        <div class="sx-acct__grid">
          <div class="sx-acct-card sx-acct-card--span">
            <div class="sx-acct-card__head">
              <h2 class="sx-acct-card__title">Sessions</h2>
              <p class="sx-acct-card__lead">Everything stored for ${escapeHtml(displayName)} in this browser.</p>
            </div>
            <dl class="sx-acct-stats">
              <div><dt>Total sessions</dt><dd>${stats?.total ?? 0}</dd></div>
              <div><dt>Backtest sessions</dt><dd>${stats?.backtest ?? 0}</dd></div>
              <div><dt>Prop sessions</dt><dd>${stats?.prop ?? 0}</dd></div>
              <div><dt>With backtest run</dt><dd>${stats?.withBacktest ?? 0}</dd></div>
              <div><dt>With paper journal</dt><dd>${stats?.withJournal ?? 0}</dd></div>
              <div><dt>Member since</dt><dd>${escapeHtml(memberSinceLabel)}</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section class="sx-acct__panel" role="tabpanel" id="sx-acct-panel-deleted" aria-labelledby="sx-acct-tab-deleted" data-sx-acct-panel="deleted" hidden tabindex="0">
        <div class="sx-acct__grid">
          <div class="sx-acct-card sx-acct-card--span">
            <div class="sx-acct-card__head">
              <h2 class="sx-acct-card__title">Recycle bin</h2>
              <p class="sx-acct-card__lead">Deleted sessions stay here for ${deletedSessionRetentionDays()} days, then clear themselves.</p>
            </div>
            <div data-sx-acct-deleted></div>
          </div>
        </div>
      </section>
    </div>
  `
  root.appendChild(shell)

  const q = <T extends HTMLElement>(sel: string) => shell.querySelector<T>(sel)

  /* ——— Tabs ——— */
  const tabButtons = Array.from(shell.querySelectorAll<HTMLButtonElement>('[data-sx-acct-tab]'))
  const panels = Array.from(shell.querySelectorAll<HTMLElement>('[data-sx-acct-panel]'))

  function selectTab(key: AccountTabKey, focus = false) {
    tabButtons.forEach((btn) => {
      const active = btn.dataset.sxAcctTab === key
      btn.setAttribute('aria-selected', active ? 'true' : 'false')
      btn.tabIndex = active ? 0 : -1
      if (active && focus) btn.focus()
    })
    panels.forEach((p) => {
      p.hidden = p.dataset.sxAcctPanel !== key
    })
    if (key === 'devices') void loadDevices()
    if (key === 'subscription') void loadBilling()
    if (key === 'deleted') renderDeleted()
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => selectTab(btn.dataset.sxAcctTab as AccountTabKey))
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      e.preventDefault()
      const i = tabButtons.indexOf(btn)
      const next = (i + (e.key === 'ArrowRight' ? 1 : tabButtons.length - 1)) % tabButtons.length
      selectTab(tabButtons[next]!.dataset.sxAcctTab as AccountTabKey, true)
    })
  })

  /* ——— Status lines. Each panel owns one, so they are keyed by element rather
     than sharing a single timer. Only success auto-clears: an error the user
     did not get to read is worse than one that lingers. ——— */
  const savedTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>()

  function setStatus(el: HTMLElement | null, text: string, tone: 'ok' | 'busy' | 'error' = 'ok') {
    if (!el) return
    el.textContent = text
    el.classList.toggle('is-error', tone === 'error')
    el.classList.toggle('is-busy', tone === 'busy')
    const existing = savedTimers.get(el)
    if (existing) clearTimeout(existing)
    savedTimers.delete(el)
    if (tone !== 'ok') return
    savedTimers.set(
      el,
      setTimeout(() => {
        el.textContent = ''
        savedTimers.delete(el)
      }, 2200),
    )
  }

  const flashSaved = (el: HTMLElement | null, text = 'Saved') => setStatus(el, text)

  const accountSaved = q<HTMLElement>('[data-sx-acct-account-saved]')
  const backtestingSaved = q<HTMLElement>('[data-sx-acct-backtesting-saved]')
  const costsSaved = q<HTMLElement>('[data-sx-acct-costs-saved]')
  const passMsg = q<HTMLElement>('[data-sx-acct-pass-msg]')

  /* ——— Back / plan ——— */
  const onBack = () => opts.onBack?.()
  q('[data-sx-acct-back]')?.addEventListener('click', onBack)

  const onManagePlan = () => opts.onOpenSubscription?.()
  shell.querySelectorAll('[data-sx-acct-manage-plan]').forEach((b) => b.addEventListener('click', onManagePlan))

  /* ——— Subscription tab: pricing switcher, checkout and invoices ——— */
  let cycle: BillingCycle = 'monthly'

  function applyCycle(next: BillingCycle) {
    cycle = next
    shell.querySelectorAll<HTMLButtonElement>('[data-sx-acct-cycle]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-sx-acct-cycle') === next)
    })
    ;(['intermediate', 'pro'] as const).forEach((plan) => {
      const price = PRICING[next][plan]
      const put = (field: string, text: string) => {
        const el = shell.querySelector(`[data-sx-acct-${field}="${plan}"]`)
        if (el) el.textContent = text
      }
      put('price', price.label)
      put('period', price.period)
      put('was', price.original)
      put('billed', price.billed)
      put('save', price.save)
    })
  }

  shell.querySelectorAll<HTMLButtonElement>('[data-sx-acct-cycle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-sx-acct-cycle')
      if (isBillingCycle(next)) applyCycle(next)
    })
  })
  applyCycle('monthly')

  /* ——— Manage Subscription dropdown: opens in place rather than navigating
     to the standalone subscription page. ——— */
  const managePicker = q<HTMLElement>('[data-sx-acct-manage-picker]')
  const manageTrigger = q<HTMLButtonElement>('#sx-acct-manage-trigger')
  const manageMenu = q<HTMLElement>('#sx-acct-manage-menu')

  function closeManageMenu() {
    if (!manageMenu) return
    manageMenu.hidden = true
    manageTrigger?.setAttribute('aria-expanded', 'false')
  }

  manageTrigger?.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!manageMenu) return
    if (manageMenu.hidden) {
      manageMenu.hidden = false
      manageTrigger.setAttribute('aria-expanded', 'true')
    } else {
      closeManageMenu()
    }
  })

  const managePanel = q<HTMLElement>('[data-sx-acct-manage-panel]')
  const managePanelTitle = q<HTMLElement>('[data-sx-acct-manage-panel-title]')
  const managePanelBody = q<HTMLElement>('[data-sx-acct-manage-panel-body]')

  function closeManagePanel() {
    if (managePanel) managePanel.hidden = true
  }

  function openManagePanel(title: string, html: string) {
    if (!managePanel || !managePanelTitle || !managePanelBody) return
    managePanelTitle.textContent = title
    managePanelBody.innerHTML = html
    managePanel.hidden = false
    managePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  q('[data-sx-acct-manage-panel-close]')?.addEventListener('click', closeManagePanel)

  manageMenu?.querySelectorAll<HTMLButtonElement>('[data-sx-acct-manage-item]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-sx-acct-manage-item')
      closeManageMenu()
      if (kind === 'billing') openBillingCyclePanel()
      else if (kind === 'history') q('[data-sx-acct-billing-card]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else if (kind === 'address') openAddressPanel()
      else if (kind === 'pause') openPausePanel()
      else if (kind === 'cancel') openCancelPanel()
    })
  })

  const onDocumentClickManage = (e: MouseEvent) => {
    if (managePicker && !managePicker.contains(e.target as Node)) closeManageMenu()
  }
  document.addEventListener('click', onDocumentClickManage)

  const checkout = createCheckoutOverlay({
    onComplete: (order, method) => {
      opts.writeTier?.(order.plan)
      void recordCheckoutComplete(order, method)
    },
    // The tab renders tier-dependent markup top to bottom, so the host remounts
    // it rather than us patching a dozen nodes in place.
    onDismissAfterComplete: () => opts.onTierChange?.(opts.readTier?.() ?? tier),
  })

  shell.querySelectorAll<HTMLButtonElement>('[data-sx-acct-upgrade]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plan = btn.getAttribute('data-sx-acct-upgrade')
      if (plan === 'intermediate' || plan === 'pro') checkout.open(plan as CheckoutPlan, cycle)
    })
  })

  const billingHost = q<HTMLElement>('[data-sx-acct-billing]')
  let billingRequested = false
  let latestBilling: MyBilling | null = null

  function setPlanStat(field: string, text: string) {
    const el = q<HTMLElement>(`[data-sx-acct-plan-${field}]`)
    if (el) el.textContent = text
  }

  function applyBilling(data: MyBilling | null) {
    latestBilling = data
    const sub = data?.subscription ?? null
    const noSub = tier === 'free' ? 'No subscription' : 'Not recorded'
    setPlanStat('cycle', sub ? CYCLE_LABELS[sub.cycle] : tier === 'free' ? '—' : 'Monthly')
    setPlanStat('renews', sub ? formatDate(sub.currentPeriodEnd) : '—')
    setPlanStat('status', sub ? sub.status.charAt(0).toUpperCase() + sub.status.slice(1) : noSub)

    // The Pause menu item doubles as Resume once a subscription is actually
    // paused, so the entry point to get out of the state is the same one
    // that got you into it.
    const paused = sub?.status === 'paused'
    const pauseTitle = q<HTMLElement>('[data-sx-acct-manage-pause-title]')
    const pauseSub = q<HTMLElement>('[data-sx-acct-manage-pause-sub]')
    const pauseIco = q<HTMLElement>('[data-sx-acct-manage-pause-ico]')
    if (pauseTitle) pauseTitle.textContent = paused ? 'Resume subscription' : 'Pause subscription'
    if (pauseSub) pauseSub.textContent = paused ? 'Restart billing and access' : 'Temporarily stop billing'
    if (pauseIco) pauseIco.className = paused ? 'fa-solid fa-play' : 'fa-solid fa-pause'

    if (!billingHost) return

    const summary = sub
      ? `<dl class="sx-acct-stats sx-acct-stats--tight" style="margin-bottom:16px">
          <div><dt>Subscription</dt><dd>${escapeHtml(PLAN_NAMES[sub.plan])}</dd></div>
          <div><dt>Billing cycle</dt><dd>${CYCLE_LABELS[sub.cycle]}</dd></div>
          <div><dt>Monthly value</dt><dd>${escapeHtml(formatAmount(sub.mrr))}</dd></div>
          <div><dt>Next charge</dt><dd>${escapeHtml(formatDate(sub.currentPeriodEnd))}</dd></div>
        </dl>`
      : ''

    const rows = data?.transactions ?? []
    const history = rows.length
      ? `<div class="sx-acct-tablewrap">
          <table class="sx-acct-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Plan</th>
                <th scope="col">Cycle</th>
                <th scope="col">Method</th>
                <th scope="col">Status</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (t) => `<tr>
                    <td>${escapeHtml(formatDate(t.ts))}</td>
                    <td>${escapeHtml(PLAN_NAMES[t.plan])}</td>
                    <td>${CYCLE_LABELS[t.cycle]}</td>
                    <td>${escapeHtml(t.method)}</td>
                    <td>${escapeHtml(t.status)}</td>
                    <td>${escapeHtml(formatAmount(t.total))}</td>
                  </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>`
      : `<div class="sx-acct-empty">
          <i class="fa-regular fa-file-lines" aria-hidden="true"></i>
          <strong>No payments yet</strong>
          <span>Invoices show up here as soon as your first upgrade goes through.</span>
        </div>`

    billingHost.innerHTML = `${summary}${history}`
  }

  async function loadBilling(force = false) {
    if (billingRequested && !force) return
    billingRequested = true
    if (isGuest) {
      setPlanStat('cycle', '—')
      setPlanStat('renews', '—')
      setPlanStat('status', 'Guest mode')
      if (billingHost) {
        billingHost.innerHTML = `<div class="sx-acct-empty">
          <i class="fa-regular fa-user" aria-hidden="true"></i>
          <strong>Guest mode has no billing</strong>
          <span>Create an account to subscribe and keep your invoices.</span>
        </div>`
      }
      return
    }
    applyBilling(await fetchMyBilling())
  }

  async function refreshBilling() {
    billingRequested = false
    await loadBilling(true)
  }

  /* ——— Manage Subscription panels: billing cycle, address, pause/resume,
     cancel. Each renders into the shared panel and wires its own controls
     right after, since innerHTML swaps discard any previous listeners. ——— */
  function upgradeHintPanel(title: string): string {
    return `<p class="sx-acct-hint">You're on the Basic plan, so there's nothing to manage yet.</p>
      <button type="button" class="sx-acct-btn sx-acct-btn--primary" data-sx-acct-panel-scroll-plans>${escapeHtml(title)}</button>`
  }

  function wirePanelScrollToPlans() {
    managePanelBody?.querySelector('[data-sx-acct-panel-scroll-plans]')?.addEventListener('click', () => {
      closeManagePanel()
      q('[data-sx-acct-plans]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function openBillingCyclePanel() {
    const sub = latestBilling?.subscription ?? null
    if (!sub || sub.status !== 'active') {
      openManagePanel('Billing option', upgradeHintPanel('View plans'))
      wirePanelScrollToPlans()
      return
    }
    const others = BILLING_CYCLES.filter((c) => c !== sub.cycle)
    const html = `
      <p class="sx-acct-manage-panel__lead">You're on the ${escapeHtml(CYCLE_LABELS[sub.cycle])} cycle for ${escapeHtml(PLAN_NAMES[sub.plan])}. Switching starts a fresh period today.</p>
      <div class="sx-acct-manage-panel__actions">
        ${others
          .map(
            (c) =>
              `<button type="button" class="sx-acct-btn" data-sx-acct-panel-cycle="${c}">Switch to ${escapeHtml(CYCLE_LABELS[c])}</button>`,
          )
          .join('')}
      </div>
      <p class="sx-acct-manage-panel__status" data-sx-acct-panel-msg></p>`
    openManagePanel('Billing option', html)
    const msg = managePanelBody?.querySelector<HTMLElement>('[data-sx-acct-panel-msg]')
    managePanelBody?.querySelectorAll<HTMLButtonElement>('[data-sx-acct-panel-cycle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.getAttribute('data-sx-acct-panel-cycle')
        if (!isBillingCycle(next)) return
        btn.disabled = true
        if (msg) msg.textContent = 'Updating…'
        void changeBillingCycle(next).then((result) => {
          if (!result.ok) {
            btn.disabled = false
            if (msg) msg.textContent = 'Could not update your billing cycle. Try again.'
            return
          }
          applyCycle(next)
          void refreshBilling().then(() => openBillingCyclePanel())
        })
      })
    })
  }

  function openAddressPanel() {
    if (isGuest) {
      openManagePanel('Billing & shipping address', '<p class="sx-acct-hint">Create an account to save a billing address.</p>')
      return
    }
    const addr = latestBilling?.address
    const field = (label: string, key: keyof BillingAddress, value: string, required = true) =>
      `<label class="sx-acct-manage-panel__field">${escapeHtml(label)}<input type="text" data-sx-acct-panel-addr="${key}" value="${escapeAttr(value)}" ${required ? 'required' : ''} /></label>`
    const html = `
      ${field('Full name', 'fullName', addr?.fullName ?? '')}
      ${field('Address line 1', 'line1', addr?.line1 ?? '')}
      ${field('Address line 2', 'line2', addr?.line2 ?? '', false)}
      <div class="sx-acct-manage-panel__row">
        ${field('City', 'city', addr?.city ?? '')}
        ${field('State / region', 'region', addr?.region ?? '', false)}
      </div>
      <div class="sx-acct-manage-panel__row">
        ${field('Postal code', 'postalCode', addr?.postalCode ?? '')}
        ${field('Country', 'country', addr?.country ?? '')}
      </div>
      <p class="sx-acct-manage-panel__status" data-sx-acct-panel-msg></p>
      <button type="button" class="sx-acct-btn sx-acct-btn--primary" data-sx-acct-panel-save-address>Save address</button>`
    openManagePanel('Billing & shipping address', html)
    const msg = managePanelBody?.querySelector<HTMLElement>('[data-sx-acct-panel-msg]')
    managePanelBody?.querySelector('[data-sx-acct-panel-save-address]')?.addEventListener('click', () => {
      const read = (key: keyof BillingAddress) =>
        managePanelBody?.querySelector<HTMLInputElement>(`[data-sx-acct-panel-addr="${key}"]`)?.value.trim() ?? ''
      const payload = {
        fullName: read('fullName'),
        line1: read('line1'),
        line2: read('line2'),
        city: read('city'),
        region: read('region'),
        postalCode: read('postalCode'),
        country: read('country'),
      }
      if (!payload.fullName || !payload.line1 || !payload.city || !payload.postalCode || !payload.country) {
        if (msg) msg.textContent = 'Fill in name, address, city, postal code, and country.'
        return
      }
      if (msg) msg.textContent = 'Saving…'
      void saveBillingAddress(payload).then((result) => {
        if (!result.ok) {
          if (msg) msg.textContent = 'Could not save your address. Try again.'
          return
        }
        if (latestBilling) latestBilling = { ...latestBilling, address: result.address }
        if (msg) msg.textContent = 'Address saved.'
      })
    })
  }

  function openPausePanel() {
    const sub = latestBilling?.subscription ?? null
    if (sub?.status === 'paused') {
      const html = `
        <p class="sx-acct-manage-panel__lead">${escapeHtml(PLAN_NAMES[sub.plan])} is paused. Resume to restore your sessions, indicators, and retention.</p>
        <p class="sx-acct-manage-panel__status" data-sx-acct-panel-msg></p>
        <button type="button" class="sx-acct-btn sx-acct-btn--primary" data-sx-acct-panel-resume>Resume subscription</button>`
      openManagePanel('Resume subscription', html)
      const msg = managePanelBody?.querySelector<HTMLElement>('[data-sx-acct-panel-msg]')
      managePanelBody?.querySelector<HTMLButtonElement>('[data-sx-acct-panel-resume]')?.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLButtonElement
        btn.disabled = true
        if (msg) msg.textContent = 'Resuming…'
        void resumeBillingSubscription().then((result) => {
          if (!result.ok) {
            btn.disabled = false
            if (msg) msg.textContent = 'Could not resume. Try again.'
            return
          }
          opts.writeTier?.(result.subscription.plan)
          void refreshBilling().then(() => {
            closeManagePanel()
            opts.onTierChange?.(result.subscription.plan)
          })
        })
      })
      return
    }
    if (!sub || sub.status !== 'active') {
      openManagePanel('Pause subscription', upgradeHintPanel('View plans'))
      wirePanelScrollToPlans()
      return
    }
    const html = `
      <p class="sx-acct-manage-panel__lead">Pause ${escapeHtml(PLAN_NAMES[sub.plan])}. You'll drop to the Basic plan until you resume — nothing here schedules a real recurring charge to stop.</p>
      <p class="sx-acct-manage-panel__status" data-sx-acct-panel-msg></p>
      <button type="button" class="sx-acct-btn" data-sx-acct-panel-pause>Pause for now</button>`
    openManagePanel('Pause subscription', html)
    const msg = managePanelBody?.querySelector<HTMLElement>('[data-sx-acct-panel-msg]')
    managePanelBody?.querySelector<HTMLButtonElement>('[data-sx-acct-panel-pause]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement
      btn.disabled = true
      if (msg) msg.textContent = 'Pausing…'
      void pauseBillingSubscription().then((result) => {
        if (!result.ok) {
          btn.disabled = false
          if (msg) msg.textContent = 'Could not pause. Try again.'
          return
        }
        opts.writeTier?.('free')
        void refreshBilling().then(() => {
          closeManagePanel()
          opts.onTierChange?.('free')
        })
      })
    })
  }

  function openCancelPanel() {
    const sub = latestBilling?.subscription ?? null
    if (sub?.status === 'canceled') {
      openManagePanel(
        'Cancel subscription',
        `<p class="sx-acct-hint">Your ${escapeHtml(PLAN_NAMES[sub.plan])} subscription was already canceled${sub.canceledAt ? ` on ${escapeHtml(formatDate(sub.canceledAt))}` : ''}.</p>`,
      )
      return
    }
    if (!sub) {
      openManagePanel('Cancel subscription', upgradeHintPanel('View plans'))
      wirePanelScrollToPlans()
      return
    }
    const html = `
      <p class="sx-acct-manage-panel__lead">Cancel ${escapeHtml(PLAN_NAMES[sub.plan])}? You'll move to the Basic plan right away.</p>
      <p class="sx-acct-manage-panel__status" data-sx-acct-panel-msg></p>
      <button type="button" class="sx-acct-btn sx-acct-btn--danger" data-sx-acct-panel-cancel>Cancel subscription</button>`
    openManagePanel('Cancel subscription', html)
    const msg = managePanelBody?.querySelector<HTMLElement>('[data-sx-acct-panel-msg]')
    managePanelBody?.querySelector<HTMLButtonElement>('[data-sx-acct-panel-cancel]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement
      btn.disabled = true
      if (msg) msg.textContent = 'Canceling…'
      void cancelBillingSubscription().then((result) => {
        if (!result.ok) {
          btn.disabled = false
          if (msg) msg.textContent = 'Could not cancel. Try again.'
          return
        }
        opts.writeTier?.('free')
        void refreshBilling().then(() => {
          closeManagePanel()
          opts.onTierChange?.('free')
        })
      })
    })
  }

  /* ——— Avatar ——— */
  const dpPreview = q<HTMLElement>('[data-sx-acct-dp-preview]')
  const dpFile = q<HTMLInputElement>('[data-sx-acct-dp-file]')
  const dpRemove = q<HTMLButtonElement>('[data-sx-acct-dp-remove]')

  function applyAvatar(url: string | null) {
    const name = q<HTMLInputElement>('[data-sx-acct-username]')?.value ?? displayName
    if (dpPreview) dpPreview.innerHTML = avatarMarkup(initialsFrom(name), url)
    if (dpRemove) dpRemove.hidden = !url
  }

  q('[data-sx-acct-dp-change]')?.addEventListener('click', () => dpFile?.click())

  dpFile?.addEventListener('change', () => {
    const file = dpFile.files?.[0]
    if (!file) return
    void compressAvatarFile(file)
      .then((dataUrl) => {
        writeUserAvatar(dataUrl)
        applyAvatar(dataUrl)
        opts.onAvatarChange?.()
        flashSaved(accountSaved, 'Photo updated')
      })
      .catch((err: unknown) => {
        setStatus(accountSaved, err instanceof Error ? err.message : 'Could not update photo.', 'error')
      })
      .finally(() => {
        dpFile.value = ''
      })
  })

  dpRemove?.addEventListener('click', () => {
    writeUserAvatar(null)
    applyAvatar(null)
    opts.onAvatarChange?.()
    flashSaved(accountSaved, 'Photo removed')
  })

  /* ——— Account tab: name, username, timezone and language all commit together
     on "Save changes", so nothing on this tab applies until you ask for it. ——— */
  const usernameInput = q<HTMLInputElement>('[data-sx-acct-username]')
  const nameDisplay = q<HTMLElement>('[data-sx-acct-name-display]')
  const handleInput = q<HTMLInputElement>('[data-sx-acct-handle]')
  const handleHint = q<HTMLElement>('[data-sx-acct-handle-hint]')
  const timezoneSelect = q<HTMLSelectElement>('[data-sx-acct-timezone]')
  if (timezoneSelect) timezoneSelect.value = readUserTimezone()

  let pendingLocale = opts.readLocale()
  /** Username as the server last confirmed it, so we can skip a no-op write. */
  let savedHandle = ''

  const HANDLE_HELP =
    'Lowercase letters, numbers, and hyphens. You can sign in with this instead of your email.'

  function setHandleHint(text: string, tone: 'help' | 'ok' | 'error' = 'help') {
    if (!handleHint) return
    handleHint.textContent = text
    handleHint.classList.toggle('is-error', tone === 'error')
    handleHint.classList.toggle('is-ok', tone === 'ok')
  }

  if (!isGuest && handleInput) {
    void fetchAuthProfile().then((result) => {
      if (!result.ok) {
        handleInput.placeholder = ''
        setHandleHint(result.error, 'error')
        return
      }
      savedHandle = result.profile.username
      handleInput.value = savedHandle
      handleInput.placeholder = ''
      setHandleHint('You are using your current username.', 'ok')
    })
    handleInput.addEventListener('input', () => {
      const typed = handleInput.value.trim().toLowerCase()
      if (!savedHandle || typed === savedHandle) setHandleHint('You are using your current username.', 'ok')
      else setHandleHint(HANDLE_HELP)
    })
  }

  const onSaveAccount = () => {
    const next = usernameInput?.value.trim().slice(0, 48) || readDisplayName()
    writeDisplayName(next)
    if (usernameInput) usernameInput.value = next
    if (nameDisplay) nameDisplay.textContent = next
    shell.querySelectorAll('[data-sx-acct-avatar-fallback]').forEach((el) => {
      el.textContent = initialsFrom(next)
    })
    opts.onDisplayNameChange?.(next)

    if (timezoneSelect) writeUserTimezone(timezoneSelect.value)
    if (pendingLocale !== opts.readLocale()) opts.writeLocale(pendingLocale)

    // The username is the only part of this tab the server owns, so it is the
    // only part that can fail. Everything above has already been applied.
    const handle = handleInput?.value.trim().toLowerCase() ?? ''
    if (isGuest || !handleInput || !handle || handle === savedHandle) {
      flashSaved(accountSaved, 'Changes saved')
      return
    }
    setStatus(accountSaved, 'Saving…', 'busy')
    void updateAuthProfile({ name: next, username: handle }).then((result) => {
      if (!result.ok) {
        handleInput.value = savedHandle
        setHandleHint(result.error, 'error')
        setStatus(accountSaved, 'Everything else saved — username unchanged', 'error')
        return
      }
      savedHandle = result.profile.username
      handleInput.value = savedHandle
      setHandleHint('You are using your current username.', 'ok')
      flashSaved(accountSaved, 'Changes saved')
    })
  }
  q('[data-sx-acct-save-account]')?.addEventListener('click', onSaveAccount)
  const saveOnEnter = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    onSaveAccount()
  }
  usernameInput?.addEventListener('keydown', saveOnEnter)
  handleInput?.addEventListener('keydown', saveOnEnter)

  /* ——— Change email. Separate from "Save changes" because it needs the
     password and re-issues the session. ——— */
  const emailForm = q<HTMLElement>('[data-sx-acct-email-form]')
  const emailCurrent = q<HTMLInputElement>('[data-sx-acct-email-current]')
  const emailNew = q<HTMLInputElement>('[data-sx-acct-email-new]')
  const emailPass = q<HTMLInputElement>('[data-sx-acct-email-pass]')
  const emailMsg = q<HTMLElement>('[data-sx-acct-email-msg]')
  const emailOpen = q<HTMLButtonElement>('[data-sx-acct-email-open]')
  const emailSave = q<HTMLButtonElement>('[data-sx-acct-email-save]')

  function closeEmailForm() {
    if (emailForm) emailForm.hidden = true
    if (emailOpen) emailOpen.hidden = false
    if (emailNew) emailNew.value = ''
    if (emailPass) emailPass.value = ''
  }

  emailOpen?.addEventListener('click', () => {
    if (emailForm) emailForm.hidden = false
    emailOpen.hidden = true
    if (emailMsg) emailMsg.textContent = ''
    emailNew?.focus()
  })
  q('[data-sx-acct-email-cancel]')?.addEventListener('click', () => {
    closeEmailForm()
    if (emailMsg) emailMsg.textContent = ''
  })

  const onChangeEmail = () => {
    if (!emailNew || !emailPass || !emailSave) return
    const next = emailNew.value.trim()
    const password = emailPass.value
    if (!next || !password) {
      setStatus(emailMsg, 'Enter the new address and your password.', 'error')
      return
    }
    emailSave.disabled = true
    setStatus(emailMsg, 'Updating…', 'busy')
    void changeAuthEmail(password, next)
      .then((result) => {
        if (!result.ok) {
          setStatus(emailMsg, result.error, 'error')
          return
        }
        if (emailCurrent) emailCurrent.value = result.email
        const headerEmail = shell.querySelector('.sx-acct__email')
        if (headerEmail) headerEmail.textContent = result.email
        closeEmailForm()
        flashSaved(emailMsg, 'Email updated')
      })
      .finally(() => {
        emailSave.disabled = false
      })
  }
  emailSave?.addEventListener('click', onChangeEmail)
  emailPass?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    onChangeEmail()
  })

  const localePicker = q<HTMLElement>('[data-sx-acct-locale-picker]')
  const localeTrigger = q<HTMLButtonElement>('#sx-acct-locale-trigger')
  const localeMenu = q<HTMLElement>('#sx-acct-locale-menu')
  const localeValue = q<HTMLElement>('[data-sx-acct-locale-value]')

  function localeLabel(code: string): string {
    const match = opts.localeOptions.find((l) => l.code === code)
    return match ? dashLocaleMenuLabel(match.code, match.name) : code.toUpperCase()
  }

  function closeLocaleMenu() {
    if (!localeMenu) return
    localeMenu.hidden = true
    localeTrigger?.setAttribute('aria-expanded', 'false')
  }

  if (localeMenu) {
    localeMenu.innerHTML = opts.localeOptions
      .map((l) => {
        const active = l.code === opts.readLocale()
        return `<button type="button" class="sx-acct-locale__option${active ? ' sx-acct-locale__option--active' : ''}" role="option" data-locale-code="${l.code}" aria-selected="${active ? 'true' : 'false'}">${dashLocaleMenuLabel(l.code, l.name)}</button>`
      })
      .join('')
  }
  if (localeValue) localeValue.textContent = localeLabel(opts.readLocale())

  localeTrigger?.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!localeMenu) return
    if (localeMenu.hidden) {
      localeMenu.hidden = false
      localeTrigger.setAttribute('aria-expanded', 'true')
    } else {
      closeLocaleMenu()
    }
  })

  localeMenu?.querySelectorAll<HTMLButtonElement>('.sx-acct-locale__option').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      const code = btn.dataset.localeCode
      if (!code) return
      pendingLocale = code
      if (localeValue) localeValue.textContent = localeLabel(code)
      localeMenu.querySelectorAll<HTMLButtonElement>('.sx-acct-locale__option').forEach((o) => {
        const active = o.dataset.localeCode === code
        o.classList.toggle('sx-acct-locale__option--active', active)
        o.setAttribute('aria-selected', active ? 'true' : 'false')
      })
      closeLocaleMenu()
    })
  })

  const onDocumentClick = (e: MouseEvent) => {
    if (localePicker && !localePicker.contains(e.target as Node)) closeLocaleMenu()
  }
  document.addEventListener('click', onDocumentClick)

  /* ——— Backtesting defaults ——— */
  q('[data-sx-acct-save-backtesting]')?.addEventListener('click', () => {
    const balance = q<HTMLInputElement>('[data-sx-acct-balance]')
    const interval = q<HTMLSelectElement>('[data-sx-acct-interval]')
    const strategy = q<HTMLSelectElement>('[data-sx-acct-strategy]')
    const confirmClose = q<HTMLInputElement>('[data-sx-acct-confirm-close]')
    if (balance) writeDefaultSessionBalance(Number(balance.value))
    if (interval) writeDefaultChartInterval(interval.value)
    if (strategy?.value) writeDefaultStrategyId(strategy.value)
    if (confirmClose) writeConfirmCloseTrade(confirmClose.checked)
    flashSaved(backtestingSaved, 'Defaults saved')
  })

  /* ——— Spreads & commissions ——— */
  const slippageModeSelect = q<HTMLSelectElement>('[data-sx-acct-slippage-mode]')
  const slippageFixedField = q<HTMLElement>('[data-sx-acct-slippage-fixed-field]')

  slippageModeSelect?.addEventListener('change', () => {
    if (slippageFixedField) slippageFixedField.hidden = slippageModeSelect.value !== 'fixed'
  })

  q('[data-sx-acct-save-costs]')?.addEventListener('click', () => {
    const commission = q<HTMLInputElement>('[data-sx-acct-commission]')
    const fixed = q<HTMLInputElement>('[data-sx-acct-slippage-fixed]')
    if (commission) writeDefaultCommission(Number(commission.value))
    if (slippageModeSelect) writeSlippageMode(slippageModeSelect.value === 'fixed' ? 'fixed' : 'auto')
    if (fixed) writeFixedSlippage(Number(fixed.value))
    flashSaved(costsSaved, 'Costs saved')
  })

  /* ——— Devices ———
     The list lives on the account, not in this browser, so it has to be
     fetched. Loaded the first time the tab is opened rather than on mount. ——— */
  const devicesHost = q<HTMLElement>('[data-sx-acct-devices]')
  let devicesLoaded = false

  function renderDevicesMessage(icon: string, title: string, detail: string) {
    if (!devicesHost) return
    devicesHost.innerHTML = `<div class="sx-acct-empty"><i class="${icon}" aria-hidden="true"></i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`
  }

  function renderDevices(devices: AuthDevice[]) {
    if (!devicesHost) return
    if (!devices.length) {
      renderDevicesMessage('fa-solid fa-desktop', 'No devices recorded yet', 'Sign in again and this browser will appear here.')
      return
    }
    devicesHost.innerHTML = `<div class="sx-acct-rows">${devices
      .map(
        (d) => `<div class="sx-acct-row${d.current ? ' sx-acct-row--current' : ''}">
        <div class="sx-acct-row__ico"><i class="${DEVICE_ICONS[d.kind] ?? DEVICE_ICONS.desktop}" aria-hidden="true"></i></div>
        <div class="sx-acct-row__copy">
          <p class="sx-acct-row__title">${escapeHtml(d.browser)} on ${escapeHtml(d.os)}${d.current ? '<span class="sx-acct-pill sx-acct-pill--ok">This device</span>' : ''}</p>
          <p class="sx-acct-row__meta">Last active ${escapeHtml(formatRelative(d.lastSeenAt))} · First seen ${escapeHtml(formatDateTime(d.firstSeenAt))}${d.ip ? ` · ${escapeHtml(d.ip)}` : ''}</p>
        </div>
        <div class="sx-acct-row__actions">
          <button type="button" class="sx-acct-btn sx-acct-btn--danger" data-sx-acct-revoke="${escapeAttr(d.id)}">${d.current ? 'Sign out' : 'Sign out device'}</button>
        </div>
      </div>`,
      )
      .join('')}</div>`

    devicesHost.querySelectorAll<HTMLButtonElement>('[data-sx-acct-revoke]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-sx-acct-revoke')
        if (!id) return
        const device = devices.find((d) => d.id === id)
        const label = device ? `${device.browser} on ${device.os}` : 'this device'
        if (!window.confirm(`Sign out ${label}? That browser will need to sign in again.`)) return
        btn.disabled = true
        btn.textContent = 'Signing out…'
        void revokeAuthDevice(id).then((result) => {
          if (!result.ok) {
            btn.disabled = false
            btn.textContent = 'Sign out device'
            renderDevicesMessage('fa-solid fa-triangle-exclamation', 'Could not sign that device out', result.error)
            return
          }
          // Revoking your own device invalidates this page's session, so send
          // the user to login rather than leaving a dead UI behind.
          if (result.signedOutSelf) {
            window.location.assign(resolveAppPath('login'))
            return
          }
          void loadDevices(true)
        })
      })
    })
  }

  async function loadDevices(force = false) {
    if (!devicesHost || (devicesLoaded && !force)) return
    devicesLoaded = true
    if (isGuest) {
      renderDevicesMessage('fa-solid fa-user-lock', 'Guest sessions are not tied to an account', 'Sign in to see and manage the devices holding your session.')
      return
    }
    renderDevicesMessage('fa-solid fa-circle-notch fa-spin', 'Loading devices…', 'Fetching the sessions on your account.')
    const result = await fetchAuthDevices()
    if (!result.ok) {
      renderDevicesMessage('fa-solid fa-triangle-exclamation', 'Could not load your devices', result.error)
      return
    }
    renderDevices(result.devices)
  }

  /* ——— Deleted sessions ——— */
  const deletedHost = q<HTMLElement>('[data-sx-acct-deleted]')

  function renderDeleted() {
    if (!deletedHost) return
    const rows: DeletedSession[] = listDeletedSessions()
    if (!rows.length) {
      deletedHost.innerHTML = `<div class="sx-acct-empty"><i class="fa-regular fa-trash-can" aria-hidden="true"></i><strong>Nothing in the bin</strong><span>Sessions you delete show up here so you can put them back.</span></div>`
      return
    }
    deletedHost.innerHTML = `<div class="sx-acct-rows">${rows
      .map(
        (s) => `<div class="sx-acct-row">
        <div class="sx-acct-row__ico"><i class="fa-regular fa-chart-bar" aria-hidden="true"></i></div>
        <div class="sx-acct-row__copy">
          <p class="sx-acct-row__title">${escapeHtml(s.name || 'Untitled session')}<span class="sx-acct-pill">${s.sessionType === 'prop' ? 'Prop' : 'Backtest'}</span></p>
          <p class="sx-acct-row__meta">${escapeHtml(s.assets || '—')} · Deleted ${escapeHtml(formatRelative(s.deletedAt))} · Created ${escapeHtml(formatDateTime(s.createdAt))}</p>
        </div>
        <div class="sx-acct-row__actions">
          <button type="button" class="sx-acct-btn" data-sx-acct-restore="${escapeAttr(s.id)}"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Restore</button>
          <button type="button" class="sx-acct-btn sx-acct-btn--danger" data-sx-acct-purge="${escapeAttr(s.id)}">Delete forever</button>
        </div>
      </div>`,
      )
      .join('')}</div>
      <div class="sx-acct-rows__foot">
        <p class="sx-acct-hint" style="margin:0">${rows.length} session${rows.length === 1 ? '' : 's'} recoverable for up to ${deletedSessionRetentionDays()} days.</p>
        <button type="button" class="sx-acct-btn sx-acct-btn--danger" data-sx-acct-empty-bin>Empty bin</button>
      </div>`

    deletedHost.querySelectorAll<HTMLButtonElement>('[data-sx-acct-restore]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-sx-acct-restore')
        if (id) restoreSession(id)
        renderDeleted()
        opts.onSessionsChange?.()
      })
    })

    deletedHost.querySelectorAll<HTMLButtonElement>('[data-sx-acct-purge]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-sx-acct-purge')
        if (!id) return
        const row = rows.find((s) => s.id === id)
        if (!window.confirm(`Permanently delete "${row?.name || 'this session'}"? This cannot be undone.`)) return
        purgeDeletedSession(id)
        renderDeleted()
      })
    })

    deletedHost.querySelector('[data-sx-acct-empty-bin]')?.addEventListener('click', () => {
      if (!window.confirm(`Permanently delete all ${rows.length} session${rows.length === 1 ? '' : 's'} in the bin? This cannot be undone.`)) return
      purgeAllDeletedSessions()
      renderDeleted()
    })
  }

  /* ——— Password ——— */
  const passCurrent = q<HTMLInputElement>('[data-sx-acct-pass-current]')
  const passNew = q<HTMLInputElement>('[data-sx-acct-pass-new]')
  const passConfirm = q<HTMLInputElement>('[data-sx-acct-pass-confirm]')
  const passSaveBtn = q<HTMLButtonElement>('[data-sx-acct-pass-save]')
  const strengthBox = q<HTMLElement>('[data-sx-acct-strength]')
  const strengthFill = q<HTMLElement>('[data-sx-acct-strength-fill]')
  const strengthLabel = q<HTMLElement>('[data-sx-acct-strength-label]')

  function syncPasswordStrength() {
    if (!passNew || !strengthBox || !strengthFill || !strengthLabel) return
    const pw = passNew.value
    strengthBox.hidden = pw.length === 0
    const checks = passwordChecks(pw)
    const { score, label } = passwordStrengthLabel(pw)
    strengthFill.style.width = `${(score / 5) * 100}%`
    strengthFill.dataset.level = String(score)
    strengthLabel.textContent = label ? `Strength: ${label}` : ''
    ;(Object.keys(checks) as Array<keyof typeof checks>).forEach((key) => {
      shell.querySelector(`[data-sx-acct-pass-rule="${key}"]`)?.classList.toggle('is-met', checks[key])
    })
  }
  passNew?.addEventListener('input', syncPasswordStrength)

  const passInputs = {
    current: passCurrent,
    new: passNew,
    confirm: passConfirm,
    email: emailPass,
  } as const
  shell.querySelectorAll<HTMLButtonElement>('[data-sx-acct-pass-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-sx-acct-pass-toggle') as keyof typeof passInputs | null
      const input = key ? passInputs[key] : null
      if (!input) return
      const show = input.type === 'password'
      input.type = show ? 'text' : 'password'
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password')
      btn.setAttribute('title', show ? 'Hide password' : 'Show password')
      btn.classList.toggle('is-active', show)
    })
  })

  const onPassSave = async () => {
    if (!passCurrent || !passNew || !passConfirm || !passMsg) return
    const checks = passwordChecks(passNew.value)
    if (!passCurrent.value) {
      setStatus(passMsg, 'Enter your current password.', 'error')
      return
    }
    if (!checks.length || !checks.upper || !checks.lower || !checks.number || !checks.special) {
      setStatus(passMsg, 'New password must meet all strength rules.', 'error')
      return
    }
    if (passNew.value !== passConfirm.value) {
      setStatus(passMsg, 'New passwords do not match.', 'error')
      return
    }
    if (passSaveBtn) passSaveBtn.disabled = true
    setStatus(passMsg, 'Updating…', 'busy')
    const result = await changePassword(passCurrent.value, passNew.value)
    if (passSaveBtn) passSaveBtn.disabled = false
    if (!result.ok) {
      setStatus(passMsg, result.error, 'error')
      return
    }
    passCurrent.value = ''
    passNew.value = ''
    passConfirm.value = ''
    syncPasswordStrength()
    flashSaved(passMsg, 'Password updated')
  }
  passSaveBtn?.addEventListener('click', () => {
    void onPassSave()
  })

  // Last, so the panel renderers it may kick off are all defined by now.
  selectTab(opts.initialTab && TABS.some((t) => t.key === opts.initialTab) ? opts.initialTab : 'account')

  return () => {
    savedTimers.forEach((t) => clearTimeout(t))
    savedTimers.clear()
    checkout.dispose()
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('click', onDocumentClickManage)
  }
}
