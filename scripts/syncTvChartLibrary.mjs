/**
 * Copy TradingView Advanced Charts static assets from the git submodule into public/.
 * Run automatically before build; also available as `npm run tv:sync`.
 *
 * Default: skip with exit 0 when the submodule is absent (CI / Vercel without TV access).
 * Pass --strict to fail (local dev when VITE_USE_TV_CHART=1).
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'vendor', 'charting_library', 'charting_library')
const dest = path.join(root, 'public', 'charting_library')
const headerCssSrc = path.join(root, 'public', 'chart', 'tv-header-overrides.css')
const headerCssDest = path.join(dest, 'tv-header-overrides.css')
const strict = process.argv.includes('--strict')

function fail(msg) {
  console.error(`[tv-chart] ${msg}`)
  process.exit(1)
}

function skip(msg) {
  console.warn(`[tv-chart] ${msg}`)
  process.exit(0)
}

if (!existsSync(src)) {
  const hint =
    'vendor/charting_library/charting_library missing.\n' +
    '  Run: git submodule update --init --recursive && npm run tv:sync\n' +
    '  You need GitHub access to tradingview/charting_library.'
  if (strict) fail(hint)
  skip('Skipping TV chart library sync (submodule not present). Lightweight Charts build continues.')
}

const standaloneSrc = path.join(src, 'charting_library.standalone.js')
if (!existsSync(standaloneSrc) || statSync(standaloneSrc).size < 10_000) {
  const hint = 'vendor charting_library.standalone.js missing or incomplete — re-init the submodule.'
  if (strict) fail(hint)
  skip(`Skipping TV chart library sync (${hint})`)
}

if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
mkdirSync(path.dirname(dest), { recursive: true })
cpSync(src, dest, { recursive: true })

if (existsSync(headerCssSrc)) {
  copyFileSync(headerCssSrc, headerCssDest)
}

const standaloneDest = path.join(dest, 'charting_library.standalone.js')
const bundlesDest = path.join(dest, 'bundles')
if (!existsSync(standaloneDest) || statSync(standaloneDest).size < 10_000) {
  fail('sync failed — charting_library.standalone.js not present in public/charting_library')
}
if (!existsSync(bundlesDest)) {
  fail('sync failed — public/charting_library/bundles missing')
}

console.log(`[tv-chart] synced → public/charting_library`)
