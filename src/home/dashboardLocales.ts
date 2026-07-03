export const DASH_LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'uk', name: 'Українська' },
  { code: 'ja', name: '日本語' },
] as const

export type DashLocaleCode = (typeof DASH_LOCALES)[number]['code']

export function isDashLocaleCode(v: string): v is DashLocaleCode {
  return DASH_LOCALES.some((l) => l.code === v)
}

export function dashLocaleMenuLabel(code: string, name: string): string {
  return `${name} (${code.toUpperCase()})`
}
