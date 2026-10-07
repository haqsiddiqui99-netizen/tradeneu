import './landingPage.css'
import { resolveAppPath } from '../appPaths'
import { te, translateDom, type MessageKey } from '../i18n'
import { FEATURE_GROUPS, PRICING } from '../views/planCatalog'
import {
  HERO_EXAMPLE_CURVE,
  HERO_EXAMPLE_NET,
  HERO_EXAMPLE_PRICE,
  HERO_EXAMPLE_WINRATE,
} from '../home/heroSparkline'
import { tradeneuMarkSvg } from '../brand/tradeneuMark'

const CARD_FEATURES = {
  free: ['2 backtesting sessions', '1 indicator', '1 week data retention'],
  intermediate: [
    '10 backtesting sessions',
    '200 records per session',
    '6 months data retention',
    '3 indicators',
    '2 charts',
    'Limited AI queries',
    'Standard market data',
  ],
  pro: [
    'Unlimited backtesting sessions',
    'Unlimited records per session',
    'Unlimited data retention',
    'Unlimited indicators',
    'Unlimited charts',
    'Unlimited AI queries',
    'Expanded data and seconds-level intervals',
  ],
} as const

function featureList(tier: keyof typeof CARD_FEATURES): string {
  return `<ul class="sx-price-card__feats">${CARD_FEATURES[tier].map((item) => `<li>${item}</li>`).join('')}</ul>`
}

function compareCell(value: string): string {
  if (value === '✓') return '<span class="is-yes">✓</span>'
  if (value === '×') return '<span class="is-no">—</span>'
  return value
}

