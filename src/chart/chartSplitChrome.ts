import './chartSplitChrome.css'
import { icons } from '../icons'
import type { TradingViewChartHandle, TvProxyActionId } from './tradingViewChart'

/** Visible time span behind each footer range button, with TradingView's own tooltips. */
const RANGE_BUTTONS: Array<{ label: string; sec: number; title: string }> = [
  { label: '5y', sec: 5 * 365 * 86400, title: '5 years in 1 week intervals' },
  { label: '1y', sec: 365 * 86400, title: '1 year in 1 week intervals' },
  { label: '6m', sec: 182 * 86400, title: '6 months in 2 hours intervals' },
  { label: '3m', sec: 91 * 86400, title: '3 months in 1 hour intervals' },
  { label: '1m', sec: 30 * 86400, title: '1 month in 30 minutes intervals' },
  { label: '5d', sec: 5 * 86400, title: '5 days in 5 minutes intervals' },
  { label: '1d', sec: 86400, title: '1 day in 1 minute intervals' },
]

/** TradingView's own `PriceScaleMode` values — the library does not export them at runtime. */
const PRICE_SCALE_MODE = { normal: 0, log: 1, percentage: 2 } as const

/**
 * Lifted verbatim from the widget's own header so the shared row is the same header, not a
 * lookalike. Keep the intrinsic width/height attributes: TradingView sizes each glyph
 * differently (28px for most, 18px for symbol search, 14px for the percentage toggle) and the
 * icons only line up at those sizes.
 */
