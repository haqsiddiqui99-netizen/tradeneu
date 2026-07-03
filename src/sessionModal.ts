import {
  fallbackBarCoverage,
  resolveBarCoverageForSymbols,
  type BarCoverageBounds,
} from './data/symbolBarCoverage'
import { icons } from './icons'
import {
  ASSET_CATALOG,
  ASSET_PILLS,
  RECENT_SYMBOLS,
  findAsset,
  type AssetCategory,
  type CatalogAsset,
} from './assetCatalog'
import type { SessionCreatedPayload } from './sessionTypes'
import { DEFAULT_PROP_RULES, normalizePropRules } from './prop/propRuleEngine'
import {
  closeSessionDatetimePicker,
  isSessionDatetimePickerOpen,
  openSessionDatetimePicker,
} from './sessionDatetimePicker'
import { fetchMarketDataHealth } from './data/marketDataHealth'
import {
  buildCoverageFallbackHint,
  buildSessionModalHealthMessage,
} from './data/sessionModalHealth'

export type { SessionCreatedPayload } from './sessionTypes'

function nowDatetimeLocal(): string {
  const d = new Date()
  d.setSeconds(0, 0)
  return formatDatetimeLocal(d)
}

function formatHintDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDatetimeLocalDisplay(iso: string): string {
  const t = iso.trim()
  if (!t) return ''
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function parseIsoLocal(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function toIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDatetimeLocal(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${mo}-${da}T${hh}:${mm}`
}

function clampDateTimeLocal(value: string, minStr: string, maxStr: string): string {
  const v = new Date(value)
  const lo = new Date(minStr)
  const hi = new Date(maxStr)
  if (Number.isNaN(v.getTime()) || Number.isNaN(lo.getTime()) || Number.isNaN(hi.getTime())) return value
  const t = Math.min(Math.max(v.getTime(), lo.getTime()), hi.getTime())
  return formatDatetimeLocal(new Date(t))
}

function clampIsoToRange(iso: string, minIso: string, maxIso: string): string {
  const a = parseIsoLocal(iso)
  const lo = parseIsoLocal(minIso)
  const hi = parseIsoLocal(maxIso)
  if (!a || !lo || !hi) return iso
  if (a < lo) return minIso
  if (a > hi) return maxIso
  return toIsoLocal(a)
}

function endFromStartPlusDays(startLocal: string, days: number, maxLocal: string): string {
  const s = new Date(startLocal)
  if (Number.isNaN(s.getTime())) return maxLocal
  const e = new Date(s)
  e.setDate(e.getDate() + days)
  const maxT = new Date(maxLocal).getTime()
  if (Number.isNaN(maxT)) return maxLocal
  if (e.getTime() > maxT) return maxLocal
  return formatDatetimeLocal(e)
}

function endFromStartPlusOneMonth(startLocal: string, maxLocal: string): string {
  const s = new Date(startLocal)
  if (Number.isNaN(s.getTime())) return maxLocal
  const e = new Date(s)
  e.setMonth(e.getMonth() + 1)
  const maxT = new Date(maxLocal).getTime()
  if (Number.isNaN(maxT)) return maxLocal
  if (e.getTime() > maxT) return maxLocal
  return formatDatetimeLocal(e)
}

function categoryDotClass(cat: AssetCategory): string {
  const map: Record<AssetCategory, string> = {
    forex: 'sx-assetdd__tag-dot--forex',
    futures: 'sx-assetdd__tag-dot--futures',
    stocks: 'sx-assetdd__tag-dot--stocks',
    crypto: 'sx-assetdd__tag-dot--crypto',
    indices: 'sx-assetdd__tag-dot--indices',
    metals: 'sx-assetdd__tag-dot--metals',
    energies: 'sx-assetdd__tag-dot--energies',
    agriculture: 'sx-assetdd__tag-dot--agriculture',
  }
  return map[cat] ?? 'sx-assetdd__tag-dot--def'
}

function el(html: string) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild as HTMLElement
}

export type SessionModalOpenOpts = {
  sessionType?: 'backtest' | 'prop'
  /** When set, submit updates an existing session instead of creating one. */
  editSessionId?: string
  /** Pre-fill fields when resuming a saved draft (e.g. from dashboard). */
  draft?: Partial<
    Pick<
      SessionCreatedPayload,
      'name' | 'balance' | 'assets' | 'layout' | 'sessionType' | 'startDate' | 'endDate' | 'propRules'
    >
  >
}

const CATEGORY_HEADINGS: Record<AssetCategory, string> = {
  forex: 'Forex',
  futures: 'Futures',
  stocks: 'Stocks',
  crypto: 'Crypto',
  indices: 'Indices',
  metals: 'Metals',
  energies: 'Energies',
  agriculture: 'Agriculture',
}

const CATEGORY_ORDER: AssetCategory[] = [
  'forex',
  'futures',
  'indices',
  'metals',
  'energies',
  'agriculture',
  'crypto',
  'stocks',
]

export function createSessionModal(options?: {
  onSessionCreate?: (payload: SessionCreatedPayload) => void
  onSessionUpdate?: (id: string, payload: SessionCreatedPayload) => void
}) {
  let editingSessionId: string | null = null
  const wrap = el(`
    <div class="sx-modal" id="sx-session-modal" hidden>
      <div class="sx-modal__backdrop" data-close="backdrop"></div>
      <div
        class="sx-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sx-modal-title"
        tabindex="-1"
      >
        <div class="sx-modal__head">
          <h2 class="sx-modal__title" id="sx-modal-title">Create a quick session</h2>
          <div class="sx-modal__head-right">
            <button type="button" class="sx-modal__advanced">Advanced session</button>
            <button type="button" class="sx-modal__close" aria-label="Close dialog">${icons.close}</button>
          </div>
        </div>

        <div class="sx-modal__seg" role="group" aria-label="Session type">
          <button type="button" class="sx-modal__seg-btn sx-modal__seg-btn--on" data-seg="backtest">Backtesting session</button>
          <button type="button" class="sx-modal__seg-btn" data-seg="prop">
            <span>Prop firm session</span>
            <span class="sx-pro-mini" title="Pro feature">${icons.bolt}<span>Pro</span></span>
          </button>
        </div>

        <div class="sx-modal__health" id="sx-session-health-banner" hidden role="status"></div>
        <div class="sx-modal__health sx-modal__health--muted" id="sx-session-coverage-hint" hidden role="status"></div>

        <div class="sx-modal__scroll">
          <div class="sx-modal__body">
            <div class="sx-field">
              <label class="sx-label sx-label--required" for="sx-session-name">Name</label>
              <input
                type="text"
                id="sx-session-name"
                class="sx-input"
                autocomplete="off"
                placeholder="Name your session"
              />
              <p class="sx-field-error" id="sx-session-name-err" hidden>This field is required.</p>
            </div>

            <div class="sx-field">
              <label class="sx-label sx-label--required" for="sx-session-balance">Account Balance</label>
              <div class="sx-input-wrap sx-input-wrap--prefix">
                <span class="sx-input__prefix" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M12 7v10M10 10h2.2a1.8 1.8 0 000-3.6H10M10 14h2.4a2 2 0 010 4H10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                  </svg>
                </span>
                <input type="text" id="sx-session-balance" class="sx-input sx-input--with-prefix" inputmode="numeric" value="100000" />
              </div>
            </div>

            <div class="sx-prop-rules" id="sx-prop-rules" hidden>
              <h3 class="sx-prop-rules__title">Prop challenge rules</h3>
              <p class="sx-prop-rules__hint">Limits are checked on each replay bar against your paper account equity.</p>
              <div class="sx-prop-rules__grid">
                <div class="sx-field sx-field--compact">
                  <label class="sx-label" for="sx-prop-profit">Profit target (%)</label>
                  <input type="number" id="sx-prop-profit" class="sx-input" min="1" max="100" step="0.5" value="10" />
                </div>
                <div class="sx-field sx-field--compact">
                  <label class="sx-label" for="sx-prop-drawdown">Max drawdown (%)</label>
                  <input type="number" id="sx-prop-drawdown" class="sx-input" min="0.5" max="50" step="0.5" value="5" />
                </div>
                <div class="sx-field sx-field--compact">
                  <label class="sx-label" for="sx-prop-daily">Max daily loss (%)</label>
                  <input type="number" id="sx-prop-daily" class="sx-input" min="0.5" max="20" step="0.5" value="2" />
                </div>
              </div>
            </div>

            <div class="sx-field sx-field--asset">
              <div class="sx-label-row">
                <label class="sx-label sx-label--required" id="sx-asset-label" for="sx-assetdd-trigger">Assets</label>
                <button type="button" class="sx-label-link" id="sx-request-asset">Request asset</button>
              </div>
              <div class="sx-assetdd" id="sx-assetdd">
                <input type="hidden" id="sx-session-assets" name="assets" value="" />
                <button
                  type="button"
                  class="sx-assetdd__trigger"
                  id="sx-assetdd-trigger"
                  aria-expanded="false"
                  aria-haspopup="listbox"
                  aria-labelledby="sx-asset-label"
                >
                  <span class="sx-assetdd__trigger-inner">
                    <span class="sx-assetdd__trigger-tags" id="sx-asset-tags" aria-live="polite"></span>
                    <span class="sx-assetdd__trigger-ph" id="sx-asset-ph">Type to search for assets</span>
                  </span>
                  <span class="sx-assetdd__chev" aria-hidden="true">${icons.chevronDown}</span>
                </button>
                <div class="sx-assetdd__panel" id="sx-assetdd-panel" hidden>
                  <div class="sx-assetdd__sheet">
                    <div class="sx-assetdd__sheet-sticky">
                      <input
                        type="text"
                        class="sx-assetdd__search"
                        placeholder="Type to search for assets"
                        autocomplete="off"
                        aria-label="Search assets"
                      />
                      <div class="sx-assetdd__pills" role="tablist" aria-label="Asset categories"></div>
                    </div>
                    <div class="sx-assetdd__list" role="listbox" aria-labelledby="sx-asset-label"></div>
                  </div>
                </div>
              </div>
              <p class="sx-field-error" id="sx-session-assets-err" hidden>Please select at least one asset.</p>
            </div>

            <div class="sx-field sx-field--dates">
              <div class="sx-date-2col">
                <label class="sx-label sx-label--required" for="sx-session-start-display">Initial Date</label>
                <div class="sx-date-end-label-row">
                  <label class="sx-label sx-label--required" for="sx-session-end-display">End Date</label>
                  <div class="sx-date-quick" role="group" aria-label="Set end date from start">
                    <button type="button" class="sx-date-quick__btn" data-date-quick="1d">+1D</button>
                    <button type="button" class="sx-date-quick__btn" data-date-quick="1w">+1W</button>
                    <button type="button" class="sx-date-quick__btn" data-date-quick="1m">+1M</button>
                  </div>
                </div>
                <span class="sx-date-2col__pad" aria-hidden="true"></span>

                <div class="sx-dt-field" id="sx-session-start-dt">
                  <div class="sx-dt-field__inner">
                    <input
                      type="text"
                      id="sx-session-start-display"
                      class="sx-input sx-dt-display"
                      readonly
                      autocomplete="off"
                      placeholder="Select date &amp; time"
                    />
                    <button type="button" class="sx-dt-cal" id="sx-session-start-cal" aria-label="Open calendar">${icons.calendar}</button>
                  </div>
                  <input type="hidden" id="sx-session-start-date" />
                </div>
                <div class="sx-dt-field" id="sx-session-end-dt">
                  <div class="sx-dt-field__inner">
                    <input
                      type="text"
                      id="sx-session-end-display"
                      class="sx-input sx-dt-display"
                      readonly
                      autocomplete="off"
                      placeholder="Select date &amp; time"
                    />
                    <button type="button" class="sx-dt-cal" id="sx-session-end-cal" aria-label="Open calendar">${icons.calendar}</button>
                  </div>
                  <input type="hidden" id="sx-session-end-date" />
                </div>
                <label class="sx-random-tab">
                  <input type="checkbox" id="sx-session-end-random" />
                  <span>Random</span>
                </label>

                <p class="sx-field-hint" id="sx-session-start-hint"></p>
                <p class="sx-field-hint" id="sx-session-end-hint"></p>
                <span class="sx-date-2col__pad" aria-hidden="true"></span>
              </div>
              <p class="sx-field-error" id="sx-session-dates-err" hidden></p>
              <div class="sx-auto-end-bar">
                <button
                  type="button"
                  class="sx-auto-end-switch"
                  id="sx-session-auto-end"
                  role="switch"
                  aria-checked="false"
                  aria-labelledby="sx-auto-end-label"
                >
                  <span class="sx-auto-end-switch__thumb" aria-hidden="true"></span>
                </button>
                <span class="sx-auto-end-text" id="sx-auto-end-label">
                  <span class="sx-auto-end-title">Auto-update end date</span>
                  <span
                    class="sx-label__info sx-auto-end-info"
                    title="When on, changing the start sets the end to today 23:59 (local, latest selectable)."
                  >${icons.info}</span>
                </span>
              </div>
            </div>

            <div class="sx-field">
              <label class="sx-label sx-label--optional" for="sx-session-layout">
                Select Chart Layout (Optional)
                <span class="sx-label__info" title="Layout presets for your workspace">${icons.info}</span>
              </label>
              <div class="sx-select-wrap">
                <select id="sx-session-layout" class="sx-input sx-input--select">
                  <option value="">Default layout</option>
                  <option value="1">Single chart</option>
                  <option value="2">Two charts</option>
                  <option value="4">Four charts</option>
                </select>
                <span class="sx-select-chevron" aria-hidden="true">${icons.chevronDown}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="sx-modal__foot">
          <button type="button" class="sx-modal__cancel">Cancel</button>
          <button type="button" class="sx-modal__submit" disabled>Create session</button>
        </div>
      </div>
    </div>
  `)

  document.body.appendChild(wrap)

  const backdrop = wrap.querySelector('[data-close="backdrop"]')!
  const panel = wrap.querySelector('.sx-modal__panel') as HTMLElement
  const btnClose = wrap.querySelector('.sx-modal__close')!
  const btnAdvanced = wrap.querySelector('.sx-modal__advanced')!
  const btnCancel = wrap.querySelector('.sx-modal__cancel')!
  const btnSubmit = wrap.querySelector('.sx-modal__submit') as HTMLButtonElement
  const segBtns = wrap.querySelectorAll<HTMLButtonElement>('.sx-modal__seg-btn')
  const nameInput = wrap.querySelector('#sx-session-name') as HTMLInputElement
  const balanceInput = wrap.querySelector('#sx-session-balance') as HTMLInputElement
  const propRulesWrap = wrap.querySelector('#sx-prop-rules') as HTMLElement
  const propProfitInput = wrap.querySelector('#sx-prop-profit') as HTMLInputElement
  const propDrawdownInput = wrap.querySelector('#sx-prop-drawdown') as HTMLInputElement
  const propDailyInput = wrap.querySelector('#sx-prop-daily') as HTMLInputElement
  const layoutSelect = wrap.querySelector('#sx-session-layout') as HTMLSelectElement
  const nameErr = wrap.querySelector('#sx-session-name-err')!
  const assetsErr = wrap.querySelector('#sx-session-assets-err')!

  const assetdd = wrap.querySelector('#sx-assetdd') as HTMLElement
  const assetHidden = wrap.querySelector('#sx-session-assets') as HTMLInputElement
  const assetTrigger = wrap.querySelector('#sx-assetdd-trigger') as HTMLButtonElement
  const assetPanel = wrap.querySelector('#sx-assetdd-panel') as HTMLElement
  const assetSheet = wrap.querySelector('.sx-assetdd__sheet') as HTMLElement
  const assetSearch = wrap.querySelector('.sx-assetdd__search') as HTMLInputElement
  const assetPills = wrap.querySelector('.sx-assetdd__pills') as HTMLElement
  const assetList = wrap.querySelector('.sx-assetdd__list') as HTMLElement
  const tagsContainer = wrap.querySelector('#sx-asset-tags') as HTMLElement
  const triggerPh = wrap.querySelector('#sx-asset-ph') as HTMLElement
  const startDateInput = wrap.querySelector('#sx-session-start-date') as HTMLInputElement
  const endDateInput = wrap.querySelector('#sx-session-end-date') as HTMLInputElement
  const startDtWrap = wrap.querySelector('#sx-session-start-dt') as HTMLElement
  const startDateDisplay = wrap.querySelector('#sx-session-start-display') as HTMLInputElement
  const startCalBtn = wrap.querySelector('#sx-session-start-cal') as HTMLButtonElement
  const endDtWrap = wrap.querySelector('#sx-session-end-dt') as HTMLElement
  const endDateDisplay = wrap.querySelector('#sx-session-end-display') as HTMLInputElement
  const endCalBtn = wrap.querySelector('#sx-session-end-cal') as HTMLButtonElement
  const datesErr = wrap.querySelector('#sx-session-dates-err') as HTMLElement
  const randomEndCb = wrap.querySelector('#sx-session-end-random') as HTMLInputElement
  const autoEndSwitch = wrap.querySelector('#sx-session-auto-end') as HTMLButtonElement
  const startHint = wrap.querySelector('#sx-session-start-hint') as HTMLElement
  const endHint = wrap.querySelector('#sx-session-end-hint') as HTMLElement
  const healthBanner = wrap.querySelector('#sx-session-health-banner') as HTMLElement
  const coverageHint = wrap.querySelector('#sx-session-coverage-hint') as HTMLElement
  const modalScroll = wrap.querySelector('.sx-modal__scroll') as HTMLElement | null

  const isProd = import.meta.env.PROD

  let marketHealthCache: Awaited<ReturnType<typeof fetchMarketDataHealth>> | null = null

  async function syncHealthBanner() {
    if (!healthBanner) return
    if (!marketHealthCache) marketHealthCache = await fetchMarketDataHealth()
    const msg = buildSessionModalHealthMessage(marketHealthCache, selectedSymbols, isProd)
    if (msg) {
      healthBanner.hidden = false
      healthBanner.textContent = msg
    } else {
      healthBanner.hidden = true
      healthBanner.textContent = ''
    }
  }

  function syncCoverageHint() {
    if (!coverageHint) return
    const hint = buildCoverageFallbackHint(barCoverage.minIso)
    if (hint && selectedSymbols.length > 0) {
      coverageHint.hidden = false
      coverageHint.textContent = hint
    } else {
      coverageHint.hidden = true
      coverageHint.textContent = ''
    }
  }

  let barCoverage: BarCoverageBounds = fallbackBarCoverage()
  let coverageRequestId = 0

  function applyDateBounds() {
    startHint.textContent = `Min: ${formatHintDate(barCoverage.minIso)}`
    endHint.textContent = `Max: ${formatHintDate(barCoverage.maxIso)}`
  }

  function clampDatesToCoverage() {
    const minDt = barCoverage.minDatetimeLocal
    const maxDt = barCoverage.maxDatetimeLocal
    if (startDateInput.value) {
      assignStartValue(clampDateTimeLocal(startDateInput.value, minDt, maxDt), false)
    }
    if (endDateInput.value) {
      assignEndValue(clampDateTimeLocal(endDateInput.value, minDt, maxDt), false)
    }
  }

  async function refreshBarCoverage() {
    const req = ++coverageRequestId
    const bounds = await resolveBarCoverageForSymbols(selectedSymbols)
    if (req !== coverageRequestId) return
    barCoverage = bounds
    applyDateBounds()
    clampDatesToCoverage()
    syncCoverageHint()
    syncSubmit()
  }

  function syncStartDisplayOnly() {
    const v = startDateInput.value
    startDateDisplay.value = v ? formatDatetimeLocalDisplay(v) : ''
  }

  function syncEndDisplayOnly() {
    const v = endDateInput.value
    endDateDisplay.value = v ? formatDatetimeLocalDisplay(v) : ''
  }

  function assignStartValue(v: string, fireInput = true) {
    startDateInput.value = v
    syncStartDisplayOnly()
    requestAnimationFrame(() => {
      syncStartDisplayOnly()
      startDateDisplay.scrollLeft = startDateDisplay.scrollWidth
    })
    if (fireInput) startDateInput.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function assignEndValue(v: string, fireInput = true) {
    endDateInput.value = v
    syncEndDisplayOnly()
    requestAnimationFrame(() => {
      syncEndDisplayOnly()
      endDateDisplay.scrollLeft = endDateDisplay.scrollWidth
    })
    if (fireInput) endDateInput.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function openStartDatetimePicker() {
    if (startDateInput.disabled || randomEndCb.checked) return
    applyDateBounds()
    openSessionDatetimePicker({
      anchor: startDtWrap,
      value: startDateInput.value,
      min: barCoverage.minDatetimeLocal,
      max: barCoverage.maxDatetimeLocal,
      onChange: (v) => assignStartValue(v),
    })
  }

  function openEndDatetimePicker() {
    if (endDateInput.disabled || randomEndCb.checked) return
    applyDateBounds()
    openSessionDatetimePicker({
      anchor: endDtWrap,
      value: endDateInput.value,
      min: barCoverage.minDatetimeLocal,
      max: barCoverage.maxDatetimeLocal,
      onChange: (v) => assignEndValue(v),
    })
  }

  let activePill: 'all' | AssetCategory = 'all'
  let assetPanelOpen = false
  let onDocDown: ((e: MouseEvent) => void) | null = null
  /** Selection order preserved; comma-joined in hidden field. */
  let selectedSymbols: string[] = []

  const onAssetSheetWheel = (e: WheelEvent) => {
    e.stopPropagation()
  }

  const onRepositionAssetPanel = () => {
    syncAssetPanelPosition()
  }

  /** Fixed to viewport; wide popover + tall sheet; opens upward if more room above (e.g. after modal scroll). */
  function syncAssetPanelPosition() {
    if (!assetPanelOpen) return
    const pr = panel.getBoundingClientRect()
    const r = assetTrigger.getBoundingClientRect()
    const vwPad = 14
    const maxPopoverW = Math.min(820, window.innerWidth - vwPad)
    const inset = 10
    const rawW = pr.width - inset * 2
    const minW = Math.min(620, maxPopoverW)
    const w = Math.min(Math.max(rawW, minW), maxPopoverW)
    let left = pr.left + (pr.width - w) / 2
    left = Math.max(vwPad / 2, Math.min(left, window.innerWidth - w - vwPad / 2))

    const gap = 8
    const bottomPad = 16
    const topPad = 10
    const spaceBelow = window.innerHeight - r.bottom - gap - bottomPad
    const spaceAbove = r.top - gap - topPad
    const cap = 680
    const maxBelow = Math.min(cap, Math.max(0, spaceBelow))
    const maxAbove = Math.min(cap, Math.max(0, spaceAbove))
    const openBelow = maxBelow >= 260 || maxBelow >= maxAbove
    let topPx: number
    let maxH: number
    if (openBelow) {
      topPx = r.bottom + gap
      maxH = Math.max(200, maxBelow)
    } else {
      maxH = Math.max(200, maxAbove)
      topPx = Math.max(topPad, r.top - gap - maxH)
    }

    assetPanel.style.position = 'fixed'
    assetPanel.style.left = `${left}px`
    assetPanel.style.top = `${topPx}px`
    assetPanel.style.width = `${w}px`
    assetPanel.style.maxHeight = 'none'
    assetPanel.style.right = 'auto'
    assetSheet.style.maxHeight = `${maxH}px`
  }

  function clearAssetPanelPosition() {
    assetPanel.style.removeProperty('position')
    assetPanel.style.removeProperty('left')
    assetPanel.style.removeProperty('top')
    assetPanel.style.removeProperty('width')
    assetPanel.style.removeProperty('max-height')
    assetPanel.style.removeProperty('right')
    assetSheet.style.removeProperty('max-height')
  }

  ASSET_PILLS.forEach((p, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'sx-assetdd__pill' + (i === 0 ? ' sx-assetdd__pill--on' : '')
    b.dataset.pill = p.id
    b.setAttribute('role', 'tab')
    b.textContent = p.label
    b.addEventListener('click', () => {
      activePill = p.id as 'all' | AssetCategory
      assetPills.querySelectorAll('.sx-assetdd__pill').forEach((el) => {
        el.classList.toggle('sx-assetdd__pill--on', (el as HTMLElement).dataset.pill === activePill)
      })
      renderAssetList()
    })
    assetPills.appendChild(b)
  })

  function sectionsToRender(): { heading: string; rows: CatalogAsset[] }[] {
    const q = assetSearch.value.trim().toLowerCase()
    const matchCat = (a: CatalogAsset) => activePill === 'all' || a.category === activePill
    const matchQ = (a: CatalogAsset) =>
      !q || a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    const filtered = ASSET_CATALOG.filter((a) => matchCat(a) && matchQ(a))

    if (activePill === 'all' && !q) {
      const recent = RECENT_SYMBOLS.map((s) => findAsset(s)).filter((x): x is CatalogAsset => Boolean(x))
      const seen = new Set(recent.map((r) => r.symbol))
      const rest = ASSET_CATALOG.filter((a) => !seen.has(a.symbol))
      const buckets: Record<AssetCategory, CatalogAsset[]> = {
        stocks: [],
        futures: [],
        forex: [],
        crypto: [],
        indices: [],
        metals: [],
        energies: [],
        agriculture: [],
      }
      for (const a of rest) buckets[a.category].push(a)
      const out: { heading: string; rows: CatalogAsset[] }[] = []
      if (recent.length) out.push({ heading: 'Recently used', rows: recent })
      for (const c of CATEGORY_ORDER) {
        if (buckets[c].length) out.push({ heading: CATEGORY_HEADINGS[c], rows: buckets[c] })
      }
      return out
    }

    const heading =
      activePill === 'all'
        ? 'Results'
        : ASSET_PILLS.find((p) => p.id === activePill)?.label ?? 'Results'
    if (!filtered.length) return [{ heading: 'No matches', rows: [] }]
    return [{ heading, rows: filtered }]
  }

  function renderBadge(a: CatalogAsset): HTMLElement | null {
    if (!a.badge) return null
    const wrapB = document.createElement('span')
    wrapB.className = 'sx-assetdd__meta'
    if (a.badge.kind === 'broker') {
      const sp = document.createElement('span')
      sp.className = 'sx-assetdd__broker'
      sp.textContent = a.badge.label
      wrapB.appendChild(sp)
      if (a.badge.sub) {
        const sub = document.createElement('span')
        sub.className = 'sx-assetdd__prosub'
        sub.textContent = a.badge.sub
        wrapB.appendChild(sub)
      }
      return wrapB
    }
    const pro = document.createElement('span')
    pro.className = 'sx-assetdd__proline'
    const badge = document.createElement('span')
    badge.className = 'sx-assetdd__badge-pro'
    badge.innerHTML = `${icons.bolt}<span>Pro</span>`
    pro.appendChild(badge)
    if (a.badge.sub) {
      const sub = document.createElement('span')
      sub.className = 'sx-assetdd__prosub'
      sub.textContent = a.badge.sub
      pro.appendChild(sub)
    }
    wrapB.appendChild(pro)
    return wrapB
  }

  function renderAssetList() {
    assetList.replaceChildren()
    for (const { heading, rows } of sectionsToRender()) {
      const h = document.createElement('div')
      h.className = 'sx-assetdd__section'
      h.textContent = heading
      assetList.appendChild(h)
      for (const r of rows) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'sx-assetdd__row'
        if (selectedSymbols.includes(r.symbol)) btn.classList.add('sx-assetdd__row--picked')
        btn.setAttribute('role', 'option')
        btn.dataset.symbol = r.symbol
        const main = document.createElement('span')
        main.className = 'sx-assetdd__row-main'
        const sym = document.createElement('span')
        sym.className = 'sx-assetdd__sym'
        sym.textContent = r.symbol
        const nm = document.createElement('span')
        nm.className = 'sx-assetdd__name'
        nm.textContent = r.name
        main.appendChild(sym)
        main.appendChild(nm)
        btn.appendChild(main)
        const badge = renderBadge(r)
        if (badge) btn.appendChild(badge)
        btn.addEventListener('click', () => addAsset(r.symbol))
        assetList.appendChild(btn)
      }
    }
    if (assetPanelOpen) requestAnimationFrame(() => syncAssetPanelPosition())
  }

  function syncAssetTags() {
    tagsContainer.replaceChildren()
    for (const sym of selectedSymbols) {
      const a = findAsset(sym)
      const tag = document.createElement('span')
      tag.className = 'sx-assetdd__tag'
      const dot = document.createElement('span')
      dot.className = `sx-assetdd__tag-dot ${a ? categoryDotClass(a.category) : 'sx-assetdd__tag-dot--def'}`
      dot.setAttribute('aria-hidden', 'true')
      const lbl = document.createElement('span')
      lbl.className = 'sx-assetdd__tag-sym'
      lbl.textContent = sym
      const rm = document.createElement('button')
      rm.type = 'button'
      rm.className = 'sx-assetdd__tag-remove'
      rm.setAttribute('aria-label', `Remove ${sym}`)
      rm.innerHTML = icons.close
      rm.addEventListener('click', (ev) => {
        ev.stopPropagation()
        removeAsset(sym)
      })
      tag.append(dot, lbl, rm)
      tagsContainer.appendChild(tag)
    }
    assetHidden.value = selectedSymbols.join(',')
    const empty = selectedSymbols.length === 0
    triggerPh.hidden = !empty
    syncSubmit()
  }

  function addAsset(symbol: string) {
    const a = findAsset(symbol)
    if (!a) return
    const u = a.symbol.toUpperCase()
    if (selectedSymbols.includes(u)) return
    selectedSymbols.push(u)
    clearAssetsError()
    assetdd.classList.remove('sx-assetdd--error')
    syncAssetTags()
    renderAssetList()
    void refreshBarCoverage()
    void syncHealthBanner()
    closeAssetPanel()
  }

  function removeAsset(symbol: string) {
    const u = symbol.toUpperCase()
    selectedSymbols = selectedSymbols.filter((s) => s !== u)
    syncAssetTags()
    renderAssetList()
    void refreshBarCoverage()
    void syncHealthBanner()
  }

  function clearAssetSelection() {
    selectedSymbols = []
    syncAssetTags()
    renderAssetList()
    void refreshBarCoverage()
    void syncHealthBanner()
  }

  function openAssetPanel() {
    assetPanelOpen = true
    assetdd.classList.add('sx-assetdd--open')
    assetTrigger.setAttribute('aria-expanded', 'true')
    assetSearch.value = ''
    renderAssetList()
    syncAssetPanelPosition()
    assetPanel.removeAttribute('hidden')
    window.addEventListener('resize', onRepositionAssetPanel)
    modalScroll?.addEventListener('scroll', onRepositionAssetPanel, true)
    onDocDown = (e: MouseEvent) => {
      if (!assetdd.contains(e.target as Node)) closeAssetPanel()
    }
    document.addEventListener('mousedown', onDocDown, true)
    assetPanel.addEventListener('wheel', onAssetSheetWheel, { passive: true })
    requestAnimationFrame(() => {
      syncAssetPanelPosition()
      assetSearch.focus()
    })
  }

  function closeAssetPanel() {
    if (!assetPanelOpen) return
    assetPanelOpen = false
    assetPanel.removeEventListener('wheel', onAssetSheetWheel)
    window.removeEventListener('resize', onRepositionAssetPanel)
    modalScroll?.removeEventListener('scroll', onRepositionAssetPanel, true)
    assetPanel.setAttribute('hidden', '')
    clearAssetPanelPosition()
    assetdd.classList.remove('sx-assetdd--open')
    assetTrigger.setAttribute('aria-expanded', 'false')
    if (onDocDown) {
      document.removeEventListener('mousedown', onDocDown, true)
      onDocDown = null
    }
  }

  assetTrigger.addEventListener('click', () => {
    if (assetPanelOpen) closeAssetPanel()
    else openAssetPanel()
  })

  assetSearch.addEventListener('input', () => {
    renderAssetList()
  })

  assetSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeAssetPanel()
    }
  })

  function setSeg(type: 'backtest' | 'prop') {
    segBtns.forEach((b) => {
      const on = b.dataset.seg === type
      b.classList.toggle('sx-modal__seg-btn--on', on)
    })
    if (propRulesWrap) propRulesWrap.hidden = type !== 'prop'
  }

  function readPropRulesFromForm(): SessionCreatedPayload['propRules'] {
    return normalizePropRules({
      profitTargetPct: Number(propProfitInput?.value),
      maxDrawdownPct: Number(propDrawdownInput?.value),
      maxDailyLossPct: Number(propDailyInput?.value),
    })
  }

  function applyPropRulesToForm(rules?: SessionCreatedPayload['propRules'] | null) {
    const r = normalizePropRules(rules ?? DEFAULT_PROP_RULES)
    if (propProfitInput) propProfitInput.value = String(r.profitTargetPct)
    if (propDrawdownInput) propDrawdownInput.value = String(r.maxDrawdownPct)
    if (propDailyInput) propDailyInput.value = String(r.maxDailyLossPct)
  }

  segBtns.forEach((b) => {
    b.addEventListener('click', () => {
      const t = b.dataset.seg as 'backtest' | 'prop'
      if (t) setSeg(t)
    })
  })

  function clearNameError() {
    nameErr.setAttribute('hidden', '')
    nameInput.classList.remove('sx-input--error')
  }

  function showNameError() {
    nameErr.removeAttribute('hidden')
    nameInput.classList.add('sx-input--error')
  }

  function clearAssetsError() {
    assetsErr.setAttribute('hidden', '')
    assetdd.classList.remove('sx-assetdd--error')
  }

  function showAssetsError() {
    assetsErr.removeAttribute('hidden')
    assetdd.classList.add('sx-assetdd--error')
  }

  function assetValid() {
    return selectedSymbols.length > 0 && selectedSymbols.every((s) => Boolean(findAsset(s)))
  }

  function clearDatesError() {
    datesErr.setAttribute('hidden', '')
    datesErr.textContent = ''
    startDtWrap.classList.remove('sx-dt-field--error')
    endDtWrap.classList.remove('sx-dt-field--error')
  }

  function showDatesError(msg: string) {
    datesErr.textContent = msg
    datesErr.removeAttribute('hidden')
    startDtWrap.classList.add('sx-dt-field--error')
    endDtWrap.classList.add('sx-dt-field--error')
  }

  function datesValid(): boolean {
    const s = startDateInput.value
    const e = endDateInput.value
    if (!s || !e) return false
    const ds = new Date(s)
    const de = new Date(e)
    const minD = new Date(barCoverage.minDatetimeLocal)
    const maxD = new Date(barCoverage.maxDatetimeLocal)
    if (Number.isNaN(ds.getTime()) || Number.isNaN(de.getTime())) return false
    if (ds < minD || de > maxD) return false
    if (ds > de) return false
    return true
  }

  function canSubmit() {
    return nameInput.value.trim().length > 0 && assetValid() && datesValid()
  }

  function syncSubmit() {
    btnSubmit.disabled = !canSubmit()
  }

  nameInput.addEventListener('input', () => {
    clearNameError()
    syncSubmit()
  })
  nameInput.addEventListener('blur', () => {
    if (!nameInput.value.trim()) showNameError()
  })

  balanceInput.addEventListener('input', syncSubmit)
  layoutSelect.addEventListener('change', syncSubmit)

  wrap.querySelector('#sx-request-asset')?.addEventListener('click', () => {
    window.alert('Request asset — link this to your intake form or support channel when ready.')
  })

  function setAutoEndOn(on: boolean) {
    autoEndSwitch.setAttribute('aria-checked', on ? 'true' : 'false')
    autoEndSwitch.classList.toggle('sx-auto-end-switch--on', on)
  }

  /** Pick random start/end in range; end is always >= start. */
  function applyRandomDateRange() {
    const minDt = barCoverage.minDatetimeLocal
    const maxDt = barCoverage.maxDatetimeLocal
    const lo = new Date(minDt)
    const hi = new Date(maxDt)
    if (Number.isNaN(lo.getTime()) || Number.isNaN(hi.getTime())) return
    const spanMs = hi.getTime() - lo.getTime()
    if (spanMs < 60_000) {
      assignStartValue(minDt, false)
      assignEndValue(maxDt, false)
      syncSubmit()
      return
    }
    const t = lo.getTime() + Math.random() * spanMs
    const start = formatDatetimeLocal(new Date(t))
    assignStartValue(clampDateTimeLocal(start, minDt, maxDt), false)
    const endT = lo.getTime() + Math.random() * (hi.getTime() - new Date(start).getTime())
    assignEndValue(clampDateTimeLocal(formatDatetimeLocal(new Date(Math.max(endT, new Date(start).getTime()))), minDt, maxDt), false)
    syncSubmit()
  }

  function syncDateControlsDisabledState() {
    const randomOn = randomEndCb.checked
    if (randomOn) setAutoEndOn(false)
    const autoEndOn = !randomOn && autoEndSwitch.getAttribute('aria-checked') === 'true'
    startDateInput.disabled = randomOn
    endDateInput.disabled = randomOn || autoEndOn
    startDateDisplay.disabled = randomOn
    endDateDisplay.disabled = randomOn || autoEndOn
    startCalBtn.disabled = randomOn
    endCalBtn.disabled = randomOn || autoEndOn
    wrap.querySelectorAll<HTMLButtonElement>('[data-date-quick]').forEach((b) => {
      b.disabled = randomOn || autoEndOn
    })
    autoEndSwitch.disabled = randomOn
  }

  startDateInput.addEventListener('input', () => {
    if (randomEndCb.checked) return
    clearDatesError()
    randomEndCb.checked = false
    const maxDt = barCoverage.maxDatetimeLocal
    const s = startDateInput.value
    const e = endDateInput.value
    if (s && e) {
      const ds = new Date(s)
      const de = new Date(e)
      if (!Number.isNaN(ds.getTime()) && !Number.isNaN(de.getTime()) && ds > de) {
        const maxT = new Date(maxDt).getTime()
        assignEndValue(formatDatetimeLocal(new Date(Math.min(ds.getTime(), maxT))))
      }
    }
    if (autoEndSwitch.getAttribute('aria-checked') === 'true') {
      assignEndValue(maxDt, false)
    }
    syncSubmit()
  })

  endDateInput.addEventListener('input', () => {
    if (randomEndCb.checked || endDateInput.disabled) return
    clearDatesError()
    randomEndCb.checked = false
    setAutoEndOn(false)
    syncDateControlsDisabledState()
    syncSubmit()
  })

  startCalBtn.addEventListener('click', (e) => {
    e.preventDefault()
    openStartDatetimePicker()
  })
  startDateDisplay.addEventListener('click', () => openStartDatetimePicker())
  endCalBtn.addEventListener('click', (e) => {
    e.preventDefault()
    openEndDatetimePicker()
  })
  endDateDisplay.addEventListener('click', () => openEndDatetimePicker())

  wrap.querySelectorAll<HTMLButtonElement>('[data-date-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (randomEndCb.checked) return
      setAutoEndOn(false)
      randomEndCb.checked = false
      clearDatesError()
      const maxDt = barCoverage.maxDatetimeLocal
      const start = startDateInput.value
      if (!start) {
        showDatesError('Choose an initial date and time first.')
        return
      }
      const q = btn.getAttribute('data-date-quick')
      let next: string
      if (q === '1d') next = endFromStartPlusDays(start, 1, maxDt)
      else if (q === '1w') next = endFromStartPlusDays(start, 7, maxDt)
      else if (q === '1m') next = endFromStartPlusOneMonth(start, maxDt)
      else return
      assignEndValue(next)
      syncDateControlsDisabledState()
      syncSubmit()
    })
  })

  randomEndCb.addEventListener('change', () => {
    clearDatesError()
    if (!randomEndCb.checked) {
      syncDateControlsDisabledState()
      syncSubmit()
      return
    }
    setAutoEndOn(false)
    applyRandomDateRange()
    syncDateControlsDisabledState()
    syncSubmit()
  })

  autoEndSwitch.addEventListener('click', () => {
    if (autoEndSwitch.disabled) return
    const next = autoEndSwitch.getAttribute('aria-checked') !== 'true'
    setAutoEndOn(next)
    if (next) {
      syncDateControlsDisabledState()
      const maxDt = barCoverage.maxDatetimeLocal
      assignEndValue(maxDt, false)
      const s = startDateInput.value
      const ds = s ? new Date(s) : null
      const dm = new Date(maxDt)
      if (ds && !Number.isNaN(ds.getTime()) && !Number.isNaN(dm.getTime()) && ds > dm) {
        assignStartValue(maxDt, false)
      }
    }
    clearDatesError()
    syncDateControlsDisabledState()
    syncSubmit()
  })

  function close() {
    editingSessionId = null
    closeSessionDatetimePicker()
    closeAssetPanel()
    wrap.setAttribute('hidden', '')
    document.body.classList.remove('sx-modal-open')
    document.removeEventListener('keydown', onKey)
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (isSessionDatetimePickerOpen()) {
        e.preventDefault()
        closeSessionDatetimePicker()
        return
      }
      if (assetPanelOpen) {
        e.preventDefault()
        closeAssetPanel()
        return
      }
      e.preventDefault()
      close()
    }
  }

  const modalTitle = wrap.querySelector('#sx-modal-title') as HTMLElement | null

  function open(opts?: SessionModalOpenOpts) {
    editingSessionId = opts?.editSessionId?.trim() || null
    if (modalTitle) {
      modalTitle.textContent = editingSessionId ? 'Edit session' : 'Create a quick session'
    }
    const d = opts?.draft
    const seg: 'backtest' | 'prop' =
      d?.sessionType === 'prop' || opts?.sessionType === 'prop' ? 'prop' : 'backtest'
    setSeg(seg)
    applyPropRulesToForm(d?.propRules)
    nameInput.value = d?.name?.trim() ?? ''
    balanceInput.value = d?.balance?.trim() || '100000'
    layoutSelect.value = d?.layout ?? ''
    barCoverage = fallbackBarCoverage()
    applyDateBounds()
    clearAssetSelection()
    if (d?.assets?.trim()) {
      const parts = d.assets
        .split(/[,;]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
      for (const sym of parts) {
        if (findAsset(sym)) addAsset(sym)
      }
    }
    const minDt = barCoverage.minDatetimeLocal
    const maxDt = barCoverage.maxDatetimeLocal
    const ds = d?.startDate?.trim()
    const de = d?.endDate?.trim()
    const dtPat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
    const todayNow = nowDatetimeLocal()
    if (ds && dtPat.test(ds)) assignStartValue(clampDateTimeLocal(ds, minDt, maxDt), false)
    else if (ds && /^\d{4}-\d{2}-\d{2}$/.test(ds)) {
      const maxD = barCoverage.maxIso
      assignStartValue(`${clampIsoToRange(ds, barCoverage.minIso, maxD)}T00:00`, false)
    } else assignStartValue(todayNow, false)
    if (de && dtPat.test(de)) assignEndValue(clampDateTimeLocal(de, minDt, maxDt), false)
    else if (de && /^\d{4}-\d{2}-\d{2}$/.test(de)) {
      const maxD = barCoverage.maxIso
      assignEndValue(`${clampIsoToRange(de, barCoverage.minIso, maxD)}T23:59`, false)
    } else assignEndValue(todayNow, false)
    randomEndCb.checked = false
    setAutoEndOn(false)
    syncDateControlsDisabledState()
    activePill = 'all'
    assetPills.querySelectorAll('.sx-assetdd__pill').forEach((el, i) => {
      el.classList.toggle('sx-assetdd__pill--on', i === 0)
    })
    assetSearch.value = ''
    clearNameError()
    clearAssetsError()
    clearDatesError()
    renderAssetList()
    syncSubmit()
    void refreshBarCoverage()
    void syncHealthBanner()
    wrap.removeAttribute('hidden')
    document.body.classList.add('sx-modal-open')
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => nameInput.focus())
  }

  backdrop.addEventListener('click', close)
  btnClose.addEventListener('click', close)
  btnCancel.addEventListener('click', close)
  btnAdvanced.addEventListener('click', () => {
    window.alert('Advanced session — open a fuller wizard when you build it.')
  })

  btnSubmit.addEventListener('click', () => {
    if (!nameInput.value.trim()) {
      showNameError()
      return
    }
    if (!assetValid()) {
      showAssetsError()
      return
    }
    applyDateBounds()
    const s = startDateInput.value
    const e = endDateInput.value
    if (!s || !e) {
      showDatesError('Initial Date and End Date are required.')
      return
    }
    const ds = new Date(s)
    const de = new Date(e)
    const minD = new Date(barCoverage.minDatetimeLocal)
    const maxD = new Date(barCoverage.maxDatetimeLocal)
    if (Number.isNaN(ds.getTime()) || Number.isNaN(de.getTime())) {
      showDatesError('Enter valid dates and times.')
      return
    }
    if (ds < minD) {
      showDatesError(`Initial Date cannot be before ${formatHintDate(barCoverage.minIso)}.`)
      return
    }
    if (de > maxD) {
      showDatesError(`End Date cannot be after ${formatHintDate(barCoverage.maxIso)}.`)
      return
    }
    if (ds > de) {
      showDatesError('Initial Date must be on or before End Date.')
      return
    }
    clearDatesError()
    const sessionType =
      (wrap.querySelector('.sx-modal__seg-btn--on') as HTMLButtonElement | null)?.dataset.seg ?? 'backtest'
    const payload: SessionCreatedPayload = {
      name: nameInput.value.trim(),
      balance: balanceInput.value.trim(),
      assets: selectedSymbols.join(','),
      layout: layoutSelect.value || null,
      sessionType: sessionType === 'prop' ? 'prop' : 'backtest',
      startDate: s,
      endDate: e,
      ...(sessionType === 'prop' ? { propRules: readPropRulesFromForm() } : {}),
    }
    if (editingSessionId) {
      options?.onSessionUpdate?.(editingSessionId, payload)
    } else {
      options?.onSessionCreate?.(payload)
    }
    close()
  })

  panel.addEventListener('click', (e) => e.stopPropagation())

  renderAssetList()
  syncDateControlsDisabledState()

  return { open, close }
}
