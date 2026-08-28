export type PositionDirection = 'long' | 'short'

export type ReplayExitReason = 'manual' | 'take_profit' | 'stop_loss'

export type PendingOrderKind = 'limit' | 'stop'

export type OpenPosition = {
  id: string
  direction: PositionDirection
  qty: number
  initialQty?: number
  realizedPnL?: number
  entryPrice: number
  entryTime: number
  takeProfit: number | null
  stopLoss: number | null
  initialStopLoss?: number | null
  maxTakeProfit?: number
}

export type PendingOrder = {
  id: string
  direction: PositionDirection
  kind: PendingOrderKind
  qty: number
  triggerPrice: number
  createdTime: number
}

export type ReplayTradeJournal = {
  notes: string
  rating: string
  tags: string[]
  updatedAt: number
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
  initialStopLoss?: number | null
  maxTakeProfit?: number
  maxRiskReward?: number | null
  journal?: ReplayTradeJournal
}

export type ReplayAccountState = {
  cash: number
  realizedPnL: number
  positions: OpenPosition[]
  closedTrades: ClosedReplayTrade[]
  pendingOrders: PendingOrder[]
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
  pendingOrders?: PendingOrder[]
  nextPendingId?: number
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

export type ReplayExitPriceKind = 'take_profit' | 'stop_loss'

export function isValidReplayExitPrice(
  direction: PositionDirection,
  kind: ReplayExitPriceKind,
  price: number,
  currentPrice: number,
): boolean {
  if (!Number.isFinite(price) || !Number.isFinite(currentPrice)) return false
  if (direction === 'long') {
    return kind === 'take_profit' ? price > currentPrice : price < currentPrice
  }
  return kind === 'take_profit' ? price < currentPrice : price > currentPrice
}

export function isValidPendingOrderPrice(
  direction: PositionDirection,
  kind: PendingOrderKind,
  price: number,
  currentPrice: number,
): boolean {
  if (!Number.isFinite(price) || !Number.isFinite(currentPrice)) return false
  if (direction === 'long') return kind === 'limit' ? price < currentPrice : price > currentPrice
  return kind === 'limit' ? price > currentPrice : price < currentPrice
}

export function positionUnrealized(pos: OpenPosition, markPrice: number): number {
  if (pos.direction === 'long') return (markPrice - pos.entryPrice) * pos.qty
  return (pos.entryPrice - markPrice) * pos.qty
}

/**
 * Mark-to-market price (FXReplay-style):
 * long → bid, short → ask. Using the same mid/close for fill AND mark always
 * yields 0 points at entry; opposite-side quotes produce the non-zero points chip.
 */
export function positionMarkPrice(
  direction: PositionDirection,
  bid: number,
  ask: number,
): number {
  return direction === 'long' ? bid : ask
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
  return list.map((p) => ({
    ...p,
    initialStopLoss: p.initialStopLoss ?? null,
    maxTakeProfit: Number.isFinite(p.maxTakeProfit) ? p.maxTakeProfit : p.entryPrice,
    initialQty: Number.isFinite(p.initialQty) ? p.initialQty : p.qty,
    realizedPnL: Number.isFinite(p.realizedPnL) ? p.realizedPnL : 0,
  }))
}

function cloneClosedTrades(list: ClosedReplayTrade[]): ClosedReplayTrade[] {
  return list.map((trade) => ({
    ...trade,
    journal: trade.journal ? { ...trade.journal, tags: [...trade.journal.tags] } : undefined,
  }))
}

export function createReplayAccount(initialCash: number, restored?: ReplayAccountPersisted | null) {
  let cash = restored?.cash ?? initialCash
  let realizedPnL = restored?.realizedPnL ?? 0
  const positions: OpenPosition[] = clonePositions(restored?.positions ?? [])
  const closedTrades: ClosedReplayTrade[] = cloneClosedTrades(restored?.closedTrades ?? [])
  const pendingOrders: PendingOrder[] = (restored?.pendingOrders ?? []).map((order) => ({ ...order }))
  let nextId = restored?.nextId ?? 1
  let nextPendingId = restored?.nextPendingId ?? 1

  function getPositions(): OpenPosition[] {
    return clonePositions(positions)
  }

  function getClosedTrades(): ClosedReplayTrade[] {
    return cloneClosedTrades(closedTrades)
  }

  function getPendingOrders(): PendingOrder[] {
    return pendingOrders.map((order) => ({ ...order }))
  }

  function getPersisted(): ReplayAccountPersisted {
    return {
      cash,
      realizedPnL,
      positions: clonePositions(positions),
      closedTrades: getClosedTrades(),
      nextId,
      pendingOrders: getPendingOrders(),
      nextPendingId,
    }
  }

  function resetAccount() {
    cash = initialCash
    realizedPnL = 0
    positions.length = 0
    closedTrades.length = 0
    pendingOrders.length = 0
    nextId = 1
    nextPendingId = 1
  }

  function summary(markPrice: number, bidAsk?: { bid: number; ask: number }): ReplayAccountSummary {
    const unrealizedPnL = positions.reduce((a, p) => {
      const mark = bidAsk ? positionMarkPrice(p.direction, bidAsk.bid, bidAsk.ask) : markPrice
      return a + positionUnrealized(p, mark)
    }, 0)
    return {
      cash,
      realizedPnL,
      positions: clonePositions(positions),
      closedTrades: getClosedTrades(),
      pendingOrders: getPendingOrders(),
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
      initialQty: q,
      realizedPnL: 0,
      entryPrice: ask,
      entryTime: time,
      takeProfit: null,
      stopLoss: null,
      initialStopLoss: null,
      maxTakeProfit: ask,
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
      initialQty: q,
      realizedPnL: 0,
      entryPrice: bid,
      entryTime: time,
      takeProfit: null,
      stopLoss: null,
      initialStopLoss: null,
      maxTakeProfit: bid,
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
    const pos = positions.find((item) => item.id === id)
    if (!pos) return null
    return closePartialPosition(id, pos.qty, exitPrice, meta)
  }

  function closePartialPosition(
    id: string,
    closeQty: number,
    exitPrice: number,
    meta?: { exitTime?: number; exitReason?: ReplayExitReason },
  ): ClosedReplayTrade | null {
    const idx = positions.findIndex((p) => p.id === id)
    if (idx < 0) return null
    const pos = positions[idx]!
    const qty = Math.min(pos.qty, Math.max(0, closeQty))
    if (!(qty > 0) || !Number.isFinite(qty)) return null
    const pnl =
      pos.direction === 'long'
        ? (exitPrice - pos.entryPrice) * qty
        : (pos.entryPrice - exitPrice) * qty
    if (pos.direction === 'long') {
      cash += qty * exitPrice
    } else {
      cash -= qty * exitPrice
      cash += qty * pos.entryPrice * 0.05
    }
    realizedPnL += pnl
    pos.realizedPnL = (pos.realizedPnL ?? 0) + pnl
    pos.qty = Math.max(0, pos.qty - qty)
    if (pos.qty <= 1e-9) positions.splice(idx, 1)
    const trade: ClosedReplayTrade = {
      tradeNum: closedTrades.length + 1,
      positionId: pos.id,
      direction: pos.direction,
      qty,
      entryPrice: pos.entryPrice,
      exitPrice,
      entryTime: pos.entryTime,
      exitTime: meta?.exitTime ?? Math.floor(Date.now() / 1000),
      pnl,
      exitReason: meta?.exitReason ?? 'manual',
      initialStopLoss: pos.initialStopLoss ?? null,
      maxTakeProfit: pos.maxTakeProfit ?? pos.entryPrice,
      maxRiskReward: maxRiskReward(pos),
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
    if (!pos) return
    pos.stopLoss = sl
    if (sl != null && pos.initialStopLoss == null) pos.initialStopLoss = sl
  }

  function updateTradeJournal(tradeNum: number, journal: ReplayTradeJournal): boolean {
    const trade = closedTrades.find((item) => item.tradeNum === tradeNum)
    if (!trade) return false
    trade.journal = {
      notes: journal.notes,
      rating: journal.rating,
      tags: [...journal.tags],
      updatedAt: journal.updatedAt,
    }
    return true
  }

  function maxRiskReward(pos: OpenPosition): number | null {
    const sl = pos.initialStopLoss
    if (sl == null) return null
    const risk = Math.abs(pos.entryPrice - sl)
    if (!(risk > 0)) return null
    const best = pos.maxTakeProfit ?? pos.entryPrice
    const favorable =
      pos.direction === 'long' ? Math.max(0, best - pos.entryPrice) : Math.max(0, pos.entryPrice - best)
    return favorable / risk
  }

  function updateExcursions(high: number, low: number) {
    if (!Number.isFinite(high) || !Number.isFinite(low)) return
    for (const pos of positions) {
      const current = pos.maxTakeProfit ?? pos.entryPrice
      pos.maxTakeProfit = pos.direction === 'long' ? Math.max(current, high) : Math.min(current, low)
    }
  }

  function placePendingOrder(input: {
    direction: PositionDirection
    kind: PendingOrderKind
    qty: number
    triggerPrice: number
    currentPrice: number
    createdTime: number
  }): PendingOrder | null {
    const qty = Math.max(1, Math.floor(input.qty))
    if (!isValidPendingOrderPrice(input.direction, input.kind, input.triggerPrice, input.currentPrice)) {
      return null
    }
    const required =
      input.direction === 'long'
        ? longOrderCost(qty, input.triggerPrice)
        : shortOrderMargin(qty, input.triggerPrice)
    if (required > cash) return null
    const order: PendingOrder = {
      id: `pending-${nextPendingId++}`,
      direction: input.direction,
      kind: input.kind,
      qty,
      triggerPrice: input.triggerPrice,
      createdTime: input.createdTime,
    }
    pendingOrders.push(order)
    return { ...order }
  }

  function cancelPendingOrder(id: string): boolean {
    const idx = pendingOrders.findIndex((order) => order.id === id)
    if (idx < 0) return false
    pendingOrders.splice(idx, 1)
    return true
  }

  function processPendingFills(
    barTime: number,
    markPrice: number,
    range?: { high: number; low: number },
  ): { filled: OpenPosition[]; cancelled: PendingOrder[] } {
    const high = Number.isFinite(range?.high) ? range!.high : markPrice
    const low = Number.isFinite(range?.low) ? range!.low : markPrice
    const filled: OpenPosition[] = []
    const cancelled: PendingOrder[] = []
    for (const order of [...pendingOrders]) {
      if (barTime <= order.createdTime) continue
      const touched =
        order.direction === 'long'
          ? order.kind === 'limit'
            ? low <= order.triggerPrice
            : high >= order.triggerPrice
          : order.kind === 'limit'
            ? high >= order.triggerPrice
            : low <= order.triggerPrice
      if (!touched) continue
      const pos =
        order.direction === 'long'
          ? openLong(order.qty, order.triggerPrice, barTime)
          : openShort(order.qty, order.triggerPrice, barTime)
      cancelPendingOrder(order.id)
      if (pos) filled.push(pos)
      else cancelled.push(order)
    }
    return { filled, cancelled }
  }

  /** Auto-close when a bar's wick (high/low) or close tags TP/SL. Same-bar both: SL wins. */
  function processExits(
    barTime: number,
    markPrice: number,
    bid: number,
    ask: number,
    range?: { high: number; low: number },
  ): ClosedReplayTrade[] {
    const high = Number.isFinite(range?.high) ? range!.high : markPrice
    const low = Number.isFinite(range?.low) ? range!.low : markPrice
    const closed: ClosedReplayTrade[] = []
    for (let i = positions.length - 1; i >= 0; i--) {
      const pos = positions[i]!
      if (barTime < pos.entryTime) continue
      let hit: 'tp' | 'sl' | null = null
      let fill = pos.direction === 'long' ? bid : ask
      if (pos.direction === 'long') {
        if (pos.stopLoss != null && low <= pos.stopLoss) {
          hit = 'sl'
          fill = pos.stopLoss
        } else if (pos.takeProfit != null && high >= pos.takeProfit) {
          hit = 'tp'
          fill = pos.takeProfit
        }
      } else {
        if (pos.stopLoss != null && high >= pos.stopLoss) {
          hit = 'sl'
          fill = pos.stopLoss
        } else if (pos.takeProfit != null && low <= pos.takeProfit) {
          hit = 'tp'
          fill = pos.takeProfit
        }
      }
      if (!hit) continue
      const reason: ReplayExitReason = hit === 'tp' ? 'take_profit' : 'stop_loss'
      const trade = closePosition(pos.id, fill, { exitTime: barTime, exitReason: reason })
      if (trade) closed.push(trade)
    }
    return closed
  }

  return {
    getPositions,
    getClosedTrades,
    getPendingOrders,
    getPersisted,
    resetAccount,
    summary,
    openLong,
    openShort,
    closePosition,
    closePartialPosition,
    setTakeProfit,
    setStopLoss,
    updateTradeJournal,
    updateExcursions,
    placePendingOrder,
    cancelPendingOrder,
    processPendingFills,
    processExits,
  }
}
