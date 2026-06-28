export type PositionDirection = 'long' | 'short'

export type OpenPosition = {
  id: string
  direction: PositionDirection
  qty: number
  entryPrice: number
  entryTime: number
  takeProfit: number | null
  stopLoss: number | null
}

export type ReplayAccountState = {
  cash: number
  realizedPnL: number
  positions: OpenPosition[]
}

export type ReplayAccountSummary = ReplayAccountState & {
  unrealizedPnL: number
  equity: number
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

export function createReplayAccount(initialCash: number) {
  let cash = initialCash
  let realizedPnL = 0
  const positions: OpenPosition[] = []
  let nextId = 1

  function getPositions(): OpenPosition[] {
    return positions.slice()
  }

  function summary(markPrice: number): ReplayAccountSummary {
    const unrealizedPnL = positions.reduce((a, p) => a + positionUnrealized(p, markPrice), 0)
    return {
      cash,
      realizedPnL,
      positions: positions.slice(),
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

  function closePosition(id: string, exitPrice: number): number | null {
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
    return pnl
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
  function processExits(barTime: number, markPrice: number, bid: number, ask: number): OpenPosition[] {
    const closed: OpenPosition[] = []
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
      closePosition(pos.id, exit)
      closed.push(pos)
    }
    return closed
  }

  return {
    getPositions,
    summary,
    openLong,
    openShort,
    closePosition,
    setTakeProfit,
    setStopLoss,
    processExits,
  }
}
