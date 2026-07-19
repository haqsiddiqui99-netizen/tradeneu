/**
 * Download Dukascopy data via the dukascopy-node CLI (more reliable than getHistoricalRates on some networks).
 */

import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { appSymbolToDukascopyInstrument } from './dukascopy.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..', '..')
const DEFAULT_WORK_DIR = path.join(ROOT, 'server-data', 'sync-tmp')
const DEFAULT_CACHE = path.join(ROOT, 'server-data', 'dukascopy-cache')

function cliEnabled() {
  const v = process.env.MARKET_SYNC_USE_CLI?.trim().toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'no'
}

function cliRetries() {
  return Math.min(8, Math.max(0, Number.parseInt(process.env.MARKET_SYNC_CLI_RETRIES || '4', 10) || 4))
}

function cliRetryPauseMs() {
  return Math.min(30_000, Math.max(500, Number.parseInt(process.env.MARKET_SYNC_CLI_RETRY_PAUSE_MS || '2500', 10) || 2500))
}

function toYmd(sec) {
  return new Date(Math.floor(sec) * 1000).toISOString().slice(0, 10)
}

/** CLI `-to` is the end calendar day (inclusive span with `-from`). */
function toYmdInclusiveEnd(endSec) {
  return toYmd(endSec)
}

/**
 * @param {string[]} args dukascopy-node CLI args (without node/npx)
 * @param {number} [timeoutMs]
 */
function runDukascopyCli(args, timeoutMs = 600_000) {
  const bin = path.join(ROOT, 'node_modules', 'dukascopy-node', 'dist', 'cli', 'index.js')
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += String(d)
    })
    child.stderr?.on('data', (d) => {
      stderr += String(d)
    })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`dukascopy CLI timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else {
        const detail = (stderr || stdout).trim().split('\n').slice(-4).join(' ')
        reject(new Error(detail || `dukascopy CLI exited code ${code}`))
      }
    })
  })
}

/**
 * @param {object} p
 * @param {string} p.symbol
 * @param {number} p.startSec
 * @param {number} p.endSec
 * @param {'tick'|'m1'|'h1'|'d1'|'mn1'} p.timeframe
 * @param {string} [p.workDir]
 */
export async function fetchDukascopyViaCli({ symbol, startSec, endSec, timeframe, workDir }) {
  if (!cliEnabled()) return { ok: false, code: 'cli_disabled' }

  const instrument = appSymbolToDukascopyInstrument(symbol)
  if (!instrument) return { ok: false, code: 'unmapped_symbol', error: 'unmapped symbol' }

  const dir = workDir || DEFAULT_WORK_DIR
  const cachePath = process.env.DUKASCOPY_CACHE_PATH?.trim() || DEFAULT_CACHE
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(cachePath, { recursive: true })

  const from = toYmd(startSec)
  const to = toYmdInclusiveEnd(endSec)
  const tag = `${instrument}-${timeframe}-${from}-${to}-${Date.now()}`
  /** CLI `-fn` is a base name; it appends `.{format}` (e.g. `.json`). */
  const fileBase = tag

  const args = [
    '-i',
    instrument,
    '-from',
    from,
    '-to',
    to,
    '-t',
    timeframe,
    '-f',
    'json',
    '-dir',
    dir,
    '-fn',
    fileBase,
    '-s',
    '-ch',
    '-chpath',
    cachePath,
    '-r',
    String(cliRetries()),
    '-rp',
    String(cliRetryPauseMs()),
    '-bs',
    String(Math.min(10, Math.max(2, Number.parseInt(process.env.DUKASCOPY_BATCH_SIZE || '5', 10) || 5))),
    '-bp',
    String(Math.min(5000, Math.max(500, Number.parseInt(process.env.DUKASCOPY_BATCH_PAUSE_MS || '1500', 10) || 1500))),
  ]

  const tickTimeout = Math.max(
    120_000,
    Number.parseInt(process.env.MARKET_SYNC_CLI_TICK_TIMEOUT_MS || '900000', 10) || 900_000,
  )
  const barTimeout = Math.max(
    60_000,
    Number.parseInt(process.env.MARKET_SYNC_CLI_BAR_TIMEOUT_MS || '300000', 10) || 300_000,
  )
  const timeoutMs = timeframe === 'tick' ? tickTimeout : barTimeout

  try {
    await runDukascopyCli(args, timeoutMs)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, code: 'cli_error', error: msg }
  }

  const filePath = path.join(dir, `${fileBase}.json`)

  function readCliRows(targetPath) {
    if (!fs.existsSync(targetPath)) return null
    const raw = fs.readFileSync(targetPath, 'utf8').trim()
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  let rows = readCliRows(filePath)
  if (rows === null) {
    const fallback = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${instrument}-${timeframe}-${from}-${to}`) && f.endsWith('.json'))
      .map((f) => path.join(dir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
    if (!fallback) {
      return { ok: false, code: 'cli_no_file', error: 'CLI finished but output file missing' }
    }
    rows = readCliRows(fallback)
    if (rows === null) {
      return { ok: false, code: 'cli_bad_file', error: 'CLI output file unreadable' }
    }
    try {
      fs.unlinkSync(fallback)
    } catch {
      /* temp cleanup optional */
    }
    return { ok: true, rows, source: 'dukascopy:cli' }
  }

  try {
    fs.unlinkSync(filePath)
  } catch {
    /* temp cleanup optional */
  }
  return { ok: true, rows, source: 'dukascopy:cli' }
}

export { cliEnabled }
