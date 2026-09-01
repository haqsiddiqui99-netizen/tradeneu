import './replayScalperModeDialog.css'
import { icons } from '../icons'
import { syncChartThemeToElement } from '../styles/syncChartTheme'
import {
  DEFAULT_SCALPER_MODE_PREFS,
  normalizeScalperModePrefs,
  readScalperModePrefs,
  writeScalperModePrefs,
  type ReplayScalperModePrefs,
  type ScalperDistanceUnit,
} from '../replay/replayScalperMode'

export type ReplayScalperModeDialogApi = {
  open: () => void
  close: () => void
  dispose: () => void
}

type ProtectionKey = 'stopLoss' | 'takeProfit'

const ROWS: Array<{ key: ProtectionKey; label: string }> = [
  { key: 'stopLoss', label: 'Stop Loss' },
  { key: 'takeProfit', label: 'Take Profit' },
]

function protectionRow(key: ProtectionKey, label: string): string {
  return `
    <section class="rw-scalper__card" data-scalper-card="${key}">
      <div class="rw-scalper__card-head">
        <button type="button" class="rw-scalper__switch" role="switch" aria-checked="false" data-scalper-toggle="${key}">
          <span class="rw-scalper__switch-thumb"></span>
        </button>
        <span class="rw-scalper__label">${label}</span>
      </div>
      <div class="rw-scalper__field-row">
        <div class="rw-scalper__field">
          <input class="rw-scalper__input" type="number" min="0" step="0.01" inputmode="decimal" value="0" data-scalper-value="${key}" aria-label="${label} distance" />
          <div class="rw-scalper__stepper">
            <button type="button" class="rw-scalper__step" data-scalper-step="${key}:up" aria-label="Increase ${label} distance" tabindex="-1">${icons.chevronUp}</button>
            <button type="button" class="rw-scalper__step" data-scalper-step="${key}:down" aria-label="Decrease ${label} distance" tabindex="-1">${icons.chevronDown}</button>
          </div>
        </div>
        <div class="rw-scalper__units" role="group" aria-label="${label} unit">
          <button type="button" data-scalper-unit="${key}:percent" aria-pressed="true">%</button>
          <button type="button" data-scalper-unit="${key}:pips" aria-pressed="false">Pips</button>
        </div>
      </div>
    </section>
  `
}

