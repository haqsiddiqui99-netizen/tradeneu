/**
 * Copy TradingView chart library static assets from the git submodule into public/.
 * Run automatically before build; also available as `npm run tv:sync`.
 *
 * Works with either package, because they ship the same file names:
 *   - Advanced Charts  (tradingview/charting_library)  — reports itself as `CL v…`
 *   - Trading Platform (tradingview/trading_terminal)  — reports itself as `TP v…`
 * Only Trading Platform implements multi-chart layouts; on Advanced Charts
 * `setLayout()` is present but a silent no-op, so the sync logs which one is in place.
 *
 * Default: skip with exit 0 when the submodule is absent (CI without TV access).
 * Pass --strict to fail (local dev when VITE_USE_TV_CHART=1).
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vendor = path.join(root, 'vendor', 'charting_library')
const dest = path.join(root, 'public', 'charting_library')

/**
 * Both packages nest the assets one level down, but not always under the same name, so
 * locate the directory by the file that must be in it rather than by a hard-coded path.
 */
function resolveSrc() {
  const candidates = [
    path.join(vendor, 'charting_library'),
    path.join(vendor, 'trading_terminal'),
    vendor,
  ]
  return candidates.find((dir) => existsSync(path.join(dir, 'charting_library.standalone.js'))) ?? candidates[0]
}

const src = resolveSrc()

/** `CL v32.0.0` / `TP v32.0.0` from the package's own manifest, for the sync log. */
function flavour(dir) {
  try {
    const desc = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).description ?? ''
    const tag = /\b(CL|TP) v[\d.]+/.exec(desc)?.[0]
    if (!tag) return null
    return tag.startsWith('TP')
      ? `${tag} (Trading Platform — native multi-chart available)`
      : `${tag} (Advanced Charts — single chart only, setLayout() is a no-op)`
  } catch {
    return null
  }
}
const headerCssSrc = path.join(root, 'public', 'chart', 'tv-header-overrides.css')
const headerCssDest = path.join(dest, 'tv-header-overrides.css')
const strict =
  process.argv.includes('--strict') ||
  process.env.VITE_USE_TV_CHART === '1' ||
  process.env.VITE_USE_TV_CHART === 'true'

function fail(msg) {
  console.error(`[tv-chart] ${msg}`)
  process.exit(1)
}

function skip(msg) {
  console.warn(`[tv-chart] ${msg}`)
  process.exit(0)
}

function publicBundleReady() {
  const standalonePublic = path.join(dest, 'charting_library.standalone.js')
  const bundlesPublic = path.join(dest, 'bundles')
  return (
    existsSync(standalonePublic) &&
    statSync(standalonePublic).size >= 10_000 &&
    existsSync(bundlesPublic)
  )
}

/** Skip re-copy when public/ already matches the vendor bundle (avoids EBUSY on Windows). */
function publicBundleMatchesVendor() {
  const standaloneDest = path.join(dest, 'charting_library.standalone.js')
  const standaloneSrcFile = path.join(src, 'charting_library.standalone.js')
  if (!existsSync(standaloneDest) || !existsSync(standaloneSrcFile)) return false
  try {
    const a = statSync(standaloneDest)
    const b = statSync(standaloneSrcFile)
    return a.size === b.size && a.mtimeMs >= b.mtimeMs - 1000
  } catch {
    return false
  }
}

/**
 * The header override stylesheet is ours, not vendored, so it changes far more often
 * than the library bundle. Copy it on every run — otherwise an edit never reaches
 * public/charting_library/ (the URL the chart iframe loads) while the bundle is current.
 */
function syncHeaderCss() {
  if (!existsSync(headerCssSrc) || !existsSync(dest)) return
  try {
    copyFileSync(headerCssSrc, headerCssDest)
  } catch (err) {
    console.warn(`[tv-chart] could not refresh tv-header-overrides.css: ${err?.code ?? err}`)
  }
}

function removeDestTree() {
  if (!existsSync(dest)) return
  try {
    rmSync(dest, { recursive: true, force: true })
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : ''
    if (code === 'EBUSY' || code === 'EPERM') {
      if (publicBundleReady()) {
        console.warn(
          `[tv-chart] could not replace public/charting_library (${code}: file in use) — using existing copy`,
        )
        return false
      }
    }
    throw err
  }
  return true
}

if (!existsSync(src)) {
  if (publicBundleReady()) {
    syncHeaderCss()
    console.log('[tv-chart] using committed public/charting_library (submodule not in build context)')
    process.exit(0)
  }
  const hint =
    'vendor/charting_library assets missing.\n' +
    '  Run: git submodule update --init --recursive && npm run tv:sync\n' +
    '  You need GitHub access to tradingview/charting_library (Advanced Charts)\n' +
    '  or tradingview/trading_terminal (Trading Platform, required for multi-chart).'
  if (strict) fail(hint)
  skip('Skipping TV chart library sync (submodule not present). Lightweight Charts build continues.')
}

const standaloneSrc = path.join(src, 'charting_library.standalone.js')
if (!existsSync(standaloneSrc) || statSync(standaloneSrc).size < 10_000) {
  const hint = 'vendor charting_library.standalone.js missing or incomplete — re-init the submodule.'
  if (strict) fail(hint)
  skip(`Skipping TV chart library sync (${hint})`)
}

if (publicBundleMatchesVendor()) {
  syncHeaderCss()
  const current = flavour(dest)
  console.log(
    `[tv-chart] public/charting_library already up to date — skip sync${current ? ` — ${current}` : ''}`,
  )
  process.exit(0)
}

const removed = removeDestTree()
if (!removed && publicBundleReady()) {
  syncHeaderCss()
  process.exit(0)
}

mkdirSync(path.dirname(dest), { recursive: true })
cpSync(src, dest, { recursive: true })

syncHeaderCss()

const standaloneDest = path.join(dest, 'charting_library.standalone.js')
const bundlesDest = path.join(dest, 'bundles')
if (!existsSync(standaloneDest) || statSync(standaloneDest).size < 10_000) {
  fail('sync failed — charting_library.standalone.js not present in public/charting_library')
}
if (!existsSync(bundlesDest)) {
  fail('sync failed — public/charting_library/bundles missing')
}

const tag = flavour(dest)
console.log(`[tv-chart] synced → public/charting_library${tag ? ` — ${tag}` : ''}`)

