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
  taxId: string
}

export type MountBillingPageOptions = {
  readTier: () => AccountTier
  getAuthUser: () => AuthUser | null
  onOpenSubscription: () => void
}

const ADDRESS_KEY = 'suplexity-billing-address-v1'

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
        <p>Add a billing name, company, email, and tax ID for your records.</p>
      </div>
      <button type="button" class="sx-billing__text-btn" data-billing-action="edit-address">Add details</button>
    </div>`
  }
  return `<article class="sx-billing-address">
    <div class="sx-billing-address__copy">
      <strong>${escapeHtml(address.name)}</strong>
      ${address.company ? `<p><span>Company</span>${escapeHtml(address.company)}</p>` : ''}
      <p><span>Email</span>${escapeHtml(address.email || fallbackEmail)}</p>
      ${address.taxId ? `<p><span>Tax ID</span>${escapeHtml(address.taxId)}</p>` : ''}
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
      <label>Billing name<input name="name" required maxlength="80" value="${escapeHtml(address?.name ?? auth?.name ?? '')}" /></label>
      <label>Company name<input name="company" maxlength="100" value="${escapeHtml(address?.company ?? '')}" /></label>
      <label>Billing email<input name="email" type="email" required maxlength="120" value="${escapeHtml(address?.email ?? auth?.email ?? '')}" /></label>
      <label>Tax / VAT number<input name="taxId" maxlength="40" value="${escapeHtml(address?.taxId ?? '')}" /></label>
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
  let billing: MyBilling = { subscription: null, transactions: [] }
  const auth = opts.getAuthUser()
  const email = auth?.email?.trim() || 'guest@tradeneu.local'
  let address = readAddress(email)

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
        <div class="sx-billing-plan__brand">
          <span>TN</span><strong>TRADENEU</strong>
        </div>
        <div class="sx-billing-plan__label">Current plan</div>
        <h2>${escapeHtml(planName(tier))}</h2>
        <div class="sx-billing-plan__meta">
          <span>${escapeHtml(cycle)}</span>
          <span>${sub?.currentPeriodEnd ? `Renews ${date(sub.currentPeriodEnd)}` : tier === 'free' ? 'Free forever' : 'Billing status unavailable'}</span>
        </div>
      </article>

      <article class="sx-billing-summary">
        <span class="sx-billing-summary__icon"><i class="${methodIcon(latest?.method)}" aria-hidden="true"></i></span>
        <span class="sx-billing-summary__eyebrow">Payment method</span>
        <h3>${latest ? escapeHtml(methodLabel(latest.method)) : 'Not added'}</h3>
        <p>${latest ? `Last used ${date(latest.ts)}` : 'A payment method appears after checkout.'}</p>
      </article>

      <aside class="sx-billing-invoices">
        <header><h2>Invoices</h2><button type="button" data-billing-action="view-all">View all</button></header>
        <div>${invoiceRows(billing.transactions)}</div>
      </aside>
    </div>

    <div class="sx-billing__lower-grid">
      <section class="sx-billing-card">
        <header class="sx-billing-card__head">
          <div><h2>Billing Information</h2><p>Details used on your printable invoices.</p></div>
          ${address ? '<button type="button" class="sx-billing__text-btn" data-billing-action="edit-address"><i class="fa-solid fa-pen" aria-hidden="true"></i> Edit</button>' : ''}
        </header>
        <div data-billing-address>${addressHtml(address, email)}</div>
      </section>

      <section class="sx-billing-card" data-billing-transactions>
        <header class="sx-billing-card__head">
          <div><h2>Your Transactions</h2><p>${billing.transactions.length} completed payment${billing.transactions.length === 1 ? '' : 's'}</p></div>
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
  }

  const onSubmit = (event: SubmitEvent) => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>('[data-billing-address-form]')
    if (!form) return
    event.preventDefault()
    const data = new FormData(form)
    address = {
      name: String(data.get('name') ?? '').trim(),
      company: String(data.get('company') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      taxId: String(data.get('taxId') ?? '').trim(),
    }
    writeAddress(email, address)
    root.querySelector('[data-billing-dialog]')?.remove()
    render()
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