function compareTables(): string {
  return FEATURE_GROUPS.map(
    (group) => `
      <h3 class="sx-price-group">${group.title}</h3>
      <div class="sx-price-table-wrap">
        <table class="sx-price-table">
          <tbody>
            ${group.rows
              .map(
                (row) =>
                  `<tr><th scope="row">${row.label}</th><td>${compareCell(row.free)}</td><td>${compareCell(row.mid)}</td><td>${compareCell(row.pro)}</td></tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`,
  ).join('')
}

const MARK = tradeneuMarkSvg('sx-land__mark')

const CHEVRON = `<svg class="sx-land-drop__chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`

function navDrop(
  id: string,
  label: string,
  items: Array<[string, string, string, string]>,
  pricing = false,
): string {
  const links = items
    .map(
      ([href, icon, title, detail]) => `
        <a class="sx-land-drop__item" href="${href}" ${pricing ? 'data-land-pricing' : 'data-land-home'}>
          <span class="sx-land-drop__ico" aria-hidden="true">${icon}</span>
          <span>
            <strong>${title}</strong>
            <span>${detail}</span>
          </span>
        </a>`,
    )
    .join('')
  return `
    <div class="sx-land-drop${pricing ? ' sx-land-drop--end' : ''}" data-land-drop="${id}">
      <button type="button" class="sx-land-drop__btn" aria-expanded="false" aria-haspopup="true">
        <span>${label}</span>
        ${CHEVRON}
      </button>
      <div class="sx-land-drop__panel" hidden>
        ${links}
      </div>
    </div>`
}

/**
 * Public marketing page. Static on purpose: no session store and no charting
 * library. The app window in the hero is a drawn example, labelled as one, so a
 * visitor can see the replay cursor and hidden future before they sign in.
 *
 * Always dark. A signed-out visitor has not chosen a chart theme yet.
 */
export function mountLandingPage(root: HTMLElement): void {
  const loginPath = resolveAppPath('login')

  const whyVisuals = [whyVisualHidden(), whyVisualLog(), whyVisualInsight()]
  const whyCards = [1, 2, 3]
    .map((n) => {
      const titleKey = `landing.why.card${n}Title` as MessageKey
      const descKey = `landing.why.card${n}Desc` as MessageKey
      return `
            <li class="sx-land-why__card sx-land-why__card--${n}">
              <div class="sx-land-why__visual" aria-hidden="true">${whyVisuals[n - 1]}</div>
              <span class="sx-land-why__index">0${n}</span>
              <h3 data-i18n="${titleKey}">${te(titleKey)}</h3>
              <p data-i18n="${descKey}">${te(descKey)}</p>
            </li>`
    })
    .join('')

  const stepIcons = [ICON_TARGET, ICON_STEP, ICON_CHART]
  const steps = [1, 2, 3]
    .map((n) => {
      const titleKey = `landing.how.step${n}Title` as MessageKey
      const descKey = `landing.how.step${n}Desc` as MessageKey
      return `
            <li class="sx-land-step">
              <div class="sx-land-step__top">
                <span class="sx-land-step__ico" aria-hidden="true">${stepIcons[n - 1]}</span>
                <span class="sx-land-step__n">0${n}</span>
              </div>
              <h3 data-i18n="${titleKey}">${te(titleKey)}</h3>
              <p data-i18n="${descKey}">${te(descKey)}</p>
            </li>`
    })
    .join('')

  const marketList: Array<[string, string, string, string]> = [
    ['XAUUSD', 'Gold', 'Metals', '+0.84%'],
    ['EURUSD', 'Euro / Dollar', 'FX', '+0.12%'],
    ['GBPUSD', 'Sterling / Dollar', 'FX', '−0.21%'],
    ['USDJPY', 'Dollar / Yen', 'FX', '+0.37%'],
    ['NAS100', 'Nasdaq 100', 'Index', '+1.06%'],
    ['BTCUSD', 'Bitcoin', 'Crypto', '+2.41%'],
  ]
  const markets = marketList
    .map(
      ([symbol, name, kind, chg], i) => `
            <li class="sx-land-mkt" style="--mkt-i:${i}">
              <div class="sx-land-mkt__row">
                <span class="sx-land-mkt__kind">${kind}</span>
                <span class="sx-land-mkt__chg${chg.startsWith('−') ? ' is-down' : ''}">${chg}</span>
              </div>
              <strong>${symbol}</strong>
              <span class="sx-land-mkt__name">${name}</span>
              ${miniSparkSvg(i + 3, !chg.startsWith('−'))}
            </li>`,
    )
    .join('')

  const tickerItems = marketList
    .map(
      ([symbol, , kind]) =>
        `<li><strong>${symbol}</strong><span>${kind}</span></li>`,
    )
    .join('')

  root.innerHTML = `
<div class="sx-land">
  <div class="sx-land__aurora" aria-hidden="true"></div>
  <header class="sx-land__nav">
    <div class="sx-land__nav-inner">
      <a class="sx-land__brand" href="#top" data-land-home>
        ${MARK}
        <span class="sx-land__word">Tradeneu</span>
      </a>
      <nav class="sx-land__links" aria-label="Tradeneu">
        ${navDrop('product', te('landing.nav.product'), [
          ['#product', ICON_STEP, 'Bar replay', 'Advance one candle at a time. The bars ahead stay hidden.'],
          ['#product', ICON_CHART, 'Session journal', 'Entries, exits and stops are kept with the replay.'],
          ['#product', ICON_TARGET, 'Why it lost', 'A plain-language read of what pushed a trade into the red.'],
          ['#product', ICON_PLAY, 'Practice desk', 'The same sequence as a live chart, opened on history.'],
        ])}
        ${navDrop('markets', te('landing.nav.markets'), [
          ['#markets', ICON_CHART, 'Metals', 'XAUUSD gold, replayed from Dukascopy history.'],
          ['#markets', ICON_CHART, 'FX', 'EURUSD, GBPUSD and USDJPY on the same desk.'],
          ['#markets', ICON_CHART, 'Indices', 'NAS100 and the rest of the index book.'],
          ['#markets', ICON_CHART, 'Crypto', 'BTCUSD when you want a different tape.'],
        ])}
        ${navDrop('pricing', te('landing.nav.pricing'), [
          ['#pricing', ICON_TARGET, 'Beginner', 'Free for everyone. A short book to start replaying.'],
          ['#pricing', ICON_CHART, 'Intermediate', `$${PRICING.monthly.intermediate.label} a month. More sessions, charts and AI.`],
          ['#pricing', ICON_STEP, 'Pro', `$${PRICING.monthly.pro.label} a month. Unlimited replay, charts and AI.`],
        ], true)}
      </nav>
      <div class="sx-land__nav-actions">
        <a class="sx-land__signin" href="${loginPath}">
          ${ICON_USER}
          <span data-i18n="landing.nav.signIn">${te('landing.nav.signIn')}</span>
        </a>
      </div>
    </div>
  </header>

  <main id="top">
    <section class="sx-land-hero">
      <div class="sx-land-hero__copy">
        <h1>
          <span class="sx-land-hero__lead" data-i18n="landing.titleLead">${te('landing.titleLead')}</span>
          <span class="sx-land-hero__accent" data-i18n="landing.titleAccent">${te('landing.titleAccent')}</span>
        </h1>
        <p class="sx-land-hero__sub" data-i18n="landing.heroSub">${te('landing.heroSub')}</p>
        <div class="sx-land-hero__actions">
          <a class="sx-land-btn sx-land-btn--solid sx-land-btn--lg" href="${loginPath}">
            <span data-i18n="landing.cta">${te('landing.cta')}</span>
            ${ICON_ARROW}
          </a>
        </div>
        <p class="sx-land-hero__note" data-i18n="landing.note">${te('landing.note')}</p>
      </div>

      <div class="sx-land-stage">
        <div class="sx-land-stage__glow" aria-hidden="true"></div>
        <div class="sx-land-stage__glow sx-land-stage__glow--foot" aria-hidden="true"></div>
        ${appWindow()}
        <div class="sx-land-float sx-land-float--net" aria-hidden="true">
          <span class="sx-land-float__label" data-i18n="landing.netResult">${te('landing.netResult')}</span>
          <strong class="is-up">${HERO_EXAMPLE_NET}</strong>
          <span class="sx-land-float__sub" data-i18n="landing.app.equity">${te('landing.app.equity')}</span>
          ${equitySparkSvg()}
        </div>
        <div class="sx-land-float sx-land-float--win" aria-hidden="true">
          ${winRing(HERO_EXAMPLE_WINRATE)}
          <div>
            <span class="sx-land-float__label" data-i18n="landing.winRate">${te('landing.winRate')}</span>
            <strong>${HERO_EXAMPLE_WINRATE}</strong>
            <span class="sx-land-float__sub">24 <span data-i18n="landing.stat.trades">${te('landing.stat.trades')}</span></span>
          </div>
        </div>
      </div>
      <p class="sx-land-stage__caption" data-i18n="landing.example.meta">${te('landing.example.meta')}</p>
    </section>

    <section class="sx-land-ticker" aria-label="${te('landing.ticker.title')}" data-i18n-aria-label="landing.ticker.title">
      <p class="sx-land-ticker__title" data-i18n="landing.ticker.title">${te('landing.ticker.title')}</p>
      <div class="sx-land-ticker__track">
        <ul>${tickerItems}${tickerItems}</ul>
        <ul aria-hidden="true">${tickerItems}${tickerItems}</ul>
      </div>
    </section>

    <section class="sx-land-how" id="product" aria-labelledby="sx-land-how-title">
      <div class="sx-land-head">
        <span class="sx-land-pill" data-i18n="landing.how.pill">${te('landing.how.pill')}</span>
        <h2 id="sx-land-how-title" data-i18n="landing.how.title">${te('landing.how.title')}</h2>
        <p data-i18n="landing.how.sub">${te('landing.how.sub')}</p>
      </div>
      <ol class="sx-land-how__list">${steps}</ol>
    </section>

    <section class="sx-land-why" aria-labelledby="sx-land-why-title">
      <div class="sx-land-head">
        <span class="sx-land-pill" data-i18n="landing.why.pill">${te('landing.why.pill')}</span>
        <h2 id="sx-land-why-title" data-i18n="landing.why.title">${te('landing.why.title')}</h2>
        <p data-i18n="landing.why.sub">${te('landing.why.sub')}</p>
      </div>
      <ul class="sx-land-why__grid">${whyCards}</ul>
    </section>

    <section class="sx-land-markets" id="markets" aria-labelledby="sx-land-mkt-title">
      <div class="sx-land-head">
        <span class="sx-land-pill" data-i18n="landing.markets.pill">${te('landing.markets.pill')}</span>
        <h2 id="sx-land-mkt-title" data-i18n="landing.markets.title">${te('landing.markets.title')}</h2>
        <p data-i18n="landing.markets.sub">${te('landing.markets.sub')}</p>
      </div>
      <ul class="sx-land-markets__grid">${markets}</ul>
    </section>

    <section class="sx-land-final" id="start">
      <div class="sx-land-final__glow" aria-hidden="true"></div>
      <span class="sx-land-pill" data-i18n="landing.final.pill">${te('landing.final.pill')}</span>
      <h2 data-i18n="landing.final.title">${te('landing.final.title')}</h2>
      <p data-i18n="landing.final.sub">${te('landing.final.sub')}</p>
      <a class="sx-land-btn sx-land-btn--solid sx-land-btn--lg" href="${loginPath}">
        <span data-i18n="landing.cta">${te('landing.cta')}</span>
        ${ICON_ARROW}
      </a>
    </section>

    <section class="sx-land-price" id="pricing" aria-labelledby="sx-land-price-title">
      <p class="sx-price-pill" data-i18n="landing.price.eyebrow">${te('landing.price.eyebrow')}</p>
      <h2 id="sx-land-price-title" data-i18n="landing.price.title">${te('landing.price.title')}</h2>
      <div class="sx-price-cycle" role="group" aria-label="${te('landing.nav.pricing')}">
        <button type="button" class="is-on" data-cycle="monthly" data-i18n="landing.price.monthly">${te('landing.price.monthly')}</button>
        <button type="button" data-cycle="yearly" data-i18n="landing.price.yearly">${te('landing.price.yearly')}</button>
        <span class="sx-price-save" data-i18n="landing.price.save">${te('landing.price.save')}</span>
      </div>
      <ul class="sx-price-grid">
        <li class="sx-price-card">
          <h3 data-i18n="landing.price.beginner">${te('landing.price.beginner')}</h3>
          <p class="sx-price-card__amount"><span data-i18n="landing.price.free">${te('landing.price.free')}</span></p>
          <p class="sx-price-card__bill" data-i18n="landing.price.freeFor">${te('landing.price.freeFor')}</p>
          <a class="sx-price-card__btn" href="${loginPath}" data-i18n="landing.price.startFree">${te('landing.price.startFree')}</a>
          ${featureList('free')}
        </li>
        <li class="sx-price-card">
          <h3 data-i18n="landing.price.intermediate">${te('landing.price.intermediate')}</h3>
          <p class="sx-price-card__amount">$<span data-price="intermediate">${PRICING.monthly.intermediate.label}</span> <small data-price-unit="intermediate">USD /mo</small></p>
          <p class="sx-price-card__bill" data-price-bill="intermediate" data-i18n="landing.price.billedMonthly">${te('landing.price.billedMonthly')}</p>
          <p class="sx-price-card__extra" data-price-extra="intermediate" hidden></p>
          <a class="sx-price-card__btn" href="${loginPath}" data-i18n="landing.price.trial">${te('landing.price.trial')}</a>
          <p class="sx-price-card__tax" data-i18n="landing.price.tax">${te('landing.price.tax')}</p>
          ${featureList('intermediate')}
        </li>
        <li class="sx-price-card sx-price-card--pro">
          <span class="sx-price-card__deal"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.4 14.2 6.1 8 14.6 1.8 6.1 8 1.4Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M1.8 6.1h12.4" fill="none" stroke="currentColor" stroke-width="1.1"/></svg><span data-i18n="landing.price.best">${te('landing.price.best')}</span></span>
          <h3 data-i18n="landing.price.pro">${te('landing.price.pro')}</h3>
          <p class="sx-price-card__amount">$<span data-price="pro">${PRICING.monthly.pro.label}</span> <small data-price-unit="pro">USD /mo</small></p>
          <p class="sx-price-card__bill" data-price-bill="pro" data-i18n="landing.price.billedMonthly">${te('landing.price.billedMonthly')}</p>
          <p class="sx-price-card__extra" data-price-extra="pro" hidden></p>
          <a class="sx-price-card__btn sx-price-card__btn--pro" href="${loginPath}" data-i18n="landing.price.trial">${te('landing.price.trial')}</a>
          <p class="sx-price-card__tax" data-i18n="landing.price.tax">${te('landing.price.tax')}</p>
          ${featureList('pro')}
        </li>
      </ul>
      <div class="sx-price-compare">
        <div class="sx-price-compare__bar">
          <h3 data-i18n="landing.price.compare">${te('landing.price.compare')}</h3>
          <div>
            <p data-i18n="landing.price.beginner">${te('landing.price.beginner')}</p>
            <strong data-i18n="landing.price.free">${te('landing.price.free')}</strong>
            <a href="${loginPath}" data-i18n="landing.price.startFree">${te('landing.price.startFree')}</a>
          </div>
          <div>
            <p data-i18n="landing.price.intermediate">${te('landing.price.intermediate')}</p>
            <strong>$<span data-compare-price="intermediate">${PRICING.monthly.intermediate.label}</span></strong>
            <a href="${loginPath}" data-i18n="landing.price.trial">${te('landing.price.trial')}</a>
          </div>
          <div>
            <p data-i18n="landing.price.pro">${te('landing.price.pro')}</p>
            <strong>$<span data-compare-price="pro">${PRICING.monthly.pro.label}</span></strong>
            <a href="${loginPath}" data-i18n="landing.price.trial">${te('landing.price.trial')}</a>
          </div>
        </div>
        ${compareTables()}
      </div>
    </section>
  </main>

  <footer class="sx-land__foot">
    <a class="sx-land__brand" href="#top">
      ${MARK}
      <span class="sx-land__word">Tradeneu</span>
    </a>
    <p data-i18n="landing.footer">${te('landing.footer')}</p>
  </footer>
</div>`

  translateDom(root)
  wireLandingNav(root)
}

function wireLandingNav(root: HTMLElement): void {
  const land = root.querySelector('.sx-land')
  if (!land) return
  const showPricing = (on: boolean) => {
    land.classList.toggle('is-pricing', on)
    if (on) window.scrollTo(0, 0)
  }
  const closeDrops = () => {
    root.querySelectorAll<HTMLElement>('[data-land-drop]').forEach((drop) => {
      drop.classList.remove('is-open')
      drop.querySelector('button')?.setAttribute('aria-expanded', 'false')
      const panel = drop.querySelector<HTMLElement>('.sx-land-drop__panel')
      if (panel) panel.hidden = true
    })
  }
  root.querySelectorAll<HTMLElement>('[data-land-drop]').forEach((drop) => {
    const button = drop.querySelector('button')
    const panel = drop.querySelector<HTMLElement>('.sx-land-drop__panel')
    button?.addEventListener('click', (event) => {
      event.stopPropagation()
      const open = !drop.classList.contains('is-open')
      closeDrops()
      if (!open || !panel || !button) return
      drop.classList.add('is-open')
      button.setAttribute('aria-expanded', 'true')
      panel.hidden = false
    })
  })
  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Node) || !root.querySelector('[data-land-drop].is-open')?.contains(event.target)) {
      closeDrops()
    }
  })
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDrops()
  })
  root.querySelectorAll('[data-land-pricing]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault()
      closeDrops()
      showPricing(true)
    })
  })
  root.querySelectorAll('[data-land-home]').forEach((link) => {
    link.addEventListener('click', () => {
      closeDrops()
      showPricing(false)
    })
  })
  root.querySelectorAll<HTMLButtonElement>('[data-cycle]').forEach((button) => {
    button.addEventListener('click', () => {
      const cycle = button.dataset.cycle === 'yearly' ? 'yearly' : 'monthly'
      root.querySelectorAll('[data-cycle]').forEach((item) => item.classList.toggle('is-on', item === button))
      for (const tier of ['intermediate', 'pro'] as const) {
        const price = PRICING[cycle][tier]
        const shown = cycle === 'yearly' ? String(Math.round(price.amount / 12)) : price.label
        const amount = root.querySelector(`[data-price="${tier}"]`)
        const unit = root.querySelector(`[data-price-unit="${tier}"]`)
        const bill = root.querySelector(`[data-price-bill="${tier}"]`)
        const extra = root.querySelector(`[data-price-extra="${tier}"]`)
        const compare = root.querySelector(`[data-compare-price="${tier}"]`)
        if (amount) amount.textContent = shown
        if (unit) unit.textContent = 'USD /mo'
        if (bill instanceof HTMLElement) bill.hidden = cycle === 'yearly'
        if (extra instanceof HTMLElement) {
          extra.hidden = cycle !== 'yearly'
          extra.innerHTML = `$${price.amount} / yearly <span>${price.save}</span>`
        }
        if (compare) compare.textContent = shown
      }
    })
  })
}

