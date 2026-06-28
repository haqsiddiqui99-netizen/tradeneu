import './chartIntervalMenu.css'
import { syncChartThemeToElement } from '../styles/syncChartTheme'
import { createCustomIntervalDialog } from './chartCustomIntervalDialog'
import {
  CHART_INTERVAL_SECTIONS,
  findIntervalSectionForPill,
  type IntervalKind,
  type IntervalPick,
  type IntervalSection,
} from './chartIntervalCatalog'

export type { IntervalKind, IntervalPick } from './chartIntervalCatalog'

export { REPLAY_DOCK_INTERVALS } from './chartIntervalCatalog'

export type ChartIntervalMenuApi = {
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: () => boolean
  dispose: () => void
}

function positionPanel(anchor: HTMLElement, panel: HTMLElement, variant: 'default' | 'replay' = 'default') {
  const r = anchor.getBoundingClientRect()
  const pad = 4
  const toolbarClearance = 48
  const panelW = panel.offsetWidth || (variant === 'replay' ? 72 : 220)
  const panelH = panel.offsetHeight || 120
  const left =
    variant === 'replay'
      ? r.left + r.width / 2 - panelW / 2
      : r.left
  panel.style.left = `${Math.max(8, Math.min(left, window.innerWidth - panelW - 8))}px`

  const spaceAbove = r.top - toolbarClearance
  const spaceBelow = window.innerHeight - r.bottom
  const openBelow =
    spaceBelow >= panelH + pad && (spaceBelow >= spaceAbove || r.top < window.innerHeight * 0.45)

  panel.classList.toggle('rw-intmenu--below', openBelow)
  panel.classList.toggle('rw-intmenu--above', !openBelow)
  if (openBelow) {
    panel.style.top = `${r.bottom + pad}px`
  } else {
    panel.style.top = `${Math.max(toolbarClearance, r.top - pad - panelH)}px`
  }
}

function isPickEnabled(
  pick: IntervalPick,
  opts: {
    canResampleFrom1m: () => boolean
    canUseTicks?: () => boolean
    canUseSubMinute?: () => boolean
    getSelectedPill: () => string
  },
): boolean {
  const sel = opts.getSelectedPill().trim()
  if (pick.kind === 'tick') {
    return opts.canUseTicks?.() ?? false
  }
  const step = pick.stepSec ?? 60
  if (step < 60) {
    return opts.canUseSubMinute?.() ?? false
  }
  if (opts.canResampleFrom1m()) return true
  return pick.pill === sel
}

