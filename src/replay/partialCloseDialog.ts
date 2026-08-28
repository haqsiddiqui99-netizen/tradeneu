import type { OpenPosition } from './replayPositions'

type PartialCloseDialogOpts = {
  formatMoney: (value: number) => string
  onConfirm: (positionId: string, quantity: number) => void
}

const CHEVRON: Record<'up' | 'down', string> = {
  up: 'm3 7.5 4-4 4 4',
  down: 'm3 4.5 4 4 4-4',
}

function stepper(target: 'percent' | 'amount', noun: string): string {
  return (['up', 'down'] as const)
    .map(
      (dir) =>
        `<button type="button" tabindex="-1" data-rw-partial-step="${dir}" data-rw-partial-target="${target}" aria-label="${dir === 'up' ? 'Increase' : 'Decrease'} ${noun}"><svg viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${CHEVRON[dir]}"></path></svg></button>`,
    )
    .join('')
}

export function mountPartialCloseDialog(dialog: HTMLDialogElement, opts: PartialCloseDialogOpts) {
  let position: OpenPosition | null = null

  dialog.innerHTML = `
    <form method="dialog" class="rw-partial-close">
      <header class="rw-partial-close__head">
        <h2>Take partials</h2>
        <button type="button" class="rw-partial-close__x" data-rw-partial-close-x aria-label="Close">×</button>
      </header>
      <div class="rw-partial-close__body">
        <div class="rw-partial-close__basis" role="radiogroup" aria-label="Percentage basis">
          <label><input type="radio" name="rw-partial-basis" value="remaining" checked /> Use left amount on Position</label>
          <label><input type="radio" name="rw-partial-basis" value="original" /> Use original Position</label>
        </div>
        <div class="rw-partial-close__presets" aria-label="Percentage to close">
          ${[25, 50, 75, 100]
            .map(
              (value) =>
                `<button type="button" data-rw-partial-preset="${value}" class="${value === 100 ? 'rw-partial-close__preset--active' : ''}">${value === 100 ? '✓ ' : ''}${value}%</button>`,
            )
            .join('')}
        </div>
        <div class="rw-partial-close__fields">
          <label>
            <span>Percentage to close</span>
            <div>
              <b>%</b>
              <input type="number" data-rw-partial-percent min="0.01" max="100" step="0.01" value="100" />
              <span class="rw-partial-close__stepper">${stepper('percent', 'percentage')}</span>
            </div>
          </label>
          <label>
            <span>Amount to close (lots)</span>
            <div>
              <b>$</b>
              <input type="number" data-rw-partial-amount min="0.01" step="0.01" />
              <span class="rw-partial-close__stepper">${stepper('amount', 'lots')}</span>
            </div>
            <small data-rw-partial-max></small>
          </label>
        </div>
        <div class="rw-partial-close__summary">
          <p>Current position size: <strong data-rw-partial-current></strong></p>
          <p>Realized PnL: <span data-rw-partial-realized></span></p>
        </div>
      </div>
      <footer class="rw-partial-close__foot">
        <button type="button" class="rw-partial-close__discard" data-rw-partial-discard>Discard</button>
        <button type="submit" class="rw-partial-close__save">▣&nbsp; Save</button>
      </footer>
    </form>`

  const percentInput = dialog.querySelector('[data-rw-partial-percent]') as HTMLInputElement
  const amountInput = dialog.querySelector('[data-rw-partial-amount]') as HTMLInputElement
  const maxEl = dialog.querySelector('[data-rw-partial-max]') as HTMLElement
  const currentEl = dialog.querySelector('[data-rw-partial-current]') as HTMLElement
  const realizedEl = dialog.querySelector('[data-rw-partial-realized]') as HTMLElement

  function basisQuantity(): number {
    if (!position) return 0
    const basis = dialog.querySelector<HTMLInputElement>('input[name="rw-partial-basis"]:checked')?.value
    return basis === 'original' ? (position.initialQty ?? position.qty) : position.qty
  }

  function clampAmount(value: number): number {
    if (!position) return 0
    return Math.min(position.qty, Math.max(0.01, value))
  }

  function displayAmount(value: number): string {
    return Number(value.toFixed(2)).toString()
  }

  /** Percent drives lots. `rewriteSource` stays false while typing so the caret is not reset. */
  function syncFromPercent(rewriteSource = true) {
    if (!position) return
    const percent = Math.min(100, Math.max(0.01, Number(percentInput.value) || 0.01))
    if (rewriteSource) percentInput.value = displayAmount(percent)
    amountInput.value = displayAmount(clampAmount((basisQuantity() * percent) / 100))
    paintPreset(percent)
  }

  function syncFromAmount(rewriteSource = true) {
    if (!position) return
    const basis = basisQuantity()
    const amount = clampAmount(Number(amountInput.value) || 0.01)
    if (rewriteSource) amountInput.value = displayAmount(amount)
    const percent = basis > 0 ? Math.min(100, (amount / basis) * 100) : 0
    percentInput.value = displayAmount(percent)
    paintPreset(percent)
  }

  function paintPreset(percent: number) {
    dialog.querySelectorAll<HTMLElement>('[data-rw-partial-preset]').forEach((button) => {
      const value = Number(button.dataset.rwPartialPreset)
      const active = Math.abs(value - percent) < 0.001
      button.classList.toggle('rw-partial-close__preset--active', active)
      button.textContent = `${active ? '✓ ' : ''}${value}%`
    })
  }

  function close() {
    if (dialog.open) dialog.close()
    position = null
  }

  const onClick = (event: Event) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-rw-partial-close-x], [data-rw-partial-discard]')) {
      close()
      return
    }
    const preset = target.closest<HTMLElement>('[data-rw-partial-preset]')
    if (preset?.dataset.rwPartialPreset) {
      percentInput.value = preset.dataset.rwPartialPreset
      syncFromPercent()
      return
    }
    const step = target.closest<HTMLElement>('[data-rw-partial-step]')
    if (step) {
      const sign = step.dataset.rwPartialStep === 'up' ? 1 : -1
      if (step.dataset.rwPartialTarget === 'percent') {
        percentInput.value = displayAmount((Number(percentInput.value) || 0) + sign)
        syncFromPercent()
      } else {
        amountInput.value = displayAmount((Number(amountInput.value) || 0) + sign * 0.01)
        syncFromAmount()
      }
    }
  }

  const onInput = (event: Event) => {
    if (event.target === percentInput) syncFromPercent(false)
    if (event.target === amountInput) syncFromAmount(false)
  }

  const onChange = (event: Event) => {
    const target = event.target as HTMLInputElement
    if (target.name === 'rw-partial-basis') syncFromPercent()
  }

  /** Normalise whatever the user left in the field once focus moves away. */
  const onFocusOut = (event: FocusEvent) => {
    if (event.target === percentInput) syncFromPercent()
    if (event.target === amountInput) syncFromAmount()
  }

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault()
    if (!position) return
    const id = position.id
    const amount = clampAmount(Number(amountInput.value))
    close()
    opts.onConfirm(id, amount)
  }

  const onDialogClick = (event: MouseEvent) => {
    if (event.target === dialog) close()
  }

  dialog.addEventListener('click', onClick)
  dialog.addEventListener('input', onInput)
  dialog.addEventListener('change', onChange)
  dialog.addEventListener('focusout', onFocusOut)
  dialog.addEventListener('submit', onSubmit)
  dialog.addEventListener('click', onDialogClick)

  return {
    open(nextPosition: OpenPosition) {
      position = { ...nextPosition }
      dialog.querySelector<HTMLInputElement>('input[value="remaining"]')!.checked = true
      percentInput.value = '100'
      amountInput.max = String(position.qty)
      maxEl.textContent = `Max: ${displayAmount(position.qty)} lots`
      currentEl.textContent = `${displayAmount(position.qty)} lots`
      realizedEl.textContent = opts.formatMoney(position.realizedPnL ?? 0)
      syncFromPercent()
      if (!dialog.open) dialog.showModal()
    },
    destroy() {
      dialog.removeEventListener('click', onClick)
      dialog.removeEventListener('input', onInput)
      dialog.removeEventListener('change', onChange)
      dialog.removeEventListener('focusout', onFocusOut)
      dialog.removeEventListener('submit', onSubmit)
      dialog.removeEventListener('click', onDialogClick)
    },
  }
}
