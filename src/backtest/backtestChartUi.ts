import type { Time, SeriesMarker } from 'lightweight-charts'
import type { Bar } from '../types'
import type { BacktestResult, ExitReason, StrategyDefinition } from './BacktestTypes'
import type { BacktestReplaySnapshot } from './backtestReplaySnapshot'
import { runBacktest, numberTrades } from './BacktestEngine'

export type BacktestRunOptions = {
  bars: Bar[]
  strategy: StrategyDefinition
  initialCapital: number
  commission?: number
  slippage?: number
  onProgress?: (pct: number) => void
  /** 1-based bar index where simulated trading begins (replay cursor / picked date). */
  startBarIndex?: number
}

export function runBacktestOnBars(opts: BacktestRunOptions): BacktestResult {
  const result = runBacktest(opts.bars, opts.strategy, {
    initialCapital: opts.initialCapital,
    commission: opts.commission ?? 0,
    slippage: opts.slippage ?? 0,
    rollingWindow: 20,
    onProgress: opts.onProgress,
    startBarIndex: opts.startBarIndex,
  })
  numberTrades(result)
  return result
}

/** USD with 2 decimal places — shared by backtest modal and session stats panel. */
export function formatBacktestMoney(n: number): string {
  if (!Number.isFinite(n)) return '$0.00'
  const sign = n < 0 ? '-' : ''
  const v = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}$${v}`
}

export function tradeMarkersFromResult(result: BacktestResult): SeriesMarker<Time>[] {
  return tradeMarkersUpToTime(result, Number.POSITIVE_INFINITY)
}

/** Entry/exit markers visible up to replay cursor time (unix seconds). */
export function tradeMarkersUpToTime(result: BacktestResult, barTimeSec: number): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = []
  for (const t of result.trades) {
    if (t.entryTime > barTimeSec) continue
    const win = t.pnl > 0
    const color = win ? '#089981' : '#f23645'
    markers.push({
      time: t.entryTime as Time,
      position: t.direction === 'long' ? 'belowBar' : 'aboveBar',
      color,
      shape: t.direction === 'long' ? 'arrowUp' : 'arrowDown',
      text: t.direction === 'long' ? 'L' : 'S',
      size: 1,
    })
    if (t.exitTime <= barTimeSec) {
      markers.push({
        time: t.exitTime as Time,
        position: t.direction === 'long' ? 'aboveBar' : 'belowBar',
        color,
        shape: 'circle',
        text: `$${Math.round(Number.isFinite(t.pnl) ? t.pnl : 0)}`,
        size: 1,
      })
    }
  }
  markers.sort((a, b) => Number(a.time) - Number(b.time))
  return markers
}

const HEATMAP_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
const HEATMAP_HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // 08:00–19:00 UTC

function heatmapCell(result: BacktestResult, day: number, hour: number) {
  return result.heatmap.find((c) => c.day === day && c.hour === hour) ?? null
}

function buildDiagnosisNarrative(result: BacktestResult): string {
  const { stopHunt: sh, summary: s } = result
  const parts: string[] = []

  if (s.totalTrades === 0) {
    return 'No trades were generated for this strategy on the loaded session. Try a different strategy or widen the session date range.'
  }

  if (sh.count > 0) {
    parts.push(
      `${sh.pct.toFixed(0)}% of losing trades (${sh.count}) were stop-hunted — price recovered to target within 8 bars after your stop. ` +
        `Widening stops toward ${sh.optimalAtrMult.toFixed(1)}× ATR may recover an estimated ${formatBacktestMoney(sh.estimatedRecovery)}.`,
    )
  } else if (s.netPnl < 0) {
    parts.push(
      'Losses were not primarily from stop-hunts. Review entry timing and session filters — weak hours below may be a better lever than wider stops.',
    )
  } else {
    parts.push('Stop-hunt risk was low on this run. Focus on scaling what worked in the green heatmap cells.')
  }

  const ranked = result.heatmap
    .filter((c) => c.tradeCount > 0)
    .sort((a, b) => a.avgPnl - b.avgPnl)

  const worst = ranked.slice(0, 3)
  const best = ranked.slice(-3).reverse()

  if (worst.length) {
    const slots = worst
      .map((c) => `${HEATMAP_DAY_LABELS[c.day] ?? '?'} ${String(c.hour).padStart(2, '0')}:00 UTC (${formatBacktestMoney(c.avgPnl)}/trade)`)
      .join(', ')
    parts.push(`Weakest windows: ${slots}.`)
  }
  if (best.length) {
    const slots = best
      .map((c) => `${HEATMAP_DAY_LABELS[c.day] ?? '?'} ${String(c.hour).padStart(2, '0')}:00 UTC (${formatBacktestMoney(c.avgPnl)}/trade)`)
      .join(', ')
    parts.push(`Strongest windows: ${slots}.`)
  }

  if (s.winRate < 35 && s.profitFactor < 1) {
    parts.push(
      `Win rate ${s.winRate.toFixed(1)}% with profit factor ${s.profitFactor.toFixed(2)} suggests entries are fighting the prevailing move — consider trend filters or fewer sessions.`,
    )
  }

  return parts.join(' ')
}

/** Compact diagnosis for the right-hand session panel. */
export function renderDiagnosisCompact(el: HTMLElement, result: BacktestResult): void {
  const sh = result.stopHunt
  el.innerHTML = `
    <p class="rw-diag__ai rw-diag__ai--compact">${escapeHtml(buildDiagnosisNarrative(result))}</p>
    <dl class="rw-session-kv rw-session-kv--stats">
      <div><dt>Stop-hunted</dt><dd>${sh.pct.toFixed(0)}% (${sh.count})</dd></div>
      <div><dt>Est. recovery</dt><dd>${formatBacktestMoney(sh.estimatedRecovery)}</dd></div>
      <div><dt>Optimal ATR</dt><dd>${sh.optimalAtrMult.toFixed(1)}×</dd></div>
    </dl>
  `
}

/** Loss heatmap + stop-hunt insight (Week 3 diagnosis). */
export function renderDiagnosisPanel(el: HTMLElement, result: BacktestResult): void {
  const { stopHunt: sh } = result
  const maxAbs = Math.max(
    1,
    ...result.heatmap.map((c) => Math.abs(c.avgPnl)),
  )

  const headHours = HEATMAP_HOURS.map((h) => `<span>${h}</span>`).join('')

  const rows = HEATMAP_DAY_LABELS.map((dayLabel, day) => {
    const cells = HEATMAP_HOURS.map((hour) => {
      const cell = heatmapCell(result, day, hour)
      if (!cell || cell.tradeCount === 0) {
        return `<div class="rw-diag-heat__cell rw-diag-heat__cell--empty" title="No trades"></div>`
      }
      const t = cell.avgPnl / maxAbs
      const intensity = Math.min(1, Math.abs(t))
      const hue = cell.avgPnl >= 0 ? '152' : '0'
      const bg = `hsla(${hue}, 70%, 42%, ${0.15 + intensity * 0.65})`
      const title = `${dayLabel} ${hour}:00 · ${cell.tradeCount} trades · avg ${formatBacktestMoney(cell.avgPnl)} · ${cell.winRate.toFixed(0)}% win`
      return `<div class="rw-diag-heat__cell" style="background:${bg}" title="${escapeHtml(title)}"></div>`
    }).join('')
    return `<div class="rw-diag-heat__row"><span class="rw-diag-heat__day">${dayLabel}</span>${cells}</div>`
  }).join('')

  const narrative = buildDiagnosisNarrative(result)

  el.innerHTML = `
    <h3 class="rw-diag__title">Diagnosis</h3>
    <p class="rw-diag__ai">${escapeHtml(narrative)}</p>
    <div class="rw-diag__stats">
      <div><span class="rw-diag__stat-lbl">Stop-hunted</span><span class="rw-diag__stat-val">${sh.pct.toFixed(0)}% (${sh.count})</span></div>
      <div><span class="rw-diag__stat-lbl">Est. recovery</span><span class="rw-diag__stat-val">${formatBacktestMoney(sh.estimatedRecovery)}</span></div>
      <div><span class="rw-diag__stat-lbl">Optimal ATR</span><span class="rw-diag__stat-val">${sh.optimalAtrMult.toFixed(1)}×</span></div>
    </div>
    <p class="rw-diag__heat-lbl">Avg P&amp;L by hour (UTC, Mon–Fri)</p>
    <div class="rw-diag-heat">
      <div class="rw-diag-heat__head"><span></span>${headHours}</div>
      ${rows}
    </div>
    <div class="rw-diag-heat__legend" aria-hidden="true">
      <span class="rw-diag-heat__swatch rw-diag-heat__swatch--loss"></span> Loss
      <span class="rw-diag-heat__swatch rw-diag-heat__swatch--win"></span> Win
    </div>
  `
}

export function renderBacktestSummary(el: HTMLElement, result: BacktestResult): void {
  const s = result.summary
  const net = Number.isFinite(s.netPnl) ? s.netPnl : 0
  const pnlColor = net >= 0 ? '#089981' : '#f23645'
  const fmt = formatBacktestMoney
  el.innerHTML = `
    <div class="rw-backtest-panel__strategy">${escapeHtml(result.strategy.name)}</div>
    <div class="rw-backtest-panel__pnl" style="color:${pnlColor}">
      ${net >= 0 ? '+' : ''}${fmt(net)}
    </div>
    <div class="rw-backtest-panel__meta">${s.totalTrades} trades · ${result.durationMs}ms · ${result.bars.length} bars</div>
    <dl class="rw-backtest-panel__stats">
      <div><dt>Win rate</dt><dd>${Number.isFinite(s.winRate) ? s.winRate.toFixed(1) : '0.0'}%</dd></div>
      <div><dt>Profit factor</dt><dd>${Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'}</dd></div>
      <div><dt>Sharpe</dt><dd>${Number.isFinite(s.sharpe) ? s.sharpe.toFixed(2) : '0.00'}</dd></div>
      <div><dt>Max drawdown</dt><dd class="rw-backtest-panel__neg">${Number.isFinite(s.maxDrawdown) ? s.maxDrawdown.toFixed(1) : '0.0'}%</dd></div>
      <div><dt>Avg win</dt><dd class="rw-backtest-panel__pos">${fmt(s.avgWin)}</dd></div>
      <div><dt>Avg loss</dt><dd class="rw-backtest-panel__neg">${fmt(s.avgLoss)}</dd></div>
      <div><dt>Best trade</dt><dd>${fmt(s.bestTrade)}</dd></div>
      <div><dt>Worst trade</dt><dd>${fmt(s.worstTrade)}</dd></div>
    </dl>
  `
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Compact equity curve + drawdown sparkline for the session panel. */
export function renderEquityCurve(el: HTMLElement, result: BacktestResult): void {
  const pts = result.equity
  if (!pts.length) {
    el.innerHTML = '<p class="rw-session-empty">No equity data for this run.</p>'
    return
  }

  const w = 280
  const h = 72
  const pad = { t: 6, r: 4, b: 4, l: 4 }
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b

  const equities = pts.map((p) => p.equity)
  const minEq = Math.min(...equities)
  const maxEq = Math.max(...equities)
  const span = maxEq - minEq || 1

  const toX = (i: number) => pad.l + (i / Math.max(1, pts.length - 1)) * innerW
  const toY = (eq: number) => pad.t + innerH - ((eq - minEq) / span) * innerH

  const linePath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.equity).toFixed(1)}`)
    .join(' ')

  const areaPath = `${linePath} L${toX(pts.length - 1).toFixed(1)},${(pad.t + innerH).toFixed(1)} L${pad.l},${(pad.t + innerH).toFixed(1)} Z`

  const maxDd = Number.isFinite(result.summary.maxDrawdown) ? result.summary.maxDrawdown : 0
  const startEq = pts[0]!.equity
  const endEq = pts[pts.length - 1]!.equity
  const net = endEq - startEq
  const netUp = net >= 0
  const fmt = formatBacktestMoney

  el.innerHTML = `
    <div class="rw-equity-curve">
      <div class="rw-equity-curve__head">
        <span class="rw-equity-curve__end ${netUp ? 'rw-session-kv__pos' : 'rw-session-kv__neg'}">${fmt(endEq)}</span>
        <span class="rw-equity-curve__dd">Max DD ${maxDd.toFixed(1)}%</span>
      </div>
      <svg class="rw-equity-curve__svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="rw-equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${netUp ? '#089981' : '#f23645'}" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="${netUp ? '#089981' : '#f23645'}" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <path class="rw-equity-curve__area" d="${areaPath}" fill="url(#rw-equity-fill)"/>
        <path class="rw-equity-curve__line" d="${linePath}" fill="none" stroke="${netUp ? '#089981' : '#f23645'}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
      </svg>
      <div class="rw-equity-curve__foot">
        <span>${fmt(startEq)}</span>
        <span class="${netUp ? 'rw-session-kv__pos' : 'rw-session-kv__neg'}">${netUp ? '+' : ''}${fmt(net)}</span>
      </div>
    </div>
  `
}

