import { recordBattle, type BattleRecord } from '../battles/battleStore'
import type { StoredSession } from '../data/sessionStore'
import './battleCompareDialog.css'

function formatMoney(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function sessionOptionLabel(s: StoredSession): string {
  const bt = s.lastBacktest
  const suffix = bt ? ` · ${formatMoney(bt.netPnl)}` : ''
  return `${s.name} (${s.assets})${suffix}`
}

function buildResultHtml(record: BattleRecord): string {
  const winName = record.winner === 'a' ? record.sessionAName : record.winner === 'b' ? record.sessionBName : 'Tie'
  return `<strong>${winName}</strong> wins · ${record.sessionAName} ${formatMoney(record.pnlA)} vs ${record.sessionBName} ${formatMoney(record.pnlB)}`
}

let dialogEl: HTMLDialogElement | null = null

function ensureDialog(): HTMLDialogElement {
  if (dialogEl) return dialogEl
  dialogEl = document.createElement('dialog')
  dialogEl.className = 'sx-battle-dlg'
  dialogEl.innerHTML = `
    <div class="sx-battle-dlg__panel" role="document">
      <h2 class="sx-battle-dlg__title">Compare sessions</h2>
      <p class="sx-battle-dlg__meta">Pits last backtest or journal P&L from two sessions. Saved to Battles performance.</p>
      <div class="sx-battle-dlg__field">
        <label class="sx-battle-dlg__label" for="sx-battle-a">Session A</label>
        <select id="sx-battle-a" class="sx-battle-dlg__select" data-sx-battle-a></select>
      </div>
      <div class="sx-battle-dlg__field">
        <label class="sx-battle-dlg__label" for="sx-battle-b">Session B</label>
        <select id="sx-battle-b" class="sx-battle-dlg__select" data-sx-battle-b></select>
      </div>
      <div class="sx-battle-dlg__result" data-sx-battle-result hidden></div>
      <div class="sx-battle-dlg__actions">
        <button type="button" class="sx-battle-dlg__btn" data-sx-battle-close>Close</button>
        <button type="button" class="sx-battle-dlg__btn sx-battle-dlg__btn--primary" data-sx-battle-run>Run battle</button>
      </div>
    </div>
  `
  document.body.appendChild(dialogEl)
  dialogEl.querySelector('[data-sx-battle-close]')?.addEventListener('click', () => dialogEl?.close())
  dialogEl.addEventListener('cancel', (e) => {
    e.preventDefault()
    dialogEl?.close()
  })
  return dialogEl
}

export type BattleCompareDialogOptions = {
  sessions: StoredSession[]
  onRecorded?: (record: BattleRecord) => void
}

export function openBattleCompareDialog(opts: BattleCompareDialogOptions): void {
  if (opts.sessions.length < 2) {
    window.alert('Create at least two sessions before running a battle.')
    return
  }

  const dlg = ensureDialog()
  const selA = dlg.querySelector('[data-sx-battle-a]') as HTMLSelectElement
  const selB = dlg.querySelector('[data-sx-battle-b]') as HTMLSelectElement
  const resultEl = dlg.querySelector('[data-sx-battle-result]') as HTMLElement
  const runBtn = dlg.querySelector('[data-sx-battle-run]') as HTMLButtonElement

  const options = opts.sessions
    .map((s) => `<option value="${s.id}">${sessionOptionLabel(s)}</option>`)
    .join('')
  selA.innerHTML = options
  selB.innerHTML = options
  if (selB.options.length > 1) selB.selectedIndex = 1
  resultEl.hidden = true
  resultEl.textContent = ''

  const onRun = () => {
    const a = opts.sessions.find((s) => s.id === selA.value)
    const b = opts.sessions.find((s) => s.id === selB.value)
    if (!a || !b) return
    if (a.id === b.id) {
      window.alert('Pick two different sessions.')
      return
    }
    const record = recordBattle(a, b)
    resultEl.hidden = false
    resultEl.innerHTML = buildResultHtml(record)
    opts.onRecorded?.(record)
  }

  const clone = runBtn.cloneNode(true) as HTMLButtonElement
  runBtn.replaceWith(clone)
  clone.addEventListener('click', onRun)

  dlg.showModal()
}
