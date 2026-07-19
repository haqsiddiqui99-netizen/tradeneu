import './platformPage.css'
import { dashLocaleMenuLabel } from '../home/dashboardLocales'
import {
  readDefaultChartInterval,
  readDefaultStrategyId,
  SETTINGS_INTERVAL_OPTIONS,
  writeDefaultChartInterval,
  writeDefaultStrategyId,
} from '../home/dashboardUserPrefs'
import { readFullSessionTicks, writeFullSessionTicks } from '../chart/chartTickPrefs'
import { resolveIntervalPick } from './chartIntervalStore'
import { listAllStrategies } from '../strategy/strategyCatalog'

export type DashboardThemeMode = 'dark' | 'light'

export type MountSettingsPageOptions = {
  onBack?: () => void
  readTheme: () => DashboardThemeMode
  writeTheme: (mode: DashboardThemeMode) => void
  readLocale: () => string
  writeLocale: (code: string) => void
  localeOptions: ReadonlyArray<{ code: string; name: string }>
}

export function mountSettingsPage(root: HTMLElement, opts: MountSettingsPageOptions): () => void {
  root.replaceChildren()

  const shell = document.createElement('div')
  shell.className = 'sx-platform-page'
  shell.innerHTML = `
    <header class="sx-platform-page__head">
      <div class="sx-platform-page__head-left">
        ${opts.onBack ? `<button type="button" class="sx-platform-page__back" data-sx-settings-back aria-label="Back to dashboard">← Dashboard</button>` : ''}
        <div>
          <h1 class="sx-platform-page__title">Settings</h1>
          <p class="sx-platform-page__subtitle">Appearance and defaults for the dashboard and chart workspace.</p>
        </div>
      </div>
    </header>
    <div class="sx-platform-page__body">
      <section class="sx-platform-page__section" aria-labelledby="sx-settings-appearance">
        <h2 id="sx-settings-appearance" class="sx-platform-page__section-title">Appearance</h2>
        <div class="sx-platform-page__field">
          <span class="sx-platform-page__label">Dashboard theme</span>
          <div class="sx-platform-page__segmented" role="group" aria-label="Dashboard theme">
            <button type="button" class="sx-platform-page__seg-btn" data-sx-theme="dark">Dark</button>
            <button type="button" class="sx-platform-page__seg-btn" data-sx-theme="light">Light</button>
          </div>
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
          <p class="sx-platform-page__hint">UI language label on the dashboard header.</p>
        </div>
      </section>
      <section class="sx-platform-page__section" aria-labelledby="sx-settings-chart">
        <h2 id="sx-settings-chart" class="sx-platform-page__section-title">Chart defaults</h2>
        <div class="sx-platform-page__field">
          <label class="sx-platform-page__label" for="sx-settings-interval">Default interval</label>
          <select id="sx-settings-interval" class="sx-platform-page__select" data-sx-settings-interval></select>
          <p class="sx-platform-page__hint">Used when opening a new chart session (when resampling is available).</p>
        </div>
        <div class="sx-platform-page__field">
          <label class="sx-platform-page__label" for="sx-settings-strategy">Default strategy</label>
          <select id="sx-settings-strategy" class="sx-platform-page__select" data-sx-settings-strategy></select>
          <p class="sx-platform-page__hint">Pre-selected in backtest when a session has no saved strategy.</p>
        </div>
        <div class="sx-platform-page__field">
          <label class="sx-platform-page__check" for="sx-settings-full-ticks">
            <input id="sx-settings-full-ticks" type="checkbox" data-sx-settings-full-ticks />
            <span>Load full session ticks on 1t intervals</span>
          </label>
          <p class="sx-platform-page__hint">When off, tick charts load a fast window around the replay cursor. You can still load the full session from the chart notice.</p>
        </div>
      </section>
      <p class="sx-platform-page__saved" data-sx-settings-saved aria-live="polite"></p>
    </div>
  `
  root.appendChild(shell)

  const savedEl = shell.querySelector('[data-sx-settings-saved]') as HTMLElement
  const localePicker = shell.querySelector('[data-settings-locale-picker]') as HTMLElement
  const localeTrigger = shell.querySelector('#sx-settings-locale-trigger') as HTMLButtonElement
  const localeMenu = shell.querySelector('#sx-settings-locale-menu') as HTMLElement
  const localeLabelEl = shell.querySelector('[data-settings-locale-value]') as HTMLElement
  const intervalSelect = shell.querySelector('[data-sx-settings-interval]') as HTMLSelectElement
  const strategySelect = shell.querySelector('[data-sx-settings-strategy]') as HTMLSelectElement
  const fullTicksCheck = shell.querySelector('[data-sx-settings-full-ticks]') as HTMLInputElement
  const themeBtns = shell.querySelectorAll<HTMLButtonElement>('[data-sx-theme]')

  let savedTimer: ReturnType<typeof setTimeout> | null = null

  function flashSaved() {
    if (savedEl) savedEl.textContent = 'Saved'
    if (savedTimer) clearTimeout(savedTimer)
    savedTimer = setTimeout(() => {
      if (savedEl) savedEl.textContent = ''
    }, 1800)
  }

  function syncThemeButtons() {
    const theme = opts.readTheme()
    themeBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.sxTheme === theme)
    })
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

  intervalSelect.innerHTML = SETTINGS_INTERVAL_OPTIONS.map((pill) => {
    const pick = resolveIntervalPick(pill)
    const label = pick?.label ?? pill
    return `<option value="${pill}">${label}</option>`
  }).join('')
  intervalSelect.value = readDefaultChartInterval()

  if (fullTicksCheck) fullTicksCheck.checked = readFullSessionTicks()

  strategySelect.innerHTML = listAllStrategies()
    .map((s) => `<option value="${s.id}">${s.name}</option>`)
    .join('')
  const defaultStrat = readDefaultStrategyId()
  if (defaultStrat) strategySelect.value = defaultStrat
  else if (strategySelect.options.length) strategySelect.selectedIndex = 0

  syncThemeButtons()

  const onBack = () => opts.onBack?.()
  shell.querySelector('[data-sx-settings-back]')?.addEventListener('click', onBack)

  themeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.sxTheme as DashboardThemeMode
      if (mode !== 'dark' && mode !== 'light') return
      opts.writeTheme(mode)
      syncThemeButtons()
      flashSaved()
    })
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

  const onIntervalChange = () => {
    writeDefaultChartInterval(intervalSelect.value)
    flashSaved()
  }
  const onStrategyChange = () => {
    writeDefaultStrategyId(strategySelect.value)
    flashSaved()
  }
  const onFullTicksChange = () => {
    writeFullSessionTicks(fullTicksCheck?.checked === true)
    flashSaved()
  }

  intervalSelect.addEventListener('change', onIntervalChange)
  strategySelect.addEventListener('change', onStrategyChange)
  fullTicksCheck?.addEventListener('change', onFullTicksChange)

  return () => {
    if (savedTimer) clearTimeout(savedTimer)
    document.removeEventListener('click', onDocumentClick)
    shell.querySelector('[data-sx-settings-back]')?.removeEventListener('click', onBack)
    intervalSelect.removeEventListener('change', onIntervalChange)
    strategySelect.removeEventListener('change', onStrategyChange)
    fullTicksCheck?.removeEventListener('change', onFullTicksChange)
  }
}
