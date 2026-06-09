/**
 * One terminal: historic market API on :3001 + Vite (Vite runs with VITE_SKIP_HISTORIC_API so port is not double-bound).
 * Usage: npm run dev   (same script as legacy npm run dev:full)
 */
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { historicApiIdentityOk } from './historicIdentityProbe.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const historicScript = path.join(root, 'server', 'historicGoldApi.mjs')
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')

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

async function waitForPort(port, { timeoutMs, intervalMs }) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await portOpen(port)) return true
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
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

const alreadyUp = await portOpen(3001)
if (alreadyUp) {
  const ours = await historicApiIdentityOk(3001)
  if (!ours) {
    console.error(
      '[dev] 127.0.0.1:3001 is in use by another program (not this repo’s historic API).\n' +
        '  Free port 3001, then run: npm run server:historic\n' +
        '  Or stop the other service and retry npm run dev',
    )
    process.exit(1)
  }
  console.log('[dev] 127.0.0.1:3001 — verified Suplexity historic API. Starting Vite only.')
} else {
  historicChild = spawn(process.execPath, [historicScript], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env },
  })
  historicChild.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGINT') return
    if (code != null && code !== 0) {
      console.error(`[dev] historic API exited code=${code} signal=${signal ?? ''}`)
      shutdown(code ?? 1)
    }
  })
  const up = await waitForPort(3001, { timeoutMs: 20_000, intervalMs: 120 })
  if (!up) {
    console.error(
      '[dev] Timed out waiting for historic API on 127.0.0.1:3001.\n' +
        '  Try: npm run server:historic   (in this folder) and check the terminal for errors.',
    )
    shutdown(1)
  }
  console.log('[dev] Historic API ready — http://127.0.0.1:3001/api/market/providers')
}

viteChild = spawn(process.execPath, [viteBin], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_SKIP_HISTORIC_API: '1' },
})

viteChild.on('exit', (code) => {
  shutdown(code ?? 0)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    shutdown(0)
  })
}
