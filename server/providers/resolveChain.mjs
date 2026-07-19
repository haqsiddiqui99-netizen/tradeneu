/**
 * Historic OHLCV resolution: Dukascopy → Twelve Data → gold CSV upload → optional TV stub.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchTradingViewStub } from './tradingViewStub.mjs'
import {
  fetchDukascopyBars,
  isDukascopyMappableSymbol,
  chartIntervalToDukascopyTimeframe,
} from './dukascopy.mjs'
import { fetchTwelveDataTimeSeries, isTwelveDataMappableSymbol } from './twelveData.mjs'
import { tryResolveLocalBars } from './marketLocalResolve.mjs'

function minLocalBarsForInterval(chartInterval) {
  const s = String(chartInterval || '').trim().toLowerCase()
  if (/^\d+s$/.test(s)) return 2
  return 16
}
import { chartIntervalToLocalTimeframe, marketLocalEnabled } from './marketLocalDb.mjs'

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
 * @param {string} [p.chain] comma-separated: dukascopy | twelvedata | upload | tv (default twelvedata)
 * @param {string} [p.chartRange] query `range` (overrides gold defaults when set)
 * @param {string} [p.chartInterval] query `interval`
 * @param {number} [p.startSec] session fetch start (unix seconds)
 * @param {number} [p.endSec] session end (unix seconds)
 * @param {number} [p.sessionStartSec] actual session start — ensures one prior candle is included
 */
export async function resolveMarketBars({ symbol, chain, chartRange, chartInterval, startSec, endSec, sessionStartSec }) {
  const parts = String(chain || 'twelvedata')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  const tried = []
  let lastError = null

  for (const step of parts) {
    if (step === 'local' || step === 'sqlite') {
      if (!marketLocalEnabled()) {
        tried.push('local(skip:disabled)')
        continue
      }
      const cInterval =
        typeof chartInterval === 'string' && chartInterval.trim()
          ? chartInterval.trim()
          : isGoldDefaultRangeSymbol(symbol)
            ? GOLD_CHART_INTERVAL
            : DEFAULT_INTERVAL
      tried.push('local')
      const local = tryResolveLocalBars({
        symbol,
        chartInterval: cInterval,
        startSec: Number.isFinite(startSec) ? startSec : undefined,
        endSec: Number.isFinite(endSec) ? endSec : undefined,
      })
      if (local?.ok && local.bars?.length >= minLocalBarsForInterval(cInterval)) {
        return {
          ok: true,
          bars: local.bars,
          timeframe: local.timeframe,
          source: local.source,
          chain: tried.join('→'),
        }
      }
      continue
    }
    if (step === 'dukascopy' || step === 'dca' || step === 'dukas') {
      if (!isDukascopyMappableSymbol(symbol)) {
        tried.push('dukascopy(skip:unmapped)')
        continue
      }
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
      if (!chartIntervalToDukascopyTimeframe(cInterval)) {
        tried.push(`dukascopy(skip:interval:${cInterval})`)
        continue
      }
      tried.push('dukascopy')
      const dc = await fetchDukascopyBars({
        symbol,
        range: cRange,
        interval: cInterval,
        startSec,
        endSec,
        sessionStartSec,
      })
      if (dc.ok && dc.bars?.length >= 16) {
        return {
          ok: true,
          bars: dc.bars,
          timeframe: dc.timeframe,
          source: dc.source,
          chain: tried.join('→'),
          dukascopy_request: dc.dukascopy_request,
        }
      }
      if (dc.error) lastError = dc.error
      if (marketLocalEnabled()) {
        const cInterval =
          typeof chartInterval === 'string' && chartInterval.trim()
            ? chartInterval.trim()
            : isGoldDefaultRangeSymbol(symbol)
              ? GOLD_CHART_INTERVAL
              : DEFAULT_INTERVAL
        const local = tryResolveLocalBars({
          symbol,
          chartInterval: cInterval,
          startSec: Number.isFinite(startSec) ? startSec : undefined,
          endSec: Number.isFinite(endSec) ? endSec : undefined,
        })
        if (local?.ok && local.bars?.length >= minLocalBarsForInterval(cInterval)) {
          return {
            ok: true,
            bars: local.bars,
            timeframe: local.timeframe,
            source: local.source,
            chain: [...tried, 'local(fallback)'].join('→'),
          }
        }
      }
      continue
    }
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
      const localTf = chartIntervalToLocalTimeframe(cInterval)
      if (localTf?.startsWith('s')) {
        tried.push(`twelvedata(skip:interval:${cInterval})`)
        continue
      }
      const td = await fetchTwelveDataTimeSeries({
        symbol,
        range: cRange,
        interval: cInterval,
        startSec,
        endSec,
        sessionStartSec,
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
      if (td.error) lastError = td.error
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
    error: lastError || 'no_provider_returned_bars',
    chain: tried.join('→') || 'none',
  }
}
