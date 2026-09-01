import { icons } from '../icons'
import {
  positionMarkPrice,
  positionUnrealized,
  type ClosedReplayTrade,
  type OpenPosition,
  type PendingOrder,
} from './replayPositions'

export type OrderBookTab = 'open' | 'pending' | 'closed'

export type HistoricalTradesVisualization = 'drawing' | 'arrows'

export type OrderBookSyncInput = {
  asset: string
  provider: string
  positions: OpenPosition[]
  pendingOrders: PendingOrder[]
  closedTrades: ClosedReplayTrade[]
  markPrice: number
  bidAsk: { bid: number; ask: number } | null
}

export type MountReplayOrderBookOpts = {
  formatPrice: (n: number) => string
  formatMoney: (n: number) => string
  onClosePosition: (id: string) => void
  onCancelPendingOrder: (id: string) => void
  onJumpToTime: (timeSec: number) => void
  onOpenJournal: (tradeNum: number) => void
  /** Mark a closed trade's start/end candles on the chart (null clears). */
  onHighlightTrade?: (tradeNum: number | null, mode: HistoricalTradesVisualization) => void
}

const PAGE_SIZES = [10, 25, 50] as const

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatObDateTime(sec: number): string {
  if (!Number.isFinite(sec)) return '—'
  try {
    return new Date(sec * 1000).toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return '—'
  }
}

function naPrice(n: number | null | undefined, fmt: (v: number) => string): string {
  return n == null || !Number.isFinite(n) ? 'N/A' : escapeHtml(fmt(n))
}

function pnlClass(n: number): string {
  if (n > 0) return ' rw-order-book__pnl--up'
  if (n < 0) return ' rw-order-book__pnl--down'
  return ''
}

function sideLabel(direction: OpenPosition['direction']): { text: string; cls: string } {
  return direction === 'long'
    ? { text: 'Buy', cls: 'rw-order-book__side--buy' }
    : { text: 'Sell', cls: 'rw-order-book__side--sell' }
}

function pageSlice<T>(rows: T[], page: number, size: number): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size) || 1)
  const p = Math.min(Math.max(1, page), pages)
  const start = (p - 1) * size
  return { rows: rows.slice(start, start + size), page: p, pages }
}

