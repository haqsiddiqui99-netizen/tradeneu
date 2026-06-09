import './workspace.css'
import { icons } from '../icons'
import { findAsset } from '../assetCatalog'
import { aggregateOHLCV } from '../chart/aggregateBars'
import { createTradingChart } from '../chart/tradingChart'
import { legendVolumeFromSlice } from '../chart/volumeDisplay'
import { isGoldBrowserSymbol, loadSessionBars, usesMarketDataSession } from '../data/loadSessionBars'
import { inferTimeframeFromBars } from '../data/resolveSessionBars'
import { createChartIntervalMenu, type IntervalPick } from './chartIntervalMenu'
import { createChartTypeMenu } from './chartTypeMenu'
import { createSymbolSearchModal } from './symbolSearchModal'
import { createIndicatorsModal } from './indicatorsModal'
import { ReplayController } from '../playback/replayController'
import { createPortfolio } from '../portfolio'
import { primarySessionSymbol, type SessionCreatedPayload } from '../sessionTypes'
import type { Bar } from '../types'
import type { TradingChartTheme } from '../chart/tradingChart'
import { CrosshairMode } from 'lightweight-charts'
import type { IChartApi, Logical } from 'lightweight-charts'
import { mountChartDrawingUi } from '../chart/chartDrawingUi'

const REPLAY_SPEED_LABELS = ['0.5x', '1x', '2x', '4x', '10x'] as const

function setReplayPlayButtonIcon(btn: HTMLButtonElement | null, playing: boolean) {
  if (!btn) return
  btn.innerHTML = playing ? icons.replayTvPause : icons.replayTvPlay
}

const CHART_THEME_STORAGE_KEY = 'suplexity-chart-theme'
type UiChartTheme = 'light' | 'dark'

function readStoredChartTheme(): UiChartTheme {
  try {
    const v = localStorage.getItem(CHART_THEME_STORAGE_KEY)
    if (v === 'dark' || v === 'light') return v
  } catch {
    /* private mode */
  }
  return 'dark'
}

function tradingThemeFromUi(u: UiChartTheme): TradingChartTheme {
  return u === 'dark' ? 'terminal-dark' : 'tradingview-light'
}

const candleIco = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8 4v16M8 8h2v8H8M14 2v20M14 6h2v12h-2" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>`

const replayIco = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 12a9 9 0 0114.34-6M21 12a9 9 0 01-14.34 6M3 3v6h6M21 21v-6h-6" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`

/** Left toolbar — 1px outline icons, grouped in markup. */
const toolCrosshair = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>`
const toolTrend = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19L19 5" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>`
const toolFib = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 18V6l4 8 4-10 4 14" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const toolRect = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="7" width="14" height="10" rx="1.25" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`
const toolText = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6h6M12 6v12M9 18h6" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>`
const toolMeasure = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20L20 4M8 4h3v3M13 9h3v3M4 16v-3h3" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const toolRay = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19L19 5M14 5h4v4" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const toolHline = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round"/><path d="M6 8v8M18 8v8" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>`
const toolFork = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v16M7 9l5-3 5 3M7 15l5 3 5-3" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const toolBrackets = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5v3H6v8h2v3M16 5v3h2v8h-2v3" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const toolSmiley = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"/><path d="M9 10h.01M15 10h.01M8.5 14c1 2 2.5 3 3.5 3s2.5-1 3.5-3" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>`
const toolZoomBox = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="6" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"/><path d="M14 14l4 4" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>`
const toolMagnet = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 11V8a4 4 0 118 0v3M8 11h8v7a2 2 0 01-2 2h-4a2 2 0 01-2-2v-7z" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`
const toolPencil = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20l4-1 9-9-3-3-9 9-1 4zM14 5l3 3" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const toolLock = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="10" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"/><path d="M8 10V8a4 4 0 018 0v2" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>`
const toolEye = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`
const toolTrash = `<svg class="rw-tool-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4h6l1 2h4v2H4V6h4l1-2zM6 10h12l-1 10H7L6 10z" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`

function el(html: string) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild as HTMLElement
}

function formatDisplaySymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

function formatMoney(n: number) {
  const sign = n < 0 ? '-' : ''
  const v = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}$${v}`
}

function formatVol(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(Math.round(n))
}

/** Keep bars whose open time falls inside the session range (local `…T…` or legacy UTC calendar days). */
function filterBarsBySessionDates(bars: Bar[], startIso?: string, endIso?: string): Bar[] {
  const s = startIso?.trim()
  const e = endIso?.trim()
  if (!s && !e) return bars
  let out = bars
  if (s) {
    let startSec: number
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const t = Date.parse(s)
      startSec = t / 1000
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      startSec = Date.parse(`${s}T00:00:00.000Z`) / 1000
    } else {
      startSec = NaN
    }
    if (Number.isFinite(startSec)) out = out.filter((b) => b.time >= startSec)
  }
  if (e) {
    let endSec: number
    if (/^\d{4}-\d{2}-\d{2}T/.test(e)) {
      const t = Date.parse(e)
      endSec = t / 1000
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(e)) {
      endSec = Date.parse(`${e}T23:59:59.999Z`) / 1000
    } else {
      endSec = NaN
    }
    if (Number.isFinite(endSec)) out = out.filter((b) => b.time <= endSec)
  }
  return out
}

/** Grid/flex often reports 0×0 for a few frames after the chart mounts; fitting the time scale then leaves a blank chart. */
async function waitForChartHostLayout(
  host: HTMLElement,
  isDisposed: () => boolean,
  maxFrames = 120,
): Promise<boolean> {
  for (let i = 0; i < maxFrames; i++) {
    if (isDisposed()) return false
    const w = host.clientWidth
    const h = host.clientHeight
    if (w >= 2 && h >= 2) return true
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  return false
}

function parseBalance(s: string): number {
  const n = Number(String(s).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 100_000
}

/** Match CSV / gold quote precision (three decimal places). */
function formatSessionPrice(x: number): string {
  return x.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

function brokerTag(feedLabel: string): string {
  if (/OANDA/i.test(feedLabel)) return 'OANDA'
  if (/twelvedata|twelve data/i.test(feedLabel)) return 'Twelve Data'
  if (/imported|json|static|sample/i.test(feedLabel)) return 'Replay data'
  return 'Suplexity'
}

/** Right-panel data vendor line (TradingView-style). */
function symDetailFeedTag(symbol: string, feedLabel: string): string {
  if (isGoldBrowserSymbol(symbol)) return 'PYTH'
  return brokerTag(feedLabel)
}

/** First open with 1m candles: 90 bars ≈ 1h30 on screen (TradingView-style intraday default). */
const TV_1M_DEFAULT_VISIBLE_BARS = 90

const FOOT_RANGE_LABELS = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', 'ALL'] as const
type FootRangeLabel = (typeof FOOT_RANGE_LABELS)[number]

function footRangeDisplayLabel(id: FootRangeLabel): string {
  return id === 'ALL' ? 'All' : id
}

/** Calendar + arrow (TradingView “go to date” affordance). */
const iconCalendarGoto = `<svg class="rw-foot-goto-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="14" height="13" rx="1.5" stroke="currentColor" stroke-width="1.35"/><path d="M8 3v3M16 3v3M4 10h16" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><path d="M13 15h6m0 0l-2.5-2.5M19 15l-2.5 2.5" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const DAY_SEC = 86400

/** Bottom strip: TradingView-style visible history window (anchored to latest bar). */
function applyChartFootRange(
  label: FootRangeLabel,
  bars: Bar[],
  trading: { chart: IChartApi; resetTimeScaleView: () => void },
) {
  if (bars.length < 2) return
  const lastT = bars[bars.length - 1]!.time
  if (label === 'ALL') {
    trading.resetTimeScaleView()
    return
  }
  const lastDate = new Date(lastT * 1000)
  const y = lastDate.getUTCFullYear()
  const ytdStart = Date.UTC(y, 0, 1) / 1000
  let fromSec = lastT - DAY_SEC
  switch (label) {
    case '1D':
      fromSec = lastT - DAY_SEC
      break
    case '5D':
      fromSec = lastT - 5 * DAY_SEC
      break
    case '1M':
      fromSec = lastT - 30 * DAY_SEC
      break
    case '3M':
      fromSec = lastT - 90 * DAY_SEC
      break
    case '6M':
      fromSec = lastT - 180 * DAY_SEC
      break
    case 'YTD':
      fromSec = ytdStart
      break
    case '1Y':
      fromSec = lastT - 365 * DAY_SEC
      break
    default:
      return
  }
  let fromIdx = 0
  for (let i = 0; i < bars.length; i++) {
    if (bars[i]!.time >= fromSec) {
      fromIdx = i
      break
    }
  }
  const toIdx = bars.length - 1
  trading.chart.timeScale().setVisibleLogicalRange({ from: fromIdx as Logical, to: toIdx as Logical })
}

