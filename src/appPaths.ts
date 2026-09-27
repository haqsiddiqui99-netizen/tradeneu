import {
  DEFAULT_LOCALE_TAG,
  dashCodeToLocaleTag,
  isKnownLocaleTag,
  localeTagToDashCode,
  resolveLocaleTagFromStorage,
} from './appLocale'
import { setLocale } from './i18n'

/**
 * URL model: `/{locale}/{section}[/{tab}][?tab=…]`.
 *
 *   /en-US/login
 *   /en-US/testing/dashboard        (also sessions | trades | analytics)
 *   /en-US/testing/analytics?tab=drawdown
 *   /en-US/strategy
 *   /en-US/billing
 *   /en-US/settings/security
 *   /en-US/chart
 *   /en-US/admin
 *
 * `AppPage` stays coarse because it only answers "which shell does main.ts
 * mount"; `AppView` is the destination inside the dashboard shell.
 */
export type AppPage = 'login' | 'dashboard' | 'chart' | 'admin'

export const TESTING_TAB_SEGMENTS = ['dashboard', 'sessions', 'trades', 'analytics'] as const
export type TestingTabSegment = (typeof TESTING_TAB_SEGMENTS)[number]

export const ANALYTICS_TAB_SEGMENTS = ['performance', 'drawdown', 'simulation'] as const
export type AnalyticsTabSegment = (typeof ANALYTICS_TAB_SEGMENTS)[number]

export const SETTINGS_TAB_SEGMENTS = [
  'account',
  'security',
  'devices',
  'subscription',
  'backtesting',
  'costs',
  'usage',
  'deleted',
] as const
export type SettingsTabSegment = (typeof SETTINGS_TAB_SEGMENTS)[number]

/** Sub-tab shown when no `?tab=` is present; left out of canonical URLs. */
const DEFAULT_ANALYTICS_TAB: AnalyticsTabSegment = 'performance'
const DEFAULT_TESTING_TAB: TestingTabSegment = 'dashboard'
const DEFAULT_SETTINGS_TAB: SettingsTabSegment = 'account'

/** One entry per sidebar destination inside the dashboard shell. */
export type AppView =
  | { view: 'testing'; tab: TestingTabSegment; analyticsTab?: AnalyticsTabSegment }
  | { view: 'strategy' }
  | { view: 'billing' }
  | { view: 'settings'; tab: SettingsTabSegment }
  | { view: 'chart' }

export type ParsedAppPath = {
  localeTag: string
  page: AppPage
  /** Null for login and admin, which live outside the dashboard shell. */
  view: AppView | null
}

export function isTestingTabSegment(v: string): v is TestingTabSegment {
  return (TESTING_TAB_SEGMENTS as readonly string[]).includes(v)
}

export function isAnalyticsTabSegment(v: string): v is AnalyticsTabSegment {
  return (ANALYTICS_TAB_SEGMENTS as readonly string[]).includes(v)
}

export function isSettingsTabSegment(v: string): v is SettingsTabSegment {
  return (SETTINGS_TAB_SEGMENTS as readonly string[]).includes(v)
}

function trimPath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/'
}

function analyticsTabFromSearch(search: string): AnalyticsTabSegment {
  const raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('tab')
  return raw && isAnalyticsTabSegment(raw) ? raw : DEFAULT_ANALYTICS_TAB
}

/** Build the path (and query) for a dashboard-shell destination. */
export function viewPath(localeTag: string, view: AppView): string {
  switch (view.view) {
    case 'testing': {
      const base = `/${localeTag}/testing/${view.tab}`
      const analyticsTab = view.analyticsTab ?? DEFAULT_ANALYTICS_TAB
      return view.tab === 'analytics' && analyticsTab !== DEFAULT_ANALYTICS_TAB
        ? `${base}?tab=${analyticsTab}`
        : base
    }
    case 'settings':
      return `/${localeTag}/settings/${view.tab}`
    case 'strategy':
      return `/${localeTag}/strategy`
    case 'billing':
      return `/${localeTag}/billing`
    case 'chart':
      return `/${localeTag}/chart`
  }
}

/** Build a shell path. `dashboard` resolves to the testing home. */
export function appPath(localeTag: string, page: AppPage): string {
  switch (page) {
    case 'login':
      return `/${localeTag}/login`
    case 'admin':
      return `/${localeTag}/admin`
    case 'chart':
      return viewPath(localeTag, { view: 'chart' })
    case 'dashboard':
      return viewPath(localeTag, { view: 'testing', tab: DEFAULT_TESTING_TAB })
  }
}

/** Default-locale shortcuts (backward-compatible exports). */
export const LOGIN_PAGE_PATH = appPath(DEFAULT_LOCALE_TAG, 'login')
export const HOME_PAGE_PATH = appPath(DEFAULT_LOCALE_TAG, 'dashboard')
export const DASHBOARD_PAGE_PATH = HOME_PAGE_PATH
export const CHART_PAGE_PATH = appPath(DEFAULT_LOCALE_TAG, 'chart')

