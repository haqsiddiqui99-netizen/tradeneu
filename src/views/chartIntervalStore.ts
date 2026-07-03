import {
  CHART_INTERVAL_SECTIONS,
  MINUTE_INTERVALS,
  type IntervalPick,
  type IntervalSection,
  findIntervalSectionForPill,
} from './chartIntervalCatalog'

const STORAGE_KEY = 'suplexity.chartIntervals.v1'

export type ChartIntervalPreferences = {
  custom: IntervalPick[]
  favorites: string[]
  hidden: string[]
}

const DEFAULT_PREFS: ChartIntervalPreferences = {
  custom: [],
  favorites: [],
  hidden: [],
}

function normalizePill(pill: string): string {
  return pill.trim()
}

export function intervalPickKey(pick: IntervalPick): string {
  return normalizePill(pick.pill)
}

const CORE_MINUTE_PILLS = new Set(MINUTE_INTERVALS.map((i) => i.pill))

/** Standard minute intervals should always stay in the menu (no hide UI yet). */
function sanitizePrefs(prefs: ChartIntervalPreferences): ChartIntervalPreferences {
  const hidden = prefs.hidden.filter((p) => !CORE_MINUTE_PILLS.has(p))
  if (hidden.length === prefs.hidden.length) return prefs
  return { ...prefs, hidden }
}

function readPrefs(): ChartIntervalPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFS, custom: [], favorites: [], hidden: [] }
    const j = JSON.parse(raw) as Partial<ChartIntervalPreferences>
    const sanitized = sanitizePrefs({
      custom: Array.isArray(j.custom) ? j.custom.filter(isValidPick) : [],
      favorites: Array.isArray(j.favorites)
        ? j.favorites.map((p) => normalizePill(String(p))).filter(Boolean)
        : [],
      hidden: Array.isArray(j.hidden)
        ? j.hidden.map((p) => normalizePill(String(p))).filter(Boolean)
        : [],
    })
    if (sanitized.hidden.length !== (Array.isArray(j.hidden) ? j.hidden.length : 0)) {
      writePrefs(sanitized)
    }
    return sanitized
  } catch {
    return { ...DEFAULT_PREFS, custom: [], favorites: [], hidden: [] }
  }
}

function writePrefs(prefs: ChartIntervalPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* quota / private mode */
  }
}

function isValidPick(v: unknown): v is IntervalPick {
  if (!v || typeof v !== 'object') return false
  const o = v as IntervalPick
  return (
    typeof o.pill === 'string' &&
    o.pill.trim().length > 0 &&
    typeof o.label === 'string' &&
    (o.kind === 'time' || o.kind === 'tick')
  )
}

export function loadChartIntervalPrefs(): ChartIntervalPreferences {
  return readPrefs()
}

export function resolveIntervalPick(pill: string): IntervalPick | null {
  const p = normalizePill(pill)
  if (!p) return null
  const prefs = readPrefs()
  const custom = prefs.custom.find((c) => c.pill === p)
  if (custom) return custom
  for (const section of CHART_INTERVAL_SECTIONS) {
    const hit = section.items.find((i) => i.pill === p)
    if (hit) return hit
  }
  return null
}

export function isCustomInterval(pill: string): boolean {
  const p = normalizePill(pill)
  return readPrefs().custom.some((c) => c.pill === p)
}

export function isFavoriteInterval(pill: string): boolean {
  const p = normalizePill(pill)
  return readPrefs().favorites.includes(p)
}

export function isHiddenInterval(pill: string): boolean {
  const p = normalizePill(pill)
  return readPrefs().hidden.includes(p)
}

export function toggleFavoriteInterval(pill: string): boolean {
  const p = normalizePill(pill)
  if (isFavoriteInterval(p)) {
    removeFavoriteInterval(p)
    return false
  }
  addFavoriteInterval(p)
  return true
}

export function addFavoriteInterval(pill: string): void {
  const p = normalizePill(pill)
  if (!p || isFavoriteInterval(p)) return
  const prefs = readPrefs()
  prefs.favorites.push(p)
  writePrefs(prefs)
}

export function removeFavoriteInterval(pill: string): void {
  const p = normalizePill(pill)
  const prefs = readPrefs()
  prefs.favorites = prefs.favorites.filter((f) => f !== p)
  writePrefs(prefs)
}

export function addCustomInterval(pick: IntervalPick) {
  const prefs = readPrefs()
  const key = intervalPickKey(pick)
  prefs.custom = prefs.custom.filter((c) => c.pill !== key)
  prefs.custom.push({ ...pick, pill: key })
  prefs.hidden = prefs.hidden.filter((h) => h !== key)
  writePrefs(prefs)
}

export function removeIntervalFromMenu(pill: string) {
  const p = normalizePill(pill)
  const prefs = readPrefs()
  if (prefs.custom.some((c) => c.pill === p)) {
    prefs.custom = prefs.custom.filter((c) => c.pill !== p)
  } else {
    if (!prefs.hidden.includes(p)) prefs.hidden.push(p)
  }
  prefs.favorites = prefs.favorites.filter((f) => f !== p)
  writePrefs(prefs)
}

export function getFavoriteIntervals(): IntervalPick[] {
  const prefs = readPrefs()
  const out: IntervalPick[] = []
  for (const pill of prefs.favorites) {
    const pick = resolveIntervalPick(pill)
    if (pick && !prefs.hidden.includes(pill)) out.push(pick)
  }
  return out
}

export function getEffectiveIntervalSections(): IntervalSection[] {
  const prefs = readPrefs()
  const hidden = new Set(prefs.hidden.map(normalizePill))

  const sections: IntervalSection[] = CHART_INTERVAL_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    items: section.items.filter((i) => !hidden.has(i.pill)),
  }))

  for (const custom of prefs.custom) {
    if (hidden.has(custom.pill)) continue
    const sectionId = findIntervalSectionForPill(custom.pill) ?? 'minutes'
    const section = sections.find((s) => s.id === sectionId)
    if (!section) continue
    if (section.items.some((i) => i.pill === custom.pill)) continue
    section.items.push(custom)
  }

  for (const section of sections) {
    section.items.sort((a, b) => {
      const aSec = a.stepSec ?? (a.tickCount ?? 0)
      const bSec = b.stepSec ?? (b.tickCount ?? 0)
      return aSec - bSec
    })
  }

  return sections.filter((s) => s.items.length > 0)
}