/** Rough slippage in price units for backtest fills. */
export function defaultBacktestSlippage(symbol: string): number {
  const u = symbol.trim().toUpperCase()
  if (u === 'XAUUSD' || u === 'GC') return 0.05
  if (u === 'BTCUSD') return 1
  if (u === 'SI' || u === 'XAGUSD') return 0.02
  if (u === 'CL') return 0.03
  if (/^[A-Z]{6}$/.test(u)) return 0.0001
  return 0.01
}

export function renderSessionPositionPanel(
  el: HTMLElement,
  snapshot: BacktestReplaySnapshot | null,
  hasBacktest: boolean,
  fmtPrice: (n: number) => string,
  fmtMoney: (n: number) => string,
): void {
  if (!hasBacktest) {
    el.innerHTML =
      '<p class="rw-session-empty">Press <strong>Backtest</strong> in the toolbar to simulate your strategy.</p>'
    return
  }
  const pos = snapshot?.openPosition
  if (!pos) {
    el.innerHTML = '<p class="rw-session-empty">Flat — no open position at this bar.</p>'
    return
  }
  const up = pos.unrealizedPnl >= 0
  const targetTxt = pos.target > 0 ? fmtPrice(pos.target) : '—'
  el.innerHTML = `
    <div class="rw-session-pos__badge rw-session-pos__badge--${pos.direction}">${pos.direction === 'long' ? 'Long' : 'Short'} · #${pos.tradeNum}</div>
    <dl class="rw-session-kv">
      <div><dt>Entry</dt><dd>${fmtPrice(pos.entry)}</dd></div>
      <div><dt>Stop</dt><dd class="rw-session-kv__neg">${fmtPrice(pos.stop)}</dd></div>
      <div><dt>Target</dt><dd class="rw-session-kv__pos">${targetTxt}</dd></div>
      <div><dt>Size</dt><dd>${pos.units.toLocaleString('en-US')}</dd></div>
    </dl>
    <div class="rw-session-pos__pnl ${up ? 'rw-session-kv__pos' : 'rw-session-kv__neg'}">
      Unrealized ${fmtMoney(pos.unrealizedPnl)}
    </div>
  `
}