/** Legacy bare paths (pre-locale, and the old `/{locale}/dashboard`) → canonical. */
function legacyTarget(pathname: string): string | null {
  const p = trimPath(pathname)
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

/**
 * Parse a locale-prefixed app URL. `search` is only needed for views that keep
 * sub-tab state in the query string.
 */
export function parseAppPath(pathname: string, search = ''): ParsedAppPath | null {
  const m = /^\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/.exec(trimPath(pathname))
  if (!m) return null
  const localeTag = m[1]!
  const section = m[2]!
  const sub = m[3]
  if (!isKnownLocaleTag(localeTag)) return null

  switch (section) {
    case 'login':
      return sub ? null : { localeTag, page: 'login', view: null }
    case 'admin':
      return sub ? null : { localeTag, page: 'admin', view: null }
    case 'chart':
      return sub ? null : { localeTag, page: 'chart', view: { view: 'chart' } }
    case 'strategy':
      return sub ? null : { localeTag, page: 'dashboard', view: { view: 'strategy' } }
    case 'billing':
      return sub ? null : { localeTag, page: 'dashboard', view: { view: 'billing' } }
    case 'testing': {
      const tab = sub == null ? DEFAULT_TESTING_TAB : isTestingTabSegment(sub) ? sub : null
      if (!tab) return null
      return {
        localeTag,
        page: 'dashboard',
        view: { view: 'testing', tab, analyticsTab: analyticsTabFromSearch(search) },
      }
    }
    case 'settings': {
      const tab = sub == null ? DEFAULT_SETTINGS_TAB : isSettingsTabSegment(sub) ? sub : null
      if (!tab) return null
      return { localeTag, page: 'dashboard', view: { view: 'settings', tab } }
    }
    // Pre-Phase-3 canonical path; normalizes to the testing home below.
    case 'dashboard':
      return sub
        ? null
        : {
            localeTag,
            page: 'dashboard',
            view: { view: 'testing', tab: DEFAULT_TESTING_TAB },
          }
    default:
      return null
  }
}

/**
 * Normalize to the canonical path when recognized. Unknown paths come back
 * unchanged. The query string is not carried over — callers that need it (the
 * analytics sub-tab) compare against `viewPath` instead.
 */
export function normalizeAppPath(pathname: string): string {
  const parsed = parseAppPath(pathname)
  if (parsed) {
    return parsed.view ? viewPath(parsed.localeTag, parsed.view) : appPath(parsed.localeTag, parsed.page)
  }
  return legacyTarget(pathname) ?? trimPath(pathname)
}

export function isAppShellPath(pathname: string): boolean {
  return parseAppPath(normalizeAppPath(pathname)) != null
}

/** Redirect target for legacy, bare, or unknown-locale paths; null when canonical. */
export function canonicalPathFromLegacy(pathname: string): string | null {
  const p = trimPath(pathname)
  const normalized = normalizeAppPath(p)
  if (normalized !== p) return normalized

  // Recognized route behind an unknown locale tag, e.g. /xx/testing/trades.
  const m = /^\/([^/]+)(\/.+)$/.exec(p)
  if (m && !isKnownLocaleTag(m[1]!)) {
    const candidate = `/${DEFAULT_LOCALE_TAG}${m[2]!}`
    if (parseAppPath(candidate)) return normalizeAppPath(candidate)
  }
  return null
}

/** Current locale tag from the URL, or the stored preference. */
export function localeTagFromPath(pathname?: string): string {
  return (
    parseAppPath(normalizeAppPath(pathname ?? window.location.pathname))?.localeTag ??
    DEFAULT_LOCALE_TAG
  )
}

/** Current shell page from the URL, if on an app route. */
export function appPageFromPath(pathname?: string): AppPage | null {
  return parseAppPath(normalizeAppPath(pathname ?? window.location.pathname))?.page ?? null
}

/** Current dashboard-shell destination from the URL, if any. */
export function appViewFromPath(pathname?: string, search?: string): AppView | null {
  return (
    parseAppPath(
      normalizeAppPath(pathname ?? window.location.pathname),
      search ?? (typeof window === 'undefined' ? '' : window.location.search),
    )?.view ?? null
  )
}

function currentLocaleTag(): string | undefined {
  return parseAppPath(normalizeAppPath(window.location.pathname))?.localeTag
}

/** Build path for `page` using URL locale, an override, or the stored preference. */
export function resolveAppPath(page: AppPage, localeTag?: string): string {
  return appPath(localeTag ?? currentLocaleTag() ?? resolveLocaleTagFromStorage(), page)
}

/** Build path for an in-shell destination using URL locale, override, or storage. */
export function resolveViewPath(view: AppView, localeTag?: string): string {
  return viewPath(localeTag ?? currentLocaleTag() ?? resolveLocaleTagFromStorage(), view)
}

/** Dashboard home for the user's stored locale (post-login navigation). */
export function dashboardPathForUser(): string {
  return appPath(resolveLocaleTagFromStorage(), 'dashboard')
}

/** Sync URL locale tag → active translations, dashboard picker + `<html lang>`. */
export function applyLocaleFromPath(pathname?: string): ReturnType<typeof localeTagToDashCode> {
  const tag = localeTagFromPath(pathname)
  const code = localeTagToDashCode(tag)
  if (!code) return null
  setLocale(code)
  return code
}

export { dashCodeToLocaleTag, DEFAULT_LOCALE_TAG, localeTagToDashCode }
