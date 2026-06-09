import { existsSync } from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { historicApiIdentityOk } from './scripts/historicIdentityProbe.mjs'
import { CHART_PAGE_PATH, HOME_PAGE_PATH, LOGIN_PAGE_PATH } from './src/appPaths'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const historicTarget = 'http://127.0.0.1:3001'
const mlTarget = 'http://127.0.0.1:8001'

/** Log once in a while when the browser hits /api but nothing listens on 3001. */
function historicProxyOnError(proxy: import('http-proxy').Server) {
  let lastLogMs = 0
  proxy.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'ECONNREFUSED') return
    const now = Date.now()
    if (now - lastLogMs < 25_000) return
    lastLogMs = now
    console.error(
      '[vite] /api proxy → 127.0.0.1:3001 refused (historic API not running).\n' +
        '  Run in another terminal: npm run server:historic\n' +
        '  Or use: npm run dev   (starts historic + Vite). "npm run dev:vite" alone does not start port 3001.',
    )
  })
}

const historicApiProxy = {
  target: historicTarget,
  changeOrigin: true,
  configure(proxy) {
    historicProxyOnError(proxy)
  },
} as const

const mlProxy = {
  target: mlTarget,
  changeOrigin: true,
  rewrite: (p: string) => p.replace(/^\/api\/ml/, '') || '/',
} as const

/** True if something accepts TCP connections on host:port (e.g. historic API already running). */
function portHasListener(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host })
    const done = (ok: boolean) => {
      socket.removeAllListeners()
      try {
        socket.destroy()
      } catch {
        /* noop */
      }
      resolve(ok)
    }
    socket.setTimeout(600)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

/** Wait until something listens on `port` (e.g. uvicorn after cold Torch import). */
async function waitForPort(
  port: number,
  opts: { timeoutMs: number; intervalMs: number },
): Promise<boolean> {
  const deadline = Date.now() + opts.timeoutMs
  while (Date.now() < deadline) {
    if (await portHasListener(port)) return true
    await new Promise((r) => setTimeout(r, opts.intervalMs))
  }
  return false
}

function mlVenvPythonPath(): string {
  const mlDir = path.join(__dirname, 'ml-service')
  return process.platform === 'win32'
    ? path.join(mlDir, '.venv', 'Scripts', 'python.exe')
    : path.join(mlDir, '.venv', 'bin', 'python3')
}

/** Start `server/historicGoldApi.mjs` during `vite` dev so `/api/market/bars` proxies work without a second terminal. */
function historicApiSidecar(): Plugin {
  let child: ChildProcess | null = null
  return {
    name: 'historic-api-sidecar',
    apply: 'serve',
    async configureServer() {
      if (process.env.VITE_SKIP_HISTORIC_API === '1') {
        console.log('[historic-api] VITE_SKIP_HISTORIC_API=1 — sidecar disabled.')
        return
      }
      if (await portHasListener(3001)) {
        const ours = await historicApiIdentityOk(3001)
        if (ours) {
          console.log(
            '[historic-api] 127.0.0.1:3001 responds as this repo’s historic API (`npm run server:historic`) — sidecar skipped.',
          )
          return
        }
        console.error(
          '[historic-api] 127.0.0.1:3001 is in use but is NOT `server/historicGoldApi.mjs`.\n' +
            '  Stop the other process on 3001, then run from this repo: npm run server:historic\n' +
            '  (or use npm run dev, which starts historic + Vite). Vite will not start a second historic server while the port is taken.',
        )
        return
      }
      const script = path.join(__dirname, 'server', 'historicGoldApi.mjs')
      child = spawn(process.execPath, [script], {
        cwd: __dirname,
        stdio: 'inherit',
        env: { ...process.env },
      })
      child.on('error', (err) => {
        console.error('[historic-api] spawn error:', err)
      })
      child.on('exit', (code, signal) => {
        if (code != null && code !== 0) {
          console.warn(`[historic-api] process exited code=${code} signal=${signal ?? ''}`)
        }
      })

      const up = await waitForPort(3001, { timeoutMs: 15_000, intervalMs: 120 })
      if (up) {
        console.log('[historic-api] 127.0.0.1:3001 ready (Vite → /api/market/bars).')
      } else {
        console.warn(
          '[historic-api] Timed out waiting for 127.0.0.1:3001 — browser requests to /api/market/bars will show 502 until the server is up.\n' +
            '  Fix: run `npm run server:historic` in another terminal, or free port 3001 and restart Vite. ' +
            'If something else already uses 3001, stop it or set HISTORIC_API_PORT to another port and point Vite proxy at it.',
        )
      }

      return () => {
        if (child && !child.killed) {
          console.log('[historic-api] stopping sidecar…')
          child.kill()
          child = null
        }
      }
    },
  }
}

