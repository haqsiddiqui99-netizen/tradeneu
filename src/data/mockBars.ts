import type { UTCTimestamp } from 'lightweight-charts'
import type { Bar } from '../types'

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function minuteSeriesStartSec(count: number, anchorStartSec?: number): number {
  if (anchorStartSec != null && Number.isFinite(anchorStartSec)) {
    return Math.floor(anchorStartSec)
  }
  return Math.floor((Date.now() - count * 60 * 1000) / 1000)
}

/** Deterministic synthetic hourly bars; `seed` varies path per symbol/session. */
export function generateMockHourlyBars(count: number, seed = 42): Bar[] {
  const rand = mulberry32(seed)
  const bars: Bar[] = []
  let price = 0.86 + rand() * 0.04
  const startSec = Math.floor(new Date('2024-11-15T14:30:00Z').getTime() / 1000) as UTCTimestamp

  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.48) * 0.0015
    const open = price
    const vol = Math.floor(80_000 + rand() * 420_000)
    const range = 0.0008 + rand() * 0.0025
    const body = drift + (rand() - 0.5) * 0.0012
    const close = open + body
    const high = Math.max(open, close) + rand() * range
    const low = Math.min(open, close) - rand() * range
    const time = (startSec + i * 3600) as UTCTimestamp
    bars.push({
      time,
      open: +open.toFixed(5),
      high: +high.toFixed(5),
      low: +low.toFixed(5),
      close: +close.toFixed(5),
      volume: vol,
    })
    price = close
  }
  return bars
}

/** Deterministic synthetic 1m FX-style bars; `seed` varies path per symbol/session. */
export function generateMockMinuteBars(count: number, seed = 42, anchorStartSec?: number): Bar[] {
  const rand = mulberry32(seed)
  const bars: Bar[] = []
  let price = 0.86 + rand() * 0.04
  const startSec = minuteSeriesStartSec(count, anchorStartSec) as UTCTimestamp

  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.48) * 0.00005
    const open = price
    const vol = Math.floor(500 + rand() * 8_000)
    const range = 0.00003 + rand() * 0.00012
    const body = drift + (rand() - 0.5) * 0.00006
    const close = open + body
    const high = Math.max(open, close) + rand() * range
    const low = Math.min(open, close) - rand() * range
    const time = (startSec + i * 60) as UTCTimestamp
    bars.push({
      time,
      open: +open.toFixed(5),
      high: +high.toFixed(5),
      low: +low.toFixed(5),
      close: +close.toFixed(5),
      volume: vol,
    })
    price = close
  }
  return bars
}

/** Spot gold–like levels (~$2,600–2,700) and wider hourly ranges; browser-only demo series. */
/** Minute BTC-shaped demo when live data is offline; aligns with 1m chart chrome (not real data). */
export function generateBtcUsdDemoMinuteBars(count: number, seed = 42, anchorStartSec?: number): Bar[] {
  const rand = mulberry32(seed)
  const bars: Bar[] = []
  let price = 92_000 + rand() * 8_000
  const startSec = minuteSeriesStartSec(count, anchorStartSec) as UTCTimestamp

  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.5) * 18
    const open = price
    const vol = Math.floor(1 + rand() * 120)
    const range = 4 + rand() * 28
    const body = drift + (rand() - 0.5) * 14
    const close = open + body
    const high = Math.max(open, close) + rand() * range
    const low = Math.min(open, close) - rand() * range
    const time = (startSec + i * 60) as UTCTimestamp
    bars.push({
      time,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: vol,
    })
    price = close
  }
  return bars
}

/** Hourly BTC-shaped demo (~$90k–100k) when live data is offline; not real market data. */
export function generateBtcUsdDemoHourlyBars(count: number, seed = 42): Bar[] {
  const rand = mulberry32(seed)
  const bars: Bar[] = []
  let price = 92_000 + rand() * 8_000
  const endMs = Date.now()
  const startSec = Math.floor((endMs - count * 3600 * 1000) / 1000) as UTCTimestamp

  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.5) * 420
    const open = price
    const vol = Math.floor(200 + rand() * 8_000)
    const range = 180 + rand() * 900
    const body = drift + (rand() - 0.5) * 380
    const close = open + body
    const high = Math.max(open, close) + rand() * range
    const low = Math.min(open, close) - rand() * range
    const time = (startSec + i * 3600) as UTCTimestamp
    bars.push({
      time,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: vol,
    })
    price = close
  }
  return bars
}

