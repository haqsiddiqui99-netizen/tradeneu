import './billingPage.css'
import type { AuthUser } from '../auth/authSession'
import {
  fetchMyBilling,
  type BillingSubscription,
  type BillingTransaction,
  type MyBilling,
} from '../billing/billingApi'
import type { AccountTier } from './mountSubscriptionPage'
import { onLocaleChange, t as translate, te } from '../i18n'

type BillingAddress = {
  name: string
  company: string
  email: string
  mobile: string
  address: string
  taxId: string
}

type CardKind = 'credit' | 'debit'

type SavedCard = {
  id: string
  brand: 'visa' | 'mastercard' | 'amex' | 'other'
  last4: string
  expiry: string
  nickname: string
  kind?: CardKind
}

type PayMode = 'credit' | 'debit' | 'netbanking' | 'upi' | 'autopay'
type AutopayFrom = 'credit' | 'debit' | 'upi' | 'netbanking'

type PayPrefs = {
  mode: PayMode
  upiId: string
  bank: string
  accountHint: string
  autopay: boolean
  autopayFrom: AutopayFrom
}

export type MountBillingPageOptions = {
  readTier: () => AccountTier
  getAuthUser: () => AuthUser | null
  onOpenSubscription: () => void
}

const ADDRESS_KEY = 'suplexity-billing-address-v1'
const CARDS_KEY = 'suplexity-billing-cards-v1'
const PAY_KEY = 'suplexity-billing-pay-v1'

const PAY_MODES: PayMode[] = ['credit', 'debit', 'netbanking', 'upi', 'autopay']
const AUTOPAY_FROMS: AutopayFrom[] = ['credit', 'debit', 'upi', 'netbanking']

const BANKS: Array<[string, string]> = [
  ['sbi', 'State Bank of India'],
  ['hdfc', 'HDFC Bank'],
  ['icici', 'ICICI Bank'],
  ['axis', 'Axis Bank'],
  ['kotak', 'Kotak Mahindra Bank'],
  ['yes', 'Yes Bank'],
  ['pnb', 'Punjab National Bank'],
  ['bob', 'Bank of Baroda'],
  ['other', 'Other bank'],
]

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)
}

function date(value: number | null | undefined, long = false): string {
  if (!value || !Number.isFinite(value)) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    ...(long ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value))
}

function planName(tier: AccountTier): string {
  if (tier === 'pro') return translate('billing.plan.premium')
  if (tier === 'intermediate') return translate('billing.plan.ultra')
  return translate('billing.plan.basic')
}

function readAddress(email: string): BillingAddress | null {
  try {
    const all = JSON.parse(localStorage.getItem(ADDRESS_KEY) ?? '{}') as Record<string, BillingAddress>
    return all[email.toLowerCase()] ?? null
  } catch {
    return null
  }
}

function writeAddress(email: string, address: BillingAddress | null): void {
  try {
    const all = JSON.parse(localStorage.getItem(ADDRESS_KEY) ?? '{}') as Record<string, BillingAddress>
    const key = email.toLowerCase()
    if (address) all[key] = address
    else delete all[key]
    localStorage.setItem(ADDRESS_KEY, JSON.stringify(all))
  } catch {
    /* Storage is optional. */
  }
}

function readCards(email: string): SavedCard[] {
  try {
    const all = JSON.parse(localStorage.getItem(CARDS_KEY) ?? '{}') as Record<string, SavedCard[]>
    return Array.isArray(all[email.toLowerCase()]) ? all[email.toLowerCase()]! : []
  } catch {
    return []
  }
}

function writeCards(email: string, cards: SavedCard[]): void {
  try {
    const all = JSON.parse(localStorage.getItem(CARDS_KEY) ?? '{}') as Record<string, SavedCard[]>
    all[email.toLowerCase()] = cards
    localStorage.setItem(CARDS_KEY, JSON.stringify(all))
  } catch {
    /* Storage is optional. */
  }
}

