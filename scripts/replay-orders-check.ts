import assert from 'node:assert/strict'
import {
  createReplayAccount,
  isValidPendingOrderPrice,
  type ReplayAccountPersisted,
} from '../src/replay/replayPositions'
import {
  applyScalperProtection,
  DEFAULT_SCALPER_MODE_PREFS,
  isScalperModeActive,
  normalizeScalperModePrefs,
  scalperProtectionPrices,
  type ReplayScalperModePrefs,
} from '../src/replay/replayScalperMode'
import {
  lotsForRiskAmount,
  priceDistanceInPips,
  priceFromPips,
  replayInstrumentSizing,
  riskAmountForLots,
} from '../src/replay/replayInstrumentSizing'

assert.equal(isValidPendingOrderPrice('long', 'limit', 99, 100), true)
assert.equal(isValidPendingOrderPrice('long', 'stop', 101, 100), true)
assert.equal(isValidPendingOrderPrice('short', 'limit', 101, 100), true)
assert.equal(isValidPendingOrderPrice('short', 'stop', 99, 100), true)
assert.equal(isValidPendingOrderPrice('long', 'limit', 101, 100), false)

const account = createReplayAccount(100_000)
const buyLimit = account.placePendingOrder({
  direction: 'long',
  kind: 'limit',
  qty: 2,
  triggerPrice: 99,
  currentPrice: 100,
  createdTime: 10,
})
assert.ok(buyLimit)
assert.equal(account.getPendingOrders().length, 1)

// A pending order cannot fill from the already-visible creation candle.
assert.equal(
  account.processPendingFills(10, 100, { high: 102, low: 98 }).filled.length,
  0,
)
const fill = account.processPendingFills(11, 99, { high: 100, low: 98.5 })
assert.equal(fill.filled.length, 1)
assert.equal(fill.filled[0]!.entryPrice, 99)
assert.equal(account.getPendingOrders().length, 0)

const position = account.getPositions()[0]!
account.setStopLoss(position.id, 98)
account.setStopLoss(position.id, 97.5)
account.updateExcursions(103, 98.5)
account.updateExcursions(102, 99)
const closed = account.closePosition(position.id, 102, {
  exitTime: 12,
  exitReason: 'manual',
})
assert.ok(closed)
assert.equal(closed.initialStopLoss, 98)
assert.equal(closed.maxTakeProfit, 103)
assert.equal(closed.maxRiskReward, 4)
assert.equal(
  account.updateTradeJournal(closed.tradeNum, {
    notes: 'Followed the plan.',
    rating: '4',
    tags: ['breakout'],
    updatedAt: 123,
  }),
  true,
)
assert.deepEqual(account.getPersisted().closedTrades[0]!.journal, {
  notes: 'Followed the plan.',
  rating: '4',
  tags: ['breakout'],
  screenshots: [],
  blocks: [],
  updatedAt: 123,
})

const sellStop = account.placePendingOrder({
  direction: 'short',
  kind: 'stop',
  qty: 1,
  triggerPrice: 97,
  currentPrice: 100,
  createdTime: 20,
})
assert.ok(sellStop)
assert.equal(account.cancelPendingOrder(sellStop.id), true)
assert.equal(account.cancelPendingOrder(sellStop.id), false)

const partialAccount = createReplayAccount(10_000)
const partialPosition = partialAccount.openLong(4, 100, 1)!
const firstPartial = partialAccount.closePartialPosition(partialPosition.id, 1, 110, {
  exitTime: 2,
  exitReason: 'manual',
})
assert.equal(firstPartial?.qty, 1)
assert.equal(firstPartial?.pnl, 10)
assert.equal(partialAccount.getPositions()[0]!.qty, 3)
assert.equal(partialAccount.getPositions()[0]!.initialQty, 4)
assert.equal(partialAccount.getPositions()[0]!.realizedPnL, 10)
partialAccount.closePosition(partialPosition.id, 90, { exitTime: 3, exitReason: 'manual' })
assert.equal(partialAccount.getPositions().length, 0)
assert.equal(partialAccount.getClosedTrades().length, 2)

