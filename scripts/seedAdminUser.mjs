#!/usr/bin/env node
/**
 * One-off admin account seed for Railway console or local server-data.
 *
 * Usage:
 *   ADMIN_EMAILS=admin@example.com ADMIN_BOOTSTRAP_PASSWORD='secret' node scripts/seedAdminUser.mjs
 *   node scripts/seedAdminUser.mjs --email admin@example.com --password 'secret'
 *
 * Requires the historic API data dir (same as server/historicGoldApi.mjs).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootstrapAdminUsers } from '../server/auth/bootstrapAdmin.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const out = { email: '', password: '', force: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--email' && argv[i + 1]) out.email = argv[++i]
    else if (a === '--password' && argv[i + 1]) out.password = argv[++i]
    else if (a === '--force') out.force = true
  }
  return out
}

function resolveDataDir() {
  const fromEnv = process.env.MARKET_DATA_DIR?.trim()
  if (fromEnv) return fromEnv
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    return path.join('/data', 'server-data')
  }
  return path.join(__dirname, '..', 'server-data')
}

const args = parseArgs(process.argv)
if (args.email && !process.env.ADMIN_EMAILS) {
  process.env.ADMIN_EMAILS = args.email
}
if (args.password && !process.env.ADMIN_BOOTSTRAP_PASSWORD) {
  process.env.ADMIN_BOOTSTRAP_PASSWORD = args.password
}
if (args.force) {
  process.env.ADMIN_BOOTSTRAP_RESET = '1'
}

if (!process.env.ADMIN_EMAILS?.trim()) {
  console.error('Set ADMIN_EMAILS or pass --email admin@example.com')
  process.exit(1)
}
if (!process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim()) {
  console.error('Set ADMIN_BOOTSTRAP_PASSWORD or pass --password')
  process.exit(1)
}

const dataDir = resolveDataDir()
await bootstrapAdminUsers(dataDir)
console.log(`[seed-admin] done (data dir: ${dataDir})`)
