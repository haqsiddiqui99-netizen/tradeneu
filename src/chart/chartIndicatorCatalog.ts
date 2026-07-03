export type ChartIndicatorId =
  | 'ema20'
  | 'ema50'
  | 'sma20'
  | 'rsi14'
  | 'macd'
  | 'bb20'
  | 'atr14'
  | 'vwap'
  | 'volume'

export type ChartIndicatorKind = 'overlay' | 'rsi' | 'macd' | 'bb' | 'atr' | 'volume'

export type ChartIndicatorDef = {
  id: ChartIndicatorId
  name: string
  author: string
  kind: ChartIndicatorKind
  color: string
  color2?: string
  color3?: string
  histUp?: string
  histDown?: string
}

export const CHART_INDICATOR_CATALOG: ChartIndicatorDef[] = [
  {
    id: 'ema20',
    name: 'EMA (20)',
    author: 'Built-in',
    kind: 'overlay',
    color: '#2962ff',
  },
  {
    id: 'ema50',
    name: 'EMA (50)',
    author: 'Built-in',
    kind: 'overlay',
    color: '#f23645',
  },
  {
    id: 'sma20',
    name: 'SMA (20)',
    author: 'Built-in',
    kind: 'overlay',
    color: '#ff9800',
  },
  {
    id: 'vwap',
    name: 'VWAP',
    author: 'Built-in',
    kind: 'overlay',
    color: '#ab47bc',
  },
  {
    id: 'bb20',
    name: 'Bollinger Bands (20, 2)',
    author: 'Built-in',
    kind: 'bb',
    color: '#2962ff',
    color2: '#787b86',
    color3: '#2962ff',
  },
  {
    id: 'rsi14',
    name: 'RSI (14)',
    author: 'Built-in',
    kind: 'rsi',
    color: '#7e57c2',
  },
  {
    id: 'atr14',
    name: 'ATR (14)',
    author: 'Built-in',
    kind: 'atr',
    color: '#26a69a',
  },
  {
    id: 'macd',
    name: 'MACD (12, 26, 9)',
    author: 'Built-in',
    kind: 'macd',
    color: '#2962ff',
    color2: '#ff6d00',
    histUp: '#26a69a',
    histDown: '#ef5350',
  },
  {
    id: 'volume',
    name: 'Volume',
    author: 'Built-in',
    kind: 'volume',
    color: '#26a69a',
    histUp: '#26a69a',
    histDown: '#ef5350',
  },
]

export function getChartIndicatorDef(id: ChartIndicatorId): ChartIndicatorDef | undefined {
  return CHART_INDICATOR_CATALOG.find((d) => d.id === id)
}

export function isChartIndicatorId(v: string): v is ChartIndicatorId {
  return CHART_INDICATOR_CATALOG.some((d) => d.id === v)
}
