import './replayGoToSettings.css'
import { syncChartThemeToElement } from '../styles/syncChartTheme'
import {
  FOREX_DAY_OPEN,
  FX_SESSION_OPENS,
  GO_TO_SESSION_ORDER,
  defaultGoToTimePrefs,
  formatUtcOffsetLabel,
  hmInputValue,
  parseHmInput,
  readGoToTimePrefs,
  writeGoToTimePrefs,
  type GoToClock,
  type GoToSessionId,
  type GoToTimePrefs,
} from '../playback/replayGoTo'

const SESSION_LABEL: Record<GoToSessionId, string> = {
  asian: 'Start of Asian Session',
  london: 'Start of London Session',
  sydney: 'Start of Sydney Session',
  newyork: 'Start of New York Session',
}

const WEEKDAY_PILLS: { day: number; label: string }[] = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
]

const STAR = `<svg class="rw-goto-settings__star" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="#f7931a" d="M8 1.4 9.7 5.6l4.5.4-3.4 2.9 1 4.4L8 11.3 4.2 13.3l1-4.4L1.8 6l4.5-.4z"/></svg>`

export type ReplayGoToSettingsApi = {
  open: () => void
  close: () => void
  dispose: () => void
}

function offsetSuffix(timeZone: string): string {
  const label = formatUtcOffsetLabel(timeZone, Date.now() / 1000)
  return label ? ` (${label})` : ''
}

function clockFromSpec(spec: { hour: number; minute: number }): GoToClock {
  return { hour: spec.hour, minute: spec.minute }
}

