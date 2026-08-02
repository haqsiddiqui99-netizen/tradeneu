import './chartPositionOverlay.css'
import type { IChartApi, IPriceLine, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { LineStyle } from 'lightweight-charts'
import type { OpenPosition } from '../replay/replayPositions'
import { positionPoints, positionUnrealized } from '../replay/replayPositions'

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
  /** Left/right inset for DOM horizontal lines (plot area). */
  getPlotHorizontalInsets?: () => { left: number; right: number } | null
  /** Reject badge Y above this (avoids pinning into TV header chrome). */
  getMinPlotY?: () => number
  getBottomInset?: () => number
  getPositions: () => OpenPosition[]
  getMarkPrice: () => number
  /** Unix time of the replay cursor / last revealed bar — anchors UI in future whitespace. */
  getAnchorTime: () => number | null
  /** Optional: host X for chip anchoring (TV). Falls back to mid-plot. */
  anchorTimeToHostX?: (timeSec: number) => number | null
  formatMoney: (n: number) => string
  onClose: (id: string) => void
  onToggleTakeProfit?: (id: string) => void
  onToggleStopLoss?: (id: string) => void
  /** Re-layout when scales change (TV subscribeTimeScaleChange). */
  subscribeScaleChange?: (cb: () => void) => () => void
}): ChartPositionOverlayHandle {
  const useDomLines = typeof opts.priceToHostY === 'function'
  const overlay = document.createElement('div')
  overlay.className = 'rw-pos-overlay'
  overlay.setAttribute('aria-live', 'polite')
  opts.chartHost.appendChild(overlay)

  const lineMap = new Map<string, LineBundle>()
  const domLineMap = new Map<string, DomLineBundle>()
  const rowMap = new Map<string, HTMLElement>()
  let lastSeriesDataRevision = -1
  let suppressed = false
  let skipDomLines = false

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
    rowMap.get(id)?.remove()
    rowMap.delete(id)
  }

  function ensurePriceLines(pos: OpenPosition) {
    if (!opts.getSeries) return
    const series = opts.getSeries()
    let bundle = lineMap.get(pos.id)
    const entryColor = pos.direction === 'long' ? '#2962ff' : '#e65100'

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
    const entryColor = pos.direction === 'long' ? '#2962ff' : '#e65100'
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
      row.querySelector('[data-pos-close]')?.addEventListener('click', (e) => {
        e.stopPropagation()
        opts.onClose(pos.id)
      })
      row.querySelector('[data-pos-tp]')?.addEventListener('click', (e) => {
        e.stopPropagation()
        opts.onToggleTakeProfit?.(pos.id)
      })
      row.querySelector('[data-pos-sl]')?.addEventListener('click', (e) => {
        e.stopPropagation()
        opts.onToggleStopLoss?.(pos.id)
      })
      overlay.appendChild(row)
      rowMap.set(pos.id, row)
    }

    const pts = positionPoints(pos, markPrice)
    const pnl = positionUnrealized(pos, markPrice)
    const pnlEl = row.querySelector('[data-pos-pnl]') as HTMLElement
    const qtyEl = row.querySelector('[data-pos-qty]') as HTMLElement
    const tpBtn = row.querySelector('[data-pos-tp]') as HTMLButtonElement
    const slBtn = row.querySelector('[data-pos-sl]') as HTMLButtonElement

    const side = pos.direction === 'long' ? 'BUY' : 'SELL'
    // Flat = break-even (mark ≈ entry). Color the chip by P&L, not by side —
    // otherwise a flat short looked like a "SELL loss" in orange.
    const flat = !Number.isFinite(pnl) || Math.abs(pnl) < 1e-9
    const up = !flat && pnl > 0
    const down = !flat && pnl < 0
    if (pnlEl) {
      const ptsLabel = String(Math.abs(pts)).padStart(3, '0')
      const sign = down ? '-' : ''
      pnlEl.textContent = `${side} ${ptsLabel} → ${sign}${Math.abs(pnl).toFixed(2)} USD`
      pnlEl.title = `${side} · unrealized P&L`
    }
    if (qtyEl) qtyEl.textContent = String(pos.qty)
    if (tpBtn) tpBtn.classList.toggle('rw-pos-chip--off', pos.takeProfit == null)
    if (slBtn) slBtn.classList.toggle('rw-pos-chip--off', pos.stopLoss == null)

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
    const positions = opts.getPositions()
    const hostRect = opts.chartHost.getBoundingClientRect()
    const hostHeight = hostRect.height
    const minY = opts.getMinPlotY?.() ?? 24
    const maxY = hostHeight - (opts.getBottomInset?.() ?? 24)

    for (const pos of positions) {
      const row = rowMap.get(pos.id)
      if (!row) continue

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
    for (const id of new Set([...lineMap.keys(), ...domLineMap.keys(), ...rowMap.keys()])) {
      removePositionVisual(id)
    }
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
      lastSeriesDataRevision = revision
    }

    const positions = opts.getPositions()
    const mark = opts.getMarkPrice()
    const ids = new Set(positions.map((p) => p.id))

    for (const id of [...lineMap.keys(), ...domLineMap.keys()]) {
      if (!ids.has(id)) removePositionVisual(id)
    }

    for (const pos of positions) {
      if (useDomLines && !skipDomLines) ensureDomLines(pos)
      else if (!useDomLines) ensurePriceLines(pos)
      ensureRow(pos, mark)
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
