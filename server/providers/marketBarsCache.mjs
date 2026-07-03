/**
 * Short-lived in-memory cache for resolved OHLCV series (Twelve Data is slow to page).
 * Historical session ranges (end in the past) stay cached longer than live windows.
 */

const DEFAULT_TTL_MS = Math.max(
  15_000,
  Number.parseInt(process.env.MARKET_BARS_CACHE_TTL_MS || '120000', 10) || 120_000,
)
const HISTORICAL_TTL_MS = Math.max(
  DEFAULT_TTL_MS,
  Number.parseInt(process.env.MARKET_BARS_CACHE_HISTORICAL_TTL_MS || '600000', 10) || 600_000,
)
const MAX_ENTRIES = Math.min(
  128,
  Math.max(8, Number.parseInt(process.env.MARKET_BARS_CACHE_MAX || '48', 10) || 48),
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

export function marketBarsCacheKey({
  symbol,
  chain,
  chartRange,
  chartInterval,
  startSec,
  endSec,
  sessionStartSec,
}) {
  return [
    normalizeSymbol(symbol),
    String(chain || 'twelvedata').trim().toLowerCase(),
    chartRange?.trim() || '',
    chartInterval?.trim() || '',
    Number.isFinite(startSec) ? startSec : '',
    Number.isFinite(endSec) ? endSec : '',
    Number.isFinite(sessionStartSec) ? sessionStartSec : '',
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
export async function getCachedMarketBars(key, loader, opts = {}) {
  const now = Date.now()
  const hit = store.get(key)
  if (hit && hit.expires > now) {
    return { ...hit.value, cache: 'hit' }
  }
  if (hit) store.delete(key)

  const value = await loader()
  if (value?.ok && Array.isArray(value.bars) && value.bars.length >= 16) {
    pruneIfNeeded()
    store.set(key, { value, expires: now + ttlMs(opts.endSec) })
    return { ...value, cache: 'miss' }
  }
  return { ...value, cache: 'bypass' }
}

/** @param {string} [prefix] symbol prefix e.g. XAUUSD */
export function invalidateMarketBarsCache(prefix) {
  if (!prefix) {
    store.clear()
    return
  }
  const p = normalizeSymbol(prefix)
  for (const k of store.keys()) {
    if (k.startsWith(`${p}|`)) store.delete(k)
  }
}
