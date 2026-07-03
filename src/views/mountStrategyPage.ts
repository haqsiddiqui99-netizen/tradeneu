import './strategyPage.css'
import '../strategy/strategyBuilder.css'
import type { StrategyDefinition } from '../backtest/BacktestTypes'
import { BUILT_IN_STRATEGIES } from '../backtest/ExampleStrategies'
import {
  formatPositionLabel,
  formatStopLabel,
  formatTargetLabel,
  createBlankStrategy,
} from '../strategy/strategyBuilderFields'
import {
  isBuiltInStrategy,
  resolveStrategy,
} from '../strategy/strategyCatalog'
import { listCustomStrategies, saveCustomStrategy } from '../strategy/strategyStore'
import { mountStrategyBuilder } from '../strategy/strategyBuilderUi'

export type MountStrategyPageOptions = {
  onBack?: () => void
  onOpenInChart?: (strategyId: string, opts?: { runBacktest?: boolean }) => void
}

export function mountStrategyPage(root: HTMLElement, opts?: MountStrategyPageOptions): () => void {
  root.replaceChildren()

  const shell = document.createElement('div')
  shell.className = 'sx-strat-page'
  shell.innerHTML = `
    <header class="sx-strat-page__head">
      <div class="sx-strat-page__head-left">
        ${opts?.onBack ? `<button type="button" class="sx-strat-page__back" data-sx-strat-back aria-label="Back to dashboard">← Dashboard</button>` : ''}
        <div>
          <h1 class="sx-strat-page__title">Strategy builder</h1>
          <p class="sx-strat-page__subtitle">Create rule-based strategies for backtest and bar replay.</p>
        </div>
      </div>
      <div class="sx-strat-page__head-actions">
        <button type="button" class="sx-strat-page__btn sx-strat-page__btn--primary" data-sx-strat-new>+ New strategy</button>
        <button type="button" class="sx-strat-page__btn" data-sx-strat-run-backtest disabled>Run backtest</button>
        <button type="button" class="sx-strat-page__btn" data-sx-strat-open-chart disabled>Open in chart</button>
      </div>
    </header>
    <div class="sx-strat-page__body">
      <aside class="sx-strat-page__list" aria-label="Strategy library">
        <div class="sx-strat-page__list-section">
          <h2 class="sx-strat-page__list-label">Built-in templates</h2>
          <div class="sx-strat-page__cards" data-sx-strat-builtin></div>
        </div>
        <div class="sx-strat-page__list-section">
          <h2 class="sx-strat-page__list-label">My strategies</h2>
          <div class="sx-strat-page__cards" data-sx-strat-custom></div>
          <p class="sx-strat-page__empty" data-sx-strat-custom-empty hidden>No custom strategies yet. Duplicate a template or create new.</p>
        </div>
      </aside>
      <main class="sx-strat-page__editor">
        <div class="sx-strat-page__editor-summary" data-sx-strat-summary></div>
        <div class="sx-strat-page__builder-host" data-sx-strat-builder-host></div>
      </main>
    </div>
  `
  root.appendChild(shell)

  const builtinEl = shell.querySelector('[data-sx-strat-builtin]') as HTMLElement
  const customEl = shell.querySelector('[data-sx-strat-custom]') as HTMLElement
  const customEmptyEl = shell.querySelector('[data-sx-strat-custom-empty]') as HTMLElement
  const summaryEl = shell.querySelector('[data-sx-strat-summary]') as HTMLElement
  const builderHost = shell.querySelector('[data-sx-strat-builder-host]') as HTMLElement
  const btnOpenChart = shell.querySelector('[data-sx-strat-open-chart]') as HTMLButtonElement
  const btnRunBacktest = shell.querySelector('[data-sx-strat-run-backtest]') as HTMLButtonElement
  const btnNew = shell.querySelector('[data-sx-strat-new]') as HTMLButtonElement

  let selectedId = BUILT_IN_STRATEGIES[0]?.id ?? ''

  const builder = mountStrategyBuilder({
    host: builderHost,
    mode: 'page',
    initialStrategy: resolveStrategy(selectedId) ?? createBlankStrategy(),
    onSave: (saved) => {
      selectedId = saved.id
      paintList()
      selectCard(saved.id)
    },
    onDelete: () => {
      selectedId = BUILT_IN_STRATEGIES[0]?.id ?? ''
      paintList()
      const s = resolveStrategy(selectedId)
      if (s) builder.loadStrategy(s)
    },
    onChange: (s) => {
      paintSummary(s)
      btnOpenChart.disabled = !s.id
      btnRunBacktest.disabled = !s.id
    },
    onRunBacktest: (strategy) => {
      const saved = strategy.id.startsWith('custom_') ? saveCustomStrategy(strategy) : strategy
      selectedId = saved.id
      paintList()
      builder.loadStrategy(saved)
      opts?.onOpenInChart?.(saved.id, { runBacktest: true })
    },
  })

  function paintSummary(s: StrategyDefinition) {
    summaryEl.innerHTML = `
      <span class="sx-strat-page__tag">${isBuiltInStrategy(s.id) ? 'Template' : 'Custom'}</span>
      <span>${s.entryConditions.length} entry · ${s.exitConditions.length} exit rules</span>
      <span>Stop ${formatStopLabel(s.stopLoss)}</span>
      <span>TP ${formatTargetLabel(s.takeProfit)}</span>
      <span>Size ${formatPositionLabel(s.positionSize)}</span>
    `
  }

  function cardHtml(s: StrategyDefinition, active: boolean): string {
    return `<button type="button" class="sx-strat-page__card${active ? ' is-active' : ''}" data-sx-strat-id="${s.id}">
      <span class="sx-strat-page__card-name">${s.name}</span>
      <span class="sx-strat-page__card-meta">${s.direction} · ${s.entryConditions.length} entry rules</span>
    </button>`
  }

  function paintList() {
    builtinEl.innerHTML = BUILT_IN_STRATEGIES.map((s) => cardHtml(s, s.id === selectedId)).join('')
    const custom = listCustomStrategies()
    customEmptyEl.hidden = custom.length > 0
    customEl.innerHTML = custom.map((s) => cardHtml(s, s.id === selectedId)).join('')
  }

  function selectCard(id: string) {
    selectedId = id
    const s = resolveStrategy(id)
    if (s) builder.loadStrategy(s)
    paintList()
    btnOpenChart.disabled = !id
    btnRunBacktest.disabled = !id
  }

  function onListClick(e: Event) {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-sx-strat-id]')
    if (!btn?.dataset.sxStratId) return
    selectCard(btn.dataset.sxStratId)
  }

  builtinEl.addEventListener('click', onListClick)
  customEl.addEventListener('click', onListClick)

  btnNew.addEventListener('click', () => {
    const blank = createBlankStrategy()
    builder.loadStrategy(blank)
    selectedId = blank.id
    paintList()
  })

  btnOpenChart.addEventListener('click', () => {
    const s = builder.getStrategy()
    if (s.id) opts?.onOpenInChart?.(s.id)
  })

  btnRunBacktest.addEventListener('click', () => {
    const s = builder.getStrategy()
    if (!s.id) return
    const saved = s.id.startsWith('custom_') ? saveCustomStrategy(s) : s
    selectedId = saved.id
    paintList()
    builder.loadStrategy(saved)
    opts?.onOpenInChart?.(saved.id, { runBacktest: true })
  })

  shell.querySelector('[data-sx-strat-back]')?.addEventListener('click', () => opts?.onBack?.())

  paintList()
  paintSummary(builder.getStrategy())

  return () => {
    builtinEl.removeEventListener('click', onListClick)
    customEl.removeEventListener('click', onListClick)
    builder.dispose()
    root.replaceChildren()
  }
}
