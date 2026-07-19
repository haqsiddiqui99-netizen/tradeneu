/** Client mirror of `server/providers/dukascopy.mjs` instrument map (primary chain step). */
const EXPLICIT_INSTRUMENT = new Set([
  'XAUUSD',
  'GC',
  'XAGUSD',
  'SI',
  'BTCUSD',
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'USDCHF',
  'AUDUSD',
  'USDCAD',
  'NZDUSD',
  'CL',
  'WTI',
])

export function isDukascopyPrimarySymbol(symbol: string): boolean {
  const u = symbol.trim().toUpperCase()
  if (!u) return false
  if (EXPLICIT_INSTRUMENT.has(u)) return true
  return /^[A-Z]{6}$/.test(u)
}

export function defaultMarketDataProviderLabel(symbol: string): string {
  return isDukascopyPrimarySymbol(symbol) ? 'Dukascopy' : 'Twelve Data'
}
