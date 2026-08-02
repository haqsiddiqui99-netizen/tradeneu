/**
 * Default historic API port.
 * Avoid 3001 on many Windows setups — Hyper-V / WinNAT often reserves 2921–3020 (listen → EACCES).
 * Override with HISTORIC_API_PORT (shell or `.env.local`).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_HISTORIC_API_PORT = 3100

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Load `.env.local` keys into process.env without overriding existing values. */
function loadEnvLocalOnce() {
  const envPath = path.join(root, '.env.local')
  if (!fs.existsSync(envPath)) return
  let text = ''
  try {
    text = fs.readFileSync(envPath, 'utf8')
  } catch {
    return
  }
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (key && process.env[key] == null) process.env[key] = val
  }
}

loadEnvLocalOnce()

export function resolveHistoricApiPort() {
  // Railway / most PaaS inject PORT. Prefer explicit HISTORIC_API_PORT in local dev.
  const raw = process.env.HISTORIC_API_PORT?.trim() || process.env.PORT?.trim()
  if (raw) {
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && n > 0 && n < 65536) return n
  }
  return DEFAULT_HISTORIC_API_PORT
}

export function historicApiBaseUrl(port = resolveHistoricApiPort(), host = '127.0.0.1') {
  return `http://${host}:${port}`
}
