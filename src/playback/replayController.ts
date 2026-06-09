import type { Bar } from '../types'

export type ReplayState = {
  playing: boolean
  index: number
  speedMs: number
}

export const REPLAY_SPEED_MS = [2000, 1000, 500, 250, 100] as const

export class ReplayController {
  private bars: Bar[]
  private state: ReplayState
  private timer: ReturnType<typeof setInterval> | null = null
  private onTick: (slice: Bar[], index: number) => void

  constructor(bars: Bar[], onTick: (slice: Bar[], index: number) => void) {
    this.bars = bars
    this.onTick = onTick
    this.state = {
      playing: false,
      /* Last bar = “live” end so legend / watchlist / ticket match the chart’s latest candles. */
      index: Math.max(1, bars.length),
      /* Default 1× (TradingView-style). */
      speedMs: REPLAY_SPEED_MS[1],
    }
  }

  getState(): ReplayState {
    return { ...this.state }
  }

  getSpeedIndex(): number {
    const idx = REPLAY_SPEED_MS.indexOf(this.state.speedMs as (typeof REPLAY_SPEED_MS)[number])
    return idx >= 0 ? idx : 1
  }

  setSpeedIndex(i: number) {
    const idx = Math.max(0, Math.min(REPLAY_SPEED_MS.length - 1, i))
    this.state.speedMs = REPLAY_SPEED_MS[idx]
    if (this.state.playing) {
      this.stopTimer()
      this.startTimer()
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
    this.setIndex(1)
  }

  goEnd() {
    this.setIndex(this.bars.length)
  }

  togglePlay() {
    this.state.playing = !this.state.playing
    if (this.state.playing) {
      /* TradingView-style: play from the beginning when already at the last bar. */
      if (this.state.index >= this.bars.length) {
        this.state.index = 1
        this.emit()
      }
      this.startTimer()
    } else {
      this.stopTimer()
    }
  }

  pause() {
    this.state.playing = false
    this.stopTimer()
  }

  private emit() {
    this.onTick(this.slice(), this.state.index)
  }

  private startTimer() {
    this.stopTimer()
    this.timer = setInterval(() => {
      if (this.state.index >= this.bars.length) {
        this.state.playing = false
        this.stopTimer()
        this.emit()
        return
      }
      this.state.index += 1
      this.emit()
    }, this.state.speedMs)
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Replace the full series (e.g. after interval resample) and jump to the last bar. */
  replaceBars(bars: Bar[]) {
    this.stopTimer()
    this.bars = bars
    this.state.playing = false
    this.state.index = bars.length > 0 ? Math.max(1, bars.length) : 1
    this.emit()
  }

  dispose() {
    this.stopTimer()
  }
}
