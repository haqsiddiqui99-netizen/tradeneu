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
import { onLocaleChange, te, t, translateDom, type MessageKey } from '../i18n'

export type StrategyAiModalOptions = {
  onStrategyReady: (strategy: StrategyDefinition) => void
}

type Mode = 'pick' | 'have' | 'need'

function html(): string {
  return `
    <button type="button" class="sx-strat-ai-modal__backdrop" aria-label="${te('common.close')}" data-i18n-aria-label="common.close"></button>
    <div class="sx-strat-ai-modal__panel" role="dialog" aria-modal="true" aria-label="${te('strategy.ai.dialogAria')}" data-i18n-aria-label="strategy.ai.dialogAria">
      <button type="button" class="sx-strat-ai-modal__close" data-sx-strat-ai-close data-i18n-aria-label="common.close" aria-label="${te('common.close')}">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>

      <div class="sx-strat-ai-modal__pick" data-sx-strat-ai-pick>
        <span class="sx-strat-ai-modal__eyebrow"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> <span data-i18n="strategy.ai.eyebrow">${te('strategy.ai.eyebrow')}</span></span>
        <h2 class="sx-strat-ai-modal__title" data-i18n="strategy.intake.heroTitle">${te('strategy.intake.heroTitle')}</h2>
        <p class="sx-strat-ai-modal__subtitle" data-i18n="strategy.intake.heroSubtitle">${te('strategy.intake.heroSubtitle')}</p>
        <div class="sx-strat-ai-modal__cards">
          <button type="button" class="sx-strat-ai-modal__card" data-sx-strat-ai-pick-mode="have">
            <span class="sx-strat-ai-modal__card-icon sx-strat-ai-modal__card-icon--blue"><i class="fa-regular fa-file-lines" aria-hidden="true"></i></span>
            <span class="sx-strat-ai-modal__card-title" data-i18n="strategy.intake.have.title">${te('strategy.intake.have.title')}</span>
            <span class="sx-strat-ai-modal__card-link" data-i18n="strategy.intake.have.link">${te('strategy.intake.have.link')}</span>
            <span class="sx-strat-ai-modal__card-desc" data-i18n="strategy.ai.have.desc">${te('strategy.ai.have.desc')}</span>
          </button>
          <button type="button" class="sx-strat-ai-modal__card" data-sx-strat-ai-pick-mode="need">
            <span class="sx-strat-ai-modal__card-icon sx-strat-ai-modal__card-icon--violet"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></span>
            <span class="sx-strat-ai-modal__card-title" data-i18n="strategy.intake.need.title">${te('strategy.intake.need.title')}</span>
            <span class="sx-strat-ai-modal__card-link" data-i18n="strategy.intake.need.link">${te('strategy.intake.need.link')}</span>
            <span class="sx-strat-ai-modal__card-desc" data-i18n="strategy.intake.need.desc">${te('strategy.intake.need.desc')}</span>
          </button>
        </div>
      </div>

      <div class="sx-strat-ai-modal__form" data-sx-strat-ai-form="have" hidden>
        <button type="button" class="sx-strat-ai-modal__back" data-sx-strat-ai-back><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> <span data-i18n="strategy.ai.back">${te('strategy.ai.back')}</span></button>
        <h2 class="sx-strat-ai-modal__title" data-i18n="strategy.intake.have.title">${te('strategy.intake.have.title')}</h2>
        <p class="sx-strat-ai-modal__subtitle" data-i18n="strategy.ai.have.subtitle">${te('strategy.ai.have.subtitle')}</p>
        <textarea class="sx-strat-ai-modal__textarea" data-sx-strat-ai-description rows="7" data-i18n-placeholder="strategy.ai.have.placeholder" placeholder="${te('strategy.ai.have.placeholder')}"></textarea>
        <div class="sx-strat-ai-modal__error" data-sx-strat-ai-error hidden></div>
        <button type="button" class="sx-strat-ai-modal__submit" data-sx-strat-ai-submit>
          <span data-sx-strat-ai-submit-label data-i18n="strategy.ai.have.submit">${te('strategy.ai.have.submit')}</span>
        </button>
      </div>

      <div class="sx-strat-ai-modal__form" data-sx-strat-ai-form="need" hidden>
        <button type="button" class="sx-strat-ai-modal__back" data-sx-strat-ai-back><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> <span data-i18n="strategy.ai.back">${te('strategy.ai.back')}</span></button>
        <h2 class="sx-strat-ai-modal__title" data-i18n="strategy.intake.need.title">${te('strategy.intake.need.title')}</h2>
        <p class="sx-strat-ai-modal__subtitle" data-i18n="strategy.ai.need.subtitle">${te('strategy.ai.need.subtitle')}</p>
        <div class="sx-strat-ai-modal__grid">
          <label class="sx-strat-ai-modal__field">
            <span data-i18n="strategy.ai.need.market">${te('strategy.ai.need.market')}</span>
            <input type="text" data-sx-strat-ai-market data-i18n-placeholder="strategy.ai.need.marketPlaceholder" placeholder="${te('strategy.ai.need.marketPlaceholder')}" />
          </label>
          <label class="sx-strat-ai-modal__field">
            <span data-i18n="strategy.ai.need.timeframe">${te('strategy.ai.need.timeframe')}</span>
            <input type="text" data-sx-strat-ai-timeframe data-i18n-placeholder="strategy.ai.need.timeframePlaceholder" placeholder="${te('strategy.ai.need.timeframePlaceholder')}" />
          </label>
          <label class="sx-strat-ai-modal__field">
            <span data-i18n="strategy.ai.need.risk">${te('strategy.ai.need.risk')}</span>
            <select data-sx-strat-ai-risk>
              <option value="" data-i18n="strategy.ai.need.selectEllipsis">${te('strategy.ai.need.selectEllipsis')}</option>
              <option value="conservative" data-i18n="strategy.ai.need.risk.conservative">${te('strategy.ai.need.risk.conservative')}</option>
              <option value="moderate" data-i18n="strategy.ai.need.risk.moderate">${te('strategy.ai.need.risk.moderate')}</option>
              <option value="aggressive" data-i18n="strategy.ai.need.risk.aggressive">${te('strategy.ai.need.risk.aggressive')}</option>
            </select>
          </label>
          <label class="sx-strat-ai-modal__field">
            <span data-i18n="strategy.ai.need.style">${te('strategy.ai.need.style')}</span>
            <select data-sx-strat-ai-style>
              <option value="" data-i18n="strategy.ai.need.selectEllipsis">${te('strategy.ai.need.selectEllipsis')}</option>
              <option value="trend-following" data-i18n="strategy.ai.need.style.trend">${te('strategy.ai.need.style.trend')}</option>
              <option value="mean-reversion" data-i18n="strategy.ai.need.style.meanrev">${te('strategy.ai.need.style.meanrev')}</option>
              <option value="breakout" data-i18n="strategy.ai.need.style.breakout">${te('strategy.ai.need.style.breakout')}</option>
              <option value="scalping" data-i18n="strategy.ai.need.style.scalp">${te('strategy.ai.need.style.scalp')}</option>
            </select>
          </label>
        </div>
        <textarea class="sx-strat-ai-modal__textarea sx-strat-ai-modal__textarea--short" data-sx-strat-ai-notes rows="3" data-i18n-placeholder="strategy.ai.need.notesPlaceholder" placeholder="${te('strategy.ai.need.notesPlaceholder')}"></textarea>
        <div class="sx-strat-ai-modal__error" data-sx-strat-ai-error hidden></div>
        <button type="button" class="sx-strat-ai-modal__submit" data-sx-strat-ai-submit>
          <span data-sx-strat-ai-submit-label data-i18n="strategy.ai.need.submit">${te('strategy.ai.need.submit')}</span>
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
    offLocale()
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }
  function onKey(ke: KeyboardEvent) {
    if (ke.key === 'Escape' && !busy) close()
  }
  document.addEventListener('keydown', onKey, true)

  const offLocale = onLocaleChange(() => {
    translateDom(overlay)
    for (const label of overlay.querySelectorAll<HTMLElement>('[data-sx-strat-ai-submit-label]')) {
      if (!busy) label.textContent = t(label.dataset.i18n as MessageKey)
    }
  })

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
        label.textContent = t('strategy.ai.thinking')
      } else {
        const key = label.dataset.i18n as MessageKey | undefined
        label.textContent = key ? t(key) : label.textContent ?? ''
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
      showError(form, t('strategy.ai.error.parseFailed'))
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
      showError(haveForm, t('strategy.ai.have.errorEmpty'))
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
      showError(needForm, t('strategy.ai.need.errorEmpty'))
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
