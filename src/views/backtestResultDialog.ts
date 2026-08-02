import './confirmDialog.css'
import type { BacktestResult } from '../backtest/BacktestTypes'
import { formatBacktestMoney } from '../backtest/backtestChartUi'

let dialogEl: HTMLDialogElement | null = null
let titleEl: HTMLElement | null = null
let bodyEl: HTMLElement | null = null
let btnOk: HTMLButtonElement | null = null
let settle: (() => void) | null = null

function ensureDialog(): HTMLDialogElement {
  if (dialogEl) return dialogEl

  dialogEl = document.createElement('dialog')
  dialogEl.className = 'sx-confirm-dlg sx-backtest-result-dlg'
  dialogEl.setAttribute('aria-labelledby', 'sx-backtest-result-title')
  dialogEl.innerHTML = `
    <div class="sx-confirm-dlg__panel sx-backtest-result-dlg__panel" role="document">
      <h2 class="sx-confirm-dlg__title" id="sx-backtest-result-title"></h2>
      <div class="sx-backtest-result-dlg__body" id="sx-backtest-result-body"></div>
      <div class="sx-confirm-dlg__actions">
        <button type="button" class="sx-confirm-dlg__btn sx-confirm-dlg__btn--confirm" data-sx-backtest-ok>OK</button>
      </div>
    </div>
  `
  document.body.appendChild(dialogEl)

  titleEl = dialogEl.querySelector('#sx-backtest-result-title')
  bodyEl = dialogEl.querySelector('#sx-backtest-result-body')
  btnOk = dialogEl.querySelector('[data-sx-backtest-ok]')

  const finish = () => {
    if (!settle) return
    const fn = settle
    settle = null
    dialogEl?.close()
    fn()
  }

  btnOk?.addEventListener('click', finish)
  dialogEl.addEventListener('cancel', (e) => {
    e.preventDefault()
    finish()
  })
  dialogEl.addEventListener('close', () => {
    if (settle) finish()
  })

  return dialogEl
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Modal summary after a backtest run completes. */
export function showBacktestResultDialog(result: BacktestResult): Promise<void> {
  const dlg = ensureDialog()
  if (settle) {
    settle()
    settle = null
  }

  const s = result.summary
  const net = Number.isFinite(s.netPnl) ? s.netPnl : 0
  const pnlClass = net >= 0 ? 'sx-backtest-result-dlg__pnl--up' : 'sx-backtest-result-dlg__pnl--down'
  const fmt = formatBacktestMoney

  if (titleEl) titleEl.textContent = 'Backtest complete'
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="sx-backtest-result-dlg__strategy">${escapeHtml(result.strategy.name)}</div>
      <div class="sx-backtest-result-dlg__pnl ${pnlClass}">${net >= 0 ? '+' : ''}${fmt(net)}</div>
      <div class="sx-backtest-result-dlg__meta">${s.totalTrades} trades · ${result.durationMs}ms</div>
      <dl class="sx-backtest-result-dlg__stats">
        <div><dt>Win rate</dt><dd>${Number.isFinite(s.winRate) ? s.winRate.toFixed(1) : '0.0'}%</dd></div>
        <div><dt>Profit factor</dt><dd>${Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'}</dd></div>
        <div><dt>Sharpe</dt><dd>${Number.isFinite(s.sharpe) ? s.sharpe.toFixed(2) : '0.00'}</dd></div>
        <div><dt>Max drawdown</dt><dd>${Number.isFinite(s.maxDrawdown) ? s.maxDrawdown.toFixed(1) : '0.0'}%</dd></div>
        <div><dt>Avg win</dt><dd>${fmt(s.avgWin)}</dd></div>
        <div><dt>Avg loss</dt><dd>${fmt(s.avgLoss)}</dd></div>
        <div><dt>Best trade</dt><dd>${fmt(s.bestTrade)}</dd></div>
        <div><dt>Worst trade</dt><dd>${fmt(s.worstTrade)}</dd></div>
      </dl>
      <p class="sx-backtest-result-dlg__hint">Entry/exit markers are drawn on the chart (arrows + exit flags).</p>
    `
  }

  return new Promise<void>((resolve) => {
    settle = resolve
    dlg.showModal()
    requestAnimationFrame(() => btnOk?.focus())
  })
}
