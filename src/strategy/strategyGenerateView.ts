/**
 * src/strategy/strategyGenerateView.ts
 *
 * "I need a strategy" — a calibration interview that ends in ranked strategy
 * matches drawn from the Tradeneu playbook.
 *
 * Three phases: the six-question interview, a short matching pass, then the
 * results list. Matching is deterministic (see strategyMatch.ts) so every card
 * can show the exact reasons behind its score, including the caveats.
 */
import './strategyGenerateView.css'
import type { StrategyDefinition } from '../backtest/BacktestTypes'
import { formatStrategyConditions } from '../backtest/strategyConditionText'
import { saveCustomStrategy } from './strategyStore'
import { rankStrategies, strategyFromMatch, type StrategyMatch } from './strategyMatch'
import {
  answerFor,
  applyAnswer,
  emptyProfile,
  PROFILE_QUESTIONS,
  type ProfileQuestion,
  type StrategyProfile,
} from './strategyProfile'

export type StrategyGenerateViewOptions = {
  host: HTMLElement
  onBack: () => void
  onStrategyReady: (strategy: StrategyDefinition) => void
}

export type StrategyGenerateViewApi = {
  dispose: () => void
}

const KEYS = 'ABCDE'
const MATCH_COUNT = 3

const STOP_LABELS: Record<string, (v: number) => string> = {
  atr_mult: (v) => `${v}\u00d7 ATR`,
  fixed_pct: (v) => `${v}% from entry`,
  fixed_price: (v) => `${v} price distance`,
}

function stopText(def: StrategyDefinition | Omit<StrategyDefinition, 'id' | 'name'>): string {
  const s = def.stopLoss
  return STOP_LABELS[s.type]?.(s.value) ?? '\u2014'
}

function targetText(def: StrategyDefinition | Omit<StrategyDefinition, 'id' | 'name'>): string {
  const t = def.takeProfit
  if (t.type === 'none') return 'No fixed target \u2014 exits on signal'
  if (t.type === 'rr_ratio') return `${t.value}R`
  if (t.type === 'fixed_pct') return `${t.value}%`
  return `${t.value} price distance`
}

function sessionText(def: Omit<StrategyDefinition, 'id' | 'name'>): string {
  if (!def.sessionFilter) return 'Any hour'
  return `${String(def.sessionFilter.fromHour).padStart(2, '0')}:00\u2013${String(
    def.sessionFilter.toHour,
  ).padStart(2, '0')}:00 UTC`
}

function html(): string {
  return `
    <div class="sx-sgen">
      <button type="button" class="sx-sgen__back" data-sgen-back>
        <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Strategies
      </button>

      <div class="sx-sgen__stage" data-sgen-stage="interview">
        <div class="sx-sgen__rail" data-sgen-rail></div>
        <p class="sx-sgen__step" data-sgen-step></p>
        <div class="sx-sgen__card" data-sgen-question></div>
      </div>

      <div class="sx-sgen__stage sx-sgen__matching" data-sgen-stage="matching" hidden>
        <span class="sx-sgen__pulse" aria-hidden="true"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
        <h2 class="sx-sgen__matching-title">Finding your best fit</h2>
        <p class="sx-sgen__matching-sub">Scoring the Tradeneu playbook against your profile.</p>
        <ol class="sx-sgen__ticks" data-sgen-ticks>
          <li data-sgen-tick="0"><i class="fa-solid fa-circle-notch" aria-hidden="true"></i><span>Reading your answers</span></li>
          <li data-sgen-tick="1"><i class="fa-solid fa-circle-notch" aria-hidden="true"></i><span>Scoring every playbook strategy</span></li>
          <li data-sgen-tick="2"><i class="fa-solid fa-circle-notch" aria-hidden="true"></i><span>Ranking your closest matches</span></li>
        </ol>
      </div>

      <div class="sx-sgen__stage" data-sgen-stage="results" hidden>
        <div class="sx-sgen__results-head">
          <span class="sx-sgen__eyebrow" data-sgen-count></span>
          <h2 class="sx-sgen__results-title">Strategies that fit how you want to trade</h2>
          <p class="sx-sgen__results-sub">
            Authored by Tradeneu. Add one to your workspace and it becomes a fully editable copy.
          </p>
          <button type="button" class="sx-sgen__redo" data-sgen-redo>
            <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Change my answers
          </button>
        </div>
        <div class="sx-sgen__matches" data-sgen-matches></div>
      </div>
    </div>`
}

