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
import { getMarketDb, normalizeMarketSymbol } from './marketLocalDb.mjs'

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
 * Ticks for one UTC day from the archive.
 * @returns {Promise<{ ok: true; ticks: object[]; files: number } | { ok: false; error: string; fatal?: boolean }>}
 */
export async function fetchS3DayTicks(symbol, daySec) {
  const sym = normalizeMarketSymbol(symbol)
  const dayMs = daySec * 1000
  const folder = s3Folder(sym)
  const prefix = `${folder}/${datePath(dayMs)}`
  try {
    let buffer = null
    try {
      buffer = await getObject(`${prefix}_ticks.bi5`)
    } catch (e) {
      if (!isMissing(e)) throw e
    }
    if (buffer) {
      if (!buffer.length) return { ok: true, ticks: [], files: 1 }
      const point = resolvePointValue(sym, firstRawBid(buffer), daySec)
      return { ok: true, ticks: decodeBi5(buffer, dayMs, point), files: 1 }
    }

    // Legacy hourly layout for older periods.
    const hourly = (await listKeys(prefix))
      .map((k) => ({ key: k, m: /\/(\d{2})h_ticks\.bi5$/.exec(k) }))
      .filter((x) => x.m)
    const ticks = []
    for (const { key, m } of hourly) {
      const buf = await getObject(key)
      if (!buf.length) continue
      const point = resolvePointValue(sym, firstRawBid(buf), daySec)
      ticks.push(...decodeBi5(buf, dayMs + Number(m[1]) * HOUR_MS, point))
    }
    ticks.sort((a, b) => a.timeMs - b.timeMs)
    return { ok: true, ticks, files: hourly.length }
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
