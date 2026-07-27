import './traderLocal.css'
import './dashboardTheme.css'
import './surrealHero.css'
import { CHART_PAGE_PATH, HOME_PAGE_PATH, LOGIN_PAGE_PATH, normalizeAppPath } from '../appPaths'
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
import { clearAllAuthSessions } from '../auth/authSession'
import { mountAiChatPanel } from '../ai/aiChatPanel'
import { openBattleCompareDialog } from '../views/battleCompareDialog'
import { getAuthUser } from '../auth/authSession'
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
import { DASH_LOCALES, dashLocaleMenuLabel, isDashLocaleCode } from './dashboardLocales'
import { readDisplayName } from './dashboardUserPrefs'
import {
  buildDashboardPerfChartSvg,
  computeDashboardPerfTotals,
  formatDashboardPerfMoney,
  formatDashboardWinRate,
} from './dashboardPerfStats'
import { openSessionSummaryDialog } from '../views/sessionSummaryDialog'

const LS_LOCALE = 'suplexity-dash-locale'
const LS_SESSION_FILTER = 'suplexity-dash-session-filter'
const LS_SESSION_SORT = 'suplexity-dash-session-sort'
const LS_THEME = 'suplexity-dash-theme'
const LS_ACCOUNT_TIER = 'suplexity-account-tier'
const LS_PERF_MODE = 'suplexity-dash-perf-mode'
const LS_PERF_RANGE = 'suplexity-dash-perf-range'
const LS_TIME_CHART_VIEW = 'suplexity-dash-time-chart-view'
const LS_TESTING_TAB = 'suplexity-dash-testing-tab'

const TESTING_TABS = ['dashboard', 'sessions', 'trades', 'analytics'] as const
type TestingTab = (typeof TESTING_TABS)[number]

const TIME_CHART_VIEWS = ['daily', 'monthly'] as const
type TimeChartView = (typeof TIME_CHART_VIEWS)[number]

const PERF_MODE_VALUES = ['backtest', 'battles', 'prop', 'all'] as const
const PERF_RANGE_VALUES = ['week', 'month', 'lifetime'] as const

const PERF_MODE_LABELS: Record<(typeof PERF_MODE_VALUES)[number], string> = {
  backtest: 'Backtesting',
  battles: 'Battles',
  prop: 'Prop Firm',
  all: 'All',
}

const PERF_RANGE_LABELS: Record<(typeof PERF_RANGE_VALUES)[number], string> = {
  week: 'Last week',
  month: 'Last month',
  lifetime: 'Lifetime',
}

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

function buildPerfModePanelHtml(): string {
  return PERF_MODE_VALUES.map(
    (v) =>
      `<button type="button" role="option" class="sx-dash-perf-option" data-perf-mode-option="${v}">${PERF_MODE_LABELS[v]}</button>`,
  ).join('')
}

function buildPerfRangePanelHtml(): string {
  return PERF_RANGE_VALUES.map(
    (v) =>
      `<button type="button" role="option" class="sx-dash-perf-option" data-perf-range-option="${v}">${PERF_RANGE_LABELS[v]}</button>`,
  ).join('')
}

function readPerfMode(): (typeof PERF_MODE_VALUES)[number] {
  try {
    const v = localStorage.getItem(LS_PERF_MODE)
    if (v && PERF_MODE_VALUES.includes(v as (typeof PERF_MODE_VALUES)[number])) return v as (typeof PERF_MODE_VALUES)[number]
  } catch {
    /* noop */
  }
  return 'backtest'
}

function writePerfMode(mode: (typeof PERF_MODE_VALUES)[number]) {
  try {
    localStorage.setItem(LS_PERF_MODE, mode)
  } catch {
    /* noop */
  }
}

function readPerfRange(): (typeof PERF_RANGE_VALUES)[number] {
  try {
    const v = localStorage.getItem(LS_PERF_RANGE)
    if (v && PERF_RANGE_VALUES.includes(v as (typeof PERF_RANGE_VALUES)[number])) return v as (typeof PERF_RANGE_VALUES)[number]
  } catch {
    /* noop */
  }
  return 'month'
}

