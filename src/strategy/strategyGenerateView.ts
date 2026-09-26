/**
 * src/strategy/strategyGenerateView.ts
 *
 * "I need a strategy" — a from-scratch intake. The trader describes how they
 * want to trade and the AI designs a StrategyDefinition around it.
 *
 * This replaced a hardcoded-dark modal: rendering it as a page view means it
 * inherits the dashboard's light/dark theme like every other strategy screen.
 */
import './strategyObjectifyView.css'
import './strategyGenerateView.css'
import type { StrategyDefinition } from '../backtest/BacktestTypes'
import { parseStrategyJson } from './strategyBuilderFields'
import { describeStrategyAiError, generateStrategy } from '../ai/strategyAiClient'
import { buildingScreenHtml } from './strategyBuildingScreen'

export type StrategyGenerateViewOptions = {
  host: HTMLElement
  onBack: () => void
  onStrategyReady: (strategy: StrategyDefinition) => void
}

export type StrategyGenerateViewApi = {
  dispose: () => void
}

const RISK_OPTIONS = [
  { value: 'conservative', label: 'Conservative' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'aggressive', label: 'Aggressive' },
]

const STYLE_OPTIONS = [
  { value: 'trend-following', label: 'Trend following' },
  { value: 'mean-reversion', label: 'Mean reversion' },
  { value: 'breakout', label: 'Breakout' },
  { value: 'scalping', label: 'Scalping' },
]

function optionsHtml(items: { value: string; label: string }[]): string {
  return [
    '<option value="">Select\u2026</option>',
    ...items.map((o) => `<option value="${o.value}">${o.label}</option>`),
  ].join('')
}

function html(): string {
  return `
    <div class="sx-strat-obj sx-strat-gen">
      <button type="button" class="sx-strat-obj__back" data-sx-gen-back>
        <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Strategies
      </button>

      <div class="sx-strat-obj__body" data-sx-gen-form>
        <h2 class="sx-strat-gen__title">I need a strategy</h2>
        <p class="sx-strat-gen__sub">Tell us a bit about yourself and we\u2019ll design one to start with.</p>

        <div class="sx-strat-gen__grid">
          <label class="sx-strat-gen__field">
            <span class="sx-strat-gen__label">Market</span>
            <input type="text" data-sx-gen-market placeholder="e.g. XAUUSD, EURUSD" />
          </label>
          <label class="sx-strat-gen__field">
            <span class="sx-strat-gen__label">Timeframe</span>
            <input type="text" data-sx-gen-timeframe placeholder="e.g. 15m, 1H, Daily" />
          </label>
          <label class="sx-strat-gen__field">
            <span class="sx-strat-gen__label">Risk tolerance</span>
            <select data-sx-gen-risk>${optionsHtml(RISK_OPTIONS)}</select>
          </label>
          <label class="sx-strat-gen__field">
            <span class="sx-strat-gen__label">Trading style</span>
            <select data-sx-gen-style>${optionsHtml(STYLE_OPTIONS)}</select>
          </label>
        </div>

        <textarea
          class="sx-strat-gen__notes"
          data-sx-gen-notes
          rows="4"
          placeholder="Anything else? (optional)"
        ></textarea>

        <div class="sx-strat-obj__error" data-sx-gen-error hidden role="alert"></div>

        <button type="button" class="sx-strat-gen__submit" data-sx-gen-submit>Start from scratch</button>
      </div>

      ${buildingScreenHtml('data-sx-gen-building', 'Designing your strategy')}
    </div>`
}

export function mountStrategyGenerateView(
  opts: StrategyGenerateViewOptions,
): StrategyGenerateViewApi {
  const { host } = opts
  host.replaceChildren()
  const wrap = document.createElement('div')
  wrap.innerHTML = html()
  const rootEl = wrap.firstElementChild as HTMLElement
  host.appendChild(rootEl)

  const q = <T extends HTMLElement>(sel: string) => rootEl.querySelector<T>(sel)!
  const formEl = q<HTMLElement>('[data-sx-gen-form]')
  const buildingEl = q<HTMLElement>('[data-sx-gen-building]')
  const errorEl = q<HTMLElement>('[data-sx-gen-error]')
  const marketEl = q<HTMLInputElement>('[data-sx-gen-market]')
  const timeframeEl = q<HTMLInputElement>('[data-sx-gen-timeframe]')
  const riskEl = q<HTMLSelectElement>('[data-sx-gen-risk]')
  const styleEl = q<HTMLSelectElement>('[data-sx-gen-style]')
  const notesEl = q<HTMLTextAreaElement>('[data-sx-gen-notes]')

  function showError(msg: string) {
    errorEl.textContent = msg
    errorEl.hidden = !msg
  }

  function showBuilding(building: boolean) {
    formEl.hidden = building
    buildingEl.hidden = !building
  }

  async function submit() {
    const market = marketEl.value.trim()
    const timeframe = timeframeEl.value.trim()
    const riskTolerance = riskEl.value
    const style = styleEl.value
    const notes = notesEl.value.trim()
    if (!market && !timeframe && !riskTolerance && !style && !notes) {
      showError('Tell us a little about the strategy you want first.')
      return
    }
    showError('')
    showBuilding(true)
    const result = await generateStrategy({ market, timeframe, riskTolerance, style, notes })
    if (!result.ok) {
      showBuilding(false)
      showError(describeStrategyAiError(result.error))
      return
    }
    try {
      opts.onStrategyReady(parseStrategyJson(result.strategyJson))
    } catch {
      showBuilding(false)
      showError('The AI response could not be parsed into a valid strategy. Please try again.')
    }
  }

  q('[data-sx-gen-back]').addEventListener('click', () => opts.onBack())
  q('[data-sx-gen-submit]').addEventListener('click', () => void submit())

  return {
    dispose: () => {
      host.replaceChildren()
    },
  }
}
