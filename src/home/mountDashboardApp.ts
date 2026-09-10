import './traderLocal.css'
import './dashboardTheme.css'
import './surrealHero.css'
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
  type ChartConfiguration,
  type ChartType,
  type TooltipModel,
  type TooltipPositionerFunction,
} from 'chart.js'

declare module 'chart.js' {
  interface TooltipPositionerMap {
    barMiddle: TooltipPositionerFunction<ChartType>
  }
}

Chart.register(
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
)

// Custom tooltip positioner: anchors the tooltip caret to the horizontal
// midpoint of the hovered bar segment instead of Chart.js's default (the
// segment's end edge), so the tooltip points at the middle of each trade
// win/loss bar rather than its tip.
Tooltip.positioners.barMiddle = ((items, eventPosition) => {
  const el = items[0]?.element as unknown as { getProps?: (props: string[], final?: boolean) => Record<string, number> } | undefined
  if (!el?.getProps) return eventPosition
  const props = el.getProps(['x', 'y', 'base', 'height'], true)
  const halfHeight = Number.isFinite(props.height) ? props.height / 2 : 9
  return {
    x: (props.x + props.base) / 2,
    y: props.y + halfHeight + 6,
  }
}) as TooltipPositionerFunction<ChartType>

const DASH_KPI_INFO_ICON_SVG = `<img src="/icons/kpi-info.png" alt="" aria-hidden="true" />`

const sxEquityChartRegistry = new WeakMap<HTMLCanvasElement, Chart<'line'> & { $sxFullLabels?: string[] }>()

function sxNiceCeilStep(v: number): number {
  if (!(v > 0)) return 100
  const pow = 10 ** Math.floor(Math.log10(v))
  const n = v / pow
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return nice * pow
}

function sxEquityTooltipHandler(context: { chart: Chart; tooltip: TooltipModel<'line'> }) {
  const { chart, tooltip } = context
  const parent = chart.canvas.parentNode as HTMLElement | null
  if (!parent) return
  let tipEl = parent.querySelector<HTMLDivElement>('.sx-dash-equity-tip')
  if (!tipEl) {
    tipEl = document.createElement('div')
    tipEl.className = 'sx-dash-equity-tip'
    parent.appendChild(tipEl)
  }
  if (tooltip.opacity === 0) {
    tipEl.style.opacity = '0'
    return
  }
  if (tooltip.body) {
    const point = tooltip.dataPoints[0]
    const idx = point?.dataIndex ?? 0
    const fullLabels = (chart as Chart & { $sxFullLabels?: string[] }).$sxFullLabels
    const title = fullLabels?.[idx] ?? tooltip.title[0] ?? ''
    const raw = point?.raw
    const valueText = formatDashboardPerfMoney(typeof raw === 'number' ? raw : 0)
    tipEl.innerHTML = `<div class="sx-dash-equity-tip__title">${title}</div><div class="sx-dash-equity-tip__row"><span class="sx-dash-equity-tip__dot"></span><span>P&amp;L: ${valueText}</span></div>`
  }
  const { offsetLeft: posX, offsetTop: posY } = chart.canvas
  tipEl.style.opacity = '1'
  tipEl.style.left = `${posX + tooltip.caretX}px`
  tipEl.style.top = `${posY + tooltip.caretY}px`
}

function syncEquityCurveChart(canvas: HTMLCanvasElement, equity: ReturnType<typeof computeEquityCurveSeries>) {
  const rawCumulative = equity.hasData ? equity.cumulative : new Array(12).fill(0)
  // Don't plot (or flat-line) months that are still in the future relative to
  // "now" — the running total naturally stays flat past the last real data
  // point, which made the line render straight through Oct/Nov/Dec even
  // though no data exists yet for those months. Cut the series off after the
  // current month so the chart only shows months that have actually passed.
  const cumulative: (number | null)[] =
    equity.currentMonthIndex >= 0
      ? rawCumulative.map((v, i) => (i <= equity.currentMonthIndex ? v : null))
      : rawCumulative
  const plottedValues = cumulative.filter((v): v is number => v != null)
  const maxVal = Math.max(0, ...plottedValues, 1)
  const minVal = Math.min(0, ...plottedValues)
  const suggestedMax = sxNiceCeilStep(maxVal * 1.15)
  const suggestedMin = minVal < 0 ? -sxNiceCeilStep(-minVal * 1.15) : 0
  const pointRadius = cumulative.map(() => 4)
  const pointColors = cumulative.map(() => '#4caf50')

  let chart = sxEquityChartRegistry.get(canvas)
  if (!chart) {
    const parent = canvas.parentElement
    if (parent) parent.style.position = 'relative'
    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: equity.labels,
        datasets: [
          {
            data: cumulative,
            borderColor: '#4caf50',
            backgroundColor: '#4caf50',
            pointBackgroundColor: pointColors,
            pointBorderColor: '#4caf50',
            pointRadius,
            pointHoverRadius: 6,
            borderWidth: 2,
            tension: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false, external: sxEquityTooltipHandler },
        },
        scales: {
          y: {
            min: suggestedMin,
            suggestedMax,
            ticks: { stepSize: (suggestedMax - suggestedMin) / 4, color: '#475467' },
            grid: { color: '#eeeeee' },
            border: { display: false },
          },
          x: {
            grid: { display: false },
            ticks: { color: '#475467' },
            border: { display: false },
          },
        },
      },
    }
    chart = new Chart(canvas, config)
    sxEquityChartRegistry.set(canvas, chart)
  } else {
    chart.data.labels = equity.labels
    const dataset = chart.data.datasets[0]!
    dataset.data = cumulative
    const yScale = chart.options.scales?.y as { min?: number; suggestedMax?: number; ticks?: { stepSize?: number } }
    if (yScale) {
      yScale.min = suggestedMin
      yScale.suggestedMax = suggestedMax
      if (yScale.ticks) yScale.ticks.stepSize = (suggestedMax - suggestedMin) / 4
    }
  }
  ;(chart as Chart & { $sxFullLabels?: string[] }).$sxFullLabels = equity.monthLabels
  chart.update()
}

const sxActivityChartRegistry = new WeakMap<HTMLCanvasElement, Chart<'bar'>>()
const sxSymbolsChartRegistry = new WeakMap<HTMLCanvasElement, Chart<'bar'>>()
const sxWinRateChartRegistry = new WeakMap<HTMLCanvasElement, Chart<'bar'>>()

function sxFormatDurationHours(hoursValue: number): string {
  const totalMinutes = Math.round(Math.max(0, hoursValue) * 60)
  if (totalMinutes <= 0) return '0min'
  const hrs = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (hrs === 0) return `${mins}min`
  if (mins === 0) return `${hrs}hr`
  return `${hrs}hr ${mins}m`
}

const SX_NICE_HOUR_STEPS = [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500]

/** Picks a round hour increment (2hr, 4hr, 6hr, ...) targeting ~5 ticks. */
function sxNiceHourStep(max: number): number {
  const target = max / 5
  for (const step of SX_NICE_HOUR_STEPS) {
    if (step >= target) return step
  }
  return SX_NICE_HOUR_STEPS[SX_NICE_HOUR_STEPS.length - 1]!
}

function syncActivityBarChart(
  canvas: HTMLCanvasElement,
  points: { label: string; fullLabel?: string; practiceMs: number }[],
  floorHours = 4,
) {
  const labels = points.map((d) => d.label)
  const fullLabels = points.map((d) => d.fullLabel ?? d.label)
  const hours = points.map((d) => Math.round((d.practiceMs / 3_600_000) * 100) / 100)
  const maxVal = Math.max(0, ...hours, 1)
  const rawMax = Math.max(floorHours, sxNiceCeilStep(maxVal * 1.15))
  const stepSize = sxNiceHourStep(rawMax)
  const suggestedMax = Math.ceil(rawMax / stepSize) * stepSize

  let chart = sxActivityChartRegistry.get(canvas)
  if (!chart) {
    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            data: hours,
            backgroundColor: '#4caf50',
            borderRadius: 0,
            borderSkipped: false,
            barPercentage: 0.5,
            categoryPercentage: 0.7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex
                const full = (chart as Chart & { $sxFullLabels?: string[] }).$sxFullLabels
                return idx != null ? full?.[idx] ?? items[0]?.label ?? '' : ''
              },
              label: (item) => `  ${sxFormatDurationHours(typeof item.raw === 'number' ? item.raw : 0)}`,
            },
          },
        },
        scales: {
          y: {
            min: 0,
            suggestedMax,
            ticks: {
              stepSize,
              color: '#475467',
              callback: (value) => sxFormatDurationHours(Number(value)),
            },
            grid: { color: '#eeeeee' },
            border: { display: false },
          },
          x: {
            grid: { display: false },
            ticks: { color: '#475467', font: { weight: '500' } },
            border: { display: false },
          },
        },
      },
    }
    chart = new Chart(canvas, config)
    sxActivityChartRegistry.set(canvas, chart)
    ;(chart as Chart & { $sxFullLabels?: string[] }).$sxFullLabels = fullLabels
  } else {
    chart.data.labels = labels
    chart.data.datasets[0]!.data = hours
    ;(chart as Chart & { $sxFullLabels?: string[] }).$sxFullLabels = fullLabels
    const yScale = chart.options.scales?.y as { suggestedMax?: number; ticks?: { stepSize?: number } }
    if (yScale) {
      yScale.suggestedMax = suggestedMax
      if (yScale.ticks) yScale.ticks.stepSize = stepSize
    }
  }
  chart.update()
}

function syncSymbolsBarChart(
  canvas: HTMLCanvasElement,
  points: { symbol: string; trades: number; wins: number; losses: number }[],
) {
  const top = points.slice(0, 8)
  const labels = top.map((p) => p.symbol)
  const winValues = top.map((p) => p.wins)
  const lossValues = top.map((p) => p.losses)
  const totalValues = top.map((p) => p.wins + p.losses)
  const maxVal = Math.max(0, ...totalValues, 1)
  // Trade counts are always whole numbers, so pick an integer step (1, 2, 5,
  // 10, 20, 50, ...) and derive the max from it — avoids decimal axis ticks
  // like 12.5 / 37.5.
  const stepSize = Math.max(1, Math.round(sxNiceCeilStep(Math.max(1, maxVal / 4))))
  const suggestedMax = stepSize * 4

  let chart = sxSymbolsChartRegistry.get(canvas)
  if (!chart) {
    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Wins',
            data: winValues,
            backgroundColor: '#2e9e35',
            borderRadius: (ctx) => {
              const lossesVal = Number(ctx.chart.data.datasets[1]?.data[ctx.dataIndex] ?? 0)
              return lossesVal > 0 ? { topLeft: 6, bottomLeft: 6, topRight: 0, bottomRight: 0 } : 6
            },
            borderSkipped: false,
            barThickness: 18,
            stack: 'trades',
          },
          {
            label: 'Losses',
            data: lossValues,
            backgroundColor: '#9ca3af',
            borderRadius: (ctx) => {
              const winsVal = Number(ctx.chart.data.datasets[0]?.data[ctx.dataIndex] ?? 0)
              return winsVal > 0 ? { topLeft: 0, bottomLeft: 0, topRight: 6, bottomRight: 6 } : 6
            },
            borderSkipped: false,
            barThickness: 18,
            stack: 'trades',
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            position: 'barMiddle',
            yAlign: 'top',
            callbacks: {
              label: (item) => `${item.dataset.label}: ${item.raw} trade${item.raw === 1 ? '' : 's'}`,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            min: 0,
            suggestedMax,
            ticks: { stepSize, precision: 0, color: '#475467' },
            grid: { color: '#eeeeee' },
            border: { display: false },
          },
          y: {
            stacked: true,
            grid: { display: false },
            ticks: { color: '#475467', font: { size: 12 } },
            border: { display: false },
          },
        },
      },
    }
    chart = new Chart(canvas, config)
    sxSymbolsChartRegistry.set(canvas, chart)
  } else {
    chart.data.labels = labels
    chart.data.datasets[0]!.data = winValues
    chart.data.datasets[1]!.data = lossValues
    const xScale = chart.options.scales?.x as { suggestedMax?: number; ticks?: { stepSize?: number } }
    if (xScale) {
      xScale.suggestedMax = suggestedMax
      if (xScale.ticks) xScale.ticks.stepSize = stepSize
    }
  }
  chart.update()
}

