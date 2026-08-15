import './workspace.css'
import './symbolSearchModal.css'
import '../chart/chartPositionOverlay.css'
import { icons } from '../icons'
import { findAsset } from '../assetCatalog'
import { aggregateOHLCV } from '../chart/aggregateBars'
import {
  buildReplayStepBars,
  canDecoupleReplay,
  isSubMinuteReplayPick,
  cursorEndSecForStepIndex,
  decoupledChartReplayDisplay,
  effectiveReplayStepSec,
  stepIndexForCursorEnd,
} from '../chart/replayDecouple'
import { readDefaultChartInterval, readDefaultStrategyId } from '../home/dashboardUserPrefs'
import { readFullSessionTicks, writeFullSessionTicks } from '../chart/chartTickPrefs'
import { createTradingChart } from '../chart/tradingChart'
import { DEFAULT_MAX_CHART_TICKS } from '../data/marketTickClient'
import { useTradingViewChart } from '../chart/tradingViewFeature'
import {
  createTradingViewChart,
  preloadTradingViewScript,
  type TradingViewChartHandle,
} from '../chart/tradingViewChart'
import { mountTickLineOverlay, type TickLineOverlayHandle } from '../chart/tickLineOverlay'
import type { TvLockedViewport } from '../chart/tradingViewReplayChart'
import { intervalPillToTvResolution, tvResolutionMatches, type LazyFetchBarsRequest } from '../chart/tradingViewDatafeed'
import {
  createChartIndicatorManager,
  renderChartIndicatorBar,
} from '../chart/chartIndicators'
import { isChartIndicatorId, type ChartIndicatorId } from '../chart/chartIndicatorCatalog'
import { loadSessionBars, loadSessionTicks, canLoadDukascopyTicks, sessionTickRangeSec, usesMarketDataSession } from '../data/loadSessionBars'
import {
  barsForSubMinuteInterval,
  barsForTickInterval,
  dukascopyTickChartData,
  syntheticTickChartData,
  tickBarSeriesForInterval,
  type TickChartData,
} from '../data/tickChartSource'
import {
  alignTickBarSeries,
  barIndexForTickTimeMs,
  formatQuoteTickPickLabelLocal,
  formingMinuteOhlcFromTicks,
  mergeQuoteTicksByTime,
  replayIndexForPickTime,
  tickTimeMsAtBar,
  type TickBarSeries,
} from '../chart/tickReplayIndex'
import { fetchMarketDataHealth, type MarketDataHealth } from '../data/marketDataHealth'
import { DEFAULT_MARKET_BAR_CHAIN, fetchMarketBarsSeries } from '../data/marketDataClient'
import {
  isLocalSecondStep,
  LOCAL_SECOND_STEPS,
  maxMedianStepForSecondBars,
  secondStepToInterval,
} from '../data/localSecondBars'
import { providerLabelFromDataSource } from '../data/marketDataSourceLabel'
import { resolveFeedStatus } from '../data/feedStatus'
import { inferTimeframeFromBars, fetchSessionBarChunk, prefetchSessionLookbackBars, resolveChartBarsForSession } from '../data/resolveSessionBars'
import {
  chunkRangeAfterLoaded,
  chunkRangeBeforeLoaded,
  SESSION_1M_SUGGEST_H1_SPAN_SEC,
  SESSION_1M_WARN_SPAN_SEC,
  SESSION_LAZY_LOAD_MARGIN_BARS,
  sessionSpanSec,
} from '../data/sessionBarWindow'
import {
  findReplayBarIndex,
  formatChartCrosshairTime,
  formatChartPickLabelUtc,
  formatSessionModalDate,
  isHistoricalSessionBars,
  localHmFromSec,
  localYmdFromSec,
  parseSessionDateToSec,
  sessionStartReplayIndex,
  sessionDateRangeSec,
  sessionWindowHasBars,
} from '../data/sessionDateRange'
import { createChartIntervalMenu, type IntervalPick } from './chartIntervalMenu'
import {
  intervalPickBarPeriodSec,
  intervalPickNeedsSecondsAxis,
  REPLAY_DOCK_INTERVALS,
  replayDockIntervalsForChart,
  clampReplayPillForChart,
  readReplayAutoSelectInterval,
  writeReplayAutoSelectInterval,
  tvResolutionToIntervalPill,
} from './chartIntervalCatalog'
import { getFavoriteIntervals, removeFavoriteInterval, resolveIntervalPick } from './chartIntervalStore'
import { createChartTypeMenu } from './chartTypeMenu'
import { createChartSnapshotMenu, type ChartSnapshotAction } from './chartSnapshotMenu'
import {
  captureChartSnapshotCanvas,
  chartSnapshotFilename,
  copyChartShareLink,
  copyChartSnapshotCanvas,
  downloadChartSnapshotCanvas,
  openChartSnapshotInNewTab,
} from '../chart/chartSnapshot'
import { createSymbolSearchModal } from './symbolSearchModal'
import { createIndicatorsModal } from './indicatorsModal'
import {
  REPLAY_BARS_PER_SEC,
  REPLAY_DEFAULT_SPEED_INDEX,
  ReplayController,
  replaySpeedDetail,
  replaySpeedLabel,
  replaySpeedX,
} from '../playback/replayController'
import { createReplayAccount, defaultTpSl, longOrderCost, positionMarkPrice, positionPoints, positionUnrealized, shortOrderMargin } from '../replay/replayPositions'
import {
  renderReplayJournal,
  renderReplayJournalStats,
} from '../replay/replayJournalUi'
import { confirmDialog } from './confirmDialog'
import { showBacktestResultDialog } from './backtestResultDialog'
import { mountChartPositionOverlay } from '../chart/chartPositionOverlay'
import type { SessionBacktestSnapshot, SessionReplaySnapshot } from '../data/sessionStore'
import type { PropChallengeConfig, PropChallengeState } from '../prop/propTypes'
import {
  createInitialPropState,
  evaluatePropChallenge,
  normalizePropRules,
} from '../prop/propRuleEngine'
import { renderPropBanner } from '../prop/propChallengeUi'
import { primarySessionSymbol, type SessionCreatedPayload } from '../sessionTypes'
import type { Bar, QuoteTick } from '../types'
import type { TradingChartTheme } from '../chart/tradingChart'
import { CrosshairMode } from 'lightweight-charts'
import type { IChartApi, Logical, LogicalRange, MouseEventParams, Time } from 'lightweight-charts'
import { mountChartCursorUi } from '../chart/chartCursorUi'
import {
  findBarAtTime,
  mountChartLegendOhlc,
  updateChartLegendMarketStatus,
  updateChartLegendOhlc,
  type ChartLegendOhlcRefs,
} from '../chart/chartLegendOhlc'
import { mountChartMarketStatusPopup } from '../chart/chartMarketStatusPopup'
import { EMA_CROSS } from '../backtest/ExampleStrategies'
import { listAllStrategies, resolveStrategy, strategySelectLabel } from '../strategy/strategyCatalog'
import type { BacktestResult, StrategyDefinition } from '../backtest/BacktestTypes'
import { runBacktest, numberTrades } from '../backtest/BacktestEngine'
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
import type { SidePanelApi } from './sidePanel'

