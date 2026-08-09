import type { Bar } from '../types'
import { MAX_SESSION_CHART_BARS } from './resolveSessionBars'
import { SESSION_CHART_LOOKBACK_SEC, sessionDateRangeSec } from './sessionDateRange'

/** First boot fetch for long sessions (~14 days of 1m). */
export const SESSION_WINDOW_INITIAL_SEC = 14 * 86_400

/** Each lazy pan / replay extension chunk (~7 days of 1m). */
export const SESSION_WINDOW_CHUNK_SEC = 7 * 86_400

/** Prefetch when replay cursor is within this many bars of the loaded edge. */
export const SESSION_LAZY_LOAD_MARGIN_BARS = 180

/** Show chunked-load hint above this span at 1m. */
export const SESSION_1M_WARN_SPAN_SEC = 42 * 86_400

/** Suggest 1h/1d above this span at 1m. */
export const SESSION_1M_SUGGEST_H1_SPAN_SEC = 180 * 86_400

export function sessionSpanSec(startDate?: string, endDate?: string): number {
  const { startSec, endSec } = sessionDateRangeSec(startDate, endDate)
  if (startSec == null || endSec == null || endSec <= startSec) return 0
  return endSec - startSec
}

export function sessionUsesWindowedLoad(startDate?: string, endDate?: string): boolean {
  return sessionSpanSec(startDate, endDate) > SESSION_WINDOW_INITIAL_SEC
}

/** Initial API fetch window: session start + lookback through first N days (or full span if short). */
export function initialSessionFetchEndSec(
  sessionStartSec: number,
  sessionEndSec: number,
): number {
  if (sessionEndSec <= sessionStartSec) return sessionEndSec
  const cap = sessionStartSec + SESSION_WINDOW_INITIAL_SEC
  return sessionEndSec > cap ? cap : sessionEndSec
}

export function chunkRangeBeforeLoaded(
  loadedFirstSec: number,
  sessionStartSec: number,
  chunkSec = SESSION_WINDOW_CHUNK_SEC,
): { startSec: number; endSec: number } | null {
  if (loadedFirstSec <= sessionStartSec + 60) return null
  const endSec = loadedFirstSec
  const startSec = Math.max(sessionStartSec, endSec - chunkSec)
  if (endSec - startSec < 60) return null
  return { startSec, endSec }
}

export function chunkRangeAfterLoaded(
  loadedLastSec: number,
  sessionEndSec: number,
  chunkSec = SESSION_WINDOW_CHUNK_SEC,
): { startSec: number; endSec: number } | null {
  if (loadedLastSec >= sessionEndSec - 60) return null
  const startSec = loadedLastSec
  const endSec = Math.min(sessionEndSec, startSec + chunkSec)
  if (endSec - startSec < 60) return null
  return { startSec, endSec }
}

export function mergeBarsByTime(...groups: Bar[][]): Bar[] {
  const out: Bar[] = []
  let lastT = -1
  for (const group of groups) {
    for (const b of group) {
      if (b.time <= lastT) continue
      lastT = b.time
      out.push(b)
    }
  }
  return out
}

/** Keep at most maxBars centered on anchor index (for sliding window in memory). */
export function capBarsAroundIndex(bars: Bar[], anchorIndex0: number, maxBars: number): Bar[] {
  if (bars.length <= maxBars) return bars
  const anchor = Math.max(0, Math.min(bars.length - 1, Math.round(anchorIndex0)))
  const half = Math.floor(maxBars / 2)
  let start = Math.max(0, anchor - half)
  if (start + maxBars > bars.length) start = Math.max(0, bars.length - maxBars)
  return bars.slice(start, start + maxBars)
}

export function fetchLookbackStartSec(sessionStartSec: number): number {
  return Math.max(0, sessionStartSec - SESSION_CHART_LOOKBACK_SEC)
}

export { MAX_SESSION_CHART_BARS }
