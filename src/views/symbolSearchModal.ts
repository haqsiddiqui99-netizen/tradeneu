import { ASSET_CATALOG, findAsset, type CatalogAsset } from '../assetCatalog'
import { icons } from '../icons'
import './symbolSearchModal.css'

type TvTab =
  | 'all'
  | 'stocks'
  | 'funds'
  | 'futures'
  | 'forex'
  | 'crypto'
  | 'indices'
  | 'bonds'
  | 'economy'
  | 'options'

const TV_TABS: { id: TvTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'funds', label: 'Funds' },
  { id: 'futures', label: 'Futures' },
  { id: 'forex', label: 'Forex' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'indices', label: 'Indices' },
  { id: 'bonds', label: 'Bonds' },
  { id: 'economy', label: 'Economy' },
  { id: 'options', label: 'Options' },
]

function tabMatchesAsset(tab: TvTab, a: CatalogAsset): boolean {
  if (tab === 'all') return true
  if (tab === 'stocks') return a.category === 'stocks'
  if (tab === 'forex') return a.category === 'forex'
  if (tab === 'crypto') return a.category === 'crypto'
  if (tab === 'indices') return a.category === 'indices'
  if (tab === 'futures')
    return a.category === 'futures' || a.category === 'metals' || a.category === 'energies' || a.category === 'agriculture'
  if (tab === 'funds' || tab === 'bonds' || tab === 'economy' || tab === 'options') return false
  return false
}

function rowMeta(a: CatalogAsset): string {
  const cat = a.category
  if (a.badge?.kind === 'broker') {
    const sub = a.badge.sub ? ` ${a.badge.sub}` : ''
    return `${cat} · ${a.badge.label}${sub}`
  }
  if (a.badge?.kind === 'pro') {
    return `${cat} · ${a.badge.sub ?? a.badge.label}`
  }
  return cat
}

function exchangeLabel(a: CatalogAsset): string {
  if (a.badge?.kind === 'broker') return a.badge.label
  if (a.badge?.kind === 'pro') return a.badge.sub ?? a.badge.label
  return '—'
}

function exchangeInitial(a: CatalogAsset): string {
  const s = exchangeLabel(a).replace(/[^A-Za-z]/g, '')
  return s ? s.slice(0, 1).toUpperCase() : '?'
}

function rowIconLetter(a: CatalogAsset): string {
  const u = a.symbol.toUpperCase()
  if (a.category === 'crypto') return '₿'
  if (a.category === 'metals') return 'Au'
  if (u.length <= 2) return u
  return u.slice(0, 1)
}

function el(html: string): HTMLElement {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild as HTMLElement
}

export type SymbolSearchModalApi = {
  open: () => void
  close: () => void
  dispose: () => void
}

const PANEL_HTML = `
  <div class="rw-symsearch__panel" role="document">
    <div class="rw-symsearch__head">
      <h2 class="rw-symsearch__title" id="rw-symsearch-title">Symbol search</h2>
      <button type="button" class="rw-symsearch__close" aria-label="Close">${icons.close}</button>
    </div>
    <div class="rw-symsearch__search">
      <span class="rw-symsearch__search-ico">${icons.search}</span>
      <input type="text" class="rw-symsearch__input" autocomplete="off" spellcheck="false" placeholder="Symbol, ISIN, or CUSIP" aria-label="Search symbols" />
      <button type="button" class="rw-symsearch__clear" aria-label="Clear search" hidden>×</button>
      <span class="rw-symsearch__kbd" title="Keyboard layout">⌨</span>
    </div>
    <div class="rw-symsearch__tabs" role="tablist" aria-label="Category"></div>
    <div class="rw-symsearch__filters" aria-hidden="true">
      <span class="rw-symsearch__fake-dd">All sources ${icons.chevronDown}</span>
      <span class="rw-symsearch__fake-dd">All types ${icons.chevronDown}</span>
      <span class="rw-symsearch__fake-dd">All exchange types ${icons.chevronDown}</span>
    </div>
    <div class="rw-symsearch__listwrap">
      <div class="rw-symsearch__list" role="listbox" aria-label="Symbols"></div>
    </div>
    <p class="rw-symsearch__hint">Search using ISIN and CUSIP codes</p>
  </div>
`

