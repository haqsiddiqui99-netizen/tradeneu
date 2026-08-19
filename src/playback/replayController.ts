import type { Bar } from '../types'
import { mergeBarsByTime } from '../data/sessionBarWindow'

export type ReplayState = {
  playing: boolean
  index: number
  /** Milliseconds between bar advances during playback. */
  speedMs: number
  /** Bars revealed per second (1 = 1x per sec, 3 = 3x per sec, …). */
  barsPerSec: number
  /** When true, playback wraps to {@link loopStartIndex} at the last bar. */
  loop: boolean
  /** 1-based bar index to restart from when looping. */
  loopStartIndex: number
}

/**
 * TradingView-style discrete playback speeds, ascending (slowest → fastest).
 * Values are “updates per second”: <1 means one update every N seconds.
 * Displayed in the dock menu as 10x … 0.1x.
 */
export const REPLAY_BARS_PER_SEC = [0.1, 0.2, 1 / 3, 0.5, 1, 3, 5, 7, 10] as readonly number[]

/** Index of the neutral 1x speed (used as the default / reset speed). */
export const REPLAY_DEFAULT_SPEED_INDEX = 4

/** Compact multiplier label, e.g. 10x, 1x, 0.5x, 0.3x. */
export function replaySpeedX(barsPerSec: number): string {
  const x = barsPerSec >= 1 ? Math.round(barsPerSec) : Math.round(barsPerSec * 10) / 10
  return `${x}x`
}

/** Descriptive rate label, e.g. “10 upd per 1 sec”, “1 upd per 2 sec”. */
export function replaySpeedDetail(barsPerSec: number): string {
  if (barsPerSec >= 1) return `${Math.round(barsPerSec)} upd per 1 sec`
  return `1 upd per ${Math.round(1 / barsPerSec)} sec`
}

export function replaySpeedLabel(barsPerSec: number, unit: 'bar' | 'tick' = 'bar'): string {
  return unit === 'tick' ? `${barsPerSec} ticks/sec` : replaySpeedDetail(barsPerSec)
}

/** @deprecated Use REPLAY_BARS_PER_SEC */
export const REPLAY_SPEED_MS = REPLAY_BARS_PER_SEC.map((bps) => Math.round(1000 / bps)) as readonly number[]

/**
 * Bar replay driver.
 *
 * One bar per timeout chain: advance → paint callback → schedule next.
 * Never setInterval, never rAF bursts, never more than one pending timer.
 */
export class ReplayController {
  private bars: Bar[]
  private state: ReplayState
  /** Chart bars revealed per play tick (1 = one bar; 3 = three 1m bars when replay step is 3m). */
  private barsPerAdvance = 1
  private tickTimer: ReturnType<typeof setTimeout> | null = null
  /** Bumped on pause/stop so in-flight ticks cannot schedule another. */
  private playbackGen = 0
  /** Wall-clock target for the next advance — keeps cadence independent of paint cost. */
  private nextTickAt = 0
  private onTick: (slice: Bar[], index: number) => void

  constructor(bars: Bar[], onTick: (slice: Bar[], index: number) => void) {
    this.bars = bars
    this.onTick = onTick
    this.state = {
      playing: false,
      /* Last bar = “live” end so legend / watchlist / ticket match the chart’s latest candles. */
      index: Math.max(1, bars.length),
      barsPerSec: REPLAY_BARS_PER_SEC[REPLAY_DEFAULT_SPEED_INDEX]!,
      speedMs: Math.round(1000 / REPLAY_BARS_PER_SEC[REPLAY_DEFAULT_SPEED_INDEX]!),
      loop: false,
      loopStartIndex: 1,
    }
  }

  getState(): ReplayState {
    return { ...this.state }
  }

  /** Full bar series backing this replay session (keeps chart `allBars` in sync). */
  getBars(): Bar[] {
    return this.bars
  }

  getSpeedIndex(): number {
    const idx = REPLAY_BARS_PER_SEC.indexOf(this.state.barsPerSec)
    return idx >= 0 ? idx : 0
  }

  getBarsPerAdvance(): number {
    return this.barsPerAdvance
  }

  setBarsPerAdvance(count: number) {
    this.barsPerAdvance = Math.max(1, Math.min(64, Math.round(count)))
  }

  setLoop(enabled: boolean) {
    this.state.loop = enabled
  }

  setLoopStartIndex(i: number) {
    this.state.loopStartIndex =
      this.bars.length > 0 ? Math.max(1, Math.min(this.bars.length, Math.round(i))) : 1
  }

  setSpeedIndex(i: number) {
    const idx = Math.max(0, Math.min(REPLAY_BARS_PER_SEC.length - 1, Math.round(i)))
    this.state.barsPerSec = REPLAY_BARS_PER_SEC[idx]!
    this.state.speedMs = this.msPerBar()
    /* Speed is read live each tick — do not restart the driver here. */
    if (this.state.playing) {
      // Re-base the cadence grid so a new speed applies to the next advance, not after the
      // old (possibly multi-second) delay has elapsed.
      this.nextTickAt = Date.now() + this.msPerBar()
      this.scheduleNextTick(this.playbackGen)
    }
  }

