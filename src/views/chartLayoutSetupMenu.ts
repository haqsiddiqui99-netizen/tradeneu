import './chartLayoutSetupMenu.css'
import { syncChartThemeToElement } from '../styles/syncChartTheme'
import {
  SPLIT_LAYOUT_ROWS,
  splitLayoutChartCount,
  splitLayoutIconSvg,
} from '../chart/chartSplitLayouts'
import type { ChartLayoutSync } from '../chart/chartLayoutStore'

export type ChartLayoutSetupMenuApi = {
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: () => boolean
  dispose: () => void
}

type SyncRow = { key: keyof ChartLayoutSync; label: string; info: string }

const SYNC_ROWS: SyncRow[] = [
  {
    key: 'symbol',
    label: 'Symbol',
    info: 'Changing the symbol on one chart changes it on every chart in the layout.',
  },
  {
    key: 'interval',
    label: 'Interval',
    info: 'Changing the timeframe on one chart changes it on every chart in the layout.',
  },
  {
    key: 'crosshair',
    label: 'Crosshair',
    info: 'Move the crosshair on one chart and the others follow it at the same time.',
  },
  {
    key: 'time',
    label: 'Time',
    info: 'Keeps every chart scrolled to the same moment in time.',
  },
  {
    key: 'dateRange',
    label: 'Date range',
    info: 'Keeps every chart showing the same visible date range.',
  },
]