export function createSymbolSearchModal(opts: {
  getCurrentSymbol: () => string
  onPick: (symbol: string) => void
  /** Dialog element in the chart DOM — must stay connected for showModal(). */
  dialog: HTMLDialogElement
}): SymbolSearchModalApi {
  const dlg = opts.dialog
  if (!dlg.querySelector('.rw-symsearch__panel')) {
    dlg.innerHTML = PANEL_HTML
  }

  const btnClose = dlg.querySelector('.rw-symsearch__close') as HTMLButtonElement
  const input = dlg.querySelector('.rw-symsearch__input') as HTMLInputElement
  const btnClear = dlg.querySelector('.rw-symsearch__clear') as HTMLButtonElement
  const tabsEl = dlg.querySelector('.rw-symsearch__tabs') as HTMLElement
  const listEl = dlg.querySelector('.rw-symsearch__list') as HTMLElement

  let activeTab: TvTab = 'all'
  let selectedSymbol: string | null = null

  for (const { id, label } of TV_TABS) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'rw-symsearch__tab' + (id === 'all' ? ' rw-symsearch__tab--on' : '')
    b.dataset.tab = id
    b.textContent = label
    b.setAttribute('role', 'tab')
    b.setAttribute('aria-selected', id === 'all' ? 'true' : 'false')
    tabsEl.appendChild(b)
  }

  function syncTabUi() {
    tabsEl.querySelectorAll('.rw-symsearch__tab').forEach((n) => {
      const el = n as HTMLButtonElement
      const id = el.dataset.tab as TvTab
      const on = id === activeTab
      el.classList.toggle('rw-symsearch__tab--on', on)
      el.setAttribute('aria-selected', on ? 'true' : 'false')
    })
  }

  function filteredAssets(): CatalogAsset[] {
    const q = input.value.trim().toLowerCase()
    let rows = ASSET_CATALOG.filter((a) => tabMatchesAsset(activeTab, a))
    if (q) {
      rows = rows.filter(
        (a) =>
          a.symbol.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          rowMeta(a).toLowerCase().includes(q),
      )
    }
    rows.sort((a, b) => a.symbol.localeCompare(b.symbol))
    return rows
  }

  function renderList() {
    listEl.replaceChildren()
    const rows = filteredAssets()
    const cur = opts.getCurrentSymbol().trim().toUpperCase()

    if (!rows.length) {
      const empty = document.createElement('p')
      empty.className = 'rw-symsearch__empty'
      empty.textContent =
        activeTab === 'funds' || activeTab === 'bonds' || activeTab === 'economy' || activeTab === 'options'
          ? 'No symbols in this category yet.'
          : 'No symbols match your search.'
      listEl.appendChild(empty)
      selectedSymbol = null
      return
    }

    for (const a of rows) {
      const ex = exchangeLabel(a)
      const row = el(`
        <button type="button" class="rw-symsearch__row" role="option" data-symbol="${a.symbol}">
          <span class="rw-symsearch__ico" aria-hidden="true">${rowIconLetter(a)}</span>
          <span class="rw-symsearch__row-mid">
            <span class="rw-symsearch__sym">${a.symbol}</span>
            <span class="rw-symsearch__name">${a.name}</span>
            <span class="rw-symsearch__submeta">${rowMeta(a)}</span>
          </span>
          <span class="rw-symsearch__excell">
            <span class="rw-symsearch__exname">${ex}</span>
            <span class="rw-symsearch__exlogo" aria-hidden="true">${exchangeInitial(a)}</span>
          </span>
        </button>
      `) as HTMLButtonElement
      if (a.symbol.toUpperCase() === cur) {
        row.classList.add('rw-symsearch__row--active')
        selectedSymbol = a.symbol
      }
      listEl.appendChild(row)
    }

    if (!listEl.querySelector('.rw-symsearch__row--active')) {
      const first = listEl.querySelector('.rw-symsearch__row') as HTMLButtonElement | null
      first?.classList.add('rw-symsearch__row--active')
      selectedSymbol = first?.dataset.symbol ?? rows[0]!.symbol
    }
  }

  function setTab(tab: TvTab) {
    activeTab = tab
    syncTabUi()
    renderList()
  }

  function onRowClick(e: Event) {
    const t = (e.target as HTMLElement).closest('.rw-symsearch__row') as HTMLButtonElement | null
    if (!t?.dataset.symbol) return
    listEl.querySelectorAll('.rw-symsearch__row').forEach((r) => r.classList.remove('rw-symsearch__row--active'))
    t.classList.add('rw-symsearch__row--active')
    selectedSymbol = t.dataset.symbol
    opts.onPick(selectedSymbol)
    close()
  }

  function onTabClick(e: Event) {
    const b = (e.target as HTMLElement).closest('[data-tab]') as HTMLButtonElement | null
    const id = b?.dataset.tab as TvTab | undefined
    if (!id) return
    setTab(id)
  }

  function syncClearVisible() {
    const has = input.value.trim().length > 0
    btnClear.hidden = !has
    btnClear.style.display = has ? '' : 'none'
  }

  const onInput = () => {
    syncClearVisible()
    renderList()
  }

  function onDocKeyDown(e: KeyboardEvent) {
    if (dlg.open && e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  function onInputKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && selectedSymbol) {
      e.preventDefault()
      opts.onPick(selectedSymbol)
      close()
    }
  }

  function onClearClick() {
    input.value = ''
    syncClearVisible()
    renderList()
    input.focus()
  }

  function onBtnCloseClick() {
    close()
  }

  function onDialogCancel(e: Event) {
    e.preventDefault()
    close()
  }

  tabsEl.addEventListener('click', onTabClick)
  listEl.addEventListener('click', onRowClick)
  input.addEventListener('input', onInput)
  input.addEventListener('keydown', onInputKeyDown)
  document.addEventListener('keydown', onDocKeyDown, true)
  btnClose.addEventListener('click', onBtnCloseClick)
  dlg.addEventListener('cancel', onDialogCancel)
  btnClear.addEventListener('click', onClearClick)

  function open() {
    if (!dlg.isConnected) {
      console.error('[SymbolSearch] dialog is not in the document')
      return
    }
    if (!dlg.open) dlg.showModal()
    const cur = opts.getCurrentSymbol().trim().toUpperCase()
    input.value = cur
    syncClearVisible()
    activeTab = 'all'
    if (findAsset(cur)) {
      const order: TvTab[] = ['forex', 'crypto', 'indices', 'stocks', 'futures', 'all']
      for (const t of order) {
        if (ASSET_CATALOG.some((a) => a.symbol.toUpperCase() === cur && tabMatchesAsset(t, a))) {
          activeTab = t
          break
        }
      }
    }
    syncTabUi()
    renderList()
    requestAnimationFrame(() => {
      input.focus()
      input.select()
    })
  }

  function close() {
    if (dlg.open) dlg.close()
  }

  function dispose() {
    tabsEl.removeEventListener('click', onTabClick)
    listEl.removeEventListener('click', onRowClick)
    input.removeEventListener('input', onInput)
    input.removeEventListener('keydown', onInputKeyDown)
    btnClear.removeEventListener('click', onClearClick)
    btnClose.removeEventListener('click', onBtnCloseClick)
    dlg.removeEventListener('cancel', onDialogCancel)
    document.removeEventListener('keydown', onDocKeyDown, true)
    close()
  }

  return { open, close, dispose }
}
