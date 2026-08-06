import './subscriptionPage.css'
import { createCheckoutOverlay, type CheckoutPlan } from './subscriptionCheckout'
import { recordCheckoutComplete } from '../billing/billingApi'

export type AccountTier = 'free' | 'intermediate' | 'pro'

export type MountSubscriptionPageOptions = {
  onBack?: () => void
  readTier?: () => AccountTier
  /** Persist plan after a successful (demo) checkout. */
  writeTier?: (tier: AccountTier) => void
  /** Called after checkout payment succeeds (tier already written). */
  onCheckoutComplete?: (tier: AccountTier) => void
  /** Called when checkout closes after a successful payment — host should remount. */
  onCheckoutDismissed?: () => void
  /** Render inside home Subscription tab (no overlay / no back button chrome). */
  embedded?: boolean
}

type BillingCycle = 'monthly' | 'yearly'

const PRICING = {
  monthly: {
    intermediate: {
      amount: 9,
      label: '9',
      period: '/month',
      original: '$19',
      save: 'Save $10/monthly',
    },
    pro: {
      amount: 19,
      label: '19',
      period: '/month',
      original: '$29',
      save: 'Save $10/monthly',
    },
  },
  yearly: {
    intermediate: {
      amount: 7,
      label: '7',
      period: '/month',
      original: '$19',
      billed: 'Billed yearly · $84/year',
      // List $19×12 = $228 − $84 billed = $144
      save: 'Save $144/yearly',
    },
    pro: {
      amount: 15,
      label: '15',
      period: '/month',
      original: '$29',
      billed: 'Billed yearly · $180/year',
      // List $29×12 = $348 − $180 billed = $168
      save: 'Save $168/yearly',
    },
  },
} as const

function cell(value: string): string {
  if (value === '✓') return '<span class="sx-sub__ok" aria-label="Included">✓</span>'
  if (value === '×') return '<span class="sx-sub__no" aria-label="Not included">×</span>'
  if (value === '∞') return '<span class="sx-sub__inf">∞</span>'
  return `<span class="sx-sub__val">${value}</span>`
}

function featureTable(
  title: string,
  rows: Array<{ label: string; free: string; mid: string; pro: string }>,
  open: boolean,
): string {
  const body = rows
    .map(
      (r) => `<tr>
      <th scope="row">${r.label}</th>
      <td>${cell(r.free)}</td>
      <td>${cell(r.mid)}</td>
      <td>${cell(r.pro)}</td>
    </tr>`,
    )
    .join('')
  return `
  <details class="sx-sub-accordion" ${open ? 'open' : ''}>
    <summary class="sx-sub-accordion__summary">
      <span>${title}</span>
      <i class="fa-solid fa-chevron-down sx-sub-accordion__chev" aria-hidden="true"></i>
    </summary>
    <div class="sx-sub-accordion__body">
      <table class="sx-sub-table">
        <thead>
          <tr>
            <th scope="col" class="sx-sub-table__feature">Feature</th>
            <th scope="col">Free</th>
            <th scope="col">Pro</th>
            <th scope="col">Pro Max</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </details>`
}