const ICO_INFO = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor"/><path d="M12 10.6v6.1" stroke="var(--rw-laysetup-info-ink, #fff)" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.2" fill="var(--rw-laysetup-info-ink, #fff)"/></svg>`

const ICO_LOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"/></svg>`

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * The anchor is the layout-setup square inside the TradingView iframe, so its rect is in frame
 * coordinates — shift by the frame's own position to land in the parent document.
 */
function positionPanel(anchor: HTMLElement, panel: HTMLElement) {
  const r = anchor.getBoundingClientRect()
  const frame = anchor.ownerDocument.defaultView?.frameElement as HTMLElement | null
  const frameRect = frame?.getBoundingClientRect()
  const offsetLeft = frameRect?.left ?? 0
  const offsetTop = frameRect?.top ?? 0
  const pad = 6
  const w = panel.offsetWidth || 340
  const left = offsetLeft + r.left
  panel.style.left = `${Math.max(8, Math.min(left, window.innerWidth - w - 8))}px`
  panel.style.top = `${offsetTop + r.bottom + pad}px`
}

export function createChartLayoutSetupMenu(opts: {
  anchor: HTMLElement
  getSplit: () => string
  getSync: () => ChartLayoutSync
  /** Chart counts above this are shown locked; null means everything is allowed. */
  maxCharts: number | null
  onPickSplit: (split: string) => void
  onToggleSync: (key: keyof ChartLayoutSync, on: boolean) => void
  /** Called when a locked row is clicked, so the caller can explain why. */
  onLocked?: (count: number) => void
  onOpenChange?: (open: boolean) => void
}): ChartLayoutSetupMenuApi {
  const root = document.createElement('div')
  root.className = 'rw-laysetup'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-label', 'Layout setup')

  const gridHtml = SPLIT_LAYOUT_ROWS.map(({ count, ids }) => {
    const locked = opts.maxCharts !== null && count > opts.maxCharts
    const cells = ids
      .map((id) => {
        const label = `${count} chart${count === 1 ? '' : 's'} — ${id}`
        return `<button type="button" class="rw-laysetup__opt" data-rw-split="${id}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${splitLayoutIconSvg(id)}</button>`
      })
      .join('')
    return `<div class="rw-laysetup__row" data-rw-count="${count}"${locked ? ' data-locked="true"' : ''}>
      <span class="rw-laysetup__num">${count}</span>
      <div class="rw-laysetup__opts">${cells}</div>
      ${locked ? `<span class="rw-laysetup__lock" title="Split-screen layouts are not available yet">${ICO_LOCK}</span>` : ''}
    </div>`
  }).join('')

  const syncHtml = SYNC_ROWS.map(
    (row) => `<div class="rw-laysetup__sync">
      <span class="rw-laysetup__sync-lbl">${row.label}</span>
      <span class="rw-laysetup__info" title="${escapeHtml(row.info)}" aria-label="${escapeHtml(row.info)}">${ICO_INFO}</span>
      <button type="button" class="rw-laysetup__tgl" data-rw-sync="${row.key}" role="switch" aria-label="${escapeHtml(`Sync ${row.label.toLowerCase()}`)}"></button>
    </div>`,
  ).join('')

  root.innerHTML = `
    <div class="rw-laysetup__grid">${gridHtml}</div>
    <div class="rw-laysetup__head">Sync in layout</div>
    <div class="rw-laysetup__syncs">${syncHtml}</div>
  `

  function paint() {
    const split = opts.getSplit()
    const activeCount = splitLayoutChartCount(split)
    root.querySelectorAll<HTMLButtonElement>('[data-rw-split]').forEach((btn) => {
      const on = btn.dataset.rwSplit === split
      btn.classList.toggle('rw-laysetup__opt--active', on)
      btn.setAttribute('aria-pressed', on ? 'true' : 'false')
    })
    root.querySelectorAll<HTMLElement>('[data-rw-count]').forEach((row) => {
      row.classList.toggle('rw-laysetup__row--active', Number(row.dataset.rwCount) === activeCount)
    })
    const sync = opts.getSync()
    root.querySelectorAll<HTMLButtonElement>('[data-rw-sync]').forEach((btn) => {
      const on = !!sync[btn.dataset.rwSync as keyof ChartLayoutSync]
      btn.classList.toggle('rw-laysetup__tgl--on', on)
      btn.setAttribute('aria-checked', on ? 'true' : 'false')
    })
  }

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const opt = target.closest<HTMLElement>('[data-rw-split]')
    if (opt) {
      e.stopPropagation()
      const row = opt.closest<HTMLElement>('[data-rw-count]')
      if (row?.dataset.locked === 'true') {
        opts.onLocked?.(Number(row.dataset.rwCount))
        return
      }
      opts.onPickSplit(opt.dataset.rwSplit ?? 's')
      paint()
      return
    }
    const tgl = target.closest<HTMLElement>('[data-rw-sync]')
    if (!tgl) return
    e.stopPropagation()
    const key = tgl.dataset.rwSync as keyof ChartLayoutSync
    opts.onToggleSync(key, !opts.getSync()[key])
    paint()
  })

  let menuOpen = false
  let onDocMouseDown: ((e: MouseEvent) => void) | null = null
  let onDocKeyDown: ((e: KeyboardEvent) => void) | null = null
  let onWinResize: (() => void) | null = null

  const anchorDoc = opts.anchor.ownerDocument

  function close() {
    if (!menuOpen) return
    menuOpen = false
    opts.onOpenChange?.(false)
    root.classList.remove('rw-laysetup--open')
    if (root.parentNode) root.parentNode.removeChild(root)
    if (onDocMouseDown) {
      document.removeEventListener('mousedown', onDocMouseDown, true)
      if (anchorDoc !== document) anchorDoc.removeEventListener('mousedown', onDocMouseDown, true)
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
    paint()
    syncChartThemeToElement(root)
    document.body.appendChild(root)
    root.classList.add('rw-laysetup--open')
    opts.onOpenChange?.(true)
    requestAnimationFrame(() => {
      positionPanel(opts.anchor, root)
      requestAnimationFrame(() => positionPanel(opts.anchor, root))
    })

    onWinResize = () => positionPanel(opts.anchor, root)
    window.addEventListener('resize', onWinResize)

    onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      close()
    }
    document.addEventListener('keydown', onDocKeyDown, true)

    // Deferred so the click that opened the panel does not immediately dismiss it.
    setTimeout(() => {
      onDocMouseDown = (e: MouseEvent) => {
        const t = e.target as Node
        if (root.contains(t) || opts.anchor.contains(t)) return
        close()
      }
      document.addEventListener('mousedown', onDocMouseDown, true)
      // Clicks on the chart itself are dispatched inside the TradingView iframe.
      if (anchorDoc !== document) anchorDoc.addEventListener('mousedown', onDocMouseDown, true)
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
  }
}
