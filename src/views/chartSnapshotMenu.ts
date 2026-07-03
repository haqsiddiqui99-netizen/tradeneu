import './chartSnapshotMenu.css'
import { syncChartThemeToElement } from '../styles/syncChartTheme'

export type ChartSnapshotAction = 'download' | 'copy-image' | 'copy-link' | 'open-tab'

export type ChartSnapshotMenuApi = {
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: () => boolean
  dispose: () => void
}

type MenuRow = {
  id: ChartSnapshotAction
  label: string
  icon: string
  shortcut?: string
}

const ICO_DOWNLOAD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M8.5 11.5 12 15l3.5-3.5"/><path d="M5 19h14"/></svg>`
const ICO_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"><rect x="8" y="8" width="11" height="11" rx="1.25"/><path d="M6 16V6a2 2 0 012-2h10"/></svg>`
const ICO_LINK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"><path d="M10 14a4 4 0 005.66 0l2.34-2.34a4 4 0 00-5.66-5.66L11 7"/><path d="M14 10a4 4 0 00-5.66 0L6 12.34a4 4 0 105.66 5.66L13 17"/></svg>`
const ICO_OPEN_TAB = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M14 5h5v5"/><path d="M10 14 19 5"/><path d="M19 14v4a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4"/></svg>`

const ROWS: MenuRow[] = [
  { id: 'download', label: 'Download image', icon: ICO_DOWNLOAD, shortcut: 'Ctrl + Alt + S' },
  { id: 'copy-image', label: 'Copy image', icon: ICO_COPY, shortcut: 'Ctrl + Shift + S' },
  { id: 'copy-link', label: 'Copy link', icon: ICO_LINK, shortcut: 'Alt + S' },
  { id: 'open-tab', label: 'Open in new tab', icon: ICO_OPEN_TAB },
]

function positionPanel(anchor: HTMLElement, panel: HTMLElement) {
  const r = anchor.getBoundingClientRect()
  const pad = 4
  const w = panel.offsetWidth || 248
  const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))
  panel.style.left = `${left}px`
  panel.style.top = `${r.bottom + pad}px`
}

export function createChartSnapshotMenu(opts: {
  anchor: HTMLElement
  onAction: (action: ChartSnapshotAction) => void
  onOpenChange?: (open: boolean) => void
}): ChartSnapshotMenuApi {
  const root = document.createElement('div')
  root.className = 'rw-snapmenu'
  root.setAttribute('role', 'menu')
  root.setAttribute('aria-label', 'Chart snapshot')

  const head = document.createElement('p')
  head.className = 'rw-snapmenu__head'
  head.textContent = 'Chart snapshot'
  root.appendChild(head)

  for (const row of ROWS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'rw-snapmenu__btn'
    btn.setAttribute('role', 'menuitem')
    btn.dataset.snapAction = row.id
    btn.innerHTML = `
      <span class="rw-snapmenu__ico" aria-hidden="true">${row.icon}</span>
      <span class="rw-snapmenu__lbl">${row.label}</span>
      ${row.shortcut ? `<span class="rw-snapmenu__key">${row.shortcut}</span>` : '<span></span>'}
    `
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      opts.onAction(row.id)
      close()
    })
    root.appendChild(btn)
  }

  let menuOpen = false
  let onDocMouseDown: ((e: MouseEvent) => void) | null = null
  let onDocKeyDown: ((e: KeyboardEvent) => void) | null = null
  let onWinResize: (() => void) | null = null

  function close() {
    if (!menuOpen) return
    menuOpen = false
    opts.onOpenChange?.(false)
    root.classList.remove('rw-snapmenu--open')
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
    syncChartThemeToElement(root)
    document.body.appendChild(root)
    root.classList.add('rw-snapmenu--open')
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
  }
}
