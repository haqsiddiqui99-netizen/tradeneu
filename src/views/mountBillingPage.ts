import './billingPage.css'
import type { AuthUser } from '../auth/authSession'
import {
  fetchMyBilling,
  type BillingSubscription,
  type BillingTransaction,
  type MyBilling,
} from '../billing/billingApi'
import type { AccountTier } from './mountSubscriptionPage'

type BillingAddress = {
  name: string
  company: string
  email: string
  mobile: string
  address: string
  taxId: string
}

type SavedCard = {
  id: string
  brand: 'visa' | 'mastercard' | 'amex' | 'other'
  last4: string
  expiry: string
  nickname: string
}

export type MountBillingPageOptions = {
  readTier: () => AccountTier
  getAuthUser: () => AuthUser | null
  onOpenSubscription: () => void
}

const ADDRESS_KEY = 'suplexity-billing-address-v1'
const CARDS_KEY = 'suplexity-billing-cards-v1'

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
  if (tier === 'pro') return 'Premium Plan'
  if (tier === 'intermediate') return 'Ultra Plan'
  return 'Basic Plan'
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

/**
 * Stable, deterministic 16-digit "member number" derived from the account
 * email — used purely as the decorative number on the plan card visual.
 * Not a real card/account number.
 */
function memberNumber(email: string): string {
  function hash(seed: number, str: string): number {
    let h = seed >>> 0
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 2654435761) >>> 0
    }
    return h >>> 0
  }
  const a = String(hash(17, email) % 100000000).padStart(8, '0')
  const b = String(hash(2166136261, `${email}::sx`) % 100000000).padStart(8, '0')
  const digits = (a + b).slice(0, 16)
  return (digits.match(/.{1,4}/g) ?? []).join(' ')
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
      <div><strong>No saved cards yet</strong><p>Add a card for your own reference — stored on this device only.</p></div>
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
        <button type="button" class="sx-billing-savedcard__edit" data-billing-action="edit-card" data-card-id="${escapeHtml(c.id)}" aria-label="Edit card">
          <i class="fa-solid fa-pen" aria-hidden="true"></i>
        </button>
      </article>`,
    )
    .join('')
}

function cardDialogHtml(card: SavedCard | null): string {
  return `<div class="sx-billing-dialog" data-billing-card-dialog role="dialog" aria-modal="true" aria-labelledby="sx-billing-card-dialog-title">
    <button type="button" class="sx-billing-dialog__backdrop" data-billing-action="close-card" aria-label="Close"></button>
    <form class="sx-billing-dialog__panel" data-billing-card-form>
      <header>
        <div>
          <h3 id="sx-billing-card-dialog-title">${card ? 'Edit card' : 'Add new card'}</h3>
          <p>For your own records \u2014 stored on this device, never sent anywhere.</p>
        </div>
        <button type="button" class="sx-billing-dialog__x" data-billing-action="close-card" aria-label="Close">&times;</button>
      </header>
      <label>Card brand
        <select name="brand">
          <option value="visa" ${card?.brand === 'visa' ? 'selected' : ''}>Visa</option>
          <option value="mastercard" ${card?.brand === 'mastercard' ? 'selected' : ''}>Mastercard</option>
          <option value="amex" ${card?.brand === 'amex' ? 'selected' : ''}>Amex</option>
          <option value="other" ${!card || card.brand === 'other' ? 'selected' : ''}>Other</option>
        </select>
      </label>
      <label>Last 4 digits<input name="last4" required maxlength="4" pattern="[0-9]{4}" inputmode="numeric" placeholder="7852" value="${escapeHtml(card?.last4 ?? '')}" /></label>
      <label>Expiry (MM/YY)<input name="expiry" maxlength="5" placeholder="11/22" value="${escapeHtml(card?.expiry ?? '')}" /></label>
      <label>Nickname<input name="nickname" maxlength="40" placeholder="e.g. Personal card" value="${escapeHtml(card?.nickname ?? '')}" /></label>
      <footer>
        ${card ? '<button type="button" class="sx-billing__text-btn sx-billing__text-btn--danger" data-billing-action="delete-card" data-card-id="' + escapeHtml(card.id) + '">Remove card</button>' : '<span></span>'}
        <div style="display:flex;gap:0.6rem;">
          <button type="button" class="sx-billing__btn sx-billing__btn--ghost" data-billing-action="close-card">Cancel</button>
          <button type="submit" class="sx-billing__btn sx-billing__btn--dark">Save card</button>
        </div>
      </footer>
    </form>
  </div>`
}

function methodLabel(method: string | undefined): string {
  if (method === 'paypal') return 'PayPal'
  if (method === 'upi') return 'UPI'
  return 'Card'
}

function methodIcon(method: string | undefined): string {
  if (method === 'paypal') return 'fa-brands fa-paypal'
  if (method === 'upi') return 'fa-solid fa-mobile-screen-button'
  return 'fa-regular fa-credit-card'
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
      <div><strong>No invoices yet</strong><p>Completed checkouts will appear here.</p></div>
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

  root.innerHTML = `<section class="sx-billing" aria-labelledby="sx-billing-title">
    <header class="sx-billing__head">
      <div>
        <h1 id="sx-billing-title">Billing</h1>
        <p>Manage your plan, billing details, invoices, and payment history.</p>
      </div>
      <button type="button" class="sx-billing__btn sx-billing__btn--dark" data-billing-action="upgrade">
        <i class="fa-solid fa-crown" aria-hidden="true"></i> Manage plan
      </button>
    </header>
    <div class="sx-billing__loading" data-billing-loading><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Loading billing details…</div>
    <div class="sx-billing__content" data-billing-content hidden></div>
  </section>`

  const content = root.querySelector<HTMLElement>('[data-billing-content]')
  const loading = root.querySelector<HTMLElement>('[data-billing-loading]')

  const render = () => {
    if (!content) return
    const tier = opts.readTier()
    const sub: BillingSubscription | null = billing.subscription
    const latest = billing.transactions[0]
    const cycle = sub?.cycle ? sub.cycle[0].toUpperCase() + sub.cycle.slice(1) : 'No billing cycle'
    content.innerHTML = `<div class="sx-billing__top-grid">
      <article class="sx-billing-plan">
        <div class="sx-billing-plan__top">
          <div class="sx-billing-plan__brand">
            <span>TN</span><strong>TRADENEU</strong>
          </div>
          <span class="sx-billing-plan__tier">${escapeHtml(planName(tier))}</span>
        </div>
        <i class="fa-solid fa-wifi sx-billing-plan__wifi" aria-hidden="true"></i>
        <div class="sx-billing-plan__number">${memberNumber(email)}</div>
        <div class="sx-billing-plan__footer">
          <div>
            <span>Card Holder</span>
            <strong>${escapeHtml(auth?.name || 'Member')}</strong>
          </div>
          <div>
            <span>Renews</span>
            <strong>${sub?.currentPeriodEnd ? date(sub.currentPeriodEnd) : tier === 'free' ? 'Free' : '\u2014'}</strong>
          </div>
        </div>
        <i class="fa-brands fa-cc-mastercard sx-billing-plan__scheme" aria-hidden="true" title="Dummy card design"></i>
      </article>

      <article class="sx-billing-summary">
        <span class="sx-billing-summary__icon"><i class="fa-solid fa-building-columns" aria-hidden="true"></i></span>
        <span class="sx-billing-summary__eyebrow">Plan cost</span>
        <h3>${sub?.mrr ? money(sub.mrr) : escapeHtml(planName(tier))}</h3>
        <p>${sub?.mrr ? `Billed ${escapeHtml(cycle.toLowerCase())}` : tier === 'free' ? 'Free forever' : 'No active billing'}</p>
      </article>

      <article class="sx-billing-summary">
        <span class="sx-billing-summary__icon"><i class="${methodIcon(latest?.method)}" aria-hidden="true"></i></span>
        <span class="sx-billing-summary__eyebrow">Payment method</span>
        <h3>${latest ? escapeHtml(methodLabel(latest.method)) : 'Not added'}</h3>
        <p>${latest ? `${money(latest.total)} \u00b7 ${date(latest.ts)}` : 'A payment method appears after checkout.'}</p>
      </article>

      <aside class="sx-billing-invoices">
        <header><h2>Invoices</h2><button type="button" data-billing-action="view-all">View all</button></header>
        <div>${invoiceRows(billing.transactions)}</div>
      </aside>

      <section class="sx-billing-card sx-billing-card--payment">
        <header class="sx-billing-card__head">
          <div><h2>Payment Method</h2><p>Saved cards for your own reference \u2014 kept on this device only.</p></div>
          <button type="button" class="sx-billing__btn sx-billing__btn--dark" data-billing-action="add-card">
            <i class="fa-solid fa-plus" aria-hidden="true"></i> Add New Card
          </button>
        </header>
        <div class="sx-billing-cards" data-billing-cards>${cardRows(cards)}</div>
      </section>
    </div>

    <div class="sx-billing__lower-grid">
      <section class="sx-billing-card">
        <header class="sx-billing-card__head">
          <div><h2>Billing Information</h2><p>Details used on your printable invoices.</p></div>
          <button type="button" class="sx-billing__text-btn" data-billing-action="edit-address"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add</button>
        </header>
        <div data-billing-address>${addressHtml(address, email)}</div>
      </section>

      <section class="sx-billing-card" data-billing-transactions>
        <header class="sx-billing-card__head">
          <div><h2>Your Transaction's</h2><p>${billing.transactions.length} completed payment${billing.transactions.length === 1 ? '' : 's'}</p></div>
          <span class="sx-billing-card__date"><i class="fa-regular fa-calendar" aria-hidden="true"></i>${billing.transactions.length ? `${date(billing.transactions.at(-1)?.ts)} – ${date(billing.transactions[0]?.ts)}` : 'No activity'}</span>
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
    if (action === 'add-card') {
      root.insertAdjacentHTML('beforeend', cardDialogHtml(null))
      root.querySelector<HTMLInputElement>('[data-billing-card-form] input')?.focus()
    }
    if (action === 'edit-card') {
      const cardEl = cards.find((c) => c.id === actionEl?.dataset.cardId)
      if (cardEl) {
        root.insertAdjacentHTML('beforeend', cardDialogHtml(cardEl))
        root.querySelector<HTMLInputElement>('[data-billing-card-form] input')?.focus()
      }
    }
    if (action === 'close-card') root.querySelector('[data-billing-card-dialog]')?.remove()
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

    const cardForm = (event.target as HTMLElement).closest<HTMLFormElement>('[data-billing-card-form]')
    if (cardForm) {
      event.preventDefault()
      const data = new FormData(cardForm)
      const last4 = String(data.get('last4') ?? '').replace(/\D/g, '').slice(-4).padStart(4, '0')
      const editingId = root.querySelector<HTMLElement>('[data-billing-action="delete-card"]')?.dataset.cardId
      const card: SavedCard = {
        id: editingId ?? newCardId(),
        brand: (String(data.get('brand') ?? 'other') as SavedCard['brand']) || 'other',
        last4,
        expiry: String(data.get('expiry') ?? '').trim(),
        nickname: String(data.get('nickname') ?? '').trim(),
      }
      cards = editingId ? cards.map((c) => (c.id === editingId ? card : c)) : [...cards, card]
      writeCards(email, cards)
      root.querySelector('[data-billing-card-dialog]')?.remove()
      render()
    }
  }

  root.addEventListener('click', onClick)
  root.addEventListener('submit', onSubmit as EventListener)

  void fetchMyBilling().then((data) => {
    if (!active) return
    if (data) billing = data
    render()
  })

  return () => {
    active = false
    root.removeEventListener('click', onClick)
    root.removeEventListener('submit', onSubmit as EventListener)
    root.replaceChildren()
  }
}
