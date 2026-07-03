import { formatSessionModalDate } from '../data/sessionDateRange'
import type { StoredSession } from '../data/sessionStore'
import { propStatusLabel } from '../prop/propChallengeUi'
import { resolveStrategy } from '../strategy/strategyCatalog'
import './sessionSummaryDialog.css'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatMoney(n: number): string {
  const sign = n < 0 ? '-' : ''
  const v = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}$${v}`
}

function formatTs(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function pnlClass(n: number): string {
  if (n > 0) return 'sx-session-summary-dlg__pnl--up'
  if (n < 0) return 'sx-session-summary-dlg__pnl--down'
  return ''
}

function buildSummaryBody(session: StoredSession): string {
  const range =
    session.startDate || session.endDate
      ? `${formatSessionModalDate(session.startDate)} – ${formatSessionModalDate(session.endDate)}`
      : 'No date range'

  const bt = session.lastBacktest
  const stratName = bt ? (resolveStrategy(bt.strategyId)?.name ?? bt.strategyId) : null
  const replay = session.replayState
  const closed = replay?.account.closedTrades ?? []
  const journalWins = closed.filter((t) => t.pnl > 0).length
  const journalWinRate = closed.length ? ((journalWins / closed.length) * 100).toFixed(0) : null

  let backtestSection = `<p class="sx-session-summary-dlg__empty">No backtest run yet.</p>`
  if (bt) {
    const winPct = Number.isFinite(bt.winRate) ? bt.winRate.toFixed(1) : '0'
    backtestSection = `<dl class="sx-session-summary-dlg__grid">
      <div><dt>Net P&amp;L</dt><dd class="${pnlClass(bt.netPnl)}">${formatMoney(bt.netPnl)}</dd></div>
      <div><dt>Trades</dt><dd>${bt.totalTrades}</dd></div>
      <div><dt>Win rate</dt><dd>${winPct}%</dd></div>
      <div><dt>Strategy</dt><dd>${escapeHtml(stratName ?? '—')}</dd></div>
      <div><dt>Ran at</dt><dd>${escapeHtml(formatTs(bt.ranAt))}</dd></div>
    </dl>`
  }

  let journalSection = `<p class="sx-session-summary-dlg__empty">No paper trades yet.</p>`
  if (replay && (closed.length > 0 || replay.account.realizedPnL !== 0)) {
    journalSection = `<dl class="sx-session-summary-dlg__grid">
      <div><dt>Realized P&amp;L</dt><dd class="${pnlClass(replay.account.realizedPnL)}">${formatMoney(replay.account.realizedPnL)}</dd></div>
      <div><dt>Closed trades</dt><dd>${closed.length}</dd></div>
      <div><dt>Win rate</dt><dd>${journalWinRate != null ? `${journalWinRate}%` : '—'}</dd></div>
      <div><dt>Cash</dt><dd>${formatMoney(replay.account.cash)}</dd></div>
      <div><dt>Last saved</dt><dd>${escapeHtml(formatTs(replay.savedAt))}</dd></div>
    </dl>`
  }

  let propSection = ''
  if (session.sessionType === 'prop') {
    propSection = `<section class="sx-session-summary-dlg__section" aria-label="Prop challenge">
      <h3 class="sx-session-summary-dlg__section-title">Prop challenge</h3>
      <dl class="sx-session-summary-dlg__grid">
        <div><dt>Status</dt><dd>${escapeHtml(propStatusLabel(session.propResult?.status))}</dd></div>
        <div><dt>Profit target</dt><dd>${session.propRules?.profitTargetPct ?? 10}%</dd></div>
        <div><dt>Max drawdown</dt><dd>${session.propRules?.maxDrawdownPct ?? 5}%</dd></div>
        <div><dt>Daily loss limit</dt><dd>${session.propRules?.maxDailyLossPct ?? 2}%</dd></div>
      </dl>
    </section>`
  }

  const strategyLine = session.lastStrategyId
    ? resolveStrategy(session.lastStrategyId)?.name ?? session.lastStrategyId
    : '—'

  return `
    <section class="sx-session-summary-dlg__section" aria-label="Session overview">
      <h3 class="sx-session-summary-dlg__section-title">Overview</h3>
      <dl class="sx-session-summary-dlg__grid">
        <div><dt>Type</dt><dd>${session.sessionType === 'prop' ? 'Prop firm' : 'Backtesting'}</dd></div>
        <div><dt>Symbol</dt><dd>${escapeHtml(session.assets)}</dd></div>
        <div><dt>Balance</dt><dd>${escapeHtml(session.balance)}</dd></div>
        <div><dt>Date range</dt><dd>${escapeHtml(range)}</dd></div>
        <div><dt>Last strategy</dt><dd>${escapeHtml(strategyLine)}</dd></div>
        <div><dt>Last opened</dt><dd>${escapeHtml(formatTs(session.lastOpenedAt ?? session.updatedAt))}</dd></div>
      </dl>
    </section>
    <section class="sx-session-summary-dlg__section" aria-label="Backtest">
      <h3 class="sx-session-summary-dlg__section-title">Last backtest</h3>
      ${backtestSection}
    </section>
    <section class="sx-session-summary-dlg__section" aria-label="Paper journal">
      <h3 class="sx-session-summary-dlg__section-title">Paper journal</h3>
      ${journalSection}
    </section>
    ${propSection}
  `
}

let dialogEl: HTMLDialogElement | null = null
let titleEl: HTMLElement | null = null
let metaEl: HTMLElement | null = null
let bodyEl: HTMLElement | null = null

function ensureDialog(): HTMLDialogElement {
  if (dialogEl) return dialogEl

  dialogEl = document.createElement('dialog')
  dialogEl.className = 'sx-session-summary-dlg'
  dialogEl.setAttribute('aria-labelledby', 'sx-session-summary-title')
  dialogEl.innerHTML = `
    <div class="sx-session-summary-dlg__panel" role="document">
      <div class="sx-session-summary-dlg__head">
        <div>
          <h2 class="sx-session-summary-dlg__title" id="sx-session-summary-title"></h2>
          <p class="sx-session-summary-dlg__meta" id="sx-session-summary-meta"></p>
        </div>
        <button type="button" class="sx-session-summary-dlg__close" data-sx-session-summary-close aria-label="Close">×</button>
      </div>
      <div data-sx-session-summary-body></div>
      <div class="sx-session-summary-dlg__actions">
        <button type="button" class="sx-session-summary-dlg__btn sx-session-summary-dlg__btn--ghost" data-sx-session-summary-close-btn>Close</button>
        <button type="button" class="sx-session-summary-dlg__btn" data-sx-session-summary-open>Open chart</button>
      </div>
    </div>
  `
  document.body.appendChild(dialogEl)

  titleEl = dialogEl.querySelector('#sx-session-summary-title')
  metaEl = dialogEl.querySelector('#sx-session-summary-meta')
  bodyEl = dialogEl.querySelector('[data-sx-session-summary-body]')

  const close = () => dialogEl?.close()
  dialogEl.querySelector('[data-sx-session-summary-close]')?.addEventListener('click', close)
  dialogEl.querySelector('[data-sx-session-summary-close-btn]')?.addEventListener('click', close)
  dialogEl.addEventListener('cancel', (e) => {
    e.preventDefault()
    close()
  })

  return dialogEl
}

export type SessionSummaryDialogOptions = {
  session: StoredSession
  onOpenChart?: (session: StoredSession) => void
}

export function openSessionSummaryDialog(opts: SessionSummaryDialogOptions): void {
  const dlg = ensureDialog()
  if (titleEl) titleEl.textContent = opts.session.name
  if (metaEl) {
    metaEl.textContent = `${opts.session.sessionType === 'prop' ? 'Prop firm' : 'Backtest'} · ${opts.session.assets}`
  }
  if (bodyEl) bodyEl.innerHTML = buildSummaryBody(opts.session)

  const openBtn = dlg.querySelector('[data-sx-session-summary-open]') as HTMLButtonElement | null
  if (openBtn) {
    const clone = openBtn.cloneNode(true) as HTMLButtonElement
    openBtn.replaceWith(clone)
    clone.addEventListener('click', () => {
      dlg.close()
      opts.onOpenChart?.(opts.session)
    })
  }

  dlg.showModal()
  requestAnimationFrame(() => {
    ;(dlg.querySelector('[data-sx-session-summary-close]') as HTMLButtonElement | null)?.focus()
  })
}
