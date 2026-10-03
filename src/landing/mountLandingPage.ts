import './landingPage.css'
import { resolveAppPath } from '../appPaths'
import { te, translateDom, type MessageKey } from '../i18n'
import {
  HERO_EXAMPLE_NET,
  HERO_EXAMPLE_PRICE,
  HERO_EXAMPLE_WINRATE,
} from '../home/heroSparkline'

/**
 * Public marketing page. Static on purpose: no session store and no charting
 * library. The terminal on the right is a drawn example, labelled as one, so a
 * visitor from a trading desk can see the replay cursor before they sign in.
 *
 * Always dark. A signed-out visitor has not chosen a chart theme yet.
 */
export function mountLandingPage(root: HTMLElement): void {
  const loginPath = resolveAppPath('login')

  const whyCards = [1, 2, 3]
    .map((n) => {
      const titleKey = `landing.why.card${n}Title` as MessageKey
      const descKey = `landing.why.card${n}Desc` as MessageKey
      return `
            <li class="sx-land-why__card">
              <span class="sx-land-why__index">0${n}</span>
              <h3 data-i18n="${titleKey}">${te(titleKey)}</h3>
              <p data-i18n="${descKey}">${te(descKey)}</p>
            </li>`
    })
    .join('')

  const steps = [1, 2, 3]
    .map((n) => {
      const titleKey = `landing.how.step${n}Title` as MessageKey
      const descKey = `landing.how.step${n}Desc` as MessageKey
      return `
            <li class="sx-land-step">
              <span class="sx-land-step__n">${n}</span>
              <div>
                <h3 data-i18n="${titleKey}">${te(titleKey)}</h3>
                <p data-i18n="${descKey}">${te(descKey)}</p>
              </div>
            </li>`
    })
    .join('')

  const markets = [
    ['XAUUSD', 'Gold', 'Metals'],
    ['EURUSD', 'Euro / Dollar', 'FX'],
    ['GBPUSD', 'Sterling / Dollar', 'FX'],
    ['USDJPY', 'Dollar / Yen', 'FX'],
    ['NAS100', 'Nasdaq 100', 'Index'],
    ['BTCUSD', 'Bitcoin', 'Crypto'],
  ]
    .map(
      ([symbol, name, kind]) => `
            <li class="sx-land-mkt">
              <span class="sx-land-mkt__kind">${kind}</span>
              <strong>${symbol}</strong>
              <span>${name}</span>
            </li>`,
    )
    .join('')

  root.innerHTML = `
<div class="sx-land">
  <header class="sx-land__nav">
    <div class="sx-land__nav-inner">
      <a class="sx-land__brand" href="#top">
        <span class="sx-land__mark" aria-hidden="true"></span>
        <span>Tradeneu</span>
      </a>
      <nav class="sx-land__links" aria-label="Tradeneu">
        <a href="#product" data-i18n="landing.nav.product">${te('landing.nav.product')}</a>
        <a href="#markets" data-i18n="landing.nav.markets">${te('landing.nav.markets')}</a>
        <a href="#start" data-i18n="landing.nav.pricing">${te('landing.nav.pricing')}</a>
      </nav>
      <div class="sx-land__nav-actions">
        <a class="sx-land__signin" href="${loginPath}" data-i18n="landing.nav.signIn">${te('landing.nav.signIn')}</a>
        <a class="sx-land-btn sx-land-btn--solid" href="${loginPath}" data-i18n="landing.cta">${te('landing.cta')}</a>
      </div>
    </div>
  </header>

  <main id="top">
    <section class="sx-land-hero">
      <div class="sx-land-hero__copy">
        <p class="sx-land-hero__eyebrow" data-i18n="landing.eyebrow">${te('landing.eyebrow')}</p>
        <h1 data-i18n="landing.title">${te('landing.title')}</h1>
        <p class="sx-land-hero__sub" data-i18n="landing.sub">${te('landing.sub')}</p>
        <div class="sx-land-hero__actions">
          <a class="sx-land-btn sx-land-btn--solid" href="${loginPath}" data-i18n="landing.cta">${te('landing.cta')}</a>
          <a class="sx-land-btn sx-land-btn--line" href="#product" data-i18n="landing.sampleCta">${te('landing.sampleCta')}</a>
        </div>
        <p class="sx-land-hero__note" data-i18n="landing.note">${te('landing.note')}</p>
      </div>

      <aside class="sx-term" id="sx-landing-example" aria-label="${te('landing.example.aria')}" data-i18n-aria-label="landing.example.aria">
        <div class="sx-term__bar">
          <span class="sx-term__sym" data-i18n="landing.example.symbol">${te('landing.example.symbol')}</span>
          <span class="sx-term__px">${HERO_EXAMPLE_PRICE}</span>
          <span class="sx-term__badge" data-i18n="landing.terminal.live">${te('landing.terminal.live')}</span>
        </div>
        <div class="sx-term__plot" role="img" aria-label="${te('landing.example.equityAria')}" data-i18n-aria-label="landing.example.equityAria">
          ${replayPlotSvg()}
          <span class="sx-term__tag sx-term__tag--cursor" data-i18n="landing.terminal.cursor">${te('landing.terminal.cursor')}</span>
          <span class="sx-term__tag sx-term__tag--hidden" data-i18n="landing.terminal.hidden">${te('landing.terminal.hidden')}</span>
        </div>
        <p class="sx-term__meta" data-i18n="landing.example.meta">${te('landing.example.meta')}</p>
        <dl class="sx-term__stats">
          <div>
            <dt data-i18n="landing.netResult">${te('landing.netResult')}</dt>
            <dd class="is-up">${HERO_EXAMPLE_NET}</dd>
          </div>
          <div>
            <dt data-i18n="landing.winRate">${te('landing.winRate')}</dt>
            <dd>${HERO_EXAMPLE_WINRATE}</dd>
          </div>
          <div>
            <dt data-i18n="landing.stat.trades">${te('landing.stat.trades')}</dt>
            <dd>24</dd>
          </div>
          <div>
            <dt data-i18n="landing.stat.drawdown">${te('landing.stat.drawdown')}</dt>
            <dd class="is-down">−1.8R</dd>
          </div>
        </dl>
      </aside>
    </section>

    <section class="sx-land-how" id="product" aria-labelledby="sx-land-how-title">
      <div class="sx-land-how__head">
        <h2 id="sx-land-how-title" data-i18n="landing.how.title">${te('landing.how.title')}</h2>
        <p data-i18n="landing.how.sub">${te('landing.how.sub')}</p>
      </div>
      <ol class="sx-land-how__list">${steps}</ol>
    </section>

    <section class="sx-land-why" aria-labelledby="sx-land-why-title">
      <h2 id="sx-land-why-title" data-i18n="landing.why.title">${te('landing.why.title')}</h2>
      <p class="sx-land-why__sub" data-i18n="landing.why.sub">${te('landing.why.sub')}</p>
      <ul class="sx-land-why__grid">${whyCards}</ul>
    </section>

    <section class="sx-land-markets" id="markets" aria-labelledby="sx-land-mkt-title">
      <div class="sx-land-markets__head">
        <h2 id="sx-land-mkt-title" data-i18n="landing.markets.title">${te('landing.markets.title')}</h2>
        <p data-i18n="landing.markets.sub">${te('landing.markets.sub')}</p>
      </div>
      <ul class="sx-land-markets__grid">${markets}</ul>
    </section>

    <section class="sx-land-final" id="start">
      <h2 data-i18n="landing.final.title">${te('landing.final.title')}</h2>
      <p data-i18n="landing.final.sub">${te('landing.final.sub')}</p>
      <a class="sx-land-btn sx-land-btn--solid" href="${loginPath}" data-i18n="landing.cta">${te('landing.cta')}</a>
    </section>
  </main>

  <footer class="sx-land__foot">
    <span>Tradeneu</span>
    <p data-i18n="landing.footer">${te('landing.footer')}</p>
  </footer>
</div>`

  translateDom(root)
}

