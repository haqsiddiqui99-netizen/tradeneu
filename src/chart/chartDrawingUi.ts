/**
 * TradingView-style drawing interactions: toolbar tools, overlay canvas,
 * magnet / stay-in-draw / lock / hide / clear, and wheel zoom passthrough.
 */
import { CrosshairMode } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import type { Logical } from 'lightweight-charts'
import type { Bar } from '../types'

export type DrawingToolId =
  | 'crosshair'
  | 'trend'
  | 'ray'
  | 'hline'
  | 'fib'
  | 'rect'
  | 'measure'
  | 'text'
  | 'zoom'

type ThemeMode = 'light' | 'dark'

type Prim =
  | { kind: 'trend'; t1: number; p1: number; t2: number; p2: number }
  | { kind: 'measure_seg'; t1: number; p1: number; t2: number; p2: number }
  | { kind: 'ray'; t1: number; p1: number; t2: number; p2: number }
  | { kind: 'hline'; price: number }
  | { kind: 'fib'; t1: number; p1: number; t2: number; p2: number }
  | { kind: 'rect'; t1: number; p1: number; t2: number; p2: number }
  | { kind: 'text'; t: number; price: number; text: string }

const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const

function snapPriceToOhlc(bar: Bar, price: number): number {
  const cands = [bar.open, bar.high, bar.low, bar.close]
  let best = cands[0]!
  let bestD = Math.abs(price - best)
  for (const x of cands) {
    const d = Math.abs(price - x)
    if (d < bestD) {
      bestD = d
      best = x
    }
  }
  return best
}

function logicalToBarIndex(bars: Bar[], logical: Logical): number {
  const n = bars.length
  if (n < 1) return 0
  const i = Math.round(Number(logical))
  return Math.max(0, Math.min(n - 1, i))
}

function xyFromTimePrice(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
  t: number,
  price: number,
): { x: number; y: number } | null {
  const x = chart.timeScale().timeToCoordinate(t as Time)
  const y = series.priceToCoordinate(price)
  if (x == null || y == null) return null
  return { x: Number(x), y: Number(y) }
}

function timePriceFromXY(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
  x: number,
  y: number,
  bars: Bar[],
  magnet: boolean,
): { t: number; price: number } | null {
  const logical = chart.timeScale().coordinateToLogical(x)
  if (logical == null) return null
  const rawPrice = series.coordinateToPrice(y)
  if (rawPrice == null) return null
  let price = Number(rawPrice)
  if (!Number.isFinite(price)) return null
  const idx = logicalToBarIndex(bars, logical)
  const bar = bars[idx]
  const t = Number(bar?.time)
  if (!Number.isFinite(t)) return null
  if (magnet && bar) price = snapPriceToOhlc(bar, price)
  return { t, price }
}

function drawExtendedLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  h: number,
) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const scale = Math.max(w, h) * 3
  const ux = (dx / len) * scale
  const uy = (dy / len) * scale
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  ctx.beginPath()
  ctx.moveTo(mx - ux, my - uy)
  ctx.lineTo(mx + ux, my + uy)
  ctx.stroke()
}

function drawRay(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, h: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const scale = Math.max(w, h) * 2.5
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 + (dx / len) * scale, y1 + (dy / len) * scale)
  ctx.stroke()
}

function paintFib(
  ctx: CanvasRenderingContext2D,
  series: ISeriesApi<SeriesType, Time>,
  p: Extract<Prim, { kind: 'fib' }>,
  w: number,
  _h: number,
  muted: string,
  label: string,
) {
  const hi = Math.max(p.p1, p.p2)
  const lo = Math.min(p.p1, p.p2)
  const span = hi - lo
  if (!(span > 0)) return
  ctx.save()
  ctx.setLineDash([4, 3])
  ctx.strokeStyle = muted
  ctx.fillStyle = label
  ctx.font = '10px system-ui, sans-serif'
  for (const r of FIB_RATIOS) {
    const price = hi - r * span
    const y = series.priceToCoordinate(price)
    if (y == null) continue
    const yy = Number(y)
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(w, yy)
    ctx.stroke()
    ctx.fillText(`${(r * 100).toFixed(1)}%`, 4, Math.max(11, yy - 3))
  }
  ctx.restore()
}

