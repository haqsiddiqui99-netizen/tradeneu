import { icons } from '../icons'
import { CHART_INDICATOR_CATALOG, type ChartIndicatorId } from '../chart/chartIndicatorCatalog'
import './indicatorsModal.css'

type ScriptKind = 'indicator' | 'strategy'

type ScriptRow = {
  name: string
  author: string
  boosts: string
  kind: ScriptKind
}

const DEMO_SCRIPTS: ScriptRow[] = [
  { name: 'Smart Money Concepts (SMC) [LuxAlgo]', author: 'LuxAlgo', boosts: '136.3 K', kind: 'indicator' },
  { name: 'Squeeze Momentum Indicator [LazyBear]', author: 'LazyBear', boosts: '111.5 K', kind: 'indicator' },
  { name: 'MacD Custom Indicator-Multiple Time Fr…', author: 'ChrisMoody', boosts: '89.2 K', kind: 'indicator' },
  { name: 'Volume Profile HD', author: 'TradingView', boosts: '72.1 K', kind: 'indicator' },
  { name: 'Supertrend', author: 'KivancOzbilgic', boosts: '58.4 K', kind: 'indicator' },
  { name: 'RSI Divergence Indicator', author: 'DreadBlitz', boosts: '44.0 K', kind: 'indicator' },
  { name: 'EMA Cross Strategy', author: 'DemoAuthor', boosts: '12.1 K', kind: 'strategy' },
  { name: 'MACD Strategy [Demo]', author: 'DemoAuthor', boosts: '9.8 K', kind: 'strategy' },
]

type NavId =
  | 'my-scripts'
  | 'invite-only'
  | 'purchased'
  | 'technicals'
  | 'fundamentals'
  | 'editors-picks'
  | 'top'
  | 'trending'
  | 'store'

const PERSONAL_NAV_IDS: NavId[] = ['my-scripts', 'invite-only', 'purchased']
const COMMUNITY_NAV_IDS: NavId[] = ['editors-picks', 'top', 'trending', 'store']

function isPersonalNav(id: NavId): boolean {
  return PERSONAL_NAV_IDS.includes(id)
}

function isCommunityNav(id: NavId): boolean {
  return COMMUNITY_NAV_IDS.includes(id)
}

export type IndicatorsModalOptions = {
  root: HTMLElement
  onOpenChange?: (open: boolean) => void
  isIndicatorActive?: (id: ChartIndicatorId) => boolean
  onAddIndicator?: (id: ChartIndicatorId) => void
}

