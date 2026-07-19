/**
 * Market + historic data API (Node). Run: npm run server:historic
 *
 * Gold CSV:
 *   POST /api/historic/gold/upload — multipart field "file" (CSV body)
 *   GET  /api/historic/gold/bars  — uploaded JSON (404 if none)
 *   DELETE /api/historic/gold/upload
 *
 * Third-party chain (extend providers in server/providers/):
 *   GET /api/market/bars?symbol=EURUSD&chain=dukascopy,twelvedata (default; add upload if needed)
 *   GET /api/market/ticks?symbol=EURUSD&start=&end=&cursor=&limit=
 *   GET /api/market/providers — provider ids + hints
 *
 * Twelve Data: set TWELVE_DATA_API_KEY (server env only). Optional `.env.local` at repo root
 * is loaded here (gitignored via `*.local`). Override chain with MARKET_BAR_CHAIN.
 * Optional: TWELVE_DATA_OUTPUT_SIZE, MARKET_CHART_RANGE / MARKET_CHART_INTERVAL (or legacy MARKET_YAHOO_*).
 * Optional cache: MARKET_BARS_CACHE_TTL_MS (default 120000), MARKET_BARS_CACHE_HISTORICAL_TTL_MS (default 600000).
 *
 * Port: HISTORIC_API_PORT or 3001. Dev: Vite proxies /api → this server.
 */

import express from 'express'
import fs from 'fs'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseXauCsvText } from '../scripts/xauCsvParse.mjs'
import { resolveMarketBars } from './providers/resolveChain.mjs'
import { getCachedMarketBars, invalidateMarketBarsCache, marketBarsCacheKey } from './providers/marketBarsCache.mjs'
import { getCachedMarketTicks, marketTicksCacheKey } from './providers/marketTicksCache.mjs'
import { resolveMarketTicks } from './providers/marketLocalResolve.mjs'
import { getLocalStoreStats, marketDbPath, marketLocalEnabled } from './providers/marketLocalDb.mjs'
import { mountLocalAuthRoutes } from './auth/localAuth.mjs'
import { authStorageStatus } from './auth/userPersistence.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** Vercel serverless has ephemeral disk; /tmp persists for the lifetime of a warm instance. */
const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'suplexity-server-data')
  : path.join(__dirname, '..', 'server-data')
const GOLD_FILE = path.join(DATA_DIR, 'gold-bars.json')

/** Load `.env.local` so `TWELVE_DATA_API_KEY` works without exporting in the shell. Does not override existing env. */
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
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
loadEnvLocal()

const app = express()

/** Lets Vite / dev scripts confirm 3001 is this server, not some other process. */
app.get('/api/historic/identity', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json({ ok: true, app: 'suplexity-historic-api' })
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
})

app.use(express.json({ limit: '32kb' }))

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

mountLocalAuthRoutes(app, { dataDir: DATA_DIR })
const authStorage = authStorageStatus()
if (authStorage.ready) {
  console.log(`[auth] user storage: ${authStorage.backend}`)
} else {
  console.warn(`[auth] user storage not ready: ${authStorage.message || authStorage.backend}`)
}

