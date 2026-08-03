import { isDashLocaleCode, type DashLocaleCode } from './home/dashboardLocales'

/** Default BCP47 tag in URLs (English). */
export const DEFAULT_LOCALE_TAG = 'en-US'

/** Dashboard language picker code → URL locale segment. */
export const DASH_CODE_TO_LOCALE_TAG: Record<DashLocaleCode, string> = {
  en: 'en-US',
  es: 'es',
  de: 'de',
  fr: 'fr',
  tr: 'tr',
  uk: 'uk',
  ja: 'ja',
}

export function dashCodeToLocaleTag(code: string): string {
  if (isDashLocaleCode(code)) return DASH_CODE_TO_LOCALE_TAG[code]
  return DEFAULT_LOCALE_TAG
}

export function localeTagToDashCode(tag: string): DashLocaleCode | null {
  const lower = tag.trim().toLowerCase()
  for (const [code, urlTag] of Object.entries(DASH_CODE_TO_LOCALE_TAG) as [DashLocaleCode, string][]) {
    if (urlTag.toLowerCase() === lower) return code
  }
  if (isDashLocaleCode(lower)) return lower
  return null
}

export function isKnownLocaleTag(tag: string): boolean {
  return localeTagToDashCode(tag) != null
}

const LS_LOCALE = 'suplexity-dash-locale'

/** Prefer stored picker locale; default English. */
export function resolveLocaleTagFromStorage(): string {
  try {
    const v = localStorage.getItem(LS_LOCALE)
    if (v && isDashLocaleCode(v.toLowerCase())) return dashCodeToLocaleTag(v.toLowerCase())
  } catch {
    /* noop */
  }
  return DEFAULT_LOCALE_TAG
}

export function persistDashLocaleCode(code: DashLocaleCode): void {
  try {
    localStorage.setItem(LS_LOCALE, code)
  } catch {
    /* noop */
  }
  document.documentElement.lang = code
}
