/** TV header / legend label from `/api/market/bars` `source` (e.g. `dukascopy:xauusd`). */
export function providerLabelFromDataSource(dataSource?: string): string {
  const s = dataSource?.trim().toLowerCase() ?? ''
  if (!s) return ''
  if (s.startsWith('local:sqlite:') || s.startsWith('local:')) return 'Local'
  if (s.startsWith('dukascopy:') || s.includes('dukascopy')) return 'Dukascopy'
  if (s.startsWith('twelvedata:') || s.includes('twelvedata')) return 'Twelve Data'
  if (s.startsWith('upload:')) return 'Replay data'
  if (s.startsWith('synthetic:')) return 'Demo data'
  return ''
}
