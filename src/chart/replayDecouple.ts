import type { UTCTimestamp } from 'lightweight-charts'
import type { Bar } from '../types'
import type { IntervalPick } from '../views/chartIntervalCatalog'
import { aggregateOHLCV } from './aggregateBars'

const r3 = (x: number) => +x.toFixed(3)
const SUB_BAR_SEC = 60

export function isSubMinuteReplayPick(replayPick: IntervalPick): boolean {
  return replayPick.kind === 'time' && (replayPick.stepSec ?? 60) < 60
}

/**
 * Decoupled replay: minute+ chart with a different replay step (minute or sub-minute).
 * Sub-minute chart intervals must stay coupled (same chart + replay pill).
 */
export function canDecoupleReplay(chartPick: IntervalPick, replayPick: IntervalPick): boolean {
  if (chartPick.kind !== 'time' || replayPick.kind !== 'time') return false
  const chartSec = chartPick.stepSec ?? 60
  const replaySec = replayPick.stepSec ?? 60
  if (chartSec < 60 || chartSec % 60 !== 0) return false
  if (replaySec < 60) return true
  return replaySec % 60 === 0
}

/** @deprecated Use {@link canDecoupleReplay} — kept for callers expecting minute-only decouple. */
export function canDecoupleMinuteReplay(chartPick: IntervalPick, replayPick: IntervalPick): boolean {
  return canDecoupleReplay(chartPick, replayPick)
}

/** Infer replay step duration from transport bars (handles 10s pick on 15s local bars). */
export function effectiveReplayStepSec(stepBars: Bar[], pickStepSec: number): number {
  if (stepBars.length < 2) return pickStepSec
  const steps: number[] = []
  const n = Math.min(stepBars.length, 48)
  for (let i = 1; i < n; i++) {
    const d = Number(stepBars[i]!.time) - Number(stepBars[i - 1]!.time)
    if (Number.isFinite(d) && d > 0) steps.push(d)
  }
  if (!steps.length) return pickStepSec
  steps.sort((a, b) => a - b)
  const med = steps[Math.floor(steps.length / 2)]!
  if (med > 0 && med < 60) return med
  return pickStepSec
}

export function buildReplayStepBars(
  source1m: Bar[],
  replayPick: IntervalPick,
  subMinuteStepBars?: Bar[],
): Bar[] {
  const step = replayPick.stepSec ?? 60
  if (step < 60) {
    return subMinuteStepBars?.length ? subMinuteStepBars.slice() : []
  }
  if (step <= 60) return source1m.slice()
  return aggregateOHLCV(source1m, step)
}

/** Exclusive wall-clock end of replay cursor after revealing `stepIndex` step bars (1-based). */
export function cursorEndSecForStepIndex(
  stepBars: Bar[],
  replayStepSec: number,
  stepIndex: number,
): number {
  if (!stepBars.length || stepIndex < 1) return 0
  const i = Math.max(0, Math.min(stepBars.length - 1, Math.round(stepIndex) - 1))
  return Number(stepBars[i]!.time) + replayStepSec
}

