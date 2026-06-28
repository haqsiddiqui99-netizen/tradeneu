import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  LineType,
  TickMarkType,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts'
import type {
  AutoscaleInfo,
  IChartApi,
  ISeriesApi,
  SeriesMarker,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { Bar } from '../types'
import { formatChartCrosshairTime } from '../data/sessionDateRange'
import type { ChartVisualKind } from './chartVisualKind'
import { isChartVisualKindEnabled } from './chartVisualKind'
import { resolveHistogramVolumes } from './volumeDisplay'

export type TradingChartTheme = 'tradingview-light' | 'terminal-dark'

export type { ChartVisualKind } from './chartVisualKind'

export type TradingChart = {
  chart: ReturnType<typeof createChart>
  /** Replace OHLCV series. Pass `{ fit: true }` on first paint / reset. `initialVisibleBarCount` zooms to the last N bars (TradingView-style first open). */
  setSeriesData: (
    bars: Bar[],
    opts?: {
      fit?: boolean
      initialVisibleBarCount?: number
      /** When set with `initialVisibleBarCount`, anchor the window at session start instead of latest bars. */
      initialVisibleAnchor?: 'start' | 'end'
      timeAxisUtcMinutes?: 5 | 10
    },
  ) => void
  /**
   * Bar replay: only `pastBars` are drawn; future bars stay hidden until playback reveals them.
   * Pass `allBars` as the full dataset. Call `clearReplay()` to restore the full series.
   */
  setReplayData: (
    pastBars: Bar[],
    allBars: Bar[],
    opts?: {
      fit?: boolean
      initialVisibleBarCount?: number
      initialVisibleAnchor?: 'start' | 'end'
      timeAxisUtcMinutes?: 5 | 10
    },
  ) => void
  /** Bar-replay pick mode: opaque bars through splitIndex, faded bars after. */
  setReplayPickPreview: (splitIndex: number, allBars: Bar[]) => void
  /** Leave pick preview; caller should call setReplayData to restore playback view. */
  clearReplayPickPreview: () => void
  /** Remove replay overlay and restore the full series to normal colours. */
  clearReplay: () => void
  /** Redraw 10-minute UTC vertical shading (call after `chart.resize`). */
  repaintTimeShades: () => void
  /** Switch TradingView-style light / dark chart chrome without reloading data. */
  applyTheme: (theme: TradingChartTheme) => void
  /** Zoom around viewport center: multiplies visible span (e.g. 0.78 zoom in, 1.32 zoom out). */
  zoomLogicalRange: (factor: number) => void
  /** Pan by logical bar indices (negative = earlier / chart moves left). */
  panLogicalRange: (deltaBars: number) => void
  /** Fit all series data into view (TradingView-style reset). */
  resetTimeScaleView: () => void
  /** Pan the viewport so the replay cursor stays in view (during bar replay, not at live end). */
  scrollReplayCursorIntoView: () => void
  /** Main OHLC/line series — for drawing tools (price ↔ coordinate). */
  getMainSeries: () => ISeriesApi<SeriesType, Time>
  /** Entry/exit markers from backtest engine (merged with replay cursor marker when active). */
  setTradeMarkers: (markers: SeriesMarker<Time>[]) => void
  getVisualKind: () => ChartVisualKind
  /** Swap main/future price series (bars, candles, line, area, …). Returns false if kind is unsupported. */
  setVisualKind: (kind: ChartVisualKind) => boolean
  /** Bumps when main series data is fully replaced (price lines must be recreated). */
  getSeriesDataRevision: () => number
  /** Keep open position prices inside the auto-scaled Y range. */
  setPositionPriceHints: (prices: number[]) => void
  dispose: () => void
}

const TV_FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, 'Segoe UI', sans-serif"

/** TradingView desktop defaults (approx.) */
const TV_UP = '#089981'
const TV_DOWN = '#f23645'
const TV_GRID_DARK = '#1e222d'
/** Light layout: subtle grid like TradingView chart area (not too faint). */
const TV_GRID_LIGHT = '#e8eaed'

// ── Replay visual constants ───────────────────────────────────────────────────
/** Muted OHLC for bars after the replay cursor (still on the time scale, visibly “ahead” of playback). */
function replayFuturePalette(theme: TradingChartTheme) {
  if (theme === 'tradingview-light') {
    return {
      candleUp: 'rgba(8, 153, 129, 0.22)',
      candleDown: 'rgba(242, 54, 69, 0.22)',
      borderUp: 'rgba(8, 153, 129, 0.32)',
      borderDown: 'rgba(242, 54, 69, 0.32)',
      wickUp: 'rgba(8, 153, 129, 0.28)',
      wickDown: 'rgba(242, 54, 69, 0.28)',
      barUp: 'rgba(8, 153, 129, 0.24)',
      barDown: 'rgba(242, 54, 69, 0.24)',
      volUp: 'rgba(8, 153, 129, 0.12)',
      volDown: 'rgba(242, 54, 69, 0.12)',
      line: 'rgba(8, 153, 129, 0.22)',
      areaLine: 'rgba(41, 98, 255, 0.26)',
      areaTop: 'rgba(41, 98, 255, 0.14)',
      areaBottom: 'rgba(41, 98, 255, 0.03)',
      baseTopLine: 'rgba(8, 153, 129, 0.22)',
      baseTopFill1: 'rgba(8, 153, 129, 0.12)',
      baseTopFill2: 'rgba(8, 153, 129, 0.03)',
      baseBottomLine: 'rgba(242, 54, 69, 0.22)',
      baseBottomFill1: 'rgba(242, 54, 69, 0.04)',
      baseBottomFill2: 'rgba(242, 54, 69, 0.1)',
    } as const
  }
  return {
    candleUp: 'rgba(8, 153, 129, 0.2)',
    candleDown: 'rgba(242, 54, 69, 0.2)',
    borderUp: 'rgba(8, 153, 129, 0.3)',
    borderDown: 'rgba(242, 54, 69, 0.3)',
    wickUp: 'rgba(8, 153, 129, 0.26)',
    wickDown: 'rgba(242, 54, 69, 0.26)',
    barUp: 'rgba(8, 153, 129, 0.22)',
    barDown: 'rgba(242, 54, 69, 0.22)',
    volUp: 'rgba(8, 153, 129, 0.1)',
    volDown: 'rgba(242, 54, 69, 0.1)',
    line: 'rgba(8, 153, 129, 0.2)',
    areaLine: 'rgba(41, 98, 255, 0.28)',
    areaTop: 'rgba(41, 98, 255, 0.14)',
    areaBottom: 'rgba(41, 98, 255, 0.04)',
    baseTopLine: 'rgba(8, 153, 129, 0.2)',
    baseTopFill1: 'rgba(8, 153, 129, 0.1)',
    baseTopFill2: 'rgba(8, 153, 129, 0.04)',
    baseBottomLine: 'rgba(242, 54, 69, 0.2)',
    baseBottomFill1: 'rgba(242, 54, 69, 0.04)',
    baseBottomFill2: 'rgba(242, 54, 69, 0.08)',
  } as const
}
/** Vertical replay-cursor line colour (TradingView blue). */
const REPLAY_LINE_COLOR = '#2962ff'
/** Width of replay vertical line on shade canvas (DOM line matches in CSS). */
const REPLAY_LINE_WIDTH_PX = 2
/** Default chart `layout.fontSize` (px). */
const CHART_LAYOUT_FONT_PX = 12
/** Target logical window width during replay. */
const REPLAY_VISIBLE_BARS = 90
/** Bar spacing during replay (px); prevents few bars from stretching across the chart. */
const REPLAY_BAR_SPACING = 6

function chartLocale(): string {
  return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US'
}

function timeScaleOptions(theme: TradingChartTheme, labelEveryMinutes: 5 | 10) {
  const borderColor = theme === 'tradingview-light' ? '#e0e3eb' : '#2a2e39'
  return {
    borderColor,
    timeVisible: true,
    secondsVisible: false,
    fontSize: CHART_LAYOUT_FONT_PX,
    tickMarkFormatter: (time: Time, tickMarkType: TickMarkType, locale: string) =>
      formatTimeAxisLocalGrid(time, tickMarkType, locale, labelEveryMinutes),
  }
}

function chartLocalization() {
  return {
    locale: chartLocale(),
    timeFormatter: (time: Time) => {
      if (typeof time !== 'number') return ''
      return formatChartCrosshairTime(time)
    },
  }
}

function chartOptions(container: HTMLElement, theme: TradingChartTheme, labelEveryMinutes: 5 | 10 = 5) {
  if (theme === 'tradingview-light') {
    return {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#131722',
        fontSize: CHART_LAYOUT_FONT_PX,
        fontFamily: TV_FONT,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: TV_GRID_LIGHT, style: LineStyle.Solid },
        horzLines: { color: TV_GRID_LIGHT, style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#9598a1',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#000000',
        },
        horzLine: {
          color: '#9598a1',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#000000',
        },
      },
      rightPriceScale: {
        borderColor: '#e0e3eb',
        textColor: '#131722',
        entireTextOnly: false,
      },
      timeScale: timeScaleOptions(theme, labelEveryMinutes),
      localization: chartLocalization(),
    } as const
  }
  return {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: {
      background: { type: ColorType.Solid, color: '#131722' },
      textColor: '#d1d4dc',
      fontSize: CHART_LAYOUT_FONT_PX,
      fontFamily: TV_FONT,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: TV_GRID_DARK, style: LineStyle.Solid },
      horzLines: { color: TV_GRID_DARK, style: LineStyle.Solid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: '#758696',
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: '#000000',
      },
      horzLine: {
        color: '#758696',
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: '#000000',
      },
    },
    rightPriceScale: {
      borderColor: '#2a2e39',
      textColor: '#d1d4dc',
      entireTextOnly: false,
    },
    timeScale: timeScaleOptions(theme, labelEveryMinutes),
    localization: chartLocalization(),
  } as const
}

