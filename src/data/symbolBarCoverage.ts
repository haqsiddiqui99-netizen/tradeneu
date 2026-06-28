import { fetchMarketBarsSeries } from './marketDataClient'
import { resolveSessionBars } from './resolveSessionBars'

/** Fallback when no symbol is selected or coverage cannot be resolved. */
export const APP_BAR_COVERAGE_FALLBACK_MIN = '2007-04-03'

export type BarCoverageBounds = {
  minIso: string
  maxIso: string
  minDatetimeLocal: string
  maxDatetimeLocal: string
}

function isoTodayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function maxDatetimeLocalToday(): string {
  return `${isoTodayLocal()}T23:59`
}

function secToLocalIsoDate(sec: number): string {
  const d = new Date(sec * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDatetimeLocal(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${mo}-${da}T${hh}:${mm}`
}

function secToDatetimeLocal(sec: number): string {
  const d = new Date(sec * 1000)
  d.setSeconds(0, 0)
  return formatDatetimeLocal(d)
}

function clampDatetimeLocal(value: string, minStr: string, maxStr: string): string {
  const v = new Date(value)
  const lo = new Date(minStr)
  const hi = new Date(maxStr)
  if (Number.isNaN(v.getTime()) || Number.isNaN(lo.getTime()) || Number.isNaN(hi.getTime())) return value
  const t = Math.min(Math.max(v.getTime(), lo.getTime()), hi.getTime())
  return formatDatetimeLocal(new Date(t))
}

export function fallbackBarCoverage(): BarCoverageBounds {
  const maxIso = isoTodayLocal()
  return {
    minIso: APP_BAR_COVERAGE_FALLBACK_MIN,
    maxIso,
    minDatetimeLocal: `${APP_BAR_COVERAGE_FALLBACK_MIN}T00:00`,
    maxDatetimeLocal: maxDatetimeLocalToday(),
  }
}

async function coverageForSymbol(symbol: string): Promise<{ firstSec: number; lastSec: number } | null> {
  const daily = await fetchMarketBarsSeries(symbol, undefined, { range: '10y', interval: '1d' })
  if (daily?.bars.length) {
    const firstSec = Number(daily.bars[0]!.time)
    const lastSec = Number(daily.bars[daily.bars.length - 1]!.time)
    if (Number.isFinite(firstSec) && Number.isFinite(lastSec) && lastSec >= firstSec) {
      return { firstSec, lastSec }
    }
  }

  const series = await resolveSessionBars(symbol, 'coverage-probe', 1500)
  if (series.bars.length >= 2) {
    const firstSec = Number(series.bars[0]!.time)
    const lastSec = Number(series.bars[series.bars.length - 1]!.time)
    if (Number.isFinite(firstSec) && Number.isFinite(lastSec) && lastSec >= firstSec) {
      return { firstSec, lastSec }
    }
  }
  return null
}

/** Intersection of bar coverage across all symbols (overlap window for multi-asset sessions). */
export async function resolveBarCoverageForSymbols(symbols: string[]): Promise<BarCoverageBounds> {
  const fallback = fallbackBarCoverage()
  const uniq = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))]
  if (!uniq.length) return fallback

  let minSec = -Infinity
  let maxSec = Infinity
  let any = false

  for (const sym of uniq) {
    const span = await coverageForSymbol(sym)
    if (!span) continue
    any = true
    minSec = Math.max(minSec, span.firstSec)
    maxSec = Math.min(maxSec, span.lastSec)
  }

  if (!any || !Number.isFinite(minSec) || !Number.isFinite(maxSec) || minSec > maxSec) {
    return fallback
  }

  const nowCap = maxDatetimeLocalToday()
  const minDatetimeLocal = secToDatetimeLocal(minSec)
  let maxDatetimeLocal = clampDatetimeLocal(secToDatetimeLocal(maxSec), minDatetimeLocal, nowCap)
  if (new Date(maxDatetimeLocal) < new Date(minDatetimeLocal)) {
    maxDatetimeLocal = nowCap
  }

  return {
    minIso: secToLocalIsoDate(minSec),
    maxIso: secToLocalIsoDate(Math.min(maxSec, Math.floor(Date.now() / 1000))),
    minDatetimeLocal,
    maxDatetimeLocal,
  }
}
