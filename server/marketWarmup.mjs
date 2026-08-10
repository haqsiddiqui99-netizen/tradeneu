/**
 * Background warm-up: sync Dukascopy → local SQLite on persistent volume (Railway /data).
 * Makes repeat chart loads instant via local,dukascopy,… chain.
 */

import fs from 'fs'
import { marketLocalEnabled } from './providers/marketLocalDb.mjs'
import { syncSymbolLocal } from './providers/marketLocalSync.mjs'

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

export function getMarketWarmupStatus() {
  return {
    enabled: isMarketWarmupEnabled(),
    barsOnly: process.env.MARKET_WARMUP_BARS_ONLY?.trim().toLowerCase() !== '0',
    missingOnly: process.env.MARKET_WARMUP_MISSING_ONLY?.trim().toLowerCase() !== '0',
    delayMs: Math.max(
      2000,
      Number.parseInt(process.env.MARKET_WARMUP_DELAY_MS || '8000', 10) || 8000,
    ),
    symbols: parseSymbols(),
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
  const barsOnly = process.env.MARKET_WARMUP_BARS_ONLY?.trim().toLowerCase() !== '0'
  const missingOnly = process.env.MARKET_WARMUP_MISSING_ONLY?.trim().toLowerCase() !== '0'
  const delayMs = Math.max(
    2000,
    Number.parseInt(process.env.MARKET_WARMUP_DELAY_MS || '8000', 10) || 8000,
  )

  lastWarmupRun = { scheduledAt: new Date().toISOString(), symbols }
  log(`scheduled in ${delayMs}ms for ${symbols.join(', ')} (bars-only=${barsOnly}, missing-only=${missingOnly})`)

  setTimeout(() => {
    void (async () => {
      lastWarmupRun = { ...lastWarmupRun, startedAt: new Date().toISOString(), symbols, results: {} }
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
          log(
            `sync done ${symbol}: ticks=${result.ticks ?? 0} bars=${JSON.stringify(result.bars ?? {})} errors=${result.errors?.length ?? 0}`,
          )
          if (lastWarmupRun?.results) {
            lastWarmupRun.results[symbol] = {
              ticks: result.ticks ?? 0,
              bars: result.bars ?? {},
              errors: result.errors?.length ?? 0,
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.warn(`[market-warmup] ${symbol} failed:`, msg)
          if (lastWarmupRun?.results) {
            lastWarmupRun.results[symbol] = { error: msg }
          }
        }
      }
      if (lastWarmupRun) lastWarmupRun.finishedAt = new Date().toISOString()
    })()
  }, delayMs)
}