function newCardId(): string {
  return `card_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function defaultPay(): PayPrefs {
  return { mode: 'credit', upiId: '', bank: '', accountHint: '', autopay: false, autopayFrom: 'credit' }
}

function readPay(email: string): PayPrefs {
  try {
    const all = JSON.parse(localStorage.getItem(PAY_KEY) ?? '{}') as Record<string, Partial<PayPrefs>>
    const raw = all[email.toLowerCase()]
    const base = defaultPay()
    if (!raw || typeof raw !== 'object') return base
    const mode = PAY_MODES.includes(raw.mode as PayMode) ? (raw.mode as PayMode) : base.mode
    const autopayFrom = AUTOPAY_FROMS.includes(raw.autopayFrom as AutopayFrom)
      ? (raw.autopayFrom as AutopayFrom)
      : base.autopayFrom
    return {
      mode,
      upiId: String(raw.upiId ?? '').trim().slice(0, 80),
      bank: String(raw.bank ?? '').slice(0, 40),
      accountHint: String(raw.accountHint ?? '').trim().slice(0, 40),
      autopay: Boolean(raw.autopay),
      autopayFrom,
    }
  } catch {
    return defaultPay()
  }
}

function writePay(email: string, prefs: PayPrefs): void {
  try {
    const all = JSON.parse(localStorage.getItem(PAY_KEY) ?? '{}') as Record<string, PayPrefs>
    all[email.toLowerCase()] = prefs
    localStorage.setItem(PAY_KEY, JSON.stringify(all))
  } catch {
    /* Storage is optional. */
  }
}

function cardsOf(cards: SavedCard[], kind: CardKind): SavedCard[] {
  return cards.filter((card) => (card.kind ?? 'credit') === kind)
}

function modeReady(mode: PayMode, prefs: PayPrefs, cards: SavedCard[]): boolean {
  if (mode === 'credit') return cardsOf(cards, 'credit').length > 0
  if (mode === 'debit') return cardsOf(cards, 'debit').length > 0
  if (mode === 'netbanking') return Boolean(prefs.bank)
  if (mode === 'upi') return Boolean(prefs.upiId)
  return prefs.autopay
}

function cardBrandIcon(brand: SavedCard['brand']): string {
  if (brand === 'visa') return 'fa-brands fa-cc-visa'
  if (brand === 'mastercard') return 'fa-brands fa-cc-mastercard'
  if (brand === 'amex') return 'fa-brands fa-cc-amex'
  return 'fa-regular fa-credit-card'
}

function cardRows(cards: SavedCard[]): string {
  if (!cards.length) {
    return `<div class="sx-billing__empty sx-billing__empty--compact">
      <span class="sx-billing__empty-icon"><i class="fa-regular fa-credit-card" aria-hidden="true"></i></span>
      <div><strong>${te('billing.noSavedCards')}</strong><p>${te('billing.noSavedCardsSub')}</p></div>
    </div>`
  }
  return cards
    .map(
      (c) => `<article class="sx-billing-savedcard">
        <span class="sx-billing-savedcard__icon"><i class="${cardBrandIcon(c.brand)}" aria-hidden="true"></i></span>
        <div class="sx-billing-savedcard__copy">
          <strong>${'\u2022\u2022\u2022\u2022 '.repeat(3)}${escapeHtml(c.last4)}</strong>
          <span>${escapeHtml(c.nickname || 'Card')}${c.expiry ? ` \u00b7 Exp ${escapeHtml(c.expiry)}` : ''}</span>
        </div>
        <button type="button" class="sx-billing-savedcard__edit" data-billing-action="delete-card" data-card-id="${escapeHtml(c.id)}" aria-label="Remove card">
          <i class="fa-solid fa-trash" aria-hidden="true"></i>
        </button>
      </article>`,
    )
    .join('')
}

function brandFromNumber(digits: string): SavedCard['brand'] {
  if (/^4/.test(digits)) return 'visa'
  if (/^3[47]/.test(digits)) return 'amex'
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard'
  return 'other'
}

function luhnOk(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

function methodLabel(method: string | undefined): string {
  if (method === 'paypal') return 'PayPal'
  if (method === 'upi') return 'UPI'
  return 'Card'
}

function payModeIcon(mode: PayMode): string {
  if (mode === 'debit') return '<i class="fa-solid fa-credit-card" aria-hidden="true"></i>'
  if (mode === 'netbanking') return '<i class="fa-solid fa-building-columns" aria-hidden="true"></i>'
  if (mode === 'upi') return '<span class="sx-billing-pay__upi">UPI</span>'
  if (mode === 'autopay') return '<i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>'
  return '<i class="fa-regular fa-credit-card" aria-hidden="true"></i>'
}

function payModeKey(mode: PayMode): 'billing.mode.credit' | 'billing.mode.debit' | 'billing.mode.netbanking' | 'billing.mode.upi' | 'billing.mode.autopay' {
  if (mode === 'debit') return 'billing.mode.debit'
  if (mode === 'netbanking') return 'billing.mode.netbanking'
  if (mode === 'upi') return 'billing.mode.upi'
  if (mode === 'autopay') return 'billing.mode.autopay'
  return 'billing.mode.credit'
}

function payStatusHtml(on: boolean): string {
  const key = on ? 'billing.pay.saved' : 'billing.pay.notSet'
  return `<span class="sx-billing-pay__status${on ? ' is-on' : ''}" data-i18n="${key}">${te(key)}</span>`
}

function cardPaneHtml(kind: CardKind, cards: SavedCard[]): string {
  const list = cardsOf(cards, kind)
  const titleKey = kind === 'debit' ? 'billing.mode.debit' : 'billing.mode.credit'
  return `<form class="sx-billing-pay__form sx-billing-pay__cardform" data-billing-inline-card-form>
    <input type="hidden" name="kind" value="${kind}" />
    <div class="sx-billing-pay__pane-head">
      <div>
        <h3 data-i18n="${titleKey}">${te(titleKey)}</h3>
        ${payStatusHtml(list.length > 0)}
      </div>
    </div>
    <div class="sx-billing-pay__cardgrid">
      <label class="sx-billing-pay__cardgrid-number"><span data-i18n="billing.pay.cardNumber">${te('billing.pay.cardNumber')}</span>
        <input name="number" required inputmode="numeric" autocomplete="cc-number" maxlength="23" placeholder="1234 5678 9012 3456" />
      </label>
      <label><span data-i18n="billing.pay.expiry">${te('billing.pay.expiry')}</span>
        <input name="expiry" required inputmode="numeric" autocomplete="cc-exp" maxlength="5" placeholder="MM/YY" pattern="(0[1-9]|1[0-2])/\\d{2}" />
      </label>
      <label><span data-i18n="billing.pay.cvv">${te('billing.pay.cvv')}</span>
        <input name="cvv" required inputmode="numeric" autocomplete="cc-csc" maxlength="4" placeholder="123" pattern="\\d{3,4}" />
      </label>
      <label class="sx-billing-pay__cardgrid-name"><span data-i18n="billing.pay.nameOnCard">${te('billing.pay.nameOnCard')}</span>
        <input name="holder" required autocomplete="cc-name" maxlength="40" minlength="2" placeholder="Name on card" />
      </label>
    </div>
    <label class="sx-billing-pay__switch">
      <input type="checkbox" name="saveCard" required checked />
      <span data-i18n="billing.pay.saveThisCard">${te('billing.pay.saveThisCard')}</span>
    </label>
    <p class="sx-billing-pay__note" data-i18n="billing.pay.cardSaveHint">${te('billing.pay.cardSaveHint')}</p>
    <button type="submit" class="sx-billing__btn sx-billing__btn--dark" data-i18n="billing.pay.saveCard">${te('billing.pay.saveCard')}</button>
  </form>
  <div class="sx-billing-cards">${cardRows(list)}</div>`
}

function bankPaneHtml(prefs: PayPrefs): string {
  const options = [
    `<option value="">${te('billing.pay.chooseBank')}</option>`,
    ...BANKS.map(
      ([id, name]) =>
        `<option value="${id}"${prefs.bank === id ? ' selected' : ''}>${escapeHtml(name)}</option>`,
    ),
  ].join('')
  return `<form class="sx-billing-pay__form" data-billing-bank-form>
    <div class="sx-billing-pay__pane-head">
      <div>
        <h3 data-i18n="billing.mode.netbanking">${te('billing.mode.netbanking')}</h3>
        ${payStatusHtml(Boolean(prefs.bank))}
      </div>
    </div>
    <label><span data-i18n="billing.pay.bank">${te('billing.pay.bank')}</span>
      <select name="bank" required>${options}</select>
    </label>
    <label><span data-i18n="billing.pay.accountRef">${te('billing.pay.accountRef')}</span>
      <input name="accountHint" maxlength="40" placeholder="${te('billing.pay.accountHint')}" value="${escapeHtml(prefs.accountHint)}" />
    </label>
    <p class="sx-billing-pay__note" data-i18n="billing.pay.localOnly">${te('billing.pay.localOnly')}</p>
    <button type="submit" class="sx-billing__btn sx-billing__btn--dark" data-i18n="billing.pay.saveBank">${te('billing.pay.saveBank')}</button>
  </form>`
}

function upiPaneHtml(prefs: PayPrefs): string {
  return `<form class="sx-billing-pay__form" data-billing-upi-form>
    <div class="sx-billing-pay__pane-head">
      <div>
        <h3 data-i18n="billing.mode.upi">${te('billing.mode.upi')}</h3>
        <p data-i18n="billing.pay.upiHint">${te('billing.pay.upiHint')}</p>
        ${payStatusHtml(Boolean(prefs.upiId))}
      </div>
    </div>
    <label><span data-i18n="billing.pay.upiId">${te('billing.pay.upiId')}</span>
      <input name="upiId" required maxlength="80" inputmode="email" autocomplete="off" placeholder="name@upi" pattern="^[^@\\s]+@[^@\\s]+$" value="${escapeHtml(prefs.upiId)}" />
    </label>
    <p class="sx-billing-pay__note" data-i18n="billing.pay.localOnly">${te('billing.pay.localOnly')}</p>
    <button type="submit" class="sx-billing__btn sx-billing__btn--dark" data-i18n="billing.pay.saveUpi">${te('billing.pay.saveUpi')}</button>
  </form>`
}

function autopayPaneHtml(prefs: PayPrefs): string {
  const options = AUTOPAY_FROMS.map((from) => {
    const key = payModeKey(from)
    return `<option value="${from}"${prefs.autopayFrom === from ? ' selected' : ''}>${te(key)}</option>`
  }).join('')
  return `<form class="sx-billing-pay__form" data-billing-autopay-form>
    <div class="sx-billing-pay__pane-head">
      <div>
        <h3 data-i18n="billing.mode.autopay">${te('billing.mode.autopay')}</h3>
        <p data-i18n="billing.pay.autopayLead">${te('billing.pay.autopayLead')}</p>
        ${payStatusHtml(prefs.autopay)}
      </div>
    </div>
    <label class="sx-billing-pay__switch">
      <input type="checkbox" name="autopay" ${prefs.autopay ? 'checked' : ''} />
      <span data-i18n="billing.pay.autopayToggle">${te('billing.pay.autopayToggle')}</span>
    </label>
    <label><span data-i18n="billing.pay.chargeFrom">${te('billing.pay.chargeFrom')}</span>
      <select name="autopayFrom">${options}</select>
    </label>
    <p class="sx-billing-pay__note" data-i18n="billing.pay.localOnly">${te('billing.pay.localOnly')}</p>
    <button type="submit" class="sx-billing__btn sx-billing__btn--dark" data-i18n="billing.pay.saveAutopay">${te('billing.pay.saveAutopay')}</button>
  </form>`
}

function payDetailHtml(prefs: PayPrefs, cards: SavedCard[]): string {
  if (prefs.mode === 'debit') return cardPaneHtml('debit', cards)
  if (prefs.mode === 'netbanking') return bankPaneHtml(prefs)
  if (prefs.mode === 'upi') return upiPaneHtml(prefs)
  if (prefs.mode === 'autopay') return autopayPaneHtml(prefs)
  return cardPaneHtml('credit', cards)
}

function methodSummary(prefs: PayPrefs, cards: SavedCard[]): string {
  if (prefs.mode === 'credit' || prefs.mode === 'debit') {
    const last = cardsOf(cards, prefs.mode).at(-1)
    return last ? `\u2022\u2022\u2022\u2022 ${escapeHtml(last.last4)}` : te('billing.pay.notSet')
  }
  if (prefs.mode === 'upi') return prefs.upiId ? escapeHtml(prefs.upiId) : te('billing.pay.notSet')
  if (prefs.mode === 'netbanking') {
    const bank = BANKS.find(([id]) => id === prefs.bank)?.[1]
    return bank ? escapeHtml(bank) : te('billing.pay.notSet')
  }
  return prefs.autopay ? te(payModeKey(prefs.autopayFrom)) : te('billing.pay.notSet')
}

function payModesHtml(prefs: PayPrefs, cards: SavedCard[]): string {
  const modes = PAY_MODES.map((mode) => {
    const key = payModeKey(mode)
    const active = prefs.mode === mode
    const ready = modeReady(mode, prefs, cards)
    return `<button type="button" class="sx-billing-pay__mode${active ? ' is-active' : ''}" role="tab" aria-selected="${active ? 'true' : 'false'}" data-billing-action="pay-mode" data-pay-mode="${mode}">
      <span class="sx-billing-pay__mode-icon">${payModeIcon(mode)}</span>
      <span data-i18n="${key}">${te(key)}</span>
      ${ready ? '<i class="sx-billing-pay__dot" title="Saved"></i>' : ''}
    </button>`
  }).join('')
  return `<section class="sx-billing-card sx-billing-pay" aria-labelledby="sx-billing-pay-title">
    <header class="sx-billing-pay__head">
      <div>
        <h2 id="sx-billing-pay-title" data-i18n="billing.pay.title">${te('billing.pay.title')}</h2>
        <p data-i18n="billing.pay.sub">${te('billing.pay.sub')}</p>
      </div>
    </header>
    <div class="sx-billing-pay__modes" role="tablist" aria-label="${te('billing.pay.title')}">${modes}</div>
    ${payDetailHtml(prefs, cards)}
  </section>`
}

function statsHtml(prefs: PayPrefs, cards: SavedCard[], tier: AccountTier, sub: BillingSubscription | null, invoiceCount: number): string {
  const cycle = sub?.cycle ? sub.cycle[0].toUpperCase() + sub.cycle.slice(1) : ''
  const planMeta = sub?.mrr ? `${money(sub.mrr)}${cycle ? ` \u00b7 ${escapeHtml(cycle)}` : ''}` : tier === 'free' ? te('billing.freeForever') : te('billing.noActiveBilling')
  const renews = sub?.currentPeriodEnd ? date(sub.currentPeriodEnd) : '\u2014'
  const renewMeta = sub?.status ? escapeHtml(sub.status[0].toUpperCase() + sub.status.slice(1)) : tier === 'free' ? te('billing.freeForever') : te('billing.noActiveBilling')
  const invoiceMeta = invoiceCount ? `${invoiceCount} on file` : te('billing.stats.noneYet')
  return `<section class="sx-billing-stats" aria-label="Billing summary">
    <article class="sx-billing-stats__item">
      <span class="sx-billing-stats__label" data-i18n="billing.stats.plan">${te('billing.stats.plan')}</span>
      <strong>${escapeHtml(planName(tier))}</strong>
      <em>${planMeta}</em>
    </article>
    <article class="sx-billing-stats__item">
      <span class="sx-billing-stats__label" data-i18n="billing.stats.renews">${te('billing.stats.renews')}</span>
      <strong>${renews}</strong>
      <em>${renewMeta}</em>
    </article>
    <article class="sx-billing-stats__item">
      <span class="sx-billing-stats__label" data-i18n="billing.stats.method">${te('billing.stats.method')}</span>
      <strong>${te(payModeKey(prefs.mode))}</strong>
      <em>${methodSummary(prefs, cards)}</em>
    </article>
    <article class="sx-billing-stats__item">
      <span class="sx-billing-stats__label" data-i18n="billing.stats.invoices">${te('billing.stats.invoices')}</span>
      <strong>${invoiceCount}</strong>
      <em>${invoiceMeta}</em>
    </article>
  </section>`
}

function addressHtml(address: BillingAddress | null, fallbackEmail: string): string {
  if (!address) {
    return `<div class="sx-billing__empty sx-billing__empty--address">
      <span class="sx-billing__empty-icon"><i class="fa-regular fa-address-card" aria-hidden="true"></i></span>
      <div>
        <strong>No billing information saved</strong>
        <p>Add your name, email, mobile number, address, and GST number for your records.</p>
      </div>
    </div>`
  }
  return `<article class="sx-billing-address">
    <div class="sx-billing-address__copy">
      <strong>${escapeHtml(address.name)}</strong>
      ${address.company ? `<p><span>Company</span>${escapeHtml(address.company)}</p>` : ''}
      <p><span>Email</span>${escapeHtml(address.email || fallbackEmail)}</p>
      ${address.mobile ? `<p><span>Mobile</span>${escapeHtml(address.mobile)}</p>` : ''}
      ${address.address ? `<p><span>Address</span>${escapeHtml(address.address)}</p>` : ''}
      ${address.taxId ? `<p><span>GST No.</span>${escapeHtml(address.taxId)}</p>` : ''}
    </div>
    <div class="sx-billing-address__actions">
      <button type="button" data-billing-action="delete-address"><i class="fa-regular fa-trash-can" aria-hidden="true"></i> Delete</button>
      <button type="button" data-billing-action="edit-address"><i class="fa-solid fa-pen" aria-hidden="true"></i> Edit</button>
    </div>
  </article>`
}

function invoiceRows(transactions: BillingTransaction[]): string {
  if (!transactions.length) {
    return `<div class="sx-billing__empty sx-billing__empty--compact">
      <span class="sx-billing__empty-icon"><i class="fa-regular fa-file-lines" aria-hidden="true"></i></span>
      <div><strong>${te('billing.noInvoicesYet')}</strong><p>${te('billing.noInvoicesSub')}</p></div>
    </div>`
  }
  return transactions
    .slice(0, 6)
    .map(
      (tx) => `<article class="sx-billing-invoice">
        <div>
          <strong>${date(tx.ts)}</strong>
          <span>#${escapeHtml(tx.id.slice(-10).toUpperCase())}</span>
        </div>
        <b>${money(tx.total)}</b>
        <button type="button" data-billing-action="invoice" data-transaction-id="${escapeHtml(tx.id)}" aria-label="Open invoice">
          <i class="fa-regular fa-file-pdf" aria-hidden="true"></i> PDF
        </button>
      </article>`,
    )
    .join('')
}

function transactionRows(transactions: BillingTransaction[]): string {
  if (!transactions.length) {
    return `<div class="sx-billing__empty">
      <span class="sx-billing__empty-icon"><i class="fa-solid fa-arrow-right-arrow-left" aria-hidden="true"></i></span>
      <div><strong>No transactions yet</strong><p>Your successful plan payments will be listed here.</p></div>
    </div>`
  }
  return transactions
    .map((tx) => {
      const positive = tx.status === 'paid'
      return `<article class="sx-billing-transaction">
        <span class="sx-billing-transaction__mark ${positive ? 'sx-billing-transaction__mark--in' : ''}">
          <i class="fa-solid ${positive ? 'fa-arrow-up' : 'fa-arrow-down'}" aria-hidden="true"></i>
        </span>
        <div class="sx-billing-transaction__copy">
          <strong>${escapeHtml(planName(tx.plan))}</strong>
          <span>${date(tx.ts, true)} · ${escapeHtml(methodLabel(tx.method))}</span>
        </div>
        <b class="${positive ? 'sx-billing-transaction__amount--in' : ''}">${positive ? '+' : '-'} ${money(tx.total)}</b>
      </article>`
    })
    .join('')
}

function addressDialogHtml(address: BillingAddress | null, auth: AuthUser | null): string {
  return `<div class="sx-billing-dialog" data-billing-dialog role="dialog" aria-modal="true" aria-labelledby="sx-billing-dialog-title">
    <button type="button" class="sx-billing-dialog__backdrop" data-billing-action="close-address" aria-label="Close"></button>
    <form class="sx-billing-dialog__panel" data-billing-address-form>
      <header>
        <div>
          <h3 id="sx-billing-dialog-title">Billing information</h3>
          <p>These details are stored locally on this device.</p>
        </div>
        <button type="button" class="sx-billing-dialog__x" data-billing-action="close-address" aria-label="Close">&times;</button>
      </header>
      <label>Full name<input name="name" required maxlength="80" value="${escapeHtml(address?.name ?? auth?.name ?? '')}" /></label>
      <label>Company name<input name="company" maxlength="100" value="${escapeHtml(address?.company ?? '')}" /></label>
      <label>Billing email<input name="email" type="email" required maxlength="120" value="${escapeHtml(address?.email ?? auth?.email ?? '')}" /></label>
      <label>Mobile number<input name="mobile" type="tel" maxlength="20" value="${escapeHtml(address?.mobile ?? '')}" /></label>
      <label>Address<textarea name="address" rows="2" maxlength="240">${escapeHtml(address?.address ?? '')}</textarea></label>
      <label>GST No. / Tax ID<input name="taxId" maxlength="40" value="${escapeHtml(address?.taxId ?? '')}" /></label>
      <footer>
        <button type="button" class="sx-billing__btn sx-billing__btn--ghost" data-billing-action="close-address">Cancel</button>
        <button type="submit" class="sx-billing__btn sx-billing__btn--dark">Save information</button>
      </footer>
    </form>
  </div>`
}

function openInvoice(tx: BillingTransaction, address: BillingAddress | null): void {
  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) return
  const subtotal = tx.baseAmount || tx.amount || tx.total
  win.document.write(`<!doctype html><html><head><title>Invoice ${escapeHtml(tx.id)}</title>
    <style>body{font-family:Arial,sans-serif;color:#172033;margin:48px}header{display:flex;justify-content:space-between;border-bottom:2px solid #172033;padding-bottom:20px}h1{margin:0}.meta{color:#667085}.box{margin-top:32px;padding:20px;background:#f5f5f5;border-radius:12px}.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #ddd}.total{font-size:20px;font-weight:700}button{margin-top:28px;padding:10px 18px;border:0;border-radius:8px;background:#172033;color:#fff}@media print{button{display:none}}</style>
    </head><body><header><div><h1>TRADENEU</h1><div class="meta">Billing invoice</div></div><div><strong>${escapeHtml(tx.id)}</strong><div class="meta">${date(tx.ts)}</div></div></header>
    <div class="box"><strong>Billed to</strong><p>${escapeHtml(address?.name || tx.email)}<br>${escapeHtml(address?.company || '')}<br>${escapeHtml(address?.email || tx.email)}${address?.taxId ? `<br>Tax ID: ${escapeHtml(address.taxId)}` : ''}</p></div>
    <div class="row"><span>${escapeHtml(planName(tx.plan))} · ${escapeHtml(tx.cycle)}</span><b>${money(subtotal)}</b></div>
    <div class="row"><span>Tax</span><b>${money(tx.taxAmount)}</b></div>
    <div class="row total"><span>Total paid</span><b>${money(tx.total)}</b></div>
    <p class="meta">Payment method: ${escapeHtml(methodLabel(tx.method))} · Status: ${escapeHtml(tx.status)}</p>
    <button onclick="window.print()">Print / Save PDF</button></body></html>`)
  win.document.close()
}

export function mountBillingPage(root: HTMLElement, opts: MountBillingPageOptions): () => void {
  let active = true
  let billing: MyBilling = { subscription: null, transactions: [], address: null }
  const auth = opts.getAuthUser()
  const email = auth?.email?.trim() || 'guest@tradeneu.local'
  let address = readAddress(email)
  let cards = readCards(email)
  let pay = readPay(email)

  root.innerHTML = `<section class="sx-billing" aria-labelledby="sx-billing-title">
    <header class="sx-billing__head">
      <div>
        <h1 id="sx-billing-title" data-i18n="billing.title">${te('billing.title')}</h1>
        <p data-i18n="billing.subtitle">${te('billing.subtitle')}</p>
      </div>
      <button type="button" class="sx-billing__btn sx-billing__btn--dark" data-billing-action="upgrade">
        <i class="fa-solid fa-crown" aria-hidden="true"></i> <span data-i18n="billing.managePlan">${te('billing.managePlan')}</span>
      </button>
    </header>
    <div class="sx-billing__loading" data-billing-loading><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> <span data-i18n="billing.loading">${te('billing.loading')}</span></div>
    <div class="sx-billing__content" data-billing-content hidden></div>
  </section>`

  const content = root.querySelector<HTMLElement>('[data-billing-content]')
  const loading = root.querySelector<HTMLElement>('[data-billing-loading]')

  const render = () => {
    if (!content) return
    const tier = opts.readTier()
    const sub: BillingSubscription | null = billing.subscription
    content.innerHTML = `${statsHtml(pay, cards, tier, sub, billing.transactions.length)}
    <div class="sx-billing__top-grid">
      ${payModesHtml(pay, cards)}

      <aside class="sx-billing-invoices">
        <header><h2 data-i18n="billing.invoices">${te('billing.invoices')}</h2><button type="button" data-billing-action="view-all" data-i18n="billing.viewAll">${te('billing.viewAll')}</button></header>
        <div>${invoiceRows(billing.transactions)}</div>
      </aside>
    </div>

    <div class="sx-billing__lower-grid">
      <section class="sx-billing-card">
        <header class="sx-billing-card__head">
          <div><h2 data-i18n="billing.info.title">${te('billing.info.title')}</h2><p data-i18n="billing.info.sub">${te('billing.info.sub')}</p></div>
          <button type="button" class="sx-billing__text-btn" data-billing-action="edit-address"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add</button>
        </header>
        <div data-billing-address>${addressHtml(address, email)}</div>
      </section>

      <section class="sx-billing-card" data-billing-transactions>
        <header class="sx-billing-card__head">
          <div><h2 data-i18n="billing.tx.title">${te('billing.tx.title')}</h2><p>${billing.transactions.length} completed payment${billing.transactions.length === 1 ? '' : 's'}</p></div>
          <span class="sx-billing-card__date"><i class="fa-regular fa-calendar" aria-hidden="true"></i>${billing.transactions.length ? `${date(billing.transactions.at(-1)?.ts)} – ${date(billing.transactions[0]?.ts)}` : te('billing.tx.none')}</span>
        </header>
        <div class="sx-billing-transactions">${transactionRows(billing.transactions)}</div>
      </section>
    </div>`
    content.hidden = false
    if (loading) loading.hidden = true
  }

  const onClick = (event: Event) => {
    const target = event.target as HTMLElement
    const actionEl = target.closest<HTMLElement>('[data-billing-action]')
    const action = actionEl?.dataset.billingAction
    if (!action) return
    if (action === 'upgrade') opts.onOpenSubscription()
    if (action === 'edit-address') {
      root.insertAdjacentHTML('beforeend', addressDialogHtml(address, auth))
      root.querySelector<HTMLInputElement>('[data-billing-address-form] input')?.focus()
    }
    if (action === 'close-address') root.querySelector('[data-billing-dialog]')?.remove()
    if (action === 'delete-address') {
      if (!window.confirm('Delete your saved billing information?')) return
      address = null
      writeAddress(email, null)
      render()
    }
    if (action === 'invoice') {
      const tx = billing.transactions.find((row) => row.id === actionEl?.dataset.transactionId)
      if (tx) openInvoice(tx, address)
    }
    if (action === 'view-all') {
      root.querySelector<HTMLElement>('[data-billing-transactions]')?.scrollIntoView({ behavior: 'smooth' })
    }
    if (action === 'pay-mode') {
      const next = actionEl?.dataset.payMode
      if (next === 'credit' || next === 'debit' || next === 'netbanking' || next === 'upi' || next === 'autopay') {
        pay = { ...pay, mode: next }
        writePay(email, pay)
        render()
      }
    }
    if (action === 'delete-card') {
      const id = actionEl?.dataset.cardId
      if (!id) return
      if (!window.confirm('Remove this saved card?')) return
      cards = cards.filter((c) => c.id !== id)
      writeCards(email, cards)
      root.querySelector('[data-billing-card-dialog]')?.remove()
      render()
    }
  }

  const onSubmit = (event: SubmitEvent) => {
    const addressForm = (event.target as HTMLElement).closest<HTMLFormElement>('[data-billing-address-form]')
    if (addressForm) {
      event.preventDefault()
      const data = new FormData(addressForm)
      address = {
        name: String(data.get('name') ?? '').trim(),
        company: String(data.get('company') ?? '').trim(),
        email: String(data.get('email') ?? '').trim(),
        mobile: String(data.get('mobile') ?? '').trim(),
        address: String(data.get('address') ?? '').trim(),
        taxId: String(data.get('taxId') ?? '').trim(),
      }
      writeAddress(email, address)
      root.querySelector('[data-billing-dialog]')?.remove()
      render()
      return
    }

    const cardForm = (event.target as HTMLElement).closest<HTMLFormElement>('[data-billing-inline-card-form]')
    if (cardForm) {
      event.preventDefault()
      const data = new FormData(cardForm)
      if (data.get('saveCard') !== 'on') return
      const digits = String(data.get('number') ?? '').replace(/\D/g, '')
      const expiry = String(data.get('expiry') ?? '').trim()
      const cvv = String(data.get('cvv') ?? '').replace(/\D/g, '')
      const holder = String(data.get('holder') ?? '').trim().slice(0, 40)
      const numberInput = cardForm.querySelector<HTMLInputElement>('input[name="number"]')
      if (!luhnOk(digits)) {
        numberInput?.setCustomValidity('Enter a valid card number')
        numberInput?.reportValidity()
        return
      }
      numberInput?.setCustomValidity('')
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry) || !/^\d{3,4}$/.test(cvv) || holder.length < 2) return
      const kind: CardKind = String(data.get('kind')) === 'debit' ? 'debit' : 'credit'
      const card: SavedCard = {
        id: newCardId(),
        brand: brandFromNumber(digits),
        last4: digits.slice(-4),
        expiry,
        nickname: holder,
        kind,
      }
      cards = [...cards, card]
      writeCards(email, cards)
      pay = { ...pay, mode: kind }
      writePay(email, pay)
      render()
      return
    }

    const bankForm = (event.target as HTMLElement).closest<HTMLFormElement>('[data-billing-bank-form]')
    if (bankForm) {
      event.preventDefault()
      const data = new FormData(bankForm)
      const bank = String(data.get('bank') ?? '')
      if (!BANKS.some(([id]) => id === bank)) return
      pay = {
        ...pay,
        mode: 'netbanking',
        bank,
        accountHint: String(data.get('accountHint') ?? '').trim().slice(0, 40),
      }
      writePay(email, pay)
      render()
      return
    }

    const upiForm = (event.target as HTMLElement).closest<HTMLFormElement>('[data-billing-upi-form]')
    if (upiForm) {
      event.preventDefault()
      const upiId = String(new FormData(upiForm).get('upiId') ?? '').trim().slice(0, 80)
      if (!/^[^@\s]+@[^@\s]+$/.test(upiId)) return
      pay = { ...pay, mode: 'upi', upiId }
      writePay(email, pay)
      render()
      return
    }

    const autopayForm = (event.target as HTMLElement).closest<HTMLFormElement>('[data-billing-autopay-form]')
    if (autopayForm) {
      event.preventDefault()
      const data = new FormData(autopayForm)
      const from = String(data.get('autopayFrom') ?? 'credit')
      pay = {
        ...pay,
        mode: 'autopay',
        autopay: data.get('autopay') === 'on',
        autopayFrom: AUTOPAY_FROMS.includes(from as AutopayFrom) ? (from as AutopayFrom) : 'credit',
      }
      writePay(email, pay)
      render()
    }
  }

  const onInput = (event: Event) => {
    const target = event.target as HTMLInputElement
    if (!(target instanceof HTMLInputElement) || !target.closest('[data-billing-inline-card-form]')) return
    if (target.name === 'number') {
      target.setCustomValidity('')
      const digits = target.value.replace(/\D/g, '').slice(0, 19)
      const grouped = digits.replace(/(\d{4})(?=\d)/g, '$1 ')
      if (target.value !== grouped) target.value = grouped
    } else if (target.name === 'expiry') {
      const digits = target.value.replace(/\D/g, '').slice(0, 4)
      const next = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
      if (target.value !== next) target.value = next
    } else if (target.name === 'cvv') {
      const next = target.value.replace(/\D/g, '').slice(0, 4)
      if (target.value !== next) target.value = next
    }
  }

  root.addEventListener('click', onClick)
  root.addEventListener('input', onInput)
  root.addEventListener('submit', onSubmit as EventListener)

  void fetchMyBilling().then((data) => {
    if (!active) return
    if (data) billing = data
    render()
  })

  // Header markup is static once the panel mounts, so re-render on locale
  // switch to pick up strings baked into `render()` via translate()/te().
  const unsubLocale = onLocaleChange(() => render())

  return () => {
    active = false
    unsubLocale()
    root.removeEventListener('click', onClick)
    root.removeEventListener('input', onInput)
    root.removeEventListener('submit', onSubmit as EventListener)
    root.replaceChildren()
  }
}
