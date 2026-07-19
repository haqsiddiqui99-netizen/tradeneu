/** True when TradingView Advanced Charts should replace Lightweight Charts in the workspace. */
export function useTradingViewChart(): boolean {
  const v = import.meta.env.VITE_USE_TV_CHART
  return v === '1' || v === 'true' || v === 'yes'
}
