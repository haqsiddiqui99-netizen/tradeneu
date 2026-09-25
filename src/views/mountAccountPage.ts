import './accountPage.css'
import { defaultBacktestSlippage } from '../backtest/backtestChartUi'
import { resolveAppPath } from '../appPaths'
import { changePassword, fetchAuthDevices, revokeAuthDevice, type AuthDevice } from '../auth/authApi'
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
  readTier?: () => 'free' | 'intermediate' | 'pro'
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
  const planLabel = tier === 'pro' ? 'Premium Plan' : tier === 'intermediate' ? 'Ultra Plan' : 'Free'
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
                <label class="sx-acct-label" for="sx-acct-username">Display name</label>
                <input id="sx-acct-username" class="sx-acct-input" type="text" maxlength="48" value="${escapeAttr(displayName)}" autocomplete="nickname" data-sx-acct-username />
                <p class="sx-acct-hint">Shown in the sidebar and on your sessions.</p>
              </div>
              <div class="sx-acct-field">
                <label class="sx-acct-label" for="sx-acct-email">Email</label>
                <input id="sx-acct-email" class="sx-acct-input" type="email" value="${escapeAttr(email)}" disabled />
                <p class="sx-acct-hint">${isGuest ? 'Placeholder address for guest mode.' : 'Contact support to change your account email.'}</p>
              </div>
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
              <p class="sx-acct-card__lead">${planLabel} · ${tier === 'pro' ? '$19 / month' : tier === 'intermediate' ? '$9 / month' : 'Free forever'}</p>
            </div>
            <ul class="sx-acct-checklist">
              ${features
                .map(
                  (f) =>
                    `<li class="${f.ok ? '' : 'is-muted'}"><i class="fa-solid ${f.ok ? 'fa-check' : 'fa-minus'}" aria-hidden="true"></i>${escapeHtml(f.text)}</li>`,
                )
                .join('')}
            </ul>
            <div class="sx-acct-actions">
              <button type="button" class="sx-acct-btn sx-acct-btn--primary" data-sx-acct-manage-plan>${tier === 'free' ? 'Compare plans' : 'Open Manage Plan'}</button>
            </div>
          </div>

          <div class="sx-acct-card">
            <div class="sx-acct-card__head">
              <h2 class="sx-acct-card__title">Entitlement</h2>
              <p class="sx-acct-card__lead">How much of your plan you have used.</p>
            </div>
            <div class="sx-acct-usage">
              <div class="sx-acct-usage__top">
                <span>Session capacity</span>
                <strong>${tier === 'pro' ? `${sessionsUsed} sessions` : `${sessionsUsed} / ${sessionLimit}`}</strong>
              </div>
              <div class="sx-acct-usage__bar" role="progressbar" aria-valuemin="0" aria-valuemax="${tier === 'pro' ? Math.max(sessionsUsed, 1) : sessionLimit}" aria-valuenow="${sessionsUsed}"><span style="width:${sessionPct}%"></span></div>
            </div>
            <p class="sx-acct-hint" style="margin-top:14px">
              ${
                tier === 'pro'
                  ? 'You are on Premium Plan. Manage billing, pause, or cancel from the subscription page.'
                  : tier === 'intermediate'
                    ? 'You are on Ultra Plan. Upgrade to Premium for unlimited sessions and futures data.'
                    : 'Upgrade when you need more sessions, charts, and analytics.'
              }
            </p>
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

  /* ——— Saved-message flashes. Each panel owns one, so they are keyed by
     element rather than sharing a single timer. ——— */
  const savedTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>()

  function flashSaved(el: HTMLElement | null, text = 'Saved') {
    if (!el) return
    el.textContent = text
    const existing = savedTimers.get(el)
    if (existing) clearTimeout(existing)
    savedTimers.set(
      el,
      setTimeout(() => {
        el.textContent = ''
        savedTimers.delete(el)
      }, 2200),
    )
  }

  const accountSaved = q<HTMLElement>('[data-sx-acct-account-saved]')
  const backtestingSaved = q<HTMLElement>('[data-sx-acct-backtesting-saved]')
  const costsSaved = q<HTMLElement>('[data-sx-acct-costs-saved]')
  const passMsg = q<HTMLElement>('[data-sx-acct-pass-msg]')

  /* ——— Back / plan ——— */
  const onBack = () => opts.onBack?.()
  q('[data-sx-acct-back]')?.addEventListener('click', onBack)

  const onManagePlan = () => opts.onOpenSubscription?.()
  shell.querySelectorAll('[data-sx-acct-manage-plan]').forEach((b) => b.addEventListener('click', onManagePlan))

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
        if (accountSaved) accountSaved.textContent = err instanceof Error ? err.message : 'Could not update photo.'
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

  /* ——— Account tab: name, timezone and language all commit together on
     "Save changes", so nothing on this tab applies until you ask for it. ——— */
  const usernameInput = q<HTMLInputElement>('[data-sx-acct-username]')
  const nameDisplay = q<HTMLElement>('[data-sx-acct-name-display]')
  const timezoneSelect = q<HTMLSelectElement>('[data-sx-acct-timezone]')
  if (timezoneSelect) timezoneSelect.value = readUserTimezone()

  let pendingLocale = opts.readLocale()

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

    flashSaved(accountSaved, 'Changes saved')
  }
  q('[data-sx-acct-save-account]')?.addEventListener('click', onSaveAccount)
  usernameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSaveAccount()
    }
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

  const passInputs = { current: passCurrent, new: passNew, confirm: passConfirm } as const
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
      passMsg.textContent = 'Enter your current password.'
      return
    }
    if (!checks.length || !checks.upper || !checks.lower || !checks.number || !checks.special) {
      passMsg.textContent = 'New password must meet all strength rules.'
      return
    }
    if (passNew.value !== passConfirm.value) {
      passMsg.textContent = 'New passwords do not match.'
      return
    }
    if (passSaveBtn) passSaveBtn.disabled = true
    passMsg.textContent = 'Updating…'
    const result = await changePassword(passCurrent.value, passNew.value)
    if (passSaveBtn) passSaveBtn.disabled = false
    if (!result.ok) {
      passMsg.textContent = result.error
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
    document.removeEventListener('click', onDocumentClick)
  }
}
