import type { Bar } from '../types'
import { barToTv } from './tradingViewReplayFeed'
import type { TvReplayFeedController } from './tradingViewReplayFeed'

type TvSubscription = {
  subscribe: (obj: null, cb: () => void) => void
  unsubscribe: (obj: null, cb: () => void) => void
}

type TvTimeScaleApi = {
  coordinateToTime: (x: number) => number | null
  timeToCoordinate?: (time: number) => number | null
  barSpacing?: () => number
  rightOffset?: () => number
  width: () => number
  setRightOffset: (offset: number) => void
  setBarSpacing: (newBarSpacing: number) => void
  barSpacingChanged: () => TvSubscription
  rightOffsetChanged: () => TvSubscription
}

export type TvReplayChartApi = {
  resetData: () => void
  setVisibleRange: (
    range: { from: number; to: number },
    options?: { percentRightMargin?: number },
  ) => Promise<void>
  getVisibleRange?: () => { from: number; to: number } | null
  getTimeScale: () => TvTimeScaleApi
  onVisibleRangeChanged?: () => TvSubscription
  createShape: (
    point: { time: number },
    options: Record<string, unknown>,
  ) => Promise<string | null>
  removeEntity: (id: string) => void
}

export type TvReplayWidgetApi = {
  resetCache: () => void
  activeChart: () => TvReplayChartApi
}

const REPLAY_VISIBLE_SEC = 180 * 60
const REPLAY_BAR_SPACING = 6
const REPLAY_RIGHT_OFFSET = 90
/** Bars to show after switching 1m/5m/15m so candles keep normal width. */
const INTERVAL_SWAP_VISIBLE_BARS = 80
/** Tick / sub-minute: TV resolution stays 1m but bars are remapped to minute slots. */
const TICK_SWAP_VISIBLE_BARS = 120
const REFRESH_THROTTLE_MS = 150
/** Default cap for sub-minute / tick incremental emits. */
const MAX_REALTIME_EMIT_BATCH = 4
/** Max 1m chart bars revealed in one decoupled replay step (e.g. 10m step on 1m chart). */
const MAX_DECOUPLED_CHART_BAR_STEP = 16

export type TvLockedViewport = {
  from: number
  to: number
  barSpacing?: number
  rightOffset?: number
}

export type TvReplayChartController = {
  setSessionBars: (
    bars: Bar[],
    resolution: string,
    barPeriodSec?: number,
    opts?: { deferRefresh?: boolean },
  ) => void
  /** Feed-only interval prep when TV header already switched resolution. */
  primeIntervalFeed: (
    bars: Bar[],
    resolution: string,
    pastCount: number,
    barPeriodSec?: number,
  ) => void
  setReplayData: (
    pastBars: Bar[],
    allBars: Bar[],
    opts?: {
      fit?: boolean
      playing?: boolean
      force?: boolean
      preserveViewport?: boolean
      restoreVisibleRange?: TvLockedViewport
      /** Chart interval ≠ replay step — forming candles, no full-series mask. */
      decoupled?: boolean
      /** Replay step interval changed — keep chart pan/zoom, no cursor scroll. */
      decoupledStepOnly?: boolean
      /** Manual replay step (fwd/back) while paused — keep chart pan/zoom. */
      stepPreserveView?: boolean
    },
  ) => void
  /** Lightweight decoupled replay step — patch + realtime bar only (no resetData). Returns false if a full refresh is needed. */
  tickDecoupledReplay: (displayBars: Bar[]) => boolean
  setReplayPickPreview: (splitIndex: number, allBars: Bar[]) => void
  clearReplayPickPreview: () => void
  clearReplay: () => void
  scrollReplayCursorIntoView: () => void
  /** Unix seconds at a horizontal anchor in the visible plot (0 = left, 1 = right). */
  viewportAnchorTimeSec: (anchorRatio?: number) => number | null
  /** 1-based replay index for {@link ReplayController} at the visible plot anchor. */
  replayIndexAtViewportAnchor: (anchorRatio?: number) => number
  /** Whether a saved scissors viewport still matches the revealed bar window. */
  lockedViewportCoversBars: (saved: TvLockedViewport, pastBars: Bar[]) => boolean
  pickIndexAtClientX: (clientX: number, hostLeft: number, maxIndex: number, iframeOffsetX?: number) => number
  timeSecAtClientX: (clientX: number, hostLeft: number, iframeOffsetX?: number) => number | null
  lineXAtBarIndex: (barIndex: number, hostLeft: number, iframeOffsetX?: number) => number | null
  lineXAtBarTimeSec: (timeSec: number, iframeOffsetX?: number) => number | null
  /** Wall time (sec) of bar `i` as drawn on the TV chart (remapped for tick intervals). */
  chartBarTimeSecAtIndex: (barIndex: number) => number | null
  /** Plot X in chart-host pixels for wall-clock tick time (sub-minute). */
  plotXForWallTimeMs: (timeMs: number, plotOffsetX: number) => number | null
  /** Chart-host pixel for tick overlay (time + price). */
  hostPointForWallTimeMs: (
    timeMs: number,
    price: number,
    layout: { plotOffsetX: number; top: number; bottom: number; width: number },
  ) => { x: number; y: number } | null
  subscribeTimeScaleChange: (fn: () => void) => () => void
  setReplayCursorVisible: (visible: boolean) => void
  /** Freeze pan/zoom while scissors pick is active (prevents chart drift / overlay misalignment). */
  setViewportFreeze: (viewport: TvLockedViewport | null) => void
  setReplayLockedViewport: (viewport: TvLockedViewport | null) => void
  /** Replace series + replay cursor in one refresh while keeping pan/zoom (interval changes). */
  swapInterval: (
    bars: Bar[],
    resolution: string,
    pastCount: number,
    lockedViewport: TvLockedViewport | null,
    opts?: { refit?: boolean; barPeriodSec?: number; deferRefresh?: boolean },
  ) => void
  /** Run cache reset / viewport refit after TV resolution has caught up (see deferRefresh). */
  finishIntervalSwap: () => void
  /** Apply a refresh that was deferred while the TV chart was still initializing. */
  flushPendingRefresh: () => void
  /** True while replay code is applying a locked viewport (ignore user pan handlers). */
  isProgrammaticViewportRestore: () => boolean
  /** Pause FxReplay bar-shift briefly after the user pans during playback. */
  notifyUserPlaybackPan: (barPeriodSec?: number) => void
  getReplayLockedViewport: () => TvLockedViewport | null
  captureVisibleRange: () => { from: number; to: number } | null
  captureLockedViewport: () => TvLockedViewport | null
  restoreVisibleRange: (range: TvLockedViewport) => Promise<void>
  dispose: () => void
}

