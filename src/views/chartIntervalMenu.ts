import './chartIntervalMenu.css'

export type IntervalPick = {
  /** Compact label on the pill (e.g. 1m, 5m, 1h, 1D). */
  pill: string
  /** Bar length in seconds for OHLCV bucketing. */
  stepSec: number
  /** Row label inside the menu. */
  label: string
}

const MINUTES: IntervalPick[] = [
  { pill: '1m', stepSec: 60, label: '1 minute' },
  { pill: '2m', stepSec: 120, label: '2 minutes' },
  { pill: '3m', stepSec: 180, label: '3 minutes' },
  { pill: '5m', stepSec: 300, label: '5 minutes' },
  { pill: '10m', stepSec: 600, label: '10 minutes' },
  { pill: '15m', stepSec: 900, label: '15 minutes' },
  { pill: '30m', stepSec: 1800, label: '30 minutes' },
  { pill: '45m', stepSec: 2700, label: '45 minutes' },
]

const HOURS: IntervalPick[] = [
  { pill: '1h', stepSec: 3600, label: '1 hour' },
  { pill: '2h', stepSec: 7200, label: '2 hours' },
  { pill: '3h', stepSec: 10_800, label: '3 hours' },
  { pill: '4h', stepSec: 14_400, label: '4 hours' },
]

const DAYS: IntervalPick[] = [
  { pill: '1D', stepSec: 86_400, label: '1 day' },
  { pill: '1W', stepSec: 604_800, label: '1 week' },
  { pill: '1M', stepSec: 2_592_000, label: '1 month' },
  { pill: '3M', stepSec: 7_776_000, label: '3 months' },
  { pill: '6M', stepSec: 15_552_000, label: '6 months' },
  { pill: '12M', stepSec: 31_536_000, label: '12 months' },
]

export type ChartIntervalMenuApi = {
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: () => boolean
  dispose: () => void
}

function positionPanel(anchor: HTMLElement, panel: HTMLElement) {
  const r = anchor.getBoundingClientRect()
  const pad = 4
  panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8))}px`
  panel.style.top = `${r.bottom + pad}px`
}

export function createChartIntervalMenu(opts: {
  anchor: HTMLElement
  getSelectedPill: () => string
  /** When false, only the current pill’s bucket stays enabled (no 1m history to resample). */
  canResampleFrom1m: () => boolean
  onSelect: (pick: IntervalPick) => void
  onOpenChange?: (open: boolean) => void
}): ChartIntervalMenuApi {
  const root = document.createElement('div')
  root.className = 'rw-intmenu'
  root.setAttribute('role', 'listbox')
  root.setAttribute('aria-label', 'Chart interval')

  const scroll = document.createElement('div')
  scroll.className = 'rw-intmenu__scroll'

  function sectionHeader(text: string) {
    const h = document.createElement('div')
    h.className = 'rw-intmenu__head'
    h.innerHTML = `<span>${text}</span><span class="rw-intmenu__head-chev" aria-hidden="true">▼</span>`
    return h
  }

  function hr() {
    const el = document.createElement('div')
    el.className = 'rw-intmenu__sep'
    el.setAttribute('role', 'separator')
    return el
  }

  function addButtons(items: IntervalPick[]) {
    for (const item of items) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'rw-intmenu__btn'
      btn.textContent = item.label
      btn.dataset.pill = item.pill
      btn.dataset.step = String(item.stepSec)
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (btn.disabled) return
        opts.onSelect(item)
        close()
      })
      scroll.appendChild(btn)
    }
  }

  addButtons(MINUTES)
  scroll.appendChild(hr())
  scroll.appendChild(sectionHeader('HOURS'))
  addButtons(HOURS)
  scroll.appendChild(hr())
  scroll.appendChild(sectionHeader('DAYS'))
  addButtons(DAYS)

  const hint = document.createElement('p')
  hint.className = 'rw-intmenu__hint'
  hint.textContent =
    'Intervals above 1 minute are built by combining 1-minute bars from this session’s feed.'
  scroll.appendChild(hint)

  root.appendChild(scroll)

  function syncDisabledAndActive() {
    const sel = opts.getSelectedPill().trim()
    const can = opts.canResampleFrom1m()
    scroll.querySelectorAll<HTMLButtonElement>('.rw-intmenu__btn').forEach((btn) => {
      const pill = btn.dataset.pill ?? ''
      btn.classList.toggle('rw-intmenu__btn--active', pill === sel)
      if (!can) {
        btn.disabled = pill !== sel
      } else {
        btn.disabled = false
      }
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
    syncDisabledAndActive()
    document.body.appendChild(root)
    root.classList.add('rw-intmenu--open')
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
    },
  }
}