export function mountSubscriptionPage(root: HTMLElement, opts: MountSubscriptionPageOptions): () => void {
  root.replaceChildren()
  const tier = opts.readTier?.() ?? 'free'
  let cycle: BillingCycle = 'monthly'

  const planLabel = tier === 'pro' ? 'Pro Max' : tier === 'intermediate' ? 'Pro' : 'Free'
  const planPrice =
    tier === 'pro' ? '$19/month' : tier === 'intermediate' ? '$9/month' : '$0'
  const planBlurb =
    tier === 'pro'
      ? 'Everything you need to achieve profitability'
      : tier === 'intermediate'
        ? 'Optimize and scale your trading game'
        : 'Start improving your trading skills'

  const shell = document.createElement('div')
  shell.className = opts.embedded ? 'sx-sub-page sx-sub-page--embedded' : 'sx-sub-page'
  shell.innerHTML = `
    <header class="sx-sub-page__head">
      <div class="sx-sub-page__head-left">
        ${opts.onBack ? `<button type="button" class="sx-sub-page__back" data-sx-sub-back aria-label="Back to dashboard"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Dashboard</span></button>` : ''}
        <div class="sx-sub-page__head-copy${opts.onBack ? '' : ' sx-sub-page__head-copy--solo'}">
          <p class="sx-sub-page__status"><strong>${planLabel}</strong> <span class="sx-sub-page__status-price">${planPrice}</span></p>
          <p class="sx-sub-page__subtitle">${planBlurb}</p>
        </div>
      </div>
      <div class="sx-sub-page__head-center">
        <div class="sx-sub-cycle" role="group" aria-label="Billing cycle">
          <button type="button" class="sx-sub-cycle__btn sx-sub-cycle__btn--active" data-sx-billing="monthly">Monthly</button>
          <button type="button" class="sx-sub-cycle__btn" data-sx-billing="yearly">Yearly</button>
        </div>
      </div>
      <div class="sx-sub-page__head-actions">
        <div class="sx-sub-manage">
          <button type="button" class="sx-sub-manage__btn" data-sx-manage-toggle aria-expanded="false" aria-haspopup="true" aria-controls="sx-sub-manage-menu">
            <i class="fa-regular fa-credit-card" aria-hidden="true"></i>
            Manage Plan
            <i class="fa-solid fa-chevron-down sx-sub-manage__chev" aria-hidden="true"></i>
          </button>
          <div class="sx-sub-manage__menu" id="sx-sub-manage-menu" hidden role="menu" aria-label="Manage plan">
            <button type="button" role="menuitem" class="sx-sub-manage__item" data-sx-manage="billing">
              <i class="fa-solid fa-rotate" aria-hidden="true"></i>
              <span>
                <strong>Billing option</strong>
                <em>Switch monthly or yearly</em>
              </span>
            </button>
            <button type="button" role="menuitem" class="sx-sub-manage__item" data-sx-manage="history">
              <i class="fa-regular fa-clock" aria-hidden="true"></i>
              <span>
                <strong>Payment history</strong>
                <em>Invoices and receipts</em>
              </span>
            </button>
            <button type="button" role="menuitem" class="sx-sub-manage__item" data-sx-manage="address">
              <i class="fa-regular fa-map" aria-hidden="true"></i>
              <span>
                <strong>Billing &amp; shipping address</strong>
                <em>Update your contact details</em>
              </span>
            </button>
            <button type="button" role="menuitem" class="sx-sub-manage__item" data-sx-manage="pause">
              <i class="fa-solid fa-pause" aria-hidden="true"></i>
              <span>
                <strong>Pause subscription</strong>
                <em>Temporarily stop billing</em>
              </span>
            </button>
            <button type="button" role="menuitem" class="sx-sub-manage__item sx-sub-manage__item--danger" data-sx-manage="cancel">
              <i class="fa-regular fa-circle-xmark" aria-hidden="true"></i>
              <span>
                <strong>Cancel subscription</strong>
                <em>End renewals at period end</em>
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="sx-sub-manage-panel" data-sx-manage-panel hidden>
      <div class="sx-sub-manage-panel__card">
        <div class="sx-sub-manage-panel__bar">
          <h2 class="sx-sub-manage-panel__title" data-sx-manage-title>Manage plan</h2>
          <button type="button" class="sx-sub-manage-panel__close" data-sx-manage-close aria-label="Close">Close</button>
        </div>
        <div class="sx-sub-manage-panel__body" data-sx-manage-body></div>
      </div>
    </div>

    <div class="sx-sub-page__scroll">
    <div class="sx-sub-page__body">
      <div class="sx-sub-plans" data-sx-plans>
        <article class="sx-sub-card-shell${tier === 'free' ? ' sx-sub-card-shell--current' : ''}" data-plan="free">
          <div class="sx-sub-card__ai-border" aria-hidden="true"><div class="sx-sub-card__ai-ring"></div></div>
          <div class="sx-sub-card__ai-glow" aria-hidden="true"></div>
          <div class="sx-sub-card">
            <div class="sx-sub-card__top">
              <h2 class="sx-sub-card__name">Free</h2>
              ${tier === 'free' ? '<span class="sx-sub-card__badge">Current plan</span>' : ''}
            </div>
            <p class="sx-sub-card__price"><span class="sx-sub-card__amount">Free</span></p>
            <p class="sx-sub-card__desc">Start improving your trading skills</p>
            <ul class="sx-sub-card__features">
              <li>2 Backtesting Sessions</li>
              <li>1 Indicator</li>
              <li>1 week Data Retention</li>
            </ul>
            <button type="button" class="sx-sub-card__cta sx-sub-card__cta--ghost" disabled>${tier === 'free' ? 'Current plan' : 'Downgrade'}</button>
          </div>
        </article>

        <article class="sx-sub-card-shell${tier === 'intermediate' ? ' sx-sub-card-shell--current' : ''}" data-plan="intermediate">
          <div class="sx-sub-card__ai-border" aria-hidden="true"><div class="sx-sub-card__ai-ring"></div></div>
          <div class="sx-sub-card__ai-glow" aria-hidden="true"></div>
          <div class="sx-sub-card">
            <div class="sx-sub-card__top">
              <h2 class="sx-sub-card__name">Pro</h2>
              ${
                tier === 'intermediate'
                  ? '<span class="sx-sub-card__badge">Current plan</span>'
                  : `<span class="sx-sub-card__save-badge" data-sx-save-mid>${PRICING.monthly.intermediate.save}</span>`
              }
            </div>
            <p class="sx-sub-card__price">
              <span class="sx-sub-card__amount" data-sx-price-mid>9</span>
              <span class="sx-sub-card__unit">$<span data-sx-period-mid>/month</span></span>
              <span class="sx-sub-card__was">Original Price <span class="sx-sub-card__was-amount" data-sx-was-mid>$19</span></span>
            </p>
            <p class="sx-sub-card__tax">*Taxes may apply</p>
            <p class="sx-sub-card__billed" data-sx-billed-mid hidden></p>
            <p class="sx-sub-card__desc">Optimize and scale your trading game</p>
            <ul class="sx-sub-card__features sx-sub-card__features--check">
              <li>10 Backtesting Sessions</li>
              <li>3 Indicators</li>
              <li>6 Months Data Retention</li>
              <li>2 Charts</li>
            </ul>
            <button type="button" class="sx-sub-card__cta sx-sub-card__cta--primary" data-sx-upgrade="intermediate" ${tier === 'intermediate' || tier === 'pro' ? 'disabled' : ''}>${tier === 'intermediate' ? 'Current plan' : tier === 'pro' ? 'Included in Pro Max' : 'Upgrade'}</button>
          </div>
        </article>

        <article class="sx-sub-card-shell sx-sub-card-shell--pro${tier === 'pro' ? ' sx-sub-card-shell--current' : ''}" data-plan="pro">
          <div class="sx-sub-card__ai-border" aria-hidden="true"><div class="sx-sub-card__ai-ring"></div></div>
          <div class="sx-sub-card__ai-glow" aria-hidden="true"></div>
          <div class="sx-sub-card">
            <div class="sx-sub-card__top">
              <h2 class="sx-sub-card__name">Pro Max</h2>
              ${
                tier === 'pro'
                  ? '<span class="sx-sub-card__badge">Current plan</span>'
                  : `<span class="sx-sub-card__save-badge" data-sx-save-pro>${PRICING.monthly.pro.save}</span>`
              }
            </div>
            <p class="sx-sub-card__price">
              <span class="sx-sub-card__amount" data-sx-price-pro>19</span>
              <span class="sx-sub-card__unit">$<span data-sx-period-pro>/month</span></span>
              <span class="sx-sub-card__was">Original Price <span class="sx-sub-card__was-amount" data-sx-was-pro>$29</span></span>
            </p>
            <p class="sx-sub-card__tax">*Taxes may apply</p>
            <p class="sx-sub-card__billed" data-sx-billed-pro hidden></p>
            <p class="sx-sub-card__desc">Everything you need to achieve profitability</p>
            <ul class="sx-sub-card__features sx-sub-card__features--inf">
              <li>∞ Backtesting Sessions</li>
              <li>∞ Indicators</li>
              <li>∞ Data Retention</li>
              <li>∞ Charts</li>
            </ul>
            <button type="button" class="sx-sub-card__cta sx-sub-card__cta--primary" data-sx-upgrade="pro" ${tier === 'pro' ? 'disabled' : ''}>${tier === 'pro' ? 'Current plan' : 'Upgrade'}</button>
          </div>
        </article>
      </div>

      <section class="sx-sub-compare" aria-label="Feature comparison">
        ${featureTable(
          'Backtesting Features',
          [
            { label: 'Backtesting Sessions', free: '2', mid: '10', pro: 'Unlimited' },
            { label: 'Indicators', free: '1', mid: '3', pro: 'Unlimited' },
            { label: 'Max session duration', free: '1 Month', mid: '6 Months', pro: 'Unlimited' },
            { label: 'Go to feature', free: '3 Times Per Hour', mid: 'Unlimited', pro: 'Unlimited' },
            { label: 'Trades per session', free: '50', mid: '200', pro: 'Unlimited' },
            { label: 'Data retention', free: '1 Week', mid: '6 Months', pro: 'Unlimited' },
            { label: 'Multichart', free: '×', mid: '2 Charts', pro: 'Unlimited' },
            { label: 'Economic calendar', free: 'One Country, Only Past News, No Chart Bubbles', mid: 'Only Two Countries', pro: 'Unlimited' },
            { label: 'Auto break even', free: '×', mid: '✓', pro: '✓' },
            { label: 'Rewind price', free: '×', mid: '✓', pro: '✓' },
            { label: 'Seconds data', free: '×', mid: '×', pro: '✓' },
            { label: 'Futures and CME data', free: '×', mid: '×', pro: '✓' },
            { label: 'Custom timeframes', free: '×', mid: '×', pro: '✓' },
          ],
          true,
        )}
        ${featureTable(
          'Analytics Features',
          [
            { label: 'Analytics dashboard', free: 'Limited', mid: 'Unlimited', pro: 'Unlimited' },
            { label: 'Strategies', free: '×', mid: '3', pro: 'Unlimited' },
            { label: 'Strategy analytics', free: '×', mid: '✓', pro: '✓' },
            { label: 'Seconds data', free: '×', mid: '×', pro: '✓' },
            { label: 'Montecarlo Simulator', free: '×', mid: '✓', pro: '✓' },
            { label: 'RR Simulator', free: '×', mid: '✓', pro: '✓' },
            { label: 'Futures and CME data', free: '×', mid: '×', pro: '✓' },
          ],
          false,
        )}
        ${featureTable(
          'Journal Features',
          [
            { label: 'Journal', free: '✓', mid: '✓', pro: '✓' },
            { label: 'Screenshots', free: '1', mid: '2', pro: 'Unlimited' },
            { label: 'Checklists', free: '1', mid: '3', pro: 'Unlimited' },
          ],
          false,
        )}
      </section>
    </div>
    </div>
  `
  root.append(shell)

  const priceMid = shell.querySelector('[data-sx-price-mid]')
  const pricePro = shell.querySelector('[data-sx-price-pro]')
  const periodMid = shell.querySelector('[data-sx-period-mid]')
  const periodPro = shell.querySelector('[data-sx-period-pro]')
  const wasMid = shell.querySelector('[data-sx-was-mid]')
  const wasPro = shell.querySelector('[data-sx-was-pro]')
  const saveMid = shell.querySelector('[data-sx-save-mid]')
  const savePro = shell.querySelector('[data-sx-save-pro]')
  const billedMid = shell.querySelector<HTMLElement>('[data-sx-billed-mid]')
  const billedPro = shell.querySelector<HTMLElement>('[data-sx-billed-pro]')

  function applyCycle(next: BillingCycle) {
    cycle = next
    shell.querySelectorAll<HTMLButtonElement>('.sx-sub-cycle [data-sx-billing]').forEach((btn) => {
      btn.classList.toggle('sx-sub-cycle__btn--active', btn.getAttribute('data-sx-billing') === next)
    })
    const mid = PRICING[next].intermediate
    const max = PRICING[next].pro
    if (priceMid) priceMid.textContent = mid.label
    if (pricePro) pricePro.textContent = max.label
    if (periodMid) periodMid.textContent = mid.period
    if (periodPro) periodPro.textContent = max.period
    if (wasMid) wasMid.textContent = mid.original
    if (wasPro) wasPro.textContent = max.original
    if (saveMid) saveMid.textContent = mid.save
    if (savePro) savePro.textContent = max.save
    if (billedMid) {
      billedMid.hidden = next !== 'yearly'
      billedMid.textContent = next === 'yearly' ? PRICING.yearly.intermediate.billed : ''
    }
    if (billedPro) {
      billedPro.hidden = next !== 'yearly'
      billedPro.textContent = next === 'yearly' ? PRICING.yearly.pro.billed : ''
    }
  }

  const manageToggle = shell.querySelector<HTMLButtonElement>('[data-sx-manage-toggle]')
  const manageMenu = shell.querySelector<HTMLElement>('#sx-sub-manage-menu')
  const managePanel = shell.querySelector<HTMLElement>('[data-sx-manage-panel]')
  const manageTitle = shell.querySelector('[data-sx-manage-title]')
  const manageBody = shell.querySelector('[data-sx-manage-body]')

  function setManageMenuOpen(open: boolean) {
    if (!manageToggle || !manageMenu) return
    manageMenu.hidden = !open
    manageToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    manageToggle.classList.toggle('sx-sub-manage__btn--open', open)
  }

  function closeManagePanel() {
    if (!managePanel) return
    managePanel.hidden = true
  }

  const checkout = createCheckoutOverlay({
    onComplete: (order, method) => {
      const nextTier: AccountTier = order.plan
      opts.writeTier?.(nextTier)
      void recordCheckoutComplete(order, method)
      opts.onCheckoutComplete?.(nextTier)
    },
    onDismissAfterComplete: () => {
      opts.onCheckoutDismissed?.()
    },
  })

  function openManagePanel(kind: string) {
    if (!managePanel || !manageTitle || !manageBody) return
    setManageMenuOpen(false)
    const copy: Record<string, { title: string; html: string }> = {
      billing: {
        title: 'Billing option',
        html: `
          <p class="sx-sub-manage-panel__lead">Choose how often you are billed. Changes apply on your next renewal.</p>
          <div class="sx-sub-manage-panel__actions">
            <button type="button" class="sx-sub-card__cta" data-sx-billing="monthly">Use monthly billing</button>
            <button type="button" class="sx-sub-card__cta sx-sub-card__cta--primary" data-sx-billing="yearly">Use yearly billing</button>
          </div>
          <p class="sx-sub-manage-panel__hint">Yearly Pro is $7/mo · Yearly Pro Max is $15/mo.</p>
        `,
      },
      history: {
        title: 'Payment history',
        html: `
          <p class="sx-sub-manage-panel__lead">Your invoices will appear here once payments are connected.</p>
          <div class="sx-sub-manage-empty">No payments yet.</div>
        `,
      },
      address: {
        title: 'Billing & shipping address',
        html: `
          <p class="sx-sub-manage-panel__lead">Keep your address up to date for invoices and tax receipts.</p>
          <label class="sx-sub-field">Full name<input type="text" placeholder="Your name" autocomplete="name" /></label>
          <label class="sx-sub-field">Address line 1<input type="text" placeholder="Street address" autocomplete="address-line1" /></label>
          <label class="sx-sub-field">City / Region<input type="text" placeholder="City" autocomplete="address-level2" /></label>
          <label class="sx-sub-field">Postal code<input type="text" placeholder="ZIP / Postal" autocomplete="postal-code" /></label>
          <label class="sx-sub-field">Country<input type="text" placeholder="Country" autocomplete="country-name" /></label>
          <button type="button" class="sx-sub-card__cta sx-sub-card__cta--primary" data-sx-manage-save-address>Save address</button>
        `,
      },
      pause: {
        title: 'Pause subscription',
        html: `
          <p class="sx-sub-manage-panel__lead">Pause billing temporarily. You can resume anytime from Manage Plan.</p>
          <button type="button" class="sx-sub-card__cta" data-sx-manage-confirm="pause">Pause for 1 month</button>
          <p class="sx-sub-manage-panel__hint">Available after an active paid plan is connected.</p>
        `,
      },
      cancel: {
        title: 'Cancel subscription',
        html: `
          <p class="sx-sub-manage-panel__lead">Cancel renewals. You keep access until the end of the current period.</p>
          <button type="button" class="sx-sub-card__cta sx-sub-manage-danger-btn" data-sx-manage-confirm="cancel">Cancel subscription</button>
          <p class="sx-sub-manage-panel__hint">You can re-subscribe later from the plans below.</p>
        `,
      },
    }
    const entry = copy[kind]
    if (!entry) return
    manageTitle.textContent = entry.title
    manageBody.innerHTML = entry.html
    managePanel.hidden = false
  }

  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null
    if (!t) return

    if (t.closest('[data-sx-manage-toggle]')) {
      setManageMenuOpen(!!manageMenu?.hidden)
      return
    }
    if (t.closest('[data-sx-manage-close]')) {
      closeManagePanel()
      return
    }
    const manageItem = t.closest<HTMLButtonElement>('[data-sx-manage]')
    if (manageItem) {
      const kind = manageItem.getAttribute('data-sx-manage')
      if (kind) openManagePanel(kind)
      return
    }
    if (t.closest('[data-sx-manage-save-address]')) {
      window.alert('Address saved locally for now. Payment provider sync coming soon.')
      return
    }
    const confirm = t.closest<HTMLButtonElement>('[data-sx-manage-confirm]')
    if (confirm) {
      const kind = confirm.getAttribute('data-sx-manage-confirm')
      window.alert(
        kind === 'cancel'
          ? 'Cancel request noted. Live cancellation will connect when billing is enabled.'
          : 'Pause request noted. Live pause will connect when billing is enabled.',
      )
      closeManagePanel()
      return
    }

    if (!t.closest('.sx-sub-manage')) setManageMenuOpen(false)

    const billing = t.closest<HTMLButtonElement>('[data-sx-billing]')
    if (billing) {
      const v = billing.getAttribute('data-sx-billing')
      if (v === 'monthly' || v === 'yearly') {
        applyCycle(v)
        closeManagePanel()
      }
      return
    }
    if (t.closest('[data-sx-sub-back]')) {
      opts.onBack?.()
      return
    }
    const upgrade = t.closest<HTMLButtonElement>('[data-sx-upgrade]')
    if (upgrade && !upgrade.disabled) {
      const plan = upgrade.getAttribute('data-sx-upgrade')
      if (plan === 'intermediate' || plan === 'pro') {
        checkout.open(plan as CheckoutPlan, cycle)
      }
    }
  }

  shell.addEventListener('click', onClick)
  applyCycle('monthly')

  return () => {
    checkout.dispose()
    shell.removeEventListener('click', onClick)
    root.replaceChildren()
  }
}
