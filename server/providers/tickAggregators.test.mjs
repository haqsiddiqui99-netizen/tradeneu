/**
 * Unit tests for tick aggregators.
 * Run: node server/providers/tickAggregators.test.mjs
 */

import assert from 'node:assert/strict'
import {
  quoteTickMid,
  ticksToBars1m,
  ticksToBarsBySeconds,
  ticksToBarsByTickCount,
} from './tickAggregators.mjs'

const minuteMs = 60_000
const t0 = minuteMs * 28_500
const ticks = [
  { timeMs: t0, bid: 1.1, ask: 1.1002, bidVol: 1, askVol: 2 },
  { timeMs: t0 + 50, bid: 1.1001, ask: 1.1003, bidVol: 1, askVol: 1 },
  { timeMs: t0 + 100, bid: 1.1002, ask: 1.1004, bidVol: 2, askVol: 1 },
  { timeMs: t0 + minuteMs, bid: 1.2, ask: 1.2002, bidVol: 1, askVol: 1 },
]

assert.equal(quoteTickMid(ticks[0]), (1.1 + 1.1002) / 2)

const bars1s = ticksToBarsBySeconds(ticks, 1)
assert.equal(bars1s.length, 2)
assert.equal(bars1s[0].time, Math.floor(t0 / 1000))
assert.ok(bars1s[0].high >= bars1s[0].low)
assert.ok(bars1s[0].open <= bars1s[0].high)
assert.equal(bars1s[1].time, Math.floor((t0 + minuteMs) / 1000))

const bars1m = ticksToBars1m(ticks)
assert.equal(bars1m.length, 2)
assert.equal(bars1m[0].time, Math.floor(t0 / 1000))
assert.equal(bars1m[1].time, Math.floor((t0 + minuteMs) / 1000))

const bars10t = ticksToBarsByTickCount(ticks, 2)
assert.equal(bars10t.length, 2)
assert.equal(bars10t[0].volume, 5)
assert.equal(bars10t[1].time, Math.floor((t0 + minuteMs) / 1000))

console.log('tickAggregators.test.mjs: ok')
