export type CheckoutPlan = 'intermediate' | 'pro'
export type CheckoutCycle = 'monthly' | 'yearly'
export type CheckoutPaymentMethod = 'upi' | 'card' | 'paypal'

export type CheckoutOrder = {
  plan: CheckoutPlan
  cycle: CheckoutCycle
  amount: number
  baseAmount: number
  taxAmount: number
  taxRate: number
  total: number
  couponCode: string | null
  discountPct: number
}

/** Demo GST / sales tax applied at checkout. */
const TAX_RATE = 0.18

const YEARLY_TOTAL = { intermediate: 84, pro: 180 } as const
const MONTHLY_TOTAL = { intermediate: 9, pro: 19 } as const

const COUPONS: Record<string, number> = {
  SAVE10: 10,
  WELCOME20: 20,
  TRADENEU15: 15,
}

const COUNTRIES = [
  'India',
  'United States',
  'United Kingdom',
  'United Arab Emirates',
  'Singapore',
  'Australia',
  'Canada',
  'Germany',
] as const

const INDIA_STATES = [
  'Andhra Pradesh',
  'Delhi',
  'Gujarat',
  'Karnataka',
  'Kerala',
  'Maharashtra',
  'Rajasthan',
  'Tamil Nadu',
  'Telangana',
  'Uttar Pradesh',
  'West Bengal',
] as const

export function planDisplayName(plan: CheckoutPlan): string {
  return plan === 'pro' ? 'Pro Max' : 'Pro'
}

export function planFullLabel(plan: CheckoutPlan): string {
  return plan === 'pro' ? 'Tradeneu Pro Max' : 'Tradeneu Pro'
}

export function baseCheckoutAmount(plan: CheckoutPlan, cycle: CheckoutCycle): number {
  return cycle === 'yearly' ? YEARLY_TOTAL[plan] : MONTHLY_TOTAL[plan]
}