export function createIndicatorsModal(opts: IndicatorsModalOptions) {
  const overlay = document.createElement('div')
  overlay.className = 'sx-ind-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', 'sx-ind-title')
  overlay.hidden = true
  overlay.tabIndex = -1

  let filterTab: 'all' | 'indicators' | 'strategies' = 'all'
  let navId: NavId = 'top'
  let searchQuery = ''

  const tabAll = document.createElement('button')
  tabAll.type = 'button'
  tabAll.className = 'sx-ind-tab is-active'
  tabAll.textContent = 'All'

  const tabInd = document.createElement('button')
  tabInd.type = 'button'
  tabInd.className = 'sx-ind-tab'
  tabInd.textContent = 'Indicators'

  const tabStr = document.createElement('button')
  tabStr.type = 'button'
  tabStr.className = 'sx-ind-tab'
  tabStr.textContent = 'Strategies'

  const searchInput = document.createElement('input')
  searchInput.type = 'search'
  searchInput.placeholder = 'Search'
  searchInput.setAttribute('autocomplete', 'off')
  searchInput.setAttribute('spellcheck', 'false')

  const tableScroll = document.createElement('div')
  tableScroll.className = 'sx-ind-table-scroll'

  const navButtons = new Map<NavId, HTMLButtonElement>()

  function navSection(label: string, items: { id: NavId; text: string }[]) {
    const wrap = document.createElement('div')
    const lab = document.createElement('div')
    lab.className = 'sx-ind-nav-label'
    lab.textContent = label
    wrap.appendChild(lab)
    for (const { id, text } of items) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'sx-ind-nav-item' + (id === navId ? ' is-active' : '')
      btn.textContent = text
      btn.addEventListener('click', () => {
        navId = id
        for (const [nid, b] of navButtons) {
          b.classList.toggle('is-active', nid === navId)
        }
        renderRows()
      })
      navButtons.set(id, btn)
      wrap.appendChild(btn)
    }
    return wrap
  }

  const sidebar = document.createElement('div')
  sidebar.className = 'sx-ind-sidebar'
  sidebar.appendChild(
    navSection('PERSONAL', [
      { id: 'my-scripts', text: 'My scripts' },
      { id: 'invite-only', text: 'Invite-only' },
      { id: 'purchased', text: 'Purchased' },
    ]),
  )
  sidebar.appendChild(
    navSection('BUILT-IN', [
      { id: 'technicals', text: 'Technicals' },
      { id: 'fundamentals', text: 'Fundamentals' },
    ]),
  )
  sidebar.appendChild(
    navSection('COMMUNITY (PREVIEW)', [
      { id: 'editors-picks', text: "Editors' picks" },
      { id: 'top', text: 'Top' },
      { id: 'trending', text: 'Trending' },
      { id: 'store', text: 'Store' },
    ]),
  )

  function matchesFilter(row: ScriptRow): boolean {
    if (filterTab === 'indicators' && row.kind !== 'indicator') return false
    if (filterTab === 'strategies' && row.kind !== 'strategy') return false
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return row.name.toLowerCase().includes(q) || row.author.toLowerCase().includes(q)
  }


  function setTableHead(mode: 'community' | 'builtin') {
    if (!tableHead) return
    if (mode === 'builtin') {
      tableHead.innerHTML = '<span>INDICATOR</span><span>TYPE</span><span style="text-align:right">ACTION</span>'
      tableHead.classList.add('sx-ind-table-head--builtin')
    } else {
      tableHead.innerHTML = '<span>SCRIPT NAME</span><span>AUTHOR</span><span style="text-align:right">BOOSTS</span>'
      tableHead.classList.remove('sx-ind-table-head--builtin')
    }
  }

  function renderBuiltinRows() {
    tableScroll.innerHTML = ''
    setTableHead('builtin')
    const q = searchQuery.trim().toLowerCase()
    const rows = CHART_INDICATOR_CATALOG.filter((row) => {
      if (!q) return true
      return row.name.toLowerCase().includes(q) || row.author.toLowerCase().includes(q)
    })
    if (rows.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'sx-ind-empty'
      empty.textContent = 'No built-in indicators match your search.'
      tableScroll.appendChild(empty)
      return
    }
    for (const row of rows) {
      const active = opts.isIndicatorActive?.(row.id) ?? false
      const el = document.createElement('div')
      el.className = 'sx-ind-row sx-ind-row--builtin'
      el.innerHTML = `<span class="sx-ind-row-name"></span><span class="sx-ind-row-author"></span><span class="sx-ind-row-action"></span>`
      el.querySelector('.sx-ind-row-name')!.textContent = row.name
      el.querySelector('.sx-ind-row-author')!.textContent =
        row.kind === 'overlay' || row.kind === 'bb'
          ? 'Overlay'
          : row.kind === 'rsi'
            ? 'Oscillator'
            : 'Pane'
      const actionSlot = el.querySelector('.sx-ind-row-action')!
      if (active) {
        const badge = document.createElement('span')
        badge.className = 'sx-ind-added'
        badge.textContent = 'On chart'
        actionSlot.appendChild(badge)
      } else {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'sx-ind-add-btn'
        btn.textContent = 'Add to chart'
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          opts.onAddIndicator?.(row.id)
        })
        actionSlot.appendChild(btn)
      }
      tableScroll.appendChild(el)
    }
  }

  function renderCommunityRows() {
    tableScroll.innerHTML = ''
    setTableHead('community')
    const banner = document.createElement('div')
    banner.className = 'sx-ind-demo-banner'
    banner.setAttribute('role', 'note')
    banner.innerHTML =
      '<strong>Preview only.</strong> Community scripts are sample listings — they are not wired to the chart. Use <strong>Built-in → Technicals</strong> for live indicators.'
    tableScroll.appendChild(banner)

    const rows = DEMO_SCRIPTS.filter(matchesFilter)
    if (rows.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'sx-ind-empty'
      empty.textContent = 'No preview scripts match your filters.'
      tableScroll.appendChild(empty)
      return
    }
    for (const row of rows) {
      const el = document.createElement('div')
      el.className = 'sx-ind-row sx-ind-row--demo'
      el.innerHTML = `<span class="sx-ind-row-name"></span><span class="sx-ind-row-author"></span><span class="sx-ind-row-boosts"></span>`
      const nameEl = el.querySelector('.sx-ind-row-name')!
      const authorEl = el.querySelector('.sx-ind-row-author')!
      const boostsEl = el.querySelector('.sx-ind-row-boosts')!
      nameEl.textContent = row.name
      authorEl.textContent = row.author
      const badge = document.createElement('span')
      badge.className = 'sx-ind-preview-badge'
      badge.textContent = 'Preview'
      boostsEl.appendChild(badge)
      tableScroll.appendChild(el)
    }
  }

  function renderPersonalRows() {
    tableScroll.innerHTML = ''
    setTableHead('community')
    const empty = document.createElement('div')
    empty.className = 'sx-ind-empty'
    empty.textContent = 'Personal script library is coming soon. Use Built-in → Technicals for chart indicators today.'
    tableScroll.appendChild(empty)
  }

  function renderRows() {
    if (navId === 'technicals') {
      renderBuiltinRows()
      return
    }
    if (navId === 'fundamentals') {
      tableScroll.innerHTML = ''
      setTableHead('builtin')
      const empty = document.createElement('div')
      empty.className = 'sx-ind-empty'
      empty.textContent = 'Fundamental overlays are not available yet.'
      tableScroll.appendChild(empty)
      return
    }
    if (isPersonalNav(navId)) {
      renderPersonalRows()
      return
    }
    if (isCommunityNav(navId)) {
      renderCommunityRows()
      return
    }
    renderCommunityRows()
  }

  function setFilterTab(tab: typeof filterTab) {
    filterTab = tab
    tabAll.classList.toggle('is-active', tab === 'all')
    tabInd.classList.toggle('is-active', tab === 'indicators')
    tabStr.classList.toggle('is-active', tab === 'strategies')
    renderRows()
  }

  tabAll.addEventListener('click', () => setFilterTab('all'))
  tabInd.addEventListener('click', () => setFilterTab('indicators'))
  tabStr.addEventListener('click', () => setFilterTab('strategies'))

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value
    renderRows()
  })

  overlay.innerHTML = `
    <div class="sx-ind-panel">
      <div class="sx-ind-head">
        <h2 class="sx-ind-title" id="sx-ind-title">Indicators, metrics, and strategies</h2>
        <button type="button" class="sx-ind-close" aria-label="Close">${icons.close}</button>
      </div>
      <div class="sx-ind-search-wrap">
        <div class="sx-ind-search">${icons.search}<span class="sx-ind-search-slot"></span></div>
      </div>
      <div class="sx-ind-tabs">
        <span class="sx-ind-tabs-slot"></span>
      </div>
      <div class="sx-ind-body">
        <span class="sx-ind-sidebar-slot"></span>
        <div class="sx-ind-main">
          <div class="sx-ind-table-head">
            <span>SCRIPT NAME</span>
            <span>AUTHOR</span>
            <span style="text-align:right">BOOSTS</span>
          </div>
          <span class="sx-ind-table-scroll-slot"></span>
        </div>
      </div>
    </div>
  `

  const closeBtn = overlay.querySelector('.sx-ind-close') as HTMLButtonElement
  const tableHead = overlay.querySelector('.sx-ind-table-head') as HTMLElement
  const searchSlot = overlay.querySelector('.sx-ind-search-slot') as HTMLSpanElement
  const tabsSlot = overlay.querySelector('.sx-ind-tabs-slot') as HTMLSpanElement
  const sidebarSlot = overlay.querySelector('.sx-ind-sidebar-slot') as HTMLSpanElement
  const scrollSlot = overlay.querySelector('.sx-ind-table-scroll-slot') as HTMLSpanElement

  searchSlot.replaceWith(searchInput)
  tabsSlot.replaceWith(tabAll, tabInd, tabStr)
  sidebarSlot.replaceWith(sidebar)
  scrollSlot.replaceWith(tableScroll)

  let isOpen = false
  let onDocKey: ((e: KeyboardEvent) => void) | null = null

  const notify = () => opts.onOpenChange?.(isOpen)

  function close() {
    if (!isOpen) return
    isOpen = false
    overlay.hidden = true
    if (onDocKey) {
      document.removeEventListener('keydown', onDocKey, true)
      onDocKey = null
    }
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
    notify()
  }

  function openModal() {
    if (isOpen) return
    isOpen = true
    if (!overlay.parentNode) opts.root.appendChild(overlay)
    overlay.hidden = false
    filterTab = 'all'
    navId = 'technicals'
    searchQuery = ''
    searchInput.value = ''
    setFilterTab('all')
    for (const [nid, b] of navButtons) {
      b.classList.toggle('is-active', nid === navId)
    }
    renderRows()
    requestAnimationFrame(() => {
      searchInput.focus()
    })
    onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      }
    }
    document.addEventListener('keydown', onDocKey, true)
    notify()
  }

  closeBtn.addEventListener('click', () => close())

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })

  const panel = overlay.querySelector('.sx-ind-panel') as HTMLElement
  panel.addEventListener('click', (e) => e.stopPropagation())

  function dispose() {
    close()
    overlay.remove()
  }

  return {
    open: openModal,
    close,
    dispose,
    getOpen: () => isOpen,
    refreshRows: () => {
      if (isOpen) renderRows()
    },
  }
}
