import {
  createTradeneuTvDatafeed,
  disposeTradeneuTvDatafeed,
  tvResolutionMatches,
  type LazyFetchBarsRequest,
} from './tradingViewDatafeed'
import type { TvDatafeed } from './tradingViewTypes'
import type { Bar } from '../types'
import { createTvReplayChartController, type TvLockedViewport, type TvReplayChartController } from './tradingViewReplayChart'

type TvTheme = 'light' | 'dark'

export type TvHeaderButtonDef = {
  id: string
  title: string
  text?: string
  /** Leading icon before text (TradingView Replay << + label). */
  leadingIconHtml?: string
  /** SVG/icon markup — renders an icon-only TV-styled header control. */
  iconHtml?: string
  align?: 'left' | 'right'
  insertAfterIndicatorTemplate?: boolean
  /** Right-aligned icon buttons: place just before TV utility icons (search, settings, etc.). */
  insertBeforeRightUtilities?: boolean
  onClick: () => void
}

export type TradingViewChartHandle = {
  dispose: () => void
  setSymbol: (symbol: string) => void
  setResolution: (resolution: string) => void
  /** Update TV interval label without reloading the widget (replay feed owns bars). */
  syncResolution: (resolution: string) => void
  /** Track header interval without calling setResolution (TV already switched). */
  noteResolution: (resolution: string) => void
  setDataSourceLabel: (dataSource?: string) => void
  applyTheme: (theme: TvTheme) => void
  resize: () => void
  whenChartReady: () => Promise<void>
  getHeaderButton: (id: string) => HTMLElement | null
  setHeaderButtonIcon: (id: string, iconHtml: string) => void
  /** Black active pill + optional leading icon (TradingView Replay selected look). */
  setHeaderButtonActive: (
    id: string,
    active: boolean,
    opts?: { iconHtml?: string; label?: string },
  ) => void
  setSessionBars: (bars: Bar[], resolution: string, barPeriodSec?: number, opts?: { deferRefresh?: boolean }) => void
  /** Update replay feed for a pending interval swap without resetData (TV header path). */
  primeIntervalFeed: (bars: Bar[], resolution: string, pastCount: number, barPeriodSec?: number) => void
  setReplayData: (
    pastBars: Bar[],
    allBars: Bar[],
    opts?: {
      fit?: boolean
      playing?: boolean
      force?: boolean
      preserveViewport?: boolean
      restoreVisibleRange?: TvLockedViewport
      decoupled?: boolean
      decoupledStepOnly?: boolean
      stepPreserveView?: boolean
    },
  ) => void
  tickDecoupledReplay: (displayBars: Bar[]) => boolean
  setReplayPickPreview: (splitIndex: number, allBars: Bar[]) => void
  clearReplayPickPreview: () => void
  clearReplay: () => void
  scrollReplayCursorIntoView: () => void
  setHistoricalAnchorIndex: (barIndex: number) => void
  /** Merge earlier session bars (pan-left lazy load). */
  prependSessionBars: (bars: Bar[]) => number
  /** Merge later session bars (replay toward B). */
  appendSessionBars: (bars: Bar[]) => number
  viewportAnchorTimeSec: (anchorRatio?: number) => number | null
  replayIndexAtViewportAnchor: (anchorRatio?: number) => number
  lockedViewportCoversBars: (saved: TvLockedViewport, pastBars: Bar[]) => boolean
  pickIndexAtClientX: (clientX: number, hostLeft: number, maxIndex: number, iframeOffsetX?: number) => number
  timeSecAtClientX: (clientX: number, hostLeft: number, iframeOffsetX?: number) => number | null
  lineXAtBarIndex: (barIndex: number, hostLeft: number, iframeOffsetX?: number) => number | null
  lineXAtBarTimeSec: (timeSec: number, iframeOffsetX?: number) => number | null
  chartBarTimeSecAtIndex: (barIndex: number) => number | null
  plotXForWallTimeMs: (timeMs: number, plotOffsetX: number) => number | null
  hostPointForWallTimeMs: (
    timeMs: number,
    price: number,
    layout: { plotOffsetX: number; top: number; bottom: number; width: number },
  ) => { x: number; y: number } | null
  /** Host-relative Y for a price (plot top + pane priceToCoordinate). */
  priceToHostY: (price: number, hostEl: HTMLElement) => number | null
  /**
   * Draw entry/TP/SL as TradingView horizontal_line shapes (same price scale as candles).
   * Returns true when shapes are used — caller should skip DOM dashed lines but keep badges.
   */
  syncReplayPositions: (
    positions: Array<{
      id: string
      direction: 'long' | 'short'
      qty: number
      entryPrice: number
      entryTime: number
      takeProfit: number | null
      stopLoss: number | null
      /** Entry-line color (FXReplay: blue profit / orange loss). */
      lineColor?: string
    }>,
    handlers: {
      onClose: (id: string) => void
      formatPnl: (id: string) => string
    },
  ) => boolean
  /**
   * Show backtest entry/exit arrows on the TV chart (createShape).
   * Pass [] to clear. Optional maxTimeSec limits markers to the replay cursor.
   */
  setBacktestTradeMarkers: (
    trades: Array<{
      direction: 'long' | 'short'
      entryTime: number
      exitTime: number
      entryPrice: number
      exitPrice: number
      pnl: number
    }>,
    opts?: { maxTimeSec?: number },
  ) => void
  getPlotClipInsets: (hostEl: HTMLElement) => { top: number; bottom: number; left: number; right: number } | null
  getPlotLayout: (hostEl: HTMLElement) => {
    top: number
    bottom: number
    left: number
    right: number
    width: number
    plotOffsetX: number
    iframeOffsetX: number
  } | null
  setReplayCursorVisible: (visible: boolean) => void
  /** Hide/show the TV pane crosshair (dashed lines) — e.g. during scissors pick. */
  setCrosshairVisible: (visible: boolean) => void
  setViewportFreeze: (viewport: TvLockedViewport | null) => void
  setReplayLockedViewport: (viewport: TvLockedViewport | null) => void
  /** Apply a deferred resetCache/resetData after TV finishes initializing. */
  flushPendingRefresh: () => void
  /** True while replay code is applying a locked viewport (ignore user pan handlers). */
  isProgrammaticViewportRestore: () => boolean
  notifyUserPlaybackPan: (barPeriodSec?: number) => void
  getReplayLockedViewport: () => TvLockedViewport | null
  subscribeTimeScaleChange: (fn: () => void) => () => void
  captureVisibleRange: () => { from: number; to: number } | null
  captureLockedViewport: () => TvLockedViewport | null
  restoreVisibleRange: (range: TvLockedViewport) => Promise<void>
  swapInterval: (
    bars: Bar[],
    resolution: string,
    pastCount: number,
    lockedViewport: TvLockedViewport | null,
    opts?: { refit?: boolean; barPeriodSec?: number },
  ) => Promise<void>
}

export type TradingViewChartOpts = {
  symbol: string
  resolution: string
  theme: TvTheme
  sessionStartSec?: number
  sessionEndSec?: number
  /** Seed replay feed before widget init so TV never boots against an empty datafeed. */
  initialSessionBars?: {
    bars: Bar[]
    resolution: string
    barPeriodSec?: number
  }
  /** Provider label for resolveSymbol (e.g. dukascopy:xauusd → Dukascopy). Set before widget init. */
  dataSource?: string
  onSymbolChange?: (symbol: string) => void
  /** Fired when the user changes interval via the TV header (not programmatic sync). */
  onResolutionChange?: (resolution: string) => void
  /** Set while applyIntervalPick is running (guards datafeed during rebucket). */
  intervalSwapRef?: { inProgress: boolean }
  headerButtons?: TvHeaderButtonDef[]
  /** Fetch older/newer chunks when TV pans past loaded session bars. */
  lazyFetchBars?: (req: LazyFetchBarsRequest) => Promise<boolean>
}

type TvSubscription = {
  subscribe: (obj: null, cb: () => void) => void
  unsubscribe: (obj: null, cb: () => void) => void
}

type TvChartApi = {
  symbol: () => string
  resolution?: () => string
  setResolution?: (resolution: string, callback?: () => void) => void
  onSymbolChanged: () => TvSubscription
  applyOverrides?: (overrides: Record<string, unknown>) => void
  getAllShapes?: () => Array<{ id: string; name: string }>
  removeEntity?: (entityId: string) => void
}

type TvStyledButtonOptions = {
  align?: 'left' | 'right'
  useTradingViewStyle: true
  text: string
  title?: string
  onClick?: () => void
}

type TvCustomButtonOptions = {
  align?: 'left' | 'right'
  useTradingViewStyle?: false
}

type TvCreateButtonOptions = TvStyledButtonOptions | TvCustomButtonOptions

type TvWidgetApi = {
  remove: () => void
  removeButton: (buttonIdOrElement: string | HTMLElement) => void
  setSymbol: (symbol: string, interval: string, callback?: () => void) => void
  changeTheme: (theme: TvTheme) => void
  onChartReady: (cb: () => void) => void
  applyOverrides: (overrides: Record<string, unknown>) => void
  activeChart: () => TvChartApi
  headerReady: () => Promise<void>
  createButton: (options?: TvCreateButtonOptions) => string | HTMLElement
  resetCache: () => void
}

type TvWidgetCtor = new (opts: Record<string, unknown>) => TvWidgetApi

declare global {
  interface Window {
    TradingView?: { widget: TvWidgetCtor }
  }
}

let scriptLoadPromise: Promise<void> | null = null

