import type { Bar } from '../types'

/** Some intraday feeds return volume 0; we only synthesize when *all* bars lack volume. */
export type HistogramVolumeMode = 'api' | 'synthetic_ohlc'

/** Per-bar activity from OHLC when API volume is missing (not real traded volume). */
function ohlcActivityProxy(b: Bar): number {
  const range = Math.max(0, b.high - b.low)
  const body = Math.abs(b.close - b.open)
  const raw = range + 0.35 * body
  const floor = Math.max(Math.abs(b.close), Math.abs(b.open), 1e-9) * 1e-7
  return Math.max(raw, floor)
}

/**
 * Values for lightweight-charts `HistogramSeries`, aligned with `bars`.
 * Uses API volume when any bar has volume > 0; otherwise scales OHLC-based estimates for readable bars.
 */
export function resolveHistogramVolumes(bars: Bar[]): { values: number[]; mode: HistogramVolumeMode } {
  if (!bars.length) return { values: [], mode: 'api' }
  const hasReal = bars.some((b) => b.volume > 0)
  if (hasReal) {
    return { values: bars.map((b) => Math.max(0, Math.round(b.volume))), mode: 'api' }
  }
  const raw = bars.map(ohlcActivityProxy)
  const mx = Math.max(...raw, 1e-12)
  const values = raw.map((r) => Math.max(1, Math.round(200 + 9800 * (r / mx))))
  return { values, mode: 'synthetic_ohlc' }
}

/** Display volume for the last bar in `slice` (same series as histogram). */
export function legendVolumeFromSlice(slice: Bar[]): { value: number; mode: HistogramVolumeMode } {
  if (!slice.length) return { value: 0, mode: 'api' }
  const { values, mode } = resolveHistogramVolumes(slice)
  return { value: values[values.length - 1] ?? 0, mode }
}
