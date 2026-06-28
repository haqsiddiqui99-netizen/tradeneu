/**
 * Twelve Data `time_series` — primary OHLCV source (stocks, FX, crypto, metals where supported).
 * API key stays on the server — never expose to the browser.
 *
 * @see https://twelvedata.com/docs#time-series
 */

const TD_TIME_SERIES = 'https://api.twelvedata.com/time_series'

/**
 * Map app symbols (XAUUSD, EURUSD, AAPL, …) → Twelve Data `symbol` query value.
 * Returns `null` if the ticker cannot be mapped.
 */
export function appSymbolToTwelveDataSymbol(rawSymbol) {
  const raw = String(rawSymbol || '').trim()
  if (!raw) return null
  const u = raw.toUpperCase()

  const explicit = {
    XAUUSD: 'XAU/USD',
    GC: 'XAU/USD',
    SI: 'XAG/USD',
    XAGUSD: 'XAG/USD',
    BTCUSD: 'BTC/USD',
    EURUSD: 'EUR/USD',
    GBPUSD: 'GBP/USD',
    USDJPY: 'USD/JPY',
    CL: 'WTI/USD',
  }
  if (explicit[u]) return explicit[u]

  if (/^[A-Z]{6}$/.test(u)) return `${u.slice(0, 3)}/${u.slice(3)}`

  if (/^[A-Z0-9][A-Z0-9.-]{0,11}$/i.test(raw) && !raw.includes('/') && !raw.includes('=')) {
    return raw
  }
  return null
}

export function isTwelveDataMappableSymbol(symbol) {
  return appSymbolToTwelveDataSymbol(symbol) != null
}

/**
 * Map chart UI / query `interval` to Twelve Data `interval` param.
 * Note: UI uses `1M` for monthly and `1m` for 1-minute (case-sensitive distinction).
 */
export function chartIntervalToTwelveDataInterval(chartInterval) {
  const s = String(chartInterval || '1m').trim()
  if (s === '1M') return '1month'
  const x = s.toLowerCase()
  const map = {
    '1m': '1min',
    '2m': '1min',
    '5m': '5min',
    '10m': '15min',
    '15m': '15min',
    '30m': '30min',
    '60m': '1h',
    '1h': '1h',
    '1d': '1day',
    '1w': '1week',
    '1wk': '1week',
    '1mo': '1month',
    '1mth': '1month',
    '1month': '1month',
  }
  return map[x] || '1min'
}

function tdIntervalToTimeframeLabel(tdInterval) {
  if (tdInterval === '1min') return '1m'
  if (tdInterval === '5min') return '5m'
  if (tdInterval === '15min') return '15m'
  if (tdInterval === '30min') return '30m'
  if (tdInterval === '1h') return '1h'
  if (tdInterval === '1day') return '1D'
  if (tdInterval === '1week') return '1W'
  if (tdInterval === '1month') return '1M'
  return tdInterval
}

function tdIntervalToSeconds(tdInterval) {
  if (tdInterval === '1min') return 60
  if (tdInterval === '5min') return 300
  if (tdInterval === '15min') return 900
  if (tdInterval === '30min') return 1800
  if (tdInterval === '1h') return 3600
  if (tdInterval === '1day') return 86_400
  if (tdInterval === '1week') return 604_800
  if (tdInterval === '1month') return 2_592_000
  return 60
}

function formatTwelveDataUtcDatetime(unixSec) {
  const d = new Date(unixSec * 1000)
  return d.toISOString().slice(0, 19)
}

function outputSizeCap() {
  return Math.min(
    8000,
    Math.max(30, Number.parseInt(process.env.TWELVE_DATA_OUTPUT_SIZE || '5000', 10) || 5000),
  )
}

