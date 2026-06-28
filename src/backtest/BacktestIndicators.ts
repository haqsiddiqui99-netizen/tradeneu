/**
 * src/backtest/BacktestIndicators.ts
 *
 * Pure-math indicator computation — no external dependency.
 * All functions take a Bar[] and return number[] of the same length.
 * Positions before the warm-up period are filled with NaN.
 *
 * Used internally by BacktestEngine.ts. Can also be imported by
 * chartWorkspace.ts to paint indicator overlays on the LWC chart.
 */

import type { Bar, IndicatorSnapshot, MarketCondition } from './BacktestTypes'

// ─── EMA ─────────────────────────────────────────────────────────────────────
export function ema(bars: Bar[], period: number): number[] {
  const k  = 2 / (period + 1)
  const out = new Array<number>(bars.length).fill(NaN)
  let prev  = NaN
  for (let i = 0; i < bars.length; i++) {
    const c = bars[i]!.close
    if (i < period - 1) { continue }
    if (isNaN(prev)) {
      // seed with simple average of first `period` closes
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) sum += bars[j]!.close
      prev = sum / period
    } else {
      prev = c * k + prev * (1 - k)
    }
    out[i] = prev
  }
  return out
}

// ─── SMA ─────────────────────────────────────────────────────────────────────
export function sma(bars: Bar[], period: number): number[] {
  const out = new Array<number>(bars.length).fill(NaN)
  let sum   = 0
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i]!.close
    if (i >= period) sum -= bars[i - period]!.close
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

// ─── ATR ─────────────────────────────────────────────────────────────────────
export function atr(bars: Bar[], period = 14): number[] {
  const out = new Array<number>(bars.length).fill(NaN)
  let smoothed = NaN
  for (let i = 1; i < bars.length; i++) {
    const b  = bars[i]!
    const pb = bars[i - 1]!
    const tr = Math.max(b.high - b.low, Math.abs(b.high - pb.close), Math.abs(b.low - pb.close))
    if (i < period) {
      if (i === period - 1) {
        let s = 0
        for (let j = 1; j <= period - 1; j++) {
          const bj = bars[j]!; const pj = bars[j - 1]!
          s += Math.max(bj.high - bj.low, Math.abs(bj.high - pj.close), Math.abs(bj.low - pj.close))
        }
        smoothed = s / (period - 1)
      }
      continue
    }
    smoothed = (smoothed * (period - 1) + tr) / period
    out[i]   = smoothed
  }
  return out
}