export function createTvReplayChartController(opts: {
  getWidget: () => TvReplayWidgetApi | null
  replayFeed: TvReplayFeedController
  isDisposed: () => boolean
}): TvReplayChartController {
  let lastPastCount = -1
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let cursorTimer: ReturnType<typeof setTimeout> | null = null
  let lastRefreshAt = 0
  let rangeSubscribed = false
  let visibleRangeSubscribed = false
  let cursorSuppressed = false
  let lastPickPreviewSplit = -1
  let frozenViewport: TvLockedViewport | null = null
  let replayLockedViewport: TvLockedViewport | null = null
  let viewportRestoreRaf = 0
  let pendingIncrementalViewport: TvLockedViewport | null = null
  let pendingIntervalSwapRefresh: {
    bars: Bar[]
    pastCountClamped: number
    lockedViewport: TvLockedViewport | null
    swapOpts?: { refit?: boolean; barPeriodSec?: number }
  } | null = null
  let pendingFullRefresh = false
  let pendingFullRefreshForce = false
  const rangeListeners: Array<() => void> = []
  let programmaticViewportRestoreDepth = 0
  /** After user pan during play, hold viewport without FxReplay shift until this time. */
  let suppressPlaybackShiftUntil = 0

  const beginProgrammaticViewportRestore = () => {
    programmaticViewportRestoreDepth++
  }

  const endProgrammaticViewportRestore = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        programmaticViewportRestoreDepth = Math.max(0, programmaticViewportRestoreDepth - 1)
      })
    })
  }

  const isProgrammaticViewportRestore = (): boolean => programmaticViewportRestoreDepth > 0

  const notifyUserPlaybackPan = (barPeriodSec = 60) => {
    suppressPlaybackShiftUntil = Date.now() + Math.max(500, barPeriodSec * 1000)
    cancelIncrementalViewportRaf()
  }

  const maxRealtimeEmitBatch = (): number => {
    const periodSec = Math.max(1, opts.replayFeed.getBarPeriodSec())
    if (periodSec < 60) return MAX_REALTIME_EMIT_BATCH
    return Math.max(MAX_REALTIME_EMIT_BATCH, MAX_DECOUPLED_CHART_BAR_STEP)
  }

  const chart = (): TvReplayChartApi | null => {
    try {
      return opts.getWidget()?.activeChart() ?? null
    } catch {
      return null
    }
  }

  const markPendingFullRefresh = (force = false) => {
    pendingFullRefresh = true
    if (force) pendingFullRefreshForce = true
  }

  const doFullRefresh = () => {
    if (opts.isDisposed()) return
    lastRefreshAt = Date.now()
    const w = opts.getWidget()
    const c = chart()
    if (!w || !c) {
      markPendingFullRefresh(true)
      return
    }
    pendingFullRefresh = false
    pendingFullRefreshForce = false
    try {
      opts.replayFeed.requestSubscriberReset()
      w.resetCache()
      c.resetData()
    } catch {
      markPendingFullRefresh(true)
    }
  }

  const doFullRefreshWithLockedViewport = (saved: TvLockedViewport, scheduleRetries = true) => {
    doFullRefresh()
    void restoreVisibleRangeLocked(saved)
    if (scheduleRetries) scheduleLockedViewportRestore(saved)
  }

  /** After realtime bar append — fix pan without reloading the whole series. */
  const cancelIncrementalViewportRaf = () => {
    if (viewportRestoreRaf) {
      cancelAnimationFrame(viewportRestoreRaf)
      viewportRestoreRaf = 0
    }
    pendingIncrementalViewport = null
  }

  const applyPlaybackViewportRange = (saved: TvLockedViewport) => {
    const c = chart()
    if (!c) return
    pendingIncrementalViewport = saved
    if (viewportRestoreRaf) return
    viewportRestoreRaf = requestAnimationFrame(() => {
      viewportRestoreRaf = 0
      const target = pendingIncrementalViewport
      pendingIncrementalViewport = null
      if (!target || opts.isDisposed()) return
      const cc = chart()
      if (!cc) return
      beginProgrammaticViewportRestore()
      try {
        void cc.setVisibleRange({
          from: normalizeChartTimeSec(target.from),
          to: normalizeChartTimeSec(target.to),
        })
      } catch {
        /* TV may reject tight ranges on small screens */
      }
      endProgrammaticViewportRestore()
    })
  }

  const restoreViewportAfterIncrementalBar = (saved: TvLockedViewport) => {
    const c = chart()
    if (!c) return
    try {
      const ts = c.getTimeScale()
      if (saved.barSpacing != null && Number.isFinite(saved.barSpacing)) {
        ts.setBarSpacing(saved.barSpacing)
      }
      if (saved.rightOffset != null && Number.isFinite(saved.rightOffset)) {
        ts.setRightOffset(saved.rightOffset)
      }
    } catch {
      /* noop */
    }

    pendingIncrementalViewport = saved
    if (viewportRestoreRaf) return
    beginProgrammaticViewportRestore()
    viewportRestoreRaf = requestAnimationFrame(() => {
      viewportRestoreRaf = 0
      const target = pendingIncrementalViewport
      pendingIncrementalViewport = null
      if (!target || opts.isDisposed()) {
        endProgrammaticViewportRestore()
        return
      }
      const cc = chart()
      if (!cc) {
        endProgrammaticViewportRestore()
        return
      }
      try {
        void cc.setVisibleRange({
          from: normalizeChartTimeSec(target.from),
          to: normalizeChartTimeSec(target.to),
        })
      } catch {
        /* TV may reject tight ranges on small screens */
      }
      endProgrammaticViewportRestore()
    })
  }

  let pickPreviewClampTimer: ReturnType<typeof setTimeout> | null = null
  const viewportRestoreTimers: ReturnType<typeof setTimeout>[] = []

  const scheduleFullRefresh = (force = false) => {
    if (opts.isDisposed()) return
    if (!chart()) {
      markPendingFullRefresh(force)
      return
    }
    const now = Date.now()
    const elapsed = now - lastRefreshAt
    if (!force && elapsed < REFRESH_THROTTLE_MS) {
      if (refreshTimer) return
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        doFullRefresh()
      }, REFRESH_THROTTLE_MS - elapsed)
      return
    }
    if (refreshTimer) {
      window.clearTimeout(refreshTimer)
      refreshTimer = null
    }
    doFullRefresh()
  }

  /** After pick preview truncates bars, pan/zoom may still point past the cut — clamp to revealed data. */
  const schedulePickPreviewViewportClamp = (pastBars: Bar[]) => {
    if (frozenViewport) return
    if (pickPreviewClampTimer) window.clearTimeout(pickPreviewClampTimer)
    pickPreviewClampTimer = window.setTimeout(() => {
      pickPreviewClampTimer = null
      void clampPickPreviewViewport(pastBars)
    }, 80)
  }

  const readLockedViewport = (): TvLockedViewport | null => {
    const c = chart()
    if (!c?.getVisibleRange) return null
    try {
      const r = c.getVisibleRange()
      if (!r || !Number.isFinite(r.from) || !Number.isFinite(r.to)) return null
      const ts = c.getTimeScale()
      return {
        from: normalizeChartTimeSec(r.from),
        to: normalizeChartTimeSec(r.to),
        barSpacing: ts.barSpacing?.(),
        rightOffset: ts.rightOffset?.(),
      }
    } catch {
      return null
    }
  }

  const RESTORE_VIEWPORT_TIMEOUT_MS = 2500

  const restoreVisibleRangeLocked = async (saved: TvLockedViewport) => {
    const c = chart()
    if (!c) return
    beginProgrammaticViewportRestore()
    try {
      const ts = c.getTimeScale()
      if (saved.barSpacing != null && Number.isFinite(saved.barSpacing)) {
        ts.setBarSpacing(saved.barSpacing)
      }
      if (saved.rightOffset != null && Number.isFinite(saved.rightOffset)) {
        ts.setRightOffset(saved.rightOffset)
      }
      await Promise.race([
        c.setVisibleRange({
          from: normalizeChartTimeSec(saved.from),
          to: normalizeChartTimeSec(saved.to),
        }),
        new Promise<void>((resolve) => window.setTimeout(resolve, RESTORE_VIEWPORT_TIMEOUT_MS)),
      ])
    } catch {
      /* TV may reject tight ranges on small screens */
    } finally {
      endProgrammaticViewportRestore()
    }
  }

  const cancelViewportRestoreTimers = () => {
    for (const t of viewportRestoreTimers) window.clearTimeout(t)
    viewportRestoreTimers.length = 0
  }

  const scheduleLockedViewportRestore = (saved: TvLockedViewport) => {
    const target = frozenViewport ?? saved
    cancelViewportRestoreTimers()
    void restoreVisibleRangeLocked(target)
    if (frozenViewport) return
    for (const delay of [50, 150]) {
      viewportRestoreTimers.push(
        window.setTimeout(() => {
          if (opts.isDisposed()) return
          void restoreVisibleRangeLocked(target)
        }, delay),
      )
    }
  }

  const clampPickPreviewViewport = async (pastBars: Bar[]) => {
    const c = chart()
    if (!c?.getVisibleRange || !pastBars.length) return
    try {
      const r = c.getVisibleRange()
      if (!r || !Number.isFinite(r.from) || !Number.isFinite(r.to)) return
      const firstSec = Number(pastBars[0]!.time)
      const lastSec = Number(pastBars[pastBars.length - 1]!.time)
      if (r.from <= lastSec + 120) return
      const span = Math.max(r.to - r.from, REPLAY_VISIBLE_SEC)
      await c.setVisibleRange(
        { from: Math.max(firstSec, lastSec - span * 0.85), to: lastSec + 120 },
        { percentRightMargin: 12 },
      )
      notifyRangeListeners()
    } catch {
      /* TV may reject on small screens */
    }
  }

  const clearCursorTimer = () => {
    if (cursorTimer) {
      window.clearTimeout(cursorTimer)
      cursorTimer = null
    }
  }

  const paintCursorLine = async (_pastBars: Bar[]) => {
    clearCursorTimer()
  }

  const scheduleCursorLine = (_pastBars: Bar[]) => {
    clearCursorTimer()
  }

  const barStepSec = (bars: Bar[]): number => {
    const feedPeriod = opts.replayFeed.getBarPeriodSec()
    if (Number.isFinite(feedPeriod) && feedPeriod > 0) return feedPeriod
    if (bars.length < 2) return 60
    const steps: number[] = []
    for (let i = 1; i < bars.length; i++) {
      const d = Number(bars[i]!.time) - Number(bars[i - 1]!.time)
      if (Number.isFinite(d) && d > 0) steps.push(d)
    }
    if (!steps.length) return 60
    steps.sort((a, b) => a - b)
    return Math.max(60, steps[Math.floor(steps.length / 2)]!)
  }

  const isSubMinuteBarPeriod = (): boolean => opts.replayFeed.getBarPeriodSec() < 60

  const applySubMinuteViewport = async (
    c: TvReplayChartApi,
    past: Bar[],
    pastCountClamped: number,
  ) => {
    if (!past.length) return
    const step = Math.max(1, opts.replayFeed.getBarPeriodSec())
    const defaultVisible = step <= 1 ? 180 : step <= 5 ? 120 : 60
    const visibleCap = step <= 1 ? 360 : TICK_SWAP_VISIBLE_BARS
    const visibleBars = Math.min(visibleCap, Math.max(defaultVisible, pastCountClamped))
    const anchorIdx = Math.max(0, Math.min(past.length - 1, pastCountClamped - 1))
    const firstIdx = Math.max(0, anchorIdx - visibleBars + 1)
    const firstSec = Number(past[firstIdx]!.time)
    const lastSec = Number(past[anchorIdx]!.time)
    const pad = step * Math.max(2, Math.ceil(10 / step))
    try {
      const ts = c.getTimeScale()
      ts.setBarSpacing(REPLAY_BAR_SPACING)
      ts.setRightOffset(12)
      await c.setVisibleRange(
        { from: firstSec - pad, to: lastSec + pad },
        { percentRightMargin: 10 },
      )
    } catch {
      /* TV may reject tight ranges */
    }
  }

  /** Re-zoom after 1m↔5m↔15m swaps — old barSpacing targets the wrong bar duration. */
  const refitViewportAfterIntervalSwap = async (bars: Bar[], pastCount: number) => {
    const c = chart()
    if (!c || !bars.length) return
    const pastCountClamped = Math.max(1, Math.min(Math.round(pastCount), bars.length))
    const past = bars.slice(0, pastCountClamped)

    if (isSubMinuteBarPeriod()) {
      await applySubMinuteViewport(c, past, pastCountClamped)
      return
    }

    const lastSec = Number(past[past.length - 1]!.time)
    const step = barStepSec(bars)

    const visibleBars = Math.min(INTERVAL_SWAP_VISIBLE_BARS, Math.max(8, past.length))
    const firstIdx = Math.max(0, past.length - visibleBars)
    const firstSec = Number(past[firstIdx]!.time)

    if (past.length < 8) {
      const dataSpan = Math.max(step, lastSec - firstSec)
      const pad = Math.max(step * 4, dataSpan * 2)
      const mid = (firstSec + lastSec) / 2
      try {
        const ts = c.getTimeScale()
        ts.setBarSpacing(REPLAY_BAR_SPACING)
        ts.setRightOffset(REPLAY_RIGHT_OFFSET)
        await c.setVisibleRange(
          { from: mid - pad, to: mid + pad },
          { percentRightMargin: 14 },
        )
      } catch {
        /* TV may reject tight ranges */
      }
      return
    }

    try {
      const ts = c.getTimeScale()
      ts.setBarSpacing(REPLAY_BAR_SPACING)
      ts.setRightOffset(REPLAY_RIGHT_OFFSET)
      await c.setVisibleRange(
        { from: firstSec - step * 2, to: lastSec + step * 3 },
        { percentRightMargin: 12 },
      )
    } catch {
      /* TV may reject on small screens */
    }
  }

  const scheduleIntervalSwapRefit = (bars: Bar[], pastCount: number) => {
    requestAnimationFrame(() => {
      if (opts.isDisposed()) return
      void refitViewportAfterIntervalSwap(bars, pastCount)
    })
  }

  const runIntervalSwapRefresh = (
    bars: Bar[],
    pastCountClamped: number,
    lockedViewport: TvLockedViewport | null,
    swapOpts?: { refit?: boolean; barPeriodSec?: number },
  ) => {
    cancelViewportRestoreTimers()
    cancelIncrementalViewportRaf()

    if (swapOpts?.refit === true) {
      replayLockedViewport = null
      scheduleFullRefresh(true)
      scheduleIntervalSwapRefit(bars, pastCountClamped)
    } else if (
      lockedViewport &&
      !(swapOpts?.barPeriodSec != null && swapOpts.barPeriodSec < 60)
    ) {
      replayLockedViewport = lockedViewport
      doFullRefreshWithLockedViewport(lockedViewport, true)
    } else {
      replayLockedViewport = null
      scheduleFullRefresh(true)
      if (swapOpts?.barPeriodSec != null && swapOpts.barPeriodSec < 60) {
        scheduleIntervalSwapRefit(bars, pastCountClamped)
      }
    }
    ensureRangeHooks()
  }

  const applyReplayViewport = async (pastBars: Bar[]) => {
    const c = chart()
    if (!c || !pastBars.length) return
    const last = pastBars[pastBars.length - 1]!
    const lastSec = Number(last.time)

    if (isSubMinuteBarPeriod()) {
      await applySubMinuteViewport(c, pastBars, pastBars.length)
      return
    }

    const firstSec = Number(pastBars[0]!.time)

    if (pastBars.length < 8) {
      const dataSpan = Math.max(60, lastSec - firstSec)
      const pad = Math.max(1800, dataSpan * 3)
      const mid = (firstSec + lastSec) / 2
      try {
        await c.setVisibleRange(
          { from: mid - pad, to: mid + pad },
          { percentRightMargin: 18 },
        )
      } catch {
        /* TV may reject tight ranges on small screens */
      }
      return
    }

    try {
      const ts = c.getTimeScale()
      ts.setBarSpacing(REPLAY_BAR_SPACING)
      ts.setRightOffset(REPLAY_RIGHT_OFFSET)
    } catch {
      /* noop */
    }

    const anchorIdx = pastBars.length - 1
    const visibleBars = 120
    const lookbackBars = Math.max(8, Math.floor(visibleBars * 0.62))
    const forwardBars = Math.max(8, visibleBars - lookbackBars)
    const firstIdx = Math.max(0, anchorIdx - lookbackBars)
    const toIdx = Math.min(pastBars.length - 1, anchorIdx + forwardBars)
    const fromSec = Number(pastBars[firstIdx]!.time)
    const toSec = Number(pastBars[toIdx]!.time)

    try {
      await c.setVisibleRange(
        { from: fromSec, to: toSec + 120 },
        { percentRightMargin: 12 },
      )
    } catch {
      /* TV may reject tight ranges on small screens */
    }
  }

  const notifyRangeListeners = () => {
    for (const fn of rangeListeners) {
      try {
        fn()
      } catch {
        /* listener may be stale */
      }
    }
  }

  const ensureRangeHooks = () => {
    const c = chart()
    if (!c) return
    if (!rangeSubscribed) {
      try {
        const ts = c.getTimeScale()
        ts.barSpacingChanged().subscribe(null, notifyRangeListeners)
        ts.rightOffsetChanged().subscribe(null, notifyRangeListeners)
        rangeSubscribed = true
      } catch {
        /* noop */
      }
    }
    if (!visibleRangeSubscribed) {
      try {
        const onVr = c.onVisibleRangeChanged?.()
        if (onVr) {
          onVr.subscribe(null, notifyRangeListeners)
          visibleRangeSubscribed = true
        }
      } catch {
        /* noop */
      }
    }
  }

  const canStreamRealtimeBars = (): boolean => opts.replayFeed.hasBarListeners()

  const normalizeChartTimeSec = (raw: number): number => {
    return raw > 1e11 ? Math.floor(raw / 1000) : Math.floor(raw)
  }

  const shiftLockedViewport = (saved: TvLockedViewport, deltaSec: number): TvLockedViewport => {
    const from = normalizeChartTimeSec(saved.from)
    const to = normalizeChartTimeSec(saved.to)
    return { ...saved, from: from + deltaSec, to: to + deltaSec }
  }

  /** FxReplay-style: pan one bar per step so the forming candle stays at the same screen X. */
  const advancePlaybackViewport = (
    saved: TvLockedViewport,
    pastBars: Bar[],
    prevPastCount: number,
    pastCount: number,
    playing?: boolean,
    force?: boolean,
  ): TvLockedViewport => {
    if (!playing || force) return saved
    const steps = pastCount - prevPastCount
    if (steps <= 0) return saved
    return shiftLockedViewport(saved, barStepSec(pastBars) * steps)
  }

  const commitPlaybackViewport = (
    saved: TvLockedViewport,
    pastBars: Bar[],
    prevPastCount: number,
    pastCount: number,
    opts2?: { playing?: boolean; force?: boolean },
  ) => {
    const next = advancePlaybackViewport(saved, pastBars, prevPastCount, pastCount, opts2?.playing, opts2?.force)
    replayLockedViewport = next
    applyPlaybackViewportRange(next)
  }

  /** Locked pan/zoom is invalid when the viewport spans hours but only a few bars are revealed. */
  const viewportCoversReveal = (saved: TvLockedViewport, pastBars: Bar[]): boolean => {
    if (pastBars.length < 2) return false
    const firstSec = Number(pastBars[0]!.time)
    const lastSec = Number(pastBars[pastBars.length - 1]!.time)
    const dataSpan = Math.max(60, lastSec - firstSec)
    const from = normalizeChartTimeSec(saved.from)
    const to = normalizeChartTimeSec(saved.to)
    const viewSpan = Math.max(60, to - from)
    if (viewSpan > dataSpan * 6 && pastBars.length < 48) return false
    const mid = (firstSec + lastSec) / 2
    return mid >= from - dataSpan && mid <= to + dataSpan
  }

  const scrollReplayCursorIntoView = () => {
    const allTv = opts.replayFeed.getAllBars()
    const revealed = opts.replayFeed.getRevealedCount()
    if (!allTv.length || revealed < 1) return

    const anchorIdx = Math.min(revealed, allTv.length) - 1

    const applyScroll = (): boolean => {
      const c = chart()
      if (!c) return false

      if (isSubMinuteBarPeriod()) {
        const period = Math.max(1, opts.replayFeed.getBarPeriodSec())
        const cap = period <= 1 ? 360 : TICK_SWAP_VISIBLE_BARS
        const visibleBars = Math.min(cap, Math.max(8, revealed))
        const firstIdx = Math.max(0, anchorIdx - visibleBars + 1)
        let toIdx = anchorIdx
        if (anchorIdx < visibleBars - 1) {
          toIdx = Math.min(allTv.length - 1, visibleBars - 1)
        }
        const firstSec = Math.floor(allTv[firstIdx]!.time / 1000)
        const lastSec = Math.floor(allTv[toIdx]!.time / 1000)
        const pad = period * Math.max(2, Math.ceil(10 / period))
        try {
          const ts = c.getTimeScale()
          ts.setBarSpacing(REPLAY_BAR_SPACING)
          ts.setRightOffset(12)
          void c.setVisibleRange(
            { from: firstSec - pad, to: lastSec + pad },
            { percentRightMargin: 10 },
          )
          return true
        } catch {
          return false
        }
      }

      const visibleBars = 120
      const lookbackBars = Math.max(8, Math.floor(visibleBars * 0.62))
      const forwardBars = Math.max(8, visibleBars - lookbackBars)
      const firstIdx = Math.max(0, anchorIdx - lookbackBars)
      const toIdx = Math.min(allTv.length - 1, anchorIdx + forwardBars)
      const firstSec = Math.floor(allTv[firstIdx]!.time / 1000)
      const lastSec = Math.floor(allTv[toIdx]!.time / 1000)

      try {
        const ts = c.getTimeScale()
        ts.setBarSpacing(REPLAY_BAR_SPACING)
        ts.setRightOffset(REPLAY_RIGHT_OFFSET)
      } catch {
        /* noop */
      }

      try {
        void c.setVisibleRange(
          { from: firstSec, to: lastSec + 120 },
          { percentRightMargin: 12 },
        )
        return true
      } catch {
        return false
      }
    }

    applyScroll()
    requestAnimationFrame(() => {
      applyScroll()
      requestAnimationFrame(() => applyScroll())
    })
  }

  const viewportAnchorTimeSec = (anchorRatio = 0.62): number | null => {
    const ts = timeScale()
    const w = ts?.width() ?? 0
    if (w < 2) return null
    const plotX = w * Math.max(0.05, Math.min(0.95, anchorRatio))
    return plotXToTimeSec(plotX)
  }

  const replayIndexAtViewportAnchor = (anchorRatio = 0.62): number => {
    const sec = viewportAnchorTimeSec(anchorRatio)
    const bars = opts.replayFeed.getAllBars()
    if (sec == null || !bars.length) {
      return Math.max(1, opts.replayFeed.getRevealedCount())
    }
    const cap = bars.length - 1
    const barIdx = opts.replayFeed.findNearestBarIndexAtTimeSec(sec, cap)
    return Math.max(1, Math.min(bars.length, barIdx + 1))
  }

  const applyReplayState = (
    pastBars: Bar[],
    allBars: Bar[],
    opts2?: {
      fit?: boolean
      pickPreview?: boolean
      playing?: boolean
      force?: boolean
      preserveViewport?: boolean
      restoreVisibleRange?: TvLockedViewport
      decoupled?: boolean
      decoupledStepOnly?: boolean
      stepPreserveView?: boolean
    },
  ) => {
    if (!pastBars.length || !allBars.length) return
    const pastCount = pastBars.length
    if (opts2?.force) lastPastCount = -1

    const streamBars = canStreamRealtimeBars()

    const incremental =
      streamBars &&
      !opts2?.pickPreview &&
      !opts2?.force &&
      lastPastCount > 0 &&
      pastCount === lastPastCount + 1

    if (opts2?.preserveViewport && opts2?.restoreVisibleRange) {
      if (!opts2?.playing || opts2?.force) {
        replayLockedViewport = opts2.restoreVisibleRange
      }
    }

    const holdViewportRaw =
      frozenViewport ??
      replayLockedViewport ??
      (opts2?.preserveViewport && !opts2?.pickPreview && opts2?.restoreVisibleRange
        ? opts2.restoreVisibleRange
        : null)

    const holdViewport =
      holdViewportRaw &&
      (opts2?.decoupledStepOnly === true ||
        opts2?.stepPreserveView === true ||
        (opts2?.playing && opts2?.preserveViewport) ||
        viewportCoversReveal(holdViewportRaw, pastBars))
        ? holdViewportRaw
        : null

    const skipViewportRestoreRetries = opts2?.playing === true && opts2?.preserveViewport === true
    if (skipViewportRestoreRetries) cancelViewportRestoreTimers()

    const lockedViewportNow = (): TvLockedViewport =>
      replayLockedViewport ?? holdViewport!

    const applyHeldViewportAfterBar = () => {
      if (!holdViewport) return
      cancelViewportRestoreTimers()
      const lockedNow = lockedViewportNow()
      if (opts2?.playing && opts2?.preserveViewport) {
        if (Date.now() < suppressPlaybackShiftUntil) {
          applyPlaybackViewportRange(lockedNow)
          return
        }
        commitPlaybackViewport(lockedNow, pastBars, prevPastCount, pastCount, opts2)
      } else {
        restoreViewportAfterIncrementalBar(holdViewport)
      }
    }

    const refreshWithLockedViewport = () => {
      if (!holdViewport) return
      if (opts2?.playing && opts2?.preserveViewport && streamBars) {
        applyPlaybackViewportRange(lockedViewportNow())
        return
      }
      doFullRefreshWithLockedViewport(holdViewport, !skipViewportRestoreRetries)
    }

    const prevPastCount = lastPastCount

    if (opts2?.pickPreview) {
      opts.replayFeed.setPickSplitIndex(pastCount - 1)
      lastPastCount = pastCount
      // Scissors pick freezes the viewport — feed-only update, no chart reset loop.
      if (frozenViewport) {
        ensureRangeHooks()
        return
      }
    }

    const sameRevealCount =
      pastCount === prevPastCount && pastBars.length > 0 && !opts2?.pickPreview
    const replayRewind =
      !opts2?.pickPreview && prevPastCount > 0 && pastCount < prevPastCount
    const replayStepForward =
      opts2?.playing &&
      !opts2?.pickPreview &&
      !opts2?.force &&
      prevPastCount > 0 &&
      pastCount > prevPastCount &&
      pastCount - prevPastCount <= maxRealtimeEmitBatch()
    const multiBarStep =
      streamBars &&
      prevPastCount > 0 &&
      pastCount > prevPastCount + 1 &&
      pastCount - prevPastCount <= maxRealtimeEmitBatch() &&
      !opts2?.pickPreview &&
      !opts2?.force
    const playingRevealJump =
      opts2?.playing &&
      !opts2?.pickPreview &&
      !opts2?.force &&
      streamBars &&
      prevPastCount > 0 &&
      pastCount > prevPastCount

    if (!opts2?.pickPreview) {
      lastPickPreviewSplit = -1
      if (!sameRevealCount) {
        opts.replayFeed.setRevealCountIfChanged(pastCount)
      }
      const last = pastBars[pastCount - 1]
      if (last) opts.replayFeed.patchBarAtIndex(pastCount - 1, last)
    }

    // Locked play resume: keep cursor on screen — viewport only, no resetData.
    // Decoupled replay still patches the forming candle OHLC on each sub-minute step.
    if (
      opts2?.playing &&
      !opts2?.pickPreview &&
      !opts2?.force &&
      opts2?.preserveViewport &&
      holdViewport &&
      sameRevealCount
    ) {
      if (opts2?.decoupled && streamBars) {
        const last = pastBars[pastCount - 1]
        if (last) {
          opts.replayFeed.patchBarAtIndex(pastCount - 1, last)
          opts.replayFeed.emitRealtimeBar(barToTv(last))
        }
      }
      applyPlaybackViewportRange(lockedViewportNow())
      lastPastCount = pastCount
      ensureRangeHooks()
      return
    }

    // Playback steps: prefer realtime bar emit; reserve resetData for rewind/seek only.
    if (opts2?.playing && !opts2?.pickPreview && !opts2?.force && replayStepForward) {
      if (streamBars) {
        for (let i = prevPastCount; i < pastCount; i++) {
          opts.replayFeed.emitRealtimeBar(barToTv(pastBars[i]!))
        }
        if (holdViewport) applyHeldViewportAfterBar()
      } else {
        scheduleFullRefresh(true)
        if (holdViewport) applyHeldViewportAfterBar()
      }
      if (!cursorSuppressed) scheduleCursorLine(pastBars)
      lastPastCount = pastCount
      ensureRangeHooks()
      return
    }

    // Decoupled / multi-bar reveal (e.g. 1m chart + 5m replay step reveals ~5 bars).
    if (playingRevealJump && !replayStepForward) {
      opts.replayFeed.setRevealCountIfChanged(pastCount)
      for (let i = prevPastCount; i < pastCount; i++) {
        opts.replayFeed.emitRealtimeBar(barToTv(pastBars[i]!))
      }
      if (holdViewport) applyHeldViewportAfterBar()
      else if (!cursorSuppressed) scheduleCursorLine(pastBars)
      lastPastCount = pastCount
      ensureRangeHooks()
      return
    }

    // Play kickoff with force (unlocked / live-end loop): avoid resetData when streaming works.
    if (opts2?.playing && opts2?.force && !opts2?.pickPreview && holdViewport && streamBars) {
      applyPlaybackViewportRange(lockedViewportNow())
      lastPastCount = pastCount
      ensureRangeHooks()
      return
    }

    if (
      !opts2?.pickPreview &&
      replayRewind &&
      (opts2?.force === true || opts2?.playing || pastCount < prevPastCount)
    ) {
      if (holdViewport) {
        refreshWithLockedViewport()
      } else {
        scheduleFullRefresh(true)
        if (opts2?.fit && !opts2?.preserveViewport) void applyReplayViewport(pastBars)
        else if (!opts2?.decoupledStepOnly && !opts2?.stepPreserveView && !opts2?.preserveViewport)
          scrollReplayCursorIntoView()
      }
      if (!cursorSuppressed) scheduleCursorLine(pastBars)
      lastPastCount = pastCount
      ensureRangeHooks()
      return
    }

    if (holdViewport && incremental) {
      const lastBar = pastBars[pastCount - 1]!
      cancelViewportRestoreTimers()
      cancelIncrementalViewportRaf()
      opts.replayFeed.emitRealtimeBar(barToTv(lastBar))
      applyHeldViewportAfterBar()
      if (!opts2?.playing && !opts2?.pickPreview && !cursorSuppressed) scheduleCursorLine(pastBars)
    } else if (sameRevealCount && streamBars) {
      // Forming candle OHLC update (decoupled replay, tick-in-minute, etc.) — no full reset.
      opts.replayFeed.emitRealtimeBar(barToTv(pastBars[pastCount - 1]!))
      if (holdViewport) restoreViewportAfterIncrementalBar(holdViewport)
      else if (!opts2?.playing && !cursorSuppressed) scheduleCursorLine(pastBars)
    } else if (multiBarStep) {
      for (let i = prevPastCount; i < pastCount; i++) {
        opts.replayFeed.emitRealtimeBar(barToTv(pastBars[i]!))
      }
      if (holdViewport) applyHeldViewportAfterBar()
      else if (!opts2?.playing && !cursorSuppressed) scheduleCursorLine(pastBars)
    } else if (holdViewport) {
      refreshWithLockedViewport()
      if (!opts2?.playing && !opts2?.pickPreview && !cursorSuppressed) scheduleCursorLine(pastBars)
    } else if (incremental) {
      const lastBar = pastBars[pastCount - 1]!
      opts.replayFeed.emitRealtimeBar(barToTv(lastBar))
      if (holdViewport) applyHeldViewportAfterBar()
      if (!opts2?.playing && !opts2?.pickPreview && !cursorSuppressed) scheduleCursorLine(pastBars)
    } else {
      if (holdViewport) {
        refreshWithLockedViewport()
      } else if (opts2?.decoupledStepOnly || opts2?.stepPreserveView) {
        opts.replayFeed.setRevealCountIfChanged(pastCount)
        const lastBar = pastBars[pastCount - 1]
        if (lastBar) opts.replayFeed.patchBarAtIndex(pastCount - 1, lastBar)
        if (!opts2?.playing && !opts2?.pickPreview && !cursorSuppressed) scheduleCursorLine(pastBars)
      } else {
        scheduleFullRefresh(
          opts2?.fit === true ||
            opts2?.force === true ||
            (opts2?.playing === true && pastCount > prevPastCount),
        )
        if (opts2?.pickPreview) {
          schedulePickPreviewViewportClamp(pastBars)
        } else if (opts2?.fit === true) {
          void paintCursorLine(pastBars)
        } else if (!opts2?.playing && !cursorSuppressed) {
          scheduleCursorLine(pastBars)
        }
        if (opts2?.fit === true && !opts2?.preserveViewport) void applyReplayViewport(pastBars)
        else if (
          !opts2?.decoupledStepOnly &&
          !opts2?.stepPreserveView &&
          !opts2?.playing &&
          !opts2?.preserveViewport &&
          !opts2?.pickPreview &&
          pastCount < allBars.length
        ) {
          requestAnimationFrame(() => scrollReplayCursorIntoView())
        }
      }
    }

    lastPastCount = pastCount
    ensureRangeHooks()
  }

  const visibleRangeSec = (): { from: number; to: number } | null => {
    const c = chart()
    if (!c?.getVisibleRange) return null
    try {
      const r = c.getVisibleRange()
      if (!r || !Number.isFinite(r.from) || !Number.isFinite(r.to)) return null
      const from = normalizeChartTimeSec(r.from)
      const to = normalizeChartTimeSec(r.to)
      if (to <= from) return null
      return { from, to }
    } catch {
      return null
    }
  }

  const timeScale = (): TvTimeScaleApi | null => {
    try {
      return chart()?.getTimeScale() ?? null
    } catch {
      return null
    }
  }

  /** Map plot X (TV time-scale coords) → unix seconds using the visible range. */
  const plotXToTimeSec = (plotX: number): number | null => {
    const ts = timeScale()
    const range = visibleRangeSec()
    if (!ts || !range) return null
    const w = ts.width()
    if (w < 2) return null
    const t = Math.max(0, Math.min(1, plotX / w))
    return Math.floor(range.from + t * (range.to - range.from))
  }

  const chartVisibleRangeRaw = (): { from: number; to: number } | null => {
    const c = chart()
    if (!c?.getVisibleRange) return null
    try {
      const r = c.getVisibleRange()
      if (!r || !Number.isFinite(r.from) || !Number.isFinite(r.to)) return null
      if (r.to <= r.from) return null
      return { from: r.from, to: r.to }
    } catch {
      return null
    }
  }

  const chartUsesMillisecondTime = (): boolean => {
    const raw = chartVisibleRangeRaw()
    return !!(raw && Math.abs(raw.from) > 1e11)
  }

  const linearPlotXForTimeSec = (targetSec: number, plotWidth: number): number | null => {
    const range = visibleRangeSec()
    if (!range) return null
    const span = range.to - range.from
    if (!Number.isFinite(span) || span <= 0) return null
    const t = (targetSec - range.from) / span
    if (!Number.isFinite(t)) return null
    return Math.max(0, Math.min(plotWidth, t * plotWidth))
  }

  /** TV builds disagree on seconds vs ms for minute+ bars — pick the candidate closest to the visible range. */
  const timeArgCandidatesFromSec = (targetSec: number): number[] => {
    const ms = targetSec * 1000
    if (opts.replayFeed.getBarPeriodSec() >= 60) return [targetSec, ms]
    return chartUsesMillisecondTime() ? [ms, targetSec] : [targetSec, ms]
  }

  /** Plot-area X (same coordinate space as `coordinateToTime`). */
  const timeSecToPlotX = (targetSec: number): number | null => {
    const ts = timeScale()
    if (!ts) return null
    const w = ts.width()
    if (w < 2) return null

    const linear = linearPlotXForTimeSec(targetSec, w)
    let best: number | null = linear

    if (typeof ts.timeToCoordinate === 'function') {
      let bestErr = Infinity
      for (const t of timeArgCandidatesFromSec(targetSec)) {
        try {
          const x = ts.timeToCoordinate(t)
          if (x == null || !Number.isFinite(x)) continue
          const clamped = Math.max(0, Math.min(w, x))
          const err = linear != null ? Math.abs(clamped - linear) : Math.min(clamped, w - clamped)
          if (err < bestErr) {
            bestErr = err
            best = clamped
          }
        } catch {
          /* try next candidate */
        }
      }
      if (best != null && linear != null && Math.abs(best - linear) > w * 0.45) {
        return linear
      }
    }

    if (best != null) return best

    let lo = 0
    let hi = w
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2
      const raw = ts.coordinateToTime(mid)
      if (raw == null) return linear
      const sec = normalizeChartTimeSec(raw)
      if (sec < targetSec) lo = mid
      else hi = mid
    }
    return linear ?? (lo + hi) / 2
  }

  const plotXToHostX = (plotX: number, plotOffsetX: number): number => plotOffsetX + plotX

  const plotYForPrice = (price: number): number | null => {
    const c = chart() as {
      getPanes?: () => Array<{
        getMainSourcePriceScale?: () => { priceToCoordinate?: (p: number) => number | null }
        getRightPriceScales?: () => Array<{ priceToCoordinate?: (p: number) => number | null }>
      }>
    } | null
    if (!c) return null
    try {
      const panes = c.getPanes?.()
      const pane = panes?.[0]
      if (!pane) return null
      const scale = pane.getMainSourcePriceScale?.() ?? pane.getRightPriceScales?.()?.[0]
      const y = scale?.priceToCoordinate?.(price)
      return y != null && Number.isFinite(y) ? y : null
    } catch {
      return null
    }
  }

  const plotXForWallTimeMs = (timeMs: number): number | null => {
    return timeSecToPlotX(Math.floor(timeMs / 1000))
  }

  const plotPickSplitsReady = (cap: number): boolean => {
    if (cap < 1) return false
    const mid = Math.min(cap, Math.max(0, Math.floor(cap / 2)))
    const x0 = timeSecToPlotX(Math.floor(opts.replayFeed.getAllBars()[0]!.time / 1000))
    const xMid = timeSecToPlotX(Math.floor(opts.replayFeed.getAllBars()[mid]!.time / 1000))
    return x0 != null && xMid != null && Math.abs(xMid - x0) > 2
  }

  /** Split boundary after `barIndex` — between last solid and first hidden candle. */
  const splitPlotXAfterBar = (barIndex: number): number | null => {
    const bars = opts.replayFeed.getAllBars()
    const bar = bars[barIndex]
    if (!bar) return null

    const openSec = Math.floor(bar.time / 1000)
    const xCur = timeSecToPlotX(openSec)
    if (xCur == null) return null

    const revealed =
      opts.replayFeed.getRevealedCount() < bars.length
        ? opts.replayFeed.getRevealedCount()
        : bars.length
    const next = barIndex + 1 < revealed ? bars[barIndex + 1] : null
    if (next) {
      const xNext = timeSecToPlotX(Math.floor(next.time / 1000))
      if (xNext != null) return (xCur + xNext) / 2
    }

    const spacing = timeScale()?.barSpacing?.() ?? REPLAY_BAR_SPACING
    return xCur + spacing / 2
  }

  const isTvTickRemapped = (): boolean => opts.replayFeed.getBarPeriodSec() < 60

  /** Snap scissors to the nearest candle center (stable on TV tick bars remapped to 1m slots). */
  const pickNearestBarIndexByPlotX = (plotX: number, cap: number): number => {
    if (cap < 0) return 0
    let lo = 0
    let hi = cap
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      const xMid = splitPlotXAfterBar(mid)
      if (xMid == null) break
      if (plotX < xMid) hi = mid
      else lo = mid + 1
    }
    const candidate = Math.max(0, Math.min(cap, lo))
    if (candidate > 0) {
      const xPrev = splitPlotXAfterBar(candidate - 1)
      const xCur = splitPlotXAfterBar(candidate)
      if (xPrev != null && xCur != null && plotX < (xPrev + xCur) / 2) return candidate - 1
    }
    if (lo < hi) {
      const sec = plotXToTimeSec(plotX)
      if (sec != null) return opts.replayFeed.findBarIndexContainingTimeSec(sec, cap)
    }
    return candidate
  }

  const pickBarIndexAtPointer = (
    clientX: number,
    hostLeft: number,
    maxIndex: number,
    plotOffsetX = 0,
  ): number => {
    const cap = Math.min(maxIndex, Math.max(0, opts.replayFeed.getAllBars().length - 1))
    const pointerPlotX = clientX - hostLeft - plotOffsetX
    const ts = timeScale()

    if (isTvTickRemapped()) {
      if (ts && typeof ts.coordinateToTime === 'function') {
        try {
          const raw = ts.coordinateToTime(pointerPlotX)
          if (raw != null) {
            return opts.replayFeed.findNearestBarIndexAtTimeSec(normalizeChartTimeSec(raw), cap)
          }
        } catch {
          /* fall through */
        }
      }
      return pickNearestBarIndexByPlotX(pointerPlotX, cap)
    }

    if (plotPickSplitsReady(cap)) {
      return pickNearestBarIndexByPlotX(pointerPlotX, cap)
    }

    const sec = plotXToTimeSec(pointerPlotX)
    if (sec != null) {
      return opts.replayFeed.findBarIndexContainingTimeSec(sec, cap)
    }

    if (ts && typeof ts.coordinateToTime === 'function') {
      try {
        const raw = ts.coordinateToTime(pointerPlotX)
        if (raw != null) {
          return opts.replayFeed.findBarIndexContainingTimeSec(normalizeChartTimeSec(raw), cap)
        }
      } catch {
        /* fall through */
      }
    }

    return 0
  }

  let sessionBarsKey = ''

  return {
    setSessionBars(bars, resolution, barPeriodSec, sessionOpts) {
      const key = `${resolution}|${bars.length}|${bars[0]?.time ?? ''}|${bars[bars.length - 1]?.time ?? ''}`
      if (key === sessionBarsKey) return
      sessionBarsKey = key
      opts.replayFeed.setSessionBars(bars, resolution, barPeriodSec)
      lastPastCount = -1
      if (!sessionOpts?.deferRefresh) scheduleFullRefresh(true)
    },

    primeIntervalFeed(bars, resolution, pastCount, barPeriodSec) {
      const key = `${resolution}|${bars.length}|${bars[0]?.time ?? ''}|${bars[bars.length - 1]?.time ?? ''}`
      sessionBarsKey = key
      opts.replayFeed.setSessionBars(bars, resolution, barPeriodSec)
      const pastCountClamped = Math.max(1, Math.min(Math.round(pastCount), bars.length))
      opts.replayFeed.setRevealCount(pastCountClamped)
      lastPastCount = -1
    },

    setReplayData(pastBars, allBars, replayOpts) {
      applyReplayState(pastBars, allBars, {
        fit: replayOpts?.fit,
        playing: replayOpts?.playing,
        force: replayOpts?.force,
        preserveViewport: replayOpts?.preserveViewport,
        restoreVisibleRange: replayOpts?.restoreVisibleRange,
        decoupled: replayOpts?.decoupled,
        decoupledStepOnly: replayOpts?.decoupledStepOnly,
        stepPreserveView: replayOpts?.stepPreserveView,
      })
    },

    tickDecoupledReplay(displayBars) {
      if (opts.isDisposed() || !displayBars.length) return false
      if (!canStreamRealtimeBars()) return false

      const pastCount = displayBars.length
      const prevCount = lastPastCount

      if (pastCount < prevCount) return false

      if (pastCount === prevCount && prevCount > 0) {
        const last = displayBars[pastCount - 1]!
        opts.replayFeed.patchBarAtIndex(pastCount - 1, last)
        opts.replayFeed.emitRealtimeBar(barToTv(last))
        lastPastCount = pastCount
        return true
      }

      const emitFrom = prevCount > 0 ? prevCount : 0
      opts.replayFeed.setRevealCountIfChanged(pastCount)
      for (let i = emitFrom; i < pastCount; i++) {
        const b = displayBars[i]!
        opts.replayFeed.patchBarAtIndex(i, b)
        opts.replayFeed.emitRealtimeBar(barToTv(b))
      }
      lastPastCount = pastCount
      return true
    },

    swapInterval(bars, resolution, pastCount, lockedViewport, swapOpts?: { refit?: boolean; barPeriodSec?: number; deferRefresh?: boolean }) {
      const key = `${resolution}|${bars.length}|${bars[0]?.time ?? ''}|${bars[bars.length - 1]?.time ?? ''}`
      sessionBarsKey = key
      opts.replayFeed.setSessionBars(bars, resolution, swapOpts?.barPeriodSec)
      lastPastCount = -1
      lastPickPreviewSplit = -1
      const pastCountClamped = Math.max(1, Math.min(Math.round(pastCount), bars.length))
      opts.replayFeed.setRevealCount(pastCountClamped)
      if (
        swapOpts?.barPeriodSec === 60 &&
        resolution === '1' &&
        pastCountClamped >= bars.length
      ) {
        opts.replayFeed.clearReplay()
      }

      if (swapOpts?.deferRefresh) {
        pendingIntervalSwapRefresh = {
          bars,
          pastCountClamped,
          lockedViewport,
          swapOpts: { refit: swapOpts.refit, barPeriodSec: swapOpts.barPeriodSec },
        }
        return
      }

      pendingIntervalSwapRefresh = null
      runIntervalSwapRefresh(bars, pastCountClamped, lockedViewport, swapOpts)
    },

    finishIntervalSwap() {
      const pending = pendingIntervalSwapRefresh
      if (!pending) return
      pendingIntervalSwapRefresh = null
      runIntervalSwapRefresh(
        pending.bars,
        pending.pastCountClamped,
        pending.lockedViewport,
        pending.swapOpts,
      )
    },

    flushPendingRefresh() {
      if (!pendingFullRefresh || opts.isDisposed()) return
      const force = pendingFullRefreshForce
      pendingFullRefresh = false
      pendingFullRefreshForce = false
      if (force) lastPastCount = -1
      scheduleFullRefresh(true)
    },

    setReplayPickPreview(splitIndex, allBars) {
      if (!allBars.length) return
      const idx = Math.max(0, Math.min(allBars.length - 1, splitIndex))
      if (idx === lastPickPreviewSplit) return
      lastPickPreviewSplit = idx
      const past = allBars.slice(0, idx + 1)
      applyReplayState(past, allBars, { pickPreview: true, preserveViewport: true })
    },

    clearReplayPickPreview() {
      if (lastPickPreviewSplit < 0) return
      lastPickPreviewSplit = -1
      opts.replayFeed.clearPickPreview()
      lastPastCount = -1
      if (frozenViewport) {
        doFullRefreshWithLockedViewport(frozenViewport)
      } else {
        scheduleFullRefresh(true)
      }
    },

    clearReplay() {
      opts.replayFeed.clearReplay()
      clearCursorTimer()
      lastPastCount = -1
      replayLockedViewport = null
      cancelIncrementalViewportRaf()
      scheduleFullRefresh(true)
    },

    scrollReplayCursorIntoView,

    viewportAnchorTimeSec,

    replayIndexAtViewportAnchor,

    lockedViewportCoversBars: viewportCoversReveal,

    pickIndexAtClientX(clientX, hostLeft, maxIndex, plotOffsetX = 0) {
      return pickBarIndexAtPointer(clientX, hostLeft, maxIndex, plotOffsetX)
    },

    timeSecAtClientX(clientX, hostLeft, plotOffsetX = 0) {
      const pointerPlotX = clientX - hostLeft - plotOffsetX
      const sec = plotXToTimeSec(pointerPlotX)
      if (sec != null) return sec
      const ts = timeScale()
      if (!ts) return null
      const raw = ts.coordinateToTime(pointerPlotX)
      return raw == null ? null : normalizeChartTimeSec(raw)
    },

    subscribeTimeScaleChange(fn) {
      rangeListeners.push(fn)
      ensureRangeHooks()
      return () => {
        const idx = rangeListeners.indexOf(fn)
        if (idx >= 0) rangeListeners.splice(idx, 1)
      }
    },

    setReplayCursorVisible(visible) {
      cursorSuppressed = !visible
      clearCursorTimer()
    },

    setViewportFreeze(viewport) {
      frozenViewport = viewport
      cancelViewportRestoreTimers()
      cancelIncrementalViewportRaf()
      if (viewport && !lastPickPreviewSplit) void restoreVisibleRangeLocked(viewport)
    },

    setReplayLockedViewport(viewport) {
      replayLockedViewport = viewport
      if (viewport) cancelIncrementalViewportRaf()
    },

    captureVisibleRange() {
      const c = chart()
      if (!c?.getVisibleRange) return null
      try {
        const r = c.getVisibleRange()
        if (!r || !Number.isFinite(r.from) || !Number.isFinite(r.to)) return null
        const from = normalizeChartTimeSec(r.from)
        const to = normalizeChartTimeSec(r.to)
        if (to <= from) return null
        return { from, to }
      } catch {
        return null
      }
    },

    captureLockedViewport(): TvLockedViewport | null {
      return readLockedViewport()
    },

    async restoreVisibleRange(saved) {
      await restoreVisibleRangeLocked(saved)
    },

    isProgrammaticViewportRestore() {
      return isProgrammaticViewportRestore()
    },

    notifyUserPlaybackPan(barPeriodSec) {
      notifyUserPlaybackPan(barPeriodSec)
    },

    getReplayLockedViewport() {
      return replayLockedViewport
    },

    lineXAtBarTimeSec(openSec, plotOffsetX = 0) {
      const idx = opts.replayFeed.findBarIndexAtOrBeforeTimeSec(Math.floor(openSec))
      const split = splitPlotXAfterBar(idx)
      return split == null ? null : plotXToHostX(split, plotOffsetX)
    },

    lineXAtBarIndex(barIndex, _hostLeft, plotOffsetX = 0) {
      const split = splitPlotXAfterBar(barIndex)
      return split == null ? null : plotXToHostX(split, plotOffsetX)
    },

    chartBarTimeSecAtIndex(barIndex) {
      const bars = opts.replayFeed.getAllBars()
      const bar = bars[Math.max(0, Math.min(bars.length - 1, Math.round(barIndex)))]
      return bar ? Math.floor(bar.time / 1000) : null
    },

    plotXForWallTimeMs(timeMs, plotOffsetX = 0) {
      const plotX = plotXForWallTimeMs(timeMs)
      return plotX == null ? null : plotXToHostX(plotX, plotOffsetX)
    },

    hostPointForWallTimeMs(timeMs, price, layout) {
      const plotX = plotXForWallTimeMs(timeMs)
      if (plotX == null || !Number.isFinite(price)) return null
      const plotY = plotYForPrice(price)
      if (plotY == null) return null
      return {
        x: plotXToHostX(plotX, layout.plotOffsetX),
        y: layout.top + plotY,
      }
    },

    dispose() {
      if (refreshTimer) window.clearTimeout(refreshTimer)
      if (pickPreviewClampTimer) window.clearTimeout(pickPreviewClampTimer)
      cancelViewportRestoreTimers()
      cancelIncrementalViewportRaf()
      clearCursorTimer()
    },
  }
}
