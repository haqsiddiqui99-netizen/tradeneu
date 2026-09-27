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
import {
  mountStrategyObjectifyView,
  type StrategyObjectifyViewApi,
} from '../strategy/strategyObjectifyView'
import {
  mountStrategyGenerateView,
  type StrategyGenerateViewApi,
} from '../strategy/strategyGenerateView'
import { mountManualStrategyBuilder, type ManualStrategyBuilderApi } from '../strategy/manualStrategyBuilder'
import { onLocaleChange, te } from '../i18n'

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
        ${opts?.onBack ? `<button type="button" class="sx-strat-page__back" data-sx-strat-back aria-label="${te('strategy.backToDashboard')}" data-i18n-aria-label="strategy.backToDashboard"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span data-i18n="nav.dashboard">${te('nav.dashboard')}</span></button>` : ''}
        <h1 class="sx-strat-page__intake-title" data-i18n="strategy.title">${te('strategy.title')}</h1>
      </header>
      <div class="sx-strat-page__intake-hero">
        <h2 class="sx-strat-page__intake-hero-title" data-i18n="strategy.intake.heroTitle">${te('strategy.intake.heroTitle')}</h2>
        <p class="sx-strat-page__intake-hero-subtitle" data-i18n="strategy.intake.heroSubtitle">${te('strategy.intake.heroSubtitle')}</p>
        <div class="sx-strat-page__intake-cards">
          <button type="button" class="sx-strat-page__intake-card" data-sx-strat-intake-pick="have">
            <span class="sx-strat-page__intake-card-icon sx-strat-page__intake-card-icon--blue"><i class="fa-regular fa-file-lines" aria-hidden="true"></i></span>
            <span class="sx-strat-page__intake-card-title" data-i18n="strategy.intake.have.title">${te('strategy.intake.have.title')}</span>
            <span class="sx-strat-page__intake-card-link sx-strat-page__intake-card-link--blue" data-i18n="strategy.intake.have.link">${te('strategy.intake.have.link')}</span>
            <span class="sx-strat-page__intake-card-desc" data-i18n="strategy.intake.have.desc">${te('strategy.intake.have.desc')}</span>
          </button>
          <button type="button" class="sx-strat-page__intake-card" data-sx-strat-intake-pick="need">
            <span class="sx-strat-page__intake-card-icon sx-strat-page__intake-card-icon--violet"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></span>
            <span class="sx-strat-page__intake-card-title" data-i18n="strategy.intake.need.title">${te('strategy.intake.need.title')}</span>
            <span class="sx-strat-page__intake-card-link sx-strat-page__intake-card-link--violet" data-i18n="strategy.intake.need.link">${te('strategy.intake.need.link')}</span>
            <span class="sx-strat-page__intake-card-desc" data-i18n="strategy.intake.need.desc">${te('strategy.intake.need.desc')}</span>
          </button>
          <button type="button" class="sx-strat-page__intake-card" data-sx-strat-intake-pick="builtin">
            <span class="sx-strat-page__intake-card-icon sx-strat-page__intake-card-icon--green"><i class="fa-solid fa-layer-group" aria-hidden="true"></i></span>
            <span class="sx-strat-page__intake-card-title" data-i18n="strategy.intake.builtin.title">${te('strategy.intake.builtin.title')}</span>
            <span class="sx-strat-page__intake-card-link sx-strat-page__intake-card-link--green" data-i18n="strategy.intake.builtin.link">${te('strategy.intake.builtin.link')}</span>
            <span class="sx-strat-page__intake-card-desc" data-i18n="strategy.intake.builtin.desc">${te('strategy.intake.builtin.desc')}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="sx-strat-page__manual-view" data-sx-strat-view="manual" hidden>
      <div data-sx-strat-manual-host></div>
    </div>

    <div class="sx-strat-page__objectify-view" data-sx-strat-view="objectify" hidden>
      <div data-sx-strat-objectify-host></div>
    </div>

    <div class="sx-strat-page__objectify-view" data-sx-strat-view="generate" hidden>
      <div data-sx-strat-generate-host></div>
    </div>

    <div class="sx-strat-page__builder-view" data-sx-strat-view="builder" hidden>
      <header class="sx-strat-page__head">
        <div class="sx-strat-page__head-left">
          <button type="button" class="sx-strat-page__back" data-sx-strat-to-intake aria-label="${te('strategy.backToStrategies')}" data-i18n-aria-label="strategy.backToStrategies"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span data-i18n="strategy.title">${te('strategy.title')}</span></button>
          <div>
            <h1 class="sx-strat-page__title" data-i18n="strategy.builderTitle">${te('strategy.builderTitle')}</h1>
            <p class="sx-strat-page__subtitle" data-i18n="strategy.builderSubtitle">${te('strategy.builderSubtitle')}</p>
          </div>
        </div>
        <div class="sx-strat-page__head-actions">
          <button type="button" class="sx-strat-page__btn sx-strat-page__btn--primary" data-sx-strat-new data-i18n="strategy.newStrategy">${te('strategy.newStrategy')}</button>
          <button type="button" class="sx-strat-page__btn sx-strat-page__btn--ai" data-sx-strat-ai><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> <span data-i18n="strategy.aiBuilder">${te('strategy.aiBuilder')}</span></button>
          <button type="button" class="sx-strat-page__btn" data-sx-strat-run-backtest disabled data-i18n="strategy.runBacktest">${te('strategy.runBacktest')}</button>
          <button type="button" class="sx-strat-page__btn" data-sx-strat-open-chart disabled data-i18n="strategy.openInChart">${te('strategy.openInChart')}</button>
        </div>
      </header>
      <div class="sx-strat-page__body">
        <aside class="sx-strat-page__list" aria-label="${te('strategy.libraryAria')}" data-i18n-aria-label="strategy.libraryAria">
          <div class="sx-strat-page__list-section">
            <h2 class="sx-strat-page__list-label" data-i18n="strategy.builtInTemplates">${te('strategy.builtInTemplates')}</h2>
            <div class="sx-strat-page__cards" data-sx-strat-builtin></div>
          </div>
          <div class="sx-strat-page__list-section">
            <h2 class="sx-strat-page__list-label" data-i18n="strategy.myStrategies">${te('strategy.myStrategies')}</h2>
            <div class="sx-strat-page__cards" data-sx-strat-custom></div>
            <p class="sx-strat-page__empty" data-sx-strat-custom-empty hidden data-i18n="strategy.noCustomYet">${te('strategy.noCustomYet')}</p>
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
  const objectifyView = shell.querySelector('[data-sx-strat-view="objectify"]') as HTMLElement
  const objectifyHost = shell.querySelector('[data-sx-strat-objectify-host]') as HTMLElement
  const generateView = shell.querySelector('[data-sx-strat-view="generate"]') as HTMLElement
  const generateHost = shell.querySelector('[data-sx-strat-generate-host]') as HTMLElement
  let manualBuilder: ManualStrategyBuilderApi | null = null
  let objectifyViewApi: StrategyObjectifyViewApi | null = null
  let generateViewApi: StrategyGenerateViewApi | null = null

  const VIEWS = {
    intake: intakeView,
    manual: manualView,
    builder: builderView,
    objectify: objectifyView,
    generate: generateView,
  }

  function setView(name: keyof typeof VIEWS) {
    for (const [key, el] of Object.entries(VIEWS)) el.hidden = key !== name
  }

  /** Hands an AI-drafted strategy to the rule editor for the trader to confirm. */
  function acceptStrategy(strategy: StrategyDefinition) {
    builder.loadStrategy(strategy)
    selectedId = strategy.id
    paintList()
    showBuilder()
  }

  function showIntake() {
    setView('intake')
  }

  function showManual() {
    setView('manual')
    if (!manualBuilder) {
      manualBuilder = mountManualStrategyBuilder({
        host: manualHost,
        onBack: showIntake,
        onOpenInChart: opts?.onOpenInChart,
      })
    }
  }

  function showBuilder() {
    setView('builder')
  }

  function showObjectify() {
    setView('objectify')
    if (!objectifyViewApi) {
      objectifyViewApi = mountStrategyObjectifyView({
        host: objectifyHost,
        onBack: showIntake,
        onStrategyReady: acceptStrategy,
      })
    }
  }

  function showGenerate() {
    setView('generate')
    if (!generateViewApi) {
      generateViewApi = mountStrategyGenerateView({
        host: generateHost,
        onBack: showIntake,
        onStrategyReady: acceptStrategy,
      })
    }
  }

  intakeView.querySelectorAll<HTMLButtonElement>('[data-sx-strat-intake-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pick = btn.dataset.sxStratIntakePick
      if (pick === 'builtin') {
        showManual()
        return
      }
      if (pick === 'have') {
        showObjectify()
        return
      }
      if (pick === 'need') showGenerate()
    })
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
      <span class="sx-strat-page__tag">${isBuiltInStrategy(s.id) ? te('strategy.tag.template') : te('strategy.tag.custom')}</span>
      <span>${te('strategy.entryExitRules', { entry: s.entryConditions.length, exit: s.exitConditions.length })}</span>
      <span>${te('strategy.stopLabel', { value: formatStopLabel(s.stopLoss) })}</span>
      <span>${te('strategy.tpLabel', { value: formatTargetLabel(s.takeProfit) })}</span>
      <span>${te('strategy.sizeLabel', { value: formatPositionLabel(s.positionSize) })}</span>
    `
  }

  function cardHtml(s: StrategyDefinition, active: boolean): string {
    const dirKey = s.direction === 'long' ? 'strategy.direction.long' : s.direction === 'short' ? 'strategy.direction.short' : 'strategy.direction.both'
    return `<button type="button" class="sx-strat-page__card${active ? ' is-active' : ''}" data-sx-strat-id="${s.id}">
      <span class="sx-strat-page__card-name">${s.name}</span>
      <span class="sx-strat-page__card-meta">${te(dirKey)} · ${te('strategy.entryRulesCount', { count: s.entryConditions.length })}</span>
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

  // The strategy cards and the summary strip are built from JS strings rather than
  // `data-i18n` markup, so they need an explicit repaint when the language changes.
  const offLocale = onLocaleChange(() => {
    paintList()
    paintSummary(builder.getStrategy())
  })

  return () => {
    offLocale()
    builtinEl.removeEventListener('click', onListClick)
    customEl.removeEventListener('click', onListClick)
    builder.dispose()
    manualBuilder?.dispose()
    objectifyViewApi?.dispose()
    generateViewApi?.dispose()
    root.replaceChildren()
  }
}
