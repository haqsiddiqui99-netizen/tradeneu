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
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import type { Bar } from '../types'
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
    opts?: { fit?: boolean; initialVisibleBarCount?: number; timeAxisUtcMinutes?: 5 | 10 },
  ) => void
  /**
   * Bar replay: `pastBars` on the main series at full colour + volume; bars after the cursor
   * stay on a second series with **muted** styling so the full session remains on the time scale
   * and candles are still visible. Black square marker at the replay bar.
   * Pass `allBars` as the full dataset. Call `clearReplay()` to merge back to a single visible path.
   */
  setReplayData: (
    pastBars: Bar[],
    allBars: Bar[],
    opts?: { fit?: boolean; initialVisibleBarCount?: number; timeAxisUtcMinutes?: 5 | 10 },
  ) => void
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
  /** Main OHLC/line series — for drawing tools (price ↔ coordinate). */
  getMainSeries: () => ISeriesApi<SeriesType, Time>
  getVisualKind: () => ChartVisualKind
  /** Swap main/future price series (bars, candles, line, area, …). Returns false if kind is unsupported. */
  setVisualKind: (kind: ChartVisualKind) => boolean
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
      candleUp: 'rgba(8, 153, 129, 0.38)',
      candleDown: 'rgba(242, 54, 69, 0.38)',
      borderUp: 'rgba(8, 153, 129, 0.52)',
      borderDown: 'rgba(242, 54, 69, 0.52)',
      wickUp: 'rgba(8, 153, 129, 0.48)',
      wickDown: 'rgba(242, 54, 69, 0.48)',
      barUp: 'rgba(8, 153, 129, 0.42)',
      barDown: 'rgba(242, 54, 69, 0.42)',
      volUp: 'rgba(8, 153, 129, 0.24)',
      volDown: 'rgba(242, 54, 69, 0.24)',
      line: 'rgba(8, 153, 129, 0.38)',
      areaLine: 'rgba(41, 98, 255, 0.4)',
      areaTop: 'rgba(41, 98, 255, 0.22)',
      areaBottom: 'rgba(41, 98, 255, 0.05)',
      baseTopLine: 'rgba(8, 153, 129, 0.36)',
      baseTopFill1: 'rgba(8, 153, 129, 0.2)',
      baseTopFill2: 'rgba(8, 153, 129, 0.05)',
      baseBottomLine: 'rgba(242, 54, 69, 0.36)',
      baseBottomFill1: 'rgba(242, 54, 69, 0.06)',
      baseBottomFill2: 'rgba(242, 54, 69, 0.18)',
    } as const
  }
  return {
    candleUp: 'rgba(8, 153, 129, 0.34)',
    candleDown: 'rgba(242, 54, 69, 0.34)',
    borderUp: 'rgba(8, 153, 129, 0.48)',
    borderDown: 'rgba(242, 54, 69, 0.48)',
    wickUp: 'rgba(8, 153, 129, 0.44)',
    wickDown: 'rgba(242, 54, 69, 0.44)',
    barUp: 'rgba(8, 153, 129, 0.38)',
    barDown: 'rgba(242, 54, 69, 0.38)',
    volUp: 'rgba(8, 153, 129, 0.22)',
    volDown: 'rgba(242, 54, 69, 0.22)',
    line: 'rgba(8, 153, 129, 0.34)',
    areaLine: 'rgba(41, 98, 255, 0.42)',
    areaTop: 'rgba(41, 98, 255, 0.2)',
    areaBottom: 'rgba(41, 98, 255, 0.06)',
    baseTopLine: 'rgba(8, 153, 129, 0.32)',
    baseTopFill1: 'rgba(8, 153, 129, 0.18)',
    baseTopFill2: 'rgba(8, 153, 129, 0.06)',
    baseBottomLine: 'rgba(242, 54, 69, 0.32)',
    baseBottomFill1: 'rgba(242, 54, 69, 0.06)',
    baseBottomFill2: 'rgba(242, 54, 69, 0.16)',
  } as const
}
/** Vertical replay-cursor line colour (TradingView blue). */
const REPLAY_LINE_COLOR = '#2962ff'
/** Width of replay vertical line on shade canvas (DOM line matches in CSS). */
const REPLAY_LINE_WIDTH_PX = 2
/** Replay bar marker: black square chip on the series. */
const REPLAY_SCISSORS_MARKER_COLOR = '#000000'
/** Default chart `layout.fontSize` (px). */
const CHART_LAYOUT_FONT_PX = 12
/** Series marker `size` multiplier for the replay square. */
const REPLAY_SCISSORS_MARKER_SIZE = 2

function timeScaleOptions(theme: TradingChartTheme, utcLabelEveryMinutes: 5 | 10) {
  const borderColor = theme === 'tradingview-light' ? '#e0e3eb' : '#2a2e39'
  return {
    borderColor,
    timeVisible: true,
    secondsVisible: false,
    fontSize: CHART_LAYOUT_FONT_PX,
    tickMarkFormatter: (time: Time, tickMarkType: TickMarkType, locale: string) =>
      formatTimeAxisUtcGrid(time, tickMarkType, locale, utcLabelEveryMinutes),
  }
}

