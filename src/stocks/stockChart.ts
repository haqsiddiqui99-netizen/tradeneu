import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
} from 'lightweight-charts'
import type { UTCTimestamp } from 'lightweight-charts'
import type { Bar } from '../types'
import { computeEMA, computeRSI } from './indicators'

export type StockChartApi = {
  setBars: (bars: Bar[]) => void
  dispose: () => void
}

export function createStockChart(host: HTMLElement): StockChartApi {
  const chart = createChart(host, {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: '#0b0e14' },
      textColor: '#b2b5be',
      fontSize: 12,
      fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
    },
    grid: {
      vertLines: { color: '#1a1f2e' },
      horzLines: { color: '#1a1f2e' },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: '#758696', width: 1, style: 2, labelBackgroundColor: '#2962ff' },
      horzLine: { color: '#758696', width: 1, style: 2, labelBackgroundColor: '#2962ff' },
    },
    rightPriceScale: { borderColor: '#2a2e39' },
    timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false },
  })

  const candle = chart.addSeries(CandlestickSeries, {
    upColor: '#089981',
    downColor: '#f23645',
    borderVisible: false,
    wickUpColor: '#089981',
    wickDownColor: '#f23645',
  })

  const volume = chart.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: '',
  })
  volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
  candle.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.22 } })

  const ema12 = chart.addSeries(LineSeries, {
    color: '#2962ff',
    lineWidth: 2,
    title: 'EMA 12',
  })
  const ema26 = chart.addSeries(LineSeries, {
    color: '#ff9800',
    lineWidth: 2,
    title: 'EMA 26',
  })

  const rsiPane = chart.addPane()
  chart.panes()[0]?.setStretchFactor(4)
  rsiPane.setStretchFactor(1)
  const rsi = rsiPane.addSeries(LineSeries, {
    color: '#ab47bc',
    lineWidth: 2,
    title: 'RSI 14',
  })
  rsi.priceScale().applyOptions({ scaleMargins: { top: 0.15, bottom: 0.15 } })
  rsi.priceScale().setAutoScale(false)
  rsi.priceScale().setVisibleRange({ from: 0, to: 100 })

  return {
    setBars(bars: Bar[]) {
      if (!bars.length) {
        candle.setData([])
        volume.setData([])
        ema12.setData([])
        ema26.setData([])
        rsi.setData([])
        return
      }

      const cData = bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }))
      const vData = bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(8, 153, 129, 0.45)' : 'rgba(242, 54, 69, 0.45)',
      }))
      candle.setData(cData)
      volume.setData(vData)

      const closes = bars.map((b) => b.close)
      const e12 = computeEMA(closes, 12)
      const e26 = computeEMA(closes, 26)
      const rsiV = computeRSI(closes, 14)

      const linePoints = (vals: (number | null)[]) =>
        bars
          .map((b, i) => ({ t: b.time as UTCTimestamp, v: vals[i] }))
          .filter((x): x is { t: UTCTimestamp; v: number } => x.v != null && Number.isFinite(x.v))
          .map((x) => ({ time: x.t, value: x.v }))

      ema12.setData(linePoints(e12))
      ema26.setData(linePoints(e26))
      rsi.setData(linePoints(rsiV))
      rsi.priceScale().setVisibleRange({ from: 0, to: 100 })

      chart.timeScale().fitContent()
    },
    dispose() {
      chart.remove()
    },
  }
}
