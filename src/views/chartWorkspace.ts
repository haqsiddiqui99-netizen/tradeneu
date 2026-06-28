import './workspace.css'
import './symbolSearchModal.css'
import '../chart/chartPositionOverlay.css'
import { icons } from '../icons'
import { findAsset, RECENT_SYMBOLS } from '../assetCatalog'
import { aggregateOHLCV } from '../chart/aggregateBars'
import { aggregateBarsByTicks, syntheticTicksFromMinuteBars } from '../chart/aggregateTicks'
import { createTradingChart } from '../chart/tradingChart'
import { isGoldBrowserSymbol, loadSessionBars, usesMarketDataSession } from '../data/loadSessionBars'
import { inferTimeframeFromBars } from '../data/resolveSessionBars'
import {
  filterBarsBySessionDates,
  findReplayBarIndex,
  formatChartCrosshairTime,
  formatSessionModalDate,
  localHmFromSec,
  localTimezoneLabel,
  localYmdFromSec,
  sessionStartReplayIndex,
} from '../data/sessionDateRange'
import { createChartIntervalMenu, type IntervalPick } from './chartIntervalMenu'
import { createChartTypeMenu } from './chartTypeMenu'
import { createSymbolSearchModal } from './symbolSearchModal'
import { createIndicatorsModal } from './indicatorsModal'
import { REPLAY_BARS_PER_SEC, ReplayController, replaySpeedLabel } from '../playback/replayController'
import { createReplayAccount, defaultTpSl, positionUnrealized } from '../replay/replayPositions'
import { mountChartPositionOverlay } from '../chart/chartPositionOverlay'
import { primarySessionSymbol, parseSessionAssetList, type SessionCreatedPayload } from '../sessionTypes'
import type { Bar } from '../types'
import type { TradingChartTheme } from '../chart/tradingChart'
import { CrosshairMode } from 'lightweight-charts'
import type { IChartApi, Logical } from 'lightweight-charts'
import { mountChartDrawingUi } from '../chart/chartDrawingUi'
import { BUILT_IN_STRATEGIES, EMA_CROSS } from '../backtest/ExampleStrategies'
import type { BacktestResult, StrategyDefinition } from '../backtest/BacktestTypes'
import { runBacktest, numberTrades } from '../backtest/BacktestEngine'
import { createSidePanel } from './sidePanel'
import { createPineEditorDock } from './pineEditorDock'
import {
  defaultBacktestSlippage,
  tradeMarkersUpToTime,
} from '../backtest/backtestChartUi'
import {
  barIndexAtOrBeforeTime,
} from '../backtest/backtestReplayUtils'
import { getBacktestSnapshotAtTime } from '../backtest/backtestReplaySnapshot'
import { resolveGoToBarIndex, type ReplayGoToTarget } from '../playback/replayGoTo'
import { REPLAY_GOTO_MENU_ITEMS } from './replayGoToMenu'

