/**
 * Background warm-up: sync Dukascopy → local SQLite on persistent volume (Railway /data).
 * Makes repeat chart loads instant via local,dukascopy,… chain.
 */

import fs from 'fs'
import { marketLocalEnabled } from './providers/marketLocalDb.mjs'
import { syncSymbolLocal } from './providers/marketLocalSync.mjs'
import { fillLocalGaps } from './providers/marketGapFill.mjs'

/** Ticks + second bars are synced unless MARKET_WARMUP_BARS_ONLY=1. */
function warmupBarsOnly() {
  const v = process.env.MARKET_WARMUP_BARS_ONLY?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function warmupGapFillEnabled() {
  const v = process.env.MARKET_WARMUP_GAP_FILL?.trim().toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'no'
}

export function isMarketWarmupEnabled() {
  const v = process.env.MARKET_WARMUP_SYNC?.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  if (v === '1' || v === 'true' || v === 'yes') return true
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_VOLUME_MOUNT_PATH ||
      (process.env.NODE_ENV === 'production' && fs.existsSync('/data')),
  )
}

/** @type {{ scheduledAt?: string; startedAt?: string; finishedAt?: string; symbols?: string[]; results?: Record<string, unknown> } | null} */
let lastWarmupRun = null
let warmupRunning = false
let failStreak = 0
/** @type {string | null} */
let nextRunAt = null
/** @type {ReturnType<typeof setTimeout> | null} */
let nextTimer = null

const MIN_MS = 60_000

/** Minutes between top-ups after a clean run (0 = only once at boot). */
function intervalMs() {
  const n = Number.parseInt(process.env.MARKET_WARMUP_INTERVAL_MIN || '60', 10)
  return Number.isFinite(n) && n > 0 ? n * MIN_MS : 0
}

/** First retry after a failed run; doubles per consecutive failure, capped at 6h. */
function failRetryMs() {
  const n = Number.parseInt(process.env.MARKET_WARMUP_RETRY_MIN || '15', 10)
  const base = (Number.isFinite(n) && n > 0 ? n : 15) * MIN_MS
  return Math.min(6 * 60 * MIN_MS, base * 2 ** Math.max(0, failStreak - 1))
}

/** Pause between runs while older gap days are still queued. */
function backlogMs() {
  const n = Number.parseInt(process.env.MARKET_WARMUP_BACKLOG_MIN || '10', 10)
  return (Number.isFinite(n) && n > 0 ? n : 10) * MIN_MS
}

export function getMarketWarmupStatus() {
  return {
    enabled: isMarketWarmupEnabled(),
    barsOnly: warmupBarsOnly(),
    gapFill: warmupGapFillEnabled(),
    missingOnly: process.env.MARKET_WARMUP_MISSING_ONLY?.trim().toLowerCase() !== '0',
    delayMs: Math.max(
      2000,
      Number.parseInt(process.env.MARKET_WARMUP_DELAY_MS || '8000', 10) || 8000,
    ),
    intervalMin: intervalMs() / MIN_MS,
    symbols: parseSymbols(),
    running: warmupRunning,
    failStreak,
    nextRunAt,
    lastRun: lastWarmupRun,
  }
}

function parseSymbols() {
  const raw =
    process.env.MARKET_SYNC_SYMBOLS?.trim() || 'XAUUSD,EURUSD,GBPUSD,USDJPY,BTCUSD,XAGUSD'
  return [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ]
}

function log(msg) {
  console.log(`[market-warmup] ${msg}`)
}

/**
 * Non-blocking: sync missing 1m bars (and optional ticks) after server listen.
 */
