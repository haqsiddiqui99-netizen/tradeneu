/**
 * Background warm-up: sync Dukascopy → local SQLite on persistent volume (Railway /data).
 * Makes repeat chart loads instant via local,dukascopy,… chain.
 */

import fs from 'fs'
import { marketLocalEnabled } from './providers/marketLocalDb.mjs'
import { syncSymbolLocal } from './providers/marketLocalSync.mjs'

function warmupEnabled() {
  const v = process.env.MARKET_WARMUP_SYNC?.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  if (v === '1' || v === 'true' || v === 'yes') return true
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_VOLUME_MOUNT_PATH ||
      (process.env.NODE_ENV === 'production' && fs.existsSync('/data')),
  )
}

function parseSymbols() {
  const raw = process.env.MARKET_SYNC_SYMBOLS?.trim() || 'XAUUSD'
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
  if (!warmupEnabled()) return
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

  log(`scheduled in ${delayMs}ms for ${symbols.join(', ')} (bars-only=${barsOnly}, missing-only=${missingOnly})`)

  setTimeout(() => {
    void (async () => {
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
        } catch (e) {
          console.warn(`[market-warmup] ${symbol} failed:`, e?.message || e)
        }
      }
    })()
  }, delayMs)
}
