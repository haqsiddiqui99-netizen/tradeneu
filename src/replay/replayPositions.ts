export type PositionDirection = 'long' | 'short'

export type ReplayExitReason = 'manual' | 'take_profit' | 'stop_loss'

export type OpenPosition = {
  id: string
  direction: PositionDirection
  qty: number
  entryPrice: number
  entryTime: number
  takeProfit: number | null
  stopLoss: number | null
}

export type ClosedReplayTrade = {
  tradeNum: number
  positionId: string
  direction: PositionDirection
  qty: number
  entryPrice: number
  exitPrice: number
  entryTime: number
  exitTime: number
  pnl: number
  exitReason: ReplayExitReason
}

export type ReplayAccountState = {
  cash: number
  realizedPnL: number
  positions: OpenPosition[]
  closedTrades: ClosedReplayTrade[]
}

export type ReplayAccountSummary = ReplayAccountState & {
  unrealizedPnL: number
  equity: number
}

export type ReplayAccountPersisted = {
  cash: number
  realizedPnL: number
  positions: OpenPosition[]
  closedTrades: ClosedReplayTrade[]
  nextId: number
}

function defaultTpSl(entry: number, direction: PositionDirection): { tp: number; sl: number } {
  const tpPct = 0.001
  const slPct = 0.0005
  if (direction === 'long') {
    return { tp: entry * (1 + tpPct), sl: entry * (1 - slPct) }
  }
  return { tp: entry * (1 - tpPct), sl: entry * (1 + slPct) }
}

export { defaultTpSl }

export function positionUnrealized(pos: OpenPosition, markPrice: number): number {
  if (pos.direction === 'long') return (markPrice - pos.entryPrice) * pos.qty
  return (pos.entryPrice - markPrice) * pos.qty
}

export function positionPoints(pos: OpenPosition, markPrice: number): number {
  const raw = pos.direction === 'long' ? markPrice - pos.entryPrice : pos.entryPrice - markPrice
  return Math.round(raw * 1000)
}

export function longOrderCost(qty: number, ask: number): number {
  const q = Math.max(1, Math.floor(qty))
  return q * ask
}

export function shortOrderMargin(qty: number, bid: number): number {
  const q = Math.max(1, Math.floor(qty))
  return q * bid * 0.05
}

function clonePositions(list: OpenPosition[]): OpenPosition[] {
  return list.map((p) => ({ ...p }))
}

export function createReplayAccount(initialCash: number, restored?: ReplayAccountPersisted | null) {
  let cash = restored?.cash ?? initialCash
  let realizedPnL = restored?.realizedPnL ?? 0
  const positions: OpenPosition[] = clonePositions(restored?.positions ?? [])
  const closedTrades: ClosedReplayTrade[] = restored?.closedTrades ? [...restored.closedTrades] : []
  let nextId = restored?.nextId ?? 1

  function getPositions(): OpenPosition[] {
    return clonePositions(positions)
  }

  function getClosedTrades(): ClosedReplayTrade[] {
    return closedTrades.slice()
  }

  function getPersisted(): ReplayAccountPersisted {
    return {
      cash,
      realizedPnL,
      positions: clonePositions(positions),
      closedTrades: closedTrades.slice(),
      nextId,
    }
  }

  function resetAccount() {
    cash = initialCash
    realizedPnL = 0
    positions.length = 0
    closedTrades.length = 0
    nextId = 1
  }

  function summary(markPrice: number): ReplayAccountSummary {
    const unrealizedPnL = positions.reduce((a, p) => a + positionUnrealized(p, markPrice), 0)
    return {
      cash,
      realizedPnL,
      positions: clonePositions(positions),
      closedTrades: closedTrades.slice(),
      unrealizedPnL,
      equity: cash + unrealizedPnL,
    }
  }

  function openLong(qty: number, ask: number, time: number): OpenPosition | null {
    const q = Math.max(1, Math.floor(qty))
    const cost = q * ask
    if (cost > cash) return null
    const pos: OpenPosition = {
      id: String(nextId++),
      direction: 'long',
      qty: q,
      entryPrice: ask,
      entryTime: time,
      takeProfit: null,
      stopLoss: null,
    }
    cash -= cost
    positions.push(pos)
    return pos
  }

  function openShort(qty: number, bid: number, time: number): OpenPosition | null {
    const q = Math.max(1, Math.floor(qty))
    const margin = q * bid * 0.05
    if (margin > cash) return null
    const pos: OpenPosition = {
      id: String(nextId++),
      direction: 'short',
      qty: q,
      entryPrice: bid,
      entryTime: time,
      takeProfit: null,
      stopLoss: null,
    }
    cash += q * bid
    cash -= margin
    positions.push(pos)
    return pos
  }

  function closePosition(
    id: string,
    exitPrice: number,
    meta?: { exitTime?: number; exitReason?: ReplayExitReason },
  ): ClosedReplayTrade | null {
    const idx = positions.findIndex((p) => p.id === id)
    if (idx < 0) return null
    const pos = positions[idx]!
    const pnl = positionUnrealized(pos, exitPrice)
    if (pos.direction === 'long') {
      cash += pos.qty * exitPrice
    } else {
      cash -= pos.qty * exitPrice
      cash += pos.qty * pos.entryPrice * 0.05
    }
    realizedPnL += pnl
    positions.splice(idx, 1)
    const trade: ClosedReplayTrade = {
      tradeNum: closedTrades.length + 1,
      positionId: pos.id,
      direction: pos.direction,
      qty: pos.qty,
      entryPrice: pos.entryPrice,
      exitPrice,
      entryTime: pos.entryTime,
      exitTime: meta?.exitTime ?? Math.floor(Date.now() / 1000),
      pnl,
      exitReason: meta?.exitReason ?? 'manual',
    }
    closedTrades.push(trade)
    return trade
  }

  function setTakeProfit(id: string, tp: number | null) {
    const pos = positions.find((p) => p.id === id)
    if (pos) pos.takeProfit = tp
  }

  function setStopLoss(id: string, sl: number | null) {
    const pos = positions.find((p) => p.id === id)
    if (pos) pos.stopLoss = sl
  }

  /** Auto-close positions when price hits TP/SL on replay tick (only at/after entry bar). */
  function processExits(barTime: number, markPrice: number, bid: number, ask: number): ClosedReplayTrade[] {
    const closed: ClosedReplayTrade[] = []
    for (let i = positions.length - 1; i >= 0; i--) {
      const pos = positions[i]!
      if (barTime < pos.entryTime) continue
      let hit: 'tp' | 'sl' | null = null
      if (pos.direction === 'long') {
        if (pos.takeProfit != null && markPrice >= pos.takeProfit) hit = 'tp'
        else if (pos.stopLoss != null && markPrice <= pos.stopLoss) hit = 'sl'
      } else {
        if (pos.takeProfit != null && markPrice <= pos.takeProfit) hit = 'tp'
        else if (pos.stopLoss != null && markPrice >= pos.stopLoss) hit = 'sl'
      }
      if (!hit) continue
      const exit = pos.direction === 'long' ? bid : ask
      const reason: ReplayExitReason = hit === 'tp' ? 'take_profit' : 'stop_loss'
      const trade = closePosition(pos.id, exit, { exitTime: barTime, exitReason: reason })
      if (trade) closed.push(trade)
    }
    return closed
  }

  return {
    getPositions,
    getClosedTrades,
    getPersisted,
    resetAccount,
    summary,
    openLong,
    openShort,
    closePosition,
    setTakeProfit,
    setStopLoss,
    processExits,
  }
}
