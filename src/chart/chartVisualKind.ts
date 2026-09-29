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

/**
 * TradingView's `SeriesType`, which the library ships as bare numbers rather than a runtime
 * enum. The kinds with no TradingView equivalent map onto candles.
 */
const TV_SERIES_TYPE: Record<ChartVisualKind, number> = {
  bars: 0,
  candles: 1,
  line: 2,
  area: 3,
  hollow_candles: 9,
  baseline: 10,
  high_low: 12,
  columns: 13,
  line_markers: 14,
  step_line: 15,
  hlc_area: 16,
  volume_candles: 1,
  volume_footprint: 1,
  tpo: 1,
}

export function tvSeriesTypeForVisualKind(kind: ChartVisualKind): number {
  return TV_SERIES_TYPE[kind] ?? 1
}

export function visualKindForTvSeriesType(type: number): ChartVisualKind {
  for (const [kind, value] of Object.entries(TV_SERIES_TYPE)) {
    if (value === type && isChartVisualKindEnabled(kind as ChartVisualKind)) {
      return kind as ChartVisualKind
    }
  }
  return 'candles'
}