function setReplayPlayButtonIcon(btn: HTMLButtonElement | null, playing: boolean) {
  if (!btn) return
  btn.innerHTML = playing ? icons.replayTvPause : icons.replayTvPlay
  btn.classList.toggle('rw-replay-dock__play--active', playing)
  btn.setAttribute('aria-pressed', playing ? 'true' : 'false')
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
  return 'light'
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

/** FXReplay / TradingView title: AUD/CAD for six-letter FX pairs. */
function formatLegendSymbol(symbol: string, catalogName?: string): string {
  const u = symbol.trim().toUpperCase()
  if (/^[A-Z]{6}$/.test(u)) return `${u.slice(0, 3)}/${u.slice(3)}`
  if (catalogName?.trim()) return catalogName.trim()
  return u
}

/** Compact interval pill for legend (1m → 1). */
function legendTimeframeLabel(tf: string): string {
  const m = /^(\d+)m$/i.exec(tf.trim())
  if (m) return m[1]!
  return tf
}

function legendPlatformFeed(_feedLabel: string): string {
  return 'OANDA on Suplexity'
}

function escapeLoadingHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sessionLoadingDetailsHtml(session: SessionCreatedPayload, symbol: string, balance: number): string {
  const rows: Array<[string, string]> = [
    ['Session', session.name.trim() || 'Untitled'],
    ['Asset', formatDisplaySymbol(symbol)],
    ['Balance', formatMoney(balance)],
    ['From', formatSessionModalDate(session.startDate)],
    ['To', formatSessionModalDate(session.endDate)],
  ]
  return rows
    .map(
      ([label, value]) =>
        `<div class="rw-chart-loading__row"><dt>${escapeLoadingHtml(label)}</dt><dd>${escapeLoadingHtml(value)}</dd></div>`,
    )
    .join('')
}

function formatMoney(n: number) {
  const sign = n < 0 ? '-' : ''
  const v = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}$${v}`
}

function bidAskFromBar(b: Bar): { bid: number; ask: number; spread: number } {
  const spread = Math.max(0.02, b.close * 0.00004)
  return { bid: b.close - spread / 2, ask: b.close + spread / 2, spread }
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

function defaultSessionFeedLabel(
  sessionType: SessionCreatedPayload['sessionType'],
  symbol: string,
): string {
  if (sessionType === 'prop') return 'Suplexity · Prop rules'
  if (usesMarketDataSession(symbol)) return 'Suplexity · market data (server chain + static fallback)'
  return 'OANDA on Suplexity'
}

function symbolPanelMeta(symbol: string) {
  const symUi = formatDisplaySymbol(symbol)
  const catalog = findAsset(symbol)
  const fullName = catalog?.name ?? 'Demo series'
  const goldSpotLabel = isGoldBrowserSymbol(symbol) ? 'Spot' : 'CFD'
  const symCardTypeLine = isGoldBrowserSymbol(symbol)
    ? 'Commodity · Spot · USD'
    : symbol === 'BTCUSD'
      ? 'Cryptocurrency · USD'
      : `Commodity · ${goldSpotLabel}`
  const symCardLogo = symbol === 'BTCUSD' ? '₿' : 'Au'
  return { symUi, catalog, fullName, symCardTypeLine, symCardLogo }
}

function filterSessionChartBars(
  rawBars: Bar[],
  session: { startDate?: string; endDate?: string },
): Bar[] {
  return filterBarsBySessionDates(rawBars, session.startDate, session.endDate, rawBars)
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
  let activeSession: SessionCreatedPayload = { ...session }
  let currentChartSymbol = primarySessionSymbol(activeSession.assets)
  const initialMeta = symbolPanelMeta(currentChartSymbol)
  const symUi = initialMeta.symUi
  let feedLabel = defaultSessionFeedLabel(activeSession.sessionType, currentChartSymbol)
  const initialCash = parseBalance(activeSession.balance)
  let currentFullName = initialMeta.fullName
  const symCardTypeLine = initialMeta.symCardTypeLine
  const symCardLogo = initialMeta.symCardLogo
  const symDetailFeed = symDetailFeedTag(currentChartSymbol, feedLabel)

  let uiChartTheme: UiChartTheme = readStoredChartTheme()

  host.replaceChildren(
    el(`
    <div class="rw-root rw-root--fxr rw-rpanel-collapsed overflow-hidden" role="application" aria-label="Chart workspace" data-chart-theme="${uiChartTheme}">
      <header class="rw-top">
        <button type="button" class="rw-top__home" title="Back to dashboard" aria-label="Back to dashboard">⌂</button>
        <div class="rw-top__cluster">
          <button
            type="button"
            class="rw-symbol-search-field"
            id="rw-symbol-toolbar-search"
            title="Search symbols — change chart asset"
            aria-label="Symbol search"
            aria-haspopup="dialog"
          >
            <span class="rw-symbol-search-field__ico" aria-hidden="true">${icons.search}</span>
            <span class="rw-symbol-search-field__label" data-rw-symbol-toolbar-label>${escapeLoadingHtml(formatLegendSymbol(currentChartSymbol, currentFullName))}</span>
          </button>
          <span class="rw-top__sep" aria-hidden="true"></span>
          <button type="button" class="rw-pill-btn rw-interval-pill" title="Chart interval" aria-haspopup="listbox" aria-expanded="false">1m</button>
          <button type="button" class="rw-pill-btn rw-pill-btn--ico rw-chart-type-btn" title="Chart type" aria-haspopup="listbox" aria-expanded="false">${candleIco}</button>
          <button type="button" class="rw-pill-btn rw-pill-btn--ico rw-compare-btn rw-fxr-hide" title="Compare or add symbol">${icons.plus}</button>
          <button type="button" class="rw-pill-btn rw-indicators-btn" title="Indicators, metrics, and strategies" aria-haspopup="dialog" aria-expanded="false">${icons.chart} Indicators</button>
          <button type="button" class="rw-pill-btn">New Layout</button>
          <button type="button" class="rw-pill-btn rw-fxr-hide">Alert</button>
          <button type="button" class="rw-pill-btn rw-replay-launch" data-rw-replay-launch aria-expanded="false" aria-controls="rw-chart-replay-dock" title="Bar replay">${icons.replayLaunch} Replay</button>
          <select class="rw-backtest-strategy-toolbar" data-rw-backtest-strategy-toolbar aria-label="Backtest strategy"></select>
          <button type="button" class="rw-pill-btn rw-backtest-launch" title="Run strategy backtest on loaded bars">${icons.bolt} Backtest</button>
          <button type="button" class="rw-pill-btn rw-fxr-hide">${icons.layout}</button>
        </div>
        <div class="rw-top__right">
          <button type="button" class="rw-layout-name" title="Layouts">Unnamed ${icons.chevronDown}</button>
          <button type="button" class="rw-icon-btn rw-theme-toggle" title="Chart palette" aria-label="Toggle chart palette"></button>
          <button type="button" class="rw-icon-btn" title="Settings">${icons.gear}</button>
          <button type="button" class="rw-icon-btn" title="Snapshot">${icons.camera}</button>
          <button type="button" class="rw-btn-fxr-editor">Editor</button>
          <button type="button" class="rw-btn-tv-trade rw-fxr-hide">Trade</button>
          <button type="button" class="rw-btn-publish rw-fxr-hide">Publish</button>
          <div class="rw-avatar rw-fxr-hide" title="Account" aria-hidden="true"></div>
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
        <div class="rw-chart-loading" data-rw-chart-loading hidden aria-live="polite" aria-busy="false">
          <div class="rw-chart-loading__veil" aria-hidden="true"></div>
          <div class="rw-chart-loading__panel">
            <div class="rw-chart-loading__spinner" aria-hidden="true"></div>
            <p class="rw-chart-loading__text" data-rw-chart-loading-text>Loading session…</p>
            <dl class="rw-chart-loading__meta" data-rw-chart-loading-meta></dl>
          </div>
        </div>
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
          <div class="rw-chart-nav-hoverzone" data-rw-chart-nav-hoverzone aria-label="Chart zoom and pan">
            <div class="rw-chart-float rw-chart-float--nav" role="toolbar" aria-label="Chart zoom, pan, and reset">
              <button type="button" class="rw-chart-float__btn" data-chart-nav="zoom-out" title="Zoom out">${icons.chartNavMinus}</button>
              <button type="button" class="rw-chart-float__btn" data-chart-nav="zoom-in" title="Zoom in">${icons.chartNavPlus}</button>
              <button type="button" class="rw-chart-float__btn" data-chart-nav="left" title="Move left">${icons.chartNavLeft}</button>
              <button type="button" class="rw-chart-float__btn" data-chart-nav="right" title="Move right">${icons.chartNavRight}</button>
              <button type="button" class="rw-chart-float__btn" data-chart-nav="refresh" title="Reset chart view">${icons.chartNavReset}</button>
            </div>
          </div>
          <div class="rw-select-bar-time-flyout" data-rw-select-bar-time-flyout hidden aria-hidden="true">
            <div class="rw-select-bar-overlay__time" data-rw-select-bar-time></div>
          </div>
          <div
            id="rw-chart-replay-dock"
            class="rw-chart-replay-dock rw-replay-dock--floating"
            data-rw-replay-dock
            hidden
            role="toolbar"
            aria-label="Replay playback"
            title="Drag to move · Space: play/pause · Arrow keys: step"
          >
            <div class="rw-replay-dock__bar">
              <button type="button" class="rw-replay-dock__drag" data-rw-replay-drag aria-label="Drag replay controls" title="Drag to move">${icons.replayDragGrip}</button>
              <div class="rw-replay-dock__select-wrap" data-rw-replay-select-wrap>
                <div class="rw-replay-dock__select-split">
                  <button
                    type="button"
                    class="rw-replay-dock__select rw-replay-dock__select--main"
                    data-rw-replay-select-chart
                    aria-pressed="false"
                    title="Select replay starting point"
                  >
                    <span class="rw-replay-dock__select-ico" data-rw-replay-select-ico aria-hidden="true">${icons.replaySelectDate}</span>
                    <span data-rw-replay-select-label>Select date</span>
                  </button>
                  <button
                    type="button"
                    class="rw-replay-dock__select-chev"
                    data-rw-replay-select-menu-toggle
                    aria-expanded="false"
                    aria-label="Select starting point"
                    title="Select starting point"
                  >${icons.chevronDown}</button>
                </div>
                <div class="rw-replay-start-menu" data-rw-replay-start-menu hidden role="menu" aria-label="Select starting point">
                  <div class="rw-replay-start-menu__head">Select starting point</div>
                  <button type="button" class="rw-replay-start-menu__item" data-rw-replay-start="bar" role="menuitem">
                    <span class="rw-replay-start-menu__ico" aria-hidden="true">${icons.replayBarSelect}</span>
                    <span>Bar</span>
                  </button>
                  <button type="button" class="rw-replay-start-menu__item rw-replay-start-menu__item--active" data-rw-replay-start="date" role="menuitem">
                    <span class="rw-replay-start-menu__ico" aria-hidden="true">${icons.calendar}</span>
                    <span>Date…</span>
                  </button>
                  <button type="button" class="rw-replay-start-menu__item" data-rw-replay-start="first" role="menuitem">
                    <span class="rw-replay-start-menu__ico" aria-hidden="true">${icons.replayFlag}</span>
                    <span>First available date</span>
                  </button>
                  <button type="button" class="rw-replay-start-menu__item" data-rw-replay-start="random" role="menuitem">
                    <span class="rw-replay-start-menu__ico" aria-hidden="true">${icons.replayDice}</span>
                    <span>Random bar</span>
                  </button>
                </div>
              </div>
              <span class="rw-replay-dock__vsep rw-replay-dock__vsep--fx" aria-hidden="true"></span>
              <button type="button" class="rw-replay-dock__tico" data-rw="start" title="First bar">${icons.replayTvJumpStart}</button>
              <div class="rw-replay-dock__speed-wrap" data-rw-replay-speed-wrap>
                <span class="rw-replay-dock__speed-bubble" data-rw-replay-speed-bubble aria-hidden="true">1x per sec</span>
                <input
                  type="range"
                  class="rw-replay-dock__speed"
                  data-rw-replay-speed
                  min="0"
                  max="${REPLAY_BARS_PER_SEC.length - 1}"
                  value="0"
                  step="1"
                  aria-label="Playback speed"
                  aria-valuetext="1x per sec"
                />
              </div>
              <button type="button" class="rw-replay-dock__tico rw-replay-dock__tico--end" data-rw="end" title="Jump to latest bar">${icons.replayTvJumpEnd}</button>
              <button type="button" class="rw-replay-dock__tico rw-replay-dock__play" data-rw="play" title="Play / Pause" aria-pressed="false">${icons.replayTvPlay}</button>
              <button
                type="button"
                class="rw-replay-dock__interval"
                data-rw-replay-interval-toggle
                aria-haspopup="listbox"
                aria-expanded="false"
                title="Chart interval"
              >
                <span data-rw-replay-dock-tf>1m</span>
                <span class="rw-replay-dock__interval-chev" aria-hidden="true">${icons.chevronDown}</span>
              </button>
              <button type="button" class="rw-replay-dock__tico" data-rw="fwd" title="Skip one candle">${icons.replayTvStepFwd}</button>
              <button type="button" class="rw-replay-dock__clear-filter" data-rw-replay-clear-filter title="Clear filter" aria-label="Clear filter">${icons.replayClearFilter}</button>
              <label class="rw-replay-dock__switch" title="Sync timeframe">
                <input type="checkbox" class="rw-replay-dock__switch-input" data-rw-replay-sync-tf aria-label="Sync timeframe" checked />
                <span class="rw-replay-dock__switch-ui" aria-hidden="true"></span>
              </label>
              <button type="button" class="rw-replay-dock__tico rw-replay-dock__close" data-rw-replay-dock-close title="Close replay" aria-label="Close replay">${icons.replayTvClose}</button>
            </div>
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
            <button type="button" class="rw-foot__analytics" title="Analytics">
              ${icons.chart} Analytics
            </button>
            <div class="rw-trade-bar" role="group" aria-label="Place order">
              <button type="button" class="rw-trade-btn rw-trade-btn--buy rw-ticket-buy" title="Buy at ask">Buy</button>
              <button type="button" class="rw-trade-btn rw-trade-btn--sell rw-ticket-sell" title="Sell at bid">Sell</button>
              <div class="rw-foot__qty rw-qty rw-qty--inline" role="group" aria-label="Order quantity">
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
              <div class="rw-trade-stats" data-rw-trade-stats>
                <span class="rw-trade-stats__item"><span>Account Balance:</span> <span class="rw-trade-stats__val rw-bal"></span></span>
                <span class="rw-trade-stats__item"><span>Realized PnL:</span> <span class="rw-trade-stats__val rw-rp">$0.00</span></span>
                <span class="rw-trade-stats__item"><span>Unrealized PnL:</span> <span class="rw-trade-stats__val rw-up">$0.00</span></span>
                <button type="button" class="rw-trade-stats__toggle" data-rw-stats-toggle aria-label="Hide account values" aria-pressed="false">${icons.eye}</button>
              </div>
            </div>
          </div>
          <div class="rw-foot__strip-right rw-foot__strip-right--tv">
            <div class="rw-foot__clock" aria-live="polite"></div>
          </div>
        </div>
      </div>
      <section class="rw-pine-dock" data-rw-pine-dock hidden aria-label="Pine Editor"></section>
      <aside class="rw-rpanel rw-rpanel--collapsed" data-rw-rpanel aria-label="Watchlist and symbol details">
        <div class="rw-rpanel__inner">
          <div class="rw-rpanel__body">
            <div class="rw-rpanel-view" data-rw-panel-view="watchlist" hidden>
            <div class="rw-wl-head">
              <div class="rw-wl-head__title">
                <span class="rw-wl-head__text">Watchlist</span>
                <span class="rw-wl-head__chev" aria-hidden="true">${icons.chevronDown}</span>
              </div>
              <div class="rw-wl-head__tools">
                <button type="button" class="rw-wl-ico-btn" title="Add symbol">${icons.plus}</button>
                <button type="button" class="rw-wl-ico-btn" title="List layout">${icons.grid2}</button>
                <button type="button" class="rw-wl-ico-btn" title="More">${icons.dotsVertical}</button>
              </div>
            </div>
            <div class="rw-wl-scroll">
              <table class="rw-wl-table" aria-label="Watchlist symbols">
                <thead>
                  <tr>
                    <th scope="col">Symbol</th>
                    <th scope="col" class="rw-wl-num">Last</th>
                    <th scope="col" class="rw-wl-num">Chg%</th>
                  </tr>
                </thead>
                <tbody data-rw-watchlist-body></tbody>
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
              <div class="rw-sym-card__name">${currentFullName}</div>
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
              <div class="rw-perf-head">Performance</div>
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
            <div class="rw-rpanel-view rw-rpanel-view--backtest" data-rw-panel-view="backtest" hidden>
              <div class="rw-wl-head">
                <div class="rw-wl-head__title">
                  <span class="rw-wl-head__text">Strategy Tester</span>
                </div>
                <button type="button" class="rw-session-rerun" data-rw-backtest-rerun hidden>Run again</button>
              </div>
              <div class="rw-wl-scroll rw-wl-scroll--full">
                <div class="rw-session-panel" data-rw-session-panel>
                  <section class="rw-session-block" aria-label="Open position">
                    <h3 class="rw-session-block__title">Open position</h3>
                    <div class="rw-session-block__body" data-rw-session-position>
                      <p class="rw-session-empty">Press <strong>Backtest</strong> in the toolbar to simulate your strategy.</p>
                    </div>
                  </section>
                  <section class="rw-session-block" aria-label="Strategy performance">
                    <h3 class="rw-session-block__title">Strategy performance</h3>
                    <div class="rw-session-block__body" data-rw-session-stats>
                      <p class="rw-session-empty">Run a backtest to see live performance as replay plays.</p>
                    </div>
                  </section>
                  <section class="rw-session-block" aria-label="Equity curve">
                    <h3 class="rw-session-block__title">Equity curve</h3>
                    <div class="rw-session-block__body" data-rw-session-equity>
                      <p class="rw-session-empty">Run a backtest to see equity and drawdown.</p>
                    </div>
                  </section>
                  <section class="rw-session-block" aria-label="Diagnosis">
                    <h3 class="rw-session-block__title">Diagnosis</h3>
                    <div class="rw-session-block__body" data-rw-session-diagnosis>
                      <p class="rw-session-empty">Run a backtest for loss heatmap and AI insights.</p>
                    </div>
                  </section>
                </div>
              </div>
            </div>
            <div class="rw-rpanel-view" data-rw-panel-view="order" hidden>
              <div class="rw-panel-page">
                <h3 class="rw-panel-page__title">Order</h3>
                <p class="rw-panel-page__hint">Place a market order at the current replay bar price.</p>
                <div class="rw-panel-order-actions">
                  <button type="button" class="rw-trade-btn rw-trade-btn--buy" data-rw-panel-buy>Buy</button>
                  <button type="button" class="rw-trade-btn rw-trade-btn--sell" data-rw-panel-sell>Sell</button>
                </div>
                <section class="rw-session-block rw-panel-order-pos" aria-label="Open position">
                  <h3 class="rw-session-block__title">Open position</h3>
                  <div class="rw-session-block__body" data-rw-order-panel-position>
                    <p class="rw-session-empty">Flat — no open position.</p>
                  </div>
                </section>
              </div>
            </div>
            <div class="rw-rpanel-view" data-rw-panel-view="goto" hidden>
              <div class="rw-panel-page">
                <h3 class="rw-panel-page__title">Go to</h3>
                <p class="rw-panel-page__hint">Jump replay to a session or date.</p>
                <div class="rw-goto-panel" role="menu" aria-label="Go to">
                  ${REPLAY_GOTO_MENU_ITEMS.map(
                    (item) =>
                      `<button type="button" class="rw-goto-panel__btn" role="menuitem" data-rw-goto-panel="${item.id}">
                        <span class="rw-goto-panel__label">${item.label}</span>
                        ${item.shortcut ? `<span class="rw-goto-panel__key" aria-hidden="true">${item.shortcut}</span>` : ''}
                      </button>`,
                  ).join('')}
                </div>
              </div>
            </div>
            <div class="rw-rpanel-view" data-rw-panel-view="news" hidden>
              <div class="rw-panel-page">
                <h3 class="rw-panel-page__title">News</h3>
                <p class="rw-panel-page__hint">Headlines for ${symUi} will appear here when a news feed is connected.</p>
                <div class="rw-news-panel">
                  <p class="rw-session-empty">No headlines loaded.</p>
                </div>
              </div>
            </div>
            <div class="rw-rpanel-view" data-rw-panel-view="journal" hidden>
              <div class="rw-panel-page">
                <h3 class="rw-panel-page__title">Journal</h3>
                <p class="rw-panel-page__hint">Review trades and notes from this replay session.</p>
                <p class="rw-session-empty">Journal entries will appear here.</p>
              </div>
            </div>
            <div class="rw-rpanel-view" data-rw-panel-view="settings" hidden>
              <div class="rw-panel-page">
                <h3 class="rw-panel-page__title">Settings</h3>
                <p class="rw-panel-page__hint">Chart and replay preferences.</p>
                <button type="button" class="rw-panel-page__cta" data-rw-panel-theme-toggle>Toggle chart theme</button>
              </div>
            </div>
          </div>
          <nav class="rw-rpanel__rail rw-rpanel__rail--labeled" aria-label="Side panel">
            <button type="button" class="rw-rail-btn rw-rail-btn--labeled" data-rw-rail="watchlist" title="Watchlist">
              <span class="rw-rail-btn__ico" aria-hidden="true">${icons.bookmarkRibbon}</span>
              <span class="rw-rail-btn__lbl">Watchlist</span>
            </button>
            <button type="button" class="rw-rail-btn rw-rail-btn--labeled" data-rw-rail="order" title="Order">
              <span class="rw-rail-btn__ico" aria-hidden="true">${icons.panelOrder}</span>
              <span class="rw-rail-btn__lbl">Order</span>
            </button>
            <button type="button" class="rw-rail-btn rw-rail-btn--labeled" data-rw-rail="goto" title="Go to">
              <span class="rw-rail-btn__ico" aria-hidden="true">${icons.panelGoTo}</span>
              <span class="rw-rail-btn__lbl">Go to</span>
            </button>
            <button type="button" class="rw-rail-btn rw-rail-btn--labeled" data-rw-rail="news" title="News">
              <span class="rw-rail-btn__ico" aria-hidden="true">${icons.panelNews}</span>
              <span class="rw-rail-btn__lbl">News</span>
            </button>
            <button type="button" class="rw-rail-btn rw-rail-btn--labeled" data-rw-rail="pine" title="Pine Editor">
              <span class="rw-rail-btn__ico" aria-hidden="true">${icons.panelPine}</span>
              <span class="rw-rail-btn__lbl">Pine</span>
            </button>
            <button type="button" class="rw-rail-btn rw-rail-btn--labeled" data-rw-rail="journal" title="Journal">
              <span class="rw-rail-btn__ico" aria-hidden="true">${icons.replayJournal}</span>
              <span class="rw-rail-btn__lbl">Journal</span>
            </button>
            <span class="rw-rpanel__rail-spacer" aria-hidden="true"></span>
            <button type="button" class="rw-rail-btn rw-rail-btn--labeled" data-rw-rail="settings" title="Settings">
              <span class="rw-rail-btn__ico" aria-hidden="true">${icons.gear}</span>
              <span class="rw-rail-btn__lbl">Settings</span>
            </button>
          </nav>
        </div>
      </aside>
      <footer class="rw-foot">
        <div class="rw-foot__bar">
          <div class="rw-foot__panels">
            <button type="button">Stock Screener</button>
            <button type="button" data-rw-foot-pine-editor>Pine Editor</button>
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
          <p class="rw-foot-goto-panel__hint">Scroll the chart so this date is visible (local time; does not change replay position).</p>
          <label class="rw-foot-goto-panel__field">
            <span class="rw-foot-goto-panel__lbl">Date</span>
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
          <p class="rw-replay-date-panel__hint">Jump replay to the last bar on or before this moment (local time).</p>
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
      <dialog class="rw-replay-hub-dlg" id="rw-replay-hub-dialog" data-rw-replay-hub-dialog aria-labelledby="rw-replay-hub-title">
        <div class="rw-replay-hub">
          <div class="rw-replay-hub__head">
            <div class="rw-replay-hub__brand">
              <span class="rw-replay-hub__brand-ico" aria-hidden="true">${replayIco}</span>
              <h2 class="rw-replay-hub__title" id="rw-replay-hub-title">Bar Replay</h2>
            </div>
            <button type="button" class="rw-replay-hub__x" data-rw-replay-hub-close aria-label="Close">×</button>
          </div>
          <p class="rw-replay-hub__hint">Choose where playback should begin. The chart stays visible behind this panel.</p>
          <div class="rw-replay-hub__grid" role="menu" aria-label="Select starting point">
            <button type="button" role="menuitem" class="rw-replay-hub__card rw-replay-hub__card--active" data-rw-replay-start="bar">
              <span class="rw-replay-hub__card-ico" aria-hidden="true">${icons.replayBarSelect}</span>
              <span class="rw-replay-hub__card-label">Select bar</span>
              <span class="rw-replay-hub__card-desc">Click a candle on the chart</span>
            </button>
            <button type="button" role="menuitem" class="rw-replay-hub__card" data-rw-replay-start="date">
              <span class="rw-replay-hub__card-ico" aria-hidden="true">${icons.calendar}</span>
              <span class="rw-replay-hub__card-label">Pick a date</span>
              <span class="rw-replay-hub__card-desc">Jump to a date and time</span>
            </button>
            <button type="button" role="menuitem" class="rw-replay-hub__card" data-rw-replay-start="first">
              <span class="rw-replay-hub__card-ico" aria-hidden="true">${icons.replayFlag}</span>
              <span class="rw-replay-hub__card-label">First bar</span>
              <span class="rw-replay-hub__card-desc">Start of loaded history</span>
            </button>
            <button type="button" role="menuitem" class="rw-replay-hub__card" data-rw-replay-start="random">
              <span class="rw-replay-hub__card-ico" aria-hidden="true">${icons.replayDice}</span>
              <span class="rw-replay-hub__card-label">Random bar</span>
              <span class="rw-replay-hub__card-desc">Surprise starting point</span>
            </button>
          </div>
        </div>
      </dialog>
      <dialog id="rw-symbol-search-dlg" class="rw-symsearch-dlg" aria-labelledby="rw-symsearch-title"></dialog>
    </div>
  `),
  )

  host.setAttribute('data-chart-theme', uiChartTheme)

  const symbolToolbarLabel = host.querySelector('[data-rw-symbol-toolbar-label]') as HTMLElement | null
  const symDetailSymEl = host.querySelector('.rw-sym-detail__sym') as HTMLElement | null
  const symDetailNameEl = host.querySelector('.rw-sym-card__name') as HTMLElement | null
  const symDetailTypeEl = host.querySelector('.rw-sym-card__type') as HTMLElement | null
  const symDetailLogoEl = host.querySelector('.rw-sym-card__logo') as HTMLElement | null

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
  const replayIntervalBtn = host.querySelector('[data-rw-replay-interval-toggle]') as HTMLButtonElement | null
  const qtyInput = host.querySelector('[data-rw-order-qty]') as HTMLInputElement | null
  const qtyUp = host.querySelector('[data-rw-qty-up]') as HTMLButtonElement | null
  const qtyDown = host.querySelector('[data-rw-qty-down]') as HTMLButtonElement | null
  const ticketBuy = host.querySelector('.rw-ticket-buy') as HTMLButtonElement
  const ticketSell = host.querySelector('.rw-ticket-sell') as HTMLButtonElement
  const tradeStatsEl = host.querySelector('[data-rw-trade-stats]') as HTMLElement | null
  const btnStatsToggle = host.querySelector('[data-rw-stats-toggle]') as HTMLButtonElement | null
  const sessionPositionEl = host.querySelector('[data-rw-session-position]') as HTMLElement | null
  const clockEl = host.querySelector('.rw-foot__clock') as HTMLElement | null
  const btnHome = host.querySelector('.rw-top__home') as HTMLButtonElement
  const intervalPill = host.querySelector('.rw-interval-pill') as HTMLButtonElement
  const btnIndicators = host.querySelector('.rw-indicators-btn') as HTMLButtonElement | null
  const rightQuoteEl = host.querySelector('.rw-right-quote-num') as HTMLElement | null
  const rightChgEl = host.querySelector('.rw-right-chg') as HTMLElement | null
  const sessionPosEl = host.querySelector('[data-rw-session-position]') as HTMLElement | null
  const sessionStatsEl = host.querySelector('[data-rw-session-stats]') as HTMLElement | null
  const sessionEquityEl = host.querySelector('[data-rw-session-equity]') as HTMLElement | null
  const sessionDiagnosisEl = host.querySelector('[data-rw-session-diagnosis]') as HTMLElement | null
  const sessionScrollEl = host.querySelector('[data-rw-panel-view="backtest"] .rw-wl-scroll') as HTMLElement | null
  const watchlistBodyEl = host.querySelector('[data-rw-watchlist-body]') as HTMLElement | null
  const rpanelEl = host.querySelector('[data-rw-rpanel]') as HTMLElement | null
  const btnBacktestRerun = host.querySelector('[data-rw-backtest-rerun]') as HTMLButtonElement | null
  const backtestState = { result: null as BacktestResult | null }

  const sidePanel =
    sessionPosEl && sessionStatsEl && sessionEquityEl && sessionDiagnosisEl
      ? createSidePanel({
          positionEl: sessionPosEl,
          statsEl: sessionStatsEl,
          equityEl: sessionEquityEl,
          diagnosisEl: sessionDiagnosisEl,
          fmtPrice: formatSessionPrice,
          scrollEl: sessionScrollEl,
          rerunBtn: btnBacktestRerun,
        })
      : null
  const symDetailFeedEl = host.querySelector('.rw-sym-card__feed') as HTMLElement | null

  function paintSymbolPanel(symbol: string, feed: string) {
    const m = symbolPanelMeta(symbol)
    currentFullName = m.fullName
    if (symDetailSymEl) symDetailSymEl.textContent = m.symUi
    if (symDetailNameEl) symDetailNameEl.textContent = m.fullName
    if (symDetailTypeEl) symDetailTypeEl.textContent = m.symCardTypeLine
    if (symDetailLogoEl) symDetailLogoEl.textContent = m.symCardLogo
    if (symDetailFeedEl) symDetailFeedEl.textContent = symDetailFeedTag(symbol, feed)
    if (symbolToolbarLabel) symbolToolbarLabel.textContent = formatLegendSymbol(symbol, m.fullName)
  }

  let switchChartSymbolImpl: ((symbol: string) => void) | null = null
  let pendingSymbolPick: string | null = null

  function applySymbolPick(symbol: string) {
    const s = symbol.trim().toUpperCase()
    if (!s) return
    if (switchChartSymbolImpl) switchChartSymbolImpl(s)
    else pendingSymbolPick = s
    opts?.onSymbolChange?.(s)
  }
  const rwRoot = host.querySelector('.rw-root') as HTMLElement
  const btnThemeToggle = host.querySelector('.rw-theme-toggle') as HTMLButtonElement | null
  const btnReplayLaunch = host.querySelector('[data-rw-replay-launch]') as HTMLButtonElement | null
  const replayDock = host.querySelector('[data-rw-replay-dock]') as HTMLElement | null
  const replayDockDrag = host.querySelector('[data-rw-replay-drag]') as HTMLButtonElement | null
  const replaySpeed = host.querySelector('[data-rw-replay-speed]') as HTMLInputElement | null
  const replaySpeedWrap = host.querySelector('[data-rw-replay-speed-wrap]') as HTMLElement | null
  const replaySpeedBubble = host.querySelector('[data-rw-replay-speed-bubble]') as HTMLElement | null
  const replaySyncTf = host.querySelector('[data-rw-replay-sync-tf]') as HTMLInputElement | null
  const replayClearFilterBtn = host.querySelector('[data-rw-replay-clear-filter]') as HTMLButtonElement | null
  const chartWrapEl = host.querySelector('.rw-chart-wrap') as HTMLElement | null
  let replayDockDragged = false
  const replayStartMenu = host.querySelector('[data-rw-replay-start-menu]') as HTMLElement | null
  const replayHubDialog = host.querySelector('[data-rw-replay-hub-dialog]') as HTMLDialogElement | null
  const btnReplayHubClose = host.querySelector('[data-rw-replay-hub-close]') as HTMLButtonElement | null
  const chartLoadingEl = host.querySelector('[data-rw-chart-loading]') as HTMLElement | null
  const chartLoadingText = host.querySelector('[data-rw-chart-loading-text]') as HTMLElement | null
  const chartLoadingMeta = host.querySelector('[data-rw-chart-loading-meta]') as HTMLElement | null
  let chartLoadingDepth = 0

  type ChartLoadingOpts =
    | string
    | { kind: 'session'; session: SessionCreatedPayload; symbol: string; balance: number }

  function setChartLoading(active: boolean, opts: ChartLoadingOpts = 'Loading chart…') {
    if (!chartLoadingEl) return
    chartLoadingDepth += active ? 1 : -1
    if (chartLoadingDepth < 0) chartLoadingDepth = 0
    const on = chartLoadingDepth > 0
    chartLoadingEl.hidden = !on
    chartLoadingEl.setAttribute('aria-busy', on ? 'true' : 'false')
    if (typeof opts === 'string') {
      if (chartLoadingText) chartLoadingText.textContent = opts
      if (chartLoadingMeta) {
        chartLoadingMeta.hidden = true
        chartLoadingMeta.innerHTML = ''
      }
      return
    }
    if (chartLoadingText) chartLoadingText.textContent = 'Loading session…'
    if (chartLoadingMeta) {
      chartLoadingMeta.hidden = false
      chartLoadingMeta.innerHTML = sessionLoadingDetailsHtml(opts.session, opts.symbol, opts.balance)
    }
  }

  const btnReplayStartMenuToggle = host.querySelector('[data-rw-replay-select-menu-toggle]') as HTMLButtonElement | null
  const replaySelectLabel = host.querySelector('[data-rw-replay-select-label]') as HTMLElement | null
  const replaySelectIco = host.querySelector('[data-rw-replay-select-ico]') as HTMLElement | null

  function positionReplayDockCenterTop() {
    if (!replayDock) return
    replayDock.style.position = 'fixed'
    replayDock.style.bottom = 'auto'
    const wrapRect = chartWrapEl?.getBoundingClientRect()
    const dockW = replayDock.offsetWidth || 360
    const left = wrapRect
      ? wrapRect.left + Math.max(0, (wrapRect.width - dockW) / 2)
      : Math.max(8, (window.innerWidth - dockW) / 2)
    const top = wrapRect ? wrapRect.top + 14 : 56
    replayDock.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - dockW - 8, left)))}px`
    replayDock.style.top = `${Math.round(Math.max(48, top))}px`
  }

  function clampReplayDockToViewport() {
    if (!replayDock || replayDock.hidden) return
    const rect = replayDock.getBoundingClientRect()
    const w = rect.width
    const h = rect.height
    let left = rect.left
    let top = rect.top
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left))
    top = Math.max(48, Math.min(window.innerHeight - h - 8, top))
    replayDock.style.left = `${Math.round(left)}px`
    replayDock.style.top = `${Math.round(top)}px`
    replayDock.style.bottom = 'auto'
  }

  function mountReplayDockDrag() {
    if (!replayDock || !replayDockDrag) return
    let dragging = false
    let startX = 0
    let startY = 0
    let originLeft = 0
    let originTop = 0

    const onMove = (e: PointerEvent) => {
      if (!dragging || !replayDock) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      const w = replayDock.offsetWidth
      const h = replayDock.offsetHeight
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, originLeft + dx))
      const top = Math.max(48, Math.min(window.innerHeight - h - 8, originTop + dy))
      replayDock.style.left = `${Math.round(left)}px`
      replayDock.style.top = `${Math.round(top)}px`
    }

    const onUp = (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      replayDockDrag.releasePointerCapture(e.pointerId)
      replayDock?.classList.remove('rw-replay-dock--dragging')
      replayDockDragged = true
      syncReplayStartMenuPlacement()
    }

    replayDockDrag.addEventListener('pointerdown', (e) => {
      if (!replayDock) return
      e.preventDefault()
      dragging = true
      replayDock.classList.add('rw-replay-dock--dragging')
      replayDockDrag.setPointerCapture(e.pointerId)
      replayDock.style.position = 'fixed'
      replayDock.style.bottom = 'auto'
      const rect = replayDock.getBoundingClientRect()
      startX = e.clientX
      startY = e.clientY
      originLeft = rect.left
      originTop = rect.top
      replayDock.style.left = `${Math.round(originLeft)}px`
      replayDock.style.top = `${Math.round(originTop)}px`
    })
    replayDockDrag.addEventListener('pointermove', onMove)
    replayDockDrag.addEventListener('pointerup', onUp)
    replayDockDrag.addEventListener('pointercancel', onUp)
    cleanupFns.push(() => {
      replayDockDrag.removeEventListener('pointermove', onMove)
      replayDockDrag.removeEventListener('pointerup', onUp)
      replayDockDrag.removeEventListener('pointercancel', onUp)
    })
  }

  const state = {
    disposed: false,
    trading: null as ReturnType<typeof createTradingChart> | null,
    replay: null as ReplayController | null,
    clockTimer: null as ReturnType<typeof setInterval> | null,
    ro: null as ResizeObserver | null,
    exitSelectBarChartMode: null as null | (() => void),
    redrawDrawings: null as null | (() => void),
    openReplayBarPick: null as null | (() => void),
  }

  const cleanupFns: Array<() => void> = []

  mountReplayDockDrag()
  const onWindowResizeDock = () => {
    clampReplayDockToViewport()
    syncReplayStartMenuPlacement()
  }
  window.addEventListener('resize', onWindowResizeDock)
  cleanupFns.push(() => window.removeEventListener('resize', onWindowResizeDock))

  function syncReplayStartMenuPlacement() {
    if (!replayStartMenu || replayStartMenu.hidden) return
    const wrap = replayStartMenu.closest('.rw-replay-dock__select-wrap') as HTMLElement | null
    if (!wrap) return
    const gap = 6
    const toolbarClearance = 48
    const anchorRect = wrap.getBoundingClientRect()
    const menuH = replayStartMenu.offsetHeight || 220
    const spaceAbove = anchorRect.top - toolbarClearance
    const spaceBelow = window.innerHeight - anchorRect.bottom
    const openBelow =
      spaceBelow >= menuH + gap && (spaceBelow >= spaceAbove || anchorRect.top < window.innerHeight * 0.45)
    replayStartMenu.classList.toggle('rw-replay-start-menu--below', openBelow)
    replayStartMenu.classList.toggle('rw-replay-start-menu--above', !openBelow)
  }

  function closeStartMenu() {
    if (!replayStartMenu) return
    replayStartMenu.hidden = true
    btnReplayStartMenuToggle?.setAttribute('aria-expanded', 'false')
    btnReplayStartMenuToggle?.classList.remove('rw-replay-dock__select-chev--open')
  }

  function openStartMenu() {
    if (!replayStartMenu) return
    closeReplayHub()
    replayStartMenu.hidden = false
    btnReplayStartMenuToggle?.setAttribute('aria-expanded', 'true')
    btnReplayStartMenuToggle?.classList.add('rw-replay-dock__select-chev--open')
    requestAnimationFrame(() => {
      syncReplayStartMenuPlacement()
      requestAnimationFrame(() => syncReplayStartMenuPlacement())
    })
  }

  function toggleStartMenu() {
    if (!replayStartMenu) return
    if (replayStartMenu.hidden) openStartMenu()
    else closeStartMenu()
  }

  function closeReplayHub() {
    if (!replayHubDialog?.open) return
    replayHubDialog.close()
  }

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

  function syncReplaySpeedUi(speedIndex?: number) {
    if (!replaySpeed) return
    const idx = speedIndex ?? state.replay?.getSpeedIndex() ?? 0
    const clamped = Math.max(0, Math.min(REPLAY_BARS_PER_SEC.length - 1, Math.round(idx)))
    const bps = REPLAY_BARS_PER_SEC[clamped] ?? 1
    const label = replaySpeedLabel(bps)
    replaySpeed.value = String(clamped)
    replaySpeed.setAttribute('aria-valuetext', label)
    if (replaySpeedBubble) replaySpeedBubble.textContent = label
  }

  let chartBarCount = 1

  function syncReplayTransportUi(index?: number) {
    const idx = index ?? state.replay?.getState().index ?? 1
    const max = Math.max(1, chartBarCount)
    host.querySelectorAll<HTMLButtonElement>('[data-rw-replay-dock] [data-rw="start"]').forEach((btn) => {
      btn.disabled = idx <= 1
    })
    host.querySelectorAll<HTMLButtonElement>('[data-rw-replay-dock] [data-rw="end"]').forEach((btn) => {
      btn.disabled = idx >= max
    })
    host.querySelectorAll<HTMLButtonElement>('[data-rw-replay-dock] [data-rw="fwd"], [data-rw-replay-dock] [data-rw="step"]').forEach((btn) => {
      btn.disabled = idx >= max
    })
  }

  function syncTradeNavUi(_barTimeSec?: number) {
    /* Trade nav lives in backtest panel; floating replay pill has no trade row. */
  }

  function setReplayDockOpen(open: boolean, opts?: { backtest?: boolean; centerTop?: boolean }) {
    if (!replayDock || !btnReplayLaunch) return
    if (!open) {
      state.exitSelectBarChartMode?.()
      closeStartMenu()
      closeReplayHub()
      state.trading?.clearReplayPickPreview()
      replayDock.classList.remove('rw-replay-dock--backtest')
    } else if (opts?.backtest) {
      replayDock.classList.add('rw-replay-dock--backtest')
    } else {
      replayDock.classList.remove('rw-replay-dock--backtest')
    }
    replayDock.hidden = !open
    replayDock.classList.toggle('rw-replay-dock--visible', open)
    if (open) replayDock.removeAttribute('hidden')
    else replayDock.setAttribute('hidden', '')
    btnReplayLaunch.setAttribute('aria-expanded', open ? 'true' : 'false')
    rwRoot.classList.toggle('rw-replay-dock-open', open)
    btnReplayLaunch.title = open ? 'Hide bar replay' : 'Bar replay'
    if (open) {
      if (opts?.centerTop || !replayDockDragged) positionReplayDockCenterTop()
      else clampReplayDockToViewport()
    }
  }

  const onReplayLaunchClick = () => {
    if (!replayDock) return
    const opening = replayDock.hidden
    if (opening) setReplayDockOpen(true)
    else setReplayDockOpen(false)
  }
  const onReplayStartMenuToggleClick = (e: MouseEvent) => {
    e.stopPropagation()
    toggleStartMenu()
  }

  let chartTimeframe = '1m'
  subbarHeadEl.innerHTML = `<span style="color:#787b86">Loading <strong>${symUi}</strong>…</span>`
  chartVolEl.innerHTML = ''

  const onDocPointerCloseStartMenu = (e: PointerEvent) => {
    if (state.disposed) return
    const t = e.target as Node
    if (replayStartMenu?.contains(t) || btnReplayStartMenuToggle?.contains(t)) return
    if (btnReplayLaunch?.contains(t)) return
    if (selectBarOverlay?.contains(t) || selectBarTimeFlyout?.contains(t)) return
    if (btnSelectBarChart?.contains(t)) return
    if (dateDialog?.open && dateDialog.contains(t)) return
    closeStartMenu()
  }

  btnReplayHubClose?.addEventListener('click', closeReplayHub)
  cleanupFns.push(() => btnReplayHubClose?.removeEventListener('click', closeReplayHub))
  const onReplayHubDialogClose = () => {
    closeStartMenu()
  }
  replayHubDialog?.addEventListener('close', onReplayHubDialogClose)
  cleanupFns.push(() => replayHubDialog?.removeEventListener('close', onReplayHubDialogClose))

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

  const onStatsToggle = () => {
    if (!tradeStatsEl || !btnStatsToggle) return
    const hidden = tradeStatsEl.classList.toggle('rw-trade-stats--hidden')
    btnStatsToggle.setAttribute('aria-pressed', hidden ? 'true' : 'false')
    btnStatsToggle.setAttribute('aria-label', hidden ? 'Show account values' : 'Hide account values')
    btnStatsToggle.innerHTML = hidden ? icons.eyeOff : icons.eye
  }
  btnStatsToggle?.addEventListener('click', onStatsToggle)
  cleanupFns.push(() => btnStatsToggle?.removeEventListener('click', onStatsToggle))

  document.addEventListener('pointerdown', onDocPointerCloseStartMenu, true)
  cleanupFns.push(() => document.removeEventListener('pointerdown', onDocPointerCloseStartMenu, true))

  setChartLoading(true, { kind: 'session', session: activeSession, symbol: currentChartSymbol, balance: initialCash })

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

  const symbolSearchDlg = host.querySelector('#rw-symbol-search-dlg') as HTMLDialogElement | null
  const symbolSearch = symbolSearchDlg
    ? createSymbolSearchModal({
        dialog: symbolSearchDlg,
        getCurrentSymbol: () => formatDisplaySymbol(primarySessionSymbol(activeSession.assets)),
        onPick: (symbol) => applySymbolPick(symbol),
      })
    : null

  function openSymbolSearch() {
    if (state.disposed || !symbolSearch) return
    symbolSearch.open()
  }

  const btnSymbolSearch = host.querySelector('#rw-symbol-toolbar-search') as HTMLButtonElement | null
  const onSymbolSearchClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopImmediatePropagation()
    openSymbolSearch()
  }
  btnSymbolSearch?.addEventListener('click', onSymbolSearchClick, true)
  cleanupFns.push(() => btnSymbolSearch?.removeEventListener('click', onSymbolSearchClick, true))

  cleanupFns.push(() => symbolSearch?.dispose())

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

  const orderPanelPosEl = host.querySelector('[data-rw-order-panel-position]') as HTMLElement | null
  const btnPanelBuy = host.querySelector('[data-rw-panel-buy]') as HTMLButtonElement | null
  const btnPanelSell = host.querySelector('[data-rw-panel-sell]') as HTMLButtonElement | null
  const pineDockHost = host.querySelector('[data-rw-pine-dock]') as HTMLElement | null
  const btnFootPine = host.querySelector('[data-rw-foot-pine-editor]') as HTMLButtonElement | null
  const pineRailBtn = host.querySelector('[data-rw-rail="pine"]') as HTMLButtonElement | null

  let pineEditor: ReturnType<typeof createPineEditorDock> | null = null
  let onPineAddToChart: ((script: string, strategyId: string | null) => void) | null = null

  function resizeChartAfterLayout() {
    requestAnimationFrame(() => {
      if (state.trading && !state.disposed) {
        state.trading.chart.resize(chartHost.clientWidth, chartHost.clientHeight)
        state.trading.repaintTimeShades()
        state.redrawDrawings?.()
      }
    })
  }

  if (pineDockHost) {
    pineEditor = createPineEditorDock({
      host: pineDockHost,
      getSymbol: () => formatDisplaySymbol(currentChartSymbol),
      onOpenChange: (open) => {
        rwRoot.classList.toggle('rw-pine-open', open)
        pineRailBtn?.classList.toggle('rw-rail-btn--active', open)
        btnFootPine?.classList.toggle('rw-foot__panel--active', open)
        resizeChartAfterLayout()
      },
      onAddToChart: (script, strategyId) => onPineAddToChart?.(script, strategyId),
    })
    cleanupFns.push(() => pineEditor?.dispose())
  }

  function setPineEditorOpen(open: boolean) {
    if (open) pineEditor?.open()
    else pineEditor?.close()
  }

  function togglePineEditor() {
    if (pineEditor?.isOpen()) {
      setPineEditorOpen(false)
      return
    }
    setSidePanelOpen(false)
    host.querySelector('.rw-backtest-launch')?.classList.remove('rw-backtest-launch--active')
    railBtns.forEach((b) => {
      if (b.dataset.rwRail !== 'pine') b.classList.remove('rw-rail-btn--active')
    })
    setPineEditorOpen(true)
  }

  type SidePanelViewId = 'watchlist' | 'backtest' | 'order' | 'goto' | 'news' | 'journal' | 'settings'

  let sidePanelOpen = false
  let sidePanelView: SidePanelViewId = 'watchlist'

  function setSidePanelOpen(open: boolean) {
    sidePanelOpen = open
    rwRoot.classList.toggle('rw-rpanel-collapsed', !open)
    rpanelEl?.classList.toggle('rw-rpanel--collapsed', !open)
    if (!open) {
      railBtns.forEach((b) => b.classList.remove('rw-rail-btn--active'))
    }
    resizeChartAfterLayout()
  }

  function setSidePanelView(id: SidePanelViewId) {
    sidePanelView = id
    host.querySelectorAll<HTMLElement>('[data-rw-panel-view]').forEach((v) => {
      v.hidden = v.dataset.rwPanelView !== id
    })
    railBtns.forEach((b) => {
      b.classList.toggle('rw-rail-btn--active', b.dataset.rwRail === id)
    })
  }

  let lastWatchlistBar: Bar | null = null
  let lastWatchlistPrev: Bar | null = null

  function openSidePanel(id: SidePanelViewId) {
    if (pineEditor?.isOpen()) setPineEditorOpen(false)
    setSidePanelView(id)
    setSidePanelOpen(true)
    if (id === 'watchlist') {
      host.querySelector('.rw-backtest-launch')?.classList.remove('rw-backtest-launch--active')
      updateRightPanel(lastWatchlistBar, lastWatchlistPrev)
    }
    resizeChartAfterLayout()
  }

  function watchlistSymbols(): string[] {
    const session = parseSessionAssetList(activeSession.assets)
    const merged = [...session, currentChartSymbol, ...RECENT_SYMBOLS]
    const seen = new Set<string>()
    const out: string[] = []
    for (const sym of merged) {
      const u = sym.trim().toUpperCase()
      if (!u || seen.has(u)) continue
      seen.add(u)
      out.push(u)
    }
    return out.slice(0, 12)
  }

  function renderWatchlistTable(b: Bar | null, prev: Bar | null) {
    if (!watchlistBodyEl) return
    const list = watchlistSymbols()
    watchlistBodyEl.innerHTML = list
      .map((sym) => {
        const symUi = formatDisplaySymbol(sym)
        const active = sym === currentChartSymbol
        const rowCls = active ? ' rw-wl-row--active' : ''
        if (!active || !b) {
          return `<tr class="rw-wl-row${rowCls}" data-rw-wl-symbol="${symUi}" role="button" tabindex="0">
            <td>${symUi}</td>
            <td class="rw-wl-num">—</td>
            <td class="rw-wl-num">—</td>
          </tr>`
        }
        const last = formatSessionPrice(b.close)
        const ref = prev?.close
        if (ref == null || !Number.isFinite(ref) || ref === 0) {
          return `<tr class="rw-wl-row${rowCls}" data-rw-wl-symbol="${symUi}" role="button" tabindex="0">
            <td>${symUi}</td>
            <td class="rw-wl-num">${last}</td>
            <td class="rw-wl-num">—</td>
          </tr>`
        }
        const d = b.close - ref
        const pct = (d / ref) * 100
        const up = d >= 0
        const sign = up ? '+' : '−'
        const chgCls = up ? 'rw-wl-pos' : 'rw-wl-neg'
        return `<tr class="rw-wl-row${rowCls}" data-rw-wl-symbol="${symUi}" role="button" tabindex="0">
          <td>${symUi}</td>
          <td class="rw-wl-num">${last}</td>
          <td class="rw-wl-num ${chgCls}">${sign}${Math.abs(pct).toFixed(2)}%</td>
        </tr>`
      })
      .join('')
  }

  function syncOrderPanelPosition() {
    if (!orderPanelPosEl || !sessionPositionEl) return
    orderPanelPosEl.innerHTML = sessionPositionEl.innerHTML
  }

  const railBtns = host.querySelectorAll<HTMLButtonElement>('.rw-rpanel__rail .rw-rail-btn[data-rw-rail]')
  const onRailClick = (e: Event) => {
    const btn = e.currentTarget as HTMLButtonElement
    const id = btn.dataset.rwRail as SidePanelViewId | 'pine' | undefined
    if (!id) return
    if (id === 'pine') {
      togglePineEditor()
      return
    }
    if (sidePanelOpen && sidePanelView === id) {
      setSidePanelOpen(false)
      railBtns.forEach((b) => b.classList.remove('rw-rail-btn--active'))
      return
    }
    openSidePanel(id)
  }
  railBtns.forEach((b) => b.addEventListener('click', onRailClick))
  cleanupFns.push(() => railBtns.forEach((b) => b.removeEventListener('click', onRailClick)))

  const onWatchlistRowClick = (e: Event) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-rw-wl-symbol]')
    if (!row) return
    const sym = row.dataset.rwSymbol ?? row.dataset.rwWlSymbol
    if (sym && sym !== currentChartSymbol) applySymbolPick(sym)
  }
  watchlistBodyEl?.addEventListener('click', onWatchlistRowClick)
  cleanupFns.push(() => watchlistBodyEl?.removeEventListener('click', onWatchlistRowClick))

  setSidePanelView('watchlist')
  setSidePanelOpen(false)
  renderWatchlistTable(null, null)

  const onPanelBuy = () => ticketBuy.click()
  const onPanelSell = () => ticketSell.click()
  btnPanelBuy?.addEventListener('click', onPanelBuy)
  btnPanelSell?.addEventListener('click', onPanelSell)
  cleanupFns.push(() => btnPanelBuy?.removeEventListener('click', onPanelBuy))
  cleanupFns.push(() => btnPanelSell?.removeEventListener('click', onPanelSell))

  const onFootPineClick = () => togglePineEditor()
  btnFootPine?.addEventListener('click', onFootPineClick)
  cleanupFns.push(() => btnFootPine?.removeEventListener('click', onFootPineClick))

  const btnPanelThemeToggle = host.querySelector('[data-rw-panel-theme-toggle]') as HTMLButtonElement | null
  const onPanelThemeToggle = () => applyChartPaletteToggle()
  btnPanelThemeToggle?.addEventListener('click', onPanelThemeToggle)
  cleanupFns.push(() => btnPanelThemeToggle?.removeEventListener('click', onPanelThemeToggle))

  const onHome = () => opts?.onExit?.()
  btnHome.addEventListener('click', onHome)
  cleanupFns.push(() => btnHome.removeEventListener('click', onHome))

  const onFocusReplayBar = () => {
    setReplayDockOpen(true, { centerTop: true })
  }
  const focusReplayBtn = host.querySelector('[data-rw-focus-replay]')
  focusReplayBtn?.addEventListener('click', onFocusReplayBar)
  cleanupFns.push(() => focusReplayBtn?.removeEventListener('click', onFocusReplayBar))

  function lastBar(slice: Bar[]): Bar | null {
    const n = slice.length
    return n ? slice[n - 1]! : null
  }

  function updateSidePanelFromReplay(b: Bar | null) {
    if (!sidePanel || !backtestState.result || !b) return
    const snap = getBacktestSnapshotAtTime(backtestState.result, b.time, b.close)
    sidePanel.update({
      result: backtestState.result,
      snapshot: snap,
      isFinal: false,
    })
    syncOrderPanelPosition()
  }

  function updateRightPanel(b: Bar | null, prev: Bar | null) {
    lastWatchlistBar = b
    lastWatchlistPrev = prev
    renderWatchlistTable(b, prev)
    if (!rightQuoteEl || !rightChgEl) return
    if (!b) {
      rightQuoteEl.textContent = '—'
      rightChgEl.textContent = '—'
      rightQuoteEl.classList.remove('rw-quote-big--up', 'rw-quote-big--down')
      updateSidePanelFromReplay(null)
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
    } else {
      rightQuoteEl.classList.remove('rw-quote-big--up', 'rw-quote-big--down')
      rightChgEl.textContent = '—'
      rightChgEl.classList.remove('rw-quote-sub--up', 'rw-quote-sub--down')
    }
    updateSidePanelFromReplay(b)
  }

  void (async () => {
    let series: Awaited<ReturnType<typeof loadSessionBars>> | null = null
    try {
      series = await loadSessionBars(currentChartSymbol, activeSession.name, undefined, {
        startDate: activeSession.startDate,
        endDate: activeSession.endDate,
      })
    } catch (err) {
      console.error('[ChartLoad]', err)
      subbarHeadEl.innerHTML = `<span style="color:#787b86">Failed to load <strong>${symUi}</strong>. Check the data feed and try another symbol from search.</span>`
      chartVolEl.innerHTML = ''
      if (replayStatusEl) replayStatusEl.textContent = 'Replay · load failed'
      return
    } finally {
      setChartLoading(false)
    }
    if (state.disposed || !series) return
    if (series.dataSource && usesMarketDataSession(currentChartSymbol)) {
      feedLabel = `Suplexity · ${series.dataSource}`
    }
    if (symDetailFeedEl) symDetailFeedEl.textContent = symDetailFeedTag(currentChartSymbol, feedLabel)
    if (dataBanner && usesMarketDataSession(currentChartSymbol) && series.dataSource?.includes('synthetic')) {
      dataBanner.hidden = false
      dataBanner.textContent =
        'Live market data unavailable (showing demo bars). Check historic API on 127.0.0.1:3001, TWELVE_DATA_API_KEY, and your Twelve Data plan for this symbol (silver/oil need Grow+), then reload.'
    }
    let chartBars = filterSessionChartBars(series.bars, activeSession)
    const sessionReplayStartIndex = sessionStartReplayIndex(chartBars, activeSession.startDate)
    if (
      chartBars.length < 8 &&
      (activeSession.startDate?.trim() || activeSession.endDate?.trim())
    ) {
      if (dataBanner) {
        dataBanner.hidden = false
        dataBanner.textContent =
          'No bars in the selected date range. Check that the range has market data, or adjust start/end in a new session.'
      }
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

    const replayAccount = createReplayAccount(initialCash)
    let positionOverlay: ReturnType<typeof mountChartPositionOverlay> | null = null

    function renderManualPositionPanel(markPrice: number) {
      if (!sessionPositionEl || backtestState.result) return
      const positions = replayAccount.getPositions()
      if (!positions.length) {
        sessionPositionEl.innerHTML =
          '<p class="rw-session-empty">Use <strong>Buy</strong> or <strong>Sell</strong> to open a position.</p>'
        return
      }
      sessionPositionEl.innerHTML = positions
        .map((p) => {
          const pnl = positionUnrealized(p, markPrice)
          const up = pnl >= 0
          return `<div class="rw-manual-pos">
            <span class="rw-manual-pos__dir rw-manual-pos__dir--${p.direction}">${p.direction === 'long' ? 'Long' : 'Short'}</span>
            <span>${p.qty} @ ${formatSessionPrice(p.entryPrice)}</span>
            <span class="rw-manual-pos__pnl${up ? ' rw-manual-pos__pnl--up' : ' rw-manual-pos__pnl--down'}">${formatMoney(pnl)}</span>
          </div>`
        })
        .join('')
    }

    function positionPriceHints(): number[] {
      const hints: number[] = []
      for (const p of replayAccount.getPositions()) {
        hints.push(p.entryPrice)
        if (p.takeProfit != null) hints.push(p.takeProfit)
        if (p.stopLoss != null) hints.push(p.stopLoss)
      }
      return hints
    }

    function syncPositionOverlay(recreateLines = true) {
      state.trading?.setPositionPriceHints(positionPriceHints())
      positionOverlay?.sync({ recreateLines })
    }

    function syncTradingUi(b: Bar | null) {
      const mark = b?.close ?? 0
      if (b) {
        const { bid, ask } = bidAskFromBar(b)
        replayAccount.processExits(Number(b.time), mark, bid, ask)
      }
      const sum = replayAccount.summary(mark)
      host.querySelectorAll('.rw-bal').forEach((el) => {
        el.textContent = formatMoney(sum.equity)
      })
      host.querySelectorAll('.rw-rp').forEach((el) => {
        el.textContent = formatMoney(sum.realizedPnL)
      })
      host.querySelectorAll('.rw-up').forEach((el) => {
        el.textContent = formatMoney(sum.unrealizedPnL)
        el.classList.toggle('rw-trade-stats__val--up', sum.unrealizedPnL > 0)
        el.classList.toggle('rw-trade-stats__val--down', sum.unrealizedPnL < 0)
      })
      renderManualPositionPanel(mark)
      syncPositionOverlay(true)
    }

    const trading = createTradingChart(chartLwc, {
      theme: tradingThemeFromUi(uiChartTheme),
      timeAxisUtcMinutes: 5,
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

    function scrollChartToLocalDay(ymd: string) {
      const parts = ymd.split('-').map(Number)
      if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return
      const [y, m0, d] = parts as [number, number, number]
      const t0 = Math.floor(new Date(y, m0 - 1, d, 0, 0, 0).getTime() / 1000)
      const t1 = Math.floor(new Date(y, m0 - 1, d, 23, 59, 59).getTime() / 1000)
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
        footGotoDateInput.value = localYmdFromSec(last.time)
      }
      footGotoDlg.showModal()
    }
    const onFootGotoOk = () => {
      const v = footGotoDateInput?.value?.trim()
      if (v) scrollChartToLocalDay(v)
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

    const legendTitle = () =>
      `${formatLegendSymbol(currentChartSymbol, currentFullName)} · ${legendTimeframeLabel(chartTimeframe)} · ${legendPlatformFeed(feedLabel)}`

    function updateLegend(slice: Bar[]) {
      const title = legendTitle()
      const b = lastBar(slice)
      if (!b) {
        subbarHeadEl.innerHTML = `
        <div class="rw-subbar__tvrow">
          <div class="rw-subbar__sym"><span class="rw-legend-title">${title}</span></div>
        </div>`
        chartVolEl.innerHTML = ''
        syncTradingUi(null)
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
          <span class="rw-legend-title">${title}</span>
        </div>
        <div class="rw-subbar__ohlc rw-legend-ohlc ${dirClass}">
          <span class="rw-legend-status" aria-hidden="true"></span>
          <span class="rw-subbar__ohlc-txt">${ohlcTv}</span>
        </div>
      </div>
    `
      chartVolEl.innerHTML = ''
      syncTradingUi(b)
      updateRightPanel(b, prev)
    }

    let firstChartPaint = true
    let paintedWithNonZeroHost = false

    function onReplayTick(slice: Bar[], index: number) {
      const allBars = replay.getBars()
      if (state.trading) {
        const showFullSession = index >= allBars.length && slice.length === allBars.length
        const paintOpts = {
          fit: firstChartPaint,
          initialVisibleBarCount: firstChartPaint ? computeInitialVisibleForBars(allBars) : undefined,
          initialVisibleAnchor: firstChartPaint && activeSession.startDate?.trim() ? ('start' as const) : ('end' as const),
          ...(firstChartPaint ? { timeAxisUtcMinutes: 5 as const } : {}),
        }
        state.trading.setReplayData(showFullSession ? allBars : slice, allBars, paintOpts)
        firstChartPaint = false
      }
      const cursorBar = lastBar(slice)
      if (backtestState.result && state.trading) {
        state.trading.setTradeMarkers(
          cursorBar
            ? tradeMarkersUpToTime(backtestState.result, Number(cursorBar.time))
            : [],
        )
      }
      if (replayStatusEl) {
        const mode = activeSession.sessionType === 'prop' ? 'Prop challenge' : 'Backtest'
        replayStatusEl.textContent = `${mode} · bar ${index} / ${chartBars.length} · ${feedLabel}`
      }
      const playBtnEl = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
      setReplayPlayButtonIcon(playBtnEl, state.replay?.getState().playing ?? false)
      updateLegend(slice)
      updateSidePanelFromReplay(cursorBar)
      chartBarCount = chartBars.length
      syncReplayTransportUi(index)
      syncTradeNavUi(cursorBar ? Number(cursorBar.time) : undefined)
      syncPositionOverlay(true)
    }

    const replay = new ReplayController(chartBars, onReplayTick)
    replay.setLoopStartIndex(sessionReplayStartIndex)
    replay.replaceBarsAt(chartBars, chartBars.length)
    state.replay = replay

    positionOverlay = mountChartPositionOverlay({
      chartHost,
      chart: trading.chart,
      getSeries: () => trading.getMainSeries(),
      getPositions: () => replayAccount.getPositions(),
      getMarkPrice: () => lastBar(replay.slice())?.close ?? 0,
      getAnchorTime: () => {
        const slice = replay.slice()
        const last = slice.length ? slice[slice.length - 1]! : null
        return last ? Number(last.time) : null
      },
      getSeriesDataRevision: () => trading.getSeriesDataRevision(),
      formatMoney,
      onClose: (id) => {
        const b = lastBar(replay.slice())
        if (!b) return
        const { bid, ask } = bidAskFromBar(b)
        const pos = replayAccount.getPositions().find((p) => p.id === id)
        if (!pos) return
        replayAccount.closePosition(id, pos.direction === 'long' ? bid : ask)
        syncTradingUi(b)
      },
      onToggleTakeProfit: (id) => {
        const pos = replayAccount.getPositions().find((p) => p.id === id)
        if (!pos) return
        if (pos.takeProfit != null) {
          replayAccount.setTakeProfit(id, null)
        } else {
          replayAccount.setTakeProfit(id, defaultTpSl(pos.entryPrice, pos.direction).tp)
        }
        syncTradingUi(lastBar(replay.slice()))
      },
      onToggleStopLoss: (id) => {
        const pos = replayAccount.getPositions().find((p) => p.id === id)
        if (!pos) return
        if (pos.stopLoss != null) {
          replayAccount.setStopLoss(id, null)
        } else {
          replayAccount.setStopLoss(id, defaultTpSl(pos.entryPrice, pos.direction).sl)
        }
        syncTradingUi(lastBar(replay.slice()))
      },
    })
    cleanupFns.push(() => {
      positionOverlay?.dispose()
      positionOverlay = null
    })
    syncTradingUi(lastBar(replay.slice()))

    let source1mBars = chartBars.slice()
    let sourceTickBars: ReturnType<typeof syntheticTicksFromMinuteBars> = []
    let canResample = inferTimeframeFromBars(source1mBars) === '1m'

    function refreshTickSource() {
      sourceTickBars = canResample ? syntheticTicksFromMinuteBars(source1mBars) : []
    }
    refreshTickSource()

    function canUseTickIntervals() {
      return canResample && sourceTickBars.length >= 8
    }

    let symbolSwitchSeq = 0

    async function applySymbolChange(nextSymbol: string) {
      const s = nextSymbol.trim().toUpperCase()
      if (!s || s === currentChartSymbol) return
      const seq = ++symbolSwitchSeq

      setChartLoading(true, {
        kind: 'session',
        session: activeSession,
        symbol: s,
        balance: initialCash,
      })
      try {
        replay.pause()
        const playBtn = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
        setReplayPlayButtonIcon(playBtn, false)
        backtestState.result = null
        sidePanel?.clear()
        syncOrderPanelPosition()
        syncTradeNavUi()
        state.trading?.setTradeMarkers([])
        if (dataBanner) dataBanner.hidden = true

        const series = await loadSessionBars(s, activeSession.name, undefined, {
          startDate: activeSession.startDate,
          endDate: activeSession.endDate,
        })
        if (state.disposed || seq !== symbolSwitchSeq) return

        activeSession = { ...activeSession, assets: s }
        currentChartSymbol = s

        if (series.dataSource && usesMarketDataSession(s)) {
          feedLabel = `Suplexity · ${series.dataSource}`
        } else {
          feedLabel = defaultSessionFeedLabel(activeSession.sessionType, s)
        }

        paintSymbolPanel(s, feedLabel)
        renderWatchlistTable(null, null)

        if (dataBanner && usesMarketDataSession(s) && series.dataSource?.includes('synthetic')) {
          dataBanner.hidden = false
          dataBanner.textContent =
            'Live market data unavailable (showing demo bars). Check historic API on 127.0.0.1:3001, TWELVE_DATA_API_KEY, and your Twelve Data plan for this symbol (silver/oil need Grow+), then reload.'
        }

        chartBars = filterSessionChartBars(series.bars, activeSession)
        const sessionReplayStartIndex = sessionStartReplayIndex(chartBars, activeSession.startDate)
        chartTimeframe = series.timeframe
        intervalPill.textContent = chartTimeframe
        if (replayDockTf) replayDockTf.textContent = chartTimeframe

        source1mBars = chartBars.slice()
        canResample = inferTimeframeFromBars(source1mBars) === '1m'
        refreshTickSource()

        if (!chartBars.length) {
          subbarHeadEl.innerHTML = `<span style="color:#787b86">No bars for <strong>${formatDisplaySymbol(s)}</strong>. Check the data feed or session import.</span>`
          chartVolEl.innerHTML = ''
          if (replayStatusEl) replayStatusEl.textContent = 'Replay · no data'
          replay.replaceBarsAt([], 1)
          return
        }

        firstChartPaint = true
        paintedWithNonZeroHost = false
        replay.replaceBarsAt(chartBars, chartBars.length)
        replay.setLoopStartIndex(sessionReplayStartIndex)
        state.redrawDrawings?.()
      } catch (e) {
        console.error('[SymbolChange]', e)
        window.alert(e instanceof Error ? e.message : 'Failed to load symbol.')
      } finally {
        if (seq === symbolSwitchSeq) setChartLoading(false)
      }
    }

    switchChartSymbolImpl = (symbol) => {
      void applySymbolChange(symbol)
    }

    if (pendingSymbolPick) {
      const queued = pendingSymbolPick
      pendingSymbolPick = null
      void applySymbolChange(queued)
    }

    // ── Backtest engine ─────────────────────────────────────────────────────
    const btnBacktest = host.querySelector('.rw-backtest-launch') as HTMLButtonElement | null
    const backtestStrategyToolbar = host.querySelector('[data-rw-backtest-strategy-toolbar]') as HTMLSelectElement | null

    let activeStrategy: StrategyDefinition = EMA_CROSS
    const backtestBtnDefaultHtml = btnBacktest?.innerHTML ?? ''

    const strategyOptionsHtml = BUILT_IN_STRATEGIES.map(
      (s) => `<option value="${s.id}">${s.name}</option>`,
    ).join('')

    function populateStrategySelects() {
      if (backtestStrategyToolbar) {
        backtestStrategyToolbar.innerHTML = strategyOptionsHtml
        backtestStrategyToolbar.value = activeStrategy.id
      }
    }

    populateStrategySelects()

    onPineAddToChart = (_script, strategyId) => {
      if (!strategyId || !backtestStrategyToolbar) return
      backtestStrategyToolbar.value = strategyId
      syncActiveStrategyFromSelect()
    }

    function syncActiveStrategyFromSelect() {
      const id = backtestStrategyToolbar?.value
      const found = BUILT_IN_STRATEGIES.find((s) => s.id === id)
      if (found) activeStrategy = found
    }

    function barsForBacktest(): Bar[] {
      if (canResample && source1mBars.length >= 50) return source1mBars
      return chartBars
    }

    function showFullChartForBacktest(bars: Bar[], startIndex: number) {
      replay.pause()
      chartBars = bars
      const idx = Math.max(1, Math.min(Math.round(startIndex), bars.length))
      firstChartPaint = true
      replay.replaceBarsAt(bars, idx)
      requestAnimationFrame(() => state.trading?.scrollReplayCursorIntoView())
    }

    function onBacktestClick() {
      if (sidePanelOpen && sidePanelView === 'backtest') {
        setSidePanelOpen(false)
        railBtns.forEach((b) => b.classList.remove('rw-rail-btn--active'))
        btnBacktest?.classList.remove('rw-backtest-launch--active')
        return
      }
      runAndShowBacktest()
    }

    function runAndShowBacktest() {
      const bars = barsForBacktest()
      if (bars.length < 50) {
        window.alert('Need at least 50 bars loaded to run a backtest.')
        return
      }
      syncActiveStrategyFromSelect()
      const replayStartBar = Math.max(1, Math.min(replay.getState().index, bars.length))
      if (btnBacktest) {
        btnBacktest.disabled = true
        btnBacktest.textContent = 'Running…'
      }

      try {
        const result = runBacktest(bars, activeStrategy, {
          initialCapital: initialCash,
          commission: 2,
          slippage: defaultBacktestSlippage(currentChartSymbol),
          startBarIndex: replayStartBar,
          onProgress: (pct) => {
            if (btnBacktest) btnBacktest.textContent = `Running… ${pct}%`
          },
        })
        numberTrades(result)
        console.log('Backtest done:', result.summary)

        backtestState.result = result
        ;(window as unknown as { __backtestResult?: BacktestResult }).__backtestResult = result
        showFullChartForBacktest(bars, replayStartBar)
        replay.setLoopStartIndex(replayStartBar)

        const cursorBar = bars[Math.max(0, replayStartBar - 1)] ?? null
        if (state.trading) {
          state.trading.setTradeMarkers(
            cursorBar && result.trades.length
              ? tradeMarkersUpToTime(result, Number(cursorBar.time))
              : [],
          )
        }

        sidePanel?.update({
          result,
          runningSummary: result.summary,
          isFinal: true,
        })
        syncOrderPanelPosition()
        openSidePanel('backtest')
        btnBacktest?.classList.add('rw-backtest-launch--active')
        sidePanel?.scrollIntoView()
        syncTradeNavUi(cursorBar ? Number(cursorBar.time) : undefined)
      } catch (e) {
        console.error('[BacktestEngine]', e)
        window.alert(e instanceof Error ? e.message : 'Backtest failed.')
      } finally {
        if (btnBacktest) {
          btnBacktest.disabled = false
          btnBacktest.innerHTML = backtestBtnDefaultHtml
        }
      }
    }

    const onBacktestClickHandler = () => onBacktestClick()
    btnBacktest?.addEventListener('click', onBacktestClickHandler)
    cleanupFns.push(() => btnBacktest?.removeEventListener('click', onBacktestClickHandler))

    const onBacktestRerunClick = (e: MouseEvent) => {
      e.stopPropagation()
      runAndShowBacktest()
    }
    btnBacktestRerun?.addEventListener('click', onBacktestRerunClick)
    cleanupFns.push(() => btnBacktestRerun?.removeEventListener('click', onBacktestRerunClick))

    const onStrategyToolbarChange = () => syncActiveStrategyFromSelect()
    backtestStrategyToolbar?.addEventListener('change', onStrategyToolbarChange)
    cleanupFns.push(() => backtestStrategyToolbar?.removeEventListener('change', onStrategyToolbarChange))

    let syncTimeframe = true

    function applyIntervalPick(pick: IntervalPick) {
      const slice = replay.slice()
      const cursorTime = slice.length ? slice[slice.length - 1]!.time : null
      let nextBars: typeof chartBars
      if (pick.kind === 'tick') {
        const tickCount = pick.tickCount ?? 1
        nextBars = aggregateBarsByTicks(sourceTickBars, tickCount)
        if (nextBars.length < 2) {
          window.alert('Not enough tick history for this interval in the session.')
          return
        }
      } else {
        const step = pick.stepSec ?? 60
        if (step < 60) {
          window.alert('Sub-minute intervals require second-level history for this symbol.')
          return
        }
        nextBars = step === 60 ? source1mBars.slice() : aggregateOHLCV(source1mBars, step)
        if (nextBars.length < 2) {
          window.alert('Not enough 1-minute history to build this interval for the session.')
          return
        }
      }
      chartBars = nextBars
      chartTimeframe = pick.pill
      intervalPill.textContent = pick.pill
      if (replayDockTf) replayDockTf.textContent = pick.pill
      firstChartPaint = true
      state.trading?.setTradeMarkers([])
      backtestState.result = null
      sidePanel?.clear()
      syncOrderPanelPosition()
      syncTradeNavUi()
      const nextIndex =
        cursorTime != null ? barIndexAtOrBeforeTime(chartBars, Number(cursorTime)) : chartBars.length
      replay.replaceBarsAt(chartBars, nextIndex)
      state.redrawDrawings?.()
      requestAnimationFrame(() => state.trading?.scrollReplayCursorIntoView())
    }

    const intervalMenu = createChartIntervalMenu({
      anchor: intervalPill,
      getSelectedPill: () => chartTimeframe,
      canResampleFrom1m: () => canResample,
      canUseTicks: () => canUseTickIntervals(),
      onSelect: (p) => applyIntervalPick(p),
      onOpenChange: (v) => intervalPill.setAttribute('aria-expanded', v ? 'true' : 'false'),
    })

    const replayIntervalMenu = replayIntervalBtn
      ? createChartIntervalMenu({
          anchor: replayIntervalBtn,
          getSelectedPill: () => chartTimeframe,
          canResampleFrom1m: () => canResample,
          canUseTicks: () => canUseTickIntervals(),
          onSelect: (p) => applyIntervalPick(p),
          onOpenChange: (open) => {
            replayIntervalBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
            replayIntervalBtn.classList.toggle('rw-replay-dock__interval--open', open)
          },
        })
      : null

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

    const onReplayIntervalClick = (e: MouseEvent) => {
      e.stopPropagation()
      replayIntervalMenu?.toggle()
    }
    replayIntervalBtn?.addEventListener('click', onReplayIntervalClick)
    cleanupFns.push(() => {
      replayIntervalBtn?.removeEventListener('click', onReplayIntervalClick)
      replayIntervalMenu?.dispose()
      replayIntervalBtn?.setAttribute('aria-expanded', 'false')
      replayIntervalBtn?.classList.remove('rw-replay-dock__interval--open')
    })

    const hostLaidOut = await waitForChartHostLayout(chartHost, () => state.disposed)
    if (state.disposed) return
    trading.chart.resize(chartHost.clientWidth, chartHost.clientHeight)
    onReplayTick(replay.slice(), replay.getState().index)
    if (hostLaidOut) paintedWithNonZeroHost = true

    function resolveReplayPickIndex(y: number, m0: number, d: number, hh: number, mm: number): number {
      const bars = replay.getBars()
      const { index, clamped } = findReplayBarIndex(bars, y, m0, d, hh, mm)
      if (clamped && dataBanner) {
        const lastBar = bars[bars.length - 1]
        dataBanner.hidden = false
        dataBanner.textContent = lastBar
          ? `Selected moment is beyond loaded candles (last bar ${formatChartCrosshairTime(lastBar.time)}). Jumped to the closest available bar.`
          : 'No candles loaded for the selected date.'
      }
      return index
    }

    function syncPlayBtnPaused() {
      const playBtn = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
      setReplayPlayButtonIcon(playBtn, false)
    }

    /** Seek replay cursor and scroll the chart so the selected bar is centered (FXReplay-style). */
    async function seekReplayToIndex(index: number, loadingMsg: string | false = 'Updating chart…') {
      const showOverlay = loadingMsg !== false
      if (showOverlay) setChartLoading(true, loadingMsg)
      try {
        replay.pause()
        syncPlayBtnPaused()
        replay.setIndex(index)
        setReplayDockOpen(true)
        state.trading?.scrollReplayCursorIntoView()
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
        state.trading?.scrollReplayCursorIntoView()
        await new Promise((r) => setTimeout(r, 80))
      } finally {
        if (showOverlay) setChartLoading(false)
      }
    }

    function formatLocalPickLabel(sec: number): string {
      const d = new Date(Number(sec) * 1000)
      const wk = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]!
      const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
        d.getMonth()
      ]!
      const day = String(d.getDate()).padStart(2, '0')
      const y2 = String(d.getFullYear() % 100).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return `Re: ${wk} ${day} ${mon} '${y2} ${hh}:${mm}`
    }

    let selectBarChartActive = false
    let replaySelectMode: 'bar' | 'date' = 'date'
    let lastPointerClientX: number | null = null
    let lastPointerClientY: number | null = null
    let lastSnappedSliceIndex = 0
    let pickStableIdx = 0

    function setSelectBarPointerInChart(inChart: boolean) {
      selectBarOverlay?.classList.toggle('rw-select-bar-overlay--pointer-in', inChart)
      selectBarTimeFlyout?.classList.toggle('rw-select-bar-overlay--pointer-in', inChart)
      if (!inChart) {
        chartCanvas.style.removeProperty('--rw-sb-sx')
      }
    }

    function maxPickBarIndex(): number {
      const slice = replay.slice()
      if (!slice.length) return 0
      // Last bar actually drawn on the chart (exclude unplayed bars in the dataset).
      return slice.length - 1
    }

    function pickIndexAtClientX(clientX: number): number {
      const allBars = replay.getBars()
      if (!state.trading || allBars.length === 0) return pickStableIdx
      const maxIdx = maxPickBarIndex()
      const rect = chartLwc.getBoundingClientRect()
      const x = clientX - rect.left
      const logical = state.trading.chart.timeScale().coordinateToLogical(x)
      if (logical == null || !Number.isFinite(Number(logical))) return Math.min(pickStableIdx, maxIdx)
      return Math.max(0, Math.min(maxIdx, Math.round(Number(logical))))
    }

    /** X in chart-host pixels for the vertical bar-pick line (snapped to candle). */
    function lineXAtBarIndex(idx: number): number | null {
      if (!state.trading) return null
      const coord = state.trading.chart.timeScale().logicalToCoordinate(idx as Logical)
      if (coord == null || !Number.isFinite(Number(coord))) return null
      return Number(coord)
    }

    function paintSelectBarCursor(lineX: number, offsetY: number) {
      if (!selectBarOverlay) return
      const w = selectBarOverlay.clientWidth
      const h = selectBarOverlay.clientHeight
      const x = Math.max(0, Math.min(w, lineX))
      const y = Math.max(0, Math.min(h, offsetY))
      selectBarOverlay.style.setProperty('--sx', `${x}px`)
      selectBarOverlay.style.setProperty('--sy', `${y}px`)

      const canvasRect = chartCanvas.getBoundingClientRect()
      const hostRect = chartHost.getBoundingClientRect()
      chartCanvas.style.setProperty('--rw-sb-sx', `${hostRect.left - canvasRect.left + x}px`)
    }

    function updateSelectBarLabel(clientX: number): number {
      const idx = pickIndexAtClientX(clientX)
      pickStableIdx = idx
      lastSnappedSliceIndex = idx
      const bar = replay.getBars()[idx]
      if (bar && selectBarTimeEl) selectBarTimeEl.textContent = formatLocalPickLabel(Number(bar.time))
      return idx
    }

    function syncSelectBarLineAtIndex(idx: number, offsetY: number) {
      const lineX = lineXAtBarIndex(idx)
      if (lineX == null) return false
      paintSelectBarCursor(lineX, offsetY)
      return true
    }

    let selectBarSyncRaf = 0
    let pendingSelectBarPointer: { x: number; y: number } | null = null

    function scheduleSelectBarSync(clientX: number, clientY: number) {
      pendingSelectBarPointer = { x: clientX, y: clientY }
      if (selectBarSyncRaf) return
      selectBarSyncRaf = requestAnimationFrame(() => {
        selectBarSyncRaf = 0
        const p = pendingSelectBarPointer
        pendingSelectBarPointer = null
        if (p) syncSelectBarFromPointer(p.x, p.y)
      })
    }

    function syncSelectBarFromPointer(clientX: number, clientY: number) {
      const hostRect = chartHost.getBoundingClientRect()
      const y = clientY - hostRect.top
      if (
        clientX < hostRect.left ||
        clientX > hostRect.right ||
        clientY < hostRect.top ||
        clientY > hostRect.bottom
      ) {
        setSelectBarPointerInChart(false)
        return
      }
      setSelectBarPointerInChart(true)
      lastPointerClientX = clientX
      lastPointerClientY = clientY
      const idx = updateSelectBarLabel(clientX)
      if (!syncSelectBarLineAtIndex(idx, y)) setSelectBarPointerInChart(false)
    }

    const onSelectBarChartRangeChange = () => {
      if (!selectBarChartActive) return
      if (lastPointerClientX != null && lastPointerClientY != null) {
        const hostRect = chartHost.getBoundingClientRect()
        const y = lastPointerClientY - hostRect.top
        syncSelectBarLineAtIndex(pickStableIdx, y)
        return
      }
      const hostRect = chartHost.getBoundingClientRect()
      const y =
        (selectBarOverlay && parseFloat(selectBarOverlay.style.getPropertyValue('--sy'))) ||
        hostRect.height * 0.42
      syncSelectBarLineAtIndex(pickStableIdx, y)
    }

    function setReplaySelectUi(mode: 'bar' | 'date') {
      replaySelectMode = mode
      if (replaySelectLabel) {
        replaySelectLabel.textContent = mode === 'date' ? 'Select date' : 'Select bar'
      }
      if (replaySelectIco) {
        replaySelectIco.innerHTML = mode === 'date' ? icons.replaySelectDate : icons.replayBarSelect
      }
      host.querySelectorAll('.rw-replay-start-menu__item').forEach((el) => {
        const id = (el as HTMLElement).dataset.rwReplayStart
        el.classList.toggle(
          'rw-replay-start-menu__item--active',
          (mode === 'bar' && id === 'bar') || (mode === 'date' && id === 'date'),
        )
      })
    }

    setReplaySelectUi('date')

    function closeSelectBarChartMode(apply: boolean) {
      if (!selectBarChartActive) return
      selectBarChartActive = false
      pickStableIdx = 0
      lastPointerClientX = null
      lastPointerClientY = null
      pendingSelectBarPointer = null
      if (selectBarSyncRaf) {
        cancelAnimationFrame(selectBarSyncRaf)
        selectBarSyncRaf = 0
      }
      if (selectBarOverlay) {
        selectBarOverlay.hidden = true
        selectBarOverlay.classList.remove('rw-select-bar-overlay--active')
        selectBarOverlay.classList.remove('rw-select-bar-overlay--pointer-in')
        selectBarOverlay.setAttribute('aria-hidden', 'true')
        selectBarOverlay.style.removeProperty('--sx')
        selectBarOverlay.style.removeProperty('--sy')
      }
      if (selectBarTimeFlyout) {
        selectBarTimeFlyout.hidden = true
        selectBarTimeFlyout.classList.remove('rw-select-bar-overlay--pointer-in')
        selectBarTimeFlyout.setAttribute('aria-hidden', 'true')
      }
      chartCanvas.style.removeProperty('--rw-sb-sx')
      btnSelectBarChart?.classList.remove('rw-replay-dock__select--picking')
      btnSelectBarChart?.setAttribute('aria-pressed', 'false')
      if (selectBarTimeEl) selectBarTimeEl.textContent = ''
      state.trading?.chart.applyOptions({ crosshair: { mode: CrosshairMode.Normal } })
      state.trading?.clearReplayPickPreview()
      if (apply) {
        void seekReplayToIndex(lastSnappedSliceIndex + 1)
      } else {
        const slice = replay.slice()
        onReplayTick(slice, replay.getState().index)
      }
    }

    function openSelectBarChartMode() {
      if (!state.trading || !selectBarOverlay || !selectBarTimeEl) return
      const allBars = replay.getBars()
      if (allBars.length === 0) return
      closeStartMenu()
      closeReplayHub()
      setReplaySelectUi('bar')
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
      pickStableIdx = Math.max(0, Math.min(maxPickBarIndex(), replay.getState().index - 1))
      setSelectBarPointerInChart(false)
      state.trading?.clearReplayPickPreview()
    }

    function toggleSelectBarChartMode() {
      if (selectBarChartActive) closeSelectBarChartMode(false)
      else openSelectBarChartMode()
    }

    state.exitSelectBarChartMode = () => closeSelectBarChartMode(false)

    const onChartHostPointerMove = (e: PointerEvent) => {
      if (!selectBarChartActive) return
      scheduleSelectBarSync(e.clientX, e.clientY)
    }
    const onChartHostPointerLeave = () => {
      if (!selectBarChartActive) return
      setSelectBarPointerInChart(false)
    }

    const onOverlayPointerMove = (e: PointerEvent) => {
      if (!selectBarChartActive || !selectBarOverlay) return
      e.preventDefault()
      scheduleSelectBarSync(e.clientX, e.clientY)
    }
    const onOverlayPointerDown = (e: PointerEvent) => {
      if (!selectBarChartActive || !selectBarOverlay) return
      e.preventDefault()
      selectBarOverlay.setPointerCapture(e.pointerId)
      scheduleSelectBarSync(e.clientX, e.clientY)
    }
    const onOverlayPointerUp = (e: PointerEvent) => {
      if (!selectBarOverlay?.hasPointerCapture(e.pointerId)) return
      selectBarOverlay.releasePointerCapture(e.pointerId)
    }
    const onOverlayClick = (e: MouseEvent) => {
      if (!selectBarChartActive) return
      e.preventDefault()
      e.stopPropagation()
      const hostRect = chartHost.getBoundingClientRect()
      updateSelectBarLabel(e.clientX)
      syncSelectBarLineAtIndex(pickStableIdx, e.clientY - hostRect.top)
      closeSelectBarChartMode(true)
    }

    chartHost.addEventListener('pointermove', onChartHostPointerMove)
    chartHost.addEventListener('pointerleave', onChartHostPointerLeave)
    selectBarOverlay?.addEventListener('pointerdown', onOverlayPointerDown)
    selectBarOverlay?.addEventListener('pointermove', onOverlayPointerMove)
    selectBarOverlay?.addEventListener('pointerup', onOverlayPointerUp)
    selectBarOverlay?.addEventListener('click', onOverlayClick)
    state.openReplayBarPick = openSelectBarChartMode

    trading.chart.timeScale().subscribeVisibleLogicalRangeChange(onSelectBarChartRangeChange)
    trading.chart.timeScale().subscribeVisibleTimeRangeChange(onSelectBarChartRangeChange)

    const onSelectBarChartBtnClick = (e: MouseEvent) => {
      e.stopPropagation()
      if (replaySelectMode === 'date') {
        openReplayDatePanel()
        return
      }
      toggleSelectBarChartMode()
    }
    btnSelectBarChart?.addEventListener('click', onSelectBarChartBtnClick)
    cleanupFns.push(() => {
      closeSelectBarChartMode(false)
      trading.chart.timeScale().unsubscribeVisibleLogicalRangeChange(onSelectBarChartRangeChange)
      trading.chart.timeScale().unsubscribeVisibleTimeRangeChange(onSelectBarChartRangeChange)
      chartHost.removeEventListener('pointermove', onChartHostPointerMove)
      chartHost.removeEventListener('pointerleave', onChartHostPointerLeave)
      selectBarOverlay?.removeEventListener('pointerdown', onOverlayPointerDown)
      selectBarOverlay?.removeEventListener('pointermove', onOverlayPointerMove)
      selectBarOverlay?.removeEventListener('pointerup', onOverlayPointerUp)
      selectBarOverlay?.removeEventListener('click', onOverlayClick)
      btnSelectBarChart?.removeEventListener('click', onSelectBarChartBtnClick)
      state.exitSelectBarChartMode = null
    })

    const startMenuHandlers: Array<{ el: Element; fn: () => void }> = []
    host.querySelectorAll('[data-rw-replay-start]').forEach((el) => {
      const fn = () => {
        const mode = (el as HTMLElement).dataset.rwReplayStart
        closeStartMenu()
        replay.pause()
        syncPlayBtnPaused()
        host.querySelectorAll('.rw-replay-start-menu__item').forEach((item) => {
          item.classList.toggle('rw-replay-start-menu__item--active', item === el)
        })
        if (mode === 'bar') {
          setReplaySelectUi('bar')
          openSelectBarChartMode()
          return
        }
        if (mode === 'first') {
          closeSelectBarChartMode(false)
          void seekReplayToIndex(replay.getState().loopStartIndex)
          return
        }
        if (mode === 'random') {
          closeSelectBarChartMode(false)
          void seekReplayToIndex(1 + Math.floor(Math.random() * chartBars.length))
          return
        }
        if (mode === 'date') {
          setReplaySelectUi('date')
          closeSelectBarChartMode(false)
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

    function localDaysInMonth(y: number, m0: number): number {
      return new Date(y, m0 + 1, 0).getDate()
    }

    function localMondayWeekIndex(y: number, m0: number): number {
      return (new Date(y, m0, 1).getDay() + 6) % 7
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
      const minYm = minD.getFullYear() * 12 + minD.getMonth()
      const maxYm = maxD.getFullYear() * 12 + maxD.getMonth()
      const curYm = calViewY * 12 + calViewM
      if (curYm < minYm) {
        calViewY = minD.getFullYear()
        calViewM = minD.getMonth()
      } else if (curYm > maxYm) {
        calViewY = maxD.getFullYear()
        calViewM = maxD.getMonth()
      }
    }

    function renderCalendar() {
      if (!calGrid || !calTitle) return
      clampCalViewToData()
      calTitle.textContent = `${CAL_MONTH_NAMES[calViewM]} ${calViewY}`
      const first = localMondayWeekIndex(calViewY, calViewM)
      const dim = localDaysInMonth(calViewY, calViewM)
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
      closeStartMenu()
      closeReplayHub()
      setReplaySelectUi('date')
      if (!dateDialog || !dateDialogInput) return
      const t0 = chartBars[0]!.time
      const t1 = chartBars[chartBars.length - 1]!.time
      dateDialogInput.min = localYmdFromSec(t0)
      dateDialogInput.max = localYmdFromSec(t1)
      const cur = replay.getState().index
      const midT = chartBars[Math.max(0, cur - 1)]!.time
      dateDialogInput.value = localYmdFromSec(midT)
      if (dateTimeInput) dateTimeInput.value = localHmFromSec(midT)
      const dt = new Date(Number(midT) * 1000)
      calViewY = dt.getFullYear()
      calViewM = dt.getMonth()
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

    const onDateOk = async () => {
      const v = dateDialogInput?.value
      if (!v || !dateDialog) return
      const p = parseYmd(v)
      if (!p) return
      const tt = dateTimeInput?.value || '00:00'
      const thm = tt.split(':').map((x) => Number(x))
      const hh = Number.isFinite(thm[0]) ? thm[0]! : 0
      const mm = Number.isFinite(thm[1]) ? thm[1]! : 0
      dateDialog.close()
      const pickIndex = resolveReplayPickIndex(p.y, p.m0, p.d, hh, mm)
      await seekReplayToIndex(pickIndex, 'Jumping to selected date…')
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

    const onDateFirstPanel = async () => {
      dateDialog?.close()
      await seekReplayToIndex(1, 'Jumping to first bar…')
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

    async function seekGoTo(target: ReplayGoToTarget) {
      const bars = replay.getBars()
      if (!bars.length) return
      const slice = replay.slice()
      const cursorBar = slice[slice.length - 1]
      const cursorSec = cursorBar ? Number(cursorBar.time) : Number(bars[0]!.time)
      const index = resolveGoToBarIndex(bars, cursorSec, target)
      await seekReplayToIndex(index, 'Jumping…')
    }

    host.querySelectorAll<HTMLButtonElement>('[data-rw-goto-panel]').forEach((btn) => {
      const onGotoPanelClick = () => {
        const id = btn.dataset.rwGotoPanel
        if (id === 'custom') {
          openStartMenu()
          return
        }
        if (id) void seekGoTo(id as ReplayGoToTarget)
      }
      btn.addEventListener('click', onGotoPanelClick)
      cleanupFns.push(() => btn.removeEventListener('click', onGotoPanelClick))
    })

    syncReplaySpeedUi(0)

    if (replaySpeed && replaySpeedWrap) {
      const onSpeedInput = () => {
        const idx = Number(replaySpeed!.value)
        state.replay?.setSpeedIndex(idx)
        syncReplaySpeedUi(idx)
      }
      const showSpeedBubble = () => replaySpeedWrap.classList.add('rw-replay-dock__speed-wrap--active')
      const hideSpeedBubble = () => replaySpeedWrap.classList.remove('rw-replay-dock__speed-wrap--active')
      replaySpeed.addEventListener('input', onSpeedInput)
      replaySpeed.addEventListener('pointerdown', showSpeedBubble)
      replaySpeed.addEventListener('pointerup', hideSpeedBubble)
      replaySpeed.addEventListener('pointercancel', hideSpeedBubble)
      replaySpeed.addEventListener('blur', hideSpeedBubble)
      cleanupFns.push(() => {
        replaySpeed!.removeEventListener('input', onSpeedInput)
        replaySpeed!.removeEventListener('pointerdown', showSpeedBubble)
        replaySpeed!.removeEventListener('pointerup', hideSpeedBubble)
        replaySpeed!.removeEventListener('pointercancel', hideSpeedBubble)
        replaySpeed!.removeEventListener('blur', hideSpeedBubble)
      })
    }

    if (replaySyncTf) {
      syncTimeframe = replaySyncTf.checked
      const onSyncTfChange = () => {
        syncTimeframe = replaySyncTf!.checked
        if (syncTimeframe && replayDockTf) {
          replayDockTf.textContent = chartTimeframe
        }
      }
      replaySyncTf.addEventListener('change', onSyncTfChange)
      cleanupFns.push(() => replaySyncTf!.removeEventListener('change', onSyncTfChange))
    }

    async function clearAllReplayFilters() {
      state.exitSelectBarChartMode?.()
      closeStartMenu()
      closeReplayHub()
      dateDialog?.close()

      if (replaySyncTf) {
        replaySyncTf.checked = true
        syncTimeframe = true
      }

      replay.pause()
      syncPlayBtnPaused()
      replay.setLoop(false)
      replay.setLoopStartIndex(1)
      replay.setSpeedIndex(0)
      syncReplaySpeedUi(0)
      if (replaySpeed) replaySpeed.value = '0'
      setReplaySelectUi('date')

      state.trading?.clearReplayPickPreview()
      state.trading?.setTradeMarkers([])
      backtestState.result = null
      sidePanel?.clear()
      syncOrderPanelPosition()
      syncTradeNavUi()

      try {
        setChartLoading(true, 'Clearing filters…')
        activeSession = {
          ...activeSession,
          startDate: session.startDate,
          endDate: session.endDate,
        }

        const series = await loadSessionBars(currentChartSymbol, activeSession.name, undefined, {
          startDate: session.startDate,
          endDate: session.endDate,
        })
        if (state.disposed) return

        chartBars = filterSessionChartBars(series.bars, session)
        const sessionReplayStartIndex = sessionStartReplayIndex(chartBars, session.startDate)
        if (!chartBars.length) {
          window.alert('No bars in the session date range.')
          return
        }

        chartTimeframe = series.timeframe
        source1mBars = chartBars.slice()
        canResample = inferTimeframeFromBars(source1mBars) === '1m'
        refreshTickSource()
        if (dataBanner) dataBanner.hidden = true

        if (canResample && chartTimeframe !== '1m') {
          applyIntervalPick({ pill: '1m', kind: 'time', stepSec: 60, label: '1 minute' })
        } else {
          firstChartPaint = true
          replay.replaceBarsAt(chartBars, chartBars.length)
          replay.setLoopStartIndex(sessionReplayStartIndex)
        }

        intervalPill.textContent = chartTimeframe
        if (replayDockTf) replayDockTf.textContent = chartTimeframe

        await seekReplayToIndex(replay.getBars().length, false)

        applyChartFootRange('ALL', chartBars, trading)
        setFootRangeActive('ALL')
        state.trading?.repaintTimeShades()
        state.redrawDrawings?.()
        syncReplayTransportUi(replay.getState().index)
      } catch (err) {
        console.error('[ClearFilter]', err)
        window.alert(err instanceof Error ? err.message : 'Failed to clear filters.')
      } finally {
        setChartLoading(false)
      }
    }

    if (replayClearFilterBtn) {
      const onClearFilter = () => {
        void clearAllReplayFilters()
      }
      replayClearFilterBtn.addEventListener('click', onClearFilter)
      cleanupFns.push(() => replayClearFilterBtn.removeEventListener('click', onClearFilter))
    }

    chartBarCount = chartBars.length
    syncReplayTransportUi(replay.getState().index)

    const replayHandlers: Array<{ el: Element; fn: () => void }> = []
    host.querySelectorAll('[data-rw-replay-dock] [data-rw]').forEach((btn) => {
      const fn = () => {
        const act = (btn as HTMLElement).dataset.rw
        const playBtn = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
        if (act === 'play') {
          replay.togglePlay()
          setReplayPlayButtonIcon(playBtn, replay.getState().playing)
        } else if (act === 'start') {
          seekReplayToIndex(replay.getState().loopStartIndex)
        } else if (act === 'back') {
          seekReplayToIndex(replay.getState().index - 1, false)
        } else if (act === 'fwd' || act === 'step') {
          seekReplayToIndex(replay.getState().index + 1, false)
        } else if (act === 'end') {
          seekReplayToIndex(chartBars.length)
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
      const ae = document.activeElement as HTMLElement | null
      if (ae?.closest?.('input:not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select'))
        return
      if (ae?.closest?.('[data-rw-replay-speed-wrap]')) return

      const keyToGoTo: Partial<Record<string, ReplayGoToTarget>> = {
        KeyY: 'next_day_open',
        KeyZ: 'next_session',
        KeyI: 'asian',
        KeyL: 'london',
        KeyN: 'newyork',
      }
      const gotoTarget = keyToGoTo[e.code]
      if (gotoTarget && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        void seekGoTo(gotoTarget)
        return
      }

      if (e.code !== 'Space' && e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return
      if (e.code === 'Space') {
        const sp = document.activeElement as HTMLElement | null
        if (sp?.closest?.('[data-rw-replay-interval-toggle]')) return
        e.preventDefault()
        replay.togglePlay()
        const playBtn = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
        setReplayPlayButtonIcon(playBtn, replay.getState().playing)
        return
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault()
        seekReplayToIndex(replay.getState().index - 1)
        return
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault()
        seekReplayToIndex(replay.getState().index + 1)
      }
    }
    window.addEventListener('keydown', onReplayKeydown, true)
    cleanupFns.push(() => window.removeEventListener('keydown', onReplayKeydown, true))

    const onBuy = () => {
      const b = lastBar(replay.slice())
      if (!b) return
      const { ask } = bidAskFromBar(b)
      const opened = replayAccount.openLong(readOrderQty(), ask, Number(b.time))
      if (!opened) {
        window.alert('Insufficient balance for this order.')
        return
      }
      syncTradingUi(b)
    }
    const onSell = () => {
      const b = lastBar(replay.slice())
      if (!b) return
      const { bid } = bidAskFromBar(b)
      const opened = replayAccount.openShort(readOrderQty(), bid, Number(b.time))
      if (!opened) {
        window.alert('Insufficient margin for this order.')
        return
      }
      syncTradingUi(b)
    }
    ticketBuy.addEventListener('click', onBuy)
    ticketSell.addEventListener('click', onSell)
    cleanupFns.push(() => ticketBuy.removeEventListener('click', onBuy))
    cleanupFns.push(() => ticketSell.removeEventListener('click', onSell))

    const tzLabel = localTimezoneLabel()

    function tickClock() {
      const d = new Date()
      const clockStr = d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      if (clockEl) clockEl.textContent = `${clockStr} ${tzLabel}`
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
    switchChartSymbolImpl = null
    closeReplayHub()
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