const ICON_ARROW = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`
const ICON_PLAY = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 001.5.86l10.5-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z"/></svg>`
const ICON_USER = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>`
const ICON_TARGET = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>`
const ICON_STEP = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5v14l9-7-9-7z"/><path d="M18 5v14"/></svg>`
const ICON_CHART = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>`

type Bar = { o: number; h: number; l: number; c: number }

function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** A gently rising 15m gold tape, shifted so the bar under the cursor closes at the example price. */
function exampleTape(count: number, cursor: number): Bar[] {
  const rand = seeded(42)
  const bars: Bar[] = []
  let price = 2360
  for (let i = 0; i < count; i++) {
    const o = price
    const c = o + (rand() - 0.46) * 7.5 + 0.35
    const h = Math.max(o, c) + rand() * 2.6
    const l = Math.min(o, c) - rand() * 2.6
    bars.push({ o, h, l, c })
    price = c
  }
  const target = Number(HERO_EXAMPLE_PRICE.replace(/,/g, ''))
  const shift = target - bars[cursor]!.c
  return bars.map((b) => ({ o: b.o + shift, h: b.h + shift, l: b.l + shift, c: b.c + shift }))
}

function appWindow(): string {
  const W = 1000
  const H = 330
  const plotW = 920
  const count = 62
  const cursor = 45
  const entryAt = 34
  const bars = exampleTape(count, cursor)
  const hi = Math.max(...bars.map((b) => b.h))
  const lo = Math.min(...bars.map((b) => b.l))
  const pad = (hi - lo) * 0.12
  const top = hi + pad
  const bottom = lo - pad
  const y = (p: number) => ((top - p) / (top - bottom)) * H
  const step = plotW / count
  const x = (i: number) => step * i + step / 2

  const candles = bars
    .map((b, i) => {
      const up = b.c >= b.o
      const cls = `sx-app__candle ${up ? 'is-up' : 'is-down'}${i > cursor ? ' is-future' : ''}`
      const bodyTop = y(Math.max(b.o, b.c))
      const bodyH = Math.max(1.5, Math.abs(y(b.o) - y(b.c)))
      const cx = x(i)
      return `<g class="${cls}" style="--i:${i}"><line x1="${cx}" y1="${y(b.h)}" x2="${cx}" y2="${y(b.l)}"/><rect x="${cx - step * 0.32}" y="${bodyTop}" width="${step * 0.64}" height="${bodyH}" rx="1"/></g>`
    })
    .join('')

  const entry = bars[entryAt]!.c
  const risk = 6.5
  const stop = entry - risk
  const target = entry + risk * 2
  const zoneX = x(entryAt)
  const zoneW = x(cursor) - zoneX
  const position = `
    <rect class="sx-app__zone sx-app__zone--tp" x="${zoneX}" y="${y(target)}" width="${zoneW}" height="${y(entry) - y(target)}"/>
    <rect class="sx-app__zone sx-app__zone--sl" x="${zoneX}" y="${y(entry)}" width="${zoneW}" height="${y(stop) - y(entry)}"/>
    <line class="sx-app__entry" x1="${zoneX}" y1="${y(entry)}" x2="${zoneX + zoneW}" y2="${y(entry)}"/>`

  const ticks = [0, 1, 2, 3, 4]
    .map((k) => {
      const p = top - ((top - bottom) * (k + 0.5)) / 5
      return `<line class="sx-app__grid" x1="0" y1="${y(p)}" x2="${plotW}" y2="${y(p)}"/><text class="sx-app__axis" x="${plotW + 12}" y="${y(p) + 4}">${p.toFixed(2)}</text>`
    })
    .join('')

  const cursorX = x(cursor) + step / 2
  const last = bars[cursor]!.c
  const futureW = plotW - cursorX

  return `
  <figure class="sx-app" id="sx-landing-example" aria-label="${te('landing.example.aria')}" data-i18n-aria-label="landing.example.aria">
    <div class="sx-app__chrome">
      <span class="sx-app__dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="sx-app__brand">${MARK}<span class="sx-land__word">Tradeneu</span></span>
      <span class="sx-app__chip" data-i18n="landing.app.journal">${te('landing.app.journal')}</span>
      <span class="sx-app__chip" data-i18n="landing.app.analytics">${te('landing.app.analytics')}</span>
      <span class="sx-app__chip sx-app__chip--accent" data-i18n="landing.app.placeOrder">${te('landing.app.placeOrder')}</span>
      <span class="sx-app__badge"><i aria-hidden="true"></i><span data-i18n="landing.terminal.live">${te('landing.terminal.live')}</span></span>
    </div>
    <div class="sx-app__toolbar">
      <span class="sx-app__sym" data-i18n="landing.example.symbol">${te('landing.example.symbol')}</span>
      <span class="sx-app__px">${HERO_EXAMPLE_PRICE}</span>
      <span class="sx-app__chg">+0.84%</span>
      <span class="sx-app__sep" aria-hidden="true"></span>
      <span class="sx-app__tool">1m</span>
      <span class="sx-app__tool is-on">15m</span>
      <span class="sx-app__tool">1h</span>
      <span class="sx-app__tool">4h</span>
      <span class="sx-app__sep" aria-hidden="true"></span>
      <span class="sx-app__tool" data-i18n="landing.app.indicators">${te('landing.app.indicators')}</span>
      <span class="sx-app__step">${ICON_STEP}<span data-i18n="landing.app.nextBar">${te('landing.app.nextBar')}</span></span>
    </div>
    <div class="sx-app__plot" role="img" aria-label="${te('landing.example.equityAria')}" data-i18n-aria-label="landing.example.equityAria">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id="sx-app-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(120,150,255,0.10)" stroke-width="3"/>
          </pattern>
          <linearGradient id="sx-app-cursor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#6ea8ff" stop-opacity="0"/>
            <stop offset="0.5" stop-color="#6ea8ff" stop-opacity="1"/>
            <stop offset="1" stop-color="#6ea8ff" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${ticks}
        ${position}
        ${candles}
        <rect class="sx-app__future" x="${cursorX}" y="0" width="${futureW}" height="${H}" fill="url(#sx-app-hatch)"/>
        <line class="sx-app__cursor" x1="${cursorX}" y1="0" x2="${cursorX}" y2="${H}" stroke="url(#sx-app-cursor)"/>
        <line class="sx-app__last" x1="0" y1="${y(last)}" x2="${plotW}" y2="${y(last)}"/>
        <rect class="sx-app__last-tag" x="${plotW + 4}" y="${y(last) - 10}" width="72" height="20" rx="4"/>
        <text class="sx-app__last-txt" x="${plotW + 12}" y="${y(last) + 4}">${last.toFixed(2)}</text>
      </svg>
      <span class="sx-app__tag sx-app__tag--pos" style="left:${(zoneX / W) * 100}%;top:${(y(target) / H) * 100}%" data-i18n="landing.app.long">${te('landing.app.long')}</span>
      <span class="sx-app__tag sx-app__tag--cursor" style="left:${(cursorX / W) * 100}%" data-i18n="landing.terminal.cursor">${te('landing.terminal.cursor')}</span>
      <span class="sx-app__tag sx-app__tag--hidden" style="left:${((cursorX + futureW / 2) / W) * 100}%" data-i18n="landing.terminal.hidden">${te('landing.terminal.hidden')}</span>
    </div>
    <div class="sx-app__order">
      <span class="sx-app__buy" data-i18n="landing.app.buy">${te('landing.app.buy')}</span>
      <span class="sx-app__sell" data-i18n="landing.app.sell">${te('landing.app.sell')}</span>
      <span class="sx-app__qty"><span data-i18n="landing.app.qty">${te('landing.app.qty')}</span><b>0.50</b></span>
      <dl class="sx-app__acct">
        <div><dt data-i18n="landing.app.balance">${te('landing.app.balance')}</dt><dd>$50,000.00</dd></div>
        <div><dt data-i18n="landing.app.realized">${te('landing.app.realized')}</dt><dd class="is-up">+$2,140.00</dd></div>
        <div><dt data-i18n="landing.app.unrealized">${te('landing.app.unrealized')}</dt><dd class="is-up">+$312.40</dd></div>
        <div><dt data-i18n="landing.stat.drawdown">${te('landing.stat.drawdown')}</dt><dd class="is-down">−1.8R</dd></div>
      </dl>
    </div>
  </figure>`
}

function equitySparkSvg(): string {
  const pts = HERO_EXAMPLE_CURVE
  const max = Math.max(...pts)
  const min = Math.min(...pts)
  const w = 180
  const h = 48
  const coords = pts.map((v, i) => [(i / (pts.length - 1)) * w, h - 4 - ((v - min) / (max - min)) * (h - 8)] as const)
  const line = coords.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')
  return `<svg class="sx-land-float__spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="sx-eq-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2ee6a6" stop-opacity="0.35"/><stop offset="1" stop-color="#2ee6a6" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${w} ${h} L0 ${h} Z" fill="url(#sx-eq-fill)"/>
    <path d="${line}" fill="none" stroke="#2ee6a6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`
}

