import { createStockChart } from './stockChart'
import { fetchMarketBarsForStockApp } from '../data/marketDataClient'
import {
  addWatchlistSymbol,
  fetchWatchlist,
  fetchWatchlistQuotes,
  removeWatchlistSymbol,
  type QuoteRow,
} from './yahooClient'

const TIMEFRAMES = [
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1h' },
  { id: '1d', label: '1D' },
  { id: '1w', label: '1W' },
  { id: '1M', label: '1M' },
] as const

type TfId = (typeof TIMEFRAMES)[number]['id']

function el(html: string) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild as HTMLElement
}

export type MountStockOpts = {
  /** Return to FX-style dashboard; omit for standalone markets (dark theme home). */
  onBack?: () => void
}

export function mountStockApp(root: HTMLElement, opts?: MountStockOpts): () => void {
  document.documentElement.setAttribute('data-theme', 'night')

  const backBtn =
    opts?.onBack != null
      ? `<button type="button" class="btn btn-ghost btn-sm gap-1 shrink-0" data-sx-back aria-label="Back to dashboard">← Home</button>`
      : ''

  root.replaceChildren(
    el(`
<div class="drawer lg:drawer-open min-h-0 h-full">
  <input id="sx-drawer" type="checkbox" class="drawer-toggle" />
  <div class="drawer-content flex flex-col min-h-0 h-full bg-base-100">
    <header class="navbar bg-base-200 border-b border-base-300 shrink-0 gap-2 px-2 py-2">
      ${backBtn}
      <div class="flex-none lg:hidden">
        <label for="sx-drawer" class="btn btn-square btn-ghost drawer-button" aria-label="Open menu">☰</label>
      </div>
      <div class="flex-1 min-w-0">
        <span class="font-bold text-lg tracking-tight text-primary">Suplexity</span>
        <span class="text-base-content/60 text-sm ml-2 hidden sm:inline">Twelve Data · Lightweight Charts</span>
      </div>
      <div class="flex-none flex items-center gap-2">
        <label class="label cursor-pointer gap-2 py-0">
          <span class="label-text text-xs whitespace-nowrap">Auto-refresh</span>
          <input type="checkbox" class="toggle toggle-primary toggle-sm" data-sx-auto />
        </label>
        <span class="text-xs text-base-content/50 hidden md:inline" data-sx-updated>—</span>
      </div>
    </header>

    <div class="flex flex-1 min-h-0 overflow-hidden">
      <aside class="hidden lg:flex flex-col w-72 shrink-0 border-r border-base-300 bg-base-200/80" data-sx-wl-desktop></aside>

      <main class="flex flex-col flex-1 min-w-0 min-h-0 p-2 gap-2">
        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <div class="join" data-sx-tf></div>
          <div class="badge badge-outline badge-lg font-mono" data-sx-symbol>AAPL</div>
          <div class="text-xs text-base-content/50 truncate" data-sx-meta></div>
        </div>
        <div class="alert alert-error py-2 text-sm min-h-0 hidden" data-sx-err></div>
        <div class="flex-1 min-h-0 rounded-lg overflow-hidden border border-base-300 bg-[#0b0e14]" data-sx-chart></div>
        <p class="text-[11px] text-base-content/40 shrink-0 px-1" data-sx-foot>
          OHLCV via Twelve Data (historic API). Watchlist quotes use the ML service. Not investment advice.
        </p>
      </main>
    </div>
  </div>

  <div class="drawer-side z-40 border-r border-base-300 bg-base-200">
    <label for="sx-drawer" aria-label="Close menu" class="drawer-overlay"></label>
    <div class="menu p-4 w-72 min-h-full flex flex-col gap-3 bg-base-200">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/70">Watchlist</h2>
      <div class="join join-vertical w-full gap-2">
        <input type="text" placeholder="Symbol (e.g. NVDA)" class="input input-bordered input-sm join-item w-full font-mono uppercase" data-sx-add-input maxlength="16" />
        <button type="button" class="btn btn-primary btn-sm join-item" data-sx-add>Add</button>
      </div>
      <ul class="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0" data-sx-wl></ul>
    </div>
  </div>
</div>
`),
  )

  const desktopWlHost = root.querySelector('[data-sx-wl-desktop]') as HTMLElement
  desktopWlHost.appendChild(cloneWlPanel())

  const wlPanel = root.querySelector('[data-sx-wl]') as HTMLElement
  const chartHost = root.querySelector('[data-sx-chart]') as HTMLElement
  const symbolBadge = root.querySelector('[data-sx-symbol]') as HTMLElement
  const metaEl = root.querySelector('[data-sx-meta]') as HTMLElement
  const errEl = root.querySelector('[data-sx-err]') as HTMLElement
  const tfHost = root.querySelector('[data-sx-tf]') as HTMLElement
  const autoEl = root.querySelector('[data-sx-auto]') as HTMLInputElement
  const updatedEl = root.querySelector('[data-sx-updated]') as HTMLElement
  const drawer = root.querySelector('#sx-drawer') as HTMLInputElement

  root.querySelector('[data-sx-back]')?.addEventListener('click', () => opts?.onBack?.())

  for (const tf of TIMEFRAMES) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'btn btn-sm join-item'
    b.dataset.sxTf = tf.id
    b.textContent = tf.label
    tfHost.appendChild(b)
  }

  function cloneWlPanel(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'flex flex-col gap-3 p-3 min-h-0 h-full'
    wrap.innerHTML = `
      <h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/70">Watchlist</h2>
      <div class="join join-vertical w-full gap-2">
        <input type="text" placeholder="Symbol" class="input input-bordered input-sm join-item w-full font-mono uppercase" data-sx-add-input-d maxlength="16" />
        <button type="button" class="btn btn-primary btn-sm join-item" data-sx-add-d>Add</button>
      </div>
      <ul class="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0" data-sx-wl-d></ul>
    `
    return wrap
  }

  const desktopWlList = desktopWlHost.querySelector('[data-sx-wl-d]') as HTMLElement
  const desktopAddIn = desktopWlHost.querySelector('[data-sx-add-input-d]') as HTMLInputElement
  const desktopAddBtn = desktopWlHost.querySelector('[data-sx-add-d]') as HTMLButtonElement

  let disposed = false
  let chart = createStockChart(chartHost)
  let selected: string = 'AAPL'
  let interval: TfId = '1m'
  let refreshTimer: ReturnType<typeof setInterval> | null = null
  let quoteTimer: ReturnType<typeof setInterval> | null = null
  const quotesBySym = new Map<string, QuoteRow>()

  function showErr(msg: string | null) {
    if (!msg) {
      errEl.classList.add('hidden')
      errEl.textContent = ''
      return
    }
    errEl.textContent = msg
    errEl.classList.remove('hidden')
  }

  function setTfButtons() {
    tfHost.querySelectorAll<HTMLButtonElement>('[data-sx-tf]').forEach((btn) => {
      const on = btn.dataset.sxTf === interval
      btn.classList.toggle('btn-primary', on)
      btn.classList.toggle('btn-ghost', !on)
    })
  }

  async function loadBars() {
    if (disposed) return
    showErr(null)
    try {
      const res = await fetchMarketBarsForStockApp(selected, interval)
      if (disposed) return
      chart.setBars(res.bars)
      symbolBadge.textContent = res.symbol
      metaEl.textContent = res.meta
      const now = new Date()
      updatedEl.textContent = `Updated ${now.toLocaleTimeString()}`
    } catch (e) {
      showErr(e instanceof Error ? e.message : String(e))
    }
  }

  function renderWatchlist(symbols: string[], highlightNew?: string) {
    const renderInto = (ul: HTMLElement) => {
      ul.replaceChildren()
      for (const sym of symbols) {
        const li = document.createElement('li')
        li.className =
          'wl-row flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer border border-transparent hover:border-primary/40 hover:bg-base-300/50 transition-all duration-200'
        if (sym === selected) li.classList.add('border-primary', 'bg-primary/10')
        const q = quotesBySym.get(sym)
        const ch = q?.changePct
        const chStr =
          ch == null || !Number.isFinite(ch) ? '—' : `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`
        const lastStr = q?.last != null ? q.last.toFixed(2) : '—'
        li.innerHTML = `
          <span class="font-mono font-semibold flex-1 min-w-0 truncate">${sym}</span>
          <span class="text-xs font-mono text-right w-20">${lastStr}</span>
          <span class="text-xs w-14 text-right ${ch != null && ch < 0 ? 'text-error' : 'text-success'}">${chStr}</span>
          <button type="button" class="btn btn-ghost btn-xs btn-square text-base-content/50 hover:text-error" data-sx-rm title="Remove">✕</button>
        `
        li.addEventListener('click', (ev) => {
          if ((ev.target as HTMLElement).closest('[data-sx-rm]')) return
          selected = sym
          closeDrawerMobile()
          void (async () => {
            await refreshQuotes()
            const s = await fetchWatchlist()
            renderWatchlist(s)
            await loadBars()
          })()
        })
        li.querySelector('[data-sx-rm]')?.addEventListener('click', (ev) => {
          ev.stopPropagation()
          void removeRowAnimated(li, sym)
        })
        ul.appendChild(li)
        if (highlightNew === sym) {
          li.animate([{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }], {
            duration: 220,
            easing: 'ease-out',
          })
        }
      }
    }
    renderInto(wlPanel)
    renderInto(desktopWlList)
  }

  async function removeRowAnimated(li: HTMLElement, sym: string) {
    try {
      await li.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.96)' }], {
        duration: 180,
        easing: 'ease-in',
      }).finished
    } catch {
      /* aborted */
    }
    try {
      const syms = await removeWatchlistSymbol(sym)
      if (sym === selected && syms.length) selected = syms[0]!
      if (!syms.length) selected = 'AAPL'
      await refreshQuotes()
      renderWatchlist(syms)
      await loadBars()
    } catch (e) {
      showErr(e instanceof Error ? e.message : String(e))
    }
  }

  function closeDrawerMobile() {
    drawer.checked = false
  }

  async function refreshQuotes() {
    try {
      const quotes = await fetchWatchlistQuotes()
      quotesBySym.clear()
      for (const q of quotes) quotesBySym.set(q.symbol, q)
    } catch {
      /* offline */
    }
  }

  async function initWatchlist() {
    try {
      const symbols = await fetchWatchlist()
      selected = symbols[0] ?? 'AAPL'
      await refreshQuotes()
      renderWatchlist(symbols)
    } catch (e) {
      showErr(
        (e instanceof Error ? e.message : String(e)) +
          ' — Start Python API: npm run ml:venv && npm run ml:install && npm run ml:api',
      )
    }
  }

  async function onAdd(inp: HTMLInputElement) {
    const raw = inp.value.trim().toUpperCase()
    if (!raw) return
    inp.value = ''
    showErr(null)
    try {
      const syms = await addWatchlistSymbol(raw)
      selected = raw
      closeDrawerMobile()
      await refreshQuotes()
      renderWatchlist(syms, raw)
      await loadBars()
    } catch (e) {
      showErr(e instanceof Error ? e.message : String(e))
    }
  }

  const addInput = root.querySelector('[data-sx-add-input]') as HTMLInputElement
  const addBtn = root.querySelector('[data-sx-add]') as HTMLButtonElement
  addBtn.addEventListener('click', () => void onAdd(addInput))
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void onAdd(addInput)
  })
  desktopAddBtn.addEventListener('click', () => void onAdd(desktopAddIn))
  desktopAddIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void onAdd(desktopAddIn)
  })

  tfHost.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-sx-tf]')
    if (!btn?.dataset.sxTf) return
    interval = btn.dataset.sxTf as TfId
    setTfButtons()
    void loadBars()
  })

  function armRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
    if (!autoEl.checked) return
    refreshTimer = setInterval(() => void loadBars(), 30_000)
  }

  autoEl.addEventListener('change', () => {
    armRefresh()
    if (autoEl.checked) void loadBars()
  })

  setTfButtons()
  void initWatchlist().then(() => {
    if (!disposed) void loadBars()
  })

  quoteTimer = setInterval(() => {
    void refreshQuotes().then(() => {
      if (!disposed) void fetchWatchlist().then((s) => renderWatchlist(s))
    })
  }, 60_000)

  return () => {
    disposed = true
    if (refreshTimer) clearInterval(refreshTimer)
    if (quoteTimer) clearInterval(quoteTimer)
    chart.dispose()
  }
}
