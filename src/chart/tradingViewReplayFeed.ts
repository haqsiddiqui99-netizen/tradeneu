import type { Bar } from '../types'
import { tvResolutionPeriodSec } from './tradingViewDatafeed'
import type { TvBar, TvPeriodParams } from './tradingViewTypes'

export const TV_FUTURE_SUFFIX = '__RW_FUT'

export function futureTicker(symbol: string): string {
  return `${symbol.trim().toUpperCase()}${TV_FUTURE_SUFFIX}`
}

export function isFutureTicker(ticker: string): boolean {
  return ticker.trim().toUpperCase().endsWith(TV_FUTURE_SUFFIX)
}

export function baseTicker(ticker: string): string {
  return ticker.replace(/__RW_FUT$/i, '').trim().toUpperCase()
}

export function barToTv(bar: Bar): TvBar {
  return {
    time: Number(bar.time) * 1000,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }
}

export type TvReplayFeedState = {
  allBars: TvBar[]
  /** Number of bars revealed (matches ReplayController slice length). */
  revealedCount: number
  pickSplitIndex: number | null
  resolution: string
  /** Bar duration in seconds for scissors snap (may differ from TV resolution for tick bars). */
  barPeriodSec: number
}

function filterBarsForPeriod(bars: TvBar[], periodParams: TvPeriodParams): TvBar[] {
  if (!bars.length) return []
  if (periodParams.firstDataRequest) return bars

  const toMs = periodParams.to * 1000
  let filtered = bars.filter((b) => b.time <= toMs + 60_000)
  const fromMs = periodParams.from * 1000
  const inWindow = filtered.filter((b) => b.time >= fromMs)
  if (inWindow.length >= 2) filtered = inWindow

  const countBack = Math.max(periodParams.countBack || 0, 16)
  if (countBack > 0 && filtered.length > countBack) {
    filtered = filtered.slice(-countBack)
  }
  // Historical replay bars often sit outside TV's default "now" window.
  if (!filtered.length) {
    return countBack > 0 && bars.length > countBack ? bars.slice(-countBack) : bars
  }
  return filtered
}

export class TvReplayFeedController {
  private state: TvReplayFeedState = {
    allBars: [],
    revealedCount: 0,
    pickSplitIndex: null,
    resolution: '60',
    barPeriodSec: 60,
  }

  private changeListeners: Array<() => void> = []
  private barListeners = new Map<
    string,
    { onTick: (bar: TvBar) => void; onReset: () => void }
  >()

  /** TV: keep full series in the datafeed; hide future bars with a DOM mask overlay. */
  private tvFullSeriesReplay = false
  /** True only during coupled replay playback — full series + DOM mask. Paused/seek uses truncated feed. */
  private tvFullSeriesMaskMode = false

  setTvFullSeriesReplay(enabled: boolean) {
    this.tvFullSeriesReplay = enabled
    if (!enabled) this.tvFullSeriesMaskMode = false
  }

  useTvFullSeriesReplay(): boolean {
    return this.tvFullSeriesReplay
  }

  useTvFullSeriesMaskMode(): boolean {
    return this.tvFullSeriesReplay && this.tvFullSeriesMaskMode
  }

  /** Reveal count for replay mask — does not truncate getBars when mask mode is on. */
  setReplayRevealForMask(count: number) {
    if (!this.state.allBars.length) return
    const next = Math.max(1, Math.min(Math.round(count), this.state.allBars.length))
    const split = next >= this.state.allBars.length ? null : next - 1
    if (
      this.tvFullSeriesMaskMode &&
      this.state.revealedCount === next &&
      this.state.pickSplitIndex === split
    ) {
      return
    }
    this.tvFullSeriesMaskMode = true
    this.state.revealedCount = next
    this.state.pickSplitIndex = split
    this.notify()
  }

  onChange(fn: () => void): () => void {
    this.changeListeners.push(fn)
    return () => {
      this.changeListeners = this.changeListeners.filter((x) => x !== fn)
    }
  }

  private notify() {
    for (const fn of this.changeListeners) fn()
  }

  hasSessionBars(): boolean {
    return this.state.allBars.length > 0
  }

  getResolution(): string {
    return this.state.resolution
  }

  getBarPeriodSec(): number {
    return this.state.barPeriodSec
  }

  getAllBars(): TvBar[] {
    return this.state.allBars
  }

  getRevealedCount(): number {
    return this.state.revealedCount
  }

  isReplayActive(): boolean {
    return (
      this.state.allBars.length > 0 &&
      this.state.revealedCount < this.state.allBars.length
    )
  }

  getCursorTimeSec(): number | null {
    const count = this.state.pickSplitIndex != null
      ? this.state.pickSplitIndex + 1
      : this.state.revealedCount
    if (count < 1 || !this.state.allBars.length) return null
    const bar = this.state.allBars[Math.min(count, this.state.allBars.length) - 1]
    return bar ? Math.floor(bar.time / 1000) : null
  }

  setSessionBars(bars: Bar[], resolution: string, barPeriodSec?: number) {
    this.state.allBars = bars.map(barToTv).sort((a, b) => a.time - b.time)
    this.state.revealedCount = this.state.allBars.length
    this.state.pickSplitIndex = null
    this.state.resolution = resolution
    this.state.barPeriodSec = barPeriodSec ?? tvResolutionPeriodSec(resolution)
    this.notify()
  }

