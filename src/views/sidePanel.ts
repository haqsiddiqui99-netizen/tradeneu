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
  renderTradeLog,
} from '../backtest/backtestChartUi'

export type SidePanelUpdate = {
  /** Point-in-time replay snapshot (live mode). */
  snapshot?: BacktestReplaySnapshot | null
  /** Full engine output — required for diagnosis heatmap. */
  result?: BacktestResult | null
  /** When true, show final summary stats (end of backtest run). */
  isFinal?: boolean
  /** Highlighted row in trade log (# trade number). */
  highlightTradeNum?: number
  /** @deprecated Use snapshot.openPosition */
  openPosition?: BacktestReplaySnapshot['openPosition'] | null
  /** @deprecated Use result.summary when isFinal */
  runningSummary?: BacktestSummary | null
}

export type SidePanelEls = {
  positionEl: HTMLElement
  statsEl: HTMLElement
  tradesEl: HTMLElement
  equityEl: HTMLElement
  diagnosisEl: HTMLElement
  fmtPrice: (n: number) => string
  /** Scroll container to bring session panel into view after backtest. */
  scrollEl?: HTMLElement | null
  rerunBtn?: HTMLButtonElement | null
  tradeExportBtn?: HTMLButtonElement | null
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

const EMPTY_TRADES =
  '<p class="rw-session-empty">Run a backtest to see every trade entry and exit.</p>'

const EMPTY_EQUITY =
  '<p class="rw-session-empty">Run a backtest to see equity and drawdown.</p>'

const EMPTY_DIAGNOSIS =
  '<p class="rw-session-empty">Run a backtest for loss heatmap and AI insights.</p>'

export function createSidePanel(els: SidePanelEls): SidePanelApi {
  function setRerunVisible(visible: boolean) {
    if (els.rerunBtn) els.rerunBtn.hidden = !visible
  }

  function setTradeExportVisible(visible: boolean) {
    if (els.tradeExportBtn) els.tradeExportBtn.hidden = !visible
  }

  function paintTradeLog(result: BacktestResult | null, highlightTradeNum?: number) {
    renderTradeLog(els.tradesEl, result, {
      fmtPrice: els.fmtPrice,
      highlightTradeNum,
    })
    setTradeExportVisible(Boolean(result?.trades.length))
  }

  function update(patch: SidePanelUpdate) {
    const result = patch.result ?? null
    const snapshot = patch.snapshot ?? null
    const highlight = patch.highlightTradeNum

    if (patch.isFinal && result) {
      renderBacktestSummary(els.statsEl, result)
      paintTradeLog(result, highlight)
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
      paintTradeLog(result, highlight)
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
      paintTradeLog(result, highlight)
      renderEquityCurve(els.equityEl, result)
      renderDiagnosisPanel(els.diagnosisEl, result)
      setRerunVisible(true)
    }
  }

  function clear() {
    els.positionEl.innerHTML = EMPTY_POSITION
    els.statsEl.innerHTML = EMPTY_STATS
    els.tradesEl.innerHTML = EMPTY_TRADES
    els.equityEl.innerHTML = EMPTY_EQUITY
    els.diagnosisEl.innerHTML = EMPTY_DIAGNOSIS
    setRerunVisible(false)
    setTradeExportVisible(false)
  }

  function scrollIntoView() {
    els.scrollEl?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return { update, clear, scrollIntoView }
}
