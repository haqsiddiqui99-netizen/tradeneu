/**
 * Placeholder for TradingView / broker UDF–style feeds.
 * Next steps: implement UDF `history` + `symbols` against your licensed endpoint or
 * TradingView Charting Library datafeed API.
 *
 * @returns {Promise<{ ok: false, error: string, source: string }>}
 */
export async function fetchTradingViewStub() {
  return {
    ok: false,
    error: 'tradingview_provider_not_configured',
    source: 'tradingview:stub',
    hint: 'Wire UDF server or broker REST here; return same bar shape as resolveChain (OHLCV).',
  }
}
