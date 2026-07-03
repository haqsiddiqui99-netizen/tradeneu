import {
  isCommodityMarketSymbol,
  isForexPairSymbol,
  isGoldBrowserSymbol,
  isLikelyUsStockSymbol,
} from '../data/resolveSessionBars'

const NY_TZ = 'America/New_York'

export type MarketSessionInfo = {
  isOpen: boolean
  headline: string
  detail: string
  dayLabel: string
  closeTimeLabel: string | null
  progressPct: number
  exchangeTzLabel: string
}

type ZonedParts = {
  weekday: number
  hour: number
  minute: number
  dayShort: string
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon'
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    weekday: map[weekdayStr.slice(0, 3)] ?? 1,
    hour,
    minute,
    dayShort: weekdayStr.slice(0, 3).toUpperCase(),
  }
}

function exchangeTzLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date())
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
    const city =
      timeZone === NY_TZ
        ? 'New York'
        : timeZone === 'UTC'
          ? 'UTC'
          : timeZone.replace(/_/g, ' ').replace(/^.*\//, '')
    return `Exchange timezone: ${city}${offset ? ` (${offset.replace('GMT', 'UTC')})` : ''}`
  } catch {
    return 'Exchange timezone: New York (UTC-4)'
  }
}

function formatDuration(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60_000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h <= 0) return `${m} minute${m === 1 ? '' : 's'}`
  if (m <= 0) return `${h} hour${h === 1 ? '' : 's'}`
  return `${h} hour${h === 1 ? '' : 's'} and ${m} minute${m === 1 ? '' : 's'}`
}

function nyMinutes(parts: ZonedParts): number {
  return parts.hour * 60 + parts.minute
}

function isForexCfdOpen(parts: ZonedParts): boolean {
  const { weekday } = parts
  const mins = nyMinutes(parts)
  if (weekday === 6) return false
  if (weekday === 0) return mins >= 17 * 60
  if (weekday === 5) return mins < 17 * 60
  return true
}

function nextZonedTime(from: Date, timeZone: string, targetWeekday: number, hour: number, minute: number): number {
  const fromP = zonedParts(from, timeZone)
  let daysAhead = (targetWeekday - fromP.weekday + 7) % 7
  const targetMins = hour * 60 + minute
  if (daysAhead === 0 && nyMinutes(fromP) >= targetMins) daysAhead = 7
  const candidate = new Date(from.getTime() + daysAhead * 86_400_000)
  const cp = zonedParts(candidate, timeZone)
  const deltaMins = targetMins - nyMinutes(cp)
  return candidate.getTime() + deltaMins * 60_000
}

function nextForexCloseMs(now: Date): number {
  return Math.max(60_000, nextZonedTime(now, NY_TZ, 5, 17, 0) - now.getTime())
}

function nextForexOpenMs(now: Date): number {
  const p = zonedParts(now, NY_TZ)
  if (p.weekday === 0 && nyMinutes(p) < 17 * 60) {
    return Math.max(60_000, nextZonedTime(now, NY_TZ, 0, 17, 0) - now.getTime())
  }
  if (isForexCfdOpen(p)) return nextForexCloseMs(now)
  return Math.max(60_000, nextZonedTime(now, NY_TZ, 0, 17, 0) - now.getTime())
}

function isUsEquityOpen(parts: ZonedParts): boolean {
  if (parts.weekday === 0 || parts.weekday === 6) return false
  const mins = nyMinutes(parts)
  return mins >= 9 * 60 + 30 && mins < 16 * 60
}

function nextUsEquityCloseMs(now: Date): number {
  return Math.max(60_000, nextZonedTime(now, NY_TZ, zonedParts(now, NY_TZ).weekday, 16, 0) - now.getTime())
}