function siteRootAssetUrl(pathFromRoot: string): string {
  const rel = pathFromRoot.replace(/^\//, '')
  const base = import.meta.env.BASE_URL || '/'
  if (base === './' || base === '.') {
    return new URL(`/${rel}`, window.location.origin).href
  }
  const joined = `${base.endsWith('/') ? base : `${base}/`}${rel}`.replace(/\/{2,}/g, '/')
  return new URL(joined, window.location.origin).href
}

function chartingLibraryBaseUrl(): string {
  const url = siteRootAssetUrl('charting_library/')
  return url.endsWith('/') ? url : `${url}/`
}

function chartingLibraryScriptUrl(): string {
  return siteRootAssetUrl('charting_library/charting_library.standalone.js')
}

function tvWidgetCtor(): TvWidgetCtor | undefined {
  const w = window as Window & { TradingView?: { widget?: TvWidgetCtor } }
  return w.TradingView?.widget
}

function tvIframeDocument(mount: HTMLElement): Document | null {
  return mount.querySelector('iframe')?.contentDocument ?? null
}

/**
 * Distance from chart-host bottom to the plot/time-axis hairline.
 * TV layout (bottom → up): bottom toolbar (~38px) → time axis (~25–60px) → hairline.
 * Screenshots put the hairline ~100–120px above the host bottom (toolbar + time axis).
 */
const TV_HAIRLINE_FALLBACK_FROM_BOTTOM_PX = 100
const TV_HAIRLINE_SEARCH_MAX_FROM_BOTTOM_PX = 160

/** Locate plot/time-axis hairline via time-label DOM (e.g. "22:55"). */
function detectHairlineViaTimeLabels(
  doc: Document,
  hostBottom: number,
): number | null {
  const timeRe = /^\d{1,2}:\d{2}(:\d{2})?$/
  let best: number | null = null
  const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  let node: Node | null = walk.nextNode()
  let checked = 0
  while (node && checked < 400) {
    checked++
    const text = (node.textContent || '').trim()
    if (!timeRe.test(text)) {
      node = walk.nextNode()
      continue
    }
    let el: HTMLElement | null = node.parentElement
    // Climb to the wide time-axis strip — its top edge is the hairline.
    for (let i = 0; el && i < 8; i++) {
      const r = el.getBoundingClientRect()
      const fromBottom = Math.round(hostBottom - r.top)
      if (
        r.width >= 200 &&
        r.height >= 18 &&
        r.height <= 90 &&
        fromBottom >= 40 &&
        fromBottom <= TV_HAIRLINE_SEARCH_MAX_FROM_BOTTOM_PX
      ) {
        if (best == null || fromBottom > best) best = fromBottom
      }
      el = el.parentElement
    }
    node = walk.nextNode()
  }
  return best
}

/** Sample a canvas row for a near-continuous non-background horizontal (axis border). */
function canvasRowLooksLikeHairline(
  ctx: CanvasRenderingContext2D,
  y: number,
  width: number,
  theme: 'light' | 'dark',
): boolean {
  const w = Math.min(width, 640)
  const step = Math.max(1, Math.floor(w / 160))
  let hits = 0
  const samples = Math.floor(w / step)
  try {
    const data = ctx.getImageData(0, y, w, 1).data
    for (let i = 0; i < samples; i++) {
      const x = i * step
      const o = x * 4
      const r = data[o] ?? 0
      const g = data[o + 1] ?? 0
      const b = data[o + 2] ?? 0
      const a = data[o + 3] ?? 0
      if (a < 20) continue
      if (theme === 'light') {
        // Not near-white — gray / ClearType pink-cyan fringe
        if (r < 248 || g < 248 || b < 248) hits++
      } else {
        // Not near pane bg #131722
        if (r > 30 || g > 35 || b > 45) hits++
      }
    }
  } catch {
    return false
  }
  return hits >= samples * 0.55
}

let hairlineCache: { at: number; fromBottom: number; key: string } | null = null

/** Find hairline Y as distance from host bottom by scanning large 2D TV canvases. */
function detectHairlineFromHostBottom(
  doc: Document,
  hostRect: DOMRect,
  theme: 'light' | 'dark',
): number | null {
  const key = `${Math.round(hostRect.width)}x${Math.round(hostRect.height)}:${theme}`
  if (hairlineCache && hairlineCache.key === key && Date.now() - hairlineCache.at < 2000) {
    return hairlineCache.fromBottom
  }
  let bestFromBottom: number | null = null
  for (const canvas of doc.querySelectorAll('canvas')) {
    const r = canvas.getBoundingClientRect()
    if (r.width < 200 || r.height < 100) continue
    // Need a canvas that reaches near the host bottom (plot+axis combined).
    if (hostRect.bottom - r.bottom > 8) continue
    // WebGL canvases have no 2d context — skip quietly.
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = canvas.getContext('2d', { willReadFrequently: true })
    } catch {
      ctx = null
    }
    if (!ctx) continue
    const scaleY = canvas.height / r.height
    const scaleX = canvas.width / r.width
    if (!Number.isFinite(scaleY) || scaleY <= 0) continue
    // Scan upward from bottom ~12px through ~120px of CSS pixels.
    const yCssMin = 8
    const yCssMax = Math.min(Math.floor(r.height * 0.35), TV_HAIRLINE_SEARCH_MAX_FROM_BOTTOM_PX)
    for (let yCss = yCssMin; yCss <= yCssMax; yCss++) {
      const yPx = Math.min(canvas.height - 1, Math.max(0, Math.round((r.height - yCss) * scaleY)))
      const bitW = Math.min(canvas.width, Math.round(r.width * scaleX))
      if (!canvasRowLooksLikeHairline(ctx, yPx, bitW, theme)) continue
      const fromBottom = Math.round(hostRect.bottom - (r.bottom - yCss))
      if (fromBottom < 20 || fromBottom > TV_HAIRLINE_SEARCH_MAX_FROM_BOTTOM_PX) continue
      if (bestFromBottom == null || fromBottom > bestFromBottom) {
        bestFromBottom = fromBottom
      }
      break
    }
  }
  if (bestFromBottom != null) {
    hairlineCache = { at: Date.now(), fromBottom: bestFromBottom, key }
  }
  return bestFromBottom
}

/** Main plot clip insets + iframe horizontal offset for time-scale coordinates. */
function measureTvPlotLayout(
  mount: HTMLElement,
  hostEl: HTMLElement,
  theme: TvTheme = 'light',
): {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  /** Main plot canvas left edge relative to chart host (time-scale X origin). */
  plotOffsetX: number
  iframeOffsetX: number
} | null {
  const doc = tvIframeDocument(mount)
  if (!doc) return null
  const hostRect = hostEl.getBoundingClientRect()
  const iframe = mount.querySelector('iframe')
  const iframeRect = iframe?.getBoundingClientRect()
  const iframeOffsetX = iframeRect ? Math.round(iframeRect.left - hostRect.left) : 0

  let best: DOMRect | null = null
  let bestArea = 0
  /** Highest short-canvas top in the bottom band (= time-axis top / hairline). */
  let hairlineFromHostBottom: number | null = null
  const hostW = Math.max(1, hostRect.width)
  const maxPlotLeft = hostRect.left + hostW * 0.35

  for (const canvas of doc.querySelectorAll('canvas')) {
    const r = canvas.getBoundingClientRect()
    if (r.width < 120) continue
    const fromBottom = hostRect.bottom - r.top
    // Short strips in the bottom toolbar/time-axis zone.
    if (
      r.height >= 14 &&
      r.height <= 90 &&
      fromBottom >= 20 &&
      fromBottom <= TV_HAIRLINE_SEARCH_MAX_FROM_BOTTOM_PX
    ) {
      const topInset = Math.round(fromBottom)
      // Prefer the *largest* inset (time-axis top sits above the bottom toolbar).
      if (hairlineFromHostBottom == null || topInset > hairlineFromHostBottom) {
        hairlineFromHostBottom = topInset
      }
    }
    if (r.height < 80) continue
    // Skip canvases that start too far right — they are not the main price pane and
    // produce a huge plotOffsetX that pins scissors picks to the leftmost candle.
    if (r.left > maxPlotLeft) continue
    const area = r.width * r.height
    if (area > bestArea) {
      bestArea = area
      best = r
    }
  }

  // Prefer DOM time-axis strip (label climb) — most reliable vs WebGL canvases.
  const viaLabels = detectHairlineViaTimeLabels(doc, hostRect.bottom)
  if (viaLabels != null) {
    hairlineFromHostBottom = viaLabels
  } else {
    const scanned = detectHairlineFromHostBottom(doc, hostRect, theme)
    if (scanned != null) hairlineFromHostBottom = scanned
  }

  if (!best) {
    const fallbackBottom = hairlineFromHostBottom ?? TV_HAIRLINE_FALLBACK_FROM_BOTTOM_PX
    return {
      top: 0,
      bottom: fallbackBottom,
      left: iframeOffsetX,
      right: 56,
      width: 0,
      plotOffsetX: iframeOffsetX,
      iframeOffsetX,
    }
  }
  const plotOffsetX = Math.round(best.left - hostRect.left)
  const plotWidth = Math.round(best.width)
  const right = Math.max(0, Math.round(hostRect.width - plotOffsetX - plotWidth))
  const canvasBottom = Math.max(0, Math.round(hostRect.bottom - best.bottom))
  const bottom =
    hairlineFromHostBottom != null
      ? hairlineFromHostBottom
      : canvasBottom >= 40
        ? canvasBottom
        : TV_HAIRLINE_FALLBACK_FROM_BOTTOM_PX
  return {
    top: Math.max(0, Math.round(best.top - hostRect.top)),
    bottom,
    left: plotOffsetX,
    right,
    width: plotWidth,
    plotOffsetX,
    iframeOffsetX,
  }
}

function headerTooltip(el: Element): string {
  return (
    el.getAttribute('title') ??
    el.getAttribute('aria-label') ??
    el.getAttribute('data-tooltip') ??
    ''
  ).toLowerCase()
}

function headerToolbarSlot(el: HTMLElement): HTMLElement {
  let slot: HTMLElement = el
  for (let i = 0; i < 4; i++) {
    const parent = slot.parentElement
    if (!parent) break
    if (parent.childElementCount === 1) {
      slot = parent
      continue
    }
    break
  }
  return slot
}

function findIndicatorTemplateAnchor(doc: Document): HTMLElement | null {
  const nodes = doc.querySelectorAll<HTMLElement>(
    '[data-tooltip], [title], [aria-label], button, [role="button"], .apply-common-tooltip',
  )
  for (const node of nodes) {
    const tip = headerTooltip(node)
    if (tip.includes('indicator template') || tip.includes('study template')) {
      return headerToolbarSlot(node)
    }
  }
  return null
}

function findHeaderButtonByText(doc: Document, text: string): HTMLElement | null {
  const want = text.trim().toLowerCase()
  for (const node of doc.querySelectorAll<HTMLElement>('button, [role="button"], .apply-common-tooltip')) {
    const label = node.textContent?.trim().toLowerCase() ?? ''
    if (label === want) return headerToolbarSlot(node)
  }
  return null
}

function findHeaderButtonByTitle(doc: Document, title: string): HTMLElement | null {
  const want = title.trim().toLowerCase()
  for (const node of doc.querySelectorAll<HTMLElement>(
    'button, [role="button"], .apply-common-tooltip, [data-tooltip]',
  )) {
    if (headerTooltip(node) === want) return headerToolbarSlot(node)
  }
  return null
}

function findFirstRightUtilityAnchor(doc: Document): HTMLElement | null {
  const needles = [
    'quick search',
    'symbol search',
    'search symbols',
    'chart settings',
    'manage chart settings',
    'take a snapshot',
    'snapshot',
    'fullscreen mode',
    'fullscreen',
  ]
  const candidates: HTMLElement[] = []
  for (const node of doc.querySelectorAll<HTMLElement>(
    'button, [role="button"], .apply-common-tooltip, [data-tooltip]',
  )) {
    const tip = headerTooltip(node)
    if (!tip) continue
    if (needles.some((n) => tip.includes(n))) candidates.push(headerToolbarSlot(node))
  }
  return candidates[0] ?? null
}

function applyIconHeaderButton(el: HTMLElement, iconHtml: string, title: string, id: string) {
  const slot = headerToolbarSlot(el)
  slot.classList.add('rw-tv-header-btn', 'rw-tv-header-btn--icon')
  slot.dataset.rwTvBtn = id
  slot.innerHTML = iconHtml
  slot.setAttribute('title', title)
  slot.setAttribute('aria-label', title)
}

