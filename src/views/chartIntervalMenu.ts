import './chartIntervalMenu.css'
import { syncChartThemeToElement } from '../styles/syncChartTheme'
import { createCustomIntervalDialog } from './chartCustomIntervalDialog'
import {
  type IntervalKind,
  type IntervalPick,
  type IntervalSection,
} from './chartIntervalCatalog'
import {
  addCustomInterval,
  addFavoriteInterval,
  getEffectiveIntervalSections,
  isFavoriteInterval,
  removeFavoriteInterval,
} from './chartIntervalStore'

export type { IntervalKind, IntervalPick } from './chartIntervalCatalog'

export { REPLAY_DOCK_INTERVALS } from './chartIntervalCatalog'

export type ChartIntervalMenuApi = {
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: () => boolean
  /** Sync favorite star buttons when prefs change outside the menu. */
  refreshPreferences: () => void
  dispose: () => void
}

const ICON_STAR =
  '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6 9.9 5.8l4.4.6-3.2 3.1.75 4.4L8 11.9l-4.85 2.5.75-4.4-3.2-3.1 4.4-.6L8 1.6z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>'
const ICON_STAR_ON =
  '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6 9.9 5.8l4.4.6-3.2 3.1.75 4.4L8 11.9l-4.85 2.5.75-4.4-3.2-3.1 4.4-.6L8 1.6z" fill="currentColor" stroke="currentColor" stroke-width="0.35" stroke-linejoin="round"/></svg>'

/** Defer single-click favorite so double-click-to-unfavorite does not add then remove. */
const FAV_CLICK_DELAY_MS = 250

/** Steps the replay dock list shows before the rest are reached by scrolling. */
const REPLAY_VISIBLE_ROWS = 7

/**
 * Height that shows exactly `rows` steps and cuts the next one off, so the list reads as a fixed
 * window with more below rather than as everything there is. Measured from a rendered row instead
 * of a constant, because the row height follows the menu's type.
 */
function visibleRowsHeight(scroll: HTMLElement, rows: number): number {
  const row = scroll.querySelector<HTMLElement>('.rw-intmenu__btn')
  const rowH = row?.getBoundingClientRect().height ?? 0
  if (!rowH) return 0
  const cs = getComputedStyle(scroll)
  const padding = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom)
  return Math.round(rowH * rows + (Number.isFinite(padding) ? padding : 0))
}

