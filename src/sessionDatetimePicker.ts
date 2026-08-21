import { icons } from './icons'

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDatetimeLocalFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function clampInstant(d: Date, min: Date, max: Date): Date {
  const t = d.getTime()
  const tMin = min.getTime()
  const tMax = max.getTime()
  if (t < tMin) return new Date(tMin)
  if (t > tMax) return new Date(tMax)
  return d
}

function parseInstant(value: string, fallback: Date): Date {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? fallback : d
}

type OpenArgs = {
  anchor: HTMLElement
  value: string
  min: string
  max: string
  onChange: (value: string) => void
  onClose?: () => void
}

let popEl: HTMLElement | null = null
let docDown: ((e: MouseEvent) => void) | null = null
let keyDown: ((e: KeyboardEvent) => void) | null = null
let reposition: (() => void) | null = null
let openArgs: OpenArgs | null = null
let draft: Date = new Date()
let viewY = 0
let viewM = 0

function ensureDom(): HTMLElement {
  if (popEl) return popEl
  const root = document.createElement('div')
  root.id = 'sx-session-dtp'
  root.className = 'sx-dtp'
  root.setAttribute('hidden', '')
  root.innerHTML = `
    <div class="sx-dtp__head">
      <button type="button" class="sx-dtp__nav sx-dtp__nav--prev" data-dtp="prev" aria-label="Previous month">${icons.chevronDown}</button>
      <div class="sx-dtp__jump">
        <select class="sx-dtp__select" data-dtp="month" aria-label="Month"></select>
        <select class="sx-dtp__select" data-dtp="year" aria-label="Year"></select>
      </div>
      <button type="button" class="sx-dtp__nav sx-dtp__nav--next" data-dtp="next" aria-label="Next month">${icons.chevronDown}</button>
    </div>
    <div class="sx-dtp__dow">${DOW.map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="sx-dtp__grid" data-dtp="grid"></div>
    <div class="sx-dtp__time">
      <div class="sx-dtp__time-col">
        <button type="button" class="sx-dtp__spin" data-dtp="hu" aria-label="Hour up">${icons.chevronUp}</button>
        <span class="sx-dtp__time-val" data-dtp="hour"></span>
        <button type="button" class="sx-dtp__spin" data-dtp="hd" aria-label="Hour down">${icons.chevronDown}</button>
      </div>
      <span class="sx-dtp__time-sep">:</span>
      <div class="sx-dtp__time-col">
        <button type="button" class="sx-dtp__spin" data-dtp="mu" aria-label="Minute up">${icons.chevronUp}</button>
        <span class="sx-dtp__time-val" data-dtp="minute"></span>
        <button type="button" class="sx-dtp__spin" data-dtp="md" aria-label="Minute down">${icons.chevronDown}</button>
      </div>
    </div>
    <div class="sx-dtp__foot">
      <button type="button" class="sx-dtp__btn sx-dtp__btn--primary" data-dtp="choose">Choose</button>
      <button type="button" class="sx-dtp__btn sx-dtp__btn--ghost" data-dtp="cancel">Cancel</button>
    </div>
  `
  document.body.appendChild(root)
  popEl = root

  root.querySelector('[data-dtp="prev"]')?.addEventListener('click', () => stepMonth(-1))
  root.querySelector('[data-dtp="next"]')?.addEventListener('click', () => stepMonth(1))
  root.querySelector('[data-dtp="month"]')?.addEventListener('change', (e) => {
    setView(viewY, Number((e.target as HTMLSelectElement).value))
  })
  root.querySelector('[data-dtp="year"]')?.addEventListener('change', (e) => {
    setView(Number((e.target as HTMLSelectElement).value), viewM)
  })
  root.querySelector('[data-dtp="hu"]')?.addEventListener('click', () => bumpHour(1))
  root.querySelector('[data-dtp="hd"]')?.addEventListener('click', () => bumpHour(-1))
  root.querySelector('[data-dtp="mu"]')?.addEventListener('click', () => bumpMinute(1))
  root.querySelector('[data-dtp="md"]')?.addEventListener('click', () => bumpMinute(-1))
  root.querySelector('[data-dtp="choose"]')?.addEventListener('click', onChoose)
  root.querySelector('[data-dtp="cancel"]')?.addEventListener('click', onCancel)

  /* Keep picker interactions from bubbling to ancestors (e.g. dialog handlers). */
  root.addEventListener('mousedown', (e) => e.stopPropagation())
  root.addEventListener('click', (e) => e.stopPropagation())

  return root
}