/** Paint target for TV text header buttons (the clickable node, not an empty wrapper). */
function resolveHeaderButtonPaintTarget(el: HTMLElement): HTMLElement {
  if (el.matches('button, [role="button"]')) return el
  const innerBtn = el.querySelector<HTMLElement>('button, [role="button"]')
  if (innerBtn) return innerBtn
  if (el.classList.contains('apply-common-tooltip')) return el
  const tip = el.querySelector<HTMLElement>('.apply-common-tooltip')
  if (tip) return tip
  for (const node of el.querySelectorAll<HTMLElement>('div, span, a')) {
    const t = node.textContent?.trim()
    if (t === 'Replay' || t === '◁◁ Replay' || t === '<< Replay' || t.endsWith('Replay') || t === 'Backtest') {
      return (node.closest('button, [role="button"], .apply-common-tooltip') as HTMLElement | null) ?? node
    }
  }
  return el
}

const headerButtonActiveState = new Map<string, boolean>()
const headerButtonFaceWatchers = new Map<string, MutationObserver>()

const REPLAY_HEADER_CSS_ID = 'rw-tv-replay-header-css'
const AXIS_HAIRLINE_KILL_CSS_ID = 'rw-tv-axis-hairline-kill-css'
const INDICATORS_DIALOG_CSS_ID = 'rw-tv-indicators-dialog-css'
const TV_BACK_PAD_CSS_ID = 'rw-tv-back-pad-css'

/** Purge leftover white axis-cover strips (clipped “Chart by TradingView” / “Keep drawing”). */
function removeStaleAxisHairlineCovers(mount?: HTMLElement | null) {
  try {
    document.querySelectorAll('[data-rw-axis-hairline-cover], #rw-tv-axis-hairline-cover').forEach((el) => {
      el.remove()
    })
  } catch {
    /* ignore */
  }
  if (!mount) return
  try {
    const doc = tvIframeDocument(mount)
    if (!doc) return
    doc.querySelectorAll('#rw-tv-axis-hairline-cover, [data-rw-axis-hairline-cover]').forEach((el) => {
      el.remove()
    })
    let style = doc.getElementById(AXIS_HAIRLINE_KILL_CSS_ID) as HTMLStyleElement | null
    if (!style) {
      style = doc.createElement('style')
      style.id = AXIS_HAIRLINE_KILL_CSS_ID
      ;(doc.head ?? doc.documentElement).appendChild(style)
    }
    style.textContent = `
#rw-tv-axis-hairline-cover,
[data-rw-axis-hairline-cover],
[id*="axis-hairline-cover"] {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  height: 0 !important;
  max-height: 0 !important;
  pointer-events: none !important;
}
`
  } catch {
    /* ignore */
  }
}

/** Inject Replay header CSS into the TV iframe (custom_css_url can lag / miss). */
function ensureReplayHeaderCss(doc: Document) {
  let style = doc.getElementById(REPLAY_HEADER_CSS_ID) as HTMLStyleElement | null
  if (!style) {
    style = doc.createElement('style')
    style.id = REPLAY_HEADER_CSS_ID
    ;(doc.head ?? doc.documentElement).appendChild(style)
  }
  style.textContent = `
.rw-tv-header-btn--replay.rw-tv-header-btn--text:not(.rw-tv-header-btn--active),
[data-rw-tv-btn="replay"].rw-tv-header-btn--text:not(.rw-tv-header-btn--active) {
  background: #f0f3fa !important;
  background-color: #f0f3fa !important;
  color: #131722 !important;
  border-radius: 8px !important;
}
.rw-tv-header-btn--replay.rw-tv-header-btn--active,
[data-rw-tv-btn="replay"].rw-tv-header-btn--active,
[data-rw-tv-btn="replay"].rw-tv-header-btn.rw-tv-header-btn--active {
  background: #131722 !important;
  background-color: #131722 !important;
  color: #ffffff !important;
  border-radius: 8px !important;
  opacity: 1 !important;
}
.rw-tv-header-btn--replay.rw-tv-header-btn--active .rw-tv-header-btn__label,
[data-rw-tv-btn="replay"].rw-tv-header-btn--active .rw-tv-header-btn__label {
  color: #ffffff !important;
}
/* Label already includes ◁◁ — do not draw a second CSS icon. */
.rw-tv-header-btn--replay.rw-tv-header-btn--text::before,
[data-rw-tv-btn="replay"].rw-tv-header-btn--text::before {
  content: none !important;
  display: none !important;
}
`
}

/** Technicals list: SCRIPT NAME | Developer | Rating columns + Built-in / — cells. */
function ensureIndicatorsDialogCss(doc: Document) {
  let style = doc.getElementById(INDICATORS_DIALOG_CSS_ID) as HTMLStyleElement | null
  if (!style) {
    style = doc.createElement('style')
    style.id = INDICATORS_DIALOG_CSS_ID
    ;(doc.head ?? doc.documentElement).appendChild(style)
  }
  /* Do NOT override TV row display — that breaks star/title layout.
   * Default 480px; was 720px (+50%); now −25% of that → 540px. */
  style.textContent = `
[class*="dialogLibrary"],
[data-name="insert-indicator-dialog"],
[data-name="indicators-dialog"],
.dialog-UAy2ZKyS {
  width: 540px !important;
  max-width: min(540px, 96vw) !important;
}
@media (max-width: 540px) {
  [class*="dialogLibrary"],
  [data-name="insert-indicator-dialog"],
  [data-name="indicators-dialog"],
  .dialog-UAy2ZKyS {
    width: 96vw !important;
    max-width: 96vw !important;
  }
}
.rw-ind-col-head {
  position: relative !important;
  display: block !important;
  width: 100% !important;
  box-sizing: border-box !important;
  min-height: 34px !important;
  margin: 0 !important;
  padding: 8px 12px !important;
  font-family: -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif !important;
}
.rw-ind-col-head__fav {
  display: none !important;
}
.rw-ind-col-head__name,
.rw-ind-col-head__dev,
.rw-ind-col-head__rating {
  position: absolute !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  letter-spacing: 0.04em !important;
  text-transform: uppercase !important;
  color: #787b86 !important;
  line-height: 16px !important;
  white-space: nowrap !important;
  margin: 0 !important;
  padding: 0 !important;
}
/* Default ≈ star gutter; JS overwrites with measured title X */
.rw-ind-col-head__name {
  left: 52px !important;
}
.rw-ind-col-head__dev {
  /* Sit in mid column (after script names), not flush to Rating */
  left: 56% !important;
  right: auto !important;
}
.rw-ind-col-head__rating {
  right: 12px !important;
  left: auto !important;
  width: 56px !important;
  text-align: right !important;
}
.rw-ind-tech-row.container-WeNdU0sq {
  position: relative !important;
}
.rw-ind-dev,
.rw-ind-rating {
  position: absolute !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif !important;
  font-size: 13px !important;
  font-weight: 400 !important;
  line-height: 18px !important;
  color: #787b86 !important;
  white-space: nowrap !important;
  pointer-events: none !important;
}
.rw-ind-dev {
  left: 56% !important;
  right: auto !important;
  max-width: 100px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
.rw-ind-rating {
  right: 12px !important;
  width: 56px !important;
  text-align: right !important;
}
/* Hide native lone SCRIPT NAME so only our aligned header shows */
.rw-ind-hide-native-script-head {
  display: none !important;
}
html.theme-dark .rw-ind-col-head__name,
html.theme-dark .rw-ind-col-head__dev,
html.theme-dark .rw-ind-col-head__rating,
html.theme-dark .rw-ind-dev,
html.theme-dark .rw-ind-rating {
  color: #787b86 !important;
}
`
}

/** Left edge of the first text glyph inside an element. */
function textStartLeft(el: HTMLElement): number {
  try {
    const doc = el.ownerDocument
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node: Node | null = walker.nextNode()
    while (node) {
      if ((node.textContent || '').trim().length > 0) {
        const range = doc.createRange()
        const text = node.textContent || ''
        const offset = text.search(/\S/)
        range.setStart(node, Math.max(0, offset))
        range.setEnd(node, Math.max(0, offset) + 1)
        const rect = range.getBoundingClientRect()
        if (rect.left || rect.width) return rect.left
      }
      node = walker.nextNode()
    }
  } catch {
    /* fall through */
  }
  return el.getBoundingClientRect().left
}

/** Find the visible indicator title node in a Technicals row (after the star). */
function findRowTitleEl(row: HTMLElement): HTMLElement | null {
  const main = row.querySelector('[class*="main-"]') as HTMLElement | null
  if (!main) return null
  const labeled = main.querySelector('[data-label]') as HTMLElement | null
  if (labeled) return labeled
  const leaves = [...main.querySelectorAll('span, div, a')].filter((el) => {
    if (el.childElementCount > 0) return false
    const t = (el.textContent || '').trim()
    return t.length >= 3 && t.toLowerCase() !== 'built-in' && t !== '—'
  }) as HTMLElement[]
  return leaves[0] ?? main
}

/** Pin SCRIPT NAME so its S lines up with the first title character (e.g. 5). */
function syncIndicatorsColHead(bar: HTMLElement, row: HTMLElement) {
  const titleEl = findRowTitleEl(row)
  const nameHead = bar.querySelector('.rw-ind-col-head__name') as HTMLElement | null
  if (!titleEl || !nameHead) return

  const barLeft = bar.getBoundingClientRect().left
  let titleLeft = textStartLeft(titleEl)

  // If favorite star is present, never place the header left of the title after it.
  const fav = row.querySelector('[class*="favorite"]') as HTMLElement | null
  if (fav) {
    const favRight = fav.getBoundingClientRect().right
    titleLeft = Math.max(titleLeft, favRight + 4)
  }

  const left = Math.max(0, Math.round(titleLeft - barLeft))
  nameHead.style.setProperty('left', `${left}px`, 'important')
  nameHead.style.setProperty('right', 'auto', 'important')
}

const INDICATORS_DIALOG_LABEL_OBS = 'rwTvIndLabelObs'

function indicatorsDialogRoots(doc: Document): Element[] {
  // Keep this selector cheap — never scan every h3/span/div. A full-document walk
  // on each MutationObserver tick freezes the TV iframe while the chart boots.
  return [
    ...doc.querySelectorAll(
      '.dialogLibrary-I087YV6b, [data-name="insert-indicator-dialog"], [data-name="indicators-dialog"], [class*="dialogLibrary"]',
    ),
  ]
}

function isLeafLabel(el: Element, want: string): boolean {
  if (el.childElementCount > 0) return false
  return (el.textContent?.trim() ?? '').toUpperCase() === want
}

