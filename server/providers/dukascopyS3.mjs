/**
 * Dukascopy historical archive on S3 (Requester Pays, eu-west-1).
 *
 * The free datafeed / jetta API now sits behind an AWS WAF browser challenge (HTTP 202,
 * `x-amzn-waf-action: challenge`) and 429s, so server-side backfill reads the archive instead.
 *
 * Layout: SYMBOL/YYYY/MM/DD_ticks.bi5 — month zero-based, one file per UTC day, raw LZMA.
 * Records are 20 bytes big-endian: uint32 ms-since-day-start, uint32 ask, uint32 bid,
 * float32 ask volume, float32 bid volume (millions). Older periods may still be hourly
 * (SYMBOL/YYYY/MM/DD/HHh_ticks.bi5, ms since start of hour). A missing key = no ticks.
 *
 * Requires AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY; downloads are billed to that account.
 */

import fs from 'fs'
import path from 'path'
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { lzma } from '@napi-rs/lzma'
import { getMarketDb, marketDbPath, normalizeMarketSymbol } from './marketLocalDb.mjs'

const HOUR_MS = 3_600_000

const BUCKET = () => process.env.DUKASCOPY_S3_BUCKET?.trim() || 'cfg-public-proper-wallaby'
const REGION = () => process.env.DUKASCOPY_S3_REGION?.trim() || 'eu-west-1'

/** Errors that mean the credentials / bucket setup is wrong — retrying will not help. */
export const S3_FATAL_ERROR = /AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch|ExpiredToken|InvalidToken|NoSuchBucket|AuthorizationHeaderMalformed|credential/i

/** Folder with the same layout as the bucket (e.g. filled by `aws s3 sync`); read instead of S3. */
const LOCAL_DIR = () => process.env.DUKASCOPY_S3_LOCAL_DIR?.trim() || ''

export function dukascopyS3Enabled() {
  const v = process.env.DUKASCOPY_S3?.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  if (LOCAL_DIR()) return true
  return Boolean(process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim())
}

/** @type {S3Client | null} */
let client = null
function s3() {
  if (!client) client = new S3Client({ region: REGION(), maxAttempts: 4 })
  return client
}

/** Archive folder for an app symbol (override: DUKASCOPY_S3_SYMBOL_XAUUSD=FOLDER). */
function s3Folder(sym) {
  return process.env[`DUKASCOPY_S3_SYMBOL_${sym}`]?.trim() || sym
}

function datePath(dayMs) {
  const d = new Date(dayMs)
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth()).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
}

function errorText(e) {
  return `${e?.name || 'Error'}: ${e?.message || e}`
}

function isMissing(e) {
  return e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404
}

async function getObject(key) {
  if (LOCAL_DIR()) {
    try {
      return await fs.promises.readFile(path.join(LOCAL_DIR(), ...key.split('/')))
    } catch (e) {
      if (e?.code === 'ENOENT') throw Object.assign(new Error(`missing ${key}`), { name: 'NoSuchKey' })
      throw e
    }
  }
  const out = await s3().send(new GetObjectCommand({ Bucket: BUCKET(), Key: key, RequestPayer: 'requester' }))
  return Buffer.from(await out.Body.transformToByteArray())
}

/** Keys directly under `prefix/` (used for the legacy hourly layout). */
async function listKeys(prefix) {
  if (LOCAL_DIR()) {
    const dir = path.join(LOCAL_DIR(), ...prefix.split('/'))
    const names = await fs.promises.readdir(dir).catch(() => [])
    return names.map((n) => `${prefix}/${n}`)
  }
  const out = await s3().send(
    new ListObjectsV2Command({ Bucket: BUCKET(), Prefix: `${prefix}/`, RequestPayer: 'requester' }),
  )
  return (out.Contents ?? []).map((o) => o.Key ?? '')
}

