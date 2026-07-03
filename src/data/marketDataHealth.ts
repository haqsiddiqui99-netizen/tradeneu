export type MarketDataHealth = {
  apiReachable: boolean
  twelveDataKeyConfigured: boolean | null
}

let cached: MarketDataHealth | null = null
let inflight: Promise<MarketDataHealth> | null = null

/** Probe `/api/market/providers` once per page load (cached). */
export async function fetchMarketDataHealth(force = false): Promise<MarketDataHealth> {
  if (!force && cached) return cached
  if (!force && inflight) return inflight

  inflight = (async () => {
    try {
      const res = await fetch('/api/market/providers', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!res.ok) {
        cached = { apiReachable: false, twelveDataKeyConfigured: null }
        return cached
      }
      const json: unknown = await res.json()
      const env =
        json && typeof json === 'object' && 'env' in json
          ? (json as { env?: { TWELVE_DATA_API_KEY?: unknown } }).env
          : undefined
      const keyFlag = env?.TWELVE_DATA_API_KEY
      cached = {
        apiReachable: true,
        twelveDataKeyConfigured: keyFlag === '(set)',
      }
      return cached
    } catch {
      cached = { apiReachable: false, twelveDataKeyConfigured: null }
      return cached
    } finally {
      inflight = null
    }
  })()

  return inflight
}

export function getCachedMarketDataHealth(): MarketDataHealth | null {
  return cached
}
