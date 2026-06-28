import type { BacktestResult, BacktestSummary } from '../backtest/BacktestTypes'
import type { BacktestReplaySnapshot } from '../backtest/backtestReplaySnapshot'
import {
  formatBacktestMoney,
  renderBacktestSummary,
  renderDiagnosisPanel,
  renderEquityCurve,
  renderSessionPositionPanel,
  renderSessionStatsFromSummary,
  renderSessionStatsPanel,
} from '../backtest/backtestChartUi'

export type SidePanelUpdate = {
  /** Point-in-time replay snapshot (live mode). */
  snapshot?: BacktestReplaySnapshot | null
  /** Full engine output — required for diagnosis heatmap. */
  result?: BacktestResult | null
  /** When true, show final summary stats (end of backtest run). */
  isFinal?: boolean
  /** @deprecated Use snapshot.openPosition */
  openPosition?: BacktestReplaySnapshot['openPosition'] | null
  /** @deprecated Use result.summary when isFinal */
  runningSummary?: BacktestSummary | null
}

export type SidePanelEls = {
  positionEl: HTMLElement
  statsEl: HTMLElement
  equityEl: HTMLElement
  diagnosisEl: HTMLElement
  fmtPrice: (n: number) => string
  /** Scroll container to bring session panel into view after backtest. */
  scrollEl?: HTMLElement | null
  rerunBtn?: HTMLButtonElement | null
}

export type SidePanelApi = {
  update: (patch: SidePanelUpdate) => void
  clear: () => void
  scrollIntoView: () => void
}

const EMPTY_POSITION =
  '<p class="rw-session-empty">Press <strong>Backtest</strong> in the toolbar to simulate your strategy.</p>'

const EMPTY_STATS =
  '<p class="rw-session-empty">Run a backtest to see live performance as replay plays.</p>'

const EMPTY_EQUITY =
  '<p class="rw-session-empty">Run a backtest to see equity and drawdown.</p>'

const EMPTY_DIAGNOSIS =
  '<p class="rw-session-empty">Run a backtest for loss heatmap and AI insights.</p>'

export function createSidePanel(els: SidePanelEls): SidePanelApi {
  function setRerunVisible(visible: boolean) {
    if (els.rerunBtn) els.rerunBtn.hidden = !visible
  }

  function update(patch: SidePanelUpdate) {
    const result = patch.result ?? null
    const snapshot = patch.snapshot ?? null

    if (patch.isFinal && result) {
      renderBacktestSummary(els.statsEl, result)
      renderEquityCurve(els.equityEl, result)
      renderSessionPositionPanel(
        els.positionEl,
        null,
        true,
        els.fmtPrice,
        formatBacktestMoney,
      )
      renderDiagnosisPanel(els.diagnosisEl, result)
      setRerunVisible(true)
      return
    }

    if (result && snapshot) {
      renderSessionStatsPanel(els.statsEl, snapshot, true, formatBacktestMoney)
      renderEquityCurve(els.equityEl, result)
      renderSessionPositionPanel(
        els.positionEl,
        snapshot,
        true,
        els.fmtPrice,
        formatBacktestMoney,
      )
      renderDiagnosisPanel(els.diagnosisEl, result)
      setRerunVisible(true)
      return
    }

    if (result) {
      renderSessionStatsFromSummary(els.statsEl, result, formatBacktestMoney)
      renderEquityCurve(els.equityEl, result)
      renderDiagnosisPanel(els.diagnosisEl, result)
      setRerunVisible(true)
    }
  }

  function clear() {
    els.positionEl.innerHTML = EMPTY_POSITION
    els.statsEl.innerHTML = EMPTY_STATS
    els.equityEl.innerHTML = EMPTY_EQUITY
    els.diagnosisEl.innerHTML = EMPTY_DIAGNOSIS
    setRerunVisible(false)
  }

  function scrollIntoView() {
    els.scrollEl?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return { update, clear, scrollIntoView }
}
