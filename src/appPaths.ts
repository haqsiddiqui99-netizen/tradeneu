/** Canonical SPA routes (served from `index.html` via Vite fallback in dev/preview). */
export const LOGIN_PAGE_PATH = '/loginPage'
export const HOME_PAGE_PATH = '/HomePage'
/** Candle chart workspace (same shell as dashboard; URL updated when a session is opened). */
export const CHART_PAGE_PATH = '/Chart'

/** Normalize path casing so `/loginPage`, `/HomePage`, and `/Chart` are canonical. */
export function normalizeAppPath(pathname: string): string {
  const p = pathname.replace(/\/$/, '') || '/'
  const lower = p.toLowerCase()
  if (lower === '/loginpage') return LOGIN_PAGE_PATH
  if (lower === '/homepage') return HOME_PAGE_PATH
  if (lower === '/chart') return CHART_PAGE_PATH
  return p
}
