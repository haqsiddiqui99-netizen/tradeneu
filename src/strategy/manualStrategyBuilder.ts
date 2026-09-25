/**
 * src/strategy/manualStrategyBuilder.ts
 *
 * "Manual strategy builder" — a self-contained rule-based strategy editor
 * (templates rail, entry/exit condition rows, position & risk grid, a stat
 * strip, a live summary line, an illustrative equity sparkline, a
 * plain-English readout, sanity checks, and a JSON preview) ported from a
 * standalone prototype supplied by the user. Everything is scoped under the
 * `.sx-manual-strat` wrapper (see manualStrategyBuilder.css) and all DOM
 * lookups are scoped to `host` so this can be mounted alongside the rest of
 * the app without id/class collisions.
 */
import './manualStrategyBuilder.css'
import type { Bar } from '../types'
import { loadSessionBars } from '../data/loadSessionBars'
import { aggregateOHLCV } from '../chart/aggregateBars'
import { runManualStrategy, type ManualBacktestResult } from '../backtest/manualStrategyEngine'
import { manualStrategyToDefinition } from './manualStrategyToDefinition'
import { saveCustomStrategy } from './strategyStore'
import { ASSET_CATALOG, RECENT_SYMBOLS } from '../assetCatalog'
import { fetchLocalBarCounts, type LocalBarCounts } from '../data/symbolBarCoverage'

// Market dropdown options: recently-used symbols first, then the rest of
// the shared asset catalog (deduped) — so the manual builder isn't locked
// to XAUUSD and can capture any symbol the platform already knows about.
const SYMBOL_OPTIONS: string[] = (() => {
  const seen = new Set<string>()
  const ordered: string[] = []
  ;[...RECENT_SYMBOLS, ...ASSET_CATALOG.map((a) => a.symbol)].forEach((sym) => {
    if (!seen.has(sym)) {
      seen.add(sym)
      ordered.push(sym)
    }
  })
  return ordered
})()

export type ManualStrategyBuilderOptions = {
  host: HTMLElement
  onBack?: () => void
  /** Opens the chart/replay workspace for this strategy (converted to `StrategyDefinition` — see `manualStrategyToDefinition.ts`). */
  onOpenInChart?: (strategyId: string, opts?: { runBacktest?: boolean }) => void
}

export type ManualStrategyBuilderApi = {
  dispose: () => void
}

type IndicatorParam = [key: string, def: number, min: number, max: number]

type IndicatorDef = { label: string; params: IndicatorParam[] }

type Operand = { kind: 'ind'; ind: string; p: Record<string, number> } | { kind: 'num'; value: number }

type LeftOperand = { ind: string; p: Record<string, number> }

type Rule = { id: string; left: LeftOperand; op: string; rhs: Operand }

type RiskField = [type: string, value: number]

type Strategy = {
  id?: string
  name: string
  dir: 'long' | 'short' | 'both'
  entryJoin: 'all' | 'any'
  exitJoin: 'all' | 'any'
  entry: Rule[]
  exit: Rule[]
  risk: { size: RiskField; stop: RiskField; tp: RiskField; trail: RiskField }
}

type RhsSpec = { kind: 'ind'; ind: string; p?: Record<string, number> } | { kind: 'num'; value: number }

type Template = {
  name: string
  cat: string
  meta: string
  dir: 'long' | 'short' | 'both'
  entryJoin: 'all' | 'any'
  exitJoin: 'all' | 'any'
  entry: [string, string, RhsSpec, Record<string, number>?][]
  exit: [string, string, RhsSpec, Record<string, number>?][]
  risk: { size: RiskField; stop: RiskField; tp: RiskField; trail: RiskField }
}

const IND: Record<string, IndicatorDef> = {
  ema: { label: 'EMA', params: [['period', 9, 1, 400]] },
  sma: { label: 'SMA', params: [['period', 50, 1, 400]] },
  rsi: { label: 'RSI', params: [['period', 14, 2, 100]] },
  atr: { label: 'ATR', params: [['period', 14, 1, 100]] },
  macd: { label: 'MACD line', params: [['fast', 12, 1, 100], ['slow', 26, 1, 200], ['signal', 9, 1, 100]] },
  macdsig: { label: 'MACD signal', params: [['fast', 12, 1, 100], ['slow', 26, 1, 200], ['signal', 9, 1, 100]] },
  bbu: { label: 'Bollinger upper', params: [['period', 20, 2, 200], ['sd', 2, 0.5, 5]] },
  bbl: { label: 'Bollinger lower', params: [['period', 20, 2, 200], ['sd', 2, 0.5, 5]] },
  vwap: { label: 'VWAP', params: [] },
  volume: { label: 'Volume', params: [] },
  volsma: { label: 'Volume average', params: [['period', 20, 1, 200]] },
  close: { label: 'Close', params: [] },
  open: { label: 'Open', params: [] },
  high: { label: 'High', params: [] },
  low: { label: 'Low', params: [] },
  hour: { label: 'Bar hour (UTC)', params: [] },
  barsheld: { label: 'Bars in trade', params: [] },
  pnlr: { label: 'Open P&L in R', params: [] },
  adx: { label: 'ADX', params: [['period', 14, 2, 100]] },
  donchianhi: { label: 'Donchian upper', params: [['period', 20, 2, 200]] },
  donchianlo: { label: 'Donchian lower', params: [['period', 20, 2, 200]] },
  stochk: { label: 'Stoch %K', params: [['period', 14, 1, 100], ['smooth', 3, 1, 20]] },
  stochd: { label: 'Stoch %D', params: [['period', 14, 1, 100], ['smooth', 3, 1, 20]] },
  bbwidth: { label: 'Bollinger width %', params: [['period', 20, 2, 200], ['sd', 2, 0.5, 5]] },
  supertrend: { label: 'Supertrend', params: [['period', 10, 1, 100], ['mult', 3, 0.5, 10]] },
  macdhist: { label: 'MACD histogram', params: [['fast', 12, 1, 100], ['slow', 26, 1, 200], ['signal', 9, 1, 100]] },
  orh: { label: 'Opening range high', params: [['mins', 30, 5, 240]] },
  orl: { label: 'Opening range low', params: [['mins', 30, 5, 240]] },
}

const OPS: Record<string, string> = {
  xabove: 'crosses above',
  xbelow: 'crosses below',
  gt: 'is above',
  lt: 'is below',
  gte: 'is at or above',
  lte: 'is at or below',
  rise: 'rises for',
  fall: 'falls for',
}

const CATS: Record<string, string> = {
  trend: 'Trend',
  reversion: 'Mean reversion',
  breakout: 'Breakout',
  momentum: 'Momentum',
  volatility: 'Volatility',
  session: 'Session / time',
  intraday: 'Intraday',
}

const uid = () => Math.random().toString(36).slice(2, 9)

function defP(indKey: string): Record<string, number> {
  return Object.fromEntries((IND[indKey].params ?? []).map((p) => [p[0], p[1]]))
}

function mkRule(l: string, op: string, r: RhsSpec, lp?: Record<string, number>): Rule {
  return {
    id: uid(),
    left: { ind: l, p: Object.assign(defP(l), lp ?? {}) },
    op,
    rhs:
      r.kind === 'ind'
        ? { kind: 'ind', ind: r.ind, p: Object.assign(defP(r.ind), r.p ?? {}) }
        : { kind: 'num', value: r.value },
  }
}