export function createChartIntervalMenu(opts: {
  anchor: HTMLElement
  getSelectedPill: () => string
  canResampleFrom1m: () => boolean
  canUseTicks?: () => boolean
  canUseSubMinute?: () => boolean
  onSelect: (pick: IntervalPick) => void
  onOpenChange?: (open: boolean) => void
  /** When set, only these rows are shown (no section headers). */
  items?: IntervalPick[]
  /** `replay` = compact list centered under anchor (FXReplay floating bar). */
  variant?: 'default' | 'replay'
  /** Show “Add custom interval…” row (TradingView-style). */
  showCustomInterval?: boolean
}): ChartIntervalMenuApi {
  const root = document.createElement('div')
  root.className = 'rw-intmenu'
  if (opts.variant === 'replay') root.classList.add('rw-intmenu--replay')
  root.setAttribute('role', 'listbox')
  root.setAttribute('aria-label', 'Chart interval')

  const scroll = document.createElement('div')
  scroll.className = 'rw-intmenu__scroll'

  const expandedSections = new Set<string>()

  const customIntervalDialog =
    opts.showCustomInterval !== false && !opts.items?.length
      ? createCustomIntervalDialog({
          onAdd: (pick) => {
            close()
            opts.onSelect(pick)
          },
        })
      : null

  function ensureExpandedForSelection() {
    const sectionId = findIntervalSectionForPill(opts.getSelectedPill())
    if (sectionId) expandedSections.add(sectionId)
    else expandedSections.add('minutes')
  }

  function addButtons(items: IntervalPick[], body: HTMLElement) {
    for (const item of items) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'rw-intmenu__btn'
      btn.textContent = item.label
      btn.dataset.pill = item.pill
      if (item.stepSec != null) btn.dataset.step = String(item.stepSec)
      if (item.tickCount != null) btn.dataset.ticks = String(item.tickCount)
      btn.dataset.kind = item.kind
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (btn.disabled) return
        opts.onSelect(item)
        close()
      })
      body.appendChild(btn)
    }
  }

  function buildAccordionSection(section: IntervalSection, withSep: boolean) {
    if (withSep) {
      const sep = document.createElement('div')
      sep.className = 'rw-intmenu__sep'
      sep.setAttribute('role', 'separator')
      scroll.appendChild(sep)
    }

    const wrap = document.createElement('div')
    wrap.className = 'rw-intmenu__section'
    wrap.dataset.sectionId = section.id

    const head = document.createElement('button')
    head.type = 'button'
    head.className = 'rw-intmenu__head'
    head.setAttribute('aria-expanded', 'false')
    head.innerHTML = `<span>${section.title}</span><span class="rw-intmenu__head-chev" aria-hidden="true"></span>`

    const body = document.createElement('div')
    body.className = 'rw-intmenu__section-body'
    addButtons(section.items, body)

    head.addEventListener('click', (e) => {
      e.stopPropagation()
      const open = wrap.classList.toggle('rw-intmenu__section--open')
      head.setAttribute('aria-expanded', open ? 'true' : 'false')
      if (open) expandedSections.add(section.id)
      else expandedSections.delete(section.id)
      requestAnimationFrame(() => positionPanel(opts.anchor, root, opts.variant ?? 'default'))
    })

    wrap.appendChild(head)
    wrap.appendChild(body)
    scroll.appendChild(wrap)
  }

  if (opts.items?.length) {
    addButtons(opts.items, scroll)
  } else {
    if (opts.showCustomInterval !== false) {
      const addBtn = document.createElement('button')
      addBtn.type = 'button'
      addBtn.className = 'rw-intmenu__add'
      addBtn.innerHTML = `<span class="rw-intmenu__add-ico" aria-hidden="true">+</span><span>Add custom interval…</span>`
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        close()
        customIntervalDialog?.open()
      })
      scroll.appendChild(addBtn)
    }

    CHART_INTERVAL_SECTIONS.forEach((section, i) => buildAccordionSection(section, i > 0 || opts.showCustomInterval !== false))

    const hint = document.createElement('p')
    hint.className = 'rw-intmenu__hint'
    hint.textContent =
      'Tick intervals use synthetic ticks from 1-minute session bars. Second intervals need sub-minute feed data.'
    scroll.appendChild(hint)
  }

  root.appendChild(scroll)

  function syncSectionOpenState() {
    scroll.querySelectorAll<HTMLElement>('.rw-intmenu__section').forEach((wrap) => {
      const id = wrap.dataset.sectionId ?? ''
      const open = expandedSections.has(id)
      wrap.classList.toggle('rw-intmenu__section--open', open)
      const head = wrap.querySelector<HTMLButtonElement>('.rw-intmenu__head')
      head?.setAttribute('aria-expanded', open ? 'true' : 'false')
    })
  }

  function syncDisabledAndActive() {
    const sel = opts.getSelectedPill().trim()
    scroll.querySelectorAll<HTMLButtonElement>('.rw-intmenu__btn').forEach((btn) => {
      const pill = btn.dataset.pill ?? ''
      btn.classList.toggle('rw-intmenu__btn--active', pill === sel)
      const pick: IntervalPick = {
        pill,
        label: btn.textContent ?? pill,
        kind: (btn.dataset.kind as IntervalKind) ?? 'time',
        stepSec: btn.dataset.step ? Number(btn.dataset.step) : undefined,
        tickCount: btn.dataset.ticks ? Number(btn.dataset.ticks) : undefined,
      }
      const enabled = isPickEnabled(pick, opts)
      btn.disabled = !enabled
      btn.title = enabled
        ? ''
        : pick.kind === 'tick'
          ? 'Tick intervals need enough 1-minute history to synthesize ticks'
          : (pick.stepSec ?? 60) < 60
            ? 'Sub-minute intervals require second-level history'
            : 'Not enough 1-minute history to build this interval'
    })
  }

  let menuOpen = false
  let onDocMouseDown: ((e: MouseEvent) => void) | null = null
  let onDocKeyDown: ((e: KeyboardEvent) => void) | null = null
  let onWinResize: (() => void) | null = null

  function close() {
    if (!menuOpen) return
    menuOpen = false
    opts.onOpenChange?.(false)
    root.classList.remove('rw-intmenu--open')
    if (root.parentNode) root.parentNode.removeChild(root)
    if (onDocMouseDown) {
      document.removeEventListener('mousedown', onDocMouseDown, true)
      onDocMouseDown = null
    }
    if (onDocKeyDown) {
      document.removeEventListener('keydown', onDocKeyDown, true)
      onDocKeyDown = null
    }
    if (onWinResize) {
      window.removeEventListener('resize', onWinResize)
      onWinResize = null
    }
  }

  function openMenu() {
    if (menuOpen) return
    menuOpen = true
    ensureExpandedForSelection()
    syncSectionOpenState()
    syncDisabledAndActive()
    syncChartThemeToElement(root)
    document.body.appendChild(root)
    root.classList.add('rw-intmenu--open')
    opts.onOpenChange?.(true)
    const variant = opts.variant ?? 'default'
    requestAnimationFrame(() => {
      positionPanel(opts.anchor, root, variant)
      requestAnimationFrame(() => positionPanel(opts.anchor, root, variant))
    })

    onWinResize = () => positionPanel(opts.anchor, root, variant)
    window.addEventListener('resize', onWinResize)

    onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    document.addEventListener('keydown', onDocKeyDown, true)

    setTimeout(() => {
      onDocMouseDown = (e: MouseEvent) => {
        const t = e.target as Node
        if (root.contains(t) || opts.anchor.contains(t)) return
        close()
      }
      document.addEventListener('mousedown', onDocMouseDown, true)
    }, 0)
  }

  return {
    open() {
      openMenu()
    },
    close,
    toggle() {
      if (menuOpen) close()
      else openMenu()
    },
    isOpen: () => menuOpen,
    dispose() {
      close()
      customIntervalDialog?.dispose()
    },
  }
}
