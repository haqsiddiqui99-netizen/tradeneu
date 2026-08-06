import {
  DEFAULT_LOCALE_TAG,
  dashCodeToLocaleTag,
  isKnownLocaleTag,
  localeTagToDashCode,
  persistDashLocaleCode,
  resolveLocaleTagFromStorage,
} from './appLocale'

/** SPA page segment (after locale prefix). */
export type AppPage = 'login' | 'dashboard' | 'chart' | 'admin'

export type ParsedAppPath = {
  localeTag: string
  page: AppPage
}

const LOCALE_PAGE_RE = /^\/([^/]+)\/(login|dashboard|chart|admin)$/

/** Build a locale-prefixed path, e.g. `/en-US/dashboard`. */
export function appPath(localeTag: string, page: AppPage): string {
  return `/${localeTag}/${page}`
}

/** Default-locale shortcuts (backward-compatible exports). */
export const LOGIN_PAGE_PATH = appPath(DEFAULT_LOCALE_TAG, 'login')
export const HOME_PAGE_PATH = appPath(DEFAULT_LOCALE_TAG, 'dashboard')
export const DASHBOARD_PAGE_PATH = HOME_PAGE_PATH
export const CHART_PAGE_PATH = appPath(DEFAULT_LOCALE_TAG, 'chart')

/** Legacy + Phase 1 bare paths → Phase 2 canonical (default locale). */
function legacyTarget(pathname: string): string | null {
  const p = pathname.replace(/\/$/, '') || '/'
  const map: Record<string, AppPage> = {
    '/loginPage': 'login',
    '/loginpage': 'login',
    '/login': 'login',
    '/HomePage': 'dashboard',
    '/homepage': 'dashboard',
    '/home': 'dashboard',
    '/dashboard': 'dashboard',
    '/Chart': 'chart',
    '/chart': 'chart',
    '/admin': 'admin',
  }
  const page = map[p] ?? map[p.toLowerCase()]
  if (!page) return null
  return appPath(DEFAULT_LOCALE_TAG, page)
}

export function parseAppPath(pathname: string): ParsedAppPath | null {
  const p = pathname.replace(/\/$/, '') || '/'
  const m = LOCALE_PAGE_RE.exec(p)
  if (!m) return null
  const localeTag = m[1]!
  const page = m[2] as AppPage
  if (!isKnownLocaleTag(localeTag)) return null
  return { localeTag, page }
}

/**
 * Normalize to canonical Phase 2 path (`/{locale}/{page}`) when recognized.
 * Unknown paths are returned unchanged.
 */
export function normalizeAppPath(pathname: string): string {
  const parsed = parseAppPath(pathname)
  if (parsed) return appPath(parsed.localeTag, parsed.page)
  const legacy = legacyTarget(pathname)
  if (legacy) return legacy
  return pathname.replace(/\/$/, '') || '/'
}

export function isAppShellPath(pathname: string): boolean {
  return parseAppPath(normalizeAppPath(pathname)) != null
}

/**
 * When the URL should redirect (legacy, Phase 1 bare paths, or unknown locale tag).
 */
export function canonicalPathFromLegacy(pathname: string): string | null {
  const p = pathname.replace(/\/$/, '') || '/'
  const normalized = normalizeAppPath(p)
  if (normalized !== p) return normalized

  const m = LOCALE_PAGE_RE.exec(p)
  if (m && !isKnownLocaleTag(m[1]!)) {
    return appPath(DEFAULT_LOCALE_TAG, m[2] as AppPage)
  }
  return null
}

/** Current locale tag from the URL, or default. */
export function localeTagFromPath(pathname?: string): string {
  return parseAppPath(normalizeAppPath(pathname ?? window.location.pathname))?.localeTag ?? DEFAULT_LOCALE_TAG
}

/** Current page from the URL, if on an app shell route. */
export function appPageFromPath(pathname?: string): AppPage | null {
  return parseAppPath(normalizeAppPath(pathname ?? window.location.pathname))?.page ?? null
}

/** Build path for `page` using URL locale, optional override, or stored preference. */
export function resolveAppPath(page: AppPage, localeTag?: string): string {
  const fromUrl = parseAppPath(normalizeAppPath(window.location.pathname))?.localeTag
  const tag = localeTag ?? fromUrl ?? resolveLocaleTagFromStorage()
  return appPath(tag, page)
}

/** Dashboard home for the user's stored locale (post-login navigation). */
export function dashboardPathForUser(): string {
  return appPath(resolveLocaleTagFromStorage(), 'dashboard')
}

/** Sync URL locale tag → dashboard picker + `<html lang>`. */
export function applyLocaleFromPath(pathname?: string): ReturnType<typeof localeTagToDashCode> {
  const tag = localeTagFromPath(pathname)
  const code = localeTagToDashCode(tag)
  if (!code) return null
  persistDashLocaleCode(code)
  return code
}

export { dashCodeToLocaleTag, DEFAULT_LOCALE_TAG, localeTagToDashCode }
