/**
 * Market + historic data API (Node). Run: npm run server:historic
 *
 * Gold CSV:
 *   POST /api/historic/gold/upload — multipart field "file" (CSV body)
 *   GET  /api/historic/gold/bars  — uploaded JSON (404 if none)
 *   DELETE /api/historic/gold/upload
 *
 * Third-party chain (extend providers in server/providers/):
 *   GET /api/market/bars?symbol=AAPL&chain=twelvedata (default; add upload,tv if needed)
 *   GET /api/market/providers — provider ids + hints
 *
 * Twelve Data: set TWELVE_DATA_API_KEY (server env only). Optional `.env.local` at repo root
 * is loaded here (gitignored via `*.local`). Override chain with MARKET_BAR_CHAIN.
 * Optional: TWELVE_DATA_OUTPUT_SIZE, MARKET_CHART_RANGE / MARKET_CHART_INTERVAL (or legacy MARKET_YAHOO_*).
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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'server-data')
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
    res.json({ ok: true })
  } catch {
    res.status(500).json({ ok: false })
  }
})

const DEFAULT_CHAIN = process.env.MARKET_BAR_CHAIN?.trim() || 'twelvedata'

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
  try {
    const out = await resolveMarketBars({ symbol, chain, chartRange, chartInterval })
    if (!out.ok) {
      res.status(404).json({
        ok: false,
        error: out.error,
        provider_chain: out.chain,
        chain: out.chain,
      })
      return
    }
    res.setHeader('Cache-Control', 'no-store')
    res.json({
      ok: true,
      symbol,
      timeframe: out.timeframe,
      source: out.source,
      provider_chain: out.chain,
      twelve_data_request: out.twelve_data_request,
      bars: out.bars,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

app.get('/api/market/providers', (_req, res) => {
  res.json({
    ok: true,
    providers: [
      { id: 'twelvedata', description: 'Twelve Data time_series (stocks, FX, crypto, metals; TWELVE_DATA_API_KEY)' },
      { id: 'upload', description: 'CSV uploaded to server (gold-bars.json)' },
      { id: 'tv', description: 'TradingView / UDF stub — implement licensed feed' },
    ],
    default_chain: DEFAULT_CHAIN,
    env: {
      MARKET_BAR_CHAIN: process.env.MARKET_BAR_CHAIN || null,
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

const PORT = Number(process.env.HISTORIC_API_PORT || 3001)
app.listen(PORT, '127.0.0.1', () => {
  const keyOk = Boolean(process.env.TWELVE_DATA_API_KEY?.trim())
  console.log(`[market-data] http://127.0.0.1:${PORT}`)
  console.log(`  Default MARKET_BAR_CHAIN: ${DEFAULT_CHAIN}`)
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
  console.log(`  GET /api/historic/identity  |  GET /api/market/bars?symbol=AAPL  |  GET /api/market/providers`)
  console.log(`  Gold CSV: POST/GET/DELETE /api/historic/gold/*`)
})
