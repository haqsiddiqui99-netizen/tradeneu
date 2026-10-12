/**
 * Browser copy of settled session bar ranges (IndexedDB), so reopening a session draws without
 * waiting on `/api/market/bars`. Only history that can no longer change is stored.
 */
import type { Bar } from '../types'
import type { MarketBarsSeries } from './marketDataClient'

const DB_NAME = 'tradeneu-bars'
const DB_VERSION = 1
const BARS_STORE = 'ranges'
const META_STORE = 'meta'
/** Bump when server bar-building rules change so old copies are ignored. */
const CACHE_FORMAT = 'b3'
const MAX_ENTRIES = 40
/** S3 archive + hourly gap repair settle a day well within this; newer ranges may still change. */
const SETTLED_AFTER_SEC = 2 * 86_400
/** Weekend plus a market holiday — the longest normal stretch with no FX / metals bars. */
const EDGE_SLACK_SEC = 4 * 86_400
/** Never let a slow or blocked IndexedDB delay chart boot. */
const READ_TIMEOUT_MS = 1_500

type StoredRange = {
  key: string
  timeframe: string
  dataSource?: string
  /** time, open, high, low, close, volume — interleaved per bar. */
  cols: Float64Array
}

type StoredMeta = { key: string; used: number }

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(BARS_STORE)) db.createObjectStore(BARS_STORE, { keyPath: 'key' })
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' }).createIndex('used', 'used')
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function rangeKey(symbol: string, startSec: number, endSec: number, sessionStartSec?: number): string {
  return [
    CACHE_FORMAT,
    symbol.trim().toUpperCase(),
    Math.floor(startSec),
    Math.floor(endSec),
    sessionStartSec != null && Number.isFinite(sessionStartSec) ? Math.floor(sessionStartSec) : '',
  ].join('|')
}

/** Range is old enough that its bars are final. */
export function isSettledBarRange(endSec: number): boolean {
  return Number.isFinite(endSec) && endSec < Date.now() / 1000 - SETTLED_AFTER_SEC
}

/** Only Dukascopy-backed bars; a Twelve Data or demo fallback must not be pinned in the browser. */
function cacheableSource(dataSource?: string): boolean {
  const s = (dataSource ?? '').toLowerCase()
  if (!s || s.includes('synthetic') || s.includes('twelvedata') || s.includes('upload')) return false
  // `:clamped` = the server's store ended before the requested range; a later load fills it in.
  if (s.includes(':clamped')) return false
  return s.startsWith('local:') || s.includes('dukascopy')
}

function packBars(bars: Bar[]): Float64Array {
  const cols = new Float64Array(bars.length * 6)
  let i = 0
  for (const b of bars) {
    cols[i++] = Number(b.time)
    cols[i++] = b.open
    cols[i++] = b.high
    cols[i++] = b.low
    cols[i++] = b.close
    cols[i++] = b.volume
  }
  return cols
}

function unpackBars(cols: Float64Array): Bar[] {
  const bars: Bar[] = new Array(cols.length / 6)
  for (let i = 0, j = 0; i < cols.length; i += 6, j++) {
    bars[j] = {
      time: cols[i] as Bar['time'],
      open: cols[i + 1]!,
      high: cols[i + 2]!,
      low: cols[i + 3]!,
      close: cols[i + 4]!,
      volume: cols[i + 5]!,
    }
  }
  return bars
}

function touch(db: IDBDatabase, key: string): void {
  try {
    db.transaction(META_STORE, 'readwrite').objectStore(META_STORE).put({ key, used: Date.now() } satisfies StoredMeta)
  } catch {
    /* recency is best-effort */
  }
}

export async function readCachedBarRange(
  symbol: string,
  startSec: number,
  endSec: number,
  sessionStartSec?: number,
): Promise<MarketBarsSeries | null> {
  if (!isSettledBarRange(endSec)) return null
  const key = rangeKey(symbol, startSec, endSec, sessionStartSec)
  const read = (async (): Promise<MarketBarsSeries | null> => {
    const db = await openDb()
    if (!db) return null
    const row = await new Promise<StoredRange | undefined>((resolve) => {
      try {
        const req = db.transaction(BARS_STORE, 'readonly').objectStore(BARS_STORE).get(key)
        req.onsuccess = () => resolve(req.result as StoredRange | undefined)
        req.onerror = () => resolve(undefined)
      } catch {
        resolve(undefined)
      }
    })
    if (!row?.cols?.length) return null
    touch(db, key)
    return { bars: unpackBars(row.cols), timeframe: row.timeframe, dataSource: row.dataSource }
  })()
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), READ_TIMEOUT_MS))
  return Promise.race([read, timeout]).catch(() => null)
}

export function writeCachedBarRange(
  symbol: string,
  startSec: number,
  endSec: number,
  sessionStartSec: number | undefined,
  series: MarketBarsSeries,
): void {
  if (!isSettledBarRange(endSec) || series.bars.length < 2 || !cacheableSource(series.dataSource)) return
  // A reply that stops short of either end is partial; keep fetching it from the server.
  const first = Number(series.bars[0]!.time)
  const last = Number(series.bars[series.bars.length - 1]!.time)
  if (first > startSec + EDGE_SLACK_SEC || last < endSec - EDGE_SLACK_SEC) return
  // Days stored before the server's volume repair have none; keep fetching until they do.
  if (!series.bars.some((b) => b.volume > 0)) return
  const key = rangeKey(symbol, startSec, endSec, sessionStartSec)
  void (async () => {
    const db = await openDb()
    if (!db) return
    const row: StoredRange = {
      key,
      timeframe: series.timeframe,
      dataSource: series.dataSource,
      cols: packBars(series.bars),
    }
    try {
      const tx = db.transaction([BARS_STORE, META_STORE], 'readwrite')
      tx.objectStore(BARS_STORE).put(row)
      tx.objectStore(META_STORE).put({ key, used: Date.now() } satisfies StoredMeta)
      tx.oncomplete = () => evictOldest(db)
    } catch {
      /* quota or private mode — the network path still works */
    }
  })()
}

function evictOldest(db: IDBDatabase): void {
  try {
    const tx = db.transaction([BARS_STORE, META_STORE], 'readwrite')
    const meta = tx.objectStore(META_STORE)
    const countReq = meta.count()
    countReq.onsuccess = () => {
      let extra = countReq.result - MAX_ENTRIES
      if (extra <= 0) return
      const cursorReq = meta.index('used').openCursor()
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor || extra <= 0) return
        const key = (cursor.value as StoredMeta).key
        tx.objectStore(BARS_STORE).delete(key)
        cursor.delete()
        extra--
        cursor.continue()
      }
    }
  } catch {
    /* next write retries */
  }
}