/** Final backtest summary for the right-hand session stats panel (after Backtest completes). */
export function renderSessionStatsFromSummary(
  el: HTMLElement,
  result: BacktestResult,
  fmtMoney: (n: number) => string,
): void {
  const s = result.summary
  const net = Number.isFinite(s.netPnl) ? s.netPnl : 0
  const netUp = net >= 0
  el.innerHTML = `
    <p class="rw-session-stats__strategy">${escapeHtml(result.strategy.name)}</p>
    <div class="rw-session-stats__hero ${netUp ? 'rw-session-kv__pos' : 'rw-session-kv__neg'}">
      ${netUp ? '+' : ''}${fmtMoney(net)}
    </div>
    <p class="rw-session-stats__sub">${s.totalTrades} trades · final backtest</p>
    <dl class="rw-session-kv rw-session-kv--stats">
      <div><dt>Win rate</dt><dd>${Number.isFinite(s.winRate) ? s.winRate.toFixed(1) : '0.0'}%</dd></div>
      <div><dt>Sharpe</dt><dd>${Number.isFinite(s.sharpe) ? s.sharpe.toFixed(2) : '0.00'}</dd></div>
      <div><dt>Profit factor</dt><dd>${Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'}</dd></div>
      <div><dt>Max drawdown</dt><dd class="rw-session-kv__neg">${Number.isFinite(s.maxDrawdown) ? s.maxDrawdown.toFixed(1) : '0.0'}%</dd></div>
    </dl>
  `
}

