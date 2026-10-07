import type { PropChallengeConfig } from './prop/propTypes'

export type SessionCreatedPayload = {
  name: string
  balance: string
  /** Comma-separated symbols; the first symbol drives the chart data feed. */
  assets: string
  /** Saved chart-layout id from the replay workspace, or null when none is chosen. */
  layout: string | null
  /** Strategy to load when the session opens. Empty means the chart default. */
  strategyId?: string
  sessionType: 'backtest' | 'prop'
  /**
   * Backtest range; filters bars after load. Use `YYYY-MM-DDTHH:mm` (local) from the session
   * modal, or legacy `YYYY-MM-DD` (UTC day boundaries in the chart filter).
   */
  startDate?: string
  endDate?: string
  /** Prop firm challenge limits (prop sessions only). */
  propRules?: PropChallengeConfig
}

export function parseSessionAssetList(assets: string): string[] {
  return assets
    .split(/[,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
}

/** Primary chart symbol from a single- or multi-asset session string. */
export function primarySessionSymbol(assets: string): string {
  const list = parseSessionAssetList(assets)
  return list[0] || 'XAUUSD'
}
