import type { StoredSession } from '../data/sessionStore'
import { listBattles, type BattleRecord } from '../battles/battleStore'
import { primarySessionSymbol } from '../sessionTypes'

export type DashboardPerfMode = 'backtest' | 'battles' | 'prop' | 'all'
export type DashboardPerfRange = 'week' | 'month' | 'lifetime'
export type DashboardTimeChartView = 'daily' | 'monthly'

export type DashboardPerfTotals = {
  netPnl: number
  sessionsActive: number
  tradesTaken: number
  winRate: number | null
  hasData: boolean
}

type PnlEvent = { ts: number; pnl: number }

function battlesInRange(range: DashboardPerfRange, now = Date.now()): BattleRecord[] {
  return listBattles().filter((b) => inRange(b.ranAt, range, now))
}

function collectBattlePnlEvents(range: DashboardPerfRange, now = Date.now()): PnlEvent[] {
  return battlesInRange(range, now).map((b) => ({ ts: b.ranAt, pnl: b.margin }))
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function sessionMatchesPerfMode(session: StoredSession, mode: DashboardPerfMode): boolean {
  if (mode === 'all') return true
  if (mode === 'battles') return false
  if (mode === 'prop') return session.sessionType === 'prop'
  return session.sessionType === 'backtest'
}

function rangeStartMs(range: DashboardPerfRange, now = Date.now()): number {
  if (range === 'lifetime') return 0
  const days = range === 'week' ? 7 : 30
  return now - days * 86_400_000
}

function inRange(ts: number, range: DashboardPerfRange, now = Date.now()): boolean {
  if (range === 'lifetime') return true
  return ts >= rangeStartMs(range, now)
}

function collectPnlEvents(
  sessions: StoredSession[],
  mode: DashboardPerfMode,
  range: DashboardPerfRange,
  now = Date.now(),
): PnlEvent[] {
  if (mode === 'battles') return collectBattlePnlEvents(range, now)

  const events: PnlEvent[] = []
  for (const session of sessions) {
    if (!sessionMatchesPerfMode(session, mode)) continue

    const bt = session.lastBacktest
    if (bt && inRange(bt.ranAt, range, now) && mode !== 'prop') {
      events.push({ ts: bt.ranAt, pnl: bt.netPnl })
    }

    if (mode === 'backtest') continue

    const closed = session.replayState?.account.closedTrades ?? []
    for (const trade of closed) {
      const ts = trade.exitTime * 1000
      if (inRange(ts, range, now)) events.push({ ts, pnl: trade.pnl })
    }
  }
  return events
}

/**
 * Chart series: prefer closed journal trades (daily path); fall back to lastBacktest
 * snapshots when a session has no closed trades in range (avoids double-counting).
 */
function collectChartPnlEvents(
  sessions: StoredSession[],
  range: DashboardPerfRange,
  now = Date.now(),
): PnlEvent[] {
  const events: PnlEvent[] = []
  for (const session of sessions) {
    if (session.sessionType !== 'backtest' && session.sessionType !== 'prop') continue

    const closed = session.replayState?.account.closedTrades ?? []
    let tradeCount = 0
    for (const trade of closed) {
      const ts = trade.exitTime * 1000
      if (!inRange(ts, range, now)) continue
      tradeCount += 1
      events.push({ ts, pnl: trade.pnl })
    }

    if (tradeCount > 0) continue

    const bt = session.lastBacktest
    if (bt && inRange(bt.ranAt, range, now) && session.sessionType !== 'prop') {
      events.push({ ts: bt.ranAt, pnl: bt.netPnl })
    }
  }
  return events
}

function countJournalTrades(session: StoredSession, range: DashboardPerfRange, now: number): number {
  const closed = session.replayState?.account.closedTrades ?? []
  return closed.filter((t) => inRange(t.exitTime * 1000, range, now)).length
}

function countJournalWins(session: StoredSession, range: DashboardPerfRange, now: number): number {
  const closed = session.replayState?.account.closedTrades ?? []
  return closed.filter((t) => inRange(t.exitTime * 1000, range, now) && t.pnl > 0).length
}

export function computeDashboardPerfTotals(
  sessions: StoredSession[],
  mode: DashboardPerfMode,
  range: DashboardPerfRange,
  now = Date.now(),
): DashboardPerfTotals {
  if (mode === 'battles') {
    const battles = battlesInRange(range, now)
    if (!battles.length) {
      return { netPnl: 0, sessionsActive: 0, tradesTaken: 0, winRate: null, hasData: false }
    }
    const netPnl = battles.reduce((sum, b) => sum + Math.abs(b.margin), 0)
    const positiveWinners = battles.filter((b) => {
      const winPnl = b.winner === 'a' ? b.pnlA : b.winner === 'b' ? b.pnlB : 0
      return winPnl > 0
    }).length
    const sessionIds = new Set<string>()
    for (const b of battles) {
      sessionIds.add(b.sessionAId)
      sessionIds.add(b.sessionBId)
    }
    return {
      netPnl,
      sessionsActive: sessionIds.size,
      tradesTaken: battles.length,
      winRate: battles.length ? (positiveWinners / battles.length) * 100 : null,
      hasData: true,
    }
  }

  let netPnl = 0
  let tradesTaken = 0
  let wins = 0
  let sessionsActive = 0

  for (const session of sessions) {
    if (!sessionMatchesPerfMode(session, mode)) continue

    let active = false

    const bt = session.lastBacktest
    if (bt && inRange(bt.ranAt, range, now) && mode !== 'prop') {
      active = true
      netPnl += bt.netPnl
      tradesTaken += bt.totalTrades
      wins += Math.round((bt.winRate / 100) * bt.totalTrades)
    }

    if (mode !== 'backtest') {
      const journalTrades = countJournalTrades(session, range, now)
      if (journalTrades > 0) active = true
      wins += countJournalWins(session, range, now)
      tradesTaken += journalTrades
      for (const trade of session.replayState?.account.closedTrades ?? []) {
        const ts = trade.exitTime * 1000
        if (inRange(ts, range, now)) netPnl += trade.pnl
      }
    }

    const opened = session.lastOpenedAt ?? session.updatedAt
    if (inRange(opened, range, now)) active = true

    if (active) sessionsActive += 1
  }

  const winRate = tradesTaken > 0 ? (wins / tradesTaken) * 100 : null
  const hasData = sessionsActive > 0 || tradesTaken > 0 || Math.abs(netPnl) > 1e-6

  return { netPnl, sessionsActive, tradesTaken, winRate, hasData }
}

function formatMoneyTick(v: number, emphasize = false): string {
  const abs = Math.abs(v)
  let s: string
  if (abs >= 1_000_000) s = `${(abs / 1_000_000).toFixed(1)}M`
  else if (abs >= 1000) s = `${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`
  else if (abs >= 100) s = abs.toFixed(0)
  else if (abs >= 10) s = abs.toFixed(1)
  else if (abs < 0.005) s = '0'
  else s = abs.toFixed(2)
  if (Math.abs(v) < 1e-9) return '$0'
  const sign = v < 0 ? '-' : '+'
  if (emphasize) return `${sign}$${s}`
  return `${sign}${s}`
}

function formatBarPnlLabel(v: number): string {
  if (!Number.isFinite(v) || v === 0) return ''
  const sign = v > 0 ? '+' : '-'
  const abs = Math.abs(v)
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}k`
  if (abs >= 100) return `${sign}${abs.toFixed(0)}`
  if (abs >= 10) return `${sign}${abs.toFixed(1)}`
  return `${sign}${abs.toFixed(2)}`
}

function niceMoneyCeiling(maxAbs: number): number {
  if (!Number.isFinite(maxAbs) || maxAbs <= 0) return 100
  const padded = maxAbs * 1.12
  const pow = 10 ** Math.floor(Math.log10(padded))
  const n = padded / pow
  let nice: number
  if (n <= 1) nice = 1
  else if (n <= 2) nice = 2
  else if (n <= 5) nice = 5
  else nice = 10
  return nice * pow
}

/** Evenly spaced nice ticks between vMin and vMax (inclusive), de-duped. */
function niceAxisTicks(vMin: number, vMax: number, targetCount = 5): number[] {
  if (!(vMax > vMin)) return [vMin]
  const span = vMax - vMin
  const rawStep = span / Math.max(1, targetCount - 1)
  const mag = 10 ** Math.floor(Math.log10(Math.max(rawStep, 1e-9)))
  const r = rawStep / mag
  let step: number
  if (r <= 1) step = mag
  else if (r <= 2) step = 2 * mag
  else if (r <= 5) step = 5 * mag
  else step = 10 * mag

  const start = Math.floor(vMin / step) * step
  const ticks: number[] = []
  for (let v = start; v <= vMax + step * 0.5; v += step) {
    if (v < vMin - step * 0.01 || v > vMax + step * 0.01) continue
    const rounded = Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12))
    if (!ticks.length || Math.abs(ticks[ticks.length - 1]! - rounded) > step * 0.25) {
      ticks.push(rounded)
    }
  }
  if (!ticks.some((t) => Math.abs(t) < 1e-12) && vMin < 0 && vMax > 0) {
    ticks.push(0)
    ticks.sort((a, b) => a - b)
  }
  return ticks.length ? ticks : [vMin, vMax]
}

function valueToYRange(v: number, y0: number, y1: number, vMin: number, vMax: number): number {
  const span = vMax - vMin
  if (!(span > 0)) return (y0 + y1) / 2
  const t = (v - vMin) / span
  return y1 - t * (y1 - y0)
}

function valueToY(v: number, y0: number, y1: number, yMax: number): number {
  if (yMax <= 0) return y1
  const t = Math.min(1, Math.max(0, v / yMax))
  return y1 - t * (y1 - y0)
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

const CHART_MS_DAY = 86_400_000

/** Daily buckets: last 7d / 30d ending today; if empty, last N days ending at latest event. */
function bucketDailyForChart(
  events: PnlEvent[],
  range: DashboardPerfRange,
  now = new Date(),
): { vals: number[]; xLabels: string[]; minSlot: number; periodLabel: string } {
  const nDays = range === 'week' ? 7 : 30

  const build = (endDay: Date) => {
    const end = startOfLocalDay(endDay)
    const start = new Date(end)
    start.setDate(start.getDate() - (nDays - 1))
    const buckets = new Array<number>(nDays).fill(0)
    const labels = new Array<string>(nDays)
    for (let i = 0; i < nDays; i++) {
      const day = new Date(start)
      day.setDate(start.getDate() + i)
      labels[i] = `${MONTH_SHORT[day.getMonth()]} ${String(day.getDate()).padStart(2, '0')}`
    }
    for (const e of events) {
      const d = startOfLocalDay(new Date(e.ts))
      if (d < start || d > end) continue
      const idx = Math.round((d.getTime() - start.getTime()) / CHART_MS_DAY)
      if (idx >= 0 && idx < nDays) buckets[idx] = (buckets[idx] ?? 0) + e.pnl
    }
    return {
      vals: buckets,
      xLabels: labels,
      minSlot: range === 'week' ? 36 : 22,
      periodLabel: `${formatChartDayLabel(start)} – ${formatChartDayLabel(end)}`,
      start,
      end,
    }
  }

  let result = build(now)
  const hasActivity = result.vals.some((v) => Math.abs(v) > 1e-9)
  if (!hasActivity && events.length > 0) {
    let latest = events[0]!
    for (const e of events) {
      if (e.ts > latest.ts) latest = e
    }
    result = build(new Date(latest.ts))
  }

  return {
    vals: result.vals,
    xLabels: result.xLabels,
    minSlot: result.minSlot,
    periodLabel: result.periodLabel,
  }
}

function formatChartDayLabel(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function bucketMonthly(events: PnlEvent[], now = new Date()): number[] {
  const buckets = new Array<number>(12).fill(0)
  for (const e of events) {
    const d = new Date(e.ts)
    if (d.getFullYear() !== now.getFullYear()) continue
    buckets[d.getMonth()] = (buckets[d.getMonth()] ?? 0) + e.pnl
  }
  return buckets
}

function resolveChartEvents(
  sessions: StoredSession[],
  mode: DashboardPerfMode,
  range: DashboardPerfRange,
  now: number,
): PnlEvent[] {
  return mode === 'battles'
    ? collectPnlEvents(sessions, mode, range, now)
    : collectChartPnlEvents(sessions, range, now)
}

/** Human-readable period for the Net P&L path chart header. */
export function describeDashboardPerfChartPeriod(
  sessions: StoredSession[],
  mode: DashboardPerfMode,
  range: DashboardPerfRange,
  view: DashboardTimeChartView,
  now = Date.now(),
): string {
  const events = resolveChartEvents(sessions, mode, range, now)
  const nowDate = new Date(now)
  if (view === 'monthly') {
    let year = nowDate.getFullYear()
    const vals = bucketMonthly(events, nowDate)
    if (events.length > 0 && vals.every((v) => Math.abs(v) < 1e-9)) {
      let latest = events[0]!
      for (const e of events) {
        if (e.ts > latest.ts) latest = e
      }
      year = new Date(latest.ts).getFullYear()
    }
    return String(year)
  }
  return bucketDailyForChart(events, range, nowDate).periodLabel
}

export function buildDashboardPerfChartSvg(
  sessions: StoredSession[],
  mode: DashboardPerfMode,
  range: DashboardPerfRange,
  view: DashboardTimeChartView,
  now = Date.now(),
): string {
  const events = resolveChartEvents(sessions, mode, range, now)
  const yLabelX = 48
  const x0 = 56
  const y0 = 22
  const y1 = 118
  const xLabelY = 138
  const nowDate = new Date(now)
  const gradUp = view === 'monthly' ? 'sx-dash-pnl-bar-up-m' : 'sx-dash-pnl-bar-up-d'
  const gradDown = view === 'monthly' ? 'sx-dash-pnl-bar-down-m' : 'sx-dash-pnl-bar-down-d'

  let vals: number[]
  let xLabels: string[]

  if (view === 'monthly') {
    vals = bucketMonthly(events, nowDate)
    if (events.length > 0 && vals.every((v) => Math.abs(v) < 1e-9)) {
      let latest = events[0]!
      for (const e of events) {
        if (e.ts > latest.ts) latest = e
      }
      vals = bucketMonthly(events, new Date(latest.ts))
    }
    xLabels = MONTH_SHORT
  } else {
    const daily = bucketDailyForChart(events, range, nowDate)
    vals = daily.vals
    xLabels = daily.xLabels
  }

  // Build cumulative waterfall steps
  type WaterfallStep = { label: string; from: number; to: number; delta: number }
  const steps: WaterfallStep[] = []
  let cum = 0
  let minLevel = 0
  let maxLevel = 0
  for (let i = 0; i < vals.length; i++) {
    const delta = vals[i] ?? 0
    const from = cum
    cum += delta
    const to = cum
    minLevel = Math.min(minLevel, from, to)
    maxLevel = Math.max(maxLevel, from, to)
    // Daily: only trading days (clears empty desert). Monthly: keep every month slot.
    if (view === 'monthly' || Math.abs(delta) > 1e-9) {
      steps.push({ label: xLabels[i] ?? '', from, to, delta })
    }
  }

  const emptySvg = (msg: string) =>
    `<svg class="sx-dash-time-chart__svg sx-dash-time-chart__svg--fill sx-dash-time-chart__svg--empty" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 160" width="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-time-chart-svg="${view}">
  <text x="320" y="82" text-anchor="middle" fill="var(--sx-tc-xtext)" font-size="13" font-weight="600" font-family="inherit">${msg}</text>
</svg>`

  if (view === 'daily' && steps.length === 0) {
    return emptySvg('No closed trades in this period')
  }

  // Symmetric Y domain around zero: +$40k and -$40k share equal space
  const peak = Math.max(Math.abs(minLevel), Math.abs(maxLevel), 1)
  const bound = niceMoneyCeiling(peak * 1.05)
  let vMax = bound
  let vMin = -bound
  if (bound < 1e-6) {
    vMax = 100
    vMin = -100
  }

  // Fixed symmetric ticks: +bound … 0 … -bound
  const tickVals = niceAxisTicks(vMin, vMax, 5)
  if (!tickVals.some((t) => Math.abs(t) < 1e-12)) {
    tickVals.push(0)
    tickVals.sort((a, b) => a - b)
  }
  const filteredTicks: number[] = []
  for (const v of tickVals) {
    const y = valueToYRange(v, y0, y1, vMin, vMax)
    if (filteredTicks.some((t) => Math.abs(valueToYRange(t, y0, y1, vMin, vMax) - y) < 14)) continue
    filteredTicks.push(v)
  }
  const ticks = filteredTicks.length ? filteredTicks : [-bound, 0, bound]

  const colCount = Math.max(1, steps.length)
  const slot = view === 'monthly' ? 42 : Math.max(56, Math.min(88, 560 / colCount))
  const plotInnerW = Math.max(520, slot * colCount)
  const x1 = x0 + plotInnerW
  const maxBw = view === 'monthly' ? 22 : 28

  const lines: string[] = []
  const yTicks: string[] = []
  for (const v of ticks) {
    const y = valueToYRange(v, y0, y1, vMin, vMax)
    const isZero = Math.abs(v) < 1e-9
    lines.push(
      `<line x1="${x0}" y1="${y.toFixed(2)}" x2="${x1}" y2="${y.toFixed(2)}" stroke-dasharray="${isZero ? '0' : '3 5'}" opacity="${isZero ? '0' : '0.7'}" />`,
    )
    yTicks.push(
      `<text x="${yLabelX}" y="${y.toFixed(2)}" text-anchor="end" dominant-baseline="middle" fill="var(--sx-tc-ytext)" font-size="10.5" font-weight="${isZero ? '700' : '600'}" font-family="inherit">${formatMoneyTick(v, isZero || v === ticks[0] || v === ticks[ticks.length - 1])}</text>`,
    )
  }

  const zeroY = valueToYRange(0, y0, y1, vMin, vMax)
  const connectors: string[] = []
  const bars: string[] = []
  const valueLabels: string[] = []
  const labels: string[] = []
  const scaleSpan = Math.max(Math.abs(vMax - vMin), 1)

  for (let s = 0; s < steps.length; s++) {
    const step = steps[s]!
    const cx = x0 + (s + 0.5) * slot
    const bw = Math.min(maxBw, slot * 0.52)
    labels.push(
      `<text x="${cx.toFixed(2)}" y="${xLabelY}" text-anchor="middle" fill="var(--sx-tc-xtext)" font-size="10.5" font-weight="600" font-family="inherit">${step.label}</text>`,
    )

    if (Math.abs(step.delta) < 1e-9) continue

    const yFrom = valueToYRange(step.from, y0, y1, vMin, vMax)
    const yTo = valueToYRange(step.to, y0, y1, vMin, vMax)
    let barTop = Math.min(yFrom, yTo)
    let barBottom = Math.max(yFrom, yTo)
    const minBarPx = 6
    if (barBottom - barTop < minBarPx) {
      if (step.delta > 0) {
        barTop = yFrom - minBarPx
        barBottom = yFrom
      } else {
        barTop = yFrom
        barBottom = yFrom + minBarPx
      }
    }
    const h = barBottom - barTop
    const r = Math.min(4, h / 2, bw / 2)
    const x = cx - bw / 2
    const isProfit = step.delta > 0
    const tip = formatBarPnlLabel(step.delta)
    bars.push(
      `<path class="sx-dash-pnl-bar sx-dash-pnl-bar--${isProfit ? 'profit' : 'loss'}" d="${roundedBarPath(x, barTop, bw, h, r)}" fill="url(#${isProfit ? gradUp : gradDown})"><title>${step.label}: ${tip}</title></path>`,
    )

    const next = steps[s + 1]
    if (next && Math.abs(next.delta) > 1e-9) {
      const nextCx = x0 + (s + 1.5) * slot
      const nextBw = Math.min(maxBw, slot * 0.52)
      const yLink = valueToYRange(step.to, y0, y1, vMin, vMax)
      const x1c = cx + bw / 2 + 1
      const x2c = nextCx - nextBw / 2 - 1
      if (x2c > x1c + 2) {
        connectors.push(
          `<line x1="${x1c.toFixed(2)}" y1="${yLink.toFixed(2)}" x2="${x2c.toFixed(2)}" y2="${yLink.toFixed(2)}" stroke="var(--sx-tc-baseline)" stroke-width="1.25" stroke-dasharray="2.5 3.5" opacity="0.55" />`,
        )
      }
    }

    // With few trading days, label every bar; otherwise only meaningful moves
    const showLabel = steps.length <= 12 || Math.abs(step.delta) >= scaleSpan * 0.02 || Math.abs(step.delta) >= 100
    if (showLabel && tip) {
      const labelY = isProfit ? Math.max(y0 + 10, barTop - 8) : Math.min(y1 + 14, barBottom + 14)
      valueLabels.push(
        `<text x="${cx.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" fill="${isProfit ? '#047857' : '#be123c'}" font-size="11" font-weight="800" font-family="inherit">${tip}</text>`,
      )
    }
  }

  const vbW = Math.ceil(x1 + 16)
  const vbH = 156
  return `<svg class="sx-dash-time-chart__svg sx-dash-time-chart__svg--fill" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-time-chart-svg="${view}">
  <defs>
    <linearGradient id="${gradUp}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
    <linearGradient id="${gradDown}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fb7185" />
      <stop offset="100%" stop-color="#e11d48" />
    </linearGradient>
  </defs>
  <rect x="${x0}" y="${y0}" width="${(x1 - x0).toFixed(1)}" height="${(y1 - y0).toFixed(1)}" rx="10" fill="rgba(148,163,184,0.04)" />
  <g stroke="var(--sx-tc-grid)" fill="none" stroke-width="1">${lines.join('')}</g>
  <line x1="${x0}" y1="${zeroY.toFixed(2)}" x2="${x1}" y2="${zeroY.toFixed(2)}" stroke="var(--sx-tc-baseline)" stroke-width="1.6" />
  <g>${connectors.join('')}</g>
  <g>${bars.join('')}</g>
  <g>${valueLabels.join('')}</g>
  <g>${yTicks.join('')}</g>
  <g>${labels.join('')}</g>
</svg>`
}

function roundedBarPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  if (rr <= 0.01) {
    return `M ${x.toFixed(2)} ${y.toFixed(2)} h ${w.toFixed(2)} v ${h.toFixed(2)} h ${(-w).toFixed(2)} Z`
  }
  return [
    `M ${(x + rr).toFixed(2)} ${y.toFixed(2)}`,
    `L ${(x + w - rr).toFixed(2)} ${y.toFixed(2)}`,
    `A ${rr.toFixed(2)} ${rr.toFixed(2)} 0 0 1 ${(x + w).toFixed(2)} ${(y + rr).toFixed(2)}`,
    `L ${(x + w).toFixed(2)} ${(y + h - rr).toFixed(2)}`,
    `A ${rr.toFixed(2)} ${rr.toFixed(2)} 0 0 1 ${(x + w - rr).toFixed(2)} ${(y + h).toFixed(2)}`,
    `L ${(x + rr).toFixed(2)} ${(y + h).toFixed(2)}`,
    `A ${rr.toFixed(2)} ${rr.toFixed(2)} 0 0 1 ${x.toFixed(2)} ${(y + h - rr).toFixed(2)}`,
    `L ${x.toFixed(2)} ${(y + rr).toFixed(2)}`,
    `A ${rr.toFixed(2)} ${rr.toFixed(2)} 0 0 1 ${(x + rr).toFixed(2)} ${y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

export function formatDashboardPerfMoney(n: number): string {
  const sign = n < 0 ? '-' : n > 0 ? '+' : ''
  const v = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return `${sign}$${v}`
}

export function formatDashboardWinRate(winRate: number | null): string {
  if (winRate == null || !Number.isFinite(winRate)) return '—'
  return `${winRate.toFixed(0)}%`
}

export type SessionPulseSymbolStat = {
  symbol: string
  trades: number
  share: number
}

export type SessionPulsePracticeRow = {
  id: string
  name: string
  practiceMs: number
  share: number
  isActive: boolean
  /** Net P&L in the selected pulse range (closed trades, else backtest snapshot). */
  netPnl: number
  profit: number
  loss: number
  hasPnl: boolean
}

export type SessionPulseStats = {
  practiceMs: number
  activeSessionId: string | null
  activeSessionName: string | null
  activePracticeMs: number
  otherPracticeMs: number
  sessionPractice: SessionPulsePracticeRow[]
  historicalMs: number
  tradesTaken: number
  longTrades: number
  shortTrades: number
  winRate: number | null
  wins: number
  losses: number
  sessionsTouched: number
  monthlyPracticeMs: number[]
  practiceMonths: { year: number; month: number; label: string; practiceMs: number }[]
  symbols: SessionPulseSymbolStat[]
  insights: string[]
  hasData: boolean
}

const MS_MIN = 60_000
const MS_HOUR = 3_600_000
const MS_DAY = 86_400_000
const MAX_PRACTICE_PER_SESSION_MS = 12 * MS_HOUR

function parseSessionBoundaryMs(value?: string): number | null {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}

function sessionPracticeMs(session: StoredSession): number {
  const end = session.replayState?.savedAt ?? session.lastOpenedAt ?? session.updatedAt
  const start = session.lastOpenedAt ?? session.createdAt
  if (!Number.isFinite(end) || !Number.isFinite(start) || end <= start) {
    return session.replayState || session.lastBacktest ? 15 * MS_MIN : 0
  }
  return Math.min(end - start, MAX_PRACTICE_PER_SESSION_MS)
}

function sessionHistoricalMs(session: StoredSession): number {
  const a = parseSessionBoundaryMs(session.startDate)
  const b = parseSessionBoundaryMs(session.endDate)
  if (a == null || b == null || b <= a) return 0
  return Math.min(b - a, 365 * MS_DAY)
}

export function formatPulseDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const totalMin = Math.round(ms / MS_MIN)
  if (totalMin < 60) return `${Math.max(1, totalMin)}m`
  const days = Math.floor(ms / MS_DAY)
  const hours = Math.floor((ms % MS_DAY) / MS_HOUR)
  const mins = Math.floor((ms % MS_HOUR) / MS_MIN)
  if (days > 0) {
    if (hours > 0) return `${days}d ${hours}h`
    return `${days}d`
  }
  if (mins > 0) return `${hours}h ${mins}m`
  return `${hours}h`
}

function collectPulseJournalTrades(
  session: StoredSession,
  range: DashboardPerfRange,
  now: number,
): { pnl: number; direction: 'long' | 'short'; ts: number }[] {
  const closed = session.replayState?.account.closedTrades ?? []
  return closed
    .filter((t) => inRange(t.exitTime * 1000, range, now))
    .map((t) => ({ pnl: t.pnl, direction: t.direction, ts: t.exitTime * 1000 }))
}

function sessionPnlInRange(
  session: StoredSession,
  range: DashboardPerfRange,
  now: number,
): { netPnl: number; profit: number; loss: number; hasPnl: boolean } {
  const journal = collectPulseJournalTrades(session, range, now)
  if (journal.length) {
    let profit = 0
    let loss = 0
    let netPnl = 0
    for (const t of journal) {
      netPnl += t.pnl
      if (t.pnl > 0) profit += t.pnl
      else if (t.pnl < 0) loss += -t.pnl
    }
    return { netPnl, profit, loss, hasPnl: true }
  }
  const bt = session.lastBacktest
  if (bt && inRange(bt.ranAt, range, now) && session.sessionType !== 'prop') {
    const netPnl = bt.netPnl
    return {
      netPnl,
      profit: netPnl > 0 ? netPnl : 0,
      loss: netPnl < 0 ? -netPnl : 0,
      hasPnl: true,
    }
  }
  return { netPnl: 0, profit: 0, loss: 0, hasPnl: false }
}

export function computeSessionPulseStats(
  sessions: StoredSession[],
  range: DashboardPerfRange = 'lifetime',
  now = Date.now(),
  preferredActiveSessionId: string | null = null,
): SessionPulseStats {
  let practiceMs = 0
  let historicalMs = 0
  let tradesTaken = 0
  let longTrades = 0
  let shortTrades = 0
  let wins = 0
  let losses = 0
  let sessionsTouched = 0
  const monthlyPracticeMs = new Array<number>(12).fill(0)
  const PRACTICE_MONTH_WINDOW = 6
  const practiceMonthMap = new Map<string, number>()
  const symbolMap = new Map<string, number>()
  const nowDate = new Date(now)
  const touchedSessions: { session: StoredSession; practice: number; touchedAt: number }[] = []

  for (const session of sessions) {
    if (session.sessionType !== 'backtest' && session.sessionType !== 'prop') continue

    const touchedAt = session.lastOpenedAt ?? session.updatedAt ?? session.createdAt
    const practice = sessionPracticeMs(session)
    const hist = sessionHistoricalMs(session)
    const journal = collectPulseJournalTrades(session, range, now)
    const bt = session.lastBacktest
    const btInRange = Boolean(bt && inRange(bt.ranAt, range, now))
    const active = inRange(touchedAt, range, now) || journal.length > 0 || btInRange
    if (!active) continue

    sessionsTouched += 1
    practiceMs += practice
    historicalMs += hist
    touchedSessions.push({ session, practice, touchedAt })

    const touchedDate = new Date(touchedAt)
    const monthIdx = touchedDate.getMonth()
    const year = touchedDate.getFullYear()
    if (year === nowDate.getFullYear()) {
      monthlyPracticeMs[monthIdx] = (monthlyPracticeMs[monthIdx] ?? 0) + practice
    }
    const monthKey = `${year}-${monthIdx}`
    practiceMonthMap.set(monthKey, (practiceMonthMap.get(monthKey) ?? 0) + practice)

    const symbol = primarySessionSymbol(session.assets)

    if (journal.length) {
      for (const t of journal) {
        tradesTaken += 1
        if (t.direction === 'long') longTrades += 1
        else shortTrades += 1
        if (t.pnl > 0) wins += 1
        else if (t.pnl < 0) losses += 1
        symbolMap.set(symbol, (symbolMap.get(symbol) ?? 0) + 1)
      }
    } else if (btInRange && bt) {
      tradesTaken += bt.totalTrades
      const estimatedWins = Math.round((bt.winRate / 100) * bt.totalTrades)
      wins += estimatedWins
      losses += Math.max(0, bt.totalTrades - estimatedWins)
      symbolMap.set(symbol, (symbolMap.get(symbol) ?? 0) + bt.totalTrades)
    }
  }

  const preferred =
    preferredActiveSessionId != null
      ? touchedSessions.find((row) => row.session.id === preferredActiveSessionId)
      : undefined
  const mostRecent = [...touchedSessions].sort((a, b) => b.touchedAt - a.touchedAt)[0]
  const activeRow = preferred ?? mostRecent
  const activePracticeMs = activeRow?.practice ?? 0
  const otherPracticeMs = Math.max(0, practiceMs - activePracticeMs)
  const activeId = activeRow?.session.id ?? null
  const sessionPractice: SessionPulsePracticeRow[] = [...touchedSessions]
    .sort((a, b) => {
      if (a.session.id === activeId) return -1
      if (b.session.id === activeId) return 1
      if (b.practice !== a.practice) return b.practice - a.practice
      return b.touchedAt - a.touchedAt
    })
    .map((row) => {
      const pnl = sessionPnlInRange(row.session, range, now)
      return {
        id: row.session.id,
        name: row.session.name?.trim() || 'Untitled session',
        practiceMs: row.practice,
        share: practiceMs > 0 ? (row.practice / practiceMs) * 100 : 0,
        isActive: row.session.id === activeId,
        netPnl: pnl.netPnl,
        profit: pnl.profit,
        loss: pnl.loss,
        hasPnl: pnl.hasPnl,
      }
    })

  const winRate = tradesTaken > 0 ? (wins / tradesTaken) * 100 : null
  const symbols = [...symbolMap.entries()]
    .map(([symbol, trades]) => ({
      symbol,
      trades,
      share: tradesTaken > 0 ? (trades / tradesTaken) * 100 : 0,
    }))
    .sort((a, b) => b.trades - a.trades)
    .slice(0, 6)

  const insights: string[] = []
  if (sessionsTouched === 0) {
    insights.push('Start a backtesting session to unlock practice analytics.')
  } else {
    if (tradesTaken < 20) {
      insights.push(`Edge needs more sample size — ${Math.max(0, 20 - tradesTaken)} more closed trades for a stable win rate.`)
    } else if (winRate != null) {
      insights.push(
        winRate >= 50
          ? `Win rate holding at ${winRate.toFixed(0)}% across ${tradesTaken} trades.`
          : `Win rate at ${winRate.toFixed(0)}% — review losing symbols before adding size.`,
      )
    }
    if (symbols[0]) {
      insights.push(`Primary focus: ${symbols[0].symbol} (${symbols[0].share.toFixed(0)}% of trades).`)
    }
    const directed = longTrades + shortTrades
    if (directed > 0) {
      const longPct = Math.round((longTrades / directed) * 100)
      const shortPct = 100 - longPct
      if (longPct >= 70) insights.push(`Long bias detected (${longPct}% buys · ${shortPct}% sells).`)
      else if (shortPct >= 70) insights.push(`Short bias detected (${shortPct}% sells · ${longPct}% buys).`)
      else insights.push(`Balanced flow: ${longPct}% buys · ${shortPct}% sells.`)
    }
    if (historicalMs > practiceMs * 20 && practiceMs > 0) {
      insights.push('You cover a lot of market tape per practice hour — strong replay leverage.')
    }
  }

  const practiceMonths: { year: number; month: number; label: string; practiceMs: number }[] = []
  for (let i = PRACTICE_MONTH_WINDOW - 1; i >= 0; i--) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth()
    const key = `${year}-${month}`
    practiceMonths.push({
      year,
      month,
      label: `${MONTH_SHORT[month]} ${year}`,
      practiceMs: practiceMonthMap.get(key) ?? 0,
    })
  }

  return {
    practiceMs,
    activeSessionId: activeId,
    activeSessionName: activeRow?.session.name?.trim() || null,
    activePracticeMs,
    otherPracticeMs,
    sessionPractice,
    historicalMs,
    tradesTaken,
    longTrades,
    shortTrades,
    winRate,
    wins,
    losses,
    sessionsTouched,
    monthlyPracticeMs,
    practiceMonths,
    symbols,
    insights: insights.slice(0, 3),
    hasData: sessionsTouched > 0 || tradesTaken > 0 || practiceMs > 0,
  }
}

