import './pineEditorDock.css'
import { icons } from '../icons'
import { BUILT_IN_STRATEGIES } from '../backtest/ExampleStrategies'

const DEFAULT_SCRIPT = `// This Pine Script® code is subject to the terms of the Mozilla Public License 2.0 at https://mozilla.org/MPL/2.0/
// © Tradeneu

//@version=5
indicator("My script", overlay=true)
plot(close, "Close", color=color.blue)
`

export type PineEditorDockApi = {
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: () => boolean
  getScript: () => string
  dispose: () => void
}

export function createPineEditorDock(opts: {
  host: HTMLElement
  getSymbol: () => string
  onOpenChange?: (open: boolean) => void
  onAddToChart?: (script: string, strategyId: string | null) => void
}): PineEditorDockApi {
  let open = false
  let lineNumbersEl: HTMLElement | null = null
  let codeEl: HTMLTextAreaElement | null = null
  let cursorEl: HTMLElement | null = null

  opts.host.innerHTML = `
    <header class="rw-pine-dock__head">
      <span class="rw-pine-dock__title">Pine Editor</span>
      <div class="rw-pine-dock__head-actions">
        <button type="button" class="rw-pine-dock__icon-btn" data-rw-pine-popout title="Open in new window">${icons.expand}</button>
        <button type="button" class="rw-pine-dock__icon-btn" data-rw-pine-close title="Close Pine Editor">${icons.close}</button>
      </div>
    </header>
    <div class="rw-pine-dock__toolbar">
      <button type="button" class="rw-pine-dock__script-name" data-rw-pine-script-name>
        Untitled script <span class="rw-pine-dock__script-name-chev" aria-hidden="true">${icons.chevronDown}</span>
      </button>
      <button type="button" class="rw-pine-dock__icon-btn" data-rw-pine-run title="Add to chart">${icons.play}</button>
      <button type="button" class="rw-pine-dock__icon-btn" data-rw-pine-save title="Save script">${icons.replayJournal}</button>
      <div class="rw-pine-dock__toolbar-actions">
        <button type="button" class="rw-pine-dock__publish" data-rw-pine-publish>Publish script</button>
        <button type="button" class="rw-pine-dock__icon-btn" data-rw-pine-more title="More">${icons.dotsVertical}</button>
      </div>
    </div>
    <div class="rw-pine-dock__editor-wrap">
      <div class="rw-pine-dock__gutter" data-rw-pine-gutter aria-hidden="true"></div>
      <textarea class="rw-pine-dock__code" data-rw-pine-code spellcheck="false" aria-label="Pine Script source"></textarea>
    </div>
    <footer class="rw-pine-dock__foot">
      <div class="rw-pine-dock__foot-left">
        <span aria-hidden="true">&gt;_</span>
        <span data-rw-pine-status>Ready</span>
      </div>
      <div class="rw-pine-dock__foot-right">
        <span data-rw-pine-cursor>Line 1, Col 1</span>
        <span aria-hidden="true"> · </span>
        <span>Pine Script® v5</span>
      </div>
    </footer>
  `

  lineNumbersEl = opts.host.querySelector('[data-rw-pine-gutter]')
  codeEl = opts.host.querySelector('[data-rw-pine-code]')
  cursorEl = opts.host.querySelector('[data-rw-pine-cursor]')
  const statusEl = opts.host.querySelector('[data-rw-pine-status]') as HTMLElement | null
  const btnClose = opts.host.querySelector('[data-rw-pine-close]') as HTMLButtonElement | null
  const btnRun = opts.host.querySelector('[data-rw-pine-run]') as HTMLButtonElement | null

  if (codeEl) {
    codeEl.value = DEFAULT_SCRIPT.replace('Tradeneu', opts.getSymbol())
    syncLineNumbers()
    syncCursor()
  }

  function syncLineNumbers() {
    if (!lineNumbersEl || !codeEl) return
    const lines = codeEl.value.split('\n').length
    lineNumbersEl.innerHTML = Array.from({ length: lines }, (_, i) => `<span class="rw-pine-dock__ln">${i + 1}</span>`).join('')
  }

  function syncCursor() {
    if (!codeEl || !cursorEl) return
    const pos = codeEl.selectionStart
    const before = codeEl.value.slice(0, pos)
    const line = before.split('\n').length
    const col = (before.split('\n').pop()?.length ?? 0) + 1
    cursorEl.textContent = `Line ${line}, Col ${col}`
  }

  function matchStrategyId(script: string): string | null {
    const lower = script.toLowerCase()
    for (const s of BUILT_IN_STRATEGIES) {
      const idNorm = s.id.replace(/_/g, ' ')
      if (
        lower.includes(s.id) ||
        lower.includes(idNorm) ||
        lower.includes(s.name.toLowerCase())
      ) {
        return s.id
      }
    }
    if (/\bema\b/.test(lower) && /\bcross/.test(lower)) return 'ema_cross'
    if (/\brsi\b/.test(lower)) return 'rsi_mean_rev'
    if (/\bmacd\b/.test(lower)) return 'macd_trend'
    if (/\bbollinger\b/.test(lower) || /\bbb\b/.test(lower)) return 'bb_breakout'
    if (/\bvwap\b/.test(lower)) return 'vwap_rev'
    return null
  }

  function setOpen(v: boolean) {
    if (open === v) return
    open = v
    opts.host.hidden = !open
    opts.onOpenChange?.(open)
  }

  const onCodeInput = () => {
    syncLineNumbers()
    syncCursor()
  }
  const onCodeSelect = () => syncCursor()
  const onCodeKeyup = () => syncCursor()
  const onClose = () => setOpen(false)
  const onRun = () => {
    if (!codeEl) return
    const script = codeEl.value
    const strategyId = matchStrategyId(script)
    const matched = strategyId
      ? BUILT_IN_STRATEGIES.find((s) => s.id === strategyId)
      : null
    if (statusEl) {
      statusEl.textContent = matched
        ? `Matched “${matched.name}” — opening Strategy builder…`
        : 'No built-in strategy match — Pine Script is not executed on chart'
    }
    opts.onAddToChart?.(script, strategyId)
  }

  codeEl?.addEventListener('input', onCodeInput)
  codeEl?.addEventListener('scroll', () => {
    if (lineNumbersEl && codeEl) lineNumbersEl.scrollTop = codeEl.scrollTop
  })
  codeEl?.addEventListener('click', onCodeSelect)
  codeEl?.addEventListener('keyup', onCodeKeyup)
  btnClose?.addEventListener('click', onClose)
  btnRun?.addEventListener('click', onRun)

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
    getScript: () => codeEl?.value ?? '',
    dispose: () => {
      codeEl?.removeEventListener('input', onCodeInput)
      codeEl?.removeEventListener('click', onCodeSelect)
      codeEl?.removeEventListener('keyup', onCodeKeyup)
      btnClose?.removeEventListener('click', onClose)
      btnRun?.removeEventListener('click', onRun)
    },
  }
}
