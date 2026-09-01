export type PositionDirection = 'long' | 'short'

export type ReplayExitReason = 'manual' | 'take_profit' | 'stop_loss'

export type PendingOrderKind = 'limit' | 'stop'

export type TakeProfitTarget = {
  id: string
  price: number
  percent: number
  filled?: boolean
}

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
  takeProfitTargets?: TakeProfitTarget[]
  initialStopLoss?: number | null
  breakEvenTime?: number | null
  /**
   * Bar the level was placed on. The wick of that bar has already printed, so it must
   * not stop out / take profit a level the trader only just dragged into it.
   */
  stopLossSetTime?: number | null
  takeProfitSetTime?: number | null
  maxTakeProfit?: number
  contractSize?: number
  pipSize?: number
  marginRate?: number
  remainingMargin?: number
  marginAccounting?: boolean
  autoBreakEven?: boolean
}

export type PendingOrder = {
  id: string
  direction: PositionDirection
  kind: PendingOrderKind
  qty: number
  triggerPrice: number
  createdTime: number
  stopLoss?: number | null
  takeProfit?: number | null
  takeProfitTargets?: TakeProfitTarget[]
  contractSize?: number
  pipSize?: number
  marginRate?: number
  autoBreakEven?: boolean
}

export type ReplayJournalScreenshotAlign = 'left' | 'center' | 'right'

export type ReplayJournalScreenshot = {
  src: string
  caption: string
  align: ReplayJournalScreenshotAlign
  showCaption: boolean
}

export type ReplayJournalBlockType =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'toggle'
  | 'numbered-list'
  | 'bullet-list'
  | 'check-list'
  | 'code'
  | 'divider'
  | 'table'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'

export type ReplayJournalBlock = {
  id: string
  type: ReplayJournalBlockType
  text?: string
  level?: number
  checked?: boolean
  open?: boolean
  rows?: string[][]
  src?: string
  name?: string
  caption?: string
}

export type ReplayTradeJournal = {
  notes: string
  rating: string
  tags: string[]
  screenshots?: Array<string | ReplayJournalScreenshot>
  blocks?: ReplayJournalBlock[]
  updatedAt: number
}

export function normalizeJournalScreenshots(
  list?: Array<string | ReplayJournalScreenshot>,
): ReplayJournalScreenshot[] {
  return (list ?? []).flatMap((item) => {
    if (typeof item === 'string') {
      return item ? [{ src: item, caption: '', align: 'left' as const, showCaption: true }] : []
    }
    if (!item?.src) return []
    return [
      {
        src: item.src,
        caption: item.caption ?? '',
        align: item.align === 'center' || item.align === 'right' ? item.align : 'left',
        showCaption: item.showCaption !== false,
      },
    ]
  })
}

