import './traderLocal.css'
import './dashboardTheme.css'
import './surrealHero.css'
import {
  appPageFromPath,
  applyLocaleFromPath,
  dashCodeToLocaleTag,
  resolveAppPath,
} from '../appPaths'
import { formatSessionModalDate } from '../data/sessionDateRange'
import {
  createSession,
  deleteSession,
  duplicateSession,
  getLastSessionId,
  getSession,
  listSessions,
  saveSessionDraftCompat,
  sessionToPayload,
  setLastSessionId,
  touchSessionOpened,
  updateSession,
  updateSessionBacktest,
  updateSessionReplay,
  updateSessionProp,
  updateSessionChartIndicators,
  type StoredSession,
} from '../data/sessionStore'
import { propStatusLabel } from '../prop/propChallengeUi'
import { clearAllAuthSessions, getAuthUser, GUEST_AUTH_EMAIL } from '../auth/authSession'
import { mountAiChatPanel } from '../ai/aiChatPanel'
import { primarySessionSymbol } from '../sessionTypes'
import { fetchMlHealth } from '../ml/mlApi'
import { createSessionModal } from '../sessionModal'
import type { SessionCreatedPayload } from '../sessionTypes'
import { mountStockApp } from '../stocks/mountStockApp'
import { confirmDialog } from '../views/confirmDialog'
import { mountChartWorkspace } from '../views/chartWorkspace'
import { resolveStrategy } from '../strategy/strategyCatalog'
import { mountStrategyPage } from '../views/mountStrategyPage'
import { mountSettingsPage } from '../views/mountSettingsPage'
import { mountSubscriptionPage } from '../views/mountSubscriptionPage'
import { mountProfilePage, type ProfileSessionStats } from '../views/mountProfilePage'
import { postTelemetryEvent } from '../telemetry/telemetryApi'
import { DASH_LOCALES, dashLocaleMenuLabel, isDashLocaleCode } from './dashboardLocales'
import { readDisplayName, readUserAvatar } from './dashboardUserPrefs'
import {
  buildDashboardPerfChartSvg,
  describeDashboardPerfChartPeriod,
  buildPulseActivityChartSvg,
  buildPulsePracticeRowsHtml,
  buildPulsePracticeSplitHtml,
  buildPulseSymbolRowsHtml,
  buildPulseWinRingSvg,
  computeDashboardPerfTotals,
  computeSessionPulseStats,
  formatDashboardPerfMoney,
  formatDashboardWinRate,
  formatPulseDuration,
  type DashboardPerfRange,
} from './dashboardPerfStats'
import { openSessionSummaryDialog } from '../views/sessionSummaryDialog'

const LS_LOCALE = 'suplexity-dash-locale'
const LS_SESSION_FILTER = 'suplexity-dash-session-filter'
const LS_SESSION_SORT = 'suplexity-dash-session-sort'
const LS_THEME = 'suplexity-dash-theme'
const LS_ACCOUNT_TIER = 'suplexity-account-tier'
const LS_PULSE_RANGE = 'suplexity-dash-pulse-range'
const LS_TESTING_TAB = 'suplexity-dash-testing-tab'

const TESTING_TABS = ['dashboard', 'sessions', 'trades', 'analytics'] as const
type TestingTab = (typeof TESTING_TABS)[number]

const PERF_RANGE_VALUES = ['week', 'month', 'lifetime'] as const

const SESSION_FILTER_VALUES = [
  'all',
  'backtest',
  'prop',
  'prop-active',
  'prop-passed',
  'prop-failed',
] as const
type SessionFilterValue = (typeof SESSION_FILTER_VALUES)[number]

const SESSION_SORT_VALUES = ['recent', 'updated', 'name-asc', 'name-desc', 'pnl-desc', 'pnl-asc'] as const
type SessionSortValue = (typeof SESSION_SORT_VALUES)[number]

const SESSION_FILTER_LABELS: Record<SessionFilterValue, string> = {
  all: 'All sessions',
  backtest: 'Backtest only',
  prop: 'Prop firm only',
  'prop-active': 'Prop — in progress',
  'prop-passed': 'Prop — passed',
  'prop-failed': 'Prop — failed',
}

const SESSION_SORT_LABELS: Record<SessionSortValue, string> = {
  recent: 'Recently opened',
  updated: 'Recently updated',
  'name-asc': 'Name A → Z',
  'name-desc': 'Name Z → A',
  'pnl-desc': 'Best backtest P&L',
  'pnl-asc': 'Worst backtest P&L',
}

function buildSessionFilterPanelHtml(): string {
  return SESSION_FILTER_VALUES.map(
    (v) =>
      `<button type="button" role="option" class="sx-dash-perf-option" data-session-filter-option="${v}">${SESSION_FILTER_LABELS[v]}</button>`,
  ).join('')
}

function buildSessionSortPanelHtml(): string {
  return SESSION_SORT_VALUES.map(
    (v) =>
      `<button type="button" role="option" class="sx-dash-perf-option" data-session-sort-option="${v}">${SESSION_SORT_LABELS[v]}</button>`,
  ).join('')
}

function readSessionFilter(): SessionFilterValue {
  try {
    const v = localStorage.getItem(LS_SESSION_FILTER)
    if (v && SESSION_FILTER_VALUES.includes(v as SessionFilterValue)) return v as SessionFilterValue
  } catch {
    /* noop */
  }
  return 'all'
}

function writeSessionFilter(filter: SessionFilterValue) {
  try {
    localStorage.setItem(LS_SESSION_FILTER, filter)
  } catch {
    /* noop */
  }
}

function readSessionSort(): SessionSortValue {
  try {
    const v = localStorage.getItem(LS_SESSION_SORT)
    if (v && SESSION_SORT_VALUES.includes(v as SessionSortValue)) return v as SessionSortValue
  } catch {
    /* noop */
  }
  return 'recent'
}

function writeSessionSort(sort: SessionSortValue) {
  try {
    localStorage.setItem(LS_SESSION_SORT, sort)
  } catch {
    /* noop */
  }
}

function readPulseRange(): DashboardPerfRange {
  try {
    const v = localStorage.getItem(LS_PULSE_RANGE)
    if (v && PERF_RANGE_VALUES.includes(v as DashboardPerfRange)) return v as DashboardPerfRange
  } catch {
    /* noop */
  }
  return 'lifetime'
}

function writePulseRange(range: DashboardPerfRange) {
  try {
    localStorage.setItem(LS_PULSE_RANGE, range)
  } catch {
    /* noop */
  }
}

/** Dashboard UI languages — label shown as "Name (CODE)" in the menu. */

function buildDashLocalePanelHtml(): string {
  return DASH_LOCALES.map((l) => {
    const label = dashLocaleMenuLabel(l.code, l.name)
    return `<button type="button" role="option" class="sx-dash-locale-option" data-locale-option="${l.code}">${label}</button>`
  }).join('')
}

function readAccountTier(): 'free' | 'intermediate' | 'pro' {
  try {
    const v = localStorage.getItem(LS_ACCOUNT_TIER)
    if (v === 'pro' || v === 'intermediate') return v
  } catch {
    /* noop */
  }
  return 'free'
}

