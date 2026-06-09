import './traderLocal.css'
import './dashboardTheme.css'
import { CHART_PAGE_PATH, HOME_PAGE_PATH, LOGIN_PAGE_PATH, normalizeAppPath } from '../appPaths'
import { clearLoginSession } from '../login/mountLoginGate'
import { fetchMlHealth } from '../ml/mlApi'
import { createSessionModal } from '../sessionModal'
import type { SessionCreatedPayload } from '../sessionTypes'
import { mountStockApp } from '../stocks/mountStockApp'
import { mountChartWorkspace } from '../views/chartWorkspace'

const LS_DRAFT = 'suplexity-last-session-draft'
const LS_LOCALE = 'suplexity-dash-locale'
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
const DASH_LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'uk', name: 'Українська' },
  { code: 'ja', name: '日本語' },
] as const

function isDashLocaleCode(v: string): boolean {
  return DASH_LOCALES.some((l) => l.code === v)
}

function dashLocaleMenuLabel(code: string, name: string): string {
  return `${name} (${code.toUpperCase()})`
}

function buildDashLocalePanelHtml(): string {
  return DASH_LOCALES.map((l) => {
    const label = dashLocaleMenuLabel(l.code, l.name)
    return `<button type="button" role="option" class="sx-dash-locale-option" data-locale-option="${l.code}">${label}</button>`
  }).join('')
}

