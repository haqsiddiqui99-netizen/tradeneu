import './chartLayoutMenu.css'
import { syncChartThemeToElement } from '../styles/syncChartTheme'

export type ChartLayoutMenuAction = 'save' | 'copy' | 'rename' | 'open'

export type ChartLayoutMenuApi = {
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: () => boolean
  /** Greys the Save row while the layout has no unsaved changes. */
  setCanSave: (canSave: boolean) => void
  dispose: () => void
}

type MenuRow = {
  id: ChartLayoutMenuAction
  label: string
  shortcut?: string
  icon?: string
  /** Draw a separator above this row. */
  divided?: boolean
}

const ICO_FOLDER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"><path d="M3.5 7.5A1.5 1.5 0 015 6h4.2l1.8 2h8A1.5 1.5 0 0120.5 9.5v8A1.5 1.5 0 0119 19H5a1.5 1.5 0 01-1.5-1.5v-10z"/></svg>`

const ROWS: MenuRow[] = [
  { id: 'save', label: 'Save layout', shortcut: 'Ctrl + S' },
  { id: 'copy', label: 'Make a copy...' },
  { id: 'rename', label: 'Rename...' },
  { id: 'open', label: 'Open layout...', shortcut: 'Dot', icon: ICO_FOLDER, divided: true },
]

/**
 * The anchor is the layout chip, which lives inside the TradingView iframe, so its rect is
 * in frame coordinates — shift by the frame's own position to land in the parent document.
 */
function positionPanel(anchor: HTMLElement, panel: HTMLElement) {
  const r = anchor.getBoundingClientRect()
  const frame = anchor.ownerDocument.defaultView?.frameElement as HTMLElement | null
  const frameRect = frame?.getBoundingClientRect()
  const offsetLeft = frameRect?.left ?? 0
  const offsetTop = frameRect?.top ?? 0
  const pad = 6
  const w = panel.offsetWidth || 230
  const left = offsetLeft + r.right - w
  panel.style.left = `${Math.max(8, Math.min(left, window.innerWidth - w - 8))}px`
  panel.style.top = `${offsetTop + r.bottom + pad}px`
}

export function createChartLayoutMenu(opts: {
  anchor: HTMLElement
  onAction: (action: ChartLayoutMenuAction) => void
  onOpenChange?: (open: boolean) => void
}): ChartLayoutMenuApi {
  const root = document.createElement('div')
  root.className = 'rw-laymenu'
  root.setAttribute('role', 'menu')
  root.setAttribute('aria-label', 'Chart layout')

  const buttons = new Map<ChartLayoutMenuAction, HTMLButtonElement>()

  for (const row of ROWS) {
    if (row.divided) {
      const sep = document.createElement('div')
      sep.className = 'rw-laymenu__sep'
      sep.setAttribute('role', 'separator')
      root.appendChild(sep)
    }
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'rw-laymenu__btn'
    btn.setAttribute('role', 'menuitem')
    btn.dataset.layAction = row.id
    // No placeholder for iconless rows: the icon shares the labels' left edge rather than
    // sitting in a gutter of its own, so its own label is the one that indents.
    btn.innerHTML = `
      ${row.icon ? `<span class="rw-laymenu__ico" aria-hidden="true">${row.icon}</span>` : ''}
      <span class="rw-laymenu__lbl">${row.label}</span>
      ${row.shortcut ? `<span class="rw-laymenu__key">${row.shortcut}</span>` : '<span></span>'}
    `
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (btn.disabled) return
      close()
      opts.onAction(row.id)
    })
    buttons.set(row.id, btn)
    root.appendChild(btn)
  }

  let menuOpen = false
  let onDocMouseDown: ((e: MouseEvent) => void) | null = null
  let onDocKeyDown: ((e: KeyboardEvent) => void) | null = null
  let onWinResize: (() => void) | null = null

  const anchorDoc = opts.anchor.ownerDocument

  function close() {
    if (!menuOpen) return
    menuOpen = false
    opts.onOpenChange?.(false)
    root.classList.remove('rw-laymenu--open')
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
    syncChartThemeToElement(root)
    document.body.appendChild(root)
    root.classList.add('rw-laymenu--open')
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

    // Deferred so the click that opened the menu does not immediately dismiss it.
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
    setCanSave(canSave) {
      const btn = buttons.get('save')
      if (!btn) return
      btn.disabled = !canSave
      btn.setAttribute('aria-disabled', canSave ? 'false' : 'true')
    },
    dispose: close,
  }
}