const PRACTICE_SEGMENT_TONES = ['slate', 'amber', 'teal', 'indigo', 'rose', 'sky'] as const

export function buildPulsePracticeSplitHtml(rows: SessionPulsePracticeRow[]): string {
  if (!rows.length) {
    return `<span class="sx-dash-pulse__practice-other" style="width:100%"></span>`
  }
  return rows
    .map((row, i) => {
      const width = Math.max(row.practiceMs > 0 ? 4 : 0, Math.min(100, row.share))
      const tone = row.isActive ? 'active' : PRACTICE_SEGMENT_TONES[i % PRACTICE_SEGMENT_TONES.length]
      return `<span class="sx-dash-pulse__practice-seg sx-dash-pulse__practice-seg--${tone}" style="width:${width}%" title="${row.name.replace(/[<>&"']/g, '')}"></span>`
    })
    .join('')
}

export function buildPulsePracticeRowsHtml(rows: SessionPulsePracticeRow[]): string {
  if (!rows.length) {
    return `<div class="sx-dash-pulse-empty">Open a backtesting session to track practice time.</div>`
  }
  return rows
    .map((row, i) => {
      const width = Math.max(8, Math.min(100, row.share))
      const name = row.name.replace(/[<>&"']/g, '')
      const activeClass = row.isActive ? ' sx-dash-pulse-session--active' : ''
      const badge = row.isActive ? `<span class="sx-dash-pulse-session__badge">Active</span>` : ''
      const pnlTone = !row.hasPnl
        ? 'sx-dash-pulse-session__pnl--flat'
        : row.netPnl > 0
          ? 'sx-dash-pulse-session__pnl--ok'
          : row.netPnl < 0
            ? 'sx-dash-pulse-session__pnl--warn'
            : 'sx-dash-pulse-session__pnl--flat'
      const pnlText = row.hasPnl ? formatDashboardPerfMoney(row.netPnl) : '—'
      const pnlTitle = row.hasPnl
        ? `Profit ${formatDashboardPerfMoney(row.profit)} · Loss ${formatDashboardPerfMoney(-row.loss)} · Net ${formatDashboardPerfMoney(row.netPnl)}`
        : 'No P&L in this range'
      return `<div class="sx-dash-pulse-session${activeClass}" style="--sx-pulse-i:${i}">
        <div class="sx-dash-pulse-session__meta">
          <span class="sx-dash-pulse-session__name"><span class="sx-dash-pulse-session__label">${name}</span>${badge}</span>
          <span class="sx-dash-pulse-session__stats">
            <span class="sx-dash-pulse-session__pnl ${pnlTone}" title="${pnlTitle.replace(/"/g, '&quot;')}">${pnlText}</span>
            <span class="sx-dash-pulse-session__time">${formatPulseDuration(row.practiceMs)}</span>
          </span>
        </div>
        <div class="sx-dash-pulse-session__track" aria-hidden="true">
          <span class="sx-dash-pulse-session__fill" style="width:${width}%"></span>
        </div>
      </div>`
    })
    .join('')
}

function formatIntenseHoursLabel(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return ''
  const rounded = Math.round(hours * 10) / 10
  if (Number.isInteger(rounded)) return `${rounded.toFixed(0)}hr`
  return `${rounded.toFixed(1)}hr`
}

function intenseYScale(maxVal: number): { yMax: number; step: number } {
  if (!(maxVal > 0)) return { yMax: 1, step: 0.5 }
  if (maxVal <= 1) return { yMax: 1, step: 0.5 }
  if (maxVal <= 2) return { yMax: 2, step: 0.5 }
  if (maxVal <= 5) return { yMax: Math.max(3, Math.ceil(maxVal)), step: 1 }
  const yMax = Math.ceil(maxVal / 5) * 5
  return { yMax: Math.max(5, yMax), step: 5 }
}

function formatIntenseTick(v: number): string {
  const rounded = Math.round(v * 100) / 100
  if (Number.isInteger(rounded)) return `${rounded.toFixed(0)}hr`
  return `${rounded.toFixed(1)}hr`
}

export function buildPulseActivityChartSvg(
  practiceMonths: { year: number; month: number; label: string; practiceMs: number }[],
  now = Date.now(),
): string {
  const nowDate = new Date(now)
  const series =
    practiceMonths.length > 0
      ? practiceMonths
      : Array.from({ length: 6 }, (_, i) => {
          const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - (5 - i), 1)
          return {
            year: d.getFullYear(),
            month: d.getMonth(),
            label: `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`,
            practiceMs: 0,
          }
        })

  const vals = series.map((row) => row.practiceMs / MS_HOUR)
  const maxVal = vals.reduce((m, v) => Math.max(m, v), 0)
  const { yMax, step } = intenseYScale(maxVal)
  const tickVals: number[] = []
  for (let v = 0; v <= yMax + 1e-9; v += step) tickVals.push(Number(v.toFixed(4)))

  const n = series.length
  const yLabelX = 34
  const x0 = 40
  const y0 = 16
  const y1 = 72
  const plotW = Math.max(200, n * 44)
  const x1 = x0 + plotW
  const slot = plotW / n
  const barW = Math.min(28, slot * 0.48)
  const vbW = Math.ceil(x1 + 8)
  const vbH = 108
  const gradId = 'sx-intense-bar-grad'
  const currentKey = `${nowDate.getFullYear()}-${nowDate.getMonth()}`

  const lines: string[] = []
  const yTicks: string[] = []
  for (const v of tickVals) {
    const y = valueToY(v, y0, y1, yMax)
    lines.push(
      `<line x1="${x0}" y1="${y.toFixed(2)}" x2="${x1}" y2="${y.toFixed(2)}" stroke="var(--sx-pulse-grid)" stroke-width="1" stroke-dasharray="3 4" />`,
    )
    yTicks.push(
      `<text x="${yLabelX}" y="${y.toFixed(2)}" text-anchor="end" dominant-baseline="middle" fill="var(--sx-pulse-axis)" font-size="9" font-weight="500" font-family="inherit">${formatIntenseTick(v)}</text>`,
    )
  }

  const bars: string[] = []
  const valueLabels: string[] = []
  const labels: string[] = []
  for (let i = 0; i < n; i++) {
    const row = series[i]!
    const cx = x0 + (i + 0.5) * slot
    const v = vals[i] ?? 0
    const hRaw = yMax > 0 ? (v / yMax) * (y1 - y0) : 0
    const h = v > 0 ? Math.max(hRaw, 4) : 0
    const x = cx - barW / 2
    const active = `${row.year}-${row.month}` === currentKey
    if (h > 0) {
      const r = Math.min(5, barW / 2)
      const top = y1 - h
      const d = [
        `M ${x.toFixed(2)} ${y1.toFixed(2)}`,
        `L ${x.toFixed(2)} ${(top + r).toFixed(2)}`,
        `Q ${x.toFixed(2)} ${top.toFixed(2)} ${(x + r).toFixed(2)} ${top.toFixed(2)}`,
        `L ${(x + barW - r).toFixed(2)} ${top.toFixed(2)}`,
        `Q ${(x + barW).toFixed(2)} ${top.toFixed(2)} ${(x + barW).toFixed(2)} ${(top + r).toFixed(2)}`,
        `L ${(x + barW).toFixed(2)} ${y1.toFixed(2)}`,
        'Z',
      ].join(' ')
      bars.push(
        `<path class="sx-dash-pulse-bar${active ? ' sx-dash-pulse-bar--active' : ''}" d="${d}" fill="url(#${gradId})" opacity="${active ? '1' : '0.92'}" />`,
      )
      bars.push(
        `<line x1="${(x + 1).toFixed(2)}" y1="${top.toFixed(2)}" x2="${(x + barW - 1).toFixed(2)}" y2="${top.toFixed(2)}" stroke="#f97316" stroke-width="1.25" stroke-linecap="round" opacity="0.85" />`,
      )
      const hoursLabel = formatIntenseHoursLabel(v)
      if (hoursLabel) {
        valueLabels.push(
          `<text x="${cx.toFixed(2)}" y="${(top - 5).toFixed(2)}" text-anchor="middle" fill="${active ? '#9a3412' : '#c2410c'}" font-size="9" font-weight="800" font-family="inherit">${hoursLabel}</text>`,
        )
      }
    }

    const shortLabel = `${MONTH_SHORT[row.month]}`
    labels.push(
      `<text x="${cx.toFixed(2)}" y="${(y1 + 14).toFixed(2)}" text-anchor="middle" fill="var(--sx-pulse-axis)" font-size="9" font-weight="${active ? '700' : '500'}" font-family="inherit">${shortLabel}</text>`,
    )
  }

  return `<svg class="sx-dash-pulse-chart__svg sx-dash-pulse-chart__svg--intense" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="100%" height="${vbH}" preserveAspectRatio="xMidYMid meet" role="img" aria-hidden="true">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#fff7ed" stop-opacity="0.35" />
      <stop offset="35%" stop-color="#fdba74" stop-opacity="0.75" />
      <stop offset="72%" stop-color="#fb923c" />
      <stop offset="100%" stop-color="#ea580c" />
    </linearGradient>
  </defs>
  <g>${lines.join('')}</g>
  <g>${bars.join('')}</g>
  <g>${valueLabels.join('')}</g>
  <g>${yTicks.join('')}</g>
  <g>${labels.join('')}</g>
</svg>`
}

export function buildPulseWinRingSvg(winRate: number | null, size = 112): string {
  const r = 42
  const c = 2 * Math.PI * r
  const pct = winRate == null || !Number.isFinite(winRate) ? 0 : Math.max(0, Math.min(100, winRate))
  const dash = (pct / 100) * c
  const label = winRate == null ? '—' : `${pct.toFixed(0)}%`
  const tone = winRate == null ? '#94a3b8' : pct >= 50 ? '#059669' : '#b45309'
  return `<svg class="sx-dash-pulse-ring" width="${size}" height="${size}" viewBox="0 0 112 112" aria-hidden="true">
  <circle cx="56" cy="56" r="${r}" fill="none" stroke="var(--sx-pulse-ring-track)" stroke-width="10" />
  <circle cx="56" cy="56" r="${r}" fill="none" stroke="${tone}" stroke-width="10" stroke-linecap="round"
    stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}" transform="rotate(-90 56 56)" />
  <text x="56" y="52" text-anchor="middle" fill="var(--sx-pulse-ring-text)" font-size="20" font-weight="800" font-family="inherit">${label}</text>
  <text x="56" y="70" text-anchor="middle" fill="var(--sx-pulse-axis)" font-size="9" font-weight="700" letter-spacing="0.06em" font-family="inherit">WIN</text>
</svg>`
}

export function buildPulseSymbolRowsHtml(symbols: SessionPulseSymbolStat[]): string {
  if (!symbols.length) {
    return `<div class="sx-dash-pulse-empty">Close trades in a session to map symbol focus.</div>`
  }
  return symbols
    .map((s, i) => {
      const width = Math.max(8, Math.min(100, s.share))
      const name = s.symbol.replace(/[<>&"']/g, '')
      return `<div class="sx-dash-pulse-symbol" style="--sx-pulse-i:${i}">
        <div class="sx-dash-pulse-symbol__meta">
          <span class="sx-dash-pulse-symbol__name">${name}</span>
          <span class="sx-dash-pulse-symbol__count">${s.trades} · ${s.share.toFixed(0)}%</span>
        </div>
        <div class="sx-dash-pulse-symbol__track" aria-hidden="true">
          <span class="sx-dash-pulse-symbol__fill" style="width:${width}%"></span>
        </div>
      </div>`
    })
    .join('')
}
