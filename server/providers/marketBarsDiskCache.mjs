/**
 * Persistent disk cache for resolved OHLCV series (survives restarts on Railway /data volume).
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

let cacheDir = null

const DEFAULT_DISK_TTL_MS = Math.max(
  60_000,
  Number.parseInt(process.env.MARKET_BARS_DISK_TTL_MS || '900000', 10) || 900_000,
)
const HISTORICAL_DISK_TTL_MS = Math.max(
  DEFAULT_DISK_TTL_MS,
  Number.parseInt(process.env.MARKET_BARS_DISK_HISTORICAL_TTL_MS || String(7 * 86_400_000), 10) ||
    7 * 86_400_000,
)
const MAX_FILES = Math.min(
  4096,
  Math.max(32, Number.parseInt(process.env.MARKET_BARS_DISK_MAX_FILES || '512', 10) || 512),
)

function diskCacheEnabled() {
  if (!cacheDir) return false
  const v = process.env.MARKET_BARS_DISK_CACHE?.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

function ttlMs(endSec) {
  const nowSec = Math.floor(Date.now() / 1000)
  if (Number.isFinite(endSec) && endSec < nowSec - 300) return HISTORICAL_DISK_TTL_MS
  return DEFAULT_DISK_TTL_MS
}

function filePathForKey(key) {
  const hash = crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 40)
  return path.join(cacheDir, `${hash}.json`)
}

function pruneIfNeeded() {
  if (!cacheDir || !fs.existsSync(cacheDir)) return
  let files
  try {
    files = fs
      .readdirSync(cacheDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const fp = path.join(cacheDir, f)
        const st = fs.statSync(fp)
        return { fp, mtimeMs: st.mtimeMs }
      })
      .sort((a, b) => a.mtimeMs - b.mtimeMs)
  } catch {
    return
  }
  while (files.length > MAX_FILES) {
    const drop = files.shift()
    if (!drop) break
    try {
      fs.unlinkSync(drop.fp)
    } catch {
      /* ignore */
    }
  }
}

/** @param {string} dir */
export function initMarketBarsDiskCache(dir) {
  const custom = process.env.MARKET_BARS_DISK_CACHE_PATH?.trim()
  cacheDir = custom || path.join(dir, 'market-bars-cache')
  if (!diskCacheEnabled()) return
  try {
    fs.mkdirSync(cacheDir, { recursive: true })
    console.log(`[market-cache] disk bars cache: ${cacheDir}`)
  } catch (e) {
    console.warn('[market-cache] disk bars cache unavailable:', e?.message || e)
    cacheDir = null
  }
}

export function marketBarsDiskCachePath() {
  return cacheDir
}

/**
 * @param {string} key
 * @param {{ endSec?: number }} [opts]
 */
export function readMarketBarsDiskCache(key, opts = {}) {
  if (!diskCacheEnabled()) return null
  const fp = filePathForKey(key)
  try {
    if (!fs.existsSync(fp)) return null
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'))
    if (!raw || typeof raw !== 'object' || !raw.value) return null
    const expires = Number(raw.expires)
    if (Number.isFinite(expires) && expires > 0 && expires <= Date.now()) {
      fs.unlinkSync(fp)
      return null
    }
    if (!raw.value.ok || !Array.isArray(raw.value.bars) || raw.value.bars.length < 16) return null
    return { ...raw.value, cache: 'disk-hit' }
  } catch {
    return null
  }
}

/**
 * @param {string} key
 * @param {object} value
 * @param {{ endSec?: number }} [opts]
 */
export function writeMarketBarsDiskCache(key, value, opts = {}) {
  if (!diskCacheEnabled()) return
  if (!value?.ok || !Array.isArray(value.bars) || value.bars.length < 16) return
  const fp = filePathForKey(key)
  const ttl = ttlMs(opts.endSec)
  const payload = {
    expires: ttl > 0 ? Date.now() + ttl : 0,
    savedAt: Date.now(),
    value: {
      ok: value.ok,
      bars: value.bars,
      timeframe: value.timeframe,
      source: value.source,
      chain: value.chain,
      twelve_data_request: value.twelve_data_request,
      dukascopy_request: value.dukascopy_request,
    },
  }
  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, JSON.stringify(payload))
    pruneIfNeeded()
  } catch (e) {
    console.warn('[market-cache] disk write failed:', e?.message || e)
  }
}

/** @param {string} [prefix] symbol prefix e.g. XAUUSD — clears entire cache when omitted */
export function invalidateMarketBarsDiskCache(_prefix) {
  if (!cacheDir || !fs.existsSync(cacheDir)) return
  try {
    for (const f of fs.readdirSync(cacheDir)) {
      if (f.endsWith('.json')) fs.unlinkSync(path.join(cacheDir, f))
    }
  } catch {
    /* ignore */
  }
}
