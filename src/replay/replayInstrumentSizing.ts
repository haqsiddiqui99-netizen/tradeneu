import { findAsset } from '../assetCatalog'

export type ReplayInstrumentSizing = {
  contractSize: number
  pipSize: number
  marginRate: number
}

const EXACT: Record<string, ReplayInstrumentSizing> = {
  XAUUSD: { contractSize: 100, pipSize: 0.01, marginRate: 0.05 },
  XAGUSD: { contractSize: 5_000, pipSize: 0.001, marginRate: 0.05 },
  BTCUSD: { contractSize: 1, pipSize: 1, marginRate: 0.2 },
  ETHUSD: { contractSize: 1, pipSize: 0.1, marginRate: 0.2 },
}

export function replayInstrumentSizing(symbol: string): ReplayInstrumentSizing {
  const normalized = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  const exact = EXACT[normalized]
  if (exact) return { ...exact }
  const asset = findAsset(normalized)
  if (asset?.category === 'forex') {
    return {
      contractSize: 100_000,
      pipSize: normalized.endsWith('JPY') ? 0.01 : 0.0001,
      marginRate: 0.03,
    }
  }
  if (asset?.category === 'futures') {
    return { contractSize: 1, pipSize: 0.01, marginRate: 0.1 }
  }
  if (asset?.category === 'stocks') {
    return { contractSize: 1, pipSize: 0.01, marginRate: 1 }
  }
  if (asset?.category === 'indices') {
    return { contractSize: 1, pipSize: 0.1, marginRate: 0.05 }
  }
  if (asset?.category === 'metals') {
    return { contractSize: 100, pipSize: 0.01, marginRate: 0.05 }
  }
  return { contractSize: 1, pipSize: 0.001, marginRate: 0.05 }
}

export function priceDistanceInPips(
  entryPrice: number,
  price: number,
  sizing: Pick<ReplayInstrumentSizing, 'pipSize'>,
): number {
  if (!(sizing.pipSize > 0)) return 0
  return Math.abs(price - entryPrice) / sizing.pipSize
}

export function priceFromPips(
  entryPrice: number,
  pips: number,
  direction: 'long' | 'short',
  kind: 'stopLoss' | 'takeProfit',
  sizing: Pick<ReplayInstrumentSizing, 'pipSize'>,
): number {
  const distance = Math.max(0, pips) * sizing.pipSize
  const favorable = kind === 'takeProfit'
  const add = direction === 'long' ? favorable : !favorable
  return add ? entryPrice + distance : entryPrice - distance
}

export function riskAmountForLots(
  lots: number,
  entryPrice: number,
  stopLoss: number,
  sizing: Pick<ReplayInstrumentSizing, 'contractSize'>,
): number {
  return Math.abs(entryPrice - stopLoss) * Math.max(0, lots) * sizing.contractSize
}

export function lotsForRiskAmount(
  riskAmount: number,
  entryPrice: number,
  stopLoss: number,
  sizing: Pick<ReplayInstrumentSizing, 'contractSize'>,
): number {
  const perLot = Math.abs(entryPrice - stopLoss) * sizing.contractSize
  if (!(perLot > 0) || !(riskAmount > 0)) return 0
  return Math.floor((riskAmount / perLot) * 100) / 100
}
