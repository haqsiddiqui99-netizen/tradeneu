/**
 * Chart layouts — the saved visual workspace for a backtesting session: symbol, interval,
 * indicators, drawings and chart type.
 *
 * TradingView's own persistence is switched off (`use_localstorage_for_settings` sits in
 * the widget's disabled features, and we scrub its keys on boot), so the opaque payload
 * from its low-level `save()` API is parked here next to our own metadata instead.
 */

const LAYOUTS_KEY = 'suplexity.chartLayouts.v1'
const ACTIVE_KEY = 'suplexity.chartLayout.active.v1'

/** Which properties the secondary panes follow the active chart on. */
export type ChartLayoutSync = {
  symbol: boolean
  interval: boolean
  crosshair: boolean
  time: boolean
  dateRange: boolean
}

/** Crosshair only, matching TradingView's own defaults for a fresh layout. */
export const DEFAULT_CHART_LAYOUT_SYNC: ChartLayoutSync = {
  symbol: false,
  interval: false,
  crosshair: true,
  time: false,
  dateRange: false,
}

export type ChartLayoutRecord = {
  id: string
  name: string
  /** Subtitle in the Layouts list; display forms, e.g. `XAUUSD` and `1m`. */
  symbol: string
  interval: string
  /** TradingView `save()` payload. Null until the layout is saved for the first time. */
  state: object | null
  /** Split arrangement id from `chartSplitLayouts`, e.g. `s`, `2h`, `2-2-l`. */
  split: string
  sync: ChartLayoutSync
  createdAt: number
  updatedAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function coerceSync(value: unknown): ChartLayoutSync {
  if (!isRecord(value)) return { ...DEFAULT_CHART_LAYOUT_SYNC }
  const pick = (key: keyof ChartLayoutSync) =>
    typeof value[key] === 'boolean' ? (value[key] as boolean) : DEFAULT_CHART_LAYOUT_SYNC[key]
  return {
    symbol: pick('symbol'),
    interval: pick('interval'),
    crosshair: pick('crosshair'),
    time: pick('time'),
    dateRange: pick('dateRange'),
  }
}

function coerce(value: unknown): ChartLayoutRecord | null {
  if (!isRecord(value)) return null
  const id = typeof value.id === 'string' ? value.id : ''
  const name = typeof value.name === 'string' ? value.name : ''
  if (!id || !name) return null
  const updatedAt = typeof value.updatedAt === 'number' ? value.updatedAt : Date.now()
  return {
    id,
    name,
    symbol: typeof value.symbol === 'string' ? value.symbol : '',
    interval: typeof value.interval === 'string' ? value.interval : '',
    state: isRecord(value.state) ? (value.state as object) : null,
    // Records written before split layouts existed fall back to a single chart.
    split: typeof value.split === 'string' && value.split ? value.split : 's',
    sync: coerceSync(value.sync),
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : updatedAt,
    updatedAt,
  }
}

function readAll(): ChartLayoutRecord[] {
  try {
    const raw = localStorage.getItem(LAYOUTS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(coerce).filter((r): r is ChartLayoutRecord => r !== null)
  } catch {
    return []
  }
}

function writeAll(records: ChartLayoutRecord[]): boolean {
  try {
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(records))
    return true
  } catch (err) {
    // A layout with many drawings can be hundreds of KB, so the 5 MB quota is reachable.
    console.warn('[layouts] could not persist layouts', err)
    return false
  }
}

/** Newest first — the order the Layouts list opens in. */
export function listChartLayouts(): ChartLayoutRecord[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getChartLayout(id: string): ChartLayoutRecord | null {
  return readAll().find((r) => r.id === id) ?? null
}

/** Insert or replace by id, stamping `updatedAt`. Returns the stored record. */
export function putChartLayout(record: ChartLayoutRecord): ChartLayoutRecord {
  const stored: ChartLayoutRecord = { ...record, updatedAt: Date.now() }
  const all = readAll()
  const at = all.findIndex((r) => r.id === stored.id)
  if (at >= 0) all[at] = stored
  else all.push(stored)
  writeAll(all)
  return stored
}

export function removeChartLayout(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id))
  if (activeChartLayoutId() === id) setActiveChartLayoutId(null)
}

export function activeChartLayoutId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY) || null
  } catch {
    return null
  }
}

export function setActiveChartLayoutId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch {
    /* noop */
  }
}

export function newChartLayoutId(): string {
  return `lay_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** `Unnamed — 9/29/2026` — the date is part of the name so a rename can drop it. */
export function defaultChartLayoutName(at: number = Date.now()): string {
  return `Unnamed — ${new Date(at).toLocaleDateString()}`
}

/** `Layout (1)`, `Layout (2)`, … so a copy never collides with an existing name. */
export function copyChartLayoutName(name: string, existing: string[]): string {
  const base = name.replace(/\s*\(\d+\)$/, '')
  const taken = new Set(existing)
  for (let n = 1; n < 1000; n++) {
    const candidate = `${base} (${n})`
    if (!taken.has(candidate)) return candidate
  }
  return `${base} (copy)`
}

/** `XAUUSD, 1m (Sep 29, 2026, 01:34)` — the Layouts list subtitle. */
export function formatChartLayoutMeta(record: ChartLayoutRecord): string {
  const when = new Date(record.updatedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const head = [record.symbol, record.interval].filter(Boolean).join(', ')
  return head ? `${head} (${when})` : when
}

/** Create a record without persisting it; callers save once the chart state is captured. */
export function draftChartLayout(symbol: string, interval: string, name?: string): ChartLayoutRecord {
  const now = Date.now()
  return {
    id: newChartLayoutId(),
    name: name ?? defaultChartLayoutName(now),
    symbol,
    interval,
    state: null,
    split: 's',
    sync: { ...DEFAULT_CHART_LAYOUT_SYNC },
    createdAt: now,
    updatedAt: now,
  }
}
