/**
 * Historic OHLCV resolution: Twelve Data → gold CSV upload → optional TV stub.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchTradingViewStub } from './tradingViewStub.mjs'
import { fetchTwelveDataTimeSeries, isTwelveDataMappableSymbol } from './twelveData.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', '..', 'server-data')
const GOLD_FILE = path.join(DATA_DIR, 'gold-bars.json')

/** Uploaded `gold-bars.json` is XAU/GC only — never serve it for BTCUSD or FX. */
function isGoldUploadSymbol(symbol) {
  const u = String(symbol || '')
    .trim()
    .toUpperCase()
  return u === 'GC' || u === 'XAUUSD'
}

function isGoldDefaultRangeSymbol(symbol) {
  return isGoldUploadSymbol(symbol)
}

function readUploadBars() {
  try {
    if (!fs.existsSync(GOLD_FILE)) return null
    const j = JSON.parse(fs.readFileSync(GOLD_FILE, 'utf8'))
    const bars = j?.bars
    if (!Array.isArray(bars) || bars.length < 16) return null
    return {
      ok: true,
      bars,
      timeframe: typeof j.timeframe === 'string' ? j.timeframe : '1m',
      source: typeof j.source === 'string' ? j.source : 'upload:server-data',
    }
  } catch {
    return null
  }
}

const DEFAULT_RANGE =
  process.env.MARKET_CHART_RANGE?.trim() || process.env.MARKET_YAHOO_RANGE?.trim() || '5d'
const DEFAULT_INTERVAL =
  process.env.MARKET_CHART_INTERVAL?.trim() || process.env.MARKET_YAHOO_INTERVAL?.trim() || '1m'
const GOLD_CHART_RANGE =
  process.env.MARKET_GOLD_RANGE?.trim() ||
  process.env.MARKET_YAHOO_GOLD_RANGE?.trim() ||
  '5d'
const GOLD_CHART_INTERVAL =
  process.env.MARKET_GOLD_INTERVAL?.trim() ||
  process.env.MARKET_YAHOO_GOLD_INTERVAL?.trim() ||
  '1m'

/**
 * @param {object} p
 * @param {string} p.symbol
 * @param {string} [p.chain] comma-separated: twelvedata | upload | tv (default twelvedata)
 * @param {string} [p.chartRange] query `range` (overrides gold defaults when set)
 * @param {string} [p.chartInterval] query `interval`
 */
export async function resolveMarketBars({ symbol, chain, chartRange, chartInterval }) {
  const parts = String(chain || 'twelvedata')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  const tried = []

  for (const step of parts) {
    if (step === 'twelvedata' || step === '12data' || step === 'twelve_data') {
      if (!isTwelveDataMappableSymbol(symbol)) {
        tried.push('twelvedata(skip:unmapped)')
        continue
      }
      tried.push('twelvedata')
      const cRange =
        typeof chartRange === 'string' && chartRange.trim()
          ? chartRange.trim()
          : isGoldDefaultRangeSymbol(symbol)
            ? GOLD_CHART_RANGE
            : DEFAULT_RANGE
      const cInterval =
        typeof chartInterval === 'string' && chartInterval.trim()
          ? chartInterval.trim()
          : isGoldDefaultRangeSymbol(symbol)
            ? GOLD_CHART_INTERVAL
            : DEFAULT_INTERVAL
      const td = await fetchTwelveDataTimeSeries({
        symbol,
        range: cRange,
        interval: cInterval,
      })
      if (td.ok && td.bars?.length >= 16) {
        return {
          ok: true,
          bars: td.bars,
          timeframe: td.timeframe,
          source: td.source,
          chain: tried.join('→'),
          twelve_data_request: td.twelve_data_request,
        }
      }
      continue
    }
    if (step === 'upload') {
      if (!isGoldUploadSymbol(symbol)) continue
      const up = readUploadBars()
      tried.push('upload')
      if (up?.ok && up.bars?.length >= 16) {
        return { ok: true, bars: up.bars, timeframe: up.timeframe, source: up.source, chain: tried.join('→') }
      }
      continue
    }
    if (step === 'tv' || step === 'tradingview') {
      tried.push('tv')
      await fetchTradingViewStub()
      continue
    }
    if (step === 'yahoo') {
      tried.push('yahoo(removed-use-twelvedata)')
      continue
    }
  }

  return {
    ok: false,
    error: 'no_provider_returned_bars',
    chain: tried.join('→') || 'none',
  }
}