const TV = {
  symbol:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18"><path fill="currentColor" d="M3.5 8a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM8 2a6 6 0 1 0 3.65 10.76l3.58 3.58 1.06-1.06-3.57-3.57A6 6 0 0 0 8 2Z"/></svg>',
  compare:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><path fill="currentColor" d="M13.5 6a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM4 14.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"/><path fill="currentColor" d="M9 14h4v-4h1v4h4v1h-4v4h-1v-4H9v-1z"/></svg>',
  candles:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="currentColor"><path d="M17 11v6h3v-6h-3zm-.5-1h4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5z"/><path d="M18 7h1v3.5h-1zm0 10.5h1V21h-1z"/><path d="M9 8v12h3V8H9zm-.5-1h4a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5z"/><path d="M10 4h1v3.5h-1zm0 16.5h1V24h-1z"/></svg>',
  indicators:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none"><path stroke="currentColor" d="M20 17l-5 5M15 17l5 5M9 11.5h7M17.5 8a2.5 2.5 0 0 0-5 0v11a2.5 2.5 0 0 1-5 0"/></svg>',
  templates:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><path fill="currentColor" fill-rule="evenodd" d="M8 7h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM6 8c0-1.1.9-2 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8zm11-1h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm-2 1c0-1.1.9-2 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2V8zm-4 8H8a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1zm-3-1a2 2 0 0 0-2 2v3c0 1.1.9 2 2 2h3a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H8zm9 1h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1zm-2 1c0-1.1.9-2 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3z"/></svg>',
  undo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><path fill="currentColor" d="M8.707 13l2.647 2.646-.707.708L6.792 12.5l3.853-3.854.708.708L8.707 12H14.5a5.5 5.5 0 0 1 5.5 5.5V19h-1v-1.5a4.5 4.5 0 0 0-4.5-4.5H8.707z"/></svg>',
  redo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><path fill="currentColor" d="M18.293 13l-2.647 2.646.707.708 3.854-3.854-3.854-3.854-.707.708L18.293 12H12.5A5.5 5.5 0 0 0 7 17.5V19h1v-1.5a4.5 4.5 0 0 1 4.5-4.5h5.793z"/></svg>',
  quickSearch:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="currentColor"><path d="M17 4v4h2a1 1 0 0 1 .83 1.55l-4 6A1 1 0 0 1 14 15v-4h-2a1 1 0 0 1-.83-1.55l4-6A1 1 0 0 1 17 4m-2 11 4-6h-3V4l-4 6h3z"/><path d="M5 13.5a7.5 7.5 0 0 1 6-7.35v1.02A6.5 6.5 0 1 0 18.98 13h1l.02.5a7.47 7.47 0 0 1-1.85 4.94L23 23.29l-.71.7-4.85-4.84A7.5 7.5 0 0 1 5 13.5"/></svg>',
  settings:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="currentColor"><path fill-rule="evenodd" d="M18 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path fill-rule="evenodd" d="M8.5 5h11l5 9-5 9h-11l-5-9 5-9Zm-3.86 9L9.1 6h9.82l4.45 8-4.45 8H9.1l-4.45-8Z"/></svg>',
  fullscreen:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none"><path fill="currentColor" d="M7 18.5A2.5 2.5 0 0 0 9.5 21H12v1H9.5A3.5 3.5 0 0 1 6 18.5V16h1zm15 0a3.5 3.5 0 0 1-3.5 3.5H16v-1h2.5a2.5 2.5 0 0 0 2.5-2.5V16h1zM12 7H9.5A2.5 2.5 0 0 0 7 9.5V12H6V9.5A3.5 3.5 0 0 1 9.5 6H12zm6.5-1A3.5 3.5 0 0 1 22 9.5V12h-1V9.5A2.5 2.5 0 0 0 18.5 7H16V6z"/></svg>',
  snapshot:
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M11.118 6a.5.5 0 0 0-.447.276L9.809 8H5.5A1.5 1.5 0 0 0 4 9.5v10A1.5 1.5 0 0 0 5.5 21h16a1.5 1.5 0 0 0 1.5-1.5v-10A1.5 1.5 0 0 0 21.5 8h-4.309l-.862-1.724A.5.5 0 0 0 15.882 6h-4.764zm-1.342-.17A1.5 1.5 0 0 1 11.118 5h4.764a1.5 1.5 0 0 1 1.342.83L17.809 7H21.5A2.5 2.5 0 0 1 24 9.5v10a2.5 2.5 0 0 1-2.5 2.5h-16A2.5 2.5 0 0 1 3 19.5v-10A2.5 2.5 0 0 1 5.5 7h3.691l.585-1.17z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M13.5 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm0 1a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z"/></svg>',
  goToDate:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><path fill="currentColor" fill-rule="evenodd" d="M11 4h-1v2H7.5A2.5 2.5 0 0 0 5 8.5V13h1v-2h16v8.5c0 .83-.67 1.5-1.5 1.5H14v1h6.5a2.5 2.5 0 0 0 2.5-2.5v-11A2.5 2.5 0 0 0 20.5 6H18V4h-1v2h-6V4Zm6 4V7h-6v1h-1V7H7.5C6.67 7 6 7.67 6 8.5V10h16V8.5c0-.83-.67-1.5-1.5-1.5H18v1h-1Zm-5.15 10.15-3.5-3.5-.7.7L10.29 18H4v1h6.3l-2.65 2.65.7.7 3.5-3.5.36-.35-.36-.35Z"/></svg>',
  percent:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><g fill="none" stroke="currentColor"><circle cx="3.5" cy="3.5" r="2"/><circle cx="10.5" cy="10.5" r="2"/><path stroke-linecap="square" d="M9.5 1.5l-5 11"/></g></svg>',
}

export type ChartSplitChromeApi = {
  /** Header and footer heights the grid must keep clear of panes. */
  getInsets: () => { top: number; bottom: number }
  /** Repaint every face that reads from the active pane or from layout state. */
  sync: () => void
  /** The element a popover should anchor to, for menus the host opens. */
  getAnchor: (id: string) => HTMLElement | null
  dispose: () => void
}

