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
export const RECENT_SYMBOLS = ['XAUUSD', 'GC', 'XAGUSD', 'EURUSD', 'CL']

export const ASSET_CATALOG: CatalogAsset[] = [
  { symbol: 'AUDCAD', name: 'Australian Dollar / Canadian Dollar', category: 'forex', badge: { kind: 'broker', label: 'OANDA' } },
  { symbol: 'AUDCHF', name: 'Australian Dollar / Swiss Franc', category: 'forex', badge: { kind: 'broker', label: 'OANDA' } },
  { symbol: 'EURUSD', name: 'Euro / US Dollar', category: 'forex', badge: { kind: 'broker', label: 'OANDA' } },
  { symbol: 'GBPUSD', name: 'British Pound / US Dollar', category: 'forex' },
  { symbol: 'USDJPY', name: 'US Dollar / Japanese Yen', category: 'forex' },
  { symbol: 'USDCAD', name: 'US Dollar / Canadian Dollar', category: 'forex' },
  { symbol: 'AUDUSD', name: 'Australian Dollar / US Dollar', category: 'forex' },
  { symbol: 'NZDUSD', name: 'New Zealand Dollar / US Dollar', category: 'forex' },
  { symbol: 'EURGBP', name: 'Euro / British Pound', category: 'forex' },
  { symbol: 'EURJPY', name: 'Euro / Japanese Yen', category: 'forex' },
  { symbol: 'GBPJPY', name: 'British Pound / Japanese Yen', category: 'forex' },
  { symbol: 'USDCHF', name: 'US Dollar / Swiss Franc', category: 'forex' },
  { symbol: '6E', name: 'Euro FX Futures', category: 'futures', badge: { kind: 'pro', label: 'Pro', sub: 'US Futures' } },
  { symbol: '6B', name: 'British Pound Futures', category: 'futures', badge: { kind: 'pro', label: 'Pro', sub: 'US Futures' } },
  { symbol: '6J', name: 'Japanese Yen Futures', category: 'futures', badge: { kind: 'pro', label: 'Pro', sub: 'US Futures' } },
  { symbol: '6A', name: 'Australian Dollar Futures', category: 'futures', badge: { kind: 'pro', label: 'Pro', sub: 'US Futures' } },
  { symbol: '6C', name: 'Canadian Dollar Futures', category: 'futures' },
  { symbol: 'ES', name: 'E-mini S&P 500', category: 'indices', badge: { kind: 'pro', label: 'Pro', sub: 'US Futures' } },
  { symbol: 'NQ', name: 'E-mini NASDAQ-100', category: 'indices', badge: { kind: 'pro', label: 'Pro', sub: 'US Futures' } },
  { symbol: 'YM', name: 'E-mini Dow', category: 'indices' },
  { symbol: 'RTY', name: 'E-mini Russell 2000', category: 'indices' },
  { symbol: 'CL', name: 'Crude Oil WTI', category: 'energies', badge: { kind: 'pro', label: 'Pro', sub: 'US Futures' } },
  { symbol: 'NG', name: 'Natural Gas', category: 'energies' },
  { symbol: 'RB', name: 'RBOB Gasoline', category: 'energies' },
  { symbol: 'HO', name: 'Heating Oil', category: 'energies' },
  { symbol: 'GC', name: 'Gold', category: 'metals', badge: { kind: 'pro', label: 'Pro', sub: 'US Futures' } },
  { symbol: 'SI', name: 'Silver', category: 'metals' },
  { symbol: 'HG', name: 'Copper', category: 'metals' },
  { symbol: 'PL', name: 'Platinum', category: 'metals' },
  {
    symbol: 'XAUUSD',
    name: 'Gold Spot / US Dollar',
    category: 'metals',
    badge: { kind: 'broker', label: 'Twelve Data', sub: 'Gold USD (chart)' },
  },
  { symbol: 'XAGUSD', name: 'Silver Spot / US Dollar', category: 'metals' },
  { symbol: 'ZC', name: 'Corn', category: 'agriculture' },
  { symbol: 'ZS', name: 'Soybeans', category: 'agriculture' },
  { symbol: 'ZW', name: 'Wheat', category: 'agriculture' },
  { symbol: 'KC', name: 'Coffee', category: 'agriculture' },
  { symbol: 'CT', name: 'Cotton', category: 'agriculture' },
  { symbol: 'BTCUSD', name: 'Bitcoin / US Dollar', category: 'crypto' },
  { symbol: 'ETHUSD', name: 'Ethereum / US Dollar', category: 'crypto' },
  { symbol: 'SOLUSD', name: 'Solana / US Dollar', category: 'crypto' },
  { symbol: 'AAPL', name: 'Apple Inc.', category: 'stocks' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', category: 'stocks' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', category: 'stocks' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', category: 'stocks' },
  { symbol: 'META', name: 'Meta Platforms Inc.', category: 'stocks' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', category: 'stocks' },
  { symbol: 'TSLA', name: 'Tesla Inc.', category: 'stocks' },
  { symbol: 'SPX', name: 'S&P 500 Index', category: 'indices' },
  { symbol: 'NDX', name: 'NASDAQ-100 Index', category: 'indices' },
  { symbol: 'DJI', name: 'Dow Jones Industrial Average', category: 'indices' },
  { symbol: 'VIX', name: 'CBOE Volatility Index', category: 'indices' },
  { symbol: 'UK100', name: 'FTSE 100 Index', category: 'indices' },
  { symbol: 'DE40', name: 'DAX Index', category: 'indices' },
  { symbol: 'JP225', name: 'Japan 225 Index', category: 'indices' },
]

export const ASSET_PILLS: { id: 'all' | AssetCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'futures', label: 'Futures' },
  { id: 'forex', label: 'Forex' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'indices', label: 'Indices' },
  { id: 'metals', label: 'Metals' },
  { id: 'energies', label: 'Energies' },
  { id: 'agriculture', label: 'Agriculture' },
]

export function findAsset(symbol: string): CatalogAsset | undefined {
  const u = symbol.trim().toUpperCase()
  return ASSET_CATALOG.find((a) => a.symbol.toUpperCase() === u)
}
