import './chartCustomIntervalDialog.css'
import type { IntervalPick } from './chartIntervalCatalog'
import { syncChartThemeToElement } from '../styles/syncChartTheme'

export type CustomIntervalType = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'range'

const TYPE_OPTIONS: Array<{ id: CustomIntervalType; label: string }> = [
  { id: 'minutes', label: 'minutes' },
  { id: 'hours', label: 'hours' },
  { id: 'days', label: 'days' },
  { id: 'weeks', label: 'weeks' },
  { id: 'months', label: 'months' },
  { id: 'range', label: 'range' },
]

const MAX_BY_TYPE: Record<CustomIntervalType, number> = {
  minutes: 999,
  hours: 999,
  days: 999,
  weeks: 520,
  months: 120,
  range: 1,
}

export function customIntervalToPick(type: CustomIntervalType, value: number): IntervalPick | null {
  if (type === 'range') return null
  const n = Math.floor(value)
  if (!Number.isFinite(n) || n < 1 || n > MAX_BY_TYPE[type]) return null

  switch (type) {
    case 'minutes':
      return {
        kind: 'time',
        pill: `${n}m`,
        stepSec: n * 60,
        label: n === 1 ? '1 minute' : `${n} minutes`,
      }
    case 'hours':
      return {
        kind: 'time',
        pill: `${n}h`,
        stepSec: n * 3600,
        label: n === 1 ? '1 hour' : `${n} hours`,
      }
    case 'days':
      return {
        kind: 'time',
        pill: n === 1 ? '1D' : `${n}D`,
        stepSec: n * 86_400,
        label: n === 1 ? '1 day' : `${n} days`,
      }
    case 'weeks':
      return {
        kind: 'time',
        pill: `${n}W`,
        stepSec: n * 604_800,
        label: n === 1 ? '1 week' : `${n} weeks`,
      }
    case 'months':
      return {
        kind: 'time',
        pill: `${n}M`,
        stepSec: n * 2_592_000,
        label: n === 1 ? '1 month' : `${n} months`,
      }
    default:
      return null
  }
}

export type CustomIntervalDialogApi = {
  open: () => void
  close: () => void
  dispose: () => void
}