export function createChartSplitChrome(opts: {
  /** Positioned wrapper the header and footer are pinned to the top and bottom of. */
  container: HTMLElement
  /** Whichever pane the shared chrome currently drives. */
  getActive: () => TradingViewChartHandle | null
  getLayoutChipHtml: () => string
  getSessionsHtml: () => string
  onChipClick: (event: Event) => void
  onSessionsClick: () => void
  onNewLayout: () => void
  onChartType: (anchor: HTMLElement) => void
  onGoTo: (anchor: HTMLElement) => void
  onThemeToggle: () => void
  onSnapshot: (anchor: HTMLElement) => void
  onFullscreen: () => void
  onGoToDate: (anchor: HTMLElement) => void
  /** Zoom the active pane to the last `spanSec` seconds of its data. */
  onRangePick: (spanSec: number) => void
  getTheme: () => 'light' | 'dark'
}): ChartSplitChromeApi {
  const header = document.createElement('div')
  header.className = 'rw-split-chrome rw-split-chrome--header'

  const footer = document.createElement('div')
  footer.className = 'rw-split-chrome rw-split-chrome--footer'

  const anchors = new Map<string, HTMLElement>()
  const cleanups: Array<() => void> = []

  function run(fn: () => void) {
    return (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      fn()
    }
  }

  function proxy(actionId: TvProxyActionId) {
    return () => opts.getActive()?.executeAction(actionId)
  }

  /** For the two controls TradingView exposes no action id for. */
  function pressNative(title: string) {
    return () => opts.getActive()?.clickNativeHeaderButton(title)
  }

  function addButton(
    row: HTMLElement,
    spec: {
      id: string
      title: string
      html: string
      onClick: (event: Event) => void
      /** Text buttons read as labels; icon buttons get a square hit box. */
      text?: boolean
    },
  ): HTMLElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `rw-split-chrome__btn${spec.text ? ' rw-split-chrome__btn--text' : ''}`
    btn.dataset.rwChrome = spec.id
    btn.title = spec.title
    btn.setAttribute('aria-label', spec.title)
    btn.innerHTML = spec.html
    btn.addEventListener('click', spec.onClick)
    cleanups.push(() => btn.removeEventListener('click', spec.onClick))
    row.appendChild(btn)
    anchors.set(spec.id, btn)
    return btn
  }

  function addSeparator(row: HTMLElement) {
    const sep = document.createElement('span')
    sep.className = 'rw-split-chrome__sep'
    row.appendChild(sep)
  }

  function addSpacer(row: HTMLElement) {
    const spacer = document.createElement('span')
    spacer.className = 'rw-split-chrome__spacer'
    row.appendChild(spacer)
  }

  /* ---- Header ---- */

  const symbolBtn = addButton(header, {
    id: 'symbol',
    title: 'Symbol search',
    html: `${TV.symbol}<span class="rw-split-chrome__label" data-rw-chrome-symbol>—</span>`,
    text: true,
    onClick: run(proxy('symbolSearch')),
  })
  symbolBtn.classList.add('rw-split-chrome__btn--symbol')

  addButton(header, {
    id: 'compare',
    title: 'Compare symbols',
    html: TV.compare,
    onClick: run(proxy('compareOrAdd')),
  })
  addSeparator(header)

  const intervalBtn = addButton(header, {
    id: 'interval',
    title: 'Change interval',
    html: '<span class="rw-split-chrome__label" data-rw-chrome-interval>—</span>',
    text: true,
    onClick: run(proxy('changeInterval')),
  })
  intervalBtn.classList.add('rw-split-chrome__btn--interval')
  addSeparator(header)

  const chartTypeBtn = addButton(header, {
    id: 'charttype',
    title: 'Chart type',
    html: TV.candles,
    onClick: run(() => opts.onChartType(chartTypeBtn)),
  })
  addSeparator(header)

  addButton(header, {
    id: 'indicators',
    title: 'Indicators & Strategies',
    html: `${TV.indicators}<span class="rw-split-chrome__label">Indicators</span>`,
    text: true,
    onClick: run(proxy('insertIndicator')),
  })
  addButton(header, {
    id: 'templates',
    title: 'Indicator templates',
    html: TV.templates,
    onClick: run(pressNative('Indicator templates')),
  })
  addSeparator(header)

  addButton(header, {
    id: 'undo',
    title: 'Undo',
    html: TV.undo,
    onClick: run(proxy('undo')),
  })
  addButton(header, {
    id: 'redo',
    title: 'Redo',
    html: TV.redo,
    onClick: run(proxy('redo')),
  })
  addSeparator(header)

  // Our own buttons, in the same order and with the same pill face the single-chart header
  // gives them via `createButton({ useTradingViewStyle: true })`.
  const newLayoutBtn = addButton(header, {
    id: 'newlayout',
    title: 'Create a new empty chart layout',
    html: '<span class="rw-split-chrome__label">New Layout</span>',
    text: true,
    onClick: run(() => opts.onNewLayout()),
  })
  newLayoutBtn.classList.add('rw-split-chrome__btn--pill')

  addSpacer(header)

  const sessionsSlot = document.createElement('span')
  sessionsSlot.className = 'rw-split-chrome__slot'
  sessionsSlot.dataset.rwChrome = 'sessions'
  const onSessions = run(() => opts.onSessionsClick())
  sessionsSlot.addEventListener('click', onSessions)
  cleanups.push(() => sessionsSlot.removeEventListener('click', onSessions))
  header.appendChild(sessionsSlot)
  anchors.set('sessions', sessionsSlot)

  const layoutSlot = document.createElement('span')
  layoutSlot.className = 'rw-split-chrome__slot'
  layoutSlot.dataset.rwChrome = 'layout'
  // The chip is three hit targets in one slot; the host reads `data-rw-chip` off the target.
  const onChip = (event: Event) => opts.onChipClick(event)
  layoutSlot.addEventListener('click', onChip)
  cleanups.push(() => layoutSlot.removeEventListener('click', onChip))
  header.appendChild(layoutSlot)
  anchors.set('layout', layoutSlot)

  const gotoBtn = addButton(header, {
    id: 'goto',
    title: 'Go To',
    html: `${icons.replayGoto}<span class="rw-split-chrome__label">Go To</span>`,
    text: true,
    onClick: run(() => opts.onGoTo(gotoBtn)),
  })
  gotoBtn.classList.add('rw-split-chrome__btn--pill')

  const themeBtn = addButton(header, {
    id: 'theme',
    title: 'Toggle theme',
    html: icons.moon,
    onClick: run(() => opts.onThemeToggle()),
  })

  addButton(header, {
    id: 'quicksearch',
    title: 'Quick search',
    html: TV.quickSearch,
    onClick: run(pressNative('Quick search')),
  })
  addButton(header, {
    id: 'settings',
    title: 'Settings',
    html: TV.settings,
    onClick: run(proxy('chartProperties')),
  })
  addSeparator(header)
  addButton(header, {
    id: 'fullscreen',
    title: 'Fullscreen mode',
    html: TV.fullscreen,
    onClick: run(() => opts.onFullscreen()),
  })
  const snapshotBtn = addButton(header, {
    id: 'snapshot',
    title: 'Take a snapshot',
    html: TV.snapshot,
    onClick: run(() => opts.onSnapshot(snapshotBtn)),
  })

  /* ---- Footer ---- */

  for (const range of RANGE_BUTTONS) {
    addButton(footer, {
      id: `range-${range.label}`,
      title: range.title,
      html: `<span class="rw-split-chrome__label">${range.label}</span>`,
      text: true,
      onClick: run(() => opts.onRangePick(range.sec)),
    })
  }

  const calendarBtn = addButton(footer, {
    id: 'gotodate',
    title: 'Go to',
    html: TV.goToDate,
    onClick: run(() => opts.onGoToDate(calendarBtn)),
  })

  addSpacer(footer)

  const clock = document.createElement('span')
  clock.className = 'rw-split-chrome__clock'
  footer.appendChild(clock)

  const percentBtn = addButton(footer, {
    id: 'percent',
    title: 'Toggle Percentage',
    html: TV.percent,
    text: true,
    onClick: run(() => togglePriceMode(PRICE_SCALE_MODE.percentage)),
  })
  const logBtn = addButton(footer, {
    id: 'log',
    title: 'Toggle Log Scale',
    html: '<span class="rw-split-chrome__label">log</span>',
    text: true,
    onClick: run(() => togglePriceMode(PRICE_SCALE_MODE.log)),
  })
  const autoBtn = addButton(footer, {
    id: 'auto',
    title: 'Toggle Auto Scale',
    html: '<span class="rw-split-chrome__label">auto</span>',
    text: true,
    onClick: run(() => {
      const handle = opts.getActive()
      if (!handle) return
      handle.setPriceAxisAutoScale(!handle.getPriceAxisState().autoScale)
      sync()
    }),
  })

  /** TradingView treats these as radio-ish: picking the active one falls back to normal. */
  function togglePriceMode(mode: number) {
    const handle = opts.getActive()
    if (!handle) return
    const current = handle.getPriceAxisState().mode
    handle.setPriceAxisMode(current === mode ? PRICE_SCALE_MODE.normal : mode)
    sync()
  }

  opts.container.appendChild(header)
  opts.container.appendChild(footer)

  /**
   * TradingView's own header sheds controls as it narrows; this row has to do the same or the
   * right-hand group — which is where the layout chip lives — slides off the edge. Each step
   * drops the least useful thing still showing, and the pass stops as soon as the row fits.
   */
  const compactSteps: Array<Array<() => void>> = [
    [() => header.classList.add('is-compact-seps')],
    [() => hide(header, 'templates')],
    [() => hide(header, 'quicksearch')],
    [() => hide(header, 'newlayout')],
    [() => labelOff(header, 'indicators')],
    [() => labelOff(header, 'goto')],
    [() => hide(header, 'compare')],
    [() => hide(header, 'redo'), () => hide(header, 'undo')],
    [() => hide(header, 'charttype')],
    [() => hide(header, 'settings')],
    [() => hide(header, 'fullscreen'), () => hide(header, 'snapshot')],
  ]

  const footerSteps: Array<Array<() => void>> = RANGE_BUTTONS.map((range) => [
    () => hide(footer, `range-${range.label}`),
  ])

  function hide(row: HTMLElement, id: string) {
    row.querySelector<HTMLElement>(`[data-rw-chrome="${id}"]`)?.classList.add('is-collapsed')
  }

  function labelOff(row: HTMLElement, id: string) {
    row.querySelector<HTMLElement>(`[data-rw-chrome="${id}"]`)?.classList.add('is-label-off')
  }

  function compactRow(row: HTMLElement, steps: Array<Array<() => void>>) {
    row.classList.remove('is-compact-seps')
    for (const el of row.querySelectorAll('.is-collapsed, .is-label-off')) {
      el.classList.remove('is-collapsed', 'is-label-off')
    }
    for (const step of steps) {
      if (row.scrollWidth <= row.clientWidth) return
      for (const apply of step) apply()
    }
  }

  function compact() {
    compactRow(header, compactSteps)
    compactRow(footer, footerSteps)
  }

  const resizeObserver = new ResizeObserver(() => compact())
  resizeObserver.observe(opts.container)

  function formatClock(): string {
    const now = new Date()
    const time = now.toLocaleTimeString('en-GB', { hour12: false })
    // `getTimezoneOffset` is minutes *behind* UTC, so the sign is inverted for display.
    const offsetMin = -now.getTimezoneOffset()
    const sign = offsetMin < 0 ? '-' : '+'
    const abs = Math.abs(offsetMin)
    const hh = Math.floor(abs / 60)
    const mm = abs % 60
    return `${time} UTC${sign}${hh}${mm ? `:${String(mm).padStart(2, '0')}` : ''}`
  }

  function sync() {
    const handle = opts.getActive()
    const symbolLabel = header.querySelector<HTMLElement>('[data-rw-chrome-symbol]')
    const intervalLabel = header.querySelector<HTMLElement>('[data-rw-chrome-interval]')
    if (symbolLabel) symbolLabel.textContent = handle?.getSymbol() ?? '—'
    if (intervalLabel) intervalLabel.textContent = handle?.getResolution() ?? '—'

    layoutSlot.innerHTML = opts.getLayoutChipHtml()
    sessionsSlot.innerHTML = opts.getSessionsHtml()
    themeBtn.innerHTML = opts.getTheme() === 'dark' ? icons.sun : icons.moon

    const axis = handle?.getPriceAxisState()
    percentBtn.classList.toggle('is-on', axis?.mode === PRICE_SCALE_MODE.percentage)
    logBtn.classList.toggle('is-on', axis?.mode === PRICE_SCALE_MODE.log)
    autoBtn.classList.toggle('is-on', axis?.autoScale !== false)

    clock.textContent = formatClock()
    // The chip and the session pill change width with their content, so re-fit after painting.
    compact()
  }

  sync()
  const clockTimer = window.setInterval(() => {
    clock.textContent = formatClock()
  }, 1000)

  return {
    getInsets: () => ({
      top: header.offsetHeight || 38,
      bottom: footer.offsetHeight || 38,
    }),
    sync,
    getAnchor: (id) => anchors.get(id) ?? null,
    dispose() {
      resizeObserver.disconnect()
      window.clearInterval(clockTimer)
      for (const fn of cleanups) fn()
      cleanups.length = 0
      header.remove()
      footer.remove()
    },
  }
}
