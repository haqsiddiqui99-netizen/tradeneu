import './chartSessionsPopover.css'
import { syncChartThemeToElement } from '../styles/syncChartTheme'

export type ChartSessionsPopoverApi = {
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: () => boolean
  /** Re-render the flags; a no-op while closed. */
  refresh: () => void
  dispose: () => void
}

/**
 * The anchor is the trading-volume pill inside the TradingView iframe, so its rect is in frame
 * coordinates — shift by the frame's own position to land in the parent document.
 */
function positionPanel(anchor: HTMLElement, panel: HTMLElement) {
  const r = anchor.getBoundingClientRect()
  const frame = anchor.ownerDocument.defaultView?.frameElement as HTMLElement | null
  const frameRect = frame?.getBoundingClientRect()
  const offsetLeft = frameRect?.left ?? 0
  const offsetTop = frameRect?.top ?? 0
  const pad = 6
  const w = panel.offsetWidth || 150
  const left = offsetLeft + r.right - w
  panel.style.left = `${Math.max(8, Math.min(left, window.innerWidth - w - 8))}px`
  panel.style.top = `${offsetTop + r.bottom + pad}px`
}

export function createChartSessionsPopover(opts: {
  anchor: HTMLElement
  /** Markup for the four flags, re-read on every open so statuses stay current. */
  getFlagsHtml: () => string
  onOpenChange?: (open: boolean) => void
}): ChartSessionsPopoverApi {
  const root = document.createElement('div')
  root.className = 'rw-sesspop'
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', 'Market sessions')

  let popOpen = false
  let onDocMouseDown: ((e: MouseEvent) => void) | null = null
  let onDocKeyDown: ((e: KeyboardEvent) => void) | null = null
  let onWinResize: (() => void) | null = null

  const anchorDoc = opts.anchor.ownerDocument

  function close() {
    if (!popOpen) return
    popOpen = false
    opts.onOpenChange?.(false)
    root.classList.remove('rw-sesspop--open')
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

  function openPop() {
    if (popOpen) return
    popOpen = true
    root.innerHTML = opts.getFlagsHtml()
    syncChartThemeToElement(root)
    document.body.appendChild(root)
    root.classList.add('rw-sesspop--open')
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
    open: openPop,
    close,
    toggle() {
      if (popOpen) close()
      else openPop()
    },
    isOpen: () => popOpen,
    refresh() {
      if (!popOpen) return
      root.innerHTML = opts.getFlagsHtml()
      positionPanel(opts.anchor, root)
    },
    dispose: close,
  }
}