export function mountStrategyGenerateView(
  opts: StrategyGenerateViewOptions,
): StrategyGenerateViewApi {
  const { host } = opts
  host.replaceChildren()
  const wrap = document.createElement('div')
  wrap.innerHTML = html()
  const rootEl = wrap.firstElementChild as HTMLElement
  host.appendChild(rootEl)

  const q = <T extends HTMLElement>(sel: string) => rootEl.querySelector<T>(sel)!
  const railEl = q('[data-sgen-rail]')
  const stepEl = q('[data-sgen-step]')
  const questionEl = q('[data-sgen-question]')
  const matchesEl = q('[data-sgen-matches]')
  const countEl = q('[data-sgen-count]')
  const stages = {
    interview: q('[data-sgen-stage="interview"]'),
    matching: q('[data-sgen-stage="matching"]'),
    results: q('[data-sgen-stage="results"]'),
  }

  const profile: StrategyProfile = emptyProfile()
  let index = 0
  let selected: string[] = []
  let customText = ''
  let customOpen = false
  const timers: number[] = []

  function showStage(name: keyof typeof stages) {
    for (const [key, el] of Object.entries(stages)) el.hidden = key !== name
  }

  function paintRail() {
    railEl.replaceChildren()
    PROFILE_QUESTIONS.forEach((_, i) => {
      const seg = document.createElement('span')
      seg.className = 'sx-sgen__rail-seg'
      if (i < index) seg.classList.add('is-done')
      else if (i === index) seg.classList.add('is-current')
      railEl.appendChild(seg)
    })
    stepEl.textContent = `Calibration \u00b7 step ${index + 1} of ${PROFILE_QUESTIONS.length}`
  }

  function commit(question: ProfileQuestion, values: string[], custom?: string) {
    applyAnswer(profile, question, values)
    if (custom) profile.custom[question.id] = custom
    else delete profile.custom[question.id]
    if (index >= PROFILE_QUESTIONS.length - 1) {
      void runMatching()
      return
    }
    index += 1
    loadQuestion()
  }

  function loadQuestion() {
    const question = PROFILE_QUESTIONS[index]!
    selected = answerFor(profile, question)
    customText = profile.custom[question.id] ?? ''
    customOpen = Boolean(customText)
    paintRail()
    renderQuestion()
  }

  function renderQuestion() {
    const question = PROFILE_QUESTIONS[index]!
    questionEl.replaceChildren()

    const head = document.createElement('div')
    head.className = 'sx-sgen__card-head'
    const heading = document.createElement('h2')
    heading.className = 'sx-sgen__prompt'
    heading.textContent = question.prompt
    head.appendChild(heading)
    if (question.subPrompt) {
      const sub = document.createElement('p')
      sub.className = 'sx-sgen__sub-prompt'
      sub.textContent = question.subPrompt
      head.appendChild(sub)
    }
    if (index > 0) {
      const back = document.createElement('button')
      back.type = 'button'
      back.className = 'sx-sgen__prev'
      back.innerHTML = '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Back'
      back.addEventListener('click', goBack)
      head.appendChild(back)
    }
    questionEl.appendChild(head)

    const list = document.createElement('div')
    list.className = 'sx-sgen__opts'
    question.options.forEach((opt, i) => {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'sx-sgen__opt'
      if (selected.includes(opt.value)) row.classList.add('is-on')
      const mark = document.createElement('span')
      mark.className = 'sx-sgen__opt-mark'
      mark.setAttribute('aria-hidden', 'true')
      const label = document.createElement('span')
      label.className = 'sx-sgen__opt-label'
      label.textContent = opt.label
      const key = document.createElement('kbd')
      key.className = 'sx-sgen__opt-key'
      key.textContent = KEYS[i] ?? ''
      row.append(mark, label, key)
      row.addEventListener('click', () => pick(opt.value))
      list.appendChild(row)
    })
    questionEl.appendChild(list)

    const other = document.createElement('div')
    other.className = 'sx-sgen__other'
    const otherBtn = document.createElement('button')
    otherBtn.type = 'button'
    otherBtn.className = 'sx-sgen__other-btn'
    otherBtn.innerHTML =
      '<i class="fa-solid fa-pen" aria-hidden="true"></i> <span>Something else</span>'
    otherBtn.addEventListener('click', () => {
      customOpen = true
      renderQuestion()
      questionEl.querySelector<HTMLInputElement>('[data-sgen-other-input]')?.focus()
    })
    if (!customOpen) other.appendChild(otherBtn)
    else {
      const field = document.createElement('div')
      field.className = 'sx-sgen__other-field'
      const input = document.createElement('input')
      input.type = 'text'
      input.setAttribute('data-sgen-other-input', '')
      input.placeholder = 'Describe it in your own words\u2026'
      input.value = customText
      input.addEventListener('input', () => {
        customText = input.value
      })
      input.addEventListener('keydown', (ke) => {
        ke.stopPropagation()
        if (ke.key === 'Enter' && input.value.trim()) {
          commit(question, [], input.value.trim())
        }
      })
      const send = document.createElement('button')
      send.type = 'button'
      send.className = 'sx-sgen__other-send'
      send.textContent = 'Use this'
      send.addEventListener('click', () => {
        if (input.value.trim()) commit(question, [], input.value.trim())
      })
      field.append(input, send)
      other.appendChild(field)
    }
    questionEl.appendChild(other)

    if (question.multi) {
      const cont = document.createElement('button')
      cont.type = 'button'
      cont.className = 'sx-sgen__continue'
      cont.disabled = selected.length === 0
      cont.innerHTML = 'Continue <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>'
      cont.addEventListener('click', () => {
        if (selected.length) commit(question, selected)
      })
      questionEl.appendChild(cont)
    }
  }

  /** Single-answer questions advance on click; multi toggles and waits. */
  function pick(value: string) {
    const question = PROFILE_QUESTIONS[index]!
    if (!question.multi) {
      commit(question, [value])
      return
    }
    selected = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value]
    renderQuestion()
  }

  function goBack() {
    if (index === 0) return
    index -= 1
    loadQuestion()
  }

  const onKeyDown = (ke: KeyboardEvent) => {
    if (!stages.interview.hidden) {
      const question = PROFILE_QUESTIONS[index]!
      const slot = KEYS.indexOf(ke.key.toUpperCase())
      if (slot >= 0 && slot < question.options.length) {
        ke.preventDefault()
        pick(question.options[slot]!.value)
        return
      }
      if (ke.key === 'Enter' && question.multi && selected.length) {
        ke.preventDefault()
        commit(question, selected)
        return
      }
      if (ke.key === 'Backspace' && index > 0) {
        ke.preventDefault()
        goBack()
      }
    }
  }

  async function runMatching() {
    showStage('matching')
    const ticks = rootEl.querySelectorAll<HTMLElement>('[data-sgen-tick]')
    ticks.forEach((t) => t.classList.remove('is-done', 'is-active'))
    // The pass itself is instant; the staged ticks exist so the trader can see
    // what was considered rather than a bare spinner.
    for (let i = 0; i < ticks.length; i += 1) {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(() => {
          ticks[i]?.classList.add('is-active')
          if (i > 0) ticks[i - 1]?.classList.add('is-done')
          resolve()
        }, 420)
        timers.push(timer)
      })
    }
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        ticks[ticks.length - 1]?.classList.add('is-done')
        resolve()
      }, 380)
      timers.push(timer)
    })
    renderResults(rankStrategies(profile, MATCH_COUNT))
    showStage('results')
  }

  function renderResults(matches: StrategyMatch[]) {
    countEl.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> ${matches.length} match${
      matches.length === 1 ? '' : 'es'
    } for you`
    matchesEl.replaceChildren()

    matches.forEach((match, i) => {
      const card = document.createElement('article')
      card.className = 'sx-sgen__match'

      const head = document.createElement('div')
      head.className = 'sx-sgen__match-head'
      const rank = document.createElement('span')
      rank.className = 'sx-sgen__rank'
      rank.textContent = `#${i + 1}`
      const titleWrap = document.createElement('div')
      titleWrap.className = 'sx-sgen__match-title-wrap'
      const title = document.createElement('h3')
      title.className = 'sx-sgen__match-title'
      title.textContent = match.entry.name
      const meta = document.createElement('p')
      meta.className = 'sx-sgen__match-meta'
      meta.textContent = `${match.entry.level} \u00b7 ${match.entry.markets.join(', ')} \u00b7 ${sessionText(
        match.entry.definition,
      )}`
      titleWrap.append(title, meta)

      const score = document.createElement('div')
      score.className = 'sx-sgen__score'
      score.style.setProperty('--sx-sgen-score', String(match.score))
      score.innerHTML = `<span class="sx-sgen__score-num">${match.score}<em>%</em></span><span class="sx-sgen__score-cap">fit</span>`
      head.append(rank, titleWrap, score)
      card.appendChild(head)

      const blurb = document.createElement('p')
      blurb.className = 'sx-sgen__match-blurb'
      blurb.textContent = match.entry.blurb
      card.appendChild(blurb)

      const reasons = document.createElement('div')
      reasons.className = 'sx-sgen__reasons'
      if (match.fits.length) reasons.appendChild(reasonList('Why this fits', match.fits, 'fit'))
      if (match.caveats.length) {
        reasons.appendChild(reasonList('Worth knowing', match.caveats, 'caveat'))
      }
      card.appendChild(reasons)

      const chips = document.createElement('div')
      chips.className = 'sx-sgen__chips'
      match.entry.tags.forEach((tag) => {
        const chip = document.createElement('span')
        chip.className = 'sx-sgen__chip'
        chip.textContent = tag
        chips.appendChild(chip)
      })
      card.appendChild(chips)

      const rules = document.createElement('div')
      rules.className = 'sx-sgen__rules'
      rules.hidden = true
      rules.append(
        ruleRow('Entry', formatStrategyConditions(match.entry.definition.entryConditions)),
        ruleRow('Exit', formatStrategyConditions(match.entry.definition.exitConditions)),
        ruleRow('Stop', stopText(match.entry.definition)),
        ruleRow('Target', targetText(match.entry.definition)),
        ruleRow('Direction', match.entry.definition.direction),
      )

      const actions = document.createElement('div')
      actions.className = 'sx-sgen__actions'
      const add = document.createElement('button')
      add.type = 'button'
      add.className = 'sx-sgen__add'
      add.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i> Add to workspace'
      add.addEventListener('click', () => {
        const strategy = saveCustomStrategy(strategyFromMatch(match, profile))
        opts.onStrategyReady(strategy)
      })
      const peek = document.createElement('button')
      peek.type = 'button'
      peek.className = 'sx-sgen__peek'
      const paintPeek = () => {
        peek.setAttribute('aria-expanded', String(!rules.hidden))
        peek.innerHTML = `<i class="fa-regular fa-file-lines" aria-hidden="true"></i> ${
          rules.hidden ? 'Preview rules' : 'Hide rules'
        }`
      }
      paintPeek()
      peek.addEventListener('click', () => {
        rules.hidden = !rules.hidden
        paintPeek()
      })
      actions.append(add, peek)
      card.append(actions, rules)

      matchesEl.appendChild(card)
    })
  }

  function reasonList(title: string, items: string[], kind: 'fit' | 'caveat'): HTMLElement {
    const box = document.createElement('div')
    box.className = `sx-sgen__reason sx-sgen__reason--${kind}`
    const h = document.createElement('h4')
    h.className = 'sx-sgen__reason-title'
    h.textContent = title
    const ul = document.createElement('ul')
    items.forEach((text) => {
      const li = document.createElement('li')
      li.textContent = text
      ul.appendChild(li)
    })
    box.append(h, ul)
    return box
  }

  function ruleRow(label: string, value: string): HTMLElement {
    const row = document.createElement('div')
    row.className = 'sx-sgen__rule'
    const k = document.createElement('span')
    k.className = 'sx-sgen__rule-key'
    k.textContent = label
    const v = document.createElement('span')
    v.className = 'sx-sgen__rule-val'
    v.textContent = value
    row.append(k, v)
    return row
  }

  q('[data-sgen-back]').addEventListener('click', () => opts.onBack())
  q('[data-sgen-redo]').addEventListener('click', () => {
    index = 0
    loadQuestion()
    showStage('interview')
  })
  document.addEventListener('keydown', onKeyDown)

  loadQuestion()
  showStage('interview')

  return {
    dispose: () => {
      for (const t of timers) window.clearTimeout(t)
      document.removeEventListener('keydown', onKeyDown)
      host.replaceChildren()
    },
  }
}
