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
import { defaultSyncProfile } from './marketLocalSync.mjs'
import { readArchiveTicks } from './tickArchive.mjs'
import { aggregateBars, barBucketStartSec, chartRangeSec, derivedIntervalSpec } from './barBuckets.mjs'

const DAY_SEC = 86_400
/** Without an explicit window, cap how much base history one derived request scans. */
const DERIVED_DEFAULT_SPAN_SEC = { m1: 31 * DAY_SEC, h1: 2 * 366 * DAY_SEC, d1: null }
const DERIVED_MAX_SPAN_SEC = { m1: 366 * DAY_SEC, h1: 10 * 366 * DAY_SEC, d1: null }

/**
 * Chart intervals that are not stored (2m, 5m, 4h, 1W, 1M…) are built from stored m1 / h1 / d1
 * bars with the same bucketing replay uses in the browser.
 */
function tryResolveDerivedLocalBars(p, chartInterval) {
  const spec = derivedIntervalSpec(chartInterval)
  if (!spec) return null
  const bounds = getLocalBarTimeBounds(p.symbol, spec.baseTf)
  if (!bounds) return null

  const explicitStart = Number.isFinite(p.startSec) ? Number(p.startSec) : null
  let endSec = Number.isFinite(p.endSec) ? Math.min(Number(p.endSec), bounds.maxSec) : bounds.maxSec
  let startSec = explicitStart
  if (startSec == null) {
    const span = chartRangeSec(p.chartRange) ?? DERIVED_DEFAULT_SPAN_SEC[spec.baseTf]
    const maxSpan = DERIVED_MAX_SPAN_SEC[spec.baseTf]
    const capped = span != null && maxSpan != null ? Math.min(span, maxSpan) : span ?? maxSpan
    startSec = capped != null ? endSec - capped : bounds.minSec
  }
  startSec = Math.max(bounds.minSec, barBucketStartSec(startSec, spec.stepSec))
  if (endSec <= startSec) return null

  const base = readLocalBars(p.symbol, spec.baseTf, startSec, endSec)
  if (!base.ok) return null
  const bars = aggregateBars(base.bars, spec.stepSec)
  if (bars.length < 2) return null
  return {
    ok: true,
    bars,
    timeframe: chartInterval,
    source: `local:sqlite:${spec.baseTf}>${chartInterval}`,
    count: bars.length,
  }
}

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
    const fromSec = p.cursor != null && Number.isFinite(Number(p.cursor)) ? Number(p.cursor) / 1000 : p.startSec
    const archiveFirst = fromSec < Date.now() / 1000 - defaultSyncProfile().ticksDays * 86_400
    const fromArchive = () => readArchiveTicks(p.symbol, p.startSec, p.endSec, p.limit, p.cursor)
    if (archiveFirst) {
      const archived = await fromArchive()
      if (archived.ok) return archived
    }
    const local = readLocalTicks(p.symbol, p.startSec, p.endSec, p.limit, p.cursor)
    if (local.ok) return local
    if (!archiveFirst) {
      const archived = await fromArchive()
      if (archived.ok) return archived
    }
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
 * @param {string} [p.chartRange] `range` query, sizes the window when start/end are absent
 */
export function tryResolveLocalBars(p) {
  if (!marketLocalEnabled()) return null
  try {
    const tf = chartIntervalToLocalTimeframe(p.chartInterval)
    // Monthly bars follow calendar months, so build them from d1 instead of the mn1 table.
    if (!tf || tf === 'mn1') {
      return tryResolveDerivedLocalBars(p, tf === 'mn1' ? '1M' : String(p.chartInterval || '').trim())
    }
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
