/**
 * Gap repair for the local SQLite store.
 *
 * Chunk-level "missing-only" sync treats a 7-day m1 chunk as present once it holds a few
 * hundred bars, so partial weeks never refill. This pass works per UTC day instead: it
 * compares each day's stored minutes with the hours the market was open, refetches only
 * the short days, then repairs h1 / d1 / ticks / second bars for the same days.
 *
 * Days that were refetched and are still short (holidays, flat minutes) are recorded in
 * sync_manifest as `gapcheck:<kind>` so they are not downloaded again every run.
 */

import {
  getMarketDb,
  insertBars,
  insertTicks,
  normalizeMarketSymbol,
  pruneLocalRetention,
  recordSyncManifest,
} from './marketLocalDb.mjs'
import { defaultSyncProfile, fetchBarsChunk, syncSecondBarsRange, syncTicksRange } from './marketLocalSync.mjs'
import { LOCAL_SECOND_STEPS } from './localSecondBars.mjs'
import fs from 'fs'
import {
  S3_FATAL_ERROR,
  dukascopyS3Enabled,
  fetchS3DayTicks,
  isDayArchived,
  s3HasInstrument,
  tickArchiveDir,
  tickArchiveEnabled,
  ticksToBidBars,
} from './dukascopyS3.mjs'

const DAY_SEC = 86_400
const HOUR_SEC = 3600

const WEEKEND_SYMBOLS = /^(BTC|ETH|LTC|XRP|SOL|ADA|DOGE|BCH|DOT|LINK)/

const TRANSIENT_ERROR = /status \d{3}|timed out|timeout|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|network|fetch failed/i

