/** Outline T monogram used on the landing page, login, and in-app chrome. */
export function tradeneuMarkSvg(className = 'sx-brand__mark'): string {
  return `<svg class="${className}" viewBox="0 0 32 32" aria-hidden="true"><rect x="3.2" y="3.2" width="25.6" height="25.6" rx="7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 11.2h12M16 11.2v11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`
}

/** Mark plus the Tradeneu word. Color follows the surrounding text. */
export function tradeneuBrandHtml(): string {
  return `<span class="sx-brand">${tradeneuMarkSvg()}<span class="sx-brand__word">Tradeneu</span></span>`
}