// Old snapshots without Phase 2/3 fields restore with safe defaults.
const legacy: ReplayAccountPersisted = {
  cash: 1_000,
  realizedPnL: 0,
  positions: [
    {
      id: '1',
      direction: 'long',
      qty: 1,
      entryPrice: 100,
      entryTime: 1,
      takeProfit: null,
      stopLoss: null,
    },
  ],
  closedTrades: [],
  nextId: 2,
}
const restored = createReplayAccount(1_000, legacy)
assert.deepEqual(restored.getPendingOrders(), [])
assert.equal(restored.getPositions()[0]!.maxTakeProfit, 100)
assert.equal(restored.getPositions()[0]!.initialStopLoss, null)

const disabledScalper = normalizeScalperModePrefs(null)
assert.deepEqual(disabledScalper, DEFAULT_SCALPER_MODE_PREFS)
assert.equal(isScalperModeActive(disabledScalper), false)
assert.deepEqual(scalperProtectionPrices(100, 'long', disabledScalper), {
  stopLoss: null,
  takeProfit: null,
})

const percentScalper: ReplayScalperModePrefs = {
  version: 1,
  stopLoss: { enabled: true, value: 0.5, unit: 'percent' },
  takeProfit: { enabled: true, value: 1, unit: 'percent' },
  autoBreakEven: true,
}
assert.deepEqual(scalperProtectionPrices(100, 'long', percentScalper), {
  stopLoss: 99.5,
  takeProfit: 101,
})
assert.deepEqual(scalperProtectionPrices(100, 'short', percentScalper), {
  stopLoss: 100.5,
  takeProfit: 99,
})

const pipsScalper: ReplayScalperModePrefs = {
  version: 1,
  stopLoss: { enabled: true, value: 10, unit: 'pips' },
  takeProfit: { enabled: true, value: 20, unit: 'pips' },
  autoBreakEven: false,
}
assert.deepEqual(scalperProtectionPrices(100, 'long', pipsScalper), {
  stopLoss: 99.99,
  takeProfit: 100.02,
})

const scalperAccount = createReplayAccount(10_000)
const scalperLong = scalperAccount.openLong(1, 100, 1)!
assert.equal(applyScalperProtection(scalperLong, percentScalper, scalperAccount), true)
assert.equal(scalperAccount.getPositions()[0]!.stopLoss, 99.5)
assert.equal(scalperAccount.getPositions()[0]!.takeProfit, 101)
assert.equal(scalperAccount.getPositions()[0]!.initialStopLoss, 99.5)
assert.deepEqual(scalperAccount.processBreakEven(2, { high: 100.49, low: 99.8 }), [])
assert.deepEqual(scalperAccount.processBreakEven(3, { high: 100.5, low: 99.8 }), [
  scalperLong.id,
])
assert.equal(scalperAccount.getPositions()[0]!.stopLoss, 100)
assert.equal(scalperAccount.getPositions()[0]!.initialStopLoss, 99.5)
assert.deepEqual(
  scalperAccount.processExits(3, 100.2, 100.19, 100.21, {
    high: 100.5,
    low: 99.8,
  }),
  [],
)
assert.deepEqual(scalperAccount.processBreakEven(4, { high: 101, low: 100 }), [])
assert.equal(
  scalperAccount.processExits(4, 100, 99.99, 100.01, { high: 100.2, low: 99.9 })[0]!
    .exitPrice,
  100,
)

// Preserve SL-first OHLC ambiguity: if the same bar touches the stop and 1R,
// break-even must not hide the original stop-out.
const ambiguousAccount = createReplayAccount(10_000)
const ambiguousLong = ambiguousAccount.openLong(1, 100, 1)!
applyScalperProtection(ambiguousLong, percentScalper, ambiguousAccount)
assert.deepEqual(ambiguousAccount.processBreakEven(2, { high: 100.6, low: 99.4 }), [])
assert.equal(ambiguousAccount.getPositions()[0]!.stopLoss, 99.5)

// Pending fills receive the exact same protection through the returned positions.
const pendingScalperAccount = createReplayAccount(10_000)
pendingScalperAccount.placePendingOrder({
  direction: 'short',
  kind: 'limit',
  qty: 1,
  triggerPrice: 101,
  currentPrice: 100,
  createdTime: 1,
})
const pendingScalperFill = pendingScalperAccount.processPendingFills(2, 101, {
  high: 101,
  low: 100,
})
assert.equal(pendingScalperFill.filled.length, 1)
applyScalperProtection(pendingScalperFill.filled[0]!, percentScalper, pendingScalperAccount)
assert.equal(pendingScalperAccount.getPositions()[0]!.stopLoss, 101.505)
assert.equal(pendingScalperAccount.getPositions()[0]!.takeProfit, 99.99)

