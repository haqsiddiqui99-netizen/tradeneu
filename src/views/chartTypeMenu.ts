import type { ChartVisualKind } from '../chart/chartVisualKind'
import { isChartVisualKindEnabled } from '../chart/chartVisualKind'
import './chartTypeMenu.css'

type RowDef = {
  id: ChartVisualKind
  label: string
  icon: string
  showStar?: boolean
}

const ICO_BARS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 18V6M7 10h2v6M12 4v16M12 8h2v8M17 14v8M17 16h2v4"/></svg>`
const ICO_CANDLES = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65"><path d="M8 4v16M8 8h2v8H8M14 2v20M14 6h2v12h-2"/></svg>`
const ICO_HOLLOW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="7" y="8" width="4" height="8" rx="0.5"/><path d="M9 4v4M9 16v4"/><rect x="13" y="6" width="4" height="12" rx="0.5"/><path d="M15 2v4M15 18v4"/></svg>`
const ICO_VOL_CANDLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 5v14M8 9h3v6H8M14 3v18M14 7h4v10h-4"/></svg>`
const ICO_LINE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 16l5-4 4 6 7-10"/></svg>`
const ICO_LINE_DOT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 17l5-3 4 5 7-9"/><circle cx="9" cy="14" r="1.2" fill="currentColor"/><circle cx="13" cy="19" r="1.2" fill="currentColor"/><circle cx="20" cy="10" r="1.2" fill="currentColor"/></svg>`
const ICO_STEP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 18h6v-5h6V7h4"/></svg>`
const ICO_AREA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 17V8l4 3 4-5 8 6v5H4z" fill="currentColor" fill-opacity="0.2" stroke="currentColor"/></svg>`
const ICO_HLC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 18V9l5 2 4-6 7 5v8H4z" fill="currentColor" fill-opacity="0.15"/></svg>`
const ICO_BASELINE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 12h18" opacity="0.4"/><path d="M4 16l5-2 4 4 7-8"/></svg>`
const ICO_COLUMNS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 18V10h3v8M11 18V6h3v12M16 18v-7h3v7"/></svg>`
const ICO_HL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 4v16M10 8h-4M16 3v18M18 7h-4"/></svg>`
const ICO_FOOT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="5" y="6" width="14" height="12" rx="1"/><path d="M8 10h2M12 10h2M8 14h2M12 14h2"/></svg>`
const ICO_TPO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M5 5h14v14H5z"/><path d="M9 5v14M13 5v14M5 9h14M5 13h14" opacity="0.5"/></svg>`

const ROWS: RowDef[] = [
  { id: 'bars', label: 'Bars', icon: ICO_BARS },
  { id: 'candles', label: 'Candles', icon: ICO_CANDLES, showStar: true },
  { id: 'hollow_candles', label: 'Hollow candles', icon: ICO_HOLLOW },
  { id: 'volume_candles', label: 'Volume candles', icon: ICO_VOL_CANDLE },
  { id: 'line', label: 'Line', icon: ICO_LINE },
  { id: 'line_markers', label: 'Line with markers', icon: ICO_LINE_DOT },
  { id: 'step_line', label: 'Step line', icon: ICO_STEP },
  { id: 'area', label: 'Area', icon: ICO_AREA },
  { id: 'hlc_area', label: 'HLC area', icon: ICO_HLC },
  { id: 'baseline', label: 'Baseline', icon: ICO_BASELINE },
  { id: 'columns', label: 'Columns', icon: ICO_COLUMNS },
  { id: 'high_low', label: 'High-low', icon: ICO_HL },
  { id: 'volume_footprint', label: 'Volume footprint', icon: ICO_FOOT },
  { id: 'tpo', label: 'Time price opportunity', icon: ICO_TPO },
]

export type ChartTypeMenuApi = {
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: () => boolean
  dispose: () => void
  syncActive: () => void
}

function positionPanel(anchor: HTMLElement, panel: HTMLElement) {
  const r = anchor.getBoundingClientRect()
  const pad = 4
  panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8))}px`
  panel.style.top = `${r.bottom + pad}px`
}

export function createChartTypeMenu(opts: {
  anchor: HTMLElement
  getSelected: () => ChartVisualKind
  onSelect: (kind: ChartVisualKind) => void
  onOpenChange?: (open: boolean) => void
}): ChartTypeMenuApi {
  const root = document.createElement('div')
  root.className = 'rw-ctmenu'
  root.setAttribute('role', 'listbox')
  root.setAttribute('aria-label', 'Chart type')

  const scroll = document.createElement('div')
  scroll.className = 'rw-ctmenu__scroll'

  function hr() {
    const el = document.createElement('div')
    el.className = 'rw-ctmenu__sep'
    return el
  }

  const groups: RowDef[][] = [
    ROWS.slice(0, 4),
    ROWS.slice(4, 7),
    ROWS.slice(7, 10),
    ROWS.slice(10, 12),
    ROWS.slice(12, 14),
  ]

  for (let gi = 0; gi < groups.length; gi++) {
    if (gi > 0) scroll.appendChild(hr())
    for (const row of groups[gi]) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'rw-ctmenu__btn'
      btn.dataset.kind = row.id
      btn.innerHTML = `
        <span class="rw-ctmenu__ico" aria-hidden="true">${row.icon}</span>
        <span class="rw-ctmenu__lbl">${row.label}</span>
        ${row.showStar ? '<span class="rw-ctmenu__star" aria-hidden="true">☆</span>' : '<span></span>'}
      `
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (btn.disabled) return
        opts.onSelect(row.id)
        close()
      })
      scroll.appendChild(btn)
    }
  }

  root.appendChild(scroll)

  function syncActive() {
    const sel = opts.getSelected()
    scroll.querySelectorAll<HTMLButtonElement>('.rw-ctmenu__btn').forEach((btn) => {
      const id = btn.dataset.kind as ChartVisualKind
      btn.classList.toggle('rw-ctmenu__btn--active', id === sel)
      btn.disabled = !isChartVisualKindEnabled(id)
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
    root.classList.remove('rw-ctmenu--open')
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
    syncActive()
    document.body.appendChild(root)
    root.classList.add('rw-ctmenu--open')
    opts.onOpenChange?.(true)
    requestAnimationFrame(() => {
      positionPanel(opts.anchor, root)
      requestAnimationFrame(() => positionPanel(opts.anchor, root))
    })

    onWinResize = () => positionPanel(opts.anchor, root)
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
    open: openMenu,
    close,
    toggle() {
      if (menuOpen) close()
      else openMenu()
    },
    isOpen: () => menuOpen,
    dispose: close,
    syncActive,
  }
}