/** List top-level instrument folders (cheap: delimiter listing). */
export async function listS3Instruments() {
  if (LOCAL_DIR()) {
    const entries = await fs.promises.readdir(LOCAL_DIR(), { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
  }
  const names = []
  let token
  do {
    const out = await s3().send(
      new ListObjectsV2Command({
        Bucket: BUCKET(),
        Delimiter: '/',
        RequestPayer: 'requester',
        ContinuationToken: token,
      }),
    )
    for (const p of out.CommonPrefixes ?? []) if (p.Prefix) names.push(p.Prefix.replace(/\/$/, ''))
    token = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (token)
  return names.sort()
}

/**
 * @param {Buffer} buffer compressed .bi5
 * @param {number} baseMs UTC start the record offsets count from
 * @param {number} pointValue raw integer price → price divisor
 */
export function decodeBi5(buffer, baseMs, pointValue) {
  if (!buffer?.length) return []
  const raw = lzma.decompressSync(buffer)
  const n = Math.floor(raw.length / 20)
  const decimals = Math.max(0, Math.round(Math.log10(pointValue)))
  const ticks = new Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * 20
    ticks[i] = {
      timeMs: baseMs + raw.readUInt32BE(o),
      ask: +(raw.readUInt32BE(o + 4) / pointValue).toFixed(decimals),
      bid: +(raw.readUInt32BE(o + 8) / pointValue).toFixed(decimals),
      askVol: raw.readFloatBE(o + 12),
      bidVol: raw.readFloatBE(o + 16),
    }
  }
  return ticks
}

/** Raw bid of the first record, before scaling (used to detect the point value). */
function firstRawBid(buffer) {
  const raw = lzma.decompressSync(buffer)
  return raw.length >= 20 ? raw.readUInt32BE(8) : null
}

const FALLBACK_POINT = { XAUUSD: 1000, XAGUSD: 1000, BTCUSD: 10 }

/** @type {Map<string, number>} */
const pointCache = new Map()

/** Close of the stored bar nearest to `sec`, to calibrate price scaling against existing data. */
function referencePrice(sym, sec) {
  const db = getMarketDb()
  for (const tf of ['d1', 'h1', 'm1']) {
    const before = db
      .prepare(`SELECT close FROM bars WHERE symbol = ? AND timeframe = ? AND time_sec <= ? ORDER BY time_sec DESC LIMIT 1`)
      .get(sym, tf, sec)
    if (before?.close > 0) return before.close
    const after = db
      .prepare(`SELECT close FROM bars WHERE symbol = ? AND timeframe = ? AND time_sec > ? ORDER BY time_sec ASC LIMIT 1`)
      .get(sym, tf, sec)
    if (after?.close > 0) return after.close
  }
  return null
}

/**
 * Pick the power-of-ten divisor that lines the raw integer up with prices already stored;
 * falls back to DUKASCOPY_S3_POINT_<SYM>, then known instrument scales.
 */
function resolvePointValue(sym, rawBid, daySec) {
  const override = Number(process.env[`DUKASCOPY_S3_POINT_${sym}`])
  if (Number.isFinite(override) && override > 0) return override
  const cached = pointCache.get(sym)
  if (cached) return cached
  const ref = referencePrice(sym, daySec)
  if (ref && rawBid > 0) {
    let best = { p: 0, err: Number.POSITIVE_INFINITY }
    for (let e = 0; e <= 6; e++) {
      const p = 10 ** e
      const err = Math.abs(Math.log(rawBid / p / ref))
      if (err < best.err) best = { p, err }
    }
    if (best.err < Math.log(1.5)) {
      pointCache.set(sym, best.p)
      return best.p
    }
  }
  const p = FALLBACK_POINT[sym] ?? (sym.endsWith('JPY') ? 1000 : 100_000)
  pointCache.set(sym, p)
  return p
}

/**
 * Local tick file store on the data volume, same layout as the bucket under the app symbol:
 * SYMBOL/YYYY/MM/DD_ticks.bi5 (or DD/HHh_ticks.bi5). Files are kept exactly as downloaded,
 * so a day costs one S3 request ever. Disable with MARKET_TICK_ARCHIVE=0.
 */
export function tickArchiveEnabled() {
  const v = process.env.MARKET_TICK_ARCHIVE?.trim().toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'no'
}

export function tickArchiveDir() {
  return process.env.MARKET_TICK_ARCHIVE_DIR?.trim() || path.join(path.dirname(marketDbPath()), 'ticks')
}

/** Relative day path inside the tick archive (no extension). */
export function archiveDayPath(symbol, daySec) {
  return `${normalizeMarketSymbol(symbol)}/${datePath(daySec * 1000)}`
}

function archiveFile(rel) {
  return path.join(tickArchiveDir(), ...rel.split('/'))
}

async function writeArchiveFile(rel, buffer) {
  const file = archiveFile(rel)
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  await fs.promises.writeFile(tmp, buffer)
  await fs.promises.rename(tmp, file)
}

/**
 * Raw files for one day from the tick archive.
 * @returns {Promise<{ daily: Buffer } | { hourly: { hour: number; buffer: Buffer }[] } | null>} null = not archived
 */
async function readArchivedDay(sym, daySec) {
  if (!tickArchiveEnabled()) return null
  const rel = archiveDayPath(sym, daySec)
  try {
    return { daily: await fs.promises.readFile(archiveFile(`${rel}_ticks.bi5`)) }
  } catch (e) {
    if (e?.code !== 'ENOENT') throw e
  }
  const names = await fs.promises.readdir(archiveFile(rel)).catch(() => null)
  const hours = (names ?? []).map((n) => /^(\d{2})h_ticks\.bi5$/.exec(n)).filter(Boolean)
  if (!hours.length) return null
  const hourly = []
  for (const m of hours) {
    hourly.push({ hour: Number(m[1]), buffer: await fs.promises.readFile(archiveFile(`${rel}/${m[0]}`)) })
  }
  return { hourly }
}

/** True when the day is already in the tick archive (no read). */
export function isDayArchived(symbol, daySec) {
  const rel = archiveDayPath(symbol, daySec)
  if (fs.existsSync(archiveFile(`${rel}_ticks.bi5`))) return true
  try {
    return fs.readdirSync(archiveFile(rel)).some((n) => n.endsWith('h_ticks.bi5'))
  } catch {
    return false
  }
}

function decodeDay(sym, daySec, files) {
  const dayMs = daySec * 1000
  if ('daily' in files) {
    if (!files.daily.length) return []
    return decodeBi5(files.daily, dayMs, resolvePointValue(sym, firstRawBid(files.daily), daySec))
  }
  const ticks = []
  for (const { hour, buffer } of files.hourly) {
    if (!buffer.length) continue
    const point = resolvePointValue(sym, firstRawBid(buffer), daySec)
    ticks.push(...decodeBi5(buffer, dayMs + hour * HOUR_MS, point))
  }
  return ticks.sort((a, b) => a.timeMs - b.timeMs)
}

/**
 * Ticks for one UTC day from the local tick archive only (no download).
 * @returns {Promise<object[] | null>} null when the day is not archived
 */
export async function readArchivedDayTicks(symbol, daySec) {
  const sym = normalizeMarketSymbol(symbol)
  const files = await readArchivedDay(sym, daySec)
  return files ? decodeDay(sym, daySec, files) : null
}

/**
 * Ticks for one UTC day: tick archive first, then S3 (saved to the archive on success).
 * `files` counts S3 downloads, `bytes` the compressed size written to the archive.
 * @returns {Promise<{ ok: true; ticks: object[]; files: number; bytes: number; cached: boolean } | { ok: false; error: string; fatal?: boolean }>}
 */
export async function fetchS3DayTicks(symbol, daySec) {
  const sym = normalizeMarketSymbol(symbol)
  const prefix = `${s3Folder(sym)}/${datePath(daySec * 1000)}`
  const rel = archiveDayPath(sym, daySec)
  try {
    const archived = await readArchivedDay(sym, daySec)
    if (archived) return { ok: true, ticks: decodeDay(sym, daySec, archived), files: 0, bytes: 0, cached: true }

    let buffer = null
    try {
      buffer = await getObject(`${prefix}_ticks.bi5`)
    } catch (e) {
      if (!isMissing(e)) throw e
    }
    if (buffer) {
      if (tickArchiveEnabled()) await writeArchiveFile(`${rel}_ticks.bi5`, buffer)
      return { ok: true, ticks: decodeDay(sym, daySec, { daily: buffer }), files: 1, bytes: buffer.length, cached: false }
    }

    // Legacy hourly layout for older periods. Archived only once every hour downloaded.
    const keys = (await listKeys(prefix))
      .map((k) => ({ key: k, m: /\/(\d{2})h_ticks\.bi5$/.exec(k) }))
      .filter((x) => x.m)
    const hourly = []
    for (const { key, m } of keys) hourly.push({ hour: Number(m[1]), name: m[0].slice(1), buffer: await getObject(key) })
    let bytes = 0
    if (tickArchiveEnabled()) {
      for (const h of hourly) {
        await writeArchiveFile(`${rel}/${h.name}`, h.buffer)
        bytes += h.buffer.length
      }
    }
    return { ok: true, ticks: decodeDay(sym, daySec, { hourly }), files: hourly.length, bytes, cached: false }
  } catch (e) {
    const error = errorText(e)
    return { ok: false, error, fatal: S3_FATAL_ERROR.test(error) }
  }
}

/**
 * Bid OHLC bars from ticks, matching the BID candles already stored from Dukascopy.
 * @param {{ timeMs: number; bid: number; bidVol?: number }[]} ticks sorted ascending
 * @param {number} periodSec
 */
export function ticksToBidBars(ticks, periodSec) {
  const periodMs = periodSec * 1000
  const bars = []
  let cur = null
  for (const t of ticks) {
    if (!Number.isFinite(t.bid)) continue
    const bucket = Math.floor(t.timeMs / periodMs) * periodMs
    const vol = Number.isFinite(t.bidVol) ? t.bidVol : 0
    if (!cur || cur.bucket !== bucket) {
      if (cur) bars.push(cur)
      cur = { bucket, open: t.bid, high: t.bid, low: t.bid, close: t.bid, volume: vol }
    } else {
      if (t.bid > cur.high) cur.high = t.bid
      if (t.bid < cur.low) cur.low = t.bid
      cur.close = t.bid
      cur.volume += vol
    }
  }
  if (cur) bars.push(cur)
  return bars.map((b) => ({
    time: Math.floor(b.bucket / 1000),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: +b.volume.toFixed(4),
  }))
}

/** @type {Promise<string[]> | null} */
let instrumentsPromise = null

/** True when the archive has a folder for the symbol (listing cached per process). */
export async function s3HasInstrument(symbol) {
  const sym = normalizeMarketSymbol(symbol)
  if (!instrumentsPromise) {
    instrumentsPromise = listS3Instruments().catch((e) => {
      instrumentsPromise = null
      throw e
    })
  }
  const names = await instrumentsPromise
  return names.includes(s3Folder(sym))
}