const goldSizing = replayInstrumentSizing('XAUUSD')
assert.deepEqual(goldSizing, { contractSize: 100, pipSize: 0.01, marginRate: 0.05 })
assert.equal(priceDistanceInPips(3_700, 3_699.5, goldSizing), 50)
assert.equal(priceFromPips(3_700, 50, 'long', 'stopLoss', goldSizing), 3_699.5)
assert.equal(riskAmountForLots(0.5, 3_700, 3_690, goldSizing), 500)
assert.equal(lotsForRiskAmount(500, 3_700, 3_690, goldSizing), 0.5)

// Decimal lots use instrument margin while equity includes reserved margin.
const marginAccount = createReplayAccount(100_000, null, goldSizing)
const decimalLong = marginAccount.openLong(0.5, 3_700, 1, { instrument: goldSizing })!
assert.equal(decimalLong.qty, 0.5)
assert.equal(marginAccount.summary(3_700).equity, 100_000)
assert.equal(marginAccount.summary(3_701).unrealizedPnL, 50)
const marginClosed = marginAccount.closePosition(decimalLong.id, 3_701, {
  exitTime: 2,
  exitReason: 'manual',
})!
assert.equal(marginClosed.pnl, 50)
assert.equal(marginAccount.summary(3_701).equity, 100_050)

// Pending bracket data survives persistence and transfers to the filled position.
const bracketAccount = createReplayAccount(100_000, null, goldSizing)
const bracketOrder = bracketAccount.placePendingOrder({
  direction: 'long',
  kind: 'limit',
  qty: 1,
  triggerPrice: 100,
  currentPrice: 101,
  createdTime: 1,
  stopLoss: 98,
  takeProfit: 102,
  autoBreakEven: true,
  instrument: goldSizing,
  takeProfitTargets: [
    { id: 'tp-1', price: 102, percent: 50 },
    { id: 'tp-2', price: 104, percent: 50 },
  ],
})!
assert.equal(bracketOrder.stopLoss, 98)
assert.equal(bracketAccount.getPersisted().pendingOrders![0]!.takeProfitTargets!.length, 2)
const bracketFill = bracketAccount.processPendingFills(2, 100, { high: 100.5, low: 99.5 })
assert.equal(bracketFill.filled.length, 1)
assert.equal(bracketFill.filled[0]!.stopLoss, 98)
assert.equal(bracketFill.filled[0]!.autoBreakEven, true)

// A wick through both targets closes 50% at each configured level.
const targetTrades = bracketAccount.processExits(3, 104, 103.99, 104.01, {
  high: 104.5,
  low: 99,
})
assert.equal(targetTrades.length, 2)
assert.equal(targetTrades[0]!.qty, 0.5)
assert.equal(targetTrades[0]!.exitPrice, 102)
assert.equal(targetTrades[1]!.qty, 0.5)
assert.equal(targetTrades[1]!.exitPrice, 104)
assert.equal(bracketAccount.getPositions().length, 0)

// SL remains first priority when an ambiguous bar touches SL and partial targets.
const slFirstAccount = createReplayAccount(100_000, null, goldSizing)
const slFirst = slFirstAccount.openLong(1, 100, 1, {
  instrument: goldSizing,
  stopLoss: 98,
  takeProfit: 102,
  takeProfitTargets: [
    { id: 'tp-1', price: 102, percent: 50 },
    { id: 'tp-2', price: 104, percent: 50 },
  ],
})!
const slFirstTrades = slFirstAccount.processExits(2, 100, 99.99, 100.01, {
  high: 105,
  low: 97,
})
assert.equal(slFirstTrades.length, 1)
assert.equal(slFirstTrades[0]!.positionId, slFirst.id)
assert.equal(slFirstTrades[0]!.exitReason, 'stop_loss')
assert.equal(slFirstTrades[0]!.exitPrice, 98)

// Manual partials reduce remaining quantity; configured targets cap safely at what remains.
const mixedExitAccount = createReplayAccount(100_000, null, goldSizing)
const mixed = mixedExitAccount.openLong(1, 100, 1, {
  instrument: goldSizing,
  takeProfit: 102,
  takeProfitTargets: [
    { id: 'tp-1', price: 102, percent: 50 },
    { id: 'tp-2', price: 104, percent: 50 },
  ],
})!
mixedExitAccount.closePartialPosition(mixed.id, 0.25, 101, {
  exitTime: 2,
  exitReason: 'manual',
})
const mixedTargets = mixedExitAccount.processExits(3, 104, 103.99, 104.01, {
  high: 104,
  low: 101,
})
assert.equal(mixedTargets.length, 2)
assert.equal(mixedTargets[0]!.qty, 0.5)
assert.equal(mixedTargets[1]!.qty, 0.25)
assert.equal(mixedExitAccount.getPositions().length, 0)