// ─── RSI ─────────────────────────────────────────────────────────────────────
export function rsi(bars: Bar[], period = 14): number[] {
  const out  = new Array<number>(bars.length).fill(NaN)
  let avgGain = 0; let avgLoss = 0
  for (let i = 1; i < bars.length; i++) {
    const diff = bars[i]!.close - bars[i - 1]!.close
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    if (i <= period) {
      avgGain += gain / period
      avgLoss += loss / period
      if (i === period) {
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
      }
      continue
    }
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out[i]  = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

// ─── MACD ────────────────────────────────────────────────────────────────────
export function macd(bars: Bar[], fast = 12, slow = 26, signal = 9): {
  line: number[]; signal_: number[]; hist: number[]
} {
  const emaFast = ema(bars, fast)
  const emaSlow = ema(bars, slow)
  const line    = bars.map((_, i) =>
    isNaN(emaFast[i]!) || isNaN(emaSlow[i]!) ? NaN : emaFast[i]! - emaSlow[i]!)

  // Signal is EMA of MACD line — compute using fake bars with close = line value
  const lineBars = bars.map((b, i) => ({ ...b, close: isNaN(line[i]!) ? 0 : line[i]! }))
  const sig      = ema(lineBars, signal)

  const hist = line.map((v, i) =>
    isNaN(v) || isNaN(sig[i]!) ? NaN : v - sig[i]!)

  return { line, signal_: sig, hist }
}

// ─── BOLLINGER BANDS ─────────────────────────────────────────────────────────
export function bollingerBands(bars: Bar[], period = 20, stdDev = 2): {
  upper: number[]; middle: number[]; lower: number[]
} {
  const mid   = sma(bars, period)
  const upper = new Array<number>(bars.length).fill(NaN)
  const lower = new Array<number>(bars.length).fill(NaN)
  for (let i = period - 1; i < bars.length; i++) {
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) {
      const d = bars[j]!.close - mid[i]!
      variance += d * d
    }
    const sd = Math.sqrt(variance / period)
    upper[i] = mid[i]! + stdDev * sd
    lower[i] = mid[i]! - stdDev * sd
  }
  return { upper, middle: mid, lower }
}

// ─── ADX ─────────────────────────────────────────────────────────────────────
export function adx(bars: Bar[], period = 14): number[] {
  const out  = new Array<number>(bars.length).fill(NaN)
  const trArr: number[] = []
  const dmPArr: number[] = []
  const dmNArr: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i]!; const pb = bars[i - 1]!
    const tr = Math.max(b.high - b.low, Math.abs(b.high - pb.close), Math.abs(b.low - pb.close))
    const dmP = b.high - pb.high > pb.low - b.low && b.high - pb.high > 0 ? b.high - pb.high : 0
    const dmN = pb.low - b.low > b.high - pb.high && pb.low - b.low > 0 ? pb.low - b.low : 0
    trArr.push(tr); dmPArr.push(dmP); dmNArr.push(dmN)
  }
  // Smooth
  let sTr = 0; let sDmP = 0; let sDmN = 0
  for (let i = 0; i < period; i++) { sTr += trArr[i]!; sDmP += dmPArr[i]!; sDmN += dmNArr[i]! }
  const dxArr: number[] = []
  for (let i = period; i < trArr.length; i++) {
    sTr  = sTr  - sTr / period  + trArr[i]!
    sDmP = sDmP - sDmP / period + dmPArr[i]!
    sDmN = sDmN - sDmN / period + dmNArr[i]!
    const diP = sTr > 0 ? (sDmP / sTr) * 100 : 0
    const diN = sTr > 0 ? (sDmN / sTr) * 100 : 0
    const dx  = diP + diN > 0 ? (Math.abs(diP - diN) / (diP + diN)) * 100 : 0
    dxArr.push(dx)
  }
  // Smooth DX into ADX
  let adxVal = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period * 2] = adxVal
  for (let i = period; i < dxArr.length; i++) {
    adxVal = (adxVal * (period - 1) + dxArr[i]!) / period
    out[i + period + 1] = adxVal
  }
  return out
}

// ─── VWAP (daily reset) ───────────────────────────────────────────────────────
export function vwap(bars: Bar[]): number[] {
  const out = new Array<number>(bars.length).fill(NaN)
  let cumTPV = 0; let cumVol = 0; let lastDay = -1
  for (let i = 0; i < bars.length; i++) {
    const b   = bars[i]!
    const day = Math.floor(b.time / 86400)
    if (day !== lastDay) { cumTPV = 0; cumVol = 0; lastDay = day }
    const tp  = (b.high + b.low + b.close) / 3
    const vol = b.volume ?? 1
    cumTPV += tp * vol
    cumVol += vol
    out[i]  = cumVol > 0 ? cumTPV / cumVol : NaN
  }
  return out
}

// ─── CLASSIFY MARKET CONDITION ────────────────────────────────────────────────
export function classifyCondition(
  adxVal:  number,
  atrVal:  number,
  atrMean: number,
  ema9:    number,
  ema21:   number,
): MarketCondition {
  if (isNaN(adxVal) || isNaN(atrVal)) return 'ranging'
  const isVolatile  = atrVal > atrMean * 1.8
  const isTrending  = adxVal > 25
  if (isVolatile)             return 'volatile'
  if (isTrending && ema9 > ema21) return 'trending-up'
  if (isTrending && ema9 < ema21) return 'trending-down'
  return 'ranging'
}

// ─── BUILD FULL INDICATOR SNAPSHOT AT BAR i ──────────────────────────────────
/**
 * Pre-compute all indicator series once, then call this per-bar.
 * Much faster than recomputing on every bar.
 */
export interface PrecomputedIndicators {
  ema9s:   number[]; ema21s: number[]; ema50s: number[]; ema200s: number[]
  sma9s:   number[]; sma21s: number[]; sma50s: number[]; sma200s: number[]
  rsi14s:  number[]
  atr14s:  number[]
  macdLine: number[]; macdSig: number[]; macdHist: number[]
  bbUpper: number[]; bbMid: number[]; bbLower: number[]
  vwaps:   number[]
  adx14s:  number[]
  conditions: MarketCondition[]
  atrMean: number
}

