/**
 * One terminal: historic market API + Vite (Vite runs with VITE_SKIP_HISTORIC_API so port is not double-bound).
 * Usage: npm run dev   (same script as legacy npm run dev:full)
 *
 * Default API port is 3100 (see scripts/historicApiPort.mjs) — avoids Windows Hyper-V reserved 2921–3020.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { historicApiIdentityOk } from './historicIdentityProbe.mjs'
import { resolveHistoricApiPort } from './historicApiPort.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const historicScript = path.join(root, 'server', 'historicGoldApi.mjs')
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const PORT = resolveHistoricApiPort()

function readEnvLocalAdminEmails() {
  const envPath = path.join(root, '.env.local')
  try {
    if (!fs.existsSync(envPath)) return 0
    const text = fs.readFileSync(envPath, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      if (key !== 'ADMIN_EMAILS') continue
      const val = trimmed.slice(eq + 1).trim()
      if (!val) return 0
      return val.split(',').map((s) => s.trim()).filter(Boolean).length
    }
  } catch {
    /* noop */
  }
  return 0
}

function fetchHistoricIdentity(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/api/historic/identity`, (res) => {
      let buf = ''
      res.on('data', (c) => {
        buf += c
      })
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf))
        } catch {
          resolve(null)
        }
      })
    })
    req.setTimeout(1500, () => {
      try {
        req.destroy()
      } catch {
        /* noop */
      }
      resolve(null)
    })
    req.on('error', () => resolve(null))
  })
}

function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host })
    const done = (ok) => {
      s.removeAllListeners()
      try {
        s.destroy()
      } catch {
        /* noop */
      }
      resolve(ok)
    }
    s.setTimeout(800)
    s.once('connect', () => done(true))
    s.once('timeout', () => done(false))
    s.once('error', () => done(false))
  })
}

let historicChild = null
let viteChild = null

function shutdown(code = 0) {
  if (viteChild && !viteChild.killed) {
    try {
      viteChild.kill('SIGTERM')
    } catch {
      /* noop */
    }
  }
  if (historicChild && !historicChild.killed) {
    try {
      historicChild.kill('SIGTERM')
    } catch {
      /* noop */
    }
  }
  process.exit(code)
}

const alreadyUp = await portOpen(PORT)
if (alreadyUp) {
  const ours = await historicApiIdentityOk(PORT)
  if (!ours) {
    console.error(
      `[dev] 127.0.0.1:${PORT} is in use by another program (not this repo’s historic API).\n` +
        `  Free port ${PORT}, then run: npm run server:historic\n` +
        '  Or stop the other service and retry npm run dev',
    )
    process.exit(1)
  }
  console.log(`[dev] 127.0.0.1:${PORT} — verified Tradeneu historic API. Starting Vite only.`)
  const expectedAdmins = readEnvLocalAdminEmails()
  const identity = await fetchHistoricIdentity(PORT)
  const configured = Number(identity?.adminEmailsConfigured) || 0
  if (expectedAdmins > 0 && configured === 0) {
    console.warn(
      `[dev] ADMIN_EMAILS is set in .env.local but the API on port ${PORT} was started without it.\n` +
        `  Admin login will fail until you restart the historic API:\n` +
        `    netstat -ano | findstr :${PORT}\n` +
        `    taskkill /PID <pid> /F\n` +
        '  Then run: npm run dev',
    )
  }
} else {
  console.log(`[dev] Starting historic API on 127.0.0.1:${PORT}…`)
  historicChild = spawn(process.execPath, [historicScript], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, HISTORIC_API_PORT: String(PORT) },
  })
  historicChild.on('error', (err) => {
    console.error('[dev] Failed to spawn historic API:', err.message)
    shutdown(1)
  })
  historicChild.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGINT') return
    if (code != null && code !== 0) {
      console.error(`[dev] historic API exited code=${code} signal=${signal ?? ''}`)
      shutdown(code ?? 1)
    }
  })
  const started = Date.now()
  const timeoutMs = 60_000
  let up = false
  while (Date.now() - started < timeoutMs) {
    if (await portOpen(PORT)) {
      up = true
      break
    }
    const elapsed = Date.now() - started
    if (elapsed > 0 && elapsed % 10_000 < 200) {
      console.log(`[dev] Waiting for historic API… (${Math.round(elapsed / 1000)}s)`)
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  if (!up) {
    console.error(
      `[dev] Timed out waiting for historic API on 127.0.0.1:${PORT}.\n` +
        '  1) In another terminal: npm run server:historic   (check for errors)\n' +
        `  2) If port is stuck: netstat -ano | findstr :${PORT}   then end that PID\n` +
        '  3) Or start historic first, then run: npm run dev',
    )
    shutdown(1)
  }
  console.log(`[dev] Historic API ready — http://127.0.0.1:${PORT}/api/market/providers`)
}

viteChild = spawn(process.execPath, [viteBin], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_SKIP_HISTORIC_API: '1', HISTORIC_API_PORT: String(PORT) },
})

viteChild.on('exit', (code) => {
  shutdown(code ?? 0)
})

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
