import './chartSplitGrid.css'
import type { Bar } from '../types'
import { aggregateOHLCV } from './aggregateBars'
import { splitLayoutPanes, DEFAULT_SPLIT_LAYOUT } from './chartSplitLayouts'
import { createTradingViewChart, type TradingViewChartHandle } from './tradingViewChart'
import type { ChartLayoutSync } from './chartLayoutStore'

export type ChartSplitGridApi = {
  setLayout: (split: string) => void
  getLayout: () => string
  /** Whichever pane the shared header and footer currently drive. */
  getActiveHandle: () => TradingViewChartHandle | null
  /** Revealed replay bars for the primary chart; secondary panes re-bucket from these. */
  setBars: (bars: Bar[], barPeriodSec: number) => void
  setSymbol: (symbol: string) => void
  setTheme: (theme: 'light' | 'dark') => void
  setSync: (sync: ChartLayoutSync) => void
  resize: () => void
  dispose: () => void
}

/** Bar periods a secondary pane can be switched to, and the TradingView resolution for each. */
const STEPS: Array<{ sec: number; resolution: string }> = [
  { sec: 60, resolution: '1' },
  { sec: 180, resolution: '3' },
  { sec: 300, resolution: '5' },
  { sec: 900, resolution: '15' },
  { sec: 1800, resolution: '30' },
  { sec: 3600, resolution: '60' },
  { sec: 14400, resolution: '240' },
  { sec: 86400, resolution: '1D' },
]

function stepSecForResolution(resolution: string, fallback: number): number {
  const hit = STEPS.find((s) => s.resolution === resolution)
  return hit ? hit.sec : fallback
}

function resolutionForStepSec(sec: number): string {
  const hit = STEPS.find((s) => s.sec === sec)
  return hit ? hit.resolution : '1'
}

type Pane = {
  /** Chart index from the layout tree; 0 is the primary and is never owned by the grid. */
  chart: number
  el: HTMLElement
  handle: TradingViewChartHandle | null
  /** Resolves once the widget has been created, so teardown can await in-flight mounts. */
  pending: Promise<void> | null
  stepSec: number
}

