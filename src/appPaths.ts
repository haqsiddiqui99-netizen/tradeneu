/** Canonical SPA routes (Phase 1: lowercase, semantic names). */
export const LOGIN_PAGE_PATH = '/login'
/** Dashboard home — alias `HOME_PAGE_PATH` kept for existing imports. */
export const HOME_PAGE_PATH = '/dashboard'
export const DASHBOARD_PAGE_PATH = HOME_PAGE_PATH
/** Candle chart workspace (URL updated when a session is opened). */
export const CHART_PAGE_PATH = '/chart'

const APP_PAGE_PATHS = new Set([LOGIN_PAGE_PATH, HOME_PAGE_PATH, CHART_PAGE_PATH])

/** Map legacy URLs → canonical (exact path segments, case-sensitive keys where needed). */
const LEGACY_PATH_MAP: Record<string, string> = {
  '/loginPage': LOGIN_PAGE_PATH,
  '/loginpage': LOGIN_PAGE_PATH,
  '/HomePage': HOME_PAGE_PATH,
  '/homepage': HOME_PAGE_PATH,
  '/home': HOME_PAGE_PATH,
  '/Chart': CHART_PAGE_PATH,
}

/**
 * Normalize pathname to a canonical app route when it matches login, dashboard, or chart.
 * Unknown paths are returned unchanged.
 */
export function normalizeAppPath(pathname: string): string {
  const p = pathname.replace(/\/$/, '') || '/'
  if (LEGACY_PATH_MAP[p]) return LEGACY_PATH_MAP[p]
  const lower = p.toLowerCase()
  if (lower === '/loginpage' || lower === '/login') return LOGIN_PAGE_PATH
  if (lower === '/homepage' || lower === '/home' || lower === '/dashboard') return HOME_PAGE_PATH
  if (lower === '/chart') return CHART_PAGE_PATH
  return p
}

/** True when the path is (or normalizes to) a known app shell route. */
export function isAppShellPath(pathname: string): boolean {
  return APP_PAGE_PATHS.has(normalizeAppPath(pathname))
}

/**
 * When the browser URL uses a legacy or non-canonical spelling, return the canonical path
 * so the app can redirect (e.g. `/HomePage` → `/dashboard`).
 */
export function canonicalPathFromLegacy(pathname: string): string | null {
  const p = pathname.replace(/\/$/, '') || '/'
  const canonical = normalizeAppPath(p)
  if (!APP_PAGE_PATHS.has(canonical)) return null
  if (p === canonical) return null
  return canonical
}