function chartOptions(container: HTMLElement, theme: TradingChartTheme, utcLabelEveryMinutes: 5 | 10 = 5) {
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
      timeScale: timeScaleOptions(theme, utcLabelEveryMinutes),
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
    timeScale: timeScaleOptions(theme, utcLabelEveryMinutes),
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

/** X-axis labels on N-minute UTC boundaries only (e.g. 10 with 1m candles = tick every 10 minutes). */
function formatTimeAxisUtcGrid(
  time: Time,
  tickMarkType: TickMarkType,
  _locale: string,
  everyMinutes: 5 | 10,
): string | null {
  if (tickMarkType !== TickMarkType.Time && tickMarkType !== TickMarkType.TimeWithSeconds) return null
  if (typeof time !== 'number') return null
  const d = new Date(time * 1000)
  if (d.getUTCMinutes() % everyMinutes !== 0) return ''
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

const TEN_MIN_SEC = 600

/** Alternating vertical bands every 10 minutes UTC (1m candles unchanged). */
function paintTenMinuteUtcBands(
  chart: IChartApi,
  canvas: HTMLCanvasElement,
  theme: TradingChartTheme,
  /** Bar-replay cursor: draw a pixel-perfect vertical line (LineSeries cannot use duplicate times). */
  replayLineUtc: number | null,
): void {
  const ts = chart.timeScale()
  const range = ts.getVisibleRange()
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (w < 2 || h < 2) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  if (range && typeof range.from === 'number' && typeof range.to === 'number') {
    const from = range.from
    const to = range.to
    const onLightChart = theme === 'tradingview-light'
    const bandA = onLightChart ? 'rgba(19, 23, 34, 0.04)' : 'rgba(255, 255, 255, 0.028)'
    const bandB = onLightChart ? 'rgba(19, 23, 34, 0.075)' : 'rgba(255, 255, 255, 0.055)'

    let t = Math.floor(from / TEN_MIN_SEC) * TEN_MIN_SEC
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

  const scheduleShadePaint = () => {
    if (!shadeCanvas) return
    const replayUtc = replayLineUtc
    requestAnimationFrame(() => {
      paintTenMinuteUtcBands(chart, shadeCanvas, themeNow, replayUtc)
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
  /** When non-null, replay is active: main shows past at full colour; future series shows muted “ahead” bars. */
  let lastPastSnapshot: Bar[] | null = null

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

  /** Replay “future” segment volume — same values, muted colours. */
  function futureVolumeRows(futureBars: Bar[]) {
    const fp = replayFuturePalette(themeNow)
    const { values: volValues } = resolveHistogramVolumes(futureBars)
    return futureBars.map((b, i) => ({
      time: b.time,
      value: volValues[i] ?? 0,
      color: b.close >= b.open ? fp.volUp : fp.volDown,
    }))
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

  function applyTimeAxisAndFit(opts?: { fit?: boolean; initialVisibleBarCount?: number; timeAxisUtcMinutes?: 5 | 10 }) {
    if (opts?.timeAxisUtcMinutes != null) {
      timeAxisStep = opts.timeAxisUtcMinutes
      chart.applyOptions({ timeScale: timeScaleOptions(themeNow, timeAxisStep) })
    }
    scheduleShadePaint()
    if (!opts?.fit) return
    const ts = chart.timeScale()
    const win = opts.initialVisibleBarCount
    if (win != null && win > 0 && barCount >= 1) {
      const maxI = logicalMax()
      const visible = Math.min(Math.floor(win), barCount)
      const from = Math.max(0, maxI - visible + 1)
      requestAnimationFrame(() => {
        ts.setVisibleLogicalRange({ from, to: maxI })
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

  function setFutureDimmedFromBars(futureBars: Bar[]) {
    const fp = replayFuturePalette(themeNow)
    const t = futureSeries.seriesType()
    if (t === 'Candlestick') {
      futureSeries.setData(
        futureBars.map((b) => {
          const isUp = b.close >= b.open
          const body = isUp ? fp.candleUp : fp.candleDown
          const border = isUp ? fp.borderUp : fp.borderDown
          const wick = isUp ? fp.wickUp : fp.wickDown
          return {
            time: b.time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            color: body,
            borderColor: border,
            wickColor: wick,
          }
        }) as never,
      )
    } else if (t === 'Bar') {
      futureSeries.setData(
        futureBars.map((b) => ({
          time: b.time,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          color: b.close >= b.open ? fp.barUp : fp.barDown,
        })) as never,
      )
    } else if (t === 'Line') {
      futureSeries.setData(valueRows(futureBars, false) as never)
    } else if (t === 'Area') {
      futureSeries.setData(valueRows(futureBars, visualKind === 'hlc_area') as never)
    } else if (t === 'Baseline') {
      futureSeries.setData(valueRows(futureBars, false) as never)
    }
  }

  function markerPosition(): 'inBar' | 'aboveBar' {
    const t = mainSeries.seriesType()
    return t === 'Line' || t === 'Area' || t === 'Baseline' ? 'aboveBar' : 'inBar'
  }

  function redoDisplayAfterKindSwitch() {
    if (lastPastSnapshot !== null && lastPastSnapshot.length && lastBars.length) {
      setMainDataFromBars(lastPastSnapshot)
      volume.setData(volumeDataFromBars(lastPastSnapshot))
      const futureBars = lastBars.slice(lastPastSnapshot.length)
      setFutureDimmedFromBars(futureBars)
      futureVolume.setData(futureVolumeRows(futureBars))
      const cursorBar = lastPastSnapshot[lastPastSnapshot.length - 1]!
      replayLineUtc = Number(cursorBar.time)
      candleMarkers.setMarkers([
        {
          time: cursorBar.time,
          position: markerPosition(),
          color: REPLAY_SCISSORS_MARKER_COLOR,
          shape: 'square',
          size: REPLAY_SCISSORS_MARKER_SIZE,
        },
      ])
      applyMainSeriesForCurrentThemeAndKind()
      refreshFutureReplayStyle()
    } else if (lastBars.length) {
      setMainDataFromBars(lastBars)
      volume.setData(volumeDataFromBars(lastBars))
      futureSeries.setData([] as never)
      futureVolume.setData([])
      candleMarkers.setMarkers([])
      replayLineUtc = null
      applyMainSeriesForCurrentThemeAndKind()
      refreshFutureReplayStyle()
    } else {
      futureSeries.setData([] as never)
      futureVolume.setData([])
      candleMarkers.setMarkers([])
      replayLineUtc = null
    }
  }

  return {
    chart,

    setSeriesData(
      bars: Bar[],
      opts?: { fit?: boolean; initialVisibleBarCount?: number; timeAxisUtcMinutes?: 5 | 10 },
    ) {
      lastBars = bars
      barCount = bars.length
      setMainDataFromBars(bars)
      volume.setData(volumeDataFromBars(bars))

      futureSeries.setData([] as never)
      futureVolume.setData([])
      candleMarkers.setMarkers([])
      lastPastSnapshot = null
      replayLineUtc = null

      applyMainSeriesForCurrentThemeAndKind()
      refreshFutureReplayStyle()
      applyTimeAxisAndFit(opts)
    },

    setReplayData(
      pastBars: Bar[],
      allBars: Bar[],
      opts?: { fit?: boolean; initialVisibleBarCount?: number; timeAxisUtcMinutes?: 5 | 10 },
    ) {
      if (!pastBars.length || !allBars.length) return

      lastPastSnapshot = pastBars
      lastBars = allBars
      barCount = allBars.length

      setMainDataFromBars(pastBars)
      volume.setData(volumeDataFromBars(pastBars))

      const futureBars = allBars.slice(pastBars.length)
      setFutureDimmedFromBars(futureBars)
      futureVolume.setData(futureVolumeRows(futureBars))

      const cursorBar = pastBars[pastBars.length - 1]!
      replayLineUtc = Number(cursorBar.time)

      candleMarkers.setMarkers([
        {
          time: cursorBar.time,
          position: markerPosition(),
          color: REPLAY_SCISSORS_MARKER_COLOR,
          shape: 'square',
          size: REPLAY_SCISSORS_MARKER_SIZE,
        },
      ])

      applyMainSeriesForCurrentThemeAndKind()
      refreshFutureReplayStyle()
      applyTimeAxisAndFit(opts)
    },

    clearReplay() {
      lastPastSnapshot = null
      replayLineUtc = null
      futureSeries.setData([] as never)
      futureVolume.setData([])
      candleMarkers.setMarkers([])
      if (lastBars.length) {
        setMainDataFromBars(lastBars)
        volume.setData(volumeDataFromBars(lastBars))
      }
      applyMainSeriesForCurrentThemeAndKind()
      refreshFutureReplayStyle()
    },

    repaintTimeShades: scheduleShadePaint,

    applyTheme(next: TradingChartTheme) {
      themeNow = next
      chart.applyOptions(chartOptions(container, themeNow, timeAxisStep))
      applyMainSeriesForCurrentThemeAndKind()
      refreshFutureReplayStyle()
      if (lastPastSnapshot !== null && lastBars.length) {
        volume.setData(volumeDataFromBars(lastPastSnapshot))
        const futureBars = lastBars.slice(lastPastSnapshot.length)
        setFutureDimmedFromBars(futureBars)
        futureVolume.setData(futureVolumeRows(futureBars))
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

    getMainSeries: () => mainSeries,

    getVisualKind: () => visualKind,

    setVisualKind(kind: ChartVisualKind) {
      if (!isChartVisualKindEnabled(kind)) return false
      if (kind === visualKind) return true
      candleMarkers.detach()
      chart.removeSeries(mainSeries)
      chart.removeSeries(futureSeries)
      addMainFutureForKind(kind)
      candleMarkers = createSeriesMarkers(mainSeries, [])
      redoDisplayAfterKindSwitch()
      scheduleShadePaint()
      return true
    },

    dispose() {
      candleMarkers.detach()
      if (shadeCanvas) {
        chart.timeScale().unsubscribeVisibleTimeRangeChange(scheduleShadePaint)
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleShadePaint)
      }
      chart.remove()
    },
  }
}
