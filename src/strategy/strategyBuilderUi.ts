import type { IndicatorKey, StrategyCondition, StrategyDefinition } from '../backtest/BacktestTypes'
import { isBuiltInStrategy } from './strategyCatalog'
import {
  getIndicatorOptions,
  getOperatorOptions,
  createBlankStrategy,
  duplicateStrategy,
  isIndicatorRhs,
  rhsNeedsIndicatorOnly,
  parseStrategyJson,
} from './strategyBuilderFields'
import { deleteCustomStrategy, saveCustomStrategy } from './strategyStore'
import { confirmDialog } from '../views/confirmDialog'
import { onLocaleChange, te, t, translateDom, type MessageKey } from '../i18n'
import './strategyBuilder.css'

export type StrategyBuilderOptions = {
  host: HTMLElement
  mode?: 'page' | 'panel'
  initialStrategy?: StrategyDefinition | null
  onChange?: (strategy: StrategyDefinition, meta: { readonly: boolean }) => void
  onSave?: (strategy: StrategyDefinition) => void
  onDelete?: (id: string) => void
  onRunBacktest?: (strategy: StrategyDefinition) => void
}

export type StrategyBuilderApi = {
  loadStrategy: (strategy: StrategyDefinition) => void
  getStrategy: () => StrategyDefinition
  isReadonly: () => boolean
  dispose: () => void
}

function selectOptions(
  items: { value: string; label: string }[],
  selected: string,
): string {
  return items
    .map((o) => `<option value="${o.value}"${o.value === selected ? ' selected' : ''}>${o.label}</option>`)
    .join('')
}

function defaultCondition(): StrategyCondition {
  return { lhs: 'ema9', op: 'cross_above', rhs: 'ema21' }
}

