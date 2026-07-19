/**
 * Short-lived in-memory cache for Dukascopy tick series.
 */

const DEFAULT_TTL_MS = Math.max(
  15_000,
  Number.parseInt(process.env.MARKET_TICKS_CACHE_TTL_MS || '300000', 10) || 300_000,
)
const HISTORICAL_TTL_MS = Math.max(
  DEFAULT_TTL_MS,
  Number.parseInt(process.env.MARKET_TICKS_CACHE_HISTORICAL_TTL_MS || '900000', 10) || 900_000,
)
const MAX_ENTRIES = Math.min(
  64,
  Math.max(8, Number.parseInt(process.env.MARKET_TICKS_CACHE_MAX || '32', 10) || 32),
)

/** @type {Map<string, { expires: number, value: object }>} */
const store = new Map()

function normalizeSymbol(symbol) {
  return String(symbol || '')
    .trim()
    .toUpperCase()
}

function ttlMs(endSec) {
  const nowSec = Math.floor(Date.now() / 1000)
  if (Number.isFinite(endSec) && endSec < nowSec - 300) return HISTORICAL_TTL_MS
  return DEFAULT_TTL_MS
}

export function marketTicksCacheKey({ symbol, startSec, endSec, cursor, limit }) {
  return [
    normalizeSymbol(symbol),
    Number.isFinite(startSec) ? startSec : '',
    Number.isFinite(endSec) ? endSec : '',
    cursor != null && Number.isFinite(Number(cursor)) ? Math.floor(Number(cursor)) : '',
    Number.isFinite(limit) ? limit : '',
  ].join('|')
}

function pruneIfNeeded() {
  if (store.size <= MAX_ENTRIES) return
  const now = Date.now()
  for (const [k, v] of store) {
    if (v.expires <= now) store.delete(k)
  }
  while (store.size > MAX_ENTRIES) {
    const first = store.keys().next().value
    if (first == null) break
    store.delete(first)
  }
}

/**
 * @param {string} key
 * @param {() => Promise<object>} loader
 * @param {{ endSec?: number }} [opts]
 */
export async function getCachedMarketTicks(key, loader, opts = {}) {
  const now = Date.now()
  const hit = store.get(key)
  if (hit && hit.expires > now) {
    return { ...hit.value, cache: 'hit' }
  }
  if (hit) store.delete(key)

  const value = await loader()
  if (value?.ok && Array.isArray(value.ticks) && value.ticks.length >= 1) {
    pruneIfNeeded()
    store.set(key, { value, expires: now + ttlMs(opts.endSec) })
    return { ...value, cache: 'miss' }
  }
  return { ...value, cache: 'bypass' }
}

/** @param {string} [prefix] symbol prefix */
export function invalidateMarketTicksCache(prefix) {
  if (!prefix) {
    store.clear()
    return
  }
  const p = normalizeSymbol(prefix)
  for (const k of store.keys()) {
    if (k.startsWith(`${p}|`)) store.delete(k)
  }
}