/** Start `scripts/mlRunner.mjs api` during `vite` dev so `/api/ml` → uvicorn on 8001 works without a second terminal. */
function mlApiSidecar(): Plugin {
  let child: ChildProcess | null = null
  return {
    name: 'ml-api-sidecar',
    apply: 'serve',
    async configureServer() {
      if (process.env.VITE_SKIP_ML_API === '1') {
        console.log('[ml-api] VITE_SKIP_ML_API=1 — sidecar disabled.')
        return
      }
      if (await portHasListener(8001)) {
        console.log('[ml-api] 127.0.0.1:8001 already in use — using existing server.')
        return
      }
      if (!existsSync(mlVenvPythonPath())) {
        console.warn(
          '[ml-api] ml-service/.venv missing — run: npm run ml:venv && npm run ml:install\n' +
            '[ml-api] Or set VITE_SKIP_ML_API=1 to silence /api/ml proxy errors.',
        )
        return
      }
      const runner = path.join(__dirname, 'scripts', 'mlRunner.mjs')
      console.log('[ml-api] starting uvicorn on 127.0.0.1:8001 (first load can take 30–90s)…')
      child = spawn(process.execPath, [runner, 'api'], {
        cwd: __dirname,
        stdio: 'inherit',
        env: { ...process.env },
      })
      child.on('error', (err) => {
        console.error('[ml-api] spawn error:', err)
      })
      child.on('exit', (code, signal) => {
        if (code != null && code !== 0) {
          console.warn(
            `[ml-api] process exited code=${code} signal=${signal ?? ''} — run: npm run ml:venv && npm run ml:install`,
          )
        }
      })
      const up = await waitForPort(8001, { timeoutMs: 120_000, intervalMs: 400 })
      if (up) {
        console.log('[ml-api] 127.0.0.1:8001 ready.')
      } else {
        console.warn(
          '[ml-api] Timed out waiting for 127.0.0.1:8001 — check terminal above for Python errors. ' +
            'Reload the page after uvicorn starts.',
        )
      }

      return () => {
        if (child && !child.killed) {
          console.log('[ml-api] stopping sidecar…')
          child.kill()
          child = null
        }
      }
    },
  }
}

/** Dev/preview: serve `index.html` for SPA routes so the shell loads. */
function spaShellRoutesFallback(): Plugin {
  function rewriteIfSpaRoute(url: string | undefined): string | undefined {
    const rawUrl = url ?? ''
    const pathname = (rawUrl.split('?')[0]?.split('#')[0] ?? '/').replace(/\/$/, '') || '/'
    const lower = pathname.toLowerCase()
    const isSpa =
      pathname === LOGIN_PAGE_PATH ||
      pathname === HOME_PAGE_PATH ||
      pathname === CHART_PAGE_PATH ||
      lower === '/loginpage' ||
      lower === '/homepage' ||
      lower === '/chart'
    if (!isSpa) return undefined
    const q = rawUrl.includes('?') ? `?${rawUrl.split('?').slice(1).join('?')}` : ''
    return `/index.html${q}`
  }

  return {
    name: 'spa-shell-routes-fallback',
    configureServer(server) {
      return () => {
        server.middlewares.use((req, _res, next) => {
          const nextUrl = rewriteIfSpaRoute(req.url)
          if (nextUrl != null) req.url = nextUrl
          next()
        })
      }
    },
    configurePreviewServer(server) {
      return () => {
        server.middlewares.use((req, _res, next) => {
          const nextUrl = rewriteIfSpaRoute(req.url)
          if (nextUrl != null) req.url = nextUrl
          next()
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [historicApiSidecar(), mlApiSidecar(), spaShellRoutesFallback()],
  base: './',
  server: {
    port: 5199,
    strictPort: false,
    proxy: {
      '/api/ml': mlProxy,
      '/api': historicApiProxy,
    },
  },
  preview: {
    port: 4199,
    strictPort: false,
    proxy: {
      '/api/ml': mlProxy,
      '/api': historicApiProxy,
    },
  },
})