export function renderSessionStatsPanel(
  el: HTMLElement,
  snapshot: BacktestReplaySnapshot | null,
  hasBacktest: boolean,
  fmtMoney: (n: number) => string,
): void {
  if (!hasBacktest) {
    el.innerHTML = '<p class="rw-session-empty">Run a backtest to see live performance as replay plays.</p>'
    return
  }
  if (!snapshot) {
    el.innerHTML = '<p class="rw-session-empty">Waiting for bar data…</p>'
    return
  }
  const netUp = snapshot.netPnl >= 0
  const closed = snapshot.closedTrades.length
  el.innerHTML = `
    <p class="rw-session-stats__strategy">${escapeHtml(snapshot.strategyName)}</p>
    <div class="rw-session-stats__hero ${netUp ? 'rw-session-kv__pos' : 'rw-session-kv__neg'}">
      ${netUp ? '+' : ''}${fmtMoney(snapshot.netPnl)}
    </div>
    <p class="rw-session-stats__sub">${closed} closed trade${closed === 1 ? '' : 's'} through this bar</p>
    <dl class="rw-session-kv rw-session-kv--stats">
      <div><dt>Win rate</dt><dd>${snapshot.winRate.toFixed(1)}%</dd></div>
      <div><dt>Sharpe</dt><dd>${snapshot.sharpe.toFixed(2)}</dd></div>
      <div><dt>Realized</dt><dd>${fmtMoney(snapshot.realizedPnl)}</dd></div>
      <div><dt>Open P&amp;L</dt><dd>${fmtMoney(snapshot.openPosition?.unrealizedPnl ?? 0)}</dd></div>
    </dl>
  `
}