export function generateGoldSpotHourlyBars(count: number, seed = 42): Bar[] {
  const rand = mulberry32(seed)
  const bars: Bar[] = []
  let price = 2640 + rand() * 45
  const startSec = Math.floor(new Date('2024-09-03T08:00:00Z').getTime() / 1000) as UTCTimestamp

  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.5) * 1.4
    const open = price
    const vol = Math.floor(900 + rand() * 12_000)
    const range = 0.9 + rand() * 6.5
    const body = drift + (rand() - 0.5) * 2.8
    const close = open + body
    const high = Math.max(open, close) + rand() * range
    const low = Math.min(open, close) - rand() * range
    const time = (startSec + i * 3600) as UTCTimestamp
    bars.push({
      time,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: vol,
    })
    price = close
  }
  return bars
}

/** Spot silver–like 1m demo (~$28–32) when live data is unavailable. */
export function generateSilverSpotMinuteBars(count: number, seed = 42, anchorStartSec?: number): Bar[] {
  const rand = mulberry32(seed)
  const bars: Bar[] = []
  let price = 28.5 + rand() * 3.5
  const startSec = minuteSeriesStartSec(count, anchorStartSec) as UTCTimestamp

  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.5) * 0.018
    const open = price
    const vol = Math.floor(30 + rand() * 700)
    const range = 0.012 + rand() * 0.06
    const body = drift + (rand() - 0.5) * 0.03
    const close = open + body
    const high = Math.max(open, close) + rand() * range
    const low = Math.min(open, close) - rand() * range
    const time = (startSec + i * 60) as UTCTimestamp
    bars.push({
      time,
      open: +open.toFixed(3),
      high: +high.toFixed(3),
      low: +low.toFixed(3),
      close: +close.toFixed(3),
      volume: vol,
    })
    price = close
  }
  return bars
}

/** WTI crude–like 1m demo (~$70–85) when live data is unavailable. */
export function generateOilDemoMinuteBars(count: number, seed = 42, anchorStartSec?: number): Bar[] {
  const rand = mulberry32(seed)
  const bars: Bar[] = []
  let price = 72 + rand() * 12
  const startSec = minuteSeriesStartSec(count, anchorStartSec) as UTCTimestamp

  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.5) * 0.08
    const open = price
    const vol = Math.floor(80 + rand() * 2_400)
    const range = 0.05 + rand() * 0.22
    const body = drift + (rand() - 0.5) * 0.14
    const close = open + body
    const high = Math.max(open, close) + rand() * range
    const low = Math.min(open, close) - rand() * range
    const time = (startSec + i * 60) as UTCTimestamp
    bars.push({
      time,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: vol,
    })
    price = close
  }
  return bars
}

/** Spot gold–like 1m demo when live/static data unavailable; not real market data. */
export function generateGoldSpotMinuteBars(count: number, seed = 42, anchorStartSec?: number): Bar[] {
  const rand = mulberry32(seed)
  const bars: Bar[] = []
  let price = 2640 + rand() * 45
  const startSec = minuteSeriesStartSec(count, anchorStartSec) as UTCTimestamp

  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.5) * 0.12
    const open = price
    const vol = Math.floor(40 + rand() * 900)
    const range = 0.08 + rand() * 0.45
    const body = drift + (rand() - 0.5) * 0.22
    const close = open + body
    const high = Math.max(open, close) + rand() * range
    const low = Math.min(open, close) - rand() * range
    const time = (startSec + i * 60) as UTCTimestamp
    bars.push({
      time,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: vol,
    })
    price = close
  }
  return bars
}

export function seedFromSymbol(symbol: string): number {
  let h = 0
  for (let i = 0; i < symbol.length; i++) h = (Math.imul(31, h) + symbol.charCodeAt(i)) | 0
  return (h >>> 0) || 1
}