const TEMPLATES: Template[] = [
  // --- trend ---
  {
    name: 'EMA 9/21 Crossover',
    cat: 'trend',
    meta: '1 in · 1 out',
    dir: 'long',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [['ema', 'xabove', { kind: 'ind', ind: 'ema', p: { period: 21 } }]],
    exit: [['ema', 'xbelow', { kind: 'ind', ind: 'ema', p: { period: 21 } }]],
    risk: { size: ['riskpct', 1], stop: ['atr', 1.5], tp: ['rr', 2], trail: ['none', 1] },
  },
  {
    name: 'MACD + EMA50 Trend',
    cat: 'trend',
    meta: '2 in · 1 out',
    dir: 'both',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [
      ['macd', 'xabove', { kind: 'ind', ind: 'macdsig' }],
      ['close', 'gt', { kind: 'ind', ind: 'ema', p: { period: 50 } }],
    ],
    exit: [['macd', 'xbelow', { kind: 'ind', ind: 'macdsig' }]],
    risk: { size: ['riskpct', 1], stop: ['atr', 1.5], tp: ['rr', 2.5], trail: ['be', 1] },
  },
  {
    name: 'Triple EMA Ribbon',
    cat: 'trend',
    meta: '3 in · 1 out',
    dir: 'long',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [
      ['ema', 'gt', { kind: 'ind', ind: 'ema', p: { period: 21 } }, { period: 8 }],
      ['ema', 'gt', { kind: 'ind', ind: 'ema', p: { period: 55 } }, { period: 21 }],
      ['close', 'gt', { kind: 'ind', ind: 'ema', p: { period: 8 } }],
    ],
    exit: [['ema', 'xbelow', { kind: 'ind', ind: 'ema', p: { period: 21 } }, { period: 8 }]],
    risk: { size: ['riskpct', 1], stop: ['atr', 1.5], tp: ['none', 0], trail: ['atr', 2] },
  },
  {
    name: 'ADX Trend Filter + MA Cross',
    cat: 'trend',
    meta: '2 in · 1 out',
    dir: 'both',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [
      ['ema', 'xabove', { kind: 'ind', ind: 'ema', p: { period: 21 } }],
      ['adx', 'gt', { kind: 'num', value: 25 }],
    ],
    exit: [['ema', 'xbelow', { kind: 'ind', ind: 'ema', p: { period: 21 } }]],
    risk: { size: ['riskpct', 1], stop: ['atr', 1.5], tp: ['rr', 2], trail: ['none', 1] },
  },
  {
    name: 'Supertrend Flip',
    cat: 'trend',
    meta: '1 in · 1 out',
    dir: 'both',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [['close', 'xabove', { kind: 'ind', ind: 'supertrend', p: { period: 10, mult: 3 } }]],
    exit: [['close', 'xbelow', { kind: 'ind', ind: 'supertrend', p: { period: 10, mult: 3 } }]],
    risk: { size: ['riskpct', 1], stop: ['atr', 1.5], tp: ['none', 0], trail: ['atr', 2] },
  },

  // --- reversion ---
  {
    name: 'RSI Mean Reversion',
    cat: 'reversion',
    meta: '2 in · 1 out',
    dir: 'both',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [
      ['rsi', 'lt', { kind: 'num', value: 30 }],
      ['close', 'gt', { kind: 'ind', ind: 'sma', p: { period: 200 } }],
    ],
    exit: [['rsi', 'gt', { kind: 'num', value: 55 }]],
    risk: { size: ['riskpct', 0.75], stop: ['atr', 2], tp: ['rr', 1.5], trail: ['none', 1] },
  },
  {
    name: 'Bollinger Band Reversion',
    cat: 'reversion',
    meta: '2 in · 1 out',
    dir: 'both',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [
      ['close', 'lt', { kind: 'ind', ind: 'bbl', p: { period: 20, sd: 2 } }],
      ['rsi', 'lt', { kind: 'num', value: 35 }],
    ],
    exit: [['close', 'gt', { kind: 'ind', ind: 'sma', p: { period: 20 } }]],
    risk: { size: ['riskpct', 0.75], stop: ['atr', 2], tp: ['rr', 1.5], trail: ['none', 1] },
  },
  {
    name: 'Stochastic Reversal',
    cat: 'reversion',
    meta: '2 in · 1 out',
    dir: 'both',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [
      ['stochk', 'xabove', { kind: 'ind', ind: 'stochd', p: { period: 14, smooth: 3 } }],
      ['stochk', 'lt', { kind: 'num', value: 20 }],
    ],
    exit: [['stochk', 'xbelow', { kind: 'ind', ind: 'stochd', p: { period: 14, smooth: 3 } }]],
    risk: { size: ['riskpct', 0.75], stop: ['atr', 1.5], tp: ['rr', 1.5], trail: ['none', 1] },
  },
  {
    name: 'VWAP Reversion',
    cat: 'reversion',
    meta: '2 in · 1 out',
    dir: 'long',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [
      ['rsi', 'lt', { kind: 'num', value: 20 }],
      ['close', 'lt', { kind: 'ind', ind: 'vwap' }],
    ],
    exit: [['close', 'xabove', { kind: 'ind', ind: 'vwap' }]],
    risk: { size: ['riskpct', 0.5], stop: ['atr', 1.5], tp: ['rr', 1.5], trail: ['none', 1] },
  },

  // --- breakout ---
  {
    name: 'Bollinger Breakout',
    cat: 'breakout',
    meta: '2 in · 1 out',
    dir: 'long',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [
      ['close', 'xabove', { kind: 'ind', ind: 'bbu', p: { period: 20, sd: 2 } }],
      ['volume', 'gt', { kind: 'ind', ind: 'volsma', p: { period: 20 } }],
    ],
    exit: [['close', 'xbelow', { kind: 'ind', ind: 'sma', p: { period: 20 } }]],
    risk: { size: ['riskpct', 1], stop: ['atr', 2], tp: ['rr', 3], trail: ['atr', 2] },
  },
  {
    name: 'Donchian Channel Breakout',
    cat: 'breakout',
    meta: '1 in · 1 out',
    dir: 'long',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [['close', 'xabove', { kind: 'ind', ind: 'donchianhi', p: { period: 20 } }]],
    exit: [['close', 'xbelow', { kind: 'ind', ind: 'donchianlo', p: { period: 10 } }]],
    risk: { size: ['riskpct', 1], stop: ['atr', 2], tp: ['none', 0], trail: ['atr', 2.5] },
  },

  // --- momentum ---
  {
    name: 'MACD Histogram Turn',
    cat: 'momentum',
    meta: '1 in · 1 out',
    dir: 'both',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [['macdhist', 'xabove', { kind: 'num', value: 0 }]],
    exit: [['macdhist', 'xbelow', { kind: 'num', value: 0 }]],
    risk: { size: ['riskpct', 1], stop: ['atr', 1.5], tp: ['rr', 2], trail: ['none', 1] },
  },
  {
    name: 'RSI Trend Continuation',
    cat: 'momentum',
    meta: '3 in · 1 out',
    dir: 'long',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [
      ['close', 'gt', { kind: 'ind', ind: 'sma', p: { period: 200 } }],
      ['rsi', 'gte', { kind: 'num', value: 45 }],
      ['rsi', 'lte', { kind: 'num', value: 55 }],
    ],
    exit: [['rsi', 'gt', { kind: 'num', value: 70 }]],
    risk: { size: ['riskpct', 1], stop: ['atr', 1.5], tp: ['rr', 2], trail: ['none', 1] },
  },

  // --- volatility ---
  {
    name: 'ATR Squeeze Breakout',
    cat: 'volatility',
    meta: '2 in · 1 out',
    dir: 'both',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [
      ['bbwidth', 'lt', { kind: 'num', value: 1.5 }],
      ['close', 'xabove', { kind: 'ind', ind: 'bbu', p: { period: 20, sd: 2 } }],
    ],
    exit: [['close', 'xbelow', { kind: 'ind', ind: 'sma', p: { period: 20 } }]],
    risk: { size: ['riskpct', 1], stop: ['atr', 2], tp: ['rr', 2.5], trail: ['atr', 2] },
  },

  // --- session / time ---
  {
    name: 'Opening Range Breakout',
    cat: 'session',
    meta: '1 in · 1 out',
    dir: 'both',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [['close', 'xabove', { kind: 'ind', ind: 'orh', p: { mins: 30 } }]],
    exit: [['close', 'xbelow', { kind: 'ind', ind: 'orl', p: { mins: 30 } }]],
    risk: { size: ['riskpct', 1], stop: ['atr', 1], tp: ['rr', 2], trail: ['none', 1] },
  },
  {
    name: 'London Open Momentum',
    cat: 'session',
    meta: '3 in · 2 out',
    dir: 'long',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [
      ['hour', 'gte', { kind: 'num', value: 7 }],
      ['hour', 'lte', { kind: 'num', value: 9 }],
      ['close', 'xabove', { kind: 'ind', ind: 'ema', p: { period: 20 } }],
    ],
    exit: [
      ['close', 'xbelow', { kind: 'ind', ind: 'ema', p: { period: 20 } }],
      ['hour', 'gte', { kind: 'num', value: 16 }],
    ],
    risk: { size: ['riskpct', 1], stop: ['atr', 1.5], tp: ['rr', 2], trail: ['be', 1] },
  },

  // --- intraday ---
  {
    name: 'VWAP Pullback',
    cat: 'intraday',
    meta: '2 in · 1 out',
    dir: 'long',
    entryJoin: 'all',
    exitJoin: 'any',
    entry: [
      ['low', 'lte', { kind: 'ind', ind: 'vwap' }],
      ['close', 'gt', { kind: 'ind', ind: 'vwap' }],
    ],
    exit: [['close', 'xbelow', { kind: 'ind', ind: 'vwap' }]],
    risk: { size: ['riskpct', 0.5], stop: ['swing', 1], tp: ['rr', 2], trail: ['be', 1] },
  },
]

