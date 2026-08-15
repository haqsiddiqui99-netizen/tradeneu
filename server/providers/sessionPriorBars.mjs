/** Minimum parsed bars for a ranged fetch — short sessions may legitimately have fewer than 16. */
export function minBarsForRange(startSec, endSec) {
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return 16
  const span = Math.max(60, endSec - startSec)
  return Math.max(2, Math.min(16, Math.ceil(span / 60)))
}

/** Prepend up to `maxPrior` candles strictly before `sessionStartSec`. Skips when priors already exist. */
export function prependSessionPriorBars(bars, priorBars, sessionStartSec, maxPrior = 120) {
  if (!Array.isArray(bars) || !bars.length) return bars
  if (!Number.isFinite(sessionStartSec) || !Array.isArray(priorBars) || !priorBars.length) return bars
  if (bars.some((b) => b.time < sessionStartSec)) return bars

  const priors = priorBars.filter((b) => b.time < sessionStartSec)
  if (!priors.length) return bars

  const prefix = priors.slice(-Math.max(1, maxPrior))
  const merged = [...prefix, ...bars]
  const out = []
  let lastT = -1
  for (const b of merged) {
    if (b.time === lastT) continue
    lastT = b.time
    out.push(b)
  }
  return out
}
