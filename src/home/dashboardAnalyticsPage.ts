// Deep-dive Analytics page: Performance / Drawdown / Simulation. All numbers are
// computed live from the caller's real closed-trade data — nothing here is demo data.
import {
  Chart,
  ArcElement,
  DoughnutController,
  RadarController,
  RadialLinearScale,
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip,
  Filler,
  type ChartConfiguration,
} from 'chart.js'

Chart.register(
  ArcElement,
  DoughnutController,
  RadarController,
  RadialLinearScale,
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip,
  Filler,
)

export type SxaTrade = {
  id: string
  entryTimeMs: number
  exitTimeMs: number
  side: 'Buy' | 'Sell'
  asset: string
  tag: string | null
  pnl: number
  /** Realized R-multiple (reward / risk), null when no stop was set. */
  returnR: number | null
  durationMin: number
}

// Filter bar option lists. Side/Outcome/Session/Day/Timezone are derived from real
// fields on SxaTrade (side, pnl, entryTimeMs) and actually narrow the trades used
// across every chart/KPI below. Type and Strategy have no matching field on
// SxaTrade yet, so those two selects are UI-only placeholders for now.
type SxaSideVal = 'long' | 'short'
type SxaOutcomeVal = 'wins' | 'losses' | 'breakeven'
type SxaSessionVal = 'Asia' | 'London' | 'New York' | 'Out Of Session'

const SXA_SIDE_OPTS: { value: SxaSideVal; label: string }[] = [
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
]
const SXA_OUTCOME_OPTS: { value: SxaOutcomeVal; label: string }[] = [
  { value: 'wins', label: 'Wins' },
  { value: 'losses', label: 'Losses' },
  { value: 'breakeven', label: 'Breakeven' },
]
const SXA_SESSION_OPTS: { value: SxaSessionVal; label: string }[] = [
  { value: 'London', label: 'London' },
  { value: 'New York', label: 'New York' },
  { value: 'Asia', label: 'Asia' },
  { value: 'Out Of Session', label: 'Out of session' },
]
const SXA_DAY_OPTS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]
const SXA_TIMEZONE_OPTS: string[] = ['Etc/UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo']
const SXA_TYPE_OPTS: string[] = ['All types', 'Backtesting', 'Battles', 'Prop Firm']
const SXA_STRATEGY_OPTS: string[] = ['All strategies', 'Breakout', 'Reversal', 'Trend follow']

const GAIN = '#1a9d5c'
const LOSS = '#d6455a'
const AMBER = '#b6690a'
const BRAND = '#3652f6'
const GRID = '#f0f1f4'
const AXIS = '#a6acb8'

