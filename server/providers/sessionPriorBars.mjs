/** Max prior lookback when backfilling session context (24h on 1m). */
export const SESSION_PRIOR_LOOKBACK_SEC = 24 * 60 * 60

/** Backfill when fewer prior bars exist before session start. */
export const SESSION_MIN_PRIOR_BARS = 60

export function countPriorBars(bars, sessionStartSec) {
  if (!Number.isFinite(sessionStartSec) || !Array.isArray(bars)) return 0
  return bars.filter((b) => b.time < sessionStartSec).length
}

export function needsSessionPriorBackfill(bars, sessionStartSec, minPrior = SESSION_MIN_PRIOR_BARS) {
  if (!Number.isFinite(sessionStartSec)) return false
  return countPriorBars(bars, sessionStartSec) < minPrior
}

export function priorFetchFromSec(sessionStartSec, lookbackSec = SESSION_PRIOR_LOOKBACK_SEC) {
  return Math.max(0, sessionStartSec - lookbackSec)
}

/** Merge all candles strictly before session start that are not already present. */
export function mergePriorBarsBeforeSession(bars, priorBars, sessionStartSec) {
  if (!Number.isFinite(sessionStartSec) || !Array.isArray(bars) || !priorBars?.length) return bars
  const times = new Set(bars.map((b) => b.time))
  const priors = priorBars.filter((b) => b.time < sessionStartSec && !times.has(b.time))
  if (!priors.length) return bars
  return [...priors, ...bars].sort((a, b) => a.time - b.time)
}
