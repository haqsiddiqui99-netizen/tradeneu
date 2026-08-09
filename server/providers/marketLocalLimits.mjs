/**
 * Shared limits for local OHLCV reads (SQLite / Timescale) — prevents multi-million-bar
 * responses that freeze chart boot on wide session date ranges.
 */

/** Max bars returned per /api/market/bars local read (default 60k ≈ ~42 days of m1). */
export function localMaxBarsPerRequest() {
  return Math.min(
    200_000,
    Math.max(4_000, Number.parseInt(process.env.MARKET_LOCAL_MAX_BARS_PER_REQUEST || '60000', 10) || 60_000),
  )
}

/** Approximate bar step in seconds for a local timeframe id (m1, h1, s10, …). */
export function localBarStepSec(timeframe) {
  const tf = String(timeframe || '').trim().toLowerCase()
  if (/^s\d+$/.test(tf)) {
    const sec = Number.parseInt(tf.slice(1), 10)
    return Number.isFinite(sec) && sec > 0 ? sec : 1
  }
  if (tf === 'm1') return 60
  if (tf === 'h1') return 3600
  if (tf === 'd1') return 86_400
  if (tf === 'mn1') return 2_592_000
  return 60
}

/**
 * Narrow [startSec, endSec] so a local read cannot exceed `localMaxBarsPerRequest`.
 * Keeps the tail ending at `endSec` (most recent bars in range).
 *
 * @param {number | null | undefined} startSec
 * @param {number | null | undefined} endSec
 * @param {string} timeframe
 * @param {{ minSec: number, maxSec: number } | null | undefined} [bounds]
 * @returns {{ startSec: number | null, endSec: number | null } | null} null when session is entirely past local max
 */
export function narrowLocalBarWindow(startSec, endSec, timeframe, bounds) {
  const maxBars = localMaxBarsPerRequest()
  const step = localBarStepSec(timeframe)
  const maxSpan = maxBars * step

  let start = Number.isFinite(startSec) ? Number(startSec) : null
  let end = Number.isFinite(endSec) ? Number(endSec) : null

  if (bounds) {
    if (start != null && start > bounds.maxSec) return null
    if (start != null) start = Math.max(start, bounds.minSec)
    if (end != null) end = Math.min(end, bounds.maxSec)
    else end = bounds.maxSec
  }

  if (start != null && end != null && end > start) {
    const span = end - start
    if (span > maxSpan) start = end - maxSpan
  }

  return { startSec: start, endSec: end }
}

/**
 * Trim bar rows to the most recent `maxBars` when a query exceeded the cap.
 * @template {{ time: number }} T
 * @param {T[]} rows
 * @param {number} [maxBars]
 */
export function trimLocalBarRows(rows, maxBars = localMaxBarsPerRequest()) {
  if (rows.length <= maxBars) return { rows, truncated: false }
  return { rows: rows.slice(-maxBars), truncated: true }
}
