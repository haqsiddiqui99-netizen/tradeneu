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
 * Capped below 60s: a genuine sub-minute series can never be a minute apart,
 * so 30s (3x = 90) must not accept 1m bars.
 */
export function maxMedianStepForSecondBars(step: number): number {
  return Math.min(60, Math.max(3, Math.round(step) * 3))
}