export function createChartSplitGrid(opts: {
  /** Wrapper the grid positions panes inside. Must be a positioned element. */
  container: HTMLElement
  /** The existing, fully-wired primary chart element. Always hosted in pane 0. */
  primaryEl: HTMLElement
  /** The widget behind `primaryEl`, once it exists — pane 0 for focus and chrome purposes. */
  getPrimaryHandle: () => TradingViewChartHandle | null
  getSymbol: () => string
  getTheme: () => 'light' | 'dark'
  getDataSource: () => string | undefined
  getSessionRange: () => { startSec?: number; endSec?: number }
  /** Called after panes move or resize so the primary chart can re-measure. */
  onLayoutApplied?: (chartCount: number) => void
  /**
   * Raised before panes are placed, so the host can mount or drop the shared chrome and have
   * it measurable by the time `getChromeInsets` is read.
   */
  onMultiChange?: (multi: boolean) => void
  /** Height of the shared header and footer, which panes must not sit underneath. */
  getChromeInsets?: () => { top: number; bottom: number }
  onActiveChange?: (chart: number) => void
}): ChartSplitGridApi {
  let split = DEFAULT_SPLIT_LAYOUT
  let sync: ChartLayoutSync = {
    symbol: false,
    interval: false,
    crosshair: true,
    time: false,
    dateRange: false,
  }
  let lastBars: Bar[] = []
  let lastStepSec = 60
  let disposed = false
  let feedQueued = false
  let activeChart = 0

  const panes = new Map<number, Pane>()

  opts.container.classList.add('rw-split-grid')
  opts.primaryEl.classList.add('rw-split-grid__pane', 'rw-split-grid__pane--primary')

  type Cell = { x: number; y: number; w: number; h: number }
  type Insets = { top: number; bottom: number }

  const NO_INSETS: Insets = { top: 0, bottom: 0 }

  /**
   * Lays a cell out inside the band left over by the shared chrome. `crop` is extra height
   * added above and below the cell and then clipped away again, hiding each pane's own
   * TradingView header and footer while leaving their controls in the DOM for the shared
   * header to drive.
   */
  function placePane(el: HTMLElement, cell: Cell, chrome: Insets, crop: Insets = NO_INSETS) {
    const band = chrome.top + chrome.bottom
    const grow = crop.top + crop.bottom
    el.style.left = `${cell.x * 100}%`
    el.style.width = `${cell.w * 100}%`
    el.style.top = `calc(${chrome.top - crop.top}px + ${cell.y} * (100% - ${band}px))`
    el.style.height = `calc(${cell.h} * (100% - ${band}px) + ${grow}px)`
    el.style.clipPath = grow ? `inset(${crop.top}px 0px ${crop.bottom}px 0px)` : ''
    el.style.setProperty('--rw-split-crop-top', `${crop.top}px`)
    el.style.setProperty('--rw-split-crop-bottom', `${crop.bottom}px`)
  }

  function paintActive() {
    opts.primaryEl.classList.toggle('rw-split-grid__pane--active', activeChart === 0)
    for (const pane of panes.values()) {
      pane.el.classList.toggle('rw-split-grid__pane--active', pane.chart === activeChart)
    }
  }

  function setActive(chart: number) {
    if (activeChart === chart) return
    activeChart = chart
    paintActive()
    opts.onActiveChange?.(chart)
  }

  /**
   * A click inside a pane never reaches this document — each pane is an iframe. Focusing one
   * does move `document.activeElement` here though, which is enough to tell them apart. The
   * poll backs up the events because focus can land without either of them firing.
   */
  function trackActivePane(): () => void {
    const read = () => {
      const el = document.activeElement
      const paneEl = el?.closest?.('.rw-split-grid__pane')
      if (!paneEl) return
      if (paneEl === opts.primaryEl) {
        setActive(0)
        return
      }
      const index = Number(paneEl.getAttribute('data-rw-split-pane'))
      if (Number.isFinite(index)) setActive(index)
    }
    const onBlur = () => window.setTimeout(read, 0)
    window.addEventListener('blur', onBlur)
    document.addEventListener('focusin', read, true)
    const timer = window.setInterval(read, 400)
    return () => {
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('focusin', read, true)
      window.clearInterval(timer)
    }
  }

  function fitPaneViewport(pane: Pane) {
    if (!pane.handle) return
    const bars = barsForPane(pane)
    if (bars.length) pane.handle.refitViewport(bars, bars.length)
  }

  function barsForPane(pane: Pane): Bar[] {
    return pane.stepSec > lastStepSec ? aggregateOHLCV(lastBars, pane.stepSec) : lastBars
  }

  function feedPane(pane: Pane) {
    if (!pane.handle || !lastBars.length) return
    // Only ever the bars the replay has revealed, re-bucketed up — never a fresh datafeed
    // fetch, which would hand the pane future candles the session is meant to hide.
    const bars = barsForPane(pane)
    pane.handle.setSessionBars(bars, resolutionForStepSec(pane.stepSec), pane.stepSec)
  }

  /**
   * Mounting is deferred until revealed bars exist. The datafeed only serves from the replay
   * feed while it holds session bars; seed it empty and it falls through to a live market
   * fetch bounded by the session range, which would put future candles on the pane.
   */
  function ensureMounted(pane: Pane) {
    if (pane.handle || pane.pending || !lastBars.length) return
    pane.pending = mountPane(pane)
      .catch((err) => console.warn('[split] pane mount failed', err))
      .finally(() => {
        pane.pending = null
      })
  }

  async function mountPane(pane: Pane) {
    const range = opts.getSessionRange()
    const stepSec = pane.stepSec
    const bars = barsForPane(pane)
    const handle = await createTradingViewChart(pane.el, {
      symbol: opts.getSymbol(),
      resolution: resolutionForStepSec(stepSec),
      theme: opts.getTheme(),
      dataSource: opts.getDataSource(),
      sessionStartSec: range.startSec,
      sessionEndSec: range.endSec,
      bare: true,
      initialSessionBars: { bars, resolution: resolutionForStepSec(stepSec), barPeriodSec: stepSec },
      onResolutionChange: (resolution) => {
        pane.stepSec = stepSecForResolution(resolution, pane.stepSec)
        feedPane(pane)
      },
    })
    if (disposed || !panes.has(pane.chart)) {
      handle.dispose()
      return
    }
    pane.handle = handle
    feedPane(pane)
  }

  function apply() {
    const cells = splitLayoutPanes(split)
    const wanted = new Set(cells.map((c) => c.chart))
    const multi = cells.length > 1
    if (!wanted.has(activeChart)) setActive(0)
    // Mount or drop the shared chrome first, so its height is measurable below.
    opts.onMultiChange?.(multi)
    const chrome = multi ? (opts.getChromeInsets?.() ?? NO_INSETS) : NO_INSETS
    // Every pane is the same widget configuration, so the primary's bands size them all.
    const crop = multi
      ? (opts.getPrimaryHandle()?.getChromeInsets() ?? NO_INSETS)
      : NO_INSETS

    for (const [index, pane] of [...panes]) {
      if (wanted.has(index)) continue
      panes.delete(index)
      const teardown = () => {
        pane.handle?.dispose()
        pane.el.remove()
      }
      // A pane can be dropped while its widget is still booting; wait it out first.
      if (pane.pending) void pane.pending.then(teardown)
      else teardown()
    }

    for (const cell of cells) {
      if (cell.chart === 0) {
        placePane(opts.primaryEl, cell, chrome, crop)
        continue
      }
      let pane = panes.get(cell.chart)
      if (!pane) {
        const el = document.createElement('div')
        el.className = 'rw-split-grid__pane'
        el.dataset.rwSplitPane = String(cell.chart)
        opts.container.appendChild(el)
        pane = { chart: cell.chart, el, handle: null, pending: null, stepSec: lastStepSec }
        panes.set(cell.chart, pane)
        ensureMounted(pane)
      }
      placePane(pane.el, cell, chrome, crop)
    }

    opts.container.classList.toggle('rw-split-grid--multi', multi)
    paintActive()
    opts.onLayoutApplied?.(cells.length)
    // TradingView autosizes off its container, which we just moved; nudge every pane.
    requestAnimationFrame(() => {
      for (const pane of panes.values()) {
        pane.handle?.resize()
        fitPaneViewport(pane)
      }
    })
  }

  apply()
  const stopActiveTracking = trackActivePane()

  return {
    getLayout: () => split,

    getActiveHandle: () =>
      activeChart === 0
        ? opts.getPrimaryHandle()
        : (panes.get(activeChart)?.handle ?? opts.getPrimaryHandle()),

    setLayout(next) {
      if (disposed || next === split) return
      split = next
      apply()
    },

    setBars(bars, barPeriodSec) {
      lastBars = bars
      lastStepSec = barPeriodSec
      if (!panes.size || feedQueued) return
      // Replay ticks land far faster than a pane needs repainting, and each feed re-buckets
      // the whole revealed series, so coalesce to one pass per frame.
      feedQueued = true
      requestAnimationFrame(() => {
        feedQueued = false
        if (disposed) return
        for (const pane of panes.values()) {
          // Picks up panes whose mount was held back until bars arrived.
          ensureMounted(pane)
          feedPane(pane)
        }
      })
    },

    setSymbol(symbol) {
      if (!sync.symbol) return
      for (const pane of panes.values()) pane.handle?.setSymbol(symbol)
    },

    setTheme(theme) {
      for (const pane of panes.values()) pane.handle?.applyTheme(theme)
    },

    setSync(next) {
      sync = { ...next }
    },

    resize() {
      for (const pane of panes.values()) pane.handle?.resize()
    },

    dispose() {
      disposed = true
      stopActiveTracking()
      for (const pane of panes.values()) {
        pane.handle?.dispose()
        pane.el.remove()
      }
      panes.clear()
      opts.onMultiChange?.(false)
      opts.container.classList.remove('rw-split-grid', 'rw-split-grid--multi')
      opts.primaryEl.classList.remove(
        'rw-split-grid__pane',
        'rw-split-grid__pane--primary',
        'rw-split-grid__pane--active',
      )
      opts.primaryEl.removeAttribute('style')
    },
  }
}
