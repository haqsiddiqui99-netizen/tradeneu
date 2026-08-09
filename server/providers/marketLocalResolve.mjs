/**
 * Local-first market data resolution (SQLite before Dukascopy).
 */

import { fetchDukascopyTicks } from './dukascopyTicks.mjs'
import {
  chartIntervalToLocalTimeframe,
  getLocalBarTimeBounds,
  marketLocalEnabled,
  marketLocalFallbackDukascopy,
  readLocalBars,
  readLocalTicks,
} from './marketLocalDb.mjs'

/**
 * @param {object} p
 * @param {string} p.symbol
 * @param {number} p.startSec
 * @param {number} p.endSec
 * @param {number} [p.cursor]
 * @param {number} [p.limit]
 * @param {'bid'|'ask'|'both'} [p.side]
 */
export async function resolveMarketTicks(p) {
  if (marketLocalEnabled()) {
    const local = readLocalTicks(p.symbol, p.startSec, p.endSec, p.limit, p.cursor)
    if (local.ok) return local
    if (!marketLocalFallbackDukascopy()) {
      return {
        ok: false,
        code: 'no_ticks',
        error: 'No local ticks for this range. Run: npm run market:sync',
      }
    }
  }
  return fetchDukascopyTicks({
    symbol: p.symbol,
    startSec: p.startSec,
    endSec: p.endSec,
    cursor: p.cursor,
    limit: p.limit,
    side: p.side,
  })
}

/**
 * @param {object} p
 * @param {string} p.symbol
 * @param {string} p.chartInterval
 * @param {number} [p.startSec]
 * @param {number} [p.endSec]
 */
export function tryResolveLocalBars(p) {
  if (!marketLocalEnabled()) return null
  try {
    const tf = chartIntervalToLocalTimeframe(p.chartInterval)
    if (!tf) return null
    const out = readLocalBars(p.symbol, tf, p.startSec, p.endSec)
    if (out.ok) return out

    // Session end often extends past the last synced bar (stale SQLite). Serve the
    // overlapping local window instead of blocking on Dukascopy / hanging the chart.
    const startSec = Number.isFinite(p.startSec) ? Number(p.startSec) : null
    const endSec = Number.isFinite(p.endSec) ? Number(p.endSec) : null
    if (startSec == null) return null
    const bounds = getLocalBarTimeBounds(p.symbol, tf)
    if (!bounds) return null
    if (startSec > bounds.maxSec) return null
    const clampedStart = Math.max(startSec, bounds.minSec)
    const clampedEnd = Math.min(endSec != null ? endSec : bounds.maxSec, bounds.maxSec)
    if (clampedEnd <= clampedStart) return null
    if (
      clampedStart === startSec &&
      endSec != null &&
      clampedEnd === endSec
    ) {
      return null
    }
    const soft = readLocalBars(p.symbol, tf, clampedStart, clampedEnd)
    if (!soft.ok) return null
    return {
      ...soft,
      source: `${soft.source}:clamped`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[market-local] read failed — skipping local provider (${msg})`)
    return null
  }
}