export function createReplayGoToSettingsDialog(opts: {
  onSaved?: () => void
}): ReplayGoToSettingsApi {
  const dlg = document.createElement('dialog')
  dlg.className = 'rw-goto-settings-dlg'
  dlg.setAttribute('aria-labelledby', 'rw-goto-settings-title')

  const sessionRows = GO_TO_SESSION_ORDER.map((id) => {
    const spec = FX_SESSION_OPENS[id]
    return `<label class="rw-goto-settings__row">
      ${STAR}
      <span class="rw-goto-settings__lbl">${SESSION_LABEL[id]}${offsetSuffix(spec.timeZone)}</span>
      <input type="time" class="rw-goto-settings__time" step="60" data-goto-session="${id}" />
    </label>`
  }).join('')

  const skipPills = WEEKDAY_PILLS.map(
    (w) =>
      `<button type="button" class="rw-goto-settings__pill" data-skip-day="${w.day}" aria-pressed="false">${w.label}</button>`,
  ).join('')

  dlg.innerHTML = `
    <div class="rw-goto-settings" role="document">
      <div class="rw-goto-settings__head">
        <h2 class="rw-goto-settings__title" id="rw-goto-settings-title">Custom Settings</h2>
        <div class="rw-goto-settings__head-actions">
          <button type="button" class="rw-goto-settings__reset" data-goto-reset>Reset to defaults</button>
          <button type="button" class="rw-goto-settings__x" data-goto-close aria-label="Close">×</button>
        </div>
      </div>
      <div class="rw-goto-settings__body">
        <section class="rw-goto-settings__section">
          <h3 class="rw-goto-settings__sec-title">${STAR} Next Session Settings</h3>
          <p class="rw-goto-settings__hint">Times are that market’s local clock.</p>
          ${sessionRows}
        </section>
        <section class="rw-goto-settings__section">
          <h3 class="rw-goto-settings__sec-title">${STAR} Next Day Open Settings</h3>
          <label class="rw-goto-settings__row">
            <span class="rw-goto-settings__lbl">Next Day Open${offsetSuffix(FOREX_DAY_OPEN.timeZone)}</span>
            <input type="time" class="rw-goto-settings__time" step="60" data-goto-day-open />
          </label>
          <div class="rw-goto-settings__skip">
            <span class="rw-goto-settings__skip-lbl">Days to skip</span>
            <div class="rw-goto-settings__pills">${skipPills}</div>
          </div>
        </section>
      </div>
      <div class="rw-goto-settings__foot">
        <button type="button" class="rw-goto-settings__btn" data-goto-cancel>Cancel</button>
        <button type="button" class="rw-goto-settings__btn rw-goto-settings__btn--primary" data-goto-save>Save</button>
      </div>
    </div>
  `

  document.body.appendChild(dlg)
  syncChartThemeToElement(dlg)

  const sessionInputs = Array.from(
    dlg.querySelectorAll<HTMLInputElement>('[data-goto-session]'),
  )
  const dayOpenInput = dlg.querySelector<HTMLInputElement>('[data-goto-day-open]')
  const skipBtns = Array.from(dlg.querySelectorAll<HTMLButtonElement>('[data-skip-day]'))

  function applyPrefsToForm(prefs: GoToTimePrefs) {
    for (const input of sessionInputs) {
      const id = input.dataset.gotoSession as GoToSessionId
      const clock = prefs.sessions[id] ?? clockFromSpec(FX_SESSION_OPENS[id])
      input.value = hmInputValue(clock)
    }
    if (dayOpenInput) {
      const clock = prefs.dayOpen ?? clockFromSpec(FOREX_DAY_OPEN)
      dayOpenInput.value = hmInputValue(clock)
    }
    const skip = new Set(prefs.skipWeekdays)
    for (const btn of skipBtns) {
      const on = skip.has(Number(btn.dataset.skipDay))
      btn.classList.toggle('rw-goto-settings__pill--on', on)
      btn.setAttribute('aria-pressed', on ? 'true' : 'false')
    }
  }

  function readForm(): GoToTimePrefs {
    const prefs = defaultGoToTimePrefs()
    for (const input of sessionInputs) {
      const id = input.dataset.gotoSession as GoToSessionId
      const clock = parseHmInput(input.value)
      if (!clock) continue
      const def = FX_SESSION_OPENS[id]
      if (clock.hour !== def.hour || clock.minute !== def.minute) prefs.sessions[id] = clock
    }
    if (dayOpenInput) {
      const clock = parseHmInput(dayOpenInput.value)
      if (clock && (clock.hour !== FOREX_DAY_OPEN.hour || clock.minute !== FOREX_DAY_OPEN.minute)) {
        prefs.dayOpen = clock
      }
    }
    prefs.skipWeekdays = skipBtns
      .filter((btn) => btn.classList.contains('rw-goto-settings__pill--on'))
      .map((btn) => Number(btn.dataset.skipDay))
    return prefs
  }

  function close() {
    if (dlg.open) dlg.close()
  }

  function open() {
    syncChartThemeToElement(dlg)
    applyPrefsToForm(readGoToTimePrefs())
    if (!dlg.open) dlg.showModal()
  }

  const onReset = () => applyPrefsToForm(defaultGoToTimePrefs())
  const onSave = () => {
    writeGoToTimePrefs(readForm())
    opts.onSaved?.()
    close()
  }
  const onCancel = () => close()
  const onDlgCancel = (e: Event) => {
    e.preventDefault()
    close()
  }
  const onSkipClick = (e: Event) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-skip-day]')
    if (!btn) return
    const on = !btn.classList.contains('rw-goto-settings__pill--on')
    btn.classList.toggle('rw-goto-settings__pill--on', on)
    btn.setAttribute('aria-pressed', on ? 'true' : 'false')
  }

  dlg.querySelector('[data-goto-reset]')?.addEventListener('click', onReset)
  dlg.querySelector('[data-goto-close]')?.addEventListener('click', onCancel)
  dlg.querySelector('[data-goto-cancel]')?.addEventListener('click', onCancel)
  dlg.querySelector('[data-goto-save]')?.addEventListener('click', onSave)
  dlg.querySelector('.rw-goto-settings__pills')?.addEventListener('click', onSkipClick)
  dlg.addEventListener('cancel', onDlgCancel)

  function dispose() {
    dlg.removeEventListener('cancel', onDlgCancel)
    close()
    dlg.remove()
  }

  return { open, close, dispose }
}
