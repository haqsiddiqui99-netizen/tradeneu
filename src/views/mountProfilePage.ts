import './platformPage.css'
import { readDisplayName, writeDisplayName } from '../home/dashboardUserPrefs'

export type ProfileSessionStats = {
  total: number
  backtest: number
  prop: number
  withBacktest: number
  withJournal: number
  memberSinceMs: number | null
}

export type MountProfilePageOptions = {
  onBack?: () => void
  onOpenSettings?: () => void
  onProUpgrade?: () => void
  onDisplayNameChange?: (name: string) => void
  readTier: () => 'free' | 'pro'
  getSessionStats: () => ProfileSessionStats
  getAuthEmail?: () => string | null
}

function formatMemberSince(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  } catch {
    return '—'
  }
}

export function mountProfilePage(root: HTMLElement, opts: MountProfilePageOptions): () => void {
  root.replaceChildren()

  const stats = opts.getSessionStats()
  const tier = opts.readTier()
  const displayName = readDisplayName()
  const authEmail = opts.getAuthEmail?.() ?? null
  const memberSinceLabel = stats.memberSinceMs
    ? formatMemberSince(stats.memberSinceMs)
    : '—'

  const shell = document.createElement('div')
  shell.className = 'sx-platform-page'
  shell.innerHTML = `
    <header class="sx-platform-page__head">
      <div class="sx-platform-page__head-left">
        ${opts.onBack ? `<button type="button" class="sx-platform-page__back" data-sx-profile-back aria-label="Back to dashboard">← Dashboard</button>` : ''}
        <div>
          <h1 class="sx-platform-page__title">Profile</h1>
          <p class="sx-platform-page__subtitle">Your local Suplexity identity and usage summary.</p>
        </div>
      </div>
      <div class="sx-platform-page__actions">
        <button type="button" class="sx-platform-page__btn" data-sx-profile-settings>Open settings</button>
      </div>
    </header>
    <div class="sx-platform-page__body">
      <div class="sx-platform-page__profile-head">
        <div class="sx-platform-page__avatar" aria-hidden="true"><i class="fa-solid fa-user"></i></div>
        <div>
          <p class="sx-platform-page__profile-name" data-sx-profile-name-display>${escapeHtml(displayName)}</p>
          <p class="sx-platform-page__profile-tier">
            <span class="sx-platform-page__badge ${tier === 'pro' ? 'sx-platform-page__badge--pro' : 'sx-platform-page__badge--free'}" data-sx-profile-tier-badge>${tier === 'pro' ? 'Pro' : 'Free'}</span>
            · ${authEmail ? escapeHtml(authEmail) : 'Local account'}
          </p>
        </div>
      </div>

      <section class="sx-platform-page__section" aria-labelledby="sx-profile-identity">
        <h2 id="sx-profile-identity" class="sx-platform-page__section-title">Display name</h2>
        <div class="sx-platform-page__field">
          <label class="sx-platform-page__label" for="sx-profile-name">Name shown on dashboard</label>
          <input id="sx-profile-name" class="sx-platform-page__input" type="text" maxlength="48" value="${escapeAttr(displayName)}" data-sx-profile-name-input />
        </div>
        <div class="sx-platform-page__actions">
          <button type="button" class="sx-platform-page__btn sx-platform-page__btn--primary" data-sx-profile-save>Save name</button>
        </div>
        <p class="sx-platform-page__saved" data-sx-profile-saved aria-live="polite"></p>
      </section>

      <section class="sx-platform-page__section" aria-labelledby="sx-profile-stats">
        <h2 id="sx-profile-stats" class="sx-platform-page__section-title">Sessions</h2>
        <div class="sx-platform-page__card">
          <dl class="sx-platform-page__stat-grid" data-sx-profile-stats>
            <div><dt>Total sessions</dt><dd>${stats.total}</dd></div>
            <div><dt>Backtest sessions</dt><dd>${stats.backtest}</dd></div>
            <div><dt>Prop sessions</dt><dd>${stats.prop}</dd></div>
            <div><dt>With backtest run</dt><dd>${stats.withBacktest}</dd></div>
            <div><dt>With paper journal</dt><dd>${stats.withJournal}</dd></div>
            <div><dt>Member since</dt><dd>${memberSinceLabel}</dd></div>
          </dl>
        </div>
      </section>

      ${
        tier === 'free'
          ? `<section class="sx-platform-page__section" aria-labelledby="sx-profile-plan">
        <h2 id="sx-profile-plan" class="sx-platform-page__section-title">Plan</h2>
        <div class="sx-platform-page__card">
          <p class="sx-platform-page__hint" style="margin-bottom: 10px">Upgrade for unlimited sessions, advanced metrics, and AI strategy tools when available.</p>
          <button type="button" class="sx-platform-page__btn sx-platform-page__btn--primary" data-sx-profile-upgrade>Explore Pro</button>
        </div>
      </section>`
          : ''
      }
    </div>
  `
  root.appendChild(shell)

  const nameInput = shell.querySelector('[data-sx-profile-name-input]') as HTMLInputElement
  const nameDisplay = shell.querySelector('[data-sx-profile-name-display]') as HTMLElement
  const savedEl = shell.querySelector('[data-sx-profile-saved]') as HTMLElement
  let savedTimer: ReturnType<typeof setTimeout> | null = null

  function flashSaved() {
    if (savedEl) savedEl.textContent = 'Name saved'
    if (savedTimer) clearTimeout(savedTimer)
    savedTimer = setTimeout(() => {
      if (savedEl) savedEl.textContent = ''
    }, 1800)
  }

  const onBack = () => opts.onBack?.()
  const onSettings = () => opts.onOpenSettings?.()
  const onUpgrade = () => opts.onProUpgrade?.()
  const onSave = () => {
    const next = nameInput.value.trim().slice(0, 48) || readDisplayName()
    writeDisplayName(next)
    nameInput.value = next
    if (nameDisplay) nameDisplay.textContent = next
    opts.onDisplayNameChange?.(next)
    flashSaved()
  }

  shell.querySelector('[data-sx-profile-back]')?.addEventListener('click', onBack)
  shell.querySelector('[data-sx-profile-settings]')?.addEventListener('click', onSettings)
  shell.querySelector('[data-sx-profile-upgrade]')?.addEventListener('click', onUpgrade)
  shell.querySelector('[data-sx-profile-save]')?.addEventListener('click', onSave)
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSave()
    }
  })

  return () => {
    if (savedTimer) clearTimeout(savedTimer)
    shell.querySelector('[data-sx-profile-back]')?.removeEventListener('click', onBack)
    shell.querySelector('[data-sx-profile-settings]')?.removeEventListener('click', onSettings)
    shell.querySelector('[data-sx-profile-upgrade]')?.removeEventListener('click', onUpgrade)
    shell.querySelector('[data-sx-profile-save]')?.removeEventListener('click', onSave)
  }
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