function volumeHistogramColors(theme: TradingChartTheme) {
  const light = theme === 'tradingview-light'
  const volUp = light ? 'rgba(8, 153, 129, 0.34)' : 'rgba(8, 153, 129, 0.4)'
  const volDown = light ? 'rgba(242, 54, 69, 0.34)' : 'rgba(242, 54, 69, 0.4)'
  return { volUp, volDown }
}

/**
 * Empty string lets lightweight-charts tint the last-price line + scale label from the **last bar**
 * (green / red on candles) — same idea as TradingView’s horizontal last-price line.
 */
function candlePriceLineColor(_theme: TradingChartTheme): string {
  return ''
}

/** X-axis labels on N-minute local-time boundaries (matches session date picker). */
function formatTimeAxisLocalGrid(
  time: Time,
  tickMarkType: TickMarkType,
  locale: string,
  everyMinutes: 5 | 10,
): string | null {
  if (typeof time !== 'number') return null
  const d = new Date(time * 1000)
  if (tickMarkType === TickMarkType.DayOfMonth) {
    return String(d.getDate())
  }
  if (tickMarkType === TickMarkType.Month) {
    return d.toLocaleDateString(locale, { month: 'short' })
  }
  if (tickMarkType === TickMarkType.Year) {
    return String(d.getFullYear())
  }
  if (tickMarkType !== TickMarkType.Time && tickMarkType !== TickMarkType.TimeWithSeconds) return null
  if (d.getMinutes() % everyMinutes !== 0) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

const TEN_MIN_SEC = 600

function floorLocalTenMinSec(sec: number): number {
  const d = new Date(sec * 1000)
  return Math.floor(
    new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      Math.floor(d.getMinutes() / 10) * 10,
      0,
    ).getTime() / 1000,
  )
}