/** Technicals: inject Developer/Rating headers + cells. Community: rename Author/Boosts. */
function ensureIndicatorsDialogColumnLabels(doc: Document) {
  const rewrite = () => {
    const roots = indicatorsDialogRoots(doc)
    // Chart boot mutates the iframe constantly — bail unless the Indicators dialog is open.
    if (!roots.length) return
    for (const root of roots) {
      let el: HTMLElement | null = root as HTMLElement
      let dialogEl: HTMLElement | null = null
      while (el) {
        const name = el.getAttribute('data-name') ?? ''
        const cls = typeof el.className === 'string' ? el.className : ''
        if (
          el.getAttribute('role') === 'dialog' ||
          name.includes('indicator') ||
          /dialogLibrary|dialog-[A-Za-z0-9]{6,}/.test(cls)
        ) {
          dialogEl = el
        }
        el = el.parentElement
      }
      dialogEl = dialogEl || (root as HTMLElement)
      dialogEl.style.setProperty('width', '540px', 'important')
      dialogEl.style.setProperty('max-width', 'min(540px, 96vw)', 'important')
      dialogEl.style.setProperty('min-width', 'min(540px, 96vw)', 'important')
      root.querySelectorAll('h3, span, div, th, td').forEach((el) => {
        if (el.childElementCount > 0) return
        if (el.classList.contains('rw-ind-dev') || el.classList.contains('rw-ind-rating')) return
        if (el.classList.contains('rw-ind-col-head__name') || el.classList.contains('rw-ind-col-head__dev') || el.classList.contains('rw-ind-col-head__rating')) return
        const key = (el.textContent?.trim() ?? '').toUpperCase()
        if (key === 'AUTHOR') el.textContent = 'Developer'
        else if (key === 'BOOSTS' || key === 'BOOST') el.textContent = 'Rating'
      })

      // Insert SCRIPT NAME | Developer | Rating header above the Technicals list.
      const scriptHeads = [...root.querySelectorAll('h3, span, div')].filter((el) =>
        isLeafLabel(el, 'SCRIPT NAME'),
      )
      for (const head of scriptHeads) {
        if (head.closest('.rw-ind-col-head') || head.closest('.container-WeNdU0sq')) continue
        head.classList.add('rw-ind-hide-native-script-head')
        ;(head as HTMLElement).style.setProperty('display', 'none', 'important')
        if (root.querySelector('.rw-ind-col-head')) continue

        const bar = doc.createElement('div')
        bar.className = 'rw-ind-col-head'
        bar.setAttribute('data-rw-ind-cols', '1')
        const favPad = doc.createElement('span')
        favPad.className = 'rw-ind-col-head__fav'
        favPad.setAttribute('aria-hidden', 'true')
        const name = doc.createElement('span')
        name.className = 'rw-ind-col-head__name'
        name.textContent = 'SCRIPT NAME'
        const dev = doc.createElement('span')
        dev.className = 'rw-ind-col-head__dev'
        dev.textContent = 'Developer'
        const rating = doc.createElement('span')
        rating.className = 'rw-ind-col-head__rating'
        rating.textContent = 'Rating'
        bar.append(favPad, name, dev, rating)

        // Mount in the same scroll/list host as rows so widths match.
        const firstRow = root.querySelector(
          '.container-WeNdU0sq, [class*="container-"][class*="WeNd"], [class*="item-"]',
        ) as HTMLElement | null
        const rowParent = firstRow?.parentElement
        if (rowParent && firstRow) {
          rowParent.insertBefore(bar, firstRow)
        } else {
          head.insertAdjacentElement('afterend', bar)
        }
      }

      root.querySelectorAll('.container-WeNdU0sq').forEach((row) => {
        const el = row as HTMLElement
        // Community rows already have author/likes columns.
        if (el.querySelector('[class*="author-"], [class*="likes-"]')) {
          el.classList.remove('rw-ind-tech-row')
          el.querySelectorAll('.rw-ind-dev, .rw-ind-rating').forEach((n) => n.remove())
          return
        }
        el.classList.add('rw-ind-tech-row')
        el.querySelector('.rw-ind-fav-slot')?.remove()
        if (!el.querySelector('.rw-ind-dev')) {
          const dev = doc.createElement('span')
          dev.className = 'rw-ind-dev'
          dev.textContent = 'Built-in'
          el.appendChild(dev)
        }
        if (!el.querySelector('.rw-ind-rating')) {
          const rating = doc.createElement('span')
          rating.className = 'rw-ind-rating'
          rating.textContent = '—'
          el.appendChild(rating)
        }
      })

      const bar = root.querySelector('.rw-ind-col-head') as HTMLElement | null
      const sampleRow = root.querySelector('.rw-ind-tech-row') as HTMLElement | null
      if (bar && sampleRow) {
        const runSync = () => syncIndicatorsColHead(bar, sampleRow)
        requestAnimationFrame(runSync)
        window.setTimeout(runSync, 0)
        window.setTimeout(runSync, 50)
        window.setTimeout(runSync, 150)
        window.setTimeout(runSync, 400)
      }

    }
  }
  rewrite()
  const tagged = doc as Document & { [INDICATORS_DIALOG_LABEL_OBS]?: MutationObserver }
  if (tagged[INDICATORS_DIALOG_LABEL_OBS]) return
  let scheduled = false
  const obs = new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      rewrite()
    })
  })
  obs.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true })
  tagged[INDICATORS_DIALOG_LABEL_OBS] = obs
  // Re-sync after dialog layout settles / window.
  window.addEventListener('resize', () => {
    for (const root of indicatorsDialogRoots(doc)) {
      const bar = root.querySelector('.rw-ind-col-head') as HTMLElement | null
      const sampleRow = root.querySelector('.rw-ind-tech-row') as HTMLElement | null
      if (bar && sampleRow) syncIndicatorsColHead(bar, sampleRow)
    }
  })
}

/** Leave room at the left of the TV header for the Tradeneu back-to-dashboard overlay.
 *  Pad must match the toolbar fill — transparent padding showed a grey gutter. */
function ensureTvBackPadCss(doc: Document) {
  let style = doc.getElementById(TV_BACK_PAD_CSS_ID) as HTMLStyleElement | null
  if (!style) {
    style = doc.createElement('style')
    style.id = TV_BACK_PAD_CSS_ID
    ;(doc.head ?? doc.documentElement).appendChild(style)
  }
  style.textContent = `
.layout__area--top {
  padding-left: 34px !important;
  box-sizing: border-box !important;
  background-color: #ffffff !important;
}
html.theme-dark .layout__area--top {
  background-color: #131722 !important;
}
`
}

function applyReplayActiveChrome(el: HTMLElement, active: boolean) {
  const targets = new Set<HTMLElement>([el, headerToolbarSlot(el), resolveHeaderButtonPaintTarget(el)])
  for (const node of targets) {
    node.dataset.rwTvBtn = 'replay'
    node.classList.add('rw-tv-header-btn', 'rw-tv-header-btn--text', 'rw-tv-header-btn--replay')
    node.classList.toggle('rw-tv-header-btn--active', active)
    node.setAttribute('aria-pressed', active ? 'true' : 'false')
    const fg = active ? '#ffffff' : '#131722'
    const bg = active ? '#131722' : '#f0f3fa'
    node.style.setProperty('background', bg, 'important')
    node.style.setProperty('background-color', bg, 'important')
    node.style.setProperty('color', fg, 'important')
    node.style.setProperty('border-radius', '8px', 'important')
    node.style.setProperty('opacity', '1', 'important')
    node.querySelectorAll<HTMLElement>('.rw-tv-header-btn__label').forEach((label) => {
      label.style.setProperty('color', fg, 'important')
    })
  }
}

/**
 * TradingView Replay face (attached reference):
 * idle  — light-gray rounded chip, rewind icon + “Replay”, tooltip “Bar replay”
 * active — black pill, white icon + “Replay”
 * Prefer painting the toolbar slot we own (custom createButton). SVG must live in the DOM.
 */
function paintTextHeaderButtonFace(
  el: HTMLElement,
  opts: {
    id: string
    active: boolean
    label: string
    iconHtml?: string
    title?: string
  },
) {
  const isReplay = opts.id === 'replay'
  // Prefer the clickable TV face; Replay text (incl. ◁◁) lives in the label.
  const paint = resolveHeaderButtonPaintTarget(el)
  if (paint.dataset.rwFacePainting === '1') return
  paint.dataset.rwFacePainting = '1'
  try {
    if (isReplay && paint.ownerDocument) ensureReplayHeaderCss(paint.ownerDocument)
    paint.dataset.rwTvBtn = opts.id
    paint.classList.add('rw-tv-header-btn', 'rw-tv-header-btn--text')
    if (isReplay) paint.classList.add('rw-tv-header-btn--replay')
    paint.classList.toggle('rw-tv-header-btn--active', opts.active)
    paint.setAttribute('aria-pressed', opts.active ? 'true' : 'false')
    const tip = opts.title ?? (isReplay ? 'Bar replay' : opts.label)
    paint.setAttribute('title', tip)
    paint.setAttribute('aria-label', tip)
    paint.setAttribute('data-tooltip', tip)

    // Do not inject leading SVG for Replay — TV wipes it / custom slots go blank.
    // Rewind mark is part of `opts.label` (e.g. "◁◁ Replay").
    if (isReplay || !opts.iconHtml?.trim()) {
      paint.innerHTML = `<span class="rw-tv-header-btn__label">${opts.label}</span>`
    } else {
      paint.innerHTML = `<span class="rw-tv-header-btn__ico" aria-hidden="true">${opts.iconHtml}</span><span class="rw-tv-header-btn__label">${opts.label}</span>`
    }

    const active = opts.active
    const fg = active ? '#ffffff' : '#131722'
    const bg = active ? '#131722' : isReplay ? '#f0f3fa' : 'transparent'
    const radius = isReplay ? '8px' : '4px'
    paint.style.setProperty('display', 'inline-flex', 'important')
    paint.style.setProperty('align-items', 'center', 'important')
    paint.style.setProperty('justify-content', 'center', 'important')
    paint.style.setProperty('flex-direction', 'row', 'important')
    paint.style.setProperty('gap', '6px', 'important')
    paint.style.setProperty('height', '28px', 'important')
    paint.style.setProperty('min-height', '28px', 'important')
    paint.style.removeProperty('min-width')
    paint.style.setProperty('padding', active ? '0 11px' : '0 10px', 'important')
    paint.style.setProperty('margin', '0 2px', 'important')
    paint.style.setProperty('border', 'none', 'important')
    paint.style.setProperty('border-radius', radius, 'important')
    paint.style.setProperty('background', bg, 'important')
    paint.style.setProperty('background-color', bg, 'important')
    paint.style.setProperty('color', fg, 'important')
    paint.style.setProperty(
      'font',
      "400 13px/16px -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
      'important',
    )
    paint.style.setProperty('cursor', 'pointer', 'important')
    paint.style.setProperty('opacity', '1', 'important')
    paint.style.setProperty('visibility', 'visible', 'important')
    paint.style.setProperty('box-sizing', 'border-box', 'important')
    paint.style.setProperty('line-height', '16px', 'important')
    paint.style.setProperty('white-space', 'nowrap', 'important')

    paint.querySelectorAll<HTMLElement>('.rw-tv-header-btn__ico, .rw-tv-header-btn__label, svg, .sx-ico').forEach((child) => {
      child.style.setProperty('color', fg, 'important')
      child.style.setProperty('stroke', fg, 'important')
      child.style.setProperty('fill', 'none', 'important')
      child.style.setProperty('background', 'transparent', 'important')
      child.style.setProperty('opacity', '1', 'important')
    })

    if (isReplay) applyReplayActiveChrome(paint, active)

    let parent: HTMLElement | null = paint.parentElement
    for (let i = 0; i < 4 && parent; i++) {
      // Keep wrappers clear so the pill background on the face is what you see.
      if (!parent.classList.contains('rw-tv-header-btn--replay')) {
        parent.style.setProperty('background', 'transparent', 'important')
        parent.style.setProperty('background-color', 'transparent', 'important')
      }
      parent = parent.parentElement
    }
  } finally {
    queueMicrotask(() => {
      paint.dataset.rwFacePainting = '0'
    })
  }
}

