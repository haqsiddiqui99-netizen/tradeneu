import './landingPage.css'
import { resolveAppPath } from '../appPaths'
import { te, translateDom, type MessageKey } from '../i18n'
import {
  buildHeroSparkSvg,
  HERO_EXAMPLE_CURVE,
  HERO_EXAMPLE_NET,
  HERO_EXAMPLE_PRICE,
  HERO_EXAMPLE_WINRATE,
} from '../home/heroSparkline'

/**
 * Public marketing page for visitors who aren't signed in. Deliberately static:
 * no session store, no charts library, no dashboard shell — just copy, one
 * illustrative sparkline, and two routes into the login gate.
 *
 * Always dark, independent of the in-app theme toggle, so it doesn't inherit a
 * preference the visitor hasn't set yet.
 */
export function mountLandingPage(root: HTMLElement): void {
  const loginPath = resolveAppPath('login')

  const whyCards = [1, 2, 3]
    .map((n) => {
      const titleKey = `landing.why.card${n}Title` as MessageKey
      const descKey = `landing.why.card${n}Desc` as MessageKey
      return `
            <li class="sx-landing-why__card">
              <h3 class="sx-landing-why__card-title" data-i18n="${titleKey}">${te(titleKey)}</h3>
              <p class="sx-landing-why__card-desc" data-i18n="${descKey}">${te(descKey)}</p>
            </li>`
    })
    .join('')

  root.innerHTML = `
<div class="sx-landing">
  <header class="sx-landing__nav">
    <div class="sx-landing__nav-inner">
      <a class="sx-landing__brand" href="${loginPath}">
        <span class="sx-landing__brand-mark" aria-hidden="true">TN</span>
        <span class="sx-landing__brand-name">Tradeneu</span>
      </a>
      <nav class="sx-landing__links" aria-label="Tradeneu">
        <span class="sx-landing__link" data-i18n="landing.nav.product">${te('landing.nav.product')}</span>
        <span class="sx-landing__link" data-i18n="landing.nav.markets">${te('landing.nav.markets')}</span>
        <span class="sx-landing__link" data-i18n="landing.nav.pricing">${te('landing.nav.pricing')}</span>
      </nav>
      <div class="sx-landing__nav-actions">
        <a class="sx-landing__signin" href="${loginPath}" data-i18n="landing.nav.signIn">${te('landing.nav.signIn')}</a>
        <a class="sx-landing-btn sx-landing-btn--primary" href="${loginPath}" data-i18n="landing.cta">${te('landing.cta')}</a>
      </div>
    </div>
  </header>

  <main class="sx-landing__main">
    <section class="sx-landing-hero">
      <div class="sx-landing-hero__copy">
        <p class="sx-landing-hero__eyebrow" data-i18n="landing.eyebrow">${te('landing.eyebrow')}</p>
        <h1 class="sx-landing-hero__title" data-i18n="landing.title">${te('landing.title')}</h1>
        <p class="sx-landing-hero__sub" data-i18n="landing.sub">${te('landing.sub')}</p>
        <div class="sx-landing-hero__actions">
          <a class="sx-landing-btn sx-landing-btn--primary" href="${loginPath}" data-i18n="landing.cta">${te('landing.cta')}</a>
          <a class="sx-landing-btn sx-landing-btn--ghost" href="#sx-landing-example" data-i18n="landing.sampleCta">${te('landing.sampleCta')}</a>
        </div>
        <p class="sx-landing-hero__note" data-i18n="landing.note">${te('landing.note')}</p>
      </div>

      <aside class="sx-landing-card" id="sx-landing-example" aria-label="${te('landing.example.aria')}" data-i18n-aria-label="landing.example.aria">
        <div class="sx-landing-card__head">
          <span class="sx-landing-card__symbol" data-i18n="landing.example.symbol">${te('landing.example.symbol')}</span>
          <span class="sx-landing-card__price">${HERO_EXAMPLE_PRICE}</span>
        </div>
        <p class="sx-landing-card__meta" data-i18n="landing.example.meta">${te('landing.example.meta')}</p>
        <div class="sx-landing-card__spark" role="img" aria-label="${te('landing.example.equityAria')}" data-i18n-aria-label="landing.example.equityAria">${buildHeroSparkSvg([...HERO_EXAMPLE_CURVE])}</div>
        <div class="sx-landing-card__stats">
          <div class="sx-landing-stat">
            <span class="sx-landing-stat__label" data-i18n="landing.netResult">${te('landing.netResult')}</span>
            <strong class="sx-landing-stat__value is-profit">${HERO_EXAMPLE_NET}</strong>
          </div>
          <div class="sx-landing-stat">
            <span class="sx-landing-stat__label" data-i18n="landing.winRate">${te('landing.winRate')}</span>
            <strong class="sx-landing-stat__value">${HERO_EXAMPLE_WINRATE}</strong>
          </div>
        </div>
      </aside>
    </section>

    <section class="sx-landing-why" aria-labelledby="sx-landing-why-title">
      <h2 class="sx-landing-why__title" id="sx-landing-why-title" data-i18n="landing.why.title">${te('landing.why.title')}</h2>
      <p class="sx-landing-why__sub" data-i18n="landing.why.sub">${te('landing.why.sub')}</p>
      <ul class="sx-landing-why__grid">${whyCards}
      </ul>
    </section>
  </main>

  <footer class="sx-landing__foot">
    <p class="sx-landing__foot-text" data-i18n="landing.footer">${te('landing.footer')}</p>
  </footer>
</div>`

  translateDom(root)
}
