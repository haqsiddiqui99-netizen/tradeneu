/** EMA and RSI for chart overlays (closes oldest → newest). */

export function computeEMA(closes: number[], period: number): (number | null)[] {
  const n = closes.length
  const out: (number | null)[] = Array(n).fill(null)
  if (n < period) return out
  let sum = 0
  for (let i = 0; i < period; i++) sum += closes[i]!
  let ema = sum / period
  out[period - 1] = ema
  const k = 2 / (period + 1)
  for (let i = period; i < n; i++) {
    ema = closes[i]! * k + ema * (1 - k)
    out[i] = ema
  }
  return out
}

/** Wilder RSI (period 14 default). */
export function computeRSI(closes: number[], period = 14): (number | null)[] {
  const n = closes.length
  const out: (number | null)[] = Array(n).fill(null)
  if (n < period + 1) return out

  let avgG = 0
  let avgL = 0
  for (let i = 1; i <= period; i++) {
    const ch = closes[i]! - closes[i - 1]!
    if (ch >= 0) avgG += ch
    else avgL -= ch
  }
  avgG /= period
  avgL /= period

  const rs = avgL === 0 ? 100 : avgG / avgL
  out[period] = 100 - 100 / (1 + rs)

  for (let i = period + 1; i < n; i++) {
    const ch = closes[i]! - closes[i - 1]!
    const g = ch > 0 ? ch : 0
    const l = ch < 0 ? -ch : 0
    avgG = (avgG * (period - 1) + g) / period
    avgL = (avgL * (period - 1) + l) / period
    const rsiRs = avgL === 0 ? 100 : avgG / avgL
    out[i] = 100 - 100 / (1 + rsiRs)
  }
  return out
}
