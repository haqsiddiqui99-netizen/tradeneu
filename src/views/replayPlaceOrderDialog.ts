import './replayPlaceOrderDialog.css'
import { icons } from '../icons'
import type { PendingOrderKind, PositionDirection, TakeProfitTarget } from '../replay/replayPositions'
import {
  lotsForRiskAmount,
  priceDistanceInPips,
  priceFromPips,
  riskAmountForLots,
  type ReplayInstrumentSizing,
} from '../replay/replayInstrumentSizing'
import { syncChartThemeToElement } from '../styles/syncChartTheme'

export type ReplayPlaceOrderDraft = {
  direction: PositionDirection
  kind: PendingOrderKind
  qty: number
  triggerPrice: number
  stopLoss: number | null
  takeProfit: number | null
  takeProfitTargets: TakeProfitTarget[]
  autoBreakEven: boolean
  openPendingTab: boolean
}

type OpenInput = {
  direction: PositionDirection
  kind: PendingOrderKind
  qty: number
  currentPrice: number
  equity: number
  initialBalance: number
  sizing: ReplayInstrumentSizing
  canUseAutoBreakEven: boolean
}

type PartialDraft = { id: number; price: number; percent: number }

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const num = (value: number, digits = 5) =>
  Number.isFinite(value) ? String(Number(value.toFixed(digits))) : '0'

/**
 * Number input with the trade bar's arrow column. `stepSize` is the stepper increment,
 * independent of the input's `step` (which only governs typed precision); `pip` resolves
 * to the instrument pip size so price fields move one pip per click.
 */
const numberField = (options: {
  attrs: string
  label: string
  stepSize: string
  prefix?: string
}) => `
  <div class="rw-place-order__field">
    ${options.prefix ? `<b aria-hidden="true">${options.prefix}</b>` : ''}
    <input type="number" ${options.attrs} data-po-step-size="${options.stepSize}" />
    <span class="rw-place-order__stepper">
      <button type="button" class="rw-place-order__step" data-po-step="up" aria-label="Increase ${options.label}" tabindex="-1">${icons.chevronUp}</button>
      <button type="button" class="rw-place-order__step" data-po-step="down" aria-label="Decrease ${options.label}" tabindex="-1">${icons.chevronDown}</button>
    </span>
  </div>
`

/**
 * Styled stand-in for a native `<select>`, whose dropdown list the browser renders with its
 * own chrome. The hidden select stays the source of truth so `value` and `change` keep
 * working; the trigger and listbox carry the ticket's styling.
 */
const selectField = (options: {
  key: string
  attrs: string
  label: string
  choices: Array<{ value: string; label: string }>
}) => `
  <span class="rw-place-order__select" data-po-select="${options.key}">
    <select ${options.attrs} aria-label="${options.label}" hidden>
      ${options.choices.map((choice) => `<option value="${choice.value}">${choice.label}</option>`).join('')}
    </select>
    <button
      type="button"
      class="rw-place-order__select-trigger"
      data-po-select-trigger="${options.key}"
      aria-haspopup="listbox"
      aria-expanded="false"
    >
      <span data-po-select-text="${options.key}">${options.choices[0]?.label ?? ''}</span>
      ${icons.chevronDown}
    </button>
    <span class="rw-place-order__select-menu" data-po-select-menu="${options.key}" role="listbox" hidden>
      ${options.choices
        .map(
          (choice, index) => `
        <button
          type="button"
          role="option"
          data-po-select-key="${options.key}"
          data-po-select-option="${choice.value}"
          aria-selected="${index === 0 ? 'true' : 'false'}"
        >${choice.label}</button>
      `,
        )
        .join('')}
    </span>
  </span>
`