/** Alternating vertical bands every 10 minutes (local wall clock; 1m candles unchanged). */
function paintTenMinuteLocalBands(
  chart: IChartApi,
  canvas: HTMLCanvasElement,
  theme: TradingChartTheme,
  /** Bar-replay cursor: draw a pixel-perfect vertical line (LineSeries cannot use duplicate times). */
  replayLineUtc: number | null,
  paintCache?: { lastKey: string; dpr: number },
): void {
  const ts = chart.timeScale()
  const range = ts.getVisibleRange()
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (w < 2 || h < 2) return

  const rangeFrom = range && typeof range.from === 'number' ? range.from : ''
  const rangeTo = range && typeof range.to === 'number' ? range.to : ''
  const paintKey = `${w}|${h}|${rangeFrom}|${rangeTo}|${replayLineUtc ?? ''}|${theme}`
  if (paintCache && paintCache.lastKey === paintKey) return
  if (paintCache) paintCache.lastKey = paintKey

  const dpr = window.devicePixelRatio || 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const pw = Math.floor(w * dpr)
  const ph = Math.floor(h * dpr)
  if (canvas.width !== pw || canvas.height !== ph || paintCache?.dpr !== dpr) {
    canvas.width = pw
    canvas.height = ph
    if (paintCache) paintCache.dpr = dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  ctx.clearRect(0, 0, w, h)

  if (range && typeof range.from === 'number' && typeof range.to === 'number') {
    const from = range.from
    const to = range.to
    const onLightChart = theme === 'tradingview-light'
    const bandA = onLightChart ? 'rgba(19, 23, 34, 0.04)' : 'rgba(255, 255, 255, 0.028)'
    const bandB = onLightChart ? 'rgba(19, 23, 34, 0.075)' : 'rgba(255, 255, 255, 0.055)'

    let t = floorLocalTenMinSec(from)
    const tMax = to + TEN_MIN_SEC

    while (t < tMax) {
      const slot = Math.floor(t / TEN_MIN_SEC)
      const x1 = ts.timeToCoordinate(t as Time)
      const x2 = ts.timeToCoordinate((t + TEN_MIN_SEC) as Time)
      if (x1 !== null && x2 !== null) {
        const left = Math.min(Number(x1), Number(x2))
        const rw = Math.max(1, Math.abs(Number(x2) - Number(x1)))
        ctx.fillStyle = slot % 2 === 0 ? bandA : bandB
        ctx.fillRect(left, 0, rw, h)
      }
      t += TEN_MIN_SEC
    }
  }

  if (replayLineUtc != null && Number.isFinite(replayLineUtc)) {
    const x = chart.timeScale().timeToCoordinate(replayLineUtc as Time)
    if (x != null) {
      const xc = Number(x)
      const lw = REPLAY_LINE_WIDTH_PX
      const x0 = Math.round(xc - lw / 2)
      ctx.fillStyle = REPLAY_LINE_COLOR
      ctx.fillRect(x0, 0, lw, h)
    }
  }
}

export function createTradingChart(
  container: HTMLElement,
  opts?: { theme?: TradingChartTheme; timeAxisUtcMinutes?: 5 | 10; tenMinuteUtcShading?: boolean },
): TradingChart {
  let themeNow: TradingChartTheme = opts?.theme ?? 'tradingview-light'
  let timeAxisStep: 5 | 10 = opts?.timeAxisUtcMinutes ?? 5
  let lastBars: Bar[] = []

  const shadeEnabled = opts?.tenMinuteUtcShading ?? false
  const prev = container.previousElementSibling
  const shadeCanvas =
    shadeEnabled && prev instanceof HTMLCanvasElement && prev.classList.contains('rw-chart-shade')
      ? prev
      : null

  const chart = createChart(container, chartOptions(container, themeNow, timeAxisStep))

  /** UTC seconds of last replayed bar — vertical boundary drawn on shade canvas. */
  let replayLineUtc: number | null = null
  let shadePaintRaf = 0
  const shadePaintCache = { lastKey: '', dpr: 0 }

  const scheduleShadePaint = () => {
    if (!shadeCanvas) return
    if (shadePaintRaf) return
    shadePaintRaf = requestAnimationFrame(() => {
      shadePaintRaf = 0
      paintTenMinuteLocalBands(chart, shadeCanvas, themeNow, replayLineUtc, shadePaintCache)
    })
  }

  if (shadeCanvas) {
    chart.timeScale().subscribeVisibleTimeRangeChange(scheduleShadePaint)
    chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleShadePaint)
  }

  const up = TV_UP
  const down = TV_DOWN

  const priceFmt = { type: 'price' as const, precision: 3, minMove: 0.001 }

  let visualKind: ChartVisualKind = 'candles'
  let mainSeries!: ISeriesApi<SeriesType, Time>
  let futureSeries!: ISeriesApi<SeriesType, Time>
  let candleMarkers: ReturnType<typeof createSeriesMarkers<Time>>
  let tradeMarkers: SeriesMarker<Time>[] = []

  function hollowFillColors(): { up: string; down: string } {
    return themeNow === 'tradingview-light'
      ? { up: 'rgba(255,255,255,0.96)', down: 'rgba(255,255,255,0.96)' }
      : { up: 'rgba(19,23,34,0.96)', down: 'rgba(19,23,34,0.96)' }
  }

  function solidCandleOpts() {
    return {
      upColor: up,
      downColor: down,
      borderVisible: true,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
      wickVisible: true,
      priceLineVisible: true,
      priceLineWidth: 1 as const,
      priceLineColor: candlePriceLineColor(themeNow),
      priceLineStyle: LineStyle.Dotted,
      lastValueVisible: true,
      priceFormat: priceFmt,
    }
  }

  function hollowCandleOpts() {
    const h = hollowFillColors()
    return {
      ...solidCandleOpts(),
      upColor: h.up,
      downColor: h.down,
    }
  }

  function futureCandleOpts() {
    const fp = replayFuturePalette(themeNow)
    return {
      upColor: fp.candleUp,
      downColor: fp.candleDown,
      borderVisible: true,
      borderUpColor: fp.borderUp,
      borderDownColor: fp.borderDown,
      wickUpColor: fp.wickUp,
      wickDownColor: fp.wickDown,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: priceFmt,
    }
  }

  function futureBarOpts() {
    const fp = replayFuturePalette(themeNow)
    return {
      upColor: fp.barUp,
      downColor: fp.barDown,
      openVisible: true,
      thinBars: true,
      priceFormat: priceFmt,
      priceLineVisible: false,
      lastValueVisible: false,
    }
  }

  function addMainFutureForKind(kind: ChartVisualKind): void {
    visualKind = kind
    switch (kind) {
      case 'candles':
        mainSeries = chart.addSeries(CandlestickSeries, solidCandleOpts())
        futureSeries = chart.addSeries(CandlestickSeries, futureCandleOpts())
        break
      case 'hollow_candles':
        mainSeries = chart.addSeries(CandlestickSeries, hollowCandleOpts())
        futureSeries = chart.addSeries(CandlestickSeries, futureCandleOpts())
        break
      case 'bars':
        mainSeries = chart.addSeries(BarSeries, {
          upColor: up,
          downColor: down,
          thinBars: true,
          openVisible: true,
          priceFormat: priceFmt,
          priceLineVisible: true,
          priceLineStyle: LineStyle.Dotted,
          priceLineWidth: 1 as const,
          priceLineColor: candlePriceLineColor(themeNow),
          lastValueVisible: true,
        })
        futureSeries = chart.addSeries(BarSeries, futureBarOpts())
        break
      case 'columns':
        mainSeries = chart.addSeries(BarSeries, {
          upColor: up,
          downColor: down,
          thinBars: false,
          openVisible: true,
          priceFormat: priceFmt,
          priceLineVisible: true,
          priceLineStyle: LineStyle.Dotted,
          priceLineWidth: 1 as const,
          priceLineColor: candlePriceLineColor(themeNow),
          lastValueVisible: true,
        })
        futureSeries = chart.addSeries(BarSeries, { ...futureBarOpts(), thinBars: false })
        break
      case 'high_low':
        mainSeries = chart.addSeries(BarSeries, {
          upColor: up,
          downColor: down,
          thinBars: true,
          openVisible: false,
          priceFormat: priceFmt,
          priceLineVisible: true,
          priceLineStyle: LineStyle.Dotted,
          priceLineWidth: 1 as const,
          priceLineColor: candlePriceLineColor(themeNow),
          lastValueVisible: true,
        })
        futureSeries = chart.addSeries(BarSeries, { ...futureBarOpts(), openVisible: false })
        break
      case 'line':
      case 'line_markers':
      case 'step_line':
        mainSeries = chart.addSeries(LineSeries, {
          color: up,
          lineWidth: 2,
          lineType: kind === 'step_line' ? LineType.WithSteps : LineType.Simple,
          pointMarkersVisible: kind === 'line_markers',
          pointMarkersRadius: kind === 'line_markers' ? 3 : undefined,
          priceFormat: priceFmt,
          priceLineVisible: true,
          priceLineStyle: LineStyle.Dotted,
          priceLineWidth: 1 as const,
          priceLineColor: candlePriceLineColor(themeNow),
          lastValueVisible: true,
          crosshairMarkerVisible: true,
        })
        futureSeries = chart.addSeries(LineSeries, {
          color: replayFuturePalette(themeNow).line,
          lineWidth: 2,
          lineType: kind === 'step_line' ? LineType.WithSteps : LineType.Simple,
          pointMarkersVisible: false,
          priceFormat: priceFmt,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        break
      case 'area':
      case 'hlc_area':
        mainSeries = chart.addSeries(AreaSeries, {
          lineColor: up,
          topColor: themeNow === 'tradingview-light' ? 'rgba(41, 98, 255, 0.35)' : 'rgba(41, 98, 255, 0.45)',
          bottomColor:
            themeNow === 'tradingview-light' ? 'rgba(41, 98, 255, 0.02)' : 'rgba(41, 98, 255, 0.06)',
          lineWidth: 2,
          priceFormat: priceFmt,
          priceLineVisible: true,
          priceLineStyle: LineStyle.Dotted,
          priceLineWidth: 1 as const,
          priceLineColor: candlePriceLineColor(themeNow),
          lastValueVisible: true,
        })
        futureSeries = chart.addSeries(AreaSeries, {
          lineColor: replayFuturePalette(themeNow).areaLine,
          topColor: replayFuturePalette(themeNow).areaTop,
          bottomColor: replayFuturePalette(themeNow).areaBottom,
          lineWidth: 2,
          priceFormat: priceFmt,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        break
      case 'baseline': {
        const base =
          lastBars.length > 0 ? lastBars[Math.floor(lastBars.length / 2)]!.close : 0
        mainSeries = chart.addSeries(BaselineSeries, {
          baseValue: { type: 'price', price: base },
          topLineColor: up,
          topFillColor1: themeNow === 'tradingview-light' ? 'rgba(8, 153, 129, 0.35)' : 'rgba(8, 153, 129, 0.4)',
          topFillColor2: 'rgba(8, 153, 129, 0.05)',
          bottomLineColor: down,
          bottomFillColor1: 'rgba(242, 54, 69, 0.05)',
          bottomFillColor2: themeNow === 'tradingview-light' ? 'rgba(242, 54, 69, 0.32)' : 'rgba(242, 54, 69, 0.38)',
          lineWidth: 2,
          priceFormat: priceFmt,
          priceLineVisible: true,
          priceLineStyle: LineStyle.Dotted,
          priceLineWidth: 1 as const,
          priceLineColor: candlePriceLineColor(themeNow),
          lastValueVisible: true,
        })
        futureSeries = chart.addSeries(BaselineSeries, {
          baseValue: { type: 'price', price: base },
          topLineColor: replayFuturePalette(themeNow).baseTopLine,
          topFillColor1: replayFuturePalette(themeNow).baseTopFill1,
          topFillColor2: replayFuturePalette(themeNow).baseTopFill2,
          bottomLineColor: replayFuturePalette(themeNow).baseBottomLine,
          bottomFillColor1: replayFuturePalette(themeNow).baseBottomFill1,
          bottomFillColor2: replayFuturePalette(themeNow).baseBottomFill2,
          lineWidth: 2,
          priceFormat: priceFmt,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        break
      }
      default:
        visualKind = 'candles'
        mainSeries = chart.addSeries(CandlestickSeries, solidCandleOpts())
        futureSeries = chart.addSeries(CandlestickSeries, futureCandleOpts())
        break
    }

    mainSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.08, bottom: 0.2 },
    })
    futureSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.08, bottom: 0.2 },
    })
    applyPositionAutoscaleProvider()
  }

  addMainFutureForKind('candles')
  candleMarkers = createSeriesMarkers(mainSeries, [])

  const volume = chart.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: '',
    lastValueVisible: false,
  })
  volume.priceScale().applyOptions({
    scaleMargins: { top: 0.85, bottom: 0 },
  })

  const futureVolume = chart.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: '',
    color: replayFuturePalette(themeNow).volUp,
    lastValueVisible: false,
  })
  futureVolume.priceScale().applyOptions({
    scaleMargins: { top: 0.85, bottom: 0 },
  })

  futureSeries.setData([])
  futureVolume.setData([])

  let barCount = 0
  /** When non-null and shorter than `lastBars`, bar replay is in progress (future bars hidden). */
  let lastPastSnapshot: Bar[] | null = null
  let pickPreviewActive = false
  let lastPickPreviewSplit = -1
  let lastReplayRightOffset = 0
  let seriesDataRevision = 0
  let positionPriceHints: number[] = []

  function positionAutoscaleProvider(original: () => AutoscaleInfo | null): AutoscaleInfo | null {
    const base = original()
    if (!positionPriceHints.length || base?.priceRange == null) return base
    let min = base.priceRange.minValue
    let max = base.priceRange.maxValue
    for (const p of positionPriceHints) {
      if (!Number.isFinite(p)) continue
      min = Math.min(min, p)
      max = Math.max(max, p)
    }
    return { ...base, priceRange: { minValue: min, maxValue: max } }
  }

  function applyPositionAutoscaleProvider() {
    mainSeries.applyOptions({ autoscaleInfoProvider: positionAutoscaleProvider })
  }

  function bumpSeriesDataRevision() {
    seriesDataRevision += 1
  }

  function syncReplayCursorLine(pastCount: number, allBars: Bar[]) {
    replayLineUtc = pastCount > 0 ? allBars[pastCount - 1]!.time : null
    scheduleShadePaint()
  }

  function syncReplayFutureBars(pastCount: number, allBars: Bar[]) {
    if (pickPreviewActive) {
      setFutureDataFromBars(allBars.slice(pastCount))
    } else {
      futureSeries.setData([] as never)
      futureVolume.setData([])
    }
    syncReplayCursorLine(pastCount, allBars)
  }

  function appendBarToMain(b: Bar, volumeContext?: Bar[]) {
    const t = mainSeries.seriesType()
    if (t === 'Candlestick' || t === 'Bar') {
      mainSeries.update({
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      } as never)
    } else if (t === 'Line') {
      mainSeries.update({ time: b.time, value: b.close } as never)
    } else if (t === 'Area') {
      mainSeries.update({
        time: b.time,
        value: visualKind === 'hlc_area' ? (b.high + b.low + b.close) / 3 : b.close,
      } as never)
    } else if (t === 'Baseline') {
      mainSeries.update({ time: b.time, value: b.close } as never)
    }
    const barsForVol = volumeContext?.length ? volumeContext : [b]
    const { volUp, volDown } = volumeHistogramColors(themeNow)
    const { values } = resolveHistogramVolumes(barsForVol)
    volume.update({
      time: b.time,
      value: values[barsForVol.length - 1] ?? 0,
      color: b.close >= b.open ? volUp : volDown,
    })
  }

  function replayInProgress(): boolean {
    return (
      !pickPreviewActive &&
      lastPastSnapshot !== null &&
      lastPastSnapshot.length < lastBars.length
    )
  }

  /** Replay session is active (including fully revealed bars) — keeps right whitespace for trade UI. */
  function replayLayoutActive(): boolean {
    return !pickPreviewActive && lastPastSnapshot !== null && lastBars.length > 0
  }

  function replayTimeScaleOptions(rightOffset = lastReplayRightOffset) {
    return {
      ...timeScaleOptions(themeNow, timeAxisStep),
      rightOffset: replayLayoutActive() ? rightOffset : 0,
      barSpacing: replayLayoutActive() ? REPLAY_BAR_SPACING : 6,
      minBarSpacing: 0.5,
    }
  }

  function syncReplayTimeScaleExtras(rightOffset = lastReplayRightOffset) {
    lastReplayRightOffset = rightOffset
    chart.applyOptions({ timeScale: replayTimeScaleOptions(rightOffset) })
  }

  /**
   * FXReplay-style viewport: fixed bar width, history from bar 0, cursor ~mid-screen,
   * empty grid on the right for bars revealed during playback.
   */
  function applyReplayViewport(ts: ReturnType<IChartApi['timeScale']>, span = REPLAY_VISIBLE_BARS) {
    const maxI = logicalMax()
    const windowBars = Math.max(30, Math.floor(span))
    const historyHalf = Math.floor(windowBars / 2)
    const cursor =
      lastPastSnapshot !== null && lastPastSnapshot.length > 0
        ? Math.min(lastPastSnapshot.length - 1, maxI)
        : maxI

    const from = cursor <= historyHalf ? 0 : cursor - historyHalf + 1
    const to = Math.min(maxI, Math.max(cursor + historyHalf, from + windowBars - 1))
    const rightOffset = replayLayoutActive() ? historyHalf : 0

    syncReplayTimeScaleExtras(rightOffset)
    ts.setVisibleLogicalRange({ from, to })
    scheduleShadePaint()
  }

  function logicalMax(): number {
    return Math.max(0, barCount - 1)
  }

  function volumeDataFromBars(bars: Bar[]) {
    const { volUp, volDown } = volumeHistogramColors(themeNow)
    const { values } = resolveHistogramVolumes(bars)
    return bars.map((b, i) => ({
      time: b.time,
      value: values[i] ?? 0,
      color: b.close >= b.open ? volUp : volDown,
    }))
  }

  /** Muted OHLC + volume for bars after the bar-pick / replay cursor. */
  function setFutureDataFromBars(bars: Bar[]) {
    if (!bars.length) {
      futureSeries.setData([] as never)
      futureVolume.setData([])
      return
    }
    const t = futureSeries.seriesType()
    if (t === 'Candlestick' || t === 'Bar') {
      futureSeries.setData(ohlcRows(bars) as never)
    } else if (t === 'Line') {
      futureSeries.setData(valueRows(bars, false) as never)
    } else if (t === 'Area') {
      futureSeries.setData(valueRows(bars, visualKind === 'hlc_area') as never)
    } else if (t === 'Baseline') {
      futureSeries.setData(valueRows(bars, false) as never)
    }
    const fp = replayFuturePalette(themeNow)
    const { values } = resolveHistogramVolumes(bars)
    futureVolume.setData(
      bars.map((b, i) => ({
        time: b.time,
        value: values[i] ?? 0,
        color: b.close >= b.open ? fp.volUp : fp.volDown,
      })),
    )
  }

  /** Normal main-series chrome after replay or theme change. */
  function applyMainSeriesForCurrentThemeAndKind() {
    const t = mainSeries.seriesType()
    if (t === 'Candlestick') {
      mainSeries.applyOptions(
        (visualKind === 'hollow_candles' ? hollowCandleOpts() : solidCandleOpts()) as never,
      )
    } else if (t === 'Bar') {
      mainSeries.applyOptions({
        upColor: up,
        downColor: down,
        priceLineVisible: true,
        priceLineStyle: LineStyle.Dotted,
        priceLineWidth: 1 as const,
        priceLineColor: candlePriceLineColor(themeNow),
        lastValueVisible: true,
      } as never)
    } else if (t === 'Line') {
      mainSeries.applyOptions({
        color: up,
        priceLineVisible: true,
        priceLineStyle: LineStyle.Dotted,
        priceLineWidth: 1 as const,
        priceLineColor: candlePriceLineColor(themeNow),
        lastValueVisible: true,
        crosshairMarkerVisible: true,
      } as never)
    } else if (t === 'Area') {
      mainSeries.applyOptions({
        lineColor: up,
        priceLineVisible: true,
        priceLineStyle: LineStyle.Dotted,
        priceLineWidth: 1 as const,
        priceLineColor: candlePriceLineColor(themeNow),
        lastValueVisible: true,
        topColor: themeNow === 'tradingview-light' ? 'rgba(41, 98, 255, 0.35)' : 'rgba(41, 98, 255, 0.45)',
        bottomColor:
          themeNow === 'tradingview-light' ? 'rgba(41, 98, 255, 0.02)' : 'rgba(41, 98, 255, 0.06)',
      } as never)
    } else if (t === 'Baseline') {
      mainSeries.applyOptions({
        topLineColor: up,
        bottomLineColor: down,
        priceLineVisible: true,
        priceLineStyle: LineStyle.Dotted,
        priceLineWidth: 1 as const,
        priceLineColor: candlePriceLineColor(themeNow),
        lastValueVisible: true,
      } as never)
    }
  }

  function refreshFutureReplayStyle() {
    const t = futureSeries.seriesType()
    const fp = replayFuturePalette(themeNow)
    if (t === 'Candlestick') {
      futureSeries.applyOptions(futureCandleOpts() as never)
    } else if (t === 'Bar') {
      futureSeries.applyOptions({
        upColor: fp.barUp,
        downColor: fp.barDown,
        priceFormat: priceFmt,
        priceLineVisible: false,
        lastValueVisible: false,
      } as never)
    } else if (t === 'Line') {
      futureSeries.applyOptions({ color: fp.line } as never)
    } else if (t === 'Area') {
      futureSeries.applyOptions({
        lineColor: fp.areaLine,
        topColor: fp.areaTop,
        bottomColor: fp.areaBottom,
      } as never)
    } else if (t === 'Baseline') {
      futureSeries.applyOptions({
        topLineColor: fp.baseTopLine,
        topFillColor1: fp.baseTopFill1,
        topFillColor2: fp.baseTopFill2,
        bottomLineColor: fp.baseBottomLine,
        bottomFillColor1: fp.baseBottomFill1,
        bottomFillColor2: fp.baseBottomFill2,
      } as never)
    }
    futureVolume.applyOptions({ color: fp.volUp } as never)
  }

  function applyTimeAxisAndFit(opts?: {
    fit?: boolean
    initialVisibleBarCount?: number
    initialVisibleAnchor?: 'start' | 'end'
    timeAxisUtcMinutes?: 5 | 10
  }) {
    if (opts?.timeAxisUtcMinutes != null) {
      timeAxisStep = opts.timeAxisUtcMinutes
      chart.applyOptions({ timeScale: replayTimeScaleOptions() })
    }
    scheduleShadePaint()
    if (replayInProgress()) {
      /* Only fit viewport on first paint / explicit seek — not every playback tick. */
      if (opts?.fit || opts?.initialVisibleBarCount != null) {
        requestAnimationFrame(() => {
          applyReplayViewport(
            chart.timeScale(),
            opts?.initialVisibleBarCount ?? REPLAY_VISIBLE_BARS,
          )
        })
      }
      return
    }
    if (!opts?.fit) return
    const ts = chart.timeScale()
    const win = opts.initialVisibleBarCount
    if (win != null && win > 0 && barCount >= 1) {
      const maxI = logicalMax()
      const visible = Math.min(Math.floor(win), barCount)
      const anchorStart = opts?.initialVisibleAnchor === 'start'
      const from = anchorStart ? 0 : Math.max(0, maxI - visible + 1)
      const to = anchorStart ? Math.min(maxI, visible - 1) : maxI
      requestAnimationFrame(() => {
        ts.setVisibleLogicalRange({ from, to })
        scheduleShadePaint()
      })
    } else {
      requestAnimationFrame(() => {
        ts.fitContent()
        scheduleShadePaint()
      })
    }
  }

  function ohlcRows(bars: Bar[]) {
    return bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }))
  }

  function valueRows(bars: Bar[], useHlc: boolean) {
    return bars.map((b) => ({
      time: b.time,
      value: useHlc ? (b.high + b.low + b.close) / 3 : b.close,
    }))
  }

  function setMainDataFromBars(bars: Bar[]) {
    const t = mainSeries.seriesType()
    if (t === 'Candlestick' || t === 'Bar') {
      mainSeries.setData(ohlcRows(bars) as never)
    } else if (t === 'Line') {
      mainSeries.setData(valueRows(bars, false) as never)
    } else if (t === 'Area') {
      mainSeries.setData(valueRows(bars, visualKind === 'hlc_area') as never)
    } else if (t === 'Baseline') {
      mainSeries.setData(valueRows(bars, false) as never)
    }
  }

  function applyCandleMarkers() {
    const merged: SeriesMarker<Time>[] = [...tradeMarkers]
    merged.sort((a, b) => Number(a.time) - Number(b.time))
    candleMarkers.setMarkers(merged)
  }

  function redoDisplayAfterKindSwitch() {
    if (lastPastSnapshot !== null && lastPastSnapshot.length && lastBars.length) {
      setMainDataFromBars(lastPastSnapshot)
      volume.setData(volumeDataFromBars(lastPastSnapshot))
      barCount = replayInProgress() || pickPreviewActive ? lastPastSnapshot.length : lastBars.length
      if (replayInProgress() || pickPreviewActive) {
        syncReplayFutureBars(lastPastSnapshot.length, lastBars)
      } else {
        futureSeries.setData([] as never)
        futureVolume.setData([])
        replayLineUtc = null
      }
      applyCandleMarkers()
      applyMainSeriesForCurrentThemeAndKind()
      refreshFutureReplayStyle()
    } else if (lastBars.length) {
      setMainDataFromBars(lastBars)
      volume.setData(volumeDataFromBars(lastBars))
      futureSeries.setData([] as never)
      futureVolume.setData([])
      replayLineUtc = null
      applyCandleMarkers()
      applyMainSeriesForCurrentThemeAndKind()
      refreshFutureReplayStyle()
    } else {
      futureSeries.setData([] as never)
      futureVolume.setData([])
      replayLineUtc = null
      applyCandleMarkers()
    }
  }

  return {
    chart,

    setSeriesData(
      bars: Bar[],
      opts?: {
        fit?: boolean
        initialVisibleBarCount?: number
        initialVisibleAnchor?: 'start' | 'end'
        timeAxisUtcMinutes?: 5 | 10
      },
    ) {
      lastBars = bars
      barCount = bars.length
      bumpSeriesDataRevision()
      setMainDataFromBars(bars)
      volume.setData(volumeDataFromBars(bars))

      futureSeries.setData([] as never)
      futureVolume.setData([])
      lastPastSnapshot = null
      replayLineUtc = null
      shadePaintCache.lastKey = ''
      applyCandleMarkers()

      syncReplayTimeScaleExtras()
      applyMainSeriesForCurrentThemeAndKind()
      refreshFutureReplayStyle()
      applyTimeAxisAndFit(opts)
    },

    setReplayData(
      pastBars: Bar[],
      allBars: Bar[],
      opts?: {
        fit?: boolean
        initialVisibleBarCount?: number
        initialVisibleAnchor?: 'start' | 'end'
        timeAxisUtcMinutes?: 5 | 10
      },
    ) {
      if (!pastBars.length || !allBars.length) return

      pickPreviewActive = false

      const canAppendOne =
        lastPastSnapshot !== null &&
        lastBars.length === allBars.length &&
        pastBars.length === lastPastSnapshot.length + 1 &&
        pastBars[pastBars.length - 1]!.time === allBars[pastBars.length - 1]!.time

      if (canAppendOne) {
        const b = pastBars[pastBars.length - 1]!
        appendBarToMain(b, pastBars)
        lastPastSnapshot = pastBars
        barCount = pastBars.length
        syncReplayFutureBars(pastBars.length, allBars)
        const ts = chart.timeScale()
        const r = ts.getVisibleLogicalRange()
        const cursor = pastBars.length - 1
        if (r && cursor > r.to - 3) {
          const shift = cursor - (r.to - 3)
          ts.setVisibleLogicalRange({ from: r.from + shift, to: r.to + shift })
        }
        applyTimeAxisAndFit(opts)
        return
      }

      lastPastSnapshot = pastBars
      lastBars = allBars
      barCount = pastBars.length < allBars.length ? pastBars.length : allBars.length

      bumpSeriesDataRevision()
      setMainDataFromBars(pastBars)
      volume.setData(volumeDataFromBars(pastBars))
      syncReplayFutureBars(pastBars.length, allBars)

      applyCandleMarkers()

      applyMainSeriesForCurrentThemeAndKind()
      refreshFutureReplayStyle()
      if (replayLayoutActive()) {
        const historyHalf = Math.floor(Math.max(30, REPLAY_VISIBLE_BARS) / 2)
        syncReplayTimeScaleExtras(historyHalf)
      }
      applyTimeAxisAndFit(opts)
    },

    setReplayPickPreview(splitIndex: number, allBars: Bar[]) {
      if (!allBars.length) return
      const idx = Math.max(0, Math.min(allBars.length - 1, splitIndex))
      if (pickPreviewActive && idx === lastPickPreviewSplit) return

      const past = allBars.slice(0, idx + 1)
      const firstPick = !pickPreviewActive
      const movedForward = pickPreviewActive && idx === lastPickPreviewSplit + 1

      pickPreviewActive = true
      lastPickPreviewSplit = idx
      lastPastSnapshot = past
      lastBars = allBars
      barCount = allBars.length

      if (movedForward) {
        appendBarToMain(allBars[idx]!, past)
      } else {
        bumpSeriesDataRevision()
        setMainDataFromBars(past)
        volume.setData(volumeDataFromBars(past))
      }
      setFutureDataFromBars(allBars.slice(idx + 1))

      syncReplayCursorLine(past.length, allBars)

      if (firstPick) {
        applyCandleMarkers()
        applyMainSeriesForCurrentThemeAndKind()
        refreshFutureReplayStyle()
      }
      /* Do not touch timeScale here — avoids visible-range feedback loops while picking. */
    },

    clearReplayPickPreview() {
      if (!pickPreviewActive) return
      pickPreviewActive = false
      lastPickPreviewSplit = -1
      shadePaintCache.lastKey = ''
      futureSeries.setData([] as never)
      futureVolume.setData([])
      replayLineUtc = null
      refreshFutureReplayStyle()
      scheduleShadePaint()
    },

    clearReplay() {
      pickPreviewActive = false
      lastPickPreviewSplit = -1
      lastPastSnapshot = null
      replayLineUtc = null
      lastReplayRightOffset = 0
      shadePaintCache.lastKey = ''
      futureSeries.setData([] as never)
      futureVolume.setData([])
      applyCandleMarkers()
      if (lastBars.length) {
        setMainDataFromBars(lastBars)
        volume.setData(volumeDataFromBars(lastBars))
        barCount = lastBars.length
      }
      syncReplayTimeScaleExtras()
      applyMainSeriesForCurrentThemeAndKind()
      refreshFutureReplayStyle()
    },

    repaintTimeShades: scheduleShadePaint,

    applyTheme(next: TradingChartTheme) {
      themeNow = next
      shadePaintCache.lastKey = ''
      chart.applyOptions(chartOptions(container, themeNow, timeAxisStep))
      applyMainSeriesForCurrentThemeAndKind()
      refreshFutureReplayStyle()
      syncReplayTimeScaleExtras(0)
      if (lastPastSnapshot !== null && lastBars.length && (replayInProgress() || pickPreviewActive)) {
        volume.setData(volumeDataFromBars(lastPastSnapshot))
        syncReplayFutureBars(lastPastSnapshot.length, lastBars)
        requestAnimationFrame(() => applyReplayViewport(chart.timeScale()))
      } else if (lastPastSnapshot !== null && lastBars.length) {
        volume.setData(volumeDataFromBars(lastPastSnapshot))
        futureSeries.setData([] as never)
        futureVolume.setData([])
      } else if (lastBars.length) {
        volume.setData(volumeDataFromBars(lastBars))
      }
      scheduleShadePaint()
    },

    zoomLogicalRange(factor: number) {
      const ts = chart.timeScale()
      const r = ts.getVisibleLogicalRange()
      const maxI = logicalMax()
      if (!r || barCount < 2 || maxI < 1) return
      const span = Math.max(r.to - r.from, 4)
      const maxSpan = Math.max(4, maxI + 1)
      const mid = (r.from + r.to) / 2
      const newSpan = Math.max(5, Math.min(span * factor, maxSpan))
      const newHalf = newSpan / 2
      let from = mid - newHalf
      let to = mid + newHalf
      const minSpan = 5
      if (to - from < minSpan) {
        const pad = (minSpan - (to - from)) / 2
        from -= pad
        to += pad
      }
      if (from < 0) {
        to -= from
        from = 0
      }
      if (to > maxI) {
        from -= to - maxI
        to = maxI
      }
      if (from < 0) from = 0
      if (to <= from) to = Math.min(maxI, from + minSpan)
      ts.setVisibleLogicalRange({ from, to })
      scheduleShadePaint()
    },

    panLogicalRange(deltaBars: number) {
      const ts = chart.timeScale()
      const r = ts.getVisibleLogicalRange()
      const maxI = logicalMax()
      if (!r || barCount < 2) return
      const span = r.to - r.from
      let from = r.from + deltaBars
      let to = r.to + deltaBars
      if (from < 0) {
        to -= from
        from = 0
      }
      if (to > maxI) {
        from -= to - maxI
        to = maxI
      }
      if (from < 0) from = 0
      if (to < from + 4) to = Math.min(maxI, from + Math.max(span, 4))
      ts.setVisibleLogicalRange({ from, to })
      scheduleShadePaint()
    },

    resetTimeScaleView() {
      chart.timeScale().fitContent()
      scheduleShadePaint()
    },

    scrollReplayCursorIntoView() {
      if (lastPastSnapshot === null || !lastPastSnapshot.length) return
      applyReplayViewport(chart.timeScale())
    },

    getMainSeries: () => mainSeries,

    setTradeMarkers(markers: SeriesMarker<Time>[]) {
      tradeMarkers = markers.slice()
      applyCandleMarkers()
    },

    getVisualKind: () => visualKind,

    setVisualKind(kind: ChartVisualKind) {
      if (!isChartVisualKindEnabled(kind)) return false
      if (kind === visualKind) return true
      candleMarkers.detach()
      chart.removeSeries(mainSeries)
      chart.removeSeries(futureSeries)
      addMainFutureForKind(kind)
      candleMarkers = createSeriesMarkers(mainSeries, [])
      bumpSeriesDataRevision()
      redoDisplayAfterKindSwitch()
      scheduleShadePaint()
      return true
    },

    getSeriesDataRevision: () => seriesDataRevision,

    setPositionPriceHints(prices: number[]) {
      positionPriceHints = prices.filter((p) => Number.isFinite(p))
      applyPositionAutoscaleProvider()
    },

    dispose() {
      candleMarkers.detach()
      if (shadePaintRaf) cancelAnimationFrame(shadePaintRaf)
      if (shadeCanvas) {
        chart.timeScale().unsubscribeVisibleTimeRangeChange(scheduleShadePaint)
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleShadePaint)
      }
      chart.remove()
    },
  }
}
