import { defaultMarketDataProviderLabel, isDukascopyPrimarySymbol } from './data/dukascopySymbols'

export type AssetCategory =
  | 'stocks'
  | 'futures'
  | 'forex'
  | 'crypto'
  | 'indices'
  | 'metals'
  | 'energies'
  | 'agriculture'

export type AssetBadge =
  | { kind: 'broker'; label: string; sub?: string }
  | { kind: 'pro'; label: string; sub?: string }

export type CatalogAsset = {
  symbol: string
  name: string
  category: AssetCategory
  badge?: AssetBadge
}

/** Shown first in “Recently used” when panel opens. */
export const RECENT_SYMBOLS = ['XAUUSD']

export const ASSET_CATALOG: CatalogAsset[] = [
  {
    symbol: 'XAUUSD',
    name: 'Gold Spot / US Dollar',
    category: 'metals',
    badge: { kind: 'broker', label: 'Dukascopy', sub: 'Gold USD (1m) · Twelve Data fallback' },
  },
]

export const ASSET_PILLS: { id: 'all' | AssetCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'metals', label: 'Metals' },
]

export function findAsset(symbol: string): CatalogAsset | undefined {
  const u = symbol.trim().toUpperCase()
  return ASSET_CATALOG.find((a) => a.symbol.toUpperCase() === u)
}

/** Session search / TV default exchange before live `source` is known. */
export function catalogMarketDataLabel(symbol: string): string {
  return defaultMarketDataProviderLabel(symbol)
}

export function catalogHasDukascopyPrimary(symbol: string): boolean {
  return isDukascopyPrimarySymbol(symbol)
}
