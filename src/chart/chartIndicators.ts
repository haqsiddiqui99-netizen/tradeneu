import { HistogramSeries, LineSeries, LineStyle } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, LineData, Time } from 'lightweight-charts'
import { atr, bollingerBands, ema, macd, rsi, sma, vwap } from '../backtest/BacktestIndicators'
import type { Bar } from '../types'
import {
  CHART_INDICATOR_CATALOG,
  getChartIndicatorDef,
  type ChartIndicatorId,
} from './chartIndicatorCatalog'

type AnySeries = ISeriesApi<'Line'> | ISeriesApi<'Histogram'>

type IndicatorInstance = {
  id: ChartIndicatorId
  paneIndex: number
  series: AnySeries[]
}

function linePoints(bars: Bar[], values: number[], displayCount: number): LineData<Time>[] {
  const n = Math.min(displayCount, bars.length, values.length)
  const out: LineData<Time>[] = []
  for (let i = 0; i < n; i++) {
    const v = values[i]!
    if (Number.isFinite(v)) out.push({ time: bars[i]!.time as Time, value: v })
  }
  return out
}

function computeOverlayValues(id: ChartIndicatorId, bars: Bar[]): number[] {
  switch (id) {
    case 'ema20':
      return ema(bars, 20)
    case 'ema50':
      return ema(bars, 50)
    case 'sma20':
      return sma(bars, 20)
    case 'vwap':
      return vwap(bars)
    default:
      return []
  }
}

export function renderChartIndicatorBar(
  host: HTMLElement,
  activeIds: ChartIndicatorId[],
  onRemove: (id: ChartIndicatorId) => void,
): void {
  host.innerHTML = ''
  if (!activeIds.length) {
    host.hidden = true
    return
  }
  host.hidden = false
  for (const id of activeIds) {
    const def = getChartIndicatorDef(id)
    if (!def) continue
    const chip = document.createElement('span')
    chip.className = 'rw-indicator-chip'
    chip.innerHTML = `<span class="rw-indicator-chip__dot" style="background:${def.color}"></span><span class="rw-indicator-chip__label"></span><button type="button" class="rw-indicator-chip__x" aria-label="Remove indicator">×</button>`
    chip.querySelector('.rw-indicator-chip__label')!.textContent = def.name
    chip.querySelector('.rw-indicator-chip__x')!.addEventListener('click', (e) => {
      e.stopPropagation()
      onRemove(id)
    })
    host.appendChild(chip)
  }
}

