import './replayGoToMenu.css'
import { syncChartThemeToElement } from '../styles/syncChartTheme'
import type { ReplayGoToTarget } from '../playback/replayGoTo'

export type ReplayGoToMenuItem = {
  id: ReplayGoToTarget | 'custom'
  label: string
  shortcut?: string
}

export const REPLAY_GOTO_MENU_ITEMS: ReplayGoToMenuItem[] = [
  { id: 'next_day_open', label: 'Next Day Open', shortcut: 'Y' },
  { id: 'next_session', label: 'Next Session', shortcut: 'Z' },
  { id: 'asian', label: 'Asian Session', shortcut: 'I' },
  { id: 'london', label: 'London Session', shortcut: 'L' },
  { id: 'newyork', label: 'New York Session', shortcut: 'N' },
  { id: 'custom', label: 'Custom Settings' },
]

export type ReplayGoToMenuApi = {
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: () => boolean
  dispose: () => void
}

function positionPanel(anchor: HTMLElement, panel: HTMLElement) {
  const r = anchor.getBoundingClientRect()
  const pad = 6
  const w = panel.offsetWidth || 220
  const left = r.left + r.width / 2 - w / 2
  panel.style.left = `${Math.max(8, Math.min(left, window.innerWidth - w - 8))}px`
  panel.style.top = `${r.bottom + pad}px`
}

export function createReplayGoToMenu(opts: {
  anchor: HTMLElement
  onSelect: (id: ReplayGoToTarget | 'custom') => void
  onOpenChange?: (open: boolean) => void
}): ReplayGoToMenuApi {
  const root = document.createElement('div')
  root.className = 'rw-goto-menu'
  root.setAttribute('role', 'menu')
  root.setAttribute('aria-label', 'Go to')

  for (const item of REPLAY_GOTO_MENU_ITEMS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'rw-goto-menu__btn'
    btn.setAttribute('role', 'menuitem')
    btn.dataset.gotoId = item.id
    btn.innerHTML = `<span class="rw-goto-menu__label">${item.label}</span>${
      item.shortcut
        ? `<span class="rw-goto-menu__key" aria-hidden="true">${item.shortcut}</span>`
        : ''
    }`
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      opts.onSelect(item.id)
      close()
    })
    root.appendChild(btn)
  }

  document.body.appendChild(root)
  syncChartThemeToElement(root)

  let open = false

  function setOpen(v: boolean) {
    if (open === v) return
    open = v
    if (open) syncChartThemeToElement(root)
    root.classList.toggle('rw-goto-menu--open', open)
    opts.anchor.setAttribute('aria-expanded', open ? 'true' : 'false')
    opts.anchor.classList.toggle('rw-replay-dock__action--goto-open', open)
    opts.onOpenChange?.(open)
    if (open) positionPanel(opts.anchor, root)
  }

  function close() {
    setOpen(false)
  }

  function openMenu() {
    setOpen(true)
  }

  function toggle() {
    setOpen(!open)
  }

  function isOpen() {
    return open
  }

  const onDocPointer = (e: PointerEvent) => {
    if (!open) return
    const t = e.target as Node
    if (root.contains(t) || opts.anchor.contains(t)) return
    close()
  }

  const onKey = (e: KeyboardEvent) => {
    if (!open) return
    if (e.code === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  const onResize = () => {
    if (open) positionPanel(opts.anchor, root)
  }

  document.addEventListener('pointerdown', onDocPointer, true)
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', onResize)

  function dispose() {
    document.removeEventListener('pointerdown', onDocPointer, true)
    document.removeEventListener('keydown', onKey, true)
    window.removeEventListener('resize', onResize)
    close()
    root.remove()
  }

  return { open: openMenu, close, toggle, isOpen, dispose }
}
