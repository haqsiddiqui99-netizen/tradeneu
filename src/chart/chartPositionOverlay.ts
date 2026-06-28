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

export function mountChartPositionOverlay(opts: {
  chartHost: HTMLElement
  chart: IChartApi
  getSeries: () => ISeriesApi<SeriesType, Time>
  getPositions: () => OpenPosition[]
  getMarkPrice: () => number
  /** Unix time of the replay cursor / last revealed bar — anchors UI in future whitespace. */
  getAnchorTime: () => number | null
  formatMoney: (n: number) => string
  /** When main series data is fully replaced, cached price lines must be recreated. */
  getSeriesDataRevision?: () => number
  onClose: (id: string) => void
  onToggleTakeProfit?: (id: string) => void
  onToggleStopLoss?: (id: string) => void
}): { sync: (opts?: { recreateLines?: boolean }) => void; dispose: () => void } {
  const overlay = document.createElement('div')
  overlay.className = 'rw-pos-overlay'
  overlay.setAttribute('aria-live', 'polite')
  opts.chartHost.appendChild(overlay)

  const lineMap = new Map<string, LineBundle>()
  const rowMap = new Map<string, HTMLElement>()
  let lastSeriesDataRevision = -1

  function formatUsdPnl(n: number): string {
    const sign = n < 0 ? '-' : ''
    return `${sign}${Math.abs(n).toFixed(2)} USD`
  }

  function removePriceLineBundles() {
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

  function removePositionVisual(id: string) {
    const bundle = lineMap.get(id)
    if (bundle) {
      const series = opts.getSeries()
      series.removePriceLine(bundle.entry)
      if (bundle.tp) series.removePriceLine(bundle.tp)
      if (bundle.sl) series.removePriceLine(bundle.sl)
      lineMap.delete(id)
    }
    rowMap.get(id)?.remove()
    rowMap.delete(id)
  }

  function ensurePriceLines(pos: OpenPosition) {
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

  function ensureRow(pos: OpenPosition, markPrice: number) {
    let row = rowMap.get(pos.id)
    if (!row) {
      row = document.createElement('div')
      row.className = 'rw-pos-row'
      row.dataset.posId = pos.id
      row.innerHTML = `
        <button type="button" class="rw-pos-chip rw-pos-chip--tp" data-pos-tp title="Take profit">TP</button>
        <button type="button" class="rw-pos-chip rw-pos-chip--sl" data-pos-sl title="Stop loss">SL</button>
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

    if (pnlEl) {
      const ptsLabel = String(Math.abs(pts)).padStart(3, '0')
      pnlEl.textContent = `${ptsLabel} → ${formatUsdPnl(pnl)}`
    }
    if (qtyEl) qtyEl.textContent = String(pos.qty)
    if (tpBtn) tpBtn.classList.toggle('rw-pos-chip--off', pos.takeProfit == null)
    if (slBtn) slBtn.classList.toggle('rw-pos-chip--off', pos.stopLoss == null)

    row.classList.toggle('rw-pos-row--long', pos.direction === 'long')
    row.classList.toggle('rw-pos-row--short', pos.direction === 'short')
  }

  function anchorLeftPx(hostWidth: number, rowWidth: number): number {
    const anchorTime = opts.getAnchorTime()
    let left = hostWidth * 0.55

    if (anchorTime != null) {
      const tx = opts.chart.timeScale().timeToCoordinate(anchorTime as Time)
      if (tx != null && Number.isFinite(Number(tx))) {
        left = Number(tx) + 18
      }
    }

    let scaleWidth = 56
    try {
      scaleWidth = Math.max(48, opts.chart.priceScale('right').width())
    } catch {
      /* ignore */
    }

    const maxLeft = Math.max(8, hostWidth - scaleWidth - rowWidth - 6)
    return Math.max(8, Math.min(maxLeft, left))
  }

  function positionRow(row: HTMLElement, y: number, hostHeight: number, hostWidth: number) {
    const top = Math.max(4, Math.min(hostHeight - 28, y))
    row.style.top = `${top}px`
    row.style.transform = 'translateY(-50%)'
    const rowWidth = row.offsetWidth || 168
    row.style.left = `${anchorLeftPx(hostWidth, rowWidth)}px`
    row.style.right = 'auto'
  }

  function layoutRows() {
    const positions = opts.getPositions()
    const series = opts.getSeries()
    const hostRect = opts.chartHost.getBoundingClientRect()

    for (const pos of positions) {
      const row = rowMap.get(pos.id)
      if (!row) continue
      const y = series.priceToCoordinate(pos.entryPrice)
      if (y == null) {
        row.hidden = true
        continue
      }
      row.hidden = false
      positionRow(row, Number(y), hostRect.height, hostRect.width)
    }
  }

  function sync(syncOpts?: { recreateLines?: boolean }) {
    const revision = opts.getSeriesDataRevision?.() ?? 0
    const recreateLines = syncOpts?.recreateLines === true || revision !== lastSeriesDataRevision
    if (recreateLines) {
      removePriceLineBundles()
      lastSeriesDataRevision = revision
    }

    const positions = opts.getPositions()
    const mark = opts.getMarkPrice()
    const ids = new Set(positions.map((p) => p.id))

    for (const id of [...lineMap.keys()]) {
      if (!ids.has(id)) removePositionVisual(id)
    }

    for (const pos of positions) {
      ensurePriceLines(pos)
      ensureRow(pos, mark)
    }

    layoutRows()
  }

  const onRange = () => layoutRows()
  opts.chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)
  opts.chart.timeScale().subscribeVisibleTimeRangeChange(onRange)

  const ro = new ResizeObserver(() => layoutRows())
  ro.observe(opts.chartHost)

  return {
    sync,
    dispose() {
      ro.disconnect()
      opts.chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange)
      opts.chart.timeScale().unsubscribeVisibleTimeRangeChange(onRange)
      for (const id of [...lineMap.keys()]) removePositionVisual(id)
      overlay.remove()
    },
  }
}