export function createReplayScalperModeDialog(opts: {
  canUseAutoBreakEven: () => boolean
  onSaved?: (prefs: ReplayScalperModePrefs) => void
}): ReplayScalperModeDialogApi {
  const dlg = document.createElement('dialog')
  dlg.className = 'rw-scalper-dlg'
  dlg.setAttribute('aria-labelledby', 'rw-scalper-title')
  dlg.innerHTML = `
    <div class="rw-scalper" role="document">
      <header class="rw-scalper__head">
        <h2 id="rw-scalper-title">Scalper mode</h2>
        <button type="button" class="rw-scalper__close" data-scalper-close aria-label="Close">×</button>
      </header>
      <div class="rw-scalper__body">
        ${ROWS.map((row) => protectionRow(row.key, row.label)).join('')}
        <section class="rw-scalper__break-even" data-scalper-break-even-card>
          <button type="button" class="rw-scalper__switch" role="switch" aria-checked="false" data-scalper-break-even>
            <span class="rw-scalper__switch-thumb"></span>
          </button>
          <div class="rw-scalper__break-even-copy">
            <span>Auto Break-even</span>
            <small>Move Stop Loss to entry when price reaches 1R.</small>
          </div>
          <span class="rw-scalper__premium">Premium</span>
        </section>
        <p class="rw-scalper__error" data-scalper-error role="alert" hidden></p>
      </div>
      <footer class="rw-scalper__foot">
        <button type="button" class="rw-scalper__discard" data-scalper-discard>Discard</button>
        <button type="button" class="rw-scalper__save" data-scalper-save>${icons.floppyDisk}<span>Save</span></button>
      </footer>
    </div>
  `
  document.body.appendChild(dlg)

  const values = new Map<ProtectionKey, HTMLInputElement>()
  for (const row of ROWS) {
    const input = dlg.querySelector<HTMLInputElement>(`[data-scalper-value="${row.key}"]`)
    if (input) values.set(row.key, input)
  }
  const breakEvenBtn = dlg.querySelector<HTMLButtonElement>('[data-scalper-break-even]')
  const breakEvenCard = dlg.querySelector<HTMLElement>('[data-scalper-break-even-card]')
  const errorEl = dlg.querySelector<HTMLElement>('[data-scalper-error]')

  function toggleButton(key: ProtectionKey): HTMLButtonElement | null {
    return dlg.querySelector<HTMLButtonElement>(`[data-scalper-toggle="${key}"]`)
  }

  function setSwitch(btn: HTMLButtonElement | null, on: boolean): void {
    if (!btn) return
    btn.setAttribute('aria-checked', on ? 'true' : 'false')
  }

  function switchOn(btn: HTMLButtonElement | null): boolean {
    return btn?.getAttribute('aria-checked') === 'true'
  }

  function setUnit(key: ProtectionKey, unit: ScalperDistanceUnit): void {
    dlg.querySelectorAll<HTMLButtonElement>(`[data-scalper-unit^="${key}:"]`).forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.scalperUnit === `${key}:${unit}` ? 'true' : 'false')
    })
  }

  function readUnit(key: ProtectionKey): ScalperDistanceUnit {
    return dlg.querySelector<HTMLButtonElement>(
      `[data-scalper-unit="${key}:pips"][aria-pressed="true"]`,
    )
      ? 'pips'
      : 'percent'
  }

  function paintEnabled(key: ProtectionKey): void {
    const on = switchOn(toggleButton(key))
    const card = dlg.querySelector<HTMLElement>(`[data-scalper-card="${key}"]`)
    card?.classList.toggle('rw-scalper__card--enabled', on)
    const input = values.get(key)
    if (input) input.disabled = !on
    dlg
      .querySelectorAll<HTMLButtonElement>(
        `[data-scalper-unit^="${key}:"], [data-scalper-step^="${key}:"]`,
      )
      .forEach((btn) => {
        btn.disabled = !on
      })
  }

  /** Pips move in whole points; percent distances are far smaller, so step by 0.1. */
  function stepValue(key: ProtectionKey, direction: 'up' | 'down'): void {
    const input = values.get(key)
    if (!input || input.disabled) return
    const step = readUnit(key) === 'pips' ? 1 : 0.1
    const current = Number(input.value)
    const base = Number.isFinite(current) && current > 0 ? current : 0
    const next = direction === 'up' ? base + step : base - step
    input.value = String(Math.max(0, Math.round(next * 1000) / 1000))
    showError()
  }

  function showError(message = ''): void {
    if (!errorEl) return
    errorEl.textContent = message
    errorEl.hidden = !message
  }

  function applyPrefs(prefs: ReplayScalperModePrefs): void {
    for (const row of ROWS) {
      const setting = prefs[row.key]
      setSwitch(toggleButton(row.key), setting.enabled)
      const input = values.get(row.key)
      if (input) input.value = String(setting.value)
      setUnit(row.key, setting.unit)
      paintEnabled(row.key)
    }
    const premium = opts.canUseAutoBreakEven()
    setSwitch(breakEvenBtn, premium && prefs.autoBreakEven && prefs.stopLoss.enabled)
    if (breakEvenBtn) {
      breakEvenBtn.disabled = !premium
      breakEvenBtn.title = premium ? 'Move Stop Loss to entry at 1R' : 'Premium Plan required'
    }
    breakEvenCard?.classList.toggle('rw-scalper__break-even--locked', !premium)
    showError()
  }

  function readForm(): ReplayScalperModePrefs | null {
    const next = normalizeScalperModePrefs(DEFAULT_SCALPER_MODE_PREFS)
    for (const row of ROWS) {
      const value = Number(values.get(row.key)?.value)
      const enabled = switchOn(toggleButton(row.key))
      if (enabled && (!(value > 0) || !Number.isFinite(value))) {
        showError(`${row.label} must be greater than 0.`)
        values.get(row.key)?.focus()
        return null
      }
      next[row.key] = {
        enabled,
        value: Number.isFinite(value) && value >= 0 ? value : 0,
        unit: readUnit(row.key),
      }
    }
    next.autoBreakEven =
      opts.canUseAutoBreakEven() && next.stopLoss.enabled && switchOn(breakEvenBtn)
    return next
  }

  function close(): void {
    if (dlg.open) dlg.close()
  }

  function open(): void {
    syncChartThemeToElement(dlg)
    applyPrefs(readScalperModePrefs())
    if (!dlg.open) dlg.showModal()
  }

  const onClick = (event: Event) => {
    const target = event.target as HTMLElement
    const toggle = target.closest<HTMLButtonElement>('[data-scalper-toggle]')
    if (toggle) {
      const key = toggle.dataset.scalperToggle as ProtectionKey
      setSwitch(toggle, !switchOn(toggle))
      paintEnabled(key)
      if (key === 'stopLoss' && !switchOn(toggle)) setSwitch(breakEvenBtn, false)
      showError()
      return
    }
    const stepBtn = target.closest<HTMLButtonElement>('[data-scalper-step]')
    if (stepBtn && !stepBtn.disabled) {
      const [key, direction] = (stepBtn.dataset.scalperStep ?? '').split(':') as [
        ProtectionKey,
        'up' | 'down',
      ]
      stepValue(key, direction)
      return
    }
    const unitBtn = target.closest<HTMLButtonElement>('[data-scalper-unit]')
    if (unitBtn && !unitBtn.disabled) {
      const [key, unit] = (unitBtn.dataset.scalperUnit ?? '').split(':') as [
        ProtectionKey,
        ScalperDistanceUnit,
      ]
      setUnit(key, unit)
      return
    }
    if (target.closest('[data-scalper-break-even]') && breakEvenBtn && !breakEvenBtn.disabled) {
      if (!switchOn(toggleButton('stopLoss'))) {
        showError('Enable Stop Loss before Auto Break-even.')
        return
      }
      setSwitch(breakEvenBtn, !switchOn(breakEvenBtn))
      showError()
      return
    }
    if (target.closest('[data-scalper-save]')) {
      const prefs = readForm()
      if (!prefs) return
      writeScalperModePrefs(prefs)
      opts.onSaved?.(prefs)
      close()
      return
    }
    if (
      target.closest('[data-scalper-close]') ||
      target.closest('[data-scalper-discard]')
    ) {
      close()
    }
  }
  const onCancel = (event: Event) => {
    event.preventDefault()
    close()
  }
  dlg.addEventListener('click', onClick)
  dlg.addEventListener('cancel', onCancel)

  function dispose(): void {
    dlg.removeEventListener('click', onClick)
    dlg.removeEventListener('cancel', onCancel)
    close()
    dlg.remove()
  }

  return { open, close, dispose }
}