export function mountStrategyBuilder(opts: StrategyBuilderOptions): StrategyBuilderApi {
  const mode = opts.mode ?? 'page'
  let draft: StrategyDefinition = opts.initialStrategy
    ? structuredClone(opts.initialStrategy)
    : createBlankStrategy()
  let readonly = isBuiltInStrategy(draft.id)
  let showJson = false

  opts.host.className = `sx-strat-builder sx-strat-builder--${mode}`
  opts.host.innerHTML = `
    <div class="sx-strat-builder__head">
      <div class="sx-strat-builder__name-wrap">
        <label class="sx-strat-field__lbl" data-i18n="strategy.ui.strategyName">${te('strategy.ui.strategyName')}</label>
        <input type="text" class="sx-strat-input sx-strat-builder__name" data-sx-strat-name maxlength="80" />
      </div>
      <div class="sx-strat-builder__dir-wrap">
        <label class="sx-strat-field__lbl" data-i18n="strategy.ui.direction">${te('strategy.ui.direction')}</label>
        <select class="sx-strat-select" data-sx-strat-direction>
          <option value="long" data-i18n="strategy.ui.dir.longOnly">${te('strategy.ui.dir.longOnly')}</option>
          <option value="short" data-i18n="strategy.ui.dir.shortOnly">${te('strategy.ui.dir.shortOnly')}</option>
          <option value="both" data-i18n="strategy.ui.dir.longShort">${te('strategy.ui.dir.longShort')}</option>
        </select>
      </div>
    </div>
    <p class="sx-strat-builder__readonly" data-sx-strat-readonly hidden data-i18n="strategy.ui.readonlyTemplate">
      ${te('strategy.ui.readonlyTemplate')}
    </p>
    <section class="sx-strat-section" data-i18n-aria-label="strategy.ui.entrySection" aria-label="${te('strategy.ui.entrySection')}">
      <div class="sx-strat-section__head">
        <h3 class="sx-strat-section__title" data-i18n="strategy.ui.entrySection">${te('strategy.ui.entrySection')}</h3>
        <span class="sx-strat-section__hint" data-i18n="strategy.ui.allMustBeTrue">${te('strategy.ui.allMustBeTrue')}</span>
        <button type="button" class="sx-strat-btn sx-strat-btn--ghost" data-sx-strat-add-entry data-i18n="strategy.ui.addRule">${te('strategy.ui.addRule')}</button>
      </div>
      <div class="sx-strat-rules" data-sx-strat-entry-rules></div>
    </section>
    <section class="sx-strat-section" data-i18n-aria-label="strategy.ui.exitSection" aria-label="${te('strategy.ui.exitSection')}">
      <div class="sx-strat-section__head">
        <h3 class="sx-strat-section__title" data-i18n="strategy.ui.exitSection">${te('strategy.ui.exitSection')}</h3>
        <span class="sx-strat-section__hint" data-i18n="strategy.ui.allMustBeTrue">${te('strategy.ui.allMustBeTrue')}</span>
        <button type="button" class="sx-strat-btn sx-strat-btn--ghost" data-sx-strat-add-exit data-i18n="strategy.ui.addRule">${te('strategy.ui.addRule')}</button>
      </div>
      <div class="sx-strat-rules" data-sx-strat-exit-rules></div>
    </section>
    <section class="sx-strat-section sx-strat-section--grid" data-i18n-aria-label="strategy.ui.riskSection" aria-label="${te('strategy.ui.riskSection')}">
      <h3 class="sx-strat-section__title" data-i18n="strategy.ui.riskSection">${te('strategy.ui.riskSection')}</h3>
      <div class="sx-strat-grid">
        <label class="sx-strat-field">
          <span class="sx-strat-field__lbl" data-i18n="strategy.ui.stopLoss">${te('strategy.ui.stopLoss')}</span>
          <div class="sx-strat-field__row">
            <select class="sx-strat-select" data-sx-strat-stop-type>
              <option value="atr_mult" data-i18n="strategy.ui.stop.atrMult">${te('strategy.ui.stop.atrMult')}</option>
              <option value="fixed_pct" data-i18n="strategy.ui.stop.fixedPct">${te('strategy.ui.stop.fixedPct')}</option>
              <option value="fixed_price" data-i18n="strategy.ui.stop.fixedPrice">${te('strategy.ui.stop.fixedPrice')}</option>
            </select>
            <input type="number" class="sx-strat-input sx-strat-input--num" data-sx-strat-stop-val min="0" step="0.1" />
          </div>
        </label>
        <label class="sx-strat-field">
          <span class="sx-strat-field__lbl" data-i18n="strategy.ui.takeProfit">${te('strategy.ui.takeProfit')}</span>
          <div class="sx-strat-field__row">
            <select class="sx-strat-select" data-sx-strat-tp-type>
              <option value="rr_ratio" data-i18n="strategy.ui.tp.rr">${te('strategy.ui.tp.rr')}</option>
              <option value="fixed_pct" data-i18n="strategy.ui.tp.fixedPct">${te('strategy.ui.tp.fixedPct')}</option>
              <option value="fixed_price" data-i18n="strategy.ui.tp.fixedPrice">${te('strategy.ui.tp.fixedPrice')}</option>
              <option value="none" data-i18n="strategy.ui.tp.none">${te('strategy.ui.tp.none')}</option>
            </select>
            <input type="number" class="sx-strat-input sx-strat-input--num" data-sx-strat-tp-val min="0" step="0.1" />
          </div>
        </label>
        <label class="sx-strat-field">
          <span class="sx-strat-field__lbl" data-i18n="strategy.ui.positionSize">${te('strategy.ui.positionSize')}</span>
          <div class="sx-strat-field__row">
            <select class="sx-strat-select" data-sx-strat-size-type>
              <option value="fixed_risk" data-i18n="strategy.ui.size.fixedRisk">${te('strategy.ui.size.fixedRisk')}</option>
              <option value="fixed_units" data-i18n="strategy.ui.size.fixedUnits">${te('strategy.ui.size.fixedUnits')}</option>
              <option value="pct_equity" data-i18n="strategy.ui.size.pctEquity">${te('strategy.ui.size.pctEquity')}</option>
            </select>
            <input type="number" class="sx-strat-input sx-strat-input--num" data-sx-strat-size-val min="0" step="0.1" />
          </div>
        </label>
      </div>
    </section>
    <div class="sx-strat-builder__json-toggle">
      <button type="button" class="sx-strat-btn sx-strat-btn--ghost" data-sx-strat-json-toggle data-i18n="strategy.ui.viewJson">${te('strategy.ui.viewJson')}</button>
    </div>
    <div class="sx-strat-builder__json" data-sx-strat-json-wrap hidden>
      <textarea class="sx-strat-json" data-sx-strat-json spellcheck="false" data-i18n-aria-label="strategy.ui.strategyJsonAria" aria-label="${te('strategy.ui.strategyJsonAria')}"></textarea>
      <button type="button" class="sx-strat-btn" data-sx-strat-json-apply data-i18n="strategy.ui.applyJson">${te('strategy.ui.applyJson')}</button>
    </div>
    <div class="sx-strat-builder__actions">
      <button type="button" class="sx-strat-btn sx-strat-btn--ghost" data-sx-strat-duplicate data-i18n="strategy.ui.duplicate">${te('strategy.ui.duplicate')}</button>
      <button type="button" class="sx-strat-btn sx-strat-btn--danger" data-sx-strat-delete hidden data-i18n="strategy.ui.delete">${te('strategy.ui.delete')}</button>
      <span class="sx-strat-builder__actions-spacer"></span>
      ${opts.onRunBacktest ? `<button type="button" class="sx-strat-btn" data-sx-strat-run-backtest data-i18n="strategy.runBacktest">${te('strategy.runBacktest')}</button>` : ''}
      <button type="button" class="sx-strat-btn sx-strat-btn--primary" data-sx-strat-save data-i18n="strategy.ui.saveStrategy">${te('strategy.ui.saveStrategy')}</button>
    </div>
  `

  const nameEl = opts.host.querySelector('[data-sx-strat-name]') as HTMLInputElement
  const dirEl = opts.host.querySelector('[data-sx-strat-direction]') as HTMLSelectElement
  const readonlyEl = opts.host.querySelector('[data-sx-strat-readonly]') as HTMLElement
  const entryRulesEl = opts.host.querySelector('[data-sx-strat-entry-rules]') as HTMLElement
  const exitRulesEl = opts.host.querySelector('[data-sx-strat-exit-rules]') as HTMLElement
  const stopTypeEl = opts.host.querySelector('[data-sx-strat-stop-type]') as HTMLSelectElement
  const stopValEl = opts.host.querySelector('[data-sx-strat-stop-val]') as HTMLInputElement
  const tpTypeEl = opts.host.querySelector('[data-sx-strat-tp-type]') as HTMLSelectElement
  const tpValEl = opts.host.querySelector('[data-sx-strat-tp-val]') as HTMLInputElement
  const sizeTypeEl = opts.host.querySelector('[data-sx-strat-size-type]') as HTMLSelectElement
  const sizeValEl = opts.host.querySelector('[data-sx-strat-size-val]') as HTMLInputElement
  const jsonWrap = opts.host.querySelector('[data-sx-strat-json-wrap]') as HTMLElement
  const jsonEl = opts.host.querySelector('[data-sx-strat-json]') as HTMLTextAreaElement
  const btnSave = opts.host.querySelector('[data-sx-strat-save]') as HTMLButtonElement
  const btnDelete = opts.host.querySelector('[data-sx-strat-delete]') as HTMLButtonElement
  const btnDuplicate = opts.host.querySelector('[data-sx-strat-duplicate]') as HTMLButtonElement

  function notify() {
    opts.onChange?.(structuredClone(draft), { readonly })
  }

  function syncJsonTextarea() {
    jsonEl.value = JSON.stringify(draft, null, 2)
  }

  function readRulesFromDom(container: HTMLElement, key: 'entryConditions' | 'exitConditions') {
    const rules: StrategyCondition[] = []
    container.querySelectorAll('[data-sx-strat-rule]').forEach((row) => {
      const lhs = (row.querySelector('[data-sx-rule-lhs]') as HTMLSelectElement).value as IndicatorKey
      const op = (row.querySelector('[data-sx-rule-op]') as HTMLSelectElement)
        .value as StrategyCondition['op']
      const rhsKind = (row.querySelector('[data-sx-rule-rhs-kind]') as HTMLSelectElement).value
      let rhs: StrategyCondition['rhs']
      if (rhsKind === 'number') {
        rhs = Number((row.querySelector('[data-sx-rule-rhs-num]') as HTMLInputElement).value)
      } else {
        rhs = (row.querySelector('[data-sx-rule-rhs-ind]') as HTMLSelectElement).value as IndicatorKey
      }
      rules.push({ lhs, op, rhs })
    })
    draft[key] = rules.length ? rules : [defaultCondition()]
  }

  function parseErrorMessage(err: unknown): string {
    if (err instanceof Error && err.message.startsWith('strategy.')) {
      return t(err.message as MessageKey)
    }
    return t('strategy.ui.error.invalidJson')
  }

  function readDraftFromForm() {
    draft.name = nameEl.value.trim() || t('strategy.ui.untitled')
    draft.direction = dirEl.value as StrategyDefinition['direction']
    readRulesFromDom(entryRulesEl, 'entryConditions')
    readRulesFromDom(exitRulesEl, 'exitConditions')

    const stopType = stopTypeEl.value as StrategyDefinition['stopLoss']['type']
    draft.stopLoss = { type: stopType, value: Number(stopValEl.value) || 1 } as StrategyDefinition['stopLoss']

    const tpType = tpTypeEl.value as StrategyDefinition['takeProfit']['type']
    if (tpType === 'none') draft.takeProfit = { type: 'none' }
    else draft.takeProfit = { type: tpType, value: Number(tpValEl.value) || 1 } as StrategyDefinition['takeProfit']

    const sizeType = sizeTypeEl.value as StrategyDefinition['positionSize']['type']
    const sizeVal = Number(sizeValEl.value) || 1
    if (sizeType === 'fixed_units') draft.positionSize = { type: 'fixed_units', units: sizeVal }
    else if (sizeType === 'fixed_risk') draft.positionSize = { type: 'fixed_risk', riskPct: sizeVal }
    else draft.positionSize = { type: 'pct_equity', pct: sizeVal }

    syncJsonTextarea()
    notify()
  }

  function renderRuleRow(rule: StrategyCondition): HTMLElement {
    const row = document.createElement('div')
    row.className = 'sx-strat-rule'
    row.dataset.sxStratRule = ''
    const rhsIsInd = isIndicatorRhs(rule.rhs) || rhsNeedsIndicatorOnly(rule.op)
    const rhsNum = typeof rule.rhs === 'number' ? rule.rhs : 0
    const rhsInd = typeof rule.rhs === 'string' ? rule.rhs : 'ema21'
    row.innerHTML = `
      <select class="sx-strat-select" data-sx-rule-lhs>${selectOptions(getIndicatorOptions(), rule.lhs)}</select>
      <select class="sx-strat-select" data-sx-rule-op>${selectOptions(getOperatorOptions(), rule.op)}</select>
      <select class="sx-strat-select sx-strat-rule__rhs-kind" data-sx-rule-rhs-kind>
        <option value="indicator"${rhsIsInd ? ' selected' : ''}>${te('strategy.ui.ruleRhsIndicator')}</option>
        <option value="number"${!rhsIsInd ? ' selected' : ''}>${te('strategy.ui.ruleRhsNumber')}</option>
      </select>
      <select class="sx-strat-select sx-strat-rule__rhs-ind" data-sx-rule-rhs-ind ${!rhsIsInd ? 'hidden' : ''}>${selectOptions(getIndicatorOptions(), rhsInd)}</select>
      <input type="number" class="sx-strat-input sx-strat-input--num sx-strat-rule__rhs-num" data-sx-rule-rhs-num step="any" value="${rhsNum}" ${rhsIsInd ? 'hidden' : ''} />
      <button type="button" class="sx-strat-rule__remove" data-sx-rule-remove data-i18n-aria-label="strategy.ui.removeRuleAria" aria-label="${te('strategy.ui.removeRuleAria')}">×</button>
    `
    const opEl = row.querySelector('[data-sx-rule-op]') as HTMLSelectElement
    const rhsKindEl = row.querySelector('[data-sx-rule-rhs-kind]') as HTMLSelectElement
    const rhsIndEl = row.querySelector('[data-sx-rule-rhs-ind]') as HTMLSelectElement
    const rhsNumEl = row.querySelector('[data-sx-rule-rhs-num]') as HTMLInputElement

    function syncRhsVisibility() {
      const cross = rhsNeedsIndicatorOnly(opEl.value as StrategyCondition['op'])
      if (cross) {
        rhsKindEl.value = 'indicator'
        rhsKindEl.disabled = true
      } else {
        rhsKindEl.disabled = readonly
      }
      const useInd = cross || rhsKindEl.value === 'indicator'
      rhsIndEl.hidden = !useInd
      rhsNumEl.hidden = useInd
    }

    opEl.addEventListener('change', () => {
      syncRhsVisibility()
      readDraftFromForm()
    })
    rhsKindEl.addEventListener('change', () => {
      syncRhsVisibility()
      readDraftFromForm()
    })
    row.querySelectorAll('select, input').forEach((el) => {
      el.addEventListener('change', () => readDraftFromForm())
      el.addEventListener('input', () => readDraftFromForm())
    })
    row.querySelector('[data-sx-rule-remove]')!.addEventListener('click', () => {
      row.remove()
      readDraftFromForm()
      paintRules()
    })
    syncRhsVisibility()
    row.querySelectorAll('select, input, button').forEach((el) => {
      if (el instanceof HTMLButtonElement) return
      ;(el as HTMLInputElement | HTMLSelectElement).disabled = readonly
    })
    row.querySelector('[data-sx-rule-remove]')!.toggleAttribute('disabled', readonly)
    return row
  }

  function paintRules() {
    entryRulesEl.innerHTML = ''
    exitRulesEl.innerHTML = ''
    draft.entryConditions.forEach((r) => entryRulesEl.appendChild(renderRuleRow(r)))
    draft.exitConditions.forEach((r) => exitRulesEl.appendChild(renderRuleRow(r)))
  }

  function paintForm() {
    readonly = isBuiltInStrategy(draft.id)
    nameEl.value = draft.name
    dirEl.value = draft.direction
    stopTypeEl.value = draft.stopLoss.type
    stopValEl.value = String(draft.stopLoss.value)
    tpTypeEl.value = draft.takeProfit.type
    tpValEl.hidden = draft.takeProfit.type === 'none'
    tpValEl.value =
      draft.takeProfit.type === 'none' ? '2' : String((draft.takeProfit as { value: number }).value)
    sizeTypeEl.value = draft.positionSize.type
    if (draft.positionSize.type === 'fixed_units') sizeValEl.value = String(draft.positionSize.units)
    else if (draft.positionSize.type === 'fixed_risk') sizeValEl.value = String(draft.positionSize.riskPct)
    else sizeValEl.value = String(draft.positionSize.pct)

    readonlyEl.hidden = !readonly
    btnSave.textContent = readonly ? t('strategy.ui.saveAsCopy') : t('strategy.ui.saveStrategy')
    btnSave.dataset.i18n = readonly ? 'strategy.ui.saveAsCopy' : 'strategy.ui.saveStrategy'
    btnDelete.hidden = readonly || !draft.id.startsWith('custom_')
    btnDuplicate.hidden = false

    const disable = readonly
    ;[nameEl, dirEl, stopTypeEl, stopValEl, tpTypeEl, tpValEl, sizeTypeEl, sizeValEl].forEach((el) => {
      el.disabled = disable
    })
    opts.host.querySelectorAll('[data-sx-strat-add-entry], [data-sx-strat-add-exit]').forEach((el) => {
      ;(el as HTMLButtonElement).disabled = disable
    })

    paintRules()
    syncJsonTextarea()
    notify()
  }

  function loadStrategy(strategy: StrategyDefinition) {
    draft = structuredClone(strategy)
    paintForm()
  }

  nameEl.addEventListener('input', () => readDraftFromForm())
  dirEl.addEventListener('change', () => readDraftFromForm())
  ;[stopTypeEl, stopValEl, tpTypeEl, tpValEl, sizeTypeEl, sizeValEl].forEach((el) => {
    el.addEventListener('change', () => readDraftFromForm())
    el.addEventListener('input', () => readDraftFromForm())
  })
  tpTypeEl.addEventListener('change', () => {
    tpValEl.hidden = tpTypeEl.value === 'none'
    readDraftFromForm()
  })

  opts.host.querySelector('[data-sx-strat-add-entry]')!.addEventListener('click', () => {
    draft.entryConditions.push(defaultCondition())
    paintRules()
    readDraftFromForm()
  })
  opts.host.querySelector('[data-sx-strat-add-exit]')!.addEventListener('click', () => {
    draft.exitConditions.push(defaultCondition())
    paintRules()
    readDraftFromForm()
  })

  opts.host.querySelector('[data-sx-strat-json-toggle]')!.addEventListener('click', () => {
    showJson = !showJson
    jsonWrap.hidden = !showJson
    if (showJson) syncJsonTextarea()
  })

  opts.host.querySelector('[data-sx-strat-json-apply]')!.addEventListener('click', () => {
    try {
      const parsed = parseStrategyJson(jsonEl.value)
      loadStrategy(parsed)
    } catch (err) {
      window.alert(parseErrorMessage(err))
    }
  })

  btnDuplicate.addEventListener('click', () => {
    readDraftFromForm()
    loadStrategy(duplicateStrategy(draft))
  })

  btnSave.addEventListener('click', () => {
    readDraftFromForm()
    const toSave = readonly ? duplicateStrategy(draft) : { ...draft }
    if (readonly) toSave.id = toSave.id
    const saved = saveCustomStrategy(toSave)
    loadStrategy(saved)
    opts.onSave?.(saved)
  })

  opts.host.querySelector('[data-sx-strat-run-backtest]')?.addEventListener('click', () => {
    readDraftFromForm()
    opts.onRunBacktest?.(structuredClone(draft))
  })

  btnDelete.addEventListener('click', () => {
    if (!draft.id.startsWith('custom_')) return
    void confirmDialog({
      title: t('strategy.ui.deleteTitle'),
      message: t('strategy.ui.deleteMessage', { name: draft.name }),
      confirmLabel: t('strategy.ui.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    }).then((ok) => {
      if (!ok) return
      deleteCustomStrategy(draft.id)
      opts.onDelete?.(draft.id)
      loadStrategy(createBlankStrategy())
    })
  })

  const offLocale = onLocaleChange(() => {
    translateDom(opts.host)
    paintRules()
    paintForm()
  })

  paintForm()

  return {
    loadStrategy,
    getStrategy: () => structuredClone(draft),
    isReadonly: () => readonly,
    dispose: () => {
      offLocale()
      opts.host.replaceChildren()
    },
  }
}
