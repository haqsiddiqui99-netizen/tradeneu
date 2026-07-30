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

/** Map value onto a bidirectional plot: vMax at top (y0), vMin at bottom (y1). */
function valueToYRange(v: number, y0: number, y1: number, vMin: number, vMax: number): number {
  const span = vMax - vMin
  if (!(span > 0)) return (y0 + y1) / 2
  const t = (v - vMin) / span
  return y1 - t * (y1 - y0)
}

function formatMoneyTick(v: number, emphasize = false): string {
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  let s: string
  if (abs >= 1000) s = `${(abs / 1000).toFixed(1)}k`
  else if (abs >= 100) s = abs.toFixed(0)
  else if (abs >= 10) s = abs.toFixed(1)
  else s = abs.toFixed(2)
  return emphasize || v === 0 ? `${sign}$${s}` : `${sign}${s}`
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
  const yLabelX = 44
  const x0 = 52
  const y0 = 14
  const y1 = 92
  const xLabelY = 108
  const nowDate = new Date(now)

  let vals: number[]
  let xLabels: string[]
  let minSlot: number

  if (view === 'monthly') {
    vals = bucketMonthly(events, nowDate)
    xLabels = MONTH_SHORT
    minSlot = 36
  } else {
    const nDays = daysInCurrentMonth(nowDate)
    vals = bucketDaily(events, nowDate)
    xLabels = Array.from({ length: nDays }, (_, i) => String(i + 1).padStart(2, '0'))
    minSlot = 22
  }

  const n = vals.length
  const plotInnerW = Math.max(520, minSlot * n)
  const x1 = x0 + plotInnerW
  const slot = plotInnerW / n

  // Waterfall / candle bridge: each bar floats from prior cumulative level
  type WaterfallStep = { i: number; from: number; to: number; delta: number }
  const steps: WaterfallStep[] = []
  let cum = 0
  let minLevel = 0
  let maxLevel = 0
  for (let i = 0; i < n; i++) {
    const delta = vals[i] ?? 0
    const from = cum
    cum += delta
    const to = cum
    minLevel = Math.min(minLevel, from, to)
    maxLevel = Math.max(maxLevel, from, to)
    if (Math.abs(delta) > 1e-9) steps.push({ i, from, to, delta })
  }

  const topBound = maxLevel > 0 ? niceMoneyCeiling(maxLevel) : 0
  const bottomBound = minLevel < 0 ? -niceMoneyCeiling(-minLevel) : 0
  const vMax = topBound === 0 && bottomBound === 0 ? 100 : topBound === 0 ? Math.max(100, -bottomBound * 0.25) : topBound
  const vMin = topBound === 0 && bottomBound === 0 ? 0 : bottomBound === 0 ? Math.min(0, -topBound * 0.05) : bottomBound

  const tickCount = 4
  const tickVals: number[] = []
  for (let i = 0; i <= tickCount; i++) {
    tickVals.push(vMin + ((vMax - vMin) * i) / tickCount)
  }
  if (vMin < 0 && vMax > 0 && !tickVals.some((t) => Math.abs(t) < 1e-9)) {
    tickVals.push(0)
    tickVals.sort((a, b) => a - b)
  }

  const lines: string[] = []
  const yTicks: string[] = []
  for (let i = 0; i < tickVals.length; i++) {
    const v = tickVals[i]!
    const y = valueToYRange(v, y0, y1, vMin, vMax)
    lines.push(`<line x1="${x0}" y1="${y.toFixed(2)}" x2="${x1}" y2="${y.toFixed(2)}" />`)
    const emphasize = i === 0 || i === tickVals.length - 1 || Math.abs(v) < 1e-9
    yTicks.push(
      `<text x="${yLabelX}" y="${y.toFixed(2)}" text-anchor="end" dominant-baseline="middle" fill="var(--sx-tc-ytext)" font-size="10" font-weight="600" font-family="inherit">${formatMoneyTick(v, emphasize)}</text>`,
    )
  }

  const zeroY = valueToYRange(0, y0, y1, vMin, vMax)
  const gradUp = view === 'monthly' ? 'sx-dash-pnl-bar-up-m' : 'sx-dash-pnl-bar-up-d'
  const gradDown = view === 'monthly' ? 'sx-dash-pnl-bar-down-m' : 'sx-dash-pnl-bar-down-d'
  const connectors: string[] = []
  const bars: string[] = []
  const valueLabels: string[] = []
  const labels: string[] = []
  const maxBw = view === 'monthly' ? 22 : 14

  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * slot
    labels.push(
      `<text x="${cx.toFixed(2)}" y="${xLabelY}" text-anchor="middle" fill="var(--sx-tc-xtext)" font-size="9" font-weight="600" font-family="inherit">${xLabels[i] ?? ''}</text>`,
    )
  }

  for (let s = 0; s < steps.length; s++) {
    const step = steps[s]!
    const cx = x0 + (step.i + 0.5) * slot
    const bw = Math.min(maxBw, slot * 0.55)
    const yFrom = valueToYRange(step.from, y0, y1, vMin, vMax)
    const yTo = valueToYRange(step.to, y0, y1, vMin, vMax)
    let barTop = Math.min(yFrom, yTo)
    let barBottom = Math.max(yFrom, yTo)
    if (barBottom - barTop < 4) {
      if (step.delta > 0) {
        barTop = yFrom - 4
        barBottom = yFrom
      } else {
        barTop = yFrom
        barBottom = yFrom + 4
      }
    }
    const h = barBottom - barTop
    const r = Math.min(3.5, h / 2, bw / 2)
    const x = cx - bw / 2
    const isProfit = step.delta > 0
    bars.push(
      `<path class="sx-dash-pnl-bar sx-dash-pnl-bar--${isProfit ? 'profit' : 'loss'}" d="${roundedBarPath(x, barTop, bw, h, r)}" fill="url(#${isProfit ? gradUp : gradDown})" />`,
    )

    const next = steps[s + 1]
    if (next) {
      const nextCx = x0 + (next.i + 0.5) * slot
      const nextBw = Math.min(maxBw, slot * 0.55)
      const yLink = valueToYRange(step.to, y0, y1, vMin, vMax)
      const x1c = cx + bw / 2
      const x2c = nextCx - nextBw / 2
      if (x2c > x1c + 1) {
        connectors.push(
          `<line x1="${x1c.toFixed(2)}" y1="${yLink.toFixed(2)}" x2="${x2c.toFixed(2)}" y2="${yLink.toFixed(2)}" stroke="var(--sx-tc-baseline)" stroke-width="1" stroke-dasharray="3 3" opacity="0.75" />`,
        )
      }
    }

    const pnlLabel = formatBarPnlLabel(step.delta)
    if (pnlLabel) {
      const labelY = isProfit ? barTop - 6 : Math.min(barBottom + 11, y1 + 12)
      valueLabels.push(
        `<text x="${cx.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" fill="${isProfit ? '#047857' : '#be123c'}" font-size="10" font-weight="800" font-family="inherit">${pnlLabel}</text>`,
      )
    }
  }

  const vbW = Math.ceil(x1 + 10)
  const vbH = 122
  return `<svg class="sx-dash-time-chart__svg sx-dash-time-chart__svg--fill" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-time-chart-svg="${view}">
  <defs>
    <linearGradient id="${gradUp}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4ade80" />
      <stop offset="100%" stop-color="#16a34a" />
    </linearGradient>
    <linearGradient id="${gradDown}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f43f5e" />
      <stop offset="100%" stop-color="#e11d48" />
    </linearGradient>
  </defs>
  <g stroke="var(--sx-tc-grid)" fill="none" stroke-dasharray="4 6" stroke-width="1" opacity="0.95">${lines.join('')}</g>
  <line x1="${x0}" y1="${zeroY.toFixed(2)}" x2="${x1}" y2="${zeroY.toFixed(2)}" stroke="var(--sx-tc-baseline)" stroke-width="1.5" />
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
    .map((row) => ({
      id: row.session.id,
      name: row.session.name?.trim() || 'Untitled session',
      practiceMs: row.practice,
      share: practiceMs > 0 ? (row.practice / practiceMs) * 100 : 0,
      isActive: row.session.id === activeId,
    }))

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
      return `<div class="sx-dash-pulse-session${activeClass}" style="--sx-pulse-i:${i}">
        <div class="sx-dash-pulse-session__meta">
          <span class="sx-dash-pulse-session__name"><span class="sx-dash-pulse-session__label">${name}</span>${badge}</span>
          <span class="sx-dash-pulse-session__time">${formatPulseDuration(row.practiceMs)}</span>
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