type DraftState =
  | null
  | {
      kind: DrawingToolId
      t1: number
      p1: number
      x1: number
      y1: number
      curX?: number
      curY?: number
    }

export function mountChartDrawingUi(opts: {
  toolbarRoot: HTMLElement
  drawCanvas: HTMLCanvasElement
  chartHost: HTMLElement
  chart: IChartApi
  series: ISeriesApi<SeriesType, Time>
  getBars: () => Bar[]
  getUiTheme: () => ThemeMode
  onWheelZoom: (deltaY: number) => void
  repaintShades: () => void
}): { dispose: () => void; redraw: () => void } {
  const {
    toolbarRoot,
    drawCanvas,
    chartHost,
    chart,
    series,
    getBars,
    getUiTheme,
    onWheelZoom,
    repaintShades,
  } = opts

  let tool: DrawingToolId = 'crosshair'
  let magnet = false
  let stayInDraw = false
  let lockDrawings = false
  let hideDrawings = false
  const primitives: Prim[] = []

  let draft: DraftState = null
  let measureLabel: { x: number; y: number; text: string } | null = null
  let textInputEl: HTMLInputElement | null = null

  const toolBtns = toolbarRoot.querySelectorAll<HTMLButtonElement>('[data-draw-tool]')
  const toggleBtns = toolbarRoot.querySelectorAll<HTMLButtonElement>('[data-draw-toggle]')
  const btnClear = toolbarRoot.querySelector<HTMLButtonElement>('[data-draw-action="clear"]')

  function strokeColor(): string {
    return getUiTheme() === 'dark' ? '#5d7afa' : '#2962ff'
  }

  function mutedColor(): string {
    return getUiTheme() === 'dark' ? '#758696' : '#787b86'
  }

  function syncToolbarClasses() {
    toolBtns.forEach((b) => {
      const id = b.dataset.drawTool as DrawingToolId | undefined
      b.classList.toggle('rw-tools__btn--active', id === tool)
    })
    toolbarRoot.querySelectorAll<HTMLButtonElement>('[data-draw-toggle]').forEach((b) => {
      const k = b.dataset.drawToggle
      const on =
        (k === 'magnet' && magnet) ||
        (k === 'stay' && stayInDraw) ||
        (k === 'lock' && lockDrawings) ||
        (k === 'hide' && hideDrawings)
      b.classList.toggle('rw-tools__btn--toggle-on', !!on)
      b.setAttribute('aria-pressed', on ? 'true' : 'false')
    })
  }

  function removeTextEditor() {
    textInputEl?.remove()
    textInputEl = null
  }

  function finishOrStayAfterShape() {
    draft = null
    removeTextEditor()
    if (!stayInDraw) setTool('crosshair')
    else syncToolbarClasses()
  }

  function paintTextLabel(
    ctx: CanvasRenderingContext2D,
    pr: Extract<Prim, { kind: 'text' }>,
    col: string,
    labelFill: string,
  ) {
    const xy = xyFromTimePrice(chart, series, pr.t, pr.price)
    if (!xy) return
    ctx.save()
    ctx.font = '12px system-ui, sans-serif'
    const padX = 6
    const padY = 4
    const textW = ctx.measureText(pr.text).width
    const boxW = textW + padX * 2
    const boxH = 20
    const x = xy.x
    const y = xy.y - boxH + 4
    ctx.fillStyle = getUiTheme() === 'dark' ? 'rgba(30,34,45,0.92)' : 'rgba(255,255,255,0.95)'
    ctx.strokeStyle = col
    ctx.lineWidth = 1
    ctx.fillRect(x, y, boxW, boxH)
    ctx.strokeRect(x, y, boxW, boxH)
    ctx.fillStyle = labelFill
    ctx.fillText(pr.text, x + padX, y + boxH - padY - 2)
    ctx.restore()
  }

  function openTextEditor(x: number, y: number, t: number, price: number) {
    removeTextEditor()
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'rw-chart-text-input'
    input.style.left = `${x}px`
    input.style.top = `${y}px`
    input.placeholder = 'Label'
    input.maxLength = 120
    input.setAttribute('aria-label', 'Chart text label')
    chartHost.appendChild(input)
    textInputEl = input
    requestAnimationFrame(() => input.focus())

    const commit = () => {
      const text = input.value.trim()
      removeTextEditor()
      if (text) {
        primitives.push({ kind: 'text', t, price, text })
        paint()
        repaintShades()
      }
      finishOrStayAfterShape()
    }

    const cancel = () => {
      removeTextEditor()
      finishOrStayAfterShape()
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    })
    input.addEventListener('blur', () => commit(), { once: true })
  }

  function setTool(next: DrawingToolId) {
    tool = next
    draft = null
    measureLabel = null
    removeTextEditor()
    const active = tool !== 'crosshair'
    drawCanvas.style.pointerEvents = active ? 'auto' : 'none'
    drawCanvas.classList.toggle('rw-chart-draw--active', active)
    chart.applyOptions({
      crosshair: { mode: tool === 'crosshair' ? CrosshairMode.Normal : CrosshairMode.Hidden },
    })
    syncToolbarClasses()
    paint()
  }

  function resizeCanvas() {
    const w = chartHost.clientWidth
    const h = chartHost.clientHeight
    if (w < 2 || h < 2) return
    const dpr = window.devicePixelRatio || 1
    drawCanvas.width = Math.floor(w * dpr)
    drawCanvas.height = Math.floor(h * dpr)
    drawCanvas.style.width = `${w}px`
    drawCanvas.style.height = `${h}px`
    const ctx = drawCanvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paint()
  }

  function paint() {
    const ctx = drawCanvas.getContext('2d')
    if (!ctx) return
    const w = chartHost.clientWidth
    const h = chartHost.clientHeight
    ctx.clearRect(0, 0, w, h)
    const col = strokeColor()
    const muted = mutedColor()
    const labelFill = getUiTheme() === 'dark' ? 'rgba(209,212,220,0.9)' : 'rgba(19,23,34,0.85)'

    if (!hideDrawings) {
      ctx.lineWidth = 1
      ctx.strokeStyle = col
      ctx.fillStyle = col

      for (const pr of primitives) {
        if (pr.kind === 'text') {
          paintTextLabel(ctx, pr, col, labelFill)
          continue
        }
        if (pr.kind === 'hline') {
          const y = series.priceToCoordinate(pr.price)
          if (y == null) continue
          ctx.setLineDash([6, 4])
          ctx.beginPath()
          ctx.moveTo(0, Number(y))
          ctx.lineTo(w, Number(y))
          ctx.stroke()
          ctx.setLineDash([])
          continue
        }
        if (pr.kind === 'fib') {
          paintFib(ctx, series, pr, w, h, muted, labelFill)
          continue
        }
        const a1 = xyFromTimePrice(chart, series, pr.t1, pr.p1)
        const a2 = xyFromTimePrice(chart, series, pr.t2, pr.p2)
        if (!a1 || !a2) continue
        if (pr.kind === 'rect') {
          ctx.save()
          ctx.strokeStyle = col
          ctx.fillStyle = `${col}18`
          const x = Math.min(a1.x, a2.x)
          const yy = Math.min(a1.y, a2.y)
          const rw = Math.abs(a2.x - a1.x)
          const rh = Math.abs(a2.y - a1.y)
          ctx.fillRect(x, yy, rw, rh)
          ctx.strokeRect(x, yy, rw, rh)
          ctx.restore()
        } else if (pr.kind === 'trend') {
          drawExtendedLine(ctx, a1.x, a1.y, a2.x, a2.y, w, h)
        } else if (pr.kind === 'measure_seg') {
          ctx.beginPath()
          ctx.moveTo(a1.x, a1.y)
          ctx.lineTo(a2.x, a2.y)
          ctx.stroke()
        } else if (pr.kind === 'ray') {
          drawRay(ctx, a1.x, a1.y, a2.x, a2.y, w, h)
        }
      }
    }

    if (draft) {
      ctx.save()
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = col
      const x0 = draft.x1
      const y0 = draft.y1
      const xm = draft.curX ?? x0
      const ym = draft.curY ?? y0
      if (draft.kind === 'rect' || draft.kind === 'zoom') {
        ctx.strokeRect(Math.min(x0, xm), Math.min(y0, ym), Math.abs(xm - x0), Math.abs(ym - y0))
      } else if (draft.kind === 'measure' || draft.kind === 'trend' || draft.kind === 'ray' || draft.kind === 'fib') {
        if (draft.kind === 'trend') drawExtendedLine(ctx, x0, y0, xm, ym, w, h)
        else {
          ctx.beginPath()
          ctx.moveTo(x0, y0)
          ctx.lineTo(xm, ym)
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    if (measureLabel) {
      ctx.fillStyle = getUiTheme() === 'dark' ? 'rgba(30,34,45,0.92)' : 'rgba(255,255,255,0.95)'
      ctx.strokeStyle = col
      const boxW = Math.min(240, w - measureLabel.x - 4)
      ctx.fillRect(measureLabel.x, measureLabel.y - 18, boxW, 40)
      ctx.strokeRect(measureLabel.x, measureLabel.y - 18, boxW, 40)
      ctx.fillStyle = getUiTheme() === 'dark' ? '#d1d4dc' : '#131722'
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillText(measureLabel.text, measureLabel.x + 6, measureLabel.y)
    }
  }

  function onPointerDown(e: PointerEvent) {
    if (tool === 'crosshair') return
    if (lockDrawings && tool !== 'zoom') return
    const bars = getBars()
    if (bars.length < 2) return
    const rect = drawCanvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const tp = timePriceFromXY(chart, series, x, y, bars, magnet)
    if (!tp) return

    if (tool === 'hline') {
      primitives.push({ kind: 'hline', price: tp.price })
      finishOrStayAfterShape()
      paint()
      repaintShades()
      return
    }

    if (tool === 'text') {
      openTextEditor(x, y, tp.t, tp.price)
      return
    }

    if (tool === 'rect' || tool === 'zoom') {
      draft = { kind: tool, t1: tp.t, p1: tp.price, x1: x, y1: y, curX: x, curY: y }
      drawCanvas.setPointerCapture(e.pointerId)
      paint()
      return
    }

    /* Two-click tools: no pointer capture (avoids stuck capture on mouse-up between clicks). */

    if (draft && (tool === 'trend' || tool === 'ray' || tool === 'fib' || tool === 'measure')) {
      if (tool === 'trend') {
        primitives.push({ kind: 'trend', t1: draft.t1, p1: draft.p1, t2: tp.t, p2: tp.price })
      } else if (tool === 'ray') {
        primitives.push({ kind: 'ray', t1: draft.t1, p1: draft.p1, t2: tp.t, p2: tp.price })
      } else if (tool === 'fib') {
        primitives.push({ kind: 'fib', t1: draft.t1, p1: draft.p1, t2: tp.t, p2: tp.price })
      } else if (tool === 'measure') {
        const t0 = draft.t1
        const p0 = draft.p1
        const dp = tp.price - p0
        const pct = p0 !== 0 ? (dp / p0) * 100 : 0
        const logA = chart.timeScale().coordinateToLogical(draft.x1)
        const logB = chart.timeScale().coordinateToLogical(x)
        const barDelta =
          logA != null && logB != null
            ? Math.abs(logicalToBarIndex(bars, logB) - logicalToBarIndex(bars, logA))
            : 0
        primitives.push({ kind: 'measure_seg', t1: t0, p1: p0, t2: tp.t, p2: tp.price })
        measureLabel = {
          x: Math.min(draft.x1, x) + 8,
          y: Math.min(draft.y1, y) + 24,
          text: `Δ ${dp >= 0 ? '+' : ''}${dp.toFixed(3)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%) · ${barDelta} bars`,
        }
      }
      finishOrStayAfterShape()
      paint()
      repaintShades()
      return
    }

    if (tool === 'trend' || tool === 'ray' || tool === 'fib' || tool === 'measure') {
      draft = { kind: tool, t1: tp.t, p1: tp.price, x1: x, y1: y }
      paint()
    }
  }

  function onPointerMove(e: PointerEvent) {
    const rect = drawCanvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (
      draft &&
      (draft.kind === 'rect' ||
        draft.kind === 'zoom' ||
        draft.kind === 'trend' ||
        draft.kind === 'ray' ||
        draft.kind === 'fib' ||
        draft.kind === 'measure')
    ) {
      draft.curX = x
      draft.curY = y
      paint()
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!draft || (draft.kind !== 'rect' && draft.kind !== 'zoom')) {
      return
    }

    const bars = getBars()
    const rect = drawCanvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const tp = timePriceFromXY(chart, series, x, y, bars, magnet)
    const tp0 = timePriceFromXY(chart, series, draft.x1, draft.y1, bars, magnet)

    try {
      drawCanvas.releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }

    const wasZoom = draft.kind === 'zoom'
    if (tp && tp0 && Math.abs(x - draft.x1) + Math.abs(y - draft.y1) > 8) {
      if (draft.kind === 'rect') {
        primitives.push({
          kind: 'rect',
          t1: tp0.t,
          p1: tp0.price,
          t2: tp.t,
          p2: tp.price,
        })
      } else {
        const log0 = chart.timeScale().coordinateToLogical(Math.min(draft.x1, x))
        const log1 = chart.timeScale().coordinateToLogical(Math.max(draft.x1, x))
        if (log0 != null && log1 != null) {
          const i0 = logicalToBarIndex(bars, log0)
          const i1 = logicalToBarIndex(bars, log1)
          chart.timeScale().setVisibleLogicalRange({ from: i0 as Logical, to: i1 as Logical })
        }
      }
    }
    draft = null
    if (!stayInDraw && wasZoom) setTool('crosshair')
    paint()
    repaintShades()
  }

  function onToolClick(e: Event) {
    const b = (e.currentTarget as HTMLElement).closest('[data-draw-tool]') as HTMLButtonElement | null
    if (!b) return
    const id = b.dataset.drawTool as DrawingToolId
    if (id) setTool(id)
  }

  function onToggleClick(e: Event) {
    const b = (e.currentTarget as HTMLElement).closest('[data-draw-toggle]') as HTMLButtonElement | null
    if (!b) return
    const k = b.dataset.drawToggle
    if (k === 'magnet') magnet = !magnet
    else if (k === 'stay') stayInDraw = !stayInDraw
    else if (k === 'lock') lockDrawings = !lockDrawings
    else if (k === 'hide') hideDrawings = !hideDrawings
    syncToolbarClasses()
    paint()
  }

  function onClear() {
    primitives.length = 0
    measureLabel = null
    draft = null
    removeTextEditor()
    paint()
    repaintShades()
  }

  function onWheel(e: WheelEvent) {
    if (tool === 'crosshair') return
    e.preventDefault()
    onWheelZoom(e.deltaY)
    requestAnimationFrame(() => {
      resizeCanvas()
      paint()
      repaintShades()
    })
  }

  const onRangeChange = () => {
    paint()
  }
  chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange)
  chart.timeScale().subscribeVisibleTimeRangeChange(onRangeChange)

  toolBtns.forEach((b) => b.addEventListener('click', onToolClick))
  toggleBtns.forEach((b) => b.addEventListener('click', onToggleClick))
  btnClear?.addEventListener('click', onClear)
  drawCanvas.addEventListener('pointerdown', onPointerDown)
  drawCanvas.addEventListener('pointermove', onPointerMove)
  drawCanvas.addEventListener('pointerup', onPointerUp)
  drawCanvas.addEventListener('pointercancel', onPointerUp)
  drawCanvas.addEventListener('wheel', onWheel, { passive: false })

  const ro = new ResizeObserver(() => resizeCanvas())
  ro.observe(chartHost)
  resizeCanvas()
  setTool('crosshair')

  const onEscKey = (e: KeyboardEvent) => {
    if (e.code !== 'Escape') return
    if (textInputEl) {
      removeTextEditor()
      finishOrStayAfterShape()
      return
    }
    if (!draft) return
    draft = null
    paint()
  }
  window.addEventListener('keydown', onEscKey, true)

  const dispose = () => {
    removeTextEditor()
    window.removeEventListener('keydown', onEscKey, true)
    chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange)
    chart.timeScale().unsubscribeVisibleTimeRangeChange(onRangeChange)
    toolBtns.forEach((b) => b.removeEventListener('click', onToolClick))
    toggleBtns.forEach((b) => b.removeEventListener('click', onToggleClick))
    btnClear?.removeEventListener('click', onClear)
    drawCanvas.removeEventListener('pointerdown', onPointerDown)
    drawCanvas.removeEventListener('pointermove', onPointerMove)
    drawCanvas.removeEventListener('pointerup', onPointerUp)
    drawCanvas.removeEventListener('pointercancel', onPointerUp)
    drawCanvas.removeEventListener('wheel', onWheel)
    ro.disconnect()
    chart.applyOptions({ crosshair: { mode: CrosshairMode.Normal } })
  }

  return { dispose, redraw: paint }
}