export function scheduleMarketWarmup() {
  if (!isMarketWarmupEnabled()) {
    log('disabled (set MARKET_WARMUP_SYNC=1 on Railway, or mount /data volume)')
    return
  }
  if (!marketLocalEnabled()) {
    log('skipped — local SQLite unavailable (better-sqlite3 or MARKET_LOCAL_FIRST=0)')
    return
  }

  const symbols = parseSymbols()
  const barsOnly = warmupBarsOnly()
  const missingOnly = process.env.MARKET_WARMUP_MISSING_ONLY?.trim().toLowerCase() !== '0'
  const delayMs = Math.max(
    2000,
    Number.parseInt(process.env.MARKET_WARMUP_DELAY_MS || '8000', 10) || 8000,
  )

  log(
    `scheduled in ${delayMs}ms for ${symbols.join(', ')} (bars-only=${barsOnly}, missing-only=${missingOnly}, every=${intervalMs() / MIN_MS || 'boot only'}min)`,
  )
  scheduleNext(delayMs, symbols, { barsOnly, missingOnly })
}

/**
 * @param {number} delayMs
 * @param {string[]} symbols
 * @param {{ barsOnly: boolean; missingOnly: boolean }} opts
 */
function scheduleNext(delayMs, symbols, opts) {
  if (nextTimer) clearTimeout(nextTimer)
  const scheduledAt = new Date().toISOString()
  nextRunAt = new Date(Date.now() + delayMs).toISOString()
  nextTimer = setTimeout(() => {
    nextTimer = null
    nextRunAt = null
    void (async () => {
      const { clean, more } = await runWarmupOnce(symbols, opts, scheduledAt)
      failStreak = clean ? 0 : failStreak + 1
      const every = intervalMs()
      if (!every && clean && !more) return
      const wait = !clean ? failRetryMs() : more ? backlogMs() : every
      const why = !clean ? `run had errors (streak ${failStreak}), retrying` : more ? 'gap backlog left, continuing' : 'next top-up'
      log(`${why} in ${Math.round(wait / MIN_MS)}min`)
      scheduleNext(wait, symbols, opts)
    })()
  }, delayMs)
  nextTimer.unref?.()
}

/**
 * @param {string[]} symbols
 * @param {{ barsOnly: boolean; missingOnly: boolean }} opts
 * @param {string} scheduledAt
 * @returns {Promise<{ clean: boolean; more: boolean }>} clean = no errors; more = gap backlog left
 */
async function runWarmupOnce(symbols, { barsOnly, missingOnly }, scheduledAt) {
  if (warmupRunning) return { clean: true, more: false }
  warmupRunning = true
  let clean = true
  let more = false
  lastWarmupRun = { scheduledAt, startedAt: new Date().toISOString(), symbols, results: {} }
  try {
    for (const symbol of symbols) {
      try {
        log(`sync start ${symbol}…`)
        const result = await syncSymbolLocal({
          symbol,
          onProgress: log,
          ticks: !barsOnly,
          bars: true,
          secondBars: !barsOnly,
          missingOnly,
        })
        const errors = result.errors ?? []
        if (errors.length) clean = false
        log(
          `sync done ${symbol}: ticks=${result.ticks ?? 0} bars=${JSON.stringify(result.bars ?? {})} errors=${errors.length}`,
        )
        lastWarmupRun.results[symbol] = {
          ticks: result.ticks ?? 0,
          bars: result.bars ?? {},
          errors: errors.length,
          errorMessages: errors.map((m) => String(m).slice(0, 300)),
        }
      } catch (e) {
        clean = false
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[market-warmup] ${symbol} failed:`, msg)
        lastWarmupRun.results[symbol] = { error: msg.slice(0, 300) }
      }

      if (!warmupGapFillEnabled()) continue
      try {
        const gaps = await fillLocalGaps({ symbol, onProgress: log, ticks: !barsOnly })
        if (gaps.aborted) clean = false
        if (gaps.remainingDays > 0 || gaps.aborted) more = true
        lastWarmupRun.results[symbol] = { ...lastWarmupRun.results[symbol], gaps }
      } catch (e) {
        clean = false
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[market-warmup] ${symbol} gap fill failed:`, msg)
        lastWarmupRun.results[symbol] = { ...lastWarmupRun.results[symbol], gapError: msg.slice(0, 300) }
      }
    }
  } finally {
    lastWarmupRun.finishedAt = new Date().toISOString()
    warmupRunning = false
  }
  return { clean, more }
}