function resolveCreateButtonElement(
  mount: HTMLElement,
  result: string | HTMLElement,
): HTMLElement | null {
  if (result instanceof HTMLElement) return result
  const doc = tvIframeDocument(mount)
  if (!doc) return null
  return (
    doc.getElementById(result) ??
    doc.querySelector<HTMLElement>(`[data-name="${result}"]`) ??
    doc.querySelector<HTMLElement>(`[data-button-id="${result}"]`)
  )
}

function repositionBeforeRightUtilities(mount: HTMLElement, button: HTMLElement) {
  const doc = tvIframeDocument(mount)
  if (!doc) return
  const btn = headerToolbarSlot(button)
  const anchor = findFirstRightUtilityAnchor(doc)
  if (!btn || !anchor || btn === anchor) return
  const parent = anchor.parentElement
  if (!parent) return
  parent.insertBefore(btn, anchor)
}

function insertSlotsAfterAnchor(anchor: HTMLElement, slots: HTMLElement[]): void {
  const parent = anchor.parentElement
  if (!parent) return
  let ref: Element = anchor
  for (const slot of slots) {
    const node = headerToolbarSlot(slot)
    parent.insertBefore(node, ref.nextSibling)
    ref = node
  }
}

function repositionAfterIndicatorTemplate(
  mount: HTMLElement,
  items: Array<string | HTMLElement>,
): void {
  const doc = tvIframeDocument(mount)
  if (!doc) return
  const anchor = findIndicatorTemplateAnchor(doc)
  if (!anchor) return
  const slots: HTMLElement[] = []
  for (const item of items) {
    const slot =
      typeof item === 'string' ? findHeaderButtonByText(doc, item) : headerToolbarSlot(item)
    if (!slot) return
    slots.push(slot)
  }
  insertSlotsAfterAnchor(anchor, slots)
}

