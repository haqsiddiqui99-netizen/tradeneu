/**
 * Initialize TimescaleDB schema (hypertables for ticks + bars).
 *
 * Usage:
 *   npm run market:timescale:init
 *
 * Requires TIMESCALE_DATABASE_URL or DATABASE_URL in `.env.local`.
 */

import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { initTimescaleSchema, testTimescaleConnection, closeTimescalePool } from '../server/providers/marketTimescaleDb.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

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

async function main() {
  loadEnvLocal()
  const conn =
    process.env.TIMESCALE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim()
  if (!conn) {
    console.error('[timescale:init] Set TIMESCALE_DATABASE_URL or DATABASE_URL in .env.local')
    process.exitCode = 1
    return
  }

  try {
    await initTimescaleSchema()
    const probe = await testTimescaleConnection()
    console.log('[timescale:init] Schema ready.', probe.now ? `Server time: ${probe.now}` : '')
  } catch (err) {
    console.error('[timescale:init] Failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await closeTimescalePool()
  }
}

main()
