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

export type ManualStrategyBuilderOptions = {
  host: HTMLElement
  onBack?: () => void
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
          <div class="brand"><span class="mark"></span><span>Tradeneu</span></div>
          <span class="crumb">/</span>
          <input class="nameField" id="stratName" value="EMA 9/21 Crossover" aria-label="Strategy name">
          <span class="forked" id="forkTag" hidden>Copy — saves to your strategies</span>
          <div class="spacer"></div>
          <button class="btn btn-ghost" id="btnChart">Open in chart</button>
          <button class="btn" id="btnSave">Save</button>
        </header>

        <div class="context">
          <div class="ctxItem"><span>Market</span>
            <input class="txt ticker" id="symbol" value="XAUUSD" aria-label="Symbol">
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
          <div class="bars" id="barsInfo">\u2248 <b>74,800</b> bars available</div>
        </div>

        <div class="main">

          <aside class="rail">
            <div class="railHead"><span>Templates</span></div>
            <div id="tplList"></div>
            <div class="railDiv"></div>
            <div class="railHead"><span>Your strategies</span>
              <button class="addLink" id="btnNew" title="Blank strategy">New</button>
            </div>
            <div id="mineList"></div>
            <p class="empty" id="mineEmpty">Nothing saved yet. Edit any template and it becomes yours.</p>
          </aside>

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

          <div class="readerBar">
            <div class="readerCol sparkCol">
              <div class="sparkWrap">
                <div class="sHead"><span>Equity shape</span><span>illustrative — not backtest data</span></div>
                <svg class="spark" id="sparkSvg" viewBox="0 0 300 58" preserveAspectRatio="none" aria-label="Illustrative equity shape">
                  <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#E0A94A" stop-opacity="0.35"/>
                      <stop offset="100%" stop-color="#E0A94A" stop-opacity="0"/>
                    </linearGradient>
                  </defs>
                  <path class="fill" id="sparkFill" fill="url(#sparkGrad)"/>
                  <path class="line" id="sparkLine"/>
                </svg>
              </div>
            </div>

            <div class="readerCol proseCol">
              <div class="readerHead"><h3>Plain English</h3></div>
              <div class="prose" id="prose"></div>
            </div>

            <div class="readerCol checksCol">
              <div class="checks" id="checks"></div>
            </div>

            <div class="readerCol jsonCol">
              <div class="jsonWrap">
                <button class="jsonToggle" id="jsonToggle" aria-expanded="false">
                  <span>Strategy JSON</span><span id="jsonCaret">Show</span>
                </button>
                <pre class="json" id="json" hidden></pre>
              </div>
            </div>
          </div>

          <div class="actions">
            <div class="actionsInner">
              <button class="btn btn-primary" id="btnRun">Run backtest</button>
              <span class="est" id="est"></span>
            </div>
          </div>

        </div>
      </div>
    </div>
  `

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => host.querySelector<T>('#' + id)!

  let S: Strategy = null as unknown as Strategy
  let activeTpl = 0
  let dirty = false
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
    dirty = false
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
    dirty = true
    syncControls()
    renderAll()
  }

  function syncControls() {
    $<HTMLInputElement>('stratName').value = S.name
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
  }

  function operandChip(o: LeftOperand | Extract<Operand, { kind: 'ind' }>, onChange: () => void): HTMLElement {
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
    wrap.appendChild(sel)
    const ps = IND[o.ind].params ?? []
    if (ps.length) {
      const open = document.createElement('span')
      open.className = 'paren'
      open.textContent = '('
      wrap.appendChild(open)
      ps.forEach(([key, , min, max], i) => {
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
          onChange()
        }
        wrap.appendChild(n)
        if (i < ps.length - 1) {
          const c = document.createElement('span')
          c.className = 'paren'
          c.textContent = ','
          wrap.appendChild(c)
        }
      })
      const close = document.createElement('span')
      close.className = 'paren'
      close.textContent = ')'
      wrap.appendChild(close)
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

      row.appendChild(operandChip(r.left, update))

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
      row.appendChild(opSel)

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
      row.appendChild(kindSel)

      if (r.rhs.kind === 'ind') {
        row.appendChild(operandChip(r.rhs, update))
      } else {
        const n = document.createElement('input')
        n.type = 'number'
        n.className = 'num'
        n.style.width = '72px'
        n.value = String(r.rhs.value)
        n.setAttribute('aria-label', 'Value')
        n.oninput = () => {
          ;(r.rhs as { kind: 'num'; value: number }).value = parseFloat(n.value)
          update()
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
    const sym = $<HTMLInputElement>('symbol').value.toUpperCase() || 'the market'
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

  function estimates(): { baseBars: number; est: number } {
    const tf = $<HTMLSelectElement>('tf').value
    const baseBarsByTf: Record<string, number> = { '1m': 740000, '5m': 148000, '15m': 74800, '1h': 18700, '4h': 4700, '1D': 790 }
    const baseBars = baseBarsByTf[tf] ?? 74800
    const dens = ({ all: 0.008, any: 0.019 }[S.entryJoin] ?? 0.008) / Math.max(1, S.entry.length * 0.6)
    const est = S.entry.length ? Math.max(0, Math.round(baseBars * dens)) : 0
    return { baseBars, est }
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
    const { baseBars, est } = estimates()
    $('barsInfo').innerHTML = '\u2248 <b>' + baseBars.toLocaleString() + '</b> bars available'
    $('est').textContent = S.entry.length
      ? '\u2248 ' + est.toLocaleString() + ' trades over the selected range \u00b7 under 2s'
      : 'Add an entry condition to run'
  }

  function renderJson() {
    if ($<HTMLElement>('json').hidden) return
    const obj = {
      name: S.name,
      symbol: $<HTMLInputElement>('symbol').value.toUpperCase(),
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
    const items: [string, string, string][] = [
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

  function seededRand(seed: number): () => number {
    let s = seed % 2147483647
    if (s <= 0) s += 2147483646
    return () => {
      s = (s * 16807) % 2147483647
      return (s - 1) / 2147483646
    }
  }

  function renderSpark() {
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
      $<HTMLElement>('forkTag').hidden = false
    }
  }

  function renderLibrary() {
    const tplHost = $('tplList')
    tplHost.textContent = ''
    let lastCat: string | null = null
    TEMPLATES.forEach((t, i) => {
      if (t.cat !== lastCat) {
        lastCat = t.cat
        const h = document.createElement('div')
        h.className = 'railSub'
        h.textContent = CATS[t.cat] ?? t.cat
        tplHost.appendChild(h)
      }
      const b = document.createElement('button')
      b.className = 'tpl'
      b.setAttribute('aria-current', String(i === activeTpl && !dirty))
      b.innerHTML = '<b>' + t.name + '</b><em>' + t.meta + '</em>'
      b.onclick = () => {
        activeTpl = i
        $<HTMLElement>('forkTag').hidden = true
        loadTemplate(t)
      }
      tplHost.appendChild(b)
    })
    const mineHost = $('mineList')
    mineHost.textContent = ''
    mine.forEach((m) => {
      const b = document.createElement('button')
      b.className = 'tpl'
      b.innerHTML = '<b>' + m.name + '</b><em>saved</em>'
      b.onclick = () => {
        S = JSON.parse(JSON.stringify(m))
        activeTpl = -1
        dirty = true
        $<HTMLElement>('forkTag').hidden = true
        syncControls()
        renderAll()
      }
      mineHost.appendChild(b)
    })
    $<HTMLElement>('mineEmpty').hidden = mine.length > 0
  }

  function renderAll() {
    renderRules('entry')
    renderRules('exit')
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
    renderAll()
  }

  $<HTMLInputElement>('stratName').oninput = (e) => {
    S.name = (e.target as HTMLInputElement).value
    markDirty()
    renderJson()
    renderLibrary()
  }
  ;['symbol', 'tf', 'range', 'session'].forEach((id) => {
    $(id).addEventListener('input', () => {
      renderProse()
      renderChecks()
      renderHints()
      renderJson()
      renderStats()
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
  $<HTMLButtonElement>('jsonToggle').onclick = () => {
    const j = $<HTMLElement>('json')
    const open = j.hidden
    j.hidden = !open
    $<HTMLButtonElement>('jsonToggle').setAttribute('aria-expanded', String(open))
    $('jsonCaret').textContent = open ? 'Hide' : 'Show'
    renderJson()
  }
  $<HTMLButtonElement>('btnSave').onclick = () => {
    mine.push(JSON.parse(JSON.stringify(S)))
    dirty = true
    $<HTMLElement>('forkTag').hidden = true
    renderLibrary()
  }
  $<HTMLButtonElement>('btnRun').onclick = () => {
    const b = $<HTMLButtonElement>('btnRun')
    const t = b.textContent
    b.textContent = 'Running\u2026'
    b.disabled = true
    setTimeout(() => {
      b.textContent = t
      b.disabled = false
      $('est').textContent = 'Prototype \u2014 wire this to BacktestEngine.ts'
    }, 900)
  }
  $<HTMLButtonElement>('btnChart').onclick = () => {
    $('est').textContent = 'Prototype \u2014 opens the replay chart'
  }
  host.querySelector('[data-sx-back]')?.addEventListener('click', () => opts.onBack?.())

  loadTemplate(TEMPLATES[0]!)

  return {
    dispose: () => {
      host.replaceChildren()
    },
  }
}
