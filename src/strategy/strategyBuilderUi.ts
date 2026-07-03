import type { IndicatorKey, StrategyCondition, StrategyDefinition } from '../backtest/BacktestTypes'
import { isBuiltInStrategy } from './strategyCatalog'
import {
  INDICATOR_OPTIONS,
  OPERATOR_OPTIONS,
  createBlankStrategy,
  duplicateStrategy,
  isIndicatorRhs,
  rhsNeedsIndicatorOnly,
  parseStrategyJson,
} from './strategyBuilderFields'
import { deleteCustomStrategy, saveCustomStrategy } from './strategyStore'
import { confirmDialog } from '../views/confirmDialog'
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
        <label class="sx-strat-field__lbl">Strategy name</label>
        <input type="text" class="sx-strat-input sx-strat-builder__name" data-sx-strat-name maxlength="80" />
      </div>
      <div class="sx-strat-builder__dir-wrap">
        <label class="sx-strat-field__lbl">Direction</label>
        <select class="sx-strat-select" data-sx-strat-direction>
          <option value="long">Long only</option>
          <option value="short">Short only</option>
          <option value="both">Long &amp; short</option>
        </select>
      </div>
    </div>
    <p class="sx-strat-builder__readonly" data-sx-strat-readonly hidden>
      Built-in template — duplicate to customize, or save a copy.
    </p>
    <section class="sx-strat-section" aria-label="Entry rules">
      <div class="sx-strat-section__head">
        <h3 class="sx-strat-section__title">Entry rules</h3>
        <span class="sx-strat-section__hint">All must be true</span>
        <button type="button" class="sx-strat-btn sx-strat-btn--ghost" data-sx-strat-add-entry>+ Add rule</button>
      </div>
      <div class="sx-strat-rules" data-sx-strat-entry-rules></div>
    </section>
    <section class="sx-strat-section" aria-label="Exit rules">
      <div class="sx-strat-section__head">
        <h3 class="sx-strat-section__title">Exit rules</h3>
        <span class="sx-strat-section__hint">All must be true</span>
        <button type="button" class="sx-strat-btn sx-strat-btn--ghost" data-sx-strat-add-exit>+ Add rule</button>
      </div>
      <div class="sx-strat-rules" data-sx-strat-exit-rules></div>
    </section>
    <section class="sx-strat-section sx-strat-section--grid" aria-label="Risk">
      <h3 class="sx-strat-section__title">Risk &amp; sizing</h3>
      <div class="sx-strat-grid">
        <label class="sx-strat-field">
          <span class="sx-strat-field__lbl">Stop loss</span>
          <div class="sx-strat-field__row">
            <select class="sx-strat-select" data-sx-strat-stop-type>
              <option value="atr_mult">ATR multiple</option>
              <option value="fixed_pct">Fixed %</option>
              <option value="fixed_price">Fixed price distance</option>
            </select>
            <input type="number" class="sx-strat-input sx-strat-input--num" data-sx-strat-stop-val min="0" step="0.1" />
          </div>
        </label>
        <label class="sx-strat-field">
          <span class="sx-strat-field__lbl">Take profit</span>
          <div class="sx-strat-field__row">
            <select class="sx-strat-select" data-sx-strat-tp-type>
              <option value="rr_ratio">Risk : reward</option>
              <option value="fixed_pct">Fixed %</option>
              <option value="fixed_price">Fixed price distance</option>
              <option value="none">None (signal exit)</option>
            </select>
            <input type="number" class="sx-strat-input sx-strat-input--num" data-sx-strat-tp-val min="0" step="0.1" />
          </div>
        </label>
        <label class="sx-strat-field">
          <span class="sx-strat-field__lbl">Position size</span>
          <div class="sx-strat-field__row">
            <select class="sx-strat-select" data-sx-strat-size-type>
              <option value="fixed_risk">Risk % of equity</option>
              <option value="fixed_units">Fixed units</option>
              <option value="pct_equity">% of equity notional</option>
            </select>
            <input type="number" class="sx-strat-input sx-strat-input--num" data-sx-strat-size-val min="0" step="0.1" />
          </div>
        </label>
      </div>
    </section>
    <div class="sx-strat-builder__json-toggle">
      <button type="button" class="sx-strat-btn sx-strat-btn--ghost" data-sx-strat-json-toggle>View JSON</button>
    </div>
    <div class="sx-strat-builder__json" data-sx-strat-json-wrap hidden>
      <textarea class="sx-strat-json" data-sx-strat-json spellcheck="false" aria-label="Strategy JSON"></textarea>
      <button type="button" class="sx-strat-btn" data-sx-strat-json-apply>Apply JSON</button>
    </div>
    <div class="sx-strat-builder__actions">
      <button type="button" class="sx-strat-btn sx-strat-btn--ghost" data-sx-strat-duplicate>Duplicate</button>
      <button type="button" class="sx-strat-btn sx-strat-btn--danger" data-sx-strat-delete hidden>Delete</button>
      <span class="sx-strat-builder__actions-spacer"></span>
      ${opts.onRunBacktest ? '<button type="button" class="sx-strat-btn" data-sx-strat-run-backtest>Run backtest</button>' : ''}
      <button type="button" class="sx-strat-btn sx-strat-btn--primary" data-sx-strat-save>Save strategy</button>
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

  function readDraftFromForm() {
    draft.name = nameEl.value.trim() || 'Untitled strategy'
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
      <select class="sx-strat-select" data-sx-rule-lhs>${selectOptions(INDICATOR_OPTIONS, rule.lhs)}</select>
      <select class="sx-strat-select" data-sx-rule-op>${selectOptions(OPERATOR_OPTIONS, rule.op)}</select>
      <select class="sx-strat-select sx-strat-rule__rhs-kind" data-sx-rule-rhs-kind>
        <option value="indicator"${rhsIsInd ? ' selected' : ''}>Indicator</option>
        <option value="number"${!rhsIsInd ? ' selected' : ''}>Number</option>
      </select>
      <select class="sx-strat-select sx-strat-rule__rhs-ind" data-sx-rule-rhs-ind ${!rhsIsInd ? 'hidden' : ''}>${selectOptions(INDICATOR_OPTIONS, rhsInd)}</select>
      <input type="number" class="sx-strat-input sx-strat-input--num sx-strat-rule__rhs-num" data-sx-rule-rhs-num step="any" value="${rhsNum}" ${rhsIsInd ? 'hidden' : ''} />
      <button type="button" class="sx-strat-rule__remove" data-sx-rule-remove aria-label="Remove rule">×</button>
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
    btnSave.textContent = readonly ? 'Save as custom copy' : 'Save strategy'
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
      window.alert(err instanceof Error ? err.message : 'Invalid JSON')
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
      title: 'Delete strategy',
      message: `Delete strategy "${draft.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      danger: true,
    }).then((ok) => {
      if (!ok) return
      deleteCustomStrategy(draft.id)
      opts.onDelete?.(draft.id)
      loadStrategy(createBlankStrategy())
    })
  })

  paintForm()

  return {
    loadStrategy,
    getStrategy: () => structuredClone(draft),
    isReadonly: () => readonly,
    dispose: () => {
      opts.host.replaceChildren()
    },
  }
}