app.get('/api/historic/gold/bars', (req, res) => {
  try {
    if (!fs.existsSync(GOLD_FILE)) {
      res.status(404).json({ ok: false, error: 'no_upload' })
      return
    }
    const raw = fs.readFileSync(GOLD_FILE, 'utf8')
    const j = JSON.parse(raw)
    res.json(j)
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

app.post('/api/historic/gold/upload', upload.single('file'), (req, res) => {
  if (!req.file?.buffer) {
    res.status(400).json({ ok: false, error: 'Expected multipart field "file" (CSV).' })
    return
  }
  const text = req.file.buffer.toString('utf8')
  const parsed = parseXauCsvText(text, { maxBars: 250_000 })
  if (!parsed.ok) {
    res.status(400).json({ ok: false, error: parsed.error })
    return
  }
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const payload = {
    ok: true,
    symbol: 'XAUUSD',
    timeframe: parsed.timeframe,
    source: `upload:${req.file.originalname}`,
    bars: parsed.bars,
  }
  fs.writeFileSync(GOLD_FILE, JSON.stringify(payload))
  invalidateMarketBarsCache('XAUUSD')
  invalidateMarketBarsCache('GC')
  res.json({
    ok: true,
    barCount: parsed.bars.length,
    timeframe: parsed.timeframe,
    stored: path.relative(process.cwd(), GOLD_FILE),
  })
})

app.delete('/api/historic/gold/upload', (req, res) => {
  try {
    if (fs.existsSync(GOLD_FILE)) fs.unlinkSync(GOLD_FILE)
    invalidateMarketBarsCache('XAUUSD')
    invalidateMarketBarsCache('GC')
    res.json({ ok: true })
  } catch {
    res.status(500).json({ ok: false })
  }
})

const DEFAULT_CHAIN = process.env.MARKET_BAR_CHAIN?.trim() || 'local,dukascopy,twelvedata'

/** Express may give `string | string[]` for repeated keys. */
function firstQueryString(q, key) {
  const v = q?.[key]
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim()) return v[0].trim()
  return undefined
}

app.get('/api/market/bars', async (req, res) => {
  const symbol = String(req.query.symbol || 'GC').trim() || 'GC'
  const chain = String(req.query.chain || DEFAULT_CHAIN).trim()
  const chartRange = firstQueryString(req.query, 'range')
  const chartInterval = firstQueryString(req.query, 'interval')
  const startRaw = firstQueryString(req.query, 'start')
  const endRaw = firstQueryString(req.query, 'end')
  const sessionStartRaw = firstQueryString(req.query, 'sessionStart')
  const startSec = startRaw != null ? Number.parseInt(startRaw, 10) : undefined
  const endSec = endRaw != null ? Number.parseInt(endRaw, 10) : undefined
  const sessionStartSec = sessionStartRaw != null ? Number.parseInt(sessionStartRaw, 10) : undefined
  const cacheKey = marketBarsCacheKey({
    symbol,
    chain,
    chartRange,
    chartInterval,
    startSec: Number.isFinite(startSec) ? startSec : undefined,
    endSec: Number.isFinite(endSec) ? endSec : undefined,
    sessionStartSec: Number.isFinite(sessionStartSec) ? sessionStartSec : undefined,
  })
  try {
    const out = await getCachedMarketBars(
      cacheKey,
      () =>
        resolveMarketBars({
          symbol,
          chain,
          chartRange,
          chartInterval,
          startSec: Number.isFinite(startSec) ? startSec : undefined,
          endSec: Number.isFinite(endSec) ? endSec : undefined,
          sessionStartSec: Number.isFinite(sessionStartSec) ? sessionStartSec : undefined,
        }),
      { endSec: Number.isFinite(endSec) ? endSec : undefined },
    )
    if (!out.ok) {
      res.status(404).json({
        ok: false,
        error: out.error,
        provider_chain: out.chain,
        chain: out.chain,
      })
      return
    }
    res.setHeader('Cache-Control', 'private, max-age=60')
    if (out.cache) res.setHeader('X-Market-Bars-Cache', out.cache)
    res.json({
      ok: true,
      symbol,
      timeframe: out.timeframe,
      source: out.source,
      provider_chain: out.chain,
      twelve_data_request: out.twelve_data_request,
      dukascopy_request: out.dukascopy_request,
      bars: out.bars,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

app.get('/api/market/ticks', async (req, res) => {
  const symbol = String(req.query.symbol || 'EURUSD').trim() || 'EURUSD'
  const startRaw = firstQueryString(req.query, 'start')
  const endRaw = firstQueryString(req.query, 'end')
  const cursorRaw = firstQueryString(req.query, 'cursor')
  const limitRaw = firstQueryString(req.query, 'limit')
  const sideRaw = firstQueryString(req.query, 'side')

  const startSec = startRaw != null ? Number.parseInt(startRaw, 10) : NaN
  const endSec = endRaw != null ? Number.parseInt(endRaw, 10) : NaN
  const cursor = cursorRaw != null ? Number.parseInt(cursorRaw, 10) : undefined
  const limit = limitRaw != null ? Number.parseInt(limitRaw, 10) : undefined
  const side = sideRaw === 'bid' || sideRaw === 'ask' ? sideRaw : 'both'

  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
    res.status(400).json({ ok: false, error: 'start and end (unix seconds) are required', code: 'invalid_range' })
    return
  }

  const cacheKey = marketTicksCacheKey({
    symbol,
    startSec,
    endSec,
    cursor: Number.isFinite(cursor) ? cursor : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  })

  try {
    const out = await getCachedMarketTicks(
      cacheKey,
      () =>
        resolveMarketTicks({
          symbol,
          startSec,
          endSec,
          cursor: Number.isFinite(cursor) ? cursor : undefined,
          limit: Number.isFinite(limit) ? limit : undefined,
          side,
        }),
      { endSec },
    )

    if (!out.ok) {
      const code = out.code || 'error'
      const status =
        code === 'unmapped_symbol' || code === 'no_ticks'
          ? 404
          : code === 'range_too_large' || code === 'invalid_range'
            ? 400
            : 502
      res.status(status).json({
        ok: false,
        error: out.error,
        code,
        maxRangeSec: out.maxRangeSec,
      })
      return
    }

    res.setHeader('Cache-Control', 'private, max-age=60')
    if (out.cache) res.setHeader('X-Market-Ticks-Cache', out.cache)
    res.json({
      ok: true,
      symbol: out.symbol,
      source: out.source,
      count: out.count,
      truncated: out.truncated ?? false,
      nextCursor: out.nextCursor,
      ticks: out.ticks,
      dukascopy_request: out.dukascopy_request,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

app.get('/api/market/local/stats', (req, res) => {
  try {
    const symbol = String(req.query.symbol || 'XAUUSD').trim().toUpperCase()
    res.json({
      ok: true,
      enabled: marketLocalEnabled(),
      dbPath: marketDbPath(),
      stats: getLocalStoreStats(symbol),
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

app.get('/api/market/providers', (_req, res) => {
  res.json({
    ok: true,
    providers: [
      {
        id: 'dukascopy',
        description:
          'Dukascopy historical OHLCV (FX, metals, crypto via dukascopy-node; disk cache in server-data/dukascopy-cache)',
      },
      {
        id: 'local_sqlite',
        description:
          'Local SQLite market store (server-data/market.db) — sync with npm run market:sync; served before Dukascopy when MARKET_LOCAL_FIRST=1',
      },
      {
        id: 'dukascopy_ticks',
        description:
          'Dukascopy historical quote ticks (bid/ask) — GET /api/market/ticks for FX/metals/crypto',
      },
      { id: 'twelvedata', description: 'Twelve Data time_series (stocks, FX, crypto, metals; TWELVE_DATA_API_KEY)' },
      { id: 'upload', description: 'CSV uploaded to server (gold-bars.json)' },
      { id: 'tv', description: 'TradingView / UDF stub — implement licensed feed' },
    ],
    default_chain: DEFAULT_CHAIN,
    env: {
      MARKET_BAR_CHAIN: process.env.MARKET_BAR_CHAIN || null,
      DUKASCOPY_USE_CACHE: process.env.DUKASCOPY_USE_CACHE ?? '(default:on)',
      DUKASCOPY_CACHE_PATH: process.env.DUKASCOPY_CACHE_PATH || null,
      DUKASCOPY_BATCH_SIZE: process.env.DUKASCOPY_BATCH_SIZE || null,
      DUKASCOPY_TICK_PAGE_SIZE: process.env.DUKASCOPY_TICK_PAGE_SIZE || null,
      DUKASCOPY_MAX_TICK_RANGE_SEC: process.env.DUKASCOPY_MAX_TICK_RANGE_SEC || null,
      MARKET_TICKS_CACHE_TTL_MS: process.env.MARKET_TICKS_CACHE_TTL_MS || null,
      MARKET_LOCAL_FIRST: process.env.MARKET_LOCAL_FIRST ?? '(default:on)',
      MARKET_FALLBACK_DUKASCOPY: process.env.MARKET_FALLBACK_DUKASCOPY ?? '(default:on)',
      MARKET_DB_PATH: process.env.MARKET_DB_PATH || null,
      MARKET_SYNC_SYMBOLS: process.env.MARKET_SYNC_SYMBOLS || 'XAUUSD',
      TWELVE_DATA_API_KEY: process.env.TWELVE_DATA_API_KEY ? '(set)' : null,
      TWELVE_DATA_OUTPUT_SIZE: process.env.TWELVE_DATA_OUTPUT_SIZE || null,
      MARKET_CHART_RANGE: process.env.MARKET_CHART_RANGE || null,
      MARKET_CHART_INTERVAL: process.env.MARKET_CHART_INTERVAL || null,
      MARKET_GOLD_RANGE: process.env.MARKET_GOLD_RANGE || null,
      MARKET_GOLD_INTERVAL: process.env.MARKET_GOLD_INTERVAL || null,
      MARKET_YAHOO_RANGE: process.env.MARKET_YAHOO_RANGE || null,
      MARKET_YAHOO_INTERVAL: process.env.MARKET_YAHOO_INTERVAL || null,
      MARKET_YAHOO_GOLD_RANGE: process.env.MARKET_YAHOO_GOLD_RANGE || null,
      MARKET_YAHOO_GOLD_INTERVAL: process.env.MARKET_YAHOO_GOLD_INTERVAL || null,
    },
  })
})

export default app

/** Standalone dev / `npm run server:historic` — skipped on Vercel (see `api/index.mjs`). */
if (!process.env.VERCEL) {
  const PORT = Number(process.env.HISTORIC_API_PORT || 3001)
  const HOST = process.env.HISTORIC_API_HOST?.trim() || '127.0.0.1'
  const server = app.listen(PORT, HOST, () => {
    const keyOk = Boolean(process.env.TWELVE_DATA_API_KEY?.trim())
    console.log(`[market-data] http://${HOST}:${PORT}`)
    console.log(`  Default MARKET_BAR_CHAIN: ${DEFAULT_CHAIN}`)
    console.log(`  Dukascopy cache: ${process.env.DUKASCOPY_CACHE_PATH?.trim() || 'server-data/dukascopy-cache'}`)
    console.log(`  Local SQLite: ${marketDbPath()} (local-first: ${marketLocalEnabled() ? 'on' : 'off'})`)
    if (!keyOk) {
      console.warn(
        '  [WARN] TWELVE_DATA_API_KEY is not set — /api/market/bars will fail for Twelve Data. Set env or .env.local at repo root.',
      )
    } else {
      console.log('  TWELVE_DATA_API_KEY: loaded')
    }
    console.log(
      `  Default chart query: range=${process.env.MARKET_CHART_RANGE || process.env.MARKET_YAHOO_RANGE || '5d'} interval=${process.env.MARKET_CHART_INTERVAL || process.env.MARKET_YAHOO_INTERVAL || '1m'} (override with ?range=&interval=)`,
    )
    console.log(`  GET /api/historic/identity  |  GET /api/market/bars?symbol=AAPL  |  GET /api/market/ticks?symbol=EURUSD&start=&end=  |  GET /api/market/providers`)
    console.log(`  GET /api/auth/me  |  POST /api/auth/register  |  POST /api/auth/login  |  POST /api/auth/logout`)
    console.log(`  Gold CSV: POST/GET/DELETE /api/historic/gold/*`)
  })
  server.on('error', (err) => {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
      console.error(
        `[market-data] Port ${PORT} is already in use. Stop the other process or set HISTORIC_API_PORT.`,
      )
      process.exit(1)
    }
    console.error('[market-data] Server error:', err)
    process.exit(1)
  })
}
