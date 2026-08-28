import assert from 'node:assert/strict'
import {
  createReplayAccount,
  isValidPendingOrderPrice,
  type ReplayAccountPersisted,
} from '../src/replay/replayPositions'

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

console.log('Replay pending-order and excursion checks passed.')