function getBounds(): { min: Date; max: Date } {
  const a = openArgs
  if (!a) return { min: new Date(0), max: new Date(8.64e15) }
  const min = new Date(a.min)
  const max = new Date(a.max)
  return {
    min: Number.isNaN(min.getTime()) ? new Date(0) : min,
    max: Number.isNaN(max.getTime()) ? new Date(8.64e15) : max,
  }
}

/** Move the visible month, clamped to the month range allowed by min/max. */
function setView(year: number, month: number) {
  if (!openArgs) return
  const { min, max } = getBounds()
  const d = new Date(year, month, 1)
  const firstMin = new Date(min.getFullYear(), min.getMonth(), 1)
  const firstMax = new Date(max.getFullYear(), max.getMonth(), 1)
  const clamped = d < firstMin ? firstMin : d > firstMax ? firstMax : d
  viewY = clamped.getFullYear()
  viewM = clamped.getMonth()
  render()
}

function stepMonth(delta: number) {
  setView(viewY, viewM + delta)
}

function bumpHour(delta: number) {
  if (!openArgs) return
  const { min, max } = getBounds()
  const d = new Date(draft)
  d.setHours(d.getHours() + delta)
  draft = clampInstant(d, min, max)
  viewY = draft.getFullYear()
  viewM = draft.getMonth()
  render()
}

function bumpMinute(delta: number) {
  if (!openArgs) return
  const { min, max } = getBounds()
  const d = new Date(draft)
  d.setMinutes(d.getMinutes() + delta)
  draft = clampInstant(d, min, max)
  viewY = draft.getFullYear()
  viewM = draft.getMonth()
  render()
}

function onChoose() {
  if (!openArgs) return
  const { min, max } = getBounds()
  draft = clampInstant(draft, min, max)
  openArgs.onChange(formatDatetimeLocalFromDate(draft))
  closeSessionDatetimePicker()
}

function onCancel() {
  closeSessionDatetimePicker()
}

function dayInstant(y: number, m: number, day: number, fromDraft: Date): Date {
  return new Date(y, m, day, fromDraft.getHours(), fromDraft.getMinutes(), 0, 0)
}

function isDayWhollyBeforeMin(y: number, m: number, day: number, min: Date): boolean {
  const end = new Date(y, m, day, 23, 59, 59, 999)
  return end < min
}

function isDayWhollyAfterMax(y: number, m: number, day: number, max: Date): boolean {
  const start = new Date(y, m, day, 0, 0, 0, 0)
  return start > max
}

/** Month + year dropdowns, limited to the months the session bounds allow. */
function renderJump(el: HTMLElement, min: Date, max: Date) {
  const monthSel = el.querySelector('[data-dtp="month"]') as HTMLSelectElement
  const yearSel = el.querySelector('[data-dtp="year"]') as HTMLSelectElement

  const minY = min.getFullYear()
  const maxY = max.getFullYear()

  yearSel.replaceChildren()
  for (let y = minY; y <= maxY; y++) {
    const opt = document.createElement('option')
    opt.value = String(y)
    opt.textContent = String(y)
    yearSel.appendChild(opt)
  }
  yearSel.value = String(viewY)

  monthSel.replaceChildren()
  for (let m = 0; m < 12; m++) {
    const opt = document.createElement('option')
    opt.value = String(m)
    opt.textContent = new Date(2000, m, 1).toLocaleString(undefined, { month: 'short' })
    if ((viewY === minY && m < min.getMonth()) || (viewY === maxY && m > max.getMonth())) {
      opt.disabled = true
    }
    monthSel.appendChild(opt)
  }
  monthSel.value = String(viewM)
}