export function createReplayPlaceOrderDialog(opts: {
  onSubmit: (draft: ReplayPlaceOrderDraft) => boolean
}) {
  const dlg = document.createElement('dialog')
  dlg.className = 'rw-place-order-dlg'
  dlg.setAttribute('aria-labelledby', 'rw-place-order-title')
  dlg.innerHTML = `
    <form class="rw-place-order" method="dialog">
      <header class="rw-place-order__head">
        <h2 id="rw-place-order-title">Place Order</h2>
        <div>
          <button type="button" class="rw-place-order__preset" data-po-preset>Preset</button>
          <button type="button" class="rw-place-order__x" data-po-close aria-label="Close">×</button>
        </div>
      </header>
      <div class="rw-place-order__body">
        <section class="rw-place-order__risk" data-po-risk hidden>
          <div class="rw-place-order__balance-mode" role="radiogroup" aria-label="Risk balance basis">
            <label><input type="radio" name="po-balance" value="initial" /> Initial Balance</label>
            <label><input type="radio" name="po-balance" value="current" checked /> Current Balance</label>
          </div>
          <p class="rw-place-order__estimated">Estimated Loss <strong data-po-estimated>$0.00</strong></p>
          <span class="rw-place-order__risk-label">Set risk percentage</span>
          <div class="rw-place-order__risk-presets">
            ${[0.3, 0.5, 0.7, 1, 2, 3]
              .map((value) => `<button type="button" data-po-risk-preset="${value}">${value}%</button>`)
              .join('')}
          </div>
          <div class="rw-place-order__grid">
            <label>Risk Percent
              ${numberField({
                attrs: 'min="0.01" step="0.01" value="1" data-po-risk-percent',
                label: 'Risk Percent',
                stepSize: '0.1',
                prefix: '%',
              })}
            </label>
            <label>Risk Amount
              ${numberField({
                attrs: 'min="0.01" step="0.01" data-po-risk-amount',
                label: 'Risk Amount',
                stepSize: '10',
                prefix: '$',
              })}
            </label>
          </div>
        </section>

        <section class="rw-place-order__main" data-po-main>
          <div class="rw-place-order__grid" data-po-order-fields>
            <label>Side
              ${selectField({
                key: 'side',
                attrs: 'data-po-side',
                label: 'Side',
                choices: [
                  { value: 'long', label: 'Buy' },
                  { value: 'short', label: 'Sell' },
                ],
              })}
            </label>
            <label>Type
              ${selectField({
                key: 'type',
                attrs: 'data-po-type',
                label: 'Type',
                choices: [
                  { value: 'limit', label: 'Limit' },
                  { value: 'stop', label: 'Stop' },
                ],
              })}
            </label>
            <label>Position Size (Lots) *
              ${numberField({
                attrs: 'min="0.01" step="0.01" data-po-qty',
                label: 'Position Size',
                stepSize: '0.01',
              })}
            </label>
            <label>Entry Price *
              ${numberField({
                attrs: 'min="0.00001" step="0.00001" data-po-entry',
                label: 'Entry Price',
                stepSize: 'pip',
              })}
            </label>
          </div>

          <section class="rw-place-order__toggle-card" data-po-sl-card>
            <button type="button" class="rw-place-order__switch" role="switch" aria-checked="false" data-po-toggle="sl"><span></span></button>
            <strong>Stop Loss</strong>
          </section>
          <div class="rw-place-order__expand" data-po-sl-fields hidden>
            <div class="rw-place-order__grid">
              <label>Stop Loss *
                ${numberField({
                  attrs: 'min="0.00001" step="0.00001" data-po-sl-price',
                  label: 'Stop Loss price',
                  stepSize: 'pip',
                })}
              </label>
              <label>Stop Loss in pips *
                ${numberField({
                  attrs: 'min="0.01" step="0.01" data-po-sl-pips',
                  label: 'Stop Loss pips',
                  stepSize: '1',
                })}
              </label>
            </div>
          </div>

          <section class="rw-place-order__toggle-card" data-po-tp-card>
            <button type="button" class="rw-place-order__switch" role="switch" aria-checked="false" data-po-toggle="tp"><span></span></button>
            <strong>Take Profit</strong>
          </section>
          <div class="rw-place-order__expand" data-po-tp-fields hidden>
            <div class="rw-place-order__grid">
              <label>Take Profit *
                ${numberField({
                  attrs: 'min="0.00001" step="0.00001" data-po-tp-price',
                  label: 'Take Profit price',
                  stepSize: 'pip',
                })}
              </label>
              <label>Take Profit in pips *
                ${numberField({
                  attrs: 'min="0.01" step="0.01" data-po-tp-pips',
                  label: 'Take Profit pips',
                  stepSize: '1',
                })}
              </label>
            </div>
            <button type="button" class="rw-place-order__add-partial" data-po-add-partial>Add Partial <b>＋</b></button>
          </div>

          <section class="rw-place-order__partials" data-po-partials hidden>
            <div class="rw-place-order__partials-head">
              <button type="button" data-po-partials-back>${icons.chartNavLeft}</button>
              <strong>Partial profits</strong>
              <span data-po-partial-total>100 / 100%</span>
            </div>
            <div data-po-partial-list></div>
            <button type="button" class="rw-place-order__add-partial" data-po-add-row>Add Partial <b>＋</b></button>
          </section>

          <section class="rw-place-order__toggle-card rw-place-order__toggle-card--break-even" data-po-be-card>
            <button type="button" class="rw-place-order__switch" role="switch" aria-checked="false" data-po-toggle="be"><span></span></button>
            <strong>Auto Break-even</strong>
            <span class="rw-place-order__pro">Premium</span>
          </section>
        </section>
        <p class="rw-place-order__error" data-po-error role="alert" hidden></p>
      </div>
      <footer class="rw-place-order__foot">
        <label class="rw-place-order__journal"><input type="checkbox" data-po-journal /> Open journal after placing an order</label>
        <div>
          <button type="button" class="rw-place-order__discard" data-po-close>Discard</button>
          <button type="submit" class="rw-place-order__save">${icons.floppyDisk}<span>Save</span></button>
        </div>
      </footer>
    </form>
  `
  document.body.appendChild(dlg)

  let context: OpenInput | null = null
  let nextPartialId = 1
  let partials: PartialDraft[] = []
  let partialMode = false

  const q = <T extends Element>(selector: string) => dlg.querySelector<T>(selector)!
  const side = q<HTMLSelectElement>('[data-po-side]')
  const type = q<HTMLSelectElement>('[data-po-type]')
  const styledSelects: Record<string, HTMLSelectElement> = { side, type }
  const qty = q<HTMLInputElement>('[data-po-qty]')
  const entry = q<HTMLInputElement>('[data-po-entry]')
  const slPrice = q<HTMLInputElement>('[data-po-sl-price]')
  const slPips = q<HTMLInputElement>('[data-po-sl-pips]')
  const tpPrice = q<HTMLInputElement>('[data-po-tp-price]')
  const tpPips = q<HTMLInputElement>('[data-po-tp-pips]')
  const riskPercent = q<HTMLInputElement>('[data-po-risk-percent]')
  const riskAmount = q<HTMLInputElement>('[data-po-risk-amount]')
  const estimated = q<HTMLElement>('[data-po-estimated]')
  const riskSection = q<HTMLElement>('[data-po-risk]')
  const main = q<HTMLElement>('[data-po-main]')
  const partialSection = q<HTMLElement>('[data-po-partials]')
  const partialList = q<HTMLElement>('[data-po-partial-list]')
  const partialTotal = q<HTMLElement>('[data-po-partial-total]')
  const error = q<HTMLElement>('[data-po-error]')
  const journal = q<HTMLInputElement>('[data-po-journal]')

  const switchEl = (key: 'sl' | 'tp' | 'be') =>
    q<HTMLButtonElement>(`[data-po-toggle="${key}"]`)
  const isOn = (key: 'sl' | 'tp' | 'be') => switchEl(key).getAttribute('aria-checked') === 'true'
  const setOn = (key: 'sl' | 'tp' | 'be', value: boolean) =>
    switchEl(key).setAttribute('aria-checked', value ? 'true' : 'false')

  function direction(): PositionDirection {
    return side.value === 'short' ? 'short' : 'long'
  }

  function sizing(): ReplayInstrumentSizing {
    return context?.sizing ?? { contractSize: 1, pipSize: 0.001, marginRate: 0.05 }
  }

  function showError(message = '') {
    error.textContent = message
    error.hidden = !message
  }

  function paintStyledSelect(key: string) {
    const select = styledSelects[key]
    if (!select) return
    const text = dlg.querySelector<HTMLElement>(`[data-po-select-text="${key}"]`)
    if (text) text.textContent = select.selectedOptions[0]?.textContent ?? ''
    dlg
      .querySelectorAll<HTMLButtonElement>(`[data-po-select-key="${key}"]`)
      .forEach((option) => {
        option.setAttribute(
          'aria-selected',
          option.dataset.poSelectOption === select.value ? 'true' : 'false',
        )
      })
  }

  function closeSelectMenus() {
    dlg.querySelectorAll<HTMLElement>('[data-po-select-menu]').forEach((menu) => {
      menu.hidden = true
    })
    dlg.querySelectorAll<HTMLElement>('[data-po-select-trigger]').forEach((trigger) => {
      trigger.setAttribute('aria-expanded', 'false')
    })
  }

  /** Nudge a field by its stepper increment, then let the normal input flow re-sync. */
  function stepField(input: HTMLInputElement, direction: 'up' | 'down') {
    const raw = input.dataset.poStepSize ?? '1'
    const size = raw === 'pip' ? sizing().pipSize : Number(raw)
    if (!(size > 0)) return
    const min = input.min === '' ? null : Number(input.min)
    const max = input.max === '' ? null : Number(input.max)
    const current = Number(input.value)
    const base = Number.isFinite(current) ? current : (min ?? 0)
    let next = direction === 'up' ? base + size : base - size
    if (min != null && next < min) next = min
    if (max != null && next > max) next = max
    input.value = num(next)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function balanceBasis(): number {
    const basis = q<HTMLInputElement>('input[name="po-balance"]:checked').value
    return basis === 'initial' ? (context?.initialBalance ?? 0) : (context?.equity ?? 0)
  }

  function refreshRisk(source: 'percent' | 'amount' | 'stop' | 'qty' = 'stop') {
    const entryValue = Number(entry.value)
    const stopValue = Number(slPrice.value)
    const lots = Number(qty.value)
    if (!(entryValue > 0) || !(stopValue > 0)) return
    if (source === 'percent') {
      riskAmount.value = num((balanceBasis() * Number(riskPercent.value || 0)) / 100, 2)
    } else if (source === 'amount') {
      riskPercent.value = num((Number(riskAmount.value || 0) / balanceBasis()) * 100, 2)
    } else if (source === 'qty') {
      const risk = riskAmountForLots(lots, entryValue, stopValue, sizing())
      riskAmount.value = num(risk, 2)
      riskPercent.value = num((risk / balanceBasis()) * 100, 2)
    }
    // Risk sizing owns the lot field only while the preset panel is open. Otherwise the
    // quantity the ticket opened with (the footer box) must survive Stop Loss edits.
    if (source !== 'qty' && !riskSection.hidden) {
      qty.value = num(
        lotsForRiskAmount(Number(riskAmount.value), entryValue, stopValue, sizing()),
        2,
      )
    }
    estimated.textContent = money(
      riskAmountForLots(Number(qty.value), entryValue, stopValue, sizing()),
    )
    paintRiskPresets()
  }

  function syncProtection(kind: 'sl' | 'tp', source: 'price' | 'pips') {
    const entryValue = Number(entry.value)
    const priceInput = kind === 'sl' ? slPrice : tpPrice
    const pipsInput = kind === 'sl' ? slPips : tpPips
    if (!(entryValue > 0)) return
    if (source === 'pips') {
      priceInput.value = num(
        priceFromPips(
          entryValue,
          Number(pipsInput.value),
          direction(),
          kind === 'sl' ? 'stopLoss' : 'takeProfit',
          sizing(),
        ),
      )
    } else {
      pipsInput.value = num(
        priceDistanceInPips(entryValue, Number(priceInput.value), sizing()),
        2,
      )
    }
    if (kind === 'sl') refreshRisk('stop')
  }

  function paintRiskPresets() {
    const current = Number(riskPercent.value)
    dlg.querySelectorAll<HTMLButtonElement>('[data-po-risk-preset]').forEach((button) => {
      button.classList.toggle(
        'rw-place-order__risk-preset--active',
        Math.abs(Number(button.dataset.poRiskPreset) - current) < 0.001,
      )
    })
  }

  function paintExpanded() {
    q<HTMLElement>('[data-po-sl-fields]').hidden = !isOn('sl')
    q<HTMLElement>('[data-po-tp-fields]').hidden = !isOn('tp') || partialMode
    q<HTMLElement>('[data-po-sl-card]').classList.toggle('rw-place-order__toggle-card--on', isOn('sl'))
    q<HTMLElement>('[data-po-tp-card]').classList.toggle('rw-place-order__toggle-card--on', isOn('tp'))
    if (!isOn('sl')) setOn('be', false)
  }

  function renderPartials() {
    partialList.innerHTML = partials
      .map((partial, index) => {
        const pips = priceDistanceInPips(Number(entry.value), partial.price, sizing())
        return `<div class="rw-place-order__partial" data-po-partial="${partial.id}">
          <label>Price${numberField({
            attrs: `step="0.00001" value="${num(partial.price)}" data-po-partial-price`,
            label: `Partial ${index + 1} price`,
            stepSize: 'pip',
            prefix: '$',
          })}</label>
          <label>Pips${numberField({
            attrs: `min="0.01" step="0.01" value="${num(pips, 2)}" data-po-partial-pips`,
            label: `Partial ${index + 1} pips`,
            stepSize: '1',
            prefix: '▦',
          })}</label>
          <label>Partial profit %${numberField({
            attrs: `min="0.01" max="100" step="0.01" value="${num(partial.percent, 2)}" data-po-partial-percent`,
            label: `Partial ${index + 1} percent`,
            stepSize: '5',
            prefix: '%',
          })}
            <span class="rw-place-order__partial-presets">${[10, 25, 50].map((value) => `<button type="button" data-po-partial-preset="${value}">${value}%</button>`).join('')}</span>
          </label>
          <button type="button" class="rw-place-order__delete" data-po-partial-delete aria-label="Delete partial ${index + 1}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13M8 3.5h4l1 2H7l1-2Zm-2 2 .7 11h6.6l.7-11M8.3 8v5.5M11.7 8v5.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>`
      })
      .join('')
    const total = partials.reduce((sum, partial) => sum + partial.percent, 0)
    partialTotal.textContent = `${num(total, 2)} / 100%`
    partialTotal.classList.toggle('rw-place-order__partial-total--bad', Math.abs(total - 100) > 0.001)
  }

  function enterPartialMode() {
    if (!partials.length) {
      const first = Number(tpPrice.value)
      const pips = Math.max(1, Number(tpPips.value) || 10)
      partials = [
        { id: nextPartialId++, price: first, percent: 50 },
        {
          id: nextPartialId++,
          price: priceFromPips(Number(entry.value), pips * 2, direction(), 'takeProfit', sizing()),
          percent: 50,
        },
      ]
    }
    partialMode = true
    q<HTMLElement>('[data-po-order-fields]').hidden = true
    riskSection.hidden = true
    main.querySelector<HTMLElement>('[data-po-sl-fields]')!.hidden = true
    main.querySelector<HTMLElement>('[data-po-tp-fields]')!.hidden = true
    q<HTMLElement>('[data-po-sl-card]').hidden = true
    q<HTMLElement>('[data-po-tp-card]').hidden = true
    partialSection.hidden = false
    renderPartials()
  }

  function leavePartialMode() {
    partialMode = false
    q<HTMLElement>('[data-po-order-fields]').hidden = false
    q<HTMLElement>('[data-po-sl-card]').hidden = false
    q<HTMLElement>('[data-po-tp-card]').hidden = false
    partialSection.hidden = true
    riskSection.hidden = !isOn('sl')
    paintExpanded()
  }

  function validate(): ReplayPlaceOrderDraft | null {
    const directionValue = direction()
    const kind = type.value === 'stop' ? 'stop' : 'limit'
    const entryValue = Number(entry.value)
    const qtyValue = Number(qty.value)
    if (!(qtyValue >= 0.01)) return showError('Position Size must be at least 0.01 lots.'), null
    if (!(entryValue > 0)) return showError('Enter a valid Entry Price.'), null
    const current = context?.currentPrice ?? entryValue
    const validEntry =
      directionValue === 'long'
        ? kind === 'limit'
          ? entryValue < current
          : entryValue > current
        : kind === 'limit'
          ? entryValue > current
          : entryValue < current
    if (!validEntry) {
      const relation =
        directionValue === 'long'
          ? kind === 'limit'
            ? 'below'
            : 'above'
          : kind === 'limit'
            ? 'above'
            : 'below'
      return showError(`${directionValue === 'long' ? 'Buy' : 'Sell'} ${kind} Entry Price must be ${relation} current price.`), null
    }
    const stop = isOn('sl') ? Number(slPrice.value) : null
    if (stop != null && !(directionValue === 'long' ? stop < entryValue : stop > entryValue)) {
      return showError(`Stop Loss must be ${directionValue === 'long' ? 'below' : 'above'} Entry Price.`), null
    }
    let takeProfit = isOn('tp') ? Number(tpPrice.value) : null
    let targets: TakeProfitTarget[] = []
    if (isOn('tp') && partialMode) {
      const total = partials.reduce((sum, partial) => sum + partial.percent, 0)
      if (Math.abs(total - 100) > 0.001) return showError('Partial profit percentages must total 100%.'), null
      if (
        partials.some(
          (partial) =>
            !(partial.percent > 0) ||
            !(directionValue === 'long' ? partial.price > entryValue : partial.price < entryValue),
        )
      ) {
        return showError('Every partial Take Profit must be valid for the selected side.'), null
      }
      targets = partials.map((partial) => ({
        id: `tp-${partial.id}`,
        price: partial.price,
        percent: partial.percent,
      }))
      targets.sort((a, b) => (directionValue === 'long' ? a.price - b.price : b.price - a.price))
      takeProfit = targets[0]?.price ?? null
    } else if (
      takeProfit != null &&
      !(directionValue === 'long' ? takeProfit > entryValue : takeProfit < entryValue)
    ) {
      return showError(`Take Profit must be ${directionValue === 'long' ? 'above' : 'below'} Entry Price.`), null
    }
    return {
      direction: directionValue,
      kind,
      qty: Math.round(qtyValue * 100) / 100,
      triggerPrice: entryValue,
      stopLoss: stop,
      takeProfit,
      takeProfitTargets: targets,
      autoBreakEven: isOn('be') && !!context?.canUseAutoBreakEven && stop != null,
      openPendingTab: journal.checked,
    }
  }

  function close() {
    if (dlg.open) dlg.close()
  }

  function onClick(event: Event) {
    const target = event.target as HTMLElement
    if (target.closest('[data-po-close]')) return close()
    const option = target.closest<HTMLButtonElement>('[data-po-select-option]')
    if (option) {
      const key = option.dataset.poSelectKey ?? ''
      const select = styledSelects[key]
      closeSelectMenus()
      if (select && option.dataset.poSelectOption) {
        select.value = option.dataset.poSelectOption
        paintStyledSelect(key)
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
      return
    }
    const selectTrigger = target.closest<HTMLButtonElement>('[data-po-select-trigger]')
    if (selectTrigger) {
      const key = selectTrigger.dataset.poSelectTrigger ?? ''
      const menu = dlg.querySelector<HTMLElement>(`[data-po-select-menu="${key}"]`)
      const opening = !!menu?.hidden
      closeSelectMenus()
      if (menu && opening) {
        menu.hidden = false
        selectTrigger.setAttribute('aria-expanded', 'true')
      }
      return
    }
    closeSelectMenus()
    const stepBtn = target.closest<HTMLButtonElement>('[data-po-step]')
    if (stepBtn) {
      const input = stepBtn
        .closest('.rw-place-order__field')
        ?.querySelector<HTMLInputElement>('input')
      if (input && !input.disabled) {
        stepField(input, stepBtn.dataset.poStep === 'down' ? 'down' : 'up')
      }
      return
    }
    const toggle = target.closest<HTMLButtonElement>('[data-po-toggle]')
    if (toggle && !toggle.disabled) {
      const key = toggle.dataset.poToggle as 'sl' | 'tp' | 'be'
      if (key === 'be' && !isOn('sl')) return showError('Enable Stop Loss before Auto Break-even.')
      setOn(key, !isOn(key))
      if (key === 'sl') {
        riskSection.hidden = !isOn('sl')
        if (isOn('sl')) {
          syncProtection('sl', 'pips')
          refreshRisk('percent')
        }
      }
      if (key === 'tp' && isOn('tp')) syncProtection('tp', 'pips')
      paintExpanded()
      showError()
      return
    }
    if (target.closest('[data-po-preset]')) {
      const opening = riskSection.hidden
      if (opening && !isOn('sl')) {
        setOn('sl', true)
        syncProtection('sl', 'pips')
        paintExpanded()
      }
      riskSection.hidden = !opening
      q<HTMLElement>('[data-po-preset]').classList.toggle('rw-place-order__preset--on', !riskSection.hidden)
      if (!riskSection.hidden) refreshRisk('percent')
      return
    }
    const preset = target.closest<HTMLButtonElement>('[data-po-risk-preset]')
    if (preset) {
      riskPercent.value = preset.dataset.poRiskPreset ?? '1'
      refreshRisk('percent')
      return
    }
    if (target.closest('[data-po-add-partial]')) return enterPartialMode()
    if (target.closest('[data-po-partials-back]')) return leavePartialMode()
    if (target.closest('[data-po-add-row]')) {
      const previous = partials.at(-1)
      const pips = previous
        ? priceDistanceInPips(Number(entry.value), previous.price, sizing()) + 10
        : 10
      partials.push({
        id: nextPartialId++,
        price: priceFromPips(Number(entry.value), pips, direction(), 'takeProfit', sizing()),
        percent: 0,
      })
      return renderPartials()
    }
    const row = target.closest<HTMLElement>('[data-po-partial]')
    if (row) {
      const draft = partials.find((item) => item.id === Number(row.dataset.poPartial))
      if (!draft) return
      if (target.closest('[data-po-partial-delete]')) {
        if (partials.length > 1) partials = partials.filter((item) => item !== draft)
        return renderPartials()
      }
      const partialPreset = target.closest<HTMLButtonElement>('[data-po-partial-preset]')
      if (partialPreset) {
        draft.percent = Number(partialPreset.dataset.poPartialPreset)
        return renderPartials()
      }
    }
  }

  function onInput(event: Event) {
    const target = event.target as HTMLInputElement
    if (target === slPrice) syncProtection('sl', 'price')
    else if (target === slPips) syncProtection('sl', 'pips')
    else if (target === tpPrice) syncProtection('tp', 'price')
    else if (target === tpPips) syncProtection('tp', 'pips')
    else if (target === riskPercent) refreshRisk('percent')
    else if (target === riskAmount) refreshRisk('amount')
    else if (target === qty && !riskSection.hidden) refreshRisk('qty')
    else if (target === entry) {
      if (isOn('sl')) syncProtection('sl', 'pips')
      if (isOn('tp')) syncProtection('tp', 'pips')
    }
    const row = target.closest<HTMLElement>('[data-po-partial]')
    if (row) {
      const draft = partials.find((item) => item.id === Number(row.dataset.poPartial))
      if (!draft) return
      if (target.matches('[data-po-partial-price]')) {
        draft.price = Number(target.value)
        const pipsInput = row.querySelector<HTMLInputElement>('[data-po-partial-pips]')
        if (pipsInput) pipsInput.value = num(priceDistanceInPips(Number(entry.value), draft.price, sizing()), 2)
      } else if (target.matches('[data-po-partial-pips]')) {
        draft.price = priceFromPips(Number(entry.value), Number(target.value), direction(), 'takeProfit', sizing())
        const priceInput = row.querySelector<HTMLInputElement>('[data-po-partial-price]')
        if (priceInput) priceInput.value = num(draft.price)
      } else if (target.matches('[data-po-partial-percent]')) {
        draft.percent = Number(target.value)
        const total = partials.reduce((sum, partial) => sum + partial.percent, 0)
        partialTotal.textContent = `${num(total, 2)} / 100%`
        partialTotal.classList.toggle('rw-place-order__partial-total--bad', Math.abs(total - 100) > 0.001)
      }
    }
    showError()
  }

  function onChange(event: Event) {
    const target = event.target as HTMLInputElement | HTMLSelectElement
    if (target instanceof HTMLInputElement && target.name === 'po-balance') refreshRisk('percent')
    if (target === side || target === type) {
      if (isOn('sl')) syncProtection('sl', 'pips')
      if (isOn('tp')) syncProtection('tp', 'pips')
    }
  }

  function onSubmit(event: SubmitEvent) {
    event.preventDefault()
    const draft = validate()
    if (draft && opts.onSubmit(draft)) close()
  }

  dlg.addEventListener('click', onClick)
  dlg.addEventListener('input', onInput)
  dlg.addEventListener('change', onChange)
  dlg.addEventListener('submit', onSubmit)
  dlg.addEventListener('cancel', (event) => {
    event.preventDefault()
    close()
  })

  return {
    open(input: OpenInput) {
      context = input
      syncChartThemeToElement(dlg)
      side.value = input.direction
      type.value = input.kind
      paintStyledSelect('side')
      paintStyledSelect('type')
      closeSelectMenus()
      qty.value = num(Math.max(0.01, input.qty), 2)
      const relation = input.direction === 'long' ? 1 : -1
      const kindSign = input.kind === 'limit' ? -relation : relation
      entry.value = num(input.currentPrice + kindSign * input.sizing.pipSize * 10)
      slPips.value = '10'
      tpPips.value = '20'
      setOn('sl', false)
      setOn('tp', false)
      setOn('be', false)
      switchEl('be').disabled = !input.canUseAutoBreakEven
      q<HTMLElement>('[data-po-be-card]').classList.toggle(
        'rw-place-order__toggle-card--locked',
        !input.canUseAutoBreakEven,
      )
      riskSection.hidden = true
      q<HTMLElement>('[data-po-preset]').classList.remove('rw-place-order__preset--on')
      journal.checked = false
      partials = []
      partialMode = false
      leavePartialMode()
      syncProtection('sl', 'pips')
      syncProtection('tp', 'pips')
      riskPercent.value = '1'
      refreshRisk('percent')
      showError()
      if (!dlg.open) dlg.showModal()
    },
    close,
    dispose() {
      close()
      dlg.removeEventListener('click', onClick)
      dlg.removeEventListener('input', onInput)
      dlg.removeEventListener('change', onChange)
      dlg.removeEventListener('submit', onSubmit)
      dlg.remove()
    },
  }
}