function setReplayPlayButtonIcon(btn: HTMLButtonElement | null, playing: boolean) {
  if (!btn) return
  const playIco = btn.querySelector('.rw-replay-dock__play-ico--play') as HTMLElement | null
  const pauseIco = btn.querySelector('.rw-replay-dock__play-ico--pause') as HTMLElement | null
  if (playIco) playIco.hidden = playing
  if (pauseIco) pauseIco.hidden = !playing
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

function brokerTag(feedLabel: string): string {
  const fromSource = providerLabelFromDataSource(feedLabel)
  if (fromSource) return fromSource
  if (/synthetic|demo/i.test(feedLabel)) return 'Demo data'
  if (/OANDA/i.test(feedLabel)) return 'OANDA'
  if (/imported|json|static|sample|upload/i.test(feedLabel)) return 'Replay data'
  if (/market data|server chain/i.test(feedLabel)) return 'Twelve Data'
  return 'Tradeneu'
}

/** Chart legend vendor line (e.g. Twelve Data on Tradeneu). */
function legendPlatformFeed(feedLabel: string): string {
  const tag = brokerTag(feedLabel)
  if (tag === 'Tradeneu') return 'Tradeneu'
  return `${tag} on Tradeneu`
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

/** Bid/ask around a mid price (synthetic spread for replay fills). */
function bidAskAround(px: number): { bid: number; ask: number; spread: number } {
  const spread = Math.max(0.02, px * 0.00004)
  return { bid: px - spread / 2, ask: px + spread / 2, spread }
}

/**
 * Current market — bar close = last price on the candle
 * (top of a green body / bottom of a red body — matches TV's last-price label).
 */
function bidAskFromBar(b: Bar): { bid: number; ask: number; spread: number } {
  return bidAskAround(b.close)
}

/**
 * Buy/Sell entry at the candle last price (close), not open/mid and not ask/bid offset.
 * That keeps the BUY/SELL line on the same level as the teal last-price label.
 */
function entryFillPrice(b: Bar): number {
  return b.close
}

/** Grid/flex often reports 0×0 for a few frames after the chart mounts; fitting the time scale then leaves a blank chart. */
async function waitForChartHostLayout(
  host: HTMLElement,
  isDisposed: () => boolean,
  maxFrames = 48,
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

function defaultSessionFeedLabel(
  sessionType: SessionCreatedPayload['sessionType'],
  symbol: string,
): string {
  if (sessionType === 'prop') return 'Tradeneu · Prop rules'
  if (usesMarketDataSession(symbol)) return 'Tradeneu · dukascopy'
  return 'Tradeneu'
}

function symbolPanelMeta(symbol: string) {
  const symUi = formatDisplaySymbol(symbol)
  const catalog = findAsset(symbol)
  const fullName = catalog?.name ?? 'Demo series'
  return { symUi, catalog, fullName }
}

function filterSessionChartBars(
  rawBars: Bar[],
  session: { startDate?: string; endDate?: string },
): Bar[] {
  return resolveChartBarsForSession(rawBars, session.startDate, session.endDate)
}

/** First open with 1m candles: 180 bars = 3 hours on screen (FXReplay-style intraday default). */
const TV_1M_DEFAULT_VISIBLE_BARS = 180

/** Aggregated intervals need enough bars at boot or the chart pins one candle to the left edge. */
const MIN_BOOT_CHART_BARS = 8

const TICK_LOAD_TIMEOUT_MS = 30_000

/** Seconds intervals: smaller first window — Dukascopy tick fetch is slow on cold cache. */
const SECONDS_INITIAL_WINDOW_SEC = 3 * 60
const SECONDS_TICK_LOAD_TIMEOUT_MS = 120_000
/** Max ticks aggregated into second bars per build — avoids main-thread freeze. */
const SECONDS_AGGREGATE_TICK_CAP = 12_000
/** Tick span loaded when second-bar replay nears the window edge. */
const SECONDS_REPLAY_WINDOW_SEC = 10 * 60

/** Cap tick-interval series so 1t↔1m swaps stay responsive (unless full-session ticks are enabled). */
const MAX_INTERVAL_TICK_BARS = 8000

/** Progressive tick fetch chunk size (first window + each background page). */
const TICK_WINDOW_SEC = 10 * 60

const TICK_CHART_UPDATE_THROTTLE_MS = 220

/** Extend windowed tick replay when playback nears the loaded edge. */
const REPLAY_TICK_WINDOW_MARGIN = 320

function clampSecToSessionRange(
  sec: number,
  full: { startSec: number; endSec: number },
): number {
  return Math.max(full.startSec, Math.min(full.endSec, Math.floor(sec)))
}

/** Center a tick fetch window on `cursorTimeSec` (falls back to session midpoint). */
function windowedTickRangeSec(
  full: { startSec: number; endSec: number },
  cursorTimeSec: number | null,
  windowSec: number = TICK_WINDOW_SEC,
): { startSec: number; endSec: number } {
  const fallbackCursor = full.startSec + Math.floor((full.endSec - full.startSec) / 2)
  const rawCursor = cursorTimeSec ?? fallbackCursor
  const cursor = clampSecToSessionRange(rawCursor, full)
  const span = Math.max(60, windowSec)
  const half = Math.floor(span / 2)
  let startSec = Math.max(full.startSec, cursor - half)
  let endSec = Math.min(full.endSec, cursor + half)
  if (endSec - startSec < 60) {
    endSec = Math.min(full.endSec, startSec + 60)
    startSec = Math.max(full.startSec, endSec - 60)
  }
  if (endSec <= startSec) endSec = Math.min(full.endSec, startSec + span)
  return { startSec, endSec }
}

/** Prefer 1m bar times we know have data; TV visible range can sit on empty session edges. */
function subMinuteTickCursorCandidates(
  full: { startSec: number; endSec: number },
  source1mBars: Bar[],
  replayCursorSec: number | null,
  tvVisibleMidSec: number | null,
): number[] {
  const out: number[] = []
  const push = (sec: number | null | undefined) => {
    if (sec == null || !Number.isFinite(sec)) return
    const clamped = clampSecToSessionRange(sec, full)
    if (!out.includes(clamped)) out.push(clamped)
  }

  // Prefer replay cursor and visible chart center — 1m bar mid/first/last can sit far from playback.
  push(replayCursorSec)
  push(tvVisibleMidSec)
  if (source1mBars.length >= 1) {
    const midIdx = Math.floor(source1mBars.length / 2)
    push(Number(source1mBars[midIdx]!.time))
    push(Number(source1mBars[0]!.time))
    push(Number(source1mBars[source1mBars.length - 1]!.time))
  }
  push(full.startSec + Math.floor((full.endSec - full.startSec) / 2))
  push(full.startSec + 60)
  return out
}

/** Next progressive page: `windowSec` forward from last loaded tick. */
function nextTickChunkRangeSec(
  full: { startSec: number; endSec: number },
  lastLoadedSec: number,
  windowSec: number = TICK_WINDOW_SEC,
): { startSec: number; endSec: number } | null {
  const startSec = Math.max(full.startSec, lastLoadedSec)
  if (startSec >= full.endSec - 1) return null
  return {
    startSec,
    endSec: Math.min(full.endSec, startSec + windowSec),
  }
}

function capBarsAroundTime(bars: Bar[], timeSec: number | null, maxBars: number): Bar[] {
  if (bars.length <= maxBars) return bars
  const t = timeSec ?? Number(bars[bars.length - 1]!.time)
  const idx0 = Math.max(0, barIndexAtOrBeforeTime(bars, t) - 1)
  const start = Math.max(0, Math.min(idx0 - Math.floor(maxBars * 0.55), bars.length - maxBars))
  return bars.slice(start, start + maxBars)
}

function sliceQuoteTicksAroundCursor(
  ticks: QuoteTick[],
  timeSec: number | null,
  maxTicks: number,
): QuoteTick[] {
  if (ticks.length <= maxTicks) return ticks
  const lastMs = Number(ticks[ticks.length - 1]!.timeMs)
  const targetMs = (timeSec ?? Math.floor(lastMs / 1000)) * 1000
  let lo = 0
  let hi = ticks.length - 1
  let best = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (Number(ticks[mid]!.timeMs) <= targetMs) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  const start = Math.max(0, Math.min(best - Math.floor(maxTicks * 0.55), ticks.length - maxTicks))
  return ticks.slice(start, start + maxTicks)
}

/** Slice Dukascopy ticks before second-bar aggregation so 1m→10s stays responsive. */
function tickChartDataForSecondsBuild(
  data: TickChartData,
  cursorTimeSec: number | null,
  fullSession: boolean,
): TickChartData {
  if (data.kind !== 'dukascopy' || fullSession) return data
  if (data.quoteTicks.length <= SECONDS_AGGREGATE_TICK_CAP) return data
  return dukascopyTickChartData(
    sliceQuoteTicksAroundCursor(data.quoteTicks, cursorTimeSec, SECONDS_AGGREGATE_TICK_CAP),
  )
}

async function yieldToMain(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

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
  opts?: {
    onExit?: () => void
    onSymbolChange?: (symbol: string) => void
    sessionId?: string | null
    lastStrategyId?: string
    onStrategyChange?: (strategyId: string) => void
    onBacktestComplete?: (snapshot: SessionBacktestSnapshot) => void
    replayState?: SessionReplaySnapshot | null
    onReplayStateChange?: (snapshot: SessionReplaySnapshot) => void
    propRules?: PropChallengeConfig | null
    propResult?: PropChallengeState | null
    onPropStateChange?: (state: PropChallengeState) => void
    activeChartIndicators?: ChartIndicatorId[]
    onChartIndicatorsChange?: (ids: ChartIndicatorId[]) => void
    autoRunBacktest?: boolean
    onEditSession?: () => void
  },
): () => void {
  let activeSession: SessionCreatedPayload = { ...session }
  const restoredReplay = opts?.replayState ?? null
  let currentChartSymbol = primarySessionSymbol(activeSession.assets)
  const initialMeta = symbolPanelMeta(currentChartSymbol)
  const symUi = initialMeta.symUi
  let feedLabel = defaultSessionFeedLabel(activeSession.sessionType, currentChartSymbol)
  const initialCash = parseBalance(activeSession.balance)
  let currentFullName = initialMeta.fullName

  let uiChartTheme: UiChartTheme = readStoredChartTheme()
  let tvChartMode = useTradingViewChart()

  host.replaceChildren(
    el(`
    <div class="rw-root rw-root--fxr${tvChartMode ? ' rw-root--tv' : ''} overflow-hidden" role="application" aria-label="Chart workspace" data-chart-theme="${uiChartTheme}">
      <header class="rw-top">
        <button type="button" class="rw-top__home" title="Back to dashboard" aria-label="Back to dashboard">${icons.arrowLeft}</button>
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
          <div class="rw-interval-favs" data-rw-interval-favs hidden aria-label="Favorite intervals"></div>
          <button type="button" class="rw-pill-btn rw-interval-pill" title="Chart interval" aria-haspopup="listbox" aria-expanded="false">1m</button>
          <button type="button" class="rw-pill-btn rw-pill-btn--ico rw-chart-type-btn" title="Chart type" aria-haspopup="listbox" aria-expanded="false">${candleIco}</button>
          <button type="button" class="rw-pill-btn rw-pill-btn--ico rw-compare-btn rw-fxr-hide" title="Compare or add symbol">${icons.plus}</button>
          <button type="button" class="rw-pill-btn rw-indicators-btn" title="Indicators, metrics, and strategies" aria-haspopup="dialog" aria-expanded="false">${icons.chart} Indicators</button>
          <button type="button" class="rw-pill-btn">New Layout</button>
          <button type="button" class="rw-pill-btn rw-fxr-hide">Alert</button>
          <button type="button" class="rw-pill-btn rw-replay-launch${tvChartMode ? ' rw-top-btn--tv-header' : ''}" data-rw-replay-launch aria-expanded="false" aria-controls="rw-chart-replay-dock" title="Bar replay">${icons.replayLaunch} Replay</button>
          ${tvChartMode ? '' : `<button type="button" class="rw-pill-btn rw-backtest-launch" title="Run strategy backtest on loaded bars">${icons.bolt} Backtest</button>`}
          <button type="button" class="rw-pill-btn rw-fxr-hide">${icons.layout}</button>
        </div>
        <div class="rw-top__right">
          <button type="button" class="rw-layout-name" title="Layouts">Unnamed ${icons.chevronDown}</button>
          <span class="rw-top__vsep" aria-hidden="true"></span>
          <div class="rw-top__utility" role="group" aria-label="Chart utilities">
            <button type="button" class="rw-icon-btn" data-rw-top-settings title="Chart settings" aria-label="Chart settings">${icons.tvToolbarSettings}</button>
            <button type="button" class="rw-icon-btn" data-rw-top-snapshot title="Take a snapshot" aria-label="Take a snapshot" aria-haspopup="menu" aria-expanded="false">${icons.camera}</button>
            <span class="rw-top__vsep rw-top__vsep--utility" aria-hidden="true"></span>
            <button type="button" class="rw-icon-btn rw-theme-toggle" data-rw-top-theme title="Toggle theme" aria-label="Toggle theme">${icons.sun}</button>
            <button type="button" class="rw-icon-btn" data-rw-top-fullscreen title="Fullscreen mode" aria-label="Fullscreen mode">${icons.expand}</button>
          </div>
          <button type="button" class="rw-btn-tv-trade rw-fxr-hide">Trade</button>
          <button type="button" class="rw-btn-publish rw-fxr-hide">Publish</button>
          <div class="rw-avatar rw-fxr-hide" title="Account" aria-hidden="true"></div>
        </div>
      </header>
      <section class="rw-chart-wrap">
        <button
          type="button"
          class="rw-chart-back"
          data-rw-chart-back
          title="Back to dashboard"
          aria-label="Back to dashboard"
        >${icons.arrowLeft}</button>
        <div class="rw-chart-loading" data-rw-chart-loading hidden aria-live="polite" aria-busy="false">
          <div class="rw-chart-loading__veil" aria-hidden="true"></div>
          <div class="rw-chart-loading__panel">
            <p class="rw-chart-loading__brand" aria-hidden="true">trade neu</p>
            <div
              class="rw-chart-loading__bar"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="0"
              data-rw-chart-loading-bar-wrap
            >
              <div class="rw-chart-loading__bar-fill" data-rw-chart-loading-bar style="width: 0%"></div>
            </div>
            <p class="rw-chart-loading__text" data-rw-chart-loading-text>Connecting to server</p>
            <div class="rw-chart-loading__spinner" aria-hidden="true" hidden></div>
            <dl class="rw-chart-loading__meta" data-rw-chart-loading-meta hidden></dl>
          </div>
        </div>
        <div class="rw-subbar">
          <div class="rw-replay-notice" data-rw-replay-notice role="status" hidden></div>
          <div class="rw-prop-banner rw-prop-banner--active" data-rw-prop-banner role="status" hidden></div>
          <div class="rw-data-banner rw-data-banner--feed" role="alert" hidden></div>
          <div class="rw-subbar__stack">
            <div class="rw-subbar__head rw-legend" aria-live="polite"></div>
            <div class="rw-subbar__indicators" data-rw-indicator-bar hidden></div>
          </div>
        </div>
        <div class="rw-chart-canvas${tvChartMode ? ' rw-chart-canvas--tv' : ''}">
          <div class="rw-chart-host${tvChartMode ? ' rw-chart-host--tv' : ''}">
            <canvas class="rw-chart-shade" aria-hidden="true"></canvas>
            <div class="rw-chart-lwc"></div>
            <div class="rw-chart-tv"${tvChartMode ? '' : ' hidden'}></div>
            <div class="rw-select-bar-overlay" data-rw-select-bar-overlay hidden aria-hidden="true">
              <div class="rw-select-bar-overlay__hit" data-rw-select-bar-hit aria-hidden="true"></div>
              <div class="rw-select-bar-overlay__blur" data-rw-select-bar-blur aria-hidden="true"></div>
              <div class="rw-select-bar-overlay__past-end" data-rw-select-bar-past-end aria-hidden="true"></div>
              <div class="rw-select-bar-overlay__line" data-rw-select-bar-line></div>
              <div class="rw-select-bar-overlay__scissors" data-rw-select-bar-scissors aria-hidden="true">${icons.scissorsSelectBar}</div>
            </div>
            <div class="rw-replay-mask-overlay" data-rw-replay-mask-overlay hidden aria-hidden="true">
              <div class="rw-replay-mask-overlay__blur" aria-hidden="true"></div>
            </div>
          </div>
          <div class="rw-chart-vol" aria-live="polite"></div>
          <div class="rw-watermark">Tradeneu</div>
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
            class="rw-chart-replay-dock rw-replay-dock--floating rw-replay-dock--tv${tvChartMode ? ' rw-replay-dock--visible' : ''}"
            data-rw-replay-dock
            ${tvChartMode ? '' : 'hidden'}
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
                    <span class="rw-replay-dock__select-ico" data-rw-replay-select-ico aria-hidden="true">${icons.replayBarSelect}</span>
                    <span data-rw-replay-select-label>Select bar</span>
                  </button>
                  <button
                    type="button"
                    class="rw-replay-dock__select-chev"
                    data-rw-replay-select-menu-toggle
                    aria-expanded="false"
                    aria-label="Select starting point"
                    title="Select starting point"
                  >${icons.replaySelectChevron}</button>
                </div>
                <div class="rw-replay-start-menu" data-rw-replay-start-menu hidden role="menu" aria-label="Select starting point">
                  <div class="rw-replay-start-menu__head">Select starting point</div>
                  <button type="button" class="rw-replay-start-menu__item" data-rw-replay-start="bar" role="menuitem">
                    <span class="rw-replay-start-menu__ico" aria-hidden="true">${icons.replayBarSelect}</span>
                    <span>Bar</span>
                  </button>
                  <button type="button" class="rw-replay-start-menu__item" data-rw-replay-start="date" role="menuitem">
                    <span class="rw-replay-start-menu__ico" aria-hidden="true">${icons.calendar}</span>
                    <span>Date…</span>
                  </button>
                  <button type="button" class="rw-replay-start-menu__item" data-rw-replay-start="first" role="menuitem">
                    <span class="rw-replay-start-menu__ico" aria-hidden="true">${icons.replayFlag}</span>
                    <span>First Available Bar</span>
                  </button>
                  <button type="button" class="rw-replay-start-menu__item" data-rw-replay-start="random" role="menuitem">
                    <span class="rw-replay-start-menu__ico" aria-hidden="true">${icons.replayDice}</span>
                    <span>Random date</span>
                  </button>
                </div>
              </div>
              <div class="rw-replay-dock__transport-anchor">
                <div class="rw-replay-dock__transport" data-rw-replay-transport>
                  <div class="rw-replay-dock__speed-wrap" data-rw-replay-speed-wrap>
                    <button
                      type="button"
                      class="rw-replay-dock__speed-btn"
                      data-rw-replay-speed-btn
                      aria-haspopup="menu"
                      aria-expanded="false"
                      title="Playback speed"
                      aria-label="Playback speed"
                    ><span data-rw-replay-speed-label>1x</span></button>
                  </div>
                  <button type="button" class="rw-replay-dock__tico rw-replay-dock__play" data-rw="play" title="Play / Pause" aria-pressed="false"><span class="rw-replay-dock__play-ico rw-replay-dock__play-ico--play" aria-hidden="true">${icons.replayTvPlay}</span><span class="rw-replay-dock__play-ico rw-replay-dock__play-ico--pause" aria-hidden="true" hidden>${icons.replayTvPause}</span></button>
                  <button type="button" class="rw-replay-dock__tico" data-rw="fwd" title="Skip one candle">${icons.replayTvStepFwd}</button>
                </div>
                <div class="rw-replay-speed-menu" data-rw-replay-speed-menu hidden role="menu" aria-label="Replay speed">
                  <div class="rw-replay-speed-menu__head">Replay speed</div>
                  ${REPLAY_BARS_PER_SEC.map(
                    (bps, i) =>
                      `<button type="button" class="rw-replay-speed-menu__item" data-rw-replay-speed-index="${i}" role="menuitemradio" aria-checked="false"><span class="rw-replay-speed-menu__x">${replaySpeedX(bps)}</span><span class="rw-replay-speed-menu__detail">${replaySpeedDetail(bps)}</span></button>`,
                  )
                    .reverse()
                    .join('')}
                </div>
              </div>
              <!-- Hidden range keeps existing speed wiring; TV UI uses the 1x button above. -->
              <input
                type="range"
                class="rw-replay-dock__speed"
                data-rw-replay-speed
                hidden
                min="0"
                max="${REPLAY_BARS_PER_SEC.length - 1}"
                value="0"
                step="1"
                aria-hidden="true"
                tabindex="-1"
              />
              <button
                type="button"
                class="rw-replay-dock__interval"
                data-rw-replay-interval-toggle
                aria-haspopup="listbox"
                aria-expanded="false"
                title="Replay interval"
              >
                <span data-rw-replay-dock-tf>1m</span>
              </button>
              <button type="button" class="rw-replay-dock__tico rw-replay-dock__tico--end" data-rw="end" title="Last Bar">${icons.replayTvJumpEnd}</button>
              <button type="button" class="rw-replay-dock__tico rw-replay-dock__close" data-rw-replay-dock-close title="Close replay" aria-label="Close replay">${icons.replayTvClose}</button>
            </div>
          </div>
        </div>
      </section>
      <div class="rw-chart-footer-tv" aria-label="Chart time range">
        ${
          tvChartMode
            ? ''
            : `<div class="rw-foot__strip rw-foot__strip--tv" aria-label="Chart range and time">
          <div class="rw-foot__strip-left">
            <div class="rw-foot__tf">
              ${FOOT_RANGE_LABELS.map(
                (t) =>
                  `<button type="button" class="rw-foot__range${t === '1D' ? ' rw-foot__range--active' : ''}" data-foot-range="${t}">${footRangeDisplayLabel(t)}</button>`,
              ).join('')}
              <button type="button" class="rw-foot__goto" data-rw-foot-goto title="Go to date…" aria-haspopup="dialog">${iconCalendarGoto}</button>
            </div>
          </div>
          <div class="rw-foot__strip-right rw-foot__strip-right--tv">
            <div class="rw-foot__clock" aria-live="polite"></div>
          </div>
        </div>`
        }
        <div class="rw-foot__trade-dock-row" data-rw-trade-dock-row>
          <div class="rw-foot__trade-dock" data-rw-trade-dock>
            <div class="rw-trade-bar" data-rw-trade-bar role="group" aria-label="Place order">
              <div class="rw-trade-ticket" data-rw-trade-ticket role="group" aria-label="Order ticket">
                <button type="button" class="rw-trade-btn rw-trade-btn--buy rw-ticket-buy" title="Buy at ask">Buy</button>
                <div class="rw-foot__qty rw-qty rw-qty--fxr" role="group" aria-label="Order quantity">
                  <input
                    id="rw-order-qty"
                    class="rw-qty__field"
                    type="number"
                    min="1"
                    step="1"
                    value="1"
                    placeholder="Quantity"
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
                <button type="button" class="rw-trade-btn rw-trade-btn--sell rw-ticket-sell" title="Sell at bid">Sell</button>
              </div>
              <span class="rw-trade-bar__spacer" aria-hidden="true"></span>
              <div class="rw-trade-stats" data-rw-trade-stats>
                <div class="rw-trade-stats__item">
                  <span class="rw-trade-stats__lbl">Account Balance</span>
                  <span class="rw-trade-stats__val rw-bal">—</span>
                </div>
                <div class="rw-trade-stats__item">
                  <span class="rw-trade-stats__lbl">Realized PnL</span>
                  <span class="rw-trade-stats__val rw-rp">$0.00</span>
                </div>
                <div class="rw-trade-stats__item">
                  <span class="rw-trade-stats__lbl">Unrealized PnL</span>
                  <span class="rw-trade-stats__val rw-up">$0.00</span>
                </div>
              </div>
              <div class="rw-trade-bar__actions">
                <button type="button" class="rw-trade-stats__toggle" data-rw-stats-toggle aria-label="Hide account values" aria-pressed="false">${icons.eye}</button>
                <button type="button" class="rw-trade-dock__collapse" data-rw-trade-dock-collapse aria-label="Collapse trade panel" title="Collapse">${icons.chevronUp}</button>
                <button type="button" class="rw-trade-dock__fullscreen" data-rw-trade-fullscreen title="Fullscreen mode" aria-label="Fullscreen mode">${icons.expand}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <section class="rw-pine-dock" data-rw-pine-dock hidden aria-label="Pine Editor"></section>
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

  const subbarHeadEl = host.querySelector('.rw-subbar__head') as HTMLElement | null
  const indicatorBarEl = host.querySelector('[data-rw-indicator-bar]') as HTMLElement
  const chartVolEl = host.querySelector('.rw-chart-vol') as HTMLElement
  const dataBanner = host.querySelector('.rw-data-banner') as HTMLElement | null
  const propBannerEl = host.querySelector('[data-rw-prop-banner]') as HTMLElement | null
  const replayNoticeEl = host.querySelector('[data-rw-replay-notice]') as HTMLElement | null
  const feedPillEl = host.querySelector('[data-rw-feed-pill]') as HTMLElement | null
  let marketHealth: MarketDataHealth | null = null

  function applyFeedUi(opts: {
    symbol: string
    dataSource?: string
    barCount?: number
    timeframe?: string
    loading?: boolean
    emptyDateRange?: boolean
    loadFailed?: boolean
  }) {
    const status = resolveFeedStatus({
      ...opts,
      health: marketHealth,
      isProd: import.meta.env.PROD,
    })

    if (feedPillEl) {
      feedPillEl.hidden = false
      feedPillEl.className = `rw-feed-pill ${status.pillClass}`
      feedPillEl.textContent = status.pillLabel
      feedPillEl.title = status.tooltip
      feedPillEl.setAttribute('aria-label', `Data feed: ${status.pillLabel}`)
    }

    if (dataBanner) {
      const base = 'rw-data-banner rw-data-banner--feed'
      dataBanner.className = status.bannerClass ? `${base} ${status.bannerClass}` : base
      dataBanner.hidden = !status.showBanner
      dataBanner.textContent = status.showBanner ? status.bannerMessage : ''
    }
  }

  let replayNoticeCleanup: (() => void) | null = null

  function hideReplayNotice() {
    replayNoticeCleanup?.()
    replayNoticeCleanup = null
    if (!replayNoticeEl) return
    replayNoticeEl.hidden = true
    replayNoticeEl.textContent = ''
    replayNoticeEl.replaceChildren()
  }

  function showReplayNotice(message: string) {
    if (!replayNoticeEl) return
    hideReplayNotice()
    replayNoticeEl.hidden = false
    replayNoticeEl.textContent = message
  }

  function showChartEmptyState(message: string) {
    let el = chartHost.querySelector('[data-rw-chart-empty]') as HTMLElement | null
    if (!el) {
      el = document.createElement('div')
      el.className = 'rw-chart-empty'
      el.dataset.rwChartEmpty = ''
      el.setAttribute('role', 'status')
      chartHost.append(el)
    }
    el.textContent = message
    el.hidden = false
    chartTv.hidden = true
    chartHost.classList.remove('rw-chart-host--tv')
  }

  function hideChartEmptyState() {
    const el = chartHost.querySelector('[data-rw-chart-empty]') as HTMLElement | null
    if (el) el.hidden = true
  }

  function noDataMessage(hasSessionDates: boolean): string {
    const rangeHint =
      hasSessionDates && activeSession.startDate && activeSession.endDate
        ? ` (${activeSession.startDate} – ${activeSession.endDate})`
        : ''
    return hasSessionDates
      ? `No bars available for the selected session range${rangeHint}. Adjust start/end dates or check the data feed.`
      : `No bars for ${symUi}. Check the data feed or session import.`
  }

  async function abortChartNoData(hasSessionDates: boolean) {
    const msg = noDataMessage(hasSessionDates)
    showChartEmptyState(msg)
    showReplayNotice(msg)
    if (subbarHeadEl) subbarHeadEl.innerHTML = `<span style="color:#787b86">${msg}</span>`
    chartVolEl.innerHTML = ''
    if (replayStatusEl) replayStatusEl.textContent = 'Replay · no data'
    await endBootLoading(true)
  }

  function showReplayNoticeAction(
    message: string,
    actionLabel: string,
    onAction: () => void,
  ) {
    if (!replayNoticeEl) return
    hideReplayNotice()
    replayNoticeEl.hidden = false
    replayNoticeEl.append(document.createTextNode(`${message} `))
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'rw-replay-notice__action'
    btn.textContent = actionLabel
    const handler = () => {
      hideReplayNotice()
      onAction()
    }
    btn.addEventListener('click', handler)
    replayNoticeCleanup = () => btn.removeEventListener('click', handler)
    replayNoticeEl.append(btn)
  }

  const chartHost = host.querySelector('.rw-chart-host') as HTMLElement
  // Drop any leftover white axis-cover strips from earlier hairline experiments.
  host.querySelectorAll('[data-rw-axis-hairline-cover], #rw-tv-axis-hairline-cover').forEach((el) => {
    el.remove()
  })
  const chartCanvas = host.querySelector('.rw-chart-canvas') as HTMLElement
  const chartLwc = host.querySelector('.rw-chart-lwc') as HTMLElement
  const chartTv = host.querySelector('.rw-chart-tv') as HTMLElement
  const selectBarOverlay = host.querySelector('[data-rw-select-bar-overlay]') as HTMLElement | null
  const replayMaskOverlay = host.querySelector('[data-rw-replay-mask-overlay]') as HTMLElement | null
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
  const sessionPositionEl: HTMLElement | null = null
  const clockEl = host.querySelector('.rw-foot__clock') as HTMLElement | null
  const btnHome = host.querySelector('.rw-top__home') as HTMLButtonElement | null
  const btnChartBack = host.querySelector('[data-rw-chart-back]') as HTMLButtonElement | null
  const intervalPill = host.querySelector('.rw-interval-pill') as HTMLButtonElement
  const intervalFavsEl = host.querySelector('[data-rw-interval-favs]') as HTMLElement | null
  const btnIndicators = host.querySelector('.rw-indicators-btn') as HTMLButtonElement | null
  const sidePanel: SidePanelApi | null = null
  const journalStatsEl: HTMLElement | null = null
  const journalTradesEl: HTMLElement | null = null
  const btnJournalExport: HTMLButtonElement | null = null
  const backtestState = { result: null as BacktestResult | null, highlightTradeNum: undefined as number | undefined }

  function paintSymbolPanel(symbol: string, _feed: string) {
    const m = symbolPanelMeta(symbol)
    currentFullName = m.fullName
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
  const btnTopSettings = host.querySelector('[data-rw-top-settings]') as HTMLButtonElement | null
  const btnTopSnapshot = host.querySelector('[data-rw-top-snapshot]') as HTMLButtonElement | null
  const btnTopFullscreen = host.querySelector('[data-rw-top-fullscreen]') as HTMLButtonElement | null
  const btnReplayLaunch = host.querySelector('[data-rw-replay-launch]') as HTMLButtonElement | null

  function getReplayLaunchButtons(): HTMLElement[] {
    const out: HTMLElement[] = []
    if (btnReplayLaunch && !btnReplayLaunch.classList.contains('rw-top-btn--tv-header')) {
      out.push(btnReplayLaunch)
    }
    const tv = state.tvChart?.getHeaderButton('replay')
    if (tv) out.push(tv)
    return out
  }

  function getBacktestLaunchButtons(): HTMLElement[] {
    const out: HTMLElement[] = []
    const topBtn = host.querySelector('.rw-backtest-launch') as HTMLButtonElement | null
    if (topBtn && !topBtn.classList.contains('rw-top-btn--tv-header')) out.push(topBtn)
    return out
  }
  const replayDock = host.querySelector('[data-rw-replay-dock]') as HTMLElement | null
  const replaySpeed = host.querySelector('[data-rw-replay-speed]') as HTMLInputElement | null
  const replaySpeedBtn = host.querySelector('[data-rw-replay-speed-btn]') as HTMLButtonElement | null
  const replaySpeedLabelEl = host.querySelector('[data-rw-replay-speed-label]') as HTMLElement | null
  const replaySpeedWrap = host.querySelector('[data-rw-replay-speed-wrap]') as HTMLElement | null
  const replaySpeedMenu = host.querySelector('[data-rw-replay-speed-menu]') as HTMLElement | null
  const replaySpeedBubble = host.querySelector('[data-rw-replay-speed-bubble]') as HTMLElement | null
  const replaySpeedDown = host.querySelector('[data-rw-replay-speed-down]') as HTMLButtonElement | null
  const replaySpeedUp = host.querySelector('[data-rw-replay-speed-up]') as HTMLButtonElement | null
  const replayClearFilterBtn = host.querySelector('[data-rw-replay-clear-filter]') as HTMLButtonElement | null
  const replayStartMenu = host.querySelector('[data-rw-replay-start-menu]') as HTMLElement | null
  const replayHubDialog = host.querySelector('[data-rw-replay-hub-dialog]') as HTMLDialogElement | null
  const btnReplayHubClose = host.querySelector('[data-rw-replay-hub-close]') as HTMLButtonElement | null
  const chartLoadingEl = host.querySelector('[data-rw-chart-loading]') as HTMLElement | null
  const chartLoadingText = host.querySelector('[data-rw-chart-loading-text]') as HTMLElement | null
  const chartLoadingMeta = host.querySelector('[data-rw-chart-loading-meta]') as HTMLElement | null
  const chartLoadingBar = host.querySelector('[data-rw-chart-loading-bar]') as HTMLElement | null
  const chartLoadingBarWrap = host.querySelector('[data-rw-chart-loading-bar-wrap]') as HTMLElement | null
  const chartLoadingSpinner = host.querySelector('.rw-chart-loading__spinner') as HTMLElement | null
  let chartLoadingDepth = 0
  let bootLoadingActive = false
  let bootLoadingFinished = false
  let bootLoadingWatchdog: ReturnType<typeof setTimeout> | null = null
  let bootLoadingEndInFlight: Promise<void> | null = null

  const BOOT_LOAD_STEPS = [
    { label: 'Connecting to server', progress: 18 },
    { label: 'Loading indicators', progress: 42 },
    { label: 'Loading chart', progress: 74 },
    { label: 'Almost ready…', progress: 94 },
  ] as const

  function setBootLoadStep(index: number) {
    const step = BOOT_LOAD_STEPS[Math.min(Math.max(index, 0), BOOT_LOAD_STEPS.length - 1)]
    if (chartLoadingText) chartLoadingText.textContent = step.label
    if (chartLoadingBar) chartLoadingBar.style.width = `${step.progress}%`
    chartLoadingBarWrap?.setAttribute('aria-valuenow', String(step.progress))
  }

  function clearBootLoadingWatchdog() {
    if (bootLoadingWatchdog) {
      clearTimeout(bootLoadingWatchdog)
      bootLoadingWatchdog = null
    }
  }

  function beginBootLoading() {
    if (!chartLoadingEl) return
    bootLoadingFinished = false
    clearBootLoadingWatchdog()
    bootLoadingActive = true
    chartLoadingDepth = 1
    chartLoadingEl.hidden = false
    chartLoadingEl.classList.add('rw-chart-loading--boot')
    chartLoadingEl.classList.remove('rw-chart-loading--overlay')
    chartLoadingEl.setAttribute('aria-busy', 'true')
    rwRoot.classList.add('rw-root--booting')
    if (chartLoadingSpinner) chartLoadingSpinner.hidden = true
    if (chartLoadingMeta) {
      chartLoadingMeta.hidden = true
      chartLoadingMeta.innerHTML = ''
    }
    setBootLoadStep(0)
    bootLoadingWatchdog = window.setTimeout(() => {
      bootLoadingWatchdog = null
      void endBootLoading(true)
    }, 45_000)
  }

  async function endBootLoading(force = false) {
    if (!chartLoadingEl) return
    if (bootLoadingEndInFlight) {
      await bootLoadingEndInFlight
      if (bootLoadingFinished && !force) return
    }
    const bootVisible =
      bootLoadingActive ||
      !chartLoadingEl.hidden ||
      chartLoadingEl.classList.contains('rw-chart-loading--boot')
    if (!bootVisible && !force) return
    if (bootLoadingFinished && !force) return

    bootLoadingEndInFlight = (async () => {
      clearBootLoadingWatchdog()
      setBootLoadStep(BOOT_LOAD_STEPS.length - 1)
      if (chartLoadingBar) chartLoadingBar.style.width = '100%'
      chartLoadingBarWrap?.setAttribute('aria-valuenow', '100')
      await new Promise<void>((resolve) => window.setTimeout(resolve, 120))
      bootLoadingActive = false
      chartLoadingDepth = 0
      chartLoadingEl!.hidden = true
      chartLoadingEl!.classList.remove('rw-chart-loading--boot')
      chartLoadingEl!.setAttribute('aria-busy', 'false')
      rwRoot.classList.remove('rw-root--booting')
      bootLoadingFinished = true
    })()

    try {
      await bootLoadingEndInFlight
    } finally {
      bootLoadingEndInFlight = null
    }
  }

  /** Hide the boot splash once the chart has data on screen (safe to call multiple times). */
  async function dismissBootAfterPaint() {
    if (bootLoadingFinished || state.disposed) return
    setBootLoadStep(3)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    await endBootLoading()
  }

  type ChartLoadingOpts =
    | string
    | { kind: 'session'; session: SessionCreatedPayload; symbol: string; balance: number }

  function setChartLoading(active: boolean, opts: ChartLoadingOpts = 'Loading chart…') {
    if (!chartLoadingEl) return
    if (bootLoadingActive && active) return
    chartLoadingDepth += active ? 1 : -1
    if (chartLoadingDepth < 0) chartLoadingDepth = 0
    const on = chartLoadingDepth > 0
    chartLoadingEl.hidden = !on
    chartLoadingEl.setAttribute('aria-busy', on ? 'true' : 'false')
    chartLoadingEl.classList.toggle('rw-chart-loading--overlay', on)
    chartLoadingEl.classList.remove('rw-chart-loading--boot')
    if (chartLoadingSpinner) chartLoadingSpinner.hidden = !on
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

  function forceClearChartLoading() {
    if (!chartLoadingEl) return
    chartLoadingDepth = 0
    chartLoadingEl.hidden = true
    chartLoadingEl.setAttribute('aria-busy', 'false')
    chartLoadingEl.classList.remove('rw-chart-loading--overlay')
    if (chartLoadingSpinner) chartLoadingSpinner.hidden = true
  }

  const btnReplayStartMenuToggle = host.querySelector('[data-rw-replay-select-menu-toggle]') as HTMLButtonElement | null
  const replaySelectLabel = host.querySelector('[data-rw-replay-select-label]') as HTMLElement | null
  const replaySelectIco = host.querySelector('[data-rw-replay-select-ico]') as HTMLElement | null
  const btnReplayDockDrag = host.querySelector('[data-rw-replay-drag]') as HTMLButtonElement | null

  const REPLAY_DOCK_POS_KEY = 'rw.replayDock.pos'

  type ReplayDockPos = { left: number; top: number }

  function readSavedReplayDockPos(): ReplayDockPos | null {
    try {
      const raw = sessionStorage.getItem(REPLAY_DOCK_POS_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<ReplayDockPos>
      if (
        typeof parsed.left === 'number' &&
        typeof parsed.top === 'number' &&
        Number.isFinite(parsed.left) &&
        Number.isFinite(parsed.top)
      ) {
        return { left: parsed.left, top: parsed.top }
      }
    } catch {
      /* ignore */
    }
    return null
  }

  function saveReplayDockPos(pos: ReplayDockPos) {
    try {
      sessionStorage.setItem(REPLAY_DOCK_POS_KEY, JSON.stringify(pos))
    } catch {
      /* ignore */
    }
  }

  function clampReplayDockPos(left: number, top: number): ReplayDockPos {
    const pad = 8
    const canvasRect = chartCanvas.getBoundingClientRect()
    const dockRect = replayDock?.getBoundingClientRect()
    const w = dockRect?.width ?? 320
    const h = dockRect?.height ?? 44
    const maxLeft = Math.max(pad, canvasRect.width - w - pad)
    const maxTop = Math.max(pad, canvasRect.height - h - pad)
    return {
      left: Math.min(maxLeft, Math.max(pad, left)),
      top: Math.min(maxTop, Math.max(pad, top)),
    }
  }

  function applyReplayDockPos(pos: ReplayDockPos) {
    if (!replayDock) return
    const clamped = clampReplayDockPos(pos.left, pos.top)
    replayDock.classList.add('rw-replay-dock--user-pos')
    replayDock.style.left = `${clamped.left}px`
    replayDock.style.top = `${clamped.top}px`
    replayDock.style.right = 'auto'
    replayDock.style.bottom = 'auto'
    replayDock.style.transform = 'none'
  }

  /** Default: bottom-center in the chart pane (CSS). Clears user/inline coords. */
  function positionReplayDockBottomCenter() {
    if (!replayDock) return
    const saved = readSavedReplayDockPos()
    if (saved) {
      applyReplayDockPos(saved)
      return
    }
    replayDock.classList.remove('rw-replay-dock--user-pos')
    replayDock.style.removeProperty('position')
    replayDock.style.removeProperty('left')
    replayDock.style.removeProperty('top')
    replayDock.style.removeProperty('right')
    replayDock.style.removeProperty('bottom')
    replayDock.style.removeProperty('transform')
  }

  function bindReplayDockDrag() {
    if (!replayDock || !btnReplayDockDrag) return

    let dragging = false
    let pointerId: number | null = null
    let grabOffsetX = 0
    let grabOffsetY = 0

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || !replayDock || e.pointerId !== pointerId) return
      const canvasRect = chartCanvas.getBoundingClientRect()
      const left = e.clientX - canvasRect.left - grabOffsetX
      const top = e.clientY - canvasRect.top - grabOffsetY
      applyReplayDockPos({ left, top })
      syncReplayStartMenuPlacement()
      syncReplaySpeedMenuPlacement()
    }

    const clearDockDragChrome = () => {
      replayDock?.classList.remove('rw-replay-dock--dragging')
      document.body.classList.remove('rw-replay-dock-dragging')
      chartCanvas.classList.remove('rw-chart-canvas--dock-dragging')
    }

    const endDrag = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointerId) return
      dragging = false
      pointerId = null
      clearDockDragChrome()
      try {
        btnReplayDockDrag.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
      if (replayDock) {
        const left = Number.parseFloat(replayDock.style.left)
        const top = Number.parseFloat(replayDock.style.top)
        if (Number.isFinite(left) && Number.isFinite(top)) {
          saveReplayDockPos(clampReplayDockPos(left, top))
        }
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !replayDock) return
      e.preventDefault()
      e.stopPropagation()
      const dockRect = replayDock.getBoundingClientRect()
      const canvasRect = chartCanvas.getBoundingClientRect()
      // Promote CSS-centered dock to absolute coords before dragging.
      if (!replayDock.classList.contains('rw-replay-dock--user-pos')) {
        applyReplayDockPos({
          left: dockRect.left - canvasRect.left,
          top: dockRect.top - canvasRect.top,
        })
      }
      grabOffsetX = e.clientX - dockRect.left
      grabOffsetY = e.clientY - dockRect.top
      dragging = true
      pointerId = e.pointerId
      replayDock.classList.add('rw-replay-dock--dragging')
      document.body.classList.add('rw-replay-dock-dragging')
      chartCanvas.classList.add('rw-chart-canvas--dock-dragging')
      try {
        btnReplayDockDrag.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', endDrag)
      window.addEventListener('pointercancel', endDrag)
    }

    btnReplayDockDrag.addEventListener('pointerdown', onPointerDown)
    cleanupFns.push(() => {
      btnReplayDockDrag.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
      clearDockDragChrome()
    })
  }

  const state = {
    disposed: false,
    trading: null as ReturnType<typeof createTradingChart> | null,
    tvChart: null as TradingViewChartHandle | null,
    replay: null as ReplayController | null,
    tickReplayUnit: 'bar' as 'bar' | 'tick',
    tickReplayWindowed: false,
    sessionBarsWindowed: false,
    clockTimer: null as ReturnType<typeof setInterval> | null,
    ro: null as ResizeObserver | null,
    exitSelectBarChartMode: null as null | (() => void),
    redrawDrawings: null as null | (() => void),
    openReplayBarPick: null as null | (() => void),
  }

  const cleanupFns: Array<() => void> = []

  bindReplayDockDrag()

  const onWindowResizeDock = () => {
    if (replayDock && !replayDock.hidden) {
      if (replayDock.classList.contains('rw-replay-dock--user-pos')) {
        const left = Number.parseFloat(replayDock.style.left)
        const top = Number.parseFloat(replayDock.style.top)
        if (Number.isFinite(left) && Number.isFinite(top)) applyReplayDockPos({ left, top })
      } else {
        positionReplayDockBottomCenter()
      }
    }
    syncReplayStartMenuPlacement()
    syncReplaySpeedMenuPlacement()
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

  function syncReplaySpeedMenuPlacement() {
    if (!replaySpeedMenu || replaySpeedMenu.hidden) return
    const anchor =
      (replaySpeedMenu.closest('.rw-replay-dock__transport-anchor') as HTMLElement | null) ??
      (replaySpeedBtn as HTMLElement | null)
    if (!anchor) return
    const gap = 8
    const edgePad = 8
    const toolbarClearance = 48
    const minMenuH = 140
    const anchorRect = anchor.getBoundingClientRect()
    const spaceAbove = Math.max(0, anchorRect.top - toolbarClearance - gap)
    const spaceBelow = Math.max(0, window.innerHeight - anchorRect.bottom - gap - edgePad)
    // Prefer the side with more room; when dock is high, open downward.
    const openBelow = spaceBelow > spaceAbove || anchorRect.top < window.innerHeight * 0.45
    const maxH = Math.max(minMenuH, openBelow ? spaceBelow : spaceAbove)
    replaySpeedMenu.classList.toggle('rw-replay-speed-menu--below', openBelow)
    replaySpeedMenu.classList.toggle('rw-replay-speed-menu--above', !openBelow)
    replaySpeedMenu.style.maxHeight = `${maxH}px`
    // Keep the first (top) speed row visible; user scrolls for the rest.
    replaySpeedMenu.scrollTop = 0
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

  let speedBubbleHideTimer: ReturnType<typeof setTimeout> | null = null

  function syncReplaySpeedBubblePosition(speedIndex: number) {
    if (!replaySpeedBubble) return
    const max = REPLAY_BARS_PER_SEC.length - 1
    const pct = max <= 0 ? 0 : (speedIndex / max) * 100
    replaySpeedBubble.style.left = `${pct}%`
  }

  function showReplaySpeedBubble(persist = false) {
    if (!replaySpeedWrap) return
    replaySpeedWrap.classList.add('rw-replay-dock__speed-wrap--active')
    if (speedBubbleHideTimer) {
      clearTimeout(speedBubbleHideTimer)
      speedBubbleHideTimer = null
    }
    if (!persist) {
      speedBubbleHideTimer = setTimeout(() => {
        hideReplaySpeedBubble()
      }, 1400)
    }
  }

  function hideReplaySpeedBubble() {
    if (!replaySpeedWrap) return
    replaySpeedWrap.classList.remove('rw-replay-dock__speed-wrap--active')
    if (speedBubbleHideTimer) {
      clearTimeout(speedBubbleHideTimer)
      speedBubbleHideTimer = null
    }
  }

  function syncReplaySpeedUi(speedIndex?: number) {
    if (!replaySpeed) return
    const idx = speedIndex ?? state.replay?.getSpeedIndex() ?? 0
    const clamped = Math.max(0, Math.min(REPLAY_BARS_PER_SEC.length - 1, Math.round(idx)))
    const bps = REPLAY_BARS_PER_SEC[clamped] ?? 1
    const label = replaySpeedLabel(bps, state.tickReplayUnit)
    const compact = state.tickReplayUnit === 'tick' ? `${bps}t` : replaySpeedX(bps)
    replaySpeed.value = String(clamped)
    replaySpeed.setAttribute('aria-valuetext', label)
    if (replaySpeedBubble) replaySpeedBubble.textContent = label
    if (replaySpeedLabelEl) replaySpeedLabelEl.textContent = compact
    if (replaySpeedBtn) {
      replaySpeedBtn.title = `Playback speed · ${label}`
      replaySpeedBtn.setAttribute('aria-label', `Playback speed ${label}`)
    }
    if (replaySpeedMenu) {
      replaySpeedMenu.querySelectorAll<HTMLButtonElement>('[data-rw-replay-speed-index]').forEach((btn) => {
        const active = Number(btn.dataset.rwReplaySpeedIndex) === clamped
        btn.classList.toggle('rw-replay-speed-menu__item--active', active)
        btn.setAttribute('aria-checked', active ? 'true' : 'false')
      })
    }
    syncReplaySpeedBubblePosition(clamped)
    if (replaySpeedDown) replaySpeedDown.disabled = clamped <= 0
    if (replaySpeedUp) replaySpeedUp.disabled = clamped >= REPLAY_BARS_PER_SEC.length - 1
  }

  function openSpeedMenu() {
    if (!replaySpeedMenu) return
    closeStartMenu()
    replaySpeedMenu.hidden = false
    replaySpeedBtn?.setAttribute('aria-expanded', 'true')
    requestAnimationFrame(() => {
      syncReplaySpeedMenuPlacement()
      requestAnimationFrame(() => syncReplaySpeedMenuPlacement())
    })
  }

  function closeSpeedMenu() {
    if (!replaySpeedMenu) return
    replaySpeedMenu.hidden = true
    replaySpeedBtn?.setAttribute('aria-expanded', 'false')
    replaySpeedMenu.classList.remove('rw-replay-speed-menu--below', 'rw-replay-speed-menu--above')
    replaySpeedMenu.style.removeProperty('max-height')
    replaySpeedMenu.scrollTop = 0
  }

  function toggleSpeedMenu() {
    if (!replaySpeedMenu) return
    if (replaySpeedMenu.hidden) openSpeedMenu()
    else closeSpeedMenu()
  }

  function selectReplaySpeedIndex(idx: number) {
    if (!state.replay) return
    const clamped = Math.max(0, Math.min(REPLAY_BARS_PER_SEC.length - 1, Math.round(idx)))
    state.replay.setSpeedIndex(clamped)
    syncReplaySpeedUi(clamped)
  }

  function bumpReplaySpeed(delta: number) {
    if (!replaySpeed || !state.replay) return
    const cur = Number(replaySpeed.value)
    const max = REPLAY_BARS_PER_SEC.length - 1
    // TV-style: clicking the 1x button cycles through speeds (wraps).
    let next = cur + delta
    if (next > max) next = 0
    if (next < 0) next = max
    if (next === cur) return
    replaySpeed.value = String(next)
    state.replay.setSpeedIndex(next)
    syncReplaySpeedUi(next)
    showReplaySpeedBubble()
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

  function applyReplayLaunchActiveStyle(btn: HTMLElement, open: boolean) {
    btn.classList.toggle('rw-tv-header-btn--active', open)
    btn.setAttribute('aria-expanded', open ? 'true' : 'false')
    btn.setAttribute('aria-pressed', open ? 'true' : 'false')
    btn.title = open ? 'Hide bar replay' : 'Bar replay'
    if (!btn.classList.contains('rw-top-btn--tv-header') && btn.classList.contains('rw-replay-launch')) {
      // Host-page Replay pill (non-TV)
      if (open) {
        btn.style.setProperty('background', '#131722', 'important')
        btn.style.setProperty('color', '#f0f3fa', 'important')
      } else {
        btn.style.removeProperty('background')
        btn.style.removeProperty('color')
      }
    }
  }

  function syncTvReplayHeaderActive(open: boolean) {
    state.tvChart?.setHeaderButtonActive('replay', open, {
      label: '◁◁ Replay',
    })
  }

  function setReplayDockOpen(open: boolean, opts?: { backtest?: boolean; centerTop?: boolean }) {
    const replayBtns = getReplayLaunchButtons()
    if (!replayDock) return
    // TV mode: bar replay bar stays fixed in the chart footer — never dismiss.
    if (tvChartMode) open = true
    if (!open) {
      state.exitSelectBarChartMode?.()
      closeStartMenu()
      closeReplayHub()
      state.trading?.clearReplayPickPreview()
      state.tvChart?.clearReplayPickPreview()
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
    for (const btn of replayBtns) {
      applyReplayLaunchActiveStyle(btn, open)
    }
    if (!tvChartMode) syncTvReplayHeaderActive(open)
    rwRoot.classList.toggle('rw-replay-dock-open', open)
    if (open) {
      positionReplayDockBottomCenter()
    }
  }

  const onReplayLaunchClick = () => {
    if (!replayDock) return
    if (tvChartMode) {
      setReplayDockOpen(true)
      return
    }
    const opening = replayDock.hidden
    if (opening) setReplayDockOpen(true)
    else setReplayDockOpen(false)
  }
  const onReplayStartMenuToggleClick = (e: MouseEvent) => {
    e.stopPropagation()
    toggleStartMenu()
  }

  let chartTimeframe = readDefaultChartInterval()
  if (!tvChartMode && subbarHeadEl) {
    subbarHeadEl.innerHTML = `<span style="color:#787b86">Loading <strong>${symUi}</strong>…</span>`
  }
  chartVolEl.innerHTML = ''

  const onDocPointerCloseStartMenu = (e: PointerEvent) => {
    if (state.disposed) return
    const t = e.target as Node
    if (!replaySpeedWrap?.contains(t) && !replaySpeedMenu?.contains(t)) closeSpeedMenu()
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
  const onReplayDockClose = () => {
    if (tvChartMode) return
    setReplayDockOpen(false)
  }
  btnReplayDockClose?.addEventListener('click', onReplayDockClose)
  cleanupFns.push(() => btnReplayDockClose?.removeEventListener('click', onReplayDockClose))

  if (tvChartMode) setReplayDockOpen(true)

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
  /** Parsed field value, or null when empty / invalid (do not coerce empty → 1 for steppers). */
  const readOrderQtyRaw = (): number | null => {
    if (!qtyInput) return null
    const raw = qtyInput.value.trim()
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  const readOrderQty = (): number => {
    const n = readOrderQtyRaw()
    return n === null ? 1 : clampOrderQty(n)
  }
  function syncOrderQtyField() {
    if (!qtyInput) return
    const raw = qtyInput.value.trim()
    if (!raw) return
    qtyInput.value = String(clampOrderQty(Number(raw)))
  }
  const onQtyStepUp = () => {
    if (!qtyInput) return
    const n = readOrderQtyRaw()
    // Empty / 0 / invalid → start at 1 (not 1+1 → 2).
    if (n === null || n < 1) {
      qtyInput.value = '1'
      return
    }
    qtyInput.value = String(clampOrderQty(n + 1))
  }
  const onQtyStepDown = () => {
    if (!qtyInput) return
    const n = readOrderQtyRaw()
    if (n === null || n <= 1) {
      qtyInput.value = '1'
      return
    }
    qtyInput.value = String(clampOrderQty(n - 1))
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

  // Clicking inside the TradingView chart iframe doesn't emit a parent pointerdown;
  // it blurs the parent window and focuses the iframe. Close the start menu on that.
  const onWindowBlurCloseStartMenu = () => {
    if (state.disposed) return
    const startOpen = replayStartMenu && !replayStartMenu.hidden
    const speedOpen = replaySpeedMenu && !replaySpeedMenu.hidden
    if (!startOpen && !speedOpen) return
    window.setTimeout(() => {
      if (document.activeElement instanceof HTMLIFrameElement) {
        closeStartMenu()
        closeSpeedMenu()
      }
    }, 0)
  }
  window.addEventListener('blur', onWindowBlurCloseStartMenu)
  cleanupFns.push(() => window.removeEventListener('blur', onWindowBlurCloseStartMenu))

  beginBootLoading()
  if (tvChartMode) {
    void preloadTradingViewScript().catch(() => {
      /* surfaced when createTradingViewChart runs */
    })
  }

  function syncThemeToggleButton() {
    const dark = uiChartTheme === 'dark'
    const icon = dark ? icons.sun : icons.moon
    if (btnThemeToggle) {
      btnThemeToggle.innerHTML = icon
      btnThemeToggle.title = 'Toggle theme'
      btnThemeToggle.setAttribute('aria-label', 'Toggle theme')
    }
  }
  syncThemeToggleButton()

  function syncFullscreenButton() {
    const fs = document.fullscreenElement != null
    if (btnTopFullscreen) {
      btnTopFullscreen.innerHTML = fs ? icons.tvToolbarCompress : icons.expand
      btnTopFullscreen.title = fs ? 'Exit fullscreen' : 'Fullscreen mode'
      btnTopFullscreen.setAttribute('aria-label', fs ? 'Exit fullscreen' : 'Fullscreen mode')
    }
    const btnTradeFullscreen = host.querySelector('[data-rw-trade-fullscreen]') as HTMLButtonElement | null
    if (btnTradeFullscreen) {
      btnTradeFullscreen.innerHTML = fs ? icons.tvToolbarCompress : icons.expand
      btnTradeFullscreen.title = fs ? 'Exit fullscreen' : 'Fullscreen mode'
      btnTradeFullscreen.setAttribute('aria-label', fs ? 'Exit fullscreen' : 'Fullscreen mode')
    }
    rwRoot.classList.toggle('rw-root--fullscreen', fs)
  }
  syncFullscreenButton()

  function toggleChartFullscreen() {
    void (async () => {
      try {
        if (!document.fullscreenElement) {
          await host.requestFullscreen()
        } else {
          await document.exitFullscreen()
        }
      } catch {
        /* fullscreen blocked or unsupported */
      }
    })()
  }

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
    state.tvChart?.applyTheme(uiChartTheme === 'dark' ? 'dark' : 'light')
    state.redrawDrawings?.()
    requestAnimationFrame(() => {
      if (state.trading && !state.disposed) {
        state.trading.chart.resize(chartHost.clientWidth, chartHost.clientHeight)
        state.trading.repaintTimeShades()
        state.redrawDrawings?.()
      } else if (state.tvChart && !state.disposed) {
        state.tvChart.resize()
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

  function setSymbolSearchChromeHidden(hidden: boolean) {
    rwRoot.classList.toggle('rw-symbol-search-open', hidden)
    /* Inline !important in case stylesheet/cache lags — dock must not cover the modal. */
    if (replayDock) {
      if (hidden) replayDock.style.setProperty('display', 'none', 'important')
      else replayDock.style.removeProperty('display')
    }
    if (selectBarTimeFlyout) {
      if (hidden) selectBarTimeFlyout.style.setProperty('display', 'none', 'important')
      else selectBarTimeFlyout.style.removeProperty('display')
    }
  }

  function openSymbolSearch() {
    if (state.disposed || !symbolSearch || !symbolSearchDlg) return
    setSymbolSearchChromeHidden(true)
    /* Reparent to body so the modal top-layer isn't trapped under chart chrome. */
    if (symbolSearchDlg.parentElement !== document.body) {
      document.body.appendChild(symbolSearchDlg)
    }
    symbolSearch.open()
  }

  const onSymbolSearchDialogClose = () => {
    setSymbolSearchChromeHidden(false)
    /* Restore dialog next to chart workspace host for disposal / remount. */
    if (symbolSearchDlg && symbolSearchDlg.parentElement === document.body && host.isConnected) {
      host.querySelector('.rw-root')?.appendChild(symbolSearchDlg)
    }
  }
  symbolSearchDlg?.addEventListener('close', onSymbolSearchDialogClose)
  cleanupFns.push(() => symbolSearchDlg?.removeEventListener('close', onSymbolSearchDialogClose))

  const btnSymbolSearch = host.querySelector('#rw-symbol-toolbar-search') as HTMLButtonElement | null
  const onSymbolSearchClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopImmediatePropagation()
    openSymbolSearch()
  }
  btnSymbolSearch?.addEventListener('click', onSymbolSearchClick, true)
  cleanupFns.push(() => btnSymbolSearch?.removeEventListener('click', onSymbolSearchClick, true))

  cleanupFns.push(() => {
    setSymbolSearchChromeHidden(false)
    if (symbolSearchDlg && symbolSearchDlg.parentElement === document.body && host.isConnected) {
      host.querySelector('.rw-root')?.appendChild(symbolSearchDlg)
    }
    symbolSearch?.dispose()
  })

  /** Hide our dock while TradingView's in-iframe symbol search / dialogs are open. */
  let tvOverlayObserver: MutationObserver | null = null
  let tvOverlayPoll: ReturnType<typeof setInterval> | null = null
  function tvIframeHasOverlay(): boolean {
    const iframe = chartTv?.querySelector('iframe') as HTMLIFrameElement | null
    const doc = iframe?.contentDocument
    if (!doc) return false
    return Boolean(
      doc.querySelector(
        '[data-name="symbol-search-items-dialog"], .tv-dialog, .js-dialog, [class*="dialog"][aria-modal="true"], [role="dialog"]',
      ),
    )
  }
  function syncTvOverlayDockVisibility() {
    if (state.disposed) return
    if (rwRoot.classList.contains('rw-symbol-search-open')) return
    const hide = tvIframeHasOverlay()
    if (!replayDock || replayDock.hidden) return
    if (hide) {
      replayDock.style.setProperty('display', 'none', 'important')
      selectBarTimeFlyout?.style.setProperty('display', 'none', 'important')
    } else {
      replayDock.style.removeProperty('display')
      selectBarTimeFlyout?.style.removeProperty('display')
    }
  }
  function bindTvOverlayObserver() {
    tvOverlayObserver?.disconnect()
    tvOverlayObserver = null
    if (tvOverlayPoll) {
      clearInterval(tvOverlayPoll)
      tvOverlayPoll = null
    }
    const iframe = chartTv?.querySelector('iframe') as HTMLIFrameElement | null
    const doc = iframe?.contentDocument
    if (!doc) return
    tvOverlayObserver = new MutationObserver(() => syncTvOverlayDockVisibility())
    tvOverlayObserver.observe(doc.body ?? doc.documentElement, {
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
    })
    tvOverlayPoll = setInterval(syncTvOverlayDockVisibility, 2500)
  }
  cleanupFns.push(() => {
    tvOverlayObserver?.disconnect()
    tvOverlayObserver = null
    if (tvOverlayPoll) clearInterval(tvOverlayPoll)
    tvOverlayPoll = null
  })

  let indicatorMgr: ReturnType<typeof createChartIndicatorManager> | null = null
  let activeChartIndicators: ChartIndicatorId[] = (opts?.activeChartIndicators ?? []).filter(isChartIndicatorId)
  let persistIndicatorsTimer: ReturnType<typeof setTimeout> | null = null

  function paintIndicatorBar() {
    if (!indicatorBarEl) return
    renderChartIndicatorBar(indicatorBarEl, activeChartIndicators, (id) => {
      indicatorMgr?.remove(id)
      activeChartIndicators = indicatorMgr?.getActiveIds() ?? []
      paintIndicatorBar()
      indicatorsModal.refreshRows()
      schedulePersistIndicators()
    })
  }

  function schedulePersistIndicators() {
    if (!opts?.onChartIndicatorsChange) return
    if (persistIndicatorsTimer) clearTimeout(persistIndicatorsTimer)
    persistIndicatorsTimer = setTimeout(() => {
      persistIndicatorsTimer = null
      opts.onChartIndicatorsChange?.(activeChartIndicators)
    }, 400)
  }

  function syncChartIndicators(allBars: Bar[], displayBars: Bar[]) {
    indicatorMgr?.sync(allBars, displayBars)
  }

  function addChartIndicator(id: ChartIndicatorId) {
    if (!indicatorMgr?.add(id)) return
    activeChartIndicators = indicatorMgr.getActiveIds()
    paintIndicatorBar()
    indicatorsModal.refreshRows()
    if (state.replay) {
      syncChartIndicators(state.replay.getBars(), state.replay.slice())
    }
    schedulePersistIndicators()
  }

  const indicatorsModal = createIndicatorsModal({
    root: rwRoot,
    onOpenChange: (v) => btnIndicators?.setAttribute('aria-expanded', v ? 'true' : 'false'),
    isIndicatorActive: (id) => activeChartIndicators.includes(id),
    onAddIndicator: (id) => addChartIndicator(id),
  })
  const onIndicatorsClick = (e: MouseEvent) => {
    e.stopPropagation()
    indicatorsModal.open()
  }
  btnIndicators?.addEventListener('click', onIndicatorsClick)
  cleanupFns.push(() => btnIndicators?.removeEventListener('click', onIndicatorsClick))
  cleanupFns.push(() => indicatorsModal.dispose())

  const pineDockHost = host.querySelector('[data-rw-pine-dock]') as HTMLElement | null
  const btnFootPine = host.querySelector('[data-rw-foot-pine-editor]') as HTMLButtonElement | null

  let pineEditor: ReturnType<typeof createPineEditorDock> | null = null
  let onPineAddToChart: ((script: string, strategyId: string | null) => void) | null = null

  function resizeChartAfterLayout() {
    requestAnimationFrame(() => {
      if (state.trading && !state.disposed) {
        state.trading.chart.resize(chartHost.clientWidth, chartHost.clientHeight)
        state.trading.repaintTimeShades()
        state.redrawDrawings?.()
      } else if (state.tvChart && !state.disposed) {
        state.tvChart.resize()
      }
    })
  }

  if (pineDockHost) {
    pineEditor = createPineEditorDock({
      host: pineDockHost,
      getSymbol: () => formatDisplaySymbol(currentChartSymbol),
      onOpenChange: (open) => {
        rwRoot.classList.toggle('rw-pine-open', open)
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
    getBacktestLaunchButtons().forEach((b) => b.classList.remove('rw-backtest-launch--active'))
    setPineEditorOpen(true)
  }

  function openSessionSettings() {
    opts?.onEditSession?.()
  }

  const onFootPineClick = () => togglePineEditor()
  btnFootPine?.addEventListener('click', onFootPineClick)
  cleanupFns.push(() => btnFootPine?.removeEventListener('click', onFootPineClick))

  const onTopSettings = () => applyChartPaletteToggle()
  btnTopSettings?.addEventListener('click', onTopSettings)
  cleanupFns.push(() => btnTopSettings?.removeEventListener('click', onTopSettings))

  host.querySelectorAll<HTMLButtonElement>('[data-rw-session-settings]').forEach((btn) => {
    const onSessionSettings = () => openSessionSettings()
    btn.addEventListener('click', onSessionSettings)
    cleanupFns.push(() => btn.removeEventListener('click', onSessionSettings))
  })

  const btnSessionSettingsEdit = host.querySelector('[data-rw-session-settings-edit]') as HTMLButtonElement | null
  const onSessionSettingsEdit = () => opts?.onEditSession?.()
  btnSessionSettingsEdit?.addEventListener('click', onSessionSettingsEdit)
  cleanupFns.push(() => btnSessionSettingsEdit?.removeEventListener('click', onSessionSettingsEdit))

  const tradeDockRow = host.querySelector('[data-rw-trade-dock-row]') as HTMLElement | null
  const btnTradeDockCollapse = host.querySelector('[data-rw-trade-dock-collapse]') as HTMLButtonElement | null
  const onTradeDockCollapse = () => {
    if (!tradeDockRow || !btnTradeDockCollapse) return
    const collapsed = tradeDockRow.classList.toggle('rw-foot__trade-dock-row--collapsed')
    btnTradeDockCollapse.setAttribute('aria-label', collapsed ? 'Expand trade panel' : 'Collapse trade panel')
    btnTradeDockCollapse.title = collapsed ? 'Expand' : 'Collapse'
  }
  btnTradeDockCollapse?.addEventListener('click', onTradeDockCollapse)
  cleanupFns.push(() => btnTradeDockCollapse?.removeEventListener('click', onTradeDockCollapse))

  const btnTradeFullscreen = host.querySelector('[data-rw-trade-fullscreen]') as HTMLButtonElement | null
  const onTradeFullscreen = () => toggleChartFullscreen()
  btnTradeFullscreen?.addEventListener('click', onTradeFullscreen)
  cleanupFns.push(() => btnTradeFullscreen?.removeEventListener('click', onTradeFullscreen))

  function captureSnapshotOrNotice() {
    const canvas = captureChartSnapshotCanvas(chartLwc)
    if (!canvas) {
      showReplayNotice('Chart is not ready for a snapshot yet.')
      return null
    }
    return canvas
  }

  async function runSnapshotAction(action: ChartSnapshotAction) {
    const canvas = captureSnapshotOrNotice()
    if (!canvas) return
    const shareUrl = window.location.href
    switch (action) {
      case 'download':
        downloadChartSnapshotCanvas(canvas, chartSnapshotFilename(currentChartSymbol))
        showReplayNotice('Snapshot downloaded.')
        break
      case 'copy-image': {
        const ok = await copyChartSnapshotCanvas(canvas)
        showReplayNotice(ok ? 'Snapshot copied to clipboard.' : 'Could not copy image — check browser permissions.')
        break
      }
      case 'copy-link': {
        const ok = await copyChartShareLink(shareUrl)
        showReplayNotice(ok ? 'Chart link copied.' : 'Could not copy link.')
        break
      }
      case 'open-tab':
        if (!openChartSnapshotInNewTab(canvas)) {
          showReplayNotice('Could not open snapshot in a new tab.')
        }
        break
    }
  }

  const snapshotMenu = btnTopSnapshot
    ? createChartSnapshotMenu({
        anchor: btnTopSnapshot,
        onAction: (action) => {
          void runSnapshotAction(action)
        },
        onOpenChange: (open) => {
          btnTopSnapshot!.setAttribute('aria-expanded', open ? 'true' : 'false')
          btnTopSnapshot!.classList.toggle('rw-top-snapshot--open', open)
        },
      })
    : null

  const onTopSnapshot = (e: MouseEvent) => {
    e.stopPropagation()
    snapshotMenu?.toggle()
  }
  btnTopSnapshot?.addEventListener('click', onTopSnapshot)
  cleanupFns.push(() => {
    btnTopSnapshot?.removeEventListener('click', onTopSnapshot)
    snapshotMenu?.dispose()
    btnTopSnapshot?.setAttribute('aria-expanded', 'false')
    btnTopSnapshot?.classList.remove('rw-top-snapshot--open')
  })

  const onSnapshotShortcut = (e: KeyboardEvent) => {
    if (state.disposed) return
    const key = e.key.toLowerCase()
    if (e.ctrlKey && e.altKey && key === 's') {
      e.preventDefault()
      void runSnapshotAction('download')
    } else if (e.ctrlKey && e.shiftKey && key === 's') {
      e.preventDefault()
      void runSnapshotAction('copy-image')
    } else if (e.altKey && !e.ctrlKey && !e.shiftKey && key === 's') {
      e.preventDefault()
      void runSnapshotAction('copy-link')
    }
  }
  window.addEventListener('keydown', onSnapshotShortcut, true)
  cleanupFns.push(() => window.removeEventListener('keydown', onSnapshotShortcut, true))

  const onTopFullscreen = () => toggleChartFullscreen()
  btnTopFullscreen?.addEventListener('click', onTopFullscreen)
  cleanupFns.push(() => btnTopFullscreen?.removeEventListener('click', onTopFullscreen))

  const onFullscreenChange = () => syncFullscreenButton()
  document.addEventListener('fullscreenchange', onFullscreenChange)
  cleanupFns.push(() => document.removeEventListener('fullscreenchange', onFullscreenChange))

  const onHome = () => opts?.onExit?.()
  btnHome?.addEventListener('click', onHome)
  btnChartBack?.addEventListener('click', onHome)
  cleanupFns.push(() => btnHome?.removeEventListener('click', onHome))
  cleanupFns.push(() => btnChartBack?.removeEventListener('click', onHome))

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
      highlightTradeNum: backtestState.highlightTradeNum,
    })
    syncOrderPanelPosition()
  }

  function syncOrderPanelPosition() {
    /* right panel removed */
  }

  function updateRightPanel(_b: Bar | null, _prev: Bar | null) {
    updateSidePanelFromReplay(_b)
  }

  void (async () => {
    try {
    let selectBarChartActive = false
    let series: Awaited<ReturnType<typeof loadSessionBars>> | null = null
    applyFeedUi({ symbol: currentChartSymbol, loading: true })
    void fetchMarketDataHealth().then((health) => {
      marketHealth = health
    })
    try {
      setBootLoadStep(1)
      series = await loadSessionBars(currentChartSymbol, activeSession.name, undefined, {
        startDate: activeSession.startDate,
        endDate: activeSession.endDate,
        bootFast: true,
      })
      setBootLoadStep(2)
    } catch (err) {
      console.error('[ChartLoad]', err)
      marketHealth = marketHealth ?? (await fetchMarketDataHealth().catch(() => null))
      applyFeedUi({ symbol: currentChartSymbol, loadFailed: true })
      if (tvChartMode) {
        showReplayNotice(`Failed to load ${symUi}. Check the data feed and try another symbol from search.`)
      } else if (subbarHeadEl) {
        subbarHeadEl.innerHTML = `<span style="color:#787b86">Failed to load <strong>${symUi}</strong>. Check the data feed and try another symbol from search.</span>`
      }
      chartVolEl.innerHTML = ''
      if (replayStatusEl) replayStatusEl.textContent = 'Replay · load failed'
      await endBootLoading(true)
      return
    }
    if (state.disposed || !series) {
      await endBootLoading(true)
      return
    }
    if (series.dataSource && usesMarketDataSession(currentChartSymbol)) {
      feedLabel = `Tradeneu · ${series.dataSource}`
    }
    let chartBars = filterSessionChartBars(series.bars, activeSession)
    const hasSessionDates = Boolean(activeSession.startDate?.trim() || activeSession.endDate?.trim())
    if (
      !chartBars.length &&
      series.bars.length >= MIN_BOOT_CHART_BARS &&
      !hasSessionDates &&
      !/synthetic|empty:session-range/i.test(series.dataSource ?? '')
    ) {
      chartBars = series.bars.slice()
    }
    let sessionReplayStartIndex = sessionStartReplayIndex(chartBars, activeSession.startDate)
    const emptyDateRange =
      hasSessionDates &&
      (!chartBars.length ||
        !sessionWindowHasBars(chartBars, activeSession.startDate, activeSession.endDate))
    applyFeedUi({
      symbol: currentChartSymbol,
      dataSource: series.dataSource,
      barCount: series.bars.length,
      timeframe: series.timeframe,
      emptyDateRange,
    })

    if (!chartBars.length || emptyDateRange) {
      await abortChartNoData(hasSessionDates)
      return
    }

    hideChartEmptyState()
    chartTimeframe = series.timeframe
    let replayTimeframe = chartTimeframe
    /** Sub-minute replay step series (10s, 30s, …) when chart stays on minute+. */
    let replayStepSourceBars: Bar[] = []

    let source1mBars = chartBars.slice()
    const sourceLocalSecondBars = new Map<number, Bar[]>()
    let tickChartData: TickChartData = { kind: 'synthetic', pointBars: [] }
    let sourceTickBars: Bar[] = []
    let dukascopyTicksReady = false
    let useFullSessionTicks = readFullSessionTicks()
    let tickBarsWindowed = false
    let sessionBarsWindowed = Boolean(series.windowed)
    let sessionBarExtendBusy = false
    let sessionLazyFetchKey = ''
    const sessionLazyFetchRef: { fn: ((req: LazyFetchBarsRequest) => Promise<boolean>) | null } = {
      fn: null,
    }
    let fullTickLoadGen = 0
    let lastTickChartPaintAt = 0
    let skipTvReplayPaintOnce = false
    let replay!: ReplayController
    let tickLoadUsedProgressive = false
    let canResample = inferTimeframeFromBars(source1mBars) === '1m'
    let tickBarSeries: TickBarSeries | null = null
    let tickWindowSlideBusy = false
    let tickPrefetchBusy = false
    let tickPrefetchGen = 0
    /** End of last successfully loaded tick chunk (unix sec). */
    let tickLoadedEndSec = 0

    /** Cap synthetic tick expansion so boot stays responsive on long 1m histories. */
    const SYNTHETIC_TICK_MAX_1M_BARS = 4000

    function sessionTicksEligible(): boolean {
      return (
        canLoadDukascopyTicks(currentChartSymbol) &&
        sessionTickRangeSec(activeSession.startDate, activeSession.endDate) != null
      )
    }

    function hasLocalSecondBars(step: number): boolean {
      return (sourceLocalSecondBars.get(step)?.length ?? 0) >= 2
    }

    function medianBarStepSec(bars: Bar[], sample = 48): number {
      if (bars.length < 2) return 60
      const steps: number[] = []
      const n = Math.min(bars.length, sample)
      for (let i = 1; i < n; i++) {
        const d = Number(bars[i]!.time) - Number(bars[i - 1]!.time)
        if (Number.isFinite(d) && d > 0) steps.push(d)
      }
      if (!steps.length) return 60
      steps.sort((a, b) => a - b)
      return steps[Math.floor(steps.length / 2)]!
    }

    function setSourceSecondBars(step: number, bars: Bar[]) {
      if (bars.length >= 2) sourceLocalSecondBars.set(step, bars)
      else sourceLocalSecondBars.delete(step)
    }

    function localSecondIntervalPick(pick: IntervalPick): boolean {
      const step = pick.stepSec ?? 60
      return pick.kind === 'time' && isLocalSecondStep(step) && hasLocalSecondBars(step)
    }

    async function loadSourceSecondBars(
      step: number,
      loadOpts?: { noCache?: boolean },
    ): Promise<Bar[]> {
      if (!sessionTicksEligible() || !isLocalSecondStep(step)) return []
      const tickRange = sessionTickRangeSec(activeSession.startDate, activeSession.endDate)
      if (!tickRange) return []
      const sessionStartSec = activeSession.startDate?.trim()
        ? parseSessionDateToSec(activeSession.startDate, 'start')
        : undefined
      const series = await fetchMarketBarsSeries(currentChartSymbol, DEFAULT_MARKET_BAR_CHAIN, {
        interval: secondStepToInterval(step),
        startSec: tickRange.startSec,
        endSec: tickRange.endSec,
        sessionStartSec: sessionStartSec ?? undefined,
        minBars: 2,
        noCache: loadOpts?.noCache,
      })
      if (!series?.bars.length) return []
      const bars = filterSessionChartBars(series.bars, activeSession)
      if (bars.length < 2) return []
      if (medianBarStepSec(bars) >= maxMedianStepForSecondBars(step)) return []
      return bars
    }

    async function preloadLocalSecondBarsForPick(pick: IntervalPick | null | undefined) {
      if (!pick || !sessionTicksEligible()) return
      const step = pick.stepSec ?? 60
      if (!isLocalSecondStep(step) || hasLocalSecondBars(step)) return
      setSourceSecondBars(step, await loadSourceSecondBars(step))
    }

    /** Build replay transport bars for decoupled step (minute aggregate or sub-minute ticks). */
    async function resolveReplayStepBars(pick: IntervalPick): Promise<Bar[]> {
      const step = pick.stepSec ?? 60
      if (step >= 60) return buildReplayStepBars(source1mBars, pick)

      await preloadLocalSecondBarsForPick(pick)
      if (localSecondIntervalPick(pick)) {
        return sourceLocalSecondBars.get(step)!.slice()
      }

      if (sessionTicksEligible()) {
        if (tickChartData.kind !== 'dukascopy') {
          const ok = await ensureDukascopyTickSource(null, { forceWindowed: false })
          if (!ok) {
            ensureSyntheticTickSource()
          }
        }
        const fromTicks = barsForSubMinuteInterval(tickChartData, step)
        if (fromTicks.length >= 2) return fromTicks
      }

      // Fallback: synthetic second bars from 1m history (no Dukascopy session required).
      if (ensureSyntheticTickSource()) {
        const synth = barsForSubMinuteInterval(tickChartData, step)
        if (synth.length >= 2) return synth
      }
      return []
    }

    function capped1mForSynthetic(): Bar[] {
      if (source1mBars.length <= SYNTHETIC_TICK_MAX_1M_BARS) return source1mBars
      return source1mBars.slice(-SYNTHETIC_TICK_MAX_1M_BARS)
    }

    function resetTickChartSource() {
      fullTickLoadGen += 1
      tickPrefetchGen += 1
      dukascopyTicksReady = false
      tickBarsWindowed = false
      tickChartData = { kind: 'synthetic', pointBars: [] }
      sourceTickBars = []
      tickBarSeries = null
      tickPrefetchBusy = false
      tickLoadedEndSec = 0
      state.tickReplayUnit = 'bar'
      state.tickReplayWindowed = false
    }
    resetTickChartSource()

    function tvCandleBarsForTickMode(): Bar[] {
      return source1mBars.length >= 2 ? source1mBars.slice() : []
    }

    /** Wall-clock time for a 1-based tick replay index (tick-only chartBars). */
    function wallTimeSecForTickReplayIndex(index: number): number | null {
      if (!chartBars.length) return null
      const idx0 = Math.max(0, Math.min(chartBars.length, Math.round(index)) - 1)
      if (tickBarSeries) {
        const ms = tickTimeMsAtBar(tickBarSeries, idx0)
        if (ms != null && Number.isFinite(ms)) return Math.floor(ms / 1000)
      }
      const b = chartBars[idx0]
      return b ? Number(b.time) : null
    }

    function tvRevealCountFromTickReplayIndex(index: number): number {
      const candles = tvCandleBarsForTickMode()
      if (!candles.length) return Math.max(1, Math.min(index, chartBars.length || 1))
      if (index >= chartBars.length) return candles.length
      const t = wallTimeSecForTickReplayIndex(index)
      if (t == null) return candles.length
      return Math.max(1, Math.min(candles.length, barIndexAtOrBeforeTime(candles, t) + 1))
    }

    /**
     * TV display for tick replay: keep full 1m candle history, and update the
     * forming minute candle from ticks so playback is visibly advancing.
     */
    function tvTickModeDisplay(replayIndex: number): { all: Bar[]; display: Bar[] } {
      const base = tvCandleBarsForTickMode()
      if (!base.length) {
        const slice = replay.slice()
        return { all: chartBars, display: slice.length ? slice : chartBars }
      }
      const all = base.map((b) => ({ ...b }))
      if (replayIndex >= chartBars.length) {
        return { all, display: all }
      }

      const reveal = tvRevealCountFromTickReplayIndex(replayIndex)
      if (tickBarSeries && reveal > 0) {
        const forming = formingMinuteOhlcFromTicks(tickBarSeries, replayIndex - 1)
        if (forming) {
          const bi = barIndexAtOrBeforeTime(all, forming.minuteSec)
          const existing = all[bi]
          if (existing && Math.floor(Number(existing.time) / 60) * 60 === forming.minuteSec) {
            all[bi] = {
              ...existing,
              open: forming.open,
              high: forming.high,
              low: forming.low,
              close: forming.close,
              volume: forming.volume,
            }
          }
        }
      }
      return { all, display: all.slice(0, Math.max(1, reveal)) }
    }

    /** Map a TV 1m pick index → 1-based tick replay index. */
    function tickReplayIndexFromTvCandleIndex(candleIdx: number): number {
      if (!tickBarSeries || !chartBars.length) {
        return Math.max(1, Math.min(chartBars.length || 1, candleIdx + 1))
      }
      const candles = tvCandleBarsForTickMode()
      const bar = candles[Math.max(0, Math.min(candles.length - 1, candleIdx))]
      if (!bar) return chartBars.length
      const endMs = (Number(bar.time) + 60) * 1000 - 1
      const firstMs = tickTimeMsAtBar(tickBarSeries, 0)
      if (firstMs != null && endMs < firstMs) return 1
      return Math.min(chartBars.length, barIndexForTickTimeMs(tickBarSeries, endMs) + 1)
    }

    function tvBarsForChart(bars: Bar[]): Bar[] {
      const pick = resolveIntervalPick(chartTimeframe)
      if (pick?.kind === 'tick') {
        const candles = tvCandleBarsForTickMode()
        if (candles.length >= 2) return candles
      }
      return bars
    }

    function resolveTickReplayIndex(
      nextBars: Bar[],
      cursorTimeSec: number | null,
      switchOpts?: { enteringTicks?: boolean; prevIndex?: number; prevBarsLen?: number },
    ): number {
      if (!nextBars.length) return 1

      const prevIndex = switchOpts?.prevIndex
      const prevLen = switchOpts?.prevBarsLen
      // Live end of previous interval → live end of tick window only when entering tick mode.
      if (prevIndex != null && prevLen != null && prevLen > 0) {
        if (prevIndex >= prevLen - 1 && switchOpts?.enteringTicks) {
          return nextBars.length
        }
      }

      if (cursorTimeSec != null && tickBarSeries) {
        const tickIdx = barIndexForTickTimeMs(tickBarSeries, cursorTimeSec * 1000) + 1
        return Math.max(1, Math.min(nextBars.length, tickIdx))
      }

      if (cursorTimeSec != null) {
        const wallIdx = barIndexAtOrBeforeTime(nextBars, cursorTimeSec)
        return Math.max(1, Math.min(nextBars.length, wallIdx))
      }

      if (switchOpts?.enteringTicks) return nextBars.length
      const startIdx = sessionStartReplayIndex(nextBars, activeSession.startDate)
      return Math.min(nextBars.length, Math.max(1, startIdx))
    }

    function syncTickReplayUiFlags(pick: IntervalPick | null) {
      const tickMode = pick?.kind === 'tick'
      state.tickReplayUnit = tickMode ? 'tick' : 'bar'
      state.tickReplayWindowed =
        !!pick &&
        intervalPickNeedsSubMinuteTicks(pick) &&
        tickBarsWindowed &&
        !useFullSessionTicks
      syncReplaySpeedUi()
      syncTickLineOverlayActive()
    }

    function syncTickLineOverlayActive() {
      const pick = resolveIntervalPick(chartTimeframe)
      const show =
        !!pick &&
        pick.kind === 'tick' &&
        !!state.tvChart &&
        tvCandleBarsForTickMode().length >= 2 &&
        !!tickBarSeries?.bars.length
      tickLineOverlay?.setActive(show && !selectBarChartActive)
    }

    function syncTickLineOverlay(index: number) {
      if (state.tickReplayUnit !== 'tick' || !state.tvChart) return
      tickLineOverlay?.sync(index)
    }

    function isTickTvReplay(): boolean {
      return state.tickReplayUnit === 'tick' && !!state.tvChart
    }

    function isTickTvPickZone(_barIndex: number): boolean {
      return isTickTvReplay()
    }

    function refreshTickBarSeries(pick: IntervalPick, bars: Bar[]) {
      if (pick.kind !== 'tick') {
        tickBarSeries = null
        syncTickReplayUiFlags(pick)
        return
      }
      const tickN = pick.tickCount ?? 1
      const built = tickBarSeriesForInterval(tickChartData, tickN)
      tickBarSeries = built ? alignTickBarSeries(built, bars) : null
      syncTickReplayUiFlags(pick)
    }

    async function maybeExtendWindowedReplay(replayIndex: number) {
      if (!state.replay?.getState().playing) return
      if (
        tickWindowSlideBusy ||
        useFullSessionTicks ||
        !tickBarsWindowed ||
        tickChartData.kind !== 'dukascopy'
      ) {
        return
      }
      const pick = resolveIntervalPick(chartTimeframe)
      if (!pick || !intervalPickNeedsSubMinuteTicks(pick)) return
      if (replayIndex < chartBars.length - REPLAY_TICK_WINDOW_MARGIN) return

      if (pick.kind === 'tick') {
        void prefetchNextTickChunks()
        if (tickPrefetchBusy) return
      }

      const fullRange = sessionTickRangeSec(activeSession.startDate, activeSession.endDate)
      if (!fullRange) return

      const cursorBarIdx = Math.max(0, Math.min(chartBars.length - 1, replayIndex - 1))
      const anchorMs =
        pick.kind === 'tick'
          ? (tickTimeMsAtBar(
              tickBarSeries ?? {
                bars: chartBars,
                barToFirstTick: [],
                ticksPerBar: 1,
                quoteTicks: null,
              },
              cursorBarIdx,
            ) ?? Number(chartBars[cursorBarIdx]!.time) * 1000)
          : Number(chartBars[cursorBarIdx]!.time) * 1000
      const cursorSec = Math.floor(anchorMs / 1000)

      if (intervalPickIsSeconds(pick)) {
        const firstLoadedSec = Math.floor(Number(tickChartData.quoteTicks[0]!.timeMs) / 1000)
        const lastLoadedSec = Math.floor(
          Number(tickChartData.quoteTicks[tickChartData.quoteTicks.length - 1]!.timeMs) / 1000,
        )
        const edgeMarginSec = Math.max(30, (pick.stepSec ?? 10) * 3)
        if (cursorSec >= firstLoadedSec + edgeMarginSec && cursorSec <= lastLoadedSec - edgeMarginSec) {
          return
        }
      } else {
        const lastLoadedMs = Number(tickChartData.quoteTicks[tickChartData.quoteTicks.length - 1]!.timeMs)
        if (lastLoadedMs >= fullRange.endSec * 1000 - 500) return
      }

      const fetchRange = intervalPickIsSeconds(pick)
        ? windowedTickRangeSec(fullRange, cursorSec, SECONDS_REPLAY_WINDOW_SEC)
        : nextTickChunkRangeSec(
            fullRange,
            Math.floor(
              Number(tickChartData.quoteTicks[tickChartData.quoteTicks.length - 1]!.timeMs) / 1000,
            ),
            TICK_WINDOW_SEC,
          )
      if (!fetchRange) return

      tickWindowSlideBusy = true
      try {
        const series = await loadSessionTicks(currentChartSymbol, {
          startDate: activeSession.startDate,
          endDate: activeSession.endDate,
          startSec: fetchRange.startSec,
          endSec: fetchRange.endSec,
          maxTicks: intervalPickIsSeconds(pick)
            ? SECONDS_AGGREGATE_TICK_CAP
            : MAX_INTERVAL_TICK_BARS * 3,
        })
        if (!series?.ticks.length || state.disposed) return

        const merged = mergeQuoteTicksByTime(tickChartData.quoteTicks, series.ticks)
        tickChartData = dukascopyTickChartData(
          intervalPickIsSeconds(pick)
            ? sliceQuoteTicksAroundCursor(merged, cursorSec, SECONDS_AGGREGATE_TICK_CAP)
            : merged,
        )
        syncTickLoadedEndFromData()
        tickLoadedEndSec = Math.max(
          tickLoadedEndSec,
          fetchRange.endSec,
        )
        const nextBars = buildBarsForIntervalPick(pick, cursorSec)
        if (nextBars.length < 2) return
        const nextIndex =
          pick.kind === 'tick'
            ? Math.min(
                nextBars.length,
                barIndexForTickTimeMs(
                  tickBarSeries ?? tickBarSeriesForInterval(tickChartData, pick.tickCount ?? 1)!,
                  anchorMs,
                ) + 1,
              )
            : Math.max(1, Math.min(nextBars.length, barIndexAtOrBeforeTime(nextBars, cursorSec)))
        chartBars = nextBars
        if (state.tvChart) {
          const tvRes = intervalPillToTvResolution(chartTimeframe)
          const viewSnap = replayViewportLocked ? state.tvChart.captureLockedViewport() : null
          skipTvReplayPaintOnce = true
          const tvPast =
            pick.kind === 'tick'
              ? tvRevealCountFromTickReplayIndex(nextIndex)
              : nextIndex
          state.tvChart.swapInterval(tvBarsForChart(chartBars), tvRes, tvPast, viewSnap, {
            barPeriodSec: pick.kind === 'tick' ? 60 : intervalPickBarPeriodSec(pick),
            refit: false,
          })
          const wasPlaying = state.replay?.getState().playing ?? false
          replay.replaceBarsAt(chartBars, nextIndex)
          if (wasPlaying) state.replay?.play()
          skipTvReplayPaintOnce = false
        } else {
          const wasPlaying = state.replay?.getState().playing ?? false
          replay.replaceBarsAt(chartBars, nextIndex)
          if (wasPlaying) state.replay?.play()
        }
        if (pick.kind === 'tick') {
          void prefetchNextTickChunks()
        }
      } finally {
        tickWindowSlideBusy = false
      }
    }

    function syncTickLoadedEndFromData() {
      if (tickChartData.kind !== 'dukascopy' || !tickChartData.quoteTicks.length) {
        tickLoadedEndSec = 0
        return
      }
      tickLoadedEndSec = Math.floor(
        Number(tickChartData.quoteTicks[tickChartData.quoteTicks.length - 1]!.timeMs) / 1000,
      )
    }

    /**
     * After the first 10m chunk paints, keep fetching the next 10m pages in the
     * background until the session tick range is exhausted.
     */
    async function prefetchNextTickChunks() {
      if (
        tickPrefetchBusy ||
        useFullSessionTicks ||
        !tickBarsWindowed ||
        tickChartData.kind !== 'dukascopy' ||
        state.disposed
      ) {
        return
      }
      const pick = resolveIntervalPick(chartTimeframe)
      if (!pick || pick.kind !== 'tick') return

      const fullRange = sessionTickRangeSec(activeSession.startDate, activeSession.endDate)
      if (!fullRange) return
      if (tickLoadedEndSec <= 0) syncTickLoadedEndFromData()
      if (tickLoadedEndSec >= fullRange.endSec - 1) return

      const gen = ++tickPrefetchGen
      tickPrefetchBusy = true
      try {
        while (!state.disposed && gen === tickPrefetchGen && !useFullSessionTicks) {
          const chunk = nextTickChunkRangeSec(fullRange, tickLoadedEndSec, TICK_WINDOW_SEC)
          if (!chunk) break

          const series = await loadSessionTicks(currentChartSymbol, {
            startDate: activeSession.startDate,
            endDate: activeSession.endDate,
            startSec: chunk.startSec,
            endSec: chunk.endSec,
            maxTicks: MAX_INTERVAL_TICK_BARS * 3,
          })
          if (gen !== tickPrefetchGen || state.disposed) return
          if (!series?.ticks.length) {
            tickLoadedEndSec = chunk.endSec
            continue
          }
          if (tickChartData.kind !== 'dukascopy') return

          const merged = mergeQuoteTicksByTime(tickChartData.quoteTicks, series.ticks)
          tickChartData = dukascopyTickChartData(merged)
          syncTickLoadedEndFromData()
          tickLoadedEndSec = Math.max(tickLoadedEndSec, chunk.endSec)

          // Soft-merge into chart without stealing the user's viewport (tick mode only).
          const activePick = resolveIntervalPick(chartTimeframe)
          if (activePick?.kind === 'tick') {
            const slice = replay.slice()
            const cursorTimeSec = slice.length ? Number(slice[slice.length - 1]!.time) : null
            const nextBars = buildBarsForIntervalPick(activePick, cursorTimeSec)
            if (nextBars.length >= 2 && !state.replay?.getState().playing) {
              applyTickBarsToChart(nextBars, cursorTimeSec, { preserveViewport: true })
            }
          }

          if (tickLoadedEndSec >= fullRange.endSec - 1) {
            hideReplayNotice()
            showReplayNotice('Tick data loaded through session end.')
            break
          }
          await yieldToMain()
        }
      } finally {
        if (gen === tickPrefetchGen) tickPrefetchBusy = false
      }
    }

    function maybeShowWindowedTickNotice() {
      if (!tickBarsWindowed || useFullSessionTicks || !sessionTicksEligible()) {
        return
      }
      showReplayNoticeAction(
        '10-minute tick chunks — next pages load in the background while you replay.',
        'Load full session ticks',
        () => void loadFullSessionTicksProgressive(),
      )
    }

    function maybeShowWindowedSubMinuteNotice(pick: IntervalPick) {
      if (!tickBarsWindowed || useFullSessionTicks || !sessionTicksEligible()) {
        return
      }
      if (intervalPickIsSeconds(pick)) {
        showReplayNoticeAction(
          `${pick.pill} bars use a ${Math.max(1, Math.round(SECONDS_INITIAL_WINDOW_SEC / 60))}-minute tick window — more loads during replay.`,
          'Load full session ticks',
          () => void loadFullSessionTicksProgressive(),
        )
        return
      }
      maybeShowWindowedTickNotice()
    }

    function applyTickBarsToChart(
      nextBars: Bar[],
      cursorTimeSec: number | null,
      opts?: { preserveViewport?: boolean },
    ) {
      if (nextBars.length < 2) return
      const tvRes = intervalPillToTvResolution(chartTimeframe)
      const nextIndex = resolveTickReplayIndex(nextBars, cursorTimeSec, {
        enteringTicks: resolveIntervalPick(chartTimeframe)?.kind === 'tick',
        prevIndex: replay.getState().index,
        prevBarsLen: replay.getBars().length,
      })
      chartBars = nextBars
      const activePick = resolveIntervalPick(chartTimeframe)
      if (activePick) refreshTickBarSeries(activePick, nextBars)
      if (state.tvChart) {
        const viewSnap = opts?.preserveViewport ? state.tvChart.captureLockedViewport() : null
        skipTvReplayPaintOnce = true
        const tvSeries = tvBarsForChart(chartBars)
        const tvPast =
          activePick?.kind === 'tick'
            ? tvRevealCountFromTickReplayIndex(nextIndex)
            : nextIndex
        state.tvChart.swapInterval(tvSeries, tvRes, tvPast, viewSnap, {
          barPeriodSec: activePick
            ? activePick.kind === 'tick'
              ? 60
              : intervalPickBarPeriodSec(activePick)
            : 60,
        })
        replay.replaceBarsAt(chartBars, nextIndex)
        skipTvReplayPaintOnce = false
        if (viewSnap) {
          requestAnimationFrame(() => {
            void state.tvChart?.restoreVisibleRange(viewSnap)
          })
        }
      } else {
        replay.replaceBarsAt(chartBars, nextIndex)
      }
      state.redrawDrawings?.()
    }

    async function loadFullSessionTicksProgressive(): Promise<boolean> {
      if (!sessionTicksEligible()) return false
      const range = sessionTickRangeSec(activeSession.startDate, activeSession.endDate)
      if (!range) return false

      const gen = ++fullTickLoadGen
      useFullSessionTicks = true
      writeFullSessionTicks(true)
      tickBarsWindowed = false
      dukascopyTicksReady = false

      const accTicks: QuoteTick[] = []
      let truncated = false
      let overlayActive = false

      const showProgress = (loaded: number, done: boolean) => {
        if (!overlayActive) {
          setChartLoading(true, 'Loading full tick history…')
          overlayActive = true
        } else if (chartLoadingText) {
          chartLoadingText.textContent = done
            ? 'Finalizing tick chart…'
            : `Loading full tick history… ${loaded.toLocaleString()} ticks`
        }
      }

      try {
        showProgress(0, false)
        const series = await loadSessionTicks(currentChartSymbol, {
          startDate: activeSession.startDate,
          endDate: activeSession.endDate,
          startSec: range.startSec,
          endSec: range.endSec,
          noCache: true,
          maxTicks: DEFAULT_MAX_CHART_TICKS,
          onBatch: async (batch, info) => {
            if (gen !== fullTickLoadGen || state.disposed) return
            if (batch.length) accTicks.push(...batch)
            truncated = info.truncated
            if (!accTicks.length) return

            tickChartData = dukascopyTickChartData(accTicks)
            sourceTickBars = []
            dukascopyTicksReady = true

            const now = Date.now()
            const shouldPaint =
              info.done || now - lastTickChartPaintAt >= TICK_CHART_UPDATE_THROTTLE_MS
            if (!shouldPaint) return

            lastTickChartPaintAt = now
            const pick = resolveIntervalPick(chartTimeframe)
            if (!pick || !intervalPickNeedsSubMinuteTicks(pick)) return

            const slice = replay.slice()
            const cursorTimeSec = slice.length ? Number(slice[slice.length - 1]!.time) : null
            const nextBars = buildBarsForIntervalPick(pick, cursorTimeSec)
            if (nextBars.length < 2) return

            showProgress(info.total, info.done)
            applyTickBarsToChart(nextBars, cursorTimeSec, { preserveViewport: true })
            await yieldToMain()
          },
        })

        if (gen !== fullTickLoadGen || state.disposed) return false
        if (!series?.ticks.length) return false

        tickChartData = dukascopyTickChartData(series.ticks)
        dukascopyTicksReady = true
        tickBarsWindowed = false

        const pick = resolveIntervalPick(chartTimeframe)
        if (pick && intervalPickNeedsSubMinuteTicks(pick)) {
          const slice = replay.slice()
          const cursorTimeSec = slice.length ? Number(slice[slice.length - 1]!.time) : null
          const nextBars = buildBarsForIntervalPick(pick, cursorTimeSec)
          if (nextBars.length >= 2) {
            applyTickBarsToChart(nextBars, cursorTimeSec, { preserveViewport: true })
          }
        }

        if (truncated || series.truncated) {
          showReplayNotice(
            `Tick history capped at ${DEFAULT_MAX_CHART_TICKS.toLocaleString()} ticks for performance. Narrow the session date range for more.`,
          )
        } else {
          hideReplayNotice()
        }
        return true
      } finally {
        if (overlayActive) setChartLoading(false)
      }
    }

    function ensureSyntheticTickSource(): boolean {
      if (tickChartData.kind === 'synthetic' && tickChartData.pointBars.length >= 8) {
        sourceTickBars = tickChartData.pointBars
        return true
      }
      if (!canResample) return false
      const built = syntheticTickChartData(capped1mForSynthetic())
      tickChartData = built
      sourceTickBars = built.pointBars
      return sourceTickBars.length >= 8
    }

    let lastTickLoadFail: 'timeout' | 'empty' | 'range' | 'ineligible' | null = null

    async function ensureDukascopyTickSource(
      cursorTimeSec: number | null = null,
      opts?: {
        forceWindowed?: boolean
        windowSec?: number
        refreshWindow?: boolean
        timeoutMs?: number
        tvVisibleMidSec?: number | null
      },
    ): Promise<boolean> {
      lastTickLoadFail = null
      const wantFull = useFullSessionTicks && !opts?.forceWindowed
      if (
        !opts?.refreshWindow &&
        dukascopyTicksReady &&
        tickChartData.kind === 'dukascopy' &&
        (wantFull ? !tickBarsWindowed : true)
      ) {
        return tickChartData.quoteTicks.length >= 8
      }
      if (!sessionTicksEligible()) {
        lastTickLoadFail = 'ineligible'
        return false
      }

      if (wantFull) {
        tickLoadUsedProgressive = true
        return loadFullSessionTicksProgressive()
      }
      tickLoadUsedProgressive = false

      const fullRange = sessionTickRangeSec(activeSession.startDate, activeSession.endDate)
      if (!fullRange) {
        lastTickLoadFail = 'range'
        return false
      }
      const windowSec = opts?.windowSec ?? TICK_WINDOW_SEC
      const cursorCandidates = subMinuteTickCursorCandidates(
        fullRange,
        source1mBars,
        cursorTimeSec,
        opts?.tvVisibleMidSec ?? null,
      )
      const candidates =
        windowSec <= SECONDS_INITIAL_WINDOW_SEC
          ? cursorCandidates.slice(0, 2)
          : cursorCandidates
      const timeoutMs = opts?.timeoutMs ?? TICK_LOAD_TIMEOUT_MS
      const maxTicksForFetch =
        windowSec <= SECONDS_INITIAL_WINDOW_SEC ? SECONDS_AGGREGATE_TICK_CAP : MAX_INTERVAL_TICK_BARS * 3
      let series: Awaited<ReturnType<typeof loadSessionTicks>> = null

      for (const cursor of candidates) {
        const fetchRange = windowedTickRangeSec(fullRange, cursor, windowSec)
        if (fetchRange.endSec <= fetchRange.startSec) continue

        let timedOut = false
        const hit = await Promise.race([
          loadSessionTicks(currentChartSymbol, {
            startDate: activeSession.startDate,
            endDate: activeSession.endDate,
            startSec: fetchRange.startSec,
            endSec: fetchRange.endSec,
            maxTicks: maxTicksForFetch,
            noCache: opts?.refreshWindow === true,
          }),
          new Promise<null>((resolve) => {
            window.setTimeout(() => {
              timedOut = true
              resolve(null)
            }, timeoutMs)
          }),
        ])
        if (timedOut) {
          lastTickLoadFail = 'timeout'
          return false
        }
        if (hit?.ticks.length) {
          series = hit
          if (hit.ticks.length < 8) continue
          if (cursorTimeSec != null) {
            const firstSec = Math.floor(Number(hit.ticks[0]!.timeMs) / 1000)
            const lastSec = Math.floor(Number(hit.ticks[hit.ticks.length - 1]!.timeMs) / 1000)
            if (cursorTimeSec < firstSec || cursorTimeSec > lastSec) continue
          }
          break
        }
      }

      if (!series?.ticks.length) {
        lastTickLoadFail = 'empty'
        return false
      }
      tickChartData = dukascopyTickChartData(series.ticks)
      sourceTickBars = []
      dukascopyTicksReady = true
      tickBarsWindowed = true
      syncTickLoadedEndFromData()
      return series.ticks.length >= 8
    }

    function intervalPickIsTick(pick: IntervalPick): boolean {
      return pick.kind === 'tick'
    }

    /** Tick or sub-minute second bars are built from quote tick data. */
    function intervalPickNeedsSubMinuteTicks(pick: IntervalPick): boolean {
      if (pick.kind === 'tick') return true
      return (pick.stepSec ?? 60) < 60
    }

    function intervalPickIsSeconds(pick: IntervalPick): boolean {
      return pick.kind === 'time' && (pick.stepSec ?? 60) < 60
    }

    function tvBarPeriodSecForPill(pill: string): number {
      const pick = resolveIntervalPick(pill)
      return pick ? intervalPickBarPeriodSec(pick) : 60
    }

    function lwcTimeAxisOptsForInterval(pill: string) {
      const pick = resolveIntervalPick(pill)
      if (!intervalPickNeedsSecondsAxis(pick)) {
        return { timeAxisSecondsVisible: false as const, timeAxisUtcMinutes: 5 as const }
      }
      const step = pick!.kind === 'tick' ? 1 : (pick!.stepSec ?? 1)
      return {
        timeAxisSecondsVisible: true as const,
        subMinuteStepSec: step,
      }
    }

    function maybeShowTickIntervalNotices(pick: IntervalPick) {
      if (intervalPickIsTick(pick)) {
        if (tickBarsWindowed && !useFullSessionTicks && sessionTicksEligible()) {
          maybeShowWindowedTickNotice()
          return
        }
        const parts: string[] = []
        if (tvChartMode) {
          parts.push(
            'Tick replay uses synthetic ticks from 1m bars unless you load full Dukascopy ticks.',
          )
        }
        if (tickChartData.kind === 'synthetic') {
          parts.push('4 ticks per minute (O→H→L→C) — matches candle shape.')
        }
        if (parts.length) showReplayNotice(parts.join(' '))
        else hideReplayNotice()
        return
      }
      if (intervalPickIsSeconds(pick)) {
        if (localSecondIntervalPick(pick)) {
          hideReplayNotice()
          return
        }
        if (tickBarsWindowed && !useFullSessionTicks && sessionTicksEligible()) {
          maybeShowWindowedSubMinuteNotice(pick)
          return
        }
        if (tickChartData.kind !== 'dukascopy') {
          showReplayNotice('Sub-minute bars require Dukascopy tick data and session dates.')
        } else {
          hideReplayNotice()
        }
      }
    }

    function buildBarsForIntervalPick(pick: IntervalPick, cursorTimeSec: number | null = null): Bar[] {
      if (pick.kind === 'tick') {
        const tickN = pick.tickCount ?? 1
        let dataForBuild: TickChartData = tickChartData
        if (tickChartData.kind === 'dukascopy' && !useFullSessionTicks) {
          const estTicks = tickChartData.quoteTicks.length
          if (estTicks > MAX_INTERVAL_TICK_BARS * tickN) {
            const windowTicks = sliceQuoteTicksAroundCursor(
              tickChartData.quoteTicks,
              cursorTimeSec,
              MAX_INTERVAL_TICK_BARS * tickN,
            )
            dataForBuild = dukascopyTickChartData(windowTicks)
          }
        }
        const built = tickBarSeriesForInterval(dataForBuild, tickN)
        let tickOnly = built?.bars ?? barsForTickInterval(tickChartData, tickN)
        if (!useFullSessionTicks && tickOnly.length > MAX_INTERVAL_TICK_BARS) {
          tickOnly = capBarsAroundTime(tickOnly, cursorTimeSec, MAX_INTERVAL_TICK_BARS)
          tickBarsWindowed = true
        } else if (!useFullSessionTicks && tickChartData.kind === 'dukascopy') {
          tickBarsWindowed = true
        } else {
          tickBarsWindowed = false
        }
        // Replay series is ticks only — TV paints 1m candles separately.
        tickBarSeries = built ? alignTickBarSeries(built, tickOnly) : null
        syncTickReplayUiFlags(pick)
        return tickOnly
      }
      tickBarsWindowed = false
      tickBarSeries = null
      syncTickReplayUiFlags(pick)
      const step = pick.stepSec ?? 60
      if (step < 60) {
        if (isLocalSecondStep(step) && hasLocalSecondBars(step)) {
          tickBarsWindowed = false
          return sourceLocalSecondBars.get(step)!.slice()
        }
        const dataForBuild = tickChartDataForSecondsBuild(
          tickChartData,
          cursorTimeSec,
          useFullSessionTicks,
        )
        let secBars = barsForSubMinuteInterval(dataForBuild, step)
        if (!useFullSessionTicks && secBars.length > MAX_INTERVAL_TICK_BARS) {
          secBars = capBarsAroundTime(secBars, cursorTimeSec, MAX_INTERVAL_TICK_BARS)
          tickBarsWindowed = true
        } else if (tickChartData.kind === 'dukascopy' && !useFullSessionTicks) {
          tickBarsWindowed = true
        } else {
          tickBarsWindowed = false
        }
        return secBars
      }
      return step === 60 ? source1mBars.slice() : aggregateOHLCV(source1mBars, step)
    }

    async function applyPreferredChartInterval(atBoot = false) {
      const minBars = atBoot ? MIN_BOOT_CHART_BARS : 2
      const preferred = readDefaultChartInterval()
      const pick = resolveIntervalPick(preferred)
      if (!pick) {
        chartTimeframe = '1m'
        chartBars = source1mBars.slice()
        return
      }
      if (intervalPickNeedsSubMinuteTicks(pick)) {
        if (atBoot) {
          chartTimeframe = '1m'
          chartBars = source1mBars.slice()
          return
        }
        if (!sessionTicksEligible()) {
          chartTimeframe = '1m'
          chartBars = source1mBars.slice()
          return
        }
        if (localSecondIntervalPick(pick)) {
          const nextBars = buildBarsForIntervalPick(pick)
          if (nextBars.length >= minBars) {
            chartTimeframe = pick.pill
            chartBars = nextBars
          } else {
            chartTimeframe = '1m'
            chartBars = source1mBars.slice()
          }
          return
        }
        const ok = await ensureDukascopyTickSource()
        if (!ok) {
          chartTimeframe = '1m'
          chartBars = source1mBars.slice()
          return
        }
        const nextBars = buildBarsForIntervalPick(pick)
        if (nextBars.length >= minBars) {
          chartTimeframe = pick.pill
          chartBars = nextBars
        } else {
          chartTimeframe = '1m'
          chartBars = source1mBars.slice()
        }
        return
      }
      if (!canResample || preferred === '1m') {
        chartTimeframe = '1m'
        chartBars = source1mBars.slice()
        return
      }
      const step = pick.stepSec ?? 60
      if (step < 60) {
        chartTimeframe = '1m'
        chartBars = source1mBars.slice()
        return
      }
      const nextBars = step === 60 ? source1mBars.slice() : aggregateOHLCV(source1mBars, step)
      if (nextBars.length >= minBars) {
        chartTimeframe = pick.pill
        chartBars = nextBars
      } else {
        chartTimeframe = '1m'
        chartBars = source1mBars.slice()
      }
    }

    /** Pre-load local second bars when default interval is synced locally. */
    if (sessionTicksEligible()) {
      await Promise.race([
        preloadLocalSecondBarsForPick(resolveIntervalPick(readDefaultChartInterval())),
        new Promise<void>((resolve) => window.setTimeout(resolve, 8_000)),
      ])
    }

    /** Apply user default interval at boot (minute+ only — tick/sub-minute load lazily on pick). */
    if (canResample) {
      await applyPreferredChartInterval(true)
      sessionReplayStartIndex = sessionStartReplayIndex(chartBars, activeSession.startDate)
    }

    function computeInitialVisibleForBars(bars: Bar[]) {
      const pick = resolveIntervalPick(chartTimeframe)
      if (pick?.kind === 'tick') {
        return Math.min(150, Math.max(60, bars.length))
      }
      if (pick && intervalPickIsSeconds(pick)) {
        const step = pick.stepSec ?? 1
        const target = step <= 1 ? 300 : step <= 5 ? 180 : 120
        return Math.min(target, Math.max(60, bars.length))
      }
      if (intervalPickNeedsSecondsAxis(pick)) {
        return Math.min(200, Math.max(60, bars.length))
      }
      if (chartTimeframe === '1m' || inferTimeframeFromBars(bars) === '1m') {
        return Math.min(TV_1M_DEFAULT_VISIBLE_BARS, Math.max(2, bars.length))
      }
      return undefined
    }
    intervalPill.textContent = chartTimeframe
    if (replayDockTf) replayDockTf.textContent = chartTimeframe

    const replayAccount = createReplayAccount(initialCash, restoredReplay?.account ?? null)
    let positionOverlay: ReturnType<typeof mountChartPositionOverlay> | null = null
    let tickLineOverlay: TickLineOverlayHandle | null = null
    let journalHighlightTrade: number | undefined
    let persistReplayTimer: ReturnType<typeof setTimeout> | null = null
    let persistPropTimer: ReturnType<typeof setTimeout> | null = null

    const propRules = normalizePropRules(activeSession.propRules ?? opts?.propRules)
    let propState: PropChallengeState =
      opts?.propResult ?? createInitialPropState(initialCash)
    let propTradingAllowed = activeSession.sessionType !== 'prop' || propState.status === 'active'

    function flushPersistProp() {
      if (persistPropTimer) {
        clearTimeout(persistPropTimer)
        persistPropTimer = null
      }
      if (activeSession.sessionType === 'prop') {
        opts?.onPropStateChange?.(propState)
      }
    }

    function schedulePersistProp() {
      if (!opts?.onPropStateChange || activeSession.sessionType !== 'prop') return
      if (persistPropTimer) clearTimeout(persistPropTimer)
      persistPropTimer = setTimeout(flushPersistProp, 400)
    }

    cleanupFns.push(() => flushPersistProp())

    function evaluatePropIfNeeded(b: Bar | null): boolean {
      if (activeSession.sessionType !== 'prop') {
        if (propBannerEl) {
          propBannerEl.hidden = true
          propBannerEl.innerHTML = ''
        }
        propTradingAllowed = true
        return true
      }

      const mark = b?.close ?? 0
      const barTime = b ? Number(b.time) : Math.floor(Date.now() / 1000)
      const ba = b ? bidAskFromBar(b) : undefined
      const equity = replayAccount.summary(mark, ba).equity
      const prevStatus = propState.status
      const result = evaluatePropChallenge({
        rules: propRules,
        state: propState,
        equity,
        barTimeSec: barTime,
      })
      propState = result.state
      if (propBannerEl) renderPropBanner(propBannerEl, result.eval)

      if (prevStatus === 'active' && propState.status !== 'active') {
        replay.pause()
        syncPlayBtnPaused()
        propTradingAllowed = false
        showReplayNotice(
          propState.status === 'passed'
            ? 'Prop challenge passed — replay paused. Reset account in Journal to try again.'
            : 'Prop challenge failed — replay paused. Reset account in Journal to try again.',
        )
        flushPersistProp()
      } else {
        propTradingAllowed = propState.status === 'active'
        if (prevStatus !== propState.status) flushPersistProp()
        else schedulePersistProp()
      }
      return propTradingAllowed
    }

    function buildReplaySnapshot(): SessionReplaySnapshot {
      let replayBarIndex = state.replay?.getState().index
      if (replayBarIndex != null && isDecoupledReplay()) {
        const paint = decoupledReplayPaint(replayBarIndex)
        if (paint?.display.length) replayBarIndex = paint.display.length
      }
      return {
        account: replayAccount.getPersisted(),
        replayBarIndex,
        savedAt: Date.now(),
      }
    }

    function flushPersistReplay() {
      if (persistReplayTimer) {
        clearTimeout(persistReplayTimer)
        persistReplayTimer = null
      }
      opts?.onReplayStateChange?.(buildReplaySnapshot())
    }

    function schedulePersistReplay() {
      if (!opts?.onReplayStateChange) return
      if (persistReplayTimer) clearTimeout(persistReplayTimer)
      persistReplayTimer = setTimeout(flushPersistReplay, 400)
    }

    cleanupFns.push(() => flushPersistReplay())

    function renderJournalPanel(markPrice: number) {
      const b = lastBar(replay.slice())
      const ba = b ? bidAskFromBar(b) : undefined
      const sum = replayAccount.summary(markPrice, ba)
      const trades = replayAccount.getClosedTrades()
      if (journalStatsEl) {
        renderReplayJournalStats(journalStatsEl, {
          initialCash,
          equity: sum.equity,
          realizedPnL: sum.realizedPnL,
          unrealizedPnL: sum.unrealizedPnL,
          closedTrades: trades,
        })
      }
      if (journalTradesEl) {
        renderReplayJournal(journalTradesEl, trades, {
          fmtPrice: formatSessionPrice,
          highlightTradeNum: journalHighlightTrade,
        })
      }
      if (btnJournalExport) btnJournalExport.hidden = !trades.length
    }

    function renderManualPositionPanel(markPrice: number) {
      if (!sessionPositionEl || backtestState.result) return
      const positions = replayAccount.getPositions()
      if (!positions.length) {
        sessionPositionEl.innerHTML =
          '<p class="rw-session-empty">Use <strong>Buy</strong> or <strong>Sell</strong> to open a position.</p>'
        return
      }
      const b = lastBar(replay.slice())
      const ba = b ? bidAskFromBar(b) : null
      sessionPositionEl.innerHTML = positions
        .map((p) => {
          const mark = ba ? positionMarkPrice(p.direction, ba.bid, ba.ask) : markPrice
          const pnl = positionUnrealized(p, mark)
          const up = pnl >= 0
          return `<div class="rw-manual-pos">
            <span class="rw-manual-pos__dir rw-manual-pos__dir--${p.direction}">${p.direction === 'long' ? 'Long' : 'Short'}</span>
            <span>${p.qty} @ ${formatSessionPrice(p.entryPrice)}</span>
            <span class="rw-manual-pos__pnl${up ? ' rw-manual-pos__pnl--up' : ' rw-manual-pos__pnl--down'}">${formatMoney(pnl)}</span>
            <button type="button" class="rw-manual-pos__close" data-rw-close-pos="${p.id}" title="Close position">Close</button>
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

    function positionLineColor(
      pos: { direction: 'long' | 'short'; entryPrice: number; qty: number },
      mark: number,
    ) {
      const pnl =
        pos.direction === 'long'
          ? (mark - pos.entryPrice) * pos.qty
          : (pos.entryPrice - mark) * pos.qty
      if (!Number.isFinite(pnl) || Math.abs(pnl) < 1e-9) return '#787b86'
      return pnl > 0 ? '#2962ff' : '#e65100'
    }

    function syncPositionOverlay(recreateLines = true) {
      state.trading?.setPositionPriceHints(positionPriceHints())
      const positions = replayAccount.getPositions()
      const b = lastBar(replay.slice())
      const markMid = b?.close ?? 0
      const ba = b ? bidAskFromBar(b) : null
      const usedTvShapes =
        state.tvChart?.syncReplayPositions(
          positions.map((p) => {
            const mark = ba ? positionMarkPrice(p.direction, ba.bid, ba.ask) : markMid
            return {
              id: p.id,
              direction: p.direction,
              qty: p.qty,
              entryPrice: p.entryPrice,
              entryTime: p.entryTime,
              takeProfit: p.takeProfit,
              stopLoss: p.stopLoss,
              lineColor: positionLineColor(p, mark),
            }
          }),
          {
            onClose: (id) => {
              const bar = lastBar(replay.slice())
              if (!bar) return
              const { bid, ask } = bidAskFromBar(bar)
              const pos = replayAccount.getPositions().find((x) => x.id === id)
              if (!pos) return
              replayAccount.closePosition(id, pos.direction === 'long' ? bid : ask, {
                exitTime: Number(bar.time),
                exitReason: 'manual',
              })
              schedulePersistReplay()
              syncTradingUi(bar)
            },
            formatPnl: (id) => {
              const pos = replayAccount.getPositions().find((x) => x.id === id)
              if (!pos) return ''
              const mark = ba ? positionMarkPrice(pos.direction, ba.bid, ba.ask) : markMid
              const pnl = positionUnrealized(pos, mark)
              const pts = positionPoints(pos, mark)
              const ptsLabel = String(Math.abs(Math.round(pts))).padStart(3, '0')
              const pnlSigned = pnl < 0 ? `-${Math.abs(pnl).toFixed(2)}` : Math.abs(pnl).toFixed(2)
              return `${ptsLabel}→${pnlSigned} USD`
            },
          },
        ) === true
      // TV shapes own the dashed BUY/SELL lines (candle-accurate). Keep DOM badges only.
      positionOverlay?.setSkipDomLines(usedTvShapes)
      positionOverlay?.setSuppressed(false)
      positionOverlay?.sync({ recreateLines: recreateLines && !usedTvShapes })
    }

    function syncTradingUi(b: Bar | null) {
      const mark = b?.close ?? 0
      const ba = b ? bidAskFromBar(b) : undefined
      let accountChanged = false
      if (b) {
        const { bid, ask } = bidAskFromBar(b)
        const closed = replayAccount.processExits(Number(b.time), mark, bid, ask)
        if (closed.length) accountChanged = true
      }
      const sum = replayAccount.summary(mark, ba)
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
      renderJournalPanel(mark)
      syncOrderPanelPosition()
      // Prefer soft sync — full recreate only when chart series revision changes.
      syncPositionOverlay(false)
      if (accountChanged) schedulePersistReplay()
      evaluatePropIfNeeded(b)
    }

    let trading: ReturnType<typeof createTradingChart> | null = null
    let chartCursorUi: ReturnType<typeof mountChartCursorUi> | null = null
    let tvBootBarsApplied = false
    let tvBootPaintDone = false
    const tvIntervalSwap = { inProgress: false }
    let intervalPickBusy = false
    /** TV header changed while applyIntervalPick was busy — apply after current swap. */
    let pendingTvHeaderIntervalPick: IntervalPick | null = null

    const setFootRangeActive = (label: string) => {
      host.querySelectorAll('.rw-foot__range').forEach((b) => {
        const el = b as HTMLElement
        el.classList.toggle('rw-foot__range--active', el.dataset.footRange === label)
      })
    }

    let useLightweightChart = true

    if (tvChartMode) {
      rwRoot.classList.add('rw-root--tv')
      chartHost.classList.add('rw-chart-host--tv')
      chartCanvas.classList.add('rw-chart-canvas--tv')
      chartTv.hidden = false
      await Promise.all([
        waitForChartHostLayout(chartCanvas, () => state.disposed),
        waitForChartHostLayout(chartHost, () => state.disposed),
      ])
      if (state.disposed) {
        await endBootLoading(true)
        return
      }
      await preloadTradingViewScript().catch((err) => {
        console.warn('[ChartBoot] TV script preload', err)
      })
      if (state.disposed) {
        await endBootLoading(true)
        return
      }
      const { startSec, endSec } = sessionDateRangeSec(activeSession.startDate, activeSession.endDate)
      try {
        state.tvChart = await createTradingViewChart(chartTv, {
          symbol: formatDisplaySymbol(currentChartSymbol),
          resolution: intervalPillToTvResolution(chartTimeframe),
          theme: uiChartTheme === 'dark' ? 'dark' : 'light',
          dataSource: series.dataSource,
          sessionStartSec: startSec,
          sessionEndSec: endSec,
          lazyFetchBars: (req) => sessionLazyFetchRef.fn?.(req) ?? Promise.resolve(false),
          initialSessionBars: {
            bars: tvBarsForChart(chartBars),
            resolution: intervalPillToTvResolution(chartTimeframe),
            barPeriodSec: tvBarPeriodSecForPill(chartTimeframe),
          },
          intervalSwapRef: tvIntervalSwap,
          onSymbolChange: (symbol) => {
            const next = symbol.trim().toUpperCase()
            if (next && next !== currentChartSymbol.trim().toUpperCase()) {
              applySymbolPick(next)
            }
          },
          onResolutionChange: (tvRes) => {
            const pick = tvResolutionToIntervalPill(tvRes)
            if (!pick || pick.pill === chartTimeframe) return
            state.tvChart?.noteResolution(tvRes)
            if (intervalPickBusy || tvIntervalSwap.inProgress) {
              // TV already switched — queue so we don't leave feed on the old TF (blank/stuck).
              pendingTvHeaderIntervalPick = pick
              return
            }
            void applyIntervalPick(pick)
          },
        })
        state.tvChart.setSessionBars(
          tvBarsForChart(chartBars),
          intervalPillToTvResolution(chartTimeframe),
          tvBarPeriodSecForPill(chartTimeframe),
          { deferRefresh: true },
        )
        state.tvChart.setHistoricalAnchorIndex(Math.max(0, sessionReplayStartIndex - 1))
        tvBootBarsApplied = true
        hideReplayNotice()
        const tvBootSafetyTimer = window.setTimeout(() => {
          if (state.disposed || !tvChartMode || tvBootPaintDone) return
          console.warn('[ChartBoot] TradingView slow — revealing Lightweight Charts under TV')
          void revealLightweightChartFallback('TradingView boot timed out')
        }, 18_000)
        cleanupFns.push(() => window.clearTimeout(tvBootSafetyTimer))
      } catch (err) {
        console.error('[TradingView]', err)
        tvChartMode = false
        useLightweightChart = true
        state.tvChart?.dispose()
        state.tvChart = null
        chartTv.hidden = true
        chartHost.classList.remove('rw-chart-host--tv')
        chartCanvas.classList.remove('rw-chart-canvas--tv')
        rwRoot.classList.remove('rw-root--tv')
        const detail = err instanceof Error ? err.message : String(err)
        showReplayNotice(
          detail.includes('timeout') || detail.includes('unavailable')
            ? `TradingView chart unavailable (${detail}) — using Lightweight Charts.`
            : `TradingView chart unavailable — using Lightweight Charts. ${detail} Run npm run tv:sync if the charting_library bundle is missing.`,
        )
      }
      if (tvChartMode) {
      cleanupFns.push(() => {
        state.tvChart?.dispose()
        state.tvChart = null
        chartTv.hidden = true
        chartHost.classList.remove('rw-chart-host--tv')
        chartCanvas.classList.remove('rw-chart-canvas--tv')
        rwRoot.classList.remove('rw-root--tv')
      })
      void state.tvChart?.whenChartReady().then(() => {
        if (state.disposed) return
        bindTvOverlayObserver()
      })
      /* Iframe may appear slightly after ready — retry bind a few times. */
      window.setTimeout(() => {
        if (!state.disposed) bindTvOverlayObserver()
      }, 800)
      window.setTimeout(() => {
        if (!state.disposed) bindTvOverlayObserver()
      }, 2000)
      }
    }

    if (useLightweightChart) {
    trading = createTradingChart(chartLwc, {
      theme: tradingThemeFromUi(uiChartTheme),
      timeAxisUtcMinutes: 5,
      tenMinuteUtcShading: true,
    })
    state.trading = trading
    if (state.disposed) {
      trading.dispose()
      state.trading = null
      await endBootLoading(true)
      return
    }

    indicatorMgr = createChartIndicatorManager({ chart: trading.chart })
    if (activeChartIndicators.length) {
      indicatorMgr.restore(activeChartIndicators)
      paintIndicatorBar()
    }
    cleanupFns.push(() => {
      indicatorMgr?.dispose()
      indicatorMgr = null
    })

    chartCursorUi = mountChartCursorUi({
      chartHost,
      isBlocked: () => selectBarChartActive,
    })
    cleanupFns.push(() => chartCursorUi?.dispose())

    const navHandlers: Array<{ el: Element; fn: () => void }> = []
    host.querySelectorAll('[data-chart-nav]').forEach((btn) => {
      const fn = () => {
        const act = (btn as HTMLElement).dataset.chartNav
        if (act === 'zoom-in') trading!.zoomLogicalRange(0.78)
        else if (act === 'zoom-out') trading!.zoomLogicalRange(1.32)
        else if (act === 'left' || act === 'right') {
          const r = trading!.chart.timeScale().getVisibleLogicalRange()
          if (!r) return
          const span = Math.max(r.to - r.from, 4)
          const delta = Math.max(1, span * 0.22) * (act === 'left' ? -1 : 1)
          trading!.panLogicalRange(delta)
        } else if (act === 'refresh') trading!.resetTimeScaleView()
      }
      btn.addEventListener('click', fn)
      navHandlers.push({ el: btn, fn })
    })
    cleanupFns.push(() => navHandlers.forEach(({ el, fn }) => el.removeEventListener('click', fn)))

    const footRangeCleanups: Array<() => void> = []
    host.querySelectorAll<HTMLButtonElement>('.rw-foot__range').forEach((btn) => {
      const label = btn.dataset.footRange as FootRangeLabel | undefined
      if (!label) return
      const onFoot = () => {
        applyChartFootRange(label, chartBars, trading!)
        setFootRangeActive(label)
        trading!.repaintTimeShades()
      }
      btn.addEventListener('click', onFoot)
      footRangeCleanups.push(() => btn.removeEventListener('click', onFoot))
    })
    cleanupFns.push(() => footRangeCleanups.forEach((f) => f()))
    } /* end useLightweightChart */

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
      if (i1 < i0 || !trading) return
      const span = Math.max(8, i1 - i0)
      const pad = Math.max(2, Math.floor(span * 0.15))
      const from = Math.max(0, i0 - pad) as Logical
      const to = Math.min(chartBars.length - 1, i1 + pad) as Logical
      trading.chart.timeScale().setVisibleLogicalRange({ from, to })
      trading.repaintTimeShades()
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
    if (trading) {
    const lwcChart = trading
    const chartTypeMenu = createChartTypeMenu({
      anchor: btnChartType,
      getSelected: () => lwcChart.getVisualKind(),
      onSelect: (kind) => {
        if (lwcChart.setVisualKind(kind)) chartTypeMenu.syncActive()
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
    } else {
      btnChartType.disabled = true
      btnChartType.title = 'Chart type is controlled by TradingView'
    }

    const legendTitle = () =>
      `${formatLegendSymbol(currentChartSymbol, currentFullName)} · ${legendTimeframeLabel(chartTimeframe)} · ${legendPlatformFeed(feedLabel)}`

    let legendRefs: ChartLegendOhlcRefs | null = null
    let legendLastSlice: Bar[] = []
    let legendHoverActive = false
    let marketStatusPopup: ReturnType<typeof mountChartMarketStatusPopup> | null = null

    function ensureLegendRefs(): ChartLegendOhlcRefs | null {
      if (tvChartMode || !subbarHeadEl) return null
      if (!legendRefs || !subbarHeadEl.querySelector('[data-rw-legend-title]')) {
        legendRefs = mountChartLegendOhlc(subbarHeadEl)
        if (!marketStatusPopup) {
          marketStatusPopup = mountChartMarketStatusPopup({
            getAnchor: () => legendRefs!.statusBtn,
            getSymbol: () => currentChartSymbol,
          })
          const onMarketStatusClick = (e: MouseEvent) => {
            e.stopPropagation()
            marketStatusPopup?.toggle()
          }
          legendRefs.statusBtn.addEventListener('click', onMarketStatusClick)
          cleanupFns.push(() => {
            legendRefs?.statusBtn.removeEventListener('click', onMarketStatusClick)
            marketStatusPopup?.dispose()
            marketStatusPopup = null
          })
        }
      }
      return legendRefs
    }

    function paintLegendBar(b: Bar | null, prev: Bar | null, opts?: { syncPanels?: boolean }) {
      if (tvChartMode) {
        if (opts?.syncPanels === false) return
        syncTradingUi(b)
        updateRightPanel(b, prev)
        return
      }
      const refs = ensureLegendRefs()
      if (!refs) return
      updateChartLegendOhlc(refs, {
        title: legendTitle(),
        bar: b,
        fmtPrice: formatSessionPrice,
      })
      updateChartLegendMarketStatus(refs, currentChartSymbol)
      marketStatusPopup?.refresh()
      chartVolEl.innerHTML = ''
      if (opts?.syncPanels === false) return
      syncTradingUi(b)
      updateRightPanel(b, prev)
    }

    function updateLegend(slice: Bar[]) {
      legendLastSlice = slice
      if (legendHoverActive) return
      const b = lastBar(slice)
      const prev = slice.length >= 2 ? slice[slice.length - 2]! : null
      paintLegendBar(b, prev)
    }

    function resetLegendHover() {
      if (!legendHoverActive) return
      legendHoverActive = false
      const b = lastBar(legendLastSlice)
      const prev = legendLastSlice.length >= 2 ? legendLastSlice[legendLastSlice.length - 2]! : null
      paintLegendBar(b, prev)
    }

    let firstChartPaint = true
    let deferTvChartPaint = tvChartMode
    let paintedWithNonZeroHost = false
    let nextReplayTickFit: boolean | undefined
    let nextReplayTickForce: boolean | undefined
    /** Replay dock step change only — keep chart pan/zoom (TV header interval unchanged). */
    let nextReplayTickDecoupledStepOnly = false
    /** Manual replay step (fwd/back) while paused — keep chart pan/zoom. */
    let nextReplayTickStepPreserve = false
    let nextReplayTickChartViewSnap: TvLockedViewport | null = null
    /** TV feed already primed in applyReplayIntervalPick — skip duplicate sync on next tick. */
    let nextReplayTickDecoupledFeedPrimed = false
    /** Force one chart reload when entering playback (truncated feed after full session). */
    let replayPlayKickoff = false
    /** After bar-cut, keep chart pan/zoom fixed through playback. */
    let replayViewportLocked = false
    let lockedTvViewport: TvLockedViewport | null = null
    let pendingTvViewportRestore: TvLockedViewport | null = null
    /** User panned/zoomed the chart — preserve that viewport instead of auto-scrolling to the cursor. */
    let userViewportPinned = false
    /** Ignore time-scale events fired by our own viewport restores. */
    let suppressUserViewportPin = 0

    function withSuppressedViewportPin(fn: () => void) {
      suppressUserViewportPin++
      try {
        fn()
      } finally {
        requestAnimationFrame(() => {
          suppressUserViewportPin = Math.max(0, suppressUserViewportPin - 1)
        })
      }
    }

    async function restoreTvViewport(snap: TvLockedViewport) {
      if (!state.tvChart) return
      withSuppressedViewportPin(() => {
        void state.tvChart!.restoreVisibleRange(snap)
      })
    }

    function ensureReplayStepSourceBarsCached(replayPick: IntervalPick) {
      if (!isSubMinuteReplayPick(replayPick) || replayStepSourceBars.length >= 2) return
      const step = replayPick.stepSec ?? 10
      if (hasLocalSecondBars(step)) {
        replayStepSourceBars = sourceLocalSecondBars.get(step)!.slice()
        return
      }
      const secBars = barsForSubMinuteInterval(tickChartData, step)
      if (secBars.length >= 2) replayStepSourceBars = secBars
    }

    function isDecoupledReplay(): boolean {
      if (chartTimeframe === replayTimeframe) return false
      const chartPick = resolveIntervalPick(chartTimeframe)
      const replayPick = resolveIntervalPick(replayTimeframe)
      return !!(chartPick && replayPick && canDecoupleReplay(chartPick, replayPick))
    }

    /** Prime or paint TV chart-interval bars while replay transport uses a different step. */
    function syncDecoupledTvFeed(
      index: number,
      mode: 'prime' | 'paint' = 'prime',
      restoreVisibleRange?: TvLockedViewport | null,
      paintOpts?: { forceFull?: boolean },
    ): boolean {
      if (!state.tvChart || !isDecoupledReplay()) return false
      if (mode === 'paint') {
        if (paintOpts?.forceFull) {
          return paintDecoupledReplayStepChange(index, restoreVisibleRange, { forceFull: true })
        }
        return paintDecoupledReplayStepChange(index, restoreVisibleRange)
      }
      const paint = decoupledReplayPaint(index)
      if (!paint?.display.length) return false
      const chartPick = resolveIntervalPick(chartTimeframe)
      if (!chartPick) return false
      const tvRes = intervalPillToTvResolution(chartTimeframe)
      state.tvChart.noteResolution(tvRes)
      state.tvChart.primeIntervalFeed(
        tvBarsForChart(paint.all),
        tvRes,
        paint.display.length,
        intervalPickBarPeriodSec(chartPick),
      )
      return true
    }

    function decoupledReplayPaintWithStepBars(
      stepBars: Bar[],
      index: number,
      replayPick: IntervalPick,
    ): { all: Bar[]; display: Bar[] } | null {
      const chartPick = resolveIntervalPick(chartTimeframe)
      if (!chartPick || !canDecoupleReplay(chartPick, replayPick)) return null
      ensureReplayStepSourceBarsCached(replayPick)
      const replayStepSec = effectiveReplayStepSec(stepBars, replayPick.stepSec ?? 60)
      const cursorEndSec = cursorEndSecForStepIndex(stepBars, replayStepSec, index)
      const subMinute = isSubMinuteReplayPick(replayPick)
      const fineBars =
        replayStepSourceBars.length >= 2
          ? replayStepSourceBars
          : subMinute && stepBars.length >= 2
            ? stepBars
            : undefined
      const useFine = subMinute && fineBars != null && fineBars.length >= 2
      return decoupledChartReplayDisplay({
        chartBars,
        source1mBars,
        chartStepSec: chartPick.stepSec ?? 60,
        cursorEndSec,
        sourceFineBars: useFine ? fineBars : undefined,
        fineStepSec: useFine ? replayStepSec : undefined,
      })
    }

    function decoupledReplayPaint(index: number): { all: Bar[]; display: Bar[] } | null {
      if (!isDecoupledReplay()) return null
      const replayPick = resolveIntervalPick(replayTimeframe)
      if (!replayPick) return null
      return decoupledReplayPaintWithStepBars(replay.getBars(), index, replayPick)
    }

    let decoupledLegendStep = -1
    let decoupledLegendBarCount = -1

    function lockChartViewport(snap: TvLockedViewport | null) {
      if (!snap) return
      replayViewportLocked = true
      lockedTvViewport = snap
      pendingTvViewportRestore = snap
      state.tvChart?.setReplayLockedViewport(snap)
    }

    function restoreChartViewportSoon(snap: TvLockedViewport | null) {
      if (!snap || !state.tvChart) return
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void state.tvChart?.restoreVisibleRange(snap)
        })
      })
    }

    /**
     * Decoupled replay step change (any chart TF + any replay step) without re-priming the feed.
     * Skips primeIntervalFeed so TV bar spacing / candle width stay unchanged.
     */
    function paintDecoupledReplayStepChange(
      index: number,
      viewSnap: TvLockedViewport | null | undefined,
      opts?: { forceFull?: boolean; playing?: boolean },
    ): boolean {
      if (!state.tvChart || !isDecoupledReplay()) return false
      const paint = decoupledReplayPaint(index)
      if (!paint?.display.length) return false
      const chartPick = resolveIntervalPick(chartTimeframe)
      if (!chartPick) return false
      const tvRes = intervalPillToTvResolution(chartTimeframe)
      const tvDisplay = tvBarsForChart(paint.display)
      const tvAll = tvBarsForChart(paint.all)
      const playing = opts?.playing ?? (state.replay?.getState().playing ?? false)
      state.tvChart.noteResolution(tvRes)
      const viewOpts = {
        decoupled: true as const,
        preserveViewport: true as const,
        fit: false as const,
        playing,
        ...(viewSnap ? { restoreVisibleRange: viewSnap } : {}),
      }
      if (opts?.forceFull) {
        state.tvChart.primeIntervalFeed(
          tvAll,
          tvRes,
          paint.display.length,
          intervalPickBarPeriodSec(chartPick),
        )
        state.tvChart.setReplayData(tvDisplay, tvAll, {
          ...viewOpts,
          force: true,
        })
        state.tvChart.flushPendingRefresh()
      } else {
        state.tvChart.setReplayData(tvDisplay, tvAll, {
          ...viewOpts,
          force: false,
          decoupledStepOnly: true,
        })
      }
      restoreChartViewportSoon(viewSnap ?? null)
      return true
    }

    function pinChartViewportForReplay() {
      const snap =
        state.tvChart?.captureLockedViewport() ??
        lockedTvViewport ??
        state.tvChart?.getReplayLockedViewport() ??
        null
      if (!snap) return
      lockChartViewport(snap)
      state.tvChart?.notifyUserPlaybackPan(tvBarPeriodSecForPill(chartTimeframe))
    }

    function onReplayTick(slice: Bar[], index: number) {
      if (selectBarChartActive) return
      const decoupled = decoupledReplayPaint(index)
      const allBars = decoupled?.all ?? replay.getBars()
      const showFullSession =
        !decoupled && index >= allBars.length && slice.length === allBars.length
      const displayBars = decoupled?.display ?? (showFullSession ? allBars : slice)
      const fitChart =
        nextReplayTickFit === true && !replayViewportLocked && showFullSession && !decoupled
      const wasPlayKickoff = replayPlayKickoff
      const decoupledStepOnly = nextReplayTickDecoupledStepOnly
      const stepPreserve = nextReplayTickStepPreserve
      const viewStepOnly = decoupledStepOnly || stepPreserve
      const chartViewSnap = nextReplayTickChartViewSnap
      nextReplayTickDecoupledStepOnly = false
      nextReplayTickStepPreserve = false
      nextReplayTickChartViewSnap = null
      const forceChart =
        !viewStepOnly &&
        !replayViewportLocked &&
        (nextReplayTickForce === true || nextReplayTickFit === true)
      const replayPlaying = state.replay?.getState().playing ?? false
      nextReplayTickFit = undefined
      nextReplayTickForce = undefined
      if (replayPlayKickoff) replayPlayKickoff = false
      let restoreRange: TvLockedViewport | undefined
      if (replayViewportLocked) {
        if (!replayPlaying && pendingTvViewportRestore) {
          restoreRange = pendingTvViewportRestore
          pendingTvViewportRestore = null
        } else if (lockedTvViewport) {
          restoreRange = lockedTvViewport
        }
      }
      if (state.trading) {
        const paintOpts = {
          fit: fitChart && !replayViewportLocked && !viewStepOnly,
          initialVisibleBarCount: firstChartPaint ? computeInitialVisibleForBars(allBars) : undefined,
          initialVisibleAnchor: 'end' as const,
          preserveViewport: replayViewportLocked || (viewStepOnly && chartViewSnap != null),
          ...lwcTimeAxisOptsForInterval(chartTimeframe),
        }
        state.trading.setReplayData(displayBars, allBars, paintOpts)
        if (!tvChartMode) firstChartPaint = false
      }
      if (state.tvChart && tvChartMode) {
        if (!deferTvChartPaint && !skipTvReplayPaintOnce) {
          const tickTvCandles =
            state.tickReplayUnit === 'tick' && tvCandleBarsForTickMode().length >= 2
          const preserveChartView = replayViewportLocked
          const stepPreserveViewport = viewStepOnly && chartViewSnap != null
          const replayPickResolved = resolveIntervalPick(replayTimeframe)
          const subMinuteDecoupled =
            !!decoupled &&
            replayPickResolved != null &&
            isSubMinuteReplayPick(replayPickResolved)
          const chartStepSecForSync = resolveIntervalPick(chartTimeframe)?.stepSec ?? 60
          const subMinuteMultiMinuteChart =
            subMinuteDecoupled && chartStepSecForSync > 60
          const decoupledFeedPrimed = nextReplayTickDecoupledFeedPrimed
          nextReplayTickDecoupledFeedPrimed = false
          if (
            decoupled &&
            !decoupledFeedPrimed &&
            !decoupledStepOnly &&
            (firstChartPaint ||
              nextReplayTickForce ||
              (wasPlayKickoff && subMinuteMultiMinuteChart))
          ) {
            syncDecoupledTvFeed(index)
          }
          const tvStepPaintBase = {
            fit: fitChart && !preserveChartView && !viewStepOnly,
            force: forceChart,
            playing: replayPlaying,
            preserveViewport: preserveChartView || stepPreserveViewport,
            restoreVisibleRange: stepPreserveViewport
              ? chartViewSnap!
              : preserveChartView
                ? restoreRange
                : undefined,
            decoupledStepOnly,
            stepPreserveView: stepPreserve,
          }
          if (tickTvCandles) {
            const { all: allTv, display: displayTv } = tvTickModeDisplay(index)
            state.tvChart.setReplayData(displayTv, allTv, tvStepPaintBase)
          } else if (decoupled) {
            if (decoupledStepOnly || stepPreserve) {
              paintDecoupledReplayStepChange(
                index,
                chartViewSnap ?? lockedTvViewport ?? restoreRange ?? null,
                { playing: replayPlaying },
              )
            } else {
              const tvDisplay = tvBarsForChart(decoupled.display)
              const tvAll = tvBarsForChart(decoupled.all)
              const preferTick =
                replayPlaying &&
                !forceChart &&
                !fitChart &&
                !firstChartPaint
              if (preferTick && state.tvChart.tickDecoupledReplay(tvDisplay)) {
                if (preserveChartView || stepPreserveViewport) {
                  restoreChartViewportSoon(
                    chartViewSnap ?? lockedTvViewport ?? restoreRange ?? null,
                  )
                }
              } else {
                state.tvChart.setReplayData(tvDisplay, tvAll, {
                  ...tvStepPaintBase,
                  decoupled: true,
                  force: forceChart,
                })
              }
            }
          } else {
            state.tvChart.setReplayData(displayBars, allBars, {
              ...tvStepPaintBase,
              force: forceChart || (showFullSession && !viewStepOnly),
            })
          }
          if (state.tvChart && forceChart) {
            requestAnimationFrame(() => state.tvChart?.flushPendingRefresh())
          }
          if (state.tvChart && stepPreserveViewport && chartViewSnap) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                void state.tvChart?.restoreVisibleRange(chartViewSnap)
              })
            })
          }
          firstChartPaint = false
        }
      }
      const cursorBar = lastBar(decoupled ? displayBars : slice)
      if (backtestState.result && state.trading) {
        state.trading.setTradeMarkers(
          cursorBar
            ? tradeMarkersUpToTime(backtestState.result, Number(cursorBar.time))
            : [],
        )
      }
      if (replayStatusEl) {
        const mode = activeSession.sessionType === 'prop' ? 'Prop challenge' : 'Backtest'
        const windowHint = state.tickReplayWindowed
          ? ' · windowed'
          : state.sessionBarsWindowed
            ? ' · chunked'
            : ''
        if (decoupled) {
          replayStatusEl.textContent = `${mode} · ${replayTimeframe} step ${index} / ${replay.getBars().length} · ${chartTimeframe} chart${windowHint} · ${feedLabel}`
        } else {
          const unit = state.tickReplayUnit === 'tick' ? 'tick' : 'bar'
          replayStatusEl.textContent = `${mode} · ${unit} ${index} / ${chartBars.length}${windowHint} · ${feedLabel}`
        }
      }
      if (state.replay?.getState().playing && state.tickReplayWindowed) {
        void maybeExtendWindowedReplay(index)
      }
      if (state.replay?.getState().playing && state.sessionBarsWindowed) {
        void maybeExtendSessionBars(index)
      }
      if (decoupled && replayPlaying) {
        if (
          displayBars.length !== decoupledLegendBarCount ||
          index - decoupledLegendStep >= 15
        ) {
          updateLegend(displayBars)
          decoupledLegendStep = index
          decoupledLegendBarCount = displayBars.length
        } else if (cursorBar) {
          // Keep account / position badges live even when legend OHLC is throttled.
          syncTradingUi(cursorBar)
        }
      } else {
        updateLegend(decoupled ? displayBars : slice)
      }
      updateSidePanelFromReplay(cursorBar)
      chartBarCount = isDecoupledReplay() ? replay.getBars().length : chartBars.length
      syncReplayTransportUi(index)
      syncTradeNavUi(cursorBar ? Number(cursorBar.time) : undefined)
      if (!replayPlaying || !decoupled || index % 15 === 0) {
        syncChartIndicators(allBars, displayBars)
      }
      schedulePersistReplay()
      if (!(state.replay?.getState().playing ?? false)) {
        const playBtnEl = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
        setReplayPlayButtonIcon(playBtnEl, false)
      }
      syncTickLineOverlay(index)
      if (state.tvChart && !selectBarChartActive) {
        hideTvReplayMask()
      }
    }

    function syncReplayViewportAfterPaint() {
      if (!state.tvChart) return
      if (userViewportPinned && lockedTvViewport) {
        void restoreTvViewport(lockedTvViewport)
        return
      }
      const slice = replay.slice()
      const useLocked =
        replayViewportLocked &&
        lockedTvViewport != null &&
        state.tvChart.lockedViewportCoversBars(lockedTvViewport, slice)
      if (useLocked && lockedTvViewport) {
        void restoreTvViewport(lockedTvViewport)
        window.setTimeout(() => {
          if (lockedTvViewport && state.tvChart) void restoreTvViewport(lockedTvViewport)
        }, 80)
      } else {
        requestAnimationFrame(() => state.tvChart?.scrollReplayCursorIntoView())
      }
    }

    async function applyTvBootPaint() {
      if (!state.tvChart || state.disposed) return
      deferTvChartPaint = false
      replayViewportLocked = false
      lockedTvViewport = null
      pendingTvViewportRestore = null
      userViewportPinned = false
      state.tvChart.setReplayLockedViewport(null)
      const isHistorical = isHistoricalSessionBars(chartBars)
      const idx = isHistorical ? sessionReplayStartIndex : replay.getState().index
      const tvBars = tvBarsForChart(chartBars)
      const tvRes = intervalPillToTvResolution(chartTimeframe)
      const tvPeriod = tvBarPeriodSecForPill(chartTimeframe)
      state.tvChart.setHistoricalAnchorIndex(Math.max(0, sessionReplayStartIndex - 1))
      state.tvChart.setTvFullSeriesReplay(false)
      state.tvChart.primeIntervalFeed(tvBars, tvRes, idx, tvPeriod)
      nextReplayTickFit = !isHistorical
      nextReplayTickForce = !isHistorical
      if (isHistorical && replay.getState().index !== idx) {
        replay.setIndex(idx)
      } else {
        onReplayTick(replay.slice(), idx)
      }

      const sessionStartSec = activeSession.startDate?.trim()
        ? parseSessionDateToSec(activeSession.startDate, 'start')
        : null
      const anchorSessionViewport = () => {
        if (isHistorical) {
          state.tvChart?.scrollReplayCursorIntoView()
        } else if (sessionStartSec != null && Number.isFinite(sessionStartSec)) {
          state.tvChart?.scrollToWallTimeSec(sessionStartSec)
        } else {
          state.tvChart?.scrollReplayCursorIntoView()
        }
      }

      state.tvChart.flushPendingRefresh()
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          state.tvChart?.flushPendingRefresh()
          if (isHistorical && replay.getState().index !== idx) {
            replay.setIndex(idx)
          } else {
            onReplayTick(replay.slice(), idx)
          }
          anchorSessionViewport()
          requestAnimationFrame(() => {
            anchorSessionViewport()
            window.setTimeout(() => anchorSessionViewport(), 200)
            requestAnimationFrame(() => resolve())
          })
        })
      })
    }

    async function revealLightweightChartFallback(reason: string) {
      if (state.disposed || !state.trading || !tvChartMode) return
      console.warn('[ChartBoot] TV → Lightweight Charts:', reason)
      tvChartMode = false
      state.tvChart?.dispose()
      state.tvChart = null
      chartTv.hidden = true
      chartHost.classList.remove('rw-chart-host--tv')
      chartCanvas.classList.remove('rw-chart-canvas--tv')
      rwRoot.classList.remove('rw-root--tv')
      showReplayNotice(
        `TradingView chart unavailable (${reason}) — using Lightweight Charts.`,
      )
      deferTvChartPaint = false
      nextReplayTickFit = true
      onReplayTick(replay.slice(), replay.getState().index)
      hideTvReplayMask()
      paintedWithNonZeroHost = true
      syncReplayViewportAfterPaint()
      tvBootPaintDone = true
      await dismissBootAfterPaint()
    }

    async function paintTvBootChart() {
      if (!state.tvChart || state.disposed) return

      let bootDismissed = tvBootPaintDone

      const runPaint = async () => {
        if (!state.tvChart || state.disposed) return
        await waitForChartHostLayout(chartHost, () => state.disposed)
        if (state.disposed || !state.tvChart) return
        await yieldToMain()
        await applyTvBootPaint()
        hideChartEmptyState()
        hideTvReplayMask()
        maybeShowSessionWindowedNotice()
        paintedWithNonZeroHost = true
        syncReplayViewportAfterPaint()
        if (!bootDismissed) {
          bootDismissed = true
          tvBootPaintDone = true
          await dismissBootAfterPaint()
        }
        void prefetchLookbackAfterBoot()
      }

      async function prefetchLookbackAfterBoot() {
        if (state.disposed || !usesMarketDataSession(currentChartSymbol)) return
        const before = replay.getBars()
        const startSec = activeSession.startDate?.trim()
          ? parseSessionDateToSec(activeSession.startDate, 'start')
          : null
        if (startSec == null || !Number.isFinite(startSec)) return

        const merged = await prefetchSessionLookbackBars(
          currentChartSymbol,
          before,
          activeSession.startDate,
          activeSession.endDate,
        )
        if (!merged || state.disposed || merged.length <= before.length) return

        const oldFirstIdx = before.findIndex((b) => b.time >= startSec)
        const newFirstIdx = merged.findIndex((b) => b.time >= startSec)
        if (oldFirstIdx < 0 || newFirstIdx < 0 || newFirstIdx <= oldFirstIdx) return

        const prefix = merged.slice(newFirstIdx - (newFirstIdx - oldFirstIdx), newFirstIdx)
        if (!prefix.length) return

        const added = replay.prependBars(prefix)
        if (added <= 0 || state.disposed) return
        state.tvChart?.prependSessionBars(prefix)
        chartBars = replay.getBars()
        source1mBars = chartBars.slice()
        sessionReplayStartIndex = sessionStartReplayIndex(chartBars, activeSession.startDate)
        nextReplayTickFit = false
        onReplayTick(replay.slice(), replay.getState().index)
        state.tvChart?.scrollReplayCursorIntoView()
        console.info('[ChartBoot] Lookback expanded', { added, priorBars: newFirstIdx })
      }

      void state.tvChart.whenChartReady().then(() => {
        void runPaint()
      })

      await Promise.race([
        state.tvChart.whenChartReady().catch(() => {}),
        new Promise<void>((resolve) => window.setTimeout(resolve, 8_000)),
      ])
      await runPaint()
    }

    replay = new ReplayController(chartBars, onReplayTick)
    replay.setLoopStartIndex(sessionReplayStartIndex)

    async function lazyFetchSessionBars(req: LazyFetchBarsRequest): Promise<boolean> {
      if (!sessionBarsWindowed || sessionBarExtendBusy) return false
      if (chartTimeframe !== '1m' && inferTimeframeFromBars(replay.getBars()) !== '1m') return false

      const full = sessionDateRangeSec(activeSession.startDate, activeSession.endDate)
      if (full.startSec == null || full.endSec == null) return false

      const sessionStartSec = activeSession.startDate?.trim()
        ? parseSessionDateToSec(activeSession.startDate, 'start') ?? undefined
        : undefined

      const range =
        req.direction === 'before'
          ? chunkRangeBeforeLoaded(req.loadedFirstSec, full.startSec)
          : chunkRangeAfterLoaded(req.loadedLastSec, full.endSec)
      if (!range) return false

      const key = `${req.direction}:${range.startSec}:${range.endSec}`
      if (sessionLazyFetchKey === key) return false

      sessionBarExtendBusy = true
      sessionLazyFetchKey = key
      try {
        const chunk = await fetchSessionBarChunk(
          currentChartSymbol,
          range.startSec,
          range.endSec,
          sessionStartSec,
        )
        if (!chunk?.bars.length || state.disposed) return false

        const merged = filterSessionChartBars(chunk.bars, activeSession)
        if (!merged.length) return false

        if (req.direction === 'before') {
          const added = replay.prependBars(merged)
          if (added <= 0) return false
          state.tvChart?.prependSessionBars(merged)
          sessionReplayStartIndex += added
        } else {
          const added = replay.appendBars(merged)
          if (added <= 0) return false
          state.tvChart?.appendSessionBars(merged)
        }
        chartBars = replay.getBars()
        if (inferTimeframeFromBars(chartBars) === '1m') {
          source1mBars = chartBars.slice()
        }
        return true
      } catch (err) {
        console.warn('[SessionBars] lazy fetch', err)
        return false
      } finally {
        sessionBarExtendBusy = false
      }
    }

    async function maybeExtendSessionBars(replayIndex: number) {
      if (!sessionBarsWindowed || !state.replay?.getState().playing) return
      if (sessionBarExtendBusy) return
      const pick = resolveIntervalPick(chartTimeframe)
      if (pick && intervalPickNeedsSubMinuteTicks(pick)) return

      const bars = replay.getBars()
      if (!bars.length) return
      if (replayIndex < bars.length - SESSION_LAZY_LOAD_MARGIN_BARS) return

      const loadedFirstSec = bars[0]!.time
      const loadedLastSec = bars[bars.length - 1]!.time
      const full = sessionDateRangeSec(activeSession.startDate, activeSession.endDate)
      if (full.endSec == null || loadedLastSec >= full.endSec - 60) return

      await lazyFetchSessionBars({
        direction: 'after',
        periodParams: {
          from: loadedLastSec,
          to: full.endSec,
          countBack: 500,
          firstDataRequest: false,
        },
        loadedFirstSec,
        loadedLastSec,
      })
    }

    function maybeShowSessionWindowedNotice() {
      if (!sessionBarsWindowed) return
      if (chartTimeframe !== '1m' && inferTimeframeFromBars(chartBars) !== '1m') return
      const span = sessionSpanSec(activeSession.startDate, activeSession.endDate)
      if (span < SESSION_1M_WARN_SPAN_SEC) return

      const days = Math.round(span / 86_400)
      const base = `Long 1m session (~${days} days) — loading in 2-week chunks. Pan left or replay to load more.`
      if (span >= SESSION_1M_SUGGEST_H1_SPAN_SEC) {
        showReplayNoticeAction(
          `${base} For smoother navigation, try 1h or 1D.`,
          'Switch to 1h',
          () => void applyIntervalPick({ pill: '1h', kind: 'time', stepSec: 3600, label: '1 hour' }),
        )
      } else {
        showReplayNotice(base)
      }
    }

    sessionLazyFetchRef.fn = lazyFetchSessionBars
    state.sessionBarsWindowed = sessionBarsWindowed

    const savedReplayIndex = restoredReplay?.replayBarIndex
    const historicalSession = isHistoricalSessionBars(chartBars)
    const initialReplayIndex =
      historicalSession
        ? sessionReplayStartIndex
        : savedReplayIndex != null && savedReplayIndex >= 1
          ? Math.min(Math.max(1, Math.round(savedReplayIndex)), chartBars.length)
          : sessionReplayStartIndex
    replayViewportLocked = false
    lockedTvViewport = null
    pendingTvViewportRestore = null
    state.tvChart?.setReplayLockedViewport(null)
    replay.replaceBarsAt(chartBars, initialReplayIndex)
    state.replay = replay
    syncTickLineOverlayActive()
    syncTickLineOverlay(initialReplayIndex)
    setReplayDockOpen(tvChartMode)
    if (state.tvChart && !tvBootBarsApplied) {
      state.tvChart.setSessionBars(
          tvBarsForChart(chartBars),
          intervalPillToTvResolution(chartTimeframe),
          tvBarPeriodSecForPill(chartTimeframe),
        )
    }
    requestAnimationFrame(() => {
      if (state.trading) state.trading.scrollReplayCursorIntoView()
    })
    if (state.tvChart) {
      await waitForChartHostLayout(chartHost, () => state.disposed)
      if (!state.disposed) await paintTvBootChart()
    } else {
      nextReplayTickFit = true
      onReplayTick(replay.slice(), replay.getState().index)
      paintedWithNonZeroHost = true
      await dismissBootAfterPaint()
    }

    function viewportSec(raw: number): number {
      return raw > 1e11 ? Math.floor(raw / 1000) : Math.floor(raw)
    }

    function viewportMatchesLocked(
      snap: TvLockedViewport,
      locked: TvLockedViewport,
      periodSec: number,
    ): boolean {
      const tol = Math.max(2, Math.floor(periodSec * 0.05))
      const fromDiff = Math.abs(viewportSec(snap.from) - viewportSec(locked.from))
      const toDiff = Math.abs(viewportSec(snap.to) - viewportSec(locked.to))
      if (fromDiff > tol || toDiff > tol) return false
      if (
        snap.barSpacing != null &&
        locked.barSpacing != null &&
        Math.abs(snap.barSpacing - locked.barSpacing) > 0.01
      ) {
        return false
      }
      if (
        snap.rightOffset != null &&
        locked.rightOffset != null &&
        Math.abs(snap.rightOffset - locked.rightOffset) > 0.01
      ) {
        return false
      }
      return true
    }

    function onUserChartViewportChange() {
      if (state.disposed || selectBarChartActive) return
      if (suppressUserViewportPin > 0) return
      if (state.tvChart?.isProgrammaticViewportRestore()) return

      if (replay.getState().playing) {
        const snap = state.tvChart?.captureLockedViewport() ?? null
        const locked = state.tvChart?.getReplayLockedViewport() ?? lockedTvViewport
        const period = tvBarPeriodSecForPill(chartTimeframe)
        if (snap && locked && viewportMatchesLocked(snap, locked, period)) return
        pinChartViewportForReplay()
        return
      }

      userViewportPinned = true
      const snap = state.tvChart?.captureLockedViewport() ?? null
      if (snap) {
        lockedTvViewport = snap
        pendingTvViewportRestore = snap
      }
      replayViewportLocked = false
      state.tvChart?.setReplayLockedViewport(null)
    }

    let unsubUserViewportChange: (() => void) | null = null
    if (state.tvChart) {
      unsubUserViewportChange = state.tvChart.subscribeTimeScaleChange(onUserChartViewportChange)
      cleanupFns.push(() => {
        unsubUserViewportChange?.()
      })
    }

    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (selectBarChartActive) return
      if (param.point === undefined || param.time === undefined) {
        resetLegendHover()
        return
      }
      const hit = findBarAtTime(replay.getBars(), Number(param.time))
      if (!hit) return
      legendHoverActive = true
      paintLegendBar(hit.bar, hit.prev, { syncPanels: false })
    }
    trading?.chart.subscribeCrosshairMove(onCrosshairMove)
    cleanupFns.push(() => trading?.chart.unsubscribeCrosshairMove(onCrosshairMove))

    tickLineOverlay = mountTickLineOverlay({
      chartHost,
      getTheme: () => (uiChartTheme === 'dark' ? 'dark' : 'light'),
      isActive: () => state.tickReplayUnit === 'tick' && !!state.tvChart,
      getTickSeries: () => tickBarSeries,
      getTvChart: () => state.tvChart,
      getTrading: () => state.trading,
      getPlotLayout: () => state.tvChart?.getPlotLayout(chartHost) ?? null,
    })
    cleanupFns.push(() => {
      tickLineOverlay?.dispose()
      tickLineOverlay = null
    })

    const positionOverlayHandlers = {
      getPositions: () => replayAccount.getPositions(),
      getMarkPrice: () => lastBar(replay.slice())?.close ?? 0,
      getBidAsk: () => {
        const b = lastBar(replay.slice())
        return b ? bidAskFromBar(b) : null
      },
      getAnchorTime: () => {
        const slice = replay.slice()
        const last = slice.length ? slice[slice.length - 1]! : null
        return last ? Number(last.time) : null
      },
      formatMoney,
      onClose: (id: string) => {
        const b = lastBar(replay.slice())
        if (!b) return
        const { bid, ask } = bidAskFromBar(b)
        const pos = replayAccount.getPositions().find((p) => p.id === id)
        if (!pos) return
        replayAccount.closePosition(id, pos.direction === 'long' ? bid : ask, {
          exitTime: Number(b.time),
          exitReason: 'manual' as const,
        })
        schedulePersistReplay()
        syncTradingUi(b)
      },
      onToggleTakeProfit: (id: string) => {
        const pos = replayAccount.getPositions().find((p) => p.id === id)
        if (!pos) return
        if (pos.takeProfit != null) {
          replayAccount.setTakeProfit(id, null)
        } else {
          replayAccount.setTakeProfit(id, defaultTpSl(pos.entryPrice, pos.direction).tp)
        }
        syncTradingUi(lastBar(replay.slice()))
      },
      onToggleStopLoss: (id: string) => {
        const pos = replayAccount.getPositions().find((p) => p.id === id)
        if (!pos) return
        if (pos.stopLoss != null) {
          replayAccount.setStopLoss(id, null)
        } else {
          replayAccount.setStopLoss(id, defaultTpSl(pos.entryPrice, pos.direction).sl)
        }
        syncTradingUi(lastBar(replay.slice()))
      },
    }

    if (tvChartMode) {
      positionOverlay = mountChartPositionOverlay({
        chartHost,
        ...positionOverlayHandlers,
        priceToHostY: (price) => state.tvChart?.priceToHostY(price, chartHost) ?? null,
        getPlotHorizontalInsets: () => {
          const layout = state.tvChart?.getPlotLayout(chartHost)
          if (!layout || layout.width < 80) return { left: 0, right: 56 }
          const right = Math.min(Math.max(layout.right, 48), 120)
          return { left: layout.plotOffsetX, right }
        },
        getMinPlotY: () => {
          const layout = state.tvChart?.getPlotLayout(chartHost)
          return layout ? layout.top + 8 : 40
        },
        getBottomInset: () => {
          const layout = state.tvChart?.getPlotLayout(chartHost)
          return layout?.bottom ?? 48
        },
        anchorTimeToHostX: (timeSec) => {
          const layout = state.tvChart?.getPlotLayout(chartHost)
          if (!layout) return null
          return state.tvChart?.lineXAtBarTimeSec(timeSec, layout.plotOffsetX) ?? null
        },
        subscribeScaleChange: (cb) => state.tvChart?.subscribeTimeScaleChange(cb) ?? (() => {}),
      })
      cleanupFns.push(() => {
        positionOverlay?.dispose()
        positionOverlay = null
      })
      void state.tvChart?.whenChartReady().then(() => {
        if (!state.disposed) syncPositionOverlay(true)
      })
    } else if (trading) {
      positionOverlay = mountChartPositionOverlay({
        chartHost,
        chart: trading.chart,
        getSeries: () => trading.getMainSeries(),
        getSeriesDataRevision: () => trading.getSeriesDataRevision(),
        ...positionOverlayHandlers,
      })
      cleanupFns.push(() => {
        positionOverlay?.dispose()
        positionOverlay = null
      })
    }
    syncTradingUi(lastBar(replay.slice()))

    function canUseTickIntervals() {
      if (sessionTicksEligible()) return true
      return canResample
    }

    function canUseSubMinuteIntervals() {
      if (sessionTicksEligible()) return true
      // Local pre-synced second bars unlock the menu even before a tick fetch.
      for (const step of LOCAL_SECOND_STEPS) {
        if (hasLocalSecondBars(step)) return true
      }
      // Synthetic second bars from 1m history (same fallback as resolveReplayStepBars).
      return canResample && source1mBars.length >= 8
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
        backtestState.highlightTradeNum = undefined
        sidePanel?.clear()
        syncOrderPanelPosition()
        syncTradeNavUi()
        state.trading?.setTradeMarkers([])
        state.tvChart?.setBacktestTradeMarkers([])
        hideReplayNotice()
        applyFeedUi({ symbol: s, loading: true })

        const series = await loadSessionBars(s, activeSession.name, undefined, {
          startDate: activeSession.startDate,
          endDate: activeSession.endDate,
        })
        if (state.disposed || seq !== symbolSwitchSeq) return

        activeSession = { ...activeSession, assets: s }
        currentChartSymbol = s

        if (series.dataSource && usesMarketDataSession(s)) {
          feedLabel = `Tradeneu · ${series.dataSource}`
        } else {
          feedLabel = defaultSessionFeedLabel(activeSession.sessionType, s)
        }

        paintSymbolPanel(s, feedLabel)

        chartBars = filterSessionChartBars(series.bars, activeSession)
        const sessionReplayStartIndex = sessionStartReplayIndex(chartBars, activeSession.startDate)
        const emptyDateRange =
          Boolean(activeSession.startDate?.trim() || activeSession.endDate?.trim()) &&
          !sessionWindowHasBars(chartBars, activeSession.startDate, activeSession.endDate)
        applyFeedUi({
          symbol: s,
          dataSource: series.dataSource,
          barCount: series.bars.length,
          timeframe: series.timeframe,
          emptyDateRange,
        })
        chartTimeframe = series.timeframe
        intervalPill.textContent = chartTimeframe
        if (replayDockTf) replayDockTf.textContent = chartTimeframe
        state.tvChart?.setSymbol(s)
        state.tvChart?.setResolution(intervalPillToTvResolution(chartTimeframe))
        state.tvChart?.setDataSourceLabel(series.dataSource)

        source1mBars = chartBars.slice()
        canResample = inferTimeframeFromBars(source1mBars) === '1m'
        resetTickChartSource()
        await preloadLocalSecondBarsForPick(resolveIntervalPick(chartTimeframe))

        const activePick = resolveIntervalPick(chartTimeframe)
        if (activePick && intervalPickNeedsSubMinuteTicks(activePick) && sessionTicksEligible()) {
          if (localSecondIntervalPick(activePick)) {
            const nextBars = buildBarsForIntervalPick(activePick)
            if (nextBars.length >= 2) chartBars = nextBars
          } else {
          const ok = await ensureDukascopyTickSource()
          if (ok) {
            const nextBars = buildBarsForIntervalPick(activePick)
            if (nextBars.length >= 2) chartBars = nextBars
          } else {
            chartTimeframe = '1m'
            chartBars = source1mBars.slice()
            intervalPill.textContent = chartTimeframe
            if (replayDockTf) replayDockTf.textContent = chartTimeframe
            state.tvChart?.setResolution(intervalPillToTvResolution(chartTimeframe))
          }
          }
        }

        if (!chartBars.length) {
          if (tvChartMode) {
            showReplayNotice(`No bars for ${formatDisplaySymbol(s)}. Check the data feed or session import.`)
          } else if (subbarHeadEl) {
            subbarHeadEl.innerHTML = `<span style="color:#787b86">No bars for <strong>${formatDisplaySymbol(s)}</strong>. Check the data feed or session import.</span>`
          }
          chartVolEl.innerHTML = ''
          if (replayStatusEl) replayStatusEl.textContent = 'Replay · no data'
          replay.replaceBarsAt([], 1)
          return
        }

        firstChartPaint = true
        paintedWithNonZeroHost = false
        replay.replaceBarsAt(chartBars, sessionReplayStartIndex)
        replay.setLoopStartIndex(sessionReplayStartIndex)
        state.tvChart?.setSessionBars(
          tvBarsForChart(chartBars),
          intervalPillToTvResolution(chartTimeframe),
          tvBarPeriodSecForPill(chartTimeframe),
        )
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
    const strategyPanelSelect: HTMLSelectElement | null = null

    let activeStrategy: StrategyDefinition = EMA_CROSS
    const savedStrategyId = opts?.lastStrategyId?.trim()
    if (savedStrategyId) {
      const saved = resolveStrategy(savedStrategyId)
      if (saved) activeStrategy = saved
    } else {
      const defaultId = readDefaultStrategyId()
      if (defaultId) {
        const saved = resolveStrategy(defaultId)
        if (saved) activeStrategy = saved
      }
    }
    const backtestBtnDefaultHtml = 'Backtest'

    function strategyOptionsHtml(): string {
      return listAllStrategies()
        .map((s) => `<option value="${s.id}">${strategySelectLabel(s)}</option>`)
        .join('')
    }

    let syncingStrategySelects = false

    function setActiveStrategy(strategy: StrategyDefinition) {
      activeStrategy = strategy
      syncingStrategySelects = true
      try {
        if (strategyPanelSelect && strategyPanelSelect.value !== strategy.id) {
          strategyPanelSelect.value = strategy.id
        }
      } finally {
        syncingStrategySelects = false
      }
      opts?.onStrategyChange?.(strategy.id)
    }

    function populateStrategySelects() {
      const html = strategyOptionsHtml()
      if (strategyPanelSelect) {
        strategyPanelSelect.innerHTML = html
        strategyPanelSelect.value = activeStrategy.id
      }
    }

    populateStrategySelects()

    function syncActiveStrategyFromSelect() {
      if (syncingStrategySelects) return
      const id = strategyPanelSelect?.value
      const found = id ? resolveStrategy(id) : null
      if (!found || found.id === activeStrategy.id) return
      setActiveStrategy(found)
    }

    onPineAddToChart = (_script, strategyId) => {
      if (strategyId) {
        const found = resolveStrategy(strategyId)
        if (found) {
          setActiveStrategy(found)
          showReplayNotice(
            `Loaded “${found.name}” from your Pine script keywords. Run Backtest from the toolbar when ready.`,
          )
          return
        }
      }
      void confirmDialog({
        title: 'Pine Script not supported',
        message:
          'Tradeneu does not run Pine Script on the chart. Use the Strategy page to define entry and exit rules, then run a backtest.',
        confirmLabel: 'OK',
        cancelLabel: 'Close',
      })
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
      state.tvChart?.setSessionBars(
        tvBarsForChart(bars),
        intervalPillToTvResolution(chartTimeframe),
        tvBarPeriodSecForPill(chartTimeframe),
      )
      requestAnimationFrame(() => {
        if (state.trading) state.trading.scrollReplayCursorIntoView()
        else state.tvChart?.scrollReplayCursorIntoView()
      })
    }

    function onBacktestClick() {
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
      getBacktestLaunchButtons().forEach((b) => {
        b.setAttribute('disabled', '')
        b.textContent = 'Running…'
      })

      try {
        const result = runBacktest(bars, activeStrategy, {
          initialCapital: initialCash,
          commission: 2,
          slippage: defaultBacktestSlippage(currentChartSymbol),
          startBarIndex: replayStartBar,
          onProgress: (pct) => {
            getBacktestLaunchButtons().forEach((b) => {
              b.textContent = `Running… ${pct}%`
            })
          },
        })
        numberTrades(result)
        console.log('Backtest done:', result.summary)

        backtestState.result = result
        backtestState.highlightTradeNum = undefined
        ;(window as unknown as { __backtestResult?: BacktestResult }).__backtestResult = result
        showFullChartForBacktest(bars, replayStartBar)
        replay.setLoopStartIndex(replayStartBar)

        const cursorBar = bars[Math.max(0, replayStartBar - 1)] ?? null
        const cursorTime = cursorBar ? Number(cursorBar.time) : undefined
        const tradePayload = result.trades.map((t) => ({
          direction: t.direction,
          entryTime: t.entryTime,
          exitTime: t.exitTime,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          pnl: t.pnl,
        }))
        if (state.trading) {
          state.trading.setTradeMarkers(
            cursorTime != null && result.trades.length
              ? tradeMarkersUpToTime(result, cursorTime)
              : tradeMarkersUpToTime(result, Number.POSITIVE_INFINITY),
          )
        }
        // TV: paint all entry/exit markers once (avoid recreating shapes every replay step).
        state.tvChart?.setBacktestTradeMarkers(tradePayload)

        sidePanel?.update({
          result,
          runningSummary: result.summary,
          isFinal: true,
        })
        opts?.onBacktestComplete?.({
          netPnl: result.summary.netPnl,
          totalTrades: result.summary.totalTrades,
          winRate: result.summary.winRate,
          strategyId: activeStrategy.id,
          ranAt: Date.now(),
        })
        syncOrderPanelPosition()
        getBacktestLaunchButtons().forEach((b) => b.classList.add('rw-backtest-launch--active'))
        syncTradeNavUi(cursorTime)
        void showBacktestResultDialog(result)
      } catch (e) {
        console.error('[BacktestEngine]', e)
        window.alert(e instanceof Error ? e.message : 'Backtest failed.')
      } finally {
        getBacktestLaunchButtons().forEach((b) => {
          b.removeAttribute('disabled')
          b.textContent = backtestBtnDefaultHtml
        })
      }
    }

    const onBacktestClickHandler = () => onBacktestClick()
    btnBacktest?.addEventListener('click', onBacktestClickHandler)
    cleanupFns.push(() => btnBacktest?.removeEventListener('click', onBacktestClickHandler))

    if (opts?.autoRunBacktest) {
      requestAnimationFrame(() => {
        if (!state.disposed && chartBars.length >= 50) runAndShowBacktest()
      })
    }

    function revertTvIntervalPill(pill: string) {
      const pick = resolveIntervalPick(pill)
      const tvRes = intervalPillToTvResolution(pill)
      state.tvChart?.noteResolution(tvRes)
      state.tvChart?.syncResolution(tvRes)
      if (state.tvChart && chartBars.length >= 2 && pick) {
        const past = Math.min(replay.getState().index, chartBars.length)
        state.tvChart.setSessionBars(
          tvBarsForChart(chartBars),
          tvRes,
          tvBarPeriodSecForPill(pill),
        )
        state.tvChart.primeIntervalFeed(
          tvBarsForChart(chartBars),
          tvRes,
          past,
          tvBarPeriodSecForPill(pill),
        )
        state.tvChart.flushPendingRefresh()
      }
    }

    let replayAutoSelectInterval = readReplayAutoSelectInterval()

    function syncReplayIntervalBtnTitle() {
      if (!replayIntervalBtn) return
      replayIntervalBtn.title = replayAutoSelectInterval
        ? 'Replay step (auto — follows chart interval)'
        : 'Replay step interval'
    }

    /** Replay interval matches chart — use chart bar series and map cursor from step bars if needed. */
    function snapReplayToChartBars() {
      const stepBars = replay.getBars()
      const stepIdx = replay.getState().index
      const replayPick = resolveIntervalPick(replayTimeframe)
      const chartPick = resolveIntervalPick(chartTimeframe)
      let chartIdx = stepIdx
      if (chartPick && replayPick && chartTimeframe !== replayTimeframe) {
        const cursorEnd = cursorEndSecForStepIndex(stepBars, replayPick.stepSec ?? 60, stepIdx)
        chartIdx = stepIndexForCursorEnd(chartBars, chartPick.stepSec ?? 60, cursorEnd)
      }
      replayTimeframe = chartTimeframe
      if (replayDockTf) replayDockTf.textContent = chartTimeframe
      replayStepSourceBars = []
      replay.replaceBarsAt(chartBars, chartIdx)
      syncReplayIntervalBtnTitle()
    }

    async function applyReplayIntervalPick(pick: IntervalPick) {
      const chartPick = resolveIntervalPick(chartTimeframe)
      if (!chartPick) return

      // Manual pick that differs from chart → turn off TV “Auto select interval”.
      if (pick.pill !== chartTimeframe && replayAutoSelectInterval) {
        replayAutoSelectInterval = false
        writeReplayAutoSelectInterval(false)
        syncReplayIntervalBtnTitle()
      }

      // Coupled replay — chart and replay share the same bar series.
      if (pick.pill === chartTimeframe) {
        const coupledSnap = state.tvChart?.captureLockedViewport() ?? lockedTvViewport ?? null
        lockChartViewport(coupledSnap)
        replay.pause()
        syncPlayBtnPaused()
        nextReplayTickDecoupledStepOnly = true
        nextReplayTickChartViewSnap = coupledSnap
        snapReplayToChartBars()
        restoreChartViewportSoon(coupledSnap)
        return
      }

      // Decoupled replay: minute+ chart with a different minute or sub-minute replay step.
      if (!canDecoupleReplay(chartPick, pick)) {
        window.alert(
          chartPick.kind !== 'time' || (chartPick.stepSec ?? 60) < 60
            ? 'Sub-minute charts must use the same interval for chart and replay (e.g. 10s + 10s). Change the chart to 1m or higher first.'
            : pick.kind === 'tick'
              ? 'Tick replay steps must match the chart interval. Use second bars (10s, 30s) for decoupled replay on a minute chart.'
              : 'This replay step is not supported for the current chart interval.',
        )
        return
      }
      if (source1mBars.length < 2) {
        window.alert('Not enough 1-minute history for replay steps in this session.')
        return
      }

      const prevStepBars = replay.getBars()
      const prevIndex = replay.getState().index
      const prevReplayPick = resolveIntervalPick(replayTimeframe)
      const prevCursorEnd =
        isDecoupledReplay() && prevReplayPick
          ? cursorEndSecForStepIndex(
              prevStepBars,
              effectiveReplayStepSec(prevStepBars, prevReplayPick.stepSec ?? 60),
              prevIndex,
            )
          : cursorEndSecForStepIndex(chartBars, chartPick.stepSec ?? 60, prevIndex)

      // Capture pan/zoom before async second-bar load so replay step change does not move the chart.
      const replayViewSnapAtPick =
        state.tvChart?.captureLockedViewport() ??
        lockedTvViewport ??
        state.tvChart?.getReplayLockedViewport() ??
        null
      lockChartViewport(replayViewSnapAtPick)

      replayTimeframe = pick.pill
      if (replayDockTf) replayDockTf.textContent = pick.pill

      const stepBars = await resolveReplayStepBars(pick)
      if (isSubMinuteReplayPick(pick) && stepBars.length < 2) {
        replayTimeframe = chartTimeframe
        if (replayDockTf) replayDockTf.textContent = chartTimeframe
        window.alert(
          'Sub-minute replay needs second-bar data for this session. Sync market seconds (npm run market:sync:seconds), load Dukascopy ticks with session dates, or use enough 1m history for synthetic seconds.',
        )
        return
      }
      replayStepSourceBars = isSubMinuteReplayPick(pick) ? stepBars : []

      const replayStepSec = effectiveReplayStepSec(stepBars, pick.stepSec ?? 60)
      const stepIndex = stepIndexForCursorEnd(stepBars, replayStepSec, prevCursorEnd)
      replay.pause()
      syncPlayBtnPaused()
      nextReplayTickDecoupledStepOnly = true
      nextReplayTickChartViewSnap = replayViewSnapAtPick
      nextReplayTickDecoupledFeedPrimed = false
      replay.replaceBarsAt(stepBars, stepIndex)
      paintDecoupledReplayStepChange(stepIndex, replayViewSnapAtPick)
    }

    async function applyIntervalPick(pick: IntervalPick) {
      if (intervalPickBusy) return
      intervalPickBusy = true
      tvIntervalSwap.inProgress = true
      const revertPill = chartTimeframe
      const prevTvRes = intervalPillToTvResolution(chartTimeframe)
      const nextTvRes = intervalPillToTvResolution(pick.pill)
      const chartResolutionWillChange = !tvResolutionMatches(prevTvRes, nextTvRes)
      const tvSwapViewport = state.tvChart?.captureLockedViewport() ?? lockedTvViewport ?? null
      if (chartResolutionWillChange) {
        replayViewportLocked = false
        lockedTvViewport = null
        pendingTvViewportRestore = null
        userViewportPinned = false
        state.tvChart?.setReplayLockedViewport(null)
      } else {
        lockChartViewport(tvSwapViewport)
      }
      const prevPick = resolveIntervalPick(chartTimeframe)
      const enteringTickKind = intervalPickIsTick(pick)
      const leavingTickKind = prevPick != null && intervalPickIsTick(prevPick)
      const enteringSeconds = intervalPickIsSeconds(pick)
      const leavingSubMinute =
        prevPick != null &&
        (intervalPickIsTick(prevPick) || intervalPickIsSeconds(prevPick))
      const slice = replay.slice()
      const cursorTime = slice.length ? slice[slice.length - 1]!.time : null
      let cursorTimeSec = cursorTime != null ? Number(cursorTime) : null

      // Sync prime before any await: TV may already be on 4h/1h and requesting getBars.
      // Without this, a resolution mismatch returns [] until later prime+resetData.
      if (
        state.tvChart &&
        !enteringTickKind &&
        !enteringSeconds &&
        pick.kind === 'time' &&
        (pick.stepSec ?? 60) >= 60
      ) {
        const earlyBars = buildBarsForIntervalPick(pick, cursorTimeSec)
        if (earlyBars.length >= 2) {
          const earlyRes = intervalPillToTvResolution(pick.pill)
          state.tvChart.noteResolution(earlyRes)
          state.tvChart.primeIntervalFeed(
            tvBarsForChart(earlyBars),
            earlyRes,
            earlyBars.length,
            intervalPickBarPeriodSec(pick),
          )
        }
      }

      let tvVisibleMidSec: number | null = null
      if ((enteringTickKind || enteringSeconds) && state.tvChart) {
        const visible = state.tvChart.captureVisibleRange()
        if (visible && Number.isFinite(visible.from) && Number.isFinite(visible.to)) {
          tvVisibleMidSec = Math.floor((visible.from + visible.to) / 2)
        }
      }
      let overlayActive = false
      const showOverlay = (msg: string) => {
        if (!overlayActive) {
          setChartLoading(true, msg)
          overlayActive = true
        } else if (chartLoadingText) {
          chartLoadingText.textContent = msg
        }
      }
      try {
        const replayPickBeforeChartChange = resolveIntervalPick(replayTimeframe)
        const prevReplayTransport = replay.getBars()
        const prevReplayStepSec =
          replayPickBeforeChartChange != null
            ? effectiveReplayStepSec(
                prevReplayTransport,
                replayPickBeforeChartChange.stepSec ?? 60,
              )
            : 60
        const preserveCursorEndSec =
          isDecoupledReplay() && replayPickBeforeChartChange
            ? cursorEndSecForStepIndex(
                prevReplayTransport,
                prevReplayStepSec,
                replay.getState().index,
              )
            : null
        tickLoadUsedProgressive = false
        if (enteringTickKind) {
          showOverlay('Building tick chart…')
          await yieldToMain()
          if (!ensureSyntheticTickSource()) {
            window.alert('Not enough tick history for this interval in the session.')
            revertTvIntervalPill(revertPill)
            return
          }
          if (useFullSessionTicks && sessionTicksEligible()) {
            showOverlay('Loading tick data…')
            const ok = await ensureDukascopyTickSource(cursorTimeSec, { forceWindowed: false })
            if (!ok) {
              showReplayNotice('Full tick load failed — using synthetic ticks from 1m bars.')
            }
          } else if (sessionTicksEligible()) {
            showReplayNoticeAction(
              'Synthetic tick replay from 1m bars (aligned with candles).',
              'Load real Dukascopy ticks',
              () => void loadFullSessionTicksProgressive(),
            )
          }
        } else if (enteringSeconds) {
          if (!sessionTicksEligible()) {
            window.alert('Sub-minute intervals require Dukascopy ticks and session start/end dates.')
            revertTvIntervalPill(revertPill)
            return
          }
          const step = pick.stepSec ?? 60
          if (isLocalSecondStep(step)) {
            if (!hasLocalSecondBars(step)) {
              showOverlay(`Loading ${pick.pill} bars…`)
              setSourceSecondBars(step, await loadSourceSecondBars(step, { noCache: true }))
            }
            if (!localSecondIntervalPick(pick)) {
              window.alert(
                `${pick.label} bars are not available for this session date range. Run npm run market:sync:seconds (or market:sync), ensure session dates overlap synced tick data (last ~14 days), then try again.`,
              )
              revertTvIntervalPill(revertPill)
              return
            }
            showOverlay(`Building ${pick.pill} bars…`)
            await yieldToMain()
          } else {
          showOverlay(
            `Building ${pick.pill} bars — fetching tick data (first load may take up to a minute)…`,
          )
          const ok = await ensureDukascopyTickSource(cursorTimeSec, {
            forceWindowed: true,
            refreshWindow: true,
            windowSec: SECONDS_INITIAL_WINDOW_SEC,
            timeoutMs: SECONDS_TICK_LOAD_TIMEOUT_MS,
            tvVisibleMidSec,
          })
          if (!ok) {
            const msg =
              lastTickLoadFail === 'timeout'
                ? 'Tick fetch timed out. Dukascopy can be slow on first load — ensure the historic API is running (npm run dev) and try again.'
                : lastTickLoadFail === 'empty'
                  ? source1mBars.length >= 2
                    ? 'No Dukascopy ticks for this session window. Use a weekday session during active market hours (e.g. XAUUSD Mon–Fri 08:00–20:00 UTC) and ensure the historic API is running.'
                    : 'No ticks returned — set session start/end dates that overlap loaded 1-minute bars and ensure the historic API is running (npm run dev).'
                  : lastTickLoadFail === 'range'
                    ? 'Invalid session date range for tick fetch. Set session start and end dates in the session settings.'
                    : 'Tick data unavailable for this symbol/session. Start the historic API and set session start/end dates.'
            window.alert(msg)
            revertTvIntervalPill(revertPill)
            return
          }
          await yieldToMain()
          }
        } else if (leavingTickKind || leavingSubMinute) {
          // Leaving tick/seconds can be heavy (feed rebuild) — keep a short overlay.
          showOverlay('Updating chart…')
          await yieldToMain()
        }
        // Minute+ aggregates (1m↔5m↔1h↔4h) use in-memory 1m bars — no host overlay.
        // Overlay made higher TFs feel slower than 1m even though aggregation is cheap.

        if (enteringSeconds) await yieldToMain()
        let nextBars = buildBarsForIntervalPick(pick, cursorTimeSec)
        if (
          enteringSeconds &&
          isLocalSecondStep(pick.stepSec ?? 60) &&
          hasLocalSecondBars(pick.stepSec ?? 60) &&
          medianBarStepSec(nextBars) >= maxMedianStepForSecondBars(pick.stepSec ?? 60)
        ) {
          const step = pick.stepSec ?? 60
          setSourceSecondBars(step, await loadSourceSecondBars(step, { noCache: true }))
          nextBars = buildBarsForIntervalPick(pick, cursorTimeSec)
        }
        if (nextBars.length < 2) {
          window.alert(
            pick.kind === 'tick'
              ? 'Not enough tick history for this interval in the session.'
              : pick.kind === 'time' && (pick.stepSec ?? 60) < 60
                ? 'Not enough tick history to build this sub-minute interval.'
                : 'Not enough 1-minute history to build this interval for the session.',
          )
          revertTvIntervalPill(revertPill)
          return
        }

        const tvRes = intervalPillToTvResolution(pick.pill)
        const prevTvRes = intervalPillToTvResolution(chartTimeframe)

        chartBars = nextBars
        chartTimeframe = pick.pill
        intervalPill.textContent = pick.pill

        {
          // Auto select: replay always follows the TV/chart header interval.
          // Otherwise only clamp if the current replay step is no longer in the dock matrix.
          if (replayAutoSelectInterval) {
            if (replayTimeframe !== chartTimeframe) {
              replayTimeframe = chartTimeframe
              if (replayDockTf) replayDockTf.textContent = chartTimeframe
            }
          } else {
            const clampedReplay = clampReplayPillForChart(chartTimeframe, replayTimeframe)
            if (clampedReplay !== replayTimeframe) {
              replayTimeframe = clampedReplay
              if (replayDockTf) replayDockTf.textContent = clampedReplay
            }
          }
          syncReplayIntervalBtnTitle()
        }

        const resolutionChanged = tvRes !== prevTvRes
        const useLocalSecond = enteringSeconds && localSecondIntervalPick(pick)
        const preserveTvViewportOnSubMinuteEnter =
          (enteringTickKind || (enteringSeconds && !useLocalSecond)) && source1mBars.length >= 2
        const intervalRefit =
          useLocalSecond ||
          ((enteringTickKind || enteringSeconds) && !preserveTvViewportOnSubMinuteEnter) ||
          (chartResolutionWillChange &&
            !tickLoadUsedProgressive &&
            !enteringTickKind &&
            !enteringSeconds &&
            (resolutionChanged || leavingSubMinute || pick.pill !== prevPick?.pill))
        if ((enteringTickKind || enteringSeconds) && !preserveTvViewportOnSubMinuteEnter) {
          nextReplayTickFit = true
        }

        paintIntervalFavorites(applyIntervalPick, onIntervalPrefsChange)
        firstChartPaint = false
        state.trading?.setTradeMarkers([])
        state.tvChart?.setBacktestTradeMarkers([])
        backtestState.result = null
        backtestState.highlightTradeNum = undefined
        sidePanel?.clear()
        syncOrderPanelPosition()
        syncTradeNavUi()

        const nextIndex = resolveTickReplayIndex(chartBars, cursorTimeSec, {
          enteringTicks: enteringTickKind,
          prevIndex: replay.getState().index,
          prevBarsLen: replay.getBars().length,
        })

        const tickAtLiveEnd = enteringTickKind && nextIndex >= chartBars.length
        const tvViewSnap =
          tvSwapViewport ??
          (preserveTvViewportOnSubMinuteEnter && state.tvChart
            ? state.tvChart.captureLockedViewport()
            : null)
        if (enteringTickKind) {
          replayViewportLocked = false
          lockedTvViewport = null
          pendingTvViewportRestore = null
          state.tvChart?.setReplayLockedViewport(null)
          state.tvChart?.setViewportFreeze(null)
        }
        if (leavingTickKind || (leavingSubMinute && !enteringSeconds)) {
          tickPrefetchGen += 1
          tickPrefetchBusy = false
        }

        const replayPickResolved = resolveIntervalPick(replayTimeframe)
        const decoupledAfter =
          pick.pill !== replayTimeframe &&
          replayPickResolved != null &&
          canDecoupleReplay(pick, replayPickResolved)

        let decoupledActive = decoupledAfter
        if (decoupledAfter) {
          // Hour+ chart + sub-minute replay: don't block the interval swap on tick fetch
          // (ensureDukascopyTickSource can hang and leave the chart stuck loading).
          const chartStepSec = pick.stepSec ?? 60
          if (chartStepSec >= 3600 && isSubMinuteReplayPick(replayPickResolved!)) {
            decoupledActive = false
            replayTimeframe = chartTimeframe
            replayStepSourceBars = []
            if (replayDockTf) replayDockTf.textContent = chartTimeframe
            showReplayNotice(
              'Replay step reset to match chart interval (hour+ charts skip sub-minute tick load).',
            )
          } else {
            const stepBars = await resolveReplayStepBars(replayPickResolved!)
            if (isSubMinuteReplayPick(replayPickResolved!) && stepBars.length < 2) {
              decoupledActive = false
              replayTimeframe = chartTimeframe
              replayStepSourceBars = []
              if (replayDockTf) replayDockTf.textContent = chartTimeframe
              showReplayNotice(
                'Sub-minute replay step needs tick data — replay reset to match chart interval.',
              )
            } else {
              replayStepSourceBars = isSubMinuteReplayPick(replayPickResolved!) ? stepBars : []
            }
          }
        }

        if (!decoupledAfter) {
          replayTimeframe = chartTimeframe
          replayStepSourceBars = []
          if (replayDockTf) replayDockTf.textContent = chartTimeframe
        }

        if (decoupledActive) {
          const resolvedStepBars = isSubMinuteReplayPick(replayPickResolved!)
            ? replayStepSourceBars
            : buildReplayStepBars(source1mBars, replayPickResolved!)
          const resolvedReplayStepSec = effectiveReplayStepSec(
            resolvedStepBars,
            replayPickResolved!.stepSec ?? 60,
          )
          const stepIndex =
            preserveCursorEndSec != null
              ? stepIndexForCursorEnd(
                  resolvedStepBars,
                  resolvedReplayStepSec,
                  preserveCursorEndSec,
                )
              : resolvedStepBars.length
          const tvPast = decoupledChartReplayDisplay({
            chartBars,
            source1mBars,
            chartStepSec: pick.stepSec ?? 60,
            cursorEndSec: cursorEndSecForStepIndex(
              resolvedStepBars,
              resolvedReplayStepSec,
              stepIndex,
            ),
            sourceFineBars: replayStepSourceBars.length >= 2 ? replayStepSourceBars : undefined,
            fineStepSec: isSubMinuteReplayPick(replayPickResolved!)
              ? resolvedReplayStepSec
              : undefined,
          }).display.length
          if (tickLoadUsedProgressive) {
            skipTvReplayPaintOnce = true
            replay.replaceBarsAt(resolvedStepBars, stepIndex)
            skipTvReplayPaintOnce = false
          } else if (state.tvChart) {
            lockChartViewport(tvViewSnap)
            skipTvReplayPaintOnce = true
            const tvSeries = tvBarsForChart(chartBars)
            state.tvChart.noteResolution(tvRes)
            if (chartResolutionWillChange) {
              await state.tvChart.swapInterval(tvSeries, tvRes, tvPast, tvViewSnap, {
                refit: false,
                barPeriodSec: intervalPickBarPeriodSec(pick),
              })
            }
            replay.replaceBarsAt(resolvedStepBars, stepIndex)
            paintDecoupledReplayStepChange(stepIndex, tvViewSnap)
            skipTvReplayPaintOnce = false
          } else {
            replay.replaceBarsAt(resolvedStepBars, stepIndex)
          }
        } else if (tickLoadUsedProgressive) {
          skipTvReplayPaintOnce = true
          replay.replaceBarsAt(chartBars, nextIndex)
          skipTvReplayPaintOnce = false
        } else if (state.tvChart) {
          skipTvReplayPaintOnce = true
          const tvSeries = tvBarsForChart(chartBars)
          const tvPast =
            pick.kind === 'tick'
              ? tvRevealCountFromTickReplayIndex(nextIndex)
              : nextIndex
          // Prime feed before TV reset so getBars matches the new resolution immediately.
          state.tvChart.primeIntervalFeed(
            tvSeries,
            tvRes,
            tvPast,
            pick.kind === 'tick' ? 60 : intervalPickBarPeriodSec(pick),
          )
          await state.tvChart.swapInterval(tvSeries, tvRes, tvPast, intervalRefit ? null : tvViewSnap, {
            refit: intervalRefit,
            barPeriodSec: pick.kind === 'tick' ? 60 : intervalPickBarPeriodSec(pick),
          })
          if (tickAtLiveEnd || (pick.kind === 'tick' && tvPast >= tvSeries.length)) {
            state.tvChart.clearReplay()
          }
          replay.replaceBarsAt(chartBars, nextIndex)
          skipTvReplayPaintOnce = false
          // Don't re-apply the old (e.g. 1m) viewport onto a refit hour/4h chart — freezes TV.
          if (tvViewSnap && !intervalRefit) {
            requestAnimationFrame(() => {
              void state.tvChart?.restoreVisibleRange(tvViewSnap)
            })
          }
          if (enteringSeconds && !preserveTvViewportOnSubMinuteEnter) {
            requestAnimationFrame(() => {
              state.tvChart?.scrollReplayCursorIntoView()
            })
          }
          state.tvChart.flushPendingRefresh()
        } else {
          if (intervalRefit) nextReplayTickFit = true
          replay.replaceBarsAt(chartBars, nextIndex)
        }

        state.redrawDrawings?.()
        if (enteringTickKind) {
          maybeShowTickIntervalNotices(pick)
          void prefetchNextTickChunks()
        } else if (enteringSeconds) {
          maybeShowTickIntervalNotices(pick)
        } else if (leavingSubMinute) {
          hideReplayNotice()
        }
      } finally {
        if (overlayActive) setChartLoading(false)
        intervalPickBusy = false
        tvIntervalSwap.inProgress = false
        const queued = pendingTvHeaderIntervalPick
        pendingTvHeaderIntervalPick = null
        if (queued && queued.pill !== chartTimeframe && !state.disposed) {
          void applyIntervalPick(queued)
        }
      }
    }

    function paintIntervalFavorites(
      onPick: (pick: IntervalPick) => void,
      onPrefsChange?: () => void,
    ) {
      if (!intervalFavsEl) return
      const favs = getFavoriteIntervals()
      intervalFavsEl.innerHTML = ''
      if (!favs.length) {
        intervalFavsEl.hidden = true
        return
      }
      intervalFavsEl.hidden = false
      for (const pick of favs) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'rw-pill-btn rw-interval-fav'
        btn.textContent = pick.pill
        btn.title = `${pick.label} — double-click to remove from favorites`
        btn.classList.toggle('rw-interval-fav--active', pick.pill === chartTimeframe)
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          onPick(pick)
        })
        btn.addEventListener('dblclick', (e) => {
          e.stopPropagation()
          e.preventDefault()
          removeFavoriteInterval(pick.pill)
          paintIntervalFavorites(onPick, onPrefsChange)
          onPrefsChange?.()
        })
        intervalFavsEl.appendChild(btn)
      }
    }

    const onIntervalPrefsChange = () => {
      paintIntervalFavorites(applyIntervalPick, onIntervalPrefsChange)
      intervalMenu.refreshPreferences()
    }

    const intervalMenu = createChartIntervalMenu({
      anchor: intervalPill,
      getSelectedPill: () => chartTimeframe,
      canResampleFrom1m: () => canResample,
      canUseTicks: () => canUseTickIntervals(),
      canUseSubMinute: () => canUseSubMinuteIntervals(),
      onSelect: (p) => {
        void applyIntervalPick(p)
      },
      onPreferencesChange: onIntervalPrefsChange,
      onOpenChange: (v) => intervalPill.setAttribute('aria-expanded', v ? 'true' : 'false'),
    })

    onIntervalPrefsChange()

    const replayIntervalMenu = replayIntervalBtn
      ? createChartIntervalMenu({
          anchor: replayIntervalBtn,
          getSelectedPill: () => replayTimeframe,
          canResampleFrom1m: () => canResample,
          canUseTicks: () => canUseTickIntervals(),
          canUseSubMinute: () => canUseSubMinuteIntervals(),
          items: REPLAY_DOCK_INTERVALS,
          getItems: () => replayDockIntervalsForChart(chartTimeframe) ?? REPLAY_DOCK_INTERVALS,
          variant: 'replay',
          showCustomInterval: false,
          getAutoSelectInterval: () => replayAutoSelectInterval,
          setAutoSelectInterval: (on) => {
            replayAutoSelectInterval = on
            writeReplayAutoSelectInterval(on)
            syncReplayIntervalBtnTitle()
            if (on && replayTimeframe !== chartTimeframe) {
              const chartPick = resolveIntervalPick(chartTimeframe)
              if (chartPick) void applyReplayIntervalPick(chartPick)
            }
          },
          onSelect: (p) => {
            void applyReplayIntervalPick(p)
          },
          onOpenChange: (open) => {
            replayIntervalBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
            replayIntervalBtn.classList.toggle('rw-replay-dock__interval--open', open)
          },
          getDismissTargets: () => {
            const out: Array<Document | EventTarget | null> = [
              chartHost,
              chartLwc,
              chartTv,
              chartCanvas,
            ]
            const iframe =
              chartTv.querySelector('iframe') ?? chartHost.querySelector('iframe')
            if (iframe) {
              out.push(iframe)
              try {
                if (iframe.contentDocument) out.push(iframe.contentDocument)
              } catch {
                /* cross-origin — blur handler still covers focus into iframe */
              }
            }
            return out
          },
        })
      : null
    syncReplayIntervalBtnTitle()

    const onIntervalPillClick = (e: MouseEvent) => {
      e.stopPropagation()
      replayIntervalMenu?.close()
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
      e.preventDefault()
      intervalMenu.close()
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
    trading?.chart.resize(chartHost.clientWidth, chartHost.clientHeight)
    if (state.tvChart) {
      if (!tvBootPaintDone) {
        await paintTvBootChart()
      }
    } else if (!paintedWithNonZeroHost) {
      nextReplayTickFit = true
      onReplayTick(replay.slice(), replay.getState().index)
      if (hostLaidOut) paintedWithNonZeroHost = true
    }

    if (!bootLoadingFinished) await dismissBootAfterPaint()

    function resolveReplayPickIndex(y: number, m0: number, d: number, hh: number, mm: number): number {
      const pick = resolveIntervalPick(chartTimeframe)
      if (pick?.kind === 'tick' && tickBarSeries) {
        const { index, clamped } = replayIndexForPickTime(tickBarSeries, y, m0, d, hh, mm)
        if (clamped) {
          const lastMs = tickTimeMsAtBar(tickBarSeries, tickBarSeries.bars.length - 1)
          showReplayNotice(
            lastMs != null
              ? `Selected moment is beyond loaded ticks (last ${formatQuoteTickPickLabelLocal(lastMs).replace(/^Re: /, '')}). Jumped to the closest available tick.`
              : 'Selected moment is beyond loaded ticks. Jumped to the closest available tick.',
          )
        }
        return index
      }
      const bars = replay.getBars()
      const { index, clamped } = findReplayBarIndex(bars, y, m0, d, hh, mm)
      if (clamped) {
        const lastBar = bars[bars.length - 1]
        showReplayNotice(
          lastBar
            ? `Selected moment is beyond loaded candles (last bar ${formatChartCrosshairTime(lastBar.time)}). Jumped to the closest available bar.`
            : 'No candles loaded for the selected date.',
        )
      }
      return index
    }

    function syncPlayBtnPaused() {
      const playBtn = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
      setReplayPlayButtonIcon(playBtn, false)
    }

    /** Seek replay cursor; scrolls into view only when viewport is not locked. */
    async function seekReplayToIndex(
      index: number,
      loadingMsg: string | false = 'Updating chart…',
      opts?: { fit?: boolean; preserveView?: boolean },
    ) {
      const tickTv = isTickTvReplay()
      const preserveStepView = opts?.preserveView === true
      const holdView =
        tickTv && source1mBars.length >= 2
          ? true
          : tickTv
            ? false
            : preserveStepView || (opts?.preserveView ?? replayViewportLocked)
      if (!holdView) {
        replayViewportLocked = false
        lockedTvViewport = null
        pendingTvViewportRestore = null
        state.tvChart?.setReplayLockedViewport(null)
        state.tvChart?.setViewportFreeze(null)
      }
      const showOverlay = loadingMsg !== false && !tvChartMode
      if (showOverlay) setChartLoading(true, loadingMsg)
      let viewSnap: TvLockedViewport | null = null
      try {
        replay.pause()
        syncPlayBtnPaused()
        if (opts?.fit && !tickTv) nextReplayTickFit = true
        if ((holdView || (tickTv && source1mBars.length >= 2)) && state.tvChart) {
          viewSnap = lockedTvViewport ?? state.tvChart.captureLockedViewport()
          if (viewSnap) pendingTvViewportRestore = viewSnap
        }
        if (preserveStepView && state.tvChart) {
          nextReplayTickStepPreserve = true
          nextReplayTickChartViewSnap =
            viewSnap ?? state.tvChart.captureLockedViewport()
        }
        if (tickTv) skipTvReplayPaintOnce = true
        replay.setIndex(index)
        skipTvReplayPaintOnce = false
        if (state.tvChart) state.tvChart.flushPendingRefresh()
        setReplayDockOpen(true)
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
        if (tickTv && state.tvChart) {
          const tvSeries = tvBarsForChart(chartBars)
          const tvPast = tvRevealCountFromTickReplayIndex(index)
          const snap = viewSnap ?? state.tvChart.captureLockedViewport()
          state.tvChart.swapInterval(
            tvSeries,
            intervalPillToTvResolution(chartTimeframe),
            tvPast,
            snap,
            { refit: false, barPeriodSec: 60 },
          )
          if (snap) {
            await state.tvChart.restoreVisibleRange(snap)
          }
        } else if (preserveStepView && viewSnap && state.tvChart) {
          await state.tvChart.restoreVisibleRange(viewSnap)
        } else if (!holdView) {
          userViewportPinned = false
          if (state.trading) {
            state.trading.scrollReplayCursorIntoView()
          } else if (state.tvChart) {
            state.tvChart.scrollReplayCursorIntoView()
          }
        } else if (viewSnap && state.tvChart) {
          const slice = replay.slice()
          if (state.tvChart.lockedViewportCoversBars(viewSnap, slice)) {
            // One restore is enough — a delayed second restore blinked the chart.
            await state.tvChart.restoreVisibleRange(viewSnap)
          } else {
            state.tvChart.scrollReplayCursorIntoView()
          }
        }
      } finally {
        if (showOverlay) setChartLoading(false)
        else if (tvChartMode) forceClearChartLoading()
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

    type ReplaySelectMode = 'bar' | 'date' | 'first' | 'random'
    let replaySelectMode: ReplaySelectMode = 'bar'
    let lastPointerClientX: number | null = null
    let lastPointerClientY: number | null = null
    let lastSnappedSliceIndex = 0
    let pickStableIdx = 0
    let lastPickPreviewIdx = -1

    function applySelectBarPickPreview(idx: number) {
      if (idx === lastPickPreviewIdx) return
      lastPickPreviewIdx = idx
      // Keep full series visible during pick — CSS blur wash covers candles to the right
      // of the scissors line (do not truncate / hide future bars).
    }

    function captureLockedChartViewport(): {
      tv: TvLockedViewport | null
      lwc: { from: number; to: number } | null
    } {
      const tv = state.tvChart?.captureLockedViewport() ?? null
      const lwc = state.trading?.chart.timeScale().getVisibleLogicalRange() ?? null
      return {
        tv,
        lwc:
          lwc && Number.isFinite(Number(lwc.from)) && Number.isFinite(Number(lwc.to))
            ? { from: Number(lwc.from), to: Number(lwc.to) }
            : null,
      }
    }

    async function restoreLockedChartViewport(saved: {
      tv: TvLockedViewport | null
      lwc: { from: number; to: number } | null
    }) {
      if (saved.tv && state.tvChart) {
        await state.tvChart.restoreVisibleRange(saved.tv)
      }
      if (saved.lwc && state.trading) {
        state.trading.chart.timeScale().setVisibleLogicalRange(saved.lwc as LogicalRange)
      }
    }

    function setSelectBarPointerInChart(inChart: boolean) {
      selectBarOverlay?.classList.toggle('rw-select-bar-overlay--pointer-in', inChart)
      selectBarTimeFlyout?.classList.toggle('rw-select-bar-overlay--pointer-in', inChart)
      if (!inChart) setSelectBarOverLegend(false)
    }

    /** Drag-session cache — avoid rebuilding decoupled paint / layout on every pointer move. */
    let scissorsPickCache: {
      visible: Bar[]
      maxIdx: number
      plotOffsetX: number
      chartStepSec: number
      lineXByIdx: Map<number, number>
    } | null = null

    function clearScissorsPickCache() {
      scissorsPickCache = null
    }

    function refreshScissorsPickCache() {
      const visible = (() => {
        if (!isDecoupledReplay()) return replay.slice()
        const paint = decoupledReplayPaint(replay.getState().index)
        return paint?.display.length ? paint.display : chartBars
      })()
      const chartPick = resolveIntervalPick(chartTimeframe)
      const chartStepSec = chartPick?.stepSec ?? 60
      let maxIdx = 0
      if (state.tvChart && state.tickReplayUnit === 'tick' && source1mBars.length >= 2) {
        maxIdx = Math.max(0, tvRevealCountFromTickReplayIndex(replay.getState().index) - 1)
      } else if (isDecoupledReplay()) {
        maxIdx = Math.max(0, visible.length - 1)
      } else {
        maxIdx = Math.max(0, visible.length - 1)
      }
      const layout = state.tvChart?.getPlotLayout(chartHost)
      // Prefer measured plot canvas offset; iframe-only fallback when plot not ready.
      let plotOffsetX =
        layout && layout.width > 0
          ? layout.plotOffsetX
          : (layout?.iframeOffsetX ?? layout?.plotOffsetX ?? 0)
      // Guard against a mis-picked canvas (huge left inset → every pick maps to bar 0).
      const hostW = Math.max(1, chartHost.clientWidth)
      if (plotOffsetX > hostW * 0.35) {
        plotOffsetX = layout?.iframeOffsetX ?? 0
      }
      scissorsPickCache = {
        visible,
        maxIdx,
        plotOffsetX,
        chartStepSec,
        lineXByIdx: new Map(),
      }
    }

    function ensureScissorsPickCache() {
      if (!scissorsPickCache) refreshScissorsPickCache()
      return scissorsPickCache!
    }

    /** Chart candles visible for scissors pick (decoupled: 2m display; coupled: replay slice). */
    function scissorsVisibleChartBars(): Bar[] {
      if (selectBarChartActive && scissorsPickCache) return scissorsPickCache.visible
      if (!isDecoupledReplay()) return replay.slice()
      const paint = decoupledReplayPaint(replay.getState().index)
      return paint?.display.length ? paint.display : chartBars
    }

    /** Map scissors pick (chart candle index) → 1-based replay transport index (decoupled only). */
    function replayCutIndexFromScissorsPick(chartPickIdx: number): number {
      const chartPick = resolveIntervalPick(chartTimeframe)
      const replayPick = resolveIntervalPick(replayTimeframe)
      if (!chartPick || !replayPick) return Math.max(1, chartPickIdx + 1)

      const stepBars = replay.getBars()
      if (!stepBars.length) return 1

      const replayStepSec = effectiveReplayStepSec(stepBars, replayPick.stepSec ?? 60)
      const chartStepSec = chartPick.stepSec ?? 60
      const pickIdx = Math.max(0, Math.min(maxPickBarIndex(), Math.round(chartPickIdx)))

      const visible = scissorsVisibleChartBars()
      const visibleCount = visible.length
      const atLiveFormingEdge =
        visibleCount > 0 && pickIdx === visibleCount - 1 && pickIdx === maxPickBarIndex()

      const chartBar = visible[Math.min(pickIdx, Math.max(0, visible.length - 1))]
      const cursorEndSec = atLiveFormingEdge
        ? cursorEndSecForStepIndex(stepBars, replayStepSec, replay.getState().index)
        : chartBar
          ? Number(chartBar.time) + chartStepSec
          : 0

      if (cursorEndSec <= 0) return Math.max(1, pickIdx + 1)
      return Math.max(1, stepIndexForCursorEnd(stepBars, replayStepSec, cursorEndSec))
    }

    /** True when first/last candle X are distinct — stale TV scale collapses every pick to bar 0. */
    function scissorsPlotSplitsReady(): boolean {
      const maxIdx = scissorsPickCache?.maxIdx ?? maxPickBarIndex()
      if (maxIdx < 1) return true
      const x0 = lineXAtBarIndex(0)
      const xMax = lineXAtBarIndex(maxIdx)
      return x0 != null && xMax != null && Math.abs(xMax - x0) > 2
    }

    /** Align TV series with chart candles before scissors pick (2m+ / decoupled). */
    function primeTvFeedForScissorsPick(): void {
      if (!state.tvChart) return
      const chartPick = resolveIntervalPick(chartTimeframe)
      if (!chartPick) return
      const index = replay.getState().index
      // Capture pan/zoom BEFORE any paint — without restore, second-step scissors can jump.
      const savedView = state.tvChart.captureLockedViewport()

      if (isDecoupledReplay()) {
        // Always force a full paint so the time scale has distinct X per bar.
        // Incremental tickDecoupledReplay (or skipping paint) leaves a stale scale →
        // scissors stuck on the leftmost candle.
        syncDecoupledTvFeed(index, 'paint', savedView, { forceFull: true })
        state.tvChart.flushPendingRefresh()
        return
      }

      // Coupled: ensure pending TV layout is flushed before we cache plot offsets.
      state.tvChart.flushPendingRefresh()
    }

    /** Workspace / display bars may be sec or ms — scissors compare against TV unix seconds. */
    function scissorsBarOpenSec(bar: Bar): number {
      const t = Number(bar.time)
      if (!Number.isFinite(t)) return 0
      return t > 1e12 ? Math.floor(t / 1000) : Math.floor(t)
    }

    /**
     * Snap scissors to the candle under the pointer.
     * Prefer geometry (same X space as the overlay line) so a bad plotOffsetX cannot
     * pin every pick to index 0 / leftmost candle.
     */
    function pickScissorsBarIndexAtClientX(clientX: number): number {
      const cache = ensureScissorsPickCache()
      const maxIdx = cache.maxIdx
      if (!state.tvChart) return Math.max(0, Math.min(maxIdx, pickStableIdx))

      const hostRect = chartHost.getBoundingClientRect()
      const offset = tvPlotOffsetX()
      const chartStepSec = cache.chartStepSec
      const visible = cache.visible
      const px = clientX - hostRect.left

      // 1) Geometric snap — line X and pick share one coordinate system.
      if (maxIdx >= 1) {
        const x0 = lineXAtBarIndex(0)
        const xMax = lineXAtBarIndex(maxIdx)
        if (x0 != null && xMax != null && Math.abs(xMax - x0) > 2) {
          let lo = 0
          let hi = maxIdx
          while (lo < hi) {
            const mid = (lo + hi) >> 1
            const xMid = lineXAtBarIndex(mid)
            if (xMid == null) break
            if (px > xMid) lo = mid + 1
            else hi = mid
          }
          let candidate = Math.max(0, Math.min(maxIdx, lo))
          if (candidate > 0) {
            const xPrev = lineXAtBarIndex(candidate - 1)
            const xCur = lineXAtBarIndex(candidate)
            if (xPrev != null && xCur != null && px < (xPrev + xCur) / 2) candidate -= 1
          }
          return candidate
        }
      }

      // 2) Time-bucket snap (minute+ / decoupled display bars) — normalize sec vs ms.
      if (chartStepSec >= 60 && visible.length) {
        const sec = state.tvChart.timeSecAtClientX(clientX, hostRect.left, offset)
        if (sec != null) {
          for (let i = 0; i <= maxIdx && i < visible.length; i++) {
            const open = scissorsBarOpenSec(visible[i]!)
            const nextOpen =
              i + 1 < visible.length ? scissorsBarOpenSec(visible[i + 1]!) : open + chartStepSec
            if (sec >= open && sec < nextOpen) return i
          }
          const firstOpen = scissorsBarOpenSec(visible[0]!)
          if (sec < firstOpen) return 0
          return maxIdx
        }
      }

      // 3) Feed / split pick (tick-remapped and fallback).
      return state.tvChart.pickIndexAtClientX(clientX, hostRect.left, maxIdx, offset)
    }

    function maxPickBarIndex(): number {
      if (selectBarChartActive && scissorsPickCache) return scissorsPickCache.maxIdx
      if (state.tvChart && state.tickReplayUnit === 'tick' && source1mBars.length >= 2) {
        return Math.max(0, tvRevealCountFromTickReplayIndex(replay.getState().index) - 1)
      }
      if (isDecoupledReplay()) {
        const visible = scissorsVisibleChartBars()
        return Math.max(0, visible.length - 1)
      }
      const slice = replay.slice()
      if (!slice.length) return 0
      // Last bar actually drawn on the chart (exclude unplayed bars in the dataset).
      return slice.length - 1
    }

    function tvPlotOffsetX(): number {
      // Stable offset for the scissors session — remasuring every move can overshoot and
      // pin timeSecAtClientX to range.from (leftmost candle). Refresh on open / range change.
      if (selectBarChartActive && scissorsPickCache) return scissorsPickCache.plotOffsetX
      const layout = state.tvChart?.getPlotLayout(chartHost)
      return layout?.plotOffsetX ?? layout?.iframeOffsetX ?? 0
    }

    function clampClientXToLastCandle(clientX: number): number {
      const maxIdx = maxPickBarIndex()
      const xMax = lineXAtBarIndex(maxIdx)
      if (xMax == null || !Number.isFinite(xMax)) return clientX
      const hostRect = chartHost.getBoundingClientRect()
      const lastClientX = hostRect.left + xMax
      return Math.min(clientX, lastClientX)
    }

    function updateSelectBarPastEndCover() {
      if (!selectBarOverlay) return
      const maxIdx = maxPickBarIndex()
      const xMax = lineXAtBarIndex(maxIdx)
      if (xMax == null || !Number.isFinite(xMax)) {
        selectBarOverlay.style.setProperty('--sb-past-end-left', '100%')
        return
      }
      // Start just after the last candle center so empty future space cannot drive TV’s cursor.
      selectBarOverlay.style.setProperty('--sb-past-end-left', `${Math.max(0, xMax + 1)}px`)
    }

    function pickIndexAtClientX(clientX: number): number {
      const allBars = replay.getBars()
      if (allBars.length === 0) return pickStableIdx
      const maxIdx = maxPickBarIndex()
      const clampedX = clampClientXToLastCandle(clientX)
      if (state.tvChart) {
        const raw = pickScissorsBarIndexAtClientX(clampedX)
        return Math.max(0, Math.min(maxIdx, stabilizeScissorsPickIndex(clampedX, raw, pickStableIdx)))
      }
      if (!state.trading) return pickStableIdx
      const rect = chartLwc.getBoundingClientRect()
      const x = clampedX - rect.left
      const logical = state.trading.chart.timeScale().coordinateToLogical(x)
      if (logical == null || !Number.isFinite(Number(logical))) return Math.min(pickStableIdx, maxIdx)
      return Math.max(0, Math.min(maxIdx, Math.round(Number(logical))))
    }

    /** X in chart-host pixels — snapped to split after candle (TV) or logical index (LWC). */
    function lineXAtBarIndex(idx: number): number | null {
      if (state.tvChart) {
        if (selectBarChartActive && scissorsPickCache) {
          const cached = scissorsPickCache.lineXByIdx.get(idx)
          if (cached != null) return cached
        }
        const offset = tvPlotOffsetX()
        const visible = scissorsVisibleChartBars()
        const bar = visible[idx]
        const chartStepSec =
          scissorsPickCache?.chartStepSec ?? resolveIntervalPick(chartTimeframe)?.stepSec ?? 60
        // Prefer bar-open time when scissors is active (1m feed can still be tick-remapped after seconds).
        let x: number | null = null
        if (selectBarChartActive && bar && chartStepSec >= 60) {
          x = state.tvChart.lineXAtBarTimeSec(scissorsBarOpenSec(bar), offset)
        }
        if (x == null) {
          x = state.tvChart.lineXAtBarIndex(idx, 0, offset)
        }
        if (x == null && bar && chartStepSec >= 60) {
          x = state.tvChart.lineXAtBarTimeSec(scissorsBarOpenSec(bar), offset)
        }
        if (x != null && selectBarChartActive && scissorsPickCache) {
          scissorsPickCache.lineXByIdx.set(idx, x)
        }
        return x
      }
      const bar = isDecoupledReplay()
        ? scissorsVisibleChartBars()[idx]
        : replay.getBars()[idx]
      if (!bar || !state.trading) return null
      const ts = state.trading.chart.timeScale()
      const coord = isDecoupledReplay()
        ? ts.timeToCoordinate(bar.time as Time)
        : ts.logicalToCoordinate(idx as Logical)
      if (coord == null || !Number.isFinite(Number(coord))) return null
      const spacing = ts.options().barSpacing ?? 6
      return Number(coord) + spacing / 2
    }

    function hideTvReplayMask() {
      if (!replayMaskOverlay) return
      replayMaskOverlay.hidden = true
      replayMaskOverlay.setAttribute('aria-hidden', 'true')
    }

    function applyPlotClipVars(
      target: HTMLElement | null,
      clip: { top: number; bottom: number; left: number; right: number } | null,
    ) {
      if (!target) return
      if (clip) {
        target.style.setProperty('--sb-top', `${clip.top}px`)
        target.style.setProperty('--sb-bottom', `${clip.bottom}px`)
        target.style.setProperty('--sb-left', `${clip.left}px`)
        target.style.setProperty('--sb-right', `${clip.right}px`)
      } else {
        target.style.removeProperty('--sb-top')
        target.style.removeProperty('--sb-bottom')
        target.style.removeProperty('--sb-left')
        target.style.removeProperty('--sb-right')
      }
    }

    /** Keep scissors clear of the icon half-height at the plot edges. */
    const SELECT_BAR_SCISSORS_PAD_PX = 8
    /** Wash starts just below OHLC / above Volume so candle tips in that band stay hidden. */
    const SELECT_BAR_LEGEND_CLEAR_PX = 30
    /**
     * Minimum bottom inset so wash never paints over the time-axis label strip.
     */
    const SELECT_BAR_WASH_BOTTOM_MIN_PX = 72
    /** Keep wash off the right price scale (“clock” axis). */
    const SELECT_BAR_PRICE_AXIS_RIGHT_MIN_PX = 72
    /** Ignore click-to-pick after a drag/pan larger than this. */
    const SELECT_BAR_PAN_SLOP_PX = 8

    function readSelectBarClipInsets(): {
      top: number
      bottom: number
      left: number
      right: number
    } {
      const measured = state.tvChart ? state.tvChart.getPlotClipInsets(chartHost) : null
      if (measured) {
        return {
          top: Math.max(0, measured.top),
          bottom: measured.bottom,
          left: measured.left,
          right: measured.right,
        }
      }
      return { top: 0, bottom: 0, left: 0, right: 56 }
    }

    function setSelectBarOverLegend(_over: boolean) {
      // No longer clamp / hide for a fake “OHLC ceiling” — full-chart travel.
      selectBarOverlay?.classList.remove('rw-select-bar-overlay--over-legend')
    }

    /** Full price pane — scissors track anywhere in the plot. */
    function pointerInSelectBarPlot(clientX: number, clientY: number): boolean {
      const hostRect = chartHost.getBoundingClientRect()
      const clip = readSelectBarClipInsets()
      const left = hostRect.left + clip.left
      const right = hostRect.right - clip.right
      const top = hostRect.top + clip.top
      const bottom = hostRect.bottom - clip.bottom
      return clientX >= left && clientX <= right && clientY >= top && clientY <= bottom
    }

    function updateSelectBarPlotClip() {
      const clip = readSelectBarClipInsets()
      applyPlotClipVars(selectBarOverlay, clip)
      applyPlotClipVars(replayMaskOverlay, clip)
      applyPlotClipVars(selectBarTimeFlyout, clip)
      if (selectBarOverlay) {
        // Wash just below OHLC (above Volume); keep off time axis + price scales.
        const washTop = clip.top + SELECT_BAR_LEGEND_CLEAR_PX
        const washBottom = Math.max(SELECT_BAR_WASH_BOTTOM_MIN_PX, clip.bottom)
        const axisRight = Math.max(SELECT_BAR_PRICE_AXIS_RIGHT_MIN_PX, clip.right)
        selectBarOverlay.style.setProperty('--sb-blur-top', `${washTop}px`)
        selectBarOverlay.style.setProperty('--sb-blur-bottom', `${washBottom}px`)
        selectBarOverlay.style.setProperty('--sb-right', `${axisRight}px`)
        selectBarOverlay.style.setProperty('--sb-left', `${Math.max(0, clip.left)}px`)
        selectBarOverlay.style.setProperty('--sb-hit-top', `${clip.top}px`)
        selectBarOverlay.style.setProperty('--sb-line-top', `${clip.top}px`)
        selectBarOverlay.style.removeProperty('--sb-ohlc-cut-h')
        selectBarOverlay.style.removeProperty('--sb-hit-bottom')
        selectBarOverlay.style.removeProperty('--sb-wash-bottom')
        selectBarOverlay.style.removeProperty('--sb-legend-notch-w')
        selectBarOverlay.style.removeProperty('--sb-legend-notch-h')
      }
    }

    /** Park wash/line off-chart until the pointer places a scissors pick. */
    function parkSelectBarCursorOffChart() {
      if (!selectBarOverlay) return
      updateSelectBarPlotClip()
      const clip = readSelectBarClipInsets()
      const w = selectBarOverlay.clientWidth || 0
      const axisRight = Math.max(SELECT_BAR_PRICE_AXIS_RIGHT_MIN_PX, clip.right)
      const x = Math.max(clip.left, w - axisRight)
      selectBarOverlay.style.setProperty('--sx', `${x}px`)
      selectBarOverlay.style.setProperty('--sy', `${clip.top + SELECT_BAR_SCISSORS_PAD_PX}px`)
      chartCanvas.style.setProperty('--rw-sb-sx', `${x}px`)
    }

    function paintSelectBarCursor(lineX: number, offsetY?: number) {
      if (!selectBarOverlay) return
      updateSelectBarPlotClip()
      const clip = readSelectBarClipInsets()
      const w = selectBarOverlay.clientWidth
      const h = selectBarOverlay.clientHeight
      const axisRight = Math.max(SELECT_BAR_PRICE_AXIS_RIGHT_MIN_PX, clip.right)
      const x = Math.max(clip.left, Math.min(w - axisRight, lineX))
      // Scissors travel the full plot height.
      const yMin = clip.top + SELECT_BAR_SCISSORS_PAD_PX
      const yMax = Math.max(yMin, h - clip.bottom - SELECT_BAR_SCISSORS_PAD_PX)
      const midY = yMin + (yMax - yMin) * 0.42
      const y =
        offsetY != null && Number.isFinite(offsetY)
          ? Math.max(yMin, Math.min(yMax, offsetY))
          : midY
      selectBarOverlay.style.setProperty('--sx', `${x}px`)
      selectBarOverlay.style.setProperty('--sy', `${y}px`)
      setSelectBarOverLegend(false)
      updateSelectBarPastEndCover()

      const canvasRect = chartCanvas.getBoundingClientRect()
      const hostRect = chartHost.getBoundingClientRect()
      chartCanvas.style.setProperty('--rw-sb-sx', `${hostRect.left - canvasRect.left + x}px`)
    }

    function formatSelectBarPickLabel(idx: number): string {
      if (state.tickReplayUnit === 'tick' && state.tvChart && source1mBars.length >= 2) {
        const chartSec = state.tvChart.chartBarTimeSecAtIndex(idx)
        if (chartSec != null) return formatChartPickLabelUtc(chartSec)
        const candle = source1mBars[Math.max(0, Math.min(source1mBars.length - 1, idx))]
        if (candle) return formatChartPickLabelUtc(Number(candle.time))
      }
      if (tickBarSeries && state.tickReplayUnit === 'tick') {
        const ms = tickTimeMsAtBar(tickBarSeries, idx)
        if (ms != null) {
          return formatQuoteTickPickLabelLocal(ms)
        }
      }
      const bar = scissorsVisibleChartBars()[idx] ?? replay.getBars()[idx]
      if (!bar) return ''
      if (state.tvChart) return formatChartPickLabelUtc(scissorsBarOpenSec(bar))
      return formatLocalPickLabel(Number(bar.time))
    }

    /** Reduce scissors jitter — keep prior bar until pointer crosses the midpoint between neighbors. */
    function stabilizeScissorsPickIndex(clientX: number, rawIdx: number, prevIdx: number): number {
      if (rawIdx === prevIdx) return rawIdx
      const hi = Math.max(prevIdx, rawIdx)
      const lo = Math.min(prevIdx, rawIdx)
      if (hi - lo !== 1) return rawIdx

      // Tick remapped zones keep prior special-case guard.
      const tickZone = isTickTvPickZone(rawIdx) || isTickTvPickZone(prevIdx)
      if (tickZone && !isTickTvReplay()) return rawIdx

      const hostRect = chartHost.getBoundingClientRect()
      const px = clientX - hostRect.left
      const loX = lineXAtBarIndex(lo)
      const hiX = lineXAtBarIndex(hi)
      if (loX == null || hiX == null) return rawIdx
      const mid = (loX + hiX) / 2
      return px < mid ? lo : hi
    }

    function updateSelectBarLabel(clientX: number): number {
      const idx = pickIndexAtClientX(clampClientXToLastCandle(clientX))
      pickStableIdx = idx
      lastSnappedSliceIndex = idx
      applySelectBarPickPreview(idx)
      if (selectBarTimeEl) selectBarTimeEl.textContent = formatSelectBarPickLabel(idx)
      updateSelectBarPastEndCover()
      return idx
    }

    function syncSelectBarLineAtIndex(idx: number, offsetY?: number) {
      const lineX = lineXAtBarIndex(idx)
      if (lineX == null) return false
      paintSelectBarCursor(lineX, offsetY)
      return true
    }

    let selectBarSyncRaf = 0
    let pendingSelectBarPointer: { x: number; y: number } | null = null
    let unsubscribeTvTimeScaleChange: (() => void) | null = null

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
      if (!pointerInSelectBarPlot(clientX, clientY)) {
        // Leave plot — hide scissors chrome until the pointer returns.
        setSelectBarPointerInChart(false)
        setSelectBarOverLegend(false)
        return
      }
      const hostRect = chartHost.getBoundingClientRect()
      const y = clientY - hostRect.top
      const clampedX = clampClientXToLastCandle(clientX)
      lastPointerClientX = clampedX
      lastPointerClientY = clientY
      const idx = pickIndexAtClientX(clampedX)
      const idxChanged = idx !== pickStableIdx
      pickStableIdx = idx
      lastSnappedSliceIndex = idx
      const lineX = lineXAtBarIndex(idx)
      updateSelectBarPastEndCover()
      // Keep TV crosshair suppressed — empty future space must not show a black time badge.
      state.tvChart?.setCrosshairVisible(false)
      if (lineX != null) {
        paintSelectBarCursor(lineX, y)
        setSelectBarPointerInChart(true)
        if (idxChanged) {
          if (selectBarTimeEl) selectBarTimeEl.textContent = formatSelectBarPickLabel(idx)
          applySelectBarPickPreview(idx)
        }
      } else {
        const prevSx = selectBarOverlay?.style.getPropertyValue('--sx')
        const fallbackX = prevSx ? Number.parseFloat(prevSx) : null
        if (fallbackX != null && Number.isFinite(fallbackX)) {
          paintSelectBarCursor(fallbackX, y)
          setSelectBarPointerInChart(true)
          if (idxChanged && selectBarTimeEl) {
            selectBarTimeEl.textContent = formatSelectBarPickLabel(idx)
          }
        }
      }
    }

    const resyncSelectBarOverlay = () => {
      updateSelectBarPlotClip()
      // Only keep chrome if the pointer is still over the plot.
      if (
        lastPointerClientX == null ||
        lastPointerClientY == null ||
        !pointerInSelectBarPlot(lastPointerClientX, lastPointerClientY)
      ) {
        setSelectBarPointerInChart(false)
        return
      }
      const hostRect = chartHost.getBoundingClientRect()
      const y = lastPointerClientY - hostRect.top
      if (syncSelectBarLineAtIndex(pickStableIdx, y)) {
        if (selectBarTimeEl) selectBarTimeEl.textContent = formatSelectBarPickLabel(pickStableIdx)
        setSelectBarPointerInChart(true)
      }
      updateSelectBarPastEndCover()
      state.tvChart?.setCrosshairVisible(false)
    }

    const onSelectBarChartRangeChange = () => {
      if (!selectBarChartActive) return
      // Viewport moved — refresh layout offset / line X only (keep visible bars; avoid re-paint).
      if (scissorsPickCache) {
        const layout = state.tvChart?.getPlotLayout(chartHost)
        let nextOff =
          layout?.plotOffsetX ?? layout?.iframeOffsetX ?? scissorsPickCache.plotOffsetX
        const hostW = Math.max(1, chartHost.clientWidth)
        if (nextOff > hostW * 0.35) nextOff = layout?.iframeOffsetX ?? scissorsPickCache.plotOffsetX
        scissorsPickCache.plotOffsetX = nextOff
        scissorsPickCache.lineXByIdx.clear()
      } else {
        refreshScissorsPickCache()
      }
      resyncSelectBarOverlay()
    }

    function setReplaySelectUi(mode: ReplaySelectMode) {
      replaySelectMode = mode
      if (replaySelectLabel) {
        const labels: Record<ReplaySelectMode, string> = {
          bar: 'Select bar',
          date: 'Select date',
          first: 'First Available Bar',
          random: 'Random date',
        }
        replaySelectLabel.textContent = labels[mode]
      }
      if (replaySelectIco) {
        const icos: Record<ReplaySelectMode, string> = {
          bar: icons.replayBarSelect,
          date: icons.replaySelectDate,
          first: icons.replayFlag,
          random: icons.replayDice,
        }
        replaySelectIco.innerHTML = icos[mode]
      }
      host.querySelectorAll('.rw-replay-start-menu__item').forEach((el) => {
        const id = (el as HTMLElement).dataset.rwReplayStart
        el.classList.toggle('rw-replay-start-menu__item--active', id === mode)
      })
      host.querySelectorAll('.rw-replay-hub__card').forEach((el) => {
        const id = (el as HTMLElement).dataset.rwReplayStart
        el.classList.toggle('rw-replay-hub__card--active', id === mode)
      })
      syncReplaySelectSelectedChrome()
    }

    /** Black-fill select control while a start mode is actively engaged. */
    function syncReplaySelectSelectedChrome() {
      const selected = selectBarChartActive || replaySelectMode !== 'bar'
      btnSelectBarChart?.classList.toggle('rw-replay-dock__select--selected', selected)
      btnSelectBarChart?.setAttribute('aria-pressed', selected ? 'true' : 'false')
    }

    setReplaySelectUi('bar')

    const SB_IFRAME_CURSOR_STYLE_ID = 'rw-sb-cursor-none-style'

    /** Hide OS/TV cursor over the plot only — toolbars / dock / page chrome keep a normal cursor. */
    function setSelectBarScissorsCursor(on: boolean) {
      chartHost.classList.toggle('rw-chart-host--scissors-pick', on)
      chartCursorUi?.refresh()
      try {
        const iframe =
          (chartTv?.querySelector('iframe') as HTMLIFrameElement | null) ??
          (chartHost.querySelector('iframe') as HTMLIFrameElement | null)
        const doc = iframe?.contentDocument
        if (!doc) return
        let style = doc.getElementById(SB_IFRAME_CURSOR_STYLE_ID) as HTMLStyleElement | null
        if (on) {
          if (!style) {
            style = doc.createElement('style')
            style.id = SB_IFRAME_CURSOR_STYLE_ID
            // Canvases = price/time panes only. Do not blanket `*` or body — that hides the
            // cursor on TV drawing tools, top bar, and other chart-page chrome.
            style.textContent = [
              'canvas { cursor: none !important; }',
              '.chart-markup-table { cursor: none !important; }',
            ].join('\n')
            ;(doc.head ?? doc.documentElement).appendChild(style)
          }
        } else {
          style?.remove()
        }
      } catch {
        /* ignore */
      }
    }

    function closeSelectBarChartMode(apply: boolean) {
      if (!selectBarChartActive) return
      const cutIndex =
        apply && state.tvChart && state.tickReplayUnit === 'tick' && source1mBars.length >= 2
          ? tickReplayIndexFromTvCandleIndex(lastSnappedSliceIndex)
          : isDecoupledReplay()
            ? replayCutIndexFromScissorsPick(lastSnappedSliceIndex)
            : lastSnappedSliceIndex + 1
      const savedViewport = apply ? captureLockedChartViewport() : null
      selectBarChartActive = false
      setSelectBarScissorsCursor(false)
      clearScissorsPickCache()
      pickStableIdx = 0
      lastPickPreviewIdx = -1
      lastPointerClientX = null
      lastPointerClientY = null
      pendingSelectBarPointer = null
      if (selectBarSyncRaf) {
        cancelAnimationFrame(selectBarSyncRaf)
        selectBarSyncRaf = 0
      }
      unsubscribeTvTimeScaleChange?.()
      unsubscribeTvTimeScaleChange = null
      unbindSelectBarPointerTracking()
      if (selectBarOverlay) {
        selectBarOverlay.hidden = true
        selectBarOverlay.classList.remove('rw-select-bar-overlay--active')
        selectBarOverlay.classList.remove('rw-select-bar-overlay--pointer-in')
        selectBarOverlay.classList.remove('rw-select-bar-overlay--over-legend')
        selectBarOverlay.setAttribute('aria-hidden', 'true')
        selectBarOverlay.style.removeProperty('--sx')
        selectBarOverlay.style.removeProperty('--sy')
        selectBarOverlay.style.removeProperty('--sb-top')
        selectBarOverlay.style.removeProperty('--sb-bottom')
        selectBarOverlay.style.removeProperty('--sb-right')
        selectBarOverlay.style.removeProperty('--sb-wash-bottom')
        selectBarOverlay.style.removeProperty('--sb-blur-bottom')
        selectBarOverlay.style.removeProperty('--sb-hit-bottom')
        selectBarOverlay.style.removeProperty('--sb-legend-notch-w')
        selectBarOverlay.style.removeProperty('--sb-legend-notch-h')
        selectBarOverlay.style.removeProperty('--sb-past-end-left')
      }
      if (selectBarTimeFlyout) {
        selectBarTimeFlyout.hidden = true
        selectBarTimeFlyout.classList.remove('rw-select-bar-overlay--pointer-in')
        selectBarTimeFlyout.setAttribute('aria-hidden', 'true')
      }
      chartCanvas.style.removeProperty('--rw-sb-sx')
      btnSelectBarChart?.classList.remove('rw-replay-dock__select--picking')
      syncReplaySelectSelectedChrome()
      if (selectBarTimeEl) selectBarTimeEl.textContent = ''
      state.trading?.chart.applyOptions({ crosshair: { mode: CrosshairMode.Normal } })
      if (!apply) {
        state.tvChart?.setViewportFreeze(null)
        state.trading?.clearReplayPickPreview()
        state.tvChart?.clearReplayPickPreview()
      } else {
        state.tvChart?.setViewportFreeze(null)
      }
      state.trading?.setReplayCursorVisible(true)
      state.tvChart?.setReplayCursorVisible(true)
      state.tvChart?.setCrosshairVisible(true)
      syncTickLineOverlayActive()
      if (apply) {
        state.trading?.clearReplayPickPreview()
        state.tvChart?.clearReplayPickPreview()
        const tickTvCut = isTickTvReplay()
        if (tickTvCut) {
          replayViewportLocked = false
          lockedTvViewport = null
          pendingTvViewportRestore = null
          state.tvChart?.setReplayLockedViewport(null)
        } else {
          replayViewportLocked = true
          lockedTvViewport = savedViewport?.tv ?? null
          pendingTvViewportRestore = lockedTvViewport
          userViewportPinned = true
          state.tvChart?.setReplayLockedViewport(lockedTvViewport)
        }
        void (async () => {
          replay.setLoopStartIndex(cutIndex)
          // Cut/seek often rewinds — force one paint so second-step / decoupled chart updates.
          nextReplayTickForce = true
          await seekReplayToIndex(cutIndex, false, {
            fit: false,
            preserveView: !tickTvCut,
          })
          // Minute decoupled: light sync after seek.
          // Sub-minute: seek + force tick already painted — skip a second full paint.
          if (isDecoupledReplay()) {
            const rp = resolveIntervalPick(replayTimeframe)
            if (!rp || !isSubMinuteReplayPick(rp)) {
              syncDecoupledTvFeed(cutIndex, 'prime')
            }
          }
          if (!tickTvCut) {
            if (savedViewport?.lwc) {
              await restoreLockedChartViewport({ tv: null, lwc: savedViewport.lwc })
            }
            // Single restore — a second delayed restore caused an extra blink.
            if (lockedTvViewport && state.tvChart) {
              await state.tvChart.restoreVisibleRange(lockedTvViewport)
            }
          }
        })()
      } else {
        const slice = replay.slice()
        onReplayTick(slice, replay.getState().index)
      }
      chartCursorUi?.refresh()
      resetLegendHover()
    }

    function openSelectBarChartMode() {
      if (!selectBarOverlay || !selectBarTimeEl) return
      if (!state.trading && !state.tvChart) return
      const allBars = replay.getBars()
      if (allBars.length === 0) return
      closeStartMenu()
      closeReplayHub()
      replay.pause()
      syncPlayBtnPaused()
      primeTvFeedForScissorsPick()
      selectBarChartActive = true
      setSelectBarScissorsCursor(true)
      setReplaySelectUi('bar')
      selectBarOverlay.hidden = false
      selectBarOverlay.classList.add('rw-select-bar-overlay--active')
      selectBarOverlay.setAttribute('aria-hidden', 'false')
      if (selectBarTimeFlyout) {
        selectBarTimeFlyout.hidden = false
        selectBarTimeFlyout.setAttribute('aria-hidden', 'false')
      }
      btnSelectBarChart?.classList.add('rw-replay-dock__select--picking')
      syncReplaySelectSelectedChrome()
      state.trading?.chart.applyOptions({ crosshair: { mode: CrosshairMode.Hidden } })
      state.trading?.clearReplayPickPreview()
      state.tvChart?.clearReplayPickPreview()
      state.trading?.setReplayCursorVisible(false)
      state.tvChart?.setReplayCursorVisible(false)
      state.tvChart?.setCrosshairVisible(false)
      syncTickLineOverlayActive()
      refreshScissorsPickCache()
      pickStableIdx = 0
      lastSnappedSliceIndex = 0
      lastPickPreviewIdx = -1
      lastPointerClientX = null
      lastPointerClientY = null
      setSelectBarPointerInChart(false)
      parkSelectBarCursorOffChart()
      updateSelectBarPastEndCover()
      // Allow chart pan/zoom while scissors are active — do not freeze the viewport.
      state.tvChart?.setViewportFreeze(null)
      unsubscribeTvTimeScaleChange?.()
      unsubscribeTvTimeScaleChange =
        state.tvChart?.subscribeTimeScaleChange(onSelectBarChartRangeChange) ?? null
      bindSelectBarPointerTracking()
      // Do not park the line on the rightmost / replay-cursor bar — wait for pointer over the plot.
      if (selectBarTimeEl) selectBarTimeEl.textContent = ''
      // After force paint, TV coordinates settle a frame later — rebind + verify splits.
      if (state.tvChart) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!selectBarChartActive) return
            bindSelectBarPointerTracking()
            setSelectBarScissorsCursor(true)
            refreshScissorsPickCache()
            // If the scale still collapsed to one X, force one more full paint and retry.
            if (!scissorsPlotSplitsReady()) {
              if (isDecoupledReplay()) {
                const view = state.tvChart?.captureLockedViewport()
                syncDecoupledTvFeed(replay.getState().index, 'paint', view, { forceFull: true })
              }
              state.tvChart?.flushPendingRefresh()
              clearScissorsPickCache()
              refreshScissorsPickCache()
            }
            // If the pointer is already over the plot, activate scissors at the cursor.
            if (
              lastPointerClientX != null &&
              lastPointerClientY != null &&
              pointerInSelectBarPlot(lastPointerClientX, lastPointerClientY)
            ) {
              syncSelectBarFromPointer(lastPointerClientX, lastPointerClientY)
            } else {
              setSelectBarPointerInChart(false)
            }
          })
        })
      }
      chartCursorUi?.refresh()
      legendHoverActive = false
    }

    function toggleSelectBarChartMode() {
      if (selectBarChartActive) closeSelectBarChartMode(false)
      else openSelectBarChartMode()
    }

    state.exitSelectBarChartMode = () => closeSelectBarChartMode(false)

    /** Same-origin TV iframe doc (events inside the iframe never bubble to the parent). */
    function selectBarTvIframeDoc(): Document | null {
      try {
        const iframe =
          (chartTv?.querySelector('iframe') as HTMLIFrameElement | null) ??
          (chartHost.querySelector('iframe') as HTMLIFrameElement | null)
        return iframe?.contentDocument ?? null
      } catch {
        return null
      }
    }

    let selectBarPointerCleanups: Array<() => void> = []
    let selectBarGestureStart: { x: number; y: number } | null = null
    let selectBarGestureMoved = false

    function unbindSelectBarPointerTracking() {
      for (const off of selectBarPointerCleanups) off()
      selectBarPointerCleanups = []
      selectBarGestureStart = null
      selectBarGestureMoved = false
    }

    /**
     * Track scissors + click-to-pick without covering the chart.
     * Hit layer stays pointer-events:none so drag-pan reaches TV / LWC.
     */
    function bindSelectBarPointerTracking() {
      unbindSelectBarPointerTracking()

      const onDown = (e: PointerEvent) => {
        if (!selectBarChartActive) return
        selectBarGestureStart = { x: e.clientX, y: e.clientY }
        selectBarGestureMoved = false
      }
      const onMove = (e: PointerEvent) => {
        if (!selectBarChartActive) return
        if (selectBarGestureStart) {
          const dx = e.clientX - selectBarGestureStart.x
          const dy = e.clientY - selectBarGestureStart.y
          if (dx * dx + dy * dy > SELECT_BAR_PAN_SLOP_PX * SELECT_BAR_PAN_SLOP_PX) {
            selectBarGestureMoved = true
          }
        }
        scheduleSelectBarSync(e.clientX, e.clientY)
      }
      const onUp = () => {
        // Keep gestureMoved until click handler runs (same tick / next).
        window.setTimeout(() => {
          selectBarGestureStart = null
        }, 0)
      }
      const onPickClick = (e: MouseEvent) => {
        if (!selectBarChartActive) return
        // Pan/drag must not commit a bar pick or tear down the scissors bar.
        if (selectBarGestureMoved) {
          selectBarGestureMoved = false
          return
        }
        if (!pointerInSelectBarPlot(e.clientX, e.clientY)) return
        e.preventDefault()
        e.stopPropagation()
        const hostRect = chartHost.getBoundingClientRect()
        updateSelectBarLabel(e.clientX)
        syncSelectBarLineAtIndex(pickStableIdx, e.clientY - hostRect.top)
        closeSelectBarChartMode(true)
      }

      const targets: EventTarget[] = [window, chartHost]
      const iframeDoc = selectBarTvIframeDoc()
      if (iframeDoc) targets.push(iframeDoc)

      for (const target of targets) {
        target.addEventListener('pointerdown', onDown as EventListener, true)
        target.addEventListener('pointermove', onMove as EventListener, true)
        target.addEventListener('pointerup', onUp as EventListener, true)
        target.addEventListener('click', onPickClick as EventListener, true)
        selectBarPointerCleanups.push(() => {
          target.removeEventListener('pointerdown', onDown as EventListener, true)
          target.removeEventListener('pointermove', onMove as EventListener, true)
          target.removeEventListener('pointerup', onUp as EventListener, true)
          target.removeEventListener('click', onPickClick as EventListener, true)
        })
      }
    }

    state.openReplayBarPick = openSelectBarChartMode

    if (trading) {
    trading.chart.timeScale().subscribeVisibleLogicalRangeChange(onSelectBarChartRangeChange)
    trading.chart.timeScale().subscribeVisibleTimeRangeChange(onSelectBarChartRangeChange)
    }

    const onSelectBarChartBtnClick = (e: MouseEvent) => {
      e.stopPropagation()
      if (replaySelectMode === 'date') {
        openReplayDatePanel()
        return
      }
      if (replaySelectMode === 'first') {
        void seekReplayToIndex(replay.getState().loopStartIndex)
        return
      }
      if (replaySelectMode === 'random') {
        void seekReplayToIndex(1 + Math.floor(Math.random() * Math.max(1, chartBars.length)))
        return
      }
      toggleSelectBarChartMode()
    }
    btnSelectBarChart?.addEventListener('click', onSelectBarChartBtnClick)
    cleanupFns.push(() => {
      closeSelectBarChartMode(false)
      if (trading) {
        trading.chart.timeScale().unsubscribeVisibleLogicalRangeChange(onSelectBarChartRangeChange)
        trading.chart.timeScale().unsubscribeVisibleTimeRangeChange(onSelectBarChartRangeChange)
      }
      unbindSelectBarPointerTracking()
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
          setReplaySelectUi('first')
          closeSelectBarChartMode(false)
          void seekReplayToIndex(replay.getState().loopStartIndex)
          return
        }
        if (mode === 'random') {
          setReplaySelectUi('random')
          closeSelectBarChartMode(false)
          void seekReplayToIndex(1 + Math.floor(Math.random() * Math.max(1, chartBars.length)))
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

    syncReplaySpeedUi(REPLAY_DEFAULT_SPEED_INDEX)

    if (replaySpeedBtn) {
      const onSpeedBtn = (e: MouseEvent) => {
        e.stopPropagation()
        toggleSpeedMenu()
      }
      replaySpeedBtn.addEventListener('click', onSpeedBtn)
      cleanupFns.push(() => replaySpeedBtn.removeEventListener('click', onSpeedBtn))
    }

    if (replaySpeedMenu) {
      const onSpeedMenuClick = (e: MouseEvent) => {
        const item = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-rw-replay-speed-index]')
        if (!item) return
        selectReplaySpeedIndex(Number(item.dataset.rwReplaySpeedIndex))
        closeSpeedMenu()
      }
      replaySpeedMenu.addEventListener('click', onSpeedMenuClick)
      cleanupFns.push(() => replaySpeedMenu.removeEventListener('click', onSpeedMenuClick))
    }

    if (replaySpeed && replaySpeedWrap) {
      const onSpeedInput = () => {
        const idx = Number(replaySpeed!.value)
        state.replay?.setSpeedIndex(idx)
        syncReplaySpeedUi(idx)
      }
      const showSpeedBubble = () => showReplaySpeedBubble(true)
      const hideSpeedBubble = () => hideReplaySpeedBubble()
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
        hideReplaySpeedBubble()
      })
    }

    if (replaySpeedDown) {
      const onSpeedDown = () => bumpReplaySpeed(-1)
      replaySpeedDown.addEventListener('click', onSpeedDown)
      cleanupFns.push(() => replaySpeedDown.removeEventListener('click', onSpeedDown))
    }
    if (replaySpeedUp) {
      const onSpeedUp = () => bumpReplaySpeed(1)
      replaySpeedUp.addEventListener('click', onSpeedUp)
      cleanupFns.push(() => replaySpeedUp.removeEventListener('click', onSpeedUp))
    }

    async function clearAllReplayFilters() {
      state.exitSelectBarChartMode?.()
      closeStartMenu()
      closeReplayHub()
      dateDialog?.close()

      const preservedChartPill = chartTimeframe

      replayViewportLocked = false
      lockedTvViewport = null
      pendingTvViewportRestore = null
      userViewportPinned = false
      state.tvChart?.setReplayLockedViewport(null)
      state.tvChart?.setViewportFreeze(null)
      nextReplayTickForce = undefined
      nextReplayTickFit = undefined
      nextReplayTickDecoupledStepOnly = false
      nextReplayTickChartViewSnap = null

      replay.pause()
      syncPlayBtnPaused()
      replay.setLoop(false)
      replay.setSpeedIndex(REPLAY_DEFAULT_SPEED_INDEX)
      syncReplaySpeedUi(REPLAY_DEFAULT_SPEED_INDEX)
      if (replaySpeed) replaySpeed.value = String(REPLAY_DEFAULT_SPEED_INDEX)
      setReplaySelectUi('date')

      state.trading?.clearReplayPickPreview()
      state.tvChart?.clearReplayPickPreview()
      state.trading?.setTradeMarkers([])
      state.tvChart?.setBacktestTradeMarkers([])
      backtestState.result = null
      backtestState.highlightTradeNum = undefined
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

        source1mBars = filterSessionChartBars(series.bars, session)
        if (!source1mBars.length) {
          window.alert('No bars in the session date range.')
          return
        }

        canResample = inferTimeframeFromBars(source1mBars) === '1m'
        resetTickChartSource()
        hideReplayNotice()

        chartTimeframe = preservedChartPill
        let pick = resolveIntervalPick(chartTimeframe)
        if (!pick) {
          chartTimeframe = series.timeframe
          pick = resolveIntervalPick(chartTimeframe)
        }

        await preloadLocalSecondBarsForPick(pick)
        if (pick && intervalPickNeedsSubMinuteTicks(pick) && sessionTicksEligible()) {
          if (!localSecondIntervalPick(pick)) {
            const ok = await ensureDukascopyTickSource()
            if (!ok && (pick.stepSec ?? 60) < 60) {
              showReplayNotice('Tick load failed — cleared to 1m candles for this session.')
              chartTimeframe = '1m'
              pick = resolveIntervalPick('1m')!
            }
          }
        }

        let rebuiltBars =
          pick != null ? buildBarsForIntervalPick(pick) : source1mBars.slice()
        if (rebuiltBars.length < 2) {
          chartTimeframe = '1m'
          chartBars = source1mBars.slice()
          pick = resolveIntervalPick('1m')!
        } else {
          chartBars = rebuiltBars
        }

        const startIdx = sessionStartReplayIndex(chartBars, session.startDate)
        sessionReplayStartIndex = startIdx
        replay.setLoopStartIndex(startIdx)
        replay.replaceBarsAt(chartBars, startIdx)
        replayTimeframe = chartTimeframe
        replayStepSourceBars = []

        intervalPill.textContent = chartTimeframe
        if (replayDockTf) replayDockTf.textContent = chartTimeframe

        firstChartPaint = true
        if (state.tvChart && pick) {
          const tvSeries = tvBarsForChart(chartBars)
          const tvRes = intervalPillToTvResolution(chartTimeframe)
          const barPeriod = pick.kind === 'tick' ? 60 : intervalPickBarPeriodSec(pick)
          skipTvReplayPaintOnce = true
          state.tvChart.primeIntervalFeed(tvSeries, tvRes, chartBars.length, barPeriod)
          await state.tvChart.swapInterval(tvSeries, tvRes, chartBars.length, null, {
            refit:
              intervalPickIsSeconds(pick) ||
              intervalPickIsTick(pick) ||
              intervalPickNeedsSecondsAxis(pick),
            barPeriodSec: barPeriod,
          })
          skipTvReplayPaintOnce = false
          nextReplayTickForce = true
          nextReplayTickFit = true
          onReplayTick(replay.slice(), replay.getState().index)
          state.tvChart.flushPendingRefresh()
        } else {
          nextReplayTickFit = true
          onReplayTick(replay.slice(), replay.getState().index)
        }

        if (trading) {
          applyChartFootRange('ALL', chartBars, trading)
          setFootRangeActive('ALL')
          trading.repaintTimeShades()
        }
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

    function pauseReplayPlayback() {
      replay.pause()
      replayViewportLocked = false
      lockedTvViewport = null
      pendingTvViewportRestore = null
      state.tvChart?.setReplayLockedViewport(null)
    }

    function beginReplayPlayback() {
      if (!selectBarChartActive) {
        // Lock wherever the chart is — playback reveals bars without shifting pan/zoom.
        if (userViewportPinned && lockedTvViewport) {
          replayViewportLocked = true
          pendingTvViewportRestore = lockedTvViewport
          state.tvChart?.setReplayLockedViewport(lockedTvViewport)
        } else {
          pinChartViewportForReplay()
        }
        userViewportPinned = false
        state.tvChart?.notifyUserPlaybackPan(tvBarPeriodSecForPill(chartTimeframe))
      } else if (
        replayViewportLocked &&
        lockedTvViewport &&
        state.tvChart &&
        state.tvChart.lockedViewportCoversBars(lockedTvViewport, replay.slice())
      ) {
        void restoreTvViewport(lockedTvViewport)
      }

      replayPlayKickoff = true
      replay.play()
    }

    const playBtnEl = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
    if (playBtnEl) {
      const onPlayPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        const wasPlaying = replay.getState().playing
        if (wasPlaying) {
          pauseReplayPlayback()
          syncChartIndicators(replay.getBars(), replay.slice())
          setReplayPlayButtonIcon(playBtnEl, false)
        } else {
          beginReplayPlayback()
          setReplayPlayButtonIcon(playBtnEl, true)
        }
      }
      playBtnEl.addEventListener('pointerdown', onPlayPointerDown, true)
      cleanupFns.push(() => playBtnEl.removeEventListener('pointerdown', onPlayPointerDown, true))
    }

    const replayHandlers: Array<{ el: Element; fn: () => void }> = []
    const flashTimers = new WeakMap<HTMLElement, number>()
    const flashReplayTico = (el: HTMLElement) => {
      el.classList.add('rw-replay-dock__tico--pressed')
      const prev = flashTimers.get(el)
      if (prev != null) window.clearTimeout(prev)
      const id = window.setTimeout(() => {
        el.classList.remove('rw-replay-dock__tico--pressed')
        flashTimers.delete(el)
      }, 160)
      flashTimers.set(el, id)
    }
    host.querySelectorAll('[data-rw-replay-dock] [data-rw]').forEach((btn) => {
      if ((btn as HTMLElement).dataset.rw === 'play') return
      const fn = () => {
        const act = (btn as HTMLElement).dataset.rw
        if (act === 'fwd' || act === 'step' || act === 'end') {
          flashReplayTico(btn as HTMLElement)
        }
        if (act === 'start') {
          seekReplayToIndex(replay.getState().loopStartIndex)
        } else if (act === 'back') {
          seekReplayToIndex(replay.getState().index - 1, false, { preserveView: true })
        } else if (act === 'fwd' || act === 'step') {
          seekReplayToIndex(replay.getState().index + 1, false, { preserveView: true })
        } else if (act === 'end') {
          seekReplayToIndex(isDecoupledReplay() ? replay.getBars().length : chartBars.length)
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
      if (ae?.closest?.('[data-rw-replay-speed-wrap], [data-rw-replay-speed-menu], [data-rw-replay-speed-btn]')) return

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
        const wasPlaying = replay.getState().playing
        if (wasPlaying) pauseReplayPlayback()
        else beginReplayPlayback()
        if (wasPlaying) {
          syncChartIndicators(replay.getBars(), replay.slice())
        }
        const playBtn = host.querySelector<HTMLButtonElement>('[data-rw="play"]')
        setReplayPlayButtonIcon(playBtn, replay.getState().playing)
        return
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault()
        seekReplayToIndex(replay.getState().index - 1, false, { preserveView: true })
        return
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault()
        seekReplayToIndex(replay.getState().index + 1, false, { preserveView: true })
      }
    }
    window.addEventListener('keydown', onReplayKeydown, true)
    cleanupFns.push(() => window.removeEventListener('keydown', onReplayKeydown, true))

    const onBuy = () => {
      if (!propTradingAllowed) {
        showReplayNotice(
          'Prop challenge is no longer active — reset the account in Journal to start over.',
        )
        return
      }
      const b = lastBar(replay.slice())
      if (!b) {
        showReplayNotice('No replay bar to trade — open Replay and select a starting bar first.')
        return
      }
      const fill = entryFillPrice(b)
      const qty = readOrderQty()
      if (qtyInput && !qtyInput.value.trim()) qtyInput.value = String(qty)
      const cost = longOrderCost(qty, fill)
      const { cash } = replayAccount.summary(fill)
      const opened = replayAccount.openLong(qty, fill, Number(b.time))
      if (!opened) {
        showReplayNotice(
          `Insufficient cash for long order. Need ${formatMoney(cost)} (${qty} × ${formatSessionPrice(fill)}), available ${formatMoney(cash)}.`,
        )
        return
      }
      schedulePersistReplay()
      syncTradingUi(b)
      // Re-layout after TV price scale settles so the entry line locks to the candle.
      requestAnimationFrame(() => {
        if (!state.disposed) syncPositionOverlay(true)
      })
    }
    const onSell = () => {
      if (!propTradingAllowed) {
        showReplayNotice(
          'Prop challenge is no longer active — reset the account in Journal to start over.',
        )
        return
      }
      const b = lastBar(replay.slice())
      if (!b) {
        showReplayNotice('No replay bar to trade — open Replay and select a starting bar first.')
        return
      }
      const fill = entryFillPrice(b)
      const qty = readOrderQty()
      if (qtyInput && !qtyInput.value.trim()) qtyInput.value = String(qty)
      const margin = shortOrderMargin(qty, fill)
      const { cash } = replayAccount.summary(fill)
      const opened = replayAccount.openShort(qty, fill, Number(b.time))
      if (!opened) {
        showReplayNotice(
          `Insufficient margin for short order. Need ${formatMoney(margin)} (5% of ${qty} × ${formatSessionPrice(fill)}), available ${formatMoney(cash)}.`,
        )
        return
      }
      schedulePersistReplay()
      syncTradingUi(b)
      requestAnimationFrame(() => {
        if (!state.disposed) syncPositionOverlay(true)
      })
    }
    ticketBuy.addEventListener('click', onBuy)
    ticketSell.addEventListener('click', onSell)
    cleanupFns.push(() => ticketBuy.removeEventListener('click', onBuy))
    cleanupFns.push(() => ticketSell.removeEventListener('click', onSell))

    const tzLabel = 'UTC'

    function tickClock() {
      const d = new Date()
      const clockStr = d.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'UTC',
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

    let roLastW = 0
    let roLastH = 0
    let roResizeTimer: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver(() => {
      const w = chartHost.clientWidth
      const h = chartHost.clientHeight
      if (w < 2 || h < 2) return
      if (w === roLastW && h === roLastH) return
      roLastW = w
      roLastH = h
      if (roResizeTimer) clearTimeout(roResizeTimer)
      roResizeTimer = setTimeout(() => {
        roResizeTimer = null
        if (state.disposed) return
        if (state.tvChart) {
          state.tvChart.resize()
          syncTickLineOverlay(replay.getState().index)
          updateSelectBarPlotClip()
        } else if (trading) {
          trading.chart.resize(w, h)
          trading.repaintTimeShades()
        }
      }, 48)
      if (!paintedWithNonZeroHost && state.tvChart) {
        void (async () => {
          await state.tvChart!.whenChartReady()
          if (state.disposed || paintedWithNonZeroHost) return
          deferTvChartPaint = false
          firstChartPaint = true
          onReplayTick(replay.slice(), replay.getState().index)
          state.tvChart!.flushPendingRefresh()
          paintedWithNonZeroHost = true
        })()
      } else if (!paintedWithNonZeroHost) {
        paintedWithNonZeroHost = true
        firstChartPaint = true
        onReplayTick(replay.slice(), replay.getState().index)
        requestAnimationFrame(() => state.trading?.scrollReplayCursorIntoView())
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
        if (state.tvChart) {
          state.tvChart.resize()
        } else if (trading) {
          trading.chart.resize(chartHost.clientWidth, chartHost.clientHeight)
          trading.repaintTimeShades()
        }
      }
    })

    } finally {
      await endBootLoading(true)
    }
  })()

  return () => {
    state.disposed = true
    clearBootLoadingWatchdog()
    void endBootLoading(true)
    switchChartSymbolImpl = null
    closeReplayHub()
    dateDialog?.close()
    ;(host.querySelector('[data-rw-foot-goto-dialog]') as HTMLDialogElement | null)?.close()
    for (const fn of cleanupFns) fn()
    state.trading?.dispose()
    state.trading = null
    state.tvChart?.dispose()
    state.tvChart = null
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
