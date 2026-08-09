/**

 * Local-first market data resolution (TimescaleDB / SQLite before Dukascopy).

 */



import { fetchDukascopyTicks } from './dukascopyTicks.mjs'

import { narrowLocalBarWindow } from './marketLocalLimits.mjs'

import {

  chartIntervalToLocalTimeframe,

  getLocalBarTimeBounds,

  marketLocalEnabled,

  marketLocalFallbackDukascopy,

  readLocalBars,

  readLocalTicks,

} from './marketStore.mjs'



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

    const local = await readLocalTicks(p.symbol, p.startSec, p.endSec, p.limit, p.cursor)

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

export async function tryResolveLocalBars(p) {

  if (!marketLocalEnabled()) return null

  try {

    const tf = chartIntervalToLocalTimeframe(p.chartInterval)

    if (!tf) return null



    const startSec = Number.isFinite(p.startSec) ? Number(p.startSec) : null

    const endSec = Number.isFinite(p.endSec) ? Number(p.endSec) : null

    const bounds =
      startSec != null || endSec != null ? await getLocalBarTimeBounds(p.symbol, tf) : null



    const window = narrowLocalBarWindow(startSec, endSec, tf, bounds)

    if (window === null) return null



    const queryStart = window.startSec ?? startSec ?? undefined

    const queryEnd = window.endSec ?? endSec ?? undefined



    const out = await readLocalBars(p.symbol, tf, queryStart, queryEnd)

    if (out.ok) {

      if (out.truncated) {

        return { ...out, source: `${out.source}:truncated` }

      }

      return out

    }



    if (startSec == null || !bounds) return null

    if (startSec > bounds.maxSec) return null



    const clampedStart = Math.max(startSec, bounds.minSec)

    const clampedEnd = Math.min(endSec != null ? endSec : bounds.maxSec, bounds.maxSec)

    if (clampedEnd <= clampedStart) return null

    if (clampedStart === startSec && endSec != null && clampedEnd === endSec) {

      return null

    }



    const softWindow = narrowLocalBarWindow(clampedStart, clampedEnd, tf, bounds)

    if (softWindow === null) return null



    const soft = await readLocalBars(

      p.symbol,

      tf,

      softWindow.startSec ?? clampedStart,

      softWindow.endSec ?? clampedEnd,

    )

    if (!soft.ok) return null

    return {

      ...soft,

      source: `${soft.source}:clamped`,

    }

  } catch (err) {

    const msg = err instanceof Error ? err.message : String(err)

    console.warn(`[market-store] read failed — skipping local provider (${msg})`)

    return null

  }

}