function positionPanel(anchor: HTMLElement, panel: HTMLElement, variant: 'default' | 'replay' = 'default') {
  const r = anchor.getBoundingClientRect()
  const pad = variant === 'replay' ? 6 : 4
  const toolbarClearance = 48
  const edgePad = 8
  const minScrollH = 100
  const panelW = panel.offsetWidth || (variant === 'replay' ? 84 : 154)
  const left =
    variant === 'replay'
      ? r.left + r.width / 2 - panelW / 2
      : r.left
  panel.style.left = `${Math.max(8, Math.min(left, window.innerWidth - panelW - 8))}px`

  const scroll = panel.querySelector<HTMLElement>('.rw-intmenu__scroll')
  panel.style.maxHeight = ''
  if (scroll) scroll.style.maxHeight = ''

  const naturalH = panel.scrollHeight || panel.offsetHeight || 120

  const spaceAbove = Math.max(0, r.top - toolbarClearance - pad)
  const spaceBelow = Math.max(0, window.innerHeight - r.bottom - pad - edgePad)

  let openBelow: boolean
  if (variant === 'replay') {
    // Prefer the side with more room so the menu never covers the replay dock.
    openBelow = spaceBelow > spaceAbove || r.top < window.innerHeight * 0.45
  } else {
    openBelow =
      spaceBelow >= naturalH + pad && (spaceBelow >= spaceAbove || r.top < window.innerHeight * 0.45)
    if (spaceBelow < naturalH + pad && spaceAbove < naturalH + pad) {
      openBelow = spaceBelow >= spaceAbove
    }
  }

  const avail = openBelow ? spaceBelow : spaceAbove
  // Hard-cap to available space so the menu never overlaps the replay bar / toolbar.
  let maxPanelH = avail > 0 ? avail : minScrollH
  if (variant === 'replay' && scroll) {
    // Set here rather than in CSS because the inline height below would override a stylesheet
    // ceiling; a cramped window still wins, since it may not even have room for seven.
    const rowsCap = visibleRowsHeight(scroll, REPLAY_VISIBLE_ROWS)
    if (rowsCap > 0) maxPanelH = Math.min(maxPanelH, rowsCap)
  }
  panel.style.maxHeight = `${maxPanelH}px`
  if (scroll) {
    scroll.style.maxHeight = `${Math.max(48, maxPanelH)}px`
    scroll.scrollTop = 0
  }

  panel.classList.toggle('rw-intmenu--below', openBelow)
  panel.classList.toggle('rw-intmenu--above', !openBelow)

  const h = Math.min(panel.offsetHeight || maxPanelH, maxPanelH)
  if (openBelow) {
    panel.style.top = `${r.bottom + pad}px`
  } else {
    // Sit fully above the anchor with a gap — no overlap with the replay bar.
    panel.style.top = `${Math.max(toolbarClearance, r.top - pad - h)}px`
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
  onPreferencesChange?: () => void
  /** When set, only these rows are shown (no section headers). */
  items?: IntervalPick[]
  /** Dynamic compact list — preferred over `items` when both are set (rebuilds on each open). */
  getItems?: () => IntervalPick[] | null | undefined
  /** `replay` = compact step list under the replay dock pill. */
  variant?: 'default' | 'replay'
  /** Show “Add custom interval…” row (TradingView-style). */
  showCustomInterval?: boolean
  /** Extra documents/elements that should dismiss the menu (e.g. TV iframe / chart). */
  getDismissTargets?: () => Array<Document | EventTarget | null | undefined>
}): ChartIntervalMenuApi {
  const root = document.createElement('div')
  root.className = 'rw-intmenu'
  if (opts.variant === 'replay') root.classList.add('rw-intmenu--replay')
  root.setAttribute('role', 'listbox')
  root.setAttribute('aria-label', opts.variant === 'replay' ? 'Update interval' : 'Chart interval')

  const scroll = document.createElement('div')
  scroll.className = 'rw-intmenu__scroll'
  root.appendChild(scroll)

  const expandedSections = new Set<string>(['seconds', 'minutes'])
  const isCompact =
    Boolean(opts.getItems) || Boolean(opts.items?.length) || opts.variant === 'replay'

  const customIntervalDialog =
    opts.showCustomInterval !== false && !opts.items?.length && !opts.getItems
      ? createCustomIntervalDialog({
          onAdd: (pick) => {
            addCustomInterval(pick)
            opts.onPreferencesChange?.()
            close()
            opts.onSelect(pick)
          },
        })
      : null

  function resolveCompactItems(): IntervalPick[] | null {
    if (opts.getItems) {
      const dyn = opts.getItems()
      if (dyn != null && dyn.length) return dyn
    }
    if (opts.items?.length) return opts.items
    return null
  }

  function ensureExpandedForSelection() {
    const pill = opts.getSelectedPill().trim()
    for (const section of getEffectiveIntervalSections()) {
      if (section.items.some((i) => i.pill === pill)) expandedSections.add(section.id)
    }
    if (!expandedSections.size) expandedSections.add('minutes')
  }

  function syncFavButton(favBtn: HTMLButtonElement, pill: string) {
    const on = isFavoriteInterval(pill)
    favBtn.innerHTML = on ? ICON_STAR_ON : ICON_STAR
    favBtn.classList.toggle('rw-intmenu__act--fav-on', on)
    favBtn.title = on ? 'Double-click to remove from favorites' : 'Add to favorites'
    favBtn.setAttribute('aria-label', favBtn.title)
  }

  function wireFavoriteStar(favBtn: HTMLButtonElement, pill: string) {
    let pendingAddTimer: ReturnType<typeof setTimeout> | null = null

    const clearPendingAdd = () => {
      if (pendingAddTimer != null) {
        clearTimeout(pendingAddTimer)
        pendingAddTimer = null
      }
    }

    favBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      if (isFavoriteInterval(pill)) return
      clearPendingAdd()
      pendingAddTimer = setTimeout(() => {
        pendingAddTimer = null
        if (isFavoriteInterval(pill)) return
        addFavoriteInterval(pill)
        syncFavButton(favBtn, pill)
        notifyPrefs()
      }, FAV_CLICK_DELAY_MS)
    })

    favBtn.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      e.preventDefault()
      clearPendingAdd()
      if (!isFavoriteInterval(pill)) return
      removeFavoriteInterval(pill)
      syncFavButton(favBtn, pill)
      notifyPrefs()
    })
  }

  function syncAllFavButtons() {
    scroll.querySelectorAll<HTMLButtonElement>('.rw-intmenu__act--fav').forEach((favBtn) => {
      const pill = favBtn.closest<HTMLElement>('.rw-intmenu__row')?.dataset.pill ?? ''
      if (pill) syncFavButton(favBtn, pill)
    })
  }

  function notifyPrefs() {
    opts.onPreferencesChange?.()
  }

  function addIntervalRow(item: IntervalPick, body: HTMLElement, withActions: boolean) {
    const row = document.createElement('div')
    row.className = 'rw-intmenu__row'
    row.dataset.pill = item.pill

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'rw-intmenu__btn'
    // The dock lists steps by pill — `1m`, `10m`, `1h`, `1D` — so a row reads the same as the
    // button that opens it and as the chart's own interval. The prose stays as the accessible
    // name, since `1D` alone does not say "day" to a screen reader.
    if (opts.variant === 'replay') {
      btn.textContent = item.pill
      btn.setAttribute('aria-label', item.label)
    } else {
      btn.textContent = item.label
    }
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

    row.appendChild(btn)

    if (withActions) {
      const actions = document.createElement('div')
      actions.className = 'rw-intmenu__row-actions'

      const favBtn = document.createElement('button')
      favBtn.type = 'button'
      favBtn.className = 'rw-intmenu__act rw-intmenu__act--fav'
      syncFavButton(favBtn, item.pill)
      wireFavoriteStar(favBtn, item.pill)

      actions.appendChild(favBtn)
      row.appendChild(actions)
    }

    body.appendChild(row)
  }

  function addButtons(items: IntervalPick[], body: HTMLElement, withActions: boolean) {
    for (const item of items) addIntervalRow(item, body, withActions)
  }

  function buildAccordionSection(section: IntervalSection, withSep: boolean, withActions: boolean) {
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
    addButtons(section.items, body, withActions)

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

  function rebuildMenuContent() {
    scroll.innerHTML = ''

    const compact = resolveCompactItems()
    if (compact?.length) {
      addButtons(compact, scroll, false)
      return
    }

    const withActions = !isCompact

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

    getEffectiveIntervalSections().forEach((section, i) =>
      buildAccordionSection(section, i > 0 || opts.showCustomInterval !== false, withActions),
    )

    syncSectionOpenState()
    syncDisabledAndActive()
  }

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
          ? 'Tick intervals need Dukascopy ticks (session dates) or enough 1-minute history'
          : (pick.stepSec ?? 60) < 60
            ? 'Sub-minute intervals need session dates + ticks, synced second bars, or enough 1-minute history'
            : 'Not enough 1-minute history to build this interval'
    })
  }

  let menuOpen = false
  let onDocMouseDown: ((e: MouseEvent) => void) | null = null
  let onDocKeyDown: ((e: KeyboardEvent) => void) | null = null
  let onWinResize: (() => void) | null = null
  let onWinBlur: (() => void) | null = null
  const dismissCleanups: Array<() => void> = []

  function clearDismissTargets() {
    while (dismissCleanups.length) dismissCleanups.pop()?.()
  }

  function bindDismissTargets() {
    clearDismissTargets()
    const targets = opts.getDismissTargets?.() ?? []
    for (const target of targets) {
      if (!target) continue
      const onPtr = (e: Event) => {
        const t = e.target as Node | null
        // Anchor lives inside chartCanvas/dock — don't treat toggle clicks as "outside".
        if (t && (root.contains(t) || opts.anchor.contains(t))) return
        close()
      }
      target.addEventListener('pointerdown', onPtr, true)
      dismissCleanups.push(() => target.removeEventListener('pointerdown', onPtr, true))
    }
    // Focus entering the TV iframe does not bubble to the host document.
    onWinBlur = () => {
      window.setTimeout(() => {
        if (!menuOpen) return
        const ae = document.activeElement
        if (ae instanceof HTMLIFrameElement) close()
      }, 0)
    }
    window.addEventListener('blur', onWinBlur)
    dismissCleanups.push(() => {
      if (onWinBlur) window.removeEventListener('blur', onWinBlur)
      onWinBlur = null
    })
  }

  function close() {
    if (!menuOpen) return
    menuOpen = false
    opts.onOpenChange?.(false)
    root.classList.remove('rw-intmenu--open', 'rw-intmenu--above', 'rw-intmenu--below')
    root.style.removeProperty('max-height')
    root.style.removeProperty('top')
    root.style.removeProperty('left')
    const scrollEl = root.querySelector<HTMLElement>('.rw-intmenu__scroll')
    if (scrollEl) {
      scrollEl.style.removeProperty('max-height')
      scrollEl.scrollTop = 0
    }
    if (root.parentNode) root.parentNode.removeChild(root)
    clearDismissTargets()
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
    expandedSections.add('minutes')
    rebuildMenuContent()
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
      bindDismissTargets()
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
    refreshPreferences() {
      if (menuOpen) syncAllFavButtons()
    },
    dispose() {
      close()
      customIntervalDialog?.dispose()
    },
  }
}