function writePerfRange(range: (typeof PERF_RANGE_VALUES)[number]) {
  try {
    localStorage.setItem(LS_PERF_RANGE, range)
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

function readTimeChartView(): TimeChartView {
  try {
    const v = localStorage.getItem(LS_TIME_CHART_VIEW)
    if (v && TIME_CHART_VIEWS.includes(v as TimeChartView)) return v as TimeChartView
  } catch {
    /* noop */
  }
  return 'daily'
}

function writeTimeChartView(view: TimeChartView) {
  try {
    localStorage.setItem(LS_TIME_CHART_VIEW, view)
  } catch {
    /* noop */
  }
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

function lastBacktestDetailsHtml(session: StoredSession): string {
  const bt = session.lastBacktest
  if (!bt) {
    return '<div><dt class="text-zinc-500">Last backtest</dt><dd class="text-zinc-200">No backtest run yet</dd></div>'
  }
  const strat = resolveStrategy(bt.strategyId)
  const stratName = strat?.name ?? bt.strategyId
  const winPct = Number.isFinite(bt.winRate) ? bt.winRate.toFixed(1) : '0'
  return `<div><dt class="text-zinc-500">Last backtest</dt><dd class="text-zinc-200">${formatDashMoney(bt.netPnl)} · ${bt.totalTrades} trades · ${winPct}% win</dd></div>
                  <div><dt class="text-zinc-500">Strategy</dt><dd class="text-zinc-200">${escapeHtml(stratName)}</dd></div>
                  <div><dt class="text-zinc-500">Backtest ran</dt><dd class="text-zinc-200">${escapeHtml(formatSessionTimestamp(bt.ranAt))}</dd></div>`
}

function sessionDateRangeLabel(session: StoredSession): string {
  const a = formatSessionModalDate(session.startDate)
  const b = formatSessionModalDate(session.endDate)
  if (a === '—' && b === '—') return 'No date range'
  return `${a} – ${b}`
}

function sessionBadgeHtml(sessionType: StoredSession['sessionType']): string {
  if (sessionType === 'prop') {
    return '<span class="inline-flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-200"><i class="fa-solid fa-bolt text-[0.6rem]" aria-hidden="true"></i>Prop</span>'
  }
  return '<span class="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-200"><i class="fa-solid fa-chart-line text-[0.6rem]" aria-hidden="true"></i>Backtest</span>'
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
      <div class="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:flex-col sm:items-end lg:flex-row">
        <button type="button" data-action="session-delete" class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-rose-400 transition hover:border-rose-500/25 hover:bg-rose-500/10" title="Delete" aria-label="Delete session"><i class="fa-solid fa-trash-can text-[0.8rem]" aria-hidden="true"></i></button>
        <button type="button" data-action="session-edit" class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-zinc-200" title="Edit" aria-label="Edit session"><i class="fa-solid fa-pen text-[0.8rem]" aria-hidden="true"></i></button>
        <button type="button" data-action="session-duplicate" class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-zinc-200" title="Duplicate" aria-label="Duplicate session"><i class="fa-regular fa-copy text-[0.8rem]" aria-hidden="true"></i></button>
        <button type="button" data-action="session-summary" class="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-white/12 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/[0.1]">Summary</button>
        <button type="button" data-action="session-expand" class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-zinc-500 transition hover:bg-white/[0.05]" title="Expand details" aria-label="Expand details" aria-expanded="false"><i class="fa-solid fa-chevron-down text-[0.75rem] sx-dash-session-expand-ico" aria-hidden="true"></i></button>
      </div>`
}

function buildSessionRowHtml(session: StoredSession): string {
  const range = sessionDateRangeLabel(session)
  const lastOpened = session.lastOpenedAt
    ? `Last opened ${formatSessionTimestamp(session.lastOpenedAt)}`
    : `Updated ${formatSessionTimestamp(session.updatedAt)}`
  const actions = buildSessionActionsHtml()
  return `<li class="sx-dash-session-row rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4 sm:p-5" data-session-id="${escapeHtml(session.id)}" data-session-name="${escapeHtml(sessionSearchBlob(session))}">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <button type="button" data-action="resume-session" class="flex h-12 w-12 shrink-0 items-center justify-center self-start rounded-full bg-[#e11d48] text-white shadow-[0_8px_22px_rgba(225,29,72,0.35)] transition hover:bg-[#be123c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60" title="Resume session" aria-label="Resume session">
              <i class="fa-solid fa-play ml-0.5 text-sm" aria-hidden="true"></i>
            </button>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-base font-bold text-slate-900 dark:text-white">${escapeHtml(session.name)}</span>
                ${sessionBadgeHtml(session.sessionType)}
                ${propChallengeBadgeHtml(session)}
              </div>
              <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span class="inline-flex items-center gap-1.5"><i class="fa-regular fa-calendar text-[0.75rem]" aria-hidden="true"></i>${escapeHtml(range)}</span>
                <span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-wallet text-[0.75rem]" aria-hidden="true"></i>${escapeHtml(session.balance)}</span>
              </div>
              <span class="mt-2 inline-flex rounded-lg border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.08] dark:text-zinc-200">${escapeHtml(session.assets)}</span>
              ${lastBacktestStripHtml(session)}
              ${replayJournalStripHtml(session)}
              <p class="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">${escapeHtml(lastOpened)}</p>
              <div class="sx-dash-session-row__details mt-3 hidden rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-xs text-zinc-400" data-session-details>
                <dl class="grid gap-1 sm:grid-cols-2">
                  <div><dt class="text-zinc-500">Type</dt><dd class="text-zinc-200">${session.sessionType === 'prop' ? 'Prop firm' : 'Backtesting'}</dd></div>
                  ${lastBacktestDetailsHtml(session)}
                  ${
                    session.sessionType === 'prop'
                      ? `<div><dt class="text-zinc-500">Challenge</dt><dd class="text-zinc-200">${escapeHtml(propStatusLabel(session.propResult?.status))}</dd></div>
                  <div><dt class="text-zinc-500">Profit target</dt><dd class="text-zinc-200">${session.propRules?.profitTargetPct ?? 10}%</dd></div>
                  <div><dt class="text-zinc-500">Max drawdown</dt><dd class="text-zinc-200">${session.propRules?.maxDrawdownPct ?? 5}%</dd></div>
                  <div><dt class="text-zinc-500">Daily loss limit</dt><dd class="text-zinc-200">${session.propRules?.maxDailyLossPct ?? 2}%</dd></div>`
                      : ''
                  }
                  <div><dt class="text-zinc-500">Created</dt><dd class="text-zinc-200">${escapeHtml(formatSessionTimestamp(session.createdAt))}</dd></div>
                  <div><dt class="text-zinc-500">Updated</dt><dd class="text-zinc-200">${escapeHtml(formatSessionTimestamp(session.updatedAt))}</dd></div>
                  <div><dt class="text-zinc-500">Date range</dt><dd class="text-zinc-200">${escapeHtml(range)}</dd></div>
                </dl>
              </div>
            </div>
            ${actions}
          </div>
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

function buildRecentSessionsSectionHtml(): string {
  return `
            <section
              class="sx-dash-recent-sessions sx-dash-card-surface overflow-hidden rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-8 lg:p-10"
              aria-labelledby="sx-dash-recent-sessions-title"
            >
              <div class="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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

              <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
export function mountDashboardApp(root: HTMLElement): void {
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
          <button
            type="button"
            data-action="profile"
            class="sx-dash-account-btn"
            aria-label="Account"
            title="Account"
          >
            <span class="sx-dash-account-btn__icon" aria-hidden="true">
              <i class="fa-solid fa-user"></i>
            </span>
            <span class="sx-dash-account-btn__label">Account</span>
          </button>
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
              <button type="button" data-action="ai-chat" class="sx-dash-ai-chat-btn inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-sky-300/70 bg-sky-50 px-2.5 text-sky-700 transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/55" aria-label="Open AI assistant">
                <i class="fa-solid fa-wand-magic-sparkles text-[0.75rem] shrink-0" aria-hidden="true"></i>
                <span class="text-[11px] font-bold leading-none tracking-tight">AI</span>
              </button>
              <span class="sx-dash-tip">AI Assistant</span>
            </span>
            <span class="sx-dash-tip-wrap inline-flex">
              <button type="button" data-action="dash-fullscreen" class="sx-dash-fullscreen-btn relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45" aria-label="Enter fullscreen">
                <i class="fa-solid fa-expand sx-dash-fs-icon-expand pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.78rem]" aria-hidden="true"></i>
                <i class="fa-solid fa-compress sx-dash-fs-icon-compress pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.78rem]" aria-hidden="true"></i>
              </button>
              <span class="sx-dash-tip">Fullscreen</span>
            </span>
            <span class="sx-dash-tip-wrap inline-flex">
              <button type="button" class="sx-dash-theme-icon-btn relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45" aria-label="Switch to light theme">
                <i class="fa-solid fa-sun sx-dash-theme-icon--when-dark pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.88rem]" aria-hidden="true"></i>
                <i class="fa-solid fa-moon sx-dash-theme-icon--when-light pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.82rem]" aria-hidden="true"></i>
              </button>
              <span class="sx-dash-tip">Change theme</span>
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
              <button type="button" data-nav="logout" class="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40">Sign out</button>
              <span class="sx-dash-tip">Sign out</span>
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
        <button type="button" data-action="profile" class="sx-dash-hnav__link sx-dash-hnav__link--block">
          <i class="fa-solid fa-user w-5 shrink-0 text-center text-[0.9rem]" aria-hidden="true"></i>
          Account
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
                <i class="fa-solid fa-chart-column" aria-hidden="true"></i>
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
              <p class="sx-dash-welcome-sub max-w-xl text-sm leading-snug text-slate-600">Create a session, pick a date, and replay the tape — or resume where you left off.</p>
              <ul class="sx-dash-premium-pills mt-2.5 flex flex-wrap gap-1.5" aria-label="Workspace highlights">
                <li class="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">Tick-accurate replay</li>
                <li class="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">Multi-symbol sessions</li>
                <li class="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">Strategy ready</li>
              </ul>
            </div>
          </div>
        </header>

        <section class="sx-dash-action-row flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-action="backtest"
            class="sx-dash-cta-session inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#e11d48] px-7 py-3.5 text-sm font-bold tracking-tight text-white shadow-[0_8px_24px_rgba(225,29,72,0.35)] transition hover:-translate-y-0.5 hover:bg-[#be123c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f3ff] active:translate-y-0"
          >
            <span class="text-lg font-light leading-none" aria-hidden="true">+</span> Backtesting Session <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            data-action="prop"
            class="sx-dash-cta-session inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#e11d48] px-7 py-3.5 text-sm font-bold tracking-tight text-white shadow-[0_8px_24px_rgba(225,29,72,0.35)] transition hover:-translate-y-0.5 hover:bg-[#be123c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f3ff] active:translate-y-0"
          >
            <i class="fa-solid fa-building-columns text-[0.8rem]" aria-hidden="true"></i>
            Prop Firm Challenge
            <span aria-hidden="true">→</span>
          </button>
        </section>
          </div>

          <div class="sx-dash-testing-panel hidden" data-testing-panel="sessions" role="tabpanel" hidden></div>

          <div class="sx-dash-recent-sessions-host mt-1" data-sx-recent-sessions-host>
        ${buildRecentSessionsSectionHtml()}
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

          <div class="sx-dash-testing-panel hidden" data-testing-panel="analytics" role="tabpanel" hidden>
        <section>
          <div>
            <div class="sx-dash-card-surface rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-8 lg:p-10">
              <div class="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
                <h3 class="text-xl font-bold text-white">Performance</h3>
                <div class="flex flex-wrap items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    data-action="battle-compare"
                    class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45"
                    title="Compare two sessions for Battles performance"
                  >
                    <i class="fa-solid fa-bolt text-[0.65rem]" aria-hidden="true"></i>
                    Compare sessions
                  </button>
                  <div class="sx-dash-perf-dd relative" data-sx-perf-dd="mode">
                    <button
                      type="button"
                      class="sx-dash-perf-trigger inline-flex h-9 min-w-[9.5rem] shrink-0 items-center gap-2 rounded-full border border-sky-400/25 bg-gradient-to-r from-white/[0.08] to-white/[0.04] py-0 pl-3 pr-3 text-xs font-semibold text-zinc-100 shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset] outline-none transition hover:border-sky-400/40 hover:from-white/[0.11] hover:to-white/[0.06] focus-visible:ring-2 focus-visible:ring-sky-400/50"
                      data-perf-mode-trigger
                      aria-expanded="false"
                      aria-haspopup="listbox"
                      aria-label="Performance mode"
                    >
                      <i class="fa-solid fa-chart-column text-[0.7rem] text-sky-300/90" aria-hidden="true"></i>
                      <span class="sx-dash-perf-trigger__label--mode min-w-0 flex-1 truncate text-left">Backtesting</span>
                      <i class="fa-solid fa-chevron-down sx-dash-perf-trigger__chev text-[0.55rem] text-zinc-400 transition-transform" aria-hidden="true"></i>
                    </button>
                    <div class="sx-dash-perf-panel hidden min-w-[10.5rem]" role="listbox" aria-label="Performance mode"></div>
                  </div>
                  <div class="sx-dash-perf-dd relative" data-sx-perf-dd="range">
                    <button
                      type="button"
                      class="sx-dash-perf-trigger inline-flex h-9 min-w-[9.5rem] shrink-0 items-center gap-2 rounded-full border border-violet-400/25 bg-gradient-to-r from-white/[0.08] to-white/[0.04] py-0 pl-3 pr-3 text-xs font-semibold text-zinc-100 shadow-[0_0_0_1px_rgba(255,255,255,0.06)_inset] outline-none transition hover:border-violet-400/40 hover:from-white/[0.11] hover:to-white/[0.06] focus-visible:ring-2 focus-visible:ring-violet-400/45"
                      data-perf-range-trigger
                      aria-expanded="false"
                      aria-haspopup="listbox"
                      aria-label="Time range"
                    >
                      <i class="fa-solid fa-calendar-days text-[0.7rem] text-violet-300/90" aria-hidden="true"></i>
                      <span class="sx-dash-perf-trigger__label--range min-w-0 flex-1 truncate text-left">Last month</span>
                      <i class="fa-solid fa-chevron-down sx-dash-perf-trigger__chev text-[0.55rem] text-zinc-400 transition-transform" aria-hidden="true"></i>
                    </button>
                    <div class="sx-dash-perf-panel hidden min-w-[10.5rem]" role="listbox" aria-label="Time range"></div>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5 lg:items-stretch">
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-6 lg:grid-cols-2 lg:content-start">
                  <div class="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-sm">
                    <button type="button" class="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300" title="Total net profit and loss from backtests and paper trades in this mode and range." aria-label="About Net P&amp;L">
                      <i class="fa-regular fa-circle-question text-sm" aria-hidden="true"></i>
                    </button>
                    <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-amber-400">
                      <i class="fa-solid fa-chart-column text-[0.95rem]" aria-hidden="true"></i>
                    </div>
                    <p class="text-xs font-medium text-zinc-400">Net P&amp;L</p>
                    <p class="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl" data-sx-perf-stat="pnl">—</p>
                  </div>
                  <div class="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-sm">
                    <button type="button" class="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300" title="Sessions with backtest or journal activity in this period." aria-label="About Sessions active">
                      <i class="fa-regular fa-circle-question text-sm" aria-hidden="true"></i>
                    </button>
                    <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-sky-400">
                      <i class="fa-solid fa-clock text-[0.95rem]" aria-hidden="true"></i>
                    </div>
                    <p class="text-xs font-medium text-zinc-400">Sessions active</p>
                    <p class="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl" data-sx-perf-stat="sessions">0</p>
                  </div>
                  <div class="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-sm sm:col-span-2 lg:col-span-1">
                    <button type="button" class="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300" title="Count of completed trades in this period." aria-label="About Trades taken">
                      <i class="fa-regular fa-circle-question text-sm" aria-hidden="true"></i>
                    </button>
                    <p class="text-xs font-medium text-zinc-400">Trades taken</p>
                    <p class="mt-3 text-sm leading-relaxed text-zinc-500" data-sx-perf-stat="trades">Your trades taken will show up here</p>
                  </div>
                  <div class="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-sm sm:col-span-2 lg:col-span-1">
                    <button type="button" class="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300" title="Share of winning trades over closed trades." aria-label="About Overall win rate">
                      <i class="fa-regular fa-circle-question text-sm" aria-hidden="true"></i>
                    </button>
                    <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-violet-400">
                      <i class="fa-solid fa-award text-[0.95rem]" aria-hidden="true"></i>
                    </div>
                    <p class="text-xs font-medium text-zinc-400">Overall win rate</p>
                    <p class="mt-1 text-2xl font-bold tracking-tight text-zinc-500 dark:text-zinc-600 sm:text-3xl" data-sx-perf-stat="winrate">—</p>
                  </div>
                </div>

                <div class="relative flex min-h-[220px] flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-sm sm:min-h-[260px] lg:col-span-6 lg:min-h-0">
                  <button type="button" class="absolute right-3 top-3 z-[1] text-zinc-500 hover:text-zinc-300" title="Net profit and loss per calendar period." aria-label="About Net P&amp;L chart">
                    <i class="fa-regular fa-circle-question text-sm" aria-hidden="true"></i>
                  </button>
                  <div class="mb-3 flex flex-col gap-3 pr-8 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
                    <p class="text-sm font-semibold text-slate-900 dark:text-white">Net P&amp;L</p>
                    <div
                      class="sx-dash-time-chart-tabs inline-flex shrink-0 rounded-lg border border-white/12 bg-white/[0.04] p-0.5"
                      role="tablist"
                      aria-label="Chart period"
                    >
                      <button
                        type="button"
                        role="tab"
                        class="sx-dash-time-chart-tab rounded-md px-2.5 py-1 text-[11px] font-semibold text-zinc-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45"
                        data-time-chart-tab="daily"
                        aria-selected="true"
                      >
                        Daily
                      </button>
                      <button
                        type="button"
                        role="tab"
                        class="sx-dash-time-chart-tab rounded-md px-2.5 py-1 text-[11px] font-semibold text-zinc-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45"
                        data-time-chart-tab="monthly"
                        aria-selected="false"
                      >
                        Monthly
                      </button>
                    </div>
                  </div>
                  <div class="flex min-h-0 flex-1 flex-col justify-end">
                    <div
                      class="sx-dash-time-chart flex h-[12.25rem] flex-col overflow-hidden rounded-xl sm:h-[13.75rem]"
                      role="img"
                      data-sx-time-chart
                      aria-label="Net P&amp;L chart"
                    >
                      <div class="sx-dash-time-chart__frame min-h-0 flex-1 px-1 pb-0.5 pt-1">
                        <div
                          class="sx-dash-time-chart__pan min-h-0 min-w-0 overflow-x-auto overflow-y-hidden"
                          id="sx-dash-time-chart-pan"
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
    applyDashTheme(appRoot, 'light')
    writeDashTheme('light')
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
    const name = readDisplayName()
    const nameEl = root.querySelector('#sx-dash-display-name')
    if (nameEl) nameEl.textContent = name
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
    const path = normalizeAppPath(window.location.pathname)
    if (path !== CHART_PAGE_PATH) {
      history.pushState({ sx: 'chart', sessionId: session.id }, '', CHART_PAGE_PATH)
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
      onOpenSubscription: showSubscriptionPage,
      onDisplayNameChange: () => syncSidebarProfile(),
      freeSessionLimit: FREE_SESSION_LIMIT,
    })
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
      onProUpgrade: showSubscriptionPage,
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
    const path = normalizeAppPath(window.location.pathname)
    if (path === CHART_PAGE_PATH) {
      history.pushState({ sx: 'dash' }, '', HOME_PAGE_PATH)
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
          <button type="button" data-action="backtest" class="sx-dash-cta-session mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-[#e11d48] px-5 py-2.5 text-xs font-bold text-white shadow-[0_8px_20px_rgba(225,29,72,0.3)] transition hover:bg-[#be123c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70">
            <span aria-hidden="true">+</span> Backtesting Session <span aria-hidden="true">→</span>
          </button>
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
    if (tab === 'trades') syncTradesUi()
    if (tab === 'analytics') syncDashboardPerf()
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
        window.location.assign(LOGIN_PAGE_PATH)
      })
    })
  })

  function applyAccountTierUi() {
    const tier = readAccountTier()
    const label = tier === 'pro' ? 'Pro Max user' : tier === 'intermediate' ? 'Pro user' : 'Free user'
    const badge = root.querySelector('#sx-dash-plan-badge')
    if (badge) badge.textContent = label
    root.querySelectorAll('.sx-dash-pro-upgrade-btn').forEach((el) => {
      el.classList.toggle('hidden', tier === 'pro')
    })
    root.querySelector('[data-sx-sessions-banner]')?.classList.toggle('hidden', tier === 'pro')
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

  function syncDashboardPerf() {
    const mode = readPerfMode()
    const range = readPerfRange()
    const view = readTimeChartView()
    const sessions = listSessions()
    const totals = computeDashboardPerfTotals(sessions, mode, range)

    const pnlEl = root.querySelector<HTMLElement>('[data-sx-perf-stat="pnl"]')
    const sessionsEl = root.querySelector<HTMLElement>('[data-sx-perf-stat="sessions"]')
    const tradesEl = root.querySelector<HTMLElement>('[data-sx-perf-stat="trades"]')
    const winEl = root.querySelector<HTMLElement>('[data-sx-perf-stat="winrate"]')

    if (pnlEl) {
      pnlEl.textContent = totals.hasData ? formatDashboardPerfMoney(totals.netPnl) : '—'
      pnlEl.className = `mt-1 text-2xl font-bold tracking-tight sm:text-3xl ${
        totals.netPnl > 0
          ? 'text-emerald-400'
          : totals.netPnl < 0
            ? 'text-rose-400'
            : 'text-slate-900 dark:text-white'
      }`
    }
    if (sessionsEl) sessionsEl.textContent = String(totals.sessionsActive)
    if (tradesEl) {
      if (totals.tradesTaken > 0) {
        tradesEl.textContent = String(totals.tradesTaken)
        tradesEl.className =
          'mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl'
      } else {
        tradesEl.textContent =
          mode === 'battles'
            ? 'Run Compare sessions to record battles'
            : totals.hasData
              ? '0'
              : 'Your trades taken will show up here'
        tradesEl.className = totals.hasData
          ? 'mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl'
          : 'mt-3 text-sm leading-relaxed text-zinc-500'
      }
    }
    if (winEl) {
      winEl.textContent = formatDashboardWinRate(totals.winRate)
      winEl.className = `mt-1 text-2xl font-bold tracking-tight sm:text-3xl ${
        totals.winRate != null && totals.winRate >= 50
          ? 'text-emerald-400'
          : totals.winRate != null
            ? 'text-slate-900 dark:text-white'
            : 'text-zinc-500 dark:text-zinc-600'
      }`
    }

    const pan = root.querySelector('#sx-dash-time-chart-pan')
    if (pan) {
      pan.innerHTML = buildDashboardPerfChartSvg(sessions, mode, range, view)
    }

    const roleImg = root.querySelector('[data-sx-time-chart]')
    if (roleImg) {
      const desc =
        view === 'daily'
          ? `Net P&L by day this month (${PERF_MODE_LABELS[mode]}, ${PERF_RANGE_LABELS[range]})`
          : `Net P&L by month this year (${PERF_MODE_LABELS[mode]}, ${PERF_RANGE_LABELS[range]})`
      roleImg.setAttribute('aria-label', desc)
    }

    root.querySelectorAll<HTMLButtonElement>('[data-time-chart-tab]').forEach((btn) => {
      const v = btn.getAttribute('data-time-chart-tab')
      const on = v === view
      btn.classList.toggle('sx-dash-time-chart-tab--selected', on)
      btn.setAttribute('aria-selected', on ? 'true' : 'false')
    })
  }

  function syncPerfUi() {
    const mode = readPerfMode()
    const range = readPerfRange()
    root.querySelectorAll('.sx-dash-perf-trigger__label--mode').forEach((el) => {
      el.textContent = PERF_MODE_LABELS[mode]
    })
    root.querySelectorAll('.sx-dash-perf-trigger__label--range').forEach((el) => {
      el.textContent = PERF_RANGE_LABELS[range]
    })
    root.querySelectorAll<HTMLButtonElement>('[data-perf-mode-option]').forEach((btn) => {
      const on = btn.getAttribute('data-perf-mode-option') === mode
      btn.classList.toggle('sx-dash-perf-option--selected', on)
      btn.setAttribute('aria-selected', on ? 'true' : 'false')
    })
    root.querySelectorAll<HTMLButtonElement>('[data-perf-range-option]').forEach((btn) => {
      const on = btn.getAttribute('data-perf-range-option') === range
      btn.classList.toggle('sx-dash-perf-option--selected', on)
      btn.setAttribute('aria-selected', on ? 'true' : 'false')
    })
  }

  const perfModePanel = root.querySelector<HTMLElement>('[data-sx-perf-dd="mode"] .sx-dash-perf-panel')
  const perfRangePanel = root.querySelector<HTMLElement>('[data-sx-perf-dd="range"] .sx-dash-perf-panel')
  if (perfModePanel) perfModePanel.innerHTML = buildPerfModePanelHtml()
  if (perfRangePanel) perfRangePanel.innerHTML = buildPerfRangePanelHtml()

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

    const timeChartTab = t.closest<HTMLButtonElement>('[data-time-chart-tab]')
    if (timeChartTab && root.contains(timeChartTab)) {
      const v = timeChartTab.getAttribute('data-time-chart-tab')
      if (v === 'daily' || v === 'monthly') {
        writeTimeChartView(v)
        syncDashboardPerf()
      }
      return
    }

    const perfModeOpt = t.closest<HTMLButtonElement>('[data-perf-mode-option]')
    if (perfModeOpt && root.contains(perfModeOpt)) {
      const v = perfModeOpt.getAttribute('data-perf-mode-option')
      if (v === 'backtest' || v === 'battles' || v === 'prop' || v === 'all') {
        writePerfMode(v)
        syncPerfUi()
        syncDashboardPerf()
        closeAllPerfDropdowns()
      }
      return
    }
    const perfModeTrigger = t.closest<HTMLButtonElement>('[data-perf-mode-trigger]')
    if (perfModeTrigger && root.contains(perfModeTrigger)) {
      const wrap = perfModeTrigger.closest('[data-sx-perf-dd]')
      if (!wrap) return
      const willOpen = !wrap.classList.contains('sx-dash-perf-dd--open')
      closeAllLocaleDropdowns()
      closeAllPerfDropdowns()
      if (willOpen) {
        wrap.classList.add('sx-dash-perf-dd--open')
        const panel = wrap.querySelector('.sx-dash-perf-panel')
        panel?.classList.remove('hidden')
        perfModeTrigger.setAttribute('aria-expanded', 'true')
      }
      return
    }

    const perfRangeOpt = t.closest<HTMLButtonElement>('[data-perf-range-option]')
    if (perfRangeOpt && root.contains(perfRangeOpt)) {
      const v = perfRangeOpt.getAttribute('data-perf-range-option')
      if (v === 'week' || v === 'month' || v === 'lifetime') {
        writePerfRange(v)
        syncPerfUi()
        syncDashboardPerf()
        closeAllPerfDropdowns()
      }
      return
    }
    const perfRangeTrigger = t.closest<HTMLButtonElement>('[data-perf-range-trigger]')
    if (perfRangeTrigger && root.contains(perfRangeTrigger)) {
      const wrap = perfRangeTrigger.closest('[data-sx-perf-dd]')
      if (!wrap) return
      const willOpen = !wrap.classList.contains('sx-dash-perf-dd--open')
      closeAllLocaleDropdowns()
      closeAllPerfDropdowns()
      if (willOpen) {
        wrap.classList.add('sx-dash-perf-dd--open')
        const panel = wrap.querySelector('.sx-dash-perf-panel')
        panel?.classList.remove('hidden')
        perfRangeTrigger.setAttribute('aria-expanded', 'true')
      }
      return
    }

    const optBtn = t.closest<HTMLButtonElement>('[data-locale-option]')
    if (optBtn && root.contains(optBtn)) {
      const code = optBtn.getAttribute('data-locale-option')
      if (code && isDashLocaleCode(code)) {
        writeDashLocale(code)
        syncDashLocaleUi(code)
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

  const initialLocale = readDashLocale()
  writeDashLocale(initialLocale)
  syncDashLocaleUi(initialLocale)

  syncPerfUi()
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
    const path = normalizeAppPath(window.location.pathname)
    if (path === CHART_PAGE_PATH) {
      const id = getLastSessionId()
      const s = id ? getSession(id) : listSessions()[0] ?? null
      if (!s) {
        history.replaceState(null, '', HOME_PAGE_PATH)
        showDashboard()
        return
      }
      if (!viewChart.hidden && disposeChart && activeSessionId === s.id) return
      openChartWithStoredSession(s)
      return
    }
    if (path === HOME_PAGE_PATH) {
      showDashboard()
    }
  }

  window.addEventListener('popstate', onPopState)

  if (normalizeAppPath(window.location.pathname) === CHART_PAGE_PATH) {
    const id = getLastSessionId()
    const s = id ? getSession(id) : listSessions()[0] ?? null
    if (s) openChartWithStoredSession(s)
    else {
      history.replaceState(null, '', HOME_PAGE_PATH)
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

  root.querySelectorAll('[data-action="battle-compare"]').forEach((el) => {
    el.addEventListener('click', () => {
      openBattleCompareDialog({
        sessions: listSessions(),
        onRecorded: () => {
          if (readPerfMode() !== 'battles') writePerfMode('battles')
          syncPerfUi()
          syncDashboardPerf()
        },
      })
    })
  })

  root.querySelectorAll('[data-action="profile"]').forEach((el) => {
    el.addEventListener('click', () => {
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
      showSubscriptionPage()
    })
  })
}