function writeAccountTier(tier: 'free' | 'intermediate' | 'pro') {
  try {
    localStorage.setItem(LS_ACCOUNT_TIER, tier)
  } catch {
    /* noop */
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Free plan session slot cap (display only). */
const FREE_SESSION_LIMIT = 10

function formatSessionTimestamp(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function formatDashMoney(n: number): string {
  const sign = n < 0 ? '-' : ''
  const v = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}$${v}`
}

function sessionMatchesFilter(session: StoredSession, filter: SessionFilterValue): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'backtest':
      return session.sessionType === 'backtest'
    case 'prop':
      return session.sessionType === 'prop'
    case 'prop-active':
      return session.sessionType === 'prop' && session.propResult?.status === 'active'
    case 'prop-passed':
      return session.sessionType === 'prop' && session.propResult?.status === 'passed'
    case 'prop-failed':
      return session.sessionType === 'prop' && session.propResult?.status === 'failed'
    default:
      return true
  }
}

function sessionSortKey(session: StoredSession, sort: SessionSortValue): string | number {
  switch (sort) {
    case 'recent':
      return session.lastOpenedAt ?? session.updatedAt
    case 'updated':
      return session.updatedAt
    case 'name-asc':
    case 'name-desc':
      return session.name.toLowerCase()
    case 'pnl-desc':
    case 'pnl-asc':
      return session.lastBacktest?.netPnl ?? Number.NEGATIVE_INFINITY
    default:
      return session.updatedAt
  }
}

function sortSessions(sessions: StoredSession[], sort: SessionSortValue): StoredSession[] {
  const next = [...sessions]
  next.sort((a, b) => {
    if (sort === 'name-asc') return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    if (sort === 'name-desc') return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' })
    if (sort === 'pnl-asc') {
      const av = a.lastBacktest?.netPnl ?? Number.NEGATIVE_INFINITY
      const bv = b.lastBacktest?.netPnl ?? Number.NEGATIVE_INFINITY
      return av - bv
    }
    const av = sessionSortKey(a, sort)
    const bv = sessionSortKey(b, sort)
    if (typeof av === 'number' && typeof bv === 'number') return bv - av
    return String(bv).localeCompare(String(av))
  })
  return next
}

function filterAndSortSessions(
  sessions: StoredSession[],
  filter: SessionFilterValue,
  sort: SessionSortValue,
  query: string,
): StoredSession[] {
  const q = query.trim().toLowerCase()
  let rows = sessions.filter((s) => sessionMatchesFilter(s, filter))
  if (q) rows = rows.filter((s) => sessionSearchBlob(s).includes(q))
  return sortSessions(rows, sort)
}

function lastBacktestStripHtml(session: StoredSession): string {
  const bt = session.lastBacktest
  if (!bt) return ''
  const strat = resolveStrategy(bt.strategyId)
  const stratName = strat?.name ?? bt.strategyId
  const pnlTone = bt.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
  const winPct = Number.isFinite(bt.winRate) ? bt.winRate.toFixed(0) : '0'
  const ranAt = formatSessionTimestamp(bt.ranAt)
  return `<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      <span class="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
        <i class="fa-solid fa-flask text-[0.65rem] text-sky-400/80" aria-hidden="true"></i>
        <span class="font-semibold text-zinc-300">Last backtest</span>
        <span class="${pnlTone} font-bold">${formatDashMoney(bt.netPnl)}</span>
        <span class="text-zinc-500">${bt.totalTrades} trade${bt.totalTrades === 1 ? '' : 's'} · ${winPct}% win</span>
      </span>
      <span class="truncate text-zinc-500" title="${escapeHtml(stratName)}">${escapeHtml(stratName)} · ${escapeHtml(ranAt)}</span>
    </div>`
}

function replayJournalStripHtml(session: StoredSession): string {
  const replay = session.replayState
  if (!replay) return ''
  const closed = replay.account.closedTrades
  const hasActivity = closed.length > 0 || Math.abs(replay.account.realizedPnL) > 1e-6
  if (!hasActivity) return ''
  const pnlTone = replay.account.realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
  const wins = closed.filter((t) => t.pnl > 0).length
  const winPct = closed.length ? ((wins / closed.length) * 100).toFixed(0) : '0'
  const label = session.sessionType === 'prop' ? 'Paper journal' : 'Replay journal'
  return `<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      <span class="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
        <i class="fa-solid fa-book text-[0.65rem] text-violet-400/80" aria-hidden="true"></i>
        <span class="font-semibold text-zinc-300">${label}</span>
        <span class="${pnlTone} font-bold">${formatDashMoney(replay.account.realizedPnL)}</span>
        <span class="text-zinc-500">${closed.length} trade${closed.length === 1 ? '' : 's'}${closed.length ? ` · ${winPct}% win` : ''}</span>
      </span>
    </div>`
}

function parseSessionBalanceNumber(raw: string): number | null {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function buildSessionSummaryPanelHtml(session: StoredSession): string {
  const bt = session.lastBacktest
  const replay = session.replayState
  const closed = replay?.account.closedTrades ?? []
  const hasReplay = closed.length > 0 || (replay != null && Math.abs(replay.account.realizedPnL) > 1e-6)

  const pnl = bt != null ? bt.netPnl : hasReplay ? replay!.account.realizedPnL : 0
  const tradeCount = bt != null ? bt.totalTrades : hasReplay ? closed.length : 0
  let winRate = bt != null && Number.isFinite(bt.winRate) ? bt.winRate : null
  if (winRate == null && hasReplay && closed.length) {
    const wins = closed.filter((t) => t.pnl > 0).length
    winRate = (wins / closed.length) * 100
  }
  const winLabel = winRate != null ? `${winRate.toFixed(1)}%` : '—'
  const pnlTone = pnl > 0 ? 'is-profit' : pnl < 0 ? 'is-loss' : 'is-flat'
  const strat = bt ? resolveStrategy(bt.strategyId) : null
  const stratName = strat?.name ?? bt?.strategyId ?? '—'
  const typeLabel = session.sessionType === 'prop' ? 'Prop firm' : 'Backtesting'
  const ranAt = bt ? formatSessionTimestamp(bt.ranAt) : '—'
  const initialBal = parseSessionBalanceNumber(session.balance)
  const initialLabel = initialBal != null ? formatDashMoney(initialBal) : escapeHtml(session.balance || '—')
  const finalLabel = initialBal != null ? formatDashMoney(initialBal + pnl) : '—'

  const card = (label: string, value: string, valueClass = '') =>
    `<div class="sx-dash-session-summary__kpi">
                <span class="sx-dash-session-summary__kpi-label">${label}</span>
                <span class="sx-dash-session-summary__kpi-value${valueClass ? ` ${valueClass}` : ''}">${value}</span>
              </div>`

  const propCards =
    session.sessionType === 'prop'
      ? `${card('Challenge', escapeHtml(propStatusLabel(session.propResult?.status)), 'sx-dash-session-summary__kpi-value--sm')}
              ${card('Profit target', `${session.propRules?.profitTargetPct ?? 10}%`, 'sx-dash-session-summary__kpi-value--sm')}
              ${card('Max drawdown', `${session.propRules?.maxDrawdownPct ?? 5}%`, 'sx-dash-session-summary__kpi-value--sm')}
              ${card('Daily loss limit', `${session.propRules?.maxDailyLossPct ?? 2}%`, 'sx-dash-session-summary__kpi-value--sm')}`
      : ''

  return `<div class="sx-dash-session-row__details sx-dash-session-summary mt-3 hidden w-full" data-session-details>
            <div class="sx-dash-session-summary__kpis" role="group" aria-label="Session summary">
              ${card('Session name', escapeHtml(session.name), 'sx-dash-session-summary__kpi-value--sm')}
              ${card('Created', escapeHtml(formatSessionTimestamp(session.createdAt)), 'sx-dash-session-summary__kpi-value--sm')}
              ${card('Date range', sessionDateRangeHtml(session, true), 'sx-dash-session-summary__kpi-value--sm sx-dash-session-summary__kpi-value--multiline')}
              ${card('Symbol', escapeHtml(session.assets))}
              ${card('Type', typeLabel)}
              ${card('Initial balance', initialLabel)}
              ${card('Final balance', finalLabel, `sx-dash-session-summary__kpi-value--${pnlTone}`)}
              ${card('Total trades', String(tradeCount))}
              ${card('Backtest ran', escapeHtml(ranAt), 'sx-dash-session-summary__kpi-value--sm')}
              ${card('Strategy', escapeHtml(stratName), 'sx-dash-session-summary__kpi-value--sm')}
              ${card('Total P&amp;L', formatDashMoney(pnl), `sx-dash-session-summary__kpi-value--${pnlTone}`)}
              ${card('Win rate', winLabel)}
              ${propCards}
            </div>
          </div>`
}

function sessionDateRangeParts(session: StoredSession): { start: string; end: string } | null {
  const a = formatSessionModalDate(session.startDate)
  const b = formatSessionModalDate(session.endDate)
  if (a === '—' && b === '—') return null
  return { start: a, end: b }
}

function sessionDateRangeHtml(session: StoredSession, multiline = false): string {
  const parts = sessionDateRangeParts(session)
  if (!parts) return 'No date range'
  if (multiline) return `${escapeHtml(parts.start)} -<br>${escapeHtml(parts.end)}`
  return `${escapeHtml(parts.start)} – ${escapeHtml(parts.end)}`
}

function sessionSymbolBadgeHtml(session: StoredSession): string {
  return `<span class="sx-dash-session-symbol-badge inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.08] dark:text-zinc-200">${escapeHtml(session.assets)}</span>`
}

function sessionBadgeHtml(session: StoredSession): string {
  if (session.sessionType === 'prop') {
    return '<span class="inline-flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-200"><i class="fa-solid fa-bolt text-[0.6rem]" aria-hidden="true"></i>Prop</span>'
  }
  const created = escapeHtml(formatSessionTimestamp(session.createdAt))
  return `<span class="sx-dash-session-created-badge inline-flex items-center gap-1 rounded-full border border-sky-300/70 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-sky-800" title="Created ${created}"><i class="fa-regular fa-calendar text-[0.6rem]" aria-hidden="true"></i>${created}</span>`
}

function propChallengeBadgeHtml(session: StoredSession): string {
  if (session.sessionType !== 'prop') return ''
  const status = session.propResult?.status
  if (status === 'passed') {
    return '<span class="inline-flex items-center rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200">Passed</span>'
  }
  if (status === 'failed') {
    return '<span class="inline-flex items-center rounded-full border border-rose-400/35 bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-200">Failed</span>'
  }
  if (status === 'active') {
    return '<span class="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-100">In progress</span>'
  }
  return ''
}

function sessionSearchBlob(session: StoredSession): string {
  return `${session.name} ${session.assets} ${session.balance} ${session.sessionType}`.toLowerCase()
}

function buildSessionActionsHtml(): string {
  return `
      <div class="sx-dash-session-row__actions flex shrink-0 flex-wrap items-center justify-end gap-1 self-start sm:flex-col sm:items-end lg:flex-row">
        <button type="button" data-action="session-delete" class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-rose-400 transition hover:border-rose-500/25 hover:bg-rose-500/10" title="Delete" aria-label="Delete session"><i class="fa-solid fa-trash-can text-[0.8rem]" aria-hidden="true"></i></button>
        <button type="button" data-action="session-edit" class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-zinc-200" title="Edit" aria-label="Edit session"><i class="fa-solid fa-pen text-[0.8rem]" aria-hidden="true"></i></button>
        <button type="button" data-action="session-duplicate" class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-zinc-200" title="Duplicate" aria-label="Duplicate session"><i class="fa-regular fa-copy text-[0.8rem]" aria-hidden="true"></i></button>
        <button type="button" data-action="session-summary" class="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-white/12 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/[0.1]">Summary</button>
        <button type="button" data-action="session-expand" class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-zinc-500 transition hover:bg-white/[0.05]" title="Expand details" aria-label="Expand details" aria-expanded="false"><i class="fa-solid fa-chevron-down text-[0.75rem] sx-dash-session-expand-ico" aria-hidden="true"></i></button>
      </div>`
}

function buildSessionRowHtml(session: StoredSession): string {
  const lastOpened = session.lastOpenedAt
    ? `Last opened ${formatSessionTimestamp(session.lastOpenedAt)}`
    : `Updated ${formatSessionTimestamp(session.updatedAt)}`
  const actions = buildSessionActionsHtml()
  return `<li class="sx-dash-session-row rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4 sm:p-5" data-session-id="${escapeHtml(session.id)}" data-session-name="${escapeHtml(sessionSearchBlob(session))}">
          <div class="sx-dash-session-row__main flex flex-col gap-4 lg:flex-row lg:items-start">
            <button type="button" data-action="resume-session" class="flex h-12 w-12 shrink-0 items-center justify-center self-start rounded-full bg-[#334155] text-white shadow-[0_8px_22px_rgba(51,65,85,0.35)] transition hover:bg-[#1E293B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60" title="Resume session" aria-label="Resume session">
              <i class="fa-solid fa-play ml-0.5 text-sm" aria-hidden="true"></i>
            </button>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-base font-bold text-slate-900 dark:text-white">${escapeHtml(session.name)}</span>
                ${sessionBadgeHtml(session)}
                ${sessionSymbolBadgeHtml(session)}
                ${propChallengeBadgeHtml(session)}
              </div>
              <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span class="inline-flex items-center gap-1.5">
                  <i class="fa-regular fa-calendar text-[0.75rem]" aria-hidden="true"></i>
                  <span class="sx-dash-session-date-range">${sessionDateRangeHtml(session)}</span>
                </span>
                <span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-wallet text-[0.75rem]" aria-hidden="true"></i>${escapeHtml(session.balance)}</span>
              </div>
              ${lastBacktestStripHtml(session)}
              ${replayJournalStripHtml(session)}
              <p class="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">${escapeHtml(lastOpened)}</p>
            </div>
            ${actions}
          </div>
          ${buildSessionSummaryPanelHtml(session)}
        </li>`
}

type DashboardThemeMode = 'dark' | 'light'

function readDashTheme(): DashboardThemeMode {
  try {
    const v = localStorage.getItem(LS_THEME)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* noop */
  }
  return 'light'
}

function writeDashTheme(mode: DashboardThemeMode) {
  try {
    localStorage.setItem(LS_THEME, mode)
  } catch {
    /* noop */
  }
}

function applyDashTheme(appRoot: HTMLElement, mode: DashboardThemeMode) {
  appRoot.dataset.dashboardTheme = mode
  if (mode === 'dark') {
    appRoot.classList.add('dark')
  } else {
    appRoot.classList.remove('dark')
  }
  const themeLabel = mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  appRoot.querySelectorAll<HTMLButtonElement>('.sx-dash-theme-icon-btn').forEach((btn) => {
    btn.setAttribute('aria-label', themeLabel)
  })
}

function syncDashFullscreenUi(appRoot: HTMLElement) {
  const fs = document.fullscreenElement != null
  appRoot.classList.toggle('sx-dash-ui-fullscreen', fs)
  const label = fs ? 'Exit fullscreen' : 'Enter fullscreen'
  appRoot.querySelectorAll<HTMLButtonElement>('.sx-dash-fullscreen-btn').forEach((btn) => {
    btn.setAttribute('aria-label', label)
  })
}

function setAiChatOpen(appRoot: HTMLElement, open: boolean) {
  appRoot.classList.toggle('sx-dash-ai-chat--open', open)
  const drawer = appRoot.querySelector('#sx-dash-ai-chat-drawer')
  const backdrop = appRoot.querySelector('#sx-dash-ai-chat-backdrop')
  drawer?.setAttribute('aria-hidden', open ? 'false' : 'true')
  backdrop?.setAttribute('aria-hidden', open ? 'false' : 'true')
  if (open) {
    requestAnimationFrame(() => {
      appRoot.querySelector<HTMLButtonElement>('#sx-dash-ai-chat-drawer [data-action="ai-chat-close"]')?.focus()
    })
  }
}

function appendElementsFromHtml(host: HTMLElement, html: string) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  for (const node of Array.from(t.content.children)) {
    host.appendChild(node)
  }
}

function saveSessionDraft(p: SessionCreatedPayload) {
  saveSessionDraftCompat(p)
}

function buildSessionPulseKpiHtml(opts?: { titleId?: string; extraClass?: string }): string {
  const titleId = opts?.titleId ?? 'sx-dash-pulse-title'
  const extraClass = opts?.extraClass ? ` ${opts.extraClass}` : ''
  return `
            <section class="sx-dash-pulse sx-dash-pulse--pro sx-dash-pulse--kpi-only${extraClass}" aria-labelledby="${titleId}" data-sx-session-pulse>
              <div class="sx-dash-pulse__head">
                <div>
                  <h3 id="${titleId}" class="sx-dash-pulse__title">Session Pulse</h3>
                  <p class="sx-dash-pulse__sub">Your practice desk at a glance — time, edge, and equity path.</p>
                </div>
                <div class="sx-dash-pulse__range" role="group" aria-label="Pulse time range">
                  <button type="button" class="sx-dash-pulse__range-btn" data-pulse-range="week">7D</button>
                  <button type="button" class="sx-dash-pulse__range-btn" data-pulse-range="month">30D</button>
                  <button type="button" class="sx-dash-pulse__range-btn sx-dash-pulse__range-btn--active" data-pulse-range="lifetime" aria-pressed="true">All</button>
                </div>
              </div>

              <div class="sx-dash-pulse__kpi" role="group" aria-label="Key pulse metrics">
                <div class="sx-dash-pulse__kpi-item">
                  <div class="sx-dash-pulse__kpi-top">
                    <span class="sx-dash-pulse__kpi-label">Practice time</span>
                    <button type="button" class="sx-dash-pulse__info" title="Estimated desk time across sessions in this range." aria-label="About practice time">i</button>
                  </div>
                  <p class="sx-dash-pulse__kpi-value" data-sx-pulse="practice">—</p>
                  <p class="sx-dash-pulse__kpi-meta" data-sx-pulse="practice-hint">Across sessions</p>
                </div>
                <div class="sx-dash-pulse__kpi-item">
                  <div class="sx-dash-pulse__kpi-top">
                    <span class="sx-dash-pulse__kpi-label">Market tape</span>
                    <button type="button" class="sx-dash-pulse__info" title="Sum of market date ranges you replayed." aria-label="About market tape">i</button>
                  </div>
                  <p class="sx-dash-pulse__kpi-value" data-sx-pulse="historical">—</p>
                  <p class="sx-dash-pulse__kpi-meta" data-sx-pulse="historical-hint">Historical coverage</p>
                </div>
                <div class="sx-dash-pulse__kpi-item">
                  <div class="sx-dash-pulse__kpi-top">
                    <span class="sx-dash-pulse__kpi-label">Net P&amp;L</span>
                    <button type="button" class="sx-dash-pulse__info" title="Net profit and loss from backtests in this range." aria-label="About Net P&amp;L">i</button>
                  </div>
                  <p class="sx-dash-pulse__kpi-value" data-sx-pulse="pnl">—</p>
                  <p class="sx-dash-pulse__kpi-meta" data-sx-pulse="pnl-hint">Backtest results</p>
                </div>
                <div class="sx-dash-pulse__kpi-item">
                  <div class="sx-dash-pulse__kpi-top">
                    <span class="sx-dash-pulse__kpi-label">Win rate</span>
                    <button type="button" class="sx-dash-pulse__info" title="Share of winning trades over closed trades." aria-label="About win rate">i</button>
                  </div>
                  <p class="sx-dash-pulse__kpi-value" data-sx-pulse="winrate">—</p>
                  <p class="sx-dash-pulse__kpi-meta" data-sx-pulse="winrate-hint">Closed trade edge</p>
                </div>
              </div>
            </section>`
}

function buildRecentSessionsSectionHtml(): string {
  return `
            <section
              class="sx-dash-recent-sessions sx-dash-card-surface overflow-hidden rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-6 sm:py-5"
              aria-labelledby="sx-dash-recent-sessions-title"
            >
              <div class="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 id="sx-dash-recent-sessions-title" class="text-lg font-bold tracking-tight text-slate-900 dark:text-white sm:text-xl">
                  Recent Sessions
                </h3>
                <div class="flex flex-wrap items-center gap-3">
                  <span class="text-sm font-medium text-zinc-500 dark:text-zinc-400" data-sx-sessions-count>0 out of 2 sessions</span>
                  <div
                    class="h-2 w-28 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10"
                    role="progressbar"
                    aria-valuemin="0"
                    aria-valuemax="2"
                    aria-valuenow="0"
                    data-sx-sessions-count-bar
                  >
                    <div
                      class="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-[width] duration-300"
                      data-sx-sessions-count-fill
                      style="width: 0%"
                    ></div>
                  </div>
                </div>
              </div>

              <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div class="relative min-w-0 flex-1">
                  <i
                    class="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[0.8rem] text-zinc-500 dark:text-zinc-500"
                    aria-hidden="true"
                  ></i>
                  <input
                    id="sx-dash-sessions-search"
                    type="search"
                    autocomplete="off"
                    placeholder="Search sessions"
                    class="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/25 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  />
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <div class="sx-dash-perf-dd relative" data-sx-session-dd="filter">
                    <button
                      type="button"
                      data-action="sessions-filter"
                      class="flex h-10 min-w-[2.5rem] items-center justify-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-zinc-600 transition hover:bg-zinc-50 dark:border-white/12 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1]"
                      title="Filter sessions"
                      aria-label="Filter sessions"
                      aria-expanded="false"
                    >
                      <i class="fa-solid fa-filter text-[0.85rem]" aria-hidden="true"></i>
                      <span class="sx-dash-session-filter-label hidden text-xs font-semibold sm:inline">All</span>
                      <i class="fa-solid fa-chevron-down sx-dash-perf-trigger__chev hidden text-[0.55rem] text-zinc-400 sm:inline" aria-hidden="true"></i>
                    </button>
                    <div class="sx-dash-perf-panel hidden min-w-[11rem]" role="listbox" aria-label="Session filter"></div>
                  </div>
                  <div class="sx-dash-perf-dd relative" data-sx-session-dd="sort">
                    <button
                      type="button"
                      data-action="sessions-sort"
                      class="inline-flex h-10 min-w-[10.5rem] items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/12 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/[0.1]"
                      aria-label="Sort sessions"
                      aria-expanded="false"
                    >
                      <i class="fa-solid fa-arrows-up-down text-[0.75rem] text-zinc-500 dark:text-zinc-400" aria-hidden="true"></i>
                      <span class="sx-dash-session-sort-label truncate">Recently opened</span>
                      <i class="fa-solid fa-chevron-down sx-dash-perf-trigger__chev text-[0.55rem] text-zinc-400" aria-hidden="true"></i>
                    </button>
                    <div class="sx-dash-perf-panel hidden min-w-[11rem]" role="listbox" aria-label="Session sort"></div>
                  </div>
                </div>
              </div>

              <ul id="sx-dash-session-list" class="mb-5 list-none space-y-3 p-0" aria-live="polite"></ul>

              <div
                class="sx-dash-recent-sessions__banner flex flex-col gap-3 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-violet-50 to-sky-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                data-sx-sessions-banner
                role="status"
              >
                <p class="text-sm leading-snug text-slate-600">
                  Sessions on the Beginner plan are hidden after 1 week.
                  <span class="text-slate-500">Use the crown in the top bar to upgrade to Pro and unlock past sessions.</span>
                </p>
              </div>
            </section>`
}

/**
 * TraderLocal-style dark dashboard — session launcher & markets.
 */
export async function mountDashboardApp(root: HTMLElement): Promise<void> {
  document.documentElement.removeAttribute('data-theme')
  document.title = 'Tradeneu — Dashboard'

  root.replaceChildren()
  appendElementsFromHtml(
    root,
    `
<div class="flex h-full min-h-0 flex-col overflow-hidden bg-[#f5f3ff] text-slate-800" id="sx-app-root" data-dashboard-theme="light">
  <div id="view-dash" class="sx-dash relative flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-slate-800 selection:bg-indigo-500/20">
    <div class="sx-dash__mesh" aria-hidden="true"></div>
    <div class="sx-dash__noise" aria-hidden="true"></div>
    <div class="sx-dash__orb sx-dash__orb--a" aria-hidden="true"></div>
    <div class="sx-dash__orb sx-dash__orb--b" aria-hidden="true"></div>
    <div class="sx-dash__orb sx-dash__orb--c" aria-hidden="true"></div>

    <div class="sx-dash__layer flex min-h-0 flex-1 flex-col overflow-hidden">
    <header class="sx-dash-header sx-dash-topbar relative z-[45] w-full shrink-0 border-b border-slate-200/90 bg-white">
      <div class="sx-dash-header__bar relative mx-auto flex w-full max-w-[1440px] items-center gap-3 px-4 py-2.5 sm:gap-5 sm:px-6 sm:py-3 lg:px-8">
        <div class="sx-dash__brand-mark relative z-[1] min-w-0 shrink-0">
          <div class="sx-dash-account" data-sx-account-menu>
            <span class="sx-dash-cta-ai sx-dash-account-ai">
              <span class="sx-dash-cta-ai__glow" aria-hidden="true"></span>
              <span class="sx-dash-cta-ai__border" aria-hidden="true"><span class="sx-dash-cta-ai__ring" style="animation-delay:-0.8s"></span></span>
              <button
                type="button"
                class="sx-dash-account-btn sx-dash-account-btn--ai"
                data-sx-account-toggle
                aria-label="Guest menu"
                aria-haspopup="menu"
                aria-expanded="false"
                aria-controls="sx-dash-account-panel"
                title="Guest"
              >
                <span class="sx-dash-account-btn__icon" data-sx-account-avatar aria-hidden="true">
                  <i class="fa-solid fa-user" data-sx-account-avatar-fallback></i>
                </span>
                <span class="sx-dash-account-btn__label" data-sx-account-label>Guest</span>
                <span class="sx-dash-account-btn__plan sx-dash-account-btn__plan--free" data-sx-account-plan>Free</span>
                <i class="fa-solid fa-chevron-down sx-dash-account-btn__chev" aria-hidden="true"></i>
              </button>
            </span>
            <div class="sx-dash-account__menu" id="sx-dash-account-panel" role="menu" hidden>
              <button type="button" role="menuitem" class="sx-dash-account__item sx-dash-account__item--danger" data-nav="logout">
                <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>

        <div class="sx-dash-wordmark pointer-events-none absolute inset-x-0 top-1/2 z-0 flex -translate-y-1/2 justify-center px-28 sm:px-36">
          <div class="sx-dash-wordmark__stack">
            <p class="sx-dash-wordmark__tag">Backtesting</p>
            <p class="sx-dash-wordmark__mark sx-dash-wordmark__mark--e">
              <span class="sx-dash-wordmark__mono" aria-hidden="true">TN</span>
              <span class="sx-dash-wordmark__trade">TRADE</span><span class="sx-dash-wordmark__neu">NEU</span>
              <span class="sr-only">Tradeneu Backtesting</span>
            </p>
          </div>
        </div>

        <div class="relative z-[1] ml-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <span class="sr-only" id="sx-dash-display-name">${escapeHtml(readDisplayName())}</span>
          <span class="sr-only" id="sx-dash-plan-badge">Free user</span>
          <span class="sr-only" id="sx-ml-pill" title="ML API">ML …</span>

          <div class="sx-dash-topbar-tools flex flex-wrap items-center justify-end gap-2 sm:gap-2.5" role="toolbar" aria-label="Dashboard actions">
            <span class="sx-dash-tip-wrap inline-flex">
              <button type="button" class="sx-dash-pro-upgrade-btn inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-300/60 bg-gradient-to-br from-amber-50 via-violet-50 to-sky-50 text-amber-700 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/55" data-action="pro-upgrade" aria-label="Upgrade to Pro">
                <i class="fa-solid fa-crown text-[0.8rem]" aria-hidden="true"></i>
              </button>
              <span class="sx-dash-tip">Upgrade Pro</span>
            </span>
            <span class="sx-dash-tip-wrap inline-flex">
              <button type="button" data-action="ai-chat" class="sx-dash-ai-chat-btn inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45" aria-label="Open AI assistant">
                <i class="fa-solid fa-wand-magic-sparkles text-[0.75rem] shrink-0" aria-hidden="true"></i>
                <span class="text-[11px] font-bold leading-none tracking-tight">AI</span>
              </button>
              <span class="sx-dash-tip">AI Assistant</span>
            </span>
            <span class="sx-dash-tip-wrap relative inline-flex h-9 shrink-0">
              <div class="sx-dash-locale-dd relative h-9 shrink-0" data-sx-locale-dropdown>
                <button
                  type="button"
                  class="sx-dash-locale-trigger inline-flex h-9 min-w-[3.1rem] shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white py-0 pl-2.5 pr-2 text-left text-[10px] font-bold text-slate-700 outline-none transition hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-sky-400/45"
                  aria-expanded="false"
                  aria-haspopup="listbox"
                  aria-label="Language"
                >
                  <span class="sx-dash-locale-trigger__code">EN</span>
                  <i class="fa-solid fa-chevron-down sx-dash-locale-trigger__chev text-[0.55rem] text-slate-400" aria-hidden="true"></i>
                </button>
                <div class="sx-dash-locale-panel hidden" role="listbox" aria-label="Choose language"></div>
              </div>
              <span class="sx-dash-tip">Translate</span>
            </span>
            <span class="sx-dash-tip-wrap inline-flex">
              <button type="button" class="sx-dash-theme-icon-btn relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45" aria-label="Switch to light theme">
                <i class="fa-solid fa-sun sx-dash-theme-icon--when-dark pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.88rem]" aria-hidden="true"></i>
                <i class="fa-solid fa-moon sx-dash-theme-icon--when-light pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.82rem]" aria-hidden="true"></i>
              </button>
              <span class="sx-dash-tip">Change theme</span>
            </span>
            <span class="sx-dash-tip-wrap inline-flex">
              <button type="button" data-action="dash-fullscreen" class="sx-dash-fullscreen-btn relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45" aria-label="Enter fullscreen">
                <i class="fa-solid fa-expand sx-dash-fs-icon-expand pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.78rem]" aria-hidden="true"></i>
                <i class="fa-solid fa-compress sx-dash-fs-icon-compress pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.78rem]" aria-hidden="true"></i>
              </button>
              <span class="sx-dash-tip">Fullscreen</span>
            </span>
            <label
              for="sx-nav-drawer"
              class="sx-dash-header__menu-btn inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900 md:hidden"
              aria-label="Open menu"
            >☰</label>
          </div>
        </div>
      </div>

      <input type="checkbox" id="sx-nav-drawer" class="peer sr-only" />
      <label
        for="sx-nav-drawer"
        class="pointer-events-none fixed inset-0 z-40 bg-slate-900/35 opacity-0 transition-opacity duration-200 peer-checked:pointer-events-auto peer-checked:opacity-100 md:hidden"
        style="top: 3.5rem"
        aria-hidden="true"
      ></label>
      <nav
        class="sx-dash-hnav-mobile absolute left-0 right-0 top-full z-50 hidden max-h-[min(70vh,28rem)] flex-col gap-1 overflow-y-auto border-b border-slate-200 bg-white px-4 py-3 shadow-lg peer-checked:flex md:!hidden"
        aria-label="Mobile"
      >
        <button type="button" data-nav="logout" class="sx-dash-hnav__link sx-dash-hnav__link--block sx-dash-hnav__link--logout">
          <i class="fa-solid fa-arrow-right-from-bracket w-5 shrink-0 text-center text-[0.9rem]" aria-hidden="true"></i>
          Sign out
        </button>
        <button type="button" data-action="dashboard" class="sx-dash-hnav__link sx-dash-hnav__link--active sx-dash-hnav__link--block">Backtesting</button>
        <button type="button" data-action="strategy" class="sx-dash-hnav__link sx-dash-hnav__link--block">Strategy</button>
        <button type="button" data-action="subscription" class="sx-dash-hnav__link sx-dash-hnav__link--block">Subscription</button>
        <span
          class="sx-dash-hnav__link sx-dash-hnav__link--disabled sx-dash-hnav__link--block"
          title="Coming soon"
          role="presentation"
        >
          Tutorials
          <span class="sx-dash-hnav__badge">Soon</span>
        </span>
        <button type="button" data-action="settings" class="sx-dash-hnav__link sx-dash-hnav__link--block">Settings</button>
      </nav>
    </header>

    <div class="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <main class="mx-auto min-h-0 min-w-0 w-full max-w-[1440px] flex-1 overflow-y-auto overflow-x-hidden px-4 pt-1 pb-4 sm:px-6 sm:pt-2 sm:pb-6 lg:px-8 lg:pb-10" id="sx-welcome">
        <div class="sx-dash__panel sx-dash-home-panel min-h-0 space-y-2 p-3 sm:space-y-3 sm:p-4 lg:space-y-3 lg:p-5 lg:pt-2">
        <nav class="sx-dash-subnav sx-dash-hnav hidden items-center gap-1 overflow-x-auto md:flex" aria-label="Main">
          <button type="button" data-action="dashboard" class="sx-dash-hnav__link sx-dash-hnav__link--active">Backtesting</button>
          <button type="button" data-action="strategy" class="sx-dash-hnav__link">Strategy</button>
          <button type="button" data-action="subscription" class="sx-dash-hnav__link">Subscription</button>
          <span class="sx-dash-hnav__link sx-dash-hnav__link--disabled" title="Coming soon" role="presentation">
            Tutorials
            <span class="sx-dash-hnav__badge">Soon</span>
          </span>
          <button type="button" data-action="settings" class="sx-dash-hnav__link">Settings</button>
        </nav>

        <div class="sx-dash-testing" data-sx-testing>
          <div class="sx-dash-testing__head">
            <nav class="sx-dash-testing-tabs" role="tablist" aria-label="Backtesting sections">
              <button type="button" role="tab" class="sx-dash-testing-tab sx-dash-testing-tab--active" data-testing-tab="dashboard" aria-selected="true">
                <i class="fa-solid fa-table-cells-large" aria-hidden="true"></i>
                Dashboard
              </button>
              <button type="button" role="tab" class="sx-dash-testing-tab" data-testing-tab="sessions" aria-selected="false">
                <i class="fa-solid fa-list-ul" aria-hidden="true"></i>
                Sessions
              </button>
              <button type="button" role="tab" class="sx-dash-testing-tab" data-testing-tab="trades" aria-selected="false">
                <i class="fa-regular fa-file-lines" aria-hidden="true"></i>
                Trades
              </button>
              <button type="button" role="tab" class="sx-dash-testing-tab" data-testing-tab="analytics" aria-selected="false">
                <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
                Analytics
              </button>
            </nav>
          </div>

          <div class="sx-dash-testing__panels space-y-5 sm:space-y-6 lg:space-y-7">
          <div class="sx-dash-testing-panel space-y-5 sm:space-y-6" data-testing-panel="dashboard" role="tabpanel">
        <header class="sx-surreal-hero sx-dash-premium-hero sx-dash-premium-hero--compact relative overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
          <div class="sx-surreal-hero__aurora" aria-hidden="true"></div>
          <div class="sx-surreal-hero__grid" aria-hidden="true"></div>
          <div class="sx-surreal-hero__ring" aria-hidden="true"></div>
          <div class="sx-surreal-hero__mist" aria-hidden="true"></div>
          <div class="relative z-[1]">
            <div class="min-w-0 max-w-2xl">
              <h2 class="sx-dash-welcome-title mb-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Practice on the past. Profit in the present.</h2>
              <ul class="sx-dash-premium-pills mt-2.5 flex flex-wrap gap-1.5" aria-label="Workspace highlights">
                <li class="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">Tick-accurate replay</li>
                <li class="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">Multi-symbol sessions</li>
                <li class="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">Strategy ready</li>
              </ul>
            </div>
          </div>
        </header>

        <div class="sx-dash-launch-stack">
        <p class="sx-dash-welcome-sub sx-dash-welcome-sub--below mx-auto text-center text-xl leading-snug sm:text-2xl">
          Create a session, pick a date, and replay the tape — or resume where you left off.
        </p>

        <section class="sx-dash-action-row flex flex-wrap items-center justify-center gap-3">
          <span class="sx-dash-cta-ai">
            <span class="sx-dash-cta-ai__glow" aria-hidden="true"></span>
            <span class="sx-dash-cta-ai__border" aria-hidden="true"><span class="sx-dash-cta-ai__ring"></span></span>
            <button
              type="button"
              data-action="backtest"
              class="sx-dash-cta-session sx-dash-cta-session--ai inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#0f172a] px-7 py-3.5 text-sm font-bold tracking-tight text-white transition hover:-translate-y-0.5 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f3ff] active:translate-y-0"
            >
              <span class="text-lg font-light leading-none" aria-hidden="true">+</span> Backtesting Session <span aria-hidden="true">→</span>
            </button>
          </span>
          <span class="sx-dash-cta-ai">
            <span class="sx-dash-cta-ai__glow" aria-hidden="true"></span>
            <span class="sx-dash-cta-ai__border" aria-hidden="true"><span class="sx-dash-cta-ai__ring" style="animation-delay:-1.6s"></span></span>
            <button
              type="button"
              data-action="prop"
              class="sx-dash-cta-session sx-dash-cta-session--ai inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#0f172a] px-7 py-3.5 text-sm font-bold tracking-tight text-white transition hover:-translate-y-0.5 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f3ff] active:translate-y-0"
            >
              <i class="fa-solid fa-building-columns text-[0.8rem]" aria-hidden="true"></i>
              Prop Firm Challenge
              <span aria-hidden="true">→</span>
            </button>
          </span>
        </section>
        </div>

          ${buildSessionPulseKpiHtml({ titleId: 'sx-dash-pulse-title' })}

          </div>

          <div class="sx-dash-testing-panel hidden" data-testing-panel="sessions" role="tabpanel" hidden></div>

          <div class="sx-dash-recent-sessions-host mt-1" data-sx-recent-sessions-host>
        ${buildRecentSessionsSectionHtml()}
          </div>

          <div class="sx-dash-testing-panel hidden" data-testing-panel="analytics" role="tabpanel" hidden>
            ${buildSessionPulseKpiHtml({ titleId: 'sx-dash-pulse-title-analytics', extraClass: 'sx-dash-pulse--analytics-kpi' })}
            <section class="sx-dash-pulse sx-dash-pulse--pro sx-dash-pulse--workspace-only" aria-label="Session analytics">
          <div class="sx-dash-pulse__workspace">
            <article class="sx-dash-pulse__panel sx-dash-pulse__panel--desk">
              <header class="sx-dash-pulse__panel-head">
                <div>
                  <h4 class="sx-dash-pulse__panel-title">Desk load</h4>
                  <p class="sx-dash-pulse__panel-sub" data-sx-pulse="active-session">No active session</p>
                </div>
              </header>
              <div class="sx-dash-pulse__practice-split" data-sx-pulse="practice-split" aria-hidden="true"></div>
              <div class="sx-dash-pulse-sessions" data-sx-pulse="practice-sessions"></div>
              <div class="sx-dash-pulse__panel-rule" role="separator"></div>
              <div class="sx-dash-pulse__panel-head sx-dash-pulse__panel-head--compact">
                <h4 class="sx-dash-pulse__panel-title">Symbol focus</h4>
                <button type="button" class="sx-dash-pulse__info" title="Trade count share by session symbol." aria-label="About symbol focus">i</button>
              </div>
              <div class="sx-dash-pulse-symbols" data-sx-pulse="symbols"></div>
            </article>

            <article class="sx-dash-pulse__panel sx-dash-pulse__panel--edge">
              <header class="sx-dash-pulse__panel-head">
                <div>
                  <h4 class="sx-dash-pulse__panel-title">Edge meter</h4>
                  <p class="sx-dash-pulse__panel-sub">Win quality and directional bias</p>
                </div>
                <button type="button" class="sx-dash-pulse__info" title="Win rate from closed journal trades and backtest snapshots." aria-label="About edge meter">i</button>
              </header>
              <div class="sx-dash-pulse__edge">
                <div class="sx-dash-pulse__ring" data-sx-pulse="ring"></div>
                <div class="sx-dash-pulse__edge-copy">
                  <p class="sx-dash-pulse__edge-title" data-sx-pulse="trades">0 trades</p>
                  <div class="sx-dash-pulse__split" aria-hidden="true">
                    <span class="sx-dash-pulse__split-buy" data-sx-pulse="long-bar" style="width:50%"></span>
                    <span class="sx-dash-pulse__split-sell" data-sx-pulse="short-bar" style="width:50%"></span>
                  </div>
                  <p class="sx-dash-pulse__hint" data-sx-pulse="split-label">Buys / sells appear after journal closes</p>
                </div>
              </div>
            </article>

            <article class="sx-dash-pulse__panel sx-dash-pulse__panel--intense">
              <header class="sx-dash-pulse__panel-head">
                <div>
                  <h4 class="sx-dash-pulse__panel-title">Intense Practice</h4>
                  <p class="sx-dash-pulse__panel-sub">Hours invested by month</p>
                </div>
                <button type="button" class="sx-dash-pulse__info" title="Hours invested practicing across the last 6 months." aria-label="About intense practice">i</button>
              </header>
              <div class="sx-dash-pulse-chart sx-dash-pulse-chart--intense" data-sx-pulse="activity" role="img" aria-label="Intense practice hours by month"></div>
            </article>

            <article class="sx-dash-pulse__panel sx-dash-pulse__panel--pnl">
              <header class="sx-dash-pulse__panel-head">
                <div>
                  <h4 class="sx-dash-pulse__panel-title">Net P&amp;L path</h4>
                  <p class="sx-dash-pulse__panel-sub">Trading-day waterfall — green up on profit, red down on loss</p>
                </div>
                <span class="sx-dash-pulse__period" data-sx-pnl-chart-period aria-live="polite"></span>
              </header>
              <div class="sx-dash-pulse-pnl-chart sx-dash-time-chart" role="img" data-sx-time-chart aria-label="Pulse Net P&amp;L chart">
                <div class="sx-dash-time-chart__frame">
                  <div class="sx-dash-time-chart__pan" data-sx-time-chart-pan></div>
                </div>
              </div>
            </article>
          </div>

        </section>
          </div>

          <div class="sx-dash-testing-panel hidden" data-testing-panel="trades" role="tabpanel" hidden>
            <section class="sx-dash-trades sx-dash-card-surface overflow-hidden rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-8" aria-labelledby="sx-dash-trades-title">
              <div class="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 id="sx-dash-trades-title" class="text-lg font-bold tracking-tight text-slate-900 dark:text-white sm:text-xl">Trades</h3>
                  <p class="mt-1 text-sm text-zinc-500">Closed trades from your replay journals across sessions.</p>
                </div>
                <span class="text-sm font-medium text-zinc-500" data-sx-trades-count>0 trades</span>
              </div>
              <div class="overflow-x-auto">
                <table class="sx-dash-trades-table w-full min-w-[40rem] border-collapse text-left text-sm">
                  <thead>
                    <tr class="border-b border-zinc-200 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                      <th class="px-2 py-2.5 font-bold">Session</th>
                      <th class="px-2 py-2.5 font-bold">Side</th>
                      <th class="px-2 py-2.5 font-bold">Qty</th>
                      <th class="px-2 py-2.5 font-bold">Entry</th>
                      <th class="px-2 py-2.5 font-bold">Exit</th>
                      <th class="px-2 py-2.5 font-bold">P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody data-sx-trades-body>
                    <tr>
                      <td colspan="6" class="px-2 py-8 text-center text-sm text-zinc-500">No closed trades yet. Resume a session and close positions to see them here.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          </div>
        </div>
        <div id="sx-dash-subscription-panel" class="sx-dash-subscription-panel hidden" hidden></div>
        <div id="sx-dash-strategy-panel" class="sx-dash-strategy-panel hidden" hidden></div>
        <div id="sx-dash-settings-panel" class="sx-dash-settings-panel hidden" hidden></div>
        </div>
      </main>
    </div>
    </div>
  </div>

  <div id="sx-dash-ai-chat-backdrop" class="sx-dash-ai-chat-backdrop fixed inset-0 z-[85] bg-black/50 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 pointer-events-none" aria-hidden="true"></div>
  <aside id="sx-dash-ai-chat-drawer" class="sx-dash-ai-chat-drawer fixed bottom-0 right-0 top-0 z-[90] flex w-full max-w-md translate-x-full flex-col border-l border-white/10 bg-[#0b0814]/97 shadow-2xl backdrop-blur-xl transition-transform duration-200 ease-out pointer-events-none" aria-hidden="true" aria-labelledby="sx-dash-ai-chat-title">
    <div class="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
      <h2 id="sx-dash-ai-chat-title" class="text-sm font-bold tracking-tight text-white">AI assistant</h2>
      <button type="button" data-action="ai-chat-close" class="rounded-lg border border-white/12 bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45">Close</button>
    </div>
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 text-sm" data-sx-ai-chat-body>
    </div>
    <div class="border-t border-white/10 p-4">
      <label class="sr-only" for="sx-dash-ai-chat-input">Message to AI</label>
      <textarea id="sx-dash-ai-chat-input" rows="2" disabled class="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-400 placeholder:text-zinc-600" placeholder="Message AI (coming soon)…"></textarea>
    </div>
  </aside>

  <div id="view-chart" hidden class="hidden fixed inset-0 z-[160] flex min-h-0 w-full flex-col bg-zinc-950"></div>
  <div id="view-profile" hidden class="hidden fixed inset-0 z-[150] flex min-h-0 w-full flex-col overflow-hidden bg-[#0a0612]"></div>
  <div id="view-stocks" class="hidden min-h-0 min-w-0 flex-1"></div>
</div>
`,
  )

  const appRoot = root.querySelector('#sx-app-root') as HTMLElement | null
  const viewDash = root.querySelector('#view-dash') as HTMLElement
  const viewChart = root.querySelector('#view-chart') as HTMLElement
  const viewSubscriptionPanel = root.querySelector('#sx-dash-subscription-panel') as HTMLElement
  const viewStrategyPanel = root.querySelector('#sx-dash-strategy-panel') as HTMLElement
  const viewSettingsPanel = root.querySelector('#sx-dash-settings-panel') as HTMLElement
  const viewTesting = root.querySelector('[data-sx-testing]') as HTMLElement | null
  const viewProfile = root.querySelector('#view-profile') as HTMLElement
  const viewStocks = root.querySelector('#view-stocks') as HTMLElement
  const mlPill = root.querySelector('#sx-ml-pill')
  const mlPillMobiles = root.querySelectorAll('[data-sx-ml-pill-mobile]')

  if (appRoot) {
    applyDashTheme(appRoot, readDashTheme())
    syncDashFullscreenUi(appRoot)

    appRoot.querySelectorAll<HTMLButtonElement>('.sx-dash-theme-icon-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cur = (appRoot.dataset.dashboardTheme === 'light' ? 'light' : 'dark') as DashboardThemeMode
        const next = cur === 'dark' ? 'light' : 'dark'
        writeDashTheme(next)
        applyDashTheme(appRoot, next)
      })
    })

    root.querySelectorAll<HTMLButtonElement>('[data-action="ai-chat"]').forEach((el) => {
      el.addEventListener('click', () => setAiChatOpen(appRoot, true))
    })
    root.querySelectorAll<HTMLButtonElement>('[data-action="ai-chat-close"]').forEach((el) => {
      el.addEventListener('click', () => setAiChatOpen(appRoot, false))
    })
    const aiBackdrop = root.querySelector('#sx-dash-ai-chat-backdrop')
    aiBackdrop?.addEventListener('click', () => setAiChatOpen(appRoot, false))

    root.querySelectorAll<HTMLButtonElement>('[data-action="dash-fullscreen"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen()
          } else {
            await document.exitFullscreen()
          }
        } catch {
          /* noop — e.g. denied */
        }
        syncDashFullscreenUi(appRoot)
      })
    })
    document.addEventListener('fullscreenchange', () => syncDashFullscreenUi(appRoot))

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && appRoot.classList.contains('sx-dash-ai-chat--open')) {
        setAiChatOpen(appRoot, false)
      }
    })

    const aiDrawer = root.querySelector('#sx-dash-ai-chat-drawer') as HTMLElement | null
    if (aiDrawer) {
      mountAiChatPanel({
        drawer: aiDrawer,
        getSessions: listSessions,
      })
    }
  }

  const closeDrawer = () => {
    const cb = document.getElementById('sx-nav-drawer') as HTMLInputElement | null
    if (cb) cb.checked = false
  }

  void fetchMlHealth().then((h) => {
    const text = h ? `${h.model} · ${h.device}` : 'ML offline'
    const title = h ? `torch ${h.torch} — npm run ml:api` : 'Start: npm run ml:api (port 8001)'
    if (mlPill) {
      mlPill.textContent = text
      mlPill.setAttribute('title', title)
    }
    mlPillMobiles.forEach((el) => {
      el.textContent = text
      el.setAttribute('title', title)
    })
  })

  let disposeChart: (() => void) | null = null
  let disposeStocks: (() => void) | null = null
  let disposeStrategy: (() => void) | null = null
  let disposeSettings: (() => void) | null = null
  let disposeSubscription: (() => void) | null = null
  let disposeProfile: (() => void) | null = null
  let activeSessionId: string | null = null
  let lastSessionPayload: SessionCreatedPayload | null = null
  let sessionModal: ReturnType<typeof createSessionModal>

  function syncSidebarProfile() {
    const auth = getAuthUser()
    const isGuest = !auth?.email?.trim() || auth.email.trim() === GUEST_AUTH_EMAIL
    const name = (readDisplayName() || auth?.name || 'Guest').trim() || 'Guest'
    const label = isGuest ? 'Guest' : name
    root.querySelectorAll('[data-sx-account-label]').forEach((el) => {
      el.textContent = label
    })
    const nameEl = root.querySelector('#sx-dash-display-name')
    if (nameEl) nameEl.textContent = name

    const avatarUrl = readUserAvatar() || auth?.picture || null
    root.querySelectorAll<HTMLElement>('[data-sx-account-avatar]').forEach((icon) => {
      const existingImg = icon.querySelector<HTMLImageElement>('[data-sx-account-avatar-img]')
      const fallback = icon.querySelector<HTMLElement>('[data-sx-account-avatar-fallback]')
      if (avatarUrl) {
        if (existingImg) {
          existingImg.src = avatarUrl
        } else {
          const img = document.createElement('img')
          img.className = 'sx-dash-account-btn__photo'
          img.setAttribute('data-sx-account-avatar-img', '')
          img.alt = ''
          img.src = avatarUrl
          icon.prepend(img)
        }
        icon.classList.add('sx-dash-account-btn__icon--photo')
        if (fallback) fallback.hidden = true
      } else {
        existingImg?.remove()
        icon.classList.remove('sx-dash-account-btn__icon--photo')
        if (fallback) fallback.hidden = false
      }
    })

    applyAccountTierUi()
  }

  function getProfileSessionStats(): ProfileSessionStats {
    const sessions = listSessions()
    let memberSinceMs: number | null = null
    for (const session of sessions) {
      if (memberSinceMs == null || session.createdAt < memberSinceMs) {
        memberSinceMs = session.createdAt
      }
    }
    return {
      total: sessions.length,
      backtest: sessions.filter((s) => s.sessionType === 'backtest').length,
      prop: sessions.filter((s) => s.sessionType === 'prop').length,
      withBacktest: sessions.filter((s) => s.lastBacktest).length,
      withJournal: sessions.filter((s) => (s.replayState?.account.closedTrades.length ?? 0) > 0).length,
      memberSinceMs,
    }
  }

  function hideOverlayViews() {
    if (viewChart) {
      viewChart.hidden = true
      viewChart.classList.add('hidden')
    }
    if (viewProfile) {
      viewProfile.hidden = true
      viewProfile.classList.add('hidden')
    }
    if (viewStocks) viewStocks.classList.add('hidden')
  }

  function setMainNavActive(action: 'dashboard' | 'subscription' | 'strategy' | 'settings' | 'profile') {
    root.querySelectorAll<HTMLElement>('.sx-dash-hnav__link[data-action]').forEach((btn) => {
      const a = btn.getAttribute('data-action')
      btn.classList.toggle('sx-dash-hnav__link--active', a === action)
    })
  }

  function clearSubscriptionPanel() {
    disposeSubscription?.()
    disposeSubscription = null
    viewSubscriptionPanel?.replaceChildren()
    if (viewSubscriptionPanel) {
      viewSubscriptionPanel.hidden = true
      viewSubscriptionPanel.classList.add('hidden')
    }
  }

  function clearStrategyPanel() {
    disposeStrategy?.()
    disposeStrategy = null
    viewStrategyPanel?.replaceChildren()
    if (viewStrategyPanel) {
      viewStrategyPanel.hidden = true
      viewStrategyPanel.classList.add('hidden')
    }
  }

  function clearSettingsPanel() {
    disposeSettings?.()
    disposeSettings = null
    viewSettingsPanel?.replaceChildren()
    if (viewSettingsPanel) {
      viewSettingsPanel.hidden = true
      viewSettingsPanel.classList.add('hidden')
    }
  }

  function showHomeTestingSection() {
    clearSubscriptionPanel()
    clearStrategyPanel()
    clearSettingsPanel()
    if (viewTesting) {
      viewTesting.hidden = false
      viewTesting.classList.remove('hidden')
    }
    setMainNavActive('dashboard')
  }

  function showDashboardView() {
    hideOverlayViews()
    if (viewDash) viewDash.hidden = false
  }

  function sessionIdFromElement(el: Element | null): string | null {
    const row = el?.closest<HTMLElement>('[data-session-id]')
    const id = row?.getAttribute('data-session-id')?.trim()
    return id || null
  }

  function openChartWithStoredSession(
    session: StoredSession,
    chartOpts?: { autoRunBacktest?: boolean },
  ) {
    activeSessionId = session.id
    setLastSessionId(session.id)
    touchSessionOpened(session.id)
    const payload = sessionToPayload(session)
    lastSessionPayload = payload
    saveSessionDraft(payload)
    syncRecentSessionsUi()
    closeDrawer()
    if (appRoot) setAiChatOpen(appRoot, false)
    disposeStrategy?.()
    disposeStrategy = null
    disposeSettings?.()
    disposeSettings = null
    disposeSubscription?.()
    disposeSubscription = null
    disposeProfile?.()
    disposeProfile = null
    viewStrategyPanel?.replaceChildren()
    viewSettingsPanel?.replaceChildren()
    viewSubscriptionPanel?.replaceChildren()
    viewProfile?.replaceChildren()
    hideOverlayViews()
    if (viewChart) {
      viewChart.hidden = false
      viewChart.classList.remove('hidden')
    }
    if (viewDash) viewDash.hidden = true
    const page = appPageFromPath(window.location.pathname)
    if (page !== 'chart') {
      history.pushState({ sx: 'chart', sessionId: session.id }, '', resolveAppPath('chart'))
    }
    disposeChart?.()
    disposeChart = mountChartWorkspace(viewChart, payload, {
      sessionId: session.id,
      lastStrategyId: session.lastStrategyId,
      replayState: session.replayState ?? null,
      propRules: session.propRules ?? null,
      propResult: session.propResult ?? null,
      activeChartIndicators: session.activeChartIndicators ?? [],
      onExit: showDashboard,
      onSymbolChange: (symbol) => {
        if (!activeSessionId || !lastSessionPayload) return
        const s = symbol.trim().toUpperCase()
        if (!s) return
        lastSessionPayload = { ...lastSessionPayload, assets: s }
        updateSession(activeSessionId, { assets: s })
        saveSessionDraft(lastSessionPayload)
      },
      onStrategyChange: (strategyId) => {
        if (!activeSessionId) return
        updateSession(activeSessionId, { lastStrategyId: strategyId })
      },
      onBacktestComplete: (snapshot) => {
        if (!activeSessionId) return
        updateSessionBacktest(activeSessionId, snapshot)
        syncRecentSessionsUi()
        void postTelemetryEvent('backtest_completed', {
          sessionId: activeSessionId,
          strategyId: snapshot.strategyId,
          netPnl: snapshot.netPnl,
          totalTrades: snapshot.totalTrades,
          winRate: snapshot.winRate,
        })
      },
      onReplayStateChange: (snapshot) => {
        if (!activeSessionId) return
        updateSessionReplay(activeSessionId, snapshot)
      },
      onPropStateChange: (propResult) => {
        if (!activeSessionId) return
        updateSessionProp(activeSessionId, propResult)
        syncRecentSessionsUi()
      },
      onChartIndicatorsChange: (ids) => {
        if (!activeSessionId) return
        updateSessionChartIndicators(activeSessionId, ids)
      },
      onEditSession: () => {
        if (!activeSessionId) return
        const session = getSession(activeSessionId)
        if (!session) return
        sessionModal.open({ editSessionId: activeSessionId, draft: sessionToPayload(session) })
      },
      autoRunBacktest: chartOpts?.autoRunBacktest,
    })
  }

  function openChartWithPayload(payload: SessionCreatedPayload) {
    openChartWithStoredSession(createSession(payload))
  }

  function openChartWithStrategy(strategyId: string, opts?: { runBacktest?: boolean }) {
    const session =
      (activeSessionId ? getSession(activeSessionId) : null) ?? listSessions()[0] ?? null
    if (!session) {
      window.alert('Create a session first, then open the chart with your strategy.')
      return
    }
    updateSession(session.id, { lastStrategyId: strategyId })
    const refreshed = getSession(session.id)
    if (refreshed) openChartWithStoredSession(refreshed, { autoRunBacktest: opts?.runBacktest })
  }

  function showSettingsPage() {
    if (!viewSettingsPanel) return
    disposeChart?.()
    disposeChart = null
    disposeStocks?.()
    disposeStocks = null
    clearStrategyPanel()
    clearSubscriptionPanel()
    disposeProfile?.()
    disposeProfile = null
    viewStocks?.replaceChildren()
    viewChart?.replaceChildren()
    viewProfile?.replaceChildren()
    hideOverlayViews()
    if (viewDash) viewDash.hidden = false
    if (viewTesting) {
      viewTesting.hidden = true
      viewTesting.classList.add('hidden')
    }
    viewSettingsPanel.hidden = false
    viewSettingsPanel.classList.remove('hidden')
    setMainNavActive('settings')
    closeDrawer()
    if (appRoot) setAiChatOpen(appRoot, false)
    disposeSettings?.()
    disposeSettings = mountSettingsPage(viewSettingsPanel, {
      embedded: true,
      readLocale: readDashLocale,
      writeLocale: (code) => {
        writeDashLocale(code)
        syncDashLocaleUi(code)
      },
      localeOptions: DASH_LOCALES,
      readTier: readAccountTier,
      getSessionStats: getProfileSessionStats,
      getAuthUser: () => getAuthUser(),
      onOpenSubscription: openUpgradePlansModal,
      onDisplayNameChange: () => syncSidebarProfile(),
      onAvatarChange: () => syncSidebarProfile(),
      freeSessionLimit: FREE_SESSION_LIMIT,
    })
  }

  let disposeUpgradeModal: (() => void) | null = null

  function closeUpgradePlansModal() {
    disposeUpgradeModal?.()
    disposeUpgradeModal = null
  }

  function openUpgradePlansModal() {
    closeUpgradePlansModal()
    if (appRoot) setAiChatOpen(appRoot, false)

    const overlay = document.createElement('div')
    overlay.className = 'sx-sub-upgrade-modal'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', 'Upgrade plan')
    overlay.innerHTML = `
      <button type="button" class="sx-sub-upgrade-modal__backdrop" data-sx-sub-modal-close aria-label="Close"></button>
      <div class="sx-sub-upgrade-modal__panel">
        <button type="button" class="sx-sub-upgrade-modal__x" data-sx-sub-modal-close aria-label="Close">&times;</button>
        <div class="sx-sub-upgrade-modal__body" data-sx-sub-modal-body></div>
      </div>
    `
    document.body.append(overlay)

    const body = overlay.querySelector<HTMLElement>('[data-sx-sub-modal-body]')
    if (!body) {
      overlay.remove()
      return
    }

    const disposePage = mountSubscriptionPage(body, {
      embedded: true,
      readTier: readAccountTier,
      writeTier: writeAccountTier,
      onCheckoutComplete: () => {
        applyAccountTierUi()
        syncSidebarProfile()
      },
      onCheckoutDismissed: () => {
        applyAccountTierUi()
        syncSidebarProfile()
        if (document.body.contains(overlay)) {
          openUpgradePlansModal()
        }
      },
    })

    const close = () => {
      document.removeEventListener('keydown', onKey)
      disposePage()
      overlay.remove()
      if (disposeUpgradeModal === closeWrapped) disposeUpgradeModal = null
    }
    const closeWrapped = () => {
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWrapped()
    }

    overlay.querySelectorAll('[data-sx-sub-modal-close]').forEach((el) => {
      el.addEventListener('click', closeWrapped)
    })
    document.addEventListener('keydown', onKey)
    disposeUpgradeModal = closeWrapped
  }

  function showSubscriptionPage() {
    if (!viewSubscriptionPanel) return
    disposeChart?.()
    disposeChart = null
    disposeStocks?.()
    disposeStocks = null
    clearStrategyPanel()
    clearSettingsPanel()
    disposeProfile?.()
    disposeProfile = null
    viewStocks?.replaceChildren()
    viewChart?.replaceChildren()
    viewProfile?.replaceChildren()
    hideOverlayViews()
    if (viewDash) viewDash.hidden = false
    if (viewTesting) {
      viewTesting.hidden = true
      viewTesting.classList.add('hidden')
    }
    viewSubscriptionPanel.hidden = false
    viewSubscriptionPanel.classList.remove('hidden')
    setMainNavActive('subscription')
    closeDrawer()
    if (appRoot) setAiChatOpen(appRoot, false)
    disposeSubscription?.()
    disposeSubscription?.()
    const subOpts = {
      readTier: readAccountTier,
      writeTier: writeAccountTier,
      onCheckoutComplete: () => {
        applyAccountTierUi()
      },
      onCheckoutDismissed: () => {
        applyAccountTierUi()
        if (viewSubscriptionPanel && !viewSubscriptionPanel.hidden) {
          showSubscriptionPage()
        }
      },
      embedded: true as const,
    }
    disposeSubscription = mountSubscriptionPage(viewSubscriptionPanel, subOpts)
  }

  function showProfilePage() {
    if (!viewProfile) return
    disposeChart?.()
    disposeChart = null
    disposeStocks?.()
    disposeStocks = null
    clearStrategyPanel()
    clearSettingsPanel()
    clearSubscriptionPanel()
    viewStocks?.replaceChildren()
    viewChart?.replaceChildren()
    hideOverlayViews()
    if (viewDash) viewDash.hidden = true
    if (viewProfile) {
      viewProfile.hidden = false
      viewProfile.classList.remove('hidden')
    }
    closeDrawer()
    if (appRoot) setAiChatOpen(appRoot, false)
    disposeProfile?.()
    disposeProfile = mountProfilePage(viewProfile, {
      onBack: showDashboard,
      onOpenSettings: showSettingsPage,
      onProUpgrade: openUpgradePlansModal,
      onDisplayNameChange: () => syncSidebarProfile(),
      readTier: readAccountTier,
      getSessionStats: getProfileSessionStats,
      getAuthEmail: () => getAuthUser()?.email ?? null,
    })
  }

  function showStrategyPage() {
    if (!viewStrategyPanel) return
    disposeChart?.()
    disposeChart = null
    disposeStocks?.()
    disposeStocks = null
    clearSettingsPanel()
    clearSubscriptionPanel()
    disposeProfile?.()
    disposeProfile = null
    viewStocks?.replaceChildren()
    viewChart?.replaceChildren()
    viewProfile?.replaceChildren()
    hideOverlayViews()
    if (viewDash) viewDash.hidden = false
    if (viewTesting) {
      viewTesting.hidden = true
      viewTesting.classList.add('hidden')
    }
    viewStrategyPanel.hidden = false
    viewStrategyPanel.classList.remove('hidden')
    setMainNavActive('strategy')
    closeDrawer()
    if (appRoot) setAiChatOpen(appRoot, false)
    disposeStrategy?.()
    disposeStrategy = mountStrategyPage(viewStrategyPanel, {
      embedded: true,
      onOpenInChart: (strategyId, openOpts) => openChartWithStrategy(strategyId, openOpts),
    })
  }

  function showDashboard() {
    const page = appPageFromPath(window.location.pathname)
    if (page === 'chart') {
      history.pushState({ sx: 'dash' }, '', resolveAppPath('dashboard'))
    }
    if (appRoot) setAiChatOpen(appRoot, false)
    activeSessionId = null
    lastSessionPayload = null
    disposeChart?.()
    disposeChart = null
    disposeStocks?.()
    disposeStocks = null
    disposeProfile?.()
    disposeProfile = null
    viewStocks?.replaceChildren()
    viewChart?.replaceChildren()
    viewProfile?.replaceChildren()
    hideOverlayViews()
    showDashboardView()
    showHomeTestingSection()
    document.documentElement.removeAttribute('data-theme')
    closeDrawer()
    syncSidebarProfile()
    syncRecentSessionsUi()
  }

  function syncRecentSessionsUi() {
    const list = root.querySelector('#sx-dash-session-list')
    const countEl = root.querySelector('[data-sx-sessions-count]')
    const fillEl = root.querySelector<HTMLElement>('[data-sx-sessions-count-fill]')
    const barEl = root.querySelector('[data-sx-sessions-count-bar]')
    if (!list || !countEl || !fillEl) return

    const allSessions = listSessions()
    const tier = readAccountTier()
    const limit = tier === 'pro' ? Math.max(allSessions.length, FREE_SESSION_LIMIT) : FREE_SESSION_LIMIT
    const visible = allSessions.length
    countEl.textContent =
      tier === 'pro'
        ? `${visible} session${visible === 1 ? '' : 's'}`
        : `${visible} of ${limit} sessions`
    fillEl.style.width = `${Math.min(100, (visible / limit) * 100)}%`
    if (barEl instanceof HTMLElement) {
      barEl.setAttribute('aria-valuenow', String(visible))
      barEl.setAttribute('aria-valuemax', String(limit))
    }

    syncSessionListUi()

    const searchInput = root.querySelector<HTMLInputElement>('#sx-dash-sessions-search')
    const query = searchInput?.value ?? ''
    const filter = readSessionFilter()
    const sort = readSessionSort()
    const sessions = filterAndSortSessions(allSessions, filter, sort, query)

    if (allSessions.length === 0) {
      list.innerHTML = `<li class="sx-dash-session-row sx-dash-session-row--empty rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center dark:border-white/10 dark:bg-white/[0.02]" data-session-name="empty new session">
          <p class="text-sm font-medium text-zinc-600 dark:text-zinc-400">No sessions yet</p>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-500">Start a backtest to see it listed here.</p>
        </li>`
    } else if (sessions.length === 0) {
      list.innerHTML = `<li class="sx-dash-session-row sx-dash-session-row--empty rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center dark:border-white/10 dark:bg-white/[0.02]" data-session-name="empty filtered">
          <p class="text-sm font-medium text-zinc-600 dark:text-zinc-400">No sessions match your filters</p>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-500">Try clearing search or choosing a different filter.</p>
        </li>`
    } else {
      list.innerHTML = sessions.map((s) => buildSessionRowHtml(s)).join('')
    }
    syncDashboardPerf()
    syncSessionPulse()
    syncTradesUi()
  }

  function readTestingTab(): TestingTab {
    try {
      const v = localStorage.getItem(LS_TESTING_TAB)
      if (v && (TESTING_TABS as readonly string[]).includes(v)) return v as TestingTab
    } catch {
      /* ignore */
    }
    return 'dashboard'
  }

  function setTestingTab(tab: TestingTab) {
    try {
      localStorage.setItem(LS_TESTING_TAB, tab)
    } catch {
      /* ignore */
    }
    root.querySelectorAll<HTMLButtonElement>('[data-testing-tab]').forEach((btn) => {
      const on = btn.getAttribute('data-testing-tab') === tab
      btn.classList.toggle('sx-dash-testing-tab--active', on)
      btn.setAttribute('aria-selected', on ? 'true' : 'false')
    })
    root.querySelectorAll<HTMLElement>('[data-testing-panel]').forEach((panel) => {
      const on = panel.getAttribute('data-testing-panel') === tab
      panel.classList.toggle('hidden', !on)
      panel.hidden = !on
    })
    const sessionsHost = root.querySelector<HTMLElement>('[data-sx-recent-sessions-host]')
    if (sessionsHost) {
      const showSessions = tab === 'dashboard' || tab === 'sessions'
      sessionsHost.hidden = !showSessions
      sessionsHost.classList.toggle('hidden', !showSessions)
    }
    if (tab === 'dashboard' || tab === 'sessions') syncRecentSessionsUi()
    if (tab === 'dashboard' || tab === 'analytics') {
      syncSessionPulse()
      syncDashboardPerf()
    }
    if (tab === 'trades') syncTradesUi()
  }

  function syncTradesUi() {
    const body = root.querySelector('[data-sx-trades-body]')
    const countEl = root.querySelector('[data-sx-trades-count]')
    if (!body) return

    type TradeRow = {
      sessionName: string
      direction: string
      qty: number
      entryPrice: number
      exitPrice: number
      pnl: number
      exitTime: number
    }
    const rows: TradeRow[] = []
    for (const session of listSessions()) {
      const closed = session.replayState?.account.closedTrades ?? []
      for (const trade of closed) {
        rows.push({
          sessionName: session.name,
          direction: trade.direction,
          qty: trade.qty,
          entryPrice: trade.entryPrice,
          exitPrice: trade.exitPrice,
          pnl: trade.pnl,
          exitTime: trade.exitTime,
        })
      }
    }
    rows.sort((a, b) => b.exitTime - a.exitTime)

    if (countEl) {
      countEl.textContent = `${rows.length} trade${rows.length === 1 ? '' : 's'}`
    }

    if (rows.length === 0) {
      body.innerHTML = `<tr>
                      <td colspan="6" class="px-2 py-8 text-center text-sm text-zinc-500">No closed trades yet. Resume a session and close positions to see them here.</td>
                    </tr>`
      return
    }

    body.innerHTML = rows
      .slice(0, 200)
      .map((t) => {
        const pnlClass = t.pnl > 0 ? 'text-emerald-600 dark:text-emerald-400' : t.pnl < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-600'
        const side = t.direction === 'long' ? 'Long' : 'Short'
        return `<tr class="border-b border-zinc-100 dark:border-white/[0.06]">
          <td class="px-2 py-2.5 font-medium text-slate-800 dark:text-zinc-100">${escapeHtml(t.sessionName)}</td>
          <td class="px-2 py-2.5 text-zinc-600 dark:text-zinc-300">${side}</td>
          <td class="px-2 py-2.5 text-zinc-600 dark:text-zinc-300">${escapeHtml(String(t.qty))}</td>
          <td class="px-2 py-2.5 text-zinc-600 dark:text-zinc-300">${escapeHtml(String(t.entryPrice))}</td>
          <td class="px-2 py-2.5 text-zinc-600 dark:text-zinc-300">${escapeHtml(String(t.exitPrice))}</td>
          <td class="px-2 py-2.5 font-semibold ${pnlClass}">${formatDashMoney(t.pnl)}</td>
        </tr>`
      })
      .join('')
  }

  function showMarkets() {
    disposeChart?.()
    disposeChart = null
    disposeStrategy?.()
    disposeStrategy = null
    viewStrategyPanel?.replaceChildren()
    disposeStocks?.()
    closeDrawer()
    if (appRoot) setAiChatOpen(appRoot, false)
    viewChart?.replaceChildren()
    hideOverlayViews()
    if (viewDash) viewDash.hidden = true
    if (viewStocks) viewStocks.classList.remove('hidden')
    disposeStocks = mountStockApp(viewStocks, {
      onBack: () => {
        disposeStocks?.()
        disposeStocks = null
        viewStocks.replaceChildren()
        showDashboard()
      },
      onOpenInChart: (symbol) => {
        const sym = symbol.trim().toUpperCase()
        if (!sym) return
        let session =
          listSessions().find((s) => primarySessionSymbol(s.assets) === sym) ?? null
        if (!session) {
          session = createSession({
            name: `${sym} Session`,
            balance: '100000',
            assets: sym,
            layout: null,
            sessionType: 'backtest',
          })
        }
        disposeStocks?.()
        disposeStocks = null
        viewStocks.replaceChildren()
        openChartWithStoredSession(session)
      },
    })
  }

  root.querySelectorAll<HTMLButtonElement>('[data-nav="markets"]').forEach((btn) => {
    btn.addEventListener('click', () => showMarkets())
  })

  root.querySelectorAll<HTMLButtonElement>('[data-nav="logout"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void clearAllAuthSessions().then(() => {
        window.location.assign(resolveAppPath('login'))
      })
    })
  })

  function setAccountMenuOpen(open: boolean) {
    root.querySelectorAll('[data-sx-account-menu]').forEach((wrap) => {
      const toggle = wrap.querySelector<HTMLButtonElement>('[data-sx-account-toggle]')
      const panel = wrap.querySelector<HTMLElement>('.sx-dash-account__menu')
      if (!toggle || !panel) return
      panel.hidden = !open
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      toggle.classList.toggle('sx-dash-account-btn--open', open)
    })
  }

  root.querySelectorAll('[data-sx-account-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const wrap = btn.closest('[data-sx-account-menu]')
      const panel = wrap?.querySelector<HTMLElement>('.sx-dash-account__menu')
      const next = !!panel?.hidden
      setAccountMenuOpen(next)
    })
  })

  document.addEventListener('click', (e) => {
    const t = e.target
    if (!(t instanceof Node)) return
    if (root.querySelector('[data-sx-account-menu]')?.contains(t)) return
    setAccountMenuOpen(false)
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setAccountMenuOpen(false)
  })

  function applyAccountTierUi() {
    const tier = readAccountTier()
    const label = tier === 'pro' ? 'Pro Max user' : tier === 'intermediate' ? 'Pro user' : 'Free user'
    const planShort = tier === 'pro' ? 'Pro Max' : tier === 'intermediate' ? 'Pro' : 'Free'
    const badge = root.querySelector('#sx-dash-plan-badge')
    if (badge) badge.textContent = label
    root.querySelectorAll<HTMLElement>('[data-sx-account-plan]').forEach((el) => {
      el.textContent = planShort
      el.classList.remove(
        'sx-dash-account-btn__plan--free',
        'sx-dash-account-btn__plan--pro',
        'sx-dash-account-btn__plan--pro-max',
      )
      el.classList.add(
        tier === 'pro'
          ? 'sx-dash-account-btn__plan--pro-max'
          : tier === 'intermediate'
            ? 'sx-dash-account-btn__plan--pro'
            : 'sx-dash-account-btn__plan--free',
      )
    })
    root.querySelectorAll('.sx-dash-pro-upgrade-btn').forEach((el) => {
      el.classList.toggle('hidden', tier === 'pro')
    })
    root.querySelectorAll('[data-sx-sessions-banner]').forEach((el) => {
      el.classList.toggle('hidden', tier === 'pro')
    })
  }
  applyAccountTierUi()
  syncSidebarProfile()

  function readDashLocale(): string {
    try {
      const v = localStorage.getItem(LS_LOCALE)
      if (v && /^[a-z]{2}$/i.test(v)) {
        const c = v.toLowerCase()
        if (isDashLocaleCode(c)) return c
      }
    } catch {
      /* noop */
    }
    return 'en'
  }

  function writeDashLocale(code: string) {
    try {
      localStorage.setItem(LS_LOCALE, code)
    } catch {
      /* noop */
    }
    document.documentElement.lang = code
  }

  function closeAllLocaleDropdowns() {
    root.querySelectorAll('[data-sx-locale-dropdown]').forEach((wrap) => {
      wrap.classList.remove('sx-dash-locale-dd--open')
      const panel = wrap.querySelector('.sx-dash-locale-panel')
      const trigger = wrap.querySelector<HTMLButtonElement>('.sx-dash-locale-trigger')
      panel?.classList.add('hidden')
      trigger?.setAttribute('aria-expanded', 'false')
    })
  }

  function syncDashLocaleUi(code: string) {
    root.querySelectorAll('.sx-dash-locale-trigger__code').forEach((el) => {
      el.textContent = code.toUpperCase()
    })
    root.querySelectorAll<HTMLButtonElement>('[data-locale-option]').forEach((btn) => {
      const sel = btn.getAttribute('data-locale-option') === code
      btn.classList.toggle('sx-dash-locale-option--selected', sel)
      btn.setAttribute('aria-selected', sel ? 'true' : 'false')
    })
  }

  root.querySelectorAll<HTMLElement>('.sx-dash-locale-panel').forEach((panel) => {
    panel.innerHTML = buildDashLocalePanelHtml()
  })

  function closeAllPerfDropdowns() {
    root.querySelectorAll('[data-sx-perf-dd], [data-sx-session-dd]').forEach((wrap) => {
      wrap.classList.remove('sx-dash-perf-dd--open')
      const panel = wrap.querySelector('.sx-dash-perf-panel')
      const trigger = wrap.querySelector<HTMLButtonElement>(
        '.sx-dash-perf-trigger, [data-action="sessions-filter"], [data-action="sessions-sort"]',
      )
      panel?.classList.add('hidden')
      trigger?.setAttribute('aria-expanded', 'false')
    })
  }

  function syncSessionListUi() {
    const filter = readSessionFilter()
    const sort = readSessionSort()
    root.querySelectorAll('.sx-dash-session-filter-label').forEach((el) => {
      el.textContent = filter === 'all' ? 'All' : SESSION_FILTER_LABELS[filter]
    })
    root.querySelectorAll('.sx-dash-session-sort-label').forEach((el) => {
      el.textContent = SESSION_SORT_LABELS[sort]
    })
    root.querySelectorAll<HTMLButtonElement>('[data-session-filter-option]').forEach((btn) => {
      const on = btn.getAttribute('data-session-filter-option') === filter
      btn.classList.toggle('sx-dash-perf-option--selected', on)
      btn.setAttribute('aria-selected', on ? 'true' : 'false')
    })
    root.querySelectorAll<HTMLButtonElement>('[data-session-sort-option]').forEach((btn) => {
      const on = btn.getAttribute('data-session-sort-option') === sort
      btn.classList.toggle('sx-dash-perf-option--selected', on)
      btn.setAttribute('aria-selected', on ? 'true' : 'false')
    })
  }

  function syncSessionPulse() {
    const range = readPulseRange()
    const sessions = listSessions()
    const pulse = computeSessionPulseStats(sessions, range, Date.now(), getLastSessionId())
    const pnlTotals = computeDashboardPerfTotals(sessions, 'backtest', range)
    const directed = pulse.longTrades + pulse.shortTrades
    const longPct = directed > 0 ? Math.round((pulse.longTrades / directed) * 100) : 50
    const shortPct = directed > 0 ? 100 - longPct : 50

    const practiceText = formatPulseDuration(pulse.practiceMs)
    const histText = formatPulseDuration(pulse.historicalMs)
    const practiceHintText = pulse.sessionsTouched
      ? `${pulse.sessionsTouched} session${pulse.sessionsTouched === 1 ? '' : 's'} · Active ${formatPulseDuration(pulse.activePracticeMs)}`
      : 'Across sessions'
    const histHintText =
      pulse.practiceMs > 0 && pulse.historicalMs > 0
        ? `${Math.max(1, Math.round(pulse.historicalMs / Math.max(pulse.practiceMs, 1)))}× tape vs practice`
        : 'Historical coverage'
    const pnlText = pnlTotals.hasData ? formatDashboardPerfMoney(pnlTotals.netPnl) : '—'
    const pnlHintText = pnlTotals.hasData
      ? `${pnlTotals.sessionsActive} session${pnlTotals.sessionsActive === 1 ? '' : 's'} · ${pnlTotals.tradesTaken} trades`
      : 'Backtest results'
    const winrateText = formatDashboardWinRate(pulse.winRate)
    const winrateHintText =
      pulse.tradesTaken > 0
        ? `${pulse.wins}W / ${pulse.losses}L on ${pulse.tradesTaken}`
        : 'Closed trade edge'

    root.querySelectorAll<HTMLElement>('[data-sx-pulse="practice"]').forEach((el) => {
      el.textContent = practiceText
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="historical"]').forEach((el) => {
      el.textContent = histText
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="practice-hint"]').forEach((el) => {
      el.textContent = practiceHintText
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="historical-hint"]').forEach((el) => {
      el.textContent = histHintText
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="pnl"]').forEach((el) => {
      el.textContent = pnlText
      el.classList.toggle('sx-dash-pulse__kpi-value--ok', pnlTotals.hasData && pnlTotals.netPnl > 0)
      el.classList.toggle('sx-dash-pulse__kpi-value--warn', pnlTotals.hasData && pnlTotals.netPnl < 0)
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="pnl-hint"]').forEach((el) => {
      el.textContent = pnlHintText
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="winrate"]').forEach((el) => {
      el.textContent = winrateText
      el.classList.toggle('sx-dash-pulse__kpi-value--ok', pulse.winRate != null && pulse.winRate >= 50)
      el.classList.toggle(
        'sx-dash-pulse__kpi-value--warn',
        pulse.winRate != null && pulse.winRate < 50 && pulse.tradesTaken > 0,
      )
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="winrate-hint"]').forEach((el) => {
      el.textContent = winrateHintText
    })

    const activeSessionEl = root.querySelector<HTMLElement>('[data-sx-pulse="active-session"]')
    const practiceSplit = root.querySelector<HTMLElement>('[data-sx-pulse="practice-split"]')
    const practiceSessions = root.querySelector<HTMLElement>('[data-sx-pulse="practice-sessions"]')
    const tradesEl = root.querySelector<HTMLElement>('[data-sx-pulse="trades"]')
    const splitLabel = root.querySelector<HTMLElement>('[data-sx-pulse="split-label"]')
    const longBar = root.querySelector<HTMLElement>('[data-sx-pulse="long-bar"]')
    const shortBar = root.querySelector<HTMLElement>('[data-sx-pulse="short-bar"]')
    const ringHost = root.querySelector<HTMLElement>('[data-sx-pulse="ring"]')
    const activityHost = root.querySelector<HTMLElement>('[data-sx-pulse="activity"]')
    const symbolsHost = root.querySelector<HTMLElement>('[data-sx-pulse="symbols"]')
    const insightsHost = root.querySelector<HTMLElement>('[data-sx-pulse="insights"]')

    if (activeSessionEl) {
      if (pulse.activeSessionName) {
        activeSessionEl.textContent = `Active · ${pulse.activeSessionName} · ${formatPulseDuration(pulse.activePracticeMs)}`
        activeSessionEl.title = `${pulse.activeSessionName} — ${formatPulseDuration(pulse.activePracticeMs)} practice`
      } else {
        activeSessionEl.textContent = 'No active session'
        activeSessionEl.removeAttribute('title')
      }
    }
    if (practiceSplit) practiceSplit.innerHTML = buildPulsePracticeSplitHtml(pulse.sessionPractice)
    if (practiceSessions) practiceSessions.innerHTML = buildPulsePracticeRowsHtml(pulse.sessionPractice)
    if (tradesEl) {
      tradesEl.textContent =
        pulse.tradesTaken > 0
          ? `${pulse.tradesTaken} trade${pulse.tradesTaken === 1 ? '' : 's'} · ${pulse.wins}W / ${pulse.losses}L`
          : 'No closed trades yet'
    }
    if (splitLabel) {
      splitLabel.textContent =
        directed > 0 ? `${longPct}% buys · ${shortPct}% sells` : 'Buys / sells appear after journal closes'
    }
    if (longBar) longBar.style.width = `${longPct}%`
    if (shortBar) shortBar.style.width = `${shortPct}%`
    if (ringHost) ringHost.innerHTML = buildPulseWinRingSvg(pulse.winRate)
    if (activityHost) activityHost.innerHTML = buildPulseActivityChartSvg(pulse.practiceMonths)
    if (symbolsHost) symbolsHost.innerHTML = buildPulseSymbolRowsHtml(pulse.symbols)
    if (insightsHost) {
      insightsHost.innerHTML = pulse.insights
        .map((line) => `<li class="sx-dash-pulse__insight"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i><span>${line}</span></li>`)
        .join('')
    }

    root.querySelectorAll<HTMLButtonElement>('[data-pulse-range]').forEach((btn) => {
      const on = btn.getAttribute('data-pulse-range') === range
      btn.classList.toggle('sx-dash-pulse__range-btn--active', on)
      btn.setAttribute('aria-pressed', on ? 'true' : 'false')
    })
  }

  function syncDashboardPerf() {
    const range = readPulseRange()
    const sessions = listSessions()
    const period = describeDashboardPerfChartPeriod(sessions, 'backtest', range, 'daily')

    root.querySelectorAll<HTMLElement>('[data-sx-time-chart-pan]').forEach((pan) => {
      pan.innerHTML = buildDashboardPerfChartSvg(sessions, 'backtest', range, 'daily')
    })

    root.querySelectorAll<HTMLElement>('[data-sx-pnl-chart-period]').forEach((el) => {
      el.textContent = period
    })

    root.querySelectorAll<HTMLElement>('[data-sx-time-chart]').forEach((roleImg) => {
      roleImg.setAttribute('aria-label', `Net P&L path for ${period}`)
    })
  }

  const sessionFilterPanel = root.querySelector<HTMLElement>('[data-sx-session-dd="filter"] .sx-dash-perf-panel')
  const sessionSortPanel = root.querySelector<HTMLElement>('[data-sx-session-dd="sort"] .sx-dash-perf-panel')
  if (sessionFilterPanel) sessionFilterPanel.innerHTML = buildSessionFilterPanelHtml()
  if (sessionSortPanel) sessionSortPanel.innerHTML = buildSessionSortPanelHtml()
  syncSessionListUi()

  sessionModal = createSessionModal({
    onSessionCreate(payload) {
      openChartWithPayload(payload)
    },
    onSessionUpdate(id, payload) {
      updateSession(id, payload)
      syncRecentSessionsUi()
    },
  })

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null
    if (!t) return

    const newSessionBtn = t.closest<HTMLButtonElement>('[data-action="backtest"]')
    if (newSessionBtn && root.contains(newSessionBtn) && !newSessionBtn.disabled) {
      sessionModal.open({ sessionType: 'backtest' })
      return
    }

    const resumeBtn = t.closest<HTMLButtonElement>('[data-action="resume-session"]')
    if (resumeBtn && root.contains(resumeBtn)) {
      const id = sessionIdFromElement(resumeBtn)
      const s = id ? getSession(id) : null
      if (s) openChartWithStoredSession(s)
      return
    }
    const sessionAction = t.closest<HTMLButtonElement>('[data-action^="session-"]')
    if (sessionAction && root.contains(sessionAction)) {
      const act = sessionAction.getAttribute('data-action')
      const id = sessionIdFromElement(sessionAction)
      if (!id) return
      const session = getSession(id)
      if (!session) {
        syncRecentSessionsUi()
        return
      }
      if (act === 'session-delete') {
        void confirmDialog({
          title: 'Delete session',
          message: `Delete "${session.name}"? This cannot be undone.`,
          confirmLabel: 'Delete',
          cancelLabel: 'Cancel',
          danger: true,
        }).then((ok) => {
          if (!ok) return
          deleteSession(id)
          if (activeSessionId === id) activeSessionId = null
          syncRecentSessionsUi()
        })
      } else if (act === 'session-edit') {
        sessionModal.open({ editSessionId: id, draft: sessionToPayload(session) })
      } else if (act === 'session-stats') {
        openChartWithStoredSession(session)
      } else if (act === 'session-duplicate') {
        duplicateSession(id)
        syncRecentSessionsUi()
      } else if (act === 'session-summary') {
        openSessionSummaryDialog({
          session,
          onOpenChart: openChartWithStoredSession,
        })
      } else if (act === 'session-expand') {
        const row = sessionAction.closest('.sx-dash-session-row')
        const details = row?.querySelector('[data-session-details]')
        const expanded = !row?.classList.contains('sx-dash-session-row--expanded')
        row?.classList.toggle('sx-dash-session-row--expanded', expanded)
        details?.classList.toggle('hidden', !expanded)
        sessionAction.setAttribute('aria-expanded', expanded ? 'true' : 'false')
      }
      return
    }
    const pulseRangeBtn = t.closest<HTMLButtonElement>('[data-pulse-range]')
    if (pulseRangeBtn && root.contains(pulseRangeBtn)) {
      const v = pulseRangeBtn.getAttribute('data-pulse-range')
      if (v && PERF_RANGE_VALUES.includes(v as DashboardPerfRange)) {
        writePulseRange(v as DashboardPerfRange)
        syncSessionPulse()
        syncDashboardPerf()
      }
      return
    }
    const sessionFilterOpt = t.closest<HTMLButtonElement>('[data-session-filter-option]')
    if (sessionFilterOpt && root.contains(sessionFilterOpt)) {
      const v = sessionFilterOpt.getAttribute('data-session-filter-option')
      if (v && SESSION_FILTER_VALUES.includes(v as SessionFilterValue)) {
        writeSessionFilter(v as SessionFilterValue)
        syncRecentSessionsUi()
        closeAllPerfDropdowns()
      }
      return
    }
    const sessionSortOpt = t.closest<HTMLButtonElement>('[data-session-sort-option]')
    if (sessionSortOpt && root.contains(sessionSortOpt)) {
      const v = sessionSortOpt.getAttribute('data-session-sort-option')
      if (v && SESSION_SORT_VALUES.includes(v as SessionSortValue)) {
        writeSessionSort(v as SessionSortValue)
        syncRecentSessionsUi()
        closeAllPerfDropdowns()
      }
      return
    }
    const sessionFilterTrigger = t.closest<HTMLButtonElement>('[data-action="sessions-filter"]')
    if (sessionFilterTrigger && root.contains(sessionFilterTrigger)) {
      const wrap = sessionFilterTrigger.closest('[data-sx-session-dd]')
      if (!wrap) return
      const willOpen = !wrap.classList.contains('sx-dash-perf-dd--open')
      closeAllLocaleDropdowns()
      closeAllPerfDropdowns()
      if (willOpen) {
        wrap.classList.add('sx-dash-perf-dd--open')
        const panel = wrap.querySelector('.sx-dash-perf-panel')
        panel?.classList.remove('hidden')
        sessionFilterTrigger.setAttribute('aria-expanded', 'true')
      }
      return
    }
    const sessionSortTrigger = t.closest<HTMLButtonElement>('[data-action="sessions-sort"]')
    if (sessionSortTrigger && root.contains(sessionSortTrigger)) {
      const wrap = sessionSortTrigger.closest('[data-sx-session-dd]')
      if (!wrap) return
      const willOpen = !wrap.classList.contains('sx-dash-perf-dd--open')
      closeAllLocaleDropdowns()
      closeAllPerfDropdowns()
      if (willOpen) {
        wrap.classList.add('sx-dash-perf-dd--open')
        const panel = wrap.querySelector('.sx-dash-perf-panel')
        panel?.classList.remove('hidden')
        sessionSortTrigger.setAttribute('aria-expanded', 'true')
      }
      return
    }

    const optBtn = t.closest<HTMLButtonElement>('[data-locale-option]')
    if (optBtn && root.contains(optBtn)) {
      const code = optBtn.getAttribute('data-locale-option')
      if (code && isDashLocaleCode(code)) {
        writeDashLocale(code)
        syncDashLocaleUi(code)
        const page = appPageFromPath(window.location.pathname) ?? 'dashboard'
        const newPath = resolveAppPath(page, dashCodeToLocaleTag(code))
        if (newPath !== window.location.pathname) {
          history.pushState({ sx: 'locale', locale: code }, '', newPath)
        }
        closeAllLocaleDropdowns()
        closeAllPerfDropdowns()
      }
      return
    }
    const trigger = t.closest<HTMLButtonElement>('.sx-dash-locale-trigger')
    if (trigger && root.contains(trigger)) {
      const wrap = trigger.closest('[data-sx-locale-dropdown]')
      if (!wrap) return
      const willOpen = !wrap.classList.contains('sx-dash-locale-dd--open')
      closeAllPerfDropdowns()
      closeAllLocaleDropdowns()
      if (willOpen) {
        wrap.classList.add('sx-dash-locale-dd--open')
        const panel = wrap.querySelector('.sx-dash-locale-panel')
        panel?.classList.remove('hidden')
        trigger.setAttribute('aria-expanded', 'true')
      }
      return
    }
    if (t.closest('[data-sx-locale-dropdown]')) return
    if (t.closest('[data-sx-perf-dd]') || t.closest('[data-sx-session-dd]')) return
    closeAllLocaleDropdowns()
    closeAllPerfDropdowns()
  })

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (
      !root.querySelector('.sx-dash-locale-dd--open') &&
      !root.querySelector('[data-sx-perf-dd].sx-dash-perf-dd--open') &&
      !root.querySelector('[data-sx-session-dd].sx-dash-perf-dd--open')
    ) {
      return
    }
    closeAllLocaleDropdowns()
    closeAllPerfDropdowns()
  })

  const fromUrl = applyLocaleFromPath(window.location.pathname)
  const initialLocale = fromUrl ?? readDashLocale()
  writeDashLocale(initialLocale)
  syncDashLocaleUi(initialLocale)

  syncRecentSessionsUi()
  setTestingTab(readTestingTab())

  root.querySelectorAll<HTMLButtonElement>('[data-testing-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-testing-tab')
      if (tab && (TESTING_TABS as readonly string[]).includes(tab)) {
        setTestingTab(tab as TestingTab)
      }
    })
  })

  function onPopState() {
    const code = applyLocaleFromPath(window.location.pathname)
    if (code) syncDashLocaleUi(code)
    const page = appPageFromPath(window.location.pathname)
    if (page === 'chart') {
      const id = getLastSessionId()
      const s = id ? getSession(id) : listSessions()[0] ?? null
      if (!s) {
        history.replaceState(null, '', resolveAppPath('dashboard'))
        showDashboard()
        return
      }
      if (!viewChart.hidden && disposeChart && activeSessionId === s.id) return
      openChartWithStoredSession(s)
      return
    }
    if (page === 'dashboard') {
      showDashboard()
    }
  }

  window.addEventListener('popstate', onPopState)

  if (appPageFromPath(window.location.pathname) === 'chart') {
    const id = getLastSessionId()
    const s = id ? getSession(id) : listSessions()[0] ?? null
    if (s) openChartWithStoredSession(s)
    else {
      history.replaceState(null, '', resolveAppPath('dashboard'))
      showDashboardView()
    }
  } else {
    showDashboardView()
  }

  root.querySelectorAll('[data-action="dashboard"]').forEach((el) => {
    el.addEventListener('click', () => {
      showDashboard()
      setTestingTab('dashboard')
    })
  })

  const searchSessions = root.querySelector<HTMLInputElement>('#sx-dash-sessions-search')
  searchSessions?.addEventListener('input', () => {
    syncRecentSessionsUi()
  })

  root.querySelectorAll('[data-action="prop"]').forEach((el) => {
    el.addEventListener('click', () => {
      sessionModal.open({ sessionType: 'prop' })
    })
  })

  root.querySelectorAll('[data-action="strategy"]').forEach((el) => {
    el.addEventListener('click', () => {
      showStrategyPage()
    })
  })

  root.querySelectorAll('[data-action="profile"]').forEach((el) => {
    el.addEventListener('click', () => {
      setAccountMenuOpen(false)
      showProfilePage()
    })
  })

  root.querySelectorAll('[data-action="settings"]').forEach((el) => {
    el.addEventListener('click', () => {
      showSettingsPage()
    })
  })

  root.querySelectorAll('[data-action="subscription"]').forEach((el) => {
    el.addEventListener('click', () => {
      showSubscriptionPage()
    })
  })

  root.querySelectorAll('[data-action="pro-upgrade"]').forEach((el) => {
    el.addEventListener('click', () => {
      openUpgradePlansModal()
    })
  })
}
