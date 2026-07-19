/**
 * Local-first market data resolution (SQLite before Dukascopy).
 */

import { fetchDukascopyTicks } from './dukascopyTicks.mjs'
import {
  chartIntervalToLocalTimeframe,
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
  const tf = chartIntervalToLocalTimeframe(p.chartInterval)
  if (!tf) return null
  const out = readLocalBars(p.symbol, tf, p.startSec, p.endSec)
  if (!out.ok) return null
  return out
}
