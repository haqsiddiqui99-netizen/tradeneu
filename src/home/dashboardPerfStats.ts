import type { StoredSession } from '../data/sessionStore'
import { listBattles, type BattleRecord } from '../battles/battleStore'

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

function niceMoneyCeiling(maxAbs: number): number {
  if (!Number.isFinite(maxAbs) || maxAbs <= 0) return 100
  const padded = maxAbs * 1.15
  const pow = 10 ** Math.floor(Math.log10(padded))
  const n = padded / pow
  let nice: number
  if (n <= 1) nice = 1
  else if (n <= 2) nice = 2
  else if (n <= 5) nice = 5
  else nice = 10
  return nice * pow
}

function valueToY(v: number, y0: number, y1: number, yMax: number): number {
  if (yMax <= 0) return y1
  const t = Math.min(1, Math.max(0, v / yMax))
  return y1 - t * (y1 - y0)
}

function formatMoneyTick(v: number, isMaxTick: boolean): string {
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  let s: string
  if (abs >= 1000) s = `${(abs / 1000).toFixed(1)}k`
  else if (abs >= 100) s = abs.toFixed(0)
  else if (abs >= 10) s = abs.toFixed(1)
  else s = abs.toFixed(2)
  return isMaxTick ? `${sign}$${s}` : `${sign}${s}`
}

function daysInCurrentMonth(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
}

function bucketDaily(events: PnlEvent[], now = new Date()): number[] {
  const nDays = daysInCurrentMonth(now)
  const buckets = new Array<number>(nDays).fill(0)
  for (const e of events) {
    const d = new Date(e.ts)
    if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue
    buckets[d.getDate() - 1] = (buckets[d.getDate() - 1] ?? 0) + e.pnl
  }
  return buckets
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

export function buildDashboardPerfChartSvg(
  sessions: StoredSession[],
  mode: DashboardPerfMode,
  range: DashboardPerfRange,
  view: DashboardTimeChartView,
  now = Date.now(),
): string {
  const events = collectPnlEvents(sessions, mode, range, now)
  const yLabelX = 42
  const x0 = 52
  const y0 = 14
  const y1 = 80
  const xLabelY = 102
  const tickCount = 5
  const nowDate = new Date(now)

  let vals: number[]
  let xLabels: string[]
  let minSlot: number

  if (view === 'monthly') {
    vals = bucketMonthly(events, nowDate)
    xLabels = MONTH_SHORT
    minSlot = 26
  } else {
    const nDays = daysInCurrentMonth(nowDate)
    vals = bucketDaily(events, nowDate)
    xLabels = Array.from({ length: nDays }, (_, i) => String(i + 1).padStart(2, '0'))
    minSlot = 13
  }

  const n = vals.length
  const plotInnerW = Math.max(320, minSlot * n)
  const x1 = x0 + plotInnerW
  const slot = plotInnerW / n
  const maxAbs = vals.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  const yMax = niceMoneyCeiling(maxAbs)

  const lines: string[] = []
  const yTicks: string[] = []
  for (let i = 0; i <= tickCount; i++) {
    const v = (i / tickCount) * yMax
    const y = valueToY(v, y0, y1, yMax)
    lines.push(`<line x1="${x0}" y1="${y.toFixed(2)}" x2="${x1}" y2="${y.toFixed(2)}" />`)
    const isTop = i === tickCount
    yTicks.push(
      `<text x="${yLabelX}" y="${y.toFixed(2)}" text-anchor="end" dominant-baseline="middle" fill="var(--sx-tc-ytext)" font-size="10" font-weight="600" font-family="inherit">${formatMoneyTick(v, isTop)}</text>`,
    )
  }

  const zeroY = valueToY(0, y0, y1, yMax)
  const gradUp = view === 'monthly' ? 'sx-dash-pnl-bar-up-m' : 'sx-dash-pnl-bar-up-d'
  const gradDown = view === 'monthly' ? 'sx-dash-pnl-bar-down-m' : 'sx-dash-pnl-bar-down-d'
  const rects: string[] = []
  const labels: string[] = []
  const maxBw = view === 'monthly' ? 16 : 11

  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * slot
    const bw = Math.min(maxBw, slot * 0.58)
    const v = vals[i] ?? 0
    const hRaw = yMax > 0 ? (Math.abs(v) / yMax) * (y1 - y0) : 0
    const h = Math.abs(v) > 0 ? Math.max(hRaw, 2.25) : 0
    const y = v >= 0 ? zeroY - h : zeroY
    if (h > 0) {
      rects.push(
        `<rect x="${(cx - bw / 2).toFixed(2)}" y="${y.toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(2)}" rx="3" fill="url(#${v >= 0 ? gradUp : gradDown})" />`,
      )
    }
    const rot = view === 'monthly' ? -35 : -40
    labels.push(
      `<text x="${cx.toFixed(2)}" y="${xLabelY}" text-anchor="middle" transform="rotate(${rot} ${cx.toFixed(2)} ${xLabelY})" fill="var(--sx-tc-xtext)" font-size="10" font-weight="600" font-family="inherit">${xLabels[i] ?? ''}</text>`,
    )
  }

  const vbW = Math.ceil(x1 + 12)
  const vbH = 118
  return `<svg class="sx-dash-time-chart__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}" preserveAspectRatio="xMinYMin meet" aria-hidden="true" data-time-chart-svg="${view}">
  <defs>
    <linearGradient id="${gradUp}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6ee7b7" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
    <linearGradient id="${gradDown}" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#fda4af" />
      <stop offset="100%" stop-color="#e11d48" />
    </linearGradient>
  </defs>
  <g stroke="var(--sx-tc-grid)" fill="none" stroke-dasharray="4 6" stroke-width="1" opacity="0.95">${lines.join('')}</g>
  <line x1="${x0}" y1="${zeroY.toFixed(2)}" x2="${x1}" y2="${zeroY.toFixed(2)}" stroke="var(--sx-tc-baseline)" stroke-width="1.35" />
  <g>${rects.join('')}</g>
  <g>${yTicks.join('')}</g>
  <g>${labels.join('')}</g>
</svg>`
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
