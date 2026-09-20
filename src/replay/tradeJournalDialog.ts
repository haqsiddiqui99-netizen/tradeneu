import './tradeJournalDialog.css'
import {
  normalizeJournalScreenshots,
  normalizeJournalVoiceNotes,
  type ClosedReplayTrade,
  type ReplayJournalScreenshot,
  type ReplayJournalVoiceNote,
  type ReplayTradeJournal,
} from './replayPositions'

/**
 * Single shared "Trade journal" dialog used everywhere a trade's journal can
 * be opened (the dashboard Trades table and the in-chart replay Closed
 * Positions panel). It's appended directly to <body> so it works regardless
 * of which page/root invoked it, and its CSS (tradeJournalDialog.css) uses
 * only literal colors for the same reason.
 */

/** One row in the "All trades" list opened from the toolbar pill. */
export type TradeJournalListRow = {
  /** Opaque key identifying the trade to the caller (passed back via onSelectTradeFromList). */
  key: string
  asset: string
  direction: 'long' | 'short'
  /** 'open' for a still-open position (shown but not clickable); otherwise its realized P&L. */
  status: 'open' | number
  timestampMs: number
}

export type TradeJournalDialogEntry = {
  trade: ClosedReplayTrade
  asset: string
  onSave: (tradeNum: number, journal: ReplayTradeJournal) => void
  getPrev?: () => TradeJournalDialogEntry | null
  getNext?: () => TradeJournalDialogEntry | null
  /** Captures the live chart into a data URL, e.g. for a screenshot button. Only
   *  available when the dialog is opened from a page that has a chart on screen. */
  onCaptureChartScreenshot?: () => Promise<string | null>
  /** Powers the "All trades" list opened from the toolbar pill. When omitted, the
   *  pill falls back to its old behavior of just closing the dialog. */
  listAllTrades?: () => TradeJournalListRow[]
  /** Called when the user picks a closed trade from that list; should open its journal. */
  onSelectTradeFromList?: (key: string) => void
  /** When true, renders a compact read-only, tabular view of whatever was already
   *  filled in (only non-empty sections shown) instead of the full editable form.
   *  Used by the dashboard Trades page, where trades are reviewed, not edited. */
  readOnly?: boolean
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatSignedMoney(v: number): string {
  const sign = v >= 0 ? '+' : '\u2212'
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function sessionForHour(h: number): 'Asia' | 'London' | 'New York' | 'Out of session' {
  if (h >= 0 && h < 8) return 'Asia'
  if (h >= 8 && h < 13) return 'London'
  if (h >= 13 && h < 21) return 'New York'
  return 'Out of session'
}

function snapChipHtml(label: string, valueHtml: string, cls = ''): string {
  return `<div class="sx-trade-journal-dialog__snap-chip"><div class="sx-trade-journal-dialog__snap-label">${escapeHtml(label)}</div><div class="sx-trade-journal-dialog__snap-value${cls ? ` ${cls}` : ''}">${valueHtml}</div></div>`
}

function naValue(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? 'N/A' : String(v)
}

function exitReasonLabel(reason: ClosedReplayTrade['exitReason']): string {
  if (reason === 'take_profit') return 'Take profit'
  if (reason === 'stop_loss') return 'Stop loss'
  return 'Manual close'
}

export const REFLECTION_OPTIONS: Record<'wentWell' | 'toImprove', string[]> = {
  wentWell: [
    'Followed my plan',
    'Good entry timing',
    'Managed risk well',
    'Patient with the exit',
    'Sized correctly',
    'Cut a loser fast',
    'Waited for confirmation',
    'Journaled before entry',
  ],
  toImprove: [
    'Moved my stop',
    'Oversized the position',
    'FOMO entry',
    'Revenge traded',
    'Ignored my plan',
    'Exited too early',
    'Exited too late',
    'Chased the price',
  ],
}

export const EMOTIONS: Record<'constructive' | 'destructive' | 'neutral', string[]> = {
  constructive: ['Confident', 'Calm', 'Focused', 'Disciplined', 'Patient', 'Hopeful', 'Relief', 'Eager'],
  destructive: [
    'Greedy',
    'Fearful',
    'FOMO',
    'Anxious',
    'Overconfident',
    'Hesitant',
    'Doubtful',
    'Impatient',
    'Frustrated',
    'Angry',
    'Revengeful',
    'Nervous',
    'Stressed',
    'Regretful',
    'Indecisive',
    'Rushed',
    'Disappointed',
    'Worried',
    'Panicked',
    'Tilted',
  ],
  neutral: ['Excited', 'Bored'],
}

let activeOverlay: HTMLElement | null = null
let activeTeardown: (() => void) | null = null
let activeLightboxClose: (() => void) | null = null

// Sequence appended to the timestamp below so two screenshots captured within
// the same second still get distinct names (rolls over 00-99, session-wide).
let tnChartNameCounter = 0
/** Auto-generated screenshot file name: a 16-digit number encoding the exact
 *  capture date & time (YYYYMMDDHHMMSS, 14 digits) plus a 2-digit sequence
 *  for same-second uniqueness, e.g. "TN_Chart_2026091915313001.png". */
function nextTnChartName(): string {
  const now = new Date()
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const stamp =
    `${pad(now.getFullYear(), 4)}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  tnChartNameCounter = (tnChartNameCounter + 1) % 100
  return `TN_Chart_${stamp}${pad(tnChartNameCounter)}.png`
}

/** Small literal-colored text-input modal (this dialog lives outside any
 *  page-scoped CSS, so it can't reuse other prompt modals). Resolves with
 *  the entered value, or null if cancelled/escaped. */
function showTradeJournalTextPrompt(opts: { title: string; initialValue?: string; confirmLabel?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = document.createElement('div')
    modal.className = 'sx-trade-journal-prompt-overlay'
    modal.innerHTML = `
      <div class="sx-trade-journal-prompt-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(opts.title)}">
        <div class="sx-trade-journal-prompt-title">${escapeHtml(opts.title)}</div>
        <input type="text" class="sx-trade-journal-prompt-input" value="${escapeHtml(opts.initialValue ?? '')}">
        <div class="sx-trade-journal-prompt-actions">
          <button type="button" class="sx-trade-journal-prompt-btn sx-trade-journal-prompt-btn--cancel">Cancel</button>
          <button type="button" class="sx-trade-journal-prompt-btn sx-trade-journal-prompt-btn--confirm">${escapeHtml(opts.confirmLabel ?? 'Save')}</button>
        </div>
      </div>
    `
    document.body.appendChild(modal)
    const input = modal.querySelector<HTMLInputElement>('.sx-trade-journal-prompt-input')!
    requestAnimationFrame(() => {
      input.focus()
      input.select()
    })
    const close = (value: string | null) => {
      document.removeEventListener('keydown', keyHandler)
      modal.remove()
      resolve(value)
    }
    const keyHandler = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') close(null)
      else if (ev.key === 'Enter') close(input.value)
    }
    document.addEventListener('keydown', keyHandler)
    modal.querySelector('.sx-trade-journal-prompt-btn--cancel')?.addEventListener('click', () => close(null))
    modal.querySelector('.sx-trade-journal-prompt-btn--confirm')?.addEventListener('click', () => close(input.value))
    modal.addEventListener('click', (ev) => {
      if (ev.target === modal) close(null)
    })
  })
}

export function closeTradeJournalDialog() {
  activeLightboxClose?.()
  activeLightboxClose = null
  activeTeardown?.()
  activeTeardown = null
  if (activeOverlay) {
    activeOverlay.remove()
    activeOverlay = null
  }
}

export function openTradeJournalDialog(entry: TradeJournalDialogEntry, opts?: { instant?: boolean }) {
  closeTradeJournalDialog()
  const { trade, asset, onSave, getPrev, getNext, onCaptureChartScreenshot, readOnly } = entry

  const side = trade.direction === 'long' ? 'buy' : 'sell'
  const sideCls = trade.direction === 'long' ? 'sx-trade-journal-dialog__side--buy' : 'sx-trade-journal-dialog__side--sell'
  const entryTimeMs = trade.entryRealTime ?? trade.entryTime * 1000
  const durationMin = Math.max(0, Math.round((trade.exitTime - trade.entryTime) / 60))
  const durationText = durationMin >= 60 ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m` : `${durationMin}m`
  const entryTimeText = new Date(entryTimeMs).toLocaleString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  })
  const rMultipleText =
    typeof trade.maxRiskReward === 'number' && Number.isFinite(trade.maxRiskReward)
      ? `${trade.maxRiskReward >= 0 ? '+' : ''}${trade.maxRiskReward.toFixed(2)}R`
      : 'N/A'
  const sessionLabel = sessionForHour(new Date(entryTimeMs).getUTCHours())

  const journal = trade.journal
  const initialScreenshots = normalizeJournalScreenshots(journal?.screenshots)
  // Screenshots saved before file names were tracked (or pasted/dragged in
  // without one) don't have a `name` - assign each a unique placeholder so
  // the UI always has something to display.
  let pendingScreenshots: ReplayJournalScreenshot[] = initialScreenshots.map((s) => ({ ...s, name: s.name || nextTnChartName() }))
  const reflectionState: { wentWell: Set<string>; toImprove: Set<string> } = {
    wentWell: new Set(journal?.reflectionWentWell ?? []),
    toImprove: new Set(journal?.reflectionToImprove ?? []),
  }
  const reflectionOptions: { wentWell: string[]; toImprove: string[] } = {
    wentWell: Array.from(new Set([...REFLECTION_OPTIONS.wentWell, ...reflectionState.wentWell])),
    toImprove: Array.from(new Set([...REFLECTION_OPTIONS.toImprove, ...reflectionState.toImprove])),
  }
  const selectedEmotions = new Set<string>(journal?.emotions ?? [])
  let currentRating = journal?.rating ? parseInt(journal.rating, 10) || 0 : 0

  const prevEntry = getPrev?.() ?? null
  const nextEntry = getNext?.() ?? null

  const CIRCUMFERENCE = 2 * Math.PI * 14

  const starsSvg = [1, 2, 3, 4, 5]
    .map(
      (v) =>
        `<svg class="sx-trade-journal-dialog__star" data-val="${v}" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/></svg>`,
    )
    .join('')

  const overlay = document.createElement('div')
  // Switching between trades (prev/next) rebuilds this whole overlay from
  // scratch. Skip the fade-in animation in that case - it briefly renders
  // the overlay at opacity 0 across a few frames, which reads as the whole
  // window "blinking" every time you page through trades.
  overlay.className = [
    'sx-trade-journal-overlay',
    opts?.instant ? 'sx-trade-journal-overlay--instant' : '',
    readOnly ? 'sx-trade-journal-overlay--readonly' : '',
  ]
    .filter(Boolean)
    .join(' ')
  overlay.setAttribute('data-sx-trade-journal-dialog', '')
  overlay.innerHTML = `
    <div class="sx-trade-journal-dialog" role="dialog" aria-modal="true" aria-label="Trade journal">
      <div class="sx-trade-journal-dialog__toolbar">
        <button type="button" class="sx-trade-journal-dialog__icon-btn" data-sx-trade-journal-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        <button type="button" class="sx-trade-journal-dialog__all-trades-pill" data-sx-trade-journal-all-trades>All trades</button>
        <span class="sx-trade-journal-dialog__modified-at" data-sx-trade-journal-modified-at></span>
        <div class="sx-trade-journal-dialog__save-status"><span class="sx-trade-journal-dialog__save-dot"></span><span data-sx-trade-journal-save-status>Not saved yet</span></div>
        <button type="button" class="sx-trade-journal-dialog__icon-btn" data-sx-trade-journal-nav="prev" ${prevEntry ? '' : 'disabled'} aria-label="Previous trade"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
        <button type="button" class="sx-trade-journal-dialog__icon-btn" data-sx-trade-journal-nav="next" ${nextEntry ? '' : 'disabled'} aria-label="Next trade"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
        <div class="sx-trade-journal-dialog__menu-wrap" data-sx-trade-journal-menu-wrap>
          <button type="button" class="sx-trade-journal-dialog__icon-btn" data-sx-trade-journal-menu-toggle aria-label="More options" aria-haspopup="true" aria-expanded="false"><i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i></button>
          <div class="sx-trade-journal-dialog__menu hidden" data-sx-trade-journal-menu>
            <button type="button" class="sx-trade-journal-dialog__menu-item" data-sx-trade-journal-clear-notes>Clear notes</button>
          </div>
        </div>
        <div class="sx-trade-journal-dialog__progress-ring" data-sx-trade-journal-progress-ring>
          <svg width="34" height="34" viewBox="0 0 34 34">
            <circle cx="17" cy="17" r="14" fill="none" stroke="#f0f1f4" stroke-width="4"/>
            <circle data-sx-trade-journal-progress-circle cx="17" cy="17" r="14" fill="none" stroke="#3652f6" stroke-width="4" stroke-linecap="round" stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="${CIRCUMFERENCE}" transform="rotate(-90 17 17)"/>
          </svg>
          <div class="sx-trade-journal-dialog__progress-pct" data-sx-trade-journal-progress-pct>0%</div>
        </div>
      </div>

      <div class="sx-trade-journal-dialog__head">
        <h1 class="sx-trade-journal-dialog__title"><span class="sx-trade-journal-dialog__trade-id">T${trade.tradeNum}</span>${escapeHtml(asset)}, <span class="${sideCls}">${side}</span><span class="sx-trade-journal-dialog__datetime">${escapeHtml(entryTimeText)}</span></h1>
        <div class="sx-trade-journal-dialog__snapshot-strip">
          <div class="sx-trade-journal-dialog__snap-row">
            ${snapChipHtml('Entry', escapeHtml(String(trade.entryPrice)))}
            ${snapChipHtml('Exit', escapeHtml(String(trade.exitPrice)))}
            ${snapChipHtml('Initial SL', escapeHtml(naValue(trade.initialStopLoss)))}
            ${snapChipHtml('Max TP', escapeHtml(naValue(trade.maxTakeProfit)))}
            ${snapChipHtml('Size', escapeHtml(`${trade.qty} lots`))}
            ${snapChipHtml('P&L', escapeHtml(formatSignedMoney(trade.pnl)), trade.pnl >= 0 ? 'sx-trade-journal-dialog__snap-value--gain' : 'sx-trade-journal-dialog__snap-value--loss')}
            ${snapChipHtml('R-multiple', escapeHtml(rMultipleText))}
            ${snapChipHtml('Duration', escapeHtml(durationText))}
            ${snapChipHtml('Session', escapeHtml(sessionLabel))}
            ${snapChipHtml('Exit reason', escapeHtml(exitReasonLabel(trade.exitReason)))}
          </div>
        </div>
      </div>

      <div class="sx-trade-journal-dialog__section" data-sx-trade-journal-section="summary">
        <div class="sx-trade-journal-dialog__section-label">Summary <span class="sx-trade-journal-dialog__section-hint">\u2014 write about your experience with this trade</span></div>
        <textarea class="sx-trade-journal-dialog__summary-textarea" data-sx-trade-journal-summary rows="1" placeholder="What happened, how it felt, what you'd tell yourself next time...">${escapeHtml(journal?.summary ?? '')}</textarea>
      </div>

      <div class="sx-trade-journal-dialog__section" data-sx-trade-journal-section="media">
        <div class="sx-trade-journal-dialog__section-label">Chart screenshot <span class="sx-trade-journal-dialog__section-hint">\u2014 paste with <kbd>Ctrl</kbd>+<kbd>V</kbd>, or use the buttons below</span></div>
        <div class="sx-trade-journal-dialog__media-actions">
          ${onCaptureChartScreenshot ? '<button type="button" class="sx-trade-journal-dialog__media-action-btn" data-sx-trade-journal-capture-chart title="Capture the current chart"><i class="fa-solid fa-camera" aria-hidden="true"></i> Add chart screenshot</button>' : ''}
          <button type="button" class="sx-trade-journal-dialog__media-action-btn" data-sx-trade-journal-add-image><i class="fa-regular fa-image" aria-hidden="true"></i> Add image</button>
        </div>
        <input type="file" data-sx-trade-journal-screenshot-input accept="image/*" multiple hidden>
        <input type="file" data-sx-trade-journal-screenshot-replace-input accept="image/*" hidden>
        <div class="sx-trade-journal-dialog__screenshot-carousel">
          <button type="button" class="sx-trade-journal-dialog__screenshot-nav sx-trade-journal-dialog__screenshot-nav--prev" data-sx-trade-journal-screenshot-nav="prev" aria-label="Scroll screenshots left" hidden><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
          <div class="sx-trade-journal-dialog__screenshot-viewport" data-sx-trade-journal-screenshot-viewport>
            <div class="sx-trade-journal-dialog__screenshot-grid" data-sx-trade-journal-screenshot-grid></div>
          </div>
          <button type="button" class="sx-trade-journal-dialog__screenshot-nav sx-trade-journal-dialog__screenshot-nav--next" data-sx-trade-journal-screenshot-nav="next" aria-label="Scroll screenshots right" hidden><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
          <div class="sx-trade-journal-dialog__screenshot-tools" data-sx-trade-journal-screenshot-tools hidden>
            <button type="button" data-sx-trade-journal-screenshot-action="caption" title="Edit caption"><i class="fa-regular fa-comment-dots" aria-hidden="true"></i></button>
            <button type="button" data-sx-trade-journal-screenshot-action="replace" title="Replace image"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i></button>
            <button type="button" data-sx-trade-journal-screenshot-action="rename" title="Rename image"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
            <button type="button" data-sx-trade-journal-screenshot-action="download" title="Download image"><i class="fa-solid fa-download" aria-hidden="true"></i></button>
            <button type="button" data-sx-trade-journal-screenshot-action="preview" title="Toggle preview only"><i class="fa-regular fa-eye" aria-hidden="true"></i></button>
          </div>
        </div>
        <div class="sx-trade-journal-dialog__voice-actions">
          <button type="button" class="sx-trade-journal-dialog__media-action-btn" data-sx-trade-journal-voice-toggle><i class="fa-solid fa-microphone" aria-hidden="true"></i> <span data-sx-trade-journal-voice-label>Add voice note</span></button>
          <div class="sx-trade-journal-dialog__voice-rec-indicator" data-sx-trade-journal-voice-rec-indicator hidden>
            <span class="sx-trade-journal-dialog__voice-rec-dot"></span>
            Recording <span data-sx-trade-journal-voice-rec-time>0:00</span>
          </div>
        </div>
        <div class="sx-trade-journal-dialog__voice-list" data-sx-trade-journal-voice-list></div>
      </div>

      <div class="sx-trade-journal-dialog__section" data-sx-trade-journal-section="reflection">
        <div class="sx-trade-journal-dialog__section-label">Quick reflection <span class="sx-trade-journal-dialog__section-hint">\u2014 tap what applies, no writing required</span></div>
        <div class="sx-trade-journal-dialog__reflection-cols">
          <div>
            <div class="sx-trade-journal-dialog__reflection-col-label sx-trade-journal-dialog__reflection-col-label--went-well"><i class="fa-solid fa-check" aria-hidden="true"></i> What went well</div>
            <div class="sx-trade-journal-dialog__reflection-wrap" data-sx-trade-journal-reflection-wrap="wentWell"></div>
            <div class="sx-trade-journal-dialog__mini-add-row">
              <input type="text" data-sx-trade-journal-reflection-input="wentWell" placeholder="Add your own...">
              <button type="button" data-sx-trade-journal-reflection-add="wentWell">Add</button>
            </div>
          </div>
          <div>
            <div class="sx-trade-journal-dialog__reflection-col-label sx-trade-journal-dialog__reflection-col-label--to-improve"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> To improve</div>
            <div class="sx-trade-journal-dialog__reflection-wrap" data-sx-trade-journal-reflection-wrap="toImprove"></div>
            <div class="sx-trade-journal-dialog__mini-add-row">
              <input type="text" data-sx-trade-journal-reflection-input="toImprove" placeholder="Add your own...">
              <button type="button" data-sx-trade-journal-reflection-add="toImprove">Add</button>
            </div>
          </div>
        </div>
      </div>

      <div class="sx-trade-journal-dialog__section" data-sx-trade-journal-section="emotions">
        <div class="sx-trade-journal-dialog__section-label">Emotions <span class="sx-trade-journal-dialog__section-hint">\u2014 select everything you felt</span></div>
        <div class="sx-trade-journal-dialog__emotion-group"><div class="sx-trade-journal-dialog__emotion-group-label">Constructive</div><div class="sx-trade-journal-dialog__emotion-wrap" data-sx-trade-journal-emotion-wrap="constructive"></div></div>
        <div class="sx-trade-journal-dialog__emotion-group"><div class="sx-trade-journal-dialog__emotion-group-label">Destructive</div><div class="sx-trade-journal-dialog__emotion-wrap" data-sx-trade-journal-emotion-wrap="destructive"></div></div>
        <div class="sx-trade-journal-dialog__emotion-group"><div class="sx-trade-journal-dialog__emotion-group-label">Neutral / situational</div><div class="sx-trade-journal-dialog__emotion-wrap" data-sx-trade-journal-emotion-wrap="neutral"></div></div>
      </div>

      <div class="sx-trade-journal-dialog__section" data-sx-trade-journal-section="rating">
        <div class="sx-trade-journal-dialog__section-label">Trade rating</div>
        <div class="sx-trade-journal-dialog__star-rating" data-sx-trade-journal-star-rating>
          ${starsSvg}
          <span class="sx-trade-journal-dialog__rating-label" data-sx-trade-journal-rating-label>Not rated</span>
        </div>
      </div>

      <div class="sx-trade-journal-dialog__section" data-sx-trade-journal-section="notes">
        <div class="sx-trade-journal-dialog__note-toggle${journal?.notes ? ' sx-trade-journal-dialog__note-toggle--open' : ''}" data-sx-trade-journal-note-toggle>
          <i class="fa-solid fa-plus" aria-hidden="true"></i> Add a written note (optional)
        </div>
        <div class="sx-trade-journal-dialog__note-area${journal?.notes ? ' sx-trade-journal-dialog__note-area--open' : ''}" data-sx-trade-journal-note-area>
          <textarea data-sx-trade-journal-notes rows="1" placeholder="Anything the quick options above didn't capture...">${escapeHtml(journal?.notes ?? '')}</textarea>
        </div>
      </div>

      <div class="sx-trade-journal-dialog__section" data-sx-trade-journal-section="tags">
        <div class="sx-trade-journal-dialog__section-label">Tags</div>
        <div class="sx-trade-journal-dialog__tag-input-row"><input type="text" data-sx-trade-journal-tag-input placeholder="Type a tag and press Enter"></div>
        <div class="sx-trade-journal-dialog__tag-list" data-sx-trade-journal-tag-list></div>
      </div>

      <div class="sx-trade-journal-dialog__foot">
        <button type="button" class="sx-trade-journal-dialog__save" data-sx-trade-journal-save>Save entry</button>
      </div>
    </div>

    <div class="sx-trade-journal-alltrades" data-sx-trade-journal-alltrades hidden>
      <div class="sx-trade-journal-alltrades__toolbar">
        <button type="button" class="sx-trade-journal-dialog__icon-btn" data-sx-trade-journal-alltrades-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        <div class="sx-trade-journal-alltrades__tabs">
          <button type="button" class="sx-trade-journal-alltrades__tab sx-trade-journal-alltrades__tab--active" data-sx-trade-journal-alltrades-tab="trades">Trades</button>
          <button type="button" class="sx-trade-journal-alltrades__tab" data-sx-trade-journal-alltrades-tab="calendar">Calendar</button>
        </div>
      </div>

      <div data-sx-trade-journal-alltrades-view="trades">
        <div class="sx-trade-journal-alltrades__search-wrap">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input type="text" class="sx-trade-journal-alltrades__search" data-sx-trade-journal-alltrades-search placeholder="Search">
        </div>
        <div class="sx-trade-journal-alltrades__list" data-sx-trade-journal-alltrades-list></div>
      </div>

      <div class="sx-trade-journal-alltrades-calendar" data-sx-trade-journal-alltrades-view="calendar" hidden>
        <div class="sx-trade-journal-alltrades-calendar__nav">
          <div class="sx-trade-journal-alltrades-calendar__nav-group" data-sx-trade-journal-cal-month-nav>
            <button type="button" class="sx-trade-journal-alltrades-calendar__arrow" data-sx-trade-journal-cal-prev-month aria-label="Previous month"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
            <span class="sx-trade-journal-alltrades-calendar__label" data-sx-trade-journal-cal-month-label></span>
            <button type="button" class="sx-trade-journal-alltrades-calendar__arrow" data-sx-trade-journal-cal-next-month aria-label="Next month"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
          </div>
          <div class="sx-trade-journal-alltrades-calendar__nav-group">
            <button type="button" class="sx-trade-journal-alltrades-calendar__arrow" data-sx-trade-journal-cal-prev-year aria-label="Previous year"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
            <span class="sx-trade-journal-alltrades-calendar__label" data-sx-trade-journal-cal-year-label></span>
            <button type="button" class="sx-trade-journal-alltrades-calendar__arrow" data-sx-trade-journal-cal-next-year aria-label="Next year"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
          </div>
          <div class="sx-trade-journal-alltrades-calendar__mode-toggle">
            <button type="button" class="sx-trade-journal-alltrades-calendar__mode-btn sx-trade-journal-alltrades-calendar__mode-btn--active" data-sx-trade-journal-cal-mode="month">Month</button>
            <button type="button" class="sx-trade-journal-alltrades-calendar__mode-btn" data-sx-trade-journal-cal-mode="year">Year</button>
          </div>
        </div>
        <div class="sx-trade-journal-alltrades-calendar__body" data-sx-trade-journal-cal-body></div>
        <div class="sx-trade-journal-alltrades-calendar__tooltip" data-sx-trade-journal-cal-tooltip hidden></div>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  activeOverlay = overlay

  /* ---------------- Read-only (dashboard Trades page) view ----------------
     Renders the same markup as the editable dialog, but hides every add/edit
     affordance until its section's pencil/plus is clicked. Every section
     always shows (with "N/A" where nothing was filled in), so there's always
     somewhere to add missing details from. */
  if (readOnly) {
    overlay.querySelector<HTMLElement>('.sx-trade-journal-dialog')?.classList.add('sx-trade-journal-dialog--readonly')
    const hasVoiceNotes = normalizeJournalVoiceNotes(journal?.voiceNotes).length > 0
    const sectionHasContent: Record<string, boolean> = {
      summary: !!journal?.summary?.trim(),
      media: initialScreenshots.length > 0 || hasVoiceNotes,
      reflection: !!(journal?.reflectionWentWell?.length || journal?.reflectionToImprove?.length),
      emotions: !!journal?.emotions?.length,
      rating: !!journal?.rating,
      notes: !!journal?.notes?.trim(),
      tags: !!journal?.tags?.length,
    }
    // Sizes a view-mode textarea to fit exactly its content (1 line for
    // "N/A"/short text, taller for longer summaries) instead of leaving it
    // at the browser's multi-row default height.
    const autoSizeTa = (ta: HTMLTextAreaElement) => {
      ta.style.height = 'auto'
      ta.style.height = `${ta.scrollHeight}px`
    }
    const summaryTa = overlay.querySelector<HTMLTextAreaElement>('[data-sx-trade-journal-summary]')
    if (summaryTa) {
      summaryTa.readOnly = true
      if (!sectionHasContent.summary) summaryTa.placeholder = 'N/A'
      autoSizeTa(summaryTa)
    }
    const notesTa = overlay.querySelector<HTMLTextAreaElement>('[data-sx-trade-journal-notes]')
    if (notesTa) {
      notesTa.readOnly = true
      if (!sectionHasContent.notes) notesTa.placeholder = 'N/A'
      autoSizeTa(notesTa)
    }
    overlay.querySelector<HTMLElement>('[data-sx-trade-journal-note-toggle]')?.setAttribute('hidden', '')
    overlay.querySelector<HTMLElement>('[data-sx-trade-journal-note-area]')?.classList.add('sx-trade-journal-dialog__note-area--open')

    // Drop an "N/A" placeholder into any collection section that has nothing
    // to show yet (hiding its now-empty columns/groups so it reads as a
    // single clean line, not a stack of empty headers), so the section
    // header never reads as broken/empty.
    if (!sectionHasContent.reflection) {
      overlay.querySelector<HTMLElement>('.sx-trade-journal-dialog__reflection-cols')?.setAttribute('hidden', '')
      overlay
        .querySelector<HTMLElement>('[data-sx-trade-journal-section="reflection"] .sx-trade-journal-dialog__section-label')
        ?.insertAdjacentHTML('afterend', '<div class="sx-trade-journal-dialog__na">N/A</div>')
    }
    if (!sectionHasContent.emotions) {
      overlay.querySelectorAll<HTMLElement>('.sx-trade-journal-dialog__emotion-group').forEach((g) => (g.hidden = true))
      overlay
        .querySelector<HTMLElement>('[data-sx-trade-journal-section="emotions"]')
        ?.insertAdjacentHTML('beforeend', '<div class="sx-trade-journal-dialog__na">N/A</div>')
    }
    if (!sectionHasContent.media) {
      overlay
        .querySelector<HTMLElement>('[data-sx-trade-journal-section="media"]')
        ?.insertAdjacentHTML('beforeend', '<div class="sx-trade-journal-dialog__na">N/A</div>')
    }
    if (!sectionHasContent.tags) {
      overlay
        .querySelector<HTMLElement>('[data-sx-trade-journal-tag-list]')
        ?.insertAdjacentHTML('beforebegin', '<div class="sx-trade-journal-dialog__na">N/A</div>')
    }

    // Chart screenshot reads more naturally after Emotions in this compact layout.
    const mediaSec = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-section="media"]')
    const emotionsSec = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-section="emotions"]')
    if (mediaSec && emotionsSec?.parentElement) {
      emotionsSec.parentElement.insertBefore(mediaSec, emotionsSec.nextSibling)
    }

    // A small pencil/plus next to every section header switches just that
    // section into its normal editable state, without exposing every
    // add/edit control at once. Text sections get a pencil ("Edit");
    // multi-item/collection sections (screenshots, reflection chips,
    // emotions, tags) get a plus ("Add") - available even when empty.
    const addStyleSections = new Set(['media', 'reflection', 'emotions', 'tags'])
    overlay.querySelectorAll<HTMLElement>('[data-sx-trade-journal-section]').forEach((sec) => {
      const label = sec.querySelector<HTMLElement>('.sx-trade-journal-dialog__section-label')
      if (!label) return
      const key = sec.getAttribute('data-sx-trade-journal-section') ?? ''
      const isAdd = addStyleSections.has(key)
      const editBtn = document.createElement('button')
      editBtn.type = 'button'
      editBtn.className = 'sx-trade-journal-dialog__section-edit-btn'
      editBtn.setAttribute('aria-label', isAdd ? 'Add' : 'Edit')
      editBtn.innerHTML = isAdd
        ? '<i class="fa-solid fa-plus" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-pen" aria-hidden="true"></i>'
      editBtn.addEventListener('click', () => {
        const editing = sec.classList.toggle('sx-trade-journal-dialog__section--editing')
        if (isAdd) {
          editBtn.innerHTML = editing
            ? '<i class="fa-solid fa-minus" aria-hidden="true"></i>'
            : '<i class="fa-solid fa-plus" aria-hidden="true"></i>'
          editBtn.setAttribute('aria-label', editing ? 'Done' : 'Add')
        }
        if (summaryTa && sec.contains(summaryTa)) {
          summaryTa.readOnly = !editing
          if (!sectionHasContent.summary) {
            summaryTa.placeholder = editing ? "What happened, how it felt, what you'd tell yourself next time..." : 'N/A'
          }
        }
        if (notesTa && sec.contains(notesTa)) {
          notesTa.readOnly = !editing
          if (!sectionHasContent.notes) {
            notesTa.placeholder = editing ? "Anything the quick options above didn't capture..." : 'N/A'
          }
        }
        if (!editing) {
          if (summaryTa && sec.contains(summaryTa)) autoSizeTa(summaryTa)
          if (notesTa && sec.contains(notesTa)) autoSizeTa(notesTa)
        }
        if (editing) {
          ;(summaryTa && sec.contains(summaryTa) ? summaryTa : notesTa && sec.contains(notesTa) ? notesTa : null)?.focus()
        }
      })
      label.appendChild(editBtn)
    })
  }

  /* ---------------- Screenshots ---------------- */
  const screenshotGrid = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-screenshot-grid]')!
  const screenshotViewport = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-screenshot-viewport]')!
  const screenshotPrevBtn = overlay.querySelector<HTMLButtonElement>('[data-sx-trade-journal-screenshot-nav="prev"]')!
  const screenshotNextBtn = overlay.querySelector<HTMLButtonElement>('[data-sx-trade-journal-screenshot-nav="next"]')!
  const screenshotReplaceInput = overlay.querySelector<HTMLInputElement>('[data-sx-trade-journal-screenshot-replace-input]')!
  const screenshotTools = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-screenshot-tools]')!
  const screenshotCarousel = screenshotTools.parentElement!
  const screenshotPreviewBtn = screenshotTools.querySelector<HTMLButtonElement>('[data-sx-trade-journal-screenshot-action="preview"]')!
  let selectedScreenshotIdx = -1
  // Only stagger-animate thumbnails in on a genuinely fresh open. When paging
  // between trades (opts.instant) the whole dialog - including this grid -
  // is rebuilt from scratch, so animating every re-render made the thumbs
  // (and thus the window) look like they were blinking on every click.
  let skipThumbAnim = !!opts?.instant
  function thumbHtml(s: ReplayJournalScreenshot, i: number): string {
    const isChart = s.source === 'chart'
    const badgeIcon = isChart ? 'fa-solid fa-camera' : 'fa-regular fa-image'
    const badgeLabel = isChart ? 'Screenshot' : 'Image'
    // Stagger each thumbnail's slide-in so they appear left-to-right in sequence.
    const delay = `${Math.min(i, 8) * 70}ms`
    const cls = skipThumbAnim
      ? 'sx-trade-journal-dialog__screenshot-thumb sx-trade-journal-dialog__screenshot-thumb--no-anim'
      : 'sx-trade-journal-dialog__screenshot-thumb'
    // Safety net: every screenshot should already have a name assigned when
    // it enters pendingScreenshots, but fall back (and persist it) here too
    // so the name never changes across re-renders.
    if (!s.name) s.name = nextTnChartName()
    const name = s.name
    // The card (name/image/badge) is fully self-contained with its own
    // rounded corners; delete sits detached below it, outside the image
    // card entirely, rather than clipped inside its bottom edge.
    return `<div class="sx-trade-journal-dialog__screenshot-thumb-wrap">
      <div class="${cls}" style="animation-delay:${delay};" data-sx-trade-journal-screenshot-thumb-idx="${i}">
        <div class="sx-trade-journal-dialog__screenshot-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        <img src="${escapeHtml(s.src)}" alt="" data-sx-trade-journal-screenshot-view="${i}">
        <div class="sx-trade-journal-dialog__screenshot-badge"><i class="${badgeIcon}" aria-hidden="true"></i> ${badgeLabel}</div>
      </div>
      <button type="button" class="sx-trade-journal-dialog__screenshot-rm" data-sx-trade-journal-screenshot-rm="${i}" aria-label="Remove screenshot"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
    </div>`
  }
  function removeScreenshotAt(idx: number) {
    if (idx < 0 || idx >= pendingScreenshots.length) return
    pendingScreenshots.splice(idx, 1)
    if (selectedScreenshotIdx === idx) deselectScreenshot()
    renderScreenshotGrid()
    updateProgress()
  }

  /* Selecting a thumbnail highlights it and floats the action toolbar just
     above that card (Edit caption / Replace / Rename / Download / Toggle
     preview only - delete already sits below the card). */
  function selectScreenshot(idx: number) {
    selectedScreenshotIdx = idx
    screenshotGrid.querySelectorAll('[data-sx-trade-journal-screenshot-thumb-idx]').forEach((el) => {
      el.classList.toggle(
        'sx-trade-journal-dialog__screenshot-thumb--selected',
        el.getAttribute('data-sx-trade-journal-screenshot-thumb-idx') === String(idx),
      )
    })
    const shot = pendingScreenshots[idx]
    screenshotPreviewBtn.classList.toggle('sx-trade-journal-dialog__screenshot-tool--active', shot?.showCaption === false)
    screenshotPreviewBtn.innerHTML =
      shot?.showCaption === false
        ? '<i class="fa-solid fa-eye-slash" aria-hidden="true"></i>'
        : '<i class="fa-regular fa-eye" aria-hidden="true"></i>'
    positionScreenshotTools()
  }
  function deselectScreenshot() {
    selectedScreenshotIdx = -1
    screenshotGrid.querySelectorAll('.sx-trade-journal-dialog__screenshot-thumb--selected').forEach((el) => {
      el.classList.remove('sx-trade-journal-dialog__screenshot-thumb--selected')
    })
    screenshotTools.hidden = true
  }
  /* The toolbar lives outside the (horizontally scrolling, vertically
     clipped) viewport so it can sit above the card without being cut off,
     which means its x-position has to track the selected card manually. */
  function positionScreenshotTools() {
    const card = screenshotGrid.querySelector<HTMLElement>(
      `[data-sx-trade-journal-screenshot-thumb-idx="${selectedScreenshotIdx}"]`,
    )
    if (selectedScreenshotIdx < 0 || !card) {
      screenshotTools.hidden = true
      return
    }
    const cardRect = card.getBoundingClientRect()
    const viewRect = screenshotViewport.getBoundingClientRect()
    const cardCenter = cardRect.left + cardRect.width / 2
    // Hide once the selected card has been scrolled out of the viewport.
    if (cardCenter < viewRect.left || cardCenter > viewRect.right) {
      screenshotTools.hidden = true
      return
    }
    screenshotTools.hidden = false
    screenshotTools.style.left = `${cardCenter - screenshotCarousel.getBoundingClientRect().left}px`
  }

  function renderScreenshotGrid() {
    screenshotGrid.innerHTML = pendingScreenshots.map((s, i) => thumbHtml(s, i)).join('')
    // Only the very first render for this dialog instance should skip the
    // animation; screenshots added afterwards (upload/paste/capture) should
    // still play the normal slide-in.
    skipThumbAnim = false
    screenshotGrid.querySelectorAll<HTMLButtonElement>('[data-sx-trade-journal-screenshot-rm]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        const idx = parseInt(btn.getAttribute('data-sx-trade-journal-screenshot-rm') ?? '-1', 10)
        removeScreenshotAt(idx)
      })
    })
    screenshotGrid.querySelectorAll<HTMLImageElement>('[data-sx-trade-journal-screenshot-view]').forEach((img) => {
      // Single click just selects/highlights the thumbnail; double click opens the lightbox.
      img.addEventListener('click', () => {
        const idx = parseInt(img.getAttribute('data-sx-trade-journal-screenshot-view') ?? '-1', 10)
        if (idx < 0) return
        if (selectedScreenshotIdx === idx) deselectScreenshot()
        else selectScreenshot(idx)
      })
      img.addEventListener('dblclick', () => {
        const idx = parseInt(img.getAttribute('data-sx-trade-journal-screenshot-view') ?? '-1', 10)
        if (idx >= 0) openScreenshotLightbox(idx)
      })
    })
    // The highlight class lives on DOM that was just replaced, so re-apply
    // it (or drop the selection entirely if that index no longer exists).
    if (selectedScreenshotIdx >= 0 && selectedScreenshotIdx < pendingScreenshots.length) selectScreenshot(selectedScreenshotIdx)
    else deselectScreenshot()
    updateScreenshotCarouselNav()
  }
  renderScreenshotGrid()

  screenshotTools.querySelectorAll<HTMLButtonElement>('[data-sx-trade-journal-screenshot-action]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation()
      void runScreenshotAction(btn)
    })
  })

  async function runScreenshotAction(btn: HTMLButtonElement) {
    const idx = selectedScreenshotIdx
    const shot = pendingScreenshots[idx]
    if (!shot) return
    const action = btn.getAttribute('data-sx-trade-journal-screenshot-action')
    if (action === 'caption') {
      const value = await showTradeJournalTextPrompt({ title: 'Edit caption', initialValue: shot.caption, confirmLabel: 'Save caption' })
      if (value !== null) {
        shot.caption = value
        markUnsaved()
      }
    } else if (action === 'rename') {
      const value = await showTradeJournalTextPrompt({ title: 'Rename image', initialValue: shot.name, confirmLabel: 'Rename' })
      if (value !== null && value.trim()) {
        shot.name = value.trim()
        renderScreenshotGrid()
        selectScreenshot(idx)
        markUnsaved()
      }
    } else if (action === 'download') {
      const link = document.createElement('a')
      link.href = shot.src
      link.download = shot.name || 'screenshot.png'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } else if (action === 'replace') {
      screenshotReplaceInput.click()
    } else if (action === 'preview') {
      shot.showCaption = shot.showCaption === false
      selectScreenshot(idx)
      markUnsaved()
    }
  }
  screenshotReplaceInput.addEventListener('change', () => {
    const file = screenshotReplaceInput.files?.[0]
    screenshotReplaceInput.value = ''
    if (!file || !file.type.startsWith('image/') || !pendingScreenshots[selectedScreenshotIdx]) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const src = typeof ev.target?.result === 'string' ? ev.target.result : ''
      if (!src) return
      const shot = pendingScreenshots[selectedScreenshotIdx]
      shot.src = src
      shot.source = 'upload'
      renderScreenshotGrid()
      selectScreenshot(selectedScreenshotIdx)
      markUnsaved()
    }
    reader.readAsDataURL(file)
  })

  /* Keep screenshots confined to the fixed-width carousel viewport; reveal
     left/right arrows only when there's more content than fits, and hide
     whichever side is already fully scrolled into view. */
  function updateScreenshotCarouselNav() {
    const maxScroll = screenshotViewport.scrollWidth - screenshotViewport.clientWidth
    const hasOverflow = maxScroll > 1
    screenshotPrevBtn.hidden = !hasOverflow || screenshotViewport.scrollLeft <= 1
    screenshotNextBtn.hidden = !hasOverflow || screenshotViewport.scrollLeft >= maxScroll - 1
    positionScreenshotTools()
  }
  screenshotViewport.addEventListener('scroll', updateScreenshotCarouselNav)
  window.addEventListener('resize', updateScreenshotCarouselNav)
  function scrollScreenshotCarousel(dir: 'prev' | 'next') {
    const thumb = screenshotGrid.querySelector<HTMLElement>('.sx-trade-journal-dialog__screenshot-thumb')
    const step = (thumb?.offsetWidth ?? 240) + 14
    screenshotViewport.scrollBy({ left: dir === 'prev' ? -step : step, behavior: 'smooth' })
  }
  screenshotPrevBtn.addEventListener('click', () => scrollScreenshotCarousel('prev'))
  screenshotNextBtn.addEventListener('click', () => scrollScreenshotCarousel('next'))

  /* ---------------- Screenshot lightbox (view + delete + left/right nav) ---------------- */
  function openScreenshotLightbox(startIndex: number) {
    if (!pendingScreenshots[startIndex]) return
    let index = startIndex
    const lightbox = document.createElement('div')
    lightbox.className = 'sx-trade-journal-lightbox'
    lightbox.innerHTML = `
      <div class="sx-trade-journal-lightbox__wrap">
        <div class="sx-trade-journal-lightbox__meta">
          <span class="sx-trade-journal-lightbox__badge" data-sx-trade-journal-lightbox-badge></span>
          <span class="sx-trade-journal-lightbox__name" data-sx-trade-journal-lightbox-name></span>
        </div>
        <div class="sx-trade-journal-lightbox__stage">
          <button type="button" class="sx-trade-journal-lightbox__nav sx-trade-journal-lightbox__nav--prev" data-sx-trade-journal-lightbox-prev aria-label="Previous image"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
          <div class="sx-trade-journal-lightbox__panel">
            <img src="" alt="" data-sx-trade-journal-lightbox-img>
          </div>
          <button type="button" class="sx-trade-journal-lightbox__nav sx-trade-journal-lightbox__nav--next" data-sx-trade-journal-lightbox-next aria-label="Next image"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
        </div>
        <div class="sx-trade-journal-lightbox__actions">
          <span class="sx-trade-journal-lightbox__count" data-sx-trade-journal-lightbox-count></span>
          <button type="button" class="sx-trade-journal-lightbox__delete" data-sx-trade-journal-lightbox-delete><i class="fa-solid fa-trash" aria-hidden="true"></i> Delete</button>
          <button type="button" class="sx-trade-journal-lightbox__close" data-sx-trade-journal-lightbox-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
      </div>
    `
    document.body.appendChild(lightbox)

    const imgEl = lightbox.querySelector<HTMLImageElement>('[data-sx-trade-journal-lightbox-img]')!
    const badgeEl = lightbox.querySelector<HTMLElement>('[data-sx-trade-journal-lightbox-badge]')!
    const nameEl = lightbox.querySelector<HTMLElement>('[data-sx-trade-journal-lightbox-name]')!
    const countEl = lightbox.querySelector<HTMLElement>('[data-sx-trade-journal-lightbox-count]')!
    const prevBtn = lightbox.querySelector<HTMLButtonElement>('[data-sx-trade-journal-lightbox-prev]')!
    const nextBtn = lightbox.querySelector<HTMLButtonElement>('[data-sx-trade-journal-lightbox-next]')!

    const renderCurrent = (direction: 'left' | 'right' | null) => {
      const shot = pendingScreenshots[index]
      if (!shot) {
        close()
        return
      }
      const showNav = pendingScreenshots.length > 1
      prevBtn.hidden = !showNav
      nextBtn.hidden = !showNav
      countEl.textContent = showNav ? `${index + 1} / ${pendingScreenshots.length}` : ''
      const isChart = shot.source === 'chart'
      badgeEl.innerHTML = `<i class="${isChart ? 'fa-solid fa-camera' : 'fa-regular fa-image'}" aria-hidden="true"></i> ${isChart ? 'Screenshot' : 'Image'}`
      nameEl.textContent = shot.name || (isChart ? 'Chart_Screenshot.png' : 'Untitled_Image.png')
      imgEl.src = shot.src
      if (direction) {
        // Slide the new image in from the direction it was navigated toward.
        imgEl.classList.remove('sx-trade-journal-lightbox__img--in-left', 'sx-trade-journal-lightbox__img--in-right')
        void imgEl.offsetWidth // restart animation
        imgEl.classList.add(direction === 'right' ? 'sx-trade-journal-lightbox__img--in-right' : 'sx-trade-journal-lightbox__img--in-left')
      }
    }
    const goTo = (next: number, direction: 'left' | 'right') => {
      if (!pendingScreenshots.length) return
      index = (next + pendingScreenshots.length) % pendingScreenshots.length
      renderCurrent(direction)
    }

    renderCurrent(null)

    const close = () => {
      lightbox.remove()
      document.removeEventListener('keydown', onKeydown)
      if (activeLightboxClose === close) activeLightboxClose = null
    }
    activeLightboxClose?.()
    activeLightboxClose = close
    const onKeydown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') close()
      else if (ev.key === 'ArrowRight') goTo(index + 1, 'right')
      else if (ev.key === 'ArrowLeft') goTo(index - 1, 'left')
    }
    document.addEventListener('keydown', onKeydown)
    lightbox.addEventListener('click', (ev) => {
      if (ev.target === lightbox) close()
    })
    prevBtn.addEventListener('click', () => goTo(index - 1, 'left'))
    nextBtn.addEventListener('click', () => goTo(index + 1, 'right'))
    lightbox.querySelector('[data-sx-trade-journal-lightbox-close]')?.addEventListener('click', close)
    lightbox.querySelector('[data-sx-trade-journal-lightbox-delete]')?.addEventListener('click', () => {
      removeScreenshotAt(index)
      if (!pendingScreenshots.length) {
        close()
        return
      }
      goTo(index, 'right')
    })
  }

  function addScreenshotDataUrl(src: string, source: 'chart' | 'upload' = 'upload', name?: string) {
    if (!src) return
    pendingScreenshots.push({ src, caption: '', align: 'left', showCaption: true, source, name: name || nextTnChartName() })
    renderScreenshotGrid()
    updateProgress()
  }

  function addScreenshotFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const src = typeof ev.target?.result === 'string' ? ev.target.result : ''
      addScreenshotDataUrl(src, 'upload', file.name)
    }
    reader.readAsDataURL(file)
  }

  const screenshotInput = overlay.querySelector<HTMLInputElement>('[data-sx-trade-journal-screenshot-input]')!
  overlay.querySelector<HTMLButtonElement>('[data-sx-trade-journal-add-image]')?.addEventListener('click', () => screenshotInput.click())
  screenshotInput.addEventListener('change', () => {
    Array.from(screenshotInput.files ?? []).forEach(addScreenshotFile)
    screenshotInput.value = ''
  })

  const captureChartBtn = overlay.querySelector<HTMLButtonElement>('[data-sx-trade-journal-capture-chart]')
  if (captureChartBtn && onCaptureChartScreenshot) {
    captureChartBtn.addEventListener('click', () => {
      if (captureChartBtn.disabled) return
      const originalHtml = captureChartBtn.innerHTML
      captureChartBtn.disabled = true
      captureChartBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Capturing...'
      onCaptureChartScreenshot()
        .then((src) => {
          if (src) addScreenshotDataUrl(src, 'chart')
        })
        .finally(() => {
          captureChartBtn.disabled = false
          captureChartBtn.innerHTML = originalHtml
        })
    })
  }
  overlay.addEventListener('dragover', (ev) => ev.preventDefault())
  overlay.addEventListener('drop', (ev) => {
    ev.preventDefault()
    Array.from((ev as DragEvent).dataTransfer?.files ?? []).forEach(addScreenshotFile)
  })
  const pasteHandler = (ev: ClipboardEvent) => {
    const items = ev.clipboardData?.items
    if (!items) return
    Array.from(items).forEach((item) => {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) addScreenshotFile(file)
      }
    })
  }
  document.addEventListener('paste', pasteHandler)

  /* ---------------- Voice notes ---------------- */
  let voiceNotes: ReplayJournalVoiceNote[] = normalizeJournalVoiceNotes(journal?.voiceNotes)
  let mediaRecorder: MediaRecorder | null = null
  let recordedChunks: Blob[] = []
  let micStream: MediaStream | null = null
  const voiceList = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-voice-list]')!
  const voiceToggleBtn = overlay.querySelector<HTMLButtonElement>('[data-sx-trade-journal-voice-toggle]')!
  const voiceLabel = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-voice-label]')!
  const voiceRecIndicator = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-voice-rec-indicator]')!
  const voiceRecTime = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-voice-rec-time]')!
  let voiceRecordingStartedAt = 0
  let voiceRecordingTimer: number | null = null

  function formatRecDuration(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000))
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  function voiceRecordedAtText(recordedAt: number | undefined): string {
    if (!recordedAt) return 'Recorded time unknown'
    const d = new Date(recordedAt)
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    return `Recorded ${date} at ${time}`
  }

  function renderVoiceList() {
    voiceList.innerHTML = voiceNotes
      .map(
        (note, i) =>
          `<div class="sx-trade-journal-dialog__voice-item">
            <div class="sx-trade-journal-dialog__voice-row">
              <audio controls src="${escapeHtml(note.src)}"></audio>
              <button type="button" class="sx-trade-journal-dialog__voice-rm" data-sx-trade-journal-voice-rm="${i}" title="Delete voice note" aria-label="Delete voice note"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
            </div>
            <div class="sx-trade-journal-dialog__voice-meta"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${escapeHtml(voiceRecordedAtText(note.recordedAt))}</div>
          </div>`,
      )
      .join('')
    voiceList.querySelectorAll<HTMLButtonElement>('[data-sx-trade-journal-voice-rm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-sx-trade-journal-voice-rm') ?? '-1', 10)
        if (idx >= 0) voiceNotes.splice(idx, 1)
        renderVoiceList()
        markUnsaved()
      })
    })
  }
  renderVoiceList()

  function stopMicStream() {
    micStream?.getTracks().forEach((track) => track.stop())
    micStream = null
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      voiceLabel.textContent = 'Mic not supported'
      setTimeout(() => (voiceLabel.textContent = 'Add voice note'), 2200)
      return
    }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordedChunks = []
      mediaRecorder = new MediaRecorder(micStream)
      mediaRecorder.addEventListener('dataavailable', (ev) => {
        if (ev.data.size > 0) recordedChunks.push(ev.data)
      })
      mediaRecorder.addEventListener('stop', () => {
        const blob = new Blob(recordedChunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
        stopMicStream()
        const reader = new FileReader()
        reader.onload = (ev) => {
          const src = typeof ev.target?.result === 'string' ? ev.target.result : ''
          if (src) {
            voiceNotes.push({ src, recordedAt: Date.now() })
            renderVoiceList()
            updateProgress()
          }
        }
        reader.readAsDataURL(blob)
      })
      mediaRecorder.start()
      voiceToggleBtn.classList.add('sx-trade-journal-dialog__media-action-btn--recording')
      voiceLabel.textContent = 'Stop recording'
      voiceRecordingStartedAt = Date.now()
      voiceRecTime.textContent = '0:00'
      voiceRecIndicator.hidden = false
      voiceRecordingTimer = window.setInterval(() => {
        voiceRecTime.textContent = formatRecDuration(Date.now() - voiceRecordingStartedAt)
      }, 250)
    } catch {
      voiceLabel.textContent = 'Mic permission denied'
      setTimeout(() => (voiceLabel.textContent = 'Add voice note'), 2200)
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
    voiceToggleBtn.classList.remove('sx-trade-journal-dialog__media-action-btn--recording')
    voiceLabel.textContent = 'Add voice note'
    voiceRecIndicator.hidden = true
    if (voiceRecordingTimer !== null) {
      window.clearInterval(voiceRecordingTimer)
      voiceRecordingTimer = null
    }
  }

  voiceToggleBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording()
    else void startRecording()
  })

  /* ---------------- Summary ---------------- */
  overlay.querySelector<HTMLTextAreaElement>('[data-sx-trade-journal-summary]')?.addEventListener('input', markUnsaved)

  /* ---------------- Quick reflection ---------------- */
  function renderReflection(listKey: 'wentWell' | 'toImprove') {
    const wrap = overlay.querySelector<HTMLElement>(`[data-sx-trade-journal-reflection-wrap="${listKey}"]`)
    if (!wrap) return
    const cls = listKey === 'wentWell' ? 'went-well' : 'to-improve'
    wrap.innerHTML = reflectionOptions[listKey]
      .map(
        (opt) =>
          `<button type="button" class="sx-trade-journal-dialog__reflection-chip sx-trade-journal-dialog__reflection-chip--${cls}${reflectionState[listKey].has(opt) ? ' sx-trade-journal-dialog__reflection-chip--selected' : ''}" data-opt="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`,
      )
      .join('')
    wrap.querySelectorAll<HTMLButtonElement>('.sx-trade-journal-dialog__reflection-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const opt = chip.getAttribute('data-opt') ?? ''
        reflectionState[listKey].has(opt) ? reflectionState[listKey].delete(opt) : reflectionState[listKey].add(opt)
        renderReflection(listKey)
        updateProgress()
      })
    })
  }
  renderReflection('wentWell')
  renderReflection('toImprove')
  ;(['wentWell', 'toImprove'] as const).forEach((listKey) => {
    const input = overlay.querySelector<HTMLInputElement>(`[data-sx-trade-journal-reflection-input="${listKey}"]`)!
    const addBtn = overlay.querySelector<HTMLButtonElement>(`[data-sx-trade-journal-reflection-add="${listKey}"]`)!
    const commitCustomOption = () => {
      const val = input.value.trim()
      if (!val) return
      if (!reflectionOptions[listKey].includes(val)) reflectionOptions[listKey].push(val)
      reflectionState[listKey].add(val)
      input.value = ''
      renderReflection(listKey)
      updateProgress()
    }
    addBtn.addEventListener('click', commitCustomOption)
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault()
        commitCustomOption()
      }
    })
  })

  /* ---------------- Emotions ---------------- */
  function renderEmotions() {
    ;(['constructive', 'destructive', 'neutral'] as const).forEach((category) => {
      const wrap = overlay.querySelector<HTMLElement>(`[data-sx-trade-journal-emotion-wrap="${category}"]`)
      if (!wrap) return
      wrap.innerHTML = EMOTIONS[category]
        .map(
          (name) =>
            `<button type="button" class="sx-trade-journal-dialog__emotion-chip sx-trade-journal-dialog__emotion-chip--${category}${selectedEmotions.has(name) ? ' sx-trade-journal-dialog__emotion-chip--selected' : ''}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`,
        )
        .join('')
    })
    overlay.querySelectorAll<HTMLButtonElement>('.sx-trade-journal-dialog__emotion-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const name = chip.getAttribute('data-name') ?? ''
        selectedEmotions.has(name) ? selectedEmotions.delete(name) : selectedEmotions.add(name)
        renderEmotions()
        updateProgress()
      })
    })
  }
  renderEmotions()

  /* ---------------- Star rating ---------------- */
  const stars = overlay.querySelectorAll<SVGElement>('.sx-trade-journal-dialog__star')
  const ratingLabel = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-rating-label]')!
  function paintStars(val: number) {
    stars.forEach((s) => s.classList.toggle('sx-trade-journal-dialog__star--filled', parseInt(s.getAttribute('data-val') ?? '0', 10) <= val))
  }
  paintStars(currentRating)
  if (currentRating > 0) ratingLabel.textContent = `${currentRating} / 5`
  stars.forEach((star) => {
    star.addEventListener('mouseenter', () => paintStars(parseInt(star.getAttribute('data-val') ?? '0', 10)))
    star.addEventListener('mouseleave', () => paintStars(currentRating))
    star.addEventListener('click', () => {
      currentRating = parseInt(star.getAttribute('data-val') ?? '0', 10)
      paintStars(currentRating)
      ratingLabel.textContent = `${currentRating} / 5`
      updateProgress()
    })
  })

  /* ---------------- Optional note ---------------- */
  const noteToggle = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-note-toggle]')!
  const noteArea = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-note-area]')!
  noteToggle.addEventListener('click', () => {
    noteToggle.classList.toggle('sx-trade-journal-dialog__note-toggle--open')
    noteArea.classList.toggle('sx-trade-journal-dialog__note-area--open')
    if (noteArea.classList.contains('sx-trade-journal-dialog__note-area--open')) {
      overlay.querySelector<HTMLTextAreaElement>('[data-sx-trade-journal-notes]')?.focus()
    }
  })
  overlay.querySelector<HTMLTextAreaElement>('[data-sx-trade-journal-notes]')?.addEventListener('input', markUnsaved)

  /* ---------------- Tags ---------------- */
  const tagInput = overlay.querySelector<HTMLInputElement>('[data-sx-trade-journal-tag-input]')!
  const tagListEl = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-tag-list]')!
  let tags: string[] = [...(journal?.tags ?? [])]
  function renderTags() {
    tagListEl.innerHTML = tags
      .map(
        (t, i) =>
          `<span class="sx-trade-journal-dialog__tag-pill">${escapeHtml(t)}<span class="sx-trade-journal-dialog__tag-rm" data-i="${i}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></span></span>`,
      )
      .join('')
    tagListEl.querySelectorAll<HTMLElement>('.sx-trade-journal-dialog__tag-rm').forEach((rm) => {
      rm.addEventListener('click', () => {
        tags.splice(parseInt(rm.getAttribute('data-i') ?? '-1', 10), 1)
        renderTags()
        markUnsaved()
      })
    })
  }
  renderTags()
  tagInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && tagInput.value.trim()) {
      ev.preventDefault()
      tags.push(tagInput.value.trim())
      tagInput.value = ''
      renderTags()
      markUnsaved()
    }
  })

  /* ---------------- Save status + completeness ring ---------------- */
  const modifiedAtEl = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-modified-at]')!
  function formatModifiedAt(ts: number): string {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    const date = `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${String(d.getFullYear()).slice(-2)}`
    return `Modified at ${time} ${date}`
  }
  if (journal?.updatedAt) modifiedAtEl.textContent = formatModifiedAt(journal.updatedAt)
  const saveStatusText = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-save-status]')!
  const progressCircle = overlay.querySelector<SVGCircleElement>('[data-sx-trade-journal-progress-circle]')!
  const progressPct = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-progress-pct]')!
  function markUnsaved() {
    saveStatusText.textContent = 'Unsaved changes'
  }
  function updateProgress() {
    const checks = [
      pendingScreenshots.length > 0,
      reflectionState.wentWell.size + reflectionState.toImprove.size > 0,
      selectedEmotions.size > 0,
      currentRating > 0,
    ]
    const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100)
    const offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE
    progressCircle.style.strokeDashoffset = String(offset)
    progressPct.textContent = `${pct}%`
    markUnsaved()
  }
  updateProgress()
  if (journal) saveStatusText.textContent = 'Saved'

  /* ---------------- Close / nav / menu ---------------- */
  const escHandler = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') closeTradeJournalDialog()
  }
  document.addEventListener('keydown', escHandler)

  activeTeardown = () => {
    document.removeEventListener('keydown', escHandler)
    document.removeEventListener('paste', pasteHandler)
    window.removeEventListener('resize', updateScreenshotCarouselNav)
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
    stopMicStream()
    if (voiceRecordingTimer !== null) {
      window.clearInterval(voiceRecordingTimer)
      voiceRecordingTimer = null
    }
  }

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) {
      closeTradeJournalDialog()
      return
    }
    const menuEl = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-menu]')
    const menuToggleEl = overlay.querySelector<HTMLButtonElement>('[data-sx-trade-journal-menu-toggle]')
    if (menuEl && !menuEl.classList.contains('hidden') && !(ev.target as HTMLElement).closest('[data-sx-trade-journal-menu-wrap]')) {
      menuEl.classList.add('hidden')
      menuToggleEl?.setAttribute('aria-expanded', 'false')
    }
  })
  overlay.querySelectorAll<HTMLButtonElement>('[data-sx-trade-journal-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeTradeJournalDialog())
  })

  /* ---------------- All trades list ---------------- */
  const allTradesPanel = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-alltrades]')!
  const allTradesList = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-alltrades-list]')!
  const allTradesSearch = overlay.querySelector<HTMLInputElement>('[data-sx-trade-journal-alltrades-search]')!
  const dialogPanel = overlay.querySelector<HTMLElement>('.sx-trade-journal-dialog')!

  function allTradesStatusHtml(row: TradeJournalListRow): string {
    if (row.status === 'open') return '<span class="sx-trade-journal-alltrades__badge sx-trade-journal-alltrades__badge--open">Open trade</span>'
    const cls = row.status >= 0 ? 'sx-trade-journal-alltrades__badge--gain' : 'sx-trade-journal-alltrades__badge--loss'
    return `<span class="sx-trade-journal-alltrades__badge ${cls}">${escapeHtml(formatSignedMoney(row.status))}</span>`
  }

  function allTradesTimeHtml(ms: number): string {
    if (!ms || !Number.isFinite(ms)) return ''
    const d = new Date(ms)
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    const date = d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: '2-digit' })
    return `${time} ${date}`
  }

  function renderAllTradesList() {
    const rows = (entry.listAllTrades?.() ?? []).slice().sort((a, b) => b.timestampMs - a.timestampMs)
    const q = allTradesSearch.value.trim().toLowerCase()
    const filtered = q ? rows.filter((r) => r.asset.toLowerCase().includes(q) || r.direction.toLowerCase().includes(q)) : rows
    if (!filtered.length) {
      allTradesList.innerHTML = '<div class="sx-trade-journal-alltrades__empty">No trades found.</div>'
      return
    }
    allTradesList.innerHTML = filtered
      .map(
        (row) => `<div class="sx-trade-journal-alltrades__row${row.status === 'open' ? ' sx-trade-journal-alltrades__row--open' : ''}" data-sx-trade-journal-alltrades-row="${escapeHtml(row.key)}">
          <i class="fa-regular fa-file-lines sx-trade-journal-alltrades__row-icon" aria-hidden="true"></i>
          <span class="sx-trade-journal-alltrades__row-title">${escapeHtml(row.asset)}, ${row.direction === 'long' ? 'buy' : 'sell'}</span>
          ${allTradesStatusHtml(row)}
          <span class="sx-trade-journal-alltrades__row-time">${allTradesTimeHtml(row.timestampMs)}</span>
        </div>`,
      )
      .join('')
    allTradesList.querySelectorAll<HTMLElement>('[data-sx-trade-journal-alltrades-row]').forEach((rowEl) => {
      if (rowEl.classList.contains('sx-trade-journal-alltrades__row--open')) return
      rowEl.addEventListener('click', () => {
        const key = rowEl.getAttribute('data-sx-trade-journal-alltrades-row')
        if (key) entry.onSelectTradeFromList?.(key)
      })
    })
  }

  /* ---------------- All trades: Calendar tab ---------------- */
  const tradesTabView = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-alltrades-view="trades"]')!
  const calendarTabView = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-alltrades-view="calendar"]')!
  const allTradesTabBtns = overlay.querySelectorAll<HTMLButtonElement>('[data-sx-trade-journal-alltrades-tab]')
  const calMonthNavGroup = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-cal-month-nav]')!
  const calMonthLabel = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-cal-month-label]')!
  const calYearLabel = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-cal-year-label]')!
  const calBody = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-cal-body]')!
  const calTooltip = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-cal-tooltip]')!
  const calModeBtns = overlay.querySelectorAll<HTMLButtonElement>('[data-sx-trade-journal-cal-mode]')
  const today = new Date()
  let calMode: 'month' | 'year' = 'month'
  let calYear = today.getFullYear()
  let calMonth = today.getMonth()
  const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const MONTH_LABELS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  function calDayKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  }

  function calFormatMoney(v: number): string {
    if (v === 0) return '$0'
    const sign = v < 0 ? '\u2212' : ''
    const abs = Math.abs(v)
    const text = abs >= 1000 ? `${(abs / 1000).toFixed(2)}K` : abs.toFixed(0)
    return `${sign}$${text}`
  }

  function calBuildDayMap(): Map<string, { count: number; pnl: number }> {
    const map = new Map<string, { count: number; pnl: number }>()
    for (const row of entry.listAllTrades?.() ?? []) {
      if (row.status === 'open') continue
      const key = calDayKey(new Date(row.timestampMs))
      const cur = map.get(key) ?? { count: 0, pnl: 0 }
      cur.count += 1
      cur.pnl += row.status
      map.set(key, cur)
    }
    return map
  }

  /** Builds one month's worth of cells (Mon-start weeks, padded with the
   *  trailing days of the previous/next month so the grid is always full). */
  function calMonthCells(year: number, month: number): Array<{ date: Date; inMonth: boolean }> {
    const first = new Date(year, month, 1)
    const firstWeekday = (first.getDay() + 6) % 7 // Mon=0..Sun=6
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
    const cells: Array<{ date: Date; inMonth: boolean }> = []
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - firstWeekday + 1
      if (dayNum < 1) cells.push({ date: new Date(year, month - 1, daysInPrevMonth + dayNum), inMonth: false })
      else if (dayNum > daysInMonth) cells.push({ date: new Date(year, month + 1, dayNum - daysInMonth), inMonth: false })
      else cells.push({ date: new Date(year, month, dayNum), inMonth: true })
    }
    return cells
  }

  function calCellClass(base: string, inMonth: boolean, info: { count: number; pnl: number } | undefined): string {
    const cls = [base]
    if (!inMonth) cls.push(`${base}--outside`)
    if (info) cls.push(info.pnl > 0 ? `${base}--gain` : info.pnl < 0 ? `${base}--loss` : `${base}--flat`)
    return cls.join(' ')
  }

  function calTipText(info: { count: number; pnl: number }): string {
    return `${info.count} trade${info.count > 1 ? 's' : ''} \u2192 ${calFormatMoney(info.pnl)}`
  }

  function wireCalTooltips() {
    calBody.querySelectorAll<HTMLElement>('[data-sx-trade-journal-cal-tip]').forEach((cell) => {
      cell.addEventListener('mouseenter', () => showCalTooltip(cell))
      cell.addEventListener('mouseleave', hideCalTooltip)
    })
  }

  function renderCalMonthView(dayMap: Map<string, { count: number; pnl: number }>) {
    const cells = calMonthCells(calYear, calMonth)
    const weekdaysHtml = `<div class="sx-trade-journal-alltrades-calendar__weekdays">${WEEKDAY_LABELS.map((d) => `<div>${d}</div>`).join('')}</div>`
    const cellsHtml = cells
      .map(({ date, inMonth }) => {
        const info = dayMap.get(calDayKey(date))
        const tipAttr = info ? ` data-sx-trade-journal-cal-tip="${escapeHtml(calTipText(info))}"` : ''
        return `<div class="${calCellClass('sx-trade-journal-alltrades-calendar__cell', inMonth, info)}"${tipAttr}>
          ${info ? `<div class="sx-trade-journal-alltrades-calendar__cell-info">${info.count} trade${info.count > 1 ? 's' : ''}</div>` : ''}
          <div class="sx-trade-journal-alltrades-calendar__cell-num">${date.getDate()}</div>
          ${info ? `<div class="sx-trade-journal-alltrades-calendar__cell-pnl">${escapeHtml(calFormatMoney(info.pnl))}</div>` : ''}
        </div>`
      })
      .join('')
    calBody.innerHTML = `${weekdaysHtml}<div class="sx-trade-journal-alltrades-calendar__grid">${cellsHtml}</div>`
    wireCalTooltips()
  }

  function showCalTooltip(cell: HTMLElement) {
    const text = cell.getAttribute('data-sx-trade-journal-cal-tip')
    if (!text) return
    calTooltip.textContent = text
    const cellRect = cell.getBoundingClientRect()
    const bodyRect = calBody.getBoundingClientRect()
    calTooltip.hidden = false
    const tipRect = calTooltip.getBoundingClientRect()
    calTooltip.style.left = `${cellRect.left - bodyRect.left + cellRect.width / 2 - tipRect.width / 2}px`
    calTooltip.style.top = `${cellRect.top - bodyRect.top - tipRect.height + 4}px`
  }
  function hideCalTooltip() {
    calTooltip.hidden = true
  }

  function renderCalYearView(dayMap: Map<string, { count: number; pnl: number }>) {
    const monthsHtml = MONTH_LABELS.map((label, m) => {
      const cells = calMonthCells(calYear, m)
      const cellsHtml = cells
        .map(({ date, inMonth }) => {
          const info = dayMap.get(calDayKey(date))
          const tipAttr = info ? ` data-sx-trade-journal-cal-tip="${escapeHtml(calTipText(info))}"` : ''
          return `<div class="${calCellClass('sx-trade-journal-alltrades-calendar__mini-cell', inMonth, info)}"${tipAttr}>${date.getDate()}</div>`
        })
        .join('')
      return `<div class="sx-trade-journal-alltrades-calendar__mini-month">
        <div class="sx-trade-journal-alltrades-calendar__mini-month-title">${label}</div>
        <div class="sx-trade-journal-alltrades-calendar__mini-grid">${cellsHtml}</div>
      </div>`
    }).join('')
    calBody.innerHTML = `<div class="sx-trade-journal-alltrades-calendar__year-grid">${monthsHtml}</div>`
    wireCalTooltips()
  }

  function renderCalendar() {
    calMonthLabel.textContent = MONTH_LABELS[calMonth] ?? ''
    calYearLabel.textContent = String(calYear)
    calMonthNavGroup.style.display = calMode === 'month' ? '' : 'none'
    hideCalTooltip()
    const dayMap = calBuildDayMap()
    if (calMode === 'month') renderCalMonthView(dayMap)
    else renderCalYearView(dayMap)
    calModeBtns.forEach((btn) =>
      btn.classList.toggle('sx-trade-journal-alltrades-calendar__mode-btn--active', btn.getAttribute('data-sx-trade-journal-cal-mode') === calMode),
    )
  }

  overlay.querySelector('[data-sx-trade-journal-cal-prev-month]')?.addEventListener('click', () => {
    calMonth -= 1
    if (calMonth < 0) {
      calMonth = 11
      calYear -= 1
    }
    renderCalendar()
  })
  overlay.querySelector('[data-sx-trade-journal-cal-next-month]')?.addEventListener('click', () => {
    calMonth += 1
    if (calMonth > 11) {
      calMonth = 0
      calYear += 1
    }
    renderCalendar()
  })
  overlay.querySelector('[data-sx-trade-journal-cal-prev-year]')?.addEventListener('click', () => {
    calYear -= 1
    renderCalendar()
  })
  overlay.querySelector('[data-sx-trade-journal-cal-next-year]')?.addEventListener('click', () => {
    calYear += 1
    renderCalendar()
  })
  calModeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      calMode = btn.getAttribute('data-sx-trade-journal-cal-mode') === 'year' ? 'year' : 'month'
      renderCalendar()
    })
  })

  allTradesTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-sx-trade-journal-alltrades-tab')
      allTradesTabBtns.forEach((b) => b.classList.toggle('sx-trade-journal-alltrades__tab--active', b === btn))
      tradesTabView.hidden = tab !== 'trades'
      calendarTabView.hidden = tab !== 'calendar'
      if (tab === 'calendar') renderCalendar()
    })
  })

  function openAllTradesPanel() {
    renderAllTradesList()
    dialogPanel.hidden = true
    allTradesPanel.hidden = false
    allTradesSearch.value = ''
    allTradesSearch.focus()
  }

  function closeAllTradesPanel() {
    allTradesPanel.hidden = true
    dialogPanel.hidden = false
  }

  overlay.querySelector<HTMLButtonElement>('[data-sx-trade-journal-all-trades]')?.addEventListener('click', () => {
    if (entry.listAllTrades) openAllTradesPanel()
    else closeTradeJournalDialog()
  })
  overlay.querySelector<HTMLButtonElement>('[data-sx-trade-journal-alltrades-close]')?.addEventListener('click', () => closeAllTradesPanel())
  allTradesSearch.addEventListener('input', renderAllTradesList)
  overlay.querySelectorAll<HTMLButtonElement>('[data-sx-trade-journal-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = btn.getAttribute('data-sx-trade-journal-nav')
      const target = dir === 'prev' ? prevEntry : dir === 'next' ? nextEntry : null
      if (target) openTradeJournalDialog(target, { instant: true })
    })
  })

  const menuToggle = overlay.querySelector<HTMLButtonElement>('[data-sx-trade-journal-menu-toggle]')
  const menu = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-menu]')
  menuToggle?.addEventListener('click', (ev) => {
    ev.stopPropagation()
    const open = menu?.classList.toggle('hidden') === false
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
  })
  overlay.querySelector<HTMLButtonElement>('[data-sx-trade-journal-clear-notes]')?.addEventListener('click', () => {
    const textarea = overlay.querySelector<HTMLTextAreaElement>('[data-sx-trade-journal-notes]')
    if (textarea) {
      textarea.value = ''
      textarea.focus()
    }
    menu?.classList.add('hidden')
    markUnsaved()
  })

  /* ---------------- Save ---------------- */
  overlay.querySelector<HTMLButtonElement>('[data-sx-trade-journal-save]')?.addEventListener('click', () => {
    const textarea = overlay.querySelector<HTMLTextAreaElement>('[data-sx-trade-journal-notes]')
    const newNotes = textarea?.value ?? ''
    const summaryTextarea = overlay.querySelector<HTMLTextAreaElement>('[data-sx-trade-journal-summary]')
    onSave(trade.tradeNum, {
      notes: newNotes,
      rating: currentRating > 0 ? String(currentRating) : '',
      tags: [...tags],
      background: journal?.background,
      screenshots: pendingScreenshots,
      blocks: journal?.blocks ?? [],
      reflectionWentWell: Array.from(reflectionState.wentWell),
      reflectionToImprove: Array.from(reflectionState.toImprove),
      emotions: Array.from(selectedEmotions),
      voiceNotes: [...voiceNotes],
      summary: summaryTextarea?.value ?? '',
      updatedAt: Date.now(),
    })
    closeTradeJournalDialog()
  })
}