export function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`
}

export function resolveCoupon(raw: string): { code: string; pct: number } | null {
  const code = raw.trim().toUpperCase()
  if (!code) return null
  const pct = COUPONS[code]
  if (!pct) return null
  return { code, pct }
}

export function applyDiscount(base: number, pct: number): number {
  if (pct <= 0) return base
  return Math.round(base * (100 - pct)) / 100
}

export function calcTax(subtotal: number, rate = TAX_RATE): number {
  return Math.round(subtotal * rate * 100) / 100
}

export function cycleLabel(cycle: CheckoutCycle): string {
  return cycle === 'yearly' ? 'Yearly' : 'Monthly'
}

export type MountCheckoutOverlayOptions = {
  onComplete: (order: CheckoutOrder, method: CheckoutPaymentMethod) => void
  onDismissAfterComplete?: () => void
}

/**
 * Checkout: order summary + billing address + accordion payment methods (single scroll).
 */
export function createCheckoutOverlay(opts: MountCheckoutOverlayOptions): {
  el: HTMLElement
  open: (plan: CheckoutPlan, cycle: CheckoutCycle) => void
  close: () => void
  dispose: () => void
} {
  let plan: CheckoutPlan = 'intermediate'
  let cycle: CheckoutCycle = 'monthly'
  let baseAmount = 9
  let discountPct = 0
  let couponCode: string | null = null
  let method: CheckoutPaymentMethod = 'upi'
  let completed = false

  const el = document.createElement('div')
  el.className = 'sx-checkout'
  el.hidden = true
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'true')
  el.setAttribute('aria-label', 'Upgrade checkout')
  el.innerHTML = `
    <div class="sx-checkout__backdrop" data-sx-checkout-close></div>
    <div class="sx-checkout__shell" data-sx-checkout-shell>
      <header class="sx-checkout__top">
        <div class="sx-checkout__brand">
          <span class="sx-checkout__logo" aria-hidden="true">TN</span>
          <div>
            <p class="sx-checkout__product">Tradeneu checkout</p>
            <p class="sx-checkout__eyebrow" data-sx-checkout-order-line>Pro · $19.00 · Monthly</p>
          </div>
        </div>
        <button type="button" class="sx-checkout__x" data-sx-checkout-close aria-label="Close checkout">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </header>

      <div class="sx-checkout__scroll" data-sx-checkout-view="pay">
        <div class="sx-checkout__order-bar">
          <div>
            <p class="sx-checkout__order-kicker">Your order</p>
            <p class="sx-checkout__order-plan" data-sx-checkout-plan>Tradeneu Pro Max</p>
          </div>
          <div class="sx-checkout__order-price-wrap">
            <p class="sx-checkout__price" data-sx-checkout-price>$19.00</p>
            <p class="sx-checkout__was" data-sx-checkout-was hidden></p>
          </div>
        </div>

        <div class="sx-checkout__totals" aria-label="Price breakdown">
          <div class="sx-checkout__totals-row">
            <span>Subtotal</span>
            <strong data-sx-checkout-subtotal>$19.00</strong>
          </div>
          <div class="sx-checkout__totals-row">
            <span>Tax (GST ${(TAX_RATE * 100).toFixed(0)}%)</span>
            <strong data-sx-checkout-tax>$3.42</strong>
          </div>
          <div class="sx-checkout__totals-row sx-checkout__totals-row--total">
            <span>Total due</span>
            <strong data-sx-checkout-total>$22.42</strong>
          </div>
        </div>

        <label class="sx-checkout__coupon">
          <i class="fa-solid fa-ticket sx-checkout__coupon-icon" aria-hidden="true"></i>
          <input type="text" placeholder="Coupon code" autocomplete="off" spellcheck="false" data-sx-checkout-coupon />
          <button type="button" data-sx-checkout-apply-coupon>Apply</button>
        </label>
        <p class="sx-checkout__coupon-msg" data-sx-checkout-coupon-msg aria-live="polite"></p>

        <section class="sx-checkout__section" aria-labelledby="sx-checkout-billing-title">
          <h2 id="sx-checkout-billing-title" class="sx-checkout__section-title">1. Billing address</h2>
          <div class="sx-checkout__grid">
            <label class="sx-checkout__field sx-checkout__field--full">
              <span>Full name</span>
              <input type="text" name="fullName" autocomplete="name" placeholder="First and last name" data-sx-checkout-full-name />
            </label>
            <label class="sx-checkout__field sx-checkout__field--full">
              <span>Country</span>
              <select name="country" data-sx-checkout-country>
                ${COUNTRIES.map((c) => `<option value="${c}" ${c === 'India' ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </label>
            <label class="sx-checkout__field sx-checkout__field--full">
              <span>Address line 1</span>
              <input type="text" name="address1" autocomplete="address-line1" data-sx-checkout-address1 />
            </label>
            <label class="sx-checkout__field sx-checkout__field--full">
              <span>Address line 2</span>
              <input type="text" name="address2" autocomplete="address-line2" data-sx-checkout-address2 />
            </label>
            <label class="sx-checkout__field">
              <span>City</span>
              <input type="text" name="city" autocomplete="address-level2" data-sx-checkout-city />
            </label>
            <label class="sx-checkout__field">
              <span>State / region</span>
              <select name="state" data-sx-checkout-state>
                <option value="">Select an option</option>
                ${INDIA_STATES.map((s) => `<option value="${s}">${s}</option>`).join('')}
              </select>
            </label>
            <label class="sx-checkout__field">
              <span>ZIP / postal code</span>
              <input type="text" name="postal" autocomplete="postal-code" data-sx-checkout-postal />
            </label>
          </div>
        </section>

        <section class="sx-checkout__section" aria-labelledby="sx-checkout-pay-title">
          <h2 id="sx-checkout-pay-title" class="sx-checkout__section-title">2. Payment method</h2>
          <div class="sx-checkout__pay-list" role="radiogroup" aria-label="Payment method">
            <div class="sx-checkout__pay-option is-open" data-sx-checkout-option="upi">
              <button type="button" class="sx-checkout__pay-head" data-sx-checkout-method="upi" aria-pressed="true">
                <span class="sx-checkout__radio" aria-hidden="true"></span>
                <span class="sx-checkout__pay-name">UPI</span>
                <span class="sx-checkout__pay-logos" aria-hidden="true">
                  <span class="sx-checkout__upi-mark">UPI</span>
                </span>
              </button>
              <div class="sx-checkout__pay-body">
                <label class="sx-checkout__field">
                  <span>Date of birth</span>
                  <input type="date" name="dob" data-sx-checkout-dob />
                </label>
                <label class="sx-checkout__field">
                  <span>PAN <i class="fa-solid fa-circle-info sx-checkout__info" title="Permanent Account Number" aria-hidden="true"></i></span>
                  <input type="text" name="pan" maxlength="10" placeholder="ABCDE1234F" data-sx-checkout-pan autocomplete="off" />
                </label>
                <label class="sx-checkout__field">
                  <span>UPI ID / VPA</span>
                  <input type="text" name="upi" placeholder="name@upi" data-sx-checkout-upi autocomplete="off" />
                </label>
                <label class="sx-checkout__field">
                  <span>Phone number</span>
                  <div class="sx-checkout__phone-row">
                    <input type="tel" name="phone" placeholder="+91" data-sx-checkout-phone autocomplete="tel" />
                    <button type="button" class="sx-checkout__link-btn" data-sx-checkout-phone-add>Add</button>
                  </div>
                </label>
              </div>
            </div>

            <div class="sx-checkout__pay-option" data-sx-checkout-option="card">
              <button type="button" class="sx-checkout__pay-head" data-sx-checkout-method="card" aria-pressed="false">
                <span class="sx-checkout__radio" aria-hidden="true"></span>
                <span class="sx-checkout__pay-name">Credit or debit card</span>
                <span class="sx-checkout__pay-logos" aria-hidden="true">
                  <i class="fa-brands fa-cc-mastercard"></i>
                  <i class="fa-brands fa-cc-visa"></i>
                  <span class="sx-checkout__rupay-mark">RuPay</span>
                </span>
              </button>
              <div class="sx-checkout__pay-body" hidden>
                <label class="sx-checkout__field">
                  <span>Name on card</span>
                  <input type="text" name="cardName" autocomplete="cc-name" placeholder="Full name" data-sx-checkout-card-name />
                </label>
                <label class="sx-checkout__field">
                  <span>Card number</span>
                  <input type="text" name="cardNumber" inputmode="numeric" autocomplete="cc-number" maxlength="19" placeholder="ACCT-000003" data-sx-checkout-cc-number />
                </label>
                <div class="sx-checkout__field-row">
                  <label class="sx-checkout__field">
                    <span>Expiry</span>
                    <input type="text" name="expiry" inputmode="numeric" autocomplete="cc-exp" maxlength="5" placeholder="MM/YY" data-sx-checkout-cc-exp />
                  </label>
                  <label class="sx-checkout__field">
                    <span>CVC</span>
                    <input type="text" name="cvc" inputmode="numeric" autocomplete="cc-csc" maxlength="4" placeholder="123" data-sx-checkout-cvc />
                  </label>
                </div>
              </div>
            </div>

            <div class="sx-checkout__pay-option" data-sx-checkout-option="paypal">
              <button type="button" class="sx-checkout__pay-head" data-sx-checkout-method="paypal" aria-pressed="false">
                <span class="sx-checkout__radio" aria-hidden="true"></span>
                <span class="sx-checkout__pay-name">PayPal</span>
                <span class="sx-checkout__pay-logos" aria-hidden="true">
                  <i class="fa-brands fa-paypal"></i>
                </span>
              </button>
              <div class="sx-checkout__pay-body" hidden>
                <p class="sx-checkout__wallet-note">You'll continue with PayPal to confirm this Tradeneu upgrade. No card details needed here.</p>
              </div>
            </div>
          </div>
          <p class="sx-checkout__err" data-sx-checkout-err aria-live="polite"></p>
        </section>

        <button type="button" class="sx-checkout__cta" data-sx-checkout-submit>
          <span data-sx-checkout-cta-label>Pay $19.00</span>
        </button>
        <p class="sx-checkout__secure"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Encrypted demo checkout — no real charge</p>
      </div>

      <div class="sx-checkout__done" data-sx-checkout-view="done" hidden>
        <div class="sx-checkout__done-icon" aria-hidden="true"><i class="fa-solid fa-check"></i></div>
        <h2 class="sx-checkout__done-title">Upgrade complete</h2>
        <p class="sx-checkout__done-plan" data-sx-checkout-done-plan>Tradeneu Pro Max is active</p>
        <p class="sx-checkout__done-msg">Your backtesting workspace now includes this plan’s limits and tools.</p>
        <button type="button" class="sx-checkout__cta" data-sx-checkout-finish>Back to plans</button>
      </div>
    </div>
  `

  const payView = el.querySelector<HTMLElement>('[data-sx-checkout-view="pay"]')!
  const doneView = el.querySelector<HTMLElement>('[data-sx-checkout-view="done"]')!
  const priceEl = el.querySelector('[data-sx-checkout-price]')!
  const wasEl = el.querySelector<HTMLElement>('[data-sx-checkout-was]')!
  const planEl = el.querySelector('[data-sx-checkout-plan]')!
  const orderLine = el.querySelector('[data-sx-checkout-order-line]')!
  const subtotalEl = el.querySelector('[data-sx-checkout-subtotal]')!
  const taxEl = el.querySelector('[data-sx-checkout-tax]')!
  const totalEl = el.querySelector('[data-sx-checkout-total]')!
  const couponInput = el.querySelector<HTMLInputElement>('[data-sx-checkout-coupon]')!
  const couponMsg = el.querySelector('[data-sx-checkout-coupon-msg]')!
  const ctaLabel = el.querySelector('[data-sx-checkout-cta-label]')!
  const errEl = el.querySelector('[data-sx-checkout-err]')!
  const donePlan = el.querySelector('[data-sx-checkout-done-plan]')!
  const phoneInput = el.querySelector<HTMLInputElement>('[data-sx-checkout-phone]')!

  function currentAmount(): number {
    return applyDiscount(baseAmount, discountPct)
  }

  function currentTax(): number {
    return calcTax(currentAmount())
  }

  function currentTotal(): number {
    return Math.round((currentAmount() + currentTax()) * 100) / 100
  }

  function refreshAmounts() {
    const subtotal = currentAmount()
    const tax = currentTax()
    const total = currentTotal()
    const subMoney = formatMoney(subtotal)
    const taxMoney = formatMoney(tax)
    const totalMoney = formatMoney(total)
    priceEl.textContent = totalMoney
    subtotalEl.textContent = subMoney
    taxEl.textContent = taxMoney
    totalEl.textContent = totalMoney
    ctaLabel.textContent = `Pay ${totalMoney}`
    orderLine.textContent = `${planDisplayName(plan)} · ${totalMoney} · ${cycleLabel(cycle)}`
    if (discountPct > 0) {
      wasEl.hidden = false
      wasEl.textContent = formatMoney(baseAmount)
    } else {
      wasEl.hidden = true
      wasEl.textContent = ''
    }
  }

  function setMethod(next: CheckoutPaymentMethod, opts?: { scroll?: boolean }) {
    method = next
    el.querySelectorAll<HTMLElement>('[data-sx-checkout-option]').forEach((opt) => {
      const id = opt.getAttribute('data-sx-checkout-option') as CheckoutPaymentMethod | null
      const open = id === next
      opt.classList.toggle('is-open', open)
      const head = opt.querySelector<HTMLButtonElement>('[data-sx-checkout-method]')
      const body = opt.querySelector<HTMLElement>('.sx-checkout__pay-body')
      if (head) head.setAttribute('aria-pressed', open ? 'true' : 'false')
      if (body) body.hidden = !open
    })
    errEl.textContent = ''
    if (opts?.scroll) {
      window.requestAnimationFrame(() => {
        const active = el.querySelector<HTMLElement>(`[data-sx-checkout-option="${next}"]`)
        active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
    }
  }

  function showPay() {
    payView.hidden = false
    doneView.hidden = true
  }

  function showDone() {
    payView.hidden = true
    doneView.hidden = false
  }

  function open(nextPlan: CheckoutPlan, nextCycle: CheckoutCycle) {
    plan = nextPlan
    cycle = nextCycle
    baseAmount = baseCheckoutAmount(plan, cycle)
    discountPct = 0
    couponCode = null
    completed = false
    couponInput.value = ''
    couponMsg.textContent = ''
    couponMsg.className = 'sx-checkout__coupon-msg'
    errEl.textContent = ''
    el.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      '[data-sx-checkout-full-name], [data-sx-checkout-address1], [data-sx-checkout-address2], [data-sx-checkout-city], [data-sx-checkout-postal], [data-sx-checkout-dob], [data-sx-checkout-pan], [data-sx-checkout-upi], [data-sx-checkout-phone], [data-sx-checkout-card-name], [data-sx-checkout-cc-number], [data-sx-checkout-cc-exp], [data-sx-checkout-cvc]',
    ).forEach((n) => {
      n.value = ''
    })
    const country = el.querySelector<HTMLSelectElement>('[data-sx-checkout-country]')
    const state = el.querySelector<HTMLSelectElement>('[data-sx-checkout-state]')
    if (country) country.value = 'India'
    if (state) state.value = ''
    const dob = el.querySelector<HTMLInputElement>('[data-sx-checkout-dob]')
    if (dob) dob.value = ''
    planEl.textContent = planFullLabel(plan)
    donePlan.textContent = `${planFullLabel(plan)} is active`
    setMethod('upi', { scroll: false })
    refreshAmounts()
    showPay()
    payView.scrollTop = 0
    el.scrollTop = 0
    el.hidden = false
    document.body.classList.add('sx-checkout-open')
    // Ensure the order summary / billing section is the first thing visible.
    window.requestAnimationFrame(() => {
      payView.scrollTop = 0
      el.scrollTop = 0
    })
  }

  function close() {
    const wasCompleted = completed
    el.hidden = true
    document.body.classList.remove('sx-checkout-open')
    showPay()
    if (wasCompleted) opts.onDismissAfterComplete?.()
  }

  function buildOrder(): CheckoutOrder {
    const amount = currentAmount()
    const taxAmount = currentTax()
    return {
      plan,
      cycle,
      amount,
      baseAmount,
      taxAmount,
      taxRate: TAX_RATE,
      total: Math.round((amount + taxAmount) * 100) / 100,
      couponCode,
      discountPct,
    }
  }

  function finish(paidWith: CheckoutPaymentMethod) {
    method = paidWith
    completed = true
    donePlan.textContent = `${planFullLabel(plan)} is active`
    showDone()
    opts.onComplete(buildOrder(), paidWith)
  }

  function applyCoupon() {
    const resolved = resolveCoupon(couponInput.value)
    if (!resolved) {
      discountPct = 0
      couponCode = null
      couponMsg.textContent = couponInput.value.trim()
        ? 'Invalid coupon code.'
        : 'Enter a code to apply a discount.'
      couponMsg.classList.add('is-error')
      couponMsg.classList.remove('is-ok')
      refreshAmounts()
      return
    }
    discountPct = resolved.pct
    couponCode = resolved.code
    couponMsg.textContent = `${resolved.pct}% off · ${resolved.code}`
    couponMsg.classList.remove('is-error')
    couponMsg.classList.add('is-ok')
    refreshAmounts()
  }

  function requireBilling(): string | null {
    const fullName = el.querySelector<HTMLInputElement>('[data-sx-checkout-full-name]')?.value.trim() ?? ''
    const address1 = el.querySelector<HTMLInputElement>('[data-sx-checkout-address1]')?.value.trim() ?? ''
    const city = el.querySelector<HTMLInputElement>('[data-sx-checkout-city]')?.value.trim() ?? ''
    const state = el.querySelector<HTMLSelectElement>('[data-sx-checkout-state]')?.value ?? ''
    const postal = el.querySelector<HTMLInputElement>('[data-sx-checkout-postal]')?.value.trim() ?? ''
    if (!fullName) return 'Enter your full name.'
    if (!address1) return 'Enter address line 1.'
    if (!city) return 'Enter your city.'
    if (!state) return 'Select a state / region.'
    if (!postal) return 'Enter ZIP / postal code.'
    return null
  }

  function formatCardNumber(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
  }

  function formatExpiry(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 4)
    if (digits.length <= 2) return digits
    return `${digits.slice(0, 2)}/${digits.slice(2)}`
  }

  function submitPay() {
    const billingErr = requireBilling()
    if (billingErr) {
      errEl.textContent = billingErr
      return
    }

    if (method === 'upi') {
      const pan = el.querySelector<HTMLInputElement>('[data-sx-checkout-pan]')?.value.trim() ?? ''
      const upi = el.querySelector<HTMLInputElement>('[data-sx-checkout-upi]')?.value.trim() ?? ''
      const phone = phoneInput.value.trim()
      const dob = el.querySelector<HTMLInputElement>('[data-sx-checkout-dob]')?.value ?? ''
      if (!dob) {
        errEl.textContent = 'Enter your date of birth for UPI.'
        return
      }
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(pan)) {
        errEl.textContent = 'Enter a valid PAN (e.g. ABCDE1234F).'
        return
      }
      if (!upi.includes('@')) {
        errEl.textContent = 'Enter a valid UPI ID (name@bank).'
        return
      }
      if (phone.replace(/\D/g, '').length < 10) {
        errEl.textContent = 'Enter a valid phone number.'
        return
      }
      errEl.textContent = ''
      finish('upi')
      return
    }

    if (method === 'card') {
      const name = el.querySelector<HTMLInputElement>('[data-sx-checkout-card-name]')?.value.trim() ?? ''
      const number = (el.querySelector<HTMLInputElement>('[data-sx-checkout-cc-number]')?.value ?? '').replace(/\s/g, '')
      const expiry = el.querySelector<HTMLInputElement>('[data-sx-checkout-cc-exp]')?.value ?? ''
      const cvc = el.querySelector<HTMLInputElement>('[data-sx-checkout-cvc]')?.value ?? ''
      if (!name || number.length < 13 || !/^\d{2}\/\d{2}$/.test(expiry) || cvc.length < 3) {
        errEl.textContent = 'Check your card details and try again.'
        return
      }
      errEl.textContent = ''
      finish('card')
      return
    }

    errEl.textContent = ''
    finish('paypal')
  }

  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null
    if (!t) return
    if (t.closest('[data-sx-checkout-close]')) {
      close()
      return
    }
    if (t.closest('[data-sx-checkout-apply-coupon]')) {
      applyCoupon()
      return
    }
    if (t.closest('[data-sx-checkout-phone-add]')) {
      phoneInput.focus()
      return
    }
    const methodBtn = t.closest<HTMLButtonElement>('[data-sx-checkout-method]')
    if (methodBtn) {
      const m = methodBtn.getAttribute('data-sx-checkout-method') as CheckoutPaymentMethod | null
      if (m) setMethod(m, { scroll: true })
      return
    }
    if (t.closest('[data-sx-checkout-submit]')) {
      submitPay()
      return
    }
    if (t.closest('[data-sx-checkout-finish]')) {
      close()
    }
  }

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !el.hidden) {
      e.stopPropagation()
      close()
    }
  }

  const onCouponKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyCoupon()
    }
  }

  const onInput = (e: Event) => {
    const input = e.target as HTMLInputElement
    if (input.matches('[data-sx-checkout-cc-number]')) input.value = formatCardNumber(input.value)
    if (input.matches('[data-sx-checkout-cc-exp]')) input.value = formatExpiry(input.value)
    if (input.matches('[data-sx-checkout-pan]')) input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
  }

  el.addEventListener('click', onClick)
  el.addEventListener('keydown', onKeydown)
  el.addEventListener('input', onInput)
  couponInput.addEventListener('keydown', onCouponKey)
  document.body.append(el)

  return {
    el,
    open,
    close,
    dispose: () => {
      document.body.classList.remove('sx-checkout-open')
      el.removeEventListener('click', onClick)
      el.removeEventListener('keydown', onKeydown)
      el.removeEventListener('input', onInput)
      couponInput.removeEventListener('keydown', onCouponKey)
      el.remove()
    },
  }
}