/** First bar index where `bar.time >= tSec`. */
function lowerBoundBarIndex(bars: Bar[], tSec: number): number {
  let lo = 0
  let hi = bars.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (Number(bars[mid]!.time) < tSec) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Count of chart bars fully closed at `cursorEndSec`. */
function completeChartBarCount(chartBars: Bar[], chartStepSec: number, cursorEndSec: number): number {
  let lo = 0
  let hi = chartBars.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (Number(chartBars[mid]!.time) + chartStepSec <= cursorEndSec) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Largest 1-based step index whose cursor end is ≤ `cursorEndSec`. */
export function stepIndexForCursorEnd(
  stepBars: Bar[],
  replayStepSec: number,
  cursorEndSec: number,
): number {
  if (!stepBars.length) return 1
  let lo = 0
  let hi = stepBars.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const end = Number(stepBars[mid]!.time) + replayStepSec
    if (end <= cursorEndSec) lo = mid + 1
    else hi = mid
  }
  return Math.max(1, lo)
}

function formingChartBarFrom1m(
  source1m: Bar[],
  chartStepSec: number,
  cursorEndSec: number,
): Bar | null {
  if (cursorEndSec <= 0 || cursorEndSec % chartStepSec === 0) return null
  const bucketStart = Math.floor((cursorEndSec - 1) / chartStepSec) * chartStepSec
  const startIdx = lowerBoundBarIndex(source1m, bucketStart)

  let open: number | null = null
  let high = -Infinity
  let low = Infinity
  let close: number | null = null
  let volume = 0

  for (let i = startIdx; i < source1m.length; i++) {
    const b = source1m[i]!
    const t = Number(b.time)
    if (t + SUB_BAR_SEC > cursorEndSec) break
    if (open == null) open = b.open
    high = Math.max(high, b.high)
    low = Math.min(low, b.low)
    close = b.close
    volume += b.volume
  }

  if (open == null || close == null || !Number.isFinite(high) || !Number.isFinite(low)) return null
  return {
    time: bucketStart as UTCTimestamp,
    open: r3(open),
    high: r3(high),
    low: r3(low),
    close: r3(close),
    volume: Math.max(0, Math.round(volume)),
  }
}

/** Forming chart candle from sub-minute (or 1m) source bars inside an open chart bucket. */
function formingChartBarFromFineSource(
  fineBars: Bar[],
  _fineStepSec: number,
  chartStepSec: number,
  cursorEndSec: number,
): Bar | null {
  if (cursorEndSec <= 0 || cursorEndSec % chartStepSec === 0) return null
  if (!fineBars.length) return null
  const bucketStart = Math.floor((cursorEndSec - 1) / chartStepSec) * chartStepSec
  const startIdx = lowerBoundBarIndex(fineBars, bucketStart)

  let open: number | null = null
  let high = -Infinity
  let low = Infinity
  let close: number | null = null
  let volume = 0

  for (let i = startIdx; i < fineBars.length; i++) {
    const b = fineBars[i]!
    const t = Number(b.time)
    if (t >= cursorEndSec) break
    if (t < bucketStart) continue
    if (open == null) open = b.open
    high = Math.max(high, b.high)
    low = Math.min(low, b.low)
    close = b.close
    volume += b.volume
  }

  if (open == null || close == null || !Number.isFinite(high) || !Number.isFinite(low)) return null
  return {
    time: bucketStart as UTCTimestamp,
    open: r3(open),
    high: r3(high),
    low: r3(low),
    close: r3(close),
    volume: Math.max(0, Math.round(volume)),
  }
}

/** Map replay step cursor → chart candles for TV / LWC (FXReplay-style). */
export function decoupledChartReplayDisplay(opts: {
  chartBars: Bar[]
  source1mBars: Bar[]
  chartStepSec: number
  cursorEndSec: number
  /** Sub-minute replay step bars (10s, 30s, …) for forming minute+ candles. */
  sourceFineBars?: Bar[]
  fineStepSec?: number
}): { all: Bar[]; display: Bar[] } {
  const { chartBars, source1mBars, chartStepSec, cursorEndSec, sourceFineBars, fineStepSec } = opts
  const all = chartBars
  if (!all.length) return { all, display: [] }

  const effectiveCursor = cursorEndSec > 0 ? cursorEndSec : Number(all[0]!.time) + chartStepSec
  const revealed = completeChartBarCount(all, chartStepSec, effectiveCursor)
  const useFine =
    sourceFineBars != null &&
    sourceFineBars.length > 0 &&
    fineStepSec != null &&
    fineStepSec < chartStepSec
  const forming = useFine
    ? formingChartBarFromFineSource(sourceFineBars!, fineStepSec!, chartStepSec, effectiveCursor)
    : formingChartBarFrom1m(source1mBars, chartStepSec, effectiveCursor)

  let display: Bar[]
  if (forming) {
    display = revealed > 0 ? all.slice(0, revealed).concat(forming) : [forming]
  } else if (revealed > 0) {
    display = all.slice(0, revealed)
  } else {
    display = all.slice(0, 1)
  }

  return { all, display }
}