function syncWinRateBarChart(canvas: HTMLCanvasElement, points: { label: string; winRate: number | null }[]) {
  const labels = points.map((p) => p.label)
  const values = points.map((p) => (p.winRate == null ? 0 : Math.round(p.winRate * 100) / 100))

  let chart = sxWinRateChartRegistry.get(canvas)
  if (!chart) {
    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: '#2e9e35',
            borderRadius: 6,
            borderSkipped: false,
            barPercentage: 0.5,
            categoryPercentage: 0.7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            callbacks: {
              label: (item) => `${typeof item.raw === 'number' ? item.raw.toFixed(0) : 0}% win rate`,
            },
          },
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: { stepSize: 20, color: '#475467', callback: (v) => `${v}%` },
            grid: { color: '#eeeeee' },
            border: { display: false },
          },
          x: {
            grid: { display: false },
            ticks: { color: '#475467', font: { weight: '500' } },
            border: { display: false },
          },
        },
      },
    }
    chart = new Chart(canvas, config)
    sxWinRateChartRegistry.set(canvas, chart)
  } else {
    chart.data.labels = labels
    chart.data.datasets[0]!.data = values
  }
  chart.update()
}
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
import { mountBillingPage } from '../views/mountBillingPage'
import { buildAnalyticsPageHtml, initAnalyticsPage, type SxaTrade } from './dashboardAnalyticsPage'
import { mountProfilePage, type ProfileSessionStats } from '../views/mountProfilePage'
import { postTelemetryEvent } from '../telemetry/telemetryApi'
import { DASH_LOCALES, dashLocaleMenuLabel, isDashLocaleCode } from './dashboardLocales'
import { readDisplayName, readUserAvatar } from './dashboardUserPrefs'
import {
  buildDashboardPerfChartSvg,
  computeEquityCurveSeries,
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
  MONTH_SHORT,
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
const LS_TRADES_HIDDEN_COLUMNS = 'suplexity-dash-trades-hidden-columns'

type SxTradeColumnDef = { id: string; label: string; locked?: boolean }

// Total physical <th>/<td> columns rendered in the table, including the always-on
// row-select checkbox column which is intentionally not offered in the column picker.
const SX_TRADES_TOTAL_TABLE_COLUMNS = 21

const SX_TRADES_COLUMNS: SxTradeColumnDef[] = [
  { id: 'asset', label: 'Asset', locked: true },
  { id: 'side', label: 'Side' },
  { id: 'session', label: 'Session' },
  { id: 'type', label: 'Type' },
  { id: 'source', label: 'Source' },
  { id: 'entryType', label: 'Entry type' },
  { id: 'entryRealtime', label: 'Entry date (realtime)' },
  { id: 'entryChart', label: 'Entry date (chart)' },
  { id: 'entryPrice', label: 'Entry price' },
  { id: 'size', label: 'Size' },
  { id: 'stopLoss', label: 'Stop loss' },
  { id: 'takeProfit', label: 'Take profit' },
  { id: 'exitDate', label: 'Exit date' },
  { id: 'exitPrice', label: 'Exit price' },
  { id: 'returnUsd', label: 'Return ($)' },
  { id: 'returnPct', label: 'Return (%)' },
  { id: 'returnR', label: 'Return (R)' },
  { id: 'rating', label: 'Rating' },
  { id: 'grossPnl', label: 'Gross PnL' },
  { id: 'fees', label: 'Fees' },
]

const SX_TRADE_RATING_LABELS: Record<string, string> = {
  '1': 'Poor',
  '2': 'Below average',
  '3': 'Average',
  '4': 'Good',
  '5': 'Excellent',
}

const TESTING_TABS = ['dashboard', 'sessions', 'trades', 'analytics'] as const
type TestingTab = (typeof TESTING_TABS)[number]

/** Sidebar entries — the four testing tabs plus the standalone pages. */
type DashNavKey = TestingTab | 'strategy' | 'subscription' | 'billing' | 'settings' | 'profile'

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

function buildPulseRangeHtml(): string {
  return `<div class="sx-dash-pulse__range" role="group" aria-label="Pulse time range">
                  <button type="button" class="sx-dash-pulse__range-btn" data-pulse-range="week">7d</button>
                  <button type="button" class="sx-dash-pulse__range-btn" data-pulse-range="month">30d</button>
                  <button type="button" class="sx-dash-pulse__range-btn sx-dash-pulse__range-btn--active" data-pulse-range="lifetime" aria-pressed="true">All</button>
                </div>`
}

function buildSessionPulseKpiHtml(opts?: {
  titleId?: string
  extraClass?: string
  /** Render only the KPI grid — used where the page already has a title and range picker. */
  bare?: boolean
}): string {
  const titleId = opts?.titleId ?? 'sx-dash-pulse-title'
  const extraClass = opts?.extraClass ? ` ${opts.extraClass}` : ''
  const head = opts?.bare
    ? ''
    : `<div class="sx-dash-pulse__head">
                <div>
                  <h3 id="${titleId}" class="sx-dash-pulse__title">Session Pulse</h3>
                  <p class="sx-dash-pulse__sub">Your practice desk at a glance — time, edge, and equity path.</p>
                </div>
                ${buildPulseRangeHtml()}
              </div>`
  const labelAttr = opts?.bare ? 'aria-label="Key pulse metrics"' : `aria-labelledby="${titleId}"`
  const bareClass = opts?.bare ? ' sx-dash-pulse--bare' : ''
  return `
            <section class="sx-dash-pulse sx-dash-pulse--pro sx-dash-pulse--kpi-only${bareClass}${extraClass}" ${labelAttr} data-sx-session-pulse>
              ${head}

              <div class="sx-dash-pulse__kpi" role="group" aria-label="Key pulse metrics">
                <div class="sx-dash-pulse__kpi-item">
                  <div class="sx-dash-pulse__kpi-top">
                    <span class="sx-dash-pulse__kpi-label">Time Invested</span>
                    <span class="sx-dash-pulse__kpi-icon" aria-hidden="true"><i class="fa-solid fa-stopwatch"></i></span>
                  </div>
                  <p class="sx-dash-pulse__kpi-value" data-sx-pulse="practice">—</p>
                  <div class="sx-dash-pulse__kpi-foot">
                    <p class="sx-dash-pulse__kpi-meta" data-sx-pulse="practice-hint">Across sessions</p>
                    <button
                      type="button"
                      class="sx-dash-pulse__kpi-info"
                      data-sx-pulse="practice-info"
                      data-tip="Across sessions"
                      aria-label="About time invested"
                    >${DASH_KPI_INFO_ICON_SVG}</button>
                  </div>
                </div>
                <div class="sx-dash-pulse__kpi-item">
                  <div class="sx-dash-pulse__kpi-top">
                    <span class="sx-dash-pulse__kpi-label">Replayed time</span>
                    <span class="sx-dash-pulse__kpi-icon sx-dash-pulse__kpi-icon--blue" aria-hidden="true"><i class="fa-solid fa-chart-line"></i></span>
                  </div>
                  <p class="sx-dash-pulse__kpi-value" data-sx-pulse="historical">—</p>
                  <div class="sx-dash-pulse__kpi-foot">
                    <p class="sx-dash-pulse__kpi-meta" data-sx-pulse="historical-hint">Historical coverage</p>
                    <button
                      type="button"
                      class="sx-dash-pulse__kpi-info"
                      data-sx-pulse="historical-info"
                      data-tip="Historical coverage"
                      aria-label="About replayed time"
                    >${DASH_KPI_INFO_ICON_SVG}</button>
                  </div>
                </div>
                <div class="sx-dash-pulse__kpi-item">
                  <div class="sx-dash-pulse__kpi-top">
                    <span class="sx-dash-pulse__kpi-label">Net P&amp;L</span>
                    <span class="sx-dash-pulse__kpi-icon sx-dash-pulse__kpi-icon--green" aria-hidden="true"><i class="fa-solid fa-sack-dollar"></i></span>
                  </div>
                  <p class="sx-dash-pulse__kpi-value" data-sx-pulse="pnl">—</p>
                  <div class="sx-dash-pulse__kpi-foot">
                    <p class="sx-dash-pulse__kpi-meta" data-sx-pulse="pnl-hint">Backtest results</p>
                    <button
                      type="button"
                      class="sx-dash-pulse__kpi-info"
                      data-sx-pulse="pnl-info"
                      data-tip="Backtest results"
                      aria-label="About net P&L"
                    >${DASH_KPI_INFO_ICON_SVG}</button>
                  </div>
                </div>
                <div class="sx-dash-pulse__kpi-item">
                  <div class="sx-dash-pulse__kpi-top">
                    <span class="sx-dash-pulse__kpi-label">Win rate</span>
                    <span class="sx-dash-pulse__kpi-icon sx-dash-pulse__kpi-icon--gold" aria-hidden="true"><i class="fa-solid fa-trophy"></i></span>
                  </div>
                  <p class="sx-dash-pulse__kpi-value" data-sx-pulse="winrate">—</p>
                  <div class="sx-dash-pulse__kpi-foot">
                    <p class="sx-dash-pulse__kpi-meta" data-sx-pulse="winrate-hint">Closed trade edge</p>
                    <button
                      type="button"
                      class="sx-dash-pulse__kpi-info"
                      data-sx-pulse="winrate-info"
                      data-tip="Closed trade edge"
                      aria-label="About win rate"
                    >${DASH_KPI_INFO_ICON_SVG}</button>
                  </div>
                </div>
              </div>
            </section>`
}

function buildPartnersSectionHtml(): string {
  return `
            <section class="sx-dash-partners" aria-labelledby="sx-dash-partners-title">
              <div class="sx-dash-partners__head">
                <span class="sx-dash-partners__rule" aria-hidden="true"></span>
                <h3 id="sx-dash-partners-title" class="sx-dash-partners__title">Partners</h3>
                <span class="sx-dash-partners__rule sx-dash-partners__rule--end" aria-hidden="true"></span>
              </div>
              <a
                class="sx-dash-partners__note"
                href="https://www.tradingview.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span class="sx-dash-partners__note-brand">
                  <svg class="sx-dash-partners__tv" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                    <path d="M15.8654 8.2789c0 1.3541-1.0978 2.4519-2.452 2.4519-1.354 0-2.4519-1.0978-2.4519-2.452 0-1.354 1.0978-2.4518 2.452-2.4518 1.3541 0 2.4519 1.0977 2.4519 2.4519zM9.75 6H0v4.9038h4.8462v7.2692H9.75Zm8.5962 0H24l-5.1058 12.173h-5.6538z" />
                  </svg>
                  <span class="sx-dash-partners__note-name">TradingView</span>
                </span>
                <p class="sx-dash-partners__note-copy">
                  Charts are powered by TradingView, a multi-functionality platform that provides in-depth
                  information on every aspect of trading, including technical and fundamental data, news and
                  analysis, ideas, and community discussions, and allows you to follow real-time prices
                </p>
              </a>
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

const DASH_NAV_LABELS: Record<DashNavKey, string> = {
  dashboard: 'Dashboard',
  sessions: 'Sessions',
  trades: 'Trades',
  analytics: 'Analytics',
  strategy: 'Strategy',
  subscription: 'Subscription',
  billing: 'Billing',
  settings: 'Settings',
  profile: 'Profile',
}

const DASH_GRID_ICON_SVG = `<svg class="sx-dash-side__ico sx-dash-side__ico--grid" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <rect x="3" y="3" width="7.5" height="7.5" rx="1.7"></rect>
              <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.7"></rect>
              <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.7"></rect>
              <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.7"></rect>
            </svg>`

function sideLinkHtml(
  key: DashNavKey,
  icon: string,
  attrs: string,
  active = false,
  iconHtml?: string,
): string {
  return `<button
              type="button"
              class="sx-dash-side__link${active ? ' sx-dash-side__link--active' : ''}"
              data-sx-side-link="${key}"
              ${attrs}
              ${active ? 'aria-current="page"' : ''}
            >
              ${iconHtml ?? `<i class="${icon} sx-dash-side__ico" aria-hidden="true"></i>`}
              <span>${DASH_NAV_LABELS[key]}</span>
            </button>`
}

function buildDashSidebarHtml(): string {
  return `
      <aside class="sx-dash-side" aria-label="Dashboard sections">
        <div class="sx-dash-side__account">
          <div class="sx-dash-account-static">
            <span class="sx-dash-account-static__greet">Hi <span data-sx-account-label>Guest</span>,</span>
            <span class="sx-dash-account-static__plan">
              You're on <strong data-sx-account-plan>Basic</strong> Plan
            </span>
          </div>
        </div>

        <nav class="sx-dash-side__nav">
          ${sideLinkHtml('dashboard', 'fa-solid fa-table-cells-large', 'data-action="dashboard" data-testing-tab="dashboard"', true, DASH_GRID_ICON_SVG)}
          ${sideLinkHtml('sessions', 'fa-solid fa-list-ul', 'data-testing-tab="sessions"')}
          ${sideLinkHtml('trades', 'fa-regular fa-file-lines', 'data-testing-tab="trades"')}
          ${sideLinkHtml('analytics', 'fa-solid fa-chart-line', 'data-testing-tab="analytics"')}
          ${sideLinkHtml('strategy', 'fa-solid fa-bolt', 'data-action="strategy"')}
          ${sideLinkHtml('subscription', 'fa-regular fa-credit-card', 'data-action="subscription"')}
          ${sideLinkHtml('billing', 'fa-regular fa-file-lines', 'data-action="billing"')}
          ${sideLinkHtml('settings', 'fa-solid fa-gear', 'data-action="settings"')}

          <p class="sx-dash-side__section">Account pages</p>
          ${sideLinkHtml('profile', 'fa-regular fa-user', 'data-action="profile"')}
          <button type="button" class="sx-dash-side__link" data-nav="logout">
            <i class="fa-solid fa-arrow-right-from-bracket sx-dash-side__ico" aria-hidden="true"></i>
            <span>Sign out</span>
          </button>
        </nav>
      </aside>`
}

function buildDashTopbarHtml(): string {
  return `
        <header class="sx-dash-bar" role="banner">
          <label for="sx-nav-drawer" class="sx-dash-bar__burger" aria-label="Open menu">
            <i class="fa-solid fa-bars" aria-hidden="true"></i>
          </label>

          <div class="sx-dash-bar__brand" aria-hidden="true">
            <span class="sx-dash-side__mono">TN</span>
            <span class="sx-dash-side__name">
              <span class="sx-dash-side__name-trade">TRADE</span><span class="sx-dash-side__name-neu">NEU</span>
            </span>
          </div>
          <span class="sr-only">Tradeneu Premium Backtesting</span>

          <div class="sx-dash-bar__tools" role="toolbar" aria-label="Dashboard actions">
            <button type="button" class="sx-dash-bar__upgrade" data-action="pro-upgrade">
              <i class="fa-solid fa-crown" aria-hidden="true"></i>
              <span>Upgrade</span>
            </button>

            <span class="sx-dash-tip-wrap inline-flex">
              <button type="button" data-action="ai-chat" class="sx-dash-bar__icon" aria-label="Open AI assistant">
                <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
              </button>
              <span class="sx-dash-tip">AI Assistant</span>
            </span>

            <span class="sx-dash-tip-wrap relative inline-flex">
              <div class="sx-dash-locale-dd relative" data-sx-locale-dropdown>
                <button
                  type="button"
                  class="sx-dash-locale-trigger sx-dash-bar__locale"
                  aria-expanded="false"
                  aria-haspopup="listbox"
                  aria-label="Language"
                >
                  <span class="sx-dash-locale-trigger__code">EN</span>
                  <i class="fa-solid fa-chevron-down sx-dash-locale-trigger__chev" aria-hidden="true"></i>
                </button>
                <div class="sx-dash-locale-panel hidden" role="listbox" aria-label="Choose language"></div>
              </div>
              <span class="sx-dash-tip">Translate</span>
            </span>

            <span class="sx-dash-tip-wrap inline-flex">
              <button type="button" class="sx-dash-bar__icon sx-dash-theme-icon-btn" aria-label="Switch theme">
                <i class="fa-solid fa-sun sx-dash-theme-icon--when-dark" aria-hidden="true"></i>
                <i class="fa-solid fa-moon sx-dash-theme-icon--when-light" aria-hidden="true"></i>
              </button>
              <span class="sx-dash-tip">Change theme</span>
            </span>

            <span class="sx-dash-tip-wrap inline-flex">
              <button type="button" data-action="dash-fullscreen" class="sx-dash-bar__icon sx-dash-fullscreen-btn" aria-label="Enter fullscreen">
                <i class="fa-solid fa-expand sx-dash-fs-icon-expand" aria-hidden="true"></i>
                <i class="fa-solid fa-compress sx-dash-fs-icon-compress" aria-hidden="true"></i>
              </button>
              <span class="sx-dash-tip">Fullscreen</span>
            </span>

            <span class="sx-dash-tip-wrap inline-flex">
              <button type="button" data-action="settings" class="sx-dash-bar__icon" aria-label="Settings">
                <i class="fa-solid fa-gear" aria-hidden="true"></i>
              </button>
              <span class="sx-dash-tip">Settings</span>
            </span>

          </div>
        </header>`
}

function buildDashboardPageHeadHtml(): string {
  return `
            <div class="sx-dash-page-head">
              <div class="sx-dash-page-head__copy">
                <h1 class="sx-dash-page-title">Backtesting</h1>
                <p class="sx-dash-page-sub">Practice on the past, profit in the present — track sessions, tape and edge.</p>
              </div>
              <div class="sx-dash-page-head__actions">
                <button type="button" data-action="backtest" class="sx-dash-cta-btn sx-dash-cta-btn--primary">
                  <span class="sx-dash-cta-btn__icon" aria-hidden="true">+</span>
                  <span class="sx-dash-cta-btn__text">
                    <span class="sx-dash-cta-btn__title">Backtesting Session</span>
                    <span class="sx-dash-cta-btn__sub">Start a session</span>
                  </span>
                </button>
                <button type="button" data-action="prop" class="sx-dash-cta-btn sx-dash-cta-btn--secondary">
                  <span class="sx-dash-cta-pro" title="Pro feature" role="img" aria-label="Pro feature">
                    <i class="fa-solid fa-crown" aria-hidden="true"></i>
                  </span>
                  <span class="sx-dash-cta-btn__text">
                    <span class="sx-dash-cta-btn__title">Target Challenge</span>
                    <span class="sx-dash-cta-btn__sub">Start a challenge</span>
                  </span>
                </button>
              </div>
            </div>`
}

function buildDashGraphCardsHtml(): string {
  return `
            <div class="sx-dash-graphs">
              <div class="sx-dash-graph--full sx-dash-graphs-row">
                <article class="sx-dash-graph">
                  <div class="sx-dash-graph__head">
                    <div>
                      <h3 class="sx-dash-graph__title">Time Invested</h3>
                      <p class="sx-dash-graph__total"><strong data-sx-activity-total>—</strong> spent in this range</p>
                    </div>
                    <div class="sx-dash-graph__head-right">
                      <div class="sx-dash-graph__tabs" role="tablist" aria-label="Time Invested range">
                        <button type="button" class="sx-dash-graph__tab sx-dash-graph__tab--active" data-sx-activity-range="daily" role="tab" aria-selected="true">Daily</button>
                        <button type="button" class="sx-dash-graph__tab" data-sx-activity-range="weekly" role="tab" aria-selected="false">Weekly</button>
                        <button type="button" class="sx-dash-graph__tab" data-sx-activity-range="monthly" role="tab" aria-selected="false">Monthly</button>
                        <button type="button" class="sx-dash-graph__tab" data-sx-activity-range="yearly" role="tab" aria-selected="false">Yearly</button>
                      </div>
                    </div>
                  </div>
                  <div class="sx-dash-graph__chart sx-dash-activity-chart" role="img" aria-label="Practice hours by day">
                    <canvas data-sx-activity-chart-canvas></canvas>
                  </div>
                </article>

                <article class="sx-dash-graph">
                  <h3 class="sx-dash-graph__title">Equity Curve</h3>
                  <div class="sx-dash-graph__chart sx-dash-equity-chart" role="img" aria-label="Equity curve by month">
                    <canvas data-sx-equity-chart-canvas></canvas>
                  </div>
                </article>
              </div>

              <div class="sx-dash-graph--full sx-dash-graphs-row">
                <article class="sx-dash-graph">
                  <div class="sx-dash-graph__head">
                    <h3 class="sx-dash-graph__title">Win Rate</h3>
                    <button
                      type="button"
                      class="sx-dash-pulse__kpi-info"
                      data-tip="Share of your closed trades that ended as wins, by month."
                      aria-label="About win rate"
                    >${DASH_KPI_INFO_ICON_SVG}</button>
                  </div>
                  <div class="sx-dash-graph__chart sx-dash-winrate-chart" role="img" aria-label="Win rate by month">
                    <canvas data-sx-winrate-chart-canvas></canvas>
                  </div>
                </article>

                <article class="sx-dash-graph">
                  <div class="sx-dash-graph__head">
                    <h3 class="sx-dash-graph__title">Trades by symbol</h3>
                    <button
                      type="button"
                      class="sx-dash-pulse__kpi-info"
                      data-tip="Distribution of your closed trades across each symbol you've traded."
                      aria-label="About trades by symbol"
                    >${DASH_KPI_INFO_ICON_SVG}</button>
                  </div>
                  <div class="sx-dash-graph__chart sx-dash-symbols-chart" role="img" aria-label="Trades by symbol">
                    <canvas data-sx-symbols-chart-canvas></canvas>
                  </div>
                </article>
              </div>
            </div>`
}

/**
 * TraderLocal-style dark dashboard — session launcher & markets.
 */
export async function mountDashboardApp(root: HTMLElement): Promise<void> {
  document.documentElement.removeAttribute('data-theme')
  document.title = 'Tradeneu — Dashboard'
  let activityChartRange: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'daily'

  root.replaceChildren()
  appendElementsFromHtml(
    root,
    `
<div class="flex h-full min-h-0 flex-col overflow-hidden bg-[#f0f0f0] text-slate-800" id="sx-app-root" data-dashboard-theme="light">
  <div id="view-dash" class="sx-dash relative flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-slate-800 selection:bg-indigo-500/20">
    <div class="sx-dash__mesh" aria-hidden="true"></div>
    <div class="sx-dash__noise" aria-hidden="true"></div>
    <div class="sx-dash__orb sx-dash__orb--a" aria-hidden="true"></div>
    <div class="sx-dash__orb sx-dash__orb--b" aria-hidden="true"></div>
    <div class="sx-dash__orb sx-dash__orb--c" aria-hidden="true"></div>

    <input type="checkbox" id="sx-nav-drawer" class="sr-only" />
    <label for="sx-nav-drawer" class="sx-dash-side__scrim" aria-hidden="true"></label>

    <div class="sx-dash__layer sx-dash-shell">
      ${buildDashSidebarHtml()}

      <div class="sx-dash-shell__main">
        ${buildDashTopbarHtml()}

        <span class="sr-only" id="sx-dash-display-name">${escapeHtml(readDisplayName())}</span>
        <span class="sr-only" id="sx-dash-plan-badge">Free user</span>
        <span class="sr-only" id="sx-ml-pill" title="ML API">ML …</span>

      <main class="sx-dash-shell__scroll" id="sx-welcome">
        <div class="sx-dash-home-panel">

        <div class="sx-dash-testing" data-sx-testing>

          <div class="sx-dash-testing__panels">
          <div class="sx-dash-testing-panel sx-dash-testing-panel--dashboard" data-testing-panel="dashboard" role="tabpanel">
            ${buildDashboardPageHeadHtml()}

            <section class="sx-dash-performance" aria-labelledby="sx-dash-performance-title">
              <header class="sx-dash-performance__head">
                <div>
                  <h2 id="sx-dash-performance-title">Performance</h2>
                  <p>Your practice, market coverage, and trading results.</p>
                </div>
                ${buildPulseRangeHtml()}
              </header>

              ${buildSessionPulseKpiHtml({ bare: true })}

              ${buildDashGraphCardsHtml()}
            </section>

            <div class="sx-dash-recent-sessions-host" data-sx-recent-sessions-anchor="dashboard"></div>
          </div>

          <div class="sx-dash-testing-panel hidden" data-testing-panel="sessions" role="tabpanel" hidden>
            <div class="sx-dash-recent-sessions-host" data-sx-recent-sessions-anchor="sessions">
        ${buildRecentSessionsSectionHtml()}
            </div>
          </div>

          <div class="sx-dash-testing-panel hidden" data-testing-panel="analytics" role="tabpanel" hidden>
            <section class="sx-dash-performance sx-dash-performance--analytics" aria-labelledby="sx-dash-performance-title-analytics">
              <header class="sx-dash-performance__head">
                <div>
                  <h2 id="sx-dash-performance-title-analytics">Performance</h2>
                  <p>Your practice, market coverage, and trading results.</p>
                </div>
                ${buildPulseRangeHtml()}
              </header>

              ${buildSessionPulseKpiHtml({ bare: true, titleId: 'sx-dash-pulse-title-analytics', extraClass: 'sx-dash-pulse--analytics-kpi' })}

              ${buildDashGraphCardsHtml()}
            </section>

            <div class="sx-dash-analytics-deepdive" data-sxa-host>${buildAnalyticsPageHtml()}</div>
                </div>

          <div class="sx-dash-testing-panel hidden" data-testing-panel="trades" role="tabpanel" hidden>
            <section class="sxt-trades" aria-labelledby="sx-dash-trades-title">
              <div class="sxt-page-head">
                <div>
                  <h3 id="sx-dash-trades-title" class="sxt-h1">Trades</h3>
                  <p class="sxt-sub">Closed trades from your replay journals across sessions.</p>
                </div>
                <button type="button" data-sx-trades-export class="sxt-export-btn">
                  <i class="fa-solid fa-download" aria-hidden="true"></i>
                  Export
                </button>
              </div>

              <div class="sxt-kpi-strip">
                <div class="sxt-kpi">
                  <div class="sxt-kpi-label">Trades</div>
                  <div class="sxt-kpi-value" data-sxt-kpi="count">0</div>
                  <div class="sxt-kpi-sub" data-sxt-kpi="count-sub">&nbsp;</div>
                </div>
                <div class="sxt-kpi">
                  <div class="sxt-kpi-label">Net P&amp;L</div>
                  <div class="sxt-kpi-value" data-sxt-kpi="netpnl">$0.00</div>
                  <div class="sxt-kpi-sub" data-sxt-kpi="netpnl-sub">&nbsp;</div>
                </div>
                <div class="sxt-kpi">
                  <div class="sxt-kpi-label">Win rate</div>
                  <div class="sxt-kpi-value" data-sxt-kpi="winrate">0%</div>
                  <div class="sxt-kpi-sub" data-sxt-kpi="winrate-sub">&nbsp;</div>
                </div>
                <div class="sxt-kpi">
                  <div class="sxt-kpi-label">Avg return (R)</div>
                  <div class="sxt-kpi-value" data-sxt-kpi="avgr">0.00R</div>
                  <div class="sxt-kpi-sub" data-sxt-kpi="avgr-sub">&nbsp;</div>
                </div>
                <div class="sxt-spark-cell">
                  <div class="sxt-kpi-label">Equity, this range</div>
                  <div class="sxt-spark-end" data-sxt-kpi="spark-end">$0.00</div>
                  <canvas data-sxt-spark-canvas></canvas>
                </div>
              </div>

              <div class="sxt-toolbar">
                <div class="sxt-select-pill">
                  <select data-sx-trades-session-filter>
                    <option value="">All sessions</option>
                  </select>
                  <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                </div>
                <div class="sxt-search-box">
                  <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                  <input type="search" data-sx-trades-search placeholder="Search trades" autocomplete="off" />
                </div>
                <div class="sxt-spacer"></div>
                <button type="button" data-sx-trades-clear-all class="hidden sxt-clear-all">
                  Clear All
                  <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                </button>
                <button type="button" data-sx-trades-refresh class="sxt-icon-btn" title="Reset table columns" aria-label="Reset table columns">
                  <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
                </button>
                <div class="sxt-colpicker relative" data-sxt-colpicker>
                  <button type="button" data-sx-trades-edit class="sxt-icon-btn" title="Modify columns" aria-label="Modify columns" aria-haspopup="true" aria-expanded="false">
                    <i class="fa-solid fa-pen" aria-hidden="true"></i>
                  </button>
                  <span class="sr-only" data-sxt-colpicker-count>0 columns selected</span>
                  <div class="sxt-colpicker__panel hidden" data-sxt-colpicker-panel role="dialog" aria-label="Table columns">
                    <div class="sxt-colpicker__search-row">
                      <input type="checkbox" data-sxt-colpicker-toggle-all />
                      <div class="sxt-colpicker__search">
                        <input type="search" data-sxt-colpicker-search placeholder="" autocomplete="off" />
                        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                      </div>
                    </div>
                    <div class="sxt-colpicker__list" data-sxt-colpicker-list></div>
                  </div>
                </div>
                <div class="sxt-filterby">
                  <span class="sxt-filterby__divider" aria-hidden="true"></span>
                  <span class="sxt-filterby__label">Filter by</span>
                  <button type="button" class="sxt-filterby__pill sx-dash-trades-filter-tab" data-sx-trades-filter-tab="basic" role="tab" aria-selected="false">Column</button>
                  <button type="button" class="sxt-filterby__pill sx-dash-trades-filter-tab" data-sx-trades-filter-tab="tags" role="tab" aria-selected="false">Tags</button>
                  <span class="hidden sxt-filter-count" data-sx-trades-filters-count></span>
                </div>
                <div class="relative">
                  <div class="sx-dash-trades-filters-backdrop hidden" data-sx-trades-filters-backdrop></div>
                  <div class="sx-dash-trades-filters-panel hidden" data-sx-trades-filters-panel role="dialog" aria-modal="true" aria-label="Filters">
                    <div class="sx-dash-trades-filters-panel__head">
                      <span class="sx-dash-trades-filters-panel__title"><i class="fa-solid fa-filter" aria-hidden="true"></i> Filters</span>
                      <button type="button" class="sx-dash-trades-filters-panel__close" data-sx-trades-filters-close aria-label="Close filters">
                        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                      </button>
                    </div>

                    <div class="sx-dash-trades-filters-panel__tabs" role="tablist" aria-label="Filter category">
                      <button type="button" class="sx-dash-trades-filter-tab" data-sx-trades-filter-tab="basic" role="tab" aria-selected="false">
                        <i class="fa-solid fa-sliders" aria-hidden="true"></i> Column
                      </button>
                      <button type="button" class="sx-dash-trades-filter-tab" data-sx-trades-filter-tab="tags" role="tab" aria-selected="false">
                        <i class="fa-solid fa-tag" aria-hidden="true"></i> Tags
                      </button>
                    </div>

                    <div class="sx-dash-trades-filters-panel__search">
                      <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                      <input type="search" data-sx-trades-filters-search placeholder="Search filter" autocomplete="off" />
                    </div>

                    <div class="sx-dash-trades-filters-panel__body" data-sx-trades-filters-body></div>

                    <div class="sx-dash-trades-filters-panel__foot">
                      <button type="button" class="sx-dash-trades-filters-clear" data-sx-trades-filters-clear>Clear All</button>
                      <button type="button" class="sx-dash-trades-filters-apply" data-sx-trades-filters-apply>Apply Filters</button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="sxt-headerclone" data-sx-trades-headerclone>
                <div class="sxt-headerclone__scroll" data-sx-trades-headerclone-scroll>
                  <table class="sxt-table sxt-headerclone__table" data-sx-trades-headerclone-table>
                    <thead>
                      <tr class="sxt-col-row">
                        <th class="sxt-sticky-col sxt-col-check" data-sxt-col="check"><input type="checkbox" data-sx-trades-select-all class="sxt-row-check" aria-label="Select all trades" /></th>
                        <th class="sxt-sticky-col sxt-col-asset" data-sxt-col="asset">Asset</th>
                        <th data-sxt-col="side">Side</th>
                        <th class="sxt-group-divide" data-sxt-col="session">Session</th>
                        <th data-sxt-col="type">Type</th>
                        <th data-sxt-col="source">Source</th>
                        <th data-sxt-col="entryType">Entry type</th>
                        <th data-sxt-col="entryRealtime">Entry date (realtime)</th>
                        <th data-sxt-col="entryChart">Entry date (chart)</th>
                        <th class="sxt-num sxt-group-divide" data-sxt-col="entryPrice">Entry price</th>
                        <th class="sxt-num" data-sxt-col="size">Size</th>
                        <th class="sxt-num sxt-group-divide" data-sxt-col="stopLoss">Stop loss</th>
                        <th class="sxt-num" data-sxt-col="takeProfit">Take profit</th>
                        <th class="sxt-group-divide" data-sxt-col="exitDate">Exit date</th>
                        <th class="sxt-num" data-sxt-col="exitPrice">Exit price</th>
                        <th class="sxt-num sxt-group-divide" data-sxt-col="returnUsd">Return ($)</th>
                        <th class="sxt-num" data-sxt-col="returnPct">Return (%)</th>
                        <th class="sxt-num" data-sxt-col="returnR">Return (R)</th>
                        <th data-sxt-col="rating">Rating</th>
                        <th class="sxt-num" data-sxt-col="grossPnl">Gross PnL</th>
                        <th class="sxt-num" data-sxt-col="fees">Fees</th>
                      </tr>
                    </thead>
                  </table>
                </div>
              </div>

              <div class="sxt-table-card">
                <div class="sxt-table-scroll" data-sx-trades-scroll>
                  <table class="sxt-table" data-sx-trades-table>
                    <thead>
                      <tr class="sxt-col-row">
                        <th class="sxt-sticky-col sxt-col-check" data-sxt-col="check"></th>
                        <th class="sxt-sticky-col sxt-col-asset" data-sxt-col="asset">Asset</th>
                        <th data-sxt-col="side">Side</th>
                        <th class="sxt-group-divide" data-sxt-col="session">Session</th>
                        <th data-sxt-col="type">Type</th>
                        <th data-sxt-col="source">Source</th>
                        <th data-sxt-col="entryType">Entry type</th>
                        <th data-sxt-col="entryRealtime">Entry date (realtime)</th>
                        <th data-sxt-col="entryChart">Entry date (chart)</th>
                        <th class="sxt-num sxt-group-divide" data-sxt-col="entryPrice">Entry price</th>
                        <th class="sxt-num" data-sxt-col="size">Size</th>
                        <th class="sxt-num sxt-group-divide" data-sxt-col="stopLoss">Stop loss</th>
                        <th class="sxt-num" data-sxt-col="takeProfit">Take profit</th>
                        <th class="sxt-group-divide" data-sxt-col="exitDate">Exit date</th>
                        <th class="sxt-num" data-sxt-col="exitPrice">Exit price</th>
                        <th class="sxt-num sxt-group-divide" data-sxt-col="returnUsd">Return ($)</th>
                        <th class="sxt-num" data-sxt-col="returnPct">Return (%)</th>
                        <th class="sxt-num" data-sxt-col="returnR">Return (R)</th>
                        <th data-sxt-col="rating">Rating</th>
                        <th class="sxt-num" data-sxt-col="grossPnl">Gross PnL</th>
                        <th class="sxt-num" data-sxt-col="fees">Fees</th>
                      </tr>
                    </thead>
                    <tbody data-sx-trades-body>
                      <tr>
                        <td colspan="21" class="sxt-empty">No closed trades yet. Resume a session and close positions to see them here.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="sxt-table-footer">
                  <div class="sxt-footer-status">
                    <span data-sx-trades-footer-default>0 trades</span>
                    <span data-sx-trades-footer-selected class="hidden">
                      <strong><span data-sx-trades-selected-count>0</span> selected</strong>
                      &nbsp;&middot;&nbsp;
                      <button type="button" data-sx-trades-delete-selected class="sxt-link-btn">Delete</button>
                      &nbsp;&middot;&nbsp;
                      <button type="button" data-sx-trades-export-selected class="sxt-link-btn">Export selected</button>
                    </span>
                  </div>
                  <div class="sxt-page-btns" data-sx-trades-pagination></div>
                  <div class="sxt-footer-spacer" aria-hidden="true"></div>
                </div>
              </div>
            </section>
                    </div>

                  </div>

          <div data-sx-partners-section>${buildPartnersSectionHtml()}</div>
                </div>
        <div id="sx-dash-subscription-panel" class="sx-dash-subscription-panel hidden" hidden></div>
        <div id="sx-dash-billing-panel" class="sx-dash-billing-panel hidden" hidden></div>
        <div id="sx-dash-strategy-panel" class="sx-dash-strategy-panel hidden" hidden></div>
        <div id="sx-dash-settings-panel" class="sx-dash-settings-panel hidden" hidden></div>
        </div>
      </main>
    </div>
    </div>
  </div>

  <div class="sx-dash-trades-fixedbar" data-sx-trades-fixedbar hidden aria-hidden="true">
    <div class="sx-dash-trades-fixedbar__track" data-sx-trades-fixedbar-track>
      <div class="sx-dash-trades-fixedbar__thumb" data-sx-trades-fixedbar-inner></div>
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
  const viewBillingPanel = root.querySelector('#sx-dash-billing-panel') as HTMLElement
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
  let disposeBilling: (() => void) | null = null
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

  function setSideNavActive(key: DashNavKey) {
    root.querySelectorAll<HTMLElement>('[data-sx-side-link]').forEach((btn) => {
      const on = btn.getAttribute('data-sx-side-link') === key
      btn.classList.toggle('sx-dash-side__link--active', on)
      if (on) btn.setAttribute('aria-current', 'page')
      else btn.removeAttribute('aria-current')
    })
    const crumb = root.querySelector<HTMLElement>('[data-sx-crumb]')
    if (crumb) crumb.textContent = DASH_NAV_LABELS[key]
  }

  function setMainNavActive(action: 'dashboard' | 'subscription' | 'billing' | 'strategy' | 'settings' | 'profile') {
    setSideNavActive(action)
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

  function clearBillingPanel() {
    disposeBilling?.()
    disposeBilling = null
    viewBillingPanel?.replaceChildren()
    if (viewBillingPanel) {
      viewBillingPanel.hidden = true
      viewBillingPanel.classList.add('hidden')
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
    clearBillingPanel()
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
    disposeBilling?.()
    disposeBilling = null
    disposeProfile?.()
    disposeProfile = null
    viewStrategyPanel?.replaceChildren()
    viewSettingsPanel?.replaceChildren()
    viewSubscriptionPanel?.replaceChildren()
    viewBillingPanel?.replaceChildren()
    viewProfile?.replaceChildren()
    hideOverlayViews()
    if (viewChart) {
      viewChart.hidden = false
      viewChart.classList.remove('hidden')
    }
    if (viewDash) viewDash.hidden = true
    hideTradesFixedBar()
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
    clearBillingPanel()
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
    clearBillingPanel()
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

  function showBillingPage() {
    if (!viewBillingPanel) return
    disposeChart?.()
    disposeChart = null
    disposeStocks?.()
    disposeStocks = null
    clearStrategyPanel()
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
    viewBillingPanel.hidden = false
    viewBillingPanel.classList.remove('hidden')
    setMainNavActive('billing')
    closeDrawer()
    if (appRoot) setAiChatOpen(appRoot, false)
    disposeBilling?.()
    disposeBilling = mountBillingPage(viewBillingPanel, {
      readTier: readAccountTier,
      getAuthUser: () => getAuthUser(),
      onOpenSubscription: openUpgradePlansModal,
    })
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
    clearBillingPanel()
    viewStocks?.replaceChildren()
    viewChart?.replaceChildren()
    hideOverlayViews()
    if (viewDash) viewDash.hidden = true
    hideTradesFixedBar()
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
    clearBillingPanel()
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
    root.querySelectorAll<HTMLElement>('[data-sx-sessions-total]').forEach((el) => {
      el.textContent = String(visible)
    })
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
    // Only real tabs get the pill treatment; sidebar links are handled by setSideNavActive.
    root.querySelectorAll<HTMLButtonElement>('[data-testing-tab][role="tab"]').forEach((btn) => {
      const on = btn.getAttribute('data-testing-tab') === tab
      btn.classList.toggle('sx-dash-testing-tab--active', on)
      btn.setAttribute('aria-selected', on ? 'true' : 'false')
    })
    root.querySelectorAll<HTMLElement>('[data-testing-panel]').forEach((panel) => {
      const on = panel.getAttribute('data-testing-panel') === tab
      panel.classList.toggle('hidden', !on)
      panel.hidden = !on
    })
    if (tab === 'dashboard' || tab === 'sessions') {
      const sessionsSection = root.querySelector<HTMLElement>('.sx-dash-recent-sessions')
      const targetAnchor = root.querySelector<HTMLElement>(`[data-sx-recent-sessions-anchor="${tab}"]`)
      if (sessionsSection && targetAnchor && sessionsSection.parentElement !== targetAnchor) {
        targetAnchor.appendChild(sessionsSection)
      }
    }
    const partnersSection = root.querySelector<HTMLElement>('[data-sx-partners-section]')
    if (partnersSection) {
      const hidePartners = tab === 'trades' || tab === 'sessions' || tab === 'analytics'
      partnersSection.hidden = hidePartners
      partnersSection.classList.toggle('hidden', hidePartners)
    }
    if (tab === 'trades') {
      requestAnimationFrame(() => syncTradesFixedScrollbar())
    } else {
      const bar = root.querySelector<HTMLElement>('[data-sx-trades-fixedbar]')
      if (bar) bar.hidden = true
    }
    setSideNavActive(tab)
    if (tab === 'dashboard' || tab === 'sessions') syncRecentSessionsUi()
    if (tab === 'dashboard' || tab === 'analytics') {
      syncSessionPulse()
      syncDashboardPerf()
    }
    if (tab === 'analytics') sxAnalyticsPage?.renderAll()
    if (tab === 'trades') syncTradesUi()
  }

  function hideTradesFixedBar() {
    const bar = root.querySelector<HTMLElement>('[data-sx-trades-fixedbar]')
    if (bar) bar.hidden = true
  }

  let sxTradesFixedBarBound = false

  function syncTradesFixedScrollbar() {
    const bar = root.querySelector<HTMLElement>('[data-sx-trades-fixedbar]')
    const track = root.querySelector<HTMLElement>('[data-sx-trades-fixedbar-track]')
    const thumb = root.querySelector<HTMLElement>('[data-sx-trades-fixedbar-inner]')
    const scrollEl = root.querySelector<HTMLElement>('[data-sx-trades-scroll]')
    if (!bar || !track || !thumb || !scrollEl) return

    const activeTab = root.querySelector<HTMLElement>('[data-testing-panel="trades"]')
    const isTradesActive = !!activeTab && !activeTab.hidden
    const overflowing = scrollEl.scrollWidth > scrollEl.clientWidth + 1

    if (!isTradesActive || !overflowing) {
      bar.hidden = true
      return
    }

    const rect = scrollEl.getBoundingClientRect()
    bar.hidden = false
    bar.style.left = `${rect.left}px`
    bar.style.width = `${rect.width}px`
    thumb.style.width = `${scrollEl.scrollWidth}px`
    if (Math.abs(track.scrollLeft - scrollEl.scrollLeft) > 1) {
      track.scrollLeft = scrollEl.scrollLeft
    }

    if (!sxTradesFixedBarBound) {
      sxTradesFixedBarBound = true
      let syncingFromTrack = false
      let syncingFromTable = false
      track.addEventListener('scroll', () => {
        if (syncingFromTable) return
        syncingFromTrack = true
        scrollEl.scrollLeft = track.scrollLeft
        syncingFromTrack = false
      })
      scrollEl.addEventListener('scroll', () => {
        if (syncingFromTrack) return
        syncingFromTable = true
        track.scrollLeft = scrollEl.scrollLeft
        syncingFromTable = false
      })
      window.addEventListener('resize', () => syncTradesFixedScrollbar())
    }
  }

  // ── Standalone sticky header clone (Filter/Column header row) ──────────
  // The header clone lives outside the horizontally-scrolling table, so it
  // can genuinely stick to the page below the toolbar. We keep it in sync
  // with: (1) the toolbar's real rendered height (sticky `top` offset),
  // (2) each column's rendered width (so it lines up with the data table),
  // and (3) horizontal scroll position (3-way, with the existing fixed
  // bottom scrollbar too).

  function sxSyncTradesHeaderCloneTop() {
    const clone = root.querySelector<HTMLElement>('[data-sx-trades-headerclone]')
    const toolbar = root.querySelector<HTMLElement>('.sxt-toolbar')
    if (!clone || !toolbar) return
    const scrollEl = root.querySelector<HTMLElement>('.sx-dash-shell__scroll')
    const toolbarRect = toolbar.getBoundingClientRect()
    const containerTop = scrollEl ? scrollEl.getBoundingClientRect().top : 0
    const offset = Math.max(0, Math.round(toolbarRect.bottom - containerTop))
    clone.style.top = `${offset}px`
  }

  let sxTradesColWidthStyleEl: HTMLStyleElement | null = null

  function sxSyncTradesHeaderCloneWidths() {
    const cloneTable = root.querySelector<HTMLElement>('[data-sx-trades-headerclone-table]')
    const mainTable = root.querySelector<HTMLElement>('[data-sx-trades-table]')
    if (!cloneTable || !mainTable) return

    if (!sxTradesColWidthStyleEl) {
      sxTradesColWidthStyleEl = document.createElement('style')
      sxTradesColWidthStyleEl.setAttribute('data-sx-trades-colwidths', '')
      document.head.appendChild(sxTradesColWidthStyleEl)
    }
    // Clear previous forced widths first so this measurement reflects each
    // cell's natural (unconstrained) size rather than a stale prior value.
    sxTradesColWidthStyleEl.textContent = ''

    const firstRow = mainTable.querySelector<HTMLElement>('tbody tr')
    const hasData = !!firstRow && !firstRow.querySelector('.sxt-empty')

    const cloneThs = Array.from(cloneTable.querySelectorAll<HTMLElement>('thead th[data-sxt-col]'))
    const rules: string[] = []
    for (const th of cloneThs) {
      const colId = th.getAttribute('data-sxt-col')
      if (!colId || th.classList.contains('sxt-col-hidden')) continue
      const labelWidth = th.getBoundingClientRect().width
      let dataWidth = 0
      if (hasData) {
        const td = firstRow!.querySelector<HTMLElement>(`[data-sxt-col="${colId}"]`)
        if (td) dataWidth = td.getBoundingClientRect().width
      }
      const width = Math.ceil(Math.max(labelWidth, dataWidth))
      if (width > 0) rules.push(`.sxt-table [data-sxt-col="${colId}"]{min-width:${width}px}`)
    }
    sxTradesColWidthStyleEl.textContent = rules.join('\n')
  }

  let sxTradesHeaderCloneScrollSyncing = false
  let sxTradesHeaderCloneBound = false

  function sxBindTradesHeaderCloneScrollSync() {
    if (sxTradesHeaderCloneBound) return
    const mainScroll = root.querySelector<HTMLElement>('[data-sx-trades-scroll]')
    const cloneScroll = root.querySelector<HTMLElement>('[data-sx-trades-headerclone-scroll]')
    if (!mainScroll || !cloneScroll) return
    sxTradesHeaderCloneBound = true

    const applyFrom = (source: HTMLElement) => {
      if (sxTradesHeaderCloneScrollSyncing) return
      sxTradesHeaderCloneScrollSyncing = true
      const value = source.scrollLeft
      const track = root.querySelector<HTMLElement>('[data-sx-trades-fixedbar-track]')
      for (const el of [mainScroll, cloneScroll, track]) {
        if (el && el !== source && Math.abs(el.scrollLeft - value) > 1) el.scrollLeft = value
      }
      sxTradesHeaderCloneScrollSyncing = false
    }

    mainScroll.addEventListener('scroll', () => applyFrom(mainScroll))
    cloneScroll.addEventListener('scroll', () => applyFrom(cloneScroll))
    window.addEventListener('resize', () => sxSyncTradesHeaderCloneTop())
  }

  function sxSyncTradesHeaderClone() {
    sxBindTradesHeaderCloneScrollSync()
    sxSyncTradesHeaderCloneTop()
    sxSyncTradesHeaderCloneWidths()
  }

  type SxTradeSortKey = 'entryTime' | 'entryRealTime' | 'exitTime' | 'pnl'
  let sxTradesSortKey: SxTradeSortKey = 'exitTime'
  let sxTradesSortDir: 'asc' | 'desc' = 'desc'
  let sxTradesSearch = ''
  let sxTradesPage = 1
  const sxTradesPageSize = 10
  const sxTradesSelected = new Set<string>()

  function sxDefaultHiddenTradesColumns(): Set<string> {
    // No column is selected by default — the user opts in to the columns they want to see.
    return new Set(SX_TRADES_COLUMNS.filter((c) => !c.locked).map((c) => c.id))
  }

  function sxReadTradesHiddenColumns(): Set<string> {
    try {
      const raw = localStorage.getItem(LS_TRADES_HIDDEN_COLUMNS)
      if (!raw) return sxDefaultHiddenTradesColumns()
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        const lockedIds = new Set(SX_TRADES_COLUMNS.filter((c) => c.locked).map((c) => c.id))
        return new Set(arr.filter((id): id is string => typeof id === 'string' && !lockedIds.has(id)))
      }
    } catch {
      /* ignore */
    }
    return sxDefaultHiddenTradesColumns()
  }

  function sxWriteTradesHiddenColumns(hidden: Set<string>) {
    try {
      localStorage.setItem(LS_TRADES_HIDDEN_COLUMNS, JSON.stringify(Array.from(hidden)))
    } catch {
      /* ignore */
    }
  }

  const sxTradesHiddenColumns = sxReadTradesHiddenColumns()
  let sxTradesColPickerSearch = ''

  function sxApplyTradesColumnVisibility() {
    root.querySelectorAll<HTMLElement>('thead [data-sxt-col]').forEach((th) => {
      const id = th.getAttribute('data-sxt-col')
      th.classList.toggle('sxt-col-hidden', !!id && sxTradesHiddenColumns.has(id))
    })
    const emptyRow = root.querySelector<HTMLTableCellElement>('[data-sx-trades-body] .sxt-empty')
    if (emptyRow) emptyRow.setAttribute('colspan', String(SX_TRADES_TOTAL_TABLE_COLUMNS))
    const countEl = root.querySelector<HTMLElement>('[data-sxt-colpicker-count]')
    if (countEl) {
      const visible = SX_TRADES_COLUMNS.length - sxTradesHiddenColumns.size
      countEl.textContent = `${visible} column${visible === 1 ? '' : 's'} selected`
    }
    const toggleAll = root.querySelector<HTMLInputElement>('[data-sxt-colpicker-toggle-all]')
    if (toggleAll) {
      const toggleable = SX_TRADES_COLUMNS.filter((c) => !c.locked)
      const hiddenToggleable = toggleable.filter((c) => sxTradesHiddenColumns.has(c.id)).length
      toggleAll.checked = hiddenToggleable === 0
      toggleAll.indeterminate = hiddenToggleable > 0 && hiddenToggleable < toggleable.length
    }
  }

  function sxRenderColumnPickerList() {
    const listEl = root.querySelector<HTMLElement>('[data-sxt-colpicker-list]')
    if (!listEl) return
    const q = sxTradesColPickerSearch.trim().toLowerCase()
    // Locked columns (e.g. Asset) are always shown in the table and can't be toggled,
    // so they're excluded from the picker entirely — nothing should appear pre-selected.
    const toggleableCols = SX_TRADES_COLUMNS.filter((c) => !c.locked)
    const cols = q ? toggleableCols.filter((c) => c.label.toLowerCase().includes(q)) : toggleableCols
    listEl.innerHTML = cols.length
      ? cols
          .map((c) => {
            const isHidden = sxTradesHiddenColumns.has(c.id)
            return `<label class="sxt-colpicker__row${isHidden ? '' : ' sxt-colpicker__row--checked'}">
                <input type="checkbox" data-sxt-colpicker-col="${c.id}" ${isHidden ? '' : 'checked'} />
                <span>${escapeHtml(c.label)}</span>
              </label>`
          })
          .join('')
      : `<p class="sxt-colpicker__empty">No columns match your search.</p>`
    sxApplyTradesColumnVisibility()
  }

  function sxFormatTradeDate(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '-'
    const d = new Date(seconds * 1000)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  type SxTradeRow = {
    key: string
    sessionId: string
    sessionName: string
    tradeNum: number
    direction: string
    qty: number
    entryPrice: number
    exitPrice: number
    pnl: number
    entryTime: number
    entryRealTime: number
    exitTime: number
    exitReason: string
    initialStopLoss: number | null
    asset: string
    rating: string | undefined
    entryKind: string | undefined
    hasNotes: boolean
    tags: string[]
  }

  function sxCollectTradeRows(): SxTradeRow[] {
    const rows: SxTradeRow[] = []
    for (const session of listSessions()) {
      const closed = session.replayState?.account.closedTrades ?? []
      for (const trade of closed) {
        rows.push({
          key: `${session.id}:${trade.tradeNum}`,
          sessionId: session.id,
          sessionName: session.name,
          tradeNum: trade.tradeNum,
          direction: trade.direction,
          qty: trade.qty,
          entryPrice: trade.entryPrice,
          exitPrice: trade.exitPrice,
          pnl: trade.pnl,
          entryTime: trade.entryTime,
          entryRealTime: trade.entryRealTime ?? trade.entryTime * 1000,
          exitTime: trade.exitTime,
          exitReason: trade.exitReason,
          initialStopLoss: trade.initialStopLoss ?? null,
          asset: primarySessionSymbol(session.assets) || session.assets || '-',
          rating: trade.journal?.rating,
          entryKind: trade.entryKind,
          hasNotes: !!trade.journal?.notes?.trim(),
          tags: trade.journal?.tags ?? [],
        })
      }
    }
    return rows
  }

  function sxAnalyticsStartingBalance(): number {
    const rows = sxCollectTradeRows()
    const sessionIds = new Set(rows.map((r) => r.sessionId))
    let total = 0
    let counted = 0
    for (const session of listSessions()) {
      if (!sessionIds.has(session.id)) continue
      const bal = parseSessionBalanceNumber(session.balance)
      if (bal != null) {
        total += bal
        counted += 1
      }
    }
    return counted > 0 ? total : 100000
  }

  function sxCollectAnalyticsTrades(): SxaTrade[] {
    return sxCollectTradeRows().map((r) => {
      const risk = r.initialStopLoss != null ? Math.abs(r.entryPrice - r.initialStopLoss) : 0
      const reward = r.direction === 'long' ? r.exitPrice - r.entryPrice : r.entryPrice - r.exitPrice
      const returnR = risk > 0 ? reward / risk : null
      const durationMin = Math.max(0, (r.exitTime - r.entryTime) / 60)
      return {
        id: r.key,
        entryTimeMs: r.entryTime * 1000,
        exitTimeMs: r.exitTime * 1000,
        side: r.direction === 'long' ? 'Buy' : 'Sell',
        asset: r.asset,
        tag: r.tags[0] ?? null,
        pnl: r.pnl,
        returnR,
        durationMin,
      }
    })
  }

  function sxTradesSearchFilter(rows: SxTradeRow[]): SxTradeRow[] {
    const q = sxTradesSearch.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.asset.toLowerCase().includes(q) ||
        r.sessionName.toLowerCase().includes(q) ||
        r.direction.toLowerCase().includes(q) ||
        (r.entryKind ?? 'market').toLowerCase().includes(q),
    )
  }

  function sxFormatTradeDateMs(ms: number | undefined): string {
    if (!ms || !Number.isFinite(ms) || ms <= 0) return '-'
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  function sxFormatSignedMoney(v: number): string {
    const sign = v >= 0 ? '+' : '\u2212'
    return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const sxTradesSparkChartRegistry = new WeakMap<HTMLCanvasElement, Chart<'line'>>()

  function sxSyncTradesSparkChart(points: number[]) {
    const canvas = root.querySelector<HTMLCanvasElement>('[data-sxt-spark-canvas]')
    if (!canvas) return
    const labels = points.map((_, i) => `T${i + 1}`)
    let chart = sxTradesSparkChartRegistry.get(canvas)
    if (!chart) {
      const config: ChartConfiguration<'line'> = {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              data: points,
              borderColor: '#1a9d5c',
              backgroundColor: 'rgba(26,157,92,0.08)',
              fill: true,
              tension: 0.3,
              borderWidth: 1.75,
              pointRadius: 2.5,
              pointBackgroundColor: '#1a9d5c',
              pointHoverRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => `Trade ${String(items[0]?.label ?? '').replace('T', '')}`,
                label: (item) => `Equity: ${sxFormatSignedMoney(typeof item.parsed.y === 'number' ? item.parsed.y : 0)}`,
              },
            },
          },
          scales: {
            y: {
              ticks: {
                font: { family: 'IBM Plex Mono', size: 9.5 },
                color: '#a6acb8',
                maxTicksLimit: 3,
                callback: (v) => {
                  const n = typeof v === 'number' ? v : Number(v)
                  return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
                },
              },
              grid: { color: '#f0f1f4' },
              border: { display: false },
            },
            x: {
              ticks: { font: { size: 9.5 }, color: '#a6acb8', maxRotation: 0 },
              grid: { display: false },
              border: { display: false },
            },
          },
        },
      }
      chart = new Chart(canvas, config)
      sxTradesSparkChartRegistry.set(canvas, chart)
      return
    }
    const dataset = chart.data.datasets[0]
    if (dataset) dataset.data = points
    chart.data.labels = labels
    chart.update()
  }

  type SxTradesFilterSetMode = 'and' | 'or'

  type SxTradesFilters = {
    sessionId: string
    sides: Set<string>
    outcomes: Set<'win' | 'loss' | 'breakeven'>
    types: Set<string>
    assets: Set<string>
    // Composite values, e.g. "rating:5" or "tag:Breakout".
    tagsInclude: Set<string>
    tagsIncludeMode: SxTradesFilterSetMode
    tagsExclude: Set<string>
    tagsExcludeMode: SxTradesFilterSetMode
    notes: Set<'with' | 'without'>
    years: Set<number>
    months: Set<number>
    hours: Set<number>
    dateFrom: string
    dateTo: string
  }

  const sxTradesFilters: SxTradesFilters = {
    sessionId: '',
    sides: new Set(),
    outcomes: new Set(),
    types: new Set(),
    assets: new Set(),
    tagsInclude: new Set(),
    tagsIncludeMode: 'and',
    tagsExclude: new Set(),
    tagsExcludeMode: 'and',
    notes: new Set(),
    years: new Set(),
    months: new Set(),
    hours: new Set(),
    dateFrom: '',
    dateTo: '',
  }

  function sxTradeFilterValueMatches(r: SxTradeRow, value: string): boolean {
    if (value.startsWith('rating:')) return (r.rating ?? '') === value.slice(7)
    if (value.startsWith('tag:')) return r.tags.includes(value.slice(4))
    return false
  }

  function sxTradeMatchesValueSet(r: SxTradeRow, set: Set<string>, mode: SxTradesFilterSetMode): boolean {
    const values = Array.from(set)
    if (!values.length) return true
    return mode === 'and' ? values.every((v) => sxTradeFilterValueMatches(r, v)) : values.some((v) => sxTradeFilterValueMatches(r, v))
  }

  function sxTradeOutcome(pnl: number): 'win' | 'loss' | 'breakeven' {
    return pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven'
  }

  function sxTradesFiltersActiveCount(): number {
    return (
      (sxTradesFilters.sessionId ? 1 : 0) +
      sxTradesFilters.sides.size +
      sxTradesFilters.outcomes.size +
      sxTradesFilters.types.size +
      sxTradesFilters.assets.size +
      sxTradesFilters.tagsInclude.size +
      sxTradesFilters.tagsExclude.size +
      sxTradesFilters.notes.size +
      sxTradesFilters.years.size +
      sxTradesFilters.months.size +
      sxTradesFilters.hours.size +
      (sxTradesFilters.dateFrom ? 1 : 0) +
      (sxTradesFilters.dateTo ? 1 : 0)
    )
  }

  function sxApplyTradesFilters(rows: SxTradeRow[]): SxTradeRow[] {
    const fromTs = sxTradesFilters.dateFrom ? new Date(`${sxTradesFilters.dateFrom}T00:00:00`).getTime() / 1000 : null
    const toTs = sxTradesFilters.dateTo ? new Date(`${sxTradesFilters.dateTo}T23:59:59`).getTime() / 1000 : null
    return rows.filter((r) => {
      if (sxTradesFilters.sessionId && r.sessionId !== sxTradesFilters.sessionId) return false
      if (sxTradesFilters.sides.size && !sxTradesFilters.sides.has(r.direction)) return false
      if (sxTradesFilters.outcomes.size && !sxTradesFilters.outcomes.has(sxTradeOutcome(r.pnl))) return false
      if (sxTradesFilters.types.size && !sxTradesFilters.types.has(r.entryKind ?? 'market')) return false
      if (sxTradesFilters.assets.size && !sxTradesFilters.assets.has(r.asset)) return false
      if (
        sxTradesFilters.tagsInclude.size &&
        !sxTradeMatchesValueSet(r, sxTradesFilters.tagsInclude, sxTradesFilters.tagsIncludeMode)
      )
        return false
      if (
        sxTradesFilters.tagsExclude.size &&
        sxTradeMatchesValueSet(r, sxTradesFilters.tagsExclude, sxTradesFilters.tagsExcludeMode)
      )
        return false
      if (sxTradesFilters.notes.size) {
        const wantWith = sxTradesFilters.notes.has('with')
        const wantWithout = sxTradesFilters.notes.has('without')
        if (wantWith && !wantWithout && !r.hasNotes) return false
        if (wantWithout && !wantWith && r.hasNotes) return false
      }
      const entryDate = new Date(r.entryTime * 1000)
      if (sxTradesFilters.years.size && !sxTradesFilters.years.has(entryDate.getFullYear())) return false
      if (sxTradesFilters.months.size && !sxTradesFilters.months.has(entryDate.getMonth())) return false
      if (sxTradesFilters.hours.size && !sxTradesFilters.hours.has(entryDate.getHours())) return false
      if (fromTs != null && r.entryTime < fromTs) return false
      if (toTs != null && r.entryTime > toTs) return false
      return true
    })
  }

  function sxCurrentTradeRows(): SxTradeRow[] {
    const allRows = sxCollectTradeRows()
    const filtered = sxApplyTradesFilters(allRows)
    const searched = sxTradesSearchFilter(filtered)
    const dir = sxTradesSortDir === 'asc' ? 1 : -1
    searched.sort((a, b) => (a[sxTradesSortKey] - b[sxTradesSortKey]) * dir)
    return searched
  }

  function syncTradesUi() {
    const body = root.querySelector('[data-sx-trades-body]')
    if (!body) return

    const allRows = sxCollectTradeRows()
    const rows = sxCurrentTradeRows()

    // Drop selection entries that no longer exist in the dataset at all.
    const allKeys = new Set(allRows.map((r) => r.key))
    for (const key of Array.from(sxTradesSelected)) {
      if (!allKeys.has(key)) sxTradesSelected.delete(key)
    }

    sxSyncTradesSessionOptions(allRows)
    sxSyncTradesFiltersToggleBadge()
    sxSyncTradesKpis(rows)
    sxApplyTradesColumnVisibility()

    const pageCount = Math.max(1, Math.ceil(rows.length / sxTradesPageSize))
    if (sxTradesPage > pageCount) sxTradesPage = pageCount
    if (sxTradesPage < 1) sxTradesPage = 1
    const pageStart = (sxTradesPage - 1) * sxTradesPageSize
    const pageRows = rows.slice(pageStart, pageStart + sxTradesPageSize)

    if (rows.length === 0) {
      body.innerHTML = `<tr>
        <td colspan="21" class="sxt-empty">No closed trades yet. Resume a session and close positions to see them here.</td>
      </tr>`
    } else {
      body.innerHTML = pageRows
        .map((t) => {
          const isGain = t.pnl >= 0
          const side = t.direction === 'long' ? 'Buy' : 'Sell'
          const sideCls = t.direction === 'long' ? 'sxt-side-buy' : 'sxt-side-sell'
          const risk = t.initialStopLoss != null ? Math.abs(t.entryPrice - t.initialStopLoss) : 0
          const reward = t.direction === 'long' ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice
          const rMultiple = risk > 0 ? reward / risk : null
          const returnPct = t.entryPrice * t.qty !== 0 ? (t.pnl / (t.entryPrice * t.qty)) * 100 : 0
          const takeProfit = t.exitReason === 'take_profit' ? t.exitPrice : null
          const checked = sxTradesSelected.has(t.key)
          const hc = (id: string) => (sxTradesHiddenColumns.has(id) ? ' sxt-col-hidden' : '')
          return `<tr class="${checked ? 'sxt-row-selected' : ''}">
          <td class="sxt-sticky-col sxt-col-check${hc('check')}" data-sxt-col="check"><input type="checkbox" class="sxt-row-check sxt-row-select" data-sx-trades-row-select="${escapeHtml(t.key)}" ${checked ? 'checked' : ''} aria-label="Select trade" /></td>
          <td class="sxt-sticky-col sxt-col-asset sxt-asset-cell${hc('asset')}" data-sxt-col="asset"><span class="sxt-ticker">${escapeHtml(t.asset)}</span></td>
          <td class="${hc('side')}" data-sxt-col="side"><span class="${sideCls}">${side}</span></td>
          <td class="sxt-group-divide${hc('session')}" data-sxt-col="session">${escapeHtml(t.sessionName)}</td>
          <td class="${hc('type')}" data-sxt-col="type"><span class="sxt-status-pill">Closed</span></td>
          <td class="sxt-muted${hc('source')}" data-sxt-col="source">Replay</td>
          <td class="${hc('entryType')}" data-sxt-col="entryType"><span class="sxt-entry-type-pill">${escapeHtml(t.entryKind ?? 'market')}</span></td>
          <td class="sxt-mono${hc('entryRealtime')}" data-sxt-col="entryRealtime">${sxFormatTradeDateMs(t.entryRealTime)}</td>
          <td class="sxt-mono sxt-muted${hc('entryChart')}" data-sxt-col="entryChart">${sxFormatTradeDate(t.entryTime)}</td>
          <td class="sxt-num sxt-mono sxt-group-divide${hc('entryPrice')}" data-sxt-col="entryPrice">${escapeHtml(String(t.entryPrice))}</td>
          <td class="sxt-num sxt-mono${hc('size')}" data-sxt-col="size">${escapeHtml(String(t.qty))}</td>
          <td class="sxt-num sxt-mono sxt-group-divide${hc('stopLoss')}" data-sxt-col="stopLoss" style="color:var(--sxt-loss)">${t.initialStopLoss != null ? escapeHtml(String(t.initialStopLoss)) : '\u2014'}</td>
          <td class="sxt-num sxt-mono${hc('takeProfit')}" data-sxt-col="takeProfit" style="color:${takeProfit != null ? 'var(--sxt-gain)' : 'var(--sxt-ink-300)'}">${takeProfit != null ? escapeHtml(String(takeProfit)) : '\u2014'}</td>
          <td class="sxt-mono sxt-group-divide${hc('exitDate')}" data-sxt-col="exitDate">${sxFormatTradeDate(t.exitTime)}</td>
          <td class="sxt-num sxt-mono${hc('exitPrice')}" data-sxt-col="exitPrice">${escapeHtml(String(t.exitPrice))}</td>
          <td class="sxt-num sxt-mono sxt-return-value ${isGain ? 'sxt-gain' : 'sxt-loss'} sxt-group-divide${hc('returnUsd')}" data-sxt-col="returnUsd">${sxFormatSignedMoney(t.pnl)}</td>
          <td class="sxt-num sxt-mono sxt-return-value ${isGain ? 'sxt-gain' : 'sxt-loss'}${hc('returnPct')}" data-sxt-col="returnPct">${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%</td>
          <td class="sxt-num sxt-mono sxt-r-value ${rMultiple != null && rMultiple >= 0 ? 'sxt-gain' : rMultiple != null ? 'sxt-loss' : ''}${hc('returnR')}" data-sxt-col="returnR">${rMultiple != null ? `${rMultiple >= 0 ? '+' : ''}${rMultiple.toFixed(2)}R` : '\u2014'}</td>
          <td class="sxt-muted${hc('rating')}" data-sxt-col="rating">${t.rating ?? '\u2014'}</td>
          <td class="sxt-num sxt-mono sxt-pnl-value ${isGain ? 'sxt-gain' : 'sxt-loss'}${hc('grossPnl')}" data-sxt-col="grossPnl">${sxFormatSignedMoney(t.pnl)}</td>
          <td class="sxt-num sxt-mono sxt-muted${hc('fees')}" data-sxt-col="fees">0</td>
        </tr>`
        })
        .join('')
    }

    sxSyncTradesSelectionUi(rows, pageRows.length)
    sxRenderTradesPagination(pageCount)

    requestAnimationFrame(() => {
      syncTradesFixedScrollbar()
      sxSyncTradesHeaderClone()
    })
  }

  function sxSyncTradesKpis(rows: SxTradeRow[]) {
    const setKpi = (key: string, value: string, cls?: 'sxt-gain' | 'sxt-loss') => {
      const el = root.querySelector<HTMLElement>(`[data-sxt-kpi="${key}"]`)
      if (!el) return
      el.textContent = value
      el.classList.remove('sxt-gain', 'sxt-loss')
      if (cls) el.classList.add(cls)
    }

    const count = rows.length
    const wins = rows.filter((r) => r.pnl > 0).length
    const losses = rows.filter((r) => r.pnl < 0).length
    const netPnl = rows.reduce((sum, r) => sum + r.pnl, 0)
    const winRate = count > 0 ? (wins / count) * 100 : 0
    const rValues = rows
      .map((r) => {
        const risk = r.initialStopLoss != null ? Math.abs(r.entryPrice - r.initialStopLoss) : 0
        const reward = r.direction === 'long' ? r.exitPrice - r.entryPrice : r.entryPrice - r.exitPrice
        return risk > 0 ? reward / risk : null
      })
      .filter((v): v is number => v != null)
    const avgR = rValues.length ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0
    const bestR = rValues.length ? Math.max(...rValues) : null
    const worstR = rValues.length ? Math.min(...rValues) : null

    const assets = new Set(rows.map((r) => r.asset))
    const assetLabel = assets.size === 0 ? '\u2014' : assets.size === 1 ? Array.from(assets)[0] : `${assets.size} assets`

    setKpi('count', String(count))
    const countSub = root.querySelector<HTMLElement>('[data-sxt-kpi="count-sub"]')
    if (countSub) countSub.textContent = count > 0 ? `All closed \u00b7 ${assetLabel}` : '\u00a0'

    setKpi('netpnl', sxFormatSignedMoney(netPnl), netPnl > 0 ? 'sxt-gain' : netPnl < 0 ? 'sxt-loss' : undefined)
    const netpnlSub = root.querySelector<HTMLElement>('[data-sxt-kpi="netpnl-sub"]')
    if (netpnlSub) netpnlSub.textContent = count > 0 ? `${wins} win${wins === 1 ? '' : 's'} \u00b7 ${losses} loss${losses === 1 ? '' : 'es'}` : '\u00a0'

    setKpi('winrate', `${winRate.toFixed(0)}%`)
    const winrateSub = root.querySelector<HTMLElement>('[data-sxt-kpi="winrate-sub"]')
    if (winrateSub) winrateSub.textContent = count > 0 ? `${wins} of ${count} trades` : '\u00a0'

    setKpi('avgr', `${avgR >= 0 ? '' : ''}${avgR.toFixed(2)}R`)
    const avgrSub = root.querySelector<HTMLElement>('[data-sxt-kpi="avgr-sub"]')
    if (avgrSub) {
      avgrSub.textContent =
        bestR != null && worstR != null
          ? `Best ${bestR >= 0 ? '+' : ''}${bestR.toFixed(2)}R \u00b7 Worst ${worstR >= 0 ? '+' : ''}${worstR.toFixed(2)}R`
          : '\u00a0'
    }

    const ordered = [...rows].sort((a, b) => a.exitTime - b.exitTime)
    let cumulative = 0
    const points = ordered.map((r) => (cumulative += r.pnl))
    const sparkEndEl = root.querySelector<HTMLElement>('[data-sxt-kpi="spark-end"]')
    if (sparkEndEl) {
      const end = points.length ? points[points.length - 1]! : 0
      sparkEndEl.textContent = sxFormatSignedMoney(end)
      sparkEndEl.classList.toggle('sxt-loss', end < 0)
    }
    sxSyncTradesSparkChart(points)
  }

  function sxSyncTradesSelectionUi(rows: SxTradeRow[], pageRowCount: number) {
    const selectAllBox = root.querySelector<HTMLInputElement>('[data-sx-trades-select-all]')
    const rowBoxes = Array.from(root.querySelectorAll<HTMLInputElement>('.sxt-row-select'))
    const checkedCount = sxTradesSelected.size
    const visibleChecked = rowBoxes.filter((b) => b.checked).length

    if (selectAllBox) {
      selectAllBox.checked = rowBoxes.length > 0 && visibleChecked === rowBoxes.length
      selectAllBox.indeterminate = visibleChecked > 0 && visibleChecked < rowBoxes.length
    }

    const footerDefault = root.querySelector<HTMLElement>('[data-sx-trades-footer-default]')
    const footerSelected = root.querySelector<HTMLElement>('[data-sx-trades-footer-selected]')
    const selectedCountEl = root.querySelector<HTMLElement>('[data-sx-trades-selected-count]')

    if (checkedCount > 0) {
      footerDefault?.classList.add('hidden')
      footerSelected?.classList.remove('hidden')
      if (selectedCountEl) selectedCountEl.textContent = String(checkedCount)
    } else {
      footerDefault?.classList.remove('hidden')
      footerSelected?.classList.add('hidden')
      if (footerDefault) {
        footerDefault.textContent =
          rows.length === 0
            ? '0 rows'
            : `Displaying ${pageRowCount} of ${rows.length} row${rows.length === 1 ? '' : 's'}`
      }
    }
  }

  function sxExportTrades(rows: SxTradeRow[]) {
    if (rows.length === 0) return
    const headers = [
      'Session',
      'Type',
      'Source',
      'Entry Date (Realtime)',
      'Entry Date (Chart)',
      'Asset',
      'Side',
      'Entry Type',
      'Entry Price',
      'Size',
      'Stop Loss',
      'Take Profit',
      'Exit Date',
      'Exit Price',
      'Return ($)',
      'Return (%)',
      'Return (R)',
      'Trade Rating',
      'Gross PnL',
      'Fees',
    ]
    const lines = [headers.join(',')]
    for (const t of rows) {
      const risk = t.initialStopLoss != null ? Math.abs(t.entryPrice - t.initialStopLoss) : 0
      const reward = t.direction === 'long' ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice
      const rMultiple = risk > 0 ? reward / risk : null
      const returnPct = t.entryPrice * t.qty !== 0 ? (t.pnl / (t.entryPrice * t.qty)) * 100 : 0
      const takeProfit = t.exitReason === 'take_profit' ? t.exitPrice : null
      const cells = [
        t.sessionName,
        'Closed',
        'Replay',
        sxFormatTradeDateMs(t.entryRealTime),
        sxFormatTradeDate(t.entryTime),
        t.asset,
        t.direction === 'long' ? 'Buy' : 'Sell',
        t.entryKind ?? 'market',
        String(t.entryPrice),
        String(t.qty),
        t.initialStopLoss != null ? String(t.initialStopLoss) : '',
        takeProfit != null ? String(takeProfit) : '',
        sxFormatTradeDate(t.exitTime),
        String(t.exitPrice),
        sxFormatSignedMoney(t.pnl),
        `${returnPct.toFixed(2)}%`,
        rMultiple != null ? rMultiple.toFixed(2) : '',
        t.rating ?? '',
        sxFormatSignedMoney(t.pnl),
        '0',
      ]
      lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trades-export-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function sxDeleteSelectedTrades() {
    const bySession = new Map<string, Set<number>>()
    for (const key of sxTradesSelected) {
      const idx = key.lastIndexOf(':')
      if (idx < 0) continue
      const sessionId = key.slice(0, idx)
      const tradeNum = Number(key.slice(idx + 1))
      if (!Number.isFinite(tradeNum)) continue
      if (!bySession.has(sessionId)) bySession.set(sessionId, new Set())
      bySession.get(sessionId)!.add(tradeNum)
    }
    for (const [sessionId, tradeNums] of bySession) {
      const session = getSession(sessionId)
      if (!session?.replayState) continue
      const closedTrades = (session.replayState.account.closedTrades ?? []).filter((tr) => !tradeNums.has(tr.tradeNum))
      updateSessionReplay(sessionId, {
        ...session.replayState,
        account: { ...session.replayState.account, closedTrades },
      })
    }
    sxTradesSelected.clear()
    syncRecentSessionsUi()
    syncTradesUi()
  }

  function sxRenderTradesPagination(pageCount: number) {
    const host = root.querySelector<HTMLElement>('[data-sx-trades-pagination]')
    if (!host) return

    const nav = (dir: 'first' | 'prev' | 'next' | 'last', label: string, disabled: boolean) =>
      `<button type="button" class="sxt-page-nav" data-sx-trades-page-nav="${dir}" ${disabled ? 'disabled' : ''} aria-label="${dir} page">${label}</button>`

    const atFirst = sxTradesPage <= 1
    const atLast = sxTradesPage >= pageCount

    const buttons: string[] = []
    const windowSize = 5
    let start = Math.max(1, sxTradesPage - Math.floor(windowSize / 2))
    const end = Math.min(pageCount, start + windowSize - 1)
    start = Math.max(1, end - windowSize + 1)
    for (let p = start; p <= end; p += 1) {
      buttons.push(
        `<button type="button" data-sx-trades-page="${p}" class="${p === sxTradesPage ? 'sxt-page-btn--active' : ''}">${p}</button>`,
      )
    }

    host.innerHTML = [
      nav('first', '&laquo;', atFirst),
      nav('prev', '&lsaquo;', atFirst),
      ...buttons,
      nav('next', '&rsaquo;', atLast),
      nav('last', '&raquo;', atLast),
    ].join('')
  }

  function sxSyncTradesSessionOptions(rows: SxTradeRow[]) {
    const select = root.querySelector<HTMLSelectElement>('[data-sx-trades-session-filter]')
    if (!select) return
    const seen = new Map<string, string>()
    for (const r of rows) seen.set(r.sessionId, r.sessionName)
    const current = select.value
    select.innerHTML =
      `<option value="">All sessions</option>` +
      Array.from(seen.entries())
        .map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`)
        .join('')
    if (seen.has(current)) select.value = current
  }

  function sxSyncTradesFiltersToggleBadge() {
    const count = sxTradesFiltersActiveCount()
    const badge = root.querySelector<HTMLElement>('[data-sx-trades-filters-count]')
    if (badge) {
      badge.textContent = String(count)
      badge.classList.toggle('hidden', count === 0)
    }
    const clearAllBtn = root.querySelector<HTMLElement>('[data-sx-trades-clear-all]')
    if (clearAllBtn) clearAllBtn.classList.toggle('hidden', count === 0)
  }

  let sxTradesFilterTab: 'basic' | 'tags' = 'basic'
  let sxTradesFilterSearch = ''
  const sxTradesAccordionOpen = new Set<string>(['assets', 'rating'])

  // "Tags" tab (Include/Exclude) UI state.
  let sxTradesTagsOpenDropdown: 'include' | 'exclude' | null = null
  const sxTradesTagsSearch: Record<'include' | 'exclude', string> = { include: '', exclude: '' }

  function sxTradesTagsOptionGroups(): { label: string; value: string; itemLabel: string }[] {
    const allRows = sxCollectTradeRows()
    const ratingIds = Array.from(new Set(allRows.map((r) => r.rating).filter((v): v is string => !!v))).sort(
      (a, b) => Number(b) - Number(a),
    )
    const tagSet = new Set<string>()
    for (const r of allRows) for (const tag of r.tags) tagSet.add(tag)
    return [
      ...ratingIds.map((id) => ({ label: 'Trade Rating', value: `rating:${id}`, itemLabel: SX_TRADE_RATING_LABELS[id] ?? `${id} / 5` })),
      ...Array.from(tagSet).map((tag) => ({ label: 'Tags', value: `tag:${tag}`, itemLabel: tag })),
    ]
  }

  function sxRenderTradesTagsDropdown(kind: 'include' | 'exclude'): string {
    const selected = kind === 'include' ? sxTradesFilters.tagsInclude : sxTradesFilters.tagsExclude
    const mode = kind === 'include' ? sxTradesFilters.tagsIncludeMode : sxTradesFilters.tagsExcludeMode
    const isOpen = sxTradesTagsOpenDropdown === kind
    const q = sxTradesTagsSearch[kind].trim().toLowerCase()
    const allOptions = sxTradesTagsOptionGroups()
    const options = q ? allOptions.filter((o) => o.itemLabel.toLowerCase().includes(q)) : allOptions
    const groups: { label: string; items: { value: string; itemLabel: string }[] }[] = []
    for (const opt of options) {
      let group = groups.find((g) => g.label === opt.label)
      if (!group) {
        group = { label: opt.label, items: [] }
        groups.push(group)
      }
      group.items.push(opt)
    }
    const allValues = allOptions.map((o) => o.value)
    const checkedCount = allValues.filter((v) => selected.has(v)).length
    const summary = selected.size
      ? `${selected.size} selected`
      : 'Select tags'

    return `<div class="sxt-tagsfilter__row">
        <span class="sxt-tagsfilter__label">${kind === 'include' ? 'Include' : 'Exclude'}</span>
        <div class="sxt-tagsfilter__modes">
          <button type="button" class="sxt-tagsfilter__mode${mode === 'and' ? ' sxt-tagsfilter__mode--active' : ''}" data-sx-trades-tags-mode-btn="${kind}:and">AND</button>
          <button type="button" class="sxt-tagsfilter__mode${mode === 'or' ? ' sxt-tagsfilter__mode--active' : ''}" data-sx-trades-tags-mode-btn="${kind}:or">OR</button>
        </div>
      </div>
      <div class="sxt-tagsfilter__dropdown${isOpen ? ' sxt-tagsfilter__dropdown--open' : ''}" data-sx-trades-tags-dropdown="${kind}">
        <button type="button" class="sxt-tagsfilter__trigger" data-sx-trades-tags-trigger="${kind}">
          <span class="${selected.size ? '' : 'sxt-tagsfilter__trigger-placeholder'}">${escapeHtml(summary)}</span>
          <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
        </button>
        ${
          isOpen
            ? `<div class="sxt-tagsfilter__panel" data-sx-trades-tags-panel="${kind}">
              <div class="sxt-tagsfilter__panel-search">
                <input type="checkbox" data-sx-trades-tags-toggle-all="${kind}" ${
                  allValues.length && checkedCount === allValues.length ? 'checked' : ''
                } />
                <div class="sxt-tagsfilter__panel-searchbox">
                  <input type="text" placeholder="Search" value="${escapeHtml(sxTradesTagsSearch[kind])}" data-sx-trades-tags-search="${kind}" />
                  <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                </div>
              </div>
              <div class="sxt-tagsfilter__panel-list">
                ${
                  groups.length
                    ? groups
                        .map(
                          (g) => `<div class="sxt-tagsfilter__group-label">${escapeHtml(g.label)}</div>${g.items
                            .map(
                              (item) => `<label class="sx-dash-trades-checkbox sxt-tagsfilter__item">
                            <input type="checkbox" data-sx-trades-tags-check="${kind}" value="${escapeHtml(item.value)}"${
                                selected.has(item.value) ? ' checked' : ''
                              } />
                            <span>${escapeHtml(item.itemLabel)}</span>
                          </label>`,
                            )
                            .join('')}`,
                        )
                        .join('')
                    : `<p class="sxt-tagsfilter__empty">No options available.</p>`
                }
              </div>
            </div>`
            : ''
        }
      </div>`
  }

  function sxRenderTradesFilterSection(opts: {
    id: string
    label: string
    items: { value: string; label: string }[]
    selected: Set<string>
  }): string {
    const open = sxTradesAccordionOpen.has(opts.id)
    const q = sxTradesFilterSearch.trim().toLowerCase()
    const items = q ? opts.items.filter((i) => i.label.toLowerCase().includes(q)) : opts.items
    return `<div class="sx-dash-trades-accordion${open ? ' sx-dash-trades-accordion--open' : ''}" data-sx-trades-accordion="${opts.id}">
      <button type="button" class="sx-dash-trades-accordion__head" data-sx-trades-accordion-toggle="${opts.id}">
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        <span>${escapeHtml(opts.label)}</span>
        ${opts.selected.size ? `<span class="sx-dash-trades-accordion__badge">${opts.selected.size}</span>` : ''}
      </button>
      <div class="sx-dash-trades-accordion__body">
        ${
          items.length
            ? items
                .map(
                  (item) => `<label class="sx-dash-trades-checkbox">
                <input type="checkbox" data-sx-trades-filter-check="${opts.id}" value="${escapeHtml(item.value)}"${opts.selected.has(item.value) ? ' checked' : ''} />
                <span>${escapeHtml(item.label)}</span>
              </label>`,
                )
                .join('')
            : `<p class="sx-dash-trades-accordion__empty">No options</p>`
        }
      </div>
    </div>`
  }

  function sxRenderTradesFiltersBody() {
    const bodyEl = root.querySelector<HTMLElement>('[data-sx-trades-filters-body]')
    if (!bodyEl) return
    const allRows = sxCollectTradeRows()

    if (sxTradesFilterTab === 'tags') {
      bodyEl.innerHTML = `<div class="sxt-tagsfilter">
        ${sxRenderTradesTagsDropdown('include')}
        <div class="sxt-tagsfilter__divider"><span>AND</span></div>
        ${sxRenderTradesTagsDropdown('exclude')}
      </div>`
      return
    }

    const assetItems = Array.from(new Set(allRows.map((r) => r.asset))).map((a) => ({ value: a, label: a }))
    const years = Array.from(new Set(allRows.map((r) => new Date(r.entryTime * 1000).getFullYear()))).sort((a, b) => b - a)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthsPresent = Array.from(new Set(allRows.map((r) => new Date(r.entryTime * 1000).getMonth()))).sort((a, b) => a - b)

    bodyEl.innerHTML = [
      sxRenderTradesFilterSection({
        id: 'notes',
        label: 'Notes',
        items: [
          { value: 'with', label: 'With Notes' },
          { value: 'without', label: 'Without Notes' },
        ],
        selected: sxTradesFilters.notes,
      }),
      sxRenderTradesFilterSection({ id: 'assets', label: 'Assets', items: assetItems, selected: sxTradesFilters.assets }),
      sxRenderTradesFilterSection({
        id: 'side',
        label: 'Side',
        items: [
          { value: 'long', label: 'Long' },
          { value: 'short', label: 'Short' },
        ],
        selected: sxTradesFilters.sides,
      }),
      sxRenderTradesFilterSection({
        id: 'outcome',
        label: 'Outcome',
        items: [
          { value: 'win', label: 'Win' },
          { value: 'loss', label: 'Lose' },
          { value: 'breakeven', label: 'Breakeven' },
        ],
        selected: sxTradesFilters.outcomes,
      }),
      sxRenderTradesFilterSection({
        id: 'type',
        label: 'Entry type',
        items: [
          { value: 'market', label: 'Market' },
          { value: 'limit', label: 'Limit' },
          { value: 'stop', label: 'Stop' },
        ],
        selected: sxTradesFilters.types,
      }),
      sxRenderTradesDateRangeSection(),
      sxRenderTradesFilterSection({
        id: 'year',
        label: 'Year',
        items: years.map((y) => ({ value: String(y), label: String(y) })),
        selected: new Set(Array.from(sxTradesFilters.years).map(String)),
      }),
      sxRenderTradesFilterSection({
        id: 'month',
        label: 'Month',
        items: monthsPresent.map((m) => ({ value: String(m), label: monthNames[m]! })),
        selected: new Set(Array.from(sxTradesFilters.months).map(String)),
      }),
      sxRenderTradesFilterSection({
        id: 'hour',
        label: 'Hour of the day',
        items: Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` })),
        selected: new Set(Array.from(sxTradesFilters.hours).map(String)),
      }),
    ].join('')
  }

  function sxRenderTradesDateRangeSection(): string {
    const id = 'daterange'
    const open = sxTradesAccordionOpen.has(id)
    const activeCount = (sxTradesFilters.dateFrom ? 1 : 0) + (sxTradesFilters.dateTo ? 1 : 0)
    return `<div class="sx-dash-trades-accordion${open ? ' sx-dash-trades-accordion--open' : ''}" data-sx-trades-accordion="${id}">
      <button type="button" class="sx-dash-trades-accordion__head" data-sx-trades-accordion-toggle="${id}">
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        <span>Date range</span>
        ${activeCount ? `<span class="sx-dash-trades-accordion__badge">${activeCount}</span>` : ''}
      </button>
      <div class="sx-dash-trades-accordion__body">
        <div class="sx-dash-trades-date-range">
          <label>From
            <input type="date" data-sx-trades-filter-date="from" value="${escapeHtml(sxTradesFilters.dateFrom)}" />
          </label>
          <label>To
            <input type="date" data-sx-trades-filter-date="to" value="${escapeHtml(sxTradesFilters.dateTo)}" />
          </label>
        </div>
      </div>
    </div>`
  }

  function sxOpenTradesFiltersPanel(open: boolean) {
    const panel = root.querySelector<HTMLElement>('[data-sx-trades-filters-panel]')
    const backdrop = root.querySelector<HTMLElement>('[data-sx-trades-filters-backdrop]')
    if (!panel) return
    panel.classList.toggle('hidden', !open)
    backdrop?.classList.toggle('hidden', !open)
    root.querySelectorAll<HTMLButtonElement>('[data-sx-trades-filter-tab]').forEach((btn) => {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false')
    })
    if (open) {
      sxRenderTradesFiltersBody()
    }
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
    hideTradesFixedBar()
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
    const label = tier === 'pro' ? 'Premium Plan user' : tier === 'intermediate' ? 'Ultra Plan user' : 'Free user'
    const planTag = tier === 'pro' ? 'Premium' : tier === 'intermediate' ? 'Ultra' : 'Basic'
    const planNote = tier === 'pro' ? '(Full access)' : tier === 'intermediate' ? '(Upgraded)' : '(Always free)'
    const badge = root.querySelector('#sx-dash-plan-badge')
    if (badge) badge.textContent = label
    root.querySelectorAll<HTMLElement>('[data-sx-account-plan]').forEach((el) => {
      el.textContent = planTag
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
    root.querySelectorAll<HTMLElement>('[data-sx-account-plan-note]').forEach((el) => {
      el.textContent = planNote
      el.classList.toggle('sx-dash-account-static__note--pro', tier !== 'free')
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
    closeColumnPicker()
  }

  function closeColumnPicker() {
    const wrap = root.querySelector<HTMLElement>('[data-sxt-colpicker]')
    if (!wrap) return
    const panel = wrap.querySelector<HTMLElement>('[data-sxt-colpicker-panel]')
    const trigger = wrap.querySelector<HTMLButtonElement>('[data-sx-trades-edit]')
    panel?.classList.add('hidden')
    trigger?.setAttribute('aria-expanded', 'false')
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
    const longPctPrecise = directed > 0 ? (pulse.longTrades / directed) * 100 : 50
    const shortPctPrecise = directed > 0 ? 100 - longPctPrecise : 50

    const practiceText = formatPulseDuration(pulse.practiceMs)
    const histText = formatPulseDuration(pulse.historicalMs)
    const practiceHintText = pulse.sessionsTouched
      ? `${pulse.sessionsTouched} session${pulse.sessionsTouched === 1 ? '' : 's'} · Active ${formatPulseDuration(pulse.activePracticeMs)}`
      : 'Across sessions'
    const practiceInfoText = 'Total real-world time you spent actively practicing across your sessions in this range.'
    // Floor the practice time to the same 1-minute granularity the "Time Invested" KPI
    // displays (formatPulseDuration never shows less than 1m). Dividing by the raw,
    // sub-minute practice duration produced wildly inflated multipliers (e.g. 378210×)
    // that didn't line up with the "1m" the user actually sees on screen.
    const histMultiplierPracticeFloorMs = 60_000
    const histMultiplier =
      pulse.practiceMs > 0 && pulse.historicalMs > 0
        ? Math.max(1, Math.round(pulse.historicalMs / Math.max(pulse.practiceMs, histMultiplierPracticeFloorMs)))
        : null
    const histMultiplierText = histMultiplier != null ? histMultiplier.toLocaleString(undefined) : null
    const histHintText = histMultiplierText != null ? `${histMultiplierText}× tape vs practice` : 'Historical coverage'
    const histInfoText =
      histMultiplierText != null
        ? `The market history you loaded is ${histMultiplierText}× longer than the actual time you spent practicing on it.`
        : 'Compares the historical market time you loaded against the actual time you spent practicing on it.'
    const pnlText = pnlTotals.hasData ? formatDashboardPerfMoney(pnlTotals.netPnl) : '—'
    const pnlHintText = pnlTotals.hasData
      ? `${pnlTotals.sessionsActive} session${pnlTotals.sessionsActive === 1 ? '' : 's'} · ${pnlTotals.tradesTaken} trades`
      : 'Backtest results'
    const pnlInfoText = 'Net profit or loss from your backtest results across sessions in this range.'
    const winrateText = formatDashboardWinRate(pulse.winRate)
    const winrateHintText =
      pulse.tradesTaken > 0
        ? `${pulse.wins}W / ${pulse.losses}L on ${pulse.tradesTaken}`
        : 'Closed trade edge'
    const winrateInfoText = 'Share of your closed journal trades that ended as wins.'

    root.querySelectorAll<HTMLElement>('[data-sx-pulse="practice"]').forEach((el) => {
      el.textContent = practiceText
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="historical"]').forEach((el) => {
      el.textContent = histText
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="practice-hint"]').forEach((el) => {
      el.textContent = practiceHintText
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="practice-info"]').forEach((el) => {
      el.setAttribute('data-tip', practiceInfoText)
      el.setAttribute('aria-label', practiceInfoText)
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="historical-hint"]').forEach((el) => {
      el.textContent = histHintText
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="historical-info"]').forEach((el) => {
      el.setAttribute('data-tip', histInfoText)
      el.setAttribute('aria-label', histInfoText)
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="pnl"]').forEach((el) => {
      el.textContent = pnlText
      el.classList.toggle('sx-dash-pulse__kpi-value--ok', pnlTotals.hasData && pnlTotals.netPnl > 0)
      el.classList.toggle('sx-dash-pulse__kpi-value--warn', pnlTotals.hasData && pnlTotals.netPnl < 0)
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="pnl-hint"]').forEach((el) => {
      el.textContent = pnlHintText
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="pnl-info"]').forEach((el) => {
      el.setAttribute('data-tip', pnlInfoText)
      el.setAttribute('aria-label', pnlInfoText)
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
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="winrate-info"]').forEach((el) => {
      el.setAttribute('data-tip', winrateInfoText)
      el.setAttribute('aria-label', winrateInfoText)
    })

    // Several of these hosts appear on both the Dashboard and Analytics pages.
    const pulseHosts = (key: string) => root.querySelectorAll<HTMLElement>(`[data-sx-pulse="${key}"]`)

    pulseHosts('active-session').forEach((el) => {
      if (pulse.activeSessionName) {
        el.textContent = `Active · ${pulse.activeSessionName} · ${formatPulseDuration(pulse.activePracticeMs)}`
        el.title = `${pulse.activeSessionName} — ${formatPulseDuration(pulse.activePracticeMs)} practice`
      } else {
        el.textContent = 'No active session'
        el.removeAttribute('title')
      }
    })
    const practiceSplitHtml = buildPulsePracticeSplitHtml(pulse.sessionPractice)
    pulseHosts('practice-split').forEach((el) => {
      el.innerHTML = practiceSplitHtml
    })
    const practiceRowsHtml = buildPulsePracticeRowsHtml(pulse.sessionPractice)
    pulseHosts('practice-sessions').forEach((el) => {
      el.innerHTML = practiceRowsHtml
    })
    const tradesText =
      pulse.tradesTaken > 0
        ? `${pulse.tradesTaken} trade${pulse.tradesTaken === 1 ? '' : 's'} · ${pulse.wins}W / ${pulse.losses}L`
        : 'No closed trades yet'
    pulseHosts('trades').forEach((el) => {
      el.textContent = tradesText
    })
    const splitLabelText =
      directed > 0 ? `${longPct}% buys · ${shortPct}% sells` : 'Buys / sells appear after journal closes'
    pulseHosts('split-label').forEach((el) => {
      el.textContent = splitLabelText
    })
    pulseHosts('long-bar').forEach((el) => {
      el.style.width = `${longPct}%`
    })
    pulseHosts('short-bar').forEach((el) => {
      el.style.width = `${shortPct}%`
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="trades-count"]').forEach((el) => {
      el.textContent = `${pulse.tradesTaken}`
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="trades-wl"]').forEach((el) => {
      el.textContent = `${pulse.wins}W / ${pulse.losses}L`
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="trades-long-pct"]').forEach((el) => {
      el.textContent = `${longPctPrecise.toFixed(2)}%`
    })
    root.querySelectorAll<HTMLElement>('[data-sx-pulse="trades-short-pct"]').forEach((el) => {
      el.textContent = `${shortPctPrecise.toFixed(2)}%`
    })
    const ringHtml = buildPulseWinRingSvg(pulse.winRate)
    pulseHosts('ring').forEach((el) => {
      el.innerHTML = ringHtml
    })
    const activityHtml = buildPulseActivityChartSvg(pulse.practiceDays)
    pulseHosts('activity').forEach((el) => {
      el.innerHTML = activityHtml
    })
    const activityPointsByRange: Record<
      'daily' | 'weekly' | 'monthly' | 'yearly',
      { label: string; fullLabel?: string; practiceMs: number }[]
    > = {
      daily: pulse.practiceDays,
      weekly: pulse.practiceWeeks,
      monthly: pulse.practiceMonths.map((m) => ({ label: MONTH_SHORT[m.month] ?? m.label, practiceMs: m.practiceMs })),
      yearly: pulse.practiceYears,
    }
    const activityFloorByRange: Record<'daily' | 'weekly' | 'monthly' | 'yearly', number> = {
      daily: 4,
      weekly: 4,
      monthly: 10,
      yearly: 80,
    }
    const activityPoints = activityPointsByRange[activityChartRange]
    const activityTotalMs = activityPoints.reduce((sum, p) => sum + p.practiceMs, 0)
    root.querySelectorAll<HTMLElement>('[data-sx-activity-total]').forEach((el) => {
      el.textContent = sxFormatDurationHours(activityTotalMs / 3_600_000)
    })
    root.querySelectorAll<HTMLCanvasElement>('[data-sx-activity-chart-canvas]').forEach((canvas) => {
      syncActivityBarChart(canvas, activityPoints, activityFloorByRange[activityChartRange])
    })
    const symbolsHtml = buildPulseSymbolRowsHtml(pulse.symbols)
    pulseHosts('symbols').forEach((el) => {
      el.innerHTML = symbolsHtml
    })
    root.querySelectorAll<HTMLCanvasElement>('[data-sx-symbols-chart-canvas]').forEach((canvas) => {
      syncSymbolsBarChart(canvas, pulse.symbols)
    })
    root.querySelectorAll<HTMLCanvasElement>('[data-sx-winrate-chart-canvas]').forEach((canvas) => {
      syncWinRateBarChart(canvas, pulse.winRateMonths)
    })
    const insightsHtml = pulse.insights
      .map((line) => `<li class="sx-dash-pulse__insight"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i><span>${line}</span></li>`)
      .join('')
    pulseHosts('insights').forEach((el) => {
      el.innerHTML = insightsHtml
    })

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

    const equity = computeEquityCurveSeries(sessions, 'backtest')
    root.querySelectorAll<HTMLCanvasElement>('[data-sx-equity-chart-canvas]').forEach((canvas) => {
      syncEquityCurveChart(canvas, equity)
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

  const activityTip = document.createElement('div')
  activityTip.className = 'sx-dash-pulse-tip'
  activityTip.setAttribute('role', 'status')
  activityTip.hidden = true
  activityTip.innerHTML = `<span class="sx-dash-pulse-tip__label"></span><span class="sx-dash-pulse-tip__row"><span class="sx-dash-pulse-tip__dot"></span><span class="sx-dash-pulse-tip__value"></span></span>`
  document.body.appendChild(activityTip)
  const activityTipLabel = activityTip.querySelector<HTMLElement>('.sx-dash-pulse-tip__label')!
  const activityTipValue = activityTip.querySelector<HTMLElement>('.sx-dash-pulse-tip__value')!

  const positionActivityTip = (hit: SVGRectElement) => {
    const rect = hit.getBoundingClientRect()
    const tipRect = activityTip.getBoundingClientRect()
    let left = rect.left + rect.width / 2 - tipRect.width / 2
    left = Math.max(8, Math.min(window.innerWidth - tipRect.width - 8, left))
    const top = rect.top - tipRect.height - 10
    activityTip.style.left = `${left}px`
    activityTip.style.top = `${Math.max(8, top)}px`
  }

  root.addEventListener('mouseover', (e) => {
    const t = e.target as Element | null
    const hit = t?.closest<SVGRectElement>('.sx-dash-pulse-hit')
    if (!hit || !root.contains(hit)) return
    activityTipLabel.textContent = hit.getAttribute('data-tip-label') || ''
    activityTipValue.textContent = hit.getAttribute('data-tip-value') || ''
    activityTip.hidden = false
    positionActivityTip(hit)
  })
  root.addEventListener('mousemove', (e) => {
    if (activityTip.hidden) return
    const t = e.target as Element | null
    const hit = t?.closest<SVGRectElement>('.sx-dash-pulse-hit')
    if (!hit) return
    positionActivityTip(hit)
  })
  root.addEventListener('mouseout', (e) => {
    const t = e.target as Element | null
    const hit = t?.closest<SVGRectElement>('.sx-dash-pulse-hit')
    if (!hit) return
    const related = (e as MouseEvent).relatedTarget as Element | null
    if (related && related.closest('.sx-dash-pulse-hit') === hit) return
    activityTip.hidden = true
  })

  const kpiInfoTip = document.createElement('div')
  kpiInfoTip.className = 'sx-dash-kpi-tip'
  kpiInfoTip.setAttribute('role', 'tooltip')
  document.body.appendChild(kpiInfoTip)

  const positionKpiInfoTip = (btn: HTMLElement) => {
    const rect = btn.getBoundingClientRect()
    const tipRect = kpiInfoTip.getBoundingClientRect()
    const iconCenter = rect.left + rect.width / 2
    let left = iconCenter - tipRect.width / 2
    left = Math.max(8, Math.min(window.innerWidth - tipRect.width - 8, left))
    let top = rect.bottom + 10
    const flip = top + tipRect.height > window.innerHeight - 8
    kpiInfoTip.classList.toggle('sx-dash-kpi-tip--above', flip)
    if (flip) top = rect.top - tipRect.height - 10
    kpiInfoTip.style.left = `${left}px`
    kpiInfoTip.style.top = `${Math.max(8, top)}px`
    const arrowLeft = Math.max(12, Math.min(tipRect.width - 12, iconCenter - left))
    kpiInfoTip.style.setProperty('--sx-kpi-tip-arrow-left', `${arrowLeft}px`)
  }

  const showKpiInfoTip = (btn: HTMLElement) => {
    const text = btn.getAttribute('data-tip')
    if (!text) return
    kpiInfoTip.textContent = text
    kpiInfoTip.classList.add('sx-dash-kpi-tip--visible')
    positionKpiInfoTip(btn)
  }
  const hideKpiInfoTip = () => {
    kpiInfoTip.classList.remove('sx-dash-kpi-tip--visible')
  }

  root.addEventListener('mouseover', (e) => {
    const t = e.target as Element | null
    const btn = t?.closest<HTMLElement>('.sx-dash-pulse__kpi-info')
    if (btn && root.contains(btn)) showKpiInfoTip(btn)
  })
  root.addEventListener('mousemove', (e) => {
    if (!kpiInfoTip.classList.contains('sx-dash-kpi-tip--visible')) return
    const t = e.target as Element | null
    const btn = t?.closest<HTMLElement>('.sx-dash-pulse__kpi-info')
    if (btn) positionKpiInfoTip(btn)
  })
  root.addEventListener('mouseout', (e) => {
    const t = e.target as Element | null
    const btn = t?.closest<HTMLElement>('.sx-dash-pulse__kpi-info')
    if (!btn) return
    const related = (e as MouseEvent).relatedTarget as Element | null
    if (related && related.closest('.sx-dash-pulse__kpi-info') === btn) return
    hideKpiInfoTip()
  })
  root.addEventListener('focusin', (e) => {
    const t = e.target as Element | null
    const btn = t?.closest<HTMLElement>('.sx-dash-pulse__kpi-info')
    if (btn) showKpiInfoTip(btn)
  })
  root.addEventListener('focusout', (e) => {
    const t = e.target as Element | null
    const btn = t?.closest<HTMLElement>('.sx-dash-pulse__kpi-info')
    if (btn) hideKpiInfoTip()
  })

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null
    if (!t) return

    const activityRangeBtn = t.closest<HTMLButtonElement>('[data-sx-activity-range]')
    if (activityRangeBtn && root.contains(activityRangeBtn)) {
      const range = activityRangeBtn.getAttribute('data-sx-activity-range') as
        | 'daily'
        | 'weekly'
        | 'monthly'
        | 'yearly'
        | null
      if (range && range !== activityChartRange) {
        activityChartRange = range
        root.querySelectorAll<HTMLButtonElement>('[data-sx-activity-range]').forEach((btn) => {
          const on = btn.getAttribute('data-sx-activity-range') === range
          btn.classList.toggle('sx-dash-graph__tab--active', on)
          btn.setAttribute('aria-selected', on ? 'true' : 'false')
        })
        syncSessionPulse()
      }
      return
    }

    const tradesSortBtn = t.closest<HTMLButtonElement>('[data-sx-trades-sort]')
    if (tradesSortBtn && root.contains(tradesSortBtn)) {
      const key = tradesSortBtn.getAttribute('data-sx-trades-sort') as SxTradeSortKey | null
      if (key) {
        if (sxTradesSortKey === key) {
          sxTradesSortDir = sxTradesSortDir === 'asc' ? 'desc' : 'asc'
        } else {
          sxTradesSortKey = key
          sxTradesSortDir = 'desc'
        }
        syncTradesUi()
      }
      return
    }

    const tradeOpenBtn = t.closest<HTMLButtonElement>('[data-sx-trade-open-session]')
    if (tradeOpenBtn && root.contains(tradeOpenBtn)) {
      const id = tradeOpenBtn.getAttribute('data-sx-trade-open-session')
      const s = id ? getSession(id) : null
      if (s) openChartWithStoredSession(s)
      return
    }

    const tradesRefreshBtn = t.closest<HTMLButtonElement>('[data-sx-trades-refresh]')
    if (tradesRefreshBtn && root.contains(tradesRefreshBtn)) {
      // Reset = restore every removed column back onto the table (show all).
      sxTradesHiddenColumns.clear()
      sxWriteTradesHiddenColumns(sxTradesHiddenColumns)
      sxRenderColumnPickerList()
      syncTradesUi()
      return
    }

    const colPickerTrigger = t.closest<HTMLButtonElement>('[data-sx-trades-edit]')
    if (colPickerTrigger && root.contains(colPickerTrigger)) {
      const wrap = colPickerTrigger.closest<HTMLElement>('[data-sxt-colpicker]')
      const panel = wrap?.querySelector<HTMLElement>('[data-sxt-colpicker-panel]')
      const willOpen = !!panel?.classList.contains('hidden')
      closeAllPerfDropdowns()
      closeAllLocaleDropdowns()
      closeColumnPicker()
      if (willOpen && panel) {
        sxRenderColumnPickerList()
        panel.classList.remove('hidden')
        colPickerTrigger.setAttribute('aria-expanded', 'true')
      }
      return
    }


    const tradesPageBtn = t.closest<HTMLButtonElement>('[data-sx-trades-page]')
    if (tradesPageBtn && root.contains(tradesPageBtn) && !tradesPageBtn.disabled) {
      const p = Number(tradesPageBtn.getAttribute('data-sx-trades-page'))
      if (Number.isFinite(p) && p > 0) {
        sxTradesPage = p
        syncTradesUi()
      }
      return
    }

    const tradesPageNavBtn = t.closest<HTMLButtonElement>('[data-sx-trades-page-nav]')
    if (tradesPageNavBtn && root.contains(tradesPageNavBtn) && !tradesPageNavBtn.disabled) {
      const dir = tradesPageNavBtn.getAttribute('data-sx-trades-page-nav')
      const pageCount = Math.max(1, Math.ceil(sxCurrentTradeRows().length / sxTradesPageSize))
      if (dir === 'first') sxTradesPage = 1
      else if (dir === 'prev') sxTradesPage = Math.max(1, sxTradesPage - 1)
      else if (dir === 'next') sxTradesPage = Math.min(pageCount, sxTradesPage + 1)
      else if (dir === 'last') sxTradesPage = pageCount
      syncTradesUi()
      return
    }

    const tradesExportBtn = t.closest<HTMLButtonElement>('[data-sx-trades-export]')
    if (tradesExportBtn && root.contains(tradesExportBtn)) {
      sxExportTrades(sxCurrentTradeRows())
      return
    }

    const tradesExportSelectedBtn = t.closest<HTMLButtonElement>('[data-sx-trades-export-selected]')
    if (tradesExportSelectedBtn && root.contains(tradesExportSelectedBtn)) {
      sxExportTrades(sxCurrentTradeRows().filter((r) => sxTradesSelected.has(r.key)))
      return
    }

    const tradesDeleteSelectedBtn = t.closest<HTMLButtonElement>('[data-sx-trades-delete-selected]')
    if (tradesDeleteSelectedBtn && root.contains(tradesDeleteSelectedBtn)) {
      const count = sxTradesSelected.size
      if (count === 0) return
      void confirmDialog({
        title: 'Delete trades',
        message: `Delete ${count} selected trade${count === 1 ? '' : 's'}? This cannot be undone.`,
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        danger: true,
      }).then((ok) => {
        if (!ok) return
        sxDeleteSelectedTrades()
      })
      return
    }

    const tradesFiltersClose = t.closest<HTMLButtonElement>('[data-sx-trades-filters-close]')
    if (tradesFiltersClose && root.contains(tradesFiltersClose)) {
      sxOpenTradesFiltersPanel(false)
      return
    }

    const tradesFiltersBackdrop = t.closest<HTMLElement>('[data-sx-trades-filters-backdrop]')
    if (tradesFiltersBackdrop && root.contains(tradesFiltersBackdrop)) {
      sxOpenTradesFiltersPanel(false)
      return
    }

    const tradesFilterTabBtn = t.closest<HTMLButtonElement>('[data-sx-trades-filter-tab]')
    if (tradesFilterTabBtn && root.contains(tradesFilterTabBtn)) {
      const tabId = tradesFilterTabBtn.getAttribute('data-sx-trades-filter-tab') as 'basic' | 'tags' | null
      if (tabId) {
        const changed = tabId !== sxTradesFilterTab
        sxTradesFilterTab = tabId
        root.querySelectorAll<HTMLButtonElement>('[data-sx-trades-filter-tab]').forEach((btn) => {
          const on = btn.getAttribute('data-sx-trades-filter-tab') === tabId
          btn.classList.toggle('sx-dash-trades-filter-tab--active', on)
          btn.setAttribute('aria-selected', on ? 'true' : 'false')
        })
        if (changed) sxRenderTradesFiltersBody()
        const panel = root.querySelector<HTMLElement>('[data-sx-trades-filters-panel]')
        if (panel?.classList.contains('hidden')) sxOpenTradesFiltersPanel(true)
      }
      return
    }

    const tradesTagsTrigger = t.closest<HTMLButtonElement>('[data-sx-trades-tags-trigger]')
    if (tradesTagsTrigger && root.contains(tradesTagsTrigger)) {
      const kind = tradesTagsTrigger.getAttribute('data-sx-trades-tags-trigger') as 'include' | 'exclude' | null
      if (kind) {
        sxTradesTagsOpenDropdown = sxTradesTagsOpenDropdown === kind ? null : kind
        sxRenderTradesFiltersBody()
      }
      return
    }

    const tradesTagsModeBtn = t.closest<HTMLButtonElement>('[data-sx-trades-tags-mode-btn]')
    if (tradesTagsModeBtn && root.contains(tradesTagsModeBtn)) {
      const raw = tradesTagsModeBtn.getAttribute('data-sx-trades-tags-mode-btn')
      const [kind, mode] = (raw ?? '').split(':') as ['include' | 'exclude', SxTradesFilterSetMode]
      if (kind === 'include') sxTradesFilters.tagsIncludeMode = mode
      else if (kind === 'exclude') sxTradesFilters.tagsExcludeMode = mode
      sxRenderTradesFiltersBody()
      return
    }

    const tradesAccordionToggle = t.closest<HTMLButtonElement>('[data-sx-trades-accordion-toggle]')
    if (tradesAccordionToggle && root.contains(tradesAccordionToggle)) {
      const id = tradesAccordionToggle.getAttribute('data-sx-trades-accordion-toggle')
      if (id) {
        if (sxTradesAccordionOpen.has(id)) sxTradesAccordionOpen.delete(id)
        else sxTradesAccordionOpen.add(id)
        sxRenderTradesFiltersBody()
      }
      return
    }

    const tradesFiltersClear = t.closest<HTMLButtonElement>('[data-sx-trades-filters-clear]')
    const tradesClearAll = t.closest<HTMLButtonElement>('[data-sx-trades-clear-all]')
    if ((tradesFiltersClear && root.contains(tradesFiltersClear)) || (tradesClearAll && root.contains(tradesClearAll))) {
      sxTradesFilters.sessionId = ''
      sxTradesFilters.sides.clear()
      sxTradesFilters.outcomes.clear()
      sxTradesFilters.types.clear()
      sxTradesFilters.assets.clear()
      sxTradesFilters.tagsInclude.clear()
      sxTradesFilters.tagsIncludeMode = 'and'
      sxTradesFilters.tagsExclude.clear()
      sxTradesFilters.tagsExcludeMode = 'and'
      sxTradesFilters.notes.clear()
      sxTradesFilters.years.clear()
      sxTradesFilters.months.clear()
      sxTradesFilters.hours.clear()
      sxTradesFilters.dateFrom = ''
      sxTradesFilters.dateTo = ''
      const sessionSelect = root.querySelector<HTMLSelectElement>('[data-sx-trades-session-filter]')
      if (sessionSelect) sessionSelect.value = ''
      sxRenderTradesFiltersBody()
      syncTradesUi()
      return
    }

    const tradesFiltersApply = t.closest<HTMLButtonElement>('[data-sx-trades-filters-apply]')
    if (tradesFiltersApply && root.contains(tradesFiltersApply)) {
      sxOpenTradesFiltersPanel(false)
      syncTradesUi()
      return
    }

    if (
      !t.closest('[data-sx-trades-filters-panel]') &&
      !t.closest('[data-sx-trades-filter-tab]')
    ) {
      const panel = root.querySelector<HTMLElement>('[data-sx-trades-filters-panel]')
      if (panel && !panel.classList.contains('hidden')) sxOpenTradesFiltersPanel(false)
    }

    if (sxTradesTagsOpenDropdown && !t.closest('[data-sx-trades-tags-dropdown]')) {
      sxTradesTagsOpenDropdown = null
      sxRenderTradesFiltersBody()
    }

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
    if (t.closest('[data-sxt-colpicker]')) return
    closeAllLocaleDropdowns()
    closeAllPerfDropdowns()
  })

  root.addEventListener('change', (e) => {
    const t = e.target as HTMLElement | null
    if (!t) return

    const sessionSelect = t.closest<HTMLSelectElement>('[data-sx-trades-session-filter]')
    if (sessionSelect && root.contains(sessionSelect)) {
      sxTradesFilters.sessionId = sessionSelect.value
      syncTradesUi()
      return
    }

    const filterCheck = t.closest<HTMLInputElement>('[data-sx-trades-filter-check]')
    if (filterCheck && root.contains(filterCheck)) {
      const group = filterCheck.getAttribute('data-sx-trades-filter-check')
      const value = filterCheck.value
      if (group === 'notes') {
        if (filterCheck.checked) sxTradesFilters.notes.add(value as 'with' | 'without')
        else sxTradesFilters.notes.delete(value as 'with' | 'without')
      } else if (group === 'assets') {
        if (filterCheck.checked) sxTradesFilters.assets.add(value)
        else sxTradesFilters.assets.delete(value)
      } else if (group === 'side') {
        if (filterCheck.checked) sxTradesFilters.sides.add(value)
        else sxTradesFilters.sides.delete(value)
      } else if (group === 'outcome') {
        if (filterCheck.checked) sxTradesFilters.outcomes.add(value as 'win' | 'loss' | 'breakeven')
        else sxTradesFilters.outcomes.delete(value as 'win' | 'loss' | 'breakeven')
      } else if (group === 'type') {
        if (filterCheck.checked) sxTradesFilters.types.add(value)
        else sxTradesFilters.types.delete(value)
      } else if (group === 'year') {
        const yr = Number(value)
        if (filterCheck.checked) sxTradesFilters.years.add(yr)
        else sxTradesFilters.years.delete(yr)
      } else if (group === 'month') {
        const mo = Number(value)
        if (filterCheck.checked) sxTradesFilters.months.add(mo)
        else sxTradesFilters.months.delete(mo)
      } else if (group === 'hour') {
        const hr = Number(value)
        if (filterCheck.checked) sxTradesFilters.hours.add(hr)
        else sxTradesFilters.hours.delete(hr)
      }
      sxSyncTradesFiltersToggleBadge()
      sxRenderTradesFiltersBody()
      return
    }

    const tagsCheck = t.closest<HTMLInputElement>('[data-sx-trades-tags-check]')
    if (tagsCheck && root.contains(tagsCheck)) {
      const kind = tagsCheck.getAttribute('data-sx-trades-tags-check') as 'include' | 'exclude' | null
      if (kind) {
        const set = kind === 'include' ? sxTradesFilters.tagsInclude : sxTradesFilters.tagsExclude
        if (tagsCheck.checked) set.add(tagsCheck.value)
        else set.delete(tagsCheck.value)
        sxSyncTradesFiltersToggleBadge()
        sxRenderTradesFiltersBody()
      }
      return
    }

    const tagsToggleAll = t.closest<HTMLInputElement>('[data-sx-trades-tags-toggle-all]')
    if (tagsToggleAll && root.contains(tagsToggleAll)) {
      const kind = tagsToggleAll.getAttribute('data-sx-trades-tags-toggle-all') as 'include' | 'exclude' | null
      if (kind) {
        const set = kind === 'include' ? sxTradesFilters.tagsInclude : sxTradesFilters.tagsExclude
        const allValues = sxTradesTagsOptionGroups().map((o) => o.value)
        if (tagsToggleAll.checked) for (const v of allValues) set.add(v)
        else for (const v of allValues) set.delete(v)
        sxSyncTradesFiltersToggleBadge()
        sxRenderTradesFiltersBody()
      }
      return
    }

    const dateInput = t.closest<HTMLInputElement>('[data-sx-trades-filter-date]')
    if (dateInput && root.contains(dateInput)) {
      const which = dateInput.getAttribute('data-sx-trades-filter-date')
      if (which === 'from') sxTradesFilters.dateFrom = dateInput.value
      else if (which === 'to') sxTradesFilters.dateTo = dateInput.value
      sxSyncTradesFiltersToggleBadge()
      return
    }

    const selectAllBox = t.closest<HTMLInputElement>('[data-sx-trades-select-all]')
    if (selectAllBox && root.contains(selectAllBox)) {
      const rows = sxCurrentTradeRows()
      if (selectAllBox.checked) {
        for (const r of rows) sxTradesSelected.add(r.key)
      } else {
        for (const r of rows) sxTradesSelected.delete(r.key)
      }
      syncTradesUi()
      return
    }

    const rowSelect = t.closest<HTMLInputElement>('[data-sx-trades-row-select]')
    if (rowSelect && root.contains(rowSelect)) {
      const key = rowSelect.getAttribute('data-sx-trades-row-select')
      if (key) {
        if (rowSelect.checked) sxTradesSelected.add(key)
        else sxTradesSelected.delete(key)
      }
      syncTradesUi()
    }
  })

  root.addEventListener('input', (e) => {
    const t = e.target as HTMLElement | null
    if (!t) return
    const searchInput = t.closest<HTMLInputElement>('[data-sx-trades-filters-search]')
    if (searchInput && root.contains(searchInput)) {
      sxTradesFilterSearch = searchInput.value
      sxRenderTradesFiltersBody()
      return
    }

    const tradesSearch = t.closest<HTMLInputElement>('[data-sx-trades-search]')
    if (tradesSearch && root.contains(tradesSearch)) {
      sxTradesSearch = tradesSearch.value
      sxTradesPage = 1
      syncTradesUi()
      return
    }

    const colPickerSearch = t.closest<HTMLInputElement>('[data-sxt-colpicker-search]')
    if (colPickerSearch && root.contains(colPickerSearch)) {
      sxTradesColPickerSearch = colPickerSearch.value
      sxRenderColumnPickerList()
    }

    const tagsSearch = t.closest<HTMLInputElement>('[data-sx-trades-tags-search]')
    if (tagsSearch && root.contains(tagsSearch)) {
      const kind = tagsSearch.getAttribute('data-sx-trades-tags-search') as 'include' | 'exclude' | null
      if (kind) {
        sxTradesTagsSearch[kind] = tagsSearch.value
        sxRenderTradesFiltersBody()
        const panel = root.querySelector<HTMLInputElement>(`[data-sx-trades-tags-search="${kind}"]`)
        panel?.focus()
      }
    }
  })

  root.addEventListener('change', (e) => {
    const t = e.target as HTMLElement | null
    if (!t) return

    const colToggleAll = t.closest<HTMLInputElement>('[data-sxt-colpicker-toggle-all]')
    if (colToggleAll && root.contains(colToggleAll)) {
      const toggleable = SX_TRADES_COLUMNS.filter((c) => !c.locked)
      if (colToggleAll.checked) {
        for (const c of toggleable) sxTradesHiddenColumns.delete(c.id)
      } else {
        for (const c of toggleable) sxTradesHiddenColumns.add(c.id)
      }
      sxWriteTradesHiddenColumns(sxTradesHiddenColumns)
      sxRenderColumnPickerList()
      syncTradesUi()
      return
    }

    const colCheck = t.closest<HTMLInputElement>('[data-sxt-colpicker-col]')
    if (colCheck && root.contains(colCheck)) {
      const id = colCheck.getAttribute('data-sxt-colpicker-col')
      if (id) {
        if (colCheck.checked) sxTradesHiddenColumns.delete(id)
        else sxTradesHiddenColumns.add(id)
        sxWriteTradesHiddenColumns(sxTradesHiddenColumns)
        sxRenderColumnPickerList()
        syncTradesUi()
      }
    }
  })

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    const colPickerPanelEl = root.querySelector<HTMLElement>('[data-sxt-colpicker-panel]')
    const colPickerOpen = !!colPickerPanelEl && !colPickerPanelEl.classList.contains('hidden')
    if (
      !root.querySelector('.sx-dash-locale-dd--open') &&
      !root.querySelector('[data-sx-perf-dd].sx-dash-perf-dd--open') &&
      !root.querySelector('[data-sx-session-dd].sx-dash-perf-dd--open') &&
      !colPickerOpen
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

  const sxaHost = root.querySelector<HTMLElement>('[data-sxa-host]')
  const sxAnalyticsPage = sxaHost
    ? initAnalyticsPage(sxaHost, {
        getTrades: () => sxCollectAnalyticsTrades(),
        getStartingBalance: () => sxAnalyticsStartingBalance(),
      })
    : null

  syncRecentSessionsUi()
  setTestingTab(readTestingTab())

  root.querySelectorAll<HTMLButtonElement>('[data-testing-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-testing-tab')
      if (!tab || !(TESTING_TABS as readonly string[]).includes(tab)) return
      closeDrawer()
      // Sidebar nav can be clicked while Strategy/Subscription/Settings is showing.
      showHomeTestingSection()
      setTestingTab(tab as TestingTab)
    })
  })

  const globalSearch = root.querySelector<HTMLInputElement>('[data-sx-global-search]')
  globalSearch?.addEventListener('input', () => {
    const sessionSearch = root.querySelector<HTMLInputElement>('#sx-dash-sessions-search')
    if (sessionSearch) sessionSearch.value = globalSearch.value
    if (globalSearch.value.trim()) {
      showHomeTestingSection()
      setTestingTab('sessions')
    }
    syncRecentSessionsUi()
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
      const tier = readAccountTier()
      if (tier === 'free') {
        openUpgradePlansModal()
        return
      }
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

  root.querySelectorAll('[data-action="billing"]').forEach((el) => {
    el.addEventListener('click', () => {
      showBillingPage()
    })
  })

  root.querySelectorAll('[data-action="pro-upgrade"]').forEach((el) => {
    el.addEventListener('click', () => {
      openUpgradePlansModal()
    })
  })
}