function envInt(key, fallback, min = 0) {
  const n = Number.parseInt(process.env[key] ?? '', 10)
  return Number.isFinite(n) && n >= min ? n : fallback
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function iso(sec) {
  return new Date(sec * 1000).toISOString().slice(0, 10)
}

function floorDay(sec) {
  return Math.floor(sec / DAY_SEC) * DAY_SEC
}

/** Minimum Dukascopy hourly files expected for a UTC day when the store has no better signal. */
function floorHours(sym, dayStart) {
  if (WEEKEND_SYMBOLS.test(sym)) return 20
  const dow = new Date(dayStart * 1000).getUTCDay()
  if (dow === 0 || dow === 6) return 0
  return dow === 5 ? 20 : 22
}

/** @returns {Map<number, { n: number; hours: number }>} keyed by UTC day start */
function barDailyCoverage(sym, tf, startSec, endSec) {
  const rows = getMarketDb()
    .prepare(
      `SELECT (time_sec / ${DAY_SEC}) * ${DAY_SEC} AS day, COUNT(*) AS n, COUNT(DISTINCT time_sec / ${HOUR_SEC}) AS hours
       FROM bars WHERE symbol = ? AND timeframe = ? AND time_sec >= ? AND time_sec < ?
       GROUP BY day`,
    )
    .all(sym, tf, startSec, endSec)
  return new Map(rows.map((r) => [r.day, { n: r.n, hours: r.hours }]))
}

/** @returns {Map<number, { n: number; hours: number }>} */
function tickDailyCoverage(sym, startSec, endSec) {
  const rows = getMarketDb()
    .prepare(
      `SELECT (time_ms / ${DAY_SEC * 1000}) * ${DAY_SEC} AS day, COUNT(*) AS n, COUNT(DISTINCT time_ms / ${HOUR_SEC * 1000}) AS hours
       FROM ticks WHERE symbol = ? AND time_ms >= ? AND time_ms < ?
       GROUP BY day`,
    )
    .all(sym, startSec * 1000, endSec * 1000)
  return new Map(rows.map((r) => [r.day, { n: r.n, hours: r.hours }]))
}

function firstBarSec(sym, tf) {
  const row = getMarketDb()
    .prepare(`SELECT MIN(time_sec) AS s FROM bars WHERE symbol = ? AND timeframe = ?`)
    .get(sym, tf)
  return row?.s ?? null
}

/** @returns {Map<number, number>} day start → row count when last verified */
function verifiedDays(sym, kind) {
  const rows = getMarketDb()
    .prepare(`SELECT range_start AS day, row_count AS n FROM sync_manifest WHERE symbol = ? AND data_kind = ?`)
    .all(sym, `gapcheck:${kind}`)
  return new Map(rows.map((r) => [r.day, r.n]))
}

function markVerified(sym, kind, day, n) {
  recordSyncManifest({
    symbol: sym,
    dataKind: `gapcheck:${kind}`,
    rangeStart: day,
    rangeEnd: day + DAY_SEC,
    rowCount: n,
    source: 'gap-fill',
  })
}

/** A verified day is only rechecked when rows were lost since the check. */
function stillVerified(verified, day, haveN) {
  const prev = verified.get(day)
  return prev != null && haveN >= prev
}

/**
 * Merge descending day starts into ranges spanning at most `maxDays`.
 * `contiguous` keeps m1 downloads to the gap days only; h1/d1 files are cheap, so scattered
 * days within the span share one request.
 * @param {number[]} days newest first
 */
function groupDays(days, maxDays, contiguous = true) {
  /** @type {{ days: number[]; startSec: number; endSec: number }[]} */
  const ranges = []
  for (const day of days) {
    const cur = ranges[ranges.length - 1]
    const fits = cur && (contiguous ? cur.startSec - day === DAY_SEC : cur.endSec - day < maxDays * DAY_SEC)
    if (fits && cur.days.length < maxDays) {
      cur.days.push(day)
      cur.startSec = day
    } else {
      ranges.push({ days: [day], startSec: day, endSec: day + DAY_SEC - 1 })
    }
  }
  return ranges
}

function createThrottle(onProgress) {
  const maxStreak = envInt('MARKET_SYNC_MAX_CONSECUTIVE_FAILS', 4, 0) || Number.POSITIVE_INFINITY
  const basePause = envInt('MARKET_SYNC_FAIL_PAUSE_MS', 5000, 0)
  const state = { streak: 0, failures: 0, aborted: false, lastError: '' }

  /**
   * @template {{ ok?: boolean; error?: string }} T
   * @param {string} label
   * @param {() => Promise<T>} fn
   * @param {{ anyFailureTransient?: boolean }} [mode] S3: every non-fatal failure is retryable
   * @returns {Promise<T & { transient?: boolean }>}
   */
  async function attempt(label, fn, mode = {}) {
    let out
    try {
      out = await fn()
    } catch (e) {
      out = /** @type {T} */ ({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
    if (out.ok) {
      state.streak = 0
      return out
    }
    const reason = out.error || 'no data'
    if (out.fatal) {
      state.aborted = true
      state.lastError = `${label}: ${reason}`
      onProgress(`  ${label} failed (${reason}) — check AWS credentials / bucket access, stopping`)
      return { ...out, transient: true }
    }
    if (!mode.anyFailureTransient && !TRANSIENT_ERROR.test(reason)) return out
    state.streak += 1
    state.failures += 1
    state.lastError = `${label}: ${reason}`
    if (state.streak >= maxStreak) {
      state.aborted = true
      onProgress(`  ${label} failed (${reason}) — ${state.streak} failures in a row, stopping until next run`)
    } else {
      const pauseMs = Math.min(60_000, basePause * state.streak)
      onProgress(`  ${label} failed (${reason}) — waiting ${Math.round(pauseMs / 1000)}s`)
      await sleep(pauseMs)
    }
    return { ...out, transient: true }
  }

  return { state, attempt }
}

/**
 * Find UTC days whose m1 coverage is short of the hours the market traded.
 * @returns {number[]} day starts, newest first
 */
export function findM1GapDays(sym, startSec, scanEnd) {
  const minPerHour = envInt('MARKET_GAP_MIN_BARS_PER_HOUR', 30, 1)
  const allowedShort = envInt('MARKET_GAP_MAX_SHORT_HOURS', 1, 0)
  const hourRows = getMarketDb()
    .prepare(
      `SELECT time_sec / ${HOUR_SEC} AS hr, COUNT(*) AS n FROM bars
       WHERE symbol = ? AND timeframe = 'm1' AND time_sec >= ? AND time_sec < ?
       GROUP BY hr`,
    )
    .all(sym, startSec, scanEnd)
  /** @type {Map<number, number[]>} day start → bars per UTC hour */
  const byDay = new Map()
  for (const r of hourRows) {
    const day = floorDay(r.hr * HOUR_SEC)
    let hours = byDay.get(day)
    if (!hours) byDay.set(day, (hours = new Array(24).fill(0)))
    hours[r.hr - day / HOUR_SEC] = r.n
  }
  const verified = verifiedDays(sym, 'm1')
  const gaps = []
  for (let day = floorDay(startSec); day < scanEnd; day += DAY_SEC) {
    const hours = byDay.get(day) ?? new Array(24).fill(0)
    const have = hours.reduce((a, b) => a + b, 0)
    if (stillVerified(verified, day, have)) continue
    const elapsedHours = Math.min(24, Math.floor((scanEnd - day) / HOUR_SEC))
    let floor = floorHours(sym, day)
    if (scanEnd - day < DAY_SEC) floor = Math.max(0, Math.min(floor, elapsedHours - 2))
    const dataHours = hours.filter((n) => n > 0).length
    // Day started late or ended early. Stored h1 is not used here: Dukascopy h1/d1 include
    // flat placeholder bars for closed hours (weekends, Friday evening).
    if (dataHours < Math.min(elapsedHours, floor)) {
      gaps.push(day)
      continue
    }
    // Hole inside the day: a missing or half-empty hour between the first and last traded hour.
    const first = hours.findIndex((n) => n > 0)
    const last = 23 - [...hours].reverse().findIndex((n) => n > 0)
    let short = 0
    for (let h = first + 1; h < last; h++) if (hours[h] < minPerHour) short += 1
    if (first >= 0 && short > allowedShort) gaps.push(day)
  }
  return gaps.reverse()
}

/**
 * Repair missing m1 / h1 / d1 bars and (optionally) ticks + second bars for one symbol.
 * @param {{ symbol: string; onProgress?: (msg: string) => void; ticks?: boolean; dryRun?: boolean }} opts
 */
export async function fillLocalGaps(opts) {
  const sym = normalizeMarketSymbol(opts.symbol)
  const onProgress = opts.onProgress || ((m) => console.log(`[market-gaps] ${m}`))
  const profile = defaultSyncProfile()
  const nowSec = Math.floor(Date.now() / 1000)
  /** Dukascopy publishes an hour's file after it closes; leave the current + previous hour alone. */
  const scanEnd = Math.floor(nowSec / HOUR_SEC) * HOUR_SEC - HOUR_SEC
  const maxDays = envInt('MARKET_GAP_MAX_DAYS_PER_RUN', 30, 1)
  const { state, attempt } = createThrottle(onProgress)
  const result = {
    symbol: sym,
    m1: { gapDays: 0, repairedDays: 0, bars: 0 },
    h1: { gapDays: 0, bars: 0 },
    d1: { gapDays: 0, bars: 0 },
    ticks: { gapDays: 0, ticks: 0 },
    remainingDays: 0,
    source: 'datafeed',
    aborted: false,
    lastError: '',
  }

  const windowStart = nowSec - profile.m1Days * DAY_SEC
  const first = firstBarSec(sym, 'm1')
  const startSec = floorDay(first != null ? Math.max(windowStart, first) : windowStart)

  // m1 — the base everything else is checked against.
  const m1Gaps = findM1GapDays(sym, startSec, scanEnd)
  result.m1.gapDays = m1Gaps.length
  const m1Todo = m1Gaps.slice(0, maxDays)
  result.remainingDays = m1Gaps.length - m1Todo.length
  onProgress(
    `${sym} m1: ${m1Gaps.length} day(s) with gaps since ${iso(startSec)}${result.remainingDays ? ` (repairing newest ${m1Todo.length})` : ''}`,
  )
  if (opts.dryRun && m1Gaps.length) {
    onProgress(`  newest gap days: ${m1Gaps.slice(0, 15).map(iso).join(', ')}${m1Gaps.length > 15 ? ', …' : ''}`)
  }

  const useS3 = await resolveS3(sym, state, onProgress)
  result.source = useS3 ? 's3' : 'datafeed'
  /** First whole UTC day inside the tick retention, so pruning never leaves a half day to refetch. */
  const tickStart = floorDay(nowSec - profile.ticksDays * DAY_SEC) + DAY_SEC
  const settleSec = envInt('DUKASCOPY_S3_SETTLE_DAYS', 7, 0) * DAY_SEC

  /** One archive day → m1/h1/d1 (+ ticks and second bars inside the tick window). */
  async function importS3Day(day) {
    const label = `s3 ${iso(day)}`
    const out = await attempt(label, () => fetchS3DayTicks(sym, day), { anyFailureTransient: true })
    if (out.transient || !out.ok) return false
    const complete = day + DAY_SEC <= scanEnd
    const ticks = out.ticks.filter((t) => t.timeMs >= day * 1000 && t.timeMs < (day + DAY_SEC) * 1000)
    if (!ticks.length) {
      // A missing file means no trading, but only trust that once the archive has had time to catch up.
      if (complete && nowSec - (day + DAY_SEC) > settleSec) markVerified(sym, 'm1', day, 0)
      onProgress(`  ${label}: no ticks${complete && nowSec - (day + DAY_SEC) > settleSec ? ' (marked checked)' : ''}`)
      return true
    }
    const m1 = insertBars(sym, 'm1', ticksToBidBars(ticks, 60))
    result.m1.bars += m1
    result.h1.bars += insertBars(sym, 'h1', ticksToBidBars(ticks, 3600))
    result.d1.bars += insertBars(sym, 'd1', ticksToBidBars(ticks, DAY_SEC))
    let tickNote = ''
    if (opts.ticks && day >= tickStart) {
      const n = insertTicks(sym, ticks)
      result.ticks.ticks += n
      await rebuildSecondBars(sym, day, Math.min(day + DAY_SEC, scanEnd), onProgress)
      tickNote = `, ${n} ticks`
      if (complete) markVerified(sym, 'ticks', day, n)
    }
    if (complete) markVerified(sym, 'm1', day, barDailyCoverage(sym, 'm1', day, day + DAY_SEC).get(day)?.n ?? 0)
    onProgress(`  ${label}: +${m1} m1${tickNote}`)
    return true
  }

  for (const day of opts.dryRun || !useS3 ? [] : m1Todo) {
    if (state.aborted) break
    if (await importS3Day(day)) result.m1.repairedDays += 1
  }

  for (const range of opts.dryRun || useS3 ? [] : groupDays(m1Todo, 7)) {
    if (state.aborted) break
    const label = `m1 ${iso(range.startSec)}→${iso(range.endSec)}`
    onProgress(`${label}…`)
    const out = await attempt(label, () => fetchBarsChunk(sym, 'm1', '1m', range.startSec, range.endSec))
    if (out.transient) continue
    if (out.ok && out.bars?.length) {
      const n = insertBars(sym, 'm1', out.bars)
      result.m1.bars += n
      onProgress(`  +${n} m1 bars`)
    } else {
      onProgress(`  no m1 bars (${out.error || 'empty'}) — marking checked`)
    }
    const cov = barDailyCoverage(sym, 'm1', range.startSec, range.endSec + 1)
    for (const day of range.days) {
      if (day + DAY_SEC <= scanEnd) markVerified(sym, 'm1', day, cov.get(day)?.n ?? 0)
    }
    result.m1.repairedDays += range.days.length
  }

  // h1 — any day with fewer hourly bars than hours present in m1.
  if (!state.aborted) {
    const m1Cov = barDailyCoverage(sym, 'm1', startSec, scanEnd)
    const h1Cov = barDailyCoverage(sym, 'h1', startSec, scanEnd)
    const verified = verifiedDays(sym, 'h1')
    const days = [...m1Cov.entries()]
      .filter(([day, m]) => {
        const have = h1Cov.get(day)?.n ?? 0
        return have < m.hours && !stillVerified(verified, day, have)
      })
      .map(([day]) => day)
      .sort((a, b) => b - a)
    result.h1.gapDays = days.length
    if (days.length) onProgress(`${sym} h1: ${days.length} day(s) with missing hours`)
    if (useS3 && !opts.dryRun) {
      result.h1.bars += rebuildFromM1(sym, 'h1', days)
      for (const day of days) {
        if (day + DAY_SEC <= scanEnd) markVerified(sym, 'h1', day, barDailyCoverage(sym, 'h1', day, day + DAY_SEC).get(day)?.n ?? 0)
      }
    }
    for (const range of groupDays(days, 31, false).slice(0, opts.dryRun || useS3 ? 0 : 12)) {
      if (state.aborted) break
      const label = `h1 ${iso(range.startSec)}→${iso(range.endSec)}`
      const out = await attempt(label, () =>
        fetchBarsChunk(sym, 'h1', '1h', range.startSec - DAY_SEC, range.endSec),
      )
      if (out.transient) continue
      if (out.ok && out.bars?.length) result.h1.bars += insertBars(sym, 'h1', out.bars)
      const cov = barDailyCoverage(sym, 'h1', range.startSec, range.endSec + 1)
      for (const day of range.days) {
        if (day + DAY_SEC <= scanEnd) markVerified(sym, 'h1', day, cov.get(day)?.n ?? 0)
      }
    }
  }

  // d1 — any traded day without a daily bar.
  if (!state.aborted) {
    const m1Cov = barDailyCoverage(sym, 'm1', startSec, scanEnd)
    const d1Cov = barDailyCoverage(sym, 'd1', startSec - DAY_SEC, scanEnd)
    const verified = verifiedDays(sym, 'd1')
    const days = [...m1Cov.keys()]
      .filter((day) => {
        const have = d1Cov.get(day)?.n ?? 0
        return have < 1 && !stillVerified(verified, day, have)
      })
      .sort((a, b) => b - a)
    result.d1.gapDays = days.length
    if (days.length) onProgress(`${sym} d1: ${days.length} day(s) without a daily bar`)
    if (useS3 && !opts.dryRun) {
      result.d1.bars += rebuildFromM1(sym, 'd1', days)
      for (const day of days) {
        if (day + DAY_SEC <= scanEnd) markVerified(sym, 'd1', day, barDailyCoverage(sym, 'd1', day, day + DAY_SEC).get(day)?.n ?? 0)
      }
    }
    for (const range of groupDays(days, 366, false).slice(0, opts.dryRun || useS3 ? 0 : 6)) {
      if (state.aborted) break
      const label = `d1 ${iso(range.startSec)}→${iso(range.endSec)}`
      const out = await attempt(label, () =>
        fetchBarsChunk(sym, 'd1', '1d', range.startSec - 7 * DAY_SEC, range.endSec),
      )
      if (out.transient) continue
      if (out.ok && out.bars?.length) result.d1.bars += insertBars(sym, 'd1', out.bars)
      const cov = barDailyCoverage(sym, 'd1', range.startSec, range.endSec + 1)
      for (const day of range.days) {
        if (day + DAY_SEC <= scanEnd) markVerified(sym, 'd1', day, cov.get(day)?.n ?? 0)
      }
    }
  }

  // Ticks + second bars — inside the tick retention window, any hour present in m1 but not in ticks.
  if (opts.ticks && !state.aborted) {
    const m1Cov = barDailyCoverage(sym, 'm1', tickStart, scanEnd)
    const tickCov = tickDailyCoverage(sym, tickStart, scanEnd)
    const verified = verifiedDays(sym, 'ticks')
    const days = [...m1Cov.entries()]
      .filter(([day, m]) => {
        const have = tickCov.get(day) ?? { n: 0, hours: 0 }
        return have.hours < m.hours && !stillVerified(verified, day, have.n)
      })
      .map(([day]) => day)
      .sort((a, b) => b - a)
    result.ticks.gapDays = days.length
    if (days.length) onProgress(`${sym} ticks: ${days.length} day(s) with missing hours`)
    for (const day of days.slice(0, opts.dryRun ? 0 : maxDays)) {
      if (state.aborted) break
      if (useS3) {
        await importS3Day(day)
        continue
      }
      const dayEnd = Math.min(day + DAY_SEC, scanEnd)
      const label = `ticks ${iso(day)}`
      const out = await attempt(label, async () => {
        const n = await syncTicksRange(sym, day, dayEnd, onProgress, { missingOnly: false })
        return { ok: true, n }
      })
      if (out.transient) continue
      if (out.ok) result.ticks.ticks += out.n ?? 0
      await rebuildSecondBars(sym, day, dayEnd, onProgress)
      if (day + DAY_SEC <= scanEnd) markVerified(sym, 'ticks', day, tickDailyCoverage(sym, day, day + DAY_SEC).get(day)?.n ?? 0)
    }
  }

  if (opts.ticks && useS3 && tickArchiveEnabled() && !state.aborted) {
    result.tickArchive = await backfillTickArchive(sym, { scanEnd, nowSec, settleSec, attempt, state, onProgress, dryRun: opts.dryRun })
  }

  // Ticks and second bars only live in SQLite for MARKET_TICK_RETENTION_DAYS; older ones are in the tick archive.
  if (!opts.dryRun) result.pruned = pruneLocalRetention(sym)

  result.aborted = state.aborted
  result.lastError = state.lastError
  const ta = result.tickArchive
  const pr = result.pruned
  onProgress(
    `${sym} gaps done (${result.source}): m1 +${result.m1.bars} (${result.m1.repairedDays}/${result.m1.gapDays} days), h1 +${result.h1.bars}, d1 +${result.d1.bars}, ticks +${result.ticks.ticks}${ta ? `, tick files +${ta.savedDays} (${ta.remainingDays} days left)` : ''}${pr ? `, pruned ticks ${pr.tickDeleted} / bars ${pr.barDeleted}` : ''}${state.aborted ? ` — stopped early: ${state.lastError}` : ''}`,
  )
  return result
}

/**
 * Download whole days into the on-volume tick archive, newest first, back MARKET_TICK_ARCHIVE_YEARS.
 * Days with no archive file are recorded as `gapcheck:tickfile` once settled so they are asked for once.
 */
async function backfillTickArchive(sym, { scanEnd, nowSec, settleSec, attempt, state, onProgress, dryRun }) {
  const years = envInt('MARKET_TICK_ARCHIVE_YEARS', 10, 0)
  const perRun = envInt('MARKET_TICK_ARCHIVE_MAX_DAYS_PER_RUN', 240, 1)
  const minFreeBytes = envInt('MARKET_TICK_ARCHIVE_MIN_FREE_GB', 2, 0) * 1024 ** 3
  const out = { missingDays: 0, savedDays: 0, emptyDays: 0, bytes: 0, remainingDays: 0, stoppedForDisk: false }
  if (!years) return out
  const startDay = floorDay(nowSec - Math.round(years * 365.25) * DAY_SEC)
  const checked = verifiedDays(sym, 'tickfile')
  const todo = []
  for (let day = floorDay(scanEnd) - DAY_SEC; day >= startDay; day -= DAY_SEC) {
    if (!checked.has(day) && !isDayArchived(sym, day)) todo.push(day)
  }
  out.missingDays = todo.length
  out.remainingDays = todo.length
  if (!todo.length) return out
  onProgress(`${sym} tick archive: ${todo.length} day(s) to download since ${iso(startDay)}${dryRun ? '' : ` (up to ${perRun} this run)`}`)
  if (dryRun) return out

  for (const day of todo.slice(0, perRun)) {
    if (state.aborted) break
    if (minFreeBytes && (await freeBytes(tickArchiveDir())) < minFreeBytes) {
      out.stoppedForDisk = true
      onProgress(`  tick archive paused: less than ${minFreeBytes / 1024 ** 3} GB free on the volume`)
      break
    }
    const res = await attempt(`tick file ${iso(day)}`, () => fetchS3DayTicks(sym, day), { anyFailureTransient: true })
    if (res.transient || !res.ok) continue
    out.remainingDays -= 1
    if (res.files) {
      out.savedDays += 1
      out.bytes += res.bytes
    } else if (!res.cached) {
      out.emptyDays += 1
      if (nowSec - (day + DAY_SEC) > settleSec) markVerified(sym, 'tickfile', day, 0)
    }
  }
  if (out.savedDays || out.emptyDays) {
    onProgress(`  tick archive: +${out.savedDays} day(s), ${(out.bytes / 1024 ** 2).toFixed(1)} MB, ${out.emptyDays} without trading`)
  }
  return out
}

/** Free space on the volume holding `dir` (Infinity when it cannot be measured). */
async function freeBytes(dir) {
  try {
    await fs.promises.mkdir(dir, { recursive: true })
    const s = await fs.promises.statfs(dir)
    return Number(s.bavail) * Number(s.bsize)
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

/**
 * Use the S3 archive when credentials are set and it carries the symbol.
 * A missing folder falls back to the datafeed instead of marking every day as checked-empty.
 */
async function resolveS3(sym, state, onProgress) {
  if (!dukascopyS3Enabled()) return false
  try {
    if (await s3HasInstrument(sym)) return true
    onProgress(`${sym}: not in the Dukascopy S3 archive (set DUKASCOPY_S3_SYMBOL_${sym}=<folder> if it uses another name)`)
    return false
  } catch (e) {
    const msg = `${e?.name || 'Error'}: ${e?.message || e}`
    onProgress(`${sym}: S3 archive listing failed (${msg})`)
    if (S3_FATAL_ERROR.test(msg)) {
      state.aborted = true
      state.lastError = `s3 list: ${msg}`
    }
    return false
  }
}

async function rebuildSecondBars(sym, startSec, endSec, onProgress) {
  for (const step of LOCAL_SECOND_STEPS) {
    try {
      await syncSecondBarsRange(sym, step, startSec, endSec, () => {}, { missingOnly: false })
    } catch (e) {
      onProgress(`  s${step} rebuild failed: ${e instanceof Error ? e.message : e}`)
    }
  }
}

/** Aggregate stored m1 bars into h1 / d1 for the given UTC days (no download). */
function rebuildFromM1(sym, tf, days) {
  const period = tf === 'h1' ? HOUR_SEC : DAY_SEC
  const read = getMarketDb().prepare(
    `SELECT time_sec, open, high, low, close, volume FROM bars
     WHERE symbol = ? AND timeframe = 'm1' AND time_sec >= ? AND time_sec < ? ORDER BY time_sec`,
  )
  let n = 0
  for (const day of days) {
    const rows = read.all(sym, day, day + DAY_SEC)
    /** @type {{ time: number; open: number; high: number; low: number; close: number; volume: number }[]} */
    const bars = []
    for (const r of rows) {
      const time = Math.floor(r.time_sec / period) * period
      const cur = bars[bars.length - 1]
      if (!cur || cur.time !== time) {
        bars.push({ time, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? 0 })
      } else {
        if (r.high > cur.high) cur.high = r.high
        if (r.low < cur.low) cur.low = r.low
        cur.close = r.close
        cur.volume += r.volume ?? 0
      }
    }
    n += insertBars(sym, tf, bars)
  }
  return n
}