async function waitForContainerLayout(
  el: HTMLElement,
  maxFrames = 48,
): Promise<boolean> {
  for (let i = 0; i < maxFrames; i++) {
    const w = el.clientWidth
    const h = el.clientHeight
    if (w >= 2 && h >= 2) return true
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  return false
}

function triggerResize(): void {
  window.dispatchEvent(new Event('resize'))
}

function scheduleResizeRetries(): void {
  triggerResize()
  requestAnimationFrame(triggerResize)
  for (const delay of [50, 150, 400, 900, 1800]) {
    window.setTimeout(triggerResize, delay)
  }
}

let resizeNotifyTimer: ReturnType<typeof setTimeout> | null = null

/** Debounced resize — avoids ResizeObserver ↔ window.resize feedback loops. */
function notifyWidgetResize(): void {
  if (resizeNotifyTimer) clearTimeout(resizeNotifyTimer)
  resizeNotifyTimer = setTimeout(() => {
    resizeNotifyTimer = null
    triggerResize()
  }, 32)
}

/** True when the synced TV static bundle is present (skipped on deploy without submodule). */
export async function tradingViewLibraryAvailable(): Promise<boolean> {
  try {
    const url = chartingLibraryScriptUrl()
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    if (!head.ok) return false
    const ct = (head.headers.get('content-type') ?? '').toLowerCase()
    if (ct.includes('text/html')) return false
    const totalLen = head.headers.get('content-length')
    if (totalLen && Number.parseInt(totalLen, 10) >= 10_000) return true
    // Some hosts omit Content-Length on HEAD; let script load be the source of truth.
    return !ct.includes('text/html')
  } catch {
    return false
  }
}

/** Start downloading the TV charting library early (e.g. while session bars load). */
export function preloadTradingViewScript(): Promise<void> {
  return loadTradingViewScript()
}

function loadTradingViewScript(): Promise<void> {
  if (tvWidgetCtor()) return Promise.resolve()
  if (!scriptLoadPromise) {
    scriptLoadPromise = new Promise((resolve, reject) => {
      const SCRIPT_LOAD_TIMEOUT_MS = 12_000
      const timeoutId = window.setTimeout(() => {
        scriptLoadPromise = null
        reject(new Error('TradingView script load timeout'))
      }, SCRIPT_LOAD_TIMEOUT_MS)
      const finishOk = () => {
        window.clearTimeout(timeoutId)
        if (tvWidgetCtor()) resolve()
        else reject(new Error('TradingView script loaded but widget constructor is missing'))
      }
      const finishErr = (msg: string) => {
        window.clearTimeout(timeoutId)
        scriptLoadPromise = null
        reject(new Error(msg))
      }

      const existing = document.querySelector<HTMLScriptElement>('script[data-tv-chart-lib]')
      if (existing) {
        if (tvWidgetCtor()) {
          resolve()
          return
        }
        existing.addEventListener('load', () => finishOk(), { once: true })
        existing.addEventListener('error', () => finishErr('TradingView script failed to load'), {
          once: true,
        })
        return
      }
      const script = document.createElement('script')
      script.src = chartingLibraryScriptUrl()
      script.async = true
      script.dataset.tvChartLib = '1'
      script.onload = () => finishOk()
      script.onerror = () => finishErr(`Failed to load ${script.src}`)
      document.head.appendChild(script)
    })
  }
  return scriptLoadPromise
}

export async function createTradingViewChart(
  container: HTMLElement,
  opts: TradingViewChartOpts,
): Promise<TradingViewChartHandle> {
  await loadTradingViewScript()
  const Widget = tvWidgetCtor()
  if (!Widget) {
    throw new Error('TradingView.widget is unavailable after script load')
  }

  await waitForContainerLayout(container)

  container.replaceChildren()
  const mountId = `tv-${Math.random().toString(36).slice(2, 10)}`
  const mount = document.createElement('div')
  mount.id = mountId
  mount.style.width = '100%'
  mount.style.height = '100%'
  container.appendChild(mount)
  removeStaleAxisHairlineCovers(mount)

  // Drop stale TV chart settings that can re-enable bid/ask even when overrides say false.
  window.setTimeout(() => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (/tradingview|tvlanding|chartproperties/i.test(key)) {
          localStorage.removeItem(key)
        }
      }
    } catch {
      /* private mode / blocked storage */
    }
  }, 0)

  let currentSymbol = opts.symbol.trim().toUpperCase()
  let currentResolution = opts.resolution
  let currentTheme: TvTheme = opts.theme
  let suppressIntervalChange = false
  const sessionStartSec = opts.sessionStartSec
  const sessionEndSec = opts.sessionEndSec
  let chartReady = false
  let disposed = false
  let lastProviderExchangeLabel: string | undefined
  let refreshProviderHeader: () => void = () => {}
  let resolveChartReady: (() => void) | null = null
  const chartReadyPromise = new Promise<void>((resolve) => {
    resolveChartReady = resolve
  })

  const datafeedBundle = createTradeneuTvDatafeed({
    getSymbol: () => currentSymbol,
    sessionStartSec: () => sessionStartSec,
    sessionEndSec: () => sessionEndSec,
    isIntervalSwapInProgress: () => opts.intervalSwapRef?.inProgress === true,
    lazyFetchBars: opts.lazyFetchBars,
    onDataSourceResolved: (dataSource) => {
      datafeedBundle.setProviderExchangeLabel(dataSource)
      refreshProviderHeader()
    },
  })
  if (opts.dataSource?.trim()) {
    datafeedBundle.setProviderExchangeLabel(opts.dataSource)
    lastProviderExchangeLabel = datafeedBundle.getProviderExchangeLabel()
  }
  if (opts.initialSessionBars?.bars.length) {
    datafeedBundle.replayFeed.setSessionBars(
      opts.initialSessionBars.bars,
      opts.initialSessionBars.resolution,
      opts.initialSessionBars.barPeriodSec,
    )
  }
  datafeedBundle.replayFeed.setTvFullSeriesReplay(false)
  const datafeed: TvDatafeed = datafeedBundle.datafeed

  let replayCtrl: TvReplayChartController | null = null

  type PosShapeBundle = {
    entryId: string
    tpId: string | null
    slId: string | null
    entryPrice: number
    takeProfit: number | null
    stopLoss: number | null
    direction: 'long' | 'short'
    lineColor: string
  }
  const posShapes = new Map<string, PosShapeBundle>()
  /** Ids currently being created — avoid duplicate async createShape storms. */
  const posShapesCreating = new Set<string>()
  const ownedShapeIds = new Set<string>()
  let shapeSyncGen = 0
  const backtestMarkerIds: string[] = []
  let backtestMarkerGen = 0
  const MAX_BACKTEST_MARKER_TRADES = 120

  const toTimeSec = (t: number) => (t > 1e12 ? Math.floor(t / 1000) : Math.floor(t))

  const removeShapeId = (chart: { removeEntity?: (id: string) => void }, id: string | null) => {
    if (!id) return
    try {
      chart.removeEntity?.(id)
    } catch {
      /* ignore */
    }
    ownedShapeIds.delete(id)
  }

  const clearBacktestMarkers = () => {
    backtestMarkerGen += 1
    try {
      const chart = widget.activeChart()
      for (const id of backtestMarkerIds) removeShapeId(chart, id)
    } catch {
      /* ignore */
    }
    backtestMarkerIds.length = 0
  }

  const clearTvPositionLines = () => {
    shapeSyncGen += 1
    try {
      const chart = widget.activeChart()
      for (const bundle of posShapes.values()) {
        removeShapeId(chart, bundle.entryId)
        removeShapeId(chart, bundle.tpId)
        removeShapeId(chart, bundle.slId)
      }
    } catch {
      /* ignore */
    }
    posShapes.clear()
    posShapesCreating.clear()
  }

  const horzLineOverrides = (color: string, label: string) => ({
    linecolor: color,
    linestyle: 2,
    linewidth: 1,
    showPrice: false,
    showLabel: true,
    text: label,
    textcolor: '#ffffff',
    fontsize: 11,
    bold: true,
    horzLabelsAlign: 'left',
    vertLabelsAlign: 'middle',
  })

  const createHorzLine = async (
    chart: {
      createShape: (
        point: { time: number; price: number },
        options: Record<string, unknown>,
      ) => Promise<string>
    },
    timeSec: number,
    price: number,
    color: string,
    label: string,
  ): Promise<string | null> => {
    try {
      const id = await chart.createShape(
        { time: timeSec, price },
        {
          shape: 'horizontal_line',
          lock: true,
          disableSelection: true,
          disableSave: true,
          disableUndo: true,
          showInObjectsTree: false,
          text: label,
          overrides: horzLineOverrides(color, label),
        },
      )
      if (id) ownedShapeIds.add(String(id))
      return id ? String(id) : null
    } catch (err) {
      console.warn('[TradingView] createShape horizontal_line failed', err)
      return null
    }
  }

  const setShapePrice = (
    chart: {
      getShapeById?: (id: string) => {
        setPoints?: (pts: Array<{ time: number; price: number }>) => void
        applyOverrides?: (o: Record<string, unknown>) => void
      }
    },
    shapeId: string,
    timeSec: number,
    price: number,
    color: string,
    label: string,
  ) => {
    try {
      const shape = chart.getShapeById?.(shapeId)
      shape?.setPoints?.([{ time: timeSec, price }])
      shape?.applyOverrides?.(horzLineOverrides(color, label))
    } catch {
      /* ignore */
    }
  }

  const chartChromeOverrides: Record<string, unknown> = {
    // Last price (green/red dashed + axis label) stays on — that is normal TV.
    // Bid/ask lines (blue #2962FF / pink #F7525F) are optional and often look like a
    // ClearType “glitch” hairline under the last price — keep them off.
    'mainSeriesProperties.bidAsk.visible': false,
    'mainSeriesProperties.bidAsk.lineWidth': 0,
    'mainSeriesProperties.bidAsk.lineStyle': 2,
    'mainSeriesProperties.bidAsk.bidLineColor': 'rgba(0,0,0,0)',
    'mainSeriesProperties.bidAsk.askLineColor': 'rgba(0,0,0,0)',
    'scalesProperties.showBidAskLabels': false,
    'mainSeriesProperties.highLowAvgPrice.highLowPriceLinesVisible': false,
    'mainSeriesProperties.highLowAvgPrice.averageClosePriceLineVisible': false,
    'mainSeriesProperties.showPrevClosePriceLine': false,
    // Axis border / pane separator (not a price line).
    'scalesProperties.lineColor': opts.theme === 'dark' ? '#131722' : '#ffffff',
    'paneProperties.separatorColor': opts.theme === 'dark' ? '#131722' : '#ffffff',
  }

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

  const widget = new Widget({
    symbol: currentSymbol,
    interval: currentResolution,
    container: mountId,
    library_path: chartingLibraryBaseUrl(),
    locale: 'en',
    autosize: true,
    theme: opts.theme,
    datafeed,
    disabled_features: ['use_localstorage_for_settings'],
    enabled_features: [
      'iframe_loading_same_origin',
      'study_templates',
      'allow_arbitrary_symbol_search_input',
      'caption_buttons_text_if_possible',
      'hide_right_toolbar',
      'seconds_resolution',
      // Parent `use_localstorage_for_settings` is off; re-enable stars in Indicators dialog.
      'items_favoriting',
    ],
    custom_css_url: `${chartingLibraryBaseUrl()}tv-header-overrides.css?v=ind-dev-col-mid-3`,
    loading_screen: { backgroundColor: opts.theme === 'dark' ? '#131722' : '#ffffff' },
    // settings_overrides wins over any saved chart settings; plain overrides do not.
    settings_overrides: { ...chartChromeOverrides },
    overrides: {
      ...(opts.theme === 'dark'
        ? {
            'paneProperties.background': '#131722',
            'paneProperties.backgroundType': 'solid',
          }
        : {
            'paneProperties.background': '#ffffff',
            'paneProperties.backgroundType': 'solid',
          }),
      ...chartChromeOverrides,
    },
  })

  refreshProviderHeader = () => {
    const label = datafeedBundle.getProviderExchangeLabel()
    if (label === lastProviderExchangeLabel) return
    lastProviderExchangeLabel = label
    // Exchange is read in resolveSymbol — do not call widget.setSymbol here; it reloads
    // the series and wipes replay-painted bars after boot or interval swaps.
  }

  const headerButtonIds = new Map<string, string>()
  const headerButtonElements = new Map<string, HTMLElement>()
  const headerButtonTitles = new Map<string, string>()
  const headerButtonCleanups: Array<() => void> = []

  const resolveHeaderButtonEl = (id: string): HTMLElement | null => {
    const cached = headerButtonElements.get(id)
    if (cached?.isConnected) return headerToolbarSlot(cached)

    const title = headerButtonTitles.get(id)
    if (title) {
      const doc = tvIframeDocument(mount)
      if (doc) {
        const byData = doc.querySelector<HTMLElement>(`[data-rw-tv-btn="${id}"]`)
        if (byData) return headerToolbarSlot(byData)
        const byTitle = findHeaderButtonByTitle(doc, title)
        if (byTitle) return byTitle
      }
    }

    const def = opts.headerButtons?.find((b) => b.id === id)
    if (!def?.text) return null
    const doc = tvIframeDocument(mount)
    if (!doc) return null
    return findHeaderButtonByText(doc, def.text)
  }

  const mountHeaderButtons = () => {
    const afterTemplateItems: Array<string | HTMLElement> = []
    const beforeUtilityButtons: HTMLElement[] = []

    const buttonDefs: TvHeaderButtonDef[] = [...(opts.headerButtons ?? [])]

    for (const def of buttonDefs) {
      const align = def.align ?? 'left'

      if (def.iconHtml) {
        try {
          const raw = widget.createButton({ align, useTradingViewStyle: false })
          const el = resolveCreateButtonElement(mount, raw)
          if (!el) {
            console.error('[TradingView] createButton returned no element:', def.id)
            continue
          }
          headerButtonElements.set(def.id, el)
          headerButtonTitles.set(def.id, def.title)
          applyIconHeaderButton(el, def.iconHtml, def.title, def.id)
          const onClick = (e: Event) => {
            e.preventDefault()
            e.stopPropagation()
            def.onClick()
          }
          el.addEventListener('click', onClick)
          headerButtonCleanups.push(() => el.removeEventListener('click', onClick))
          if (def.insertBeforeRightUtilities) beforeUtilityButtons.push(el)
        } catch (err) {
          console.error('[TradingView] createButton failed:', def.id, err)
        }
        continue
      }

      if (!def.text) continue

      try {
        const buttonId = widget.createButton({
          useTradingViewStyle: true,
          align,
          text: def.text,
          title: def.title,
          onClick: def.onClick,
        })
        if (typeof buttonId === 'string') headerButtonIds.set(def.id, buttonId)
        else headerButtonElements.set(def.id, buttonId)
        headerButtonTitles.set(def.id, def.title)
        if (def.insertAfterIndicatorTemplate) afterTemplateItems.push(def.text)
        const applyFace = () => {
          const el = resolveHeaderButtonEl(def.id)
          if (!el) return
          paintTextHeaderButtonFace(el, {
            id: def.id,
            active: headerButtonActiveState.get(def.id) === true,
            label: def.text!,
            iconHtml: def.leadingIconHtml,
            title: def.title || (def.id === 'replay' ? 'Bar replay' : def.text!),
          })
        }
        requestAnimationFrame(applyFace)
        for (const delay of [100, 400, 1000]) {
          window.setTimeout(applyFace, delay)
        }
      } catch (err) {
        console.error('[TradingView] createButton failed:', def.id, err)
      }
    }

    const runPlacement = () => {
      if (afterTemplateItems.length) {
        repositionAfterIndicatorTemplate(mount, afterTemplateItems)
      }
      for (const el of beforeUtilityButtons) {
        repositionBeforeRightUtilities(mount, el)
      }
      for (const def of buttonDefs) {
        const el = resolveHeaderButtonEl(def.id)
        if (!el) continue
        if (def.iconHtml) {
          applyIconHeaderButton(el, def.iconHtml, def.title, def.id)
          continue
        }
        if (def.text) {
          paintTextHeaderButtonFace(el, {
            id: def.id,
            active: headerButtonActiveState.get(def.id) === true,
            label: def.text,
            iconHtml: def.leadingIconHtml,
            title: def.title,
          })
        }
      }
    }

    runPlacement()
    requestAnimationFrame(runPlacement)
    for (const delay of [100, 300, 700, 1500, 2500]) {
      window.setTimeout(runPlacement, delay)
    }
  }

  widget.onChartReady(() => {
    chartReady = true
    replayCtrl?.flushPendingRefresh()
    resolveChartReady?.()
    resolveChartReady = null

    // Force-hide bid/ask + other optional price lines that survive theme / settings merges.
    const hideChartHairlines = () => {
      try {
        widget.applyOverrides(chartChromeOverrides)
      } catch {
        /* ignore */
      }
      try {
        const chart = widget.activeChart()
        chart.applyOverrides?.(chartChromeOverrides)
        // If bid/ask lines were toggled on in chart settings, turn them off.
        try {
          const bidAskOn = (
            chart as { getCheckableActionState?: (id: string) => boolean | null }
          ).getCheckableActionState?.('Chart.Lines.ToggleBidAskLinesVisibility')
          if (bidAskOn === true) {
            ;(
              chart as { executeActionById?: (id: string) => void }
            ).executeActionById?.('Chart.Lines.ToggleBidAskLinesVisibility')
          }
        } catch {
          /* action id may not exist in this build */
        }
        for (const shape of chart.getAllShapes?.() ?? []) {
          const sid = String(shape.id || '')
          if (ownedShapeIds.has(sid)) continue
          const name = String(shape.name || '').toLowerCase()
          if (
            name === 'horizontal_line' ||
            name === 'horizontal_ray' ||
            name === 'horz_line' ||
            name === 'horz_ray'
          ) {
            chart.removeEntity?.(shape.id)
          }
        }
      } catch {
        /* ignore */
      }
      removeStaleAxisHairlineCovers(mount)
    }
    hideChartHairlines()
    window.setTimeout(() => {
      if (!disposed) hideChartHairlines()
    }, 250)

    void widget
      .headerReady()
      .then(() => {
        try {
          const doc = tvIframeDocument(mount)
          if (doc) {
            ensureReplayHeaderCss(doc)
            ensureIndicatorsDialogCss(doc)
            ensureIndicatorsDialogColumnLabels(doc)
            ensureTvBackPadCss(doc)
          }
        } catch {
          /* ignore */
        }
        mountHeaderButtons()
      })
      .catch((err) => console.error('[TradingView] headerReady failed:', err))

    {
      const chart = widget.activeChart()
      const onSym = () => {
        if (!disposed) hideChartHairlines()
      }
      chart.onSymbolChanged().subscribe(null, onSym)
      headerButtonCleanups.push(() => {
        chart.onSymbolChanged().unsubscribe(null, onSym)
      })
    }

    if (opts.onSymbolChange) {
      const chart = widget.activeChart()
      const symbolChangedHandler = () => {
        const sym = chart.symbol()?.trim().toUpperCase()
        if (sym) opts.onSymbolChange?.(sym)
      }
      chart.onSymbolChanged().subscribe(null, symbolChangedHandler)
      headerButtonCleanups.push(() => {
        chart.onSymbolChanged().unsubscribe(null, symbolChangedHandler)
      })
    }

    if (opts.onResolutionChange) {
      const chart = widget.activeChart() as {
        resolution?: () => string
        onIntervalChanged?: () => { subscribe: (obj: null, cb: () => void) => void; unsubscribe: (obj: null, cb: () => void) => void }
      }
      const intervalChangedHandler = () => {
        if (suppressIntervalChange) return
        const res = chart.resolution?.()?.trim()
        if (res) opts.onResolutionChange?.(res)
      }
      chart.onIntervalChanged?.().subscribe(null, intervalChangedHandler)
      headerButtonCleanups.push(() => {
        chart.onIntervalChanged?.().unsubscribe(null, intervalChangedHandler)
      })
    }
    window.dispatchEvent(new Event('resize'))
    scheduleResizeRetries()
  })

  replayCtrl = createTvReplayChartController({
    getWidget: () =>
      disposed ? null : (widget as unknown as import('./tradingViewReplayChart').TvReplayWidgetApi),
    replayFeed: datafeedBundle.replayFeed,
    isDisposed: () => disposed,
  })

  return {
    dispose() {
      if (disposed) return
      disposed = true
      try {
        clearTvPositionLines()
        clearBacktestMarkers()
        replayCtrl?.dispose()
        replayCtrl = null
        headerButtonCleanups.forEach((fn) => fn())
        headerButtonCleanups.length = 0
        for (const obs of headerButtonFaceWatchers.values()) obs.disconnect()
        headerButtonFaceWatchers.clear()
        headerButtonActiveState.clear()
        for (const buttonId of headerButtonIds.values()) {
          try {
            widget.removeButton(buttonId)
          } catch {
            /* noop */
          }
        }
        for (const el of headerButtonElements.values()) {
          try {
            widget.removeButton(el)
          } catch {
            /* noop */
          }
        }
        headerButtonIds.clear()
        headerButtonElements.clear()
        headerButtonTitles.clear()
        disposeTradeneuTvDatafeed()
        widget.remove()
      } catch {
        /* noop */
      }
      container.replaceChildren()
    },

    getHeaderButton(id) {
      return resolveHeaderButtonEl(id)
    },

    setHeaderButtonActive(id, active, faceOpts) {
      headerButtonActiveState.set(id, active)
      const el = resolveHeaderButtonEl(id)
      const def = opts.headerButtons?.find((b) => b.id === id)
      const paint = (target: HTMLElement) => {
        paintTextHeaderButtonFace(target, {
          id,
          active,
          label: faceOpts?.label ?? def?.text ?? '◁◁ Replay',
          iconHtml: faceOpts?.iconHtml ?? def?.leadingIconHtml,
          title: def?.title,
        })
        if (id === 'replay') {
          applyReplayActiveChrome(target, active)
          // Re-assert after TV layout ticks (header can restyle on click).
          for (const delay of [0, 50, 150, 400]) {
            window.setTimeout(() => {
              if (headerButtonActiveState.get(id) !== active) return
              const again = resolveHeaderButtonEl(id)
              if (!again) return
              applyReplayActiveChrome(again, active)
            }, delay)
          }
        }
      }
      if (!el) {
        if (!active) return
        window.setTimeout(() => {
          const again = resolveHeaderButtonEl(id)
          if (again) paint(again)
        }, 80)
        return
      }
      paint(el)
    },

    setHeaderButtonIcon(id, iconHtml) {
      const def = opts.headerButtons?.find((b) => b.id === id)
      const title = def?.title ?? headerButtonTitles.get(id) ?? 'Toggle theme'
      const el = resolveHeaderButtonEl(id)
      if (el) applyIconHeaderButton(el, iconHtml, title, id)
    },

    setSymbol(symbol) {
      currentSymbol = symbol.trim().toUpperCase()
      widget.setSymbol(currentSymbol, currentResolution)
    },

    setResolution(resolution) {
      const next = resolution.trim()
      if (tvResolutionMatches(currentResolution, next)) return
      currentResolution = next
      suppressIntervalChange = true
      try {
        const ac = widget.activeChart()
        if (ac?.setResolution) {
          ac.setResolution(next, () => {})
        } else {
          widget.setSymbol(currentSymbol, next)
        }
      } catch (err) {
        console.warn('[TradingView] setResolution failed:', next, err)
        try {
          widget.setSymbol(currentSymbol, next)
        } catch {
          /* noop */
        }
      } finally {
        window.setTimeout(() => {
          suppressIntervalChange = false
        }, 100)
      }
    },

    syncResolution(resolution) {
      const next = resolution.trim()
      if (!next || tvResolutionMatches(currentResolution, next)) return
      currentResolution = next
      suppressIntervalChange = true
      try {
        const ac = widget.activeChart()
        if (ac?.setResolution) {
          ac.setResolution(next, () => {})
        } else {
          widget.setSymbol(currentSymbol, next)
        }
      } catch (err) {
        console.warn('[TradingView] resolution sync failed:', next, err)
        try {
          widget.setSymbol(currentSymbol, next)
        } catch {
          /* noop */
        }
      } finally {
        window.setTimeout(() => {
          suppressIntervalChange = false
        }, 100)
      }
    },

    noteResolution(resolution) {
      const next = resolution.trim()
      if (next) currentResolution = next
    },

    setDataSourceLabel(dataSource) {
      datafeedBundle.setProviderExchangeLabel(dataSource)
      refreshProviderHeader()
    },

    applyTheme(theme) {
      currentTheme = theme
      widget.changeTheme(theme)
      // Theme swap restores default axis line colors — re-hide optional lines.
      const bg = theme === 'dark' ? '#131722' : '#ffffff'
      chartChromeOverrides['scalesProperties.lineColor'] = bg
      chartChromeOverrides['paneProperties.separatorColor'] = bg
      try {
        widget.applyOverrides({
          ...chartChromeOverrides,
          'paneProperties.background': bg,
          'paneProperties.backgroundType': 'solid',
        })
      } catch {
        /* ignore */
      }
      try {
        removeStaleAxisHairlineCovers(mount)
      } catch {
        /* ignore */
      }
    },

    whenChartReady() {
      return chartReady ? Promise.resolve() : chartReadyPromise
    },

    resize() {
      notifyWidgetResize()
    },

    setSessionBars(bars, resolution, barPeriodSec, sessionOpts) {
      replayCtrl?.setSessionBars(bars, resolution, barPeriodSec, sessionOpts)
    },

    primeIntervalFeed(bars, resolution, pastCount, barPeriodSec) {
      replayCtrl?.primeIntervalFeed(bars, resolution, pastCount, barPeriodSec)
    },

    setReplayData(pastBars, allBars, replayOpts) {
      replayCtrl?.setReplayData(pastBars, allBars, replayOpts)
    },

    tickDecoupledReplay(displayBars) {
      return replayCtrl?.tickDecoupledReplay(displayBars) ?? false
    },

    setReplayPickPreview(splitIndex, allBars) {
      replayCtrl?.setReplayPickPreview(splitIndex, allBars)
    },

    clearReplayPickPreview() {
      replayCtrl?.clearReplayPickPreview()
    },

    clearReplay() {
      replayCtrl?.clearReplay()
    },

    scrollReplayCursorIntoView() {
      replayCtrl?.scrollReplayCursorIntoView()
    },

    setHistoricalAnchorIndex(barIndex: number) {
      datafeedBundle.replayFeed.setHistoricalAnchorIndex(barIndex)
    },

    prependSessionBars(bars) {
      const added = datafeedBundle.replayFeed.prependBars(bars)
      if (added > 0) {
        try {
          widget.resetCache()
        } catch {
          /* ignore */
        }
      }
      return added
    },

    appendSessionBars(bars) {
      return datafeedBundle.replayFeed.appendBars(bars)
    },

    viewportAnchorTimeSec(anchorRatio) {
      return replayCtrl?.viewportAnchorTimeSec(anchorRatio) ?? null
    },

    replayIndexAtViewportAnchor(anchorRatio) {
      return replayCtrl?.replayIndexAtViewportAnchor(anchorRatio) ?? 1
    },

    lockedViewportCoversBars(saved, pastBars) {
      return replayCtrl?.lockedViewportCoversBars(saved, pastBars) ?? false
    },

    pickIndexAtClientX(clientX, hostLeft, maxIndex, iframeOffsetX) {
      return replayCtrl?.pickIndexAtClientX(clientX, hostLeft, maxIndex, iframeOffsetX) ?? 0
    },

    timeSecAtClientX(clientX, hostLeft, iframeOffsetX) {
      return replayCtrl?.timeSecAtClientX(clientX, hostLeft, iframeOffsetX) ?? null
    },

    lineXAtBarIndex(barIndex, hostLeft, iframeOffsetX) {
      return replayCtrl?.lineXAtBarIndex(barIndex, hostLeft, iframeOffsetX) ?? null
    },

    lineXAtBarTimeSec(timeSec, iframeOffsetX) {
      return replayCtrl?.lineXAtBarTimeSec(timeSec, iframeOffsetX) ?? null
    },

    chartBarTimeSecAtIndex(barIndex) {
      return replayCtrl?.chartBarTimeSecAtIndex(barIndex) ?? null
    },

    plotXForWallTimeMs(timeMs, plotOffsetX) {
      return replayCtrl?.plotXForWallTimeMs(timeMs, plotOffsetX) ?? null
    },

    hostPointForWallTimeMs(timeMs, price, layout) {
      return replayCtrl?.hostPointForWallTimeMs(timeMs, price, layout) ?? null
    },

    priceToHostY(price, hostEl) {
      const layout = measureTvPlotLayout(mount, hostEl, currentTheme)
      if (!layout || layout.width < 80) return null
      const plotY = replayCtrl?.priceToPlotY(price)
      if (plotY == null || !Number.isFinite(plotY)) return null
      // priceToPlotY is pane-local (main series pane). layout.top is the plot canvas top.
      const y = layout.top + plotY
      const paneBottom = layout.top + Math.max(8, hostEl.clientHeight - layout.top - layout.bottom)
      if (y < layout.top + 2 || y > paneBottom - 2) return null
      return y
    },

    syncReplayPositions(positions, _handlers) {
      // Native createPositionLine pins into header chrome. Use horizontal_line shapes
      // instead — they share the candle price scale, so BUY/SELL stay in sync.
      const chart = (() => {
        try {
          return widget.activeChart() as unknown as {
            createShape: (
              point: { time: number; price: number },
              options: Record<string, unknown>,
            ) => Promise<string>
            getShapeById?: (id: string) => {
              setPoints?: (pts: Array<{ time: number; price: number }>) => void
              applyOverrides?: (o: Record<string, unknown>) => void
            }
            removeEntity?: (id: string) => void
          }
        } catch {
          return null
        }
      })()
      if (!chart || typeof chart.createShape !== 'function') {
        clearTvPositionLines()
        return false
      }

      const ids = new Set(positions.map((p) => p.id))
      for (const [id, bundle] of [...posShapes.entries()]) {
        if (ids.has(id)) continue
        removeShapeId(chart, bundle.entryId)
        removeShapeId(chart, bundle.tpId)
        removeShapeId(chart, bundle.slId)
        posShapes.delete(id)
        posShapesCreating.delete(id)
      }

      const missing: typeof positions = []

      for (const pos of positions) {
        const timeSec = toTimeSec(pos.entryTime)
        const color =
          pos.lineColor ?? (pos.direction === 'long' ? '#2962ff' : '#e65100')
        const label = pos.direction === 'long' ? 'BUY' : 'SELL'
        const bundle = posShapes.get(pos.id)

        if (!bundle) {
          if (!posShapesCreating.has(pos.id)) missing.push(pos)
          continue
        }

        // Sync existing shapes immediately — do NOT bump shapeSyncGen (that was
        // cancelling in-flight createShape on every replay tick / PnL refresh).
        if (
          bundle.entryPrice !== pos.entryPrice ||
          bundle.direction !== pos.direction ||
          bundle.lineColor !== color
        ) {
          setShapePrice(chart, bundle.entryId, timeSec, pos.entryPrice, color, label)
          bundle.entryPrice = pos.entryPrice
          bundle.direction = pos.direction
          bundle.lineColor = color
        }

        if (pos.takeProfit != null) {
          if (!bundle.tpId) {
            if (!posShapesCreating.has(`${pos.id}:tp`)) {
              posShapesCreating.add(`${pos.id}:tp`)
              void createHorzLine(chart, timeSec, pos.takeProfit, '#089981', 'TP').then((tpId) => {
                posShapesCreating.delete(`${pos.id}:tp`)
                if (!tpId || disposed) {
                  if (tpId) removeShapeId(chart, tpId)
                  return
                }
                const b = posShapes.get(pos.id)
                if (!b) {
                  removeShapeId(chart, tpId)
                  return
                }
                b.tpId = tpId
                b.takeProfit = pos.takeProfit
              })
            }
          } else if (bundle.takeProfit !== pos.takeProfit) {
            setShapePrice(chart, bundle.tpId, timeSec, pos.takeProfit, '#089981', 'TP')
            bundle.takeProfit = pos.takeProfit
          }
        } else if (bundle.tpId) {
          removeShapeId(chart, bundle.tpId)
          bundle.tpId = null
          bundle.takeProfit = null
        }

        if (pos.stopLoss != null) {
          if (!bundle.slId) {
            if (!posShapesCreating.has(`${pos.id}:sl`)) {
              posShapesCreating.add(`${pos.id}:sl`)
              void createHorzLine(chart, timeSec, pos.stopLoss, '#f7931a', 'SL').then((slId) => {
                posShapesCreating.delete(`${pos.id}:sl`)
                if (!slId || disposed) {
                  if (slId) removeShapeId(chart, slId)
                  return
                }
                const b = posShapes.get(pos.id)
                if (!b) {
                  removeShapeId(chart, slId)
                  return
                }
                b.slId = slId
                b.stopLoss = pos.stopLoss
              })
            }
          } else if (bundle.stopLoss !== pos.stopLoss) {
            setShapePrice(chart, bundle.slId, timeSec, pos.stopLoss, '#f7931a', 'SL')
            bundle.stopLoss = pos.stopLoss
          }
        } else if (bundle.slId) {
          removeShapeId(chart, bundle.slId)
          bundle.slId = null
          bundle.stopLoss = null
        }
      }

      if (missing.length) {
        const gen = ++shapeSyncGen
        void (async () => {
          for (const pos of missing) {
            if (disposed || gen !== shapeSyncGen) return
            if (posShapes.has(pos.id) || posShapesCreating.has(pos.id)) continue
            posShapesCreating.add(pos.id)
            const timeSec = toTimeSec(pos.entryTime)
            const color =
              pos.lineColor ?? (pos.direction === 'long' ? '#2962ff' : '#e65100')
            const label = pos.direction === 'long' ? 'BUY' : 'SELL'
            try {
              const entryId = await createHorzLine(chart, timeSec, pos.entryPrice, color, label)
              if (!entryId || disposed || gen !== shapeSyncGen) {
                if (entryId) removeShapeId(chart, entryId)
                continue
              }
              let tpId: string | null = null
              let slId: string | null = null
              if (pos.takeProfit != null) {
                tpId = await createHorzLine(chart, timeSec, pos.takeProfit, '#089981', 'TP')
              }
              if (pos.stopLoss != null) {
                slId = await createHorzLine(chart, timeSec, pos.stopLoss, '#f7931a', 'SL')
              }
              if (disposed || gen !== shapeSyncGen || posShapes.has(pos.id)) {
                removeShapeId(chart, entryId)
                removeShapeId(chart, tpId)
                removeShapeId(chart, slId)
                continue
              }
              posShapes.set(pos.id, {
                entryId,
                tpId,
                slId,
                entryPrice: pos.entryPrice,
                takeProfit: pos.takeProfit,
                stopLoss: pos.stopLoss,
                direction: pos.direction,
                lineColor: color,
              })
            } finally {
              posShapesCreating.delete(pos.id)
            }
          }
        })()
      }

      return true
    },

    setBacktestTradeMarkers(trades, opts) {
      clearBacktestMarkers()
      if (!trades.length) return
      const chart = (() => {
        try {
          return widget.activeChart() as unknown as {
            createShape: (
              point: { time: number; price: number },
              options: Record<string, unknown>,
            ) => Promise<string>
            removeEntity?: (id: string) => void
          }
        } catch {
          return null
        }
      })()
      if (!chart || typeof chart.createShape !== 'function') return

      const maxTime = opts?.maxTimeSec
      const filtered =
        maxTime != null && Number.isFinite(maxTime)
          ? trades.filter((t) => toTimeSec(t.entryTime) <= maxTime)
          : trades
      const slice = filtered.slice(0, MAX_BACKTEST_MARKER_TRADES)
      const gen = backtestMarkerGen

      void (async () => {
        for (const t of slice) {
          if (disposed || gen !== backtestMarkerGen) return
          const win = t.pnl > 0
          const color = win ? '#089981' : '#f23645'
          const entrySec = toTimeSec(t.entryTime)
          const exitSec = toTimeSec(t.exitTime)
          try {
            const entryId = await chart.createShape(
              { time: entrySec, price: t.entryPrice },
              {
                shape: t.direction === 'long' ? 'arrow_up' : 'arrow_down',
                lock: true,
                disableSelection: true,
                disableSave: true,
                disableUndo: true,
                showInObjectsTree: false,
                overrides: { color, size: 18 },
              },
            )
            if (entryId && gen === backtestMarkerGen && !disposed) {
              const id = String(entryId)
              ownedShapeIds.add(id)
              backtestMarkerIds.push(id)
            } else if (entryId) {
              removeShapeId(chart, String(entryId))
            }
          } catch (err) {
            console.warn('[TradingView] backtest entry marker failed', err)
          }

          if (maxTime != null && exitSec > maxTime) continue
          try {
            const exitId = await chart.createShape(
              { time: exitSec, price: t.exitPrice },
              {
                shape: 'flag',
                lock: true,
                disableSelection: true,
                disableSave: true,
                disableUndo: true,
                showInObjectsTree: false,
                text: `$${Math.round(Number.isFinite(t.pnl) ? t.pnl : 0)}`,
                overrides: {
                  color,
                  backgroundColor: color,
                  textcolor: '#ffffff',
                  fontsize: 10,
                },
              },
            )
            if (exitId && gen === backtestMarkerGen && !disposed) {
              const id = String(exitId)
              ownedShapeIds.add(id)
              backtestMarkerIds.push(id)
            } else if (exitId) {
              removeShapeId(chart, String(exitId))
            }
          } catch (err) {
            console.warn('[TradingView] backtest exit marker failed', err)
          }
        }
      })()
    },

    getPlotClipInsets(hostEl) {
      const layout = measureTvPlotLayout(mount, hostEl, currentTheme)
      if (!layout) return null
      return { top: layout.top, bottom: layout.bottom, left: layout.left, right: layout.right }
    },

    getPlotLayout(hostEl) {
      return measureTvPlotLayout(mount, hostEl, currentTheme)
    },

    setReplayCursorVisible(visible) {
      replayCtrl?.setReplayCursorVisible(visible)
    },

    setCrosshairVisible(visible) {
      try {
        const transparency = visible ? 0 : 100
        const overrides: Record<string, unknown> = {
          'paneProperties.crossHairProperties.transparency': transparency,
          // Hide TV's black time/price crosshair pills while scissors use our blue label.
          'scalesProperties.showTimeScaleCrosshairLabel': visible,
          'scalesProperties.showPriceScaleCrosshairLabel': visible,
        }
        widget.applyOverrides(overrides)
        widget.activeChart()?.applyOverrides?.(overrides)
      } catch {
        /* ignore */
      }
    },

    setViewportFreeze(viewport) {
      replayCtrl?.setViewportFreeze(viewport)
    },

    setReplayLockedViewport(viewport) {
      replayCtrl?.setReplayLockedViewport(viewport)
    },

    flushPendingRefresh() {
      replayCtrl?.flushPendingRefresh()
    },

    isProgrammaticViewportRestore() {
      return replayCtrl?.isProgrammaticViewportRestore() ?? false
    },

    notifyUserPlaybackPan(barPeriodSec) {
      replayCtrl?.notifyUserPlaybackPan(barPeriodSec)
    },

    getReplayLockedViewport() {
      return replayCtrl?.getReplayLockedViewport() ?? null
    },

    subscribeTimeScaleChange(fn) {
      return replayCtrl?.subscribeTimeScaleChange(fn) ?? (() => {})
    },

    captureVisibleRange() {
      return replayCtrl?.captureVisibleRange() ?? null
    },

    captureLockedViewport() {
      return replayCtrl?.captureLockedViewport() ?? null
    },

    restoreVisibleRange(range) {
      return replayCtrl?.restoreVisibleRange(range) ?? Promise.resolve()
    },

    swapInterval(bars, resolution, pastCount, lockedViewport, swapOpts) {
      const next = resolution.trim()
      let actualRes: string | undefined
      try {
        actualRes = widget.activeChart()?.resolution?.()?.trim()
      } catch {
        actualRes = undefined
      }
      // Defer only when the chart widget is not yet on the target resolution.
      // Do NOT use currentResolution here — noteResolution() can mark us "already
      // switched" while TV is still on the old interval, which skipped setResolution,
      // refreshed denser/empty data into the wrong TF, and left the chart stuck loading.
      const alreadyAtTarget = tvResolutionMatches(actualRes, next)
      const deferRefresh = !alreadyAtTarget

      replayCtrl?.swapInterval(bars, resolution, pastCount, lockedViewport, {
        ...swapOpts,
        deferRefresh,
      })

      if (!deferRefresh) {
        currentResolution = next
        return Promise.resolve()
      }

      suppressIntervalChange = true
      return new Promise<void>((resolve) => {
        let finishTimer: ReturnType<typeof setTimeout> | undefined
        let pollTimer: ReturnType<typeof setTimeout> | undefined
        let finished = false
        const finishOnce = () => {
          if (finished) return
          finished = true
          if (finishTimer != null) window.clearTimeout(finishTimer)
          if (pollTimer != null) window.clearTimeout(pollTimer)
          currentResolution = next
          replayCtrl?.finishIntervalSwap()
          suppressIntervalChange = false
          resolve()
        }
        // Higher TFs (1h/4h) are in-memory aggregates — don't wait multi-seconds on TV.
        const waitForResolutionThenFinish = () => {
          const deadline = Date.now() + 900
          const poll = () => {
            if (finished || disposed) {
              finishOnce()
              return
            }
            try {
              const actual = widget.activeChart()?.resolution?.()
              if (tvResolutionMatches(actual, next) || Date.now() >= deadline) {
                finishOnce()
                return
              }
            } catch {
              /* chart may still be switching */
            }
            pollTimer = window.setTimeout(poll, 40)
          }
          poll()
        }
        const applyChartResolution = () => {
          try {
            const ac = widget.activeChart()
            if (ac?.setResolution) {
              ac.setResolution(next, waitForResolutionThenFinish)
              return
            }
          } catch (err) {
            console.warn('[TradingView] swapInterval setResolution failed:', next, err)
          }
          try {
            widget.setSymbol(currentSymbol, next, waitForResolutionThenFinish)
          } catch (err) {
            console.warn('[TradingView] swapInterval setSymbol failed:', next, err)
            finishOnce()
          }
        }
        finishTimer = window.setTimeout(finishOnce, 1200)
        applyChartResolution()
      })
    },
  }
}