/** Rough bar count target from chart `range` for intraday outputsize. */
function outputSizeForRange(range, tdInterval) {
  const cap = outputSizeCap()
  const r = String(range || '5d').trim().toLowerCase()
  const mult = tdInterval === '1min' ? 400 : tdInterval === '5min' ? 80 : tdInterval === '15min' ? 35 : 30
  if (r === '1d') return Math.min(cap, mult * 1)
  if (r === '5d') return Math.min(cap, mult * 5)
  if (r === '7d') return Math.min(cap, mult * 7)
  if (r === '3d') return Math.min(cap, mult * 3)
  if (r === '1mo' || r === '30d') return Math.min(cap, mult * 22)
  if (r === '3mo') return Math.min(cap, mult * 66)
  if (r === '1y' || r === '12mo') return Math.min(cap, mult * 252)
  if (r === '5y' || r === '10y' || r === 'max' || r === '2y') return cap
  return Math.min(cap, mult * 5)
}

function parseTwelveDataDatetime(isoLike) {
  const s = String(isoLike || '').trim()
  if (!s) return NaN
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s.replace(' ', 'T')}Z`
  const ms = Date.parse(normalized)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN
}

function decimalsForPrice(x) {
  return Number(x) >= 100 ? 3 : 5
}

/**
 * @param {object} opts
 * @param {string} opts.symbol App symbol e.g. AAPL, XAUUSD
 * @param {string} [opts.range] Chart range (1d,5d,1mo,…) for outputsize hint
 * @param {string} [opts.interval] Chart interval (1m,5m,1h,1d,1w,1M)
 * @param {number} [opts.startSec] Session fetch start (unix seconds, UTC instant)
 * @param {number} [opts.endSec] Session end (unix seconds, UTC instant)
 * @param {number} [opts.sessionStartSec] Actual session start — prepend one prior bar when missing
 * @returns {Promise<{ ok: boolean, bars?: object[], timeframe?: string, error?: string, source?: string, twelve_data_request?: object }>}
 */
export async function fetchTwelveDataTimeSeries({
  symbol,
  range = '5d',
  interval = '1m',
  startSec,
  endSec,
  sessionStartSec,
}) {
  const apiKey = process.env.TWELVE_DATA_API_KEY?.trim()
  if (!apiKey) {
    return { ok: false, error: 'twelvedata: missing TWELVE_DATA_API_KEY' }
  }
  const tdSym = appSymbolToTwelveDataSymbol(symbol)
  if (!tdSym) {
    return { ok: false, error: 'twelvedata: symbol not mapped' }
  }

  const tdInterval = chartIntervalToTwelveDataInterval(interval)
  const stepSec = tdIntervalToSeconds(tdInterval)
  const cap = outputSizeCap()
  const hasRange =
    Number.isFinite(startSec) && Number.isFinite(endSec) && endSec > startSec

  async function fetchChunk(chunkStartSec, chunkEndSec, outputsize) {
    const url = new URL(TD_TIME_SERIES)
    url.searchParams.set('symbol', tdSym)
    url.searchParams.set('interval', tdInterval)
    url.searchParams.set('apikey', apiKey)
    url.searchParams.set('timezone', 'UTC')
    url.searchParams.set('order', 'ASC')
    if (Number.isFinite(chunkStartSec) && Number.isFinite(chunkEndSec)) {
      url.searchParams.set('start_date', formatTwelveDataUtcDatetime(chunkStartSec))
      url.searchParams.set('end_date', formatTwelveDataUtcDatetime(chunkEndSec))
      url.searchParams.set('outputsize', String(Math.min(cap, outputsize || cap)))
    } else {
      url.searchParams.set('outputsize', String(outputsize || outputSizeForRange(range, tdInterval)))
    }

    let res
    try {
      res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      })
    } catch (e) {
      return { ok: false, error: `twelvedata network: ${e?.message || e}` }
    }

    const data = await res.json().catch(() => null)
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'twelvedata: invalid json' }
    }
    if (data.status === 'error' || data.code != null) {
      const msg = data.message || data.error || String(data.code || 'error')
      return { ok: false, error: `twelvedata: ${msg}` }
    }
    const values = data.values
    if (!Array.isArray(values) || values.length < 1) {
      return { ok: true, bars: [], request: Object.fromEntries(url.searchParams) }
    }

    const bars = []
    let lastT = -1
    for (const row of values) {
      if (!row || typeof row !== 'object') continue
      const t = parseTwelveDataDatetime(row.datetime)
      const o = parseFloat(row.open)
      const h = parseFloat(row.high)
      const l = parseFloat(row.low)
      const c = parseFloat(row.close)
      const v = parseFloat(row.volume)
      if (!Number.isFinite(t) || t <= lastT) continue
      if (![o, h, l, c].every(Number.isFinite)) continue
      lastT = t
      const dp = decimalsForPrice
      const vi = Number.isFinite(v) && v >= 0 ? Math.round(v) : 0
      bars.push({
        time: t,
        open: +Number(o).toFixed(dp(o)),
        high: +Number(h).toFixed(dp(h)),
        low: +Number(l).toFixed(dp(l)),
        close: +Number(c).toFixed(dp(c)),
        volume: vi,
      })
    }
    return { ok: true, bars, request: Object.fromEntries(url.searchParams) }
  }

  let merged = []
  let lastRequest = null

  if (hasRange) {
    // Twelve Data often caps at ~2000 bars per request even when outputsize is higher.
    const chunkBarLimit = Math.min(cap, 2000)
    const maxChunkSpan = Math.max(stepSec, (chunkBarLimit - 1) * stepSec)
    let cursor = startSec
    let guard = 0
    while (cursor < endSec && guard < 128) {
      guard += 1
      const chunkEnd = Math.min(endSec, cursor + maxChunkSpan)
      const chunk = await fetchChunk(cursor, chunkEnd, chunkBarLimit)
      if (!chunk.ok) {
        if (merged.length >= 16) break
        return { ok: false, error: chunk.error }
      }
      lastRequest = chunk.request
      if (!chunk.bars.length) break
      const before = merged.length
      for (const b of chunk.bars) {
        if (b.time >= startSec && b.time <= endSec) {
          if (!merged.length || b.time > merged[merged.length - 1].time) merged.push(b)
        }
      }
      const lastBar = chunk.bars[chunk.bars.length - 1]
      const nextCursor = lastBar.time + stepSec
      if (nextCursor <= cursor) break
      cursor = nextCursor
      if (lastBar.time >= endSec - stepSec) break
      // Keep paging until endSec even when the provider returns fewer than chunkBarLimit bars.
      if (merged.length === before && chunk.bars.length < chunkBarLimit) break
    }
  } else {
    const single = await fetchChunk(undefined, undefined, outputSizeForRange(range, tdInterval))
    if (!single.ok) return { ok: false, error: single.error }
    merged = single.bars
    lastRequest = single.request
  }

  if (merged.length < 16) {
    return { ok: false, error: `twelvedata: parsed too few bars (${merged.length})` }
  }

  if (Number.isFinite(sessionStartSec) && !merged.some((b) => b.time < sessionStartSec)) {
    const lookback = Math.max(stepSec * 500, 86_400)
    const priorChunk = await fetchChunk(Math.max(0, sessionStartSec - lookback), sessionStartSec, 500)
    if (priorChunk.ok && priorChunk.bars.length) {
      let prior = null
      for (const b of priorChunk.bars) {
        if (b.time < sessionStartSec) prior = b
      }
      if (prior && prior.time < merged[0].time) {
        merged.unshift(prior)
      }
    }
  }

  const app = String(symbol).trim()
  return {
    ok: true,
    bars: merged,
    timeframe: tdIntervalToTimeframeLabel(tdInterval),
    source: `twelvedata:${tdSym}`,
    twelve_data_request: {
      symbol: tdSym,
      app_symbol: app,
      interval: tdInterval,
      timezone: 'UTC',
      startSec: hasRange ? startSec : undefined,
      endSec: hasRange ? endSec : undefined,
      chunks: hasRange ? true : undefined,
      ...(lastRequest || {}),
    },
  }
}