export function createChartIndicatorManager(opts: { chart: IChartApi }) {
  const { chart } = opts
  const active = new Map<ChartIndicatorId, IndicatorInstance>()
  let activeOrder: ChartIndicatorId[] = []

  function bumpPaneIndices(removedPane: number) {
    for (const inst of active.values()) {
      if (inst.paneIndex > removedPane) inst.paneIndex -= 1
    }
  }

  function addOverlay(id: ChartIndicatorId, def: ReturnType<typeof getChartIndicatorDef> & object) {
    const series = chart.addSeries(
      LineSeries,
      {
        color: def.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
      },
      0,
    )
    active.set(id, { id, paneIndex: 0, series: [series] })
    activeOrder.push(id)
    return true
  }

  function addBb(id: ChartIndicatorId, def: ReturnType<typeof getChartIndicatorDef> & object) {
    const upper = chart.addSeries(
      LineSeries,
      {
        color: def.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      0,
    )
    const middle = chart.addSeries(
      LineSeries,
      {
        color: def.color2 ?? '#787b86',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      0,
    )
    const lower = chart.addSeries(
      LineSeries,
      {
        color: def.color3 ?? def.color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      0,
    )
    active.set(id, { id, paneIndex: 0, series: [upper, middle, lower] })
    activeOrder.push(id)
    return true
  }

  function addRsi(id: ChartIndicatorId, def: ReturnType<typeof getChartIndicatorDef> & object) {
    chart.addPane()
    const paneIndex = chart.panes().length - 1
    const series = chart.addSeries(
      LineSeries,
      {
        color: def.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
      },
      paneIndex,
    )
    series.createPriceLine({
      price: 70,
      color: '#787b86',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
    })
    series.createPriceLine({
      price: 30,
      color: '#787b86',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
    })
    series.priceScale().applyOptions({ scaleMargins: { top: 0.12, bottom: 0.08 } })
    active.set(id, { id, paneIndex, series: [series] })
    activeOrder.push(id)
    return true
  }

  function addAtr(id: ChartIndicatorId, def: ReturnType<typeof getChartIndicatorDef> & object) {
    chart.addPane()
    const paneIndex = chart.panes().length - 1
    const series = chart.addSeries(
      LineSeries,
      {
        color: def.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
      },
      paneIndex,
    )
    series.priceScale().applyOptions({ scaleMargins: { top: 0.15, bottom: 0.1 } })
    active.set(id, { id, paneIndex, series: [series] })
    activeOrder.push(id)
    return true
  }

  function addVolume(id: ChartIndicatorId, _def: ReturnType<typeof getChartIndicatorDef> & object) {
    chart.addPane()
    const paneIndex = chart.panes().length - 1
    const series = chart.addSeries(
      HistogramSeries,
      {
        priceLineVisible: false,
        lastValueVisible: false,
      },
      paneIndex,
    )
    series.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0 } })
    active.set(id, { id, paneIndex, series: [series] })
    activeOrder.push(id)
    return true
  }

  function addMacd(id: ChartIndicatorId, def: ReturnType<typeof getChartIndicatorDef> & object) {
    chart.addPane()
    const paneIndex = chart.panes().length - 1
    const lineSeries = chart.addSeries(
      LineSeries,
      {
        color: def.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      paneIndex,
    )
    const signalSeries = chart.addSeries(
      LineSeries,
      {
        color: def.color2 ?? '#ff6d00',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      paneIndex,
    )
    const histSeries = chart.addSeries(
      HistogramSeries,
      {
        priceLineVisible: false,
        lastValueVisible: false,
      },
      paneIndex,
    )
    histSeries.priceScale().applyOptions({ scaleMargins: { top: 0.2, bottom: 0.2 } })
    active.set(id, { id, paneIndex, series: [lineSeries, signalSeries, histSeries] })
    activeOrder.push(id)
    return true
  }

  function add(id: ChartIndicatorId): boolean {
    if (active.has(id)) return false
    const def = getChartIndicatorDef(id)
    if (!def) return false
    switch (def.kind) {
      case 'overlay':
        return addOverlay(id, def)
      case 'bb':
        return addBb(id, def)
      case 'rsi':
        return addRsi(id, def)
      case 'atr':
        return addAtr(id, def)
      case 'volume':
        return addVolume(id, def)
      case 'macd':
        return addMacd(id, def)
      default:
        return false
    }
  }

  function remove(id: ChartIndicatorId): boolean {
    const inst = active.get(id)
    if (!inst) return false
    for (const s of inst.series) chart.removeSeries(s)
    if (inst.paneIndex > 0) {
      chart.removePane(inst.paneIndex)
      bumpPaneIndices(inst.paneIndex)
    }
    active.delete(id)
    activeOrder = activeOrder.filter((x) => x !== id)
    return true
  }

  function syncInstance(inst: IndicatorInstance, allBars: Bar[], displayCount: number) {
    const def = getChartIndicatorDef(inst.id)
    if (!def) return

    if (def.kind === 'overlay') {
      const values = computeOverlayValues(inst.id, allBars)
      ;(inst.series[0] as ISeriesApi<'Line'>).setData(linePoints(allBars, values, displayCount))
      return
    }

    if (def.kind === 'bb') {
      const { upper, middle, lower } = bollingerBands(allBars, 20, 2)
      ;(inst.series[0] as ISeriesApi<'Line'>).setData(linePoints(allBars, upper, displayCount))
      ;(inst.series[1] as ISeriesApi<'Line'>).setData(linePoints(allBars, middle, displayCount))
      ;(inst.series[2] as ISeriesApi<'Line'>).setData(linePoints(allBars, lower, displayCount))
      return
    }

    if (def.kind === 'rsi') {
      const values = rsi(allBars, 14)
      ;(inst.series[0] as ISeriesApi<'Line'>).setData(linePoints(allBars, values, displayCount))
      return
    }

    if (def.kind === 'atr') {
      const values = atr(allBars, 14)
      ;(inst.series[0] as ISeriesApi<'Line'>).setData(linePoints(allBars, values, displayCount))
      return
    }

    if (def.kind === 'volume') {
      const n = Math.min(displayCount, allBars.length)
      const histData: Array<{ time: Time; value: number; color: string }> = []
      for (let i = 0; i < n; i++) {
        const b = allBars[i]!
        const vol = b.volume ?? 0
        if (!Number.isFinite(vol) || vol <= 0) continue
        const up = b.close >= b.open
        histData.push({
          time: b.time as Time,
          value: vol,
          color: up ? (def.histUp ?? '#26a69a') : (def.histDown ?? '#ef5350'),
        })
      }
      ;(inst.series[0] as ISeriesApi<'Histogram'>).setData(histData)
      return
    }

    if (def.kind === 'macd') {
      const { line, signal_, hist } = macd(allBars)
      const n = Math.min(displayCount, allBars.length)
      const lineData: LineData<Time>[] = []
      const sigData: LineData<Time>[] = []
      const histData: Array<{ time: Time; value: number; color: string }> = []
      for (let i = 0; i < n; i++) {
        const t = allBars[i]!.time as Time
        const lv = line[i]!
        const sv = signal_[i]!
        const hv = hist[i]!
        if (Number.isFinite(lv)) lineData.push({ time: t, value: lv })
        if (Number.isFinite(sv)) sigData.push({ time: t, value: sv })
        if (Number.isFinite(hv)) {
          histData.push({
            time: t,
            value: hv,
            color: hv >= 0 ? (def.histUp ?? '#26a69a') : (def.histDown ?? '#ef5350'),
          })
        }
      }
      ;(inst.series[0] as ISeriesApi<'Line'>).setData(lineData)
      ;(inst.series[1] as ISeriesApi<'Line'>).setData(sigData)
      ;(inst.series[2] as ISeriesApi<'Histogram'>).setData(histData)
    }
  }

  function sync(allBars: Bar[], displayBars: Bar[]) {
    if (!active.size || !allBars.length) return
    const displayCount = displayBars.length
    for (const id of activeOrder) {
      const inst = active.get(id)
      if (inst) syncInstance(inst, allBars, displayCount)
    }
  }

  function restore(ids: ChartIndicatorId[]) {
    for (const id of ids) {
      if (CHART_INDICATOR_CATALOG.some((d) => d.id === id)) add(id)
    }
  }

  function dispose() {
    for (const id of [...activeOrder].reverse()) remove(id)
  }

  return {
    add,
    remove,
    sync,
    restore,
    dispose,
    getActiveIds: () => [...activeOrder],
    has: (id: ChartIndicatorId) => active.has(id),
  }
}