export function mountReplayOrderBook(root: HTMLElement, opts: MountReplayOrderBookOpts) {
  const STORAGE_KEY = 'rw-ob-historical-viz'
  const loadedMode = localStorage.getItem(STORAGE_KEY) as HistoricalTradesVisualization | null
  let historicalVizMode: HistoricalTradesVisualization =
    loadedMode === 'arrows' || loadedMode === 'drawing' ? loadedMode : 'drawing'

  function saveHistoricalVizMode() {
    try {
      localStorage.setItem(STORAGE_KEY, historicalVizMode)
    } catch {
      /* ignore quota errors */
    }
  }

  let tab: OrderBookTab = 'open'
  let page = 1
  let rowsPerPage: (typeof PAGE_SIZES)[number] = 10
  let menuId: string | null = null
  let highlightedTrade: number | null = null
  let selected = new Set<string>()
  let last: OrderBookSyncInput = {
    asset: '—',
    provider: '',
    positions: [],
    pendingOrders: [],
    closedTrades: [],
    markPrice: 0,
    bidAsk: null,
  }
  let lastSig = ''

  root.innerHTML = `
    <div class="rw-order-book__tabs" role="tablist" aria-label="Positions and orders">
      <button type="button" class="rw-order-book__tab" role="tab" data-rw-ob-tab="open" aria-selected="true">Open Positions</button>
      <button type="button" class="rw-order-book__tab" role="tab" data-rw-ob-tab="pending" aria-selected="false">Pending Orders</button>
      <button type="button" class="rw-order-book__tab" role="tab" data-rw-ob-tab="closed" aria-selected="false">Closed Positions</button>
    </div>
    <div class="rw-order-book__body" data-rw-ob-body></div>
    <div class="rw-order-book__foot" data-rw-ob-foot></div>
  `

  const bodyEl = root.querySelector('[data-rw-ob-body]') as HTMLElement
  const footEl = root.querySelector('[data-rw-ob-foot]') as HTMLElement

  function currentRows(): number {
    if (tab === 'open') return last.positions.length
    if (tab === 'pending') return last.pendingOrders.length
    if (tab === 'closed') return last.closedTrades.length
    return 0
  }

  function signature(data: OrderBookSyncInput): string {
    const pos = data.positions
      .map((p) => `${p.id}:${p.qty}:${p.takeProfit ?? ''}:${p.stopLoss ?? ''}:${p.takeProfitTargets?.filter((target) => !target.filled).length ?? 0}`)
      .join('|')
    const closed = data.closedTrades.length
      ? data.closedTrades
          .map(
            (trade) =>
              `${trade.tradeNum}:${trade.initialStopLoss ?? ''}:${trade.maxTakeProfit ?? ''}:${trade.maxRiskReward ?? ''}`,
          )
          .join('|')
      : '0'
    const pending = data.pendingOrders
      .map((order) => `${order.id}:${order.kind}:${order.qty}:${order.triggerPrice}:${order.stopLoss ?? ''}:${order.takeProfit ?? ''}:${order.takeProfitTargets?.length ?? 0}`)
      .join('|')
    return `${tab}|${page}|${rowsPerPage}|${data.provider}|${data.asset}|${pos}|${pending}|${closed}|${menuId ?? ''}|${selected.size}|${highlightedTrade ?? ''}|${historicalVizMode}`
  }

  function assetLabel(): string {
    const asset = last.asset.trim() || '—'
    const provider = last.provider.trim()
    return escapeHtml(provider ? `${provider}:${asset}` : asset)
  }

  function closeMenu() {
    if (!menuId) return
    menuId = null
    const open = bodyEl.querySelector('.rw-order-book__menu[data-open]')
    if (open) open.removeAttribute('data-open')
  }

  function emptyRow(colspan: number): string {
    return `<tr class="rw-order-book__empty-row"><td colspan="${colspan}"><div class="rw-order-book__empty">No data available</div></td></tr>`
  }

  function renderOpen(): string {
    const { rows, page: p, pages } = pageSlice(last.positions, page, rowsPerPage)
    page = p
    const head = `<thead><tr>
      <th class="rw-order-book__col-menu" scope="col"><span class="rw-order-book__sr">Actions</span></th>
      <th scope="col">Asset</th>
      <th scope="col">Side</th>
      <th scope="col">Size</th>
      <th scope="col">Take Profit</th>
      <th scope="col">Stop Loss</th>
      <th scope="col">Unrealized</th>
      <th scope="col">Realized</th>
      <th scope="col">Commission</th>
    </tr></thead>`
    if (!rows.length) {
      return `<table class="rw-order-book__table">${head}<tbody>${emptyRow(9)}</tbody></table>${pagerHtml(pages)}`
    }
    const body = rows
      .map((pos) => {
        const mark = last.bidAsk
          ? positionMarkPrice(pos.direction, last.bidAsk.bid, last.bidAsk.ask)
          : last.markPrice
        const uPnl = positionUnrealized(pos, mark)
        const side = sideLabel(pos.direction)
        const open = menuId === pos.id ? ' data-open' : ''
        return `<tr data-rw-ob-pos="${escapeHtml(pos.id)}">
          <td class="rw-order-book__col-menu">
            <div class="rw-order-book__menu-wrap">
              <button type="button" class="rw-order-book__more" data-rw-ob-more="${escapeHtml(pos.id)}" aria-label="Position actions" aria-haspopup="menu">${icons.dotsVertical}</button>
              <div class="rw-order-book__menu" role="menu"${open}>
                <button type="button" role="menuitem" data-rw-ob-close="${escapeHtml(pos.id)}">Close position</button>
                <button type="button" role="menuitem" data-rw-ob-jump="${pos.entryTime}">Jump to entry</button>
              </div>
            </div>
          </td>
          <td class="rw-order-book__asset">${assetLabel()}</td>
          <td class="${side.cls}">${side.text}</td>
          <td>${pos.qty} lots</td>
          <td>${pos.takeProfitTargets?.filter((target) => !target.filled).length ? `${pos.takeProfitTargets.filter((target) => !target.filled).length} targets` : naPrice(pos.takeProfit, opts.formatPrice)}</td>
          <td>${naPrice(pos.stopLoss, opts.formatPrice)}</td>
          <td class="rw-order-book__pnl${pnlClass(uPnl)}" data-rw-ob-upnl="${escapeHtml(pos.id)}">${escapeHtml(opts.formatMoney(uPnl))}</td>
          <td>${escapeHtml(opts.formatMoney(0))}</td>
          <td>${escapeHtml(opts.formatMoney(0))}</td>
        </tr>`
      })
      .join('')
    return `<table class="rw-order-book__table">${head}<tbody>${body}</tbody></table>${pagerHtml(pages)}`
  }

  function renderPending(): string {
    const { rows, page: p, pages } = pageSlice(last.pendingOrders, page, rowsPerPage)
    page = p
    const head = `<thead><tr>
      <th class="rw-order-book__col-menu" scope="col"><span class="rw-order-book__sr">Actions</span></th>
      <th scope="col">Asset</th>
      <th scope="col">Side</th>
      <th scope="col">Type</th>
      <th scope="col">Size</th>
      <th scope="col">Entry Price</th>
      <th scope="col">Take Profit</th>
      <th scope="col">Stop Loss</th>
      <th scope="col">Journal</th>
    </tr></thead>`
    if (!rows.length) {
      return `<table class="rw-order-book__table">${head}<tbody>${emptyRow(9)}</tbody></table>${pagerHtml(pages)}`
    }
    const body = rows
      .map((order) => {
        const side = sideLabel(order.direction)
        const open = menuId === order.id ? ' data-open' : ''
        return `<tr data-rw-ob-pending="${escapeHtml(order.id)}">
          <td class="rw-order-book__col-menu">
            <div class="rw-order-book__menu-wrap">
              <button type="button" class="rw-order-book__more" data-rw-ob-more="${escapeHtml(order.id)}" aria-label="Pending order actions" aria-haspopup="menu">${icons.dotsVertical}</button>
              <div class="rw-order-book__menu" role="menu"${open}>
                <button type="button" role="menuitem" data-rw-ob-cancel="${escapeHtml(order.id)}">Cancel order</button>
                <button type="button" role="menuitem" data-rw-ob-jump="${order.createdTime}">Jump to created time</button>
              </div>
            </div>
          </td>
          <td class="rw-order-book__asset">${assetLabel()}</td>
          <td class="${side.cls}">${side.text}</td>
          <td>${order.kind === 'limit' ? 'Limit' : 'Stop'}</td>
          <td>${order.qty} lots</td>
          <td>${escapeHtml(opts.formatPrice(order.triggerPrice))}</td>
          <td>${order.takeProfitTargets?.length ? `${order.takeProfitTargets.length} targets` : naPrice(order.takeProfit, opts.formatPrice)}</td>
          <td>${naPrice(order.stopLoss, opts.formatPrice)}</td>
          <td>—</td>
        </tr>`
      })
      .join('')
    return `<table class="rw-order-book__table">${head}<tbody>${body}</tbody></table>${pagerHtml(pages)}`
  }

  function renderClosed(): string {
    const ordered = [...last.closedTrades].reverse()
    const { rows, page: p, pages } = pageSlice(ordered, page, rowsPerPage)
    page = p
    const allOnPage = rows.length > 0 && rows.every((t) => selected.has(String(t.tradeNum)))
    const vizToggle = `<div class="rw-order-book__historical-viz">
      <label class="rw-order-book__viz-label">Show Historical Trades as</label>
      <div class="rw-order-book__viz-radios">
        <label class="rw-order-book__viz-radio">
          <input type="radio" name="rw-ob-viz" value="drawing" ${historicalVizMode === 'drawing' ? 'checked' : ''} data-rw-ob-viz-mode />
          <span>Position Drawing</span>
        </label>
        <label class="rw-order-book__viz-radio">
          <input type="radio" name="rw-ob-viz" value="arrows" ${historicalVizMode === 'arrows' ? 'checked' : ''} data-rw-ob-viz-mode />
          <span>Arrows</span>
        </label>
      </div>
    </div>`
    const head = `<thead><tr>
      <th class="rw-order-book__col-check" scope="col">
        <input type="checkbox" data-rw-ob-select-all ${allOnPage ? 'checked' : ''} aria-label="Select all on page" />
      </th>
      <th scope="col">Asset</th>
      <th scope="col">Side</th>
      <th scope="col">Date Start</th>
      <th scope="col">Date End</th>
      <th scope="col">Entry</th>
      <th scope="col">Initial SL</th>
      <th scope="col">Max TP</th>
      <th scope="col">Max RR</th>
      <th scope="col">Size</th>
      <th scope="col">Close Avg</th>
      <th scope="col">Realized</th>
      <th scope="col">Commission</th>
      <th scope="col">Journal</th>
    </tr></thead>`
    if (!rows.length) {
      return `${vizToggle}<table class="rw-order-book__table">${head}<tbody>${emptyRow(14)}</tbody></table>${pagerHtml(pages)}`
    }
    const body = rows
      .map((t) => {
        const side = sideLabel(t.direction)
        const id = String(t.tradeNum)
        const checked = selected.has(id) ? 'checked' : ''
        const marked = highlightedTrade === t.tradeNum
        return `<tr data-rw-ob-trade="${id}"${marked ? ' class="rw-order-book__row--marked"' : ''}>
          <td class="rw-order-book__col-check"><input type="checkbox" data-rw-ob-select="${id}" ${checked} aria-label="Select trade ${id}" /></td>
          <td class="rw-order-book__asset">${assetLabel()}</td>
          <td class="${side.cls}">${side.text}</td>
          <td><button type="button" class="rw-order-book__link" data-rw-ob-mark="${id}" title="Mark this trade on the chart" aria-pressed="${marked ? 'true' : 'false'}">${escapeHtml(formatObDateTime(t.entryTime))}</button></td>
          <td>${escapeHtml(formatObDateTime(t.exitTime))}</td>
          <td>${escapeHtml(opts.formatPrice(t.entryPrice))}</td>
          <td>${naPrice(t.initialStopLoss, opts.formatPrice)}</td>
          <td>${naPrice(t.maxTakeProfit, opts.formatPrice)}</td>
          <td>${t.maxRiskReward == null || !Number.isFinite(t.maxRiskReward) ? 'N/A' : `${t.maxRiskReward.toFixed(2)}R`}</td>
          <td>${t.qty} lots</td>
          <td>${escapeHtml(opts.formatPrice(t.exitPrice))}</td>
          <td class="rw-order-book__pnl${pnlClass(t.pnl)}">${escapeHtml(opts.formatMoney(t.pnl))}</td>
          <td>${escapeHtml(opts.formatMoney(0))}</td>
          <td><button type="button" class="rw-order-book__journal-btn" data-rw-ob-journal="${id}">↗ Journal</button></td>
        </tr>`
      })
      .join('')
    return `${vizToggle}<table class="rw-order-book__table">${head}<tbody>${body}</tbody></table>${pagerHtml(pages)}`
  }

  function pagerHtml(pages: number): string {
    const prevDisabled = page <= 1 ? 'disabled' : ''
    const nextDisabled = page >= pages ? 'disabled' : ''
    const sizeOpts = PAGE_SIZES.map(
      (n) => `<option value="${n}"${n === rowsPerPage ? ' selected' : ''}>${n}</option>`,
    ).join('')
    const pageOpts = Array.from({ length: pages }, (_, i) => {
      const n = i + 1
      return `<option value="${n}"${n === page ? ' selected' : ''}>${n}</option>`
    }).join('')
    return `<div class="rw-order-book__pager">
      <label class="rw-order-book__pager-size">Rows per page
        <select data-rw-ob-page-size aria-label="Rows per page">${sizeOpts}</select>
      </label>
      <div class="rw-order-book__pager-nav">
        <button type="button" class="rw-order-book__page-btn" data-rw-ob-page="prev" ${prevDisabled} aria-label="Previous page">${icons.chartNavLeft}</button>
        <label class="rw-order-book__pager-page">
          <select data-rw-ob-page-jump aria-label="Page">${pageOpts}</select>
          <span>of ${pages}</span>
        </label>
        <button type="button" class="rw-order-book__page-btn" data-rw-ob-page="next" ${nextDisabled} aria-label="Next page">${icons.chartNavRight}</button>
      </div>
    </div>`
  }

  function paintTabs() {
    root.querySelectorAll<HTMLButtonElement>('[data-rw-ob-tab]').forEach((btn) => {
      const on = btn.dataset.rwObTab === tab
      btn.setAttribute('aria-selected', on ? 'true' : 'false')
    })
  }

  function fullRender() {
    paintTabs()
    const table =
      tab === 'open' ? renderOpen() : tab === 'pending' ? renderPending() : renderClosed()
    const wrapEnd = table.indexOf('</table>')
    const tableHtml = wrapEnd >= 0 ? table.slice(0, wrapEnd + 8) : table
    const pager = wrapEnd >= 0 ? table.slice(wrapEnd + 8) : ''
    bodyEl.innerHTML = tableHtml
    footEl.innerHTML = pager
    lastSig = signature(last)
  }

  function patchUnrealized() {
    last.positions.forEach((pos) => {
      const cell = bodyEl.querySelector(`[data-rw-ob-upnl="${CSS.escape(pos.id)}"]`)
      if (!cell) return
      const mark = last.bidAsk
        ? positionMarkPrice(pos.direction, last.bidAsk.bid, last.bidAsk.ask)
        : last.markPrice
      const uPnl = positionUnrealized(pos, mark)
      cell.textContent = opts.formatMoney(uPnl)
      cell.classList.toggle('rw-order-book__pnl--up', uPnl > 0)
      cell.classList.toggle('rw-order-book__pnl--down', uPnl < 0)
    })
  }

  function sync(data: OrderBookSyncInput) {
    last = data
    const pages = Math.max(1, Math.ceil(currentRows() / rowsPerPage) || 1)
    if (page > pages) page = pages
    const sig = signature(data)
    if (sig === lastSig) {
      if (tab === 'open') patchUnrealized()
      return
    }
    fullRender()
  }

  function onRootClick(ev: Event) {
    const t = ev.target as HTMLElement | null
    if (!t) return
    const tabBtn = t.closest<HTMLElement>('[data-rw-ob-tab]')
    if (tabBtn?.dataset.rwObTab) {
      const next = tabBtn.dataset.rwObTab as OrderBookTab
      if (next === tab) return
      tab = next
      page = 1
      menuId = null
      fullRender()
      return
    }
    const more = t.closest<HTMLElement>('[data-rw-ob-more]')
    if (more?.dataset.rwObMore) {
      ev.stopPropagation()
      const id = more.dataset.rwObMore
      menuId = menuId === id ? null : id
      fullRender()
      return
    }
    const closeBtn = t.closest<HTMLElement>('[data-rw-ob-close]')
    if (closeBtn?.dataset.rwObClose) {
      menuId = null
      opts.onClosePosition(closeBtn.dataset.rwObClose)
      return
    }
    const cancelBtn = t.closest<HTMLElement>('[data-rw-ob-cancel]')
    if (cancelBtn?.dataset.rwObCancel) {
      menuId = null
      opts.onCancelPendingOrder(cancelBtn.dataset.rwObCancel)
      return
    }
    const mark = t.closest<HTMLElement>('[data-rw-ob-mark]')
    if (mark?.dataset.rwObMark) {
      const tradeNum = Number(mark.dataset.rwObMark)
      const clearing = highlightedTrade === tradeNum
      highlightedTrade = clearing ? null : tradeNum
      // No replay seek here: rewinding the cursor would drop the very candles the
      // highlight spans. The chart pans to the trade instead.
      opts.onHighlightTrade?.(highlightedTrade, historicalVizMode)
      fullRender()
      return
    }
    const jump = t.closest<HTMLElement>('[data-rw-ob-jump]')
    if (jump?.dataset.rwObJump) {
      const sec = Number(jump.dataset.rwObJump)
      if (Number.isFinite(sec)) opts.onJumpToTime(sec)
      return
    }
    const journal = t.closest<HTMLElement>('[data-rw-ob-journal]')
    if (journal?.dataset.rwObJournal) {
      opts.onOpenJournal(Number(journal.dataset.rwObJournal))
      return
    }
    const pageBtn = t.closest<HTMLElement>('[data-rw-ob-page]')
    if (pageBtn?.dataset.rwObPage) {
      if (pageBtn.hasAttribute('disabled')) return
      page += pageBtn.dataset.rwObPage === 'next' ? 1 : -1
      fullRender()
      return
    }
    if (!t.closest('.rw-order-book__menu-wrap')) closeMenu()
  }

  function onChange(ev: Event) {
    const t = ev.target as HTMLElement | null
    if (!t) return
    if (t.matches('[data-rw-ob-viz-mode]')) {
      const radio = t as HTMLInputElement
      const mode = radio.value as HistoricalTradesVisualization
      if (mode === 'drawing' || mode === 'arrows') {
        historicalVizMode = mode
        saveHistoricalVizMode()
        if (highlightedTrade != null) {
          opts.onHighlightTrade?.(highlightedTrade, historicalVizMode)
        }
        fullRender()
      }
      return
    }
    if (t.matches('[data-rw-ob-page-size]')) {
      const n = Number((t as HTMLSelectElement).value)
      rowsPerPage = (PAGE_SIZES as readonly number[]).includes(n)
        ? (n as (typeof PAGE_SIZES)[number])
        : 10
      page = 1
      fullRender()
      return
    }
    if (t.matches('[data-rw-ob-page-jump]')) {
      page = Math.max(1, Number((t as HTMLSelectElement).value) || 1)
      fullRender()
      return
    }
    if (t.matches('[data-rw-ob-select-all]')) {
      const on = (t as HTMLInputElement).checked
      const ids = [...last.closedTrades]
        .reverse()
        .slice((page - 1) * rowsPerPage, page * rowsPerPage)
        .map((tr) => String(tr.tradeNum))
      if (on) ids.forEach((id) => selected.add(id))
      else ids.forEach((id) => selected.delete(id))
      fullRender()
      return
    }
    const sel = t.closest<HTMLInputElement>('[data-rw-ob-select]')
    if (sel?.dataset.rwObSelect) {
      if (sel.checked) selected.add(sel.dataset.rwObSelect)
      else selected.delete(sel.dataset.rwObSelect)
    }
  }

  function onDocClick(ev: Event) {
    const t = ev.target as Node | null
    if (t && root.contains(t)) return
    closeMenu()
  }

  root.addEventListener('click', onRootClick)
  root.addEventListener('change', onChange)
  document.addEventListener('click', onDocClick)

  fullRender()

  return {
    sync,
    selectTab(next: OrderBookTab) {
      tab = next
      page = 1
      menuId = null
      fullRender()
    },
    destroy() {
      root.removeEventListener('click', onRootClick)
      root.removeEventListener('change', onChange)
      document.removeEventListener('click', onDocClick)
    },
  }
}