/** Map hours value v ∈ [0, yMax] to SVG y (downward); v=0 → bottom y1, v=yMax → top y0. */
function hoursToY(v: number, y0: number, y1: number, yMax: number): number {
  if (yMax <= 0) return y1
  const t = Math.min(1, Math.max(0, v / yMax))
  return y1 - t * (y1 - y0)
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

function daysInCurrentMonth(): number {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

const DEMO_DAILY_HOURS = [
  0.02, 0.006, 0.016, 0, 0.1, 0.03, 0.02, 0.2, 0.055, 0.004, 0.09, 0.024, 0.16, 0.042, 0.085,
]

const DEMO_MONTHLY_HOURS = [3.2, 2.1, 4.5, 3.8, 5.2, 4.0, 3.5, 4.8, 6.1, 5.5, 4.2, 5.0]

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Upper bound for the Y scale with headroom; tick-friendly step. */
function niceHoursCeiling(maxHours: number): number {
  if (!Number.isFinite(maxHours) || maxHours <= 0) return 0.25
  const padded = maxHours * 1.12
  const pow = 10 ** Math.floor(Math.log10(padded))
  const n = padded / pow
  let nice: number
  if (n <= 1) nice = 1
  else if (n <= 2) nice = 2
  else if (n <= 2.5) nice = 2.5
  else if (n <= 5) nice = 5
  else nice = 10
  return nice * pow
}

/** Stable hour tick values from 0..yMax (avoids float drift from repeated subtraction). */
function hourAxisTicks(yMax: number, count: number): number[] {
  if (yMax <= 0) return [0]
  const n = Math.max(1, count)
  return Array.from({ length: n + 1 }, (_, i) => (i / n) * yMax)
}

function formatHoursTickLabel(v: number, isMaxTick: boolean): string {
  const a = Math.abs(v)
  if (a < 1e-6) return '0'
  const rounded = Math.round(v * 1000) / 1000
  let s = rounded.toFixed(3)
  s = s.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
  return isMaxTick ? `${s} hrs` : s
}

/** Demo series + x labels for the Performance “Time invested” bar chart (SVG). */
function buildTimeInvestedChartSvg(view: TimeChartView): string {
  const yLabelX = 38
  const x0 = 48
  const y0 = 14
  const y1 = 80
  const xLabelY = 102
  const tickCount = 5

  let vals: number[]
  let xLabels: string[]
  let minSlot: number

  if (view === 'monthly') {
    vals = [...DEMO_MONTHLY_HOURS]
    xLabels = MONTH_SHORT
    minSlot = 26
  } else {
    const nDays = daysInCurrentMonth()
    vals = Array.from({ length: nDays }, (_, i) => {
      const base = DEMO_DAILY_HOURS[i % DEMO_DAILY_HOURS.length] ?? 0
      const wave = 0.04 * Math.sin((i / Math.max(1, nDays - 1)) * Math.PI * 2)
      return Math.max(0, Math.round((base + wave) * 1000) / 1000)
    })
    xLabels = Array.from({ length: nDays }, (_, i) => String(i + 1).padStart(2, '0'))
    minSlot = 13
  }

  const n = vals.length
  const plotInnerW = Math.max(320, minSlot * n)
  const x1 = x0 + plotInnerW
  const slot = plotInnerW / n
  const dataMax = vals.reduce((m, v) => Math.max(m, v), 0)
  const yMax = niceHoursCeiling(dataMax)

  const lines: string[] = []
  const yTicks: string[] = []
  for (const v of hourAxisTicks(yMax, tickCount)) {
    const y = hoursToY(v, y0, y1, yMax)
    lines.push(`<line x1="${x0}" y1="${y.toFixed(2)}" x2="${x1}" y2="${y.toFixed(2)}" />`)
    const isTop = v >= yMax - 1e-9
    const lbl = formatHoursTickLabel(v, isTop)
    yTicks.push(
      `<text x="${yLabelX}" y="${y.toFixed(2)}" text-anchor="end" dominant-baseline="middle" fill="var(--sx-tc-ytext)" font-size="10" font-weight="600" font-family="inherit">${lbl}</text>`,
    )
  }

  const gradId = view === 'monthly' ? 'sx-dash-ti-bar-fill-m' : 'sx-dash-ti-bar-fill-d'
  const rects: string[] = []
  const labels: string[] = []
  const maxBw = view === 'monthly' ? 16 : 11
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * slot
    const bw = Math.min(maxBw, slot * 0.58)
    const v = vals[i] ?? 0
    const hRaw = yMax > 0 ? (v / yMax) * (y1 - y0) : 0
    const h = v > 0 ? Math.max(hRaw, 2.25) : 0
    const y = y1 - h
    if (h > 0) {
      rects.push(
        `<rect x="${(cx - bw / 2).toFixed(2)}" y="${y.toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(2)}" rx="3" fill="url(#${gradId})" />`,
      )
    }
    const rot = view === 'monthly' ? -35 : -40
    const xl = xLabels[i] ?? ''
    labels.push(
      `<text x="${cx.toFixed(2)}" y="${xLabelY}" text-anchor="middle" transform="rotate(${rot} ${cx.toFixed(2)} ${xLabelY})" fill="var(--sx-tc-xtext)" font-size="10" font-weight="600" font-family="inherit">${xl}</text>`,
    )
  }

  const vbW = Math.ceil(x1 + 12)
  const vbH = 118
  return `<svg class="sx-dash-time-chart__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}" preserveAspectRatio="xMinYMin meet" aria-hidden="true" data-time-chart-svg="${view}">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="40%" stop-color="#facc15" />
      <stop offset="100%" stop-color="#ca8a04" />
    </linearGradient>
  </defs>
  <g stroke="var(--sx-tc-grid)" fill="none" stroke-dasharray="4 6" stroke-width="1" opacity="0.95">${lines.join('')}</g>
  <line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="var(--sx-tc-baseline)" stroke-width="1.35" />
  <g>${rects.join('')}</g>
  <g>${yTicks.join('')}</g>
  <g>${labels.join('')}</g>
</svg>`
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

function readSessionDraft(): SessionCreatedPayload | null {
  try {
    const raw = localStorage.getItem(LS_DRAFT)
    if (!raw) return null
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object') return null
    const p = o as Partial<SessionCreatedPayload>
    if (typeof p.name !== 'string' || typeof p.balance !== 'string' || typeof p.assets !== 'string') return null
    if (p.sessionType !== 'backtest' && p.sessionType !== 'prop') return null
    return p as SessionCreatedPayload
  } catch {
    return null
  }
}

/** Demo date span for the recent-session card (until real session metadata exists). */
function sessionDateRangeLabel(): string {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 7)
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' })
  return `${fmt(start)} – ${fmt(end)}`
}

const RECENT_SESSIONS_TOTAL = 2

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
  try {
    localStorage.setItem(LS_DRAFT, JSON.stringify(p))
  } catch {
    /* noop */
  }
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
                <p class="truncate text-sm font-bold text-zinc-100">Alpha_Trader</p>
                <div class="mt-1 flex flex-wrap items-center gap-1.5">
                  <span id="sx-dash-plan-badge" class="inline-flex items-center rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Free user</span>
                </div>
                <p class="mt-2 truncate font-mono text-[9px] text-zinc-500" id="sx-ml-pill" title="ML API">ML …</p>
              </div>
            </div>
          </div>

          <nav class="min-h-0 flex-1 space-y-2 pb-2" aria-label="Main">
            <span class="flex items-center gap-3 rounded-xl border border-blue-400/35 bg-blue-500/[0.12] px-4 py-3 text-sm font-semibold text-blue-100 shadow-[0_0_24px_rgba(59,130,246,0.12)]">
              <i class="fa-solid fa-chart-line w-5 shrink-0 text-center text-[0.95rem] opacity-95" aria-hidden="true"></i>
              Testing
            </span>
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
                    <button type="button" class="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300" title="Total time you have actively used the simulator in this mode." aria-label="About Time invested">
                      <i class="fa-regular fa-circle-question text-sm" aria-hidden="true"></i>
                    </button>
                    <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-amber-400">
                      <i class="fa-solid fa-chart-column text-[0.95rem]" aria-hidden="true"></i>
                    </div>
                    <p class="text-xs font-medium text-zinc-400">Time invested</p>
                    <p class="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">32 min</p>
                  </div>
                  <div class="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-sm">
                    <button type="button" class="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300" title="Wall-clock span of historical bars you have replayed." aria-label="About Historical time replayed">
                      <i class="fa-regular fa-circle-question text-sm" aria-hidden="true"></i>
                    </button>
                    <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-sky-400">
                      <i class="fa-solid fa-clock text-[0.95rem]" aria-hidden="true"></i>
                    </div>
                    <p class="text-xs font-medium text-zinc-400">Historical time replayed</p>
                    <p class="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">21 hr 6 min</p>
                  </div>
                  <div class="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-sm sm:col-span-2 lg:col-span-1">
                    <button type="button" class="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300" title="Count of completed trades in this period." aria-label="About Trades taken">
                      <i class="fa-regular fa-circle-question text-sm" aria-hidden="true"></i>
                    </button>
                    <p class="text-xs font-medium text-zinc-400">Trades taken</p>
                    <p class="mt-3 text-sm leading-relaxed text-zinc-500">Your trades taken will show up here</p>
                  </div>
                  <div class="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-sm sm:col-span-2 lg:col-span-1">
                    <button type="button" class="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300" title="Share of winning trades over closed trades." aria-label="About Overall win rate">
                      <i class="fa-regular fa-circle-question text-sm" aria-hidden="true"></i>
                    </button>
                    <div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-violet-400">
                      <i class="fa-solid fa-award text-[0.95rem]" aria-hidden="true"></i>
                    </div>
                    <p class="text-xs font-medium text-zinc-400">Overall win rate</p>
                    <p class="mt-1 text-2xl font-bold tracking-tight text-zinc-500 dark:text-zinc-600 sm:text-3xl">—</p>
                  </div>
                </div>

                <div class="relative flex min-h-[220px] flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-sm sm:min-h-[260px] lg:col-span-6 lg:min-h-0">
                  <button type="button" class="absolute right-3 top-3 z-[1] text-zinc-500 hover:text-zinc-300" title="Time invested per calendar period." aria-label="About Time invested chart">
                    <i class="fa-regular fa-circle-question text-sm" aria-hidden="true"></i>
                  </button>
                  <div class="mb-3 flex flex-col gap-3 pr-8 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
                    <p class="text-sm font-semibold text-slate-900 dark:text-white">Time invested</p>
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
                      aria-label="Time invested (sample data, hours)"
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
                  <button
                    type="button"
                    data-action="sessions-filter"
                    class="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 dark:border-white/12 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1]"
                    title="Filter sessions"
                    aria-label="Filter sessions"
                  >
                    <i class="fa-solid fa-filter text-[0.85rem]" aria-hidden="true"></i>
                  </button>
                  <button
                    type="button"
                    data-action="sessions-sort"
                    class="inline-flex h-10 min-w-[10.5rem] items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/12 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/[0.1]"
                    aria-label="Sort sessions"
                  >
                    <i class="fa-solid fa-arrows-up-down text-[0.75rem] text-zinc-500 dark:text-zinc-400" aria-hidden="true"></i>
                    <span class="truncate">Newest to oldest</span>
                    <i class="fa-solid fa-chevron-down text-[0.55rem] text-zinc-400" aria-hidden="true"></i>
                  </button>
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
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm">
      <p class="rounded-xl border border-white/10 bg-white/[0.05] p-3 leading-relaxed text-zinc-300">Ask about strategies, sessions, or how to use Suplexity. Full conversational AI is on the roadmap—this panel is ready to plug in when your backend is.</p>
    </div>
    <div class="border-t border-white/10 p-4">
      <label class="sr-only" for="sx-dash-ai-chat-input">Message to AI</label>
      <textarea id="sx-dash-ai-chat-input" rows="2" disabled class="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-400 placeholder:text-zinc-600" placeholder="Message AI (coming soon)…"></textarea>
    </div>
  </aside>

  <div id="view-chart" hidden class="fixed inset-0 z-[160] flex min-h-0 w-full flex-col bg-zinc-950"></div>
  <div id="view-stocks" class="hidden min-h-0 min-w-0 flex-1"></div>
</div>
`,
  )

  const appRoot = root.querySelector('#sx-app-root') as HTMLElement | null
  const viewDash = root.querySelector('#view-dash') as HTMLElement
  const viewChart = root.querySelector('#view-chart') as HTMLElement
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
  let lastSessionPayload: SessionCreatedPayload | null = null

  function openChartWithPayload(payload: SessionCreatedPayload) {
    lastSessionPayload = payload
    saveSessionDraft(payload)
    syncRecentSessionsUi()
    closeDrawer()
    if (appRoot) setAiChatOpen(appRoot, false)
    viewDash.hidden = true
    viewStocks.classList.add('hidden')
    viewChart.hidden = false
    const path = normalizeAppPath(window.location.pathname)
    if (path !== CHART_PAGE_PATH) {
      history.pushState({ sx: 'chart' }, '', CHART_PAGE_PATH)
    }
    disposeChart?.()
    disposeChart = mountChartWorkspace(viewChart, payload, {
      onExit: showDashboard,
      onSymbolChange: (symbol) => {
        if (!lastSessionPayload) return
        const s = symbol.trim().toUpperCase()
        if (!s) return
        openChartWithPayload({ ...lastSessionPayload, assets: s })
      },
    })
  }

  function showDashboard() {
    const path = normalizeAppPath(window.location.pathname)
    if (path === CHART_PAGE_PATH) {
      history.pushState({ sx: 'dash' }, '', HOME_PAGE_PATH)
    }
    if (appRoot) setAiChatOpen(appRoot, false)
    lastSessionPayload = null
    disposeChart?.()
    disposeChart = null
    disposeStocks?.()
    disposeStocks = null
    viewStocks.replaceChildren()
    viewChart.replaceChildren()
    viewChart.hidden = true
    viewStocks.classList.add('hidden')
    viewDash.hidden = false
    document.documentElement.removeAttribute('data-theme')
    closeDrawer()
    syncRecentSessionsUi()
  }

  function syncRecentSessionsUi() {
    const list = root.querySelector('#sx-dash-session-list')
    const countEl = root.querySelector('[data-sx-sessions-count]')
    const fillEl = root.querySelector<HTMLElement>('[data-sx-sessions-count-fill]')
    const barEl = root.querySelector('[data-sx-sessions-count-bar]')
    if (!list || !countEl || !fillEl) return

    const draft = readSessionDraft()
    const visible = draft ? 1 : 0
    const total = RECENT_SESSIONS_TOTAL
    countEl.textContent = `${visible} out of ${total} sessions`
    fillEl.style.width = `${(visible / total) * 100}%`
    if (barEl instanceof HTMLElement) {
      barEl.setAttribute('aria-valuenow', String(visible))
      barEl.setAttribute('aria-valuemax', String(total))
    }

    const range = sessionDateRangeLabel()
    const badge =
      draft?.sessionType === 'prop'
        ? '<span class="inline-flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-200"><i class="fa-solid fa-bolt text-[0.6rem]" aria-hidden="true"></i>Prop</span>'
        : '<span class="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-200"><i class="fa-solid fa-bolt text-[0.6rem]" aria-hidden="true"></i>7 days</span>'

    const actions = `
      <div class="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:flex-col sm:items-end lg:flex-row">
        <button type="button" data-action="session-delete" class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-rose-400 transition hover:border-rose-500/25 hover:bg-rose-500/10" title="Delete" aria-label="Delete session"><i class="fa-solid fa-trash-can text-[0.8rem]" aria-hidden="true"></i></button>
        <button type="button" data-action="session-edit" class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-zinc-200" title="Edit" aria-label="Edit session"><i class="fa-solid fa-pen text-[0.8rem]" aria-hidden="true"></i></button>
        <button type="button" data-action="session-stats" class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-zinc-200" title="Stats" aria-label="Session stats"><i class="fa-solid fa-chart-simple text-[0.8rem]" aria-hidden="true"></i></button>
        <button type="button" data-action="session-duplicate" class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-zinc-200" title="Duplicate" aria-label="Duplicate session"><i class="fa-regular fa-copy text-[0.8rem]" aria-hidden="true"></i></button>
        <button type="button" data-action="session-summary" class="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-white/12 dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/[0.1]">Summary</button>
        <button type="button" data-action="session-expand" class="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-zinc-500 transition hover:bg-white/[0.05]" title="Expand" aria-label="Expand details"><i class="fa-solid fa-chevron-down text-[0.75rem]" aria-hidden="true"></i></button>
      </div>`

    const primaryRow = draft
      ? `<li class="sx-dash-session-row rounded-2xl border border-white/[0.1] bg-white/[0.04] p-4 sm:p-5" data-session-name="${escapeHtml(`${draft.name} ${draft.assets} ${draft.balance}`)}">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <button type="button" data-action="resume-session" class="flex h-12 w-12 shrink-0 items-center justify-center self-start rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-900/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60" title="Resume session" aria-label="Resume session">
              <i class="fa-solid fa-play ml-0.5 text-sm" aria-hidden="true"></i>
            </button>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-base font-bold text-slate-900 dark:text-white">${escapeHtml(draft.name)}</span>
                ${badge}
              </div>
              <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span class="inline-flex items-center gap-1.5"><i class="fa-regular fa-calendar text-[0.75rem]" aria-hidden="true"></i>${range}</span>
                <span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-wallet text-[0.75rem]" aria-hidden="true"></i>${escapeHtml(draft.balance)}</span>
              </div>
              <span class="mt-2 inline-flex rounded-lg border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.08] dark:text-zinc-200">${escapeHtml(draft.assets)}</span>
              <div class="mt-4 max-w-md">
                <div class="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
                  <div class="h-full w-[72%] rounded-full bg-gradient-to-r from-teal-500 to-emerald-400"></div>
                </div>
                <p class="mt-1.5 text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Remaining days: 30</p>
              </div>
            </div>
            ${actions}
          </div>
        </li>`
      : `<li class="sx-dash-session-row sx-dash-session-row--empty rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center dark:border-white/10 dark:bg-white/[0.02]" data-session-name="empty new session">
          <p class="text-sm font-medium text-zinc-600 dark:text-zinc-400">No sessions yet</p>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-500">Create one with <strong class="text-zinc-700 dark:text-zinc-300">New Session</strong> above — your latest draft will appear here.</p>
        </li>`

    const lockedRow = `<li class="sx-dash-session-row sx-dash-session-row--locked relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5" data-session-name="archived momentum preview">
        <p class="sx-dash-session-row__lock-hint pointer-events-none absolute inset-x-0 top-3 z-[1] text-center text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-500">Preview · hidden on Beginner</p>
        <div class="sx-dash-session-row__lock-body pointer-events-none pt-5 opacity-60">
          <div class="flex flex-col gap-4 opacity-90 blur-[3px] lg:flex-row">
            <div class="h-12 w-12 shrink-0 rounded-full bg-zinc-400/40"></div>
            <div class="min-w-0 flex-1 space-y-2">
              <div class="h-4 w-32 rounded bg-zinc-500/40"></div>
              <div class="h-3 w-48 rounded bg-zinc-500/25"></div>
              <div class="h-5 w-20 rounded-lg bg-zinc-500/20"></div>
            </div>
          </div>
        </div>
      </li>`

    list.innerHTML = primaryRow + lockedRow
    const inp = root.querySelector<HTMLInputElement>('#sx-dash-sessions-search')
    if (inp?.value) inp.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function showMarkets() {
    disposeChart?.()
    disposeChart = null
    disposeStocks?.()
    closeDrawer()
    if (appRoot) setAiChatOpen(appRoot, false)
    viewDash.hidden = true
    viewChart.hidden = true
    viewChart.replaceChildren()
    viewStocks.classList.remove('hidden')
    disposeStocks = mountStockApp(viewStocks, {
      onBack: () => {
        disposeStocks?.()
        disposeStocks = null
        viewStocks.replaceChildren()
        showDashboard()
      },
    })
  }

  root.querySelectorAll<HTMLButtonElement>('[data-nav="markets"]').forEach((btn) => {
    btn.addEventListener('click', () => showMarkets())
  })

  root.querySelectorAll<HTMLButtonElement>('[data-nav="logout"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      clearLoginSession()
      window.location.assign(LOGIN_PAGE_PATH)
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
    root.querySelectorAll('[data-sx-perf-dd]').forEach((wrap) => {
      wrap.classList.remove('sx-dash-perf-dd--open')
      const panel = wrap.querySelector('.sx-dash-perf-panel')
      const trigger = wrap.querySelector<HTMLButtonElement>('.sx-dash-perf-trigger')
      panel?.classList.add('hidden')
      trigger?.setAttribute('aria-expanded', 'false')
    })
  }

  function syncTimeInvestedChart() {
    const view = readTimeChartView()
    const pan = root.querySelector('#sx-dash-time-chart-pan')
    if (pan) pan.innerHTML = buildTimeInvestedChartSvg(view)
    const roleImg = root.querySelector('[data-sx-time-chart]')
    if (roleImg) {
      const desc =
        view === 'daily'
          ? 'Time invested by day this month (sample data, hours)'
          : 'Time invested by month this year (sample data, hours)'
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

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null
    if (!t) return

    const resumeBtn = t.closest<HTMLButtonElement>('[data-action="resume-session"]')
    if (resumeBtn && root.contains(resumeBtn)) {
      const d = readSessionDraft()
      if (d) openChartWithPayload(d)
      return
    }
    const sessionAction = t.closest<HTMLButtonElement>('[data-action^="session-"]')
    if (sessionAction && root.contains(sessionAction)) {
      const act = sessionAction.getAttribute('data-action')
      if (act === 'session-delete') window.alert('Delete session — wire your API when ready.')
      else if (act === 'session-edit') window.alert('Edit session — coming soon.')
      else if (act === 'session-stats') window.alert('Session stats — coming soon.')
      else if (act === 'session-duplicate') window.alert('Duplicate session — coming soon.')
      else if (act === 'session-summary') window.alert('Session summary — coming soon.')
      else if (act === 'session-expand') window.alert('Session details — coming soon.')
      return
    }
    if (t.closest('[data-action="sessions-filter"]')) {
      window.alert('Session filters — coming soon.')
      return
    }
    if (t.closest('[data-action="sessions-sort"]')) {
      window.alert('Sort options — coming soon.')
      return
    }

    const timeChartTab = t.closest<HTMLButtonElement>('[data-time-chart-tab]')
    if (timeChartTab && root.contains(timeChartTab)) {
      const v = timeChartTab.getAttribute('data-time-chart-tab')
      if (v === 'daily' || v === 'monthly') {
        writeTimeChartView(v)
        syncTimeInvestedChart()
      }
      return
    }

    const perfModeOpt = t.closest<HTMLButtonElement>('[data-perf-mode-option]')
    if (perfModeOpt && root.contains(perfModeOpt)) {
      const v = perfModeOpt.getAttribute('data-perf-mode-option')
      if (v === 'backtest' || v === 'battles' || v === 'prop' || v === 'all') {
        writePerfMode(v)
        syncPerfUi()
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
    if (t.closest('[data-sx-perf-dd]')) return
    closeAllLocaleDropdowns()
    closeAllPerfDropdowns()
  })

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (!root.querySelector('.sx-dash-locale-dd--open') && !root.querySelector('.sx-dash-perf-dd--open')) return
    closeAllLocaleDropdowns()
    closeAllPerfDropdowns()
  })

  const initialLocale = readDashLocale()
  writeDashLocale(initialLocale)
  syncDashLocaleUi(initialLocale)

  syncPerfUi()
  syncTimeInvestedChart()
  syncRecentSessionsUi()

  function onPopState() {
    const path = normalizeAppPath(window.location.pathname)
    if (path === CHART_PAGE_PATH) {
      const d = readSessionDraft()
      if (!d) {
        history.replaceState(null, '', HOME_PAGE_PATH)
        showDashboard()
        return
      }
      if (!viewChart.hidden && disposeChart) return
      openChartWithPayload(d)
      return
    }
    if (path === HOME_PAGE_PATH) {
      showDashboard()
    }
  }

  window.addEventListener('popstate', onPopState)

  if (normalizeAppPath(window.location.pathname) === CHART_PAGE_PATH) {
    const d = readSessionDraft()
    if (d) openChartWithPayload(d)
    else history.replaceState(null, '', HOME_PAGE_PATH)
  }

  const searchSessions = root.querySelector<HTMLInputElement>('#sx-dash-sessions-search')
  searchSessions?.addEventListener('input', () => {
    const q = (searchSessions.value || '').trim().toLowerCase()
    root.querySelectorAll<HTMLLIElement>('.sx-dash-session-row').forEach((row) => {
      if (row.classList.contains('sx-dash-session-row--locked')) {
        row.classList.toggle('hidden', q.length > 0)
        return
      }
      const name = (row.getAttribute('data-session-name') || '').toLowerCase()
      row.classList.toggle('hidden', q.length > 0 && !name.includes(q))
    })
  })

  const sessionModal = createSessionModal({
    onSessionCreate(payload) {
      openChartWithPayload(payload)
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
      window.alert('Strategy workspace — coming soon.')
    })
  })

  root.querySelectorAll('[data-action="profile"]').forEach((el) => {
    el.addEventListener('click', () => {
      window.alert('Profile — coming soon.')
    })
  })

  root.querySelectorAll('[data-action="settings"]').forEach((el) => {
    el.addEventListener('click', () => {
      window.alert('Settings — coming soon.')
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
