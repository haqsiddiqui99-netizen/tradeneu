/**
 * src/strategy/strategyAiModal.ts
 *
 * "AI Strategy Builder" modal — fxreplay-style intake screen with two paths:
 *   - "I have a strategy"  -> objectify free-text rules into a precise StrategyDefinition.
 *   - "I need a strategy"  -> generate a brand-new StrategyDefinition from a short profile.
 *
 * The resulting strategy is handed back via `onStrategyReady` so the caller can
 * load it straight into the existing rule editor (mountStrategyBuilder) for the
 * trader to review/tweak before saving — the AI drafts, the human confirms.
 */
import './strategyAiModal.css'
import type { StrategyDefinition } from '../backtest/BacktestTypes'
import { parseStrategyJson } from './strategyBuilderFields'
import { describeStrategyAiError, generateStrategy, objectifyStrategy } from '../ai/strategyAiClient'

export type StrategyAiModalOptions = {
  onStrategyReady: (strategy: StrategyDefinition) => void
}

type Mode = 'pick' | 'have' | 'need'

function html(): string {
  return `
    <button type="button" class="sx-strat-ai-modal__backdrop" aria-label="Close"></button>
    <div class="sx-strat-ai-modal__panel" role="dialog" aria-modal="true" aria-label="AI strategy builder">
      <button type="button" class="sx-strat-ai-modal__close" data-sx-strat-ai-close aria-label="Close">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>

      <div class="sx-strat-ai-modal__pick" data-sx-strat-ai-pick>
        <span class="sx-strat-ai-modal__eyebrow"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> AI strategy builder</span>
        <h2 class="sx-strat-ai-modal__title">Let\u2019s build your strategy</h2>
        <p class="sx-strat-ai-modal__subtitle">Where are you starting from?</p>
        <div class="sx-strat-ai-modal__cards">
          <button type="button" class="sx-strat-ai-modal__card" data-sx-strat-ai-pick-mode="have">
            <span class="sx-strat-ai-modal__card-icon sx-strat-ai-modal__card-icon--blue"><i class="fa-regular fa-file-lines" aria-hidden="true"></i></span>
            <span class="sx-strat-ai-modal__card-title">I have a strategy</span>
            <span class="sx-strat-ai-modal__card-link">Make it more objective</span>
            <span class="sx-strat-ai-modal__card-desc">Got rules already? Paste them and I\u2019ll scan for gaps and turn every fuzzy idea into a clear, testable condition.</span>
          </button>
          <button type="button" class="sx-strat-ai-modal__card" data-sx-strat-ai-pick-mode="need">
            <span class="sx-strat-ai-modal__card-icon sx-strat-ai-modal__card-icon--violet"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></span>
            <span class="sx-strat-ai-modal__card-title">I need a strategy</span>
            <span class="sx-strat-ai-modal__card-link">Start from scratch</span>
            <span class="sx-strat-ai-modal__card-desc">Tell us a bit about yourself and we\u2019ll hand you a proven strategy to start with.</span>
          </button>
        </div>
      </div>

      <div class="sx-strat-ai-modal__form" data-sx-strat-ai-form="have" hidden>
        <button type="button" class="sx-strat-ai-modal__back" data-sx-strat-ai-back><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back</button>
        <h2 class="sx-strat-ai-modal__title">I have a strategy</h2>
        <p class="sx-strat-ai-modal__subtitle">Paste your rules \u2014 entries, exits, stop loss, sizing, anything you\u2019ve got.</p>
        <textarea class="sx-strat-ai-modal__textarea" data-sx-strat-ai-description rows="7" placeholder="e.g. Buy XAUUSD when price breaks above the London session high and RSI is over 50. Stop below the recent swing low, target 2R, risk 1% per trade..."></textarea>
        <div class="sx-strat-ai-modal__error" data-sx-strat-ai-error hidden></div>
        <button type="button" class="sx-strat-ai-modal__submit" data-sx-strat-ai-submit>
          <span data-sx-strat-ai-submit-label>Make it more objective</span>
        </button>
      </div>

      <div class="sx-strat-ai-modal__form" data-sx-strat-ai-form="need" hidden>
        <button type="button" class="sx-strat-ai-modal__back" data-sx-strat-ai-back><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back</button>
        <h2 class="sx-strat-ai-modal__title">I need a strategy</h2>
        <p class="sx-strat-ai-modal__subtitle">Tell us a bit about yourself and we\u2019ll design one to start with.</p>
        <div class="sx-strat-ai-modal__grid">
          <label class="sx-strat-ai-modal__field">
            <span>Market</span>
            <input type="text" data-sx-strat-ai-market placeholder="e.g. XAUUSD, EURUSD" />
          </label>
          <label class="sx-strat-ai-modal__field">
            <span>Timeframe</span>
            <input type="text" data-sx-strat-ai-timeframe placeholder="e.g. 15m, 1H, Daily" />
          </label>
          <label class="sx-strat-ai-modal__field">
            <span>Risk tolerance</span>
            <select data-sx-strat-ai-risk>
              <option value="">Select\u2026</option>
              <option value="conservative">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </label>
          <label class="sx-strat-ai-modal__field">
            <span>Trading style</span>
            <select data-sx-strat-ai-style>
              <option value="">Select\u2026</option>
              <option value="trend-following">Trend following</option>
              <option value="mean-reversion">Mean reversion</option>
              <option value="breakout">Breakout</option>
              <option value="scalping">Scalping</option>
            </select>
          </label>
        </div>
        <textarea class="sx-strat-ai-modal__textarea sx-strat-ai-modal__textarea--short" data-sx-strat-ai-notes rows="3" placeholder="Anything else? (optional)"></textarea>
        <div class="sx-strat-ai-modal__error" data-sx-strat-ai-error hidden></div>
        <button type="button" class="sx-strat-ai-modal__submit" data-sx-strat-ai-submit>
          <span data-sx-strat-ai-submit-label>Start from scratch</span>
        </button>
      </div>
    </div>`
}

