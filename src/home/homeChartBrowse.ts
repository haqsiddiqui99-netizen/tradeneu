import './homeChartBrowse.css'
import type { Bar } from '../types'
import { fetchMarketBarsSeries } from '../data/marketDataClient'
import { createTradingChart } from '../chart/tradingChart'

const CHART_SYMBOLS = [
  { id: 'xauusd', label: 'XAU/USD', api: 'XAUUSD' },
  { id: 'eurusd', label: 'EUR/USD', api: 'EURUSD' },
  { id: 'btcusd', label: 'BTC/USD', api: 'BTCUSD' },
] as const

function formatPrice(price: number, symbol: string): string {
  const u = symbol.replace('/', '').toUpperCase()
  if (u === 'XAUUSD') return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (u === 'BTCUSD') return price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (u === 'EURUSD') return price.toFixed(4)
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function symbolOptionsHtml(selectedId: string): string {
  return CHART_SYMBOLS.map(
    (s) => `<option value="${s.id}"${s.id === selectedId ? ' selected' : ''}>${s.label}</option>`,
  ).join('')
}

export function buildHomeChartBrowseHtml(featuredId = 'xauusd'): string {
  const featured = CHART_SYMBOLS.find((s) => s.id === featuredId) ?? CHART_SYMBOLS[0]
  return `
<section class="sx-dash-chart-page" data-sx-chart-browse aria-label="Market chart">
  <article class="sx-dash-chart-card sx-dash-card-surface overflow-hidden rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
    <div class="sx-dash-chart-card__toolbar" role="toolbar" aria-label="Chart tools">
      <div class="sx-dash-chart-card__toolbar-left">
        <select class="sx-dash-chart-symbol-select" data-home-chart-symbol aria-label="Symbol">${symbolOptionsHtml(featured.id)}</select>
        <button type="button" class="sx-dash-chart-tool sx-dash-chart-tool--active" data-home-chart-interval="1d" title="Daily">D</button>
        <button type="button" class="sx-dash-chart-tool" data-home-chart-type title="Candlestick chart" aria-label="Candlestick chart">
          <i class="fa-solid fa-chart-column" aria-hidden="true"></i>
        </button>
      </div>
      <div class="sx-dash-chart-legend" data-home-chart-legend>
        <span class="sx-dash-chart-legend__sym" data-home-legend-sym>${featured.label}</span>
        <span class="sx-dash-chart-legend__sep">·</span>
        <span class="sx-dash-chart-legend__ohlc">
          <span>O <strong data-home-legend-o>—</strong></span>
          <span>H <strong data-home-legend-h>—</strong></span>
          <span>L <strong data-home-legend-l>—</strong></span>
          <span>C <strong data-home-legend-c>—</strong></span>
        </span>
        <span class="sx-dash-chart-legend__chg" data-home-legend-chg></span>
      </div>
    </div>
    <div class="sx-dash-chart-stage" data-home-chart-stage>
      <div class="sx-dash-chart-lwc" data-home-chart-lwc role="img" aria-label="Price chart"></div>
    </div>
  </article>
</section>`
}

function updateLegend(root: HTMLElement, label: string, bar: Bar | null) {
  const sym = root.querySelector('[data-home-legend-sym]')
  const o = root.querySelector('[data-home-legend-o]')
  const h = root.querySelector('[data-home-legend-h]')
  const l = root.querySelector('[data-home-legend-l]')
  const c = root.querySelector('[data-home-legend-c]')
  const chg = root.querySelector('[data-home-legend-chg]')
  if (sym) sym.textContent = label
  if (!bar) return
  const fmt = (n: number) => formatPrice(n, label)
  if (o) o.textContent = fmt(bar.open)
  if (h) h.textContent = fmt(bar.high)
  if (l) l.textContent = fmt(bar.low)
  if (c) c.textContent = fmt(bar.close)
  if (chg) {
    const delta = bar.close - bar.open
    const pct = bar.open ? (delta / bar.open) * 100 : 0
    const sign = delta >= 0 ? '+' : '−'
    const pctSign = pct >= 0 ? '+' : '−'
    chg.textContent = `${sign}${fmt(Math.abs(delta))} (${pctSign}${Math.abs(pct).toFixed(2)}%)`
    chg.className = `sx-dash-chart-legend__chg ${pct >= 0 ? 'sx-dash-chart-legend__chg--up' : pct < 0 ? 'sx-dash-chart-legend__chg--down' : ''}`
  }
}

export function wireHomeChartBrowse(root: HTMLElement): () => void {
  const section = root.querySelector('[data-sx-chart-browse]')
  const lwcHost = root.querySelector('[data-home-chart-lwc]') as HTMLElement | null
  if (!section || !lwcHost) return () => {}

  const trading = createTradingChart(lwcHost, { theme: 'terminal-dark' })
  let activeId = 'xauusd'
  let activeInterval = '1d'
  let lastBars: Bar[] = []
  const ro = new ResizeObserver(() => {
    trading.chart.resize(lwcHost.clientWidth, lwcHost.clientHeight)
  })
  ro.observe(lwcHost)

  const load = async (id?: string) => {
    const symDef = CHART_SYMBOLS.find((s) => s.id === (id ?? activeId)) ?? CHART_SYMBOLS[0]
    activeId = symDef.id
    const series = await fetchMarketBarsSeries(symDef.api, undefined, {
      interval: activeInterval,
      range: activeInterval === '1d' ? '6mo' : '5d',
      minBars: 8,
    })
    if (!series?.bars?.length) {
      updateLegend(section as HTMLElement, symDef.label, null)
      return
    }
    lastBars = series.bars
    trading.setSeriesData(series.bars, { fit: true, initialVisibleBarCount: 120 })
    updateLegend(section as HTMLElement, symDef.label, series.bars[series.bars.length - 1] ?? null)
    requestAnimationFrame(() => trading.chart.resize(lwcHost.clientWidth, lwcHost.clientHeight))
  }

  trading.chart.subscribeCrosshairMove((param) => {
    const symDef = CHART_SYMBOLS.find((s) => s.id === activeId) ?? CHART_SYMBOLS[0]
    if (!param.time) {
      updateLegend(section as HTMLElement, symDef.label, lastBars[lastBars.length - 1] ?? null)
      return
    }
    const t = Number(param.time)
    const bar = lastBars.find((b) => Number(b.time) === t) ?? null
    updateLegend(section as HTMLElement, symDef.label, bar)
  })

  const select = root.querySelector<HTMLSelectElement>('[data-home-chart-symbol]')
  select?.addEventListener('change', () => {
    void load(select.value)
  })

  section.querySelectorAll<HTMLButtonElement>('[data-home-chart-interval]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const iv = btn.getAttribute('data-home-chart-interval')
      if (!iv || iv === activeInterval) return
      activeInterval = iv
      section.querySelectorAll('[data-home-chart-interval]').forEach((el) => {
        el.classList.toggle('sx-dash-chart-tool--active', el.getAttribute('data-home-chart-interval') === iv)
      })
      void load(activeId)
    })
  })

  void load('xauusd')

  return () => {
    ro.disconnect()
    trading.dispose()
  }
}