function render() {
  const el = popEl
  const a = openArgs
  if (!el || !a) return
  const { min, max } = getBounds()
  renderJump(el, min, max)

  const hourEl = el.querySelector('[data-dtp="hour"]') as HTMLElement
  const minuteEl = el.querySelector('[data-dtp="minute"]') as HTMLElement
  hourEl.textContent = pad2(draft.getHours())
  minuteEl.textContent = pad2(draft.getMinutes())

  const grid = el.querySelector('[data-dtp="grid"]') as HTMLElement
  grid.replaceChildren()

  const first = new Date(viewY, viewM, 1)
  const startPad = first.getDay()
  const dim = new Date(viewY, viewM + 1, 0).getDate()
  const prevDim = new Date(viewY, viewM, 0).getDate()

  const cells: { y: number; m: number; d: number; inMonth: boolean }[] = []
  for (let i = 0; i < startPad; i++) {
    const d = prevDim - startPad + i + 1
    cells.push({ y: viewM === 0 ? viewY - 1 : viewY, m: viewM === 0 ? 11 : viewM - 1, d, inMonth: false })
  }
  for (let d = 1; d <= dim; d++) cells.push({ y: viewY, m: viewM, d, inMonth: true })
  let nextD = 1
  while (cells.length < 42) {
    cells.push({ y: viewM === 11 ? viewY + 1 : viewY, m: viewM === 11 ? 0 : viewM + 1, d: nextD++, inMonth: false })
  }

  for (const c of cells) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'sx-dtp__day'
    btn.textContent = String(c.d)
    if (!c.inMonth) btn.classList.add('sx-dtp__day--muted')

    const dis =
      isDayWhollyBeforeMin(c.y, c.m, c.d, min) ||
      isDayWhollyAfterMax(c.y, c.m, c.d, max)
    if (dis) {
      btn.classList.add('sx-dtp__day--disabled')
      btn.disabled = true
    } else {
      /* Pick the day only — the value is committed when Choose is pressed. */
      btn.addEventListener('click', () => {
        if (!openArgs) return
        draft = clampInstant(dayInstant(c.y, c.m, c.d, draft), min, max)
        setView(c.y, c.m)
      })
    }

    if (
      c.inMonth &&
      draft.getFullYear() === c.y &&
      draft.getMonth() === c.m &&
      draft.getDate() === c.d
    ) {
      btn.classList.add('sx-dtp__day--selected')
    }
    if (
      !c.inMonth &&
      draft.getFullYear() === c.y &&
      draft.getMonth() === c.m &&
      draft.getDate() === c.d
    ) {
      btn.classList.add('sx-dtp__day--selected')
    }

    grid.appendChild(btn)
  }

  const prevBtn = el.querySelector('[data-dtp="prev"]') as HTMLButtonElement
  const nextBtn = el.querySelector('[data-dtp="next"]') as HTMLButtonElement
  const firstMin = new Date(min.getFullYear(), min.getMonth(), 1)
  const firstMax = new Date(max.getFullYear(), max.getMonth(), 1)
  const curFirst = new Date(viewY, viewM, 1)
  prevBtn.disabled = curFirst.getTime() <= firstMin.getTime()
  nextBtn.disabled = curFirst.getTime() >= firstMax.getTime()
}

function positionNear(anchor: HTMLElement) {
  const el = popEl
  if (!el) return
  const r = anchor.getBoundingClientRect()
  const w = 300
  const h = el.offsetHeight || 420
  let left = r.left + r.width / 2 - w / 2
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
  let top = r.bottom + 8
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8)
  el.style.left = `${left}px`
  el.style.top = `${top}px`
  el.style.width = `${w}px`
}

export function isSessionDatetimePickerOpen(): boolean {
  return Boolean(openArgs && popEl && !popEl.hasAttribute('hidden'))
}

export function closeSessionDatetimePicker() {
  if (docDown) {
    document.removeEventListener('mousedown', docDown, true)
    docDown = null
  }
  if (keyDown) {
    document.removeEventListener('keydown', keyDown, true)
    keyDown = null
  }
  if (reposition) {
    window.removeEventListener('scroll', reposition, true)
    window.removeEventListener('resize', reposition)
    reposition = null
  }
  if (popEl) popEl.setAttribute('hidden', '')
  const cb = openArgs?.onClose
  openArgs = null
  cb?.()
}

export function openSessionDatetimePicker(args: OpenArgs) {
  closeSessionDatetimePicker()
  openArgs = args
  const el = ensureDom()
  const { min, max } = getBounds()
  const fallback = clampInstant(new Date(), min, max)
  draft = clampInstant(parseInstant(args.value, fallback), min, max)
  viewY = draft.getFullYear()
  viewM = draft.getMonth()

  el.removeAttribute('hidden')
  positionNear(args.anchor)
  render()
  requestAnimationFrame(() => positionNear(args.anchor))

  docDown = (e: MouseEvent) => {
    const t = e.target as Node
    if (el.contains(t) || args.anchor.contains(t)) return
    closeSessionDatetimePicker()
  }
  document.addEventListener('mousedown', docDown, true)

  reposition = () => positionNear(args.anchor)
  window.addEventListener('scroll', reposition, true)
  window.addEventListener('resize', reposition)

  keyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeSessionDatetimePicker()
    }
  }
  document.addEventListener('keydown', keyDown, true)
}