/** Mounts the replay workspace into `host` (replaces children). Returns dispose. */
export function mountChartWorkspace(
  host: HTMLElement,
  session: SessionCreatedPayload,
  opts?: { onExit?: () => void; onSymbolChange?: (symbol: string) => void },
): () => void {
  const chartSymbol = primarySessionSymbol(session.assets)
  const symUi = formatDisplaySymbol(chartSymbol)
  const catalog = findAsset(chartSymbol)
  let feedLabel =
    session.sessionType === 'prop'
      ? 'Suplexity · Prop rules'
      : usesMarketDataSession(chartSymbol)
        ? 'Suplexity · market data (server chain + static fallback)'
        : 'OANDA on Suplexity'
  const initialCash = parseBalance(session.balance)
  const fullName = catalog?.name ?? 'Demo series'
  const goldSpotLabel = isGoldBrowserSymbol(chartSymbol) ? 'Spot' : 'CFD'
  const symCardTypeLine = isGoldBrowserSymbol(chartSymbol)
    ? 'Commodity · Spot · USD'
    : chartSymbol === 'BTCUSD'
      ? 'Cryptocurrency · USD'
      : `Commodity · ${goldSpotLabel}`
  const symCardLogo = chartSymbol === 'BTCUSD' ? '₿' : 'Au'
  const symDetailFeed = symDetailFeedTag(chartSymbol, feedLabel)

  let uiChartTheme: UiChartTheme = readStoredChartTheme()

  host.replaceChildren(
    el(`
    <div class="rw-root" role="application" aria-label="Chart workspace" data-chart-theme="${uiChartTheme}">
      <header class="rw-top">
        <button type="button" class="rw-top__home" title="Back to dashboard" aria-label="Back to dashboard">⌂</button>
        <div class="rw-top__cluster">
          <div
            class="rw-symbol-search-field"
            data-rw-symbol-search-open
            role="button"
            tabindex="0"
            title="Symbol search — click, focus, or press Enter to search or change symbol"
            aria-label="Symbol search"
            aria-haspopup="dialog"
          >
            <span class="rw-symbol-search-field__ico" aria-hidden="true">${icons.search}</span>
            <input
              type="text"
              readonly
              class="rw-symbol-search-field__input"
              value=""
              tabindex="-1"
              aria-label="Symbol search"
            />
          </div>
          <span class="rw-top__sep" aria-hidden="true"></span>
          <button type="button" class="rw-pill-btn rw-interval-pill" title="Chart interval" aria-haspopup="listbox" aria-expanded="false">1m</button>
          <button type="button" class="rw-pill-btn rw-pill-btn--ico rw-chart-type-btn" title="Chart type" aria-haspopup="listbox" aria-expanded="false">${candleIco}</button>
          <button type="button" class="rw-pill-btn rw-pill-btn--ico rw-compare-btn" title="Compare or add symbol">${icons.plus}</button>
          <button type="button" class="rw-pill-btn rw-indicators-btn" title="Indicators, metrics, and strategies" aria-haspopup="dialog" aria-expanded="false">${icons.chart} Indicators</button>
          <button type="button" class="rw-pill-btn">Templates</button>
          <button type="button" class="rw-pill-btn">Alert</button>
          <button type="button" class="rw-pill-btn rw-replay-launch" data-rw-replay-launch aria-expanded="false" aria-controls="rw-chart-replay-dock" title="Bar replay — Space: play/pause · Arrow keys: step">${replayIco} Replay</button>
          <button type="button" class="rw-pill-btn">${icons.layout}</button>
        </div>
        <div class="rw-top__right">
          <button type="button" class="rw-icon-btn rw-header-search-btn" data-rw-symbol-search-open title="Symbol search" aria-label="Symbol search">${icons.search}</button>
          <button type="button" class="rw-layout-name" title="Layouts">Unnamed ${icons.chevronDown}</button>
          <button type="button" class="rw-icon-btn rw-theme-toggle" title="Chart palette" aria-label="Toggle chart palette"></button>
          <button type="button" class="rw-icon-btn" title="Fullscreen">${icons.expand}</button>
          <button type="button" class="rw-icon-btn" title="Snapshot">${icons.camera}</button>
          <button type="button" class="rw-btn-tv-trade">Trade</button>
          <button type="button" class="rw-btn-publish">Publish</button>
          <div class="rw-avatar" title="Account" aria-hidden="true"></div>
        </div>
      </header>
      <aside class="rw-tools" aria-label="Drawing tools">
        <div class="rw-tools__group" role="group" aria-label="Lines">
          <button type="button" class="rw-tools__btn rw-tools__btn--tool" data-draw-tool="crosshair" title="Crosshair">${toolCrosshair}</button>
          <button type="button" class="rw-tools__btn rw-tools__btn--tool" data-draw-tool="trend" title="Trend line">${toolTrend}</button>
          <button type="button" class="rw-tools__btn rw-tools__btn--tool" data-draw-tool="ray" title="Ray">${toolRay}</button>
          <button type="button" class="rw-tools__btn rw-tools__btn--tool" data-draw-tool="hline" title="Horizontal line">${toolHline}</button>
        </div>
        <div class="rw-tools__group" role="group" aria-label="Channels">
          <button type="button" class="rw-tools__btn rw-tools__btn--tool" data-draw-tool="fib" title="Fib retracement">${toolFib}</button>
          <button type="button" class="rw-tools__btn rw-tools__btn--ico-muted" title="Pitchfork (coming soon)" disabled aria-disabled="true">${toolFork}</button>
        </div>
        <div class="rw-tools__group" role="group" aria-label="Shapes">
          <button type="button" class="rw-tools__btn rw-tools__btn--tool" data-draw-tool="rect" title="Rectangle">${toolRect}</button>
          <button type="button" class="rw-tools__btn rw-tools__btn--ico-muted" title="Ellipse (coming soon)" disabled aria-disabled="true">${toolSmiley}</button>
          <button type="button" class="rw-tools__btn rw-tools__btn--ico-muted" title="Text (coming soon)" disabled aria-disabled="true">${toolText}</button>
        </div>
        <div class="rw-tools__group" role="group" aria-label="Measure">
          <button type="button" class="rw-tools__btn rw-tools__btn--ico-muted" title="Long/short projection (coming soon)" disabled aria-disabled="true">${toolBrackets}</button>
          <button type="button" class="rw-tools__btn rw-tools__btn--tool" data-draw-tool="measure" title="Measure">${toolMeasure}</button>
        </div>
        <div class="rw-tools__group" role="group" aria-label="Zoom">
          <button type="button" class="rw-tools__btn rw-tools__btn--tool" data-draw-tool="zoom" title="Zoom area">${toolZoomBox}</button>
        </div>
        <div class="rw-tools__group" role="group" aria-label="Drawing options">
          <button type="button" class="rw-tools__btn" data-draw-toggle="magnet" title="Magnet mode — snap to OHLC" aria-pressed="false">${toolMagnet}</button>
          <button type="button" class="rw-tools__btn" data-draw-toggle="stay" title="Stay in drawing mode" aria-pressed="false">${toolPencil}</button>
          <button type="button" class="rw-tools__btn" data-draw-toggle="lock" title="Lock drawings" aria-pressed="false">${toolLock}</button>
          <button type="button" class="rw-tools__btn" data-draw-toggle="hide" title="Hide drawings" aria-pressed="false">${toolEye}</button>
          <button type="button" class="rw-tools__btn" data-draw-action="clear" title="Remove all drawings">${toolTrash}</button>
        </div>
      </aside>
      <section class="rw-chart-wrap">
        <div class="rw-subbar">
          <div class="rw-data-banner" role="alert" hidden></div>
          <div class="rw-subbar__stack">
            <div class="rw-subbar__head rw-legend" aria-live="polite"></div>
          </div>
        </div>
        <div class="rw-chart-canvas">
          <div class="rw-chart-host">
            <canvas class="rw-chart-shade" aria-hidden="true"></canvas>
            <div class="rw-chart-lwc"></div>
            <canvas class="rw-chart-draw" aria-hidden="true"></canvas>
            <div class="rw-select-bar-overlay" data-rw-select-bar-overlay hidden aria-hidden="true">
              <div class="rw-select-bar-overlay__line" data-rw-select-bar-line></div>
              <div class="rw-select-bar-overlay__scissors" data-rw-select-bar-scissors aria-hidden="true">${icons.scissorsSelectBar}</div>
            </div>
          </div>
          <div class="rw-chart-vol" aria-live="polite"></div>
          <div class="rw-watermark">Suplexity</div>
          <div class="rw-chart-float rw-chart-float--nav" role="toolbar" aria-label="Chart zoom, pan, and reset">
            <button type="button" class="rw-chart-float__btn" data-chart-nav="zoom-out" title="Zoom out">−</button>
            <button type="button" class="rw-chart-float__btn" data-chart-nav="zoom-in" title="Zoom in">+</button>
            <button type="button" class="rw-chart-float__btn" data-chart-nav="left" title="Move left">‹</button>
            <button type="button" class="rw-chart-float__btn" data-chart-nav="right" title="Move right">›</button>
            <button type="button" class="rw-chart-float__btn" data-chart-nav="refresh" title="Reset chart view">↻</button>
          </div>
          <div class="rw-chart-replay-dock" id="rw-chart-replay-dock" hidden role="toolbar" aria-label="Bar replay" title="Space: play/pause · Arrow keys: step one bar · Toggle Replay in header to close">
            <div class="rw-chart-replay-dock__stack rw-chart-replay-dock__stack--compact">
              <div class="rw-replay-dock__row rw-replay-dock__row--main">
                <div class="rw-replay-dock__center">
                  <div class="rw-replay-dock__cluster">
                    <div class="rw-replay-dock__select-wrap">
                      <div class="rw-replay-dock__select-split">
                        <button
                          type="button"
                          class="rw-replay-dock__select rw-replay-dock__select--main"
                          data-rw-replay-select-chart
                          aria-pressed="false"
                          title="Select bar on chart"
                        >
                          <span class="rw-replay-dock__select-ico" aria-hidden="true">${icons.replayBarSelect}</span>
                          <span>Select bar</span>
                        </button>
                        <button
                          type="button"
                          class="rw-replay-dock__select-chev"
                          data-rw-replay-select-menu-toggle
                          aria-expanded="false"
                          aria-haspopup="menu"
                          aria-controls="rw-replay-start-menu"
                          title="More starting points"
                          aria-label="Starting point menu"
                        >
                          <span class="rw-replay-dock__chev" aria-hidden="true">▾</span>
                        </button>
                      </div>
                      <div id="rw-replay-start-menu" class="rw-replay-start-menu" hidden role="menu" aria-label="Select starting point">
                        <div class="rw-replay-start-menu__head" id="rw-replay-start-menu-label">Select starting point</div>
                        <button type="button" role="menuitem" class="rw-replay-start-menu__item rw-replay-start-menu__item--active" data-rw-replay-start="bar">
                          <span class="rw-replay-start-menu__ico" aria-hidden="true">${icons.replayBarSelect}</span>
                          <span>Bar</span>
                        </button>
                        <button type="button" role="menuitem" class="rw-replay-start-menu__item" data-rw-replay-start="date">
                          <span class="rw-replay-start-menu__ico" aria-hidden="true">${icons.calendar}</span>
                          <span>Date…</span>
                        </button>
                        <button type="button" role="menuitem" class="rw-replay-start-menu__item" data-rw-replay-start="first">
                          <span class="rw-replay-start-menu__ico" aria-hidden="true">${icons.replayFlag}</span>
                          <span>First available date</span>
                        </button>
                        <button type="button" role="menuitem" class="rw-replay-start-menu__item" data-rw-replay-start="random">
                          <span class="rw-replay-start-menu__ico" aria-hidden="true">${icons.replayDice}</span>
                          <span>Random bar</span>
                        </button>
                      </div>
                    </div>
                    <span class="rw-replay-dock__vsep" aria-hidden="true"></span>
                    <div class="rw-replay-dock__playback" role="group" aria-label="Playback">
                      <button type="button" class="rw-replay-dock__tico" data-rw="start" title="First bar">${icons.replayTvJumpStart}</button>
                      <button type="button" class="rw-replay-dock__tico" data-rw="play" title="Play / Pause">${icons.replayTvPlay}</button>
                      <button type="button" class="rw-replay-dock__tico" data-rw="fwd" title="Next bar">${icons.replayTvStepFwd}</button>
                      <button type="button" class="rw-replay-dock__speed-txt" data-rw-replay-speed-cycle title="Playback speed (click to cycle)">1x</button>
                      <span class="rw-replay-dock__tf" data-rw-replay-dock-tf title="Chart interval">1m</span>
                    </div>
                    <span class="rw-replay-dock__vsep" aria-hidden="true"></span>
                    <button type="button" class="rw-replay-dock__tico" data-rw="end" title="Jump to latest bar">${icons.replayTvJumpEnd}</button>
                    <button type="button" class="rw-replay-dock__tico rw-replay-dock__close" data-rw-replay-dock-close title="Close replay bar" aria-label="Close replay bar">${icons.close}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="rw-select-bar-time-flyout" data-rw-select-bar-time-flyout hidden aria-hidden="true">
            <div class="rw-select-bar-overlay__time" data-rw-select-bar-time></div>
          </div>
        </div>
      </section>
      <div class="rw-chart-footer-tv" aria-label="Chart time range">
        <div class="rw-foot__strip rw-foot__strip--tv" aria-label="Chart range and time">
          <div class="rw-foot__strip-left">
            <div class="rw-foot__tf">
              ${FOOT_RANGE_LABELS.map(
                (t) =>
                  `<button type="button" class="rw-foot__range${t === '1D' ? ' rw-foot__range--active' : ''}" data-foot-range="${t}">${footRangeDisplayLabel(t)}</button>`,
              ).join('')}
              <button type="button" class="rw-foot__goto" data-rw-foot-goto title="Go to date…" aria-haspopup="dialog">${iconCalendarGoto}</button>
            </div>
            <div class="rw-foot__qty rw-qty" role="group" aria-label="Order quantity">
              <label class="rw-qty__label" for="rw-order-qty">Quantity</label>
              <input
                id="rw-order-qty"
                class="rw-qty__field"
                type="number"
                min="1"
                step="1"
                value="1"
                inputmode="numeric"
                data-rw-order-qty
                autocomplete="off"
                aria-label="Quantity"
              />
              <div class="rw-qty__stepper">
                <button type="button" class="rw-qty__btn rw-qty__btn--up" data-rw-qty-up aria-label="Increase quantity">
                  ${icons.chevronUp}
                </button>
                <button type="button" class="rw-qty__btn rw-qty__btn--down" data-rw-qty-down aria-label="Decrease quantity">
                  ${icons.chevronDown}
                </button>
              </div>
            </div>
            <div class="rw-foot__ticket">
              <div class="rw-ticket rw-ticket--compact" role="group" aria-label="Bid and ask">
                <button type="button" class="rw-ticket__side rw-ticket__side--sell rw-ticket-sell" title="Sell at bid" aria-label="Sell at bid">
                  <span class="rw-ticket__ico" aria-hidden="true">${icons.ticketBid}</span>
                  <span class="rw-ticket__pill-body">
                    <span class="rw-ticket__lbl">SELL</span>
                    <span class="rw-ticket__px rw-ticket-bid">—</span>
                  </span>
                </button>
                <div class="rw-ticket__spread" title="Spread">
                  <span class="rw-ticket__spread-val rw-ticket-spread">—</span>
                </div>
                <button type="button" class="rw-ticket__side rw-ticket__side--buy rw-ticket-buy" title="Buy at ask" aria-label="Buy at ask">
                  <span class="rw-ticket__ico" aria-hidden="true">${icons.ticketAsk}</span>
                  <span class="rw-ticket__pill-body">
                    <span class="rw-ticket__lbl">BUY</span>
                    <span class="rw-ticket__px rw-ticket-ask">—</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div class="rw-foot__strip-right rw-foot__strip-right--tv">
            <div class="rw-foot__clock" aria-live="polite"></div>
          </div>
        </div>
      </div>
      <aside class="rw-rpanel" aria-label="Watchlist and symbol details">
        <div class="rw-rpanel__inner">
          <div class="rw-rpanel__body">
            <div class="rw-wl-head">
              <div class="rw-wl-head__title">
                <span class="rw-wl-head__text">Watchlist</span>
                <span class="rw-wl-head__chev" aria-hidden="true">${icons.chevronDown}</span>
              </div>
              <div class="rw-wl-head__tools">
                <button type="button" class="rw-wl-ico-btn" title="Add symbol">${icons.plus}</button>
                <button type="button" class="rw-wl-ico-btn" title="Table view">${icons.grid2}</button>
                <button type="button" class="rw-wl-ico-btn" title="Menu">${icons.dotsVertical}</button>
              </div>
            </div>
            <div class="rw-wl-scroll">
              <table class="rw-wl-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th class="rw-wl-num">Last</th>
                    <th class="rw-wl-num">Chg</th>
                    <th class="rw-wl-num">Chg%</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>NIFTY</td><td class="rw-wl-num">23,995.70</td><td class="rw-wl-num rw-wl-neg">−96.20</td><td class="rw-wl-num rw-wl-neg">−0.40%</td></tr>
                  <tr><td>BANK</td><td class="rw-wl-num">55,400.35</td><td class="rw-wl-num rw-wl-neg">−866.15</td><td class="rw-wl-num rw-wl-neg">−1.54%</td></tr>
                  <tr><td>SEN</td><td class="rw-wl-num">81,245.00</td><td class="rw-wl-num rw-wl-pos">+120.50</td><td class="rw-wl-num rw-wl-pos">+0.15%</td></tr>
                  <tr><td>CNX1</td><td class="rw-wl-num">24,890.25</td><td class="rw-wl-num rw-wl-neg">−45.00</td><td class="rw-wl-num rw-wl-neg">−0.18%</td></tr>
                  <tr><td>SPX</td><td class="rw-wl-num">7,138.80</td><td class="rw-wl-num rw-wl-neg">−35.20</td><td class="rw-wl-num rw-wl-neg">−0.49%</td></tr>
                  <tr class="rw-wl-section">
                    <td colspan="4"><button type="button" class="rw-wl-section__btn">STOCKS <span class="rw-wl-section__chev">${icons.chevronDown}</span></button></td>
                  </tr>
                  <tr><td>RELIA</td><td class="rw-wl-num">2,891.40</td><td class="rw-wl-num rw-wl-pos">+12.30</td><td class="rw-wl-num rw-wl-pos">+0.43%</td></tr>
                  <tr class="rw-wl-row--active" data-watch-symbol="${symUi}">
                    <td><span class="rw-wl-star" aria-hidden="true">★</span>${symUi}</td>
                    <td class="rw-wl-num rw-wl-last">—</td>
                    <td class="rw-wl-num rw-wl-chg">—</td>
                    <td class="rw-wl-num rw-wl-chgp">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="rw-sym-detail">
              <div class="rw-sym-detail__head">
                <div class="rw-sym-card__logo" aria-hidden="true">${symCardLogo}</div>
                <div class="rw-sym-detail__sym">${symUi}</div>
                <div class="rw-sym-detail__tools">
                  <button type="button" class="rw-wl-ico-btn" title="Layouts">${icons.grid2}</button>
                  <button type="button" class="rw-wl-ico-btn" title="Note">${icons.pencil}</button>
                  <button type="button" class="rw-wl-ico-btn" title="More">${icons.dotsVertical}</button>
                </div>
              </div>
              <div class="rw-sym-card__name">${fullName}</div>
              <div class="rw-sym-card__feed">${symDetailFeed}</div>
              <div class="rw-sym-card__type">${symCardTypeLine}</div>
              <div class="rw-quote-row">
                <span class="rw-quote-big rw-right-quote-num">—</span>
                <span class="rw-quote-currency">USD</span>
              </div>
              <div class="rw-quote-sub rw-right-chg">—</div>
              <div class="rw-market-status"><span class="rw-market-dot" aria-hidden="true"></span> Market open</div>
              <button type="button" class="rw-social-insights">Social insights <span aria-hidden="true">›</span></button>
              <div class="rw-key-stats">
                <div class="rw-key-stats__title">Key stats</div>
                <div class="rw-key-stats__row"><span>Volume</span><span class="rw-key-stats__val">N/A</span></div>
              </div>
              <div class="rw-quote-status" data-rw-replay-status>Replay · loading…</div>
              <div class="rw-news-strip">News · Connect a feed for headlines</div>
              <div class="rw-perf" aria-label="Performance">
                <span class="rw-perf__lbl">1W</span><span class="rw-perf__bar" style="--p:42%"></span>
                <span class="rw-perf__lbl">1M</span><span class="rw-perf__bar rw-perf__bar--neg" style="--p:58%"></span>
                <span class="rw-perf__lbl">3M</span><span class="rw-perf__bar" style="--p:35%"></span>
                <span class="rw-perf__lbl">6M</span><span class="rw-perf__bar" style="--p:48%"></span>
                <span class="rw-perf__lbl">YTD</span><span class="rw-perf__bar rw-perf__bar--neg" style="--p:55%"></span>
                <span class="rw-perf__lbl">1Y</span><span class="rw-perf__bar" style="--p:40%"></span>
              </div>
            </div>
          </div>
          <nav class="rw-rpanel__rail" aria-label="Side panel views">
            <button type="button" class="rw-rail-btn rw-rail-btn--active" data-rw-rail="wl" title="Watchlist">${icons.bookmarkRibbon}</button>
            <button type="button" class="rw-rail-btn" data-rw-rail="alerts" title="Alerts">${icons.clock}</button>
            <button type="button" class="rw-rail-btn" data-rw-rail="data" title="Data window">${icons.layersBox}</button>
            <button type="button" class="rw-rail-btn" data-rw-rail="news" title="News">${icons.chatBubble}</button>
            <button type="button" class="rw-rail-btn" data-rw-rail="tree" title="Object tree">${icons.targetRing}</button>
            <button type="button" class="rw-rail-btn" data-rw-rail="tech" title="Technical analysis">${icons.chart}</button>
            <button type="button" class="rw-rail-btn" data-rw-rail="cal" title="Economic calendar">${icons.calendar}</button>
            <button type="button" class="rw-rail-btn" data-rw-rail="ideas" title="My ideas">${icons.spark}</button>
            <button type="button" class="rw-rail-btn" data-rw-rail="notif" title="Notifications">${icons.bell}</button>
            <button type="button" class="rw-rail-btn" data-rw-rail="apps" title="More apps">${icons.gridApps}</button>
            <button type="button" class="rw-rail-btn" data-rw-rail="help" title="Help">${icons.help}</button>
          </nav>
        </div>
      </aside>
      <footer class="rw-foot">
        <div class="rw-foot__bar">
          <div class="rw-foot__panels">
            <button type="button">Stock Screener</button>
            <button type="button">Pine Editor</button>
            <button type="button" data-rw-focus-replay>Strategy Tester</button>
            <button type="button">Trading Panel</button>
          </div>
          <div class="rw-foot__stats">
            <span><span class="rw-lbl">Balance</span><span class="rw-bal"></span></span>
            <span><span class="rw-lbl">Realized</span><span class="rw-rp">$0.00</span></span>
            <span><span class="rw-lbl">Unrealized</span><span class="rw-up">$0.00</span></span>
          </div>
        </div>
      </footer>
      <dialog class="rw-foot-goto-dlg" data-rw-foot-goto-dialog aria-labelledby="rw-foot-goto-title">
        <div class="rw-foot-goto-panel">
          <div class="rw-foot-goto-panel__head">
            <span id="rw-foot-goto-title">Go to date</span>
            <button type="button" class="rw-foot-goto-panel__x" data-rw-foot-goto-close aria-label="Close">×</button>
          </div>
          <p class="rw-foot-goto-panel__hint">Scroll the chart so this UTC date is visible (does not change replay position).</p>
          <label class="rw-foot-goto-panel__field">
            <span class="rw-foot-goto-panel__lbl">Date (UTC)</span>
            <input type="date" class="rw-foot-goto-panel__input" data-rw-foot-goto-date />
          </label>
          <div class="rw-foot-goto-panel__foot">
            <button type="button" class="rw-foot-goto__btn" data-rw-foot-goto-cancel>Cancel</button>
            <button type="button" class="rw-foot-goto__btn rw-foot-goto__btn--primary" data-rw-foot-goto-ok>Go</button>
          </div>
        </div>
      </dialog>
      <dialog class="rw-replay-date-panel-dlg" data-rw-replay-date-dialog aria-labelledby="rw-replay-date-dlg-title">
        <div class="rw-replay-date-panel">
          <div class="rw-replay-date-panel__head">
            <span class="rw-replay-date-panel__title" id="rw-replay-date-dlg-title">Select date</span>
            <button type="button" class="rw-replay-date-panel__x" data-rw-replay-date-panel-close aria-label="Close">×</button>
          </div>
          <p class="rw-replay-date-panel__hint">Jump replay to the last bar on or before this moment (UTC).</p>
          <div class="rw-replay-date-panel__inputs">
            <label class="rw-replay-date-panel__field">
              <input type="date" class="rw-replay-date-panel__input" data-rw-replay-date-input />
              <span class="rw-replay-date-panel__field-ico" aria-hidden="true">${icons.calendar}</span>
            </label>
            <label class="rw-replay-date-panel__field">
              <input type="time" class="rw-replay-date-panel__input" value="00:00" step="60" data-rw-replay-time-input />
              <span class="rw-replay-date-panel__field-ico" aria-hidden="true">${icons.clock}</span>
            </label>
          </div>
          <div class="rw-replay-date-panel__cal">
            <div class="rw-replay-cal__nav">
              <button type="button" class="rw-replay-cal__nav-btn" data-rw-replay-cal-prev aria-label="Previous month">‹</button>
              <span class="rw-replay-cal__title" data-rw-replay-cal-title></span>
              <button type="button" class="rw-replay-cal__nav-btn" data-rw-replay-cal-next aria-label="Next month">›</button>
            </div>
            <div class="rw-replay-cal__week" aria-hidden="true">Mo Tu We Th Fr Sa Su</div>
            <div class="rw-replay-cal__grid" data-rw-replay-cal-grid></div>
          </div>
          <button type="button" class="rw-replay-date-panel__first" data-rw-replay-date-first>Select the first available day</button>
          <div class="rw-replay-date-panel__foot">
            <button type="button" class="rw-replay-date-dlg__btn" data-rw-replay-date-cancel>Cancel</button>
            <button type="button" class="rw-replay-date-dlg__btn rw-replay-date-dlg__btn--primary" data-rw-replay-date-ok>Select</button>
          </div>
        </div>
      </dialog>
    </div>
  `),
  )

  host.setAttribute('data-chart-theme', uiChartTheme)

  const symbolHeaderInput = host.querySelector('.rw-symbol-search-field__input') as HTMLInputElement | null
  if (symbolHeaderInput) symbolHeaderInput.value = fullName

  const subbarHeadEl = host.querySelector('.rw-subbar__head') as HTMLElement
  const chartVolEl = host.querySelector('.rw-chart-vol') as HTMLElement
  const dataBanner = host.querySelector('.rw-data-banner') as HTMLElement | null
  const chartHost = host.querySelector('.rw-chart-host') as HTMLElement
  const chartCanvas = host.querySelector('.rw-chart-canvas') as HTMLElement
  const chartLwc = host.querySelector('.rw-chart-lwc') as HTMLElement
  const selectBarOverlay = host.querySelector('[data-rw-select-bar-overlay]') as HTMLElement | null
  const selectBarTimeFlyout = host.querySelector('[data-rw-select-bar-time-flyout]') as HTMLElement | null
  const selectBarTimeEl = host.querySelector('[data-rw-select-bar-time]') as HTMLElement | null
  const btnSelectBarChart = host.querySelector('[data-rw-replay-select-chart]') as HTMLButtonElement | null
  const speedCycleBtn = host.querySelector('[data-rw-replay-speed-cycle]') as HTMLButtonElement | null
  const qtyInput = host.querySelector('[data-rw-order-qty]') as HTMLInputElement | null
  const qtyUp = host.querySelector('[data-rw-qty-up]') as HTMLButtonElement | null
  const qtyDown = host.querySelector('[data-rw-qty-down]') as HTMLButtonElement | null
  const ticketBuy = host.querySelector('.rw-ticket-buy') as HTMLButtonElement
  const ticketSell = host.querySelector('.rw-ticket-sell') as HTMLButtonElement
  const bidPx = host.querySelector('.rw-ticket-bid') as HTMLElement
  const askPx = host.querySelector('.rw-ticket-ask') as HTMLElement
  const spreadPx = host.querySelector('.rw-ticket-spread') as HTMLElement
  const balEl = host.querySelector('.rw-bal') as HTMLElement
  const rpEl = host.querySelector('.rw-rp') as HTMLElement
  const upEl = host.querySelector('.rw-up') as HTMLElement
  const clockEl = host.querySelector('.rw-foot__clock') as HTMLElement | null
  const btnHome = host.querySelector('.rw-top__home') as HTMLButtonElement
  const intervalPill = host.querySelector('.rw-interval-pill') as HTMLButtonElement
  const btnIndicators = host.querySelector('.rw-indicators-btn') as HTMLButtonElement | null
  const rightQuoteEl = host.querySelector('.rw-right-quote-num') as HTMLElement | null
  const rightChgEl = host.querySelector('.rw-right-chg') as HTMLElement | null
  const wlLastEl = host.querySelector('.rw-wl-last') as HTMLElement | null
  const wlChgEl = host.querySelector('.rw-wl-chg') as HTMLElement | null
  const wlChgpEl = host.querySelector('.rw-wl-chgp') as HTMLElement | null
  const symDetailFeedEl = host.querySelector('.rw-sym-card__feed') as HTMLElement | null
  const rwRoot = host.querySelector('.rw-root') as HTMLElement
  const btnThemeToggle = host.querySelector('.rw-theme-toggle') as HTMLButtonElement | null
  const btnReplayLaunch = host.querySelector('[data-rw-replay-launch]') as HTMLButtonElement | null
  const replayDock = host.querySelector('#rw-chart-replay-dock') as HTMLElement | null
  const replayStartMenu = host.querySelector('#rw-replay-start-menu') as HTMLElement | null
  const btnReplayStartMenuToggle = host.querySelector('[data-rw-replay-select-menu-toggle]') as HTMLButtonElement | null
  const dateDialog = host.querySelector('[data-rw-replay-date-dialog]') as HTMLDialogElement | null
  const dateDialogInput = host.querySelector('[data-rw-replay-date-input]') as HTMLInputElement | null
  const dateTimeInput = host.querySelector('[data-rw-replay-time-input]') as HTMLInputElement | null
  const btnDatePanelClose = host.querySelector('[data-rw-replay-date-panel-close]') as HTMLButtonElement | null
  const calTitle = host.querySelector('[data-rw-replay-cal-title]') as HTMLElement | null
  const calGrid = host.querySelector('[data-rw-replay-cal-grid]') as HTMLElement | null
  const btnCalPrev = host.querySelector('[data-rw-replay-cal-prev]') as HTMLButtonElement | null
  const btnCalNext = host.querySelector('[data-rw-replay-cal-next]') as HTMLButtonElement | null
  const btnDateFirstPanel = host.querySelector('[data-rw-replay-date-first]') as HTMLButtonElement | null
  const btnDateDialogOk = host.querySelector('[data-rw-replay-date-ok]') as HTMLButtonElement | null
  const btnDateDialogCancel = host.querySelector('[data-rw-replay-date-cancel]') as HTMLButtonElement | null
  const replayDockTf = host.querySelector('[data-rw-replay-dock-tf]') as HTMLElement | null
  const replayStatusEl = host.querySelector('[data-rw-replay-status]') as HTMLElement | null

  function closeReplayStartMenu() {
    if (!replayStartMenu || !btnReplayStartMenuToggle) return
    replayStartMenu.hidden = true
    btnReplayStartMenuToggle.setAttribute('aria-expanded', 'false')
  }

  function setReplayStartMenuOpen(open: boolean) {
    if (!replayStartMenu || !btnReplayStartMenuToggle) return
    replayStartMenu.hidden = !open
    btnReplayStartMenuToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
  }

  function setReplayDockOpen(open: boolean) {
    if (!replayDock || !btnReplayLaunch) return
    if (!open) {
      state.exitSelectBarChartMode?.()
      closeReplayStartMenu()
    }
    replayDock.hidden = !open
    btnReplayLaunch.setAttribute('aria-expanded', open ? 'true' : 'false')
    rwRoot.classList.toggle('rw-replay-dock-open', open)
    btnReplayLaunch.title = open ? 'Hide bar replay toolbar' : 'Bar replay — Space: play/pause · Arrow keys: step'
  }

  const onReplayLaunchClick = () => {
    if (!replayDock) return
    /* Toggle: `hidden` is boolean on HTMLElement; cast for DOM typings edge cases. */
    setReplayDockOpen(!!replayDock.hidden)
  }
  const onReplayStartMenuToggleClick = (e: MouseEvent) => {
    e.stopPropagation()
    if (!replayStartMenu) return
    setReplayStartMenuOpen(!!replayStartMenu.hidden)
  }

  let chartTimeframe = '1m'
  subbarHeadEl.innerHTML = `<span style="color:#787b86">Loading <strong>${symUi}</strong>…</span>`
  chartVolEl.innerHTML = ''

  const state = {
    disposed: false,
    trading: null as ReturnType<typeof createTradingChart> | null,
    replay: null as ReplayController | null,
    clockTimer: null as ReturnType<typeof setInterval> | null,
    ro: null as ResizeObserver | null,
    exitSelectBarChartMode: null as null | (() => void),
    redrawDrawings: null as null | (() => void),
  }

  const cleanupFns: Array<() => void> = []

  const onDocPointerCloseStartMenu = (e: PointerEvent) => {
    if (state.disposed) return
    if (!replayStartMenu || replayStartMenu.hidden) return
    const t = e.target as Node
    if (replayStartMenu.contains(t) || btnReplayStartMenuToggle?.contains(t)) return
    if (selectBarOverlay?.contains(t) || selectBarTimeFlyout?.contains(t)) return
    if (btnSelectBarChart?.contains(t)) return
    if (dateDialog?.open && dateDialog.contains(t)) return
    closeReplayStartMenu()
  }

  btnReplayLaunch?.addEventListener('click', onReplayLaunchClick)
  cleanupFns.push(() => btnReplayLaunch?.removeEventListener('click', onReplayLaunchClick))

  const btnReplayDockClose = host.querySelector('[data-rw-replay-dock-close]') as HTMLButtonElement | null
  const onReplayDockClose = () => setReplayDockOpen(false)
  btnReplayDockClose?.addEventListener('click', onReplayDockClose)
  cleanupFns.push(() => btnReplayDockClose?.removeEventListener('click', onReplayDockClose))

  const btnCompare = host.querySelector('.rw-compare-btn') as HTMLButtonElement | null
  const onCompareClick = () => {
    window.alert('Compare or add symbol — connect when multi-chart is ready.')
  }
  btnCompare?.addEventListener('click', onCompareClick)
  cleanupFns.push(() => btnCompare?.removeEventListener('click', onCompareClick))

  btnReplayStartMenuToggle?.addEventListener('click', onReplayStartMenuToggleClick)
  cleanupFns.push(() => btnReplayStartMenuToggle?.removeEventListener('click', onReplayStartMenuToggleClick))

  function clampOrderQty(n: number): number {
    if (!Number.isFinite(n)) return 1
    return Math.max(1, Math.min(999_999_999, Math.floor(n)))
  }
  const readOrderQty = (): number => {
    if (!qtyInput) return 1
    const n = Number(qtyInput.value)
    return Number.isFinite(n) ? n : 1
  }
  function syncOrderQtyField() {
    if (!qtyInput) return
    qtyInput.value = String(clampOrderQty(readOrderQty()))
  }
  const onQtyStepUp = () => {
    if (!qtyInput) return
    qtyInput.value = String(clampOrderQty(readOrderQty() + 1))
  }
  const onQtyStepDown = () => {
    if (!qtyInput) return
    qtyInput.value = String(clampOrderQty(readOrderQty() - 1))
  }
  const onQtyChange = () => syncOrderQtyField()
  qtyUp?.addEventListener('click', onQtyStepUp)
  qtyDown?.addEventListener('click', onQtyStepDown)
  qtyInput?.addEventListener('change', onQtyChange)
  qtyInput?.addEventListener('blur', onQtyChange)
  cleanupFns.push(() => qtyUp?.removeEventListener('click', onQtyStepUp))
  cleanupFns.push(() => qtyDown?.removeEventListener('click', onQtyStepDown))
  cleanupFns.push(() => qtyInput?.removeEventListener('change', onQtyChange))
  cleanupFns.push(() => qtyInput?.removeEventListener('blur', onQtyChange))

  document.addEventListener('pointerdown', onDocPointerCloseStartMenu, true)
  cleanupFns.push(() => document.removeEventListener('pointerdown', onDocPointerCloseStartMenu, true))

  function syncThemeToggleButton() {
    if (!btnThemeToggle) return
    const dark = uiChartTheme === 'dark'
    btnThemeToggle.innerHTML = dark ? icons.sun : icons.moon
    btnThemeToggle.title = dark ? 'Switch to light theme (FXReplay / TradingView style)' : 'Switch to dark theme'
    btnThemeToggle.setAttribute(
      'aria-label',
      dark ? 'Switch to light theme' : 'Switch to dark theme',
    )
  }
  syncThemeToggleButton()

  function applyChartPaletteToggle() {
    uiChartTheme = uiChartTheme === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(CHART_THEME_STORAGE_KEY, uiChartTheme)
    } catch {
      /* noop */
    }
    rwRoot.dataset.chartTheme = uiChartTheme
    host.setAttribute('data-chart-theme', uiChartTheme)
    syncThemeToggleButton()
    state.trading?.applyTheme(tradingThemeFromUi(uiChartTheme))
    state.redrawDrawings?.()
    requestAnimationFrame(() => {
      if (state.trading && !state.disposed) {
        state.trading.chart.resize(chartHost.clientWidth, chartHost.clientHeight)
        state.trading.repaintTimeShades()
        state.redrawDrawings?.()
      }
    })
  }

  /**
   * Document capture so theme clicks register before symbol-search delegation
   * and aren’t lost to overlapping toolbar rows / hit-testing quirks.
   */
  const onDocChartPaletteClick = (e: MouseEvent) => {
    if (state.disposed) return
    const t = e.target
    if (!(t instanceof Element)) return
    const paletteBtn = t.closest('button.rw-theme-toggle')
    if (!paletteBtn || !host.contains(paletteBtn)) return
    e.preventDefault()
    e.stopImmediatePropagation()
    applyChartPaletteToggle()
  }
  document.addEventListener('click', onDocChartPaletteClick, true)
  cleanupFns.push(() => document.removeEventListener('click', onDocChartPaletteClick, true))

  const symbolSearch = createSymbolSearchModal({
    getCurrentSymbol: () => formatDisplaySymbol(primarySessionSymbol(session.assets)),
    onPick: (symbol) => {
      const s = symbol.trim().toUpperCase()
      if (s) opts?.onSymbolChange?.(s)
    },
  })
  /**
   * Document capture opens the modal even when a parent stops propagation, and avoids
   * `preventDefault` on pointerdown (which can suppress click / activation in some browsers).
   */
  const onDocOpenSymbolSearch = (e: MouseEvent) => {
    if (state.disposed) return
    const t = e.target
    if (!(t instanceof Element)) return
    const opener = t.closest('[data-rw-symbol-search-open]')
    if (!opener || !host.contains(opener)) return
    symbolSearch.open()
  }
  document.addEventListener('click', onDocOpenSymbolSearch, true)
  cleanupFns.push(() => document.removeEventListener('click', onDocOpenSymbolSearch, true))

  const symbolSearchStrip = host.querySelector('.rw-symbol-search-field') as HTMLElement | null
  const onSymbolStripKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      symbolSearch.open()
    }
  }
  symbolSearchStrip?.addEventListener('keydown', onSymbolStripKeydown)
  cleanupFns.push(() => symbolSearchStrip?.removeEventListener('keydown', onSymbolStripKeydown))

  cleanupFns.push(() => symbolSearch.dispose())

  const indicatorsModal = createIndicatorsModal({
    root: document.body,
    onOpenChange: (v) => btnIndicators?.setAttribute('aria-expanded', v ? 'true' : 'false'),
  })
  const onIndicatorsClick = (e: MouseEvent) => {
    e.stopPropagation()
    indicatorsModal.open()
  }
  btnIndicators?.addEventListener('click', onIndicatorsClick)
  cleanupFns.push(() => btnIndicators?.removeEventListener('click', onIndicatorsClick))
  cleanupFns.push(() => indicatorsModal.dispose())

  const railBtns = host.querySelectorAll<HTMLButtonElement>('.rw-rpanel__rail .rw-rail-btn')
  const onRailClick = (e: Event) => {
    const btn = e.currentTarget as HTMLButtonElement
    railBtns.forEach((b) => b.classList.toggle('rw-rail-btn--active', b === btn))
  }
  railBtns.forEach((b) => b.addEventListener('click', onRailClick))
  cleanupFns.push(() => railBtns.forEach((b) => b.removeEventListener('click', onRailClick)))

  const onHome = () => opts?.onExit?.()
  btnHome.addEventListener('click', onHome)
  cleanupFns.push(() => btnHome.removeEventListener('click', onHome))

  const onFocusReplayBar = () => {
    setReplayDockOpen(true)
    replayDock?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
  const focusReplayBtn = host.querySelector('[data-rw-focus-replay]')
  focusReplayBtn?.addEventListener('click', onFocusReplayBar)
  cleanupFns.push(() => focusReplayBtn?.removeEventListener('click', onFocusReplayBar))

  function lastBar(slice: Bar[]): Bar | null {
    const n = slice.length
    return n ? slice[n - 1]! : null
  }

    function updateTicket(b: Bar | null) {
      if (!b) {
        bidPx.textContent = '—'
        askPx.textContent = '—'
        spreadPx.textContent = '—'
        return
      }
      const spread = Math.max(0.02, b.close * 0.00004)
      const bid = b.close - spread / 2
      const ask = b.close + spread / 2
      bidPx.textContent = formatSessionPrice(bid)
      askPx.textContent = formatSessionPrice(ask)
      /* TradingView-style compact spread (points in 0.001 units, like the gold ticket strip). */
      spreadPx.textContent = String(Math.round(spread * 1000))
    }

  function updateRightPanel(b: Bar | null, prev: Bar | null) {
    if (!rightQuoteEl || !rightChgEl) return
    if (!b) {
      rightQuoteEl.textContent = '—'
      rightChgEl.textContent = '—'
      rightQuoteEl.classList.remove('rw-quote-big--up', 'rw-quote-big--down')
      if (wlLastEl) wlLastEl.textContent = '—'
      if (wlChgEl) wlChgEl.textContent = '—'
      if (wlChgpEl) wlChgpEl.textContent = '—'
      return
    }
    rightQuoteEl.textContent = formatSessionPrice(b.close)
    const ref = prev?.close
    if (ref != null && Number.isFinite(ref) && ref !== 0) {
      const d = b.close - ref
      const pct = (d / ref) * 100
      const up = d >= 0
      const sign = d >= 0 ? '+' : '−'
      const absD = Math.abs(d)
      rightQuoteEl.classList.toggle('rw-quote-big--up', up)
      rightQuoteEl.classList.toggle('rw-quote-big--down', !up)
      rightChgEl.textContent = `${sign}${formatSessionPrice(absD)} ${sign}${Math.abs(pct).toFixed(2)}%`
      rightChgEl.classList.toggle('rw-quote-sub--up', up)
      rightChgEl.classList.toggle('rw-quote-sub--down', !up)
      if (wlLastEl) wlLastEl.textContent = formatSessionPrice(b.close)
      if (wlChgEl) {
        wlChgEl.textContent = `${sign}${formatSessionPrice(absD)}`
        wlChgEl.classList.toggle('rw-wl-pos', up)
        wlChgEl.classList.toggle('rw-wl-neg', !up)
      }
      if (wlChgpEl) {
        wlChgpEl.textContent = `${sign}${Math.abs(pct).toFixed(2)}%`
        wlChgpEl.classList.toggle('rw-wl-pos', up)
        wlChgpEl.classList.toggle('rw-wl-neg', !up)
      }
    } else {
      rightQuoteEl.classList.remove('rw-quote-big--up', 'rw-quote-big--down')
      rightChgEl.textContent = '—'
      rightChgEl.classList.remove('rw-quote-sub--up', 'rw-quote-sub--down')
      if (wlLastEl) wlLastEl.textContent = formatSessionPrice(b.close)
      if (wlChgEl) {
        wlChgEl.textContent = '—'
        wlChgEl.classList.remove('rw-wl-pos', 'rw-wl-neg')
      }
      if (wlChgpEl) {
        wlChgpEl.textContent = '—'
        wlChgpEl.classList.remove('rw-wl-pos', 'rw-wl-neg')
      }
    }
  }

  void (async () => {
    const series = await loadSessionBars(chartSymbol, session.name)
    if (state.disposed) return
    if (series.dataSource && usesMarketDataSession(chartSymbol)) {
      feedLabel = `Suplexity · ${series.dataSource}`
    }
    if (symDetailFeedEl) symDetailFeedEl.textContent = symDetailFeedTag(chartSymbol, feedLabel)
    if (dataBanner && usesMarketDataSession(chartSymbol) && series.dataSource?.includes('synthetic')) {
      dataBanner.hidden = false
      dataBanner.textContent =
        'Live market data unavailable (showing demo bars). Ensure the historic API is on 127.0.0.1:3001 (npm run server:historic), TWELVE_DATA_API_KEY is set, then reload this session.'
    }
    let chartBars = filterBarsBySessionDates(series.bars, session.startDate, session.endDate)
    if (
      chartBars.length < 8 &&
      (session.startDate?.trim() || session.endDate?.trim()) &&
      series.bars.length >= 8
    ) {
      if (dataBanner) {
        dataBanner.hidden = false
        dataBanner.textContent =
          'No bars in the selected date range (showing full series). Adjust start/end in a new session.'
      }
      chartBars = series.bars
    }
    chartTimeframe = series.timeframe

    function computeInitialVisibleForBars(bars: Bar[]) {
      return inferTimeframeFromBars(bars) === '1m'
        ? Math.min(TV_1M_DEFAULT_VISIBLE_BARS, Math.max(2, bars.length))
        : undefined
    }
    intervalPill.textContent = chartTimeframe
    if (replayDockTf) replayDockTf.textContent = chartTimeframe

    if (!chartBars.length) {
      subbarHeadEl.innerHTML = `<span style="color:#787b86">No bars for <strong>${symUi}</strong>. Check the data feed or session import.</span>`
      chartVolEl.innerHTML = ''
      if (replayStatusEl) replayStatusEl.textContent = 'Replay · no data'
      return
    }

    const portfolio = createPortfolio(initialCash)
    const trading = createTradingChart(chartLwc, {
      theme: tradingThemeFromUi(uiChartTheme),
      timeAxisUtcMinutes: 10,
      tenMinuteUtcShading: true,
    })
    state.trading = trading
    if (state.disposed) {
      trading.dispose()
      state.trading = null
      return
    }

    const navHandlers: Array<{ el: Element; fn: () => void }> = []
    host.querySelectorAll('[data-chart-nav]').forEach((btn) => {
      const fn = () => {
        const act = (btn as HTMLElement).dataset.chartNav
        if (act === 'zoom-in') trading.zoomLogicalRange(0.78)
        else if (act === 'zoom-out') trading.zoomLogicalRange(1.32)
        else if (act === 'left' || act === 'right') {
          const r = trading.chart.timeScale().getVisibleLogicalRange()
          if (!r) return
          const span = Math.max(r.to - r.from, 4)
          const delta = Math.max(1, span * 0.22) * (act === 'left' ? -1 : 1)
          trading.panLogicalRange(delta)
        } else if (act === 'refresh') trading.resetTimeScaleView()
      }
      btn.addEventListener('click', fn)
      navHandlers.push({ el: btn, fn })
    })
    cleanupFns.push(() => navHandlers.forEach(({ el, fn }) => el.removeEventListener('click', fn)))

    const drawCanvasEl = host.querySelector('.rw-chart-draw') as HTMLCanvasElement | null
    const toolsAsideEl = host.querySelector('.rw-tools') as HTMLElement | null
    let drawingApi: { dispose: () => void; redraw: () => void } | null = null
    if (drawCanvasEl && toolsAsideEl) {
      drawingApi = mountChartDrawingUi({
        toolbarRoot: toolsAsideEl,
        drawCanvas: drawCanvasEl,
        chartHost,
        chart: trading.chart,
        series: trading.getMainSeries(),
        getBars: () => chartBars,
        getUiTheme: () => uiChartTheme,
        onWheelZoom: (dy) => {
          trading.zoomLogicalRange(dy < 0 ? 0.9 : 1.11)
        },
        repaintShades: () => trading.repaintTimeShades(),
      })
      state.redrawDrawings = () => drawingApi?.redraw()
      cleanupFns.push(() => {
        drawingApi?.dispose()
        drawingApi = null
        state.redrawDrawings = null
      })
    }

    const setFootRangeActive = (label: string) => {
      host.querySelectorAll('.rw-foot__range').forEach((b) => {
        const el = b as HTMLElement
        el.classList.toggle('rw-foot__range--active', el.dataset.footRange === label)
      })
    }
    const footRangeCleanups: Array<() => void> = []
    host.querySelectorAll<HTMLButtonElement>('.rw-foot__range').forEach((btn) => {
      const label = btn.dataset.footRange as FootRangeLabel | undefined
      if (!label) return
      const onFoot = () => {
        applyChartFootRange(label, chartBars, trading)
        setFootRangeActive(label)
        trading.repaintTimeShades()
        drawingApi?.redraw()
      }
      btn.addEventListener('click', onFoot)
      footRangeCleanups.push(() => btn.removeEventListener('click', onFoot))
    })
    cleanupFns.push(() => footRangeCleanups.forEach((f) => f()))

    const footGotoDlg = host.querySelector('[data-rw-foot-goto-dialog]') as HTMLDialogElement | null
    const footGotoOpenBtn = host.querySelector('[data-rw-foot-goto]') as HTMLButtonElement | null
    const footGotoDateInput = host.querySelector('[data-rw-foot-goto-date]') as HTMLInputElement | null
    const footGotoOk = host.querySelector('[data-rw-foot-goto-ok]') as HTMLButtonElement | null
    const footGotoCancel = host.querySelector('[data-rw-foot-goto-cancel]') as HTMLButtonElement | null
    const footGotoClose = host.querySelector('[data-rw-foot-goto-close]') as HTMLButtonElement | null

    function scrollChartToUtcDay(ymd: string) {
      const t0 = Date.parse(`${ymd}T00:00:00.000Z`) / 1000
      const t1 = Date.parse(`${ymd}T23:59:59.999Z`) / 1000
      if (!Number.isFinite(t0) || chartBars.length < 1) return
      let i0 = 0
      let i1 = chartBars.length - 1
      for (let i = 0; i < chartBars.length; i++) {
        if (chartBars[i]!.time >= t0) {
          i0 = i
          break
        }
      }
      for (let j = chartBars.length - 1; j >= 0; j--) {
        if (chartBars[j]!.time <= t1) {
          i1 = j
          break
        }
      }
      if (i1 < i0) return
      const span = Math.max(8, i1 - i0)
      const pad = Math.max(2, Math.floor(span * 0.15))
      const from = Math.max(0, i0 - pad) as Logical
      const to = Math.min(chartBars.length - 1, i1 + pad) as Logical
      trading.chart.timeScale().setVisibleLogicalRange({ from, to })
      trading.repaintTimeShades()
      drawingApi?.redraw()
    }

    const closeFootGoto = () => {
      footGotoDlg?.close()
    }
    const onFootGotoOpen = () => {
      if (!footGotoDlg) return
      const last = chartBars[chartBars.length - 1]
      if (last && footGotoDateInput) {
        const d = new Date(last.time * 1000)
        const y = d.getUTCFullYear()
        const m = String(d.getUTCMonth() + 1).padStart(2, '0')
        const day = String(d.getUTCDate()).padStart(2, '0')
        footGotoDateInput.value = `${y}-${m}-${day}`
      }
      footGotoDlg.showModal()
    }
    const onFootGotoOk = () => {
      const v = footGotoDateInput?.value?.trim()
      if (v) scrollChartToUtcDay(v)
      closeFootGoto()
    }
    footGotoOpenBtn?.addEventListener('click', onFootGotoOpen)
    footGotoOk?.addEventListener('click', onFootGotoOk)
    footGotoCancel?.addEventListener('click', closeFootGoto)
    footGotoClose?.addEventListener('click', closeFootGoto)
    cleanupFns.push(() => {
      footGotoOpenBtn?.removeEventListener('click', onFootGotoOpen)
      footGotoOk?.removeEventListener('click', onFootGotoOk)
      footGotoCancel?.removeEventListener('click', closeFootGoto)
      footGotoClose?.removeEventListener('click', closeFootGoto)
    })

    const btnChartType = host.querySelector('.rw-chart-type-btn') as HTMLButtonElement
    const chartTypeMenu = createChartTypeMenu({
      anchor: btnChartType,
      getSelected: () => trading.getVisualKind(),
      onSelect: (kind) => {
        if (trading.setVisualKind(kind)) chartTypeMenu.syncActive()
      },
      onOpenChange: (v) => btnChartType.setAttribute('aria-expanded', v ? 'true' : 'false'),
    })
    const onChartTypeBtnClick = (e: MouseEvent) => {
      e.stopPropagation()
      chartTypeMenu.toggle()
    }
    btnChartType.addEventListener('click', onChartTypeBtnClick)
    cleanupFns.push(() => {
      btnChartType.removeEventListener('click', onChartTypeBtnClick)
      chartTypeMenu.dispose()
      btnChartType.setAttribute('aria-expanded', 'false')
    })

    const tag = brokerTag(feedLabel)

    function updateLegend(slice: Bar[]) {
      const b = lastBar(slice)
      if (!b) {
        subbarHeadEl.innerHTML = `
        <div class="rw-subbar__tvrow">
          <div class="rw-subbar__sym"><button type="button" class="rw-legend-title-btn" data-rw-symbol-search-open title="Symbol search"><span class="rw-legend-title">${fullName} · ${chartTimeframe} · ${tag}</span></button></div>
        </div>`
        chartVolEl.innerHTML = ''
        updateTicket(null)
        updateRightPanel(null, null)
        return
      }
      const prev = slice.length >= 2 ? slice[slice.length - 2]! : null
      const chg = b.close - b.open
      const pct = b.open !== 0 ? (chg / b.open) * 100 : 0
      const up = b.close >= b.open
      const dirClass = up ? 'rw-legend-ohlc--up' : 'rw-legend-ohlc--down'
      const sign = chg >= 0 ? '+' : '−'
      const pctSign = pct >= 0 ? '+' : '−'
      const chgStr = `${sign}${formatSessionPrice(Math.abs(chg))} (${pctSign}${Math.abs(pct).toFixed(2)}%)`
      const p = formatSessionPrice
      /* TradingView desktop: tight OHLC string (O4,625.455 H… L… C… Δ). */
      const ohlcTv = `O${p(b.open)} H${p(b.high)} L${p(b.low)} C${p(b.close)} ${chgStr}`
      subbarHeadEl.innerHTML = `
      <div class="rw-subbar__tvrow">
        <div class="rw-subbar__sym">
          <button type="button" class="rw-legend-title-btn" data-rw-symbol-search-open title="Symbol search"><span class="rw-legend-title">${fullName} · ${chartTimeframe} · ${tag}</span></button>
        </div>
        <div class="rw-subbar__ohlc rw-legend-ohlc ${dirClass}">
          <span class="rw-legend-status" aria-hidden="true"></span>
          <span class="rw-subbar__ohlc-txt">${ohlcTv}</span>
        </div>
      </div>
    `
      const { value: legVol, mode: volMode } = legendVolumeFromSlice(slice)
      const volTxt =
        volMode === 'synthetic_ohlc'
          ? `Vol ~${formatVol(legVol)} <span class="rw-chart-vol__est">(est.)</span>`
          : `Vol ${formatVol(legVol)}`
      chartVolEl.innerHTML = `<span class="rw-chart-vol__txt">${volTxt}</span>`
      updateTicket(b)
      updateRightPanel(b, prev)
    }

    function updatePortfolioUi(slice: Bar[]) {
      const b = lastBar(slice)
      const price = b?.close ?? 0
      const { unrealized } = portfolio.markToMarket(price)
      const p = portfolio.get()
      balEl.textContent = formatMoney(p.cash + unrealized)
      rpEl.textContent = formatMoney(p.realizedPnL)
      upEl.textContent = formatMoney(unrealized)
    }

    let firstChartPaint = true
    let paintedWithNonZeroHost = false

    function onReplayTick(slice: Bar[], index: number) {
      /* Bar replay: chart shows the first `index` bars (1…N); no future bars (TradingView-style). */
      if (state.trading) {
        state.trading.setReplayData(slice, chartBars, {
          fit: firstChartPaint,
          initialVisibleBarCount: firstChartPaint ? computeInitialVisibleForBars(chartBars) : undefined,
          /* 1m candles: 10m UTC grid on the time axis. */
          timeAxisUtcMinutes: 10,
        })
        firstChartPaint = false
        const playing = state.replay?.getState().playing ?? false
        if (playing) {
          requestAnimationFrame(() => {
            state.trading?.chart.timeScale().scrollToRealTime()
            state.trading?.repaintTimeShades()
          })
        }
      }
      if (replayStatusEl) {
        const mode = session.sessionType === 'prop' ? 'Prop challenge' : 'Backtest'
        replayStatusEl.textContent = `${mode} · bar ${index} / ${chartBars.length} · ${feedLabel}`
      }
      const playBtnEl = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
      setReplayPlayButtonIcon(playBtnEl, state.replay?.getState().playing ?? false)
      updateLegend(slice)
      updatePortfolioUi(slice)
    }

    const replay = new ReplayController(chartBars, onReplayTick)
    state.replay = replay

    const source1mBars = chartBars.slice()
    const canResample = inferTimeframeFromBars(source1mBars) === '1m'

    function applyIntervalPick(pick: IntervalPick) {
      const nextBars = pick.stepSec === 60 ? source1mBars.slice() : aggregateOHLCV(source1mBars, pick.stepSec)
      if (nextBars.length < 2) return
      chartBars = nextBars
      chartTimeframe = pick.pill
      intervalPill.textContent = pick.pill
      if (replayDockTf) replayDockTf.textContent = pick.pill
      firstChartPaint = true
      replay.replaceBars(chartBars)
      state.redrawDrawings?.()
    }

    const intervalMenu = createChartIntervalMenu({
      anchor: intervalPill,
      getSelectedPill: () => chartTimeframe,
      canResampleFrom1m: () => canResample,
      onSelect: (p) => applyIntervalPick(p),
      onOpenChange: (v) => intervalPill.setAttribute('aria-expanded', v ? 'true' : 'false'),
    })

    const onIntervalPillClick = (e: MouseEvent) => {
      e.stopPropagation()
      intervalMenu.toggle()
    }
    intervalPill.addEventListener('click', onIntervalPillClick)
    cleanupFns.push(() => {
      intervalPill.removeEventListener('click', onIntervalPillClick)
      intervalMenu.dispose()
      intervalPill.setAttribute('aria-expanded', 'false')
    })

    const syncSpeedCycleLabel = () => {
      if (speedCycleBtn) speedCycleBtn.textContent = REPLAY_SPEED_LABELS[replay.getSpeedIndex()]
    }

    const hostLaidOut = await waitForChartHostLayout(chartHost, () => state.disposed)
    if (state.disposed) return
    trading.chart.resize(chartHost.clientWidth, chartHost.clientHeight)
    onReplayTick(replay.slice(), replay.getState().index)
    if (hostLaidOut) paintedWithNonZeroHost = true
    syncSpeedCycleLabel()

    const onSpeedCycleClick = () => {
      const next = (replay.getSpeedIndex() + 1) % REPLAY_SPEED_LABELS.length
      replay.setSpeedIndex(next)
      syncSpeedCycleLabel()
    }
    speedCycleBtn?.addEventListener('click', onSpeedCycleClick)
    cleanupFns.push(() => speedCycleBtn?.removeEventListener('click', onSpeedCycleClick))

    function findReplayIndexAtOrBefore(tSec: number): number {
      if (chartBars.length === 0) return 1
      let lo = 0
      let hi = chartBars.length - 1
      let best = -1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (chartBars[mid]!.time <= tSec) {
          best = mid
          lo = mid + 1
        } else hi = mid - 1
      }
      if (best < 0) return 1
      return best + 1
    }

    function syncPlayBtnPaused() {
      const playBtn = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
      setReplayPlayButtonIcon(playBtn, false)
    }

    let selectBarChartActive = false
    let lastPointerClientX: number | null = null
    let lastPointerClientY: number | null = null
    let selectBarTsSubscribed = false
    let lastSnappedSliceIndex = 0

    function formatUtcPickLabel(sec: number): string {
      const d = new Date(Number(sec) * 1000)
      const wk = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]!
      const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
        d.getUTCMonth()
      ]!
      const day = String(d.getUTCDate()).padStart(2, '0')
      const y2 = String(d.getUTCFullYear() % 100).padStart(2, '0')
      const hh = String(d.getUTCHours()).padStart(2, '0')
      const mm = String(d.getUTCMinutes()).padStart(2, '0')
      return `Re: ${wk} ${day} ${mon} '${y2} ${hh}:${mm}`
    }

    function onTsChangeWhilePicking() {
      if (!selectBarChartActive || lastPointerClientX == null) return
      syncSelectBarOverlay(lastPointerClientX, lastPointerClientY)
    }

    function syncSelectBarOverlay(clientX: number, clientY: number | null) {
      if (!state.trading || !selectBarOverlay || !selectBarTimeEl) return
      const slice = replay.slice()
      if (slice.length === 0) return
      const rect = chartLwc.getBoundingClientRect()
      const x = clientX - rect.left
      const logical = state.trading.chart.timeScale().coordinateToLogical(x)
      if (logical == null) return
      let idx = Math.round(Number(logical))
      idx = Math.max(0, Math.min(slice.length - 1, idx))
      lastSnappedSliceIndex = idx
      const bar = slice[idx]!
      const coord = state.trading.chart.timeScale().logicalToCoordinate(idx as Logical)
      if (coord == null) return
      const hostRect = chartHost.getBoundingClientRect()
      const lwcRect = chartLwc.getBoundingClientRect()
      const sxPx = lwcRect.left - hostRect.left + Number(coord)
      selectBarOverlay.style.setProperty('--sx', `${sxPx}px`)
      chartCanvas.style.setProperty('--rw-sb-sx', `${sxPx}px`)

      const overlayRect = selectBarOverlay.getBoundingClientRect()
      const padTop = 10
      /* Leave room for time pill + replay dock. */
      const padBottom = 92
      const yInput = clientY ?? overlayRect.top + overlayRect.height / 2
      let sy = yInput - overlayRect.top
      sy = Math.max(padTop, Math.min(Math.max(padTop + 1, overlayRect.height - padBottom), sy))
      selectBarOverlay.style.setProperty('--sy', `${sy}px`)

      selectBarTimeEl.textContent = formatUtcPickLabel(Number(bar.time))
    }

    function closeSelectBarChartMode(apply: boolean) {
      if (!selectBarChartActive) return
      selectBarChartActive = false
      lastPointerClientX = null
      lastPointerClientY = null
      if (selectBarTsSubscribed && state.trading) {
        try {
          state.trading.chart.timeScale().unsubscribeVisibleLogicalRangeChange(onTsChangeWhilePicking)
        } catch {
          /* noop */
        }
        selectBarTsSubscribed = false
      }
      if (selectBarOverlay) {
        selectBarOverlay.hidden = true
        selectBarOverlay.classList.remove('rw-select-bar-overlay--active')
        selectBarOverlay.setAttribute('aria-hidden', 'true')
        selectBarOverlay.style.removeProperty('--sx')
        selectBarOverlay.style.removeProperty('--sy')
      }
      if (selectBarTimeFlyout) {
        selectBarTimeFlyout.hidden = true
        selectBarTimeFlyout.setAttribute('aria-hidden', 'true')
      }
      chartCanvas.style.removeProperty('--rw-sb-sx')
      btnSelectBarChart?.classList.remove('rw-replay-dock__select--picking')
      btnSelectBarChart?.setAttribute('aria-pressed', 'false')
      if (selectBarTimeEl) selectBarTimeEl.textContent = ''
      state.trading?.chart.applyOptions({ crosshair: { mode: CrosshairMode.Normal } })
      if (apply) {
        replay.setIndex(lastSnappedSliceIndex + 1)
        syncPlayBtnPaused()
      }
    }

    function openSelectBarChartMode() {
      if (!state.trading || !selectBarOverlay || !selectBarTimeEl) return
      const slice = replay.slice()
      if (slice.length === 0) return
      closeReplayStartMenu()
      replay.pause()
      syncPlayBtnPaused()
      selectBarChartActive = true
      selectBarOverlay.hidden = false
      selectBarOverlay.classList.add('rw-select-bar-overlay--active')
      selectBarOverlay.setAttribute('aria-hidden', 'false')
      if (selectBarTimeFlyout) {
        selectBarTimeFlyout.hidden = false
        selectBarTimeFlyout.setAttribute('aria-hidden', 'false')
      }
      btnSelectBarChart?.classList.add('rw-replay-dock__select--picking')
      btnSelectBarChart?.setAttribute('aria-pressed', 'true')
      state.trading.chart.applyOptions({ crosshair: { mode: CrosshairMode.Hidden } })
      if (!selectBarTsSubscribed) {
        state.trading.chart.timeScale().subscribeVisibleLogicalRangeChange(onTsChangeWhilePicking)
        selectBarTsSubscribed = true
      }
      const r = chartLwc.getBoundingClientRect()
      lastPointerClientX = r.left + r.width / 2
      lastPointerClientY = r.top + r.height * 0.38
      syncSelectBarOverlay(lastPointerClientX, lastPointerClientY)
    }

    function toggleSelectBarChartMode() {
      if (selectBarChartActive) closeSelectBarChartMode(false)
      else openSelectBarChartMode()
    }

    state.exitSelectBarChartMode = () => closeSelectBarChartMode(false)

    const onOverlayPointerMove = (e: PointerEvent) => {
      if (!selectBarChartActive) return
      lastPointerClientX = e.clientX
      lastPointerClientY = e.clientY
      syncSelectBarOverlay(e.clientX, e.clientY)
    }
    const onOverlayClick = (e: MouseEvent) => {
      if (!selectBarChartActive) return
      e.preventDefault()
      e.stopPropagation()
      syncSelectBarOverlay(e.clientX, e.clientY)
      closeSelectBarChartMode(true)
    }

    selectBarOverlay?.addEventListener('pointermove', onOverlayPointerMove)
    selectBarOverlay?.addEventListener('click', onOverlayClick)
    const onSelectBarChartBtnClick = (e: MouseEvent) => {
      e.stopPropagation()
      toggleSelectBarChartMode()
    }
    btnSelectBarChart?.addEventListener('click', onSelectBarChartBtnClick)
    cleanupFns.push(() => {
      closeSelectBarChartMode(false)
      selectBarOverlay?.removeEventListener('pointermove', onOverlayPointerMove)
      selectBarOverlay?.removeEventListener('click', onOverlayClick)
      btnSelectBarChart?.removeEventListener('click', onSelectBarChartBtnClick)
      state.exitSelectBarChartMode = null
    })

    const startMenuHandlers: Array<{ el: Element; fn: () => void }> = []
    host.querySelectorAll('[data-rw-replay-start]').forEach((el) => {
      const fn = () => {
        const mode = (el as HTMLElement).dataset.rwReplayStart
        closeReplayStartMenu()
        replay.pause()
        syncPlayBtnPaused()
        if (mode === 'bar') {
          openSelectBarChartMode()
          return
        }
        if (mode === 'first') {
          replay.goStart()
          state.trading?.resetTimeScaleView()
          return
        }
        if (mode === 'random') {
          const n = chartBars.length
          replay.setIndex(1 + Math.floor(Math.random() * n))
          return
        }
        if (mode === 'date') {
          openReplayDatePanel()
        }
      }
      el.addEventListener('click', fn)
      startMenuHandlers.push({ el, fn })
    })
    cleanupFns.push(() => startMenuHandlers.forEach(({ el, fn }) => el.removeEventListener('click', fn)))

    const CAL_MONTH_NAMES = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ] as const

    function utcDaysInMonth(y: number, m0: number): number {
      return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()
    }

    function utcMondayWeekIndex(y: number, m0: number): number {
      return (new Date(Date.UTC(y, m0, 1)).getUTCDay() + 6) % 7
    }

    let calViewY = 2024
    let calViewM = 0

    function parseYmd(s: string): { y: number; m0: number; d: number } | null {
      const p = s.split('-').map(Number)
      if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return null
      return { y: p[0]!, m0: p[1]! - 1, d: p[2]! }
    }

    function clampCalViewToData() {
      const t0 = chartBars[0]!.time
      const t1 = chartBars[chartBars.length - 1]!.time
      const minD = new Date(Number(t0) * 1000)
      const maxD = new Date(Number(t1) * 1000)
      const minYm = minD.getUTCFullYear() * 12 + minD.getUTCMonth()
      const maxYm = maxD.getUTCFullYear() * 12 + maxD.getUTCMonth()
      const curYm = calViewY * 12 + calViewM
      if (curYm < minYm) {
        calViewY = minD.getUTCFullYear()
        calViewM = minD.getUTCMonth()
      } else if (curYm > maxYm) {
        calViewY = maxD.getUTCFullYear()
        calViewM = maxD.getUTCMonth()
      }
    }

    function renderCalendar() {
      if (!calGrid || !calTitle) return
      clampCalViewToData()
      calTitle.textContent = `${CAL_MONTH_NAMES[calViewM]} ${calViewY}`
      const first = utcMondayWeekIndex(calViewY, calViewM)
      const dim = utcDaysInMonth(calViewY, calViewM)
      const sel = dateDialogInput?.value ? parseYmd(dateDialogInput.value) : null
      const cells: (number | null)[] = []
      for (let i = 0; i < first; i++) cells.push(null)
      for (let d = 1; d <= dim; d++) cells.push(d)
      while (cells.length < 42) cells.push(null)
      const parts: string[] = ['<div class="rw-replay-cal__grid-inner">']
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i]!
        if (c == null) {
          parts.push('<span class="rw-replay-cal__cell rw-replay-cal__cell--pad" aria-hidden="true"></span>')
        } else {
          const isSel = sel && sel.y === calViewY && sel.m0 === calViewM && sel.d === c
          parts.push(
            `<button type="button" class="rw-replay-cal__cell${isSel ? ' rw-replay-cal__cell--sel' : ''}" data-cal-day="${c}">${c}</button>`,
          )
        }
      }
      parts.push('</div>')
      calGrid.innerHTML = parts.join('')
    }

    function syncCalViewFromDateInput() {
      const v = dateDialogInput?.value
      if (!v) return
      const p = parseYmd(v)
      if (!p) return
      calViewY = p.y
      calViewM = p.m0
      clampCalViewToData()
      renderCalendar()
    }

    function openReplayDatePanel() {
      closeReplayStartMenu()
      if (!dateDialog || !dateDialogInput) return
      const t0 = chartBars[0]!.time
      const t1 = chartBars[chartBars.length - 1]!.time
      dateDialogInput.min = new Date(Number(t0) * 1000).toISOString().slice(0, 10)
      dateDialogInput.max = new Date(Number(t1) * 1000).toISOString().slice(0, 10)
      const cur = replay.getState().index
      const midT = chartBars[Math.max(0, cur - 1)]!.time
      const dt = new Date(Number(midT) * 1000)
      dateDialogInput.value = dt.toISOString().slice(0, 10)
      if (dateTimeInput) {
        const hh = String(dt.getUTCHours()).padStart(2, '0')
        const mm = String(dt.getUTCMinutes()).padStart(2, '0')
        dateTimeInput.value = `${hh}:${mm}`
      }
      calViewY = dt.getUTCFullYear()
      calViewM = dt.getUTCMonth()
      renderCalendar()
      dateDialog.showModal()
    }

    const onCalGridClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('[data-cal-day]') as HTMLElement | null
      if (!el || !dateDialogInput) return
      const day = Number(el.dataset.calDay)
      if (!Number.isFinite(day)) return
      const m1 = calViewM + 1
      dateDialogInput.value = `${calViewY}-${String(m1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      renderCalendar()
    }

    const onDateOk = () => {
      const v = dateDialogInput?.value
      if (!v || !dateDialog) return
      const p = parseYmd(v)
      if (!p) return
      const tt = dateTimeInput?.value || '00:00'
      const thm = tt.split(':').map((x) => Number(x))
      const hh = Number.isFinite(thm[0]) ? thm[0]! : 0
      const mm = Number.isFinite(thm[1]) ? thm[1]! : 0
      const tSec = Date.UTC(p.y, p.m0, p.d, hh, mm, 0)
      replay.setIndex(findReplayIndexAtOrBefore(tSec))
      dateDialog.close()
    }
    const onDateCancel = () => dateDialog?.close()
    const onDatePanelClose = () => dateDialog?.close()

    const onCalPrev = () => {
      calViewM -= 1
      if (calViewM < 0) {
        calViewM = 11
        calViewY -= 1
      }
      clampCalViewToData()
      renderCalendar()
    }

    const onCalNext = () => {
      calViewM += 1
      if (calViewM > 11) {
        calViewM = 0
        calViewY += 1
      }
      clampCalViewToData()
      renderCalendar()
    }

    const onDateFirstPanel = () => {
      replay.goStart()
      syncPlayBtnPaused()
      state.trading?.resetTimeScaleView()
      dateDialog?.close()
    }

    btnDatePanelClose?.addEventListener('click', onDatePanelClose)
    btnCalPrev?.addEventListener('click', onCalPrev)
    btnCalNext?.addEventListener('click', onCalNext)
    calGrid?.addEventListener('click', onCalGridClick)
    dateDialogInput?.addEventListener('change', syncCalViewFromDateInput)
    dateDialogInput?.addEventListener('input', syncCalViewFromDateInput)
    btnDateFirstPanel?.addEventListener('click', onDateFirstPanel)
    btnDateDialogOk?.addEventListener('click', onDateOk)
    btnDateDialogCancel?.addEventListener('click', onDateCancel)
    cleanupFns.push(() => btnDatePanelClose?.removeEventListener('click', onDatePanelClose))
    cleanupFns.push(() => btnCalPrev?.removeEventListener('click', onCalPrev))
    cleanupFns.push(() => btnCalNext?.removeEventListener('click', onCalNext))
    cleanupFns.push(() => calGrid?.removeEventListener('click', onCalGridClick))
    cleanupFns.push(() => dateDialogInput?.removeEventListener('change', syncCalViewFromDateInput))
    cleanupFns.push(() => dateDialogInput?.removeEventListener('input', syncCalViewFromDateInput))
    cleanupFns.push(() => btnDateFirstPanel?.removeEventListener('click', onDateFirstPanel))
    cleanupFns.push(() => btnDateDialogOk?.removeEventListener('click', onDateOk))
    cleanupFns.push(() => btnDateDialogCancel?.removeEventListener('click', onDateCancel))

    const replayHandlers: Array<{ el: Element; fn: () => void }> = []
    host.querySelectorAll('.rw-chart-replay-dock [data-rw]').forEach((btn) => {
      const fn = () => {
        const act = (btn as HTMLElement).dataset.rw
        const playBtn = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
        if (act === 'play') {
          replay.togglePlay()
          setReplayPlayButtonIcon(playBtn, replay.getState().playing)
        } else if (act === 'start') {
          replay.pause()
          replay.goStart()
          setReplayPlayButtonIcon(playBtn, false)
          state.trading?.resetTimeScaleView()
        } else if (act === 'fwd') {
          replay.pause()
          replay.skip(1)
          setReplayPlayButtonIcon(playBtn, false)
        } else if (act === 'end') {
          replay.pause()
          replay.goEnd()
          setReplayPlayButtonIcon(playBtn, false)
          state.trading?.resetTimeScaleView()
        }
      }
      btn.addEventListener('click', fn)
      replayHandlers.push({ el: btn, fn })
    })
    cleanupFns.push(() => replayHandlers.forEach(({ el, fn }) => el.removeEventListener('click', fn)))

    const onReplayKeydown = (e: KeyboardEvent) => {
      if (state.disposed) return
      if (selectBarChartActive) {
        if (e.code === 'Escape') {
          e.preventDefault()
          closeSelectBarChartMode(false)
        }
        return
      }
      if (e.code !== 'Space' && e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return
      const ae = document.activeElement as HTMLElement | null
      if (ae?.closest?.('input:not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select'))
        return
      if (e.code === 'Space') {
        const sp = document.activeElement as HTMLElement | null
        if (sp?.closest?.('[data-rw-replay-speed-cycle]')) return
        e.preventDefault()
        replay.togglePlay()
        const playBtn = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
        setReplayPlayButtonIcon(playBtn, replay.getState().playing)
        return
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault()
        replay.pause()
        replay.skip(-1)
        const playBtn = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
        setReplayPlayButtonIcon(playBtn, false)
        return
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault()
        replay.pause()
        replay.skip(1)
        const playBtn = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
        setReplayPlayButtonIcon(playBtn, false)
      }
    }
    window.addEventListener('keydown', onReplayKeydown, true)
    cleanupFns.push(() => window.removeEventListener('keydown', onReplayKeydown, true))

    const tradeQty = () => 1
    const onBuy = () => {
      const b = lastBar(replay.slice())
      if (!b) return
      portfolio.buy(tradeQty(), b.close)
      updatePortfolioUi(replay.slice())
    }
    const onSell = () => {
      const b = lastBar(replay.slice())
      if (!b) return
      portfolio.sell(tradeQty(), b.close)
      updatePortfolioUi(replay.slice())
    }
    ticketBuy.addEventListener('click', onBuy)
    ticketSell.addEventListener('click', onSell)
    cleanupFns.push(() => ticketBuy.removeEventListener('click', onBuy))
    cleanupFns.push(() => ticketSell.removeEventListener('click', onSell))

    function tickClock() {
      const d = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const h = d.getUTCHours()
      const m = d.getUTCMinutes()
      const s = d.getUTCSeconds()
      const clockStr = `${pad(h)}:${pad(m)}:${pad(s)}`
      if (clockEl) clockEl.textContent = `${clockStr} UTC`
    }
    tickClock()
    state.clockTimer = setInterval(tickClock, 1000)
    cleanupFns.push(() => {
      if (state.clockTimer) {
        clearInterval(state.clockTimer)
        state.clockTimer = null
      }
    })

    const ro = new ResizeObserver(() => {
      const w = chartHost.clientWidth
      const h = chartHost.clientHeight
      trading.chart.resize(w, h)
      trading.repaintTimeShades()
      if (!paintedWithNonZeroHost && w >= 2 && h >= 2) {
        paintedWithNonZeroHost = true
        firstChartPaint = true
        onReplayTick(replay.slice(), replay.getState().index)
      }
    })
    state.ro = ro
    ro.observe(chartHost)
    cleanupFns.push(() => {
      state.ro?.disconnect()
      state.ro = null
    })

    requestAnimationFrame(() => {
      if (!state.disposed) {
        trading.chart.resize(chartHost.clientWidth, chartHost.clientHeight)
        trading.repaintTimeShades()
      }
    })
  })()

  return () => {
    state.disposed = true
    closeReplayStartMenu()
    dateDialog?.close()
    ;(host.querySelector('[data-rw-foot-goto-dialog]') as HTMLDialogElement | null)?.close()
    for (const fn of cleanupFns) fn()
    state.trading?.dispose()
    state.trading = null
    state.replay?.dispose()
    state.replay = null
    if (state.clockTimer) {
      clearInterval(state.clockTimer)
      state.clockTimer = null
    }
    state.ro?.disconnect()
    state.ro = null
    host.replaceChildren()
  }
}
