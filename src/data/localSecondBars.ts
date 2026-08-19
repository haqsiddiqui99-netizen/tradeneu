/** Sub-minute bar steps pre-synced from local ticks into SQLite (mirrors server/localSecondBars.mjs). */

export const LOCAL_SECOND_STEPS = [1, 5, 10, 15, 20, 30] as const

export type LocalSecondStep = (typeof LOCAL_SECOND_STEPS)[number]

export function isLocalSecondStep(step: number): step is LocalSecondStep {
  return (LOCAL_SECOND_STEPS as readonly number[]).includes(Math.round(step))
}

export function secondStepToInterval(step: number): string {
  return `${Math.round(step)}s`
}

/**
 * Reject bars whose median spacing is too wide (e.g. 1m data returned for 5s).
 * Allows only 1.5x slack so a coarser series cannot stand in for a finer step
 * (30s bars for a 15s request), and never reaches a full minute.
 */
export function maxMedianStepForSecondBars(step: number): number {
  const s = Math.round(step)
  return Math.min(60, Math.max(s + 1, Math.round(s * 1.5)))
}
