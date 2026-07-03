import type { Bar } from '../types'

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

/** Discrete playback speeds (1x–20x per sec) — label as “Nx per sec” in the replay dock. */
export const REPLAY_BARS_PER_SEC = Array.from({ length: 20 }, (_, i) => i + 1) as readonly number[]

export function replaySpeedLabel(barsPerSec: number): string {
  return `${barsPerSec}x per sec`
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
  private tickTimer: ReturnType<typeof setTimeout> | null = null
  /** Bumped on pause/stop so in-flight ticks cannot schedule another. */
  private playbackGen = 0
  private onTick: (slice: Bar[], index: number) => void

  constructor(bars: Bar[], onTick: (slice: Bar[], index: number) => void) {
    this.bars = bars
    this.onTick = onTick
    this.state = {
      playing: false,
      /* Last bar = “live” end so legend / watchlist / ticket match the chart’s latest candles. */
      index: Math.max(1, bars.length),
      barsPerSec: REPLAY_BARS_PER_SEC[0],
      speedMs: Math.round(1000 / REPLAY_BARS_PER_SEC[0]),
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
    this.setIndex(1)
  }

  goEnd() {
    this.setIndex(this.bars.length)
  }

  play() {
    if (this.state.playing) return
    this.state.playing = true
    if (this.state.index >= this.bars.length) {
      this.state.index = this.state.loop ? this.state.loopStartIndex : 1
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

  private scheduleNextTick(gen: number) {
    if (!this.isLive(gen)) return
    this.cancelPendingTick()
    this.tickTimer = setTimeout(() => this.runTick(gen), this.msPerBar())
  }

  /** Start the timeout chain without bumping playbackGen (pause uses gen to invalidate). */
  private armPlayback() {
    this.cancelPendingTick()
    const gen = this.playbackGen
    this.scheduleNextTick(gen)
  }

  /** Advance one bar, paint, then chain the next timeout (never queue multiple). */
  private runTick(gen: number) {
    this.tickTimer = null
    if (!this.isLive(gen)) return

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

    this.state.index += 1
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

  dispose() {
    this.pause()
  }
}
