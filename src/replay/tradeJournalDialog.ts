import './tradeJournalDialog.css'
import {
  normalizeJournalScreenshots,
  type ClosedReplayTrade,
  type ReplayJournalScreenshot,
  type ReplayTradeJournal,
} from './replayPositions'

/**
 * Single shared "Trade journal" dialog used everywhere a trade's journal can
 * be opened (the dashboard Trades table and the in-chart replay Closed
 * Positions panel). It's appended directly to <body> so it works regardless
 * of which page/root invoked it, and its CSS (tradeJournalDialog.css) uses
 * only literal colors for the same reason.
 */

export type TradeJournalDialogEntry = {
  trade: ClosedReplayTrade
  asset: string
  onSave: (tradeNum: number, journal: ReplayTradeJournal) => void
  getPrev?: () => TradeJournalDialogEntry | null
  getNext?: () => TradeJournalDialogEntry | null
  /** Captures the live chart into a data URL, e.g. for a screenshot button. Only
   *  available when the dialog is opened from a page that has a chart on screen. */
  onCaptureChartScreenshot?: () => Promise<string | null>
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

const REFLECTION_OPTIONS: Record<'wentWell' | 'toImprove', string[]> = {
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

const EMOTIONS: Record<'constructive' | 'destructive' | 'neutral', string[]> = {
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

export function openTradeJournalDialog(entry: TradeJournalDialogEntry) {
  closeTradeJournalDialog()
  const { trade, asset, onSave, getPrev, getNext, onCaptureChartScreenshot } = entry

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
      : '\u2014'
  const sessionLabel = sessionForHour(new Date(entryTimeMs).getUTCHours())

  const journal = trade.journal
  const initialScreenshots = normalizeJournalScreenshots(journal?.screenshots)
  let pendingScreenshots: ReplayJournalScreenshot[] = initialScreenshots.map((s) => ({ ...s }))
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
  overlay.className = 'sx-trade-journal-overlay'
  overlay.setAttribute('data-sx-trade-journal-dialog', '')
  overlay.innerHTML = `
    <div class="sx-trade-journal-dialog" role="dialog" aria-modal="true" aria-label="Trade journal">
      <div class="sx-trade-journal-dialog__toolbar">
        <button type="button" class="sx-trade-journal-dialog__icon-btn" data-sx-trade-journal-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        <button type="button" class="sx-trade-journal-dialog__all-trades-pill" data-sx-trade-journal-close>All trades</button>
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
        <h1 class="sx-trade-journal-dialog__title">${escapeHtml(asset)}, <span class="${sideCls}">${side}</span><span class="sx-trade-journal-dialog__datetime">${escapeHtml(entryTimeText)}</span></h1>
        <div class="sx-trade-journal-dialog__snapshot-strip">
          ${snapChipHtml('Entry', escapeHtml(String(trade.entryPrice)))}
          ${snapChipHtml('Exit', escapeHtml(String(trade.exitPrice)))}
          ${snapChipHtml('P&L', escapeHtml(formatSignedMoney(trade.pnl)), trade.pnl >= 0 ? 'sx-trade-journal-dialog__snap-value--gain' : 'sx-trade-journal-dialog__snap-value--loss')}
          ${snapChipHtml('R-multiple', escapeHtml(rMultipleText))}
          ${snapChipHtml('Duration', escapeHtml(durationText))}
          ${snapChipHtml('Session', escapeHtml(sessionLabel))}
        </div>
      </div>

      <div class="sx-trade-journal-dialog__section">
        <div class="sx-trade-journal-dialog__section-label">Chart screenshot <span class="sx-trade-journal-dialog__section-hint">\u2014 paste with <kbd>Ctrl</kbd>+<kbd>V</kbd>, or use the buttons below</span></div>
        <div class="sx-trade-journal-dialog__media-actions">
          ${onCaptureChartScreenshot ? '<button type="button" class="sx-trade-journal-dialog__media-action-btn" data-sx-trade-journal-capture-chart title="Capture the current chart"><i class="fa-solid fa-camera" aria-hidden="true"></i> Add chart screenshot</button>' : ''}
          <button type="button" class="sx-trade-journal-dialog__media-action-btn" data-sx-trade-journal-add-image><i class="fa-regular fa-image" aria-hidden="true"></i> Add image</button>
          <button type="button" class="sx-trade-journal-dialog__media-action-btn" data-sx-trade-journal-voice-toggle><i class="fa-solid fa-microphone" aria-hidden="true"></i> <span data-sx-trade-journal-voice-label>Add voice note</span></button>
        </div>
        <input type="file" data-sx-trade-journal-screenshot-input accept="image/*" multiple hidden>
        <div class="sx-trade-journal-dialog__screenshot-grid" data-sx-trade-journal-screenshot-grid></div>
        <div class="sx-trade-journal-dialog__voice-list" data-sx-trade-journal-voice-list></div>
      </div>

      <div class="sx-trade-journal-dialog__section">
        <div class="sx-trade-journal-dialog__section-label">Summary <span class="sx-trade-journal-dialog__section-hint">\u2014 write about your experience with this trade</span></div>
        <textarea class="sx-trade-journal-dialog__summary-textarea" data-sx-trade-journal-summary placeholder="What happened, how it felt, what you'd tell yourself next time...">${escapeHtml(journal?.summary ?? '')}</textarea>
      </div>

      <div class="sx-trade-journal-dialog__section">
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

      <div class="sx-trade-journal-dialog__section">
        <div class="sx-trade-journal-dialog__section-label">Emotions <span class="sx-trade-journal-dialog__section-hint">\u2014 select everything you felt</span></div>
        <div class="sx-trade-journal-dialog__emotion-group"><div class="sx-trade-journal-dialog__emotion-group-label">Constructive</div><div class="sx-trade-journal-dialog__emotion-wrap" data-sx-trade-journal-emotion-wrap="constructive"></div></div>
        <div class="sx-trade-journal-dialog__emotion-group"><div class="sx-trade-journal-dialog__emotion-group-label">Destructive</div><div class="sx-trade-journal-dialog__emotion-wrap" data-sx-trade-journal-emotion-wrap="destructive"></div></div>
        <div class="sx-trade-journal-dialog__emotion-group"><div class="sx-trade-journal-dialog__emotion-group-label">Neutral / situational</div><div class="sx-trade-journal-dialog__emotion-wrap" data-sx-trade-journal-emotion-wrap="neutral"></div></div>
      </div>

      <div class="sx-trade-journal-dialog__section">
        <div class="sx-trade-journal-dialog__section-label">Trade rating</div>
        <div class="sx-trade-journal-dialog__star-rating" data-sx-trade-journal-star-rating>
          ${starsSvg}
          <span class="sx-trade-journal-dialog__rating-label" data-sx-trade-journal-rating-label>Not rated</span>
        </div>
      </div>

      <div class="sx-trade-journal-dialog__section">
        <div class="sx-trade-journal-dialog__note-toggle${journal?.notes ? ' sx-trade-journal-dialog__note-toggle--open' : ''}" data-sx-trade-journal-note-toggle>
          <i class="fa-solid fa-plus" aria-hidden="true"></i> Add a written note (optional)
        </div>
        <div class="sx-trade-journal-dialog__note-area${journal?.notes ? ' sx-trade-journal-dialog__note-area--open' : ''}" data-sx-trade-journal-note-area>
          <textarea data-sx-trade-journal-notes placeholder="Anything the quick options above didn't capture...">${escapeHtml(journal?.notes ?? '')}</textarea>
        </div>
      </div>

      <div class="sx-trade-journal-dialog__section">
        <div class="sx-trade-journal-dialog__section-label">Tags</div>
        <div class="sx-trade-journal-dialog__tag-input-row"><input type="text" data-sx-trade-journal-tag-input placeholder="Type a tag and press Enter"></div>
        <div class="sx-trade-journal-dialog__tag-list" data-sx-trade-journal-tag-list></div>
      </div>

      <div class="sx-trade-journal-dialog__foot">
        <button type="button" class="sx-trade-journal-dialog__save" data-sx-trade-journal-save>Save entry</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  activeOverlay = overlay

  /* ---------------- Screenshots ---------------- */
  const screenshotGrid = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-screenshot-grid]')!
  function thumbHtml(s: ReplayJournalScreenshot, i: number): string {
    const isChart = s.source === 'chart'
    const badgeIcon = isChart ? 'fa-solid fa-camera' : 'fa-regular fa-image'
    const badgeLabel = isChart ? 'Screenshot' : 'Image'
    return `<div class="sx-trade-journal-dialog__screenshot-thumb"><img src="${escapeHtml(s.src)}" alt="" data-sx-trade-journal-screenshot-view="${i}"><button type="button" class="sx-trade-journal-dialog__screenshot-rm" data-sx-trade-journal-screenshot-rm="${i}" aria-label="Remove screenshot"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button><div class="sx-trade-journal-dialog__screenshot-badge"><i class="${badgeIcon}" aria-hidden="true"></i> ${badgeLabel}</div></div>`
  }
  function removeScreenshotAt(idx: number) {
    if (idx < 0 || idx >= pendingScreenshots.length) return
    pendingScreenshots.splice(idx, 1)
    renderScreenshotGrid()
    updateProgress()
  }
  function renderScreenshotGrid() {
    screenshotGrid.innerHTML = pendingScreenshots.map((s, i) => thumbHtml(s, i)).join('')
    screenshotGrid.querySelectorAll<HTMLButtonElement>('[data-sx-trade-journal-screenshot-rm]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        const idx = parseInt(btn.getAttribute('data-sx-trade-journal-screenshot-rm') ?? '-1', 10)
        removeScreenshotAt(idx)
      })
    })
    screenshotGrid.querySelectorAll<HTMLImageElement>('[data-sx-trade-journal-screenshot-view]').forEach((img) => {
      img.addEventListener('click', () => {
        const idx = parseInt(img.getAttribute('data-sx-trade-journal-screenshot-view') ?? '-1', 10)
        if (idx >= 0) openScreenshotLightbox(idx)
      })
    })
  }
  renderScreenshotGrid()

  /* ---------------- Screenshot lightbox (view + delete) ---------------- */
  function openScreenshotLightbox(index: number) {
    const shot = pendingScreenshots[index]
    if (!shot) return
    const lightbox = document.createElement('div')
    lightbox.className = 'sx-trade-journal-lightbox'
    lightbox.innerHTML = `
      <div class="sx-trade-journal-lightbox__panel">
        <img src="${escapeHtml(shot.src)}" alt="">
        <div class="sx-trade-journal-lightbox__actions">
          <button type="button" class="sx-trade-journal-lightbox__delete" data-sx-trade-journal-lightbox-delete><i class="fa-solid fa-trash" aria-hidden="true"></i> Delete</button>
          <button type="button" class="sx-trade-journal-lightbox__close" data-sx-trade-journal-lightbox-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
      </div>
    `
    document.body.appendChild(lightbox)
    const close = () => {
      lightbox.remove()
      document.removeEventListener('keydown', onKeydown)
      if (activeLightboxClose === close) activeLightboxClose = null
    }
    activeLightboxClose?.()
    activeLightboxClose = close
    const onKeydown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeydown)
    lightbox.addEventListener('click', (ev) => {
      if (ev.target === lightbox) close()
    })
    lightbox.querySelector('[data-sx-trade-journal-lightbox-close]')?.addEventListener('click', close)
    lightbox.querySelector('[data-sx-trade-journal-lightbox-delete]')?.addEventListener('click', () => {
      removeScreenshotAt(index)
      close()
    })
  }

  function addScreenshotDataUrl(src: string, source: 'chart' | 'upload' = 'upload') {
    if (!src) return
    pendingScreenshots.push({ src, caption: '', align: 'left', showCaption: true, source })
    renderScreenshotGrid()
    updateProgress()
  }

  function addScreenshotFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const src = typeof ev.target?.result === 'string' ? ev.target.result : ''
      addScreenshotDataUrl(src, 'upload')
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
  let voiceNotes: string[] = [...(journal?.voiceNotes ?? [])]
  let mediaRecorder: MediaRecorder | null = null
  let recordedChunks: Blob[] = []
  let micStream: MediaStream | null = null
  const voiceList = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-voice-list]')!
  const voiceToggleBtn = overlay.querySelector<HTMLButtonElement>('[data-sx-trade-journal-voice-toggle]')!
  const voiceLabel = overlay.querySelector<HTMLElement>('[data-sx-trade-journal-voice-label]')!

  function renderVoiceList() {
    voiceList.innerHTML = voiceNotes
      .map(
        (src, i) =>
          `<div class="sx-trade-journal-dialog__voice-item"><audio controls src="${escapeHtml(src)}"></audio><button type="button" class="sx-trade-journal-dialog__voice-rm" data-sx-trade-journal-voice-rm="${i}" aria-label="Remove voice note"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>`,
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
            voiceNotes.push(src)
            renderVoiceList()
            updateProgress()
          }
        }
        reader.readAsDataURL(blob)
      })
      mediaRecorder.start()
      voiceToggleBtn.classList.add('sx-trade-journal-dialog__media-action-btn--recording')
      voiceLabel.textContent = 'Stop recording'
    } catch {
      voiceLabel.textContent = 'Mic permission denied'
      setTimeout(() => (voiceLabel.textContent = 'Add voice note'), 2200)
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
    voiceToggleBtn.classList.remove('sx-trade-journal-dialog__media-action-btn--recording')
    voiceLabel.textContent = 'Add voice note'
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
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
    stopMicStream()
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
  overlay.querySelectorAll<HTMLButtonElement>('[data-sx-trade-journal-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = btn.getAttribute('data-sx-trade-journal-nav')
      const target = dir === 'prev' ? prevEntry : dir === 'next' ? nextEntry : null
      if (target) openTradeJournalDialog(target)
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