export function normalizeJournalBlocks(list?: ReplayJournalBlock[]): ReplayJournalBlock[] {
  if (!Array.isArray(list)) return []
  return list.flatMap((block) => {
    if (!block?.id || !block.type) return []
    const normalized: ReplayJournalBlock = {
      ...block,
      id: String(block.id),
      text: typeof block.text === 'string' ? block.text : '',
    }
    if (block.type === 'table') {
      const rows = Array.isArray(block.rows)
        ? block.rows
            .filter(Array.isArray)
            .map((row) => row.map((cell) => String(cell ?? '')))
            .filter((row) => row.length)
        : []
      normalized.rows = rows.length ? rows : [['', ''], ['', '']]
    }
    return [normalized]
  })
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

export type OpenPositionSetup = {
  stopLoss?: number | null
  takeProfit?: number | null
  takeProfitTargets?: TakeProfitTarget[]
  instrument?: { contractSize: number; pipSize: number; marginRate: number }
  autoBreakEven?: boolean
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
  const multiplier = pos.contractSize ?? 1
  if (pos.direction === 'long') return (markPrice - pos.entryPrice) * pos.qty * multiplier
  return (pos.entryPrice - markPrice) * pos.qty * multiplier
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
  const pipSize = pos.pipSize ?? 0.001
  return Math.round(raw / pipSize)
}

export function longOrderCost(
  qty: number,
  ask: number,
  contractSize = 1,
  marginRate = 1,
): number {
  const q = normalizeReplayQty(qty)
  return q * ask * contractSize * marginRate
}

export function shortOrderMargin(
  qty: number,
  bid: number,
  contractSize = 1,
  marginRate = 0.05,
): number {
  const q = normalizeReplayQty(qty)
  return q * bid * contractSize * marginRate
}

export function normalizeReplayQty(qty: number): number {
  if (!Number.isFinite(qty)) return 0.01
  return Math.max(0.01, Math.round(qty * 100) / 100)
}

function clonePositions(list: OpenPosition[]): OpenPosition[] {
  return list.map((p) => ({
    ...p,
    takeProfitTargets: (p.takeProfitTargets ?? []).map((target) => ({ ...target })),
    initialStopLoss: p.initialStopLoss ?? null,
    breakEvenTime: Number.isFinite(p.breakEvenTime) ? p.breakEvenTime : null,
    maxTakeProfit: Number.isFinite(p.maxTakeProfit) ? p.maxTakeProfit : p.entryPrice,
    initialQty: Number.isFinite(p.initialQty) ? p.initialQty : p.qty,
    realizedPnL: Number.isFinite(p.realizedPnL) ? p.realizedPnL : 0,
  }))
}

function cloneClosedTrades(list: ClosedReplayTrade[]): ClosedReplayTrade[] {
  return list.map((trade) => ({
    ...trade,
    journal: trade.journal
      ? {
          ...trade.journal,
          tags: [...trade.journal.tags],
          screenshots: normalizeJournalScreenshots(trade.journal.screenshots),
          blocks: normalizeJournalBlocks(trade.journal.blocks),
        }
      : undefined,
  }))
}

function clonePendingOrders(list: PendingOrder[]): PendingOrder[] {
  return list.map((order) => ({
    ...order,
    takeProfitTargets: (order.takeProfitTargets ?? []).map((target) => ({ ...target })),
  }))
}

export function createReplayAccount(
  initialCash: number,
  restored?: ReplayAccountPersisted | null,
  instrument?: { contractSize: number; pipSize: number; marginRate: number },
) {
  const defaultInstrument = instrument ?? { contractSize: 1, pipSize: 0.001, marginRate: 0.05 }
  let cash = restored?.cash ?? initialCash
  let realizedPnL = restored?.realizedPnL ?? 0
  const positions: OpenPosition[] = clonePositions(restored?.positions ?? [])
  const closedTrades: ClosedReplayTrade[] = cloneClosedTrades(restored?.closedTrades ?? [])
  const pendingOrders: PendingOrder[] = clonePendingOrders(restored?.pendingOrders ?? [])
  let nextId = restored?.nextId ?? 1
  let nextPendingId = restored?.nextPendingId ?? 1
  /** Last bar the replay clock reported — stamps levels set between bars. */
  let lastBarTime = 0

  function getPositions(): OpenPosition[] {
    return clonePositions(positions)
  }

  function getClosedTrades(): ClosedReplayTrade[] {
    return cloneClosedTrades(closedTrades)
  }

  function getPendingOrders(): PendingOrder[] {
    return clonePendingOrders(pendingOrders)
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
    const reservedMargin = positions.reduce(
      (sum, position) =>
        sum + (position.marginAccounting ? Math.max(0, position.remainingMargin ?? 0) : 0),
      0,
    )
    return {
      cash,
      realizedPnL,
      positions: clonePositions(positions),
      closedTrades: getClosedTrades(),
      pendingOrders: getPendingOrders(),
      unrealizedPnL,
      equity: cash + reservedMargin + unrealizedPnL,
    }
  }

  function openLong(
    qty: number,
    ask: number,
    time: number,
    setup: OpenPositionSetup = {},
  ): OpenPosition | null {
    const q = normalizeReplayQty(qty)
    const sizing = setup.instrument ?? defaultInstrument
    const marginAccounting = instrument != null || setup.instrument != null
    const cost = longOrderCost(
      q,
      ask,
      sizing.contractSize,
      marginAccounting ? sizing.marginRate : 1,
    )
    if (cost > cash) return null
    const pos: OpenPosition = {
      id: String(nextId++),
      direction: 'long',
      qty: q,
      initialQty: q,
      realizedPnL: 0,
      entryPrice: ask,
      entryTime: time,
      takeProfit: setup.takeProfit ?? null,
      stopLoss: setup.stopLoss ?? null,
      takeProfitTargets: (setup.takeProfitTargets ?? []).map((target) => ({ ...target })),
      initialStopLoss: setup.stopLoss ?? null,
      breakEvenTime: null,
      stopLossSetTime: setup.stopLoss != null ? time : null,
      takeProfitSetTime:
        setup.takeProfit != null || (setup.takeProfitTargets?.length ?? 0) > 0 ? time : null,
      maxTakeProfit: ask,
      contractSize: sizing.contractSize,
      pipSize: sizing.pipSize,
      marginRate: sizing.marginRate,
      remainingMargin: cost,
      marginAccounting,
      autoBreakEven: setup.autoBreakEven === true,
    }
    cash -= cost
    positions.push(pos)
    return pos
  }

  function openShort(
    qty: number,
    bid: number,
    time: number,
    setup: OpenPositionSetup = {},
  ): OpenPosition | null {
    const q = normalizeReplayQty(qty)
    const sizing = setup.instrument ?? defaultInstrument
    const marginAccounting = instrument != null || setup.instrument != null
    const margin = shortOrderMargin(q, bid, sizing.contractSize, sizing.marginRate)
    if (margin > cash) return null
    const pos: OpenPosition = {
      id: String(nextId++),
      direction: 'short',
      qty: q,
      initialQty: q,
      realizedPnL: 0,
      entryPrice: bid,
      entryTime: time,
      takeProfit: setup.takeProfit ?? null,
      stopLoss: setup.stopLoss ?? null,
      takeProfitTargets: (setup.takeProfitTargets ?? []).map((target) => ({ ...target })),
      initialStopLoss: setup.stopLoss ?? null,
      breakEvenTime: null,
      stopLossSetTime: setup.stopLoss != null ? time : null,
      takeProfitSetTime:
        setup.takeProfit != null || (setup.takeProfitTargets?.length ?? 0) > 0 ? time : null,
      maxTakeProfit: bid,
      contractSize: sizing.contractSize,
      pipSize: sizing.pipSize,
      marginRate: sizing.marginRate,
      remainingMargin: margin,
      marginAccounting,
      autoBreakEven: setup.autoBreakEven === true,
    }
    if (marginAccounting) cash -= margin
    else {
      cash += q * bid
      cash -= margin
    }
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
    const multiplier = pos.contractSize ?? 1
    const pnl =
      pos.direction === 'long'
        ? (exitPrice - pos.entryPrice) * qty * multiplier
        : (pos.entryPrice - exitPrice) * qty * multiplier
    if (pos.marginAccounting) {
      const marginBefore = Math.max(0, pos.remainingMargin ?? 0)
      const marginRelease = pos.qty > 0 ? marginBefore * (qty / pos.qty) : marginBefore
      cash += marginRelease + pnl
      pos.remainingMargin = Math.max(0, marginBefore - marginRelease)
    } else if (pos.direction === 'long') {
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
    if (!pos) return
    pos.takeProfit = tp
    pos.takeProfitTargets = []
    pos.takeProfitSetTime = tp == null ? null : Math.max(lastBarTime, pos.entryTime)
  }

  function setStopLoss(id: string, sl: number | null) {
    const pos = positions.find((p) => p.id === id)
    if (!pos) return
    pos.stopLoss = sl
    if (sl != null && pos.initialStopLoss == null) pos.initialStopLoss = sl
    pos.stopLossSetTime = sl == null ? null : Math.max(lastBarTime, pos.entryTime)
  }

  function setAutoBreakEven(id: string, enabled: boolean) {
    const pos = positions.find((p) => p.id === id)
    if (pos) pos.autoBreakEven = enabled
  }

  /** Attach or clear the bracket levels a working order carries into its fill. */
  function setPendingTakeProfit(id: string, tp: number | null): boolean {
    const order = pendingOrders.find((item) => item.id === id)
    if (!order) return false
    order.takeProfit = tp
    order.takeProfitTargets = []
    return true
  }

  function setPendingStopLoss(id: string, sl: number | null): boolean {
    const order = pendingOrders.find((item) => item.id === id)
    if (!order) return false
    order.stopLoss = sl
    if (sl == null) order.autoBreakEven = false
    return true
  }

  function updateTradeJournal(tradeNum: number, journal: ReplayTradeJournal): boolean {
    const trade = closedTrades.find((item) => item.tradeNum === tradeNum)
    if (!trade) return false
    trade.journal = {
      notes: journal.notes,
      rating: journal.rating,
      tags: [...journal.tags],
      screenshots: normalizeJournalScreenshots(journal.screenshots),
      blocks: normalizeJournalBlocks(journal.blocks),
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
    stopLoss?: number | null
    takeProfit?: number | null
    takeProfitTargets?: TakeProfitTarget[]
    instrument?: { contractSize: number; pipSize: number; marginRate: number }
    autoBreakEven?: boolean
  }): PendingOrder | null {
    const qty = normalizeReplayQty(input.qty)
    const orderInstrument = input.instrument ?? defaultInstrument
    if (!isValidPendingOrderPrice(input.direction, input.kind, input.triggerPrice, input.currentPrice)) {
      return null
    }
    const required =
      input.direction === 'long'
        ? longOrderCost(
            qty,
            input.triggerPrice,
            orderInstrument.contractSize,
            instrument || input.instrument ? orderInstrument.marginRate : 1,
          )
        : shortOrderMargin(
            qty,
            input.triggerPrice,
            orderInstrument.contractSize,
            orderInstrument.marginRate,
          )
    if (required > cash) return null
    const order: PendingOrder = {
      id: `pending-${nextPendingId++}`,
      direction: input.direction,
      kind: input.kind,
      qty,
      triggerPrice: input.triggerPrice,
      createdTime: input.createdTime,
      stopLoss: input.stopLoss ?? null,
      takeProfit: input.takeProfit ?? null,
      takeProfitTargets: (input.takeProfitTargets ?? []).map((target) => ({ ...target })),
      contractSize: orderInstrument.contractSize,
      pipSize: orderInstrument.pipSize,
      marginRate: orderInstrument.marginRate,
      autoBreakEven: input.autoBreakEven === true,
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
    if (Number.isFinite(barTime)) lastBarTime = barTime
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
      const setup: OpenPositionSetup = {
        stopLoss: order.stopLoss ?? null,
        takeProfit: order.takeProfit ?? null,
        takeProfitTargets: order.takeProfitTargets ?? [],
        autoBreakEven: order.autoBreakEven === true,
        instrument:
          instrument != null || order.contractSize != null
            ? {
                contractSize: order.contractSize ?? defaultInstrument.contractSize,
                pipSize: order.pipSize ?? defaultInstrument.pipSize,
                marginRate: order.marginRate ?? defaultInstrument.marginRate,
              }
            : undefined,
      }
      const pos =
        order.direction === 'long'
          ? openLong(order.qty, order.triggerPrice, barTime, setup)
          : openShort(order.qty, order.triggerPrice, barTime, setup)
      cancelPendingOrder(order.id)
      if (pos) filled.push(pos)
      else cancelled.push(order)
    }
    return { filled, cancelled }
  }

  /**
   * Move eligible stops to entry once price reaches 1R. If the same OHLC bar also
   * touches the original stop, leave it unchanged so the existing SL-first rule
   * remains deterministic.
   */
  function processBreakEven(
    barTime: number,
    range: { high: number; low: number },
  ): string[] {
    if (Number.isFinite(barTime)) lastBarTime = barTime
    if (!Number.isFinite(range.high) || !Number.isFinite(range.low)) return []
    const moved: string[] = []
    for (const pos of positions) {
      if (barTime < pos.entryTime) continue
      if (!pos.autoBreakEven) continue
      const initialStop = pos.initialStopLoss
      const currentStop = pos.stopLoss
      if (initialStop == null || currentStop == null || currentStop === pos.entryPrice) continue
      const risk = Math.abs(pos.entryPrice - initialStop)
      if (!(risk > 0)) continue

      const stopTouched =
        pos.direction === 'long' ? range.low <= currentStop : range.high >= currentStop
      if (stopTouched) continue
      const trigger =
        pos.direction === 'long' ? pos.entryPrice + risk : pos.entryPrice - risk
      const reached = pos.direction === 'long' ? range.high >= trigger : range.low <= trigger
      if (!reached) continue
      pos.stopLoss = pos.entryPrice
      pos.breakEvenTime = barTime
      moved.push(pos.id)
    }
    return moved
  }

  /** Auto-close when a bar's wick (high/low) or close tags TP/SL. Same-bar both: SL wins. */
  function processExits(
    barTime: number,
    markPrice: number,
    _bid: number,
    _ask: number,
    range?: { high: number; low: number },
  ): ClosedReplayTrade[] {
    if (Number.isFinite(barTime)) lastBarTime = barTime
    const high = Number.isFinite(range?.high) ? range!.high : markPrice
    const low = Number.isFinite(range?.low) ? range!.low : markPrice
    const closed: ClosedReplayTrade[] = []
    for (let i = positions.length - 1; i >= 0; i--) {
      const pos = positions[i]!
      if (barTime < pos.entryTime) continue
      // A level placed on this bar only reacts to price from here on: the bar's wick is
      // already history, so it must not retroactively hit a stop the trader just dragged.
      const slFresh = pos.stopLossSetTime != null && pos.stopLossSetTime >= barTime
      const tpFresh = pos.takeProfitSetTime != null && pos.takeProfitSetTime >= barTime
      const slLow = slFresh ? markPrice : low
      const slHigh = slFresh ? markPrice : high
      const tpLow = tpFresh ? markPrice : low
      const tpHigh = tpFresh ? markPrice : high
      let stopHit = false
      if (pos.direction === 'long') {
        if (
          pos.stopLoss != null &&
          pos.breakEvenTime !== barTime &&
          slLow <= pos.stopLoss
        ) {
          stopHit = true
        }
      } else {
        if (
          pos.stopLoss != null &&
          pos.breakEvenTime !== barTime &&
          slHigh >= pos.stopLoss
        ) {
          stopHit = true
        }
      }
      if (stopHit) {
        const trade = closePosition(pos.id, pos.stopLoss!, {
          exitTime: barTime,
          exitReason: 'stop_loss',
        })
        if (trade) closed.push(trade)
        continue
      }

      const targets = (pos.takeProfitTargets ?? [])
        .filter((target) => !target.filled)
        .sort((a, b) =>
          pos.direction === 'long' ? a.price - b.price : b.price - a.price,
        )
      if (targets.length) {
        for (const target of targets) {
          const touched =
            pos.direction === 'long' ? tpHigh >= target.price : tpLow <= target.price
          if (!touched || pos.qty <= 1e-9) continue
          target.filled = true
          const remainingTargets = (pos.takeProfitTargets ?? []).filter((item) => !item.filled)
          const originalQty = pos.initialQty ?? pos.qty
          const requested =
            remainingTargets.length === 0
              ? pos.qty
              : normalizeReplayQty((originalQty * target.percent) / 100)
          const trade = closePartialPosition(pos.id, Math.min(pos.qty, requested), target.price, {
            exitTime: barTime,
            exitReason: 'take_profit',
          })
          if (trade) closed.push(trade)
        }
        const nextTarget = (pos.takeProfitTargets ?? [])
          .filter((target) => !target.filled)
          .sort((a, b) =>
            pos.direction === 'long' ? a.price - b.price : b.price - a.price,
          )[0]
        pos.takeProfit = nextTarget?.price ?? null
        continue
      }

      const takeProfitHit =
        pos.takeProfit != null &&
        (pos.direction === 'long' ? tpHigh >= pos.takeProfit : tpLow <= pos.takeProfit)
      if (!takeProfitHit) continue
      const trade = closePosition(pos.id, pos.takeProfit!, {
        exitTime: barTime,
        exitReason: 'take_profit',
      })
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
    setAutoBreakEven,
    updateTradeJournal,
    updateExcursions,
    placePendingOrder,
    setPendingTakeProfit,
    setPendingStopLoss,
    cancelPendingOrder,
    processPendingFills,
    processBreakEven,
    processExits,
  }
}