  slice(): Bar[] {
    return this.bars.slice(0, this.state.index)
  }

  setIndex(i: number) {
    this.state.index = Math.max(1, Math.min(this.bars.length, Math.round(i)))
    this.emit()
  }

  skip(delta: number) {
    this.setIndex(this.state.index + delta)
  }

  goStart() {
    this.setIndex(this.state.loopStartIndex)
  }

  goEnd() {
    this.setIndex(this.bars.length)
  }

  play() {
    if (this.state.playing) return
    this.state.playing = true
    if (this.state.index >= this.bars.length) {
      this.state.index = this.state.loopStartIndex
      this.emit()
    }
    this.armPlayback()
  }

  togglePlay() {
    if (this.state.playing) this.pause()
    else this.play()
  }

  pause() {
    this.state.playing = false
    this.cancelPendingTick()
    this.playbackGen += 1
  }

  private isLive(gen: number): boolean {
    return this.state.playing && gen === this.playbackGen
  }

  private msPerBar(): number {
    return Math.max(40, Math.round(1000 / this.state.barsPerSec))
  }

  private emit() {
    this.onTick(this.slice(), this.state.index)
  }

  private cancelPendingTick() {
    if (this.tickTimer !== null) {
      clearTimeout(this.tickTimer)
      this.tickTimer = null
    }
  }

  /**
   * Schedule against a fixed wall-clock grid rather than `period` after the paint returns.
   *
   * The paint callback is synchronous and can be expensive (a decoupled step repaints several
   * chart bars), so chaining `setTimeout(period)` after `emit()` makes the real cadence
   * `paint + period` — noticeably slower than the requested bars-per-second.
   */
  private scheduleNextTick(gen: number) {
    if (!this.isLive(gen)) return
    this.cancelPendingTick()
    const period = this.msPerBar()
    const now = Date.now()
    let delay = this.nextTickAt - now
    if (delay < 0) {
      // Fell behind (slow paint, background tab): step the grid forward to the next slot
      // instead of firing a burst of catch-up ticks.
      const missed = Math.floor(-delay / period) + 1
      this.nextTickAt += missed * period
      delay = Math.max(0, this.nextTickAt - now)
    }
    this.tickTimer = setTimeout(() => this.runTick(gen), delay)
  }

  /** Start the timeout chain without bumping playbackGen (pause uses gen to invalidate). */
  private armPlayback() {
    this.cancelPendingTick()
    this.nextTickAt = Date.now() + this.msPerBar()
    const gen = this.playbackGen
    this.scheduleNextTick(gen)
  }

  /** Advance one bar, paint, then chain the next timeout (never queue multiple). */
  private runTick(gen: number) {
    this.tickTimer = null
    if (!this.isLive(gen)) return

    // Claim this slot before painting so the next delay subtracts the paint cost.
    this.nextTickAt += this.msPerBar()

    if (this.state.index >= this.bars.length) {
      if (this.state.loop) {
        this.state.index = this.state.loopStartIndex
        if (!this.isLive(gen)) return
        this.emit()
        this.scheduleNextTick(gen)
        return
      }
      this.state.playing = false
      this.emit()
      return
    }

    this.state.index = Math.min(this.bars.length, this.state.index + this.barsPerAdvance)
    if (!this.isLive(gen)) return
    this.emit()
    if (!this.isLive(gen)) return
    this.scheduleNextTick(gen)
  }

  /** Replace the full series (e.g. after interval resample) and jump to the last bar. */
  replaceBars(bars: Bar[]) {
    this.replaceBarsAt(bars, bars.length > 0 ? Math.max(1, bars.length) : 1)
  }

  /** Replace series and seek to a 1-based bar index (for backtest / replay frame). */
  replaceBarsAt(bars: Bar[], index: number) {
    this.cancelPendingTick()
    this.playbackGen += 1
    this.bars = bars
    this.state.playing = false
    this.state.index = bars.length > 0 ? Math.max(1, Math.min(Math.round(index), bars.length)) : 1
    this.emit()
  }

  /** Merge earlier bars; shifts replay index so the cursor stays on the same candle. */
  prependBars(prefix: Bar[]): number {
    if (!prefix.length) return 0
    const before = this.bars.length
    const merged = mergeBarsByTime(prefix, this.bars)
    const added = merged.length - before
    if (added <= 0) return 0
    this.bars = merged
    this.state.index += added
    this.state.loopStartIndex += added
    this.emit()
    return added
  }

  /** Merge later bars; extends replay toward session end B. */
  appendBars(suffix: Bar[]): number {
    if (!suffix.length) return 0
    const before = this.bars.length
    const merged = mergeBarsByTime(this.bars, suffix)
    const added = merged.length - before
    if (added <= 0) return 0
    this.bars = merged
    this.emit()
    return added
  }

  dispose() {
    this.pause()
  }
}
