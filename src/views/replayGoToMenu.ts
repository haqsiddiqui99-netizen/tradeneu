import './replayGoToMenu.css'
import { syncChartThemeToElement } from '../styles/syncChartTheme'
import { icons } from '../icons'
import type { ReplayGoToTarget } from '../playback/replayGoTo'

export type ReplayGoToMenuItem = {
  id: ReplayGoToTarget | 'custom'
  label: string
  shortcut?: string
}

type ReplayGoToMenuSection = {
  label: string
  items: ReplayGoToMenuItem[]
}

const REPLAY_GOTO_MENU_SECTIONS: ReplayGoToMenuSection[] = [
  {
    label: 'Jump ahead',
    items: [
      { id: 'next_day_open', label: 'Next Day Open', shortcut: 'Y' },
      { id: 'next_session', label: 'Next Session', shortcut: 'Z' },
    ],
  },
  {
    label: 'Session opens',
    items: [
      { id: 'newyork', label: 'New York Session', shortcut: 'N' },
      { id: 'asian', label: 'Asian/Tokyo Session', shortcut: 'I' },
      { id: 'london', label: 'London Session', shortcut: 'L' },
      { id: 'sydney', label: 'Sydney Session', shortcut: 'S' },
    ],
  },
]

const REPLAY_GOTO_FOOTER_ITEM: ReplayGoToMenuItem = { id: 'custom', label: 'Custom Settings' }

export const REPLAY_GOTO_MENU_ITEMS: ReplayGoToMenuItem[] = [
  ...REPLAY_GOTO_MENU_SECTIONS.flatMap((section) => section.items),
  REPLAY_GOTO_FOOTER_ITEM,
]

export type ReplayGoToMenuApi = {
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: () => boolean
  dispose: () => void
  /** Recompute the per-item time hints (cursor moves between opens). */
  refreshHints: () => void
}

function positionPanel(anchor: HTMLElement, panel: HTMLElement) {
  const r = anchor.getBoundingClientRect()
  const frame = anchor.ownerDocument.defaultView?.frameElement as HTMLElement | null
  const frameRect = frame?.getBoundingClientRect()
  const offsetLeft = frameRect?.left ?? 0
  const offsetTop = frameRect?.top ?? 0
  const pad = 6
  const w = panel.offsetWidth || 220
  const left = offsetLeft + r.left + r.width / 2 - w / 2
  panel.style.left = `${Math.max(8, Math.min(left, window.innerWidth - w - 8))}px`
  panel.style.top = `${offsetTop + r.bottom + pad}px`
}

export function createReplayGoToMenu(opts: {
  anchor: HTMLElement
  onSelect: (id: ReplayGoToTarget | 'custom') => void
  onOpenChange?: (open: boolean) => void
  /** UTC offset for named session rows (e.g. `UTC+10:00`). */
  hintFor?: (id: ReplayGoToTarget) => string | null
}): ReplayGoToMenuApi {
  const root = document.createElement('div')
  root.className = 'rw-goto-menu'
  root.setAttribute('role', 'menu')
  root.setAttribute('aria-label', 'Go to')

  const hintNodes = new Map<ReplayGoToTarget, HTMLElement>()

  const createItemButton = (item: ReplayGoToMenuItem, leadingIconHtml?: string) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'rw-goto-menu__btn'
    btn.setAttribute('role', 'menuitem')
    btn.dataset.gotoId = item.id
    const isNamedSession =
      item.id === 'newyork' || item.id === 'asian' || item.id === 'london' || item.id === 'sydney'
    btn.innerHTML = `${
      leadingIconHtml ? `<span class="rw-goto-menu__icon" aria-hidden="true">${leadingIconHtml}</span>` : ''
    }<span class="rw-goto-menu__label">${item.label}</span>${
      isNamedSession ? '<span class="rw-goto-menu__hint"></span>' : ''
    }${
      item.shortcut
        ? `<kbd class="rw-goto-menu__key" aria-hidden="true">${item.shortcut}</kbd>`
        : ''
    }`
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      opts.onSelect(item.id)
      close()
    })
    const hint = btn.querySelector<HTMLElement>('.rw-goto-menu__hint')
    if (hint && item.id !== 'custom') hintNodes.set(item.id, hint)
    return btn
  }

  for (const section of REPLAY_GOTO_MENU_SECTIONS) {
    const group = document.createElement('div')
    group.className = 'rw-goto-menu__group'
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', section.label)

    const heading = document.createElement('div')
    heading.className = 'rw-goto-menu__grouplabel'
    heading.textContent = section.label
    group.appendChild(heading)

    for (const item of section.items) group.appendChild(createItemButton(item))
    root.appendChild(group)
  }

  const footer = document.createElement('div')
  footer.className = 'rw-goto-menu__footer'
  footer.appendChild(createItemButton(REPLAY_GOTO_FOOTER_ITEM, icons.gear))
  root.appendChild(footer)

  function refreshHints() {
    for (const [id, node] of hintNodes) {
      node.textContent = opts.hintFor?.(id) ?? ''
    }
  }

  refreshHints()

  document.body.appendChild(root)
  syncChartThemeToElement(root)

  let open = false

  function setOpen(v: boolean) {
    if (open === v) return
    open = v
    if (open) {
      syncChartThemeToElement(root)
      refreshHints()
    }
    root.classList.toggle('rw-goto-menu--open', open)
    opts.anchor.setAttribute('aria-expanded', open ? 'true' : 'false')
    opts.anchor.classList.toggle('rw-replay-dock__action--goto-open', open)
    opts.anchor.classList.toggle('rw-tv-header-btn--goto-open', open)
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
  const anchorDocument = opts.anchor.ownerDocument
  if (anchorDocument !== document) anchorDocument.addEventListener('pointerdown', onDocPointer, true)
  document.addEventListener('keydown', onKey, true)
  if (anchorDocument !== document) anchorDocument.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', onResize)

  function dispose() {
    document.removeEventListener('pointerdown', onDocPointer, true)
    if (anchorDocument !== document) anchorDocument.removeEventListener('pointerdown', onDocPointer, true)
    document.removeEventListener('keydown', onKey, true)
    if (anchorDocument !== document) anchorDocument.removeEventListener('keydown', onKey, true)
    window.removeEventListener('resize', onResize)
    close()
    root.remove()
  }

  return { open: openMenu, close, toggle, isOpen, dispose, refreshHints }
}
