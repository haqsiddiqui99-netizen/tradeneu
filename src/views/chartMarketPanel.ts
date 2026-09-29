import './chartMarketPanel.css'
import { ASSET_CATALOG, RECENT_SYMBOLS, catalogMarketDataLabel, findAsset, type CatalogAsset } from '../assetCatalog'

export type ChartMarketPanelOptions = {
  /** Grid parent the panel becomes a column of — `.rw-chart-wrap`. */
  mount: HTMLElement
  getSymbol: () => string
  onPickSymbol: (symbol: string) => void
  /** Fired after the panel opens or closes so the chart can re-measure. */
  onToggle: (open: boolean) => void
}

export type ChartMarketPanelApi = {
  isOpen: () => boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  /** Repaint after a symbol change elsewhere (header search, session switch). */
  refresh: () => void
  dispose: () => void
}

const OPEN_STORAGE_KEY = 'suplexity-chart-side-panel-open'
const TAB_STORAGE_KEY = 'suplexity-chart-side-panel-tab'

type PanelTab = 'watchlist' | 'details'

function readStoredOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function readStoredTab(): PanelTab {
  try {
    return localStorage.getItem(TAB_STORAGE_KEY) === 'details' ? 'details' : 'watchlist'
  } catch {
    return 'watchlist'
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode */
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'))
}

const CATEGORY_LABELS: Record<CatalogAsset['category'], string> = {
  stocks: 'Stocks',
  futures: 'Futures',
  forex: 'Forex',
  crypto: 'Crypto',
  indices: 'Indices',
  metals: 'Metals',
  energies: 'Energies',
  agriculture: 'Agriculture',
}

/** Recently used first, then the rest of the catalog in its declared order. */
function orderedCatalog(): CatalogAsset[] {
  const recent: CatalogAsset[] = []
  for (const symbol of RECENT_SYMBOLS) {
    const asset = findAsset(symbol)
    if (asset) recent.push(asset)
  }
  const rest = ASSET_CATALOG.filter((a) => !recent.includes(a))
  return [...recent, ...rest]
}

export function createChartMarketPanel(opts: ChartMarketPanelOptions): ChartMarketPanelApi {
  let open = readStoredOpen()
  let tab = readStoredTab()
  let query = ''

  const panel = document.createElement('aside')
  panel.className = 'rw-mkt-panel'
  panel.dataset.rwMarketPanel = ''
  panel.setAttribute('aria-label', 'Market panel')
  panel.innerHTML = `
    <div class="rw-mkt-panel__tabs" role="tablist" aria-label="Market panel sections">
      <button type="button" class="rw-mkt-panel__tab" role="tab" data-rw-mkt-tab="watchlist">Watchlist</button>
      <button type="button" class="rw-mkt-panel__tab" role="tab" data-rw-mkt-tab="details">Details</button>
    </div>
    <div class="rw-mkt-panel__search" data-rw-mkt-search-wrap>
      <input
        type="search"
        class="rw-mkt-panel__search-input"
        data-rw-mkt-search
        placeholder="Filter symbols"
        aria-label="Filter symbols"
        autocomplete="off"
      />
    </div>
    <div class="rw-mkt-panel__body" data-rw-mkt-body role="tabpanel"></div>
  `
  opts.mount.appendChild(panel)

  const tabButtons = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-rw-mkt-tab]'))
  const searchWrap = panel.querySelector('[data-rw-mkt-search-wrap]') as HTMLElement
  const searchInput = panel.querySelector('[data-rw-mkt-search]') as HTMLInputElement
  const body = panel.querySelector('[data-rw-mkt-body]') as HTMLElement

  function renderWatchlist() {
    const active = opts.getSymbol().trim().toUpperCase()
    const needle = query.trim().toLowerCase()
    const rows = orderedCatalog().filter(
      (a) => !needle || a.symbol.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle),
    )
    if (!rows.length) {
      body.innerHTML = `<p class="rw-mkt-panel__empty">No symbols match “${escapeHtml(query)}”.</p>`
      return
    }
    body.innerHTML = `<ul class="rw-mkt-list">${rows
      .map(
        (a) => `<li>
          <button
            type="button"
            class="rw-mkt-row${a.symbol.toUpperCase() === active ? ' rw-mkt-row--active' : ''}"
            data-rw-mkt-symbol="${escapeHtml(a.symbol)}"
            ${a.symbol.toUpperCase() === active ? 'aria-current="true"' : ''}
          >
            <span class="rw-mkt-row__sym">${escapeHtml(a.symbol)}</span>
            <span class="rw-mkt-row__name">${escapeHtml(a.name)}</span>
            <span class="rw-mkt-row__src">${escapeHtml(catalogMarketDataLabel(a.symbol))}</span>
          </button>
        </li>`,
      )
      .join('')}</ul>`
  }

  function renderDetails() {
    const symbol = opts.getSymbol().trim().toUpperCase()
    const asset = findAsset(symbol)
    const facts: Array<[string, string]> = [
      ['Symbol', symbol || '—'],
      ['Description', asset?.name ?? '—'],
      ['Category', asset ? CATEGORY_LABELS[asset.category] : '—'],
      ['Data source', catalogMarketDataLabel(symbol)],
    ]
    const badge = asset?.badge
    if (badge?.kind === 'pro') {
      facts.push(['Access', badge.label])
      if (badge.sub) facts.push(['Market', badge.sub])
    } else if (badge?.sub) {
      // A broker badge's label just repeats the data source; only the note adds anything.
      facts.push(['Coverage', badge.sub])
    }
    body.innerHTML = `<dl class="rw-mkt-facts">${facts
      .map(
        ([term, value]) =>
          `<div class="rw-mkt-facts__row"><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`,
      )
      .join('')}</dl>`
  }

  function render() {
    for (const btn of tabButtons) {
      const selected = btn.dataset.rwMktTab === tab
      btn.classList.toggle('rw-mkt-panel__tab--active', selected)
      btn.setAttribute('aria-selected', selected ? 'true' : 'false')
    }
    searchWrap.hidden = tab !== 'watchlist'
    if (tab === 'watchlist') renderWatchlist()
    else renderDetails()
  }

  function setOpen(next: boolean) {
    if (open === next) return
    open = next
    store(OPEN_STORAGE_KEY, open ? '1' : '0')
    panel.hidden = !open
    opts.mount.classList.toggle('rw-chart-wrap--panel-open', open)
    if (open) render()
    opts.onToggle(open)
  }

  const onTabClick = (e: Event) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-rw-mkt-tab]')
    if (!btn) return
    tab = btn.dataset.rwMktTab === 'details' ? 'details' : 'watchlist'
    store(TAB_STORAGE_KEY, tab)
    render()
  }

  const onBodyClick = (e: Event) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-rw-mkt-symbol]')
    const symbol = row?.dataset.rwMktSymbol
    if (!symbol) return
    opts.onPickSymbol(symbol)
    render()
  }

  const onSearch = () => {
    query = searchInput.value
    renderWatchlist()
  }

  panel.addEventListener('click', onTabClick)
  body.addEventListener('click', onBodyClick)
  searchInput.addEventListener('input', onSearch)

  panel.hidden = !open
  opts.mount.classList.toggle('rw-chart-wrap--panel-open', open)
  if (open) render()

  return {
    isOpen: () => open,
    setOpen,
    toggle: () => setOpen(!open),
    refresh: () => {
      if (open) render()
    },
    dispose() {
      panel.removeEventListener('click', onTabClick)
      body.removeEventListener('click', onBodyClick)
      searchInput.removeEventListener('input', onSearch)
      opts.mount.classList.remove('rw-chart-wrap--panel-open')
      panel.remove()
    },
  }
}