export function mountManualStrategyBuilder(opts: ManualStrategyBuilderOptions): ManualStrategyBuilderApi {
  const { host } = opts
  host.innerHTML = `
    <div class="sx-manual-strat">
      <div class="app">
        <header class="topbar">
          ${opts.onBack ? `<button type="button" class="backLink" data-sx-back><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Strategies</button>` : ''}
          <div class="nameFieldWrap">
            <input class="nameField" id="stratName" value="EMA 9/21 Crossover" aria-label="Strategy name" readonly>
            <span class="nameFieldGhost" id="nameFieldGhost" aria-hidden="true"></span>
            <button type="button" class="nameFieldEdit" id="nameFieldEdit" title="Edit strategy name" aria-label="Edit strategy name"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
          </div>
          <span class="forked" id="forkTag" hidden>Copy — saves to your strategies</span>
          <div class="spacer"></div>
          <button class="btn btn-chart" id="btnChart"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Open in chart</button>
          <button class="btn btn-save" id="btnSave"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save</button>
        </header>

        <div class="context">
          <div class="ctxItem"><span>Market</span>
            <select class="sel ticker" id="symbol" aria-label="Symbol">
              ${SYMBOL_OPTIONS.map((sym) => `<option${sym === 'XAUUSD' ? ' selected' : ''}>${sym}</option>`).join('')}
            </select>
          </div>
          <div class="ctxItem"><span>Timeframe</span>
            <select class="sel" id="tf" aria-label="Timeframe">
              <option>1m</option><option>5m</option><option selected>15m</option>
              <option>1h</option><option>4h</option><option>1D</option>
            </select>
          </div>
          <div class="ctxItem"><span>Range</span>
            <select class="sel" id="range" aria-label="Date range">
              <option>Last 6 months</option><option selected>Last 3 years</option>
              <option>2019 \u2192 today</option><option>Custom\u2026</option>
            </select>
          </div>
          <div class="ctxItem"><span>Sessions</span>
            <select class="sel" id="session" aria-label="Session filter">
              <option selected>All hours</option><option>London + New York</option>
              <option>London only</option><option>New York only</option><option>Asia only</option>
            </select>
          </div>
          <div class="bars" id="barsInfo">Checking bar coverage\u2026</div>
        </div>

        <div class="templateBar">
          <div class="tplBarHead">
            <div class="tplTabs" role="tablist">
              <button type="button" class="tplTab" id="tabTemplates" data-tab="templates" role="tab" aria-selected="true">Templates</button>
              <button type="button" class="tplTab" id="tabMine" data-tab="mine" role="tab" aria-selected="false">Your strategies<span class="tplTabCount" id="mineCount" hidden>0</span></button>
            </div>
            <button class="addLink" id="btnNew" title="Blank strategy">+ New strategy</button>
          </div>
          <div class="tplCats" id="tplCats" role="tablist" aria-label="Filter templates by category"></div>
          <div class="tplStrip">
            <button type="button" class="tplNav tplNavPrev" id="tplPrev" aria-label="Show previous strategies" title="Show previous strategies">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M6.8 1L2.4 5l4.4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="tplScroll" id="tplScroll"></div>
            <button type="button" class="tplNav tplNavNext" id="tplNext" aria-label="Show more strategies" title="Show more strategies">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M3.2 1L7.6 5l-4.4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>

        <div class="main">

          <main class="canvas">

            <div class="statStrip" id="statStrip"></div>
            <div class="liveLine" id="liveLine"></div>

            <section class="block">
              <div class="blockHead">
                <span class="kw">WHEN</span>
                <h2>Entry conditions</h2>
                <div class="joinPick">
                  <label for="entryJoin">Match</label>
                  <select class="sel" id="entryJoin">
                    <option value="all">all of these</option>
                    <option value="any">any of these</option>
                  </select>
                </div>
              </div>
              <div class="rules">
                <div id="entryRules"></div>
                <div class="ruleFoot">
                  <button class="addLink" data-add="entry">Add condition</button>
                  <button class="addLink" data-add="entry" data-preset="time">Add time filter</button>
                </div>
              </div>
            </section>

            <section class="block">
              <div class="blockHead">
                <span class="kw">THEN</span>
                <h2>Position and risk</h2>
                <div class="joinPick">
                  <div class="seg" role="group" aria-label="Direction">
                    <button data-dir="long" aria-pressed="true">Long</button>
                    <button data-dir="short" aria-pressed="false">Short</button>
                    <button data-dir="both" aria-pressed="false">Both</button>
                  </div>
                </div>
              </div>
              <div class="posGrid">
                <div class="field">
                  <label for="sizeType">Position size</label>
                  <div class="row">
                    <select class="sel" id="sizeType">
                      <option value="riskpct" selected>Risk % of equity</option>
                      <option value="fixedlot">Fixed lots</option>
                      <option value="fixedcash">Fixed cash</option>
                      <option value="kelly">Fractional Kelly</option>
                    </select>
                    <input class="num" id="sizeVal" value="1" step="0.1">
                  </div>
                  <div class="hint" id="sizeHint">\u2248 $1,000 risked per trade on $100k</div>
                </div>
                <div class="field">
                  <label for="stopType">Stop loss</label>
                  <div class="row">
                    <select class="sel" id="stopType">
                      <option value="atr" selected>ATR multiple</option>
                      <option value="pct">Percent of price</option>
                      <option value="pips">Fixed pips</option>
                      <option value="swing">Last swing low/high</option>
                      <option value="none">No hard stop</option>
                    </select>
                    <input class="num" id="stopVal" value="1.5" step="0.1">
                  </div>
                  <div class="hint" id="stopHint">ATR(14) on 15m \u2248 2.4 pts \u2192 stop \u2248 3.6 pts</div>
                </div>
                <div class="field">
                  <label for="tpType">Take profit</label>
                  <div class="row">
                    <select class="sel" id="tpType">
                      <option value="rr" selected>Risk : reward</option>
                      <option value="atr">ATR multiple</option>
                      <option value="pct">Percent of price</option>
                      <option value="none">Exit rules only</option>
                    </select>
                    <input class="num" id="tpVal" value="2" step="0.1">
                  </div>
                  <div class="hint" id="tpHint">Breakeven win rate at 2R \u2248 33.3%</div>
                </div>
                <div class="field">
                  <label for="trailType">Trail / breakeven</label>
                  <div class="row">
                    <select class="sel" id="trailType">
                      <option value="none" selected>Off</option>
                      <option value="be">Move to breakeven at</option>
                      <option value="atr">Trail by ATR</option>
                      <option value="chandelier">Chandelier exit</option>
                    </select>
                    <input class="num" id="trailVal" value="1" step="0.1" disabled>
                  </div>
                  <div class="hint" id="trailHint">No trailing \u2014 stop and target are fixed</div>
                </div>
              </div>
            </section>

            <section class="block">
              <div class="blockHead">
                <span class="kw">UNTIL</span>
                <h2>Exit conditions</h2>
                <p>Checked on every bar close, alongside the stop and target.</p>
                <div class="joinPick">
                  <label for="exitJoin">Match</label>
                  <select class="sel" id="exitJoin">
                    <option value="any" selected>any of these</option>
                    <option value="all">all of these</option>
                  </select>
                </div>
              </div>
              <div class="rules">
                <div id="exitRules"></div>
                <div class="ruleFoot">
                  <button class="addLink" data-add="exit">Add condition</button>
                  <button class="addLink" data-add="exit" data-preset="bars">Add time stop</button>
                </div>
              </div>
            </section>

          </main>

          <aside class="reader">
            <div class="sparkWrap">
              <div class="sHead"><span id="sparkHeadTitle">Equity shape</span><span id="sparkHeadNote">illustrative — not backtest data</span></div>
              <svg class="spark" id="sparkSvg" viewBox="0 0 300 58" preserveAspectRatio="none" aria-label="Illustrative equity shape">
                <defs>
                  <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#E0A94A" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="#E0A94A" stop-opacity="0"/>
                  </linearGradient>
                  <linearGradient id="sparkGradUp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--long)" stop-opacity="0.32"/>
                    <stop offset="100%" stop-color="var(--long)" stop-opacity="0"/>
                  </linearGradient>
                  <linearGradient id="sparkGradDown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--short)" stop-opacity="0.32"/>
                    <stop offset="100%" stop-color="var(--short)" stop-opacity="0"/>
                  </linearGradient>
                </defs>
                <line class="baseline" id="sparkBaseline" x1="0" y1="0" x2="300" y2="0" hidden></line>
                <path class="fill" id="sparkFill" fill="url(#sparkGrad)"/>
                <path class="line" id="sparkLine"/>
                <circle class="dot" id="sparkStartDot" r="2.4" hidden></circle>
                <circle class="dot" id="sparkEndDot" r="2.6" hidden></circle>
              </svg>
              <div class="sparkStats" id="sparkStats" hidden></div>
            </div>

            <div class="readerHead"><h3>Plain English</h3></div>
            <div class="prose" id="prose"></div>

            <div class="checks" id="checks"></div>

            <div class="jsonWrap">
              <button class="jsonToggle" id="jsonToggle" aria-expanded="false">
                <span>Strategy JSON</span><span id="jsonCaret">Show</span>
              </button>
              <pre class="json" id="json" hidden></pre>
            </div>
          </aside>

        </div>

        <div class="actions">
          <div class="actionsInner">
            <button class="btn btn-primary" id="btnRun">Run backtest</button>
            <span class="est" id="est"></span>
          </div>
        </div>
      </div>
    </div>
  `

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => host.querySelector<T>('#' + id)!

  const DD_CHEVRON =
    '<svg width="9" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'

  // Dropdown menus are appended here — a top-level sibling of the
  // .sx-manual-strat shell, not inside it — so nothing on this page (the
  // shell itself, .rules, .posGrid, ...) can clip them with an
  // `overflow: hidden` used for rounded corners. It carries the
  // `sx-manual-strat` class purely so the theme CSS variables (and dark
  // theme override, which targets `.sx-manual-strat` at any depth under
  // `#sx-app-root`) still apply to menus rendered inside it.
  const ddPortal = document.createElement('div')
  ddPortal.className = 'sx-manual-strat dd-portal-root'
  host.appendChild(ddPortal)

  function closeAllDropdowns() {
    ddPortal.querySelectorAll<HTMLElement>('.dd__menu--open').forEach((m) => m.classList.remove('dd__menu--open'))
    host.querySelectorAll<HTMLElement>('.dd__btn[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'))
  }

  // Rule-row selects (indicator / operator / kind pickers) are rebuilt
  // from scratch on every renderRules() call, so their old <select>
  // elements get thrown away — but the portal-hosted menus dressSelect()
  // created for them would otherwise sit around forever. Sweep out any
  // menu whose select is no longer in the document.
  function purgeOrphanedDropdownMenus() {
    ddPortal.querySelectorAll<HTMLElement>('.dd__menu').forEach((m) => {
      const forSelect = (m as unknown as { __forSelect?: HTMLSelectElement }).__forSelect
      if (!forSelect || !document.body.contains(forSelect)) m.remove()
    })
  }

  // Replaces a native <select> with a custom pill-button + floating-menu
  // widget (matching the "Total Profit/Loss" dropdown on the Analytics
  // page), while keeping the original <select> alive-but-hidden inside it
  // so every existing `$<HTMLSelectElement>(id).value` / `.onchange` call
  // site elsewhere in this file keeps working untouched. Selecting a menu
  // item sets the real select's value and fires a real 'change' event.
  function dressSelect(select: HTMLSelectElement): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'dd'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'dd__btn'
    btn.setAttribute('aria-haspopup', 'listbox')
    btn.setAttribute('aria-expanded', 'false')
    if (select.getAttribute('aria-label')) btn.setAttribute('aria-label', select.getAttribute('aria-label')!)
    const label = document.createElement('span')
    label.className = 'dd__label'
    btn.appendChild(label)
    btn.insertAdjacentHTML('beforeend', DD_CHEVRON)

    const menu = document.createElement('div')
    menu.className = 'dd__menu'
    menu.setAttribute('role', 'listbox')

    const rebuild = () => {
      menu.textContent = ''
      Array.from(select.options).forEach((opt, i) => {
        const item = document.createElement('button')
        item.type = 'button'
        item.className = 'dd__item' + (i === select.selectedIndex ? ' dd__item--active' : '')
        item.setAttribute('role', 'option')
        item.setAttribute('aria-selected', String(i === select.selectedIndex))
        item.textContent = opt.textContent || opt.value
        item.onclick = (e) => {
          e.stopPropagation()
          if (select.selectedIndex !== i) {
            select.selectedIndex = i
            select.dispatchEvent(new Event('change', { bubbles: true }))
          }
          sync()
          close()
        }
        menu.appendChild(item)
      })
    }
    const sync = () => {
      const opt = select.options[select.selectedIndex]
      label.textContent = opt ? opt.textContent || opt.value : ''
      menu.querySelectorAll<HTMLElement>('.dd__item').forEach((el, i) => {
        el.classList.toggle('dd__item--active', i === select.selectedIndex)
        el.setAttribute('aria-selected', String(i === select.selectedIndex))
      })
    }
    const close = () => {
      menu.classList.remove('dd__menu--open')
      btn.setAttribute('aria-expanded', 'false')
    }
    const positionMenu = () => {
      const r = btn.getBoundingClientRect()
      menu.style.left = r.left + 'px'
      menu.style.top = r.bottom + 6 + 'px'
      menu.style.minWidth = r.width + 'px'
      // Flip above / shift left if the menu would run off the viewport —
      // it's rendered in a top-level portal now, so nothing will clip it,
      // but it should still stay on-screen.
      requestAnimationFrame(() => {
        const mr = menu.getBoundingClientRect()
        const overflowRight = mr.right - window.innerWidth + 8
        if (overflowRight > 0) menu.style.left = Math.max(4, r.right - mr.width) + 'px'
        const overflowBottom = mr.bottom - window.innerHeight + 8
        if (overflowBottom > 0) menu.style.top = Math.max(4, r.top - mr.height - 6) + 'px'
      })
    }
    const open = () => {
      closeAllDropdowns()
      rebuild()
      positionMenu()
      menu.classList.add('dd__menu--open')
      btn.setAttribute('aria-expanded', 'true')
      // Long lists scroll within a capped height — jump straight to the
      // active item instead of always opening scrolled to the top.
      menu.querySelector<HTMLElement>('.dd__item--active')?.scrollIntoView({ block: 'nearest' })
    }
    btn.onclick = (e) => {
      e.stopPropagation()
      if (menu.classList.contains('dd__menu--open')) close()
      else open()
    }

    ;(select as unknown as { __ddSync?: () => void }).__ddSync = () => {
      rebuild()
      sync()
    }
    ;(menu as unknown as { __forSelect?: HTMLSelectElement }).__forSelect = select

    if (select.parentNode) select.replaceWith(wrap)
    wrap.appendChild(btn)
    wrap.appendChild(select)
    ddPortal.appendChild(menu)
    select.hidden = true
    select.tabIndex = -1
    rebuild()
    sync()
    return wrap
  }

  // Called after anything sets a dressed <select>'s .value directly
  // (rather than through its own menu), so the visible pill label stays
  // in sync — e.g. loading a template or a saved strategy.
  function syncAllDropdownLabels() {
    host.querySelectorAll<HTMLSelectElement>('select.sel').forEach((sel) => {
      ;(sel as unknown as { __ddSync?: () => void }).__ddSync?.()
    })
  }

  const onDocDdClick = (e: MouseEvent) => {
    // The menu itself now lives in the portal, outside the .dd wrapper,
    // so a click inside an open menu has to be recognised too.
    if (!(e.target as HTMLElement).closest('.dd, .dd__menu')) closeAllDropdowns()
  }
  const onDocDdKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeAllDropdowns()
  }
  // Fixed-position menus don't track a scrolling ancestor, so close on
  // scroll of the page behind them — but NOT when the scroll is the menu
  // itself scrolling through a long option list (that has its own
  // internal overflow-y: auto and must keep working).
  const onDocDdScroll = (e: Event) => {
    if ((e.target as HTMLElement | null)?.closest?.('.dd__menu')) return
    closeAllDropdowns()
  }
  document.addEventListener('click', onDocDdClick)
  document.addEventListener('keydown', onDocDdKey)
  document.addEventListener('scroll', onDocDdScroll, true)

  // Every native <select> baked into the static template above (Timeframe,
  // Range, Sessions, Match pickers, position/risk type pickers) gets the
  // same custom dropdown treatment as the ones built dynamically for rule
  // rows, so *all* dropdowns on this page look and behave the same way.
  host.querySelectorAll<HTMLSelectElement>('select.sel').forEach((sel) => dressSelect(sel))

  let S: Strategy = null as unknown as Strategy
  let activeTpl = 0
  let dirty = false
  let activeTab: 'templates' | 'mine' = 'templates'
  let activeCat: string | null = null
  // Which saved ("Your strategies") entry, if any, is currently loaded —
  // lets Save update that entry in place instead of piling up duplicates,
  // and lets the library highlight the right chip even after a rename.
  let activeMineId: string | null = null
  const mine: Strategy[] = []

  function loadTemplate(t: Template) {
    S = {
      name: t.name,
      dir: t.dir,
      entryJoin: t.entryJoin,
      exitJoin: t.exitJoin,
      entry: t.entry.map((r) => mkRule(r[0], r[1], r[2], r[3])),
      exit: t.exit.map((r) => mkRule(r[0], r[1], r[2], r[3])),
      risk: JSON.parse(JSON.stringify(t.risk)),
    }
    activeMineId = null
    dirty = false
    clearBacktestResult()
    syncControls()
    renderAll()
  }

  function blank() {
    S = {
      name: 'Untitled strategy',
      dir: 'long',
      entryJoin: 'all',
      exitJoin: 'any',
      entry: [mkRule('close', 'xabove', { kind: 'ind', ind: 'ema', p: { period: 20 } })],
      exit: [],
      risk: { size: ['riskpct', 1], stop: ['atr', 1.5], tp: ['rr', 2], trail: ['none', 1] },
    }
    activeTpl = -1
    activeMineId = null
    dirty = true
    clearBacktestResult()
    syncControls()
    renderAll()
  }

  // The name box hugs its text instead of stretching across the header, so
  // its width has to be measured from the rendered glyphs — the hidden ghost
  // span carries the same font and gives us that width.
  function sizeNameField() {
    const input = $<HTMLInputElement>('stratName')
    const ghost = $<HTMLElement>('nameFieldGhost')
    ghost.textContent = input.value || 'Untitled strategy'
    input.style.width = Math.min(520, Math.max(88, Math.ceil(ghost.offsetWidth) + 2)) + 'px'
  }

  function syncControls() {
    $<HTMLInputElement>('stratName').value = S.name
    sizeNameField()
    $<HTMLSelectElement>('entryJoin').value = S.entryJoin
    $<HTMLSelectElement>('exitJoin').value = S.exitJoin
    $<HTMLSelectElement>('sizeType').value = S.risk.size[0]
    $<HTMLInputElement>('sizeVal').value = String(S.risk.size[1])
    $<HTMLSelectElement>('stopType').value = S.risk.stop[0]
    $<HTMLInputElement>('stopVal').value = String(S.risk.stop[1])
    $<HTMLSelectElement>('tpType').value = S.risk.tp[0]
    $<HTMLInputElement>('tpVal').value = String(S.risk.tp[1])
    $<HTMLSelectElement>('trailType').value = S.risk.trail[0]
    $<HTMLInputElement>('trailVal').value = String(S.risk.trail[1])
    host.querySelectorAll<HTMLButtonElement>('.seg [data-dir]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.dir === S.dir))
    })
    syncAllDropdownLabels()
  }

  function operandChip(
    o: LeftOperand | Extract<Operand, { kind: 'ind' }>,
    onChange: () => void,
    // Typing a period value only needs the derived read-outs (prose,
    // stats, JSON, \u2026) refreshed \u2014 rebuilding the whole rule list on every
    // keystroke (via `onChange`/`update`) destroyed and recreated this very
    // input mid-type, so only the first digit ever registered before focus
    // was lost. Structural edits (changing which indicator is picked, which
    // changes how many period fields exist) still go through `onChange`.
    onNumberChange: () => void = onChange,
  ): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'chip'
    const sel = document.createElement('select')
    sel.className = 'sel'
    sel.setAttribute('aria-label', 'Indicator')
    for (const k in IND) {
      const opt = document.createElement('option')
      opt.value = k
      opt.textContent = IND[k].label
      if (k === o.ind) opt.selected = true
      sel.appendChild(opt)
    }
    sel.onchange = () => {
      o.ind = sel.value
      o.p = Object.fromEntries((IND[o.ind].params ?? []).map((p) => [p[0], p[1]]))
      onChange()
    }
    wrap.appendChild(dressSelect(sel))
    const ps = IND[o.ind].params ?? []
    if (ps.length) {
      // Periods live in their own segment of the chip, divided from the
      // indicator name by a hairline rule — the old "( 9 )" spelling put
      // loose parenthesis glyphs around a boxed input, which read as
      // debris rather than as an editable field.
      const params = document.createElement('span')
      params.className = 'chipParams'
      ps.forEach(([key, , min, max]) => {
        const n = document.createElement('input')
        n.type = 'number'
        n.className = 'num'
        n.value = String(o.p[key])
        n.min = String(min)
        n.max = String(max)
        n.step = key === 'sd' ? '0.1' : '1'
        n.setAttribute('aria-label', IND[o.ind].label + ' ' + key)
        n.title = key
        n.oninput = () => {
          o.p[key] = parseFloat(n.value) || 0
          onNumberChange()
        }
        params.appendChild(n)
      })
      wrap.appendChild(params)
    }
    return wrap
  }

  function renderRules(kind: 'entry' | 'exit') {
    const host2 = $(kind + 'Rules')
    host2.textContent = ''
    const list = S[kind]
    const join = S[(kind + 'Join') as 'entryJoin' | 'exitJoin']
    if (!list.length) {
      const e = document.createElement('div')
      e.className = 'rule'
      e.innerHTML =
        '<span style="color:var(--dimmer);font-size:13px">' +
        (kind === 'entry'
          ? 'No entry conditions \u2014 the strategy will never open a trade.'
          : 'No exit conditions \u2014 trades close on the stop or target only.') +
        '</span>'
      host2.appendChild(e)
      return
    }
    list.forEach((r, i) => {
      const row = document.createElement('div')
      row.className = 'rule'

      const tag = document.createElement('span')
      tag.className = 'joinTag' + (i === 0 ? ' first' : '')
      tag.textContent = i === 0 ? 'if' : join === 'all' ? 'and' : 'or'
      row.appendChild(tag)

      row.appendChild(operandChip(r.left, update, updateKeepingRuleFocus))

      const opSel = document.createElement('select')
      opSel.className = 'sel'
      opSel.setAttribute('aria-label', 'Comparison')
      for (const k in OPS) {
        const o = document.createElement('option')
        o.value = k
        o.textContent = OPS[k]
        if (k === r.op) o.selected = true
        opSel.appendChild(o)
      }
      opSel.onchange = () => {
        r.op = opSel.value
        update()
      }
      row.appendChild(dressSelect(opSel))

      const kindSel = document.createElement('select')
      kindSel.className = 'sel'
      kindSel.setAttribute('aria-label', 'Compare against')
      ;([['ind', 'an indicator'], ['num', 'a value']] as const).forEach(([v, t]) => {
        const o = document.createElement('option')
        o.value = v
        o.textContent = t
        if (v === r.rhs.kind) o.selected = true
        kindSel.appendChild(o)
      })
      kindSel.onchange = () => {
        r.rhs =
          kindSel.value === 'ind'
            ? { kind: 'ind', ind: 'ema', p: { period: 21 } }
            : { kind: 'num', value: 0 }
        update()
      }
      row.appendChild(dressSelect(kindSel))

      if (r.rhs.kind === 'ind') {
        row.appendChild(operandChip(r.rhs, update, updateKeepingRuleFocus))
      } else {
        const n = document.createElement('input')
        n.type = 'number'
        n.className = 'num'
        n.style.width = '72px'
        n.value = String(r.rhs.value)
        n.setAttribute('aria-label', 'Value')
        n.oninput = () => {
          ;(r.rhs as { kind: 'num'; value: number }).value = parseFloat(n.value)
          // Not `update()` \u2014 that rebuilds every rule row (this input
          // included) on each keystroke and drops focus after one digit.
          updateKeepingRuleFocus()
        }
        row.appendChild(n)
      }

      const del = document.createElement('button')
      del.className = 'del'
      del.textContent = '\u00d7'
      del.setAttribute('aria-label', 'Remove condition')
      del.onclick = () => {
        S[kind].splice(i, 1)
        update()
      }
      row.appendChild(del)

      host2.appendChild(row)
    })
  }

  const fmt = (o: Operand): string => {
    if (o.kind === 'num') return '<span class="v">' + o.value + '</span>'
    const ps = IND[o.ind].params ?? []
    const args = ps.map((p) => o.p[p[0]]).join(', ')
    return '<span class="v">' + IND[o.ind].label + (args ? '(' + args + ')' : '') + '</span>'
  }
  const dirWord = (d: Strategy['dir']) =>
    d === 'long'
      ? '<span class="long">long</span>'
      : d === 'short'
        ? '<span class="short">short</span>'
        : '<span class="long">long</span> or <span class="short">short</span>'

  function sentence(list: Rule[], join: 'all' | 'any'): string | null {
    if (!list.length) return null
    const parts = list.map((r) => fmt(r.left as unknown as Operand) + ' ' + OPS[r.op] + ' ' + fmt(r.rhs))
    if (parts.length === 1) return parts[0]!
    const sep = join === 'all' ? ' and ' : ' or '
    return parts.slice(0, -1).join(', ') + sep + parts[parts.length - 1]
  }

  function riskSentence(): string {
    const [st, sv] = S.risk.stop
    const [tt, tv] = S.risk.tp
    const [zt, zv] = S.risk.size
    const [rt, rv] = S.risk.trail
    const size =
      zt === 'riskpct'
        ? 'risking <span class="v">' + zv + '%</span> of equity'
        : zt === 'fixedlot'
          ? 'using <span class="v">' + zv + '</span> lots'
          : zt === 'fixedcash'
            ? 'committing <span class="v">$' + zv + '</span>'
            : 'sizing by <span class="v">' + zv + '</span>-fraction Kelly'
    const stop =
      st === 'atr'
        ? 'a stop <span class="v">' + sv + '\u00d7</span> ATR away'
        : st === 'pct'
          ? 'a stop <span class="v">' + sv + '%</span> away'
          : st === 'pips'
            ? 'a stop <span class="v">' + sv + '</span> pips away'
            : st === 'swing'
              ? 'a stop at the last swing point'
              : 'no hard stop'
    const tp =
      tt === 'rr'
        ? 'a target at <span class="v">' + tv + 'R</span>'
        : tt === 'atr'
          ? 'a target <span class="v">' + tv + '\u00d7</span> ATR away'
          : tt === 'pct'
            ? 'a target <span class="v">' + tv + '%</span> away'
            : 'no fixed target'
    const trail =
      rt === 'none'
        ? ''
        : rt === 'be'
          ? ' Move the stop to breakeven once price reaches <span class="v">' + rv + 'R</span>.'
          : rt === 'atr'
            ? ' Trail the stop by <span class="v">' + rv + '\u00d7</span> ATR once in profit.'
            : ' Trail with a chandelier exit at <span class="v">' + rv + '\u00d7</span> ATR.'
    return 'Enter ' + dirWord(S.dir) + ', ' + size + ', with ' + stop + ' and ' + tp + '.' + trail
  }

  function renderProse() {
    const p = $('prose')
    const sym = $<HTMLSelectElement>('symbol').value.toUpperCase() || 'the market'
    const tf = $<HTMLSelectElement>('tf').value
    const ses = $<HTMLSelectElement>('session').value
    const e = sentence(S.entry, S.entryJoin)
    const x = sentence(S.exit, S.exitJoin)

    const html: string[] = []
    html.push(
      "<p>On <span class='v'>" +
        sym +
        "</span> " +
        tf +
        ' bars' +
        (ses === 'All hours' ? '' : ', during ' + ses.toLowerCase()) +
        ':</p>',
    )
    html.push(
      '<p>' +
        (e
          ? 'When ' +
            e +
            ' \u2014 ' +
            (S.entryJoin === 'all' ? 'all true on the same bar close' : 'any one of them true') +
            ' \u2014 open a trade.'
          : "<em style='color:var(--short);font-style:normal'>No entry condition is set, so no trade will ever open.</em>") +
        '</p>',
    )
    html.push('<p>' + riskSentence() + '</p>')
    html.push('<p>' + (x ? 'Close early if ' + x + '.' : 'Otherwise hold until the stop or target is hit.') + '</p>')

    p.innerHTML = html.join('')
    p.classList.remove('flash')
    void p.offsetWidth
    p.classList.add('flash')
  }

  // "Bars available" used to be a flat hardcoded guess per timeframe. It's
  // now backed by a real, live count fetched from the server's local bar
  // store for whichever symbol is selected (see refreshLiveBarCounts below);
  // the hardcoded table only survives as a fallback while that fetch is in
  // flight or if the symbol has no local data yet.
  const MINUTES_PER_TF: Record<string, number> = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1D': 1440 }
  const liveBarCountsBySymbol = new Map<string, LocalBarCounts>()
  let liveBarCountsLoadingSymbol: string | null = null

  function liveBaseBarsFor(tf: string, symbol: string): number | null {
    const counts = liveBarCountsBySymbol.get(symbol)
    if (!counts) return null
    // Prefer a directly-stored timeframe count (m1/h1/d1 are persisted as
    // their own rows); otherwise derive it from the 1-minute row count.
    const directKey = tf === '1m' ? 'm1' : tf === '1h' ? 'h1' : tf === '1D' ? 'd1' : null
    if (directKey && counts[directKey]) return counts[directKey]
    const m1 = counts.m1
    if (!m1) return null
    const perBar = MINUTES_PER_TF[tf] ?? 15
    return Math.max(1, Math.round(m1 / perBar))
  }

  async function refreshLiveBarCounts(symbol: string) {
    const sym = symbol.trim().toUpperCase()
    if (!sym || liveBarCountsBySymbol.has(sym) || liveBarCountsLoadingSymbol === sym) return
    liveBarCountsLoadingSymbol = sym
    const counts = await fetchLocalBarCounts(sym)
    if (liveBarCountsLoadingSymbol === sym) liveBarCountsLoadingSymbol = null
    // Cache an empty object (not just skip) on failure/no-data too, so the UI
    // can tell "still loading" (no entry yet) apart from "checked, nothing
    // there" (empty entry) instead of silently retrying forever.
    liveBarCountsBySymbol.set(sym, counts ?? {})
    // Only worth a re-render if the symbol fetched is still the one selected.
    if (($<HTMLSelectElement>('symbol').value || '').toUpperCase() === sym) renderStats()
  }

  function estimates(): { baseBars: number; est: number; state: 'live' | 'estimated' | 'loading' } {
    const tf = $<HTMLSelectElement>('tf').value
    const symbol = ($<HTMLSelectElement>('symbol').value || '').toUpperCase()
    const baseBarsByTf: Record<string, number> = { '1m': 740000, '5m': 148000, '15m': 74800, '1h': 18700, '4h': 4700, '1D': 790 }
    const live = liveBaseBarsFor(tf, symbol)
    const checked = liveBarCountsBySymbol.has(symbol)
    const state: 'live' | 'estimated' | 'loading' = live != null ? 'live' : checked ? 'estimated' : 'loading'
    const baseBars = live ?? baseBarsByTf[tf] ?? 74800
    const dens = ({ all: 0.008, any: 0.019 }[S.entryJoin] ?? 0.008) / Math.max(1, S.entry.length * 0.6)
    const est = S.entry.length ? Math.max(0, Math.round(baseBars * dens)) : 0
    return { baseBars, est, state }
  }

  function longestLookback(): number {
    let m = 0
    ;[...S.entry, ...S.exit].forEach((r) => {
      ;[r.left as unknown as Operand, r.rhs].forEach((o) => {
        if (o.kind === 'num') return
        Object.values(o.p || {}).forEach((v) => {
          if (v > m) m = v
        })
      })
    })
    return m
  }

  function renderChecks() {
    const out: [string, string, string][] = []
    const lb = longestLookback()
    const both = S.dir === 'both'

    if (!S.entry.length) {
      out.push(['bad', 'No entry condition', 'Add at least one condition or the backtest returns zero trades.'])
    }
    if (lb) {
      out.push(['ok', 'Warm-up ' + lb + ' bars', 'The first ' + lb + ' bars are skipped so every indicator is fully formed.'])
    }
    if (S.risk.stop[0] === 'none') {
      out.push(['bad', 'No stop loss', 'One adverse run can end the equity curve. Drawdown numbers will not be meaningful.'])
    }
    if (S.risk.tp[0] === 'none' && !S.exit.length) {
      out.push(['bad', 'Nothing closes the trade', 'There is no target and no exit condition, so positions stay open to the end of the range.'])
    }
    if (S.risk.size[0] === 'riskpct' && Number(S.risk.size[1]) > 2) {
      out.push(['warn', 'Risk ' + S.risk.size[1] + '% per trade', 'Above 2%, a normal losing streak of 8 costs roughly a third of the account.'])
    }
    if (S.risk.tp[0] === 'rr' && Number(S.risk.tp[1]) >= 3) {
      const wr = (100 / (1 + Number(S.risk.tp[1]))).toFixed(1)
      out.push(['warn', 'Needs only ' + wr + '% wins', 'High R targets are hit less often. Check the distribution, not just expectancy.'])
    }
    const crossOnly = S.entry.length > 0 && S.entry.every((r) => r.op === 'xabove' || r.op === 'xbelow')
    if (crossOnly && both) {
      out.push(['warn', 'Always in the market', 'Every entry is a cross and direction is both ways, so the strategy flips on each signal.'])
    }
    const tf = $<HTMLSelectElement>('tf').value
    if ((tf === '1m' || tf === '5m') && $<HTMLSelectElement>('session').value === 'All hours') {
      out.push(['warn', 'Low-liquidity hours included', 'On ' + tf + ' bars the Asian rollover fills will flatter the result. Consider a session filter.'])
    }
    if (!out.length) out.push(['ok', 'Ready to run', 'Nothing in the rule set looks structurally broken.'])

    const checksHost = $('checks')
    checksHost.textContent = ''
    out.forEach(([cls, title, body]) => {
      const d = document.createElement('div')
      d.className = 'check ' + cls
      d.innerHTML = '<i>' + (cls === 'ok' ? '\u2713' : cls === 'warn' ? '!' : '\u00d7') + '</i><span><b>' + title + '</b> \u2014 ' + body + '</span>'
      checksHost.appendChild(d)
    })

    $<HTMLButtonElement>('btnRun').disabled = !S.entry.length
    const { baseBars, est, state } = estimates()
    const barsInfo = $<HTMLElement>('barsInfo')
    if (state === 'loading') {
      barsInfo.innerHTML = 'Checking bar coverage\u2026'
      barsInfo.title = 'Fetching the live bar count for this symbol from your local market data store\u2026'
    } else {
      barsInfo.innerHTML = '\u2248 <b>' + baseBars.toLocaleString() + '</b> bars available'
      barsInfo.title =
        state === 'live'
          ? 'Live count from your local market data store'
          : 'Estimated \u2014 no local data found for this symbol yet'
    }
    $('est').textContent = S.entry.length
      ? '\u2248 ' + est.toLocaleString() + ' trades over the selected range \u00b7 under 2s'
      : 'Add an entry condition to run'
  }

  function renderJson() {
    if ($<HTMLElement>('json').hidden) return
    const obj = {
      name: S.name,
      symbol: $<HTMLSelectElement>('symbol').value.toUpperCase(),
      timeframe: $<HTMLSelectElement>('tf').value,
      range: $<HTMLSelectElement>('range').value,
      session: $<HTMLSelectElement>('session').value,
      direction: S.dir,
      entry: {
        match: S.entryJoin,
        rules: S.entry.map((r) => ({
          left: r.left.ind,
          leftParams: r.left.p,
          op: r.op,
          right: r.rhs.kind === 'num' ? r.rhs.value : r.rhs.ind,
          rightParams: r.rhs.kind === 'num' ? null : r.rhs.p,
        })),
      },
      exit: {
        match: S.exitJoin,
        rules: S.exit.map((r) => ({
          left: r.left.ind,
          leftParams: r.left.p,
          op: r.op,
          right: r.rhs.kind === 'num' ? r.rhs.value : r.rhs.ind,
          rightParams: r.rhs.kind === 'num' ? null : r.rhs.p,
        })),
      },
      risk: { size: S.risk.size, stop: S.risk.stop, takeProfit: S.risk.tp, trail: S.risk.trail },
    }
    const txt = JSON.stringify(obj, null, 2)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"([^"]+)":/g, '"<span class="k">$1</span>":')
      .replace(/: (-?\d+\.?\d*)/g, ': <span class="n">$1</span>')
    $('json').innerHTML = txt
  }

  function renderHints() {
    const [zt, zv] = S.risk.size
    const [st, sv] = S.risk.stop
    const [tt, tv] = S.risk.tp
    const [rt, rv] = S.risk.trail
    $('sizeHint').textContent =
      zt === 'riskpct'
        ? '\u2248 $' + (1000 * zv).toLocaleString() + ' risked per trade on $100k'
        : zt === 'fixedlot'
          ? zv + ' lots regardless of stop distance'
          : zt === 'fixedcash'
            ? '$' + zv + ' committed per trade'
            : 'Capped at ' + zv + ' of the full Kelly fraction'
    $('stopHint').textContent =
      st === 'atr'
        ? 'ATR(14) on ' + $<HTMLSelectElement>('tf').value + ' \u2248 2.4 pts \u2192 stop \u2248 ' + (2.4 * sv).toFixed(1) + ' pts'
        : st === 'pct'
          ? sv + '% of entry price'
          : st === 'pips'
            ? sv + ' pips from entry'
            : st === 'swing'
              ? 'Uses the most recent swing high or low'
              : 'Unbounded loss per trade'
    $('tpHint').textContent =
      tt === 'rr'
        ? 'Breakeven win rate at ' + tv + 'R \u2248 ' + (100 / (1 + Number(tv))).toFixed(1) + '%'
        : tt === 'atr'
          ? tv + '\u00d7 ATR from entry'
          : tt === 'pct'
            ? tv + '% from entry'
            : 'Trades close on exit conditions or the stop'
    $('trailHint').textContent =
      rt === 'none'
        ? 'No trailing \u2014 stop and target are fixed'
        : rt === 'be'
          ? 'Risk drops to zero once ' + rv + 'R is reached'
          : rt === 'atr'
            ? 'Stop follows price by ' + rv + '\u00d7 ATR'
            : 'Stop anchored ' + rv + '\u00d7 ATR below the highest close since entry'
    $<HTMLInputElement>('trailVal').disabled = rt === 'none'
  }

  function stripTags(t: string): string {
    return t.replace(/<[^>]+>/g, '')
  }

  function escapeHtml(t: string): string {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function renderLiveLine() {
    const e = sentence(S.entry, S.entryJoin)
    const dir = S.dir === 'both' ? 'Long/short' : S.dir[0]!.toUpperCase() + S.dir.slice(1)
    const stop = S.risk.stop[0] === 'none' ? 'no stop' : S.risk.stop[1] + '\u00d7 ' + S.risk.stop[0] + ' stop'
    const tp = S.risk.tp[0] === 'rr' ? S.risk.tp[1] + 'R target' : IND[S.risk.tp[0]] ? S.risk.tp[0] : 'no fixed target'
    const txt = '<b>' + dir + '</b> \u00b7 ' + (e ? 'when ' + stripTags(e) : 'no entry set') + ' \u00b7 ' + stop + ', ' + tp
    $('liveLine').innerHTML = txt
  }

  function renderStats() {
    const statHost = $('statStrip')
    const { est } = estimates()
    const dirLabel = S.dir === 'both' ? 'Both ways' : S.dir[0]!.toUpperCase() + S.dir.slice(1)
    const dirCls = S.dir === 'long' ? 'long' : S.dir === 'short' ? 'short' : ''
    const rr = S.risk.tp[0] === 'rr' ? S.risk.tp[1] + 'R' : '\u2014'
    const items: [string, string, string][] = lastResult
      ? [
          ['Direction', dirLabel, dirCls],
          ['Trades', lastResult.summary.totalTrades.toLocaleString(), lastResult.summary.totalTrades === 0 ? 'warn' : ''],
          ['Win rate', lastResult.summary.totalTrades ? lastResult.summary.winRate.toFixed(1) + '%' : '\u2014', ''],
          ['Net P&L', (lastResult.summary.netPnl >= 0 ? '+$' : '-$') + Math.abs(lastResult.summary.netPnl).toLocaleString(undefined, { maximumFractionDigits: 0 }), lastResult.summary.netPnl < 0 ? 'short' : 'long'],
          ['Max DD', lastResult.summary.maxDrawdownPct.toFixed(1) + '%', ''],
        ]
      : [
          ['Direction', dirLabel, dirCls],
          ['Entry', S.entry.length ? S.entry.length + ' \u00b7 ' + (S.entryJoin === 'all' ? 'AND' : 'OR') : 'none set', S.entry.length ? '' : 'warn'],
          ['Exit', S.exit.length ? S.exit.length + ' \u00b7 ' + (S.exitJoin === 'all' ? 'AND' : 'OR') : 'stop/target only', ''],
          ['Target', rr, ''],
          ['Est. trades', est.toLocaleString(), est === 0 ? 'warn' : ''],
        ]
    if (!statHost.dataset.init) {
      statHost.innerHTML = items
        .map(([label, value, cls]) => '<div class="stat"><label>' + label + '</label><div class="val ' + cls + '">' + value + '</div></div>')
        .join('')
      statHost.dataset.init = '1'
      return
    }
    items.forEach(([, value, cls], i) => {
      const cell = statHost.children[i] as HTMLElement
      const val = cell.querySelector<HTMLElement>('.val')!
      const changed = val.textContent !== String(value)
      val.textContent = value
      val.className = 'val ' + (cls || '')
      if (changed) {
        cell.classList.remove('pulse')
        void cell.offsetWidth
        cell.classList.add('pulse')
      }
    })
  }

  // ─── Real backtest wiring ────────────────────────────────────────────────
  // Holds the most recent real run against actual market bars. Cleared any
  // time the rules, symbol, timeframe, range or session change, so the
  // sparkline/stats never show a result for a strategy that's since been
  // edited — see `clearBacktestResult()`.
  let lastResult: ManualBacktestResult | null = null
  let backtestRunSeq = 0

  function clearBacktestResult() {
    lastResult = null
  }

  const TF_STEP_SEC: Record<string, number> = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1D': 86400 }

  function rangeToDates(range: string): { startDate?: string; endDate?: string } {
    const end = new Date()
    const endDate = end.toISOString().slice(0, 10)
    const start = new Date(end)
    if (range === 'Last 6 months') start.setMonth(start.getMonth() - 6)
    else if (range === 'Last 3 years') start.setFullYear(start.getFullYear() - 3)
    else if (range === '2019 \u2192 today') return { startDate: '2019-01-01', endDate }
    else return {} // "Custom…" has no picker yet — fall back to the freshest available bars
    return { startDate: start.toISOString().slice(0, 10), endDate }
  }

  function sessionToHourFilter(session: string): { fromHour: number; toHour: number } | null {
    switch (session) {
      case 'London + New York': return { fromHour: 7, toHour: 20 }
      case 'London only': return { fromHour: 7, toHour: 15 }
      case 'New York only': return { fromHour: 12, toHour: 20 }
      case 'Asia only': return { fromHour: 23, toHour: 7 }
      default: return null // "All hours"
    }
  }

  async function runRealBacktest() {
    const btn = $<HTMLButtonElement>('btnRun')
    const est = $('est')
    const originalLabel = btn.textContent
    const mySeq = ++backtestRunSeq
    btn.disabled = true
    btn.textContent = 'Loading bars\u2026'
    est.textContent = 'Fetching market data\u2026'
    try {
      const symbol = ($<HTMLSelectElement>('symbol').value || 'XAUUSD').toUpperCase()
      const tf = $<HTMLSelectElement>('tf').value
      const range = $<HTMLSelectElement>('range').value
      const session = $<HTMLSelectElement>('session').value
      const { startDate, endDate } = rangeToDates(range)
      const resolved = await loadSessionBars(symbol, session, 6000, { startDate, endDate })
      if (mySeq !== backtestRunSeq) return // superseded by a newer click
      const stepSec = TF_STEP_SEC[tf] ?? 60
      const bars: Bar[] = stepSec > 60 ? aggregateOHLCV(resolved.bars, stepSec) : resolved.bars
      if (bars.length < 50) {
        window.alert('Not enough bars loaded for this symbol/range to run a backtest (need at least 50).')
        return
      }
      btn.textContent = 'Running\u2026'
      const result = runManualStrategy(bars, S, {
        initialCapital: 100_000,
        sessionFilter: sessionToHourFilter(session),
      })
      if (mySeq !== backtestRunSeq) return
      lastResult = result
      renderSpark()
      renderStats()
      const s = result.summary
      est.textContent =
        s.totalTrades === 0
          ? 'Ran on ' + bars.length.toLocaleString() + ' real bars \u2014 0 trades triggered'
          : '\u2248 ' +
            s.totalTrades.toLocaleString() +
            ' trades \u00b7 ' +
            s.winRate.toFixed(1) +
            '% win rate \u00b7 ' +
            (s.netPnl >= 0 ? '+' : '') +
            s.returnPct.toFixed(1) +
            '% return on ' +
            bars.length.toLocaleString() +
            ' real bars'
    } catch (err) {
      if (mySeq !== backtestRunSeq) return
      console.error('[Tradeneu] Manual strategy backtest failed', err)
      est.textContent = 'Could not load market data \u2014 try again'
    } finally {
      if (mySeq === backtestRunSeq) {
        btn.textContent = originalLabel
        btn.disabled = !S.entry.length
      }
    }
  }

  function seededRand(seed: number): () => number {
    let s = seed % 2147483647
    if (s <= 0) s += 2147483646
    return () => {
      s = (s * 16807) % 2147483647
      return (s - 1) / 2147483646
    }
  }

  const fmtMoney = (v: number): string =>
    (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
  const fmtSigned = (v: number, suffix = ''): string => (v >= 0 ? '+' : '') + v.toFixed(1) + suffix

  function renderSpark() {
    const titleEl = $('sparkHeadTitle')
    const noteEl = $('sparkHeadNote')
    const baseline = $('sparkBaseline')
    const startDot = $('sparkStartDot')
    const endDot = $('sparkEndDot')
    const statsHost = $('sparkStats')
    const lineEl = $('sparkLine')
    const fillEl = $('sparkFill')

    if (lastResult && lastResult.equity.length > 1) {
      titleEl.textContent = 'Equity curve'
      noteEl.textContent = 'from last backtest run'
      const w = 300
      const h = 58
      const s = lastResult.summary
      const pts = lastResult.equity.map((p) => p.equity)
      const min = Math.min(...pts)
      const max = Math.max(...pts)
      const span = max - min || 1
      const step = w / (pts.length - 1)
      const yFor = (v: number) => h - 4 - ((v - min) / span) * (h - 8)
      const line = pts.map((v, i) => (i === 0 ? 'M' : 'L') + (i * step).toFixed(1) + ',' + yFor(v).toFixed(1)).join(' ')
      const fill = line + ' L' + w + ',' + h + ' L0,' + h + ' Z'
      lineEl.setAttribute('d', line)
      fillEl.setAttribute('d', fill)

      const isProfit = s.netPnl > 0
      const isLoss = s.netPnl < 0
      lineEl.classList.toggle('is-profit', isProfit)
      lineEl.classList.toggle('is-loss', isLoss)
      fillEl.classList.toggle('is-profit', isProfit)
      fillEl.classList.toggle('is-loss', isLoss)

      // Dashed reference line at the starting equity — everything above it is net-up, below is net-down.
      const baseY = yFor(s.initialCapital).toFixed(1)
      baseline.setAttribute('y1', baseY)
      baseline.setAttribute('y2', baseY)
      baseline.hidden = false

      startDot.setAttribute('cx', '0')
      startDot.setAttribute('cy', yFor(pts[0]!).toFixed(1))
      startDot.hidden = false
      endDot.setAttribute('cx', String(w))
      endDot.setAttribute('cy', yFor(pts[pts.length - 1]!).toFixed(1))
      endDot.classList.toggle('is-profit', isProfit)
      endDot.classList.toggle('is-loss', isLoss)
      endDot.hidden = false

      statsHost.innerHTML = [
        ['Start', fmtMoney(s.initialCapital), ''],
        ['End', fmtMoney(s.finalEquity), ''],
        ['Net P&L', fmtMoney(s.netPnl) + ' (' + fmtSigned(s.returnPct, '%') + ')', isLoss ? 'short' : isProfit ? 'long' : ''],
        ['Max DD', '-' + s.maxDrawdownPct.toFixed(1) + '%', s.maxDrawdownPct > 15 ? 'warn' : ''],
        ['Trades', s.totalTrades.toLocaleString() + ' \u00b7 ' + s.winRate.toFixed(0) + '% won', ''],
      ]
        .map(([label, value, cls]) => '<div class="cell"><label>' + label + '</label><div class="v ' + cls + '">' + value + '</div></div>')
        .join('')
      statsHost.hidden = false
      return
    }

    titleEl.textContent = 'Equity shape'
    noteEl.textContent = 'illustrative \u2014 not backtest data'
    baseline.hidden = true
    startDot.hidden = true
    endDot.hidden = true
    statsHost.hidden = true
    statsHost.innerHTML = ''
    lineEl.classList.remove('is-profit', 'is-loss')
    fillEl.classList.remove('is-profit', 'is-loss')
    const tp = parseFloat(String(S.risk.tp[1])) || 1
    const stop = parseFloat(String(S.risk.stop[1])) || 1
    const edge = S.entry.length * 0.35 + (S.exit.length ? 0.25 : 0) + Math.min(1.2, tp / (stop || 1)) * 0.3
    const seed =
      Math.abs(
        S.name.length * 131 +
          S.entry.length * 17 +
          S.exit.length * 11 +
          Math.round(tp * 10) +
          Math.round(stop * 10) +
          (S.dir === 'long' ? 3 : S.dir === 'short' ? 7 : 11),
      ) + 1
    const rnd = seededRand(seed)
    const n = 36
    const w = 300
    const h = 58
    const drift = Math.max(-0.3, Math.min(0.55, (edge - 0.9) * 0.35))
    let y = 34
    const pts = [y]
    for (let i = 1; i < n; i++) {
      y += (rnd() - 0.5) * 6.5 + drift
      y = Math.max(4, Math.min(h - 4, y))
      pts.push(y)
    }
    const step = w / (n - 1)
    const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + (i * step).toFixed(1) + ',' + (h - p).toFixed(1)).join(' ')
    const fill = line + ' L' + w + ',' + h + ' L0,' + h + ' Z'
    $('sparkLine').setAttribute('d', line)
    $('sparkFill').setAttribute('d', fill)
  }

  function markDirty() {
    if (activeTpl >= 0 && !dirty) {
      dirty = true
      S.name = S.name + ' (my copy)'
      $<HTMLInputElement>('stratName').value = S.name
      sizeNameField()
      $<HTMLElement>('forkTag').hidden = false
    }
  }

  function renderLibrary() {
    $<HTMLButtonElement>('tabTemplates').setAttribute('aria-selected', String(activeTab === 'templates'))
    $<HTMLButtonElement>('tabMine').setAttribute('aria-selected', String(activeTab === 'mine'))
    const mineCount = $<HTMLElement>('mineCount')
    mineCount.textContent = String(mine.length)
    mineCount.hidden = mine.length === 0

    const scrollHost = $('tplScroll')
    scrollHost.textContent = ''
    const prev = $<HTMLButtonElement>('tplPrev')
    const next = $<HTMLButtonElement>('tplNext')
    const refreshTemplateNav = () => {
      const max = Math.max(0, scrollHost.scrollWidth - scrollHost.clientWidth)
      prev.disabled = scrollHost.scrollLeft <= 2
      next.disabled = scrollHost.scrollLeft >= max - 2
    }
    const scrollTemplates = (amount: number) => {
      scrollHost.scrollBy({ left: amount, behavior: 'smooth' })
      window.setTimeout(refreshTemplateNav, 180)
    }
    prev.onclick = () => scrollTemplates(-(scrollHost.clientWidth * 0.72))
    next.onclick = () => scrollTemplates(scrollHost.clientWidth * 0.72)
    scrollHost.onscroll = refreshTemplateNav

    const catsHost = $<HTMLElement>('tplCats')
    catsHost.hidden = activeTab !== 'templates'

    if (activeTab === 'templates') {
      // Category quick-filter pills — a clearer, clickable way to jump to a
      // category than the old inline dividers buried inside the scroll strip.
      catsHost.textContent = ''
      const counts: Record<string, number> = {}
      TEMPLATES.forEach((t) => {
        counts[t.cat] = (counts[t.cat] ?? 0) + 1
      })
      const allPill = document.createElement('button')
      allPill.type = 'button'
      allPill.className = 'tplCat'
      allPill.setAttribute('aria-selected', String(activeCat === null))
      allPill.innerHTML = '<span>All</span><em>' + TEMPLATES.length + '</em>'
      allPill.onclick = () => {
        activeCat = null
        scrollHost.scrollLeft = 0
        renderLibrary()
      }
      catsHost.appendChild(allPill)
      Object.keys(CATS).forEach((catKey) => {
        if (!counts[catKey]) return
        const pill = document.createElement('button')
        pill.type = 'button'
        pill.className = 'tplCat'
        pill.setAttribute('aria-selected', String(activeCat === catKey))
        pill.innerHTML = '<span>' + CATS[catKey] + '</span><em>' + counts[catKey] + '</em>'
        pill.onclick = () => {
          activeCat = catKey
          scrollHost.scrollLeft = 0
          renderLibrary()
        }
        catsHost.appendChild(pill)
      })

      TEMPLATES.forEach((t, i) => {
        if (activeCat !== null && t.cat !== activeCat) return
        const b = document.createElement('button')
        b.className = 'tplChip'
        b.setAttribute('aria-current', String(i === activeTpl && !dirty))
        b.innerHTML = '<b>' + t.name + '</b><em>' + t.meta + '</em>'
        b.onclick = () => {
          activeTpl = i
          $<HTMLElement>('forkTag').hidden = true
          loadTemplate(t)
        }
        scrollHost.appendChild(b)
      })
      requestAnimationFrame(refreshTemplateNav)
      return
    }

    if (!mine.length) {
      const empty = document.createElement('p')
      empty.className = 'tplEmpty'
      empty.textContent = 'Nothing saved yet. Edit any template and hit Save — it becomes yours.'
      scrollHost.appendChild(empty)
      requestAnimationFrame(refreshTemplateNav)
      return
    }
    mine.forEach((m) => {
      if (!m.id) m.id = uid()
      // A plain <div role="button"> rather than a real <button> here —
      // it needs to host the rename/delete icon buttons inside it, and
      // browsers auto-close a <button> as soon as a nested <button> is
      // parsed, which would break the whole-chip click target.
      const b = document.createElement('div')
      b.className = 'tplChip tplChipMine'
      b.setAttribute('role', 'button')
      b.tabIndex = 0
      b.setAttribute('aria-current', String(activeMineId === m.id))
      b.innerHTML =
        '<div class="tplChipMineHead">' +
        '<b>' + escapeHtml(m.name) + '</b>' +
        '<span class="tplChipMineActions" data-actions>' +
        '<button type="button" class="tplChipIcon" data-act="rename" title="Rename strategy" aria-label="Rename ' +
        escapeHtml(m.name) +
        '"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>' +
        '<button type="button" class="tplChipIcon tplChipIconDanger" data-act="delete" title="Delete strategy" aria-label="Delete ' +
        escapeHtml(m.name) +
        '"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>' +
        '</span>' +
        '</div><em>saved</em>'

      const load = () => {
        S = JSON.parse(JSON.stringify(m))
        activeTpl = -1
        activeMineId = m.id ?? null
        dirty = false
        clearBacktestResult()
        $<HTMLElement>('forkTag').hidden = true
        syncControls()
        renderAll()
      }
      b.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('[data-act], [data-mine-editing]')) return
        load()
      })
      b.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !(e.target as HTMLElement).closest('[data-act], [data-mine-editing]')) {
          e.preventDefault()
          load()
        }
      })

      // Rename inline (turns the name into a text field) instead of
      // window.prompt — Electron/embedded webviews commonly swallow
      // synchronous JS dialogs, so a prompt() here can silently no-op.
      b.querySelector<HTMLButtonElement>('[data-act="rename"]')!.onclick = (e) => {
        e.stopPropagation()
        const head = b.querySelector<HTMLElement>('.tplChipMineHead')!
        const nameEl = head.querySelector('b')!
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'tplChipMineRenameInput'
        input.value = m.name
        input.setAttribute('data-mine-editing', '1')
        input.setAttribute('aria-label', 'Strategy name')
        nameEl.replaceWith(input)
        input.focus()
        input.select()
        let done = false
        const commit = (save: boolean) => {
          if (done) return
          done = true
          const next = input.value.trim()
          if (save && next && next !== m.name) {
            m.name = next
            if (activeMineId === m.id) {
              S.name = m.name
              $<HTMLInputElement>('stratName').value = S.name
              sizeNameField()
              renderJson()
            }
          }
          renderLibrary()
        }
        input.addEventListener('keydown', (ev) => {
          ev.stopPropagation()
          if (ev.key === 'Enter') commit(true)
          else if (ev.key === 'Escape') commit(false)
        })
        input.addEventListener('blur', () => commit(true))
        input.addEventListener('click', (ev) => ev.stopPropagation())
      }

      // Delete with an inline two-step confirm (swap the actions for a
      // "Delete this?" / confirm / cancel row) instead of window.confirm,
      // for the same reason — no native dialog can pop up here.
      b.querySelector<HTMLButtonElement>('[data-act="delete"]')!.onclick = (e) => {
        e.stopPropagation()
        const actions = b.querySelector<HTMLElement>('[data-actions]')!
        actions.innerHTML =
          '<span class="tplChipMineConfirm">Delete?</span>' +
          '<button type="button" class="tplChipIcon" data-mine-editing="1" data-act="cancel-delete" title="Cancel" aria-label="Cancel delete"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
          '<button type="button" class="tplChipIcon tplChipIconDanger" data-mine-editing="1" data-act="confirm-delete" title="Confirm delete" aria-label="Confirm delete"><i class="fa-solid fa-check" aria-hidden="true"></i></button>'
        actions.querySelector<HTMLButtonElement>('[data-act="cancel-delete"]')!.onclick = (ev) => {
          ev.stopPropagation()
          renderLibrary()
        }
        actions.querySelector<HTMLButtonElement>('[data-act="confirm-delete"]')!.onclick = (ev) => {
          ev.stopPropagation()
          const idx = mine.findIndex((x) => x.id === m.id)
          if (idx >= 0) mine.splice(idx, 1)
          if (activeMineId === m.id) {
            activeMineId = null
            blank()
            return
          }
          renderLibrary()
        }
      }

      scrollHost.appendChild(b)
    })
    requestAnimationFrame(refreshTemplateNav)
  }

  function renderAll() {
    renderRules('entry')
    renderRules('exit')
    purgeOrphanedDropdownMenus()
    renderProse()
    renderChecks()
    renderHints()
    renderJson()
    renderLibrary()
    renderStats()
    renderSpark()
    renderLiveLine()
  }
  function update() {
    markDirty()
    clearBacktestResult()
    renderAll()
  }
  // Same as `update()` but skips `renderRules()` \u2014 for edits made by typing
  // into a number input that is *inside* the rule rows themselves. Calling
  // the full `update()` there would tear down and rebuild that very input
  // (and every other rule row) on each keystroke, kicking focus out after
  // the first character typed.
  function updateKeepingRuleFocus() {
    markDirty()
    clearBacktestResult()
    purgeOrphanedDropdownMenus()
    renderProse()
    renderChecks()
    renderHints()
    renderJson()
    renderLibrary()
    renderStats()
    renderSpark()
    renderLiveLine()
  }

  $<HTMLInputElement>('stratName').oninput = (e) => {
    S.name = (e.target as HTMLInputElement).value
    sizeNameField()
    markDirty()
    renderJson()
    renderLibrary()
  }
  $<HTMLButtonElement>('nameFieldEdit').onclick = () => {
    const input = $<HTMLInputElement>('stratName')
    input.readOnly = false
    input.focus()
    input.select()
  }
  $<HTMLInputElement>('stratName').addEventListener('blur', () => {
    $<HTMLInputElement>('stratName').readOnly = true
  })
  $<HTMLInputElement>('stratName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') $<HTMLInputElement>('stratName').blur()
  })
  ;['symbol', 'tf', 'range', 'session'].forEach((id) => {
    $(id).addEventListener('input', () => {
      clearBacktestResult()
      renderProse()
      renderChecks()
      renderHints()
      renderJson()
      renderStats()
      renderSpark()
      if (id === 'symbol') void refreshLiveBarCounts($<HTMLSelectElement>('symbol').value)
    })
  })
  $<HTMLSelectElement>('entryJoin').onchange = (e) => {
    S.entryJoin = (e.target as HTMLSelectElement).value as 'all' | 'any'
    update()
  }
  $<HTMLSelectElement>('exitJoin').onchange = (e) => {
    S.exitJoin = (e.target as HTMLSelectElement).value as 'all' | 'any'
    update()
  }
  host.querySelectorAll<HTMLButtonElement>('.seg [data-dir]').forEach((b) => {
    b.onclick = () => {
      S.dir = b.dataset.dir as Strategy['dir']
      host.querySelectorAll<HTMLButtonElement>('.seg [data-dir]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)))
      update()
    }
  })
  ;([
    ['size', 'sizeType', 'sizeVal'],
    ['stop', 'stopType', 'stopVal'],
    ['tp', 'tpType', 'tpVal'],
    ['trail', 'trailType', 'trailVal'],
  ] as const).forEach(([key, t, v]) => {
    $<HTMLSelectElement>(t).onchange = () => {
      S.risk[key][0] = $<HTMLSelectElement>(t).value
      update()
    }
    $<HTMLInputElement>(v).oninput = () => {
      S.risk[key][1] = parseFloat($<HTMLInputElement>(v).value) || 0
      update()
    }
  })
  host.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.add as 'entry' | 'exit'
      let r: Rule
      if (b.dataset.preset === 'time') r = mkRule('hour', 'gte', { kind: 'num', value: 8 })
      else if (b.dataset.preset === 'bars') r = mkRule('barsheld', 'gte', { kind: 'num', value: 20 })
      else r = mkRule('close', 'xabove', { kind: 'ind', ind: 'ema', p: { period: 20 } })
      S[k].push(r)
      update()
    }
  })
  $<HTMLButtonElement>('btnNew').onclick = blank

  host.querySelectorAll<HTMLButtonElement>('.tplTab').forEach((tab) => {
    tab.onclick = () => {
      activeTab = tab.dataset.tab as 'templates' | 'mine'
      renderLibrary()
    }
  })
  $<HTMLButtonElement>('jsonToggle').onclick = () => {
    const j = $<HTMLElement>('json')
    const open = j.hidden
    j.hidden = !open
    $<HTMLButtonElement>('jsonToggle').setAttribute('aria-expanded', String(open))
    $('jsonCaret').textContent = open ? 'Hide' : 'Show'
    renderJson()
  }
  $<HTMLButtonElement>('btnSave').onclick = () => {
    // If a saved strategy is already loaded, Save updates it in place
    // instead of piling up a new "Untitled strategy" copy every time.
    const existingIdx = activeMineId ? mine.findIndex((m) => m.id === activeMineId) : -1
    const copy: Strategy = JSON.parse(JSON.stringify(S))
    copy.id = activeMineId ?? uid()
    if (existingIdx >= 0) {
      mine[existingIdx] = copy
    } else {
      mine.push(copy)
    }
    activeMineId = copy.id
    activeTpl = -1
    dirty = false
    $<HTMLElement>('forkTag').hidden = true
    renderLibrary()
  }
  $<HTMLButtonElement>('btnRun').onclick = () => {
    void runRealBacktest()
  }
  $<HTMLButtonElement>('btnChart').onclick = () => {
    if (!opts.onOpenInChart) {
      $('est').textContent = 'Opening in chart isn\u2019t available here.'
      return
    }
    if (!S.entry.length) {
      window.alert('Add at least one entry condition before opening this strategy in the chart.')
      return
    }
    // The chart page's replay/backtest engine (BacktestEngine.ts) uses a
    // different, fixed-period indicator model than this builder's own
    // arbitrary-period rules — convert on a best-effort basis and surface
    // anything that had to be approximated or dropped before switching
    // views. See manualStrategyToDefinition.ts for the full mapping.
    const { definition, warnings } = manualStrategyToDefinition(S)
    if (warnings.length) {
      const proceed = window.confirm(
        'The chart\u2019s backtest engine can\u2019t represent this strategy exactly. It will approximate:\n\n\u2022 ' +
          warnings.join('\n\u2022 ') +
          '\n\nOpen in chart anyway?',
      )
      if (!proceed) return
    }
    const saved = saveCustomStrategy(definition)
    opts.onOpenInChart(saved.id, { runBacktest: true })
  }
  host.querySelector('[data-sx-back]')?.addEventListener('click', () => opts.onBack?.())

  loadTemplate(TEMPLATES[0]!)
  void refreshLiveBarCounts($<HTMLSelectElement>('symbol').value)
  // First measure can land before the webfont swaps in, which would leave the
  // box sized for the fallback font's metrics.
  void document.fonts?.ready.then(() => sizeNameField())

  return {
    dispose: () => {
      document.removeEventListener('click', onDocDdClick)
      document.removeEventListener('keydown', onDocDdKey)
      document.removeEventListener('scroll', onDocDdScroll, true)
      ddPortal.remove()
      host.replaceChildren()
    },
  }
}
