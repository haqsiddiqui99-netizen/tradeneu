import type { Bar } from '../types'
import { getMarketSession } from './marketSessionStatus'

export type ChartLegendOhlcRefs = {
  root: HTMLElement
  titleEl: HTMLElement
  statusBtn: HTMLButtonElement
  statusDot: HTMLElement
  ohlcEl: HTMLElement
  oVal: HTMLElement
  hVal: HTMLElement
  lVal: HTMLElement
  cVal: HTMLElement
  chgEl: HTMLElement
}

export function mountChartLegendOhlc(host: HTMLElement): ChartLegendOhlcRefs {
  host.innerHTML = `
    <div class="rw-subbar__tvrow">
      <span class="rw-legend-title" data-rw-legend-title></span>
      <button
        type="button"
        class="rw-legend-status-btn rw-legend-status-btn--open"
        data-rw-market-status
        aria-label="Market hours"
        aria-expanded="false"
      >
        <span class="rw-legend-status-dot" data-rw-market-status-dot aria-hidden="true"></span>
      </button>
      <div class="rw-subbar__ohlc rw-legend-ohlc" data-rw-legend-ohlc>
        <span class="rw-ohlc-grid" data-rw-ohlc-grid>
          <span class="rw-ohlc-cell"><span class="rw-ohlc-lbl">O</span><span class="rw-ohlc-val" data-rw-ohlc-o>—</span></span>
          <span class="rw-ohlc-cell"><span class="rw-ohlc-lbl">H</span><span class="rw-ohlc-val" data-rw-ohlc-h>—</span></span>
          <span class="rw-ohlc-cell"><span class="rw-ohlc-lbl">L</span><span class="rw-ohlc-val" data-rw-ohlc-l>—</span></span>
          <span class="rw-ohlc-cell"><span class="rw-ohlc-lbl">C</span><span class="rw-ohlc-val" data-rw-ohlc-c>—</span></span>
        </span>
        <span class="rw-ohlc-chg" data-rw-ohlc-chg></span>
      </div>
    </div>
  `
  const q = (sel: string) => host.querySelector(sel) as HTMLElement
  return {
    root: host,
    titleEl: q('[data-rw-legend-title]'),
    statusBtn: q('[data-rw-market-status]') as HTMLButtonElement,
    statusDot: q('[data-rw-market-status-dot]'),
    ohlcEl: q('[data-rw-legend-ohlc]'),
    oVal: q('[data-rw-ohlc-o]'),
    hVal: q('[data-rw-ohlc-h]'),
    lVal: q('[data-rw-ohlc-l]'),
    cVal: q('[data-rw-ohlc-c]'),
    chgEl: q('[data-rw-ohlc-chg]'),
  }
}

export function updateChartLegendMarketStatus(refs: ChartLegendOhlcRefs, symbol: string): void {
  const info = getMarketSession(symbol)
  refs.statusBtn.classList.toggle('rw-legend-status-btn--open', info.isOpen)
  refs.statusBtn.classList.toggle('rw-legend-status-btn--closed', !info.isOpen)
  refs.statusBtn.setAttribute('aria-label', info.isOpen ? 'Market open' : 'Market closed')
}

export function findBarAtTime(bars: Bar[], timeSec: number): { bar: Bar; prev: Bar | null } | null {
  if (!bars.length || !Number.isFinite(timeSec)) return null
  let lo = 0
  let hi = bars.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const t = Number(bars[mid]!.time)
    if (t === timeSec) {
      return { bar: bars[mid]!, prev: mid > 0 ? bars[mid - 1]! : null }
    }
    if (t < timeSec) lo = mid + 1
    else hi = mid - 1
  }
  return null
}

export function updateChartLegendOhlc(
  refs: ChartLegendOhlcRefs,
  opts: {
    title: string
    bar: Bar | null
    fmtPrice: (n: number) => string
  },
): void {
  refs.titleEl.textContent = opts.title
  if (!opts.bar) {
    refs.ohlcEl.hidden = true
    refs.oVal.textContent = '—'
    refs.hVal.textContent = '—'
    refs.lVal.textContent = '—'
    refs.cVal.textContent = '—'
    refs.chgEl.textContent = ''
    return
  }

  const b = opts.bar
  const chg = b.close - b.open
  const pct = b.open !== 0 ? (chg / b.open) * 100 : 0
  const up = b.close >= b.open
  refs.ohlcEl.hidden = false
  refs.ohlcEl.classList.toggle('rw-legend-ohlc--up', up)
  refs.ohlcEl.classList.toggle('rw-legend-ohlc--down', !up)

  const p = opts.fmtPrice
  refs.oVal.textContent = p(b.open)
  refs.hVal.textContent = p(b.high)
  refs.lVal.textContent = p(b.low)
  refs.cVal.textContent = p(b.close)

  const sign = chg >= 0 ? '+' : '-'
  const pctSign = pct >= 0 ? '+' : '-'
  refs.chgEl.textContent = `${sign}${p(Math.abs(chg))} (${pctSign}${Math.abs(pct).toFixed(2)}%)`
}
