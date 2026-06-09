const rawBase = import.meta.env.BASE_URL
const base = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase
const ML_PREFIX = base ? `${base}/api/ml` : '/api/ml'

export async function fetchWatchlist(): Promise<string[]> {
  const r = await fetch(`${ML_PREFIX}/v1/watchlist`)
  if (!r.ok) throw new Error(await r.text())
  const j = (await r.json()) as { symbols: string[] }
  return j.symbols
}

export async function addWatchlistSymbol(symbol: string): Promise<string[]> {
  const r = await fetch(`${ML_PREFIX}/v1/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol }),
  })
  if (!r.ok) throw new Error(await r.text())
  const j = (await r.json()) as { symbols: string[] }
  return j.symbols
}

export async function removeWatchlistSymbol(symbol: string): Promise<string[]> {
  const r = await fetch(`${ML_PREFIX}/v1/watchlist/${encodeURIComponent(symbol)}`, {
    method: 'DELETE',
  })
  if (!r.ok) throw new Error(await r.text())
  const j = (await r.json()) as { symbols: string[] }
  return j.symbols
}

export type QuoteRow = { symbol: string; last: number | null; changePct: number | null; currency: string | null }

export async function fetchWatchlistQuotes(): Promise<QuoteRow[]> {
  const r = await fetch(`${ML_PREFIX}/v1/watchlist/quotes`)
  if (!r.ok) throw new Error(await r.text())
  const j = (await r.json()) as { quotes: QuoteRow[] }
  return j.quotes
}
