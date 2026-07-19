/**
 * Sync Dukascopy → local SQLite (Phase 1 profiles).
 * Uses dukascopy-node CLI by default (more reliable than getHistoricalRates on flaky networks).
 */

import { fetchDukascopyBars } from './dukascopy.mjs'
import { fetchDukascopyTicks } from './dukascopyTicks.mjs'
import { cliEnabled, fetchDukascopyViaCli } from './dukascopyCli.mjs'
import { normalizeDukascopyRows } from './dukascopy.mjs'
import { normalizeDukascopyTickRows } from './dukascopyTicks.mjs'
import { ticksToBarsBySeconds } from './tickAggregators.mjs'
import {
  countLocalBarsInRange,
  countLocalTicksInRange,
  getLocalStoreStats,
  insertBars,
  insertTicks,
  localChunkSatisfied,
  normalizeMarketSymbol,
  pruneLocalRetention,
  readLocalTicksBulk,
  recordSyncManifest,
} from './marketLocalDb.mjs'
import { LOCAL_SECOND_STEPS, secondStepToTimeframe } from './localSecondBars.mjs'

const DAY_SEC = 86_400

function maxTickChunkSec() {
  const syncChunk = Number.parseInt(process.env.MARKET_SYNC_TICK_CHUNK_SEC || '3600', 10)
  const apiMax = Number.parseInt(process.env.DUKASCOPY_MAX_TICK_RANGE_SEC || '21600', 10) || 21_600
  const chunk = Number.isFinite(syncChunk) && syncChunk > 0 ? syncChunk : 3600
  return Math.min(apiMax, Math.max(300, chunk))
}

/** Default Phase-1 retention windows for backfill (days). */
export function defaultSyncProfile() {
  return {
    ticksDays: Number.parseInt(process.env.MARKET_TICK_RETENTION_DAYS || '14', 10) || 14,
    m1Days: Number.parseInt(process.env.MARKET_BARS_1M_RETENTION_DAYS || '90', 10) || 90,
    h1Days: Number.parseInt(process.env.MARKET_BARS_H1_RETENTION_DAYS || '730', 10) || 730,
    d1Days: Number.parseInt(process.env.MARKET_BARS_D1_RETENTION_DAYS || '1825', 10) || 1825,
    mn1Days: Number.parseInt(process.env.MARKET_BARS_MN1_RETENTION_DAYS || '3650', 10) || 3650,
  }
}