function winRing(rate: string): string {
  const pct = Math.max(0, Math.min(100, Number.parseFloat(rate) || 0))
  const r = 20
  const c = 2 * Math.PI * r
  return `<svg class="sx-land-float__ring" viewBox="0 0 48 48">
    <defs><linearGradient id="sx-ring-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b8cff"/><stop offset="1" stop-color="#a26bff"/></linearGradient></defs>
    <circle cx="24" cy="24" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="5"/>
    <circle cx="24" cy="24" r="${r}" fill="none" stroke="url(#sx-ring-g)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${((c * pct) / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 24 24)"/>
  </svg>`
}

function miniSparkSvg(seed: number, up: boolean): string {
  const rand = seeded(seed * 97)
  const n = 24
  let v = 0
  const pts: number[] = []
  for (let i = 0; i < n; i++) {
    v += (rand() - 0.5) * 2 + (up ? 0.35 : -0.35)
    pts.push(v)
  }
  const max = Math.max(...pts)
  const min = Math.min(...pts)
  const w = 120
  const h = 32
  const d = pts
    .map((p, i) => `${i ? 'L' : 'M'}${((i / (n - 1)) * w).toFixed(1)} ${(h - 2 - ((p - min) / (max - min || 1)) * (h - 4)).toFixed(1)}`)
    .join(' ')
  return `<svg class="sx-land-mkt__spark${up ? '' : ' is-down'}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`
}