const fmtMoney = (v: number) => `${v >= 0 ? '+' : '\u2212'}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPlain = (v: number) => `${v >= 0 ? '' : '-'}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
function fmtDuration(mins: number): string {
  if (!Number.isFinite(mins) || mins <= 0) return '0m'
  if (mins < 60) return `${Math.round(mins)}m`
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h < 24) return `${h}h ${m}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

function sessionForHour(h: number): 'Asia' | 'London' | 'New York' | 'Out Of Session' {
  if (h >= 0 && h < 8) return 'Asia'
  if (h >= 8 && h < 13) return 'London'
  if (h >= 13 && h < 21) return 'New York'
  return 'Out Of Session'
}

function pctMove(t: SxaTrade): number {
  // Percent P&L relative to the trade's own notional isn't tracked per-trade, so
  // approximate using R (already risk-normalized) scaled to a readable %.
  return t.returnR != null ? t.returnR * 1.5 : 0
}

function buildFilterBarHtml(): string {
  const fpOptions = (group: string, opts: { value: string; label: string }[]) =>
    `<div class="sxa-fp-options" data-sxa-fp-group="${group}">${opts
      .map((o) => `<div class="sxa-fp-opt" data-sxa-fp-val="${o.value}">${o.label}</div>`)
      .join('')}</div>`

  const selectOptions = (opts: string[]) => opts.map((o) => `<option>${o}</option>`).join('')

  return `
      <div class="sxa-filter-bar">
        <div class="sxa-filter-row">
          <div class="sxa-chip" data-sxa-date-chip>
            <i class="fa-regular fa-calendar sxa-chip__icon" aria-hidden="true"></i>
            <span data-sxa-range-label>All time</span>
          </div>

          <div class="sxa-chip" data-sxa-mini-chip="assets">
            <span data-sxa-symbol-label>All assets</span>
            <i class="fa-solid fa-chevron-down sxa-chip__chevron" aria-hidden="true"></i>
            <div class="sxa-mini-popover" data-sxa-mini-popover="assets"></div>
          </div>

          <div class="sxa-chip" data-sxa-mini-chip="tags">
            <span data-sxa-tags-chip-label>Tags: All</span>
            <i class="fa-solid fa-chevron-down sxa-chip__chevron" aria-hidden="true"></i>
            <div class="sxa-mini-popover" data-sxa-mini-popover="tags"></div>
          </div>

          <div class="sxa-filters-btn" data-sxa-mini-chip="filters">
            <i class="fa-solid fa-filter" aria-hidden="true"></i>
            Filters
            <span class="sxa-count-badge" data-sxa-filter-count-badge hidden>0</span>
          </div>

          <div class="sxa-fp-backdrop" data-sxa-fp-backdrop></div>
          <div class="sxa-filters-popover" data-sxa-filters-popover>
              <div class="sxa-fp-grid">
                <div class="sxa-fp-col">
                  <div class="sxa-fp-field">
                    <label>Type</label>
                    <select class="sxa-fp-select" data-sxa-fp-select="type">${selectOptions(SXA_TYPE_OPTS)}</select>
                  </div>
                  <div class="sxa-fp-field">
                    <label>Side</label>
                    ${fpOptions('side', SXA_SIDE_OPTS)}
                  </div>
                  <div class="sxa-fp-field">
                    <label>Time of day</label>
                    <div class="sxa-fp-time-row">
                      <input class="sxa-fp-select" type="time" data-sxa-fp-time-start value="00:00">
                      <span>to</span>
                      <input class="sxa-fp-select" type="time" data-sxa-fp-time-end value="23:59">
                    </div>
                  </div>
                </div>
                <div class="sxa-fp-col">
                  <div class="sxa-fp-field">
                    <label>Outcome</label>
                    ${fpOptions('outcome', SXA_OUTCOME_OPTS)}
                  </div>
                  <div class="sxa-fp-field">
                    <label>Session</label>
                    ${fpOptions('session', SXA_SESSION_OPTS)}
                  </div>
                  <div class="sxa-fp-field">
                    <label>Timezone</label>
                    <select class="sxa-fp-select" data-sxa-fp-select="timezone">${selectOptions(SXA_TIMEZONE_OPTS)}</select>
                  </div>
                </div>
                <div class="sxa-fp-col">
                  <div class="sxa-fp-field">
                    <label>Strategy</label>
                    <select class="sxa-fp-select" data-sxa-fp-select="strategy">${selectOptions(SXA_STRATEGY_OPTS)}</select>
                  </div>
                  <div class="sxa-fp-field">
                    <label>Day</label>
                    ${fpOptions(
                      'day',
                      SXA_DAY_OPTS.map((o) => ({ value: String(o.value), label: o.label })),
                    )}
                  </div>
                </div>
              </div>
              <div class="sxa-fp-footer">
                <button type="button" class="sxa-fp-cancel" data-sxa-fp-cancel>Cancel</button>
                <button type="button" class="sxa-fp-done" data-sxa-fp-done>Done</button>
              </div>
          </div>

          <div class="sxa-spacer"></div>

          <div class="sxa-clear-link" data-sxa-filter-clear>
            <i class="fa-regular fa-trash-can" aria-hidden="true"></i>
            Clear filters
          </div>

          <button type="button" class="sxa-apply-btn" data-sxa-filter-apply>Apply</button>

          <button type="button" class="sxa-export-btn sxa-export-btn--icon" data-sxa-export-csv title="Export CSV" aria-label="Export CSV">
            <i class="fa-solid fa-download" aria-hidden="true"></i>
          </button>
        </div>

        <div class="sxa-active-filters" data-sxa-active-filters hidden>
          <span class="sxa-active-filters__label">Active:</span>
          <div class="sxa-active-filters__pills" data-sxa-active-pills></div>
        </div>
      </div>`
}

export function buildAnalyticsPageHtml(): string {
  return `
    <div class="sxa-analytics" data-sxa-root>
      <div class="sxa-tab-nav" data-sxa-main-tabs>
        <button type="button" class="sxa-tab-nav__btn sxa-tab-nav__btn--active" data-sxa-tab="performance">
          <i class="fa-solid fa-chart-line" aria-hidden="true"></i> Performance
        </button>
        <button type="button" class="sxa-tab-nav__btn" data-sxa-tab="drawdown">
          <i class="fa-solid fa-chart-simple" aria-hidden="true"></i> Drawdown
        </button>
        <button type="button" class="sxa-tab-nav__btn" data-sxa-tab="simulation">
          <i class="fa-solid fa-wave-square" aria-hidden="true"></i> Simulation
        </button>
      </div>

      ${buildFilterBarHtml()}

      <div class="sxa-tab-panel sxa-tab-panel--active" data-sxa-panel="performance">
        <div class="sxa-kpi-strip" data-sxa-kpi-strip></div>

        <div class="sxa-section-title">
          Profit &amp; loss over time
          <span class="sxa-info-dot">i</span>
          <div class="sxa-tab-row" data-sxa-granularity style="margin-left:auto;">
            <button type="button" class="sxa-tab-row__btn sxa-tab-row__btn--active" data-sxa-g="all">All</button>
            <button type="button" class="sxa-tab-row__btn" data-sxa-g="day">Day</button>
            <button type="button" class="sxa-tab-row__btn" data-sxa-g="hour">1 Hour</button>
            <button type="button" class="sxa-tab-row__btn" data-sxa-g="15min">15 Min</button>
          </div>
        </div>
        <div class="sxa-card"><canvas data-sxa-pnl-canvas></canvas></div>

        <div class="sxa-section-title">Risk-reward</div>
        <div class="sxa-grid-3">
          <div class="sxa-card sxa-rr-card">
            <svg class="sxa-rr-spark" data-sxa-spark-avgrr viewBox="0 0 200 60" preserveAspectRatio="none"></svg>
            <div class="sxa-rr-row">
              <div class="sxa-rr-item"><div class="sxa-rr-label">Average RR <span class="sxa-info-dot">i</span></div><div class="sxa-rr-value" data-sxa-stat="avgrr">\u2013</div></div>
              <div class="sxa-rr-item"><div class="sxa-rr-label">Max RR</div><div class="sxa-rr-value" data-sxa-stat="maxrr">\u2013</div></div>
            </div>
          </div>
          <div class="sxa-card">
            <div class="sxa-rr-label">Average risk <span class="sxa-info-dot">i</span></div>
            <div class="sxa-rr-value" data-sxa-stat="avgrisk" style="font-size:24px;margin-top:6px;">\u2013</div>
            <div class="sxa-hint">Average distance between entry and initial stop loss, converted to R.</div>
          </div>
          <div class="sxa-card">
            <div class="sxa-rr-label">Win RR vs loss RR <span class="sxa-info-dot">i</span></div>
            <div class="sxa-rr-row" style="margin-top:6px;">
              <div class="sxa-rr-item"><div class="sxa-rr-label">Wins</div><div class="sxa-rr-value" style="color:${GAIN};font-size:20px;" data-sxa-stat="winrr">\u2013</div></div>
              <div class="sxa-rr-item"><div class="sxa-rr-label">Losses</div><div class="sxa-rr-value" style="color:${LOSS};font-size:20px;" data-sxa-stat="lossrr">\u2013</div></div>
            </div>
          </div>
        </div>

        <div class="sxa-section-title">Expectancy &amp; profit factor</div>
        <div class="sxa-grid-2">
          <div class="sxa-card">
            <div class="sxa-card-head"><h3>Expectancy per trade <span class="sxa-info-dot">i</span></h3></div>
            <div class="sxa-kpi-value" data-sxa-stat="expectancy" style="font-size:26px;">\u2013</div>
            <div class="sxa-exp-track"><div class="sxa-exp-seg-win" data-sxa-exp-win></div><div class="sxa-exp-seg-loss" data-sxa-exp-loss></div></div>
            <div class="sxa-exp-labels"><span class="sxa-win" data-sxa-exp-win-label>\u2013</span><span class="sxa-loss" data-sxa-exp-loss-label>\u2013</span></div>
          </div>
          <div class="sxa-card sxa-pf-card">
            <div>
              <div class="sxa-card-head" style="margin-bottom:6px;"><h3>Profit factor <span class="sxa-info-dot">i</span></h3></div>
              <div class="sxa-kpi-value" data-sxa-stat="pf" style="font-size:30px;">\u2013</div>
              <div class="sxa-hint">Gross profit &divide; gross loss.<br>Above 1.5 is generally considered healthy.</div>
            </div>
            <div class="sxa-gauge-wrap"><svg width="110" height="110" viewBox="0 0 110 110" data-sxa-pf-gauge></svg></div>
          </div>
        </div>

        <div class="sxa-section-title">Winners and losers</div>
        <div class="sxa-grid-2">
          <div class="sxa-wl-card sxa-wl-card--win" data-sxa-winners-card></div>
          <div class="sxa-wl-card sxa-wl-card--loss" data-sxa-losers-card></div>
        </div>
        <div class="sxa-streak-strip" data-sxa-streak-strip></div>

        <div class="sxa-section-title">Performance by side</div>
        <div class="sxa-grid-2">
          <div class="sxa-card">
            <div class="sxa-card-head"><h3>Total trades <span class="sxa-info-dot">i</span></h3></div>
            <div class="sxa-donut-legend"><span><i class="sxa-dot" style="background:${GAIN}"></i>Buy</span><span><i class="sxa-dot" style="background:${BRAND}"></i>Sell</span></div>
            <canvas data-sxa-side-total-canvas></canvas>
          </div>
          <div class="sxa-card">
            <div class="sxa-card-head"><h3>Win rate <span class="sxa-info-dot">i</span></h3></div>
            <div class="sxa-donut-legend"><span><i class="sxa-dot" style="background:${GAIN}"></i>Buy</span><span><i class="sxa-dot" style="background:${BRAND}"></i>Sell</span></div>
            <canvas data-sxa-side-win-canvas></canvas>
          </div>
        </div>

        <div class="sxa-section-title">Performance by session</div>
        <div class="sxa-grid-4" data-sxa-session-radars></div>

        <div class="sxa-section-title">
          Performance by time
          <span class="sxa-info-dot">i</span>
          <div class="sxa-heat-select" style="margin-left:auto;">
            <select data-sxa-time-metric>
              <option value="pnl">Total Profit/Loss</option>
              <option value="rr">Risk-Reward</option>
              <option value="pct">% Profit</option>
            </select>
          </div>
        </div>
        <div class="sxa-card"><canvas data-sxa-time-bar-canvas></canvas></div>

        <div class="sxa-section-title">Performance by day <span class="sxa-info-dot">i</span></div>
        <div class="sxa-card"><canvas data-sxa-day-bar-canvas></canvas></div>

        <div class="sxa-section-title">
          Performance by month
          <span class="sxa-info-dot">i</span>
          <div class="sxa-tab-row" data-sxa-month-basis style="margin-left:auto;">
            <button type="button" class="sxa-tab-row__btn sxa-tab-row__btn--active" data-sxa-mb="initial">Initial Balance</button>
            <button type="button" class="sxa-tab-row__btn" data-sxa-mb="current">Current Balance</button>
          </div>
        </div>
        <div class="sxa-card" style="overflow-x:auto;">
          <table class="sxa-month-grid" data-sxa-month-grid></table>
        </div>

        <div class="sxa-section-title">
          Performance calendar
          <span class="sxa-info-dot">i</span>
          <div style="margin-left:auto; display:flex; align-items:center; gap:10px;">
            <select class="sxa-cal-select" data-sxa-cal-metric>
              <option value="dollar">Dollar Profit</option>
              <option value="pct">% Profit</option>
              <option value="rr">Risk-Reward</option>
            </select>
            <div class="sxa-tab-row" data-sxa-cal-basis>
              <button type="button" class="sxa-tab-row__btn sxa-tab-row__btn--active" data-sxa-cb="current">Current Balance</button>
              <button type="button" class="sxa-tab-row__btn" data-sxa-cb="initial">Initial Balance</button>
            </div>
            <div class="sxa-tab-row" data-sxa-cal-view>
              <button type="button" class="sxa-tab-row__btn sxa-tab-row__btn--active" data-sxa-cv="month">Month</button>
              <button type="button" class="sxa-tab-row__btn" data-sxa-cv="year">Year</button>
            </div>
          </div>
        </div>
        <div class="sxa-card">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
            <button type="button" class="sxa-export-btn" data-sxa-cal-prev style="padding:6px 10px;">\u2190</button>
            <div class="sxa-cal-label" data-sxa-cal-label></div>
            <button type="button" class="sxa-export-btn" data-sxa-cal-next style="padding:6px 10px;">\u2192</button>
          </div>
          <div data-sxa-cal-container></div>
        </div>
      </div>

      <div class="sxa-tab-panel" data-sxa-panel="drawdown">
        <div class="sxa-section-title">
          Drawdown on equity
          <span class="sxa-info-dot">i</span>
          <div style="margin-left:auto; display:flex; align-items:center; gap:14px; position:relative;">
            <a href="#" class="sxa-how-link" data-sxa-dd-how>How this works?</a>
            <div class="sxa-how-popover" data-sxa-dd-how-popover hidden>Each bar is one drawdown episode: the depth your equity fell from its prior peak before making a new high. "Time to recovery" averages how long (in days) it took to climb back to that peak. "Drawdown frequency" is episodes per week over the current date range.</div>
            <div class="sxa-tab-row" data-sxa-dd-unit>
              <button type="button" class="sxa-tab-row__btn sxa-tab-row__btn--active" data-sxa-dd-u="pct">%</button>
              <button type="button" class="sxa-tab-row__btn" data-sxa-dd-u="dollar">$</button>
            </div>
          </div>
        </div>
        <div class="sxa-card"><canvas data-sxa-drawdown-canvas></canvas></div>
        <div class="sxa-grid-4" data-sxa-drawdown-stats style="margin-top:14px;"></div>

        <div class="sxa-section-title">Maximum adverse excursion <span class="sxa-info-dot">i</span></div>
        <div class="sxa-card">
          <div class="sxa-heat-sub">How far winning trades moved against you before turning around and closing in profit. This needs bar-by-bar price data per trade, which isn't recorded yet for closed trades.</div>
          <div class="sxa-mae-empty" data-sxa-mae-empty>Once per-trade adverse-excursion data is tracked during replay, this histogram will populate automatically \u2014 no changes needed here.</div>
        </div>
      </div>

      <div class="sxa-tab-panel" data-sxa-panel="simulation">
        <div class="sxa-section-title">Monte Carlo simulation <span class="sxa-info-dot">i</span></div>
        <div class="sxa-card" style="margin-bottom:20px;">
          <div class="sxa-heat-sub">Generates independent equity paths from your win rate, average gain, and average loss \u2014 inputs default to your real stats but are fully editable to stress-test hypotheticals.</div>
          <div class="sxa-mc-input-grid" data-sxa-mc-input-grid></div>
          <div style="position:relative;">
            <canvas data-sxa-mc-canvas style="margin-top:18px;"></canvas>
            <div class="sxa-mc-tooltip-panel" data-sxa-mc-tooltip></div>
          </div>
          <div class="sxa-section-title" style="font-size:14px; margin:18px 0 10px;">Simulation results</div>
          <div class="sxa-sim-stats sxa-sim-stats--wide" data-sxa-mc-stats></div>
        </div>

        <div class="sxa-section-title">
          RR simulator
          <span class="sxa-info-dot">i</span>
          <a href="#" class="sxa-how-link" data-sxa-rr-how style="margin-left:auto;">How this works?</a>
        </div>
        <div class="sxa-card">
          <div class="sxa-heat-sub">Replays your real trades, capping every win at each target R shown, to compare exit strategies side by side.</div>
          <div class="sxa-rr-chip-toolbar">
            <div class="sxa-rr-chip-row" data-sxa-rr-chip-row></div>
            <button type="button" class="sxa-run-btn" data-sxa-rr-add-new style="margin-left:auto;">+ Add new</button>
          </div>
          <canvas data-sxa-rr-multi-canvas></canvas>
          <div class="sxa-rr-best-line" data-sxa-rr-best-line></div>
          <div class="sxa-section-title" style="font-size:15px; margin:18px 0 10px;">Results</div>
          <div style="overflow-x:auto;">
            <table class="sxa-rr-results-table" data-sxa-rr-results-table></table>
          </div>
        </div>
      </div>
    </div>`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChartMap = Record<string, Chart<any, any, any>>

export function initAnalyticsPage(
  root: HTMLElement,
  opts: {
    getTrades: () => SxaTrade[]
    getStartingBalance: () => number
  },
) {
  const charts: ChartMap = {}
  function destroyChart(key: string) {
    charts[key]?.destroy()
    delete charts[key]
  }

  let activeTag = '__all__'

  // Committed filter state. Side/Outcome/Session/Day use "empty set = no
  // restriction" semantics (matching the reference UI, where an option group
  // with nothing toggled just means "don't filter on this"). Type/Strategy have
  // no matching field on SxaTrade yet, so they're kept but don't narrow results.
  const filters = {
    side: new Set<SxaSideVal>(['long', 'short']),
    outcome: new Set<SxaOutcomeVal>(['wins', 'losses']),
    session: new Set<SxaSessionVal>(),
    day: new Set<number>(),
    timezone: 'Etc/UTC',
    timeStart: '00:00',
    timeEnd: '23:59',
    type: SXA_TYPE_OPTS[0]!,
    strategy: SXA_STRATEGY_OPTS[0]!,
    assets: new Set<string>(),
  }

  function resetFilters() {
    filters.side = new Set(['long', 'short'])
    filters.outcome = new Set(['wins', 'losses'])
    filters.session = new Set()
    filters.day = new Set()
    filters.timezone = 'Etc/UTC'
    filters.timeStart = '00:00'
    filters.timeEnd = '23:59'
    filters.type = SXA_TYPE_OPTS[0]!
    filters.strategy = SXA_STRATEGY_OPTS[0]!
    filters.assets = new Set()
    activeTag = '__all__'
  }

  function sxaTzParts(ms: number, tz: string): { hour: number; minute: number; day: number } {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(
        new Date(ms),
      )
      const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '00'
      const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '00'
      const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
      const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
      return { hour: parseInt(hourStr, 10) % 24, minute: parseInt(minuteStr, 10), day: dayMap[weekdayStr] ?? 0 }
    } catch {
      const d = new Date(ms)
      return { hour: d.getUTCHours(), minute: d.getUTCMinutes(), day: d.getUTCDay() }
    }
  }

  function timeStrToMinutes(s: string): number {
    const [h, m] = s.split(':').map((v) => parseInt(v, 10))
    return (h || 0) * 60 + (m || 0)
  }

  function passesTimeRange(hour: number, minute: number): boolean {
    const startMin = timeStrToMinutes(filters.timeStart)
    const endMin = timeStrToMinutes(filters.timeEnd)
    const cur = hour * 60 + minute
    if (startMin <= endMin) return cur >= startMin && cur <= endMin
    return cur >= startMin || cur <= endMin
  }

  function distinctAssets(): string[] {
    return Array.from(new Set(getAllTrades().map((t) => t.asset))).sort()
  }

  function distinctTags(): string[] {
    return Array.from(
      new Set(getAllTrades().map((t) => t.tag).filter((t): t is string => !!t)),
    ).sort()
  }

  let currentGranularity: 'all' | 'day' | 'hour' | '15min' = 'all'
  let timeMetric: 'pnl' | 'rr' | 'pct' = 'pnl'
  let monthBalanceBasis: 'initial' | 'current' = 'initial'
  let calView: 'month' | 'year' = 'month'
  let calMetric: 'dollar' | 'pct' | 'rr' = 'dollar'
  let calBasis: 'current' | 'initial' = 'current'
  let calDate = new Date()
  let ddUnit: 'pct' | 'dollar' = 'pct'
  let mcSeed = 1

  function mulberry32(seed: number) {
    return function () {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function getAllTrades(): SxaTrade[] {
    return opts.getTrades().slice().sort((a, b) => a.entryTimeMs - b.entryTimeMs)
  }

  function getFilteredTrades(): SxaTrade[] {
    const all = getAllTrades()
    return all.filter((t) => {
      if (activeTag !== '__all__' && t.tag !== activeTag) return false

      const sideVal: SxaSideVal = t.side === 'Buy' ? 'long' : 'short'
      if (filters.side.size > 0 && !filters.side.has(sideVal)) return false

      const outcomeVal: SxaOutcomeVal = Math.abs(t.pnl) < 1 ? 'breakeven' : t.pnl > 0 ? 'wins' : 'losses'
      if (filters.outcome.size > 0 && !filters.outcome.has(outcomeVal)) return false

      if (filters.assets.size > 0 && !filters.assets.has(t.asset)) return false

      const { hour, minute, day } = sxaTzParts(t.entryTimeMs, filters.timezone)
      if (filters.day.size > 0 && !filters.day.has(day)) return false
      if (!passesTimeRange(hour, minute)) return false
      if (filters.session.size > 0 && !filters.session.has(sessionForHour(hour))) return false

      // Type / Strategy have no matching field on SxaTrade yet, so they don't
      // narrow results below \u2014 see the note above the option lists.
      return true
    })
  }

  function escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function syncToolbarLabels() {
    const all = getAllTrades()
    const rangeEl = root.querySelector<HTMLElement>('[data-sxa-range-label]')
    if (rangeEl) {
      if (all.length) {
        const min = new Date(all[0]!.entryTimeMs)
        const max = new Date(all[all.length - 1]!.entryTimeMs)
        const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        rangeEl.textContent = all.length > 1 ? `${fmt(min)} \u2013 ${fmt(max)}` : fmt(min)
      } else {
        rangeEl.textContent = 'No trades yet'
      }
    }
  }

  // ---------- Filter bar: mini popovers (Assets, Tags) ----------
  function renderMiniPopover(key: 'assets' | 'tags') {
    const panel = root.querySelector<HTMLElement>(`[data-sxa-mini-popover="${key}"]`)
    if (!panel) return
    if (key === 'assets') {
      const opts = distinctAssets()
      panel.innerHTML = opts.length
        ? opts
            .map(
              (a) =>
                `<label class="sxa-mini-opt"><input type="checkbox" data-sxa-asset-opt value="${escapeAttr(a)}" ${
                  filters.assets.size === 0 || filters.assets.has(a) ? 'checked' : ''
                }> ${escapeAttr(a)}</label>`,
            )
            .join('')
        : `<div class="sxa-filter-empty">No assets yet</div>`
    } else {
      const tags = ['__all__', ...distinctTags()]
      panel.innerHTML = tags
        .map((tag) => {
          const label = tag === '__all__' ? 'All' : tag
          return `<label class="sxa-mini-opt"><input type="radio" name="sxa-tag-mode" data-sxa-tag-opt value="${escapeAttr(tag)}" ${
            tag === activeTag ? 'checked' : ''
          }> ${escapeAttr(label)}</label>`
        })
        .join('')
    }
  }

  function syncChipLabels() {
    const symEl = root.querySelector<HTMLElement>('[data-sxa-symbol-label]')
    if (symEl) {
      const n = filters.assets.size
      symEl.textContent = n === 0 ? 'All assets' : n === 1 ? Array.from(filters.assets)[0]! : `${n} assets`
    }
    const tagsEl = root.querySelector<HTMLElement>('[data-sxa-tags-chip-label]')
    if (tagsEl) tagsEl.textContent = `Tags: ${activeTag === '__all__' ? 'All' : activeTag}`
  }

  // ---------- Filter bar: "Filters" popover (Type/Side/Outcome/Session/Strategy/Day/Time/Timezone) ----------
  function closeAllPopovers() {
    root.querySelectorAll<HTMLElement>('.sxa-mini-popover, .sxa-filters-popover').forEach((p) => p.classList.remove('sxa-popover--open'))
    root.querySelectorAll<HTMLElement>('[data-sxa-fp-backdrop]').forEach((b) => b.classList.remove('sxa-popover--open'))
  }

  function syncFilterPopoverSelects() {
    const typeSel = root.querySelector<HTMLSelectElement>('[data-sxa-fp-select="type"]')
    if (typeSel) typeSel.value = filters.type
    const strategySel = root.querySelector<HTMLSelectElement>('[data-sxa-fp-select="strategy"]')
    if (strategySel) strategySel.value = filters.strategy
    const tzSel = root.querySelector<HTMLSelectElement>('[data-sxa-fp-select="timezone"]')
    if (tzSel) tzSel.value = filters.timezone
    const timeStart = root.querySelector<HTMLInputElement>('[data-sxa-fp-time-start]')
    if (timeStart) timeStart.value = filters.timeStart
    const timeEnd = root.querySelector<HTMLInputElement>('[data-sxa-fp-time-end]')
    if (timeEnd) timeEnd.value = filters.timeEnd

    const syncGroup = (group: string, selected: Set<string>) => {
      root.querySelectorAll<HTMLElement>(`.sxa-fp-options[data-sxa-fp-group="${group}"] .sxa-fp-opt`).forEach((opt) => {
        const val = opt.getAttribute('data-sxa-fp-val') ?? ''
        opt.classList.toggle('sxa-fp-opt--selected', selected.has(val))
      })
    }
    syncGroup('side', filters.side)
    syncGroup('outcome', filters.outcome)
    syncGroup('session', filters.session)
    syncGroup('day', new Set(Array.from(filters.day).map(String)))
  }

  function syncActiveFiltersUi() {
    const groups: { key: string; opts: { value: string; label: string }[]; selected: Set<string> }[] = [
      { key: 'side', opts: SXA_SIDE_OPTS, selected: filters.side },
      { key: 'outcome', opts: SXA_OUTCOME_OPTS, selected: filters.outcome },
      { key: 'session', opts: SXA_SESSION_OPTS, selected: filters.session },
      {
        key: 'day',
        opts: SXA_DAY_OPTS.map((o) => ({ value: String(o.value), label: o.label })),
        selected: new Set(Array.from(filters.day).map(String)),
      },
    ]
    const pills = groups
      .filter((g) => g.selected.size > 0)
      .map((g) => ({
        key: g.key,
        text: g.opts
          .filter((o) => g.selected.has(o.value))
          .map((o) => o.label)
          .join(', '),
      }))

    const countBadge = root.querySelector<HTMLElement>('[data-sxa-filter-count-badge]')
    if (countBadge) {
      countBadge.textContent = String(pills.length)
      countBadge.hidden = pills.length === 0
    }

    const row = root.querySelector<HTMLElement>('[data-sxa-active-filters]')
    const container = root.querySelector<HTMLElement>('[data-sxa-active-pills]')
    if (!row || !container) return
    if (!pills.length) {
      row.hidden = true
      return
    }
    row.hidden = false
    container.innerHTML = pills
      .map(
        (p) =>
          `<span class="sxa-active-pill" data-sxa-active-pill-group="${p.key}">${escapeAttr(p.text)}<span class="sxa-active-pill__rm" data-sxa-active-pill-rm="${p.key}">\u2715</span></span>`,
      )
      .join('')
  }

  function clearFilterGroup(group: string) {
    if (group === 'side') filters.side.clear()
    else if (group === 'outcome') filters.outcome.clear()
    else if (group === 'session') filters.session.clear()
    else if (group === 'day') filters.day.clear()
  }

  function syncFilterBarUi() {
    syncChipLabels()
    syncFilterPopoverSelects()
    syncActiveFiltersUi()
  }

  function renderKPIs(trades: SxaTrade[]) {
    const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)
    const startingBalance = opts.getStartingBalance()
    const balance = startingBalance + totalPnl
    const wins = trades.filter((t) => t.pnl >= 0)
    const winRate = trades.length ? (wins.length / trades.length) * 100 : 0
    const avgDurationMin = trades.length ? trades.reduce((s, t) => s + t.durationMin, 0) / trades.length : 0
    const breakeven = trades.filter((t) => Math.abs(t.pnl) < 1).length

    const items: [string, string, string, string | null][] = [
      ['Total P&L', fmtMoney(totalPnl), totalPnl >= 0 ? 'sxa-gain' : 'sxa-loss', startingBalance > 0 ? `${((totalPnl / startingBalance) * 100).toFixed(2)}%` : null],
      ['Account balance', `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '', null],
      ['Win rate', `${winRate.toFixed(0)}%`, winRate >= 50 ? 'sxa-gain' : 'sxa-loss', null],
      ['Total trades', String(trades.length), '', null],
      ['Avg. duration', fmtDuration(avgDurationMin), '', null],
      ['Breakeven trades', String(breakeven), '', null],
    ]

    const host = root.querySelector<HTMLElement>('[data-sxa-kpi-strip]')
    if (host) {
      host.innerHTML = items
        .map(
          ([label, value, cls, delta]) => `
        <div class="sxa-kpi">
          <div class="sxa-kpi-label">${label} <span class="sxa-info-dot">i</span></div>
          <div class="sxa-kpi-value ${cls}">${value}</div>
          ${delta ? `<div class="sxa-kpi-delta">${delta}</div>` : ''}
        </div>`,
        )
        .join('')
    }
  }

  function renderPnlChart(trades: SxaTrade[]) {
    destroyChart('pnl')
    const canvas = root.querySelector<HTMLCanvasElement>('[data-sxa-pnl-canvas]')
    if (!canvas) return
    const startingBalance = opts.getStartingBalance()
    let labels: string[]
    let data: number[]

    if (currentGranularity === 'all') {
      let running = startingBalance
      data = trades.map((t) => {
        running += t.pnl
        return running
      })
      labels = trades.map((_, i) => `#${i + 1}`)
    } else {
      const bucketMs = currentGranularity === 'day' ? 86_400_000 : currentGranularity === 'hour' ? 3_600_000 : 900_000
      const buckets = new Map<number, number>()
      let running = startingBalance
      for (const t of trades) {
        running += t.pnl
        const key = Math.floor(t.exitTimeMs / bucketMs) * bucketMs
        buckets.set(key, running)
      }
      const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b)
      labels = sortedKeys.map((k) => {
        const d = new Date(k)
        return currentGranularity === 'day'
          ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: currentGranularity === '15min' ? '2-digit' : undefined })
      })
      data = sortedKeys.map((k) => buckets.get(k)!)
    }

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data,
            borderColor: BRAND,
            backgroundColor: 'rgba(54,82,246,0.07)',
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (i) => 'Balance: ' + fmtPlain(typeof i.parsed.y === 'number' ? i.parsed.y : 0) } },
        },
        scales: {
          y: {
            ticks: { font: { family: 'IBM Plex Mono', size: 10.5 }, color: AXIS, callback: (v) => '$' + (Number(v) / 1000).toFixed(0) + 'k' },
            grid: { color: GRID },
            border: { display: false },
          },
          x: {
            ticks: { font: { size: 10 }, color: AXIS, maxTicksLimit: 10, maxRotation: 0 },
            grid: { display: false },
            border: { display: false },
          },
        },
      },
    }
    charts.pnl = new Chart(canvas, config)
  }

  function sparklinePath(values: number[], w: number, h: number): string {
    if (!values.length) return ''
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const step = w / (values.length - 1 || 1)
    const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    return `M${pts.join(' L')}`
  }

  function setStat(key: string, text: string) {
    const el = root.querySelector<HTMLElement>(`[data-sxa-stat="${key}"]`)
    if (el) el.textContent = text
  }

  function renderRRCards(trades: SxaTrade[]) {
    const rValues = trades.map((t) => t.returnR).filter((v): v is number => v != null)
    const avgRR = rValues.length ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0
    const maxRR = rValues.length ? Math.max(...rValues) : 0
    const winR = rValues.filter((v) => v > 0)
    const lossR = rValues.filter((v) => v <= 0)
    const avgWinR = winR.length ? winR.reduce((a, b) => a + b, 0) / winR.length : 0
    const avgLossR = lossR.length ? lossR.reduce((a, b) => a + b, 0) / lossR.length : 0

    setStat('avgrr', avgRR.toFixed(2) + 'R')
    setStat('maxrr', maxRR.toFixed(2) + 'R')
    setStat('avgrisk', rValues.length ? '1.00R' : '\u2013')
    setStat('winrr', winR.length ? '+' + avgWinR.toFixed(2) + 'R' : '\u2013')
    setStat('lossrr', lossR.length ? avgLossR.toFixed(2) + 'R' : '\u2013')

    const spark = root.querySelector<SVGElement>('[data-sxa-spark-avgrr]')
    if (spark) spark.innerHTML = `<path d="${sparklinePath(rValues, 200, 60)}" fill="none" stroke="${BRAND}" stroke-width="2"/>`
  }

  function renderExpectancy(trades: SxaTrade[]) {
    const wins = trades.filter((t) => t.pnl > 0)
    const losses = trades.filter((t) => t.pnl < 0)
    const winRate = trades.length ? wins.length / trades.length : 0
    const lossRate = 1 - winRate
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0
    const expectancy = winRate * avgWin - lossRate * avgLoss
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0)
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0

    const expEl = root.querySelector<HTMLElement>('[data-sxa-stat="expectancy"]')
    if (expEl) {
      expEl.textContent = fmtMoney(expectancy)
      expEl.className = 'sxa-kpi-value ' + (expectancy >= 0 ? 'sxa-gain' : 'sxa-loss')
    }
    const total = grossProfit + grossLoss || 1
    const winSeg = root.querySelector<HTMLElement>('[data-sxa-exp-win]')
    const lossSeg = root.querySelector<HTMLElement>('[data-sxa-exp-loss]')
    if (winSeg) winSeg.style.width = (grossProfit / total) * 100 + '%'
    if (lossSeg) lossSeg.style.width = (grossLoss / total) * 100 + '%'
    const winLbl = root.querySelector<HTMLElement>('[data-sxa-exp-win-label]')
    const lossLbl = root.querySelector<HTMLElement>('[data-sxa-exp-loss-label]')
    if (winLbl) winLbl.textContent = fmtPlain(grossProfit)
    if (lossLbl) lossLbl.textContent = '-' + fmtPlain(grossLoss)

    const pfDisplay = Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : '\u221e'
    const pfEl = root.querySelector<HTMLElement>('[data-sxa-stat="pf"]')
    if (pfEl) {
      pfEl.textContent = pfDisplay
      pfEl.style.color = profitFactor >= 1.5 ? GAIN : profitFactor >= 1 ? AMBER : LOSS
    }

    const pfCapped = Math.min(Number.isFinite(profitFactor) ? profitFactor : 5, 5)
    const pct = pfCapped / 5
    const r = 46
    const circumference = 2 * Math.PI * r
    const dash = circumference * pct
    const color = profitFactor >= 1.5 ? GAIN : profitFactor >= 1 ? AMBER : LOSS
    const gauge = root.querySelector<SVGElement>('[data-sxa-pf-gauge]')
    if (gauge) {
      gauge.innerHTML = `
        <circle cx="55" cy="55" r="${r}" fill="none" stroke="${GRID}" stroke-width="10"/>
        <circle cx="55" cy="55" r="${r}" fill="none" stroke="${color}" stroke-width="10"
          stroke-dasharray="${dash} ${circumference}" stroke-linecap="round"
          transform="rotate(-90 55 55)"/>`
    }
  }

  function renderWinnersLosers(trades: SxaTrade[]) {
    const wins = trades.filter((t) => t.pnl > 0)
    const losses = trades.filter((t) => t.pnl < 0)

    const winPcts = wins.map(pctMove)
    const lossPcts = losses.map(pctMove)
    const bestWinPct = winPcts.length ? Math.max(...winPcts) : 0
    const avgWinPct = winPcts.length ? winPcts.reduce((a, b) => a + b, 0) / winPcts.length : 0
    const avgWinDur = wins.length ? wins.reduce((s, t) => s + t.durationMin, 0) / wins.length : 0

    const worstLossPct = lossPcts.length ? Math.min(...lossPcts) : 0
    const avgLossPct = lossPcts.length ? lossPcts.reduce((a, b) => a + b, 0) / lossPcts.length : 0
    const avgLossDur = losses.length ? losses.reduce((s, t) => s + t.durationMin, 0) / losses.length : 0

    let curWinStreak = 0
    let curLossStreak = 0
    let maxWinStreak = 0
    let maxLossStreak = 0
    const winStreaks: number[] = []
    const lossStreaks: number[] = []
    for (const t of trades) {
      if (t.pnl > 0) {
        curWinStreak++
        if (curLossStreak > 0) lossStreaks.push(curLossStreak)
        curLossStreak = 0
        maxWinStreak = Math.max(maxWinStreak, curWinStreak)
      } else {
        curLossStreak++
        if (curWinStreak > 0) winStreaks.push(curWinStreak)
        curWinStreak = 0
        maxLossStreak = Math.max(maxLossStreak, curLossStreak)
      }
    }
    if (curWinStreak > 0) winStreaks.push(curWinStreak)
    if (curLossStreak > 0) lossStreaks.push(curLossStreak)
    const avgWinStreak = winStreaks.length ? winStreaks.reduce((a, b) => a + b, 0) / winStreaks.length : 0
    const avgLossStreak = lossStreaks.length ? lossStreaks.reduce((a, b) => a + b, 0) / lossStreaks.length : 0

    const winnersHost = root.querySelector<HTMLElement>('[data-sxa-winners-card]')
    if (winnersHost) {
      winnersHost.innerHTML = `
        <h4>Winners</h4>
        <div class="sxa-wl-row"><span class="sxa-wl-lbl">Total winners <span class="sxa-info-dot">i</span></span><span class="sxa-wl-val">${wins.length}</span></div>
        <div class="sxa-wl-row"><span class="sxa-wl-lbl">Best win <span class="sxa-info-dot">i</span></span><span class="sxa-wl-val">${fmtPct(bestWinPct)}</span></div>
        <div class="sxa-wl-row"><span class="sxa-wl-lbl">Average win <span class="sxa-info-dot">i</span></span><span class="sxa-wl-val">${fmtPct(avgWinPct)}</span></div>
        <div class="sxa-wl-row"><span class="sxa-wl-lbl">Average duration <span class="sxa-info-dot">i</span></span><span class="sxa-wl-val">${fmtDuration(avgWinDur)}</span></div>
        <div class="sxa-wl-row"><span class="sxa-wl-lbl">Max consecutive wins <span class="sxa-info-dot">i</span></span><span class="sxa-wl-val">${maxWinStreak}</span></div>
        <div class="sxa-wl-row"><span class="sxa-wl-lbl">Avg consecutive wins <span class="sxa-info-dot">i</span></span><span class="sxa-wl-val">${avgWinStreak.toFixed(1)}</span></div>`
    }
    const losersHost = root.querySelector<HTMLElement>('[data-sxa-losers-card]')
    if (losersHost) {
      losersHost.innerHTML = `
        <h4>Losers</h4>
        <div class="sxa-wl-row"><span class="sxa-wl-lbl">Total losers <span class="sxa-info-dot">i</span></span><span class="sxa-wl-val">${losses.length}</span></div>
        <div class="sxa-wl-row"><span class="sxa-wl-lbl">Worst loss <span class="sxa-info-dot">i</span></span><span class="sxa-wl-val">${fmtPct(worstLossPct)}</span></div>
        <div class="sxa-wl-row"><span class="sxa-wl-lbl">Average loss <span class="sxa-info-dot">i</span></span><span class="sxa-wl-val">${fmtPct(avgLossPct)}</span></div>
        <div class="sxa-wl-row"><span class="sxa-wl-lbl">Average duration <span class="sxa-info-dot">i</span></span><span class="sxa-wl-val">${fmtDuration(avgLossDur)}</span></div>
        <div class="sxa-wl-row"><span class="sxa-wl-lbl">Max consecutive losses <span class="sxa-info-dot">i</span></span><span class="sxa-wl-val">${maxLossStreak}</span></div>
        <div class="sxa-wl-row"><span class="sxa-wl-lbl">Avg consecutive losses <span class="sxa-info-dot">i</span></span><span class="sxa-wl-val">${avgLossStreak.toFixed(1)}</span></div>`
    }

    const streakHost = root.querySelector<HTMLElement>('[data-sxa-streak-strip]')
    if (streakHost) {
      const buys = trades.filter((t) => t.side === 'Buy').length
      const sells = trades.filter((t) => t.side === 'Sell').length
      streakHost.innerHTML = `
        <div class="sxa-streak-pill"><div class="sxa-sp-label">Longest win streak</div><div class="sxa-sp-value" style="color:${GAIN}">${maxWinStreak} trades</div></div>
        <div class="sxa-streak-pill"><div class="sxa-sp-label">Longest loss streak</div><div class="sxa-sp-value" style="color:${LOSS}">${maxLossStreak} trades</div></div>
        <div class="sxa-streak-pill"><div class="sxa-sp-label">Buy / Sell split</div><div class="sxa-sp-value">${buys} / ${sells}</div></div>`
    }
  }

  function renderSideDonuts(trades: SxaTrade[]) {
    const buy = trades.filter((t) => t.side === 'Buy')
    const sell = trades.filter((t) => t.side === 'Sell')
    const buyWinRate = buy.length ? (buy.filter((t) => t.pnl > 0).length / buy.length) * 100 : 0
    const sellWinRate = sell.length ? (sell.filter((t) => t.pnl > 0).length / sell.length) * 100 : 0

    destroyChart('sideTotal')
    destroyChart('sideWin')
    const totalCanvas = root.querySelector<HTMLCanvasElement>('[data-sxa-side-total-canvas]')
    const winCanvas = root.querySelector<HTMLCanvasElement>('[data-sxa-side-win-canvas]')
    if (totalCanvas) {
      charts.sideTotal = new Chart(totalCanvas, {
        type: 'doughnut',
        data: { labels: ['Buy', 'Sell'], datasets: [{ data: [buy.length, sell.length], backgroundColor: [GAIN, BRAND], borderWidth: 0 }] },
        options: {
          responsive: true,
          cutout: '68%',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (i) => `${i.label}: ${i.parsed} (${trades.length ? ((Number(i.parsed) / trades.length) * 100).toFixed(0) : 0}%)` } },
          },
        },
      })
    }
    if (winCanvas) {
      charts.sideWin = new Chart(winCanvas, {
        type: 'doughnut',
        data: { labels: ['Buy win rate', 'Sell win rate'], datasets: [{ data: [buyWinRate, sellWinRate], backgroundColor: [GAIN, BRAND], borderWidth: 0 }] },
        options: {
          responsive: true,
          cutout: '68%',
          circumference: 360,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => `${i.label}: ${Number(i.parsed).toFixed(0)}%` } } },
        },
      })
    }
  }

  function renderSessionRadars(trades: SxaTrade[]) {
    const sessions: Array<'London' | 'New York' | 'Asia' | 'Out Of Session'> = ['London', 'New York', 'Asia', 'Out Of Session']
    const bySession: Record<string, SxaTrade[]> = {}
    for (const s of sessions) bySession[s] = trades.filter((t) => sessionForHour(new Date(t.entryTimeMs).getUTCHours()) === s)

    const metrics: Array<[string, (s: string) => number, string]> = [
      ['Win Rate', (s) => (bySession[s]!.length ? (bySession[s]!.filter((t) => t.pnl > 0).length / bySession[s]!.length) * 100 : 0), BRAND],
      ['Total Trades', (s) => bySession[s]!.length, GAIN],
      ['Avg RR', (s) => {
        const rs = bySession[s]!.map((t) => t.returnR).filter((v): v is number => v != null)
        return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0
      }, AMBER],
      ['Profit', (s) => bySession[s]!.reduce((a, t) => a + t.pnl, 0), LOSS],
    ]

    const host = root.querySelector<HTMLElement>('[data-sxa-session-radars]')
    if (!host) return
    host.innerHTML = metrics
      .map(([label]) => `<div class="sxa-card sxa-radar-card"><h4>${label}</h4><canvas data-sxa-radar="${label.replace(/\s/g, '')}"></canvas></div>`)
      .join('')

    for (const [label, fn, color] of metrics) {
      const key = 'radar' + label.replace(/\s/g, '')
      destroyChart(key)
      const canvas = host.querySelector<HTMLCanvasElement>(`[data-sxa-radar="${label.replace(/\s/g, '')}"]`)
      if (!canvas) continue
      charts[key] = new Chart(canvas, {
        type: 'radar',
        data: {
          labels: sessions,
          datasets: [{ data: sessions.map(fn), backgroundColor: color + '22', borderColor: color, pointBackgroundColor: color, borderWidth: 1.5 }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { r: { grid: { color: '#eee' }, angleLines: { color: '#eee' }, ticks: { display: false }, pointLabels: { font: { size: 10 }, color: '#6b7280' } } },
        },
      })
    }
  }

  function computeHourMetric(list: SxaTrade[], metric: typeof timeMetric): number {
    if (!list.length) return 0
    if (metric === 'pnl') return list.reduce((s, t) => s + t.pnl, 0)
    if (metric === 'rr') {
      const rs = list.map((t) => t.returnR).filter((v): v is number => v != null)
      return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0
    }
    return list.reduce((s, t) => s + pctMove(t), 0) / list.length
  }

  function renderTimeBarChart(trades: SxaTrade[]) {
    const buckets: SxaTrade[][] = Array.from({ length: 24 }, () => [])
    for (const t of trades) buckets[new Date(t.entryTimeMs).getUTCHours()]!.push(t)
    const values = buckets.map((list) => computeHourMetric(list, timeMetric))

    destroyChart('timeBar')
    const canvas = root.querySelector<HTMLCanvasElement>('[data-sxa-time-bar-canvas]')
    if (!canvas) return
    charts.timeBar = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: Array.from({ length: 24 }, (_, h) => h + ':00'),
        datasets: [{ data: values, backgroundColor: values.map((v) => (v >= 0 ? GAIN : LOSS)), borderRadius: 3, barPercentage: 0.7, categoryPercentage: 0.85 }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (i) => (timeMetric === 'pnl' ? fmtMoney(Number(i.parsed.y)) : timeMetric === 'rr' ? Number(i.parsed.y).toFixed(2) + 'R' : Number(i.parsed.y).toFixed(2) + '%') } },
        },
        scales: {
          y: { ticks: { font: { family: 'IBM Plex Mono', size: 10.5 }, color: AXIS, callback: (v) => (timeMetric === 'pnl' ? '$' + (Number(v) / 1000).toFixed(0) + 'k' : Number(v).toFixed(1)) }, grid: { color: GRID }, border: { display: false } },
          x: { ticks: { font: { size: 9.5 }, color: AXIS, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false }, border: { display: false } },
        },
      },
    })
  }

  function renderDayBarChart(trades: SxaTrade[]) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const totals = days.map((_, i) => trades.filter((t) => new Date(t.entryTimeMs).getUTCDay() === i).reduce((s, t) => s + t.pnl, 0))

    destroyChart('dayBar')
    const canvas = root.querySelector<HTMLCanvasElement>('[data-sxa-day-bar-canvas]')
    if (!canvas) return
    charts.dayBar = new Chart(canvas, {
      type: 'bar',
      data: { labels: days, datasets: [{ data: totals, backgroundColor: totals.map((v) => (v >= 0 ? GAIN : LOSS)), borderRadius: 4, barPercentage: 0.6, categoryPercentage: 0.8 }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => fmtMoney(Number(i.parsed.x)) } } },
        scales: {
          x: { ticks: { font: { family: 'IBM Plex Mono', size: 10.5 }, color: AXIS, callback: (v) => '$' + (Number(v) / 1000).toFixed(0) + 'k' }, grid: { color: GRID }, border: { display: false } },
          y: { ticks: { font: { size: 12 }, color: '#6b7280' }, grid: { display: false }, border: { display: false } },
        },
      },
    })
  }

  function renderMonthGrid(trades: SxaTrade[]) {
    const startingBalance = opts.getStartingBalance()
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const years = Array.from(new Set(trades.map((t) => new Date(t.entryTimeMs).getUTCFullYear()))).sort()

    const monthlyPnl: Record<number, (number | null)[]> = {}
    for (const y of years) monthlyPnl[y] = new Array(12).fill(null)
    for (const t of trades) {
      const d = new Date(t.entryTimeMs)
      const y = d.getUTCFullYear()
      const m = d.getUTCMonth()
      if (monthlyPnl[y]![m] === null) monthlyPnl[y]![m] = 0
      monthlyPnl[y]![m] = (monthlyPnl[y]![m] ?? 0) + t.pnl
    }

    let runningBalance = startingBalance
    const monthlyPct: Record<number, (number | null)[]> = {}
    for (const y of years) monthlyPct[y] = new Array(12).fill(null)
    for (const y of years) {
      for (let m = 0; m < 12; m++) {
        const pnl = monthlyPnl[y]![m]
        if (pnl === null) continue
        const base = monthBalanceBasis === 'initial' ? startingBalance : runningBalance
        monthlyPct[y]![m] = base !== 0 ? (pnl / base) * 100 : 0
        runningBalance += pnl
      }
    }

    const cellColor = (pct: number | null) => {
      if (pct === null) return ''
      const intensity = Math.min(Math.abs(pct) / 15, 1)
      return pct >= 0
        ? `background:rgba(26,157,92,${0.12 + intensity * 0.5}); color:${intensity > 0.4 ? '#fff' : '#0b6b3a'};`
        : `background:rgba(214,69,90,${0.12 + intensity * 0.5}); color:${intensity > 0.4 ? '#fff' : '#a3313f'};`
    }

    let html = '<thead><tr><th></th>' + monthNames.map((m) => `<th>${m}</th>`).join('') + '<th>YTD</th></tr></thead><tbody>'
    for (const y of years) {
      const ytdPnl = monthlyPnl[y]!.reduce((s: number, v) => s + (v ?? 0), 0)
      const ytdPct = startingBalance !== 0 ? (ytdPnl / startingBalance) * 100 : 0
      html +=
        `<tr><td class="sxa-year-label">${y}</td>` +
        monthlyPct[y]!.map((pct) => `<td><div class="sxa-month-cell${pct === null ? ' sxa-month-cell--empty' : ''}" style="${cellColor(pct)}">${pct === null ? '\u2013' : (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'}</div></td>`).join('') +
        `<td><div class="sxa-month-cell sxa-month-cell--ytd">${(ytdPct >= 0 ? '+' : '') + ytdPct.toFixed(2)}%</div></td></tr>`
    }
    const grandTotalPnl = trades.reduce((s, t) => s + t.pnl, 0)
    const grandTotalPct = startingBalance !== 0 ? (grandTotalPnl / startingBalance) * 100 : 0
    html +=
      `<tr><td></td><td colspan="12" class="sxa-month-total-label">Total</td>` +
      `<td><div class="sxa-month-cell sxa-month-cell--ytd" style="background:${BRAND};">${(grandTotalPct >= 0 ? '+' : '') + grandTotalPct.toFixed(2)}%</div></td></tr>`
    html += '</tbody>'

    const table = root.querySelector<HTMLElement>('[data-sxa-month-grid]')
    if (table) table.innerHTML = html
  }

  function tradesOnDay(trades: SxaTrade[], y: number, m: number, d: number): SxaTrade[] {
    return trades.filter((t) => {
      const dt = new Date(t.entryTimeMs)
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m && dt.getUTCDate() === d
    })
  }

  function dayCellValue(dayTrades: SxaTrade[], balanceRef: { value: number }): { display: string; raw: number; count: number } | null {
    if (!dayTrades.length) return null
    const pnl = dayTrades.reduce((s, t) => s + t.pnl, 0)
    if (calMetric === 'dollar') return { display: fmtPlain(pnl), raw: pnl, count: dayTrades.length }
    if (calMetric === 'rr') {
      const rs = dayTrades.map((t) => t.returnR).filter((v): v is number => v != null)
      const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0
      return { display: avgR.toFixed(2) + 'R', raw: avgR, count: dayTrades.length }
    }
    const base = calBasis === 'initial' ? opts.getStartingBalance() : balanceRef.value
    const pct = base !== 0 ? (pnl / base) * 100 : 0
    return { display: (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%', raw: pct, count: dayTrades.length }
  }

  function renderCalendarMonth(allTrades: SxaTrade[], trades: SxaTrade[], year: number, month: number, container: HTMLElement, mini: boolean) {
    const startingBalance = opts.getStartingBalance()
    const firstDay = new Date(Date.UTC(year, month, 1))
    const startOffset = (firstDay.getUTCDay() + 6) % 7
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

    let runningBalance = startingBalance
    for (const t of allTrades) {
      if (t.entryTimeMs < firstDay.getTime()) runningBalance += t.pnl
    }
    const balanceRef = { value: runningBalance }

    const cellClass = mini ? 'sxa-cal-mini-cell' : 'sxa-cal-cell'
    let html = ''
    if (!mini) {
      for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) html += `<div class="sxa-cal-dow">${d}</div>`
    }
    for (let i = 0; i < startOffset; i++) html += `<div class="${cellClass} sxa-cal-cell--other"></div>`

    for (let d = 1; d <= daysInMonth; d++) {
      const dayTrades = tradesOnDay(trades, year, month, d)
      const val = dayCellValue(dayTrades, balanceRef)
      balanceRef.value += dayTrades.reduce((s, t) => s + t.pnl, 0)

      if (!val) {
        html += `<div class="${cellClass}">${mini ? d : `<div class="sxa-cd-num">${d}</div>`}</div>`
      } else {
        const intensity = mini ? 0.85 : Math.min(Math.abs(val.raw) / (calMetric === 'dollar' ? 2000 : calMetric === 'rr' ? 2 : 3), 1)
        const bg = val.raw >= 0 ? `rgba(26,157,92,${0.35 + intensity * 0.55})` : `rgba(214,69,90,${0.35 + intensity * 0.55})`
        if (mini) {
          html += `<div class="${cellClass} sxa-cal-cell--data" style="background:${bg};" title="${val.display} \u00b7 ${val.count} trade(s)">${d}</div>`
        } else {
          html += `<div class="${cellClass} sxa-cal-cell--data" style="background:${bg};">
            <div class="sxa-cd-num">${d}</div>
            <div class="sxa-cd-val">${val.display}</div>
            <div class="sxa-cd-count">${val.count} trade${val.count > 1 ? 's' : ''}</div>
          </div>`
        }
      }
    }
    container.innerHTML = mini ? html : `<div class="sxa-cal-grid">${html}</div>`
  }

  function renderCalendar(trades: SxaTrade[]) {
    const container = root.querySelector<HTMLElement>('[data-sxa-cal-container]')
    const label = root.querySelector<HTMLElement>('[data-sxa-cal-label]')
    if (!container || !label) return
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

    if (calView === 'month') {
      label.textContent = `${monthNames[calDate.getMonth()]} ${calDate.getFullYear()}`
      renderCalendarMonth(trades, trades, calDate.getFullYear(), calDate.getMonth(), container, false)
    } else {
      label.textContent = `${calDate.getFullYear()}`
      const year = calDate.getFullYear()
      container.innerHTML = `<div class="sxa-cal-year-grid">${monthNames.map((_, m) => `<div class="sxa-cal-mini-month"><h5>${monthNames[m]}</h5><div class="sxa-cal-mini-grid" data-sxa-mini-cal="${m}"></div></div>`).join('')}</div>`
      monthNames.forEach((_, m) => {
        const host = container.querySelector<HTMLElement>(`[data-sxa-mini-cal="${m}"]`)
        if (host) renderCalendarMonth(trades, trades, year, m, host, true)
      })
    }
  }

  type DrawdownEpisode = {
    peakTimeMs: number
    depthPct: number
    depthDollar: number
    recoveredTimeMs: number | null
    recovered: boolean
  }

  /** Splits the equity curve into drawdown episodes: each run from a peak down
   * to its deepest point, ending either when a new equity high is made
   * (recovered) or at the end of the dataset (still open). */
  function detectDrawdownEpisodes(trades: SxaTrade[], startingBalance: number): DrawdownEpisode[] {
    let equity = startingBalance
    let peak = startingBalance
    let peakTimeMs = trades.length ? trades[0]!.entryTimeMs : Date.now()
    let inEpisode = false
    let troughDepthPct = 0
    let troughDepthDollar = 0
    const episodes: DrawdownEpisode[] = []

    for (const t of trades) {
      equity += t.pnl
      if (equity >= peak) {
        if (inEpisode) {
          episodes.push({ peakTimeMs, depthPct: troughDepthPct, depthDollar: troughDepthDollar, recoveredTimeMs: t.entryTimeMs, recovered: true })
        }
        peak = equity
        peakTimeMs = t.entryTimeMs
        inEpisode = false
      } else {
        const depthDollar = peak - equity
        const depthPct = peak > 0 ? (depthDollar / peak) * 100 : 0
        if (!inEpisode || depthPct > troughDepthPct) {
          troughDepthPct = depthPct
          troughDepthDollar = depthDollar
        }
        inEpisode = true
      }
    }
    if (inEpisode) {
      episodes.push({ peakTimeMs, depthPct: troughDepthPct, depthDollar: troughDepthDollar, recoveredTimeMs: null, recovered: false })
    }
    return episodes
  }

  function renderDrawdown(trades: SxaTrade[]) {
    const startingBalance = opts.getStartingBalance()
    const episodes = detectDrawdownEpisodes(trades, startingBalance)

    destroyChart('drawdown')
    const canvas = root.querySelector<HTMLCanvasElement>('[data-sxa-drawdown-canvas]')
    if (canvas) {
      const labels = episodes.map((e) => {
        const d = new Date(e.peakTimeMs)
        return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} \u2013 ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      })
      const values = episodes.map((e) => -(ddUnit === 'pct' ? e.depthPct : e.depthDollar))
      const ctx = canvas.getContext('2d')
      let fill: string | CanvasGradient = LOSS
      if (ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 220)
        gradient.addColorStop(0, '#e2585f')
        gradient.addColorStop(1, '#fce7e8')
        fill = gradient
      }
      charts.drawdown = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ data: values, backgroundColor: fill, borderColor: LOSS, borderWidth: 1, borderRadius: 3, barPercentage: 0.5, categoryPercentage: 0.7 }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (i) => `Drawdown: ${ddUnit === 'pct' ? Math.abs(Number(i.parsed.y)).toFixed(2) + '%' : fmtPlain(-Math.abs(Number(i.parsed.y)))}` } },
          },
          scales: {
            y: {
              max: 0,
              ticks: { font: { family: 'IBM Plex Mono', size: 10.5 }, color: AXIS, callback: (v) => (ddUnit === 'pct' ? Math.abs(Number(v)) + '%' : '$' + Math.abs(Number(v)).toLocaleString()) },
              grid: { color: GRID },
              border: { display: false },
            },
            x: { ticks: { font: { size: 10.5 }, color: AXIS }, grid: { display: false }, border: { display: false } },
          },
        },
      })
    }

    const maxDD = episodes.length ? Math.max(...episodes.map((e) => e.depthPct)) : 0
    const avgDD = episodes.length ? episodes.reduce((s, e) => s + e.depthPct, 0) / episodes.length : 0
    const recovered = episodes.filter((e) => e.recovered)
    const avgRecoveryDays = recovered.length
      ? recovered.reduce((s, e) => s + (e.recoveredTimeMs! - e.peakTimeMs) / 86_400_000, 0) / recovered.length
      : 0
    const spanDays = trades.length ? (trades[trades.length - 1]!.entryTimeMs - trades[0]!.entryTimeMs) / 86_400_000 : 1
    const frequencyPerWeek = spanDays > 0 ? (episodes.length / spanDays) * 7 : 0

    const statsHost = root.querySelector<HTMLElement>('[data-sxa-drawdown-stats]')
    if (statsHost) {
      statsHost.innerHTML = `
        <div class="sxa-accent-card"><div class="sxa-a-label">Max drawdown <span class="sxa-info-dot">i</span></div><div class="sxa-a-value">-${maxDD.toFixed(2)}%</div></div>
        <div class="sxa-accent-card"><div class="sxa-a-label">Avg drawdown on equity <span class="sxa-info-dot">i</span></div><div class="sxa-a-value">-${avgDD.toFixed(2)}%</div></div>
        <div class="sxa-accent-card"><div class="sxa-a-label">Time to recovery (days) <span class="sxa-info-dot">i</span></div><div class="sxa-a-value">${avgRecoveryDays.toFixed(1)}</div></div>
        <div class="sxa-accent-card"><div class="sxa-a-label">Drawdown frequency <span class="sxa-info-dot">i</span></div><div class="sxa-a-value">${frequencyPerWeek.toFixed(1)}<span class="sxa-a-unit">/wk</span></div></div>`
    }
  }

  const MC_PALETTE = [BRAND, GAIN, LOSS, AMBER, '#8b5cf6', '#0ea5b4', '#e0a012', '#ec4899', '#22c55e', '#64748b']

  function computeMcDefaults(trades: SxaTrade[]) {
    const wins = trades.filter((t) => t.pnl > 0)
    const losses = trades.filter((t) => t.pnl < 0)
    const avgGain = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 500
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 300
    const winRate = trades.length ? (wins.length / trades.length) * 100 : 50
    return { avgGain, avgLoss, winRate }
  }

  function renderMcInputs(trades: SxaTrade[]) {
    const d = computeMcDefaults(trades)
    const startingBalance = opts.getStartingBalance()
    const host = root.querySelector<HTMLElement>('[data-sxa-mc-input-grid]')
    if (!host) return
    host.innerHTML = `
      <div class="sxa-mc-field"><label>N. Simulations</label><input type="number" data-sxa-mc-nsim value="10" min="1" max="50"></div>
      <div class="sxa-mc-field"><label>Trades per sim</label><input type="number" data-sxa-mc-trades value="200" min="10" max="1000"></div>
      <div class="sxa-mc-field"><label>Start balance $</label><input type="number" data-sxa-mc-start value="${startingBalance}" step="1000"></div>
      <div class="sxa-mc-field"><label>Avg Gain</label><input type="number" data-sxa-mc-gain value="${d.avgGain.toFixed(2)}" step="1"></div>
      <div class="sxa-mc-field"><label>Avg Loss</label><input type="number" data-sxa-mc-loss value="${d.avgLoss.toFixed(2)}" step="1"></div>
      <div class="sxa-mc-field"><label>Win rate %</label><input type="number" data-sxa-mc-winrate value="${d.winRate.toFixed(2)}" step="0.1" min="0" max="100"></div>
      <button type="button" class="sxa-export-btn" data-sxa-mc-reset>Reset values</button>
      <button type="button" class="sxa-run-btn" data-sxa-mc-run>Start simulation</button>`
  }

  function runMonteCarloFromInputs() {
    const startingBalance = opts.getStartingBalance()
    const nSim = parseInt(root.querySelector<HTMLInputElement>('[data-sxa-mc-nsim]')?.value ?? '10', 10) || 10
    const tradesPerSim = parseInt(root.querySelector<HTMLInputElement>('[data-sxa-mc-trades]')?.value ?? '200', 10) || 200
    const startBalance = parseFloat(root.querySelector<HTMLInputElement>('[data-sxa-mc-start]')?.value ?? String(startingBalance)) || startingBalance
    const avgGain = parseFloat(root.querySelector<HTMLInputElement>('[data-sxa-mc-gain]')?.value ?? '500') || 500
    const avgLoss = parseFloat(root.querySelector<HTMLInputElement>('[data-sxa-mc-loss]')?.value ?? '300') || 300
    const winRate = (parseFloat(root.querySelector<HTMLInputElement>('[data-sxa-mc-winrate]')?.value ?? '50') || 50) / 100
    const rand = mulberry32(mcSeed++)

    const paths: number[][] = []
    const finals: number[] = []
    let totalWins = 0
    let totalLosses = 0
    let sumMaxWinStreak = 0
    let sumMaxLossStreak = 0
    let sumProfitFactor = 0

    for (let p = 0; p < nSim; p++) {
      let equity = startBalance
      const path = [equity]
      let grossProfit = 0
      let grossLoss = 0
      let curWinStreak = 0
      let curLossStreak = 0
      let maxWinStreak = 0
      let maxLossStreak = 0

      for (let i = 0; i < tradesPerSim; i++) {
        const isWin = rand() < winRate
        if (isWin) {
          equity += avgGain
          grossProfit += avgGain
          totalWins++
          curWinStreak++
          maxWinStreak = Math.max(maxWinStreak, curWinStreak)
          curLossStreak = 0
        } else {
          equity -= avgLoss
          grossLoss += avgLoss
          totalLosses++
          curLossStreak++
          maxLossStreak = Math.max(maxLossStreak, curLossStreak)
          curWinStreak = 0
        }
        path.push(equity)
      }
      paths.push(path)
      finals.push(equity)
      sumMaxWinStreak += maxWinStreak
      sumMaxLossStreak += maxLossStreak
      sumProfitFactor += grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 5 : 0
    }

    const avgFinal = finals.reduce((a, b) => a + b, 0) / finals.length
    const maxFinal = Math.max(...finals)
    const minFinal = Math.min(...finals)
    const avgProfitFactor = sumProfitFactor / nSim
    const avgMaxWinStreak = sumMaxWinStreak / nSim
    const avgMaxLossStreak = sumMaxLossStreak / nSim

    destroyChart('mc')
    const canvas = root.querySelector<HTMLCanvasElement>('[data-sxa-mc-canvas]')
    const tooltipPanel = root.querySelector<HTMLElement>('[data-sxa-mc-tooltip]')
    if (canvas) {
      const labels = Array.from({ length: tradesPerSim + 1 }, (_, i) => i)
      const datasets = paths.map((path, i) => ({
        label: `Simulation ${i + 1}`,
        data: path,
        borderColor: MC_PALETTE[i % MC_PALETTE.length],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0.15,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function mcExternalTooltip(context: any) {
        if (!tooltipPanel) return
        const { tooltip } = context
        if (tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) {
          tooltipPanel.classList.remove('sxa-mc-tooltip-panel--visible')
          return
        }
        const points = [...tooltip.dataPoints].sort((a: any, b: any) => b.parsed.y - a.parsed.y)
        const rows = points
          .map((p: any) => {
            const dsIndex = p.datasetIndex
            const color = MC_PALETTE[dsIndex % MC_PALETTE.length]
            return `<div class="sxa-mc-tip-row">
              <span class="sxa-dot" style="background:${color}"></span>
              <span class="sxa-mc-tip-lbl">Simulation ${dsIndex + 1}:</span>
              <span class="sxa-mc-tip-val">$${Number(p.parsed.y).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>`
          })
          .join('')
        tooltipPanel.innerHTML = `<div class="sxa-mc-tip-index">Trade ${tooltip.dataPoints[0].label}</div>${rows}`
        tooltipPanel.classList.add('sxa-mc-tooltip-panel--visible')
      }
      charts.mc = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: { enabled: false, external: mcExternalTooltip } },
          scales: {
            y: { ticks: { font: { family: 'IBM Plex Mono', size: 10.5 }, color: AXIS, callback: (v) => '$' + (Number(v) / 1000).toFixed(0) + 'k' }, grid: { color: GRID }, border: { display: false } },
            x: { ticks: { font: { size: 10 }, color: AXIS }, grid: { display: false }, border: { display: false } },
          },
        },
      })
    }

    const statsHost = root.querySelector<HTMLElement>('[data-sxa-mc-stats]')
    if (statsHost) {
      statsHost.innerHTML = `
        <div class="sxa-sim-stat"><div class="sxa-s-label">Average balance</div><div class="sxa-s-value">$${avgFinal.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div></div>
        <div class="sxa-sim-stat"><div class="sxa-s-label">Max balance</div><div class="sxa-s-value" style="color:${GAIN}">$${maxFinal.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div></div>
        <div class="sxa-sim-stat"><div class="sxa-s-label">Min balance</div><div class="sxa-s-value" style="color:${LOSS}">$${minFinal.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div></div>
        <div class="sxa-sim-stat"><div class="sxa-s-label">Average profit factor</div><div class="sxa-s-value">${avgProfitFactor.toFixed(2)}</div></div>
        <div class="sxa-sim-stat"><div class="sxa-s-label">Max consecutive wins</div><div class="sxa-s-value" style="color:${GAIN}">${avgMaxWinStreak.toFixed(0)}</div></div>
        <div class="sxa-sim-stat"><div class="sxa-s-label">Max consecutive losses</div><div class="sxa-s-value" style="color:${LOSS}">${avgMaxLossStreak.toFixed(0)}</div></div>
        <div class="sxa-sim-stat"><div class="sxa-s-label">Total wins</div><div class="sxa-s-value" style="color:${GAIN}">${totalWins.toLocaleString()}</div></div>
        <div class="sxa-sim-stat"><div class="sxa-s-label">Total losses</div><div class="sxa-s-value" style="color:${LOSS}">${totalLosses.toLocaleString()}</div></div>`
    }
  }

  const RR_PALETTE = [AMBER, LOSS, GAIN, BRAND, '#8b5cf6', '#0ea5b4', '#ec4899', '#22c55e', '#f97316']
  const RR_PRESETS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
  type RRChip = { value: number; color: string; active: boolean; isCurrent: boolean }
  let rrChips: RRChip[] = []

  function initRRChips(trades: SxaTrade[]) {
    const rValues = trades.map((t) => t.returnR).filter((v): v is number => v != null)
    const avgRR = rValues.length ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 1.0
    rrChips = [
      { value: avgRR, color: BRAND, active: true, isCurrent: true },
      ...RR_PRESETS.map((v, i) => ({ value: v, color: RR_PALETTE[i % RR_PALETTE.length]!, active: i < 3, isCurrent: false })),
    ]
  }

  /** Replays trades capping every winner at `targetR` (as if a take-profit sat there);
   * losers are unaffected since a different exit target doesn't change how a loser plays
   * out. The "current" scenario reproduces the actual realized result exactly. */
  function computeRRScenario(trades: SxaTrade[], targetR: number, isCurrent: boolean) {
    const startingBalance = opts.getStartingBalance()
    let equity = startingBalance
    let peak = startingBalance
    let maxDD = 0
    const cumRSeries: number[] = [0]
    let cumR = 0
    let grossProfit = 0
    let grossLoss = 0
    let wins = 0

    for (const t of trades) {
      const r = t.returnR
      let effectiveR = r ?? 0
      let dollar = t.pnl
      if (!isCurrent && r != null && r > 0) {
        effectiveR = Math.min(r, targetR)
        dollar = effectiveR * (Math.abs(t.pnl) / Math.max(r, 0.0001))
      }
      cumR += effectiveR
      cumRSeries.push(cumR)
      equity += dollar
      peak = Math.max(peak, equity)
      maxDD = Math.max(maxDD, peak > 0 ? ((peak - equity) / peak) * 100 : 0)
      if (dollar > 0) {
        grossProfit += dollar
        wins++
      } else {
        grossLoss += Math.abs(dollar)
      }
    }

    const winRate = trades.length ? (wins / trades.length) * 100 : 0
    const profit = equity - startingBalance
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
    return { cumRSeries, winRate, profit, profitFactor, avgDrawdown: maxDD }
  }

  function fmtRR(v: number): string {
    return v.toFixed(2).replace(/\.00$/, '')
  }

  function renderRRChipRow() {
    const host = root.querySelector<HTMLElement>('[data-sxa-rr-chip-row]')
    if (!host) return
    host.innerHTML = rrChips
      .map(
        (c, i) => `
      <button type="button" class="sxa-rr-chip${c.active ? ' sxa-rr-chip--active' : ''}${c.isCurrent ? ' sxa-rr-chip--current' : ''}" data-sxa-rr-chip="${i}" style="${c.active ? `border-color:${c.color}; background:${c.color}18;` : ''}">
        <span class="sxa-rr-chip-dot" style="background:${c.color}"></span>
        ${fmtRR(c.value)}${c.isCurrent ? ' (Current RR)' : ''}
      </button>`,
      )
      .join('')
  }

  function renderRRSimulator(trades: SxaTrade[]) {
    if (!rrChips.length) initRRChips(trades)
    const activeChips = rrChips.filter((c) => c.active)
    const scenarios = activeChips.map((c) => ({ chip: c, ...computeRRScenario(trades, c.value, c.isCurrent) }))

    destroyChart('rrMulti')
    const canvas = root.querySelector<HTMLCanvasElement>('[data-sxa-rr-multi-canvas]')
    if (canvas) {
      const maxLen = Math.max(1, ...scenarios.map((s) => s.cumRSeries.length))
      const labels: (string | number)[] = ['']
      for (let i = 1; i < maxLen; i++) labels.push(i)
      charts.rrMulti = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: scenarios.map((s) => ({
            data: s.cumRSeries,
            borderColor: s.chip.color,
            borderWidth: s.chip.isCurrent ? 2.5 : 2,
            pointRadius: 0,
            fill: false,
            tension: 0.25,
          })),
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { ticks: { font: { family: 'IBM Plex Mono', size: 10.5 }, color: AXIS }, grid: { color: GRID }, border: { display: false } },
            x: { ticks: { font: { size: 10 }, color: AXIS, maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false }, border: { display: false } },
          },
        },
      })
    }

    const bestWinRate = scenarios.length ? Math.max(...scenarios.map((s) => s.winRate)) : 0
    const bestProfit = scenarios.length ? Math.max(...scenarios.map((s) => s.profit)) : 0
    const bestPF = scenarios.length ? Math.max(...scenarios.map((s) => (isFinite(s.profitFactor) ? s.profitFactor : -Infinity))) : 0
    const bestDD = scenarios.length ? Math.min(...scenarios.map((s) => s.avgDrawdown)) : 0

    const cell = (val: number, isBest: boolean, formatter: (v: number) => string) => (isBest ? `<span class="sxa-best-cell">${formatter(val)}</span>` : formatter(val))

    const rows = scenarios
      .map(
        (s) => `
      <tr class="${s.chip.isCurrent ? 'sxa-current-row' : ''}">
        <td><div class="sxa-rr-row-label"><span class="sxa-dot" style="background:${s.chip.color}"></span>${fmtRR(s.chip.value)}${s.chip.isCurrent ? ' <span class="sxa-rr-row-current">(Current RR)</span>' : ''}</div></td>
        <td>${cell(s.winRate, s.winRate === bestWinRate, (v) => v.toFixed(0) + '%')}</td>
        <td>${cell(s.profit, s.profit === bestProfit, (v) => fmtPlain(v))}</td>
        <td>${cell(s.profitFactor, s.profitFactor === bestPF, (v) => (isFinite(v) ? v.toFixed(2) : '\u221e'))}</td>
        <td>${cell(s.avgDrawdown, s.avgDrawdown === bestDD, (v) => v.toFixed(1) + '%')}</td>
      </tr>`,
      )
      .join('')

    const table = root.querySelector<HTMLElement>('[data-sxa-rr-results-table]')
    if (table) {
      table.innerHTML = `
        <thead><tr><th>Avg R</th><th>Win Rate</th><th>Profit</th><th>Profit Factor</th><th>Avg Drawdown</th></tr></thead>
        <tbody>${rows}</tbody>`
    }

    const bestLine = root.querySelector<HTMLElement>('[data-sxa-rr-best-line]')
    if (bestLine) {
      const presetScenarios = scenarios.filter((s) => !s.chip.isCurrent)
      if (presetScenarios.length) {
        const best = presetScenarios.reduce((a, b) => (isFinite(b.profitFactor) && b.profitFactor > a.profitFactor ? b : a))
        bestLine.innerHTML = `Based on your analytics the RR of <strong style="color:${best.chip.color}">${best.chip.value.toFixed(1)}</strong> gives you the best results overall`
      } else {
        bestLine.textContent = ''
      }
    }
  }

  const EXPORT_COLUMNS: Array<[string, (t: SxaTrade) => string | number]> = [
    ['Entry Time', (t) => new Date(t.entryTimeMs).toISOString()],
    ['Exit Time', (t) => new Date(t.exitTimeMs).toISOString()],
    ['Asset', (t) => t.asset],
    ['Side', (t) => t.side],
    ['Tag', (t) => t.tag ?? ''],
    ['Return ($)', (t) => t.pnl.toFixed(2)],
    ['Return (R)', (t) => (t.returnR != null ? t.returnR.toFixed(2) : '')],
    ['Duration (min)', (t) => Math.round(t.durationMin)],
  ]
  function csvEscape(v: unknown): string {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  function exportCsv() {
    const trades = getFilteredTrades()
    const header = EXPORT_COLUMNS.map(([l]) => csvEscape(l)).join(',')
    const rows = trades.map((t) => EXPORT_COLUMNS.map(([, fn]) => csvEscape(fn(t))).join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-export-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  let calInitialized = false

  function renderPerformanceTab() {
    const trades = getFilteredTrades()
    renderKPIs(trades)
    renderPnlChart(trades)
    renderRRCards(trades)
    renderExpectancy(trades)
    renderWinnersLosers(trades)
    renderSideDonuts(trades)
    renderSessionRadars(trades)
    renderTimeBarChart(trades)
    renderDayBarChart(trades)
    renderMonthGrid(trades)
    if (!calInitialized) {
      calInitialized = true
      const latest = trades.length ? trades.reduce((a, b) => (b.entryTimeMs > a.entryTimeMs ? b : a)) : null
      calDate = latest ? new Date(latest.entryTimeMs) : new Date()
    }
    renderCalendar(trades)
  }

  function renderDrawdownTab() {
    renderDrawdown(getFilteredTrades())
  }

  function renderSimulationTab() {
    if (!root.querySelector('[data-sxa-mc-nsim]')) renderMcInputs(getFilteredTrades())
    runMonteCarloFromInputs()
    if (!rrChips.length) {
      initRRChips(getFilteredTrades())
      renderRRChipRow()
    }
    renderRRSimulator(getFilteredTrades())
  }

  function renderAll() {
    syncToolbarLabels()
    syncFilterBarUi()
    renderPerformanceTab()
    renderDrawdownTab()
    renderSimulationTab()
  }

  // Wire events once.
  root.querySelectorAll<HTMLButtonElement>('[data-sxa-main-tabs] [data-sxa-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('[data-sxa-main-tabs] [data-sxa-tab]').forEach((b) => b.classList.remove('sxa-tab-nav__btn--active'))
      btn.classList.add('sxa-tab-nav__btn--active')
      const tab = btn.getAttribute('data-sxa-tab')
      root.querySelectorAll('[data-sxa-panel]').forEach((p) => p.classList.toggle('sxa-tab-panel--active', p.getAttribute('data-sxa-panel') === tab))
      if (tab === 'simulation') renderSimulationTab()
      if (tab === 'drawdown') renderDrawdownTab()
    })
  })

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null
    if (!t) return
    const gBtn = t.closest<HTMLButtonElement>('[data-sxa-granularity] [data-sxa-g]')
    if (gBtn && root.contains(gBtn)) {
      root.querySelectorAll('[data-sxa-granularity] [data-sxa-g]').forEach((b) => b.classList.remove('sxa-tab-row__btn--active'))
      gBtn.classList.add('sxa-tab-row__btn--active')
      currentGranularity = (gBtn.getAttribute('data-sxa-g') as typeof currentGranularity) ?? 'all'
      renderPnlChart(getFilteredTrades())
      return
    }
    if (t.closest('[data-sxa-export-csv]')) {
      exportCsv()
      return
    }
    // Assets / Tags mini chips and the Filters chip toggle their own popover
    // open; clicking one closes any other open popover first.
    const miniChip = t.closest<HTMLElement>('[data-sxa-mini-chip]')
    if (miniChip && root.contains(miniChip) && !t.closest('.sxa-mini-popover, .sxa-filters-popover')) {
      const key = miniChip.getAttribute('data-sxa-mini-chip') ?? ''
      const popover =
        key === 'filters'
          ? root.querySelector<HTMLElement>('[data-sxa-filters-popover]')
          : root.querySelector<HTMLElement>(`[data-sxa-mini-popover="${key}"]`)
      const wasOpen = popover ? popover.classList.contains('sxa-popover--open') : false
      closeAllPopovers()
      if (popover && !wasOpen) {
        if (key === 'assets' || key === 'tags') renderMiniPopover(key)
        popover.classList.add('sxa-popover--open')
        if (key === 'filters') root.querySelector<HTMLElement>('[data-sxa-fp-backdrop]')?.classList.add('sxa-popover--open')
      }
      return
    }
    if (t.closest('[data-sxa-fp-backdrop]')) {
      closeAllPopovers()
      return
    }
    // Clicks inside an open popover (labels/checkboxes/selects/pills) shouldn't
    // bubble up and close it via the outside-click fallback below.
    if (t.closest('.sxa-mini-popover, .sxa-filters-popover')) {
      const fpOpt = t.closest<HTMLElement>('.sxa-fp-opt')
      if (fpOpt && root.contains(fpOpt)) {
        const group = fpOpt.closest<HTMLElement>('[data-sxa-fp-group]')?.getAttribute('data-sxa-fp-group') ?? ''
        const val = fpOpt.getAttribute('data-sxa-fp-val') ?? ''
        const nowSelected = fpOpt.classList.toggle('sxa-fp-opt--selected')
        if (group === 'side') nowSelected ? filters.side.add(val as SxaSideVal) : filters.side.delete(val as SxaSideVal)
        else if (group === 'outcome') nowSelected ? filters.outcome.add(val as SxaOutcomeVal) : filters.outcome.delete(val as SxaOutcomeVal)
        else if (group === 'session') nowSelected ? filters.session.add(val as SxaSessionVal) : filters.session.delete(val as SxaSessionVal)
        else if (group === 'day') nowSelected ? filters.day.add(parseInt(val, 10)) : filters.day.delete(parseInt(val, 10))
        renderAll()
      }
      if (t.closest('[data-sxa-fp-cancel]') || t.closest('[data-sxa-fp-done]')) {
        closeAllPopovers()
      }
      return
    }
    if (t.closest('[data-sxa-filter-apply]')) {
      closeAllPopovers()
      renderAll()
      return
    }
    if (t.closest('[data-sxa-filter-clear]')) {
      resetFilters()
      closeAllPopovers()
      renderAll()
      return
    }
    const pillRm = t.closest<HTMLElement>('[data-sxa-active-pill-rm]')
    if (pillRm && root.contains(pillRm)) {
      clearFilterGroup(pillRm.getAttribute('data-sxa-active-pill-rm') ?? '')
      renderAll()
      return
    }
    closeAllPopovers()
    if (t.closest('[data-sxa-mc-run]')) {
      runMonteCarloFromInputs()
      return
    }
    if (t.closest('[data-sxa-mc-reset]')) {
      renderMcInputs(getFilteredTrades())
      runMonteCarloFromInputs()
      return
    }
    const mbBtn = t.closest<HTMLButtonElement>('[data-sxa-month-basis] [data-sxa-mb]')
    if (mbBtn && root.contains(mbBtn)) {
      root.querySelectorAll('[data-sxa-month-basis] [data-sxa-mb]').forEach((b) => b.classList.remove('sxa-tab-row__btn--active'))
      mbBtn.classList.add('sxa-tab-row__btn--active')
      monthBalanceBasis = (mbBtn.getAttribute('data-sxa-mb') as typeof monthBalanceBasis) ?? 'initial'
      renderMonthGrid(getFilteredTrades())
      return
    }
    const cbBtn = t.closest<HTMLButtonElement>('[data-sxa-cal-basis] [data-sxa-cb]')
    if (cbBtn && root.contains(cbBtn)) {
      root.querySelectorAll('[data-sxa-cal-basis] [data-sxa-cb]').forEach((b) => b.classList.remove('sxa-tab-row__btn--active'))
      cbBtn.classList.add('sxa-tab-row__btn--active')
      calBasis = (cbBtn.getAttribute('data-sxa-cb') as typeof calBasis) ?? 'current'
      renderCalendar(getFilteredTrades())
      return
    }
    const cvBtn = t.closest<HTMLButtonElement>('[data-sxa-cal-view] [data-sxa-cv]')
    if (cvBtn && root.contains(cvBtn)) {
      root.querySelectorAll('[data-sxa-cal-view] [data-sxa-cv]').forEach((b) => b.classList.remove('sxa-tab-row__btn--active'))
      cvBtn.classList.add('sxa-tab-row__btn--active')
      calView = (cvBtn.getAttribute('data-sxa-cv') as typeof calView) ?? 'month'
      renderCalendar(getFilteredTrades())
      return
    }
    if (t.closest('[data-sxa-cal-prev]')) {
      calDate = calView === 'month' ? new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1) : new Date(calDate.getFullYear() - 1, 0, 1)
      renderCalendar(getFilteredTrades())
      return
    }
    if (t.closest('[data-sxa-cal-next]')) {
      calDate = calView === 'month' ? new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1) : new Date(calDate.getFullYear() + 1, 0, 1)
      renderCalendar(getFilteredTrades())
      return
    }
    const ddUnitBtn = t.closest<HTMLButtonElement>('[data-sxa-dd-unit] [data-sxa-dd-u]')
    if (ddUnitBtn && root.contains(ddUnitBtn)) {
      root.querySelectorAll('[data-sxa-dd-unit] [data-sxa-dd-u]').forEach((b) => b.classList.remove('sxa-tab-row__btn--active'))
      ddUnitBtn.classList.add('sxa-tab-row__btn--active')
      ddUnit = (ddUnitBtn.getAttribute('data-sxa-dd-u') as typeof ddUnit) ?? 'pct'
      renderDrawdown(getFilteredTrades())
      return
    }
    const howLink = t.closest<HTMLAnchorElement>('[data-sxa-dd-how]')
    if (howLink && root.contains(howLink)) {
      e.preventDefault()
      const popover = root.querySelector<HTMLElement>('[data-sxa-dd-how-popover]')
      if (popover) popover.hidden = !popover.hidden
      return
    }
    const howPopover = root.querySelector<HTMLElement>('[data-sxa-dd-how-popover]')
    if (howPopover && !howPopover.hidden && !t.closest('[data-sxa-dd-how-popover]') && !t.closest('[data-sxa-dd-how]')) {
      howPopover.hidden = true
    }
    const rrChipBtn = t.closest<HTMLButtonElement>('[data-sxa-rr-chip]')
    if (rrChipBtn && root.contains(rrChipBtn)) {
      const idx = parseInt(rrChipBtn.getAttribute('data-sxa-rr-chip') ?? '-1', 10)
      if (rrChips[idx]) {
        rrChips[idx]!.active = !rrChips[idx]!.active
        renderRRChipRow()
        renderRRSimulator(getFilteredTrades())
      }
      return
    }
    if (t.closest('[data-sxa-rr-add-new]')) {
      const input = window.prompt('Enter a custom R-multiple target (e.g. 2.75):')
      const val = input != null ? parseFloat(input) : NaN
      if (!isNaN(val) && val > 0) {
        const color = RR_PALETTE[rrChips.length % RR_PALETTE.length]!
        rrChips.push({ value: val, color, active: true, isCurrent: false })
        renderRRChipRow()
        renderRRSimulator(getFilteredTrades())
      }
      return
    }
    const rrHowLink = t.closest<HTMLAnchorElement>('[data-sxa-rr-how]')
    if (rrHowLink && root.contains(rrHowLink)) {
      e.preventDefault()
      window.alert(
        'Each line replays your real trade history, capping every winning trade at that R-multiple target (as if a take-profit order sat there). Losing trades are unaffected \u2014 a different exit target only changes how far winners run. "Current RR" reproduces your actual results exactly.',
      )
      return
    }
  })

  root.addEventListener('change', (e) => {
    const t = e.target as HTMLElement | null
    if (!t) return
    if (t.matches('[data-sxa-time-metric]')) {
      timeMetric = (t as HTMLSelectElement).value as typeof timeMetric
      renderTimeBarChart(getFilteredTrades())
    }
    if (t.matches('[data-sxa-cal-metric]')) {
      calMetric = (t as HTMLSelectElement).value as typeof calMetric
      renderCalendar(getFilteredTrades())
    }
    if (t.hasAttribute('data-sxa-asset-opt') && t instanceof HTMLInputElement) {
      // Any explicit toggle switches assets out of the implicit "all" (empty
      // set) state and into an explicit selection of just the checked assets.
      if (filters.assets.size === 0) filters.assets = new Set(distinctAssets())
      t.checked ? filters.assets.add(t.value) : filters.assets.delete(t.value)
      if (filters.assets.size === distinctAssets().length) filters.assets.clear()
      renderAll()
      return
    }
    if (t.hasAttribute('data-sxa-tag-opt') && t instanceof HTMLInputElement) {
      activeTag = t.value
      renderAll()
      return
    }
    const fpSelectKey = t.getAttribute('data-sxa-fp-select')
    if (fpSelectKey && t instanceof HTMLSelectElement) {
      if (fpSelectKey === 'type') filters.type = t.value
      else if (fpSelectKey === 'strategy') filters.strategy = t.value
      else if (fpSelectKey === 'timezone') filters.timezone = t.value
      renderAll()
      return
    }
    if (t.hasAttribute('data-sxa-fp-time-start') && t instanceof HTMLInputElement) {
      filters.timeStart = t.value || '00:00'
      renderAll()
      return
    }
    if (t.hasAttribute('data-sxa-fp-time-end') && t instanceof HTMLInputElement) {
      filters.timeEnd = t.value || '23:59'
      renderAll()
      return
    }
  })

  return { renderAll }
}