export function createCustomIntervalDialog(opts: {
  onAdd: (pick: IntervalPick) => void
}): CustomIntervalDialogApi {
  const dlg = document.createElement('dialog')
  dlg.className = 'rw-cint-dlg'
  dlg.setAttribute('aria-labelledby', 'rw-cint-title')

  dlg.innerHTML = `
    <div class="rw-cint">
      <div class="rw-cint__head">
        <span id="rw-cint-title">Add custom interval</span>
        <button type="button" class="rw-cint__x" data-rw-cint-close aria-label="Close">×</button>
      </div>
      <div class="rw-cint__body">
        <div class="rw-cint__row">
          <span class="rw-cint__lbl">Type</span>
          <div class="rw-cint__type-wrap">
            <button type="button" class="rw-cint__type-btn" data-rw-cint-type-btn aria-expanded="false" aria-haspopup="listbox">
              <span data-rw-cint-type-label>minutes</span>
              <span class="rw-cint__type-chev" aria-hidden="true"></span>
            </button>
            <ul class="rw-cint__type-list" data-rw-cint-type-list role="listbox" aria-label="Interval type"></ul>
          </div>
        </div>
        <div class="rw-cint__row">
          <span class="rw-cint__lbl">Interval</span>
          <input type="text" class="rw-cint__interval" data-rw-cint-value inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
        </div>
      </div>
      <div class="rw-cint__foot">
        <button type="button" class="rw-cint__btn" data-rw-cint-cancel>Cancel</button>
        <button type="button" class="rw-cint__btn rw-cint__btn--add" data-rw-cint-add disabled>Add</button>
      </div>
    </div>
  `

  document.body.appendChild(dlg)

  const btnClose = dlg.querySelector('[data-rw-cint-close]') as HTMLButtonElement
  const btnCancel = dlg.querySelector('[data-rw-cint-cancel]') as HTMLButtonElement
  const btnAdd = dlg.querySelector('[data-rw-cint-add]') as HTMLButtonElement
  const btnType = dlg.querySelector('[data-rw-cint-type-btn]') as HTMLButtonElement
  const typeLabel = dlg.querySelector('[data-rw-cint-type-label]') as HTMLElement
  const typeList = dlg.querySelector('[data-rw-cint-type-list]') as HTMLUListElement
  const inputValue = dlg.querySelector('[data-rw-cint-value]') as HTMLInputElement

  let selectedType: CustomIntervalType = 'minutes'
  let typeListOpen = false

  for (const opt of TYPE_OPTIONS) {
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'rw-cint__type-opt'
    btn.dataset.type = opt.id
    btn.textContent = opt.label
    btn.setAttribute('role', 'option')
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      setType(opt.id)
      closeTypeList()
    })
    li.appendChild(btn)
    typeList.appendChild(li)
  }

  function setType(type: CustomIntervalType) {
    selectedType = type
    typeLabel.textContent = TYPE_OPTIONS.find((o) => o.id === type)?.label ?? type
    typeList.querySelectorAll<HTMLButtonElement>('.rw-cint__type-opt').forEach((b) => {
      b.classList.toggle('rw-cint__type-opt--active', b.dataset.type === type)
    })
    syncAddState()
  }

  function positionTypeList() {
    const r = btnType.getBoundingClientRect()
    const listH = typeList.scrollHeight || 200
    const spaceBelow = window.innerHeight - r.bottom
    const spaceAbove = r.top
    const openAbove = spaceAbove >= listH || spaceAbove > spaceBelow
    typeList.classList.toggle('rw-cint__type-list--above', openAbove)
    typeList.classList.toggle('rw-cint__type-list--below', !openAbove)
    btnType.classList.toggle('rw-cint__type-btn--drop-above', openAbove)
    btnType.classList.toggle('rw-cint__type-btn--drop-below', !openAbove)
  }

  function openTypeList() {
    typeListOpen = true
    typeList.classList.add('rw-cint__type-list--open')
    btnType.classList.add('rw-cint__type-btn--open')
    btnType.setAttribute('aria-expanded', 'true')
    requestAnimationFrame(() => {
      positionTypeList()
      requestAnimationFrame(positionTypeList)
    })
  }

  function closeTypeList() {
    typeListOpen = false
    typeList.classList.remove('rw-cint__type-list--open', 'rw-cint__type-list--above', 'rw-cint__type-list--below')
    btnType.classList.remove(
      'rw-cint__type-btn--open',
      'rw-cint__type-btn--drop-above',
      'rw-cint__type-btn--drop-below',
    )
    btnType.setAttribute('aria-expanded', 'false')
  }

  function parsedValue(): number | null {
    const raw = inputValue.value.trim()
    if (!raw) return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 1) return null
    return Math.floor(n)
  }

  function syncAddState() {
    const n = parsedValue()
    const pick = n != null ? customIntervalToPick(selectedType, n) : null
    btnAdd.disabled = pick == null
  }

  function resetForm() {
    selectedType = 'minutes'
    setType('minutes')
    inputValue.value = ''
    closeTypeList()
    syncAddState()
  }

  function closeDialog() {
    closeTypeList()
    if (dlg.open) dlg.close()
  }

  function submit() {
    const n = parsedValue()
    if (n == null) return
    const pick = customIntervalToPick(selectedType, n)
    if (!pick) {
      if (selectedType === 'range') {
        window.alert('Range intervals are not supported in replay mode yet.')
      }
      return
    }
    opts.onAdd(pick)
    closeDialog()
    resetForm()
  }

  btnType.addEventListener('click', (e) => {
    e.stopPropagation()
    if (typeListOpen) closeTypeList()
    else openTypeList()
  })

  inputValue.addEventListener('input', () => {
    inputValue.value = inputValue.value.replace(/\D/g, '')
    syncAddState()
  })
  inputValue.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !btnAdd.disabled) {
      e.preventDefault()
      submit()
    }
  })

  btnClose.addEventListener('click', () => {
    closeDialog()
    resetForm()
  })
  btnCancel.addEventListener('click', () => {
    closeDialog()
    resetForm()
  })
  btnAdd.addEventListener('click', submit)

  dlg.addEventListener('cancel', (e) => {
    e.preventDefault()
    closeDialog()
    resetForm()
  })

  dlg.addEventListener('close', closeTypeList)

  const onDocMouseDown = (e: MouseEvent) => {
    if (!typeListOpen) return
    const t = e.target as Node
    if (typeList.contains(t) || btnType.contains(t)) return
    closeTypeList()
  }
  document.addEventListener('mousedown', onDocMouseDown, true)

  setType('minutes')

  return {
    open() {
      syncChartThemeToElement(dlg)
      resetForm()
      if (typeof dlg.showModal === 'function') dlg.showModal()
      else dlg.setAttribute('open', '')
      requestAnimationFrame(() => inputValue.focus())
    },
    close: closeDialog,
    dispose() {
      document.removeEventListener('mousedown', onDocMouseDown, true)
      closeDialog()
      dlg.remove()
    },
  }
}
