/**
 * Runtime translation layer.
 *
 * The app renders its UI from template literals, so localization works in two
 * halves that have to agree:
 *
 *  1. `t()` / `te()` resolve a string at render time, so freshly built markup
 *     comes out in the active language.
 *  2. Markup that is already on screen is re-translated in place by
 *     `translateDom()`, which reads `data-i18n*` attributes. Any element whose
 *     text comes from `t()` must therefore also carry `data-i18n="<key>"` so it
 *     survives a language switch without a page reload.
 */
import { isDashLocaleCode, type DashLocaleCode } from '../home/dashboardLocales'
import { dashCodeToLocaleTag, persistDashLocaleCode } from '../appLocale'
import { MESSAGES, type MessageKey } from './messages'

export type { MessageKey } from './messages'

export type TranslateVars = Record<string, string | number>

const listeners = new Set<(code: DashLocaleCode) => void>()

let active: DashLocaleCode = 'en'

export function getLocale(): DashLocaleCode {
  return active
}

/**
 * BCP 47 tag for the active language, for `Intl` / `toLocaleString`. Dates and
 * month/day names come from the platform's locale data rather than our own
 * dictionaries, so they need the tag rather than the short code.
 */
export function activeLocaleTag(): string {
  return dashCodeToLocaleTag(active)
}

function interpolate(template: string, vars: TranslateVars): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

/** Active-locale string for `key`, falling back to English and then the key itself. */
export function t(key: MessageKey, vars?: TranslateVars): string {
  const raw = MESSAGES[active][key] ?? MESSAGES.en[key] ?? key
  return vars ? interpolate(raw, vars) : raw
}

/** Key groups that carry one entry per `Intl.PluralRules` category. */
export type PluralBaseKey = 'unit.sessions' | 'unit.trades' | 'unit.stars' | 'unit.wins' | 'unit.losses'

/**
 * Counted noun for the active locale, e.g. `1 session` / `4 sessions` /
 * `4 сесії`. Falls back to the `other` form when a locale omits a category.
 */
export function tCount(base: PluralBaseKey, count: number, vars?: TranslateVars): string {
  const category = new Intl.PluralRules(active).select(count)
  const dict = MESSAGES[active]
  const raw =
    dict[`${base}.${category}` as MessageKey] ??
    dict[`${base}.other` as MessageKey] ??
    MESSAGES.en[`${base}.${category}` as MessageKey] ??
    MESSAGES.en[`${base}.other` as MessageKey] ??
    base
  return interpolate(raw, { count, ...vars })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** `t()` escaped for interpolation into an HTML template literal. */
export function te(key: MessageKey, vars?: TranslateVars): string {
  return escapeHtml(t(key, vars))
}

/**
 * `t()` with inline emphasis for instructional copy: `**text**` becomes bold and
 * `` `text` `` becomes a key/button chip. Escaping happens before the markers are
 * expanded, so a translation can never inject markup of its own.
 */
export function tRich(key: MessageKey, vars?: TranslateVars): string {
  return escapeHtml(t(key, vars))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<kbd class="sx-kbd">$1</kbd>')
}

/**
 * Attributes that can be localized via `data-i18n-<attr>="<key>"`. Kept as an
 * explicit list because CSS cannot match attribute-name prefixes.
 */
const TRANSLATED_ATTRS = [
  'title',
  'placeholder',
  'alt',
  'value',
  'aria-label',
  'aria-placeholder',
  'aria-valuetext',
  'data-tip',
] as const

const TRANSLATED_SELECTOR = [
  '[data-i18n]',
  '[data-i18n-rich]',
  ...TRANSLATED_ATTRS.map((a) => `[data-i18n-${a}]`),
].join(',')

function translateElement(el: HTMLElement) {
  const textKey = el.getAttribute('data-i18n')
  if (textKey) el.textContent = t(textKey as MessageKey)
  // `data-i18n-rich` replaces the element's children, so it can't be combined
  // with `data-i18n` on the same element.
  const richKey = el.getAttribute('data-i18n-rich')
  if (richKey) el.innerHTML = tRich(richKey as MessageKey)
  for (const attr of TRANSLATED_ATTRS) {
    const key = el.getAttribute(`data-i18n-${attr}`)
    if (key) el.setAttribute(attr, t(key as MessageKey))
  }
}

/** Re-translate every `data-i18n*` element inside (and including) `root`. */
export function translateDom(root: ParentNode = document.body): void {
  if (root instanceof HTMLElement && root.matches(TRANSLATED_SELECTOR)) translateElement(root)
  root.querySelectorAll<HTMLElement>(TRANSLATED_SELECTOR).forEach(translateElement)
}

/**
 * Switch language: persist the choice, re-translate the live DOM, then let
 * feature code re-render whatever it builds imperatively.
 */
export function setLocale(code: string): DashLocaleCode {
  const next = isDashLocaleCode(code) ? code : 'en'
  active = next
  persistDashLocaleCode(next)
  translateDom()
  for (const fn of listeners) fn(next)
  return next
}

/** Subscribe to language changes; returns an unsubscribe function. */
export function onLocaleChange(fn: (code: DashLocaleCode) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
