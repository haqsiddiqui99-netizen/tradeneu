import './traderLocal.css'
import './dashboardTheme.css'
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

function readAccountTier(): 'free' | 'pro' {
  try {
    const v = localStorage.getItem(LS_ACCOUNT_TIER)
    if (v === 'pro') return 'pro'
  } catch {
    /* noop */
  }
  return 'free'
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
        <button type="button" data-action="session-stats" class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-zinc-200" title="Open chart" aria-label="Open session chart"><i class="fa-solid fa-chart-simple text-[0.8rem]" aria-hidden="true"></i></button>
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
            <button type="button" data-action="resume-session" class="flex h-12 w-12 shrink-0 items-center justify-center self-start rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-900/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60" title="Resume session" aria-label="Resume session">
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
  return 'dark'
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

/**
 * TraderLocal-style dark dashboard — session launcher & markets.
 */
export function mountDashboardApp(root: HTMLElement): void {
  document.documentElement.removeAttribute('data-theme')

  root.replaceChildren()
  appendElementsFromHtml(
    root,
    `
<div class="dark flex h-full min-h-0 flex-col overflow-hidden bg-[#0a0612] text-zinc-100" id="sx-app-root" data-dashboard-theme="dark">
  <div id="view-dash" class="sx-dash relative flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-zinc-100 selection:bg-blue-500/30">
    <div class="sx-dash__mesh" aria-hidden="true"></div>
    <div class="sx-dash__noise" aria-hidden="true"></div>
    <div class="sx-dash__orb sx-dash__orb--a" aria-hidden="true"></div>
    <div class="sx-dash__orb sx-dash__orb--b" aria-hidden="true"></div>
    <div class="sx-dash__orb sx-dash__orb--c" aria-hidden="true"></div>

    <div class="sx-dash__layer flex min-h-0 flex-1 flex-col overflow-hidden">
    <div class="sx-dash-topbar sx-dash-topbar-desktop relative z-[45] hidden w-full shrink-0 items-center justify-end border-b border-white/[0.08] bg-[#0a0612]/92 px-4 py-2.5 backdrop-blur-xl lg:flex lg:pl-64">
      <div class="sx-dash-topbar-tools flex flex-wrap items-center justify-end gap-4" role="toolbar" aria-label="Dashboard actions">
        <span class="sx-dash-tip-wrap inline-flex">
          <button type="button" class="sx-dash-pro-upgrade-btn inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/40 bg-gradient-to-br from-amber-500/25 via-violet-500/20 to-sky-500/20 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.18)] transition hover:border-amber-300/55 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/55" data-action="pro-upgrade" aria-label="Upgrade to Pro">
            <i class="fa-solid fa-crown text-[0.85rem]" aria-hidden="true"></i>
          </button>
          <span class="sx-dash-tip">Upgrade Pro</span>
        </span>
        <span class="sx-dash-tip-wrap inline-flex">
          <button type="button" data-action="ai-chat" class="sx-dash-ai-chat-btn inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-sky-400/40 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 px-2.5 text-sky-100 shadow-[0_0_18px_rgba(56,189,248,0.22)] transition hover:border-sky-300/55 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/55" aria-label="Open AI assistant">
            <i class="fa-solid fa-wand-magic-sparkles text-[0.8rem] shrink-0" aria-hidden="true"></i>
            <span class="text-[11px] font-bold leading-none tracking-tight">AI</span>
          </button>
          <span class="sx-dash-tip">AI Assistant</span>
        </span>
        <span class="sx-dash-tip-wrap inline-flex">
          <button type="button" data-action="dash-fullscreen" class="sx-dash-fullscreen-btn relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-zinc-400 transition hover:border-white/22 hover:bg-white/[0.11] hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45" aria-label="Enter fullscreen">
            <i class="fa-solid fa-expand sx-dash-fs-icon-expand pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.82rem]" aria-hidden="true"></i>
            <i class="fa-solid fa-compress sx-dash-fs-icon-compress pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.82rem]" aria-hidden="true"></i>
          </button>
          <span class="sx-dash-tip">Fullscreen</span>
        </span>
        <span class="sx-dash-tip-wrap inline-flex">
          <button type="button" class="sx-dash-theme-icon-btn relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-zinc-400 transition hover:border-white/22 hover:bg-white/[0.11] hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45" aria-label="Switch to light theme">
            <i class="fa-solid fa-sun sx-dash-theme-icon--when-dark pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.95rem]" aria-hidden="true"></i>
            <i class="fa-solid fa-moon sx-dash-theme-icon--when-light pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.88rem]" aria-hidden="true"></i>
          </button>
          <span class="sx-dash-tip">Change theme</span>
        </span>
        <span class="sx-dash-tip-wrap relative inline-flex h-9 shrink-0">
          <div class="sx-dash-locale-dd relative h-9 shrink-0" data-sx-locale-dropdown>
            <button
              type="button"
              class="sx-dash-locale-trigger inline-flex h-9 min-w-[3.1rem] shrink-0 items-center gap-1 rounded-lg border border-white/12 bg-white/[0.06] py-0 pl-2 pr-2 text-left text-[10px] font-bold text-zinc-200 outline-none transition hover:border-white/22 hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-sky-400/45"
              aria-expanded="false"
              aria-haspopup="listbox"
              aria-label="Language"
            >
              <span class="sx-dash-locale-trigger__code">EN</span>
              <i class="fa-solid fa-chevron-down sx-dash-locale-trigger__chev text-[0.55rem] text-zinc-400" aria-hidden="true"></i>
            </button>
            <div class="sx-dash-locale-panel hidden" role="listbox" aria-label="Choose language"></div>
          </div>
          <span class="sx-dash-tip">Translate</span>
        </span>
        <span class="sx-dash-tip-wrap inline-flex">
          <button type="button" data-nav="logout" class="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-3 text-xs font-semibold text-zinc-100 transition hover:border-rose-400/45 hover:bg-rose-500/15 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40">Sign out</button>
          <span class="sx-dash-tip">Sign out</span>
        </span>
      </div>
    </div>
    <div class="sx-dash-topbar sx-dash-topbar-mobile relative z-40 flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b border-white/[0.08] bg-[#0a0612]/85 px-3 py-2.5 backdrop-blur-xl lg:hidden">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <label
          for="sx-nav-drawer"
          class="inline-flex min-h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
          aria-label="Open menu"
          >☰</label
        >
        <div class="sx-dash-topbar-tools flex min-w-0 shrink-0 flex-wrap items-center gap-3" role="toolbar" aria-label="Dashboard actions">
          <span class="sx-dash-tip-wrap inline-flex">
            <button type="button" class="sx-dash-pro-upgrade-btn inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/40 bg-gradient-to-br from-amber-500/25 via-violet-500/20 to-sky-500/20 text-amber-100 shadow-[0_0_14px_rgba(251,191,36,0.15)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50" data-action="pro-upgrade" aria-label="Upgrade to Pro">
              <i class="fa-solid fa-crown text-[0.78rem]" aria-hidden="true"></i>
            </button>
            <span class="sx-dash-tip">Upgrade Pro</span>
          </span>
          <span class="sx-dash-tip-wrap inline-flex">
            <button type="button" data-action="ai-chat" class="sx-dash-ai-chat-btn inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-sky-400/35 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 px-2 text-sky-100 shadow-[0_0_14px_rgba(56,189,248,0.18)] transition hover:border-sky-300/50 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/55" aria-label="Open AI assistant">
              <i class="fa-solid fa-wand-magic-sparkles text-[0.72rem] shrink-0" aria-hidden="true"></i>
              <span class="text-[10px] font-bold leading-none">AI</span>
            </button>
            <span class="sx-dash-tip">AI Assistant</span>
          </span>
          <span class="sx-dash-tip-wrap inline-flex">
            <button type="button" data-action="dash-fullscreen" class="sx-dash-fullscreen-btn relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-zinc-500 transition hover:border-white/20 hover:bg-white/[0.09] hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45" aria-label="Enter fullscreen">
              <i class="fa-solid fa-expand sx-dash-fs-icon-expand pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.78rem]" aria-hidden="true"></i>
              <i class="fa-solid fa-compress sx-dash-fs-icon-compress pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.78rem]" aria-hidden="true"></i>
            </button>
            <span class="sx-dash-tip">Fullscreen</span>
          </span>
          <span class="sx-dash-tip-wrap inline-flex">
            <button type="button" class="sx-dash-theme-icon-btn relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-zinc-500 transition hover:border-white/20 hover:bg-white/[0.09] hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/45" aria-label="Switch to light theme">
              <i class="fa-solid fa-sun sx-dash-theme-icon--when-dark pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.88rem]" aria-hidden="true"></i>
              <i class="fa-solid fa-moon sx-dash-theme-icon--when-light pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.82rem]" aria-hidden="true"></i>
            </button>
            <span class="sx-dash-tip">Change theme</span>
          </span>
        </div>
      </div>
      <span class="max-w-[6.5rem] shrink-0 truncate font-mono text-[10px] text-zinc-500 sm:max-w-[7rem]" data-sx-ml-pill-mobile title="ML API">ML …</span>
      <div class="flex shrink-0 flex-wrap items-center justify-end gap-3">
        <span class="sx-dash-tip-wrap relative inline-flex h-9 shrink-0">
          <div class="sx-dash-locale-dd relative h-9 shrink-0" data-sx-locale-dropdown>
            <button
              type="button"
              class="sx-dash-locale-trigger inline-flex h-9 min-w-[3rem] shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] py-0 pl-1.5 pr-1.5 text-left text-[10px] font-bold text-zinc-400 outline-none transition hover:border-white/20 hover:bg-white/[0.09] hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-sky-400/45"
              aria-expanded="false"
              aria-haspopup="listbox"
              aria-label="Language"
            >
              <span class="sx-dash-locale-trigger__code">EN</span>
              <i class="fa-solid fa-chevron-down sx-dash-locale-trigger__chev text-[0.5rem] text-zinc-500" aria-hidden="true"></i>
            </button>
            <div class="sx-dash-locale-panel hidden" role="listbox" aria-label="Choose language"></div>
          </div>
          <span class="sx-dash-tip">Translate</span>
        </span>
        <span class="sx-dash-tip-wrap inline-flex">
          <button type="button" data-nav="logout" class="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[9px] font-semibold leading-tight text-zinc-300 transition hover:border-rose-400/40 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/35">Sign out</button>
          <span class="sx-dash-tip">Sign out</span>
        </span>
      </div>
    </div>

    <div class="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <input type="checkbox" id="sx-nav-drawer" class="peer sr-only" />
      <label
        for="sx-nav-drawer"
        class="pointer-events-none fixed inset-0 z-40 bg-black/50 opacity-0 transition-opacity duration-300 peer-checked:pointer-events-auto peer-checked:opacity-100 lg:hidden"
        style="top: 2.5rem"
        aria-hidden="true"
      ></label>

      <aside
        class="sx-dash-sidebar sx-dash__glass-aside fixed bottom-0 left-0 top-10 z-50 flex w-64 -translate-x-full flex-col border-r p-5 transition-transform duration-300 ease-out peer-checked:translate-x-0 lg:top-0 lg:translate-x-0"
        aria-label="Sidebar"
      >
        <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-2">
          <div class="sx-dash__brand-mark shrink-0 px-1">
            <div class="sx-dash__brand-ico" aria-hidden="true"></div>
            <span class="sx-dash__brand">Suplexity</span>
          </div>

          <div class="shrink-0 rounded-2xl border border-white/[0.1] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div class="flex items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-zinc-800/90 text-zinc-300 ring-1 ring-white/5" aria-hidden="true">
                <i class="fa-solid fa-user text-[1.05rem]" aria-hidden="true"></i>
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-bold text-zinc-100" id="sx-dash-display-name">${escapeHtml(readDisplayName())}</p>
                <div class="mt-1 flex flex-wrap items-center gap-1.5">
                  <span id="sx-dash-plan-badge" class="inline-flex items-center rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Free user</span>
                </div>
                <p class="mt-2 truncate font-mono text-[9px] text-zinc-500" id="sx-ml-pill" title="ML API">ML …</p>
              </div>
            </div>
          </div>

          <nav class="min-h-0 flex-1 space-y-2 pb-2" aria-label="Main">
            <button
              type="button"
              data-action="dashboard"
              class="flex w-full items-center gap-3 rounded-xl border border-blue-400/35 bg-blue-500/[0.12] px-4 py-3 text-left text-sm font-semibold text-blue-100 shadow-[0_0_24px_rgba(59,130,246,0.12)] transition hover:border-blue-300/50 hover:bg-blue-500/[0.18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
            >
              <i class="fa-solid fa-chart-line w-5 shrink-0 text-center text-[0.95rem] opacity-95" aria-hidden="true"></i>
              Testing
            </button>
            <span
              class="flex cursor-not-allowed items-center justify-between gap-2 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm font-medium text-zinc-600"
              title="Coming soon"
              role="presentation"
            >
              <span class="flex min-w-0 items-center gap-3">
                <i class="fa-solid fa-video w-5 shrink-0 text-center text-[0.9rem] text-zinc-600" aria-hidden="true"></i>
                Live
              </span>
              <span class="shrink-0 rounded-full bg-zinc-800/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-400">Beta</span>
            </span>
            <button
              type="button"
              data-action="strategy"
              class="flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left text-sm font-medium text-zinc-200 transition hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
            >
              <i class="fa-solid fa-compass w-5 shrink-0 text-center text-[0.95rem]" aria-hidden="true"></i>
              Strategy
            </button>
            <button
              type="button"
              data-nav="markets"
              class="flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left text-sm font-medium text-zinc-200 transition hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
            >
              <i class="fa-solid fa-chart-column w-5 shrink-0 text-center text-[0.95rem]" aria-hidden="true"></i>
              Markets
            </button>
          </nav>
        </div>
        <div class="sx-dash-sidebar-foot mt-auto shrink-0 space-y-2 border-t border-white/[0.08] pt-4">
          <span class="sx-dash-tip-wrap block w-full">
            <button
              type="button"
              data-action="profile"
              class="flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left text-sm font-medium text-zinc-200 transition hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
            >
              <i class="fa-solid fa-id-card w-5 shrink-0 text-center text-[0.95rem]" aria-hidden="true"></i>
              Profile
            </button>
            <span class="sx-dash-tip">Profile</span>
          </span>
          <span class="sx-dash-tip-wrap block w-full">
            <button
              type="button"
              data-action="settings"
              class="flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left text-sm font-medium text-zinc-200 transition hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
            >
              <i class="fa-solid fa-gear w-5 shrink-0 text-center text-[0.95rem]" aria-hidden="true"></i>
              Settings
            </button>
            <span class="sx-dash-tip">Settings</span>
          </span>
        </div>
        <p class="shrink-0 border-t border-white/[0.06] px-1 pt-3 text-center text-[10px] text-zinc-600">Suplexity · v0.1.0-dev</p>
      </aside>

      <main class="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:ml-64 lg:max-w-[1440px] lg:pl-3 lg:pr-10 lg:pb-10" id="sx-welcome">
        <div class="sx-dash__panel min-h-0 space-y-10 p-5 sm:p-8 lg:space-y-12 lg:p-10">
        <header class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 class="sx-dash-welcome-title mb-2 text-3xl font-bold tracking-tight text-white sm:text-4xl" style="text-shadow: 0 0 32px rgba(167, 139, 250, 0.15)">Backtest Command</h1>
            <p class="sx-dash-welcome-sub max-w-xl text-slate-300/90">Welcome back. Your engine is optimized and ready for simulation.</p>
          </div>
          <button
            type="button"
            data-action="backtest"
            class="sx-dash-cta-session inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-200 via-fuchsia-100 to-cyan-200 px-7 py-3.5 text-sm font-bold tracking-tight text-zinc-950 shadow-[0_10px_40px_rgba(167,139,250,0.4)] transition hover:-translate-y-0.5 hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0612] active:translate-y-0 active:brightness-100"
          >
            <span class="text-lg font-light leading-none">+</span> New Session <span aria-hidden="true">→</span>
          </button>
        </header>

        <section class="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
          <button
            type="button"
            data-action="backtest"
            class="group relative flex w-full min-h-0 items-stretch justify-between gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-700 px-4 py-3.5 text-left text-white shadow-lg shadow-fuchsia-900/25 transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:px-5 sm:py-4"
          >
            <div class="min-w-0 flex-1">
              <p class="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-white/60">Backtesting</p>
              <h3 class="text-base font-bold leading-snug tracking-tight sm:text-lg">Backtesting Session</h3>
              <p class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/80 sm:text-xs">Start a free-roam simulation</p>
            </div>
            <span class="flex shrink-0 items-center self-center text-lg font-light text-white/70 transition group-hover:translate-x-0.5 group-hover:text-white" aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            data-action="prop"
            class="group relative flex w-full min-h-0 items-stretch justify-between gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-700 px-4 py-3.5 text-left text-white shadow-lg shadow-fuchsia-900/25 transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:px-5 sm:py-4"
          >
            <div class="min-w-0 flex-1">
              <p class="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-white/60">Prop firm</p>
              <h3 class="text-base font-bold leading-snug tracking-tight sm:text-lg">Prop Firm Challenge</h3>
              <p class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/80 sm:text-xs">Test under strict funding rules</p>
            </div>
            <span class="flex shrink-0 items-center self-center text-lg font-light text-white/70 transition group-hover:translate-x-0.5 group-hover:text-white" aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            data-action="tutorials"
            class="group relative flex w-full min-h-0 items-stretch justify-between gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-700 px-4 py-3.5 text-left text-white shadow-lg shadow-fuchsia-900/25 transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:px-5 sm:py-4"
          >
            <div class="min-w-0 flex-1">
              <p class="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-white/60">Learning</p>
              <h3 class="text-base font-bold leading-snug tracking-tight sm:text-lg">Guides & tutorials</h3>
              <p class="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/80 sm:text-xs">Master market mechanics</p>
            </div>
            <span class="flex shrink-0 items-center self-center text-lg font-light text-white/70 transition group-hover:translate-x-0.5 group-hover:text-white" aria-hidden="true">→</span>
          </button>
        </section>

        <section class="grid grid-cols-12 gap-6">
          <div class="sx-dash-card-surface relative col-span-12 overflow-hidden rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-10 lg:col-span-8">
            <div class="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-center sm:justify-between">
              <h3 class="text-xl font-bold">System Performance</h3>
              <div class="flex gap-2">
                <span class="rounded-lg bg-white/5 px-3 py-1 text-[10px] font-bold text-zinc-400">LAST 30 DAYS</span>
              </div>
            </div>
            <div class="flex h-64 items-end gap-2 rounded-xl border-b border-white/5 bg-gradient-to-t from-blue-500/5 to-transparent p-4">
              <div class="flex-1 rounded-t-sm border-t border-blue-500/40 bg-blue-600/20" style="height: 40%"></div>
              <div class="flex-1 rounded-t-sm border-t border-blue-500/40 bg-blue-600/20" style="height: 70%"></div>
              <div class="flex-1 rounded-t-sm border-t border-blue-500/40 bg-blue-600/20" style="height: 45%"></div>
              <div class="flex-1 rounded-t-sm border-t border-blue-500/40 bg-blue-600/20" style="height: 90%"></div>
              <div class="flex-1 rounded-t-sm border-t border-blue-500/40 bg-blue-600/20" style="height: 65%"></div>
              <div class="flex-1 rounded-t-sm border-t border-blue-500/40 bg-blue-600/20" style="height: 80%"></div>
              <div class="flex-1 rounded-t-sm border-t border-blue-500/40 bg-blue-600/20" style="height: 50%"></div>
              <div class="flex-1 rounded-t-sm border-t border-blue-500/40 bg-blue-600/20" style="height: 85%"></div>
            </div>
          </div>

          <div class="col-span-12 flex flex-col gap-6 lg:col-span-4">
            <div class="rounded-[2.5rem] bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-700 p-8 text-white shadow-2xl shadow-fuchsia-900/30">
              <p class="mb-2 text-[10px] font-bold uppercase tracking-widest opacity-60">Simulation Time</p>
              <h4 class="mb-1 text-4xl font-bold">12.4 <span class="text-xl opacity-60">hrs</span></h4>
              <p class="text-xs opacity-80">+2.1 hrs from last week</p>
            </div>
            <div class="sx-dash-card-surface rounded-[2.5rem] border border-white/[0.1] bg-[#0c0c0e] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p class="mb-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Quick Stats</p>
              <div class="space-y-4">
                <div class="flex justify-between border-b border-white/5 pb-2">
                  <span class="text-sm text-zinc-400">Win Rate</span>
                  <span class="text-sm font-bold text-green-400">64%</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-zinc-400">Profit Factor</span>
                  <span class="text-sm font-bold text-white">1.82</span>
                </div>
              </div>
            </div>
          </div>

          <div class="col-span-12">
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

          <div class="col-span-12">
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
                class="sx-dash-recent-sessions__banner flex flex-col gap-3 rounded-xl border border-sky-400/25 bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-violet-500/10 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                data-sx-sessions-banner
                role="status"
              >
                <p class="text-sm leading-snug text-slate-700 dark:text-sky-100/95">
                  Sessions on the Beginner plan are hidden after 1 week.
                  <span class="text-slate-600 dark:text-zinc-300">Upgrade to Pro to unlock all your past sessions.</span>
                </p>
                <button
                  type="button"
                  data-action="pro-upgrade"
                  class="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-sky-500/35 bg-white px-4 py-2 text-xs font-bold text-sky-800 shadow-sm transition hover:bg-sky-50 dark:border-sky-400/40 dark:bg-white/[0.12] dark:text-white dark:hover:bg-white/[0.18] sm:self-center"
                >
                  <i class="fa-solid fa-bolt text-amber-500 dark:text-amber-300" aria-hidden="true"></i>
                  Upgrade
                </button>
              </div>
            </section>
          </div>
        </section>
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
  <div id="view-strategy" hidden class="hidden fixed inset-0 z-[150] flex min-h-0 w-full flex-col overflow-hidden bg-[#0a0612]"></div>
  <div id="view-settings" hidden class="hidden fixed inset-0 z-[150] flex min-h-0 w-full flex-col overflow-hidden bg-[#0a0612]"></div>
  <div id="view-profile" hidden class="hidden fixed inset-0 z-[150] flex min-h-0 w-full flex-col overflow-hidden bg-[#0a0612]"></div>
  <div id="view-stocks" class="hidden min-h-0 min-w-0 flex-1"></div>
</div>
`,
  )

  const appRoot = root.querySelector('#sx-app-root') as HTMLElement | null
  const viewDash = root.querySelector('#view-dash') as HTMLElement
  const viewChart = root.querySelector('#view-chart') as HTMLElement
  const viewStrategy = root.querySelector('#view-strategy') as HTMLElement
  const viewSettings = root.querySelector('#view-settings') as HTMLElement
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
  let disposeProfile: (() => void) | null = null
  let activeSessionId: string | null = null
  let lastSessionPayload: SessionCreatedPayload | null = null

  function syncSidebarProfile() {
    const nameEl = root.querySelector('#sx-dash-display-name')
    if (nameEl) nameEl.textContent = readDisplayName()
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
    if (viewStrategy) {
      viewStrategy.hidden = true
      viewStrategy.classList.add('hidden')
    }
    if (viewSettings) {
      viewSettings.hidden = true
      viewSettings.classList.add('hidden')
    }
    if (viewProfile) {
      viewProfile.hidden = true
      viewProfile.classList.add('hidden')
    }
    if (viewStocks) viewStocks.classList.add('hidden')
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
    disposeProfile?.()
    disposeProfile = null
    viewStrategy?.replaceChildren()
    viewSettings?.replaceChildren()
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
    if (!viewSettings) return
    disposeChart?.()
    disposeChart = null
    disposeStocks?.()
    disposeStocks = null
    disposeStrategy?.()
    disposeStrategy = null
    disposeProfile?.()
    disposeProfile = null
    viewStocks?.replaceChildren()
    viewChart?.replaceChildren()
    viewStrategy?.replaceChildren()
    viewProfile?.replaceChildren()
    hideOverlayViews()
    if (viewDash) viewDash.hidden = true
    if (viewSettings) {
      viewSettings.hidden = false
      viewSettings.classList.remove('hidden')
    }
    closeDrawer()
    if (appRoot) setAiChatOpen(appRoot, false)
    disposeSettings?.()
    disposeSettings = mountSettingsPage(viewSettings, {
      onBack: showDashboard,
      readTheme: readDashTheme,
      writeTheme: (mode) => {
        writeDashTheme(mode)
        if (appRoot) applyDashTheme(appRoot, mode)
      },
      readLocale: readDashLocale,
      writeLocale: (code) => {
        writeDashLocale(code)
        syncDashLocaleUi(code)
      },
      localeOptions: DASH_LOCALES,
    })
  }

  function showProfilePage() {
    if (!viewProfile) return
    disposeChart?.()
    disposeChart = null
    disposeStocks?.()
    disposeStocks = null
    disposeStrategy?.()
    disposeStrategy = null
    disposeSettings?.()
    disposeSettings = null
    viewStocks?.replaceChildren()
    viewChart?.replaceChildren()
    viewStrategy?.replaceChildren()
    viewSettings?.replaceChildren()
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
      onProUpgrade: () => {
        window.alert(
          'Pro features coming soon.\n\nAdvanced metrics, unlimited sessions, AI strategy builder, and more.',
        )
      },
      onDisplayNameChange: () => syncSidebarProfile(),
      readTier: readAccountTier,
      getSessionStats: getProfileSessionStats,
      getAuthEmail: () => getAuthUser()?.email ?? null,
    })
  }

  function showStrategyPage() {
    if (!viewStrategy) return
    disposeChart?.()
    disposeChart = null
    disposeStocks?.()
    disposeStocks = null
    disposeSettings?.()
    disposeSettings = null
    disposeProfile?.()
    disposeProfile = null
    viewStocks?.replaceChildren()
    viewChart?.replaceChildren()
    viewSettings?.replaceChildren()
    viewProfile?.replaceChildren()
    hideOverlayViews()
    if (viewDash) viewDash.hidden = true
    if (viewStrategy) {
      viewStrategy.hidden = false
      viewStrategy.classList.remove('hidden')
    }
    closeDrawer()
    if (appRoot) setAiChatOpen(appRoot, false)
    disposeStrategy?.()
    disposeStrategy = mountStrategyPage(viewStrategy, {
      onBack: showDashboard,
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
    disposeStrategy?.()
    disposeStrategy = null
    disposeSettings?.()
    disposeSettings = null
    disposeProfile?.()
    disposeProfile = null
    viewStocks?.replaceChildren()
    viewChart?.replaceChildren()
    viewStrategy?.replaceChildren()
    viewSettings?.replaceChildren()
    viewProfile?.replaceChildren()
    hideOverlayViews()
    showDashboardView()
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
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-500">Create one with <strong class="text-zinc-700 dark:text-zinc-300">New Session</strong> above.</p>
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
  }

  function showMarkets() {
    disposeChart?.()
    disposeChart = null
    disposeStrategy?.()
    disposeStrategy = null
    viewStrategy?.replaceChildren()
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
    const badge = root.querySelector('#sx-dash-plan-badge')
    if (badge) {
      if (tier === 'pro') {
        badge.textContent = 'Pro user'
        badge.className =
          'inline-flex items-center rounded-md border border-violet-400/35 bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-200'
      } else {
        badge.textContent = 'Free user'
        badge.className =
          'inline-flex items-center rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400'
      }
    }
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

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null
    if (!t) return

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
    el.addEventListener('click', () => showDashboard())
  })

  const searchSessions = root.querySelector<HTMLInputElement>('#sx-dash-sessions-search')
  searchSessions?.addEventListener('input', () => {
    syncRecentSessionsUi()
  })

  const sessionModal = createSessionModal({
    onSessionCreate(payload) {
      openChartWithPayload(payload)
    },
    onSessionUpdate(id, payload) {
      updateSession(id, payload)
      syncRecentSessionsUi()
    },
  })

  root.querySelectorAll('[data-action="backtest"]').forEach((el) => {
    el.addEventListener('click', () => {
      sessionModal.open({ sessionType: 'backtest' })
    })
  })

  root.querySelectorAll('[data-action="prop"]').forEach((el) => {
    el.addEventListener('click', () => {
      sessionModal.open({ sessionType: 'prop' })
    })
  })

  root.querySelectorAll('[data-action="tutorials"]').forEach((el) => {
    el.addEventListener('click', () => {
      window.alert('Learning — link your content when ready.')
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

  root.querySelectorAll('[data-action="pro-upgrade"]').forEach((el) => {
    el.addEventListener('click', () => {
      window.alert(
        'Pro features coming soon.\n\nAdvanced metrics, unlimited sessions, AI strategy builder, and more.',
      )
    })
  })
}