function whyVisualHidden(): string {
  const rand = seeded(7)
  let p = 50
  const raw = Array.from({ length: 16 }, () => {
    const o = p
    const c = o + (rand() - 0.42) * 10
    p = c
    return { o, c, h: Math.max(o, c) + rand() * 4, l: Math.min(o, c) - rand() * 4 }
  })
  const hi = Math.max(...raw.map((b) => b.h))
  const lo = Math.min(...raw.map((b) => b.l))
  const y = (v: number) => 8 + ((hi - v) / (hi - lo)) * 64
  const bars = raw
    .map((b, i) => {
      const cls = `${b.c >= b.o ? 'is-up' : 'is-down'}${i >= 10 ? ' is-future' : ''}`
      const x = 11 + i * 13
      return `<g class="${cls}"><line x1="${x}" y1="${y(b.h)}" x2="${x}" y2="${y(b.l)}"/><rect x="${x - 3.5}" y="${y(Math.max(b.o, b.c))}" width="7" height="${Math.max(2, Math.abs(y(b.o) - y(b.c)))}" rx="1"/></g>`
    })
    .join('')
  return `<svg viewBox="0 0 220 80">${bars}<rect class="sx-why-veil" x="140" y="0" width="80" height="80" rx="4"/><line class="sx-why-cursor" x1="140" y1="2" x2="140" y2="78"/></svg>`
}

function whyVisualLog(): string {
  const rows: Array<[string, string, string, boolean]> = [
    ['XAUUSD', 'Long', '+2.0R', true],
    ['EURUSD', 'Short', '−1.0R', false],
    ['NAS100', 'Long', '+1.4R', true],
  ]
  return `<ul class="sx-why-log">${rows
    .map(
      ([s, side, r, up]) =>
        `<li><span class="sx-why-log__side${up ? ' is-up' : ' is-down'}">${side}</span><b>${s}</b><span class="${up ? 'is-up' : 'is-down'}">${r}</span></li>`,
    )
    .join('')}</ul>`
}

function whyVisualInsight(): string {
  const rows: Array<[string, number]> = [
    ['Late entry', 72],
    ['Stop too tight', 48],
    ['Against trend', 30],
  ]
  return `<ul class="sx-why-bars">${rows
    .map(([label, w]) => `<li><span>${label}</span><i style="--w:${w}%"></i></li>`)
    .join('')}</ul>`
}