  /** Update OHLC for an existing session bar without resetting reveal count. */
  patchBarAtIndex(index: number, bar: Bar) {
    if (!this.state.allBars.length) return
    const i = Math.max(0, Math.min(this.state.allBars.length - 1, Math.round(index)))
    const next = barToTv(bar)
    const cur = this.state.allBars[i]!
    if (cur.time !== next.time) {
      // Forming-candle updates in decoupled replay overwrite the slot OHLC in place.
      this.state.allBars[i] = next
      return
    }
    this.state.allBars[i] = next
  }

  setRevealCount(count: number) {
    if (!this.state.allBars.length) return
    this.tvFullSeriesMaskMode = false
    this.state.pickSplitIndex = null
    this.state.revealedCount = Math.max(1, Math.min(Math.round(count), this.state.allBars.length))
    this.notify()
  }

  /** Like setRevealCount but skips listener notification when unchanged. */
  setRevealCountIfChanged(count: number): boolean {
    if (!this.state.allBars.length) return false
    const next = Math.max(1, Math.min(Math.round(count), this.state.allBars.length))
    if (
      !this.tvFullSeriesMaskMode &&
      this.state.pickSplitIndex == null &&
      next === this.state.revealedCount
    ) {
      return false
    }
    this.tvFullSeriesMaskMode = false
    this.state.pickSplitIndex = null
    this.state.revealedCount = next
    this.notify()
    return true
  }

  setPickSplitIndex(splitIndex: number) {
    if (!this.state.allBars.length) return
    const idx = Math.max(0, Math.min(Math.round(splitIndex), this.state.allBars.length - 1))
    this.state.pickSplitIndex = idx
    this.state.revealedCount = idx + 1
    this.notify()
  }

  clearPickPreview() {
    if (this.state.pickSplitIndex == null) return
    this.state.pickSplitIndex = null
    this.notify()
  }

  clearReplay() {
    if (!this.state.allBars.length) return
    this.tvFullSeriesMaskMode = false
    this.state.pickSplitIndex = null
    this.state.revealedCount = this.state.allBars.length
    this.notify()
  }

  getBarsForRequest(ticker: string, periodParams: TvPeriodParams): TvBar[] {
    if (!this.state.allBars.length) return []

    const isFuture = isFutureTicker(ticker)

    if (!isFuture && this.useTvFullSeriesMaskMode()) {
      if (periodParams.firstDataRequest) return this.state.allBars
      return filterBarsForPeriod(this.state.allBars, periodParams)
    }

    const revealed =
      this.state.pickSplitIndex != null
        ? this.state.pickSplitIndex + 1
        : this.state.revealedCount

    const past = this.state.allBars.slice(0, revealed)
    const future = this.state.allBars.slice(revealed)
    const source = isFuture ? future : past
    if (!isFuture && periodParams.firstDataRequest) return source
    return filterBarsForPeriod(source, periodParams)
  }

  findBarIndexAtOrBeforeTimeSec(timeSec: number, maxIndex?: number): number {
    const bars = this.state.allBars
    if (!bars.length) return 0
    const targetMs = timeSec * 1000
    const cap = maxIndex != null ? Math.min(maxIndex, bars.length - 1) : bars.length - 1
    let best = 0
    for (let i = 0; i <= cap; i++) {
      if (bars[i]!.time <= targetMs) best = i
      else break
    }
    return best
  }

  /** Bar whose [open, nextOpen) interval contains `timeSec` (FXReplay-style cut). */
  findBarIndexContainingTimeSec(timeSec: number, maxIndex?: number): number {
    const bars = this.state.allBars
    if (!bars.length) return 0
    const cap = maxIndex != null ? Math.min(maxIndex, bars.length - 1) : bars.length - 1
    const period = this.state.barPeriodSec
    for (let i = 0; i <= cap; i++) {
      const openSec = Math.floor(bars[i]!.time / 1000)
      const nextOpenSec =
        i < cap
          ? Math.floor(bars[i + 1]!.time / 1000)
          : openSec + Math.max(period, 60)
      if (timeSec >= openSec && timeSec < nextOpenSec) return i
    }
    return this.findBarIndexAtOrBeforeTimeSec(timeSec, cap)
  }

  /** Snap scissors to the candle whose open time is closest to `timeSec`. */
  findNearestBarIndexAtTimeSec(timeSec: number, maxIndex?: number): number {
    const bars = this.state.allBars
    if (!bars.length) return 0
    const cap = maxIndex != null ? Math.min(maxIndex, bars.length - 1) : bars.length - 1
    const targetMs = timeSec * 1000
    const before = this.findBarIndexAtOrBeforeTimeSec(timeSec, cap)
    if (before < cap) {
      const next = before + 1
      const dBefore = Math.abs(bars[before]!.time - targetMs)
      const dNext = Math.abs(bars[next]!.time - targetMs)
      return dNext < dBefore ? next : before
    }
    return before
  }

  setBarListener(
    listenerGuid: string,
    onTick: (bar: TvBar) => void,
    onReset: () => void,
  ) {
    this.barListeners.set(listenerGuid, { onTick, onReset })
  }

  removeBarListener(listenerGuid: string) {
    this.barListeners.delete(listenerGuid)
  }

  hasBarListeners(): boolean {
    return this.barListeners.size > 0
  }

  emitRealtimeBar(bar: TvBar) {
    for (const { onTick } of this.barListeners.values()) {
      try {
        onTick(bar)
      } catch {
        /* subscriber may be stale */
      }
    }
  }

  requestSubscriberReset() {
    for (const { onReset } of this.barListeners.values()) {
      try {
        onReset()
      } catch {
        /* noop */
      }
    }
  }
}
