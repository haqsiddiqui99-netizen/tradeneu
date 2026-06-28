/**
 * Loads OHLCV history for a backtest session.
 *
 * Resolution order for gold (XAUUSD / GC) and BTCUSD is implemented in `resolveSessionBars`:
 * same-origin `/api/market/bars` (Twelve Data by default), then bundled static JSON,
 * then synthetic demo data.
 *
 * Swap in additional providers (broker REST, UDF, licensed charting feeds) inside
 * `resolveSessionBars` / `marketDataClient` without changing the chart UI.
 */

export { resolveSessionBars as loadSessionBars, type ResolvedSeries, type SessionBarsOpts } from './resolveSessionBars'
export { isGoldBrowserSymbol, usesMarketDataSession } from './resolveSessionBars'