export function precompute(bars: Bar[]): PrecomputedIndicators {
  const ema9s   = ema(bars, 9);   const ema21s = ema(bars, 21)
  const ema50s  = ema(bars, 50);  const ema200s = ema(bars, 200)
  const sma9s   = sma(bars, 9);   const sma21s  = sma(bars, 21)
  const sma50s  = sma(bars, 50);  const sma200s = sma(bars, 200)
  const rsi14s  = rsi(bars, 14)
  const atr14s  = atr(bars, 14)
  const { line: macdLine, signal_: macdSig, hist: macdHist } = macd(bars)
  const { upper: bbUpper, middle: bbMid, lower: bbLower }    = bollingerBands(bars)
  const vwaps   = vwap(bars)
  const adx14s  = adx(bars, 14)

  // Mean ATR for volatility classification
  const validAtrs = atr14s.filter((v) => !isNaN(v))
  const atrMean   = validAtrs.length ? validAtrs.reduce((a, b) => a + b, 0) / validAtrs.length : 1

  const conditions: MarketCondition[] = bars.map((_, i) =>
    classifyCondition(adx14s[i]!, atr14s[i]!, atrMean, ema9s[i]!, ema21s[i]!))

  return {
    ema9s, ema21s, ema50s, ema200s,
    sma9s, sma21s, sma50s, sma200s,
    rsi14s, atr14s,
    macdLine, macdSig, macdHist,
    bbUpper, bbMid, bbLower,
    vwaps, adx14s,
    conditions, atrMean,
  }
}

export function snapshotAt(ind: PrecomputedIndicators, i: number): IndicatorSnapshot {
  const n = (v: number | undefined) => (isNaN(v ?? NaN) ? 0 : v ?? 0)
  return {
    ema9:  n(ind.ema9s[i]),   ema21:  n(ind.ema21s[i]),
    ema50: n(ind.ema50s[i]),  ema200: n(ind.ema200s[i]),
    sma9:  n(ind.sma9s[i]),   sma21:  n(ind.sma21s[i]),
    sma50: n(ind.sma50s[i]),  sma200: n(ind.sma200s[i]),
    rsi14:      n(ind.rsi14s[i]),
    atr14:      n(ind.atr14s[i]),
    macdLine:   n(ind.macdLine[i]),   macdSignal: n(ind.macdSig[i]),  macdHist: n(ind.macdHist[i]),
    bbUpper:    n(ind.bbUpper[i]),     bbMiddle:   n(ind.bbMid[i]),    bbLower:  n(ind.bbLower[i]),
    vwap:       n(ind.vwaps[i]),
    adx14:      n(ind.adx14s[i]),
  }
}

/** Get indicator value by key string — used by condition evaluator */
export function getIndicatorValue(
  key: string,
  ind: PrecomputedIndicators,
  bar: Bar,
  i:   number,
): number {
  const n = (v: number | undefined) => (v != null && Number.isFinite(v) ? v : NaN)
  switch (key) {
    case 'close':  return bar.close
    case 'open':   return bar.open
    case 'high':   return bar.high
    case 'low':    return bar.low
    case 'volume': return bar.volume ?? 0
    case 'ema9':   return n(ind.ema9s[i]);  case 'ema21':  return n(ind.ema21s[i])
    case 'ema50':  return n(ind.ema50s[i]); case 'ema200': return n(ind.ema200s[i])
    case 'sma9':   return n(ind.sma9s[i]);  case 'sma21':  return n(ind.sma21s[i])
    case 'sma50':  return n(ind.sma50s[i]); case 'sma200': return n(ind.sma200s[i])
    case 'rsi14':      return n(ind.rsi14s[i])
    case 'atr14':      return n(ind.atr14s[i])
    case 'macd_line':  return n(ind.macdLine[i])
    case 'macd_signal':return n(ind.macdSig[i])
    case 'macd_hist':  return n(ind.macdHist[i])
    case 'bb_upper':   return n(ind.bbUpper[i])
    case 'bb_middle':  return n(ind.bbMid[i])
    case 'bb_lower':   return n(ind.bbLower[i])
    case 'vwap':       return n(ind.vwaps[i])
    case 'adx14':      return n(ind.adx14s[i])
    default:           return 0
  }
}
