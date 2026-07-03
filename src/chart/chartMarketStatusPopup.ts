import './chartMarketStatusPopup.css'
import { getMarketSession, type MarketSessionInfo } from './marketSessionStatus'

export type ChartMarketStatusPopupApi = {
  open: () => void
  close: () => void
  toggle: () => void
  refresh: () => void
  dispose: () => void
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderPopup(el: HTMLElement, info: MarketSessionInfo): void {
  const openCls = info.isOpen ? 'open' : 'closed'
  const fillWidth = info.isOpen ? Math.round(info.progressPct) : 0
  const needleLeft = info.isOpen ? Math.min(98, Math.max(2, fillWidth)) : 0
  el.innerHTML = `
    <div class="rw-market-status-pop__head rw-market-status-pop__head--${openCls}">
      <span class="rw-market-status-pop__dot rw-market-status-pop__dot--${openCls}" aria-hidden="true"></span>
      <span>${escapeHtml(info.headline)}</span>
    </div>
    <p class="rw-market-status-pop__detail">${escapeHtml(info.detail)}</p>
    <div class="rw-market-status-pop__timeline" aria-hidden="true">
      <span class="rw-market-status-pop__day">${escapeHtml(info.dayLabel)}</span>
      <div class="rw-market-status-pop__track">
        <div class="rw-market-status-pop__fill rw-market-status-pop__fill--${openCls}" style="width:${fillWidth}%"></div>
        <span class="rw-market-status-pop__needle" style="left:${needleLeft}%"></span>
      </div>
      <span class="rw-market-status-pop__close-lbl">${info.closeTimeLabel ? escapeHtml(info.closeTimeLabel) : '—'}</span>
    </div>
    <p class="rw-market-status-pop__tz">${escapeHtml(info.exchangeTzLabel)}</p>
  `
}

export function mountChartMarketStatusPopup(opts: {
  getAnchor: () => HTMLElement | null
  getSymbol: () => string
}): ChartMarketStatusPopupApi {
  const pop = document.createElement('div')
  pop.className = 'rw-market-status-pop'
  pop.setAttribute('role', 'dialog')
  pop.setAttribute('aria-label', 'Market hours')
  pop.hidden = true
  document.body.appendChild(pop)

  let open = false

  function position() {
    const anchor = opts.getAnchor()
    if (!anchor || pop.hidden) return
    const rect = anchor.getBoundingClientRect()
    const margin = 8
    let left = rect.left
    let top = rect.bottom + margin
    const w = pop.offsetWidth
    const h = pop.offsetHeight
    if (left + w > window.innerWidth - margin) left = window.innerWidth - w - margin
    if (left < margin) left = margin
    if (top + h > window.innerHeight - margin) top = rect.top - h - margin
    pop.style.left = `${Math.round(left)}px`
    pop.style.top = `${Math.round(top)}px`
  }

  function refresh() {
    renderPopup(pop, getMarketSession(opts.getSymbol()))
    if (open) position()
  }

  function closePopup() {
    if (!open) return
    open = false
    pop.hidden = true
    opts.getAnchor()?.setAttribute('aria-expanded', 'false')
  }

  function openPopup() {
    refresh()
    open = true
    pop.hidden = false
    opts.getAnchor()?.setAttribute('aria-expanded', 'true')
    position()
  }

  const onDocClick = (e: MouseEvent) => {
    if (!open) return
    const t = e.target as Node
    if (pop.contains(t) || opts.getAnchor()?.contains(t)) return
    closePopup()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePopup()
  }

  const onResize = () => position()

  document.addEventListener('mousedown', onDocClick)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)

  return {
    open: openPopup,
    close: closePopup,
    toggle() {
      if (open) closePopup()
      else openPopup()
    },
    refresh,
    dispose() {
      closePopup()
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      pop.remove()
    },
  }
}