export function openStrategyAiModal(opts: StrategyAiModalOptions): () => void {
  const overlay = document.createElement('div')
  overlay.className = 'sx-strat-ai-modal'
  overlay.innerHTML = html()
  document.body.appendChild(overlay)

  let busy = false

  function close() {
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }
  function onKey(ke: KeyboardEvent) {
    if (ke.key === 'Escape' && !busy) close()
  }
  document.addEventListener('keydown', onKey, true)

  overlay.querySelector('[data-sx-strat-ai-close]')?.addEventListener('click', () => {
    if (!busy) close()
  })
  overlay.querySelector('.sx-strat-ai-modal__backdrop')?.addEventListener('click', () => {
    if (!busy) close()
  })

  const pickEl = overlay.querySelector<HTMLElement>('[data-sx-strat-ai-pick]')!
  const forms = Array.from(overlay.querySelectorAll<HTMLElement>('[data-sx-strat-ai-form]'))

  function showMode(mode: Mode) {
    pickEl.hidden = mode !== 'pick'
    for (const f of forms) f.hidden = f.dataset.sxStratAiForm !== mode
  }

  overlay.querySelectorAll<HTMLButtonElement>('[data-sx-strat-ai-pick-mode]').forEach((btn) => {
    btn.addEventListener('click', () => showMode((btn.dataset.sxStratAiPickMode as Mode) || 'pick'))
  })
  overlay.querySelectorAll<HTMLButtonElement>('[data-sx-strat-ai-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!busy) showMode('pick')
    })
  })

  function showError(form: HTMLElement, msg: string) {
    const el = form.querySelector<HTMLElement>('[data-sx-strat-ai-error]')
    if (!el) return
    el.textContent = msg
    el.hidden = !msg
  }

  function setBusy(form: HTMLElement, val: boolean) {
    busy = val
    const btn = form.querySelector<HTMLButtonElement>('[data-sx-strat-ai-submit]')
    const label = form.querySelector<HTMLElement>('[data-sx-strat-ai-submit-label]')
    if (btn) btn.disabled = val
    if (label) {
      if (val) {
        label.dataset.defaultLabel = label.dataset.defaultLabel ?? label.textContent ?? ''
        label.textContent = 'Thinking\u2026'
      } else {
        label.textContent = label.dataset.defaultLabel ?? label.textContent ?? ''
      }
    }
  }

  function acceptStrategyJson(strategyJson: string, form: HTMLElement): boolean {
    try {
      const strategy = parseStrategyJson(strategyJson)
      close()
      opts.onStrategyReady(strategy)
      return true
    } catch {
      showError(form, 'The AI response could not be parsed into a valid strategy. Please try again.')
      return false
    }
  }

  const haveForm = overlay.querySelector<HTMLElement>('[data-sx-strat-ai-form="have"]')!
  haveForm.querySelector('[data-sx-strat-ai-submit]')?.addEventListener('click', async () => {
    if (busy) return
    showError(haveForm, '')
    const ta = haveForm.querySelector<HTMLTextAreaElement>('[data-sx-strat-ai-description]')!
    const description = ta.value.trim()
    if (!description) {
      showError(haveForm, 'Paste your strategy rules first.')
      return
    }
    setBusy(haveForm, true)
    const result = await objectifyStrategy({ description })
    setBusy(haveForm, false)
    if (!result.ok) {
      showError(haveForm, describeStrategyAiError(result.error))
      return
    }
    acceptStrategyJson(result.strategyJson, haveForm)
  })

  const needForm = overlay.querySelector<HTMLElement>('[data-sx-strat-ai-form="need"]')!
  needForm.querySelector('[data-sx-strat-ai-submit]')?.addEventListener('click', async () => {
    if (busy) return
    showError(needForm, '')
    const market = needForm.querySelector<HTMLInputElement>('[data-sx-strat-ai-market]')!.value.trim()
    const timeframe = needForm.querySelector<HTMLInputElement>('[data-sx-strat-ai-timeframe]')!.value.trim()
    const riskTolerance = needForm.querySelector<HTMLSelectElement>('[data-sx-strat-ai-risk]')!.value
    const style = needForm.querySelector<HTMLSelectElement>('[data-sx-strat-ai-style]')!.value
    const notes = needForm.querySelector<HTMLTextAreaElement>('[data-sx-strat-ai-notes]')!.value.trim()
    if (!market && !timeframe && !riskTolerance && !style && !notes) {
      showError(needForm, 'Tell us a little about the strategy you want first.')
      return
    }
    setBusy(needForm, true)
    const result = await generateStrategy({ market, timeframe, riskTolerance, style, notes })
    setBusy(needForm, false)
    if (!result.ok) {
      showError(needForm, describeStrategyAiError(result.error))
      return
    }
    acceptStrategyJson(result.strategyJson, needForm)
  })

  showMode('pick')
  return close
}
