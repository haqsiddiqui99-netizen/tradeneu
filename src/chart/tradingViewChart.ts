import {
  createTradeneuTvDatafeed,
  disposeTradeneuTvDatafeed,
  tvResolutionMatches,
} from './tradingViewDatafeed'
import type { TvDatafeed } from './tradingViewTypes'
import type { Bar } from '../types'
import { createTvReplayChartController, type TvLockedViewport, type TvReplayChartController } from './tradingViewReplayChart'

type TvTheme = 'light' | 'dark'

export type TvHeaderButtonDef = {
  id: string
  title: string
  text?: string
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
  /** Provider label for resolveSymbol (e.g. dukascopy:xauusd → Dukascopy). Set before widget init. */
  dataSource?: string
  onSymbolChange?: (symbol: string) => void
  /** Fired when the user changes interval via the TV header (not programmatic sync). */
  onResolutionChange?: (resolution: string) => void
  /** Set while applyIntervalPick is running (guards datafeed during rebucket). */
  intervalSwapRef?: { inProgress: boolean }
  headerButtons?: TvHeaderButtonDef[]
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

/** Main plot clip insets + iframe horizontal offset for time-scale coordinates. */
function measureTvPlotLayout(
  mount: HTMLElement,
  hostEl: HTMLElement,
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
  for (const canvas of doc.querySelectorAll('canvas')) {
    const r = canvas.getBoundingClientRect()
    const area = r.width * r.height
    if (r.width < 120 || r.height < 80) continue
    if (area > bestArea) {
      bestArea = area
      best = r
    }
  }
  if (!best) {
    return {
      top: 0,
      bottom: 0,
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
  return {
    top: Math.max(0, Math.round(best.top - hostRect.top)),
    bottom: Math.max(0, Math.round(hostRect.bottom - best.bottom)),
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

function repositionAfterIndicatorTemplate(mount: HTMLElement, labels: string[]): void {
  const doc = tvIframeDocument(mount)
  if (!doc) return
  const anchor = findIndicatorTemplateAnchor(doc)
  if (!anchor) return
  const slots: HTMLElement[] = []
  for (const label of labels) {
    const slot = findHeaderButtonByText(doc, label)
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

/** True when the synced TV static bundle is present (skipped on Vercel without submodule). */
export async function tradingViewLibraryAvailable(): Promise<boolean> {
  try {
    const res = await fetch(chartingLibraryScriptUrl(), { method: 'HEAD', cache: 'no-store' })
    return res.ok
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
      const finishOk = () => {
        if (tvWidgetCtor()) resolve()
        else reject(new Error('TradingView script loaded but widget constructor is missing'))
      }
      const finishErr = (msg: string) => {
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

  let currentSymbol = opts.symbol.trim().toUpperCase()
  let currentResolution = opts.resolution
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
    onDataSourceResolved: (dataSource) => {
      datafeedBundle.setProviderExchangeLabel(dataSource)
      refreshProviderHeader()
    },
  })
  if (opts.dataSource?.trim()) {
    datafeedBundle.setProviderExchangeLabel(opts.dataSource)
    lastProviderExchangeLabel = datafeedBundle.getProviderExchangeLabel()
  }
  datafeedBundle.replayFeed.setTvFullSeriesReplay(false)
  const datafeed: TvDatafeed = datafeedBundle.datafeed

  let replayCtrl: TvReplayChartController | null = null

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
    ],
    custom_css_url: `${chartingLibraryBaseUrl()}tv-header-overrides.css`,
    loading_screen: { backgroundColor: opts.theme === 'dark' ? '#131722' : '#ffffff' },
    overrides:
      opts.theme === 'dark'
        ? {
            'paneProperties.background': '#131722',
            'paneProperties.backgroundType': 'solid',
          }
        : {
            'paneProperties.background': '#ffffff',
            'paneProperties.backgroundType': 'solid',
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
    const afterTemplateLabels: string[] = []
    const beforeUtilityButtons: HTMLElement[] = []

    for (const def of opts.headerButtons ?? []) {
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
        if (def.insertAfterIndicatorTemplate) afterTemplateLabels.push(def.text)
      } catch (err) {
        console.error('[TradingView] createButton failed:', def.id, err)
      }
    }

    const runPlacement = () => {
      if (afterTemplateLabels.length) {
        repositionAfterIndicatorTemplate(mount, afterTemplateLabels)
      }
      for (const el of beforeUtilityButtons) {
        repositionBeforeRightUtilities(mount, el)
      }
      for (const def of opts.headerButtons ?? []) {
        if (!def.iconHtml) continue
        const el = resolveHeaderButtonEl(def.id)
        if (el) applyIconHeaderButton(el, def.iconHtml, def.title, def.id)
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

    void widget
      .headerReady()
      .then(mountHeaderButtons)
      .catch((err) => console.error('[TradingView] headerReady failed:', err))

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
        replayCtrl?.dispose()
        replayCtrl = null
        headerButtonCleanups.forEach((fn) => fn())
        headerButtonCleanups.length = 0
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
      widget.changeTheme(theme)
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

    getPlotClipInsets(hostEl) {
      const layout = measureTvPlotLayout(mount, hostEl)
      if (!layout) return null
      return { top: layout.top, bottom: layout.bottom, left: layout.left, right: layout.right }
    },

    getPlotLayout(hostEl) {
      return measureTvPlotLayout(mount, hostEl)
    },

    setReplayCursorVisible(visible) {
      replayCtrl?.setReplayCursorVisible(visible)
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
      const alreadyAtTarget = tvResolutionMatches(actualRes, next)
      const resolutionChanging = !!(next && !tvResolutionMatches(currentResolution, next))
      const deferRefresh = resolutionChanging && !alreadyAtTarget

      replayCtrl?.swapInterval(bars, resolution, pastCount, lockedViewport, {
        ...swapOpts,
        deferRefresh,
      })

      currentResolution = next

      if (!deferRefresh) {
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
          replayCtrl?.finishIntervalSwap()
          suppressIntervalChange = false
          resolve()
        }
        const waitForResolutionThenFinish = () => {
          const deadline = Date.now() + 5000
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
            pollTimer = window.setTimeout(poll, 50)
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
        finishTimer = window.setTimeout(finishOnce, 6000)
        applyChartResolution()
      })
    },
  }
}