function log(msg) {
  console.log(`[market-sync] ${msg}`)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * @param {number} startSec
 * @param {number} endSec
 * @param {number} chunkSec
 * @param {boolean} [newestFirst]
 */
function chunkRangeSec(startSec, endSec, chunkSec, newestFirst = false) {
  const chunks = []
  let cur = Math.floor(startSec)
  const end = Math.floor(endSec)
  while (cur < end) {
    const next = Math.min(end, cur + chunkSec)
    chunks.push({ startSec: cur, endSec: next })
    cur = next
  }
  if (newestFirst) chunks.reverse()
  return chunks
}

/** Calendar-day chunks (for CLI `-from` / `-to`). */
function chunkDays(startSec, endSec, daysPerChunk = 1, newestFirst = false) {
  const chunks = []
  let cur = Math.floor(startSec)
  const end = Math.floor(endSec)
  const span = Math.max(DAY_SEC, daysPerChunk * DAY_SEC)
  while (cur < end) {
    const next = Math.min(end, cur + span)
    chunks.push({ startSec: cur, endSec: next })
    cur = next
  }
  if (newestFirst) chunks.reverse()
  return chunks
}

/** UTC midnight-aligned single-day chunks (stable for missing-only checks). */
function chunkUtcCalendarDays(startSec, endSec, newestFirst = false) {
  const chunks = []
  const end = Math.floor(endSec)
  let dayStart = Math.floor(startSec / DAY_SEC) * DAY_SEC
  while (dayStart < end) {
    const dayEnd = Math.min(end, dayStart + DAY_SEC)
    if (dayEnd > dayStart) chunks.push({ startSec: dayStart, endSec: dayEnd })
    dayStart += DAY_SEC
  }
  if (newestFirst) chunks.reverse()
  return chunks
}

async function fetchTicksChunk(sym, startSec, endSec) {
  try {
    if (cliEnabled()) {
      const cli = await fetchDukascopyViaCli({
        symbol: sym,
        startSec,
        endSec,
        timeframe: 'tick',
      })
      if (cli.ok && Array.isArray(cli.rows)) {
        if (!cli.rows.length) return { ok: false, code: 'no_ticks', error: 'no ticks' }
        const ticks = normalizeDukascopyTickRows(cli.rows)
        if (ticks.length) return { ok: true, ticks, source: cli.source }
        return { ok: false, code: 'no_ticks', error: 'no ticks' }
      }
      if (cli.ok === false && cli.code !== 'cli_disabled') {
        return { ok: false, code: cli.code, error: cli.error }
      }
    }

    const apiRetries = Math.max(1, Number.parseInt(process.env.MARKET_SYNC_API_RETRIES || '3', 10) || 3)
    let lastErr = 'tick fetch failed'
    for (let attempt = 1; attempt <= apiRetries; attempt++) {
      const out = await fetchDukascopyTicks({
        symbol: sym,
        startSec,
        endSec,
        limit: 50_000,
      })
      if (out.ok && out.ticks?.length) return out
      lastErr = out.error || out.code || lastErr
      if (out.code === 'no_ticks') return out
      if (attempt < apiRetries) {
        await sleep(Math.min(30_000, 2000 * 2 ** (attempt - 1)))
      }
    }
    return { ok: false, code: 'network_error', error: lastErr }
  } catch (err) {
    return { ok: false, code: 'network_error', error: err instanceof Error ? err.message : String(err) }
  }
}

async function fetchBarsChunk(sym, timeframe, interval, startSec, endSec) {
  try {
    if (cliEnabled()) {
      const cli = await fetchDukascopyViaCli({
        symbol: sym,
        startSec,
        endSec,
        timeframe,
      })
      if (cli.ok && Array.isArray(cli.rows) && cli.rows.length) {
        const bars = normalizeDukascopyRows(cli.rows, startSec, endSec)
        if (bars.length >= 2) {
          return { ok: true, bars, source: cli.source }
        }
      }
      if (cli.ok === false && cli.code !== 'cli_disabled') {
        return { ok: false, error: cli.error || cli.code }
      }
    }

    const apiRetries = Math.max(1, Number.parseInt(process.env.MARKET_SYNC_API_RETRIES || '3', 10) || 3)
    let lastErr = 'bar fetch failed'
    for (let attempt = 1; attempt <= apiRetries; attempt++) {
      const out = await fetchDukascopyBars({
        symbol: sym,
        interval,
        startSec,
        endSec,
      })
      if (out.ok && out.bars?.length) return out
      lastErr = out.error || lastErr
      if (attempt < apiRetries) {
        await sleep(Math.min(30_000, 2000 * 2 ** (attempt - 1)))
      }
    }
    return { ok: false, error: lastErr }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * @param {string} symbol
 * @param {number} startSec
 * @param {number} endSec
 * @param {(msg: string) => void} [onProgress]
 * @param {{ missingOnly?: boolean }} [opts]
 */
export async function syncTicksRange(symbol, startSec, endSec, onProgress = log, opts = {}) {
  const sym = normalizeMarketSymbol(symbol)
  const missingOnly = opts.missingOnly === true
  let totalInserted = 0
  let failedChunks = 0
  let skippedChunks = 0

  const useCli = cliEnabled()
  const chunks = useCli
    ? chunkUtcCalendarDays(startSec, endSec, true)
    : chunkRangeSec(startSec, endSec, maxTickChunkSec(), true)

  for (const chunk of chunks) {
    if (missingOnly && localChunkSatisfied(sym, 'ticks', chunk.startSec, chunk.endSec)) {
      const have = countLocalTicksInRange(sym, chunk.startSec, chunk.endSec)
      skippedChunks += 1
      onProgress(
        `ticks ${sym} ${new Date(chunk.startSec * 1000).toISOString()} → ${new Date(chunk.endSec * 1000).toISOString()}… already have ${have} (skipped)`,
      )
      continue
    }

    onProgress(
      `ticks ${sym} ${new Date(chunk.startSec * 1000).toISOString()} → ${new Date(chunk.endSec * 1000).toISOString()}…`,
    )
    const out = await fetchTicksChunk(sym, chunk.startSec, chunk.endSec)
    if (!out.ok) {
      if (out.code === 'no_ticks') {
        onProgress(`  no ticks in chunk (skipped)`)
        continue
      }
      failedChunks += 1
      onProgress(`  chunk failed (${out.error || out.code}) — continuing`)
      continue
    }
    const n = insertTicks(sym, out.ticks)
    totalInserted += n
    onProgress(`  +${n} ticks (total ${totalInserted})`)
    recordSyncManifest({
      symbol: sym,
      dataKind: 'ticks',
      rangeStart: chunk.startSec,
      rangeEnd: chunk.endSec,
      rowCount: n,
    })
  }

  if (totalInserted < 1 && failedChunks > 0 && skippedChunks < chunks.length) {
    throw new Error(
      `All tick chunks failed (${failedChunks}). Check network/VPN or run: npm run market:sync:bars`,
    )
  }
  if (skippedChunks > 0) {
    onProgress(`ticks: ${skippedChunks} chunk(s) already present`)
  }
  if (failedChunks > 0) {
    onProgress(`ticks: ${failedChunks} chunk(s) failed; ${totalInserted} ticks stored`)
  }
  return totalInserted
}

function secondBarSyncChunks(startSec, endSec, stepSec) {
  const step = Math.max(1, Math.round(Number(stepSec) || 10))
  if (step <= 1) {
    return chunkRangeSec(startSec, endSec, 3600, true)
  }
  if (step <= 5) {
    return chunkRangeSec(startSec, endSec, 6 * 3600, true)
  }
  return chunkUtcCalendarDays(startSec, endSec, true)
}

function minTicksPerChunk() {
  return Math.max(1, Number.parseInt(process.env.MARKET_SYNC_MIN_TICKS_PER_CHUNK || '1000', 10) || 1000)
}

/**
 * Aggregate locally stored ticks into N-second OHLCV bars (s1, s5, s10, …).
 * @param {string} symbol
 * @param {number} stepSec
 * @param {number} startSec
 * @param {number} endSec
 * @param {(msg: string) => void} [onProgress]
 * @param {{ missingOnly?: boolean }} [opts]
 */
export async function syncSecondBarsRange(symbol, stepSec, startSec, endSec, onProgress = log, opts = {}) {
  const step = Math.max(1, Math.round(Number(stepSec) || 10))
  const tf = secondStepToTimeframe(step)
  const sym = normalizeMarketSymbol(symbol)
  const missingOnly = opts.missingOnly === true
  let totalInserted = 0
  let skippedChunks = 0
  let emptyChunks = 0
  const chunks = secondBarSyncChunks(startSec, endSec, step)

  for (const chunk of chunks) {
    if (missingOnly && localChunkSatisfied(sym, tf, chunk.startSec, chunk.endSec)) {
      const have = countLocalBarsInRange(sym, tf, chunk.startSec, chunk.endSec)
      skippedChunks += 1
      onProgress(
        `${tf} ${sym} ${new Date(chunk.startSec * 1000).toISOString()} → ${new Date(chunk.endSec * 1000).toISOString()}… already have ${have} (skipped)`,
      )
      continue
    }

    const tickCount = countLocalTicksInRange(sym, chunk.startSec, chunk.endSec)
    if (tickCount < minTicksPerChunk()) {
      emptyChunks += 1
      onProgress(
        `${tf} ${sym} ${new Date(chunk.startSec * 1000).toISOString()} → ${new Date(chunk.endSec * 1000).toISOString()}… only ${tickCount} ticks (skipped)`,
      )
      continue
    }

    onProgress(
      `${tf} ${sym} ${new Date(chunk.startSec * 1000).toISOString()} → ${new Date(chunk.endSec * 1000).toISOString()}… aggregating ${tickCount} ticks`,
    )
    const bulk = readLocalTicksBulk(sym, chunk.startSec, chunk.endSec)
    if (!bulk.ok || !bulk.ticks.length) {
      emptyChunks += 1
      onProgress(`  no local ticks for ${tf} aggregation`)
      continue
    }
    if (bulk.truncated) {
      onProgress(`  warning: tick read truncated at ${bulk.count} rows — ${tf} bars may be incomplete`)
    }

    const bars = ticksToBarsBySeconds(bulk.ticks, step)
    if (bars.length < 2) {
      emptyChunks += 1
      onProgress(`  too few ${tf} bars (${bars.length})`)
      continue
    }

    const n = insertBars(sym, tf, bars)
    totalInserted += n
    onProgress(`  +${n} ${tf} bars (total ${totalInserted})`)
    recordSyncManifest({
      symbol: sym,
      dataKind: `bars:${tf}`,
      rangeStart: chunk.startSec,
      rangeEnd: chunk.endSec,
      rowCount: n,
      source: 'local:ticks',
    })
  }

  if (skippedChunks > 0) {
    onProgress(`${tf}: ${skippedChunks} chunk(s) already present`)
  }
  if (emptyChunks > 0) {
    onProgress(`${tf}: ${emptyChunks} chunk(s) skipped (no/insufficient ticks)`)
  }
  return totalInserted
}

/**
 * @param {string} symbol
 * @param {number} startSec
 * @param {number} endSec
 * @param {(msg: string) => void} onProgress
 * @param {{ missingOnly?: boolean }} syncOpts
 * @param {number[]} [steps]
 */
async function syncSecondBarsForSteps(symbol, startSec, endSec, onProgress, syncOpts, steps = LOCAL_SECOND_STEPS, errors = null) {
  /** @type {Record<string, number>} */
  const out = {}
  for (const step of steps) {
    const tf = secondStepToTimeframe(step)
    try {
      out[tf] = await syncSecondBarsRange(symbol, step, startSec, endSec, onProgress, syncOpts)
    } catch (e) {
      const msg = `${tf}: ${e instanceof Error ? e.message : e}`
      if (errors) errors.push(msg)
      onProgress(`${tf} bars failed: ${msg}`)
    }
  }
  return out
}

function formatSecondBarStats(barCounts) {
  return LOCAL_SECOND_STEPS.map((s) => `${secondStepToTimeframe(s)}=${barCounts[secondStepToTimeframe(s)] ?? 0}`).join(
    ', ',
  )
}

/**
 * @param {string} symbol
 * @param {string} timeframe m1|h1|d1|mn1
 * @param {number} startSec
 * @param {number} endSec
 * @param {(msg: string) => void} [onProgress]
 * @param {{ missingOnly?: boolean }} [opts]
 */
export async function syncBarsRange(symbol, timeframe, startSec, endSec, onProgress = log, opts = {}) {
  const sym = normalizeMarketSymbol(symbol)
  const missingOnly = opts.missingOnly === true
  const interval =
    timeframe === 'm1' ? '1m' : timeframe === 'h1' ? '1h' : timeframe === 'd1' ? '1d' : '1M'

  const daysPerChunk =
    timeframe === 'm1' ? 7 : timeframe === 'h1' ? 90 : timeframe === 'd1' ? 365 : 3650

  let totalInserted = 0
  let failedChunks = 0
  let skippedChunks = 0
  const chunks = chunkDays(startSec, endSec, daysPerChunk, true)

  for (const chunk of chunks) {
    if (missingOnly && localChunkSatisfied(sym, timeframe, chunk.startSec, chunk.endSec)) {
      const have = countLocalBarsInRange(sym, timeframe, chunk.startSec, chunk.endSec)
      skippedChunks += 1
      onProgress(
        `bars ${sym} ${timeframe} ${new Date(chunk.startSec * 1000).toISOString()} → ${new Date(chunk.endSec * 1000).toISOString()}… already have ${have} (skipped)`,
      )
      continue
    }

    onProgress(
      `bars ${sym} ${timeframe} ${new Date(chunk.startSec * 1000).toISOString()} → ${new Date(chunk.endSec * 1000).toISOString()}…`,
    )

    const out = await fetchBarsChunk(sym, timeframe, interval, chunk.startSec, chunk.endSec)
    if (!out.ok || !out.bars?.length) {
      failedChunks += 1
      onProgress(`  chunk failed (${out.error || 'no bars'}) — continuing`)
      continue
    }
    const n = insertBars(sym, timeframe, out.bars)
    totalInserted += n
    onProgress(`  +${n} ${timeframe} bars (total ${totalInserted})`)
  }

  if (totalInserted < 1 && skippedChunks < chunks.length) {
    throw new Error(`All ${timeframe} bar chunks failed`)
  }
  if (skippedChunks > 0) {
    onProgress(`bars ${timeframe}: ${skippedChunks} chunk(s) already present`)
  }
  if (failedChunks > 0) {
    onProgress(`bars ${timeframe}: ${failedChunks} chunk(s) failed; ${totalInserted} bars stored`)
  }

  recordSyncManifest({
    symbol: sym,
    dataKind: `bars:${timeframe}`,
    rangeStart: startSec,
    rangeEnd: endSec,
    rowCount: totalInserted,
  })
  return totalInserted
}

/**
 * Full Phase-1 backfill for one symbol (default XAUUSD profile).
 * Bars sync first (faster/more reliable), then ticks.
 */
export async function syncSymbolLocal(opts = {}) {
  const symbol = normalizeMarketSymbol(opts.symbol || process.env.MARKET_SYNC_SYMBOLS?.split(',')[0] || 'XAUUSD')
  const profile = defaultSyncProfile()
  const onProgress = opts.onProgress || log
  const nowSec = Math.floor(Date.now() / 1000)
  const doTicks = opts.ticks !== false
  const doBars = opts.bars !== false
  const doSecondBars = opts.secondBars !== false
  const secondBarsOnly = opts.secondBarsOnly === true
  const missingOnly = opts.missingOnly === true
  const syncOpts = { missingOnly }
  const secondSteps =
    Array.isArray(opts.secondSteps) && opts.secondSteps.length
      ? opts.secondSteps.map((s) => Math.round(Number(s))).filter((s) => LOCAL_SECOND_STEPS.includes(s))
      : LOCAL_SECOND_STEPS

  onProgress(
    `Starting sync for ${symbol}… (cli=${cliEnabled() ? 'on' : 'off'}${missingOnly ? ', missing-only' : ''}${secondBarsOnly ? ', second-bars-only' : ''}${secondBarsOnly && secondSteps.length < LOCAL_SECOND_STEPS.length ? `, steps=${secondSteps.join(',')}s` : ''})`,
  )
  const results = { symbol, ticks: 0, bars: {}, errors: [] }

  if (secondBarsOnly) {
    const startSec = nowSec - profile.ticksDays * DAY_SEC
    Object.assign(
      results.bars,
      await syncSecondBarsForSteps(symbol, startSec, nowSec, onProgress, syncOpts, secondSteps, results.errors),
    )
    const pruned = pruneLocalRetention(symbol)
    onProgress(`Pruned old rows: ticks=${pruned.tickDeleted}, bars=${pruned.barDeleted}`)
    const stats = getLocalStoreStats(symbol)
    onProgress(
      `Done ${symbol}: ticks=${stats.tickCount}, ${formatSecondBarStats(stats.barCounts)}, m1=${stats.barCounts.m1}, h1=${stats.barCounts.h1}, d1=${stats.barCounts.d1}, mn1=${stats.barCounts.mn1}`,
    )
    return { ...results, stats, pruned }
  }

  if (doBars) {
    try {
      results.bars.m1 = await syncBarsRange(
        symbol,
        'm1',
        nowSec - profile.m1Days * DAY_SEC,
        nowSec,
        onProgress,
        syncOpts,
      )
    } catch (e) {
      results.errors.push(`m1: ${e instanceof Error ? e.message : e}`)
      onProgress(`m1 bars failed: ${results.errors[results.errors.length - 1]}`)
    }
    for (const tf of ['h1', 'd1', 'mn1']) {
      try {
        const days = profile[`${tf === 'mn1' ? 'mn1' : tf}Days`] ?? profile.d1Days
        results.bars[tf] = await syncBarsRange(
          symbol,
          tf,
          nowSec - days * DAY_SEC,
          nowSec,
          onProgress,
          syncOpts,
        )
      } catch (e) {
        results.errors.push(`${tf}: ${e instanceof Error ? e.message : e}`)
        onProgress(`${tf} bars failed: ${results.errors[results.errors.length - 1]}`)
      }
    }
  }

  if (doTicks) {
    try {
      const startSec = nowSec - profile.ticksDays * DAY_SEC
      results.ticks = await syncTicksRange(symbol, startSec, nowSec, onProgress, syncOpts)
      if (doSecondBars) {
        Object.assign(
          results.bars,
          await syncSecondBarsForSteps(
            symbol,
            startSec,
            nowSec,
            onProgress,
            syncOpts,
            secondSteps,
            results.errors,
          ),
        )
      }
    } catch (e) {
      results.errors.push(`ticks: ${e instanceof Error ? e.message : e}`)
      onProgress(`ticks failed: ${results.errors[results.errors.length - 1]}`)
    }
  } else if (doSecondBars) {
    const startSec = nowSec - profile.ticksDays * DAY_SEC
    Object.assign(
      results.bars,
      await syncSecondBarsForSteps(
        symbol,
        startSec,
        nowSec,
        onProgress,
        syncOpts,
        secondSteps,
        results.errors,
      ),
    )
  }

  const pruned = pruneLocalRetention(symbol)
  onProgress(`Pruned old rows: ticks=${pruned.tickDeleted}, bars=${pruned.barDeleted}`)

  const stats = getLocalStoreStats(symbol)
  onProgress(
    `Done ${symbol}: ticks=${stats.tickCount}, ${formatSecondBarStats(stats.barCounts)}, m1=${stats.barCounts.m1}, h1=${stats.barCounts.h1}, d1=${stats.barCounts.d1}, mn1=${stats.barCounts.mn1}`,
  )

  const hasData =
    stats.tickCount > 0 ||
    LOCAL_SECOND_STEPS.some((s) => (stats.barCounts[secondStepToTimeframe(s)] ?? 0) > 0) ||
    stats.barCounts.m1 > 0 ||
    stats.barCounts.h1 > 0 ||
    stats.barCounts.d1 > 0 ||
    stats.barCounts.mn1 > 0

  if (!hasData) {
    throw new Error(
      'No data was stored. Dukascopy may be unreachable — check VPN/firewall, then retry. Try: npm run market:sync -- --bars-only',
    )
  }

  if (results.errors.length) {
    onProgress(`Completed with warnings: ${results.errors.join('; ')}`)
  }

  return { ...results, stats, pruned }
}