function nextUsEquityOpenMs(now: Date): number {
  const p = zonedParts(now, NY_TZ)
  if (isUsEquityOpen(p)) return nextUsEquityCloseMs(now)
  let wd = p.weekday
  if (p.weekday === 0) wd = 1
  if (p.weekday === 6) wd = 1
  if (p.weekday >= 1 && p.weekday <= 5 && nyMinutes(p) >= 16 * 60) {
    wd = p.weekday === 5 ? 1 : p.weekday + 1
  }
  return Math.max(60_000, nextZonedTime(now, NY_TZ, wd, 9, 30) - now.getTime())
}

function marketKind(symbol: string): 'forex' | 'us_equity' | 'crypto' {
  const u = symbol.trim().toUpperCase()
  if (u === 'BTCUSD' || u.endsWith('USDT')) return 'crypto'
  if (isForexPairSymbol(u) || isGoldBrowserSymbol(u) || isCommodityMarketSymbol(u)) return 'forex'
  if (isLikelyUsStockSymbol(u)) return 'us_equity'
  return 'forex'
}

function forexProgress(parts: ZonedParts): number {
  if (!isForexCfdOpen(parts)) return 0
  if (parts.weekday === 5) {
    return Math.min(100, Math.max(0, (nyMinutes(parts) / (17 * 60)) * 100))
  }
  const dayProgress = nyMinutes(parts) / (24 * 60)
  return Math.min(100, Math.max(8, dayProgress * 100))
}

function usEquityProgress(parts: ZonedParts): number {
  if (!isUsEquityOpen(parts)) return 0
  const open = 9 * 60 + 30
  const close = 16 * 60
  return Math.min(100, Math.max(0, ((nyMinutes(parts) - open) / (close - open)) * 100))
}

export function getMarketSession(symbol: string, now = new Date()): MarketSessionInfo {
  const kind = marketKind(symbol)
  const ny = zonedParts(now, NY_TZ)
  const tzLabel = exchangeTzLabel(NY_TZ)

  if (kind === 'crypto') {
    return {
      isOpen: true,
      headline: 'Market open',
      detail: "All's well — crypto markets trade 24/7.",
      dayLabel: ny.dayShort,
      closeTimeLabel: null,
      progressPct: Math.min(100, (ny.hour / 24) * 100),
      exchangeTzLabel: 'Exchange timezone: UTC (24/7)',
    }
  }

  if (kind === 'forex') {
    const open = isForexCfdOpen(ny)
    if (open) {
      const untilClose = nextForexCloseMs(now)
      return {
        isOpen: true,
        headline: 'Market open',
        detail: `All's well — market is open. It'll close in ${formatDuration(untilClose)}.`,
        dayLabel: ny.dayShort,
        closeTimeLabel: '17:00',
        progressPct: forexProgress(ny),
        exchangeTzLabel: tzLabel,
      }
    }
    const untilOpen = nextForexOpenMs(now)
    return {
      isOpen: false,
      headline: 'Market closed',
      detail: `Market is closed. It'll open in ${formatDuration(untilOpen)}.`,
      dayLabel: ny.dayShort,
      closeTimeLabel: '17:00',
      progressPct: 0,
      exchangeTzLabel: tzLabel,
    }
  }

  const open = isUsEquityOpen(ny)
  if (open) {
    const untilClose = nextUsEquityCloseMs(now)
    return {
      isOpen: true,
      headline: 'Market open',
      detail: `All's well — market is open. It'll close in ${formatDuration(untilClose)}.`,
      dayLabel: ny.dayShort,
      closeTimeLabel: '16:00',
      progressPct: usEquityProgress(ny),
      exchangeTzLabel: tzLabel,
    }
  }
  const untilOpen = nextUsEquityOpenMs(now)
  return {
    isOpen: false,
    headline: 'Market closed',
    detail: `Market is closed. It'll open in ${formatDuration(untilOpen)}.`,
    dayLabel: ny.dayShort,
    closeTimeLabel: '16:00',
    progressPct: 0,
    exchangeTzLabel: tzLabel,
  }
}
