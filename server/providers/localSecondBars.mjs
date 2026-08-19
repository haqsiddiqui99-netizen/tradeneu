/**
 * Sub-minute bar steps synced from local ticks into SQLite (s1, s5, s10, …).
 */

export const LOCAL_SECOND_STEPS = [1, 5, 10, 15, 20, 30]

/** @param {number} step */
export function isLocalSecondStep(step) {
  return LOCAL_SECOND_STEPS.includes(Math.round(Number(step)))
}

/** @param {number} step */
export function secondStepToTimeframe(step) {
  return `s${Math.round(Number(step))}`
}

/** @param {number} step */
export function secondStepToInterval(step) {
  return `${Math.round(Number(step))}s`
}

/** @param {string} timeframe e.g. s10 */
export function localTimeframeToInterval(timeframe) {
  const m = /^s(\d+)$/i.exec(String(timeframe || '').trim())
  if (!m) return null
  const step = Number.parseInt(m[1], 10)
  return isLocalSecondStep(step) ? secondStepToInterval(step) : null
}

/** @param {string} interval e.g. 10s */
export function chartIntervalToSecondStep(interval) {
  const m = /^(\d+)s$/i.exec(String(interval || '').trim())
  if (!m) return null
  const step = Number.parseInt(m[1], 10)
  return isLocalSecondStep(step) ? step : null
}

/**
 * Reject bars whose median spacing is too wide for the requested second step.
 * Capped below 60s so 30s (3x = 90) cannot accept 1m bars.
 * @param {number} step expected bar spacing in seconds
 */
export function maxMedianStepForSecondBars(step) {
  return Math.min(60, Math.max(3, Math.round(Number(step) || 10) * 3))
}
