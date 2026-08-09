/** Minimal TradingView datafeed types (subset of charting_library/datafeed-api.d.ts). */

export type TvResolution = string

export type TvBar = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export type TvLibrarySymbolInfo = {
  name: string
  ticker: string
  description: string
  type: string
  session: string
  timezone: string
  exchange: string
  minmov: number
  pricescale: number
  has_intraday: boolean
  has_seconds?: boolean
  seconds_multipliers?: string[]
  has_daily: boolean
  has_weekly_and_monthly: boolean
  supported_resolutions: TvResolution[]
  volume_precision: number
  data_status: 'streaming' | 'endofday' | 'pulsed' | 'delayed_streaming'
}

export type TvPeriodParams = {
  from: number
  to: number
  countBack: number
  firstDataRequest: boolean
}

export type TvExchange = {
  value: string
  name: string
  desc: string
}

export type TvSymbolType = {
  name: string
  value: string
}

export type TvSearchSymbolResultItem = {
  symbol: string
  full_name: string
  description: string
  exchange: string
  ticker: string
  type: string
}

export type TvDatafeedConfiguration = {
  supported_resolutions: TvResolution[]
  supports_search?: boolean
  supports_seconds?: boolean
  supports_marks: boolean
  supports_timescale_marks: boolean
  supports_time: boolean
  exchanges?: TvExchange[]
  symbols_types?: TvSymbolType[]
}

export type TvQuoteValues = {
  ch?: number
  chp?: number
  short_name?: string
  exchange?: string
  description?: string
  lp?: number
  ask?: number
  bid?: number
  spread?: number
  open_price?: number
  high_price?: number
  low_price?: number
}

export type TvQuoteData =
  | { s: 'ok'; n: string; v: TvQuoteValues }
  | { s: 'error'; n: string; v: object }

export type TvDatafeed = {
  onReady: (cb: (config: TvDatafeedConfiguration) => void) => void
  resolveSymbol: (
    symbolName: string,
    onResolve: (info: TvLibrarySymbolInfo) => void,
    onError: (reason: string) => void,
  ) => void
  getBars: (
    symbolInfo: TvLibrarySymbolInfo,
    resolution: TvResolution,
    periodParams: TvPeriodParams,
    onResult: (bars: TvBar[], meta: { noData: boolean }) => void,
    onError: (reason: string) => void,
  ) => void
  subscribeBars: (
    symbolInfo: TvLibrarySymbolInfo,
    resolution: TvResolution,
    onTick: (bar: TvBar) => void,
    listenerGuid: string,
    onResetCache: () => void,
  ) => void
  unsubscribeBars: (listenerGuid: string) => void
  searchSymbols: (
    userInput: string,
    exchange: string,
    symbolType: string,
    onResult: (items: TvSearchSymbolResultItem[]) => void,
  ) => void
  getQuotes?: (
    symbols: string[],
    onData: (quotes: TvQuoteData[]) => void,
    onError: (reason: string) => void,
  ) => void
  subscribeQuotes?: (
    symbols: string[],
    fastSymbols: string[],
    onRealtimeCallback: (quotes: TvQuoteData[]) => void,
    listenerGUID: string,
  ) => void
  unsubscribeQuotes?: (listenerGUID: string) => void
}
