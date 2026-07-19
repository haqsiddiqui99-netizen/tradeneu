/**
 * Tick replay price path drawn on a canvas above the chart (TV 1m candles unchanged).
 */

import type { TradingChart } from './tradingChart'
import type { TradingViewChartHandle } from './tradingViewChart'
import type { TickBarSeries } from './tickReplayIndex'
import { tickTimeMsAtBar } from './tickReplayIndex'

export type TickLinePlotLayout = {
  top: number
  bottom: number
  left: number
  width: number
  plotOffsetX: number
}

export type TickLineOverlayHandle = {
  sync: (replayIndex: number) => void
  setActive: (active: boolean) => void
  dispose: () => void
}

const MAX_DRAW_POINTS = 4000
const LINE_WIDTH = 1.75

function lineColor(theme: 'light' | 'dark'): string {
  return theme === 'light' ? '#2962ff' : '#22d3ee'
}

function dotColor(theme: 'light' | 'dark'): string {
  return theme === 'light' ? '#1e53e5' : '#67e8f9'
}

type PriceRange = { min: number; max: number }

function priceRangeFromSeries(series: TickBarSeries, fromIdx: number, toIdx: number): PriceRange | null {
  let min = Infinity
  let max = -Infinity
  const end = Math.max(fromIdx, Math.min(series.bars.length - 1, toIdx))
  for (let i = Math.max(0, fromIdx); i <= end; i++) {
    const b = series.bars[i]
    if (!b) continue
    min = Math.min(min, b.low, b.high, b.open, b.close)
    max = Math.max(max, b.low, b.high, b.open, b.close)
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null
  const pad = (max - min) * 0.06 || 0.0001
  return { min: min - pad, max: max + pad }
}

function fallbackPlotY(price: number, range: PriceRange, plotTop: number, plotHeight: number): number {
  const t = (price - range.min) / (range.max - range.min)
  return plotTop + (1 - Math.max(0, Math.min(1, t))) * plotHeight
}

export function mountTickLineOverlay(opts: {
  chartHost: HTMLElement
  getTheme: () => 'light' | 'dark'
  isActive: () => boolean
  getTickSeries: () => TickBarSeries | null
  getTvChart: () => TradingViewChartHandle | null
  getTrading: () => TradingChart | null
  getPlotLayout: () => TickLinePlotLayout | null
}): TickLineOverlayHandle {
  const canvas = document.createElement('canvas')
  canvas.className = 'rw-tick-line-overlay'
  canvas.setAttribute('aria-hidden', 'true')
  opts.chartHost.appendChild(canvas)

  let active = false
  let lastIndex = -1
  let paintRaf = 0
  let unsubScale: (() => void) | null = null

  const schedulePaint = (replayIndex: number) => {
    lastIndex = replayIndex
    if (paintRaf) return
    paintRaf = requestAnimationFrame(() => {
      paintRaf = 0
      paint(lastIndex)
    })
  }

  const mapLwcPoint = (
    trading: TradingChart,
    timeMs: number,
    price: number,
    layout: TickLinePlotLayout,
  ): { x: number; y: number } | null => {
    const chart = trading.chart
    const series = trading.getMainSeries()
    const timeSec = Math.floor(timeMs / 1000) as never
    const xPlot = chart.timeScale().timeToCoordinate(timeSec)
    const yPlot = series.priceToCoordinate(price)
    if (xPlot == null || yPlot == null) return null
    return { x: layout.plotOffsetX + Number(xPlot), y: layout.top + Number(yPlot) }
  }

  const collectPoints = (
    series: TickBarSeries,
    replayIndex: number,
  ): Array<{ timeMs: number; price: number }> => {
    const end = Math.max(0, Math.min(series.bars.length, Math.round(replayIndex)) - 1)
    if (end < 0) return []
    const start = Math.max(0, end - MAX_DRAW_POINTS + 1)
    const out: Array<{ timeMs: number; price: number }> = []
    for (let i = start; i <= end; i++) {
      const bar = series.bars[i]
      if (!bar) continue
      const timeMs = tickTimeMsAtBar(series, i) ?? Number(bar.time) * 1000
      const price = Number(bar.close)
      if (!Number.isFinite(timeMs) || !Number.isFinite(price)) continue
      out.push({ timeMs, price })
    }
    return out
  }

  const paint = (replayIndex: number) => {
    const w = opts.chartHost.clientWidth
    const h = opts.chartHost.clientHeight
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(w * dpr))
    canvas.height = Math.max(1, Math.round(h * dpr))
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    if (!active || !opts.isActive()) {
      canvas.hidden = true
      return
    }

    const series = opts.getTickSeries()
    const layout = opts.getPlotLayout()
    if (!series?.bars.length || !layout || layout.width < 8) {
      canvas.hidden = true
      return
    }

    const plotTop = layout.top
    const plotHeight = Math.max(8, h - layout.top - layout.bottom)
    const plotLeft = layout.plotOffsetX
    const plotRight = plotLeft + layout.width

    const points = collectPoints(series, replayIndex)
    if (points.length < 2) {
      canvas.hidden = true
      return
    }

    canvas.hidden = false
    const theme = opts.getTheme()
    const tv = opts.getTvChart()
    const trading = opts.getTrading()
    const priceRange = priceRangeFromSeries(series, 0, replayIndex - 1)

    const mapped: Array<{ x: number; y: number }> = []
    for (const pt of points) {
      let xy: { x: number; y: number } | null = null
      if (tv) {
        xy = tv.hostPointForWallTimeMs?.(pt.timeMs, pt.price, layout) ?? null
        if (!xy) {
          const x = tv.plotXForWallTimeMs?.(pt.timeMs, layout.plotOffsetX)
          if (x != null && priceRange) {
            xy = { x, y: fallbackPlotY(pt.price, priceRange, plotTop, plotHeight) }
          }
        }
      } else if (trading) {
        xy = mapLwcPoint(trading, pt.timeMs, pt.price, layout)
      }
      if (!xy) continue
      if (xy.x < plotLeft - 2 || xy.x > plotRight + 2) continue
      if (xy.y < plotTop - 2 || xy.y > plotTop + plotHeight + 2) continue
      mapped.push(xy)
    }

    if (mapped.length < 2) {
      canvas.hidden = true
      return
    }

    ctx.save()
    ctx.beginPath()
    ctx.rect(plotLeft, plotTop, layout.width, plotHeight)
    ctx.clip()

    ctx.lineWidth = LINE_WIDTH
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = lineColor(theme)
    ctx.beginPath()
    ctx.moveTo(mapped[0]!.x, mapped[0]!.y)
    for (let i = 1; i < mapped.length; i++) {
      ctx.lineTo(mapped[i]!.x, mapped[i]!.y)
    }
    ctx.stroke()

    const last = mapped[mapped.length - 1]!
    ctx.fillStyle = dotColor(theme)
    ctx.beginPath()
    ctx.arc(last.x, last.y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  const bindScaleHooks = () => {
    unsubScale?.()
    unsubScale = null
    const tv = opts.getTvChart()
    if (tv && active) {
      unsubScale = tv.subscribeTimeScaleChange(() => schedulePaint(lastIndex))
    }
  }

  return {
    sync(replayIndex) {
      if (!active || !opts.isActive()) return
      schedulePaint(replayIndex)
    },

    setActive(next) {
      active = next
      canvas.hidden = !next
      if (next) {
        bindScaleHooks()
        schedulePaint(lastIndex > 0 ? lastIndex : 1)
      } else {
        unsubScale?.()
        unsubScale = null
        const ctx = canvas.getContext('2d')
        ctx?.clearRect(0, 0, canvas.width, canvas.height)
        canvas.hidden = true
      }
    },

    dispose() {
      unsubScale?.()
      unsubScale = null
      if (paintRaf) cancelAnimationFrame(paintRaf)
      canvas.remove()
    },
  }
}
