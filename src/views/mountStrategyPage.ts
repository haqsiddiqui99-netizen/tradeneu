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
import { openStrategyAiModal } from '../strategy/strategyAiModal'
import { mountManualStrategyBuilder, type ManualStrategyBuilderApi } from '../strategy/manualStrategyBuilder'

export type MountStrategyPageOptions = {
  onBack?: () => void
  onOpenInChart?: (strategyId: string, opts?: { runBacktest?: boolean }) => void
  /** Render inside home Strategy tab (no overlay / no back button). */
  embedded?: boolean
}

export function mountStrategyPage(root: HTMLElement, opts?: MountStrategyPageOptions): () => void {
  root.replaceChildren()

  const shell = document.createElement('div')
  shell.className = opts?.embedded ? 'sx-strat-page sx-strat-page--embedded' : 'sx-strat-page'
  shell.innerHTML = `
    <div class="sx-strat-page__intake" data-sx-strat-view="intake">
      <header class="sx-strat-page__intake-head">
        ${opts?.onBack ? `<button type="button" class="sx-strat-page__back" data-sx-strat-back aria-label="Back to dashboard"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Dashboard</span></button>` : ''}
        <h1 class="sx-strat-page__intake-title">Strategies</h1>
        <div class="sx-strat-page__intake-tabs">
          <span class="sx-strat-page__intake-tab is-active"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> My strategies</span>
          <button type="button" class="sx-strat-page__intake-feedback" data-sx-strat-feedback><i class="fa-regular fa-comment" aria-hidden="true"></i> Leave feedback</button>
        </div>
      </header>
      <div class="sx-strat-page__intake-hero">
        <h2 class="sx-strat-page__intake-hero-title">Let\u2019s build your strategy</h2>
        <p class="sx-strat-page__intake-hero-subtitle">Where are you starting from?</p>
        <div class="sx-strat-page__intake-cards">
          <button type="button" class="sx-strat-page__intake-card" data-sx-strat-intake-pick="have">
            <span class="sx-strat-page__intake-card-icon sx-strat-page__intake-card-icon--blue"><i class="fa-regular fa-file-lines" aria-hidden="true"></i></span>
            <span class="sx-strat-page__intake-card-title">I have a strategy</span>
            <span class="sx-strat-page__intake-card-link sx-strat-page__intake-card-link--blue">Make it more objective</span>
            <span class="sx-strat-page__intake-card-desc">Got rules already? Good. I\u2019ll scan them, spot the gaps, and make every fuzzy idea into a clear, testable condition.</span>
          </button>
          <button type="button" class="sx-strat-page__intake-card" data-sx-strat-intake-pick="need">
            <span class="sx-strat-page__intake-card-icon sx-strat-page__intake-card-icon--violet"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></span>
            <span class="sx-strat-page__intake-card-title">I need a strategy</span>
            <span class="sx-strat-page__intake-card-link sx-strat-page__intake-card-link--violet">Start from scratch</span>
            <span class="sx-strat-page__intake-card-desc">Tell us a bit about yourself and we\u2019ll hand you a proven strategy to start with.</span>
          </button>
          <button type="button" class="sx-strat-page__intake-card" data-sx-strat-intake-pick="builtin">
            <span class="sx-strat-page__intake-card-icon sx-strat-page__intake-card-icon--green"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></span>
            <span class="sx-strat-page__intake-card-title">I want in-built strategy</span>
            <span class="sx-strat-page__intake-card-link sx-strat-page__intake-card-link--green">Browse templates</span>
            <span class="sx-strat-page__intake-card-desc">Pick from ready-made templates \u2014 EMA Crossover, RSI Mean Reversion, and more \u2014 then customize and backtest right away.</span>
          </button>
        </div>
      </div>
    </div>

    <div class="sx-strat-page__manual-view" data-sx-strat-view="manual" hidden>
      <div data-sx-strat-manual-host></div>
    </div>

    <div class="sx-strat-page__builder-view" data-sx-strat-view="builder" hidden>
      <header class="sx-strat-page__head">
        <div class="sx-strat-page__head-left">
          <button type="button" class="sx-strat-page__back" data-sx-strat-to-intake aria-label="Back to strategies"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Strategies</span></button>
          <div>
            <h1 class="sx-strat-page__title">Strategy builder</h1>
            <p class="sx-strat-page__subtitle">Create rule-based strategies for backtest and bar replay.</p>
          </div>
        </div>
        <div class="sx-strat-page__head-actions">
          <button type="button" class="sx-strat-page__btn sx-strat-page__btn--primary" data-sx-strat-new>+ New strategy</button>
          <button type="button" class="sx-strat-page__btn sx-strat-page__btn--ai" data-sx-strat-ai><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> AI Strategy Builder</button>
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
    </div>
  `
  root.appendChild(shell)

  const intakeView = shell.querySelector('[data-sx-strat-view="intake"]') as HTMLElement
  const manualView = shell.querySelector('[data-sx-strat-view="manual"]') as HTMLElement
  const manualHost = shell.querySelector('[data-sx-strat-manual-host]') as HTMLElement
  const builderView = shell.querySelector('[data-sx-strat-view="builder"]') as HTMLElement
  let manualBuilder: ManualStrategyBuilderApi | null = null

  function showIntake() {
    intakeView.hidden = false
    manualView.hidden = true
    builderView.hidden = true
  }

  function showManual() {
    intakeView.hidden = true
    manualView.hidden = false
    builderView.hidden = true
    if (!manualBuilder) {
      manualBuilder = mountManualStrategyBuilder({ host: manualHost, onBack: showIntake })
    }
  }

  function showBuilder() {
    intakeView.hidden = true
    manualView.hidden = true
    builderView.hidden = false
  }

  intakeView.querySelectorAll<HTMLButtonElement>('[data-sx-strat-intake-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pick = btn.dataset.sxStratIntakePick
      if (pick === 'builtin') {
        showManual()
        return
      }
      if (pick === 'have' || pick === 'need') {
        openStrategyAiModal({
          onStrategyReady: (strategy) => {
            builder.loadStrategy(strategy)
            selectedId = strategy.id
            paintList()
            showBuilder()
          },
        })
      }
    })
  })

  shell.querySelector('[data-sx-strat-feedback]')?.addEventListener('click', () => {
    window.open('mailto:support@tradeneu.com?subject=Strategy%20builder%20feedback', '_blank')
  })

  shell.querySelector('[data-sx-strat-to-intake]')?.addEventListener('click', () => showIntake())

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

  const btnAi = shell.querySelector('[data-sx-strat-ai]') as HTMLButtonElement
  btnAi.addEventListener('click', () => {
    openStrategyAiModal({
      onStrategyReady: (strategy) => {
        builder.loadStrategy(strategy)
        selectedId = strategy.id
        paintList()
      },
    })
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
    manualBuilder?.dispose()
    root.replaceChildren()
  }
}