// Levels dragged onto a working order persist and carry through to the filled position.
const dragAccount = createReplayAccount(100_000, null, goldSizing)
const dragOrder = dragAccount.placePendingOrder({
  direction: 'long',
  kind: 'limit',
  qty: 1,
  triggerPrice: 100,
  currentPrice: 101,
  createdTime: 1,
  instrument: goldSizing,
  takeProfitTargets: [
    { id: 'tp-1', price: 102, percent: 50 },
    { id: 'tp-2', price: 104, percent: 50 },
  ],
})!
assert.equal(dragOrder.stopLoss, null)
assert.equal(dragAccount.setPendingStopLoss(dragOrder.id, 98), true)
assert.equal(dragAccount.setPendingTakeProfit(dragOrder.id, 103), true)
assert.equal(dragAccount.getPendingOrders()[0]!.stopLoss, 98)
// Dragging a single target replaces any partial ladder the ticket was carrying.
assert.equal(dragAccount.getPendingOrders()[0]!.takeProfitTargets!.length, 0)
assert.equal(dragAccount.getPersisted().pendingOrders![0]!.takeProfit, 103)
assert.equal(dragAccount.setPendingStopLoss('missing-id', 98), false)

const dragFill = dragAccount.processPendingFills(2, 100, { high: 100.5, low: 99.5 })
assert.equal(dragFill.filled[0]!.stopLoss, 98)
assert.equal(dragFill.filled[0]!.takeProfit, 103)

// Clearing a stop also drops auto break-even, which has nothing left to move.
const clearAccount = createReplayAccount(100_000, null, goldSizing)
const clearOrder = clearAccount.placePendingOrder({
  direction: 'short',
  kind: 'limit',
  qty: 1,
  triggerPrice: 101,
  currentPrice: 100,
  createdTime: 1,
  stopLoss: 103,
  autoBreakEven: true,
  instrument: goldSizing,
})!
assert.equal(clearAccount.setPendingStopLoss(clearOrder.id, null), true)
assert.equal(clearAccount.getPendingOrders()[0]!.stopLoss, null)
assert.equal(clearAccount.getPendingOrders()[0]!.autoBreakEven, false)

// A level dropped on the bar currently on screen only reacts to later price action:
// that bar's wick has already printed and must not stop the trade out retroactively.
const freshLevelAccount = createReplayAccount(100_000, null, goldSizing)
const freshLong = freshLevelAccount.openLong(1, 100, 1, { instrument: goldSizing })!
const wickBar = { high: 101, low: 97 }
assert.equal(freshLevelAccount.processExits(2, 100, 99.99, 100.01, wickBar).length, 0)
freshLevelAccount.setStopLoss(freshLong.id, 99)
assert.equal(freshLevelAccount.processExits(2, 100, 99.99, 100.01, wickBar).length, 0)
const freshStopTrades = freshLevelAccount.processExits(3, 99.5, 99.49, 99.51, {
  high: 100,
  low: 98.9,
})
assert.equal(freshStopTrades.length, 1)
assert.equal(freshStopTrades[0]!.exitReason, 'stop_loss')
assert.equal(freshStopTrades[0]!.exitPrice, 99)

// Same rule for a market entry whose own candle already wicked past the attached stop.
const entryBarAccount = createReplayAccount(100_000, null, goldSizing)
const entryBarLong = entryBarAccount.openLong(1, 100, 5, {
  instrument: goldSizing,
  stopLoss: 99,
})!
assert.equal(
  entryBarAccount.processExits(5, 100, 99.99, 100.01, { high: 100.5, low: 98 }).length,
  0,
)
const entryBarTrades = entryBarAccount.processExits(6, 99, 98.99, 99.01, {
  high: 100,
  low: 98.5,
})
assert.equal(entryBarTrades.length, 1)
assert.equal(entryBarTrades[0]!.positionId, entryBarLong.id)
assert.equal(entryBarTrades[0]!.exitPrice, 99)

console.log('Replay pending-order and excursion checks passed.')
