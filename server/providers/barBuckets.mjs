/**
 * Candle bucketing shared by every derived chart interval. Must match `src/chart/aggregateBars.ts`
 * so a server-built 4h / 1W / 1M candle equals the one replay builds in the browser.
 */

const DAY_SEC = 86_400
const WEEK_SEC = 7 * DAY_SEC
const MONTH_SEC = 30 * DAY_SEC
const YEAR_SEC = 365 * DAY_SEC
/** 1970-01-01 was a Thursday; weeks open Monday 00:00 UTC. */
const MONDAY_OFFSET_SEC = 4 * DAY_SEC

export function monthsPerBar(stepSec) {
  if (stepSec === YEAR_SEC) return 12
  if (stepSec >= MONTH_SEC && stepSec % MONTH_SEC === 0) return stepSec / MONTH_SEC
  return null
}

export function barBucketStartSec(tSec, stepSec) {
  const months = monthsPerBar(stepSec)
  if (months != null) {
    const d = new Date(tSec * 1000)
    const idx = d.getUTCFullYear() * 12 + d.getUTCMonth()
    const startIdx = Math.floor(idx / months) * months
    return Date.UTC(Math.floor(startIdx / 12), startIdx % 12, 1) / 1000
  }
  if (stepSec >= WEEK_SEC && stepSec % WEEK_SEC === 0) {
    return Math.floor((tSec - MONDAY_OFFSET_SEC) / stepSec) * stepSec + MONDAY_OFFSET_SEC
  }
  return Math.floor(tSec / stepSec) * stepSec
}

/**
 * @param {Array<{ time: number, open: number, high: number, low: number, close: number, volume?: number }>} bars ascending
 * @param {number} stepSec
 */
export function aggregateBars(bars, stepSec) {
  const out = []
  let cur = null
  for (const b of bars) {
    const k = barBucketStartSec(Number(b.time), stepSec)
    if (!cur || cur.time !== k) {
      cur = { time: k, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 }
      out.push(cur)
    } else {
      if (b.high > cur.high) cur.high = b.high
      if (b.low < cur.low) cur.low = b.low
      cur.close = b.close
      cur.volume += b.volume ?? 0
    }
  }
  return out
}

/**
 * Chart interval that is not stored as-is → stored base timeframe + bar length.
 * `m` = minutes and `M` = months, so the minute/month patterns are case-sensitive.
 * @param {string} interval
 * @returns {{ baseTf: 'm1' | 'h1' | 'd1', stepSec: number } | null}
 */
export function derivedIntervalSpec(interval) {
  const raw = String(interval || '').trim()
  let m = /^(\d+)m$/.exec(raw) || /^(\d+)min$/i.exec(raw)
  if (m) {
    const n = Number(m[1])
    if (!(n > 0)) return null
    return { baseTf: n % 60 === 0 ? 'h1' : 'm1', stepSec: n * 60 }
  }
  m = /^(\d+)h$/i.exec(raw)
  if (m) {
    const n = Number(m[1])
    return n > 0 ? { baseTf: 'h1', stepSec: n * 3600 } : null
  }
  m = /^(\d+)d$/i.exec(raw)
  if (m) {
    const n = Number(m[1])
    return n > 0 ? { baseTf: 'd1', stepSec: n * DAY_SEC } : null
  }
  m = /^(\d+)(w|wk)$/i.exec(raw)
  if (m) {
    const n = Number(m[1])
    return n > 0 ? { baseTf: 'd1', stepSec: n * WEEK_SEC } : null
  }
  m = /^(\d+)M$/.exec(raw) || /^(\d+)(mo|mth|month)$/i.exec(raw)
  if (m) {
    const n = Number(m[1])
    return n > 0 ? { baseTf: 'd1', stepSec: n === 12 ? YEAR_SEC : n * MONTH_SEC } : null
  }
  return null
}

/** `range` query (5d, 1mo, 1y, max…) → seconds; null for max / unknown. */
export function chartRangeSec(range) {
  const m = /^(\d+)(d|wk|mo|y)$/i.exec(String(range || '').trim())
  if (!m) return null
  const n = Number(m[1])
  const unit = m[2].toLowerCase()
  if (unit === 'd') return n * DAY_SEC
  if (unit === 'wk') return n * WEEK_SEC
  if (unit === 'mo') return n * 31 * DAY_SEC
  return n * 366 * DAY_SEC
}
