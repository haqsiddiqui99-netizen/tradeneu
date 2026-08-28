import './chartPositionOverlay.css'
import type { IChartApi, IPriceLine, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { LineStyle } from 'lightweight-charts'
import type { OpenPosition, PendingOrder } from '../replay/replayPositions'
import { positionMarkPrice, positionPoints, positionUnrealized } from '../replay/replayPositions'

type LineBundle = {
  entry: IPriceLine
  tp: IPriceLine | null
  sl: IPriceLine | null
}

type DomLineBundle = {
  entry: HTMLElement
  tp: HTMLElement | null
  sl: HTMLElement | null
}

type DragLineBundle = {
  tp: HTMLElement | null
  sl: HTMLElement | null
}

type ExitRowBundle = {
  tp: HTMLElement | null
  sl: HTMLElement | null
}

type ExitKind = 'tp' | 'sl'

export type ChartPositionOverlayHandle = {
  sync: (opts?: { recreateLines?: boolean }) => void
  /** Hide all DOM lines/badges (e.g. when TradingView draws native position lines). */
  setSuppressed: (suppressed: boolean) => void
  /** When true, skip DOM dashed lines (TV shapes own them) but keep PnL badges. */
  setSkipDomLines: (skip: boolean) => void
  dispose: () => void
}

/**
 * Open-position entry/TP/SL lines + chip row.
 * - Lightweight Charts: native price lines
 * - TradingView (or other): DOM dashed lines via `priceToHostY`
 */
export function mountChartPositionOverlay(opts: {
  chartHost: HTMLElement
  /** Lightweight Charts path */
  chart?: IChartApi
  getSeries?: () => ISeriesApi<SeriesType, Time>
  getSeriesDataRevision?: () => number
  /**
   * Host-relative Y for a price (TradingView / DOM path).
   * When set, skips LWC createPriceLine and draws dashed DOM lines.
   */
  priceToHostY?: (price: number) => number | null
  /** Override renderer selection when priceToHostY is supplied only for drag coordinates. */
  useDomLines?: boolean
  /** Price for a host-relative Y coordinate; enables TP/SL dragging. */
  hostYToPrice?: (hostY: number) => number | null
  /** Left/right inset for DOM horizontal lines (plot area). */
  getPlotHorizontalInsets?: () => { left: number; right: number } | null
  /** Reject badge Y above this (avoids pinning into TV header chrome). */
  getMinPlotY?: () => number
  getBottomInset?: () => number
  getPositions: () => OpenPosition[]
  getPendingOrders?: () => PendingOrder[]
  /** Mid/last (used as fallback). Prefer getBidAsk for FXReplay-style points. */
  getMarkPrice: () => number
  /** Bid/ask for mark-to-market (long→bid, short→ask). */
  getBidAsk?: () => { bid: number; ask: number } | null
  /** Unix time of the replay cursor / last revealed bar — anchors UI in future whitespace. */
  getAnchorTime: () => number | null
  /** Optional: host X for chip anchoring (TV). Falls back to mid-plot. */
  anchorTimeToHostX?: (timeSec: number) => number | null
  formatMoney: (n: number) => string
  onClose: (id: string) => void
  onToggleTakeProfit?: (id: string) => void
  onToggleStopLoss?: (id: string) => void
  onSetTakeProfit?: (id: string, price: number) => boolean
  onSetStopLoss?: (id: string, price: number) => boolean
  /** Re-layout when scales change (TV subscribeTimeScaleChange). */
  subscribeScaleChange?: (cb: () => void) => () => void
}): ChartPositionOverlayHandle {
  const useDomLines = opts.useDomLines ?? typeof opts.priceToHostY === 'function'
  const overlay = document.createElement('div')
  overlay.className = 'rw-pos-overlay'
  overlay.setAttribute('aria-live', 'polite')
  opts.chartHost.appendChild(overlay)

  const lineMap = new Map<string, LineBundle>()
  const domLineMap = new Map<string, DomLineBundle>()
  const dragLineMap = new Map<string, DragLineBundle>()
  const exitRowMap = new Map<string, ExitRowBundle>()
  const rowMap = new Map<string, HTMLElement>()
  const pendingLineMap = new Map<string, HTMLElement>()
  let lastSeriesDataRevision = -1
  let suppressed = false
  let skipDomLines = false
  let activeDragKey: string | null = null

  const exitColor = (kind: ExitKind) => (kind === 'tp' ? '#089981' : '#f7931a')
  let previewEl: HTMLElement | null = null
  let tipEl: HTMLElement | null = null
  let activeDetachKey: string | null = null
  let suppressChipClick = false

  /** Drag Y stays inside the plot so a dropped price is always resolvable. */
  function clampDragY(clientY: number): number {
    const hostRect = opts.chartHost.getBoundingClientRect()
    const minY = opts.getMinPlotY?.() ?? 0
    const maxY = hostRect.height - (opts.getBottomInset?.() ?? 0)
    return Math.max(minY, Math.min(maxY, clientY - hostRect.top))
  }

  /** Dark hover tooltip (FXReplay style) anchored above the hovered control. */
  function showTip(anchor: HTMLElement, text: string) {
    if (!tipEl) {
      tipEl = document.createElement('div')
      tipEl.className = 'rw-pos-tip'
      tipEl.setAttribute('role', 'tooltip')
      overlay.appendChild(tipEl)
    }
    tipEl.textContent = text
    tipEl.hidden = false
    tipEl.classList.remove('rw-pos-tip--below')
    const hostRect = opts.chartHost.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    const tipRect = tipEl.getBoundingClientRect()
    const left = Math.max(
      4,
      Math.min(
        hostRect.width - tipRect.width - 4,
        anchorRect.left - hostRect.left + anchorRect.width / 2 - tipRect.width / 2,
      ),
    )
    let top = anchorRect.top - hostRect.top - tipRect.height - 9
    if (top < 4) {
      top = anchorRect.bottom - hostRect.top + 9
      tipEl.classList.add('rw-pos-tip--below')
    }
    tipEl.style.left = `${left}px`
    tipEl.style.top = `${top}px`
  }

  function hideTip() {
    if (tipEl) tipEl.hidden = true
  }

  function attachTip(el: HTMLElement, getText: () => string) {
    el.addEventListener('pointerenter', () => showTip(el, getText()))
    el.addEventListener('pointerleave', hideTip)
    el.addEventListener('pointerdown', hideTip)
  }

  /** Distance from entry in pips (0.001 price steps), matching the badge's points scale. */
  function pipsFromEntry(posId: string, price: number | null | undefined): number {
    if (price == null || !Number.isFinite(price)) return 0
    const pos = opts.getPositions().find((p) => p.id === posId)
    if (!pos) return 0
    return Math.abs(Math.round((price - pos.entryPrice) * 1000))
  }

  function exitTipText(posId: string, kind: ExitKind): string {
    const pos = opts.getPositions().find((p) => p.id === posId)
    const price = kind === 'tp' ? pos?.takeProfit : pos?.stopLoss
    const pips = pipsFromEntry(posId, price)
    return `${kind === 'tp' ? 'Take Profit' : 'Stop Loss'}, ${pips} pips`
  }

  /** Ghost line that follows the cursor while a TP/SL chip is dragged off the order badge. */
  function showPreview(kind: ExitKind, y: number, price: number | null) {
    if (!previewEl) {
      previewEl = document.createElement('div')
      previewEl.className = 'rw-pos-preview'
      previewEl.innerHTML = '<span class="rw-pos-preview__label"></span>'
      overlay.appendChild(previewEl)
    }
    const color = exitColor(kind)
    previewEl.style.setProperty('--rw-pos-exit-color', color)
    const insets = opts.getPlotHorizontalInsets?.() ?? null
    previewEl.style.left = `${insets?.left ?? 0}px`
    previewEl.style.right = `${insets?.right ?? 56}px`
    previewEl.style.top = `${y}px`
    previewEl.hidden = false
    const label = previewEl.querySelector('.rw-pos-preview__label') as HTMLElement | null
    if (label) {
      const priceText = price != null && Number.isFinite(price) ? price.toFixed(3) : '—'
      label.textContent = `${kind === 'tp' ? 'TP' : 'SL'} ${priceText}`
    }
  }

  function hidePreview() {
    if (previewEl) previewEl.hidden = true
  }

  /** FXReplay-style: drag the TP/SL chip off the order badge to place the level. */
  function attachChipDetachDrag(btn: HTMLElement, posId: string, kind: ExitKind) {
    const key = `${posId}:${kind}`
    let startY = 0
    let moved = false

    btn.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !opts.hostYToPrice) return
      event.stopPropagation()
      activeDetachKey = key
      startY = event.clientY
      moved = false
      suppressChipClick = false
      btn.setPointerCapture(event.pointerId)
    })

    btn.addEventListener('pointermove', (event) => {
      if (activeDetachKey !== key || !btn.hasPointerCapture(event.pointerId)) return
      if (!moved && Math.abs(event.clientY - startY) < 4) return
      event.preventDefault()
      event.stopPropagation()
      if (!moved) {
        moved = true
        btn.classList.add('rw-pos-chip--dragging')
      }
      const y = clampDragY(event.clientY)
      showPreview(kind, y, opts.hostYToPrice?.(y) ?? null)
    })

    const finishDetach = (event: PointerEvent, commit: boolean) => {
      if (activeDetachKey !== key) return
      event.stopPropagation()
      if (btn.hasPointerCapture(event.pointerId)) btn.releasePointerCapture(event.pointerId)
      btn.classList.remove('rw-pos-chip--dragging')
      activeDetachKey = null
      hidePreview()
      // A drag placed the level; the trailing click must not toggle it straight back off.
      suppressChipClick = moved
      if (!moved) return

      if (commit && opts.hostYToPrice) {
        const y = clampDragY(event.clientY)
        const price = opts.hostYToPrice(y)
        if (price != null && Number.isFinite(price)) {
          if (kind === 'tp') opts.onSetTakeProfit?.(posId, price)
          else opts.onSetStopLoss?.(posId, price)
        }
      }
      sync()
    }

    btn.addEventListener('pointerup', (event) => finishDetach(event, true))
    btn.addEventListener('pointercancel', (event) => finishDetach(event, false))
  }

  function dragPartners(posId: string, kind: ExitKind): HTMLElement[] {
    const out: HTMLElement[] = []
    const line = dragLineMap.get(posId)?.[kind]
    const row = exitRowMap.get(posId)?.[kind]
    if (line) out.push(line)
    if (row) out.push(row)
    return out
  }

  /** Shared pointer drag for the TP/SL line and its badge — both move together. */
  function attachExitDrag(el: HTMLElement, posId: string, kind: ExitKind) {
    const key = `${posId}:${kind}`

    el.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !opts.hostYToPrice) return
      if ((event.target as HTMLElement | null)?.closest('button')) return
      event.preventDefault()
      event.stopPropagation()
      activeDragKey = key
      el.setPointerCapture(event.pointerId)
      for (const node of dragPartners(posId, kind)) {
        node.classList.add('rw-pos-dragging')
      }
    })

    el.addEventListener('pointermove', (event) => {
      if (activeDragKey !== key || !el.hasPointerCapture(event.pointerId)) return
      event.preventDefault()
      event.stopPropagation()
      const y = clampDragY(event.clientY)
      for (const node of dragPartners(posId, kind)) {
        node.style.top = `${y}px`
        node.hidden = false
      }
      const price = opts.hostYToPrice?.(y)
      const row = exitRowMap.get(posId)?.[kind]
      if (row && price != null && Number.isFinite(price)) {
        const pos = opts.getPositions().find((p) => p.id === posId)
        if (pos) updateExitRowValue(row, pos, price)
      }
    })

    const finishDrag = (event: PointerEvent, commit: boolean) => {
      if (activeDragKey !== key) return
      event.preventDefault()
      event.stopPropagation()
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId)
      for (const node of dragPartners(posId, kind)) {
        node.classList.remove('rw-pos-dragging')
      }
      activeDragKey = null

      if (commit && opts.hostYToPrice) {
        const y = clampDragY(event.clientY)
        const price = opts.hostYToPrice(y)
        if (price != null && Number.isFinite(price)) {
          if (kind === 'tp') opts.onSetTakeProfit?.(posId, price)
          else opts.onSetStopLoss?.(posId, price)
        }
      }
      sync()
    }

    el.addEventListener('pointerup', (event) => finishDrag(event, true))
    el.addEventListener('pointercancel', (event) => finishDrag(event, false))
  }

  function makeDomLine(kind: 'entry' | 'tp' | 'sl', color: string, title: string): HTMLElement {
    const el = document.createElement('div')
    el.className = `rw-pos-hline rw-pos-hline--${kind}`
    el.style.setProperty('--rw-pos-line-color', color)
    el.hidden = true
    if (title) {
      const label = document.createElement('span')
      label.className = 'rw-pos-hline__label'
      label.textContent = title
      label.style.background = color
      el.appendChild(label)
    }
    overlay.appendChild(el)
    return el
  }

  function makeDragLine(posId: string, kind: ExitKind): HTMLElement {
    const el = document.createElement('div')
    el.className = `rw-pos-dragline rw-pos-dragline--${kind}`
    el.dataset.posDrag = kind
    el.title = kind === 'tp' ? 'Drag take profit' : 'Drag stop loss'
    el.setAttribute('role', 'slider')
    el.setAttribute('aria-label', kind === 'tp' ? 'Take profit price' : 'Stop loss price')
    el.hidden = true
    attachExitDrag(el, posId, kind)
    overlay.appendChild(el)
    return el
  }

  /** Projected P&L badge shown on the TP/SL line itself (drag handle + amount + qty). */
  function makeExitRow(posId: string, kind: ExitKind): HTMLElement {
    const el = document.createElement('div')
    el.className = `rw-pos-row rw-pos-row--exit rw-pos-row--${kind}`
    el.dataset.posId = posId
    el.dataset.posExit = kind
    el.style.setProperty('--rw-pos-exit-color', exitColor(kind))
    el.hidden = true
    const label = kind === 'tp' ? 'take profit' : 'stop loss'
    el.innerHTML = `
      <span class="rw-pos-grip" aria-hidden="true"></span>
      <span class="rw-pos-pnl" data-pos-exit-pnl></span>
      <span class="rw-pos-qty" data-pos-exit-qty></span>
      <button type="button" class="rw-pos-close rw-pos-close--exit" data-pos-exit-remove title="Remove ${label}" aria-label="Remove ${label}">×</button>
    `
    const removeBtn = el.querySelector('[data-pos-exit-remove]') as HTMLElement | null
    removeBtn?.addEventListener('click', (event) => {
      event.stopPropagation()
      if (kind === 'tp') opts.onToggleTakeProfit?.(posId)
      else opts.onToggleStopLoss?.(posId)
    })
    if (removeBtn) {
      removeBtn.removeAttribute('title')
      attachTip(removeBtn, () => (kind === 'tp' ? 'Remove Take Profit' : 'Remove Stop Loss'))
    }
    attachTip(el, () => exitTipText(posId, kind))
    attachExitDrag(el, posId, kind)
    overlay.appendChild(el)
    return el
  }

  function updateExitRowValue(row: HTMLElement, pos: OpenPosition, price: number) {
    const pnl = positionUnrealized(pos, price)
    const pts = positionPoints(pos, price)
    const ptsLabel = String(Math.abs(Math.round(pts))).padStart(3, '0')
    const pnlSigned = pnl < 0 ? `-${Math.abs(pnl).toFixed(2)}` : Math.abs(pnl).toFixed(2)
    const pnlEl = row.querySelector('[data-pos-exit-pnl]') as HTMLElement | null
    const qtyEl = row.querySelector('[data-pos-exit-qty]') as HTMLElement | null
    if (pnlEl) pnlEl.textContent = `${ptsLabel}→${pnlSigned} USD`
    if (qtyEl) qtyEl.textContent = String(pos.qty)
  }

  function placeDragLine(el: HTMLElement, y: number) {
    const insets = opts.getPlotHorizontalInsets?.() ?? null
    el.style.left = `${insets?.left ?? 0}px`
    el.style.right = `${insets?.right ?? 56}px`
    el.style.top = `${y}px`
    el.hidden = !Number.isFinite(y)
  }

  function placeDomLine(el: HTMLElement, y: number, leftPx?: number | null) {
    const insets = opts.getPlotHorizontalInsets?.() ?? null
    const plotLeft = insets?.left ?? 0
    const right = insets?.right ?? 56
    const left =
      leftPx != null && Number.isFinite(leftPx) ? Math.max(plotLeft, leftPx) : plotLeft
    el.style.left = `${left}px`
    el.style.right = `${right}px`
    el.style.top = `${y}px`
    el.hidden = !Number.isFinite(y)
  }

  function ensurePendingLine(order: PendingOrder): HTMLElement {
    let line = pendingLineMap.get(order.id)
    if (line) return line
    line = document.createElement('div')
    line.className = `rw-pos-pending-line rw-pos-pending-line--${order.kind}`
    line.innerHTML = `<span>${order.direction === 'long' ? 'BUY' : 'SELL'} ${order.kind.toUpperCase()} · ${order.triggerPrice.toFixed(3)}</span>`
    overlay.appendChild(line)
    pendingLineMap.set(order.id, line)
    return line
  }

  function syncPendingLines() {
    const orders = opts.getPendingOrders?.() ?? []
    const ids = new Set(orders.map((order) => order.id))
    for (const [id, line] of pendingLineMap) {
      if (ids.has(id)) continue
      line.remove()
      pendingLineMap.delete(id)
    }
    if (!opts.priceToHostY) return
    for (const order of orders) {
      const line = ensurePendingLine(order)
      const y = opts.priceToHostY(order.triggerPrice)
      if (y == null || !Number.isFinite(y)) line.hidden = true
      else {
        line.hidden = false
        placeDomLine(line, y)
      }
    }
  }

  function entryLineLeftPx(pos: OpenPosition): number | null {
    if (!opts.anchorTimeToHostX) return null
    // entryTime is session bar time (UTC seconds).
    const sec = pos.entryTime > 1e12 ? Math.floor(pos.entryTime / 1000) : Math.floor(pos.entryTime)
    return opts.anchorTimeToHostX(sec)
  }

  function layoutDomLines(pos: OpenPosition) {
    if (skipDomLines) return
    const bundle = domLineMap.get(pos.id)
    if (!bundle || !opts.priceToHostY) return
    const left = entryLineLeftPx(pos)
    const entryY = opts.priceToHostY(pos.entryPrice)
    if (entryY != null) placeDomLine(bundle.entry, entryY, left)
    else bundle.entry.hidden = true

    if (bundle.tp && pos.takeProfit != null) {
      const y = opts.priceToHostY(pos.takeProfit)
      if (y != null) placeDomLine(bundle.tp, y, left)
      else bundle.tp.hidden = true
    }
    if (bundle.sl && pos.stopLoss != null) {
      const y = opts.priceToHostY(pos.stopLoss)
      if (y != null) placeDomLine(bundle.sl, y, left)
      else bundle.sl.hidden = true
    }
  }
  function removePriceLineBundles() {
    if (!opts.getSeries) return
    const series = opts.getSeries()
    for (const [id, bundle] of lineMap) {
      try {
        series.removePriceLine(bundle.entry)
        if (bundle.tp) series.removePriceLine(bundle.tp)
        if (bundle.sl) series.removePriceLine(bundle.sl)
      } catch {
        /* series may already be gone */
      }
      lineMap.delete(id)
    }
  }

  function removeDomLineBundles() {
    for (const [id, bundle] of domLineMap) {
      bundle.entry.remove()
      bundle.tp?.remove()
      bundle.sl?.remove()
      domLineMap.delete(id)
    }
  }

  function removeDragLineBundles() {
    for (const [id, bundle] of dragLineMap) {
      bundle.tp?.remove()
      bundle.sl?.remove()
      dragLineMap.delete(id)
    }
  }

  function removePositionVisual(id: string) {
    const bundle = lineMap.get(id)
    if (bundle && opts.getSeries) {
      const series = opts.getSeries()
      try {
        series.removePriceLine(bundle.entry)
        if (bundle.tp) series.removePriceLine(bundle.tp)
        if (bundle.sl) series.removePriceLine(bundle.sl)
      } catch {
        /* ignore */
      }
      lineMap.delete(id)
    }
    const dom = domLineMap.get(id)
    if (dom) {
      dom.entry.remove()
      dom.tp?.remove()
      dom.sl?.remove()
      domLineMap.delete(id)
    }
    const drag = dragLineMap.get(id)
    if (drag) {
      drag.tp?.remove()
      drag.sl?.remove()
      dragLineMap.delete(id)
    }
    const exits = exitRowMap.get(id)
    if (exits) {
      exits.tp?.remove()
      exits.sl?.remove()
      exitRowMap.delete(id)
    }
    rowMap.get(id)?.remove()
    rowMap.delete(id)
  }

  function markFor(pos: OpenPosition): number {
    const ba = opts.getBidAsk?.()
    if (ba && Number.isFinite(ba.bid) && Number.isFinite(ba.ask)) {
      return positionMarkPrice(pos.direction, ba.bid, ba.ask)
    }
    return opts.getMarkPrice()
  }

  function ensureDragLines(pos: OpenPosition) {
    if (!opts.priceToHostY || !opts.hostYToPrice) return
    let bundle = dragLineMap.get(pos.id)
    if (!bundle) {
      bundle = { tp: null, sl: null }
      dragLineMap.set(pos.id, bundle)
    }
    if (pos.takeProfit != null) {
      if (!bundle.tp) bundle.tp = makeDragLine(pos.id, 'tp')
    } else if (bundle.tp) {
      bundle.tp.remove()
      bundle.tp = null
    }
    if (pos.stopLoss != null) {
      if (!bundle.sl) bundle.sl = makeDragLine(pos.id, 'sl')
    } else if (bundle.sl) {
      bundle.sl.remove()
      bundle.sl = null
    }
  }

  function layoutDragLines(pos: OpenPosition) {
    if (!opts.priceToHostY) return
    const bundle = dragLineMap.get(pos.id)
    if (!bundle) return
    if (bundle.tp && pos.takeProfit != null && activeDragKey !== `${pos.id}:tp`) {
      const y = opts.priceToHostY(pos.takeProfit)
      if (y != null) placeDragLine(bundle.tp, y)
      else bundle.tp.hidden = true
    }
    if (bundle.sl && pos.stopLoss != null && activeDragKey !== `${pos.id}:sl`) {
      const y = opts.priceToHostY(pos.stopLoss)
      if (y != null) placeDragLine(bundle.sl, y)
      else bundle.sl.hidden = true
    }
  }

  function ensureExitRows(pos: OpenPosition) {
    if (!opts.priceToHostY || !opts.hostYToPrice) return
    let bundle = exitRowMap.get(pos.id)
    if (!bundle) {
      bundle = { tp: null, sl: null }
      exitRowMap.set(pos.id, bundle)
    }
    if (pos.takeProfit != null) {
      if (!bundle.tp) bundle.tp = makeExitRow(pos.id, 'tp')
      if (activeDragKey !== `${pos.id}:tp`) updateExitRowValue(bundle.tp, pos, pos.takeProfit)
    } else if (bundle.tp) {
      bundle.tp.remove()
      bundle.tp = null
    }
    if (pos.stopLoss != null) {
      if (!bundle.sl) bundle.sl = makeExitRow(pos.id, 'sl')
      if (activeDragKey !== `${pos.id}:sl`) updateExitRowValue(bundle.sl, pos, pos.stopLoss)
    } else if (bundle.sl) {
      bundle.sl.remove()
      bundle.sl = null
    }
  }

  function layoutExitRows(pos: OpenPosition, hostHeight: number, hostWidth: number) {
    if (!opts.priceToHostY) return
    const bundle = exitRowMap.get(pos.id)
    if (!bundle) return
    const minY = opts.getMinPlotY?.() ?? 0
    const maxY = hostHeight - (opts.getBottomInset?.() ?? 0)

    const place = (row: HTMLElement | null, price: number | null | undefined, kind: ExitKind) => {
      if (!row) return
      if (activeDragKey === `${pos.id}:${kind}`) return
      if (price == null) {
        row.hidden = true
        return
      }
      const y = opts.priceToHostY?.(price) ?? null
      if (y == null || !Number.isFinite(y) || y < minY || y > maxY) {
        row.hidden = true
        return
      }
      row.hidden = false
      positionRow(row, y, hostHeight, hostWidth)
    }

    place(bundle.tp, pos.takeProfit, 'tp')
    place(bundle.sl, pos.stopLoss, 'sl')
  }

  function ensurePriceLines(pos: OpenPosition) {
    if (!opts.getSeries) return
    const series = opts.getSeries()
    let bundle = lineMap.get(pos.id)
    const mark = markFor(pos)
    const pnl = positionUnrealized(pos, mark)
    const flat = !Number.isFinite(pnl) || Math.abs(pnl) < 1e-9
    const entryColor = flat ? '#787b86' : pnl > 0 ? '#2962ff' : '#e65100'

    if (!bundle) {
      bundle = {
        entry: series.createPriceLine({
          price: pos.entryPrice,
          color: entryColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          axisLabelColor: entryColor,
          title: '',
        }),
        tp: null,
        sl: null,
      }
      lineMap.set(pos.id, bundle)
    } else {
      bundle.entry.applyOptions({ price: pos.entryPrice, color: entryColor, axisLabelColor: entryColor })
    }

    if (pos.takeProfit != null) {
      if (!bundle.tp) {
        bundle.tp = series.createPriceLine({
          price: pos.takeProfit,
          color: '#089981',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          axisLabelColor: '#089981',
          title: 'TP',
        })
      } else {
        bundle.tp.applyOptions({ price: pos.takeProfit })
      }
    } else if (bundle.tp) {
      series.removePriceLine(bundle.tp)
      bundle.tp = null
    }

    if (pos.stopLoss != null) {
      if (!bundle.sl) {
        bundle.sl = series.createPriceLine({
          price: pos.stopLoss,
          color: '#a67c00',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          axisLabelColor: '#a67c00',
          title: 'SL',
        })
      } else {
        bundle.sl.applyOptions({ price: pos.stopLoss })
      }
    } else if (bundle.sl) {
      series.removePriceLine(bundle.sl)
      bundle.sl = null
    }
  }

  function ensureDomLines(pos: OpenPosition) {
    if (skipDomLines) return
    // FXReplay: line color follows unrealized P&L (blue profit / orange loss / gray flat).
    const mark = markFor(pos)
    const pnl = positionUnrealized(pos, mark)
    const flat = !Number.isFinite(pnl) || Math.abs(pnl) < 1e-9
    const entryColor = flat ? '#787b86' : pnl > 0 ? '#2962ff' : '#e65100'
    const entryTitle = pos.direction === 'long' ? 'BUY' : 'SELL'
    let bundle = domLineMap.get(pos.id)
    if (!bundle) {
      bundle = {
        entry: makeDomLine('entry', entryColor, entryTitle),
        tp: null,
        sl: null,
      }
      domLineMap.set(pos.id, bundle)
    } else {
      bundle.entry.style.setProperty('--rw-pos-line-color', entryColor)
      const label = bundle.entry.querySelector('.rw-pos-hline__label') as HTMLElement | null
      if (label) {
        label.textContent = entryTitle
        label.style.background = entryColor
      }
    }

    if (pos.takeProfit != null) {
      if (!bundle.tp) bundle.tp = makeDomLine('tp', '#089981', 'TP')
    } else if (bundle.tp) {
      bundle.tp.remove()
      bundle.tp = null
    }

    if (pos.stopLoss != null) {
      if (!bundle.sl) bundle.sl = makeDomLine('sl', '#f7931a', 'SL')
    } else if (bundle.sl) {
      bundle.sl.remove()
      bundle.sl = null
    }
  }

  function ensureRow(pos: OpenPosition, markPrice: number) {
    let row = rowMap.get(pos.id)
    if (!row) {
      row = document.createElement('div')
      row.className = 'rw-pos-row'
      row.dataset.posId = pos.id
      // Stay hidden until layoutRows assigns a valid plot Y (avoids top-left flash).
      row.hidden = true
      row.innerHTML = `
        <div class="rw-pos-row__tools">
          <button type="button" class="rw-pos-chip rw-pos-chip--tp" data-pos-tp title="Take profit">TP</button>
          <span class="rw-pos-row__sep" aria-hidden="true"></span>
          <button type="button" class="rw-pos-chip rw-pos-chip--sl" data-pos-sl title="Stop loss">SL</button>
        </div>
        <span class="rw-pos-pnl" data-pos-pnl></span>
        <span class="rw-pos-qty" data-pos-qty></span>
        <button type="button" class="rw-pos-close" data-pos-close title="Close position" aria-label="Close position">×</button>
      `
      const closeBtn = row.querySelector('[data-pos-close]') as HTMLElement | null
      closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        opts.onClose(pos.id)
      })
      if (closeBtn) {
        closeBtn.removeAttribute('title')
        attachTip(closeBtn, () => 'Close Position')
      }
      const tpChip = row.querySelector('[data-pos-tp]') as HTMLElement | null
      const slChip = row.querySelector('[data-pos-sl]') as HTMLElement | null
      tpChip?.addEventListener('click', (e) => {
        e.stopPropagation()
        if (suppressChipClick) {
          suppressChipClick = false
          return
        }
        opts.onToggleTakeProfit?.(pos.id)
      })
      slChip?.addEventListener('click', (e) => {
        e.stopPropagation()
        if (suppressChipClick) {
          suppressChipClick = false
          return
        }
        opts.onToggleStopLoss?.(pos.id)
      })
      if (tpChip) {
        tpChip.removeAttribute('title')
        attachChipDetachDrag(tpChip, pos.id, 'tp')
        attachTip(tpChip, () => exitTipText(pos.id, 'tp'))
      }
      if (slChip) {
        slChip.removeAttribute('title')
        attachChipDetachDrag(slChip, pos.id, 'sl')
        attachTip(slChip, () => exitTipText(pos.id, 'sl'))
      }
      overlay.appendChild(row)
      rowMap.set(pos.id, row)
    }

    const mark = markPrice
    const pts = positionPoints(pos, mark)
    const pnl = positionUnrealized(pos, mark)
    const pnlEl = row.querySelector('[data-pos-pnl]') as HTMLElement
    const qtyEl = row.querySelector('[data-pos-qty]') as HTMLElement
    const tpBtn = row.querySelector('[data-pos-tp]') as HTMLButtonElement
    const slBtn = row.querySelector('[data-pos-sl]') as HTMLButtonElement

    const side = pos.direction === 'long' ? 'BUY' : 'SELL'
    // FXReplay badge: "098→-0.00 USD" — first number is price POINTS (Δprice×1000),
    // not order qty (qty is the separate chip). USD may round to 0.00 while points ≠ 0.
    const ptsLabel = String(Math.abs(Math.round(pts))).padStart(3, '0')
    const flat = Math.abs(pts) < 1 && Math.abs(pnl) < 0.005
    const up = pts > 0 || (pts === 0 && pnl > 0.005)
    const down = pts < 0 || (pts === 0 && pnl < -0.005)
    if (pnlEl) {
      const pnlSigned =
        pnl < 0 || (pnl === 0 && down) ? `-${Math.abs(pnl).toFixed(2)}` : Math.abs(pnl).toFixed(2)
      // Match FXReplay: always show points, even when USD is ±0.00.
      pnlEl.textContent = `${ptsLabel}→${pnlSigned} USD`
      pnlEl.title = `${side} · ${Math.abs(Math.round(pts))} pts from entry @ ${pos.entryPrice} · mark ${mark} · unrealized P&L`
    }
    if (qtyEl) qtyEl.textContent = String(pos.qty)
    // A detached level lives on its own badge, so its chip leaves the order badge.
    const tpDetached = pos.takeProfit != null
    const slDetached = pos.stopLoss != null
    if (tpBtn) tpBtn.hidden = tpDetached
    if (slBtn) slBtn.hidden = slDetached
    const sepEl = row.querySelector('.rw-pos-row__sep') as HTMLElement | null
    if (sepEl) sepEl.hidden = tpDetached || slDetached
    const toolsEl = row.querySelector('.rw-pos-row__tools') as HTMLElement | null
    if (toolsEl) toolsEl.hidden = tpDetached && slDetached

    row.classList.toggle('rw-pos-row--long', pos.direction === 'long')
    row.classList.toggle('rw-pos-row--short', pos.direction === 'short')
    row.classList.toggle('rw-pos-row--up', up)
    row.classList.toggle('rw-pos-row--down', down)
    row.classList.toggle('rw-pos-row--flat', flat)
  }

  function priceScaleWidth(hostWidth: number): number {
    if (opts.chart) {
      try {
        return Math.max(48, Math.min(120, opts.chart.priceScale('right').width()))
      } catch {
        /* ignore */
      }
    }
    const insets = opts.getPlotHorizontalInsets?.()
    let r = insets?.right ?? Math.round(hostWidth * 0.08)
    // Bad layout sometimes reports almost full width — that pins the badge to the top-left.
    if (!Number.isFinite(r) || r > hostWidth * 0.28) r = Math.round(hostWidth * 0.08)
    return Math.max(48, Math.min(120, r))
  }

  /** FXReplay-style: dock badge on the right edge of the plot, just before the price axis. */
  function positionRow(row: HTMLElement, y: number, hostHeight: number, hostWidth: number) {
    const top = Math.max(4, Math.min(hostHeight - 28, y))
    row.style.top = `${top}px`
    row.style.transform = 'translateY(-50%)'
    row.style.left = 'auto'
    const rightInset = priceScaleWidth(hostWidth) + 2
    row.style.right = `${rightInset}px`
    // Guard: if inset is absurdly large the badge collapses to the left edge.
    if (rightInset > hostWidth * 0.4) {
      row.style.right = `${Math.round(hostWidth * 0.08)}px`
    }
  }

  function layoutRows() {
    if (suppressed) return
    syncPendingLines()
    const positions = opts.getPositions()
    const hostRect = opts.chartHost.getBoundingClientRect()
    const hostHeight = hostRect.height
    const minY = opts.getMinPlotY?.() ?? 24
    const maxY = hostHeight - (opts.getBottomInset?.() ?? 24)

    for (const pos of positions) {
      const row = rowMap.get(pos.id)
      if (!row) continue
      layoutDragLines(pos)
      layoutExitRows(pos, hostRect.height, hostRect.width)

      let y: number | null = null
      if (useDomLines && opts.priceToHostY) {
        y = opts.priceToHostY(pos.entryPrice)
        layoutDomLines(pos)
      } else if (opts.getSeries) {
        const series = opts.getSeries()
        const cy = series.priceToCoordinate(pos.entryPrice)
        y = cy == null ? null : Number(cy)
      }

      if (y == null || !Number.isFinite(y) || y < minY || y > maxY) {
        row.hidden = true
        const dom = domLineMap.get(pos.id)
        if (dom) {
          dom.entry.hidden = true
          if (dom.tp) dom.tp.hidden = true
          if (dom.sl) dom.sl.hidden = true
        }
        continue
      }
      row.hidden = false
      positionRow(row, y, hostRect.height, hostRect.width)
    }
  }

  function clearAllVisuals() {
    hidePreview()
    hideTip()
    for (const id of new Set([
      ...lineMap.keys(),
      ...domLineMap.keys(),
      ...dragLineMap.keys(),
      ...exitRowMap.keys(),
      ...rowMap.keys(),
    ])) {
      removePositionVisual(id)
    }
    for (const line of pendingLineMap.values()) line.remove()
    pendingLineMap.clear()
  }

  function sync(syncOpts?: { recreateLines?: boolean }) {
    if (suppressed) {
      clearAllVisuals()
      return
    }
    const revision = opts.getSeriesDataRevision?.() ?? 0
    const recreateLines = syncOpts?.recreateLines === true || revision !== lastSeriesDataRevision
    if (recreateLines) {
      if (useDomLines) removeDomLineBundles()
      else removePriceLineBundles()
      // Recreating mid-drag would destroy the element holding pointer capture.
      if (activeDragKey == null) removeDragLineBundles()
      lastSeriesDataRevision = revision
    }

    const positions = opts.getPositions()
    const markFallback = opts.getMarkPrice()
    const ids = new Set(positions.map((p) => p.id))

    for (const id of new Set([
      ...lineMap.keys(),
      ...domLineMap.keys(),
      ...dragLineMap.keys(),
      ...exitRowMap.keys(),
    ])) {
      if (!ids.has(id)) removePositionVisual(id)
    }

    for (const pos of positions) {
      if (useDomLines && !skipDomLines) ensureDomLines(pos)
      else if (!useDomLines) ensurePriceLines(pos)
      ensureDragLines(pos)
      ensureExitRows(pos)
      ensureRow(pos, markFor(pos) || markFallback)
    }

    layoutRows()
  }

  const onRange = () => layoutRows()
  let unsubChartRange: (() => void) | null = null
  if (opts.chart) {
    opts.chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)
    opts.chart.timeScale().subscribeVisibleTimeRangeChange(onRange)
    unsubChartRange = () => {
      opts.chart?.timeScale().unsubscribeVisibleLogicalRangeChange(onRange)
      opts.chart?.timeScale().unsubscribeVisibleTimeRangeChange(onRange)
    }
  }
  const unsubScale = opts.subscribeScaleChange?.(onRange) ?? null

  const ro = new ResizeObserver(() => layoutRows())
  ro.observe(opts.chartHost)

  return {
    sync,
    setSuppressed(next: boolean) {
      suppressed = next
      if (suppressed) clearAllVisuals()
      else sync({ recreateLines: true })
    },
    setSkipDomLines(next: boolean) {
      skipDomLines = next
      if (skipDomLines) removeDomLineBundles()
      else sync({ recreateLines: true })
    },
    dispose() {
      ro.disconnect()
      unsubChartRange?.()
      unsubScale?.()
      clearAllVisuals()
      overlay.remove()
    },
  }
}
