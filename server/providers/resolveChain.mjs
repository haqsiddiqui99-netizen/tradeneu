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
import { syncBarsRange } from './marketLocalSync.mjs'
import {
  chartIntervalToLocalTimeframe,
  localChunkSatisfied,
  marketLocalEnabled,
} from './marketLocalDb.mjs'
import { minBarsForRange } from './sessionPriorBars.mjs'

function chainMinBars(startSec, endSec) {
  if (Number.isFinite(startSec) && Number.isFinite(endSec) && endSec > startSec) {
    return minBarsForRange(startSec, endSec)
  }
  return 16
}

function minLocalBarsForInterval(chartInterval) {
  const s = String(chartInterval || '').trim().toLowerCase()
  if (/^\d+s$/.test(s)) return 2
  return 16
}

/** Dedupe concurrent on-demand SQLite backfills for the same symbol/range. */
const onDemandSyncInflight = new Map()

function onDemandSyncEnabled() {
  const v = process.env.MARKET_ON_DEMAND_SYNC?.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

function resolveChartInterval(symbol, chartInterval) {
  return typeof chartInterval === 'string' && chartInterval.trim()
    ? chartInterval.trim()
    : isGoldDefaultRangeSymbol(symbol)
      ? GOLD_CHART_INTERVAL
      : DEFAULT_INTERVAL
}

/** True when SQLite covers the requested window (rejects stale :clamped partial windows). */
function localRangeSatisfied(symbol, chartInterval, startSec, endSec, local) {
  if (!local?.ok || !local.bars?.length) return false
  if (local.bars.length < minLocalBarsForInterval(chartInterval)) return false
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return true
  const tf = chartIntervalToLocalTimeframe(chartInterval)
  if (!tf || !marketLocalEnabled()) return true
  return localChunkSatisfied(symbol, tf, startSec, endSec)
}

/** True when returned local bars overlap the requested unix window (±1 day slack). */
function localBarsOverlapRequest(startSec, endSec, local) {
  if (!local?.bars?.length) return false
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return true
  const first = local.bars[0].time
  const last = local.bars[local.bars.length - 1].time
  return last >= startSec - 86_400 && first <= endSec + 86_400
}

/**
 * Serve SQLite immediately when bars overlap the request — even if the full chunk
 * is not backfilled yet (windowed session boot at A).
 */
function localBarsUsableNow(symbol, chartInterval, startSec, endSec, local) {
  if (!local?.ok || !local.bars?.length) return false
  if (local.bars.length < minLocalBarsForInterval(chartInterval)) return false
  // Direct SQL read for start/end — already scoped; do not re-check 500-bar chunk rules.
  if (!String(local.source || '').includes(':clamped')) return true
  if (localRangeSatisfied(symbol, chartInterval, startSec, endSec, local)) return true
  return localBarsOverlapRequest(startSec, endSec, local)
}

function kickLocalBarsSync(symbol, chartInterval, startSec, endSec) {
  if (startSec == null || endSec == null) return
  void ensureLocalBarsSynced(symbol, chartInterval, startSec, endSec)
}

async function ensureLocalBarsSynced(symbol, chartInterval, startSec, endSec) {
  if (!onDemandSyncEnabled() || !marketLocalEnabled()) return false
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return false
  if (!isDukascopyMappableSymbol(symbol)) return false
  const tf = chartIntervalToLocalTimeframe(chartInterval)
  if (!tf || tf.startsWith('s')) return false

  const key = `${symbol}|${tf}|${Math.floor(startSec)}|${Math.floor(endSec)}`
  if (onDemandSyncInflight.has(key)) return onDemandSyncInflight.get(key)

  const job = syncBarsRange(
    symbol,
    tf,
    Math.floor(startSec),
    Math.floor(endSec),
    (msg) => console.log(`[market-on-demand] ${msg}`),
    { missingOnly: true },
  )
    .then(() => true)
    .catch((err) => {
      console.warn(`[market-on-demand] ${symbol} ${tf}:`, err instanceof Error ? err.message : err)
      return false
    })
    .finally(() => {
      onDemandSyncInflight.delete(key)
    })

  onDemandSyncInflight.set(key, job)
  return job
}

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
  const chainUsesLocal = parts.includes('local') || parts.includes('sqlite')

  for (const step of parts) {
    if (step === 'local' || step === 'sqlite') {
      if (!marketLocalEnabled()) {
        tried.push('local(skip:disabled)')
        continue
      }
      const cInterval = resolveChartInterval(symbol, chartInterval)
      tried.push('local')
      const reqStart = Number.isFinite(startSec) ? startSec : undefined
      const reqEnd = Number.isFinite(endSec) ? endSec : undefined
      try {
        const local = tryResolveLocalBars({
          symbol,
          chartInterval: cInterval,
          startSec: reqStart,
          endSec: reqEnd,
        })
        if (local?.ok && localBarsUsableNow(symbol, cInterval, reqStart, reqEnd, local)) {
          if (
            reqStart != null &&
            reqEnd != null &&
            !localRangeSatisfied(symbol, cInterval, reqStart, reqEnd, local)
          ) {
            kickLocalBarsSync(symbol, cInterval, reqStart, reqEnd)
          }
          const partial = !localRangeSatisfied(symbol, cInterval, reqStart, reqEnd, local)
          return {
            ok: true,
            bars: local.bars,
            timeframe: local.timeframe,
            source: local.source,
            chain: partial ? [...tried, 'local(partial)'].join('→') : tried.join('→'),
          }
        }
        if (reqStart != null && reqEnd != null) {
          kickLocalBarsSync(symbol, cInterval, reqStart, reqEnd)
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        console.warn(`[market] local provider failed — trying next in chain (${lastError})`)
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
      if (dc.ok && dc.bars?.length >= chainMinBars(startSec, endSec)) {
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
      if (chainUsesLocal && marketLocalEnabled()) {
        const cInterval = resolveChartInterval(symbol, chartInterval)
        try {
          const local = tryResolveLocalBars({
            symbol,
            chartInterval: cInterval,
            startSec: Number.isFinite(startSec) ? startSec : undefined,
            endSec: Number.isFinite(endSec) ? endSec : undefined,
          })
          if (
            local?.ok &&
            localRangeSatisfied(
              symbol,
              cInterval,
              Number.isFinite(startSec) ? startSec : undefined,
              Number.isFinite(endSec) ? endSec : undefined,
              local,
            )
          ) {
            return {
              ok: true,
              bars: local.bars,
              timeframe: local.timeframe,
              source: local.source,
              chain: [...tried, 'local(fallback)'].join('→'),
            }
          }
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err)
          console.warn(`[market] local fallback after dukascopy failed (${lastError})`)
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
      if (td.ok && td.bars?.length >= chainMinBars(startSec, endSec)) {
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
