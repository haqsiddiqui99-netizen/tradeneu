import './legalDocModal.css'
import { getTradeneuPrivacyHtml, TRADENEU_PRIVACY_TITLE } from './tradeneuPrivacyContent'
import { getTradeneuTermsHtml, TRADENEU_TERMS_TITLE } from './tradeneuTermsContent'

export type LegalDocKind = 'terms' | 'privacy'

export function openLegalDocModal(kind: LegalDocKind = 'terms'): void {
  const existing = document.querySelector('.sx-legal')
  if (existing) existing.remove()

  const title = kind === 'privacy' ? TRADENEU_PRIVACY_TITLE : TRADENEU_TERMS_TITLE
  const bodyHtml = kind === 'privacy' ? getTradeneuPrivacyHtml() : getTradeneuTermsHtml()

  const root = document.createElement('div')
  root.className = 'sx-legal'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'sx-legal-title')
  root.innerHTML = `
    <div class="sx-legal__backdrop" data-sx-legal-close></div>
    <div class="sx-legal__panel">
      <header class="sx-legal__head">
        <h2 class="sx-legal__title" id="sx-legal-title">${title}</h2>
        <button type="button" class="sx-legal__close" data-sx-legal-close aria-label="Close">×</button>
      </header>
      <div class="sx-legal__body">${bodyHtml}</div>
      <footer class="sx-legal__foot">
        <button type="button" class="sx-legal__done" data-sx-legal-close>Close</button>
      </footer>
    </div>
  `

  const close = () => {
    document.removeEventListener('keydown', onKey)
    root.remove()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
  }

  root.querySelectorAll('[data-sx-legal-close]').forEach((el) => {
    el.addEventListener('click', close)
  })
  document.addEventListener('keydown', onKey)
  document.body.appendChild(root)
  ;(root.querySelector('.sx-legal__done') as HTMLButtonElement | null)?.focus()
}