/** Example 15m gold tape. Bars after the cursor are drawn, then washed, the way a replay hides them. */
function replayPlotSvg(): string {
  // y grows downward, so a higher price is a smaller number. [x, open, close, high, low]
  const bars: Array<[number, number, number, number, number]> = [
    [18, 78, 64, 58, 84],
    [36, 64, 72, 58, 78],
    [54, 72, 60, 54, 78],
    [72, 60, 68, 54, 74],
    [90, 68, 56, 50, 74],
    [108, 56, 64, 50, 70],
    [126, 64, 52, 46, 70],
    [144, 52, 60, 46, 66],
    [162, 60, 48, 42, 66],
    [180, 48, 56, 42, 62],
    [198, 56, 44, 38, 62],
    [216, 44, 52, 38, 58],
    [234, 52, 40, 34, 58],
    [252, 40, 48, 34, 54],
    [270, 48, 36, 30, 54],
    [288, 36, 44, 30, 50],
    [306, 44, 34, 28, 50],
    [324, 34, 42, 28, 48],
    [342, 42, 32, 26, 48],
    [360, 32, 40, 26, 46],
    [392, 40, 48, 34, 54],
    [410, 48, 42, 36, 54],
    [428, 42, 50, 36, 56],
    [446, 50, 44, 38, 56],
    [464, 44, 52, 38, 58],
    [482, 52, 46, 40, 58],
    [500, 46, 54, 40, 60],
    [518, 54, 48, 42, 60],
  ]
  const body = bars
    .map(([x, open, close, high, low], i) => {
      const up = close < open
      const top = Math.min(open, close)
      const h = Math.max(2, Math.abs(close - open))
      const wash = i >= 20 ? ' is-future' : ''
      const color = up ? '#1f9d72' : '#d2544a'
      return `<g class="sx-term__bar-g${wash}"><line x1="${x}" y1="${high}" x2="${x}" y2="${low}" stroke="${color}" stroke-width="1.25"/><rect x="${x - 4.5}" y="${top}" width="9" height="${h}" fill="${color}"/></g>`
    })
    .join('')
  return `<svg viewBox="0 0 540 120" preserveAspectRatio="none" aria-hidden="true">
    <line class="sx-term__grid" x1="0" y1="30" x2="540" y2="30"/>
    <line class="sx-term__grid" x1="0" y1="60" x2="540" y2="60"/>
    <line class="sx-term__grid" x1="0" y1="90" x2="540" y2="90"/>
    ${body}
    <line class="sx-term__cursor" x1="376" y1="6" x2="376" y2="114"/>
  </svg>`
}