const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  stop_loss: 'Stop',
  take_profit: 'Target',
  signal_exit: 'Signal',
  trailing_stop: 'Trail',
  session_end: 'Session end',
  max_bars: 'Max bars',
}

export function formatExitReason(reason: ExitReason): string {
  return EXIT_REASON_LABELS[reason] ?? reason
}

function formatTradeDateTime(sec: number): string {
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

export type RenderTradeLogOpts = {
  fmtPrice?: (n: number) => string
  highlightTradeNum?: number
}

/** Scrollable trade log for the strategy tester side panel. */
export function renderTradeLog(
  el: HTMLElement,
  result: BacktestResult | null,
  opts?: RenderTradeLogOpts,
): void {
  if (!result) {
    el.innerHTML =
      '<p class="rw-session-empty">Run a backtest to see every trade entry and exit.</p>'
    return
  }

  const trades = result.trades
  if (!trades.length) {
    el.innerHTML =
      '<p class="rw-session-empty">No trades — try <strong>RSI Mean Reversion</strong>, widen the session date range, or pick a different strategy.</p>'
    return
  }

  const fmtPrice = opts?.fmtPrice ?? ((n: number) => n.toFixed(2))
  const highlight = opts?.highlightTradeNum
  const detailTrade =
    highlight != null ? trades.find((t) => t.tradeNum === highlight) ?? null : null

  const rows = trades
    .map((t) => {
      const win = t.pnl > 0
      const pnlClass = win ? 'rw-trade-log__pnl--win' : 'rw-trade-log__pnl--loss'
      const dirClass = t.direction === 'long' ? 'rw-trade-log__dir--long' : 'rw-trade-log__dir--short'
      const active = highlight === t.tradeNum ? ' rw-trade-log__row--active' : ''
      return `<tr class="rw-trade-log__row${active}" data-bt-trade-num="${t.tradeNum}" tabindex="0" role="button" title="Jump chart to entry">
        <td class="rw-trade-log__num">${t.tradeNum}</td>
        <td class="rw-trade-log__dir ${dirClass}">${t.direction === 'long' ? 'Long' : 'Short'}</td>
        <td class="rw-trade-log__time">${escapeHtml(formatTradeDateTime(t.entryTime))}</td>
        <td class="rw-trade-log__time">${escapeHtml(formatTradeDateTime(t.exitTime))}</td>
        <td class="rw-trade-log__px">${fmtPrice(t.entryPrice)}</td>
        <td class="rw-trade-log__px">${fmtPrice(t.exitPrice)}</td>
        <td class="rw-trade-log__pnl ${pnlClass}">${formatBacktestMoney(t.pnl)}</td>
        <td class="rw-trade-log__reason">${escapeHtml(formatExitReason(t.exitReason))}</td>
      </tr>`
    })
    .join('')

  el.innerHTML = `
    <div class="rw-trade-log-wrap">
      <table class="rw-trade-log" aria-label="Backtest trades">
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
    ${
      detailTrade
        ? `<div class="rw-trade-log-detail" data-rw-trade-detail>
      <p class="rw-trade-log-detail__title">Trade #${detailTrade.tradeNum} — why this trade?</p>
      <dl class="rw-trade-log-detail__list">
        <div><dt>Entry</dt><dd>${escapeHtml(detailTrade.entrySignal || '—')}</dd></div>
        <div><dt>Exit</dt><dd>${escapeHtml(detailTrade.exitSignal || formatExitReason(detailTrade.exitReason))}</dd></div>
      </dl>
    </div>`
        : ''
    }
    <p class="rw-trade-log__hint">Click a row to jump the chart and see entry/exit rules.</p>
  `
}

function csvEscape(value: string | number): string {
  const s = String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Download trades as CSV (Phase A3). */
export function exportTradesCsv(result: BacktestResult): void {
  const header = [
    'trade_num',
    'direction',
    'entry_time',
    'exit_time',
    'entry_price',
    'exit_price',
    'pnl',
    'pnl_pct',
    'exit_reason',
    'entry_signal',
    'exit_signal',
    'condition',
  ]
  const lines = [header.join(',')]
  for (const t of result.trades) {
    lines.push(
      [
        t.tradeNum,
        t.direction,
        t.entryTime,
        t.exitTime,
        t.entryPrice,
        t.exitPrice,
        t.pnl,
        t.pnlPct,
        t.exitReason,
        t.entrySignal ?? '',
        t.exitSignal ?? '',
        t.condition,
      ]
        .map(csvEscape)
        .join(','),
    )
  }
  const slug = result.strategy.id.replace(/[^a-z0-9_-]+/gi, '-')
  const date = new Date().toISOString().slice(0, 10)
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trades-${slug}-${date}.csv`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
