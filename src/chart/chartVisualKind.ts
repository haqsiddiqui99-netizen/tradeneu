/** Chart price-style selection (TradingView “chart type” menu). */
export type ChartVisualKind =
  | 'bars'
  | 'candles'
  | 'hollow_candles'
  | 'volume_candles'
  | 'line'
  | 'line_markers'
  | 'step_line'
  | 'area'
  | 'hlc_area'
  | 'baseline'
  | 'columns'
  | 'high_low'
  | 'volume_footprint'
  | 'tpo'

export function isChartVisualKindEnabled(kind: ChartVisualKind): boolean {
  return kind !== 'volume_candles' && kind !== 'volume_footprint' && kind !== 'tpo'
}
