/**
 * Sync Dukascopy market data into local SQLite.
 *
 * Usage:
 *   npm run market:sync
 *   npm run market:sync:bars
 *   npm run market:sync:ticks
 *   npm run market:sync:ticks:missing
 *   npm run market:sync:10s
 *   npm run market:sync:seconds
 *   npm run market:sync -- --symbol XAUUSD --missing-only
 *   npm run market:sync:bars -- --symbol EURUSD
 *
 * Symbols: MARKET_SYNC_SYMBOLS=XAUUSD,EURUSD,… (all synced unless --symbol set)
 * Env: MARKET_DB_PATH, MARKET_*_RETENTION_DAYS (see .env.local.example)
 */

import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { closeMarketStore, initMarketStore, marketDbPath, marketStoreBackend } from '../server/providers/marketStore.mjs'
import { syncSymbolLocal } from '../server/providers/marketLocalSync.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Load `.env.local` (same as historicGoldApi). */
function loadEnvLocal() {
  const envPath = path.join(root, '.env.local')
  try {
    if (!fs.existsSync(envPath)) return
    const text = fs.readFileSync(envPath, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (process.env[key] === undefined || process.env[key] === '') process.env[key] = val
    }
  } catch {
    /* ignore */
  }
}

function parseSymbolsFromEnv() {
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

function parseArgs(argv) {
  const out = {
    /** When set, sync only this symbol; otherwise all MARKET_SYNC_SYMBOLS. */
    symbol: /** @type {string | null} */ (null),
    ticksOnly: false,
    barsOnly: false,
    secondBarsOnly: false,
    missingOnly: false,
    secondSteps: /** @type {number[] | null} */ (null),
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--symbol') out.symbol = String(argv[++i] || '').trim().toUpperCase() || null
    else if (a === '--ticks-only') out.ticksOnly = true
    else if (a === '--bars-only') out.barsOnly = true
    else if (a === '--second-bars-only') out.secondBarsOnly = true
    else if (a === '--missing-only') out.missingOnly = true
    else if (a === '--second-step') {
      const v = Number.parseInt(String(argv[++i] || ''), 10)
      if (Number.isFinite(v)) {
        if (!out.secondSteps) out.secondSteps = []
        out.secondSteps.push(v)
      }
    } else if (a.startsWith('--second-step=')) {
      const v = Number.parseInt(a.slice('--second-step='.length), 10)
      if (Number.isFinite(v)) {
        if (!out.secondSteps) out.secondSteps = []
        out.secondSteps.push(v)
      }
    } else if (a === '--help' || a === '-h') {
      console.log(
        `Usage: npm run market:sync [-- --symbol XAUUSD] [--ticks-only] [--bars-only] [--second-bars-only] [--second-step=10] [--missing-only]`,
      )
      process.exit(0)
    }
  }
  return out
}

async function main() {
  loadEnvLocal()
  const args = parseArgs(process.argv)
  const symbols = args.symbol ? [args.symbol] : parseSymbolsFromEnv()
  if (!symbols.length) {
    console.error('[market-sync] No symbols to sync (set MARKET_SYNC_SYMBOLS or --symbol)')
    process.exitCode = 1
    return
  }

  console.log(`[market-sync] backend: ${marketStoreBackend()}, path: ${marketStoreBackend() === 'sqlite' ? marketDbPath() : '(timescale)'}`)
  console.log(`[market-sync] Symbols: ${symbols.join(', ')}`)
  if (args.missingOnly) console.log('[market-sync] Mode: missing-only (skip chunks already in SQLite)')
  if (args.secondBarsOnly) {
    console.log(
      `[market-sync] Mode: second-bars-only (aggregate s* from local ticks${args.secondSteps?.length ? `, steps=${args.secondSteps.join(',')}s` : ', all steps'})`,
    )
  }

  const started = Date.now()
  let failed = 0
  try {
    await initMarketStore()
    for (const symbol of symbols) {
      console.log(`[market-sync] ——— ${symbol} ———`)
      try {
        await syncSymbolLocal({
          symbol,
          ticks: !args.barsOnly && !args.secondBarsOnly,
          bars: !args.ticksOnly && !args.secondBarsOnly,
          secondBarsOnly: args.secondBarsOnly,
          secondBars: !args.barsOnly,
          secondSteps: args.secondSteps ?? undefined,
          missingOnly: args.missingOnly,
        })
      } catch (err) {
        failed += 1
        console.error(
          `[market-sync] Failed ${symbol}:`,
          err instanceof Error ? err.message : err,
        )
      }
    }
    const elapsed = Math.round((Date.now() - started) / 1000)
    console.log(
      `[market-sync] Completed in ${elapsed}s (${symbols.length - failed}/${symbols.length} symbols ok)`,
    )
    if (failed) process.exitCode = 1
  } catch (err) {
    console.error('[market-sync] Failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await closeMarketStore()
  }
}

main()
