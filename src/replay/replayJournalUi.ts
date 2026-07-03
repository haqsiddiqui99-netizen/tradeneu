import { formatBacktestMoney } from '../backtest/backtestChartUi'
import type { ClosedReplayTrade } from './replayPositions'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatTradeDateTime(sec: number): string {
  if (!Number.isFinite(sec)) return '—'
  try {
    return new Date(sec * 1000).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(sec)
  }
}

export function formatReplayExitReason(reason: string): string {
  switch (reason) {
    case 'take_profit':
      return 'Take profit'
    case 'stop_loss':
      return 'Stop loss'
    case 'manual':
      return 'Manual'
    default:
      return reason
  }
}

function csvEscape(value: string | number): string {
  const s = String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export type RenderReplayJournalOpts = {
  fmtPrice?: (n: number) => string
  highlightTradeNum?: number
}

export type ReplayJournalStats = {
  initialCash: number
  equity: number
  realizedPnL: number
  unrealizedPnL: number
  closedTrades: ClosedReplayTrade[]
}

export function renderReplayJournalStats(el: HTMLElement, stats: ReplayJournalStats): void {
  const trades = stats.closedTrades
  const wins = trades.filter((t) => t.pnl > 0).length
  const losses = trades.filter((t) => t.pnl < 0).length
  const winRate = trades.length ? (wins / trades.length) * 100 : 0
  const netPnl = stats.equity - stats.initialCash
  const netCls = netPnl >= 0 ? 'rw-journal-stat__val--up' : 'rw-journal-stat__val--down'

  el.innerHTML = `
    <dl class="rw-journal-stats">
      <div><dt>Equity</dt><dd>${formatBacktestMoney(stats.equity)}</dd></div>
      <div><dt>Net P&amp;L</dt><dd class="${netCls}">${formatBacktestMoney(netPnl)}</dd></div>
      <div><dt>Realized</dt><dd>${formatBacktestMoney(stats.realizedPnL)}</dd></div>
      <div><dt>Unrealized</dt><dd>${formatBacktestMoney(stats.unrealizedPnL)}</dd></div>
      <div><dt>Trades</dt><dd>${trades.length}</dd></div>
      <div><dt>Win rate</dt><dd>${trades.length ? `${winRate.toFixed(1)}%` : '—'} <span class="rw-journal-stat__sub">(${wins}W / ${losses}L)</span></dd></div>
    </dl>
  `
}

export function renderReplayJournal(
  el: HTMLElement,
  trades: ClosedReplayTrade[],
  opts?: RenderReplayJournalOpts,
): void {
  if (!trades.length) {
    el.innerHTML =
      '<p class="rw-session-empty">No closed trades yet. Use <strong>Buy</strong> or <strong>Sell</strong> on the chart, then close from the position overlay or let TP/SL hit.</p>'
    return
  }

  const fmtPrice = opts?.fmtPrice ?? ((n: number) => n.toFixed(2))
  const highlight = opts?.highlightTradeNum
  const rows = [...trades]
    .reverse()
    .map((t) => {
      const win = t.pnl > 0
      const pnlClass = win ? 'rw-trade-log__pnl--win' : 'rw-trade-log__pnl--loss'
      const dirClass = t.direction === 'long' ? 'rw-trade-log__dir--long' : 'rw-trade-log__dir--short'
      const active = highlight === t.tradeNum ? ' rw-trade-log__row--active' : ''
      return `<tr class="rw-trade-log__row rw-replay-journal__row${active}" data-replay-trade-num="${t.tradeNum}" tabindex="0" role="button" title="Jump chart to entry">
        <td class="rw-trade-log__num">${t.tradeNum}</td>
        <td class="rw-trade-log__dir ${dirClass}">${t.direction === 'long' ? 'Long' : 'Short'}</td>
        <td class="rw-trade-log__time">${escapeHtml(formatTradeDateTime(t.entryTime))}</td>
        <td class="rw-trade-log__time">${escapeHtml(formatTradeDateTime(t.exitTime))}</td>
        <td class="rw-trade-log__px">${fmtPrice(t.entryPrice)}</td>
        <td class="rw-trade-log__px">${fmtPrice(t.exitPrice)}</td>
        <td class="rw-trade-log__pnl ${pnlClass}">${formatBacktestMoney(t.pnl)}</td>
        <td class="rw-trade-log__reason">${escapeHtml(formatReplayExitReason(t.exitReason))}</td>
      </tr>`
    })
    .join('')

  el.innerHTML = `
    <div class="rw-trade-log-wrap">
      <table class="rw-trade-log" aria-label="Replay journal trades">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Side</th>
            <th scope="col">Entry</th>
            <th scope="col">Exit</th>
            <th scope="col">In</th>
            <th scope="col">Out</th>
            <th scope="col">PnL</th>
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="rw-trade-log__hint">Click a row to jump the chart to that entry.</p>
  `
}

export function exportReplayJournalCsv(trades: ClosedReplayTrade[], slug = 'replay-journal'): void {
  if (!trades.length) return
  const header = [
    'trade_num',
    'direction',
    'qty',
    'entry_time',
    'exit_time',
    'entry_price',
    'exit_price',
    'pnl',
    'exit_reason',
  ]
  const lines = [header.join(',')]
  for (const t of trades) {
    lines.push(
      [
        t.tradeNum,
        t.direction,
        t.qty,
        t.entryTime,
        t.exitTime,
        t.entryPrice,
        t.exitPrice,
        t.pnl,
        t.exitReason,
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  const date = new Date().toISOString().slice(0, 10)
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug}-${date}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
