import './platformPage.css'
import { LOGIN_PAGE_PATH } from '../appPaths'
import { changePassword } from '../auth/authApi'
import type { AuthUser } from '../auth/authSession'
import { GUEST_AUTH_EMAIL } from '../auth/authSession'
import { dashLocaleMenuLabel } from '../home/dashboardLocales'
import {
  readConfirmCloseTrade,
  readDefaultSessionBalance,
  readDisplayName,
  readUserAvatar,
  readUserTimezone,
  SETTINGS_TIMEZONE_OPTIONS,
  writeConfirmCloseTrade,
  writeDefaultSessionBalance,
  writeDisplayName,
  writeUserAvatar,
  writeUserTimezone,
} from '../home/dashboardUserPrefs'
import type { ProfileSessionStats } from './mountProfilePage'

export type MountSettingsPageOptions = {
  onBack?: () => void
  embedded?: boolean
  readLocale: () => string
  writeLocale: (code: string) => void
  localeOptions: ReadonlyArray<{ code: string; name: string }>
  readTier?: () => 'free' | 'intermediate' | 'pro'
  getSessionStats?: () => ProfileSessionStats
  getAuthUser?: () => AuthUser | null
  onOpenSubscription?: () => void
  onDisplayNameChange?: (name: string) => void
  freeSessionLimit?: number
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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

const eyeIcon = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`

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
  if (avatarUrl) {
    return `<img class="sx-settings-dp__img" src="${escapeAttr(avatarUrl)}" alt="" data-sx-settings-avatar-img />`
  }
  return `<span class="sx-settings-dp__initials" data-sx-settings-avatar-fallback>${escapeHtml(initials)}</span>`
}

export function mountSettingsPage(root: HTMLElement, opts: MountSettingsPageOptions): () => void {
  root.replaceChildren()

  const tier = opts.readTier?.() ?? 'free'
  const stats = opts.getSessionStats?.()
  const authUser = opts.getAuthUser?.() ?? null
  const displayName = readDisplayName()
  const email = authUser?.email ?? '—'
  const isGuest =
    !authUser ||
    authUser.provider === 'guest' ||
    authUser.email === GUEST_AUTH_EMAIL
  const sessionLimit = opts.freeSessionLimit ?? 10
  const sessionsUsed = stats?.total ?? 0
  const sessionPct =
    tier === 'pro' ? 100 : Math.min(100, Math.round((sessionsUsed / Math.max(1, sessionLimit)) * 100))
  const planLabel = tier === 'pro' ? 'Pro Max' : tier === 'intermediate' ? 'Pro' : 'Free'
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'TN'
  const avatarUrl = readUserAvatar()

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

  const shell = document.createElement('div')
  shell.className = opts.embedded
    ? 'sx-platform-page sx-platform-page--embedded sx-platform-page--settings'
    : 'sx-platform-page sx-platform-page--settings'
  shell.innerHTML = `
    <header class="sx-platform-page__head sx-settings-head">
      <div class="sx-platform-page__head-left">
        ${opts.onBack ? `<button type="button" class="sx-platform-page__back" data-sx-settings-back aria-label="Back to dashboard"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Dashboard</span></button>` : ''}
        <div>
          <p class="sx-settings-eyebrow">Account center</p>
          <h1 class="sx-platform-page__title">Settings</h1>
          <p class="sx-platform-page__subtitle">Profile, security, billing, and workspace defaults.</p>
        </div>
      </div>
      <div class="sx-settings-head__actions">
        <button type="button" class="sx-platform-page__btn sx-platform-page__btn--primary" data-sx-settings-manage-plan>
          ${tier === 'pro' || tier === 'intermediate' ? 'Manage plan' : 'Upgrade Plan'}
        </button>
      </div>
    </header>

    <div class="sx-platform-page__body sx-platform-page__body--settings">
      <div class="sx-settings-grid">
        <section class="sx-settings-panel" aria-labelledby="sx-settings-account">
          <h2 id="sx-settings-account" class="sx-platform-page__section-title">Profile</h2>
          <div class="sx-settings-dp">
            <div class="sx-settings-dp__preview" data-sx-settings-dp-preview>${avatarMarkup(initials, avatarUrl)}</div>
            <div class="sx-settings-dp__meta">
              <p class="sx-settings-dp__title" data-sx-settings-name-display>${escapeHtml(displayName)}</p>
              <p class="sx-settings-dp__status">
                <span class="sx-platform-page__badge ${tier === 'pro' ? 'sx-platform-page__badge--pro' : tier === 'intermediate' ? 'sx-platform-page__badge--pro' : 'sx-platform-page__badge--free'}">${planLabel}</span>
                ${isGuest ? '<span class="sx-settings-pill">Guest mode</span>' : '<span class="sx-settings-pill sx-settings-pill--ok">Signed in</span>'}
              </p>
              <div class="sx-settings-dp__actions">
                <button type="button" class="sx-platform-page__btn" data-sx-settings-dp-change>Change photo</button>
                <button type="button" class="sx-platform-page__btn" data-sx-settings-dp-remove ${avatarUrl ? '' : 'hidden'}>Remove</button>
              </div>
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden data-sx-settings-dp-file />
            </div>
          </div>
          <div class="sx-settings-fields">
            <div class="sx-platform-page__field">
              <label class="sx-platform-page__label" for="sx-settings-username">Username</label>
              <div class="sx-settings-input-row">
                <input id="sx-settings-username" class="sx-platform-page__input" type="text" maxlength="48" value="${escapeAttr(displayName)}" data-sx-settings-username autocomplete="nickname" readonly />
                <button type="button" class="sx-settings-icon-btn" data-sx-settings-edit-username aria-label="Edit username" title="Edit username">
                  <i class="fa-solid fa-pen" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <div class="sx-platform-page__field">
              <label class="sx-platform-page__label" for="sx-settings-email">Email</label>
              <input id="sx-settings-email" class="sx-platform-page__input" type="email" value="${escapeAttr(email)}" disabled />
            </div>
          </div>
          <div class="sx-platform-page__actions">
            <button type="button" class="sx-platform-page__btn sx-platform-page__btn--primary" data-sx-settings-save-username>Save profile</button>
            ${isGuest ? `<a class="sx-platform-page__btn" href="${LOGIN_PAGE_PATH}">Create account</a>` : ''}
          </div>
          <p class="sx-platform-page__saved" data-sx-settings-account-saved aria-live="polite"></p>
        </section>

        <section class="sx-settings-panel" aria-labelledby="sx-settings-security">
          <h2 id="sx-settings-security" class="sx-platform-page__section-title">Security</h2>
          ${
            isGuest
              ? `<div class="sx-settings-secure-cta">
            <ul class="sx-settings-checklist">
              <li><i class="fa-solid fa-check" aria-hidden="true"></i> Sync strategies across devices</li>
              <li><i class="fa-solid fa-check" aria-hidden="true"></i> Keep session history after browser clears</li>
              <li><i class="fa-solid fa-check" aria-hidden="true"></i> Enable password + billing controls</li>
            </ul>
            <a class="sx-platform-page__btn sx-platform-page__btn--primary" href="${LOGIN_PAGE_PATH}">Sign in or create account</a>
          </div>`
              : `<div class="sx-settings-fields">
            <div class="sx-platform-page__field">
              <label class="sx-platform-page__label" for="sx-settings-pass-current">Current password</label>
              <div class="sx-settings-input-row">
                <input id="sx-settings-pass-current" class="sx-platform-page__input" type="password" autocomplete="current-password" data-sx-settings-pass-current />
                <button type="button" class="sx-settings-icon-btn" data-sx-pass-toggle="current" aria-label="Show password" title="Show password">${eyeIcon}</button>
              </div>
            </div>
            <div class="sx-platform-page__field">
              <label class="sx-platform-page__label" for="sx-settings-pass-new">New password</label>
              <div class="sx-settings-input-row">
                <input id="sx-settings-pass-new" class="sx-platform-page__input" type="password" autocomplete="new-password" minlength="8" data-sx-settings-pass-new />
                <button type="button" class="sx-settings-icon-btn" data-sx-pass-toggle="new" aria-label="Show password" title="Show password">${eyeIcon}</button>
              </div>
              <div class="sx-settings-strength" data-sx-pass-strength hidden>
                <div class="sx-settings-strength__bar" aria-hidden="true"><span data-sx-pass-strength-fill></span></div>
                <p class="sx-settings-strength__label"><span data-sx-pass-strength-label></span></p>
                <ul class="sx-settings-strength__rules" aria-label="Password requirements">
                  <li data-sx-pass-rule="length">At least 8 characters</li>
                  <li data-sx-pass-rule="upper">One uppercase letter</li>
                  <li data-sx-pass-rule="lower">One lowercase letter</li>
                  <li data-sx-pass-rule="number">One number</li>
                  <li data-sx-pass-rule="special">One special character</li>
                </ul>
              </div>
            </div>
            <div class="sx-platform-page__field">
              <label class="sx-platform-page__label" for="sx-settings-pass-confirm">Confirm password</label>
              <div class="sx-settings-input-row">
                <input id="sx-settings-pass-confirm" class="sx-platform-page__input" type="password" autocomplete="new-password" minlength="8" data-sx-settings-pass-confirm />
                <button type="button" class="sx-settings-icon-btn" data-sx-pass-toggle="confirm" aria-label="Show password" title="Show password">${eyeIcon}</button>
              </div>
            </div>
          </div>
          <div class="sx-platform-page__actions">
            <button type="button" class="sx-platform-page__btn sx-platform-page__btn--primary" data-sx-settings-pass-save>Update password</button>
          </div>
          <p class="sx-platform-page__saved" data-sx-settings-pass-msg aria-live="polite"></p>`
          }
        </section>

        <section class="sx-settings-panel sx-settings-panel--span" aria-labelledby="sx-settings-plan">
          <div class="sx-settings-panel__head sx-settings-panel__head--row">
            <div>
              <h2 id="sx-settings-plan" class="sx-platform-page__section-title">Billing & plan</h2>
              <p class="sx-settings-panel__lead">Your Tradeneu backtesting entitlement.</p>
            </div>
            <div class="sx-settings-plan-price">
              <strong>${tier === 'pro' ? '$19' : tier === 'intermediate' ? '$9' : '$0'}</strong>
              <span>${tier === 'free' ? 'Free forever' : '/ month'}</span>
            </div>
          </div>
          <div class="sx-settings-plan-grid">
            <ul class="sx-settings-checklist sx-settings-checklist--dense">
              ${features
                .map(
                  (f) =>
                    `<li class="${f.ok ? '' : 'is-muted'}"><i class="fa-solid ${f.ok ? 'fa-check' : 'fa-minus'}" aria-hidden="true"></i>${escapeHtml(f.text)}</li>`,
                )
                .join('')}
            </ul>
            <div class="sx-settings-plan-side">
              <div class="sx-settings-usage sx-settings-usage--compact">
                <div class="sx-settings-usage__top">
                  <span>Session capacity</span>
                  <strong>${tier === 'pro' ? `${sessionsUsed} sessions` : `${sessionsUsed} / ${sessionLimit}`}</strong>
                </div>
                <div class="sx-settings-usage__bar" role="progressbar" aria-valuemin="0" aria-valuemax="${tier === 'pro' ? Math.max(sessionsUsed, 1) : sessionLimit}" aria-valuenow="${sessionsUsed}">
                  <span style="width:${sessionPct}%"></span>
                </div>
              </div>
              <p class="sx-platform-page__hint" style="margin:0">
                  ${
                  tier === 'pro'
                    ? 'You are on Pro Max. Manage billing, pause, or cancel from the subscription page.'
                    : tier === 'intermediate'
                      ? 'You are on Pro. Upgrade to Pro Max for unlimited sessions and futures data.'
                      : 'Upgrade when you need more sessions, charts, and analytics.'
                }
              </p>
              <div class="sx-platform-page__actions" style="margin-top:0.85rem">
                <button type="button" class="sx-platform-page__btn sx-platform-page__btn--primary" data-sx-settings-manage-plan>
                  ${tier === 'free' ? 'Compare plans' : 'Open Manage Plan'}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="sx-settings-panel sx-settings-panel--span" aria-labelledby="sx-settings-workspace">
          <div class="sx-settings-panel__head">
            <h2 id="sx-settings-workspace" class="sx-platform-page__section-title">Workspace defaults</h2>
            <p class="sx-settings-panel__lead">Defaults applied when you create a new backtesting session.</p>
          </div>
          <div class="sx-settings-fields sx-settings-fields--3">
            <div class="sx-platform-page__field">
              <label class="sx-platform-page__label" for="sx-settings-timezone">Timezone</label>
              <select id="sx-settings-timezone" class="sx-platform-page__select" data-sx-settings-timezone>
                ${SETTINGS_TIMEZONE_OPTIONS.map((z) => `<option value="${z.id}">${escapeHtml(z.label)}</option>`).join('')}
              </select>
              <p class="sx-platform-page__hint">Used for session date labels and replay clocks.</p>
            </div>
            <div class="sx-platform-page__field">
              <label class="sx-platform-page__label" for="sx-settings-balance">Default account balance</label>
              <input id="sx-settings-balance" class="sx-platform-page__input" type="number" min="1000" max="10000000" step="1000" value="${readDefaultSessionBalance()}" data-sx-settings-balance />
              <p class="sx-platform-page__hint">Pre-fills New Session (currently ${formatMoney(readDefaultSessionBalance())}).</p>
            </div>
            <div class="sx-platform-page__field">
              <span class="sx-platform-page__label" id="sx-settings-locale-label">Language</span>
              <div class="sx-platform-page__locale-picker" data-settings-locale-picker>
                <button
                  type="button"
                  class="sx-platform-page__locale-trigger"
                  id="sx-settings-locale-trigger"
                  aria-labelledby="sx-settings-locale-label"
                  aria-haspopup="listbox"
                  aria-expanded="false"
                >
                  <span class="sx-platform-page__locale-trigger-label" data-settings-locale-value>English (EN)</span>
                  <svg class="sx-platform-page__locale-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                <div class="sx-platform-page__locale-menu" id="sx-settings-locale-menu" hidden role="listbox" aria-labelledby="sx-settings-locale-label"></div>
              </div>
              <p class="sx-platform-page__hint">Header language label.</p>
            </div>
          </div>
          <label class="sx-settings-toggle" for="sx-settings-confirm-close">
            <input id="sx-settings-confirm-close" type="checkbox" data-sx-settings-confirm-close ${readConfirmCloseTrade() ? 'checked' : ''} />
            <span>
              <strong>Confirm before closing trades</strong>
              <em>Ask for confirmation when closing paper positions in replay.</em>
            </span>
          </label>
          <div class="sx-platform-page__actions">
            <button type="button" class="sx-platform-page__btn sx-platform-page__btn--primary" data-sx-settings-save-workspace>Save workspace</button>
          </div>
          <p class="sx-platform-page__saved" data-sx-settings-saved aria-live="polite"></p>
        </section>
      </div>
    </div>
  `
  root.appendChild(shell)

  const savedEl = shell.querySelector('[data-sx-settings-saved]') as HTMLElement
  const accountSavedEl = shell.querySelector('[data-sx-settings-account-saved]') as HTMLElement | null
  const passMsgEl = shell.querySelector('[data-sx-settings-pass-msg]') as HTMLElement | null
  const nameDisplay = shell.querySelector('[data-sx-settings-name-display]') as HTMLElement | null
  const usernameInput = shell.querySelector('[data-sx-settings-username]') as HTMLInputElement | null
  const timezoneSelect = shell.querySelector('[data-sx-settings-timezone]') as HTMLSelectElement | null
  const balanceInput = shell.querySelector('[data-sx-settings-balance]') as HTMLInputElement | null
  const confirmClose = shell.querySelector('[data-sx-settings-confirm-close]') as HTMLInputElement | null
  const localePicker = shell.querySelector('[data-settings-locale-picker]') as HTMLElement
  const localeTrigger = shell.querySelector('#sx-settings-locale-trigger') as HTMLButtonElement
  const localeMenu = shell.querySelector('#sx-settings-locale-menu') as HTMLElement
  const localeLabelEl = shell.querySelector('[data-settings-locale-value]') as HTMLElement

  if (timezoneSelect) timezoneSelect.value = readUserTimezone()

  let savedTimer: ReturnType<typeof setTimeout> | null = null

  function flashSaved(el: HTMLElement | null = savedEl, text = 'Saved') {
    if (el) el.textContent = text
    if (savedTimer) clearTimeout(savedTimer)
    savedTimer = setTimeout(() => {
      if (el) el.textContent = ''
    }, 2200)
  }

  function closeLocaleMenu() {
    localeMenu.hidden = true
    localePicker.classList.remove('sx-platform-page__locale-picker--open')
    localeTrigger.setAttribute('aria-expanded', 'false')
  }

  function openLocaleMenu() {
    localeMenu.hidden = false
    localePicker.classList.add('sx-platform-page__locale-picker--open')
    localeTrigger.setAttribute('aria-expanded', 'true')
  }

  function localeLabel(code: string): string {
    const match = opts.localeOptions.find((l) => l.code === code)
    return match ? dashLocaleMenuLabel(match.code, match.name) : code.toUpperCase()
  }

  function selectLocale(code: string) {
    opts.writeLocale(code)
    localeLabelEl.textContent = localeLabel(code)
    localeMenu.querySelectorAll<HTMLButtonElement>('.sx-platform-page__locale-option').forEach((btn) => {
      const active = btn.dataset.localeCode === code
      btn.classList.toggle('sx-platform-page__locale-option--active', active)
      btn.setAttribute('aria-selected', active ? 'true' : 'false')
    })
    closeLocaleMenu()
    flashSaved()
  }

  localeMenu.innerHTML = opts.localeOptions
    .map((l) => {
      const label = dashLocaleMenuLabel(l.code, l.name)
      const active = l.code === opts.readLocale()
      return `<button type="button" class="sx-platform-page__locale-option${active ? ' sx-platform-page__locale-option--active' : ''}" role="option" data-locale-code="${l.code}" aria-selected="${active ? 'true' : 'false'}">${label}</button>`
    })
    .join('')
  localeLabelEl.textContent = localeLabel(opts.readLocale())

  const onBack = () => opts.onBack?.()
  shell.querySelector('[data-sx-settings-back]')?.addEventListener('click', onBack)

  const editUsernameBtn = shell.querySelector('[data-sx-settings-edit-username]') as HTMLButtonElement | null
  const dpPreview = shell.querySelector('[data-sx-settings-dp-preview]') as HTMLElement | null
  const dpFile = shell.querySelector('[data-sx-settings-dp-file]') as HTMLInputElement | null
  const dpRemoveBtn = shell.querySelector('[data-sx-settings-dp-remove]') as HTMLButtonElement | null

  function applyAvatar(url: string | null) {
    const markup = avatarMarkup(initials, url)
    if (dpPreview) dpPreview.innerHTML = markup
    if (dpRemoveBtn) dpRemoveBtn.hidden = !url
  }

  editUsernameBtn?.addEventListener('click', () => {
    if (!usernameInput) return
    usernameInput.readOnly = false
    usernameInput.focus()
    usernameInput.select()
    editUsernameBtn.classList.add('is-active')
  })

  shell.querySelector('[data-sx-settings-dp-change]')?.addEventListener('click', () => {
    dpFile?.click()
  })

  dpFile?.addEventListener('change', () => {
    const file = dpFile.files?.[0]
    if (!file) return
    void compressAvatarFile(file)
      .then((dataUrl) => {
        writeUserAvatar(dataUrl)
        applyAvatar(dataUrl)
        flashSaved(accountSavedEl, 'Photo updated')
        dpFile.value = ''
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Could not update photo.'
        if (accountSavedEl) accountSavedEl.textContent = msg
        dpFile.value = ''
      })
  })

  dpRemoveBtn?.addEventListener('click', () => {
    writeUserAvatar(null)
    applyAvatar(null)
    flashSaved(accountSavedEl, 'Photo removed')
  })

  const onSaveUsername = () => {
    if (!usernameInput) return
    const next = usernameInput.value.trim().slice(0, 48) || readDisplayName()
    writeDisplayName(next)
    usernameInput.value = next
    usernameInput.readOnly = true
    editUsernameBtn?.classList.remove('is-active')
    if (nameDisplay) nameDisplay.textContent = next
    const nextInitials =
      next
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('') || 'TN'
    shell.querySelectorAll('[data-sx-settings-avatar-fallback]').forEach((el) => {
      el.textContent = nextInitials
    })
    opts.onDisplayNameChange?.(next)
    flashSaved(accountSavedEl, 'Profile saved')
  }
  shell.querySelector('[data-sx-settings-save-username]')?.addEventListener('click', onSaveUsername)
  usernameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSaveUsername()
    }
  })

  const onManagePlan = () => opts.onOpenSubscription?.()
  shell.querySelectorAll('[data-sx-settings-manage-plan]').forEach((btn) => {
    btn.addEventListener('click', onManagePlan)
  })

  const onSaveWorkspace = () => {
    if (timezoneSelect) writeUserTimezone(timezoneSelect.value)
    if (balanceInput) writeDefaultSessionBalance(Number(balanceInput.value))
    if (confirmClose) writeConfirmCloseTrade(confirmClose.checked)
    flashSaved(savedEl, 'Workspace saved')
  }
  shell.querySelector('[data-sx-settings-save-workspace]')?.addEventListener('click', onSaveWorkspace)

  const passCurrent = shell.querySelector('[data-sx-settings-pass-current]') as HTMLInputElement | null
  const passNew = shell.querySelector('[data-sx-settings-pass-new]') as HTMLInputElement | null
  const passConfirm = shell.querySelector('[data-sx-settings-pass-confirm]') as HTMLInputElement | null
  const passSaveBtn = shell.querySelector('[data-sx-settings-pass-save]') as HTMLButtonElement | null
  const strengthBox = shell.querySelector('[data-sx-pass-strength]') as HTMLElement | null
  const strengthFill = shell.querySelector('[data-sx-pass-strength-fill]') as HTMLElement | null
  const strengthLabel = shell.querySelector('[data-sx-pass-strength-label]') as HTMLElement | null

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
      const li = shell.querySelector(`[data-sx-pass-rule="${key}"]`)
      li?.classList.toggle('is-met', checks[key])
    })
  }

  passNew?.addEventListener('input', syncPasswordStrength)

  const passInputs = {
    current: passCurrent,
    new: passNew,
    confirm: passConfirm,
  } as const

  shell.querySelectorAll<HTMLButtonElement>('[data-sx-pass-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-sx-pass-toggle') as keyof typeof passInputs | null
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
    if (!passCurrent || !passNew || !passConfirm || !passMsgEl) return
    const current = passCurrent.value
    const next = passNew.value
    const confirm = passConfirm.value
    const checks = passwordChecks(next)
    if (!current) {
      passMsgEl.textContent = 'Enter your current password.'
      return
    }
    if (!checks.length || !checks.upper || !checks.lower || !checks.number || !checks.special) {
      passMsgEl.textContent = 'New password must meet all strength rules.'
      return
    }
    if (next !== confirm) {
      passMsgEl.textContent = 'New passwords do not match.'
      return
    }
    passSaveBtn && (passSaveBtn.disabled = true)
    passMsgEl.textContent = 'Updating…'
    const result = await changePassword(current, next)
    passSaveBtn && (passSaveBtn.disabled = false)
    if (!result.ok) {
      passMsgEl.textContent = result.error
      return
    }
    passCurrent.value = ''
    passNew.value = ''
    passConfirm.value = ''
    syncPasswordStrength()
    flashSaved(passMsgEl, 'Password updated')
  }
  passSaveBtn?.addEventListener('click', () => {
    void onPassSave()
  })

  localeTrigger.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (localeMenu.hidden) openLocaleMenu()
    else closeLocaleMenu()
  })

  localeMenu.querySelectorAll<HTMLButtonElement>('.sx-platform-page__locale-option').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      const code = btn.dataset.localeCode
      if (code) selectLocale(code)
    })
  })

  const onDocumentClick = (e: MouseEvent) => {
    if (!localePicker.contains(e.target as Node)) closeLocaleMenu()
  }
  document.addEventListener('click', onDocumentClick)

  return () => {
    if (savedTimer) clearTimeout(savedTimer)
    document.removeEventListener('click', onDocumentClick)
    shell.querySelector('[data-sx-settings-back]')?.removeEventListener('click', onBack)
  }
}
