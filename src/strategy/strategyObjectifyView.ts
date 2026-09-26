/**
 * src/strategy/strategyObjectifyView.ts
 *
 * "I have a strategy" intake screen — the trader hands us their rules however
 * they already exist (a file they wrote, or straight into the composer) and we
 * objectify them into a StrategyDefinition via the AI backend.
 *
 * Only plain-text attachments are read here. PDF/DOCX/image extraction needs
 * server-side parsing that does not exist yet, so those are rejected with a
 * clear message rather than silently dropped.
 */
import './strategyObjectifyView.css'
import type { StrategyDefinition } from '../backtest/BacktestTypes'
import { parseStrategyJson } from './strategyBuilderFields'
import { describeStrategyAiError, objectifyStrategy } from '../ai/strategyAiClient'
import {
  buildInterviewDescription,
  nextInterviewQuestion,
  SUGGEST_ANSWER,
  type InterviewAnswers,
  type InterviewQuestion,
} from './strategyInterview'

export type StrategyObjectifyViewOptions = {
  host: HTMLElement
  onBack: () => void
  onStrategyReady: (strategy: StrategyDefinition) => void
}

export type StrategyObjectifyViewApi = {
  focusComposer: () => void
  dispose: () => void
}

/** Matches the server's description cap in server/ai/strategyAiRoutes.mjs. */
const MAX_CHARS = 10000
const MAX_FILES = 5
const MAX_FILE_BYTES = 10 * 1024 * 1024
const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown']

type Attachment = { name: string; text: string }

function isTextFile(file: File): boolean {
  const name = file.name.toLowerCase()
  if (TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))) return true
  return file.type === 'text/plain' || file.type === 'text/markdown'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function html(): string {
  return `
    <div class="sx-strat-obj">
      <button type="button" class="sx-strat-obj__back" data-sx-obj-back>
        <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Strategies
      </button>

      <div class="sx-strat-obj__body" data-sx-obj-intake>
        <p class="sx-strat-obj__lead">
          <span class="sx-strat-obj__lead-icon" aria-hidden="true"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
          <span>Let\u2019s turn your strategy into a clean, testable document. Your rules can live anywhere \u2014 upload a file or write them out here.</span>
        </p>

        <div class="sx-strat-obj__choices">
          <button type="button" class="sx-strat-obj__choice" data-sx-obj-upload>
            <span class="sx-strat-obj__choice-icon"><i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i></span>
            <span class="sx-strat-obj__choice-label">Upload a file</span>
          </button>
          <button type="button" class="sx-strat-obj__choice" data-sx-obj-type>
            <span class="sx-strat-obj__choice-icon"><i class="fa-solid fa-pencil" aria-hidden="true"></i></span>
            <span class="sx-strat-obj__choice-label">I\u2019ll type it out</span>
          </button>
        </div>

        <div class="sx-strat-obj__spacer"></div>

        <div class="sx-strat-obj__files" data-sx-obj-files hidden></div>
        <div class="sx-strat-obj__error" data-sx-obj-error hidden role="alert"></div>

        <div class="sx-strat-obj__composer" data-sx-obj-composer>
          <textarea
            class="sx-strat-obj__textarea"
            data-sx-obj-text
            rows="4"
            maxlength="${MAX_CHARS}"
            placeholder='e.g. "I trade NQ on the New York open. I fade the first liquidity sweep back into the prior-day range when a 5m FVG forms after a 15m EMA touch..."'
          ></textarea>
          <div class="sx-strat-obj__composer-bar">
            <button type="button" class="sx-strat-obj__attach" data-sx-obj-attach aria-label="Attach a file">
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
            </button>
            <span class="sx-strat-obj__count" data-sx-obj-count>0 / ${MAX_CHARS}</span>
            <button type="button" class="sx-strat-obj__send" data-sx-obj-send aria-label="Send" disabled>
              <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        <p class="sx-strat-obj__hint">
          Up to ${MAX_FILES} files \u00b7 txt/md \u00b7 10 MB each \u00b7 PDF, image and DOCX coming soon
        </p>
      </div>

      <div class="sx-strat-obj__chat" data-sx-obj-chat hidden>
        <div class="sx-strat-obj__thread" data-sx-obj-thread></div>
        <div class="sx-strat-obj__error" data-sx-obj-chat-error hidden role="alert"></div>
        <div class="sx-strat-obj__composer" data-sx-obj-chat-composer>
          <textarea
            class="sx-strat-obj__textarea"
            data-sx-obj-chat-text
            rows="3"
            placeholder="Or type something else..."
          ></textarea>
          <div class="sx-strat-obj__composer-bar">
            <button type="button" class="sx-strat-obj__attach" data-sx-obj-attach aria-label="Attach a file">
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
            </button>
            <span class="sx-strat-obj__count"></span>
            <button type="button" class="sx-strat-obj__send" data-sx-obj-chat-send aria-label="Send">
              <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <p class="sx-strat-obj__hint">AI can make mistakes. Verify important strategy rules.</p>
      </div>

      <div class="sx-strat-obj__building" data-sx-obj-building hidden>
        <span class="sx-strat-obj__building-icon" aria-hidden="true"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
        <h2 class="sx-strat-obj__building-title">Building your strategy</h2>
        <p class="sx-strat-obj__building-sub">Turning your answers into an objective, testable strategy.</p>
        <p class="sx-strat-obj__building-status">
          <span class="sx-strat-obj__building-chev" aria-hidden="true"><i class="fa-solid fa-angles-right"></i></span>
          <em>Finalizing your strategy document</em>
          <span class="sx-strat-obj__dots" aria-hidden="true"><i></i><i></i><i></i></span>
        </p>
        <div class="sx-strat-obj__skeleton" aria-hidden="true">
          <div class="sx-strat-obj__skeleton-main">
            <span style="width: 62%"></span>
            <span style="width: 38%"></span>
            <span style="width: 88%"></span>
            <span style="width: 70%"></span>
            <span style="width: 30%"></span>
            <span style="width: 46%"></span>
            <span style="width: 34%"></span>
          </div>
          <div class="sx-strat-obj__skeleton-side">
            <span class="sx-strat-obj__skeleton-dot"></span>
            <span style="width: 80%"></span>
            <span style="width: 60%"></span>
            <span style="width: 70%"></span>
            <span style="width: 45%"></span>
          </div>
        </div>
      </div>

      <input type="file" class="sx-strat-obj__file-input" data-sx-obj-file-input multiple accept=".txt,.md,.markdown,text/plain,text/markdown" />
    </div>`
}

export function mountStrategyObjectifyView(
  opts: StrategyObjectifyViewOptions,
): StrategyObjectifyViewApi {
  const { host } = opts
  host.replaceChildren()
  const wrap = document.createElement('div')
  wrap.innerHTML = html()
  const rootEl = wrap.firstElementChild as HTMLElement
  host.appendChild(rootEl)

  const q = <T extends HTMLElement>(sel: string) => rootEl.querySelector<T>(sel)
  const textarea = q<HTMLTextAreaElement>('[data-sx-obj-text]')!
  const countEl = q<HTMLElement>('[data-sx-obj-count]')!
  const sendBtn = q<HTMLButtonElement>('[data-sx-obj-send]')!
  const filesEl = q<HTMLElement>('[data-sx-obj-files]')!
  const errorEl = q<HTMLElement>('[data-sx-obj-error]')!
  const fileInput = q<HTMLInputElement>('[data-sx-obj-file-input]')!
  const composerEl = q<HTMLElement>('[data-sx-obj-composer]')!

  let attachments: Attachment[] = []
  let busy = false

  function showError(msg: string) {
    errorEl.textContent = msg
    errorEl.hidden = !msg
  }

  /** Attachments are appended to the prompt, so they count against the same budget. */
  function combinedDescription(): string {
    const typed = textarea.value.trim()
    const parts: string[] = []
    if (typed) parts.push(typed)
    for (const a of attachments) parts.push(`--- ${a.name} ---\n${a.text}`)
    return parts.join('\n\n')
  }

  function paint() {
    const total = combinedDescription().length
    countEl.textContent = `${total} / ${MAX_CHARS}`
    countEl.classList.toggle('is-over', total > MAX_CHARS)
    sendBtn.disabled = busy || total === 0 || total > MAX_CHARS

    filesEl.hidden = attachments.length === 0
    filesEl.replaceChildren()
    attachments.forEach((a, i) => {
      const chip = document.createElement('span')
      chip.className = 'sx-strat-obj__file'
      const name = document.createElement('span')
      name.className = 'sx-strat-obj__file-name'
      name.textContent = a.name
      const size = document.createElement('span')
      size.className = 'sx-strat-obj__file-size'
      size.textContent = formatBytes(a.text.length)
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'sx-strat-obj__file-remove'
      remove.setAttribute('aria-label', `Remove ${a.name}`)
      remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>'
      remove.addEventListener('click', () => {
        if (busy) return
        attachments.splice(i, 1)
        paint()
      })
      chip.append(name, size, remove)
      filesEl.appendChild(chip)
    })
  }

  async function addFiles(list: FileList | File[]) {
    showError('')
    const incoming = Array.from(list)
    const rejected: string[] = []
    for (const file of incoming) {
      if (attachments.length >= MAX_FILES) {
        showError(`You can attach up to ${MAX_FILES} files.`)
        break
      }
      if (file.size > MAX_FILE_BYTES) {
        rejected.push(`${file.name} is larger than 10 MB`)
        continue
      }
      if (!isTextFile(file)) {
        rejected.push(`${file.name} — only txt/md files can be read right now`)
        continue
      }
      const text = await file.text().catch(() => '')
      if (!text.trim()) {
        rejected.push(`${file.name} is empty`)
        continue
      }
      attachments.push({ name: file.name, text: text.trim() })
    }
    if (rejected.length) showError(`Skipped: ${rejected.join(' · ')}.`)
    paint()
  }

  function setBusy(val: boolean) {
    busy = val
    rootEl.classList.toggle('is-busy', val)
    textarea.disabled = val
    paint()
  }

  async function submit() {
    if (busy) return
    const description = combinedDescription()
    if (!description) {
      showError('Add your rules first — type them in or attach a file.')
      return
    }
    if (description.length > MAX_CHARS) {
      showError('That\u2019s a lot of text — trim it to the essential rules and try again.')
      return
    }
    showError('')
    setBusy(true)
    const result = await objectifyStrategy({ description })
    setBusy(false)
    if (!result.ok) {
      showError(describeStrategyAiError(result.error))
      return
    }
    try {
      opts.onStrategyReady(parseStrategyJson(result.strategyJson))
    } catch {
      showError('The AI response could not be parsed into a valid strategy. Please try again.')
    }
  }

  // ---- Guided interview ("I'll type it out") -------------------------------

  const intakeEl = q<HTMLElement>('[data-sx-obj-intake]')!
  const chatEl = q<HTMLElement>('[data-sx-obj-chat]')!
  const buildingEl = q<HTMLElement>('[data-sx-obj-building]')!
  const threadEl = q<HTMLElement>('[data-sx-obj-thread]')!
  const chatErrorEl = q<HTMLElement>('[data-sx-obj-chat-error]')!
  const chatText = q<HTMLTextAreaElement>('[data-sx-obj-chat-text]')!

  const answers: InterviewAnswers = {}
  const askedIds: string[] = []
  let currentQuestion: InterviewQuestion | null = null
  const timers: number[] = []

  function showPhase(phase: 'intake' | 'chat' | 'building') {
    intakeEl.hidden = phase !== 'intake'
    chatEl.hidden = phase !== 'chat'
    buildingEl.hidden = phase !== 'building'
  }

  function showChatError(msg: string) {
    chatErrorEl.textContent = msg
    chatErrorEl.hidden = !msg
  }

  function scrollThread() {
    threadEl.scrollTop = threadEl.scrollHeight
  }

  function pushUserBubble(text: string) {
    const row = document.createElement('div')
    row.className = 'sx-strat-obj__msg sx-strat-obj__msg--user'
    const bubble = document.createElement('span')
    bubble.className = 'sx-strat-obj__bubble'
    bubble.textContent = text
    row.appendChild(bubble)
    threadEl.appendChild(row)
    scrollThread()
  }

  function pushThinking(label: string): HTMLElement {
    const row = document.createElement('div')
    row.className = 'sx-strat-obj__thinking'
    const text = document.createElement('span')
    text.textContent = label
    const dots = document.createElement('span')
    dots.className = 'sx-strat-obj__dots'
    dots.setAttribute('aria-hidden', 'true')
    dots.innerHTML = '<i></i><i></i><i></i>'
    row.append(text, dots)
    threadEl.appendChild(row)
    scrollThread()
    return row
  }

  /** Records the answer, echoes it back as the trader's reply, then moves on. */
  function commitAnswer(question: InterviewQuestion, labels: string[], echo: string) {
    answers[question.id] = labels
    askedIds.push(question.id)
    currentQuestion = null
    chatText.value = ''
    chatText.placeholder = 'FX Replay is thinking...'
    // Keep the prompt in the transcript, but retire its controls so the thread
    // reads as a conversation instead of a stack of live question cards.
    const card = threadEl.querySelector('[data-sx-obj-question]')
    if (card) {
      card.removeAttribute('data-sx-obj-question')
      card.querySelector('.sx-strat-obj__opts')?.remove()
      card.querySelector('.sx-strat-obj__continue')?.remove()
      card.querySelector('.sx-strat-obj__q-hint')?.remove()
    }
    pushUserBubble(echo)
    showChatError('')
    askNext()
  }

  function renderQuestion(question: InterviewQuestion) {
    currentQuestion = question
    chatText.placeholder = 'Or type something else...'

    const card = document.createElement('div')
    card.className = 'sx-strat-obj__q'
    card.setAttribute('data-sx-obj-question', '')

    const prompt = document.createElement('p')
    prompt.className = 'sx-strat-obj__q-prompt'
    prompt.textContent = question.prompt
    card.appendChild(prompt)

    const hint = document.createElement('p')
    hint.className = 'sx-strat-obj__q-hint'
    hint.textContent = question.multi ? 'Pick all that apply.' : 'Pick one.'
    card.appendChild(hint)

    const list = document.createElement('div')
    list.className = 'sx-strat-obj__opts'
    const selected = new Set<string>()

    const continueBtn = document.createElement('button')
    continueBtn.type = 'button'
    continueBtn.className = 'sx-strat-obj__continue'
    continueBtn.textContent = 'Continue'
    continueBtn.hidden = true
    continueBtn.addEventListener('click', () => {
      const labels = [...selected]
      if (!labels.length) return
      commitAnswer(question, labels, labels.join(', '))
    })

    question.options.forEach((opt, i) => {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'sx-strat-obj__opt'
      const key = document.createElement('span')
      key.className = 'sx-strat-obj__opt-key'
      key.textContent = String.fromCharCode(65 + i)
      const label = document.createElement('span')
      label.className = 'sx-strat-obj__opt-label'
      label.textContent = opt.label
      row.append(key, label)
      row.addEventListener('click', () => {
        if (!question.multi) {
          commitAnswer(question, [opt.label], opt.label)
          return
        }
        if (selected.has(opt.label)) selected.delete(opt.label)
        else selected.add(opt.label)
        row.classList.toggle('is-picked', selected.has(opt.label))
        continueBtn.hidden = selected.size === 0
        scrollThread()
      })
      list.appendChild(row)
    })

    const suggest = document.createElement('button')
    suggest.type = 'button'
    suggest.className = 'sx-strat-obj__opt sx-strat-obj__opt--suggest'
    suggest.innerHTML =
      '<span class="sx-strat-obj__opt-key">?</span><span class="sx-strat-obj__opt-label">I don\u2019t know \u2014 suggest one</span>'
    suggest.addEventListener('click', () => {
      commitAnswer(question, [SUGGEST_ANSWER], 'I don\u2019t know \u2014 suggest one')
    })
    list.appendChild(suggest)

    card.append(list, continueBtn)
    threadEl.appendChild(card)
    scrollThread()
  }

  function askNext() {
    const thinking = pushThinking("Checking what\u2019s still missing...")
    const timer = window.setTimeout(() => {
      thinking.remove()
      const question = nextInterviewQuestion(answers, askedIds)
      if (!question) {
        void runInterviewBuild()
        return
      }
      renderQuestion(question)
    }, 650)
    timers.push(timer)
  }

  async function runInterviewBuild() {
    showPhase('building')
    const result = await objectifyStrategy({ description: buildInterviewDescription(answers) })
    if (!result.ok) {
      showPhase('chat')
      showChatError(describeStrategyAiError(result.error))
      return
    }
    try {
      opts.onStrategyReady(parseStrategyJson(result.strategyJson))
    } catch {
      showPhase('chat')
      showChatError('The AI response could not be parsed into a valid strategy. Please try again.')
    }
  }

  function startInterview() {
    showPhase('chat')
    if (threadEl.childElementCount === 0) {
      pushUserBubble('I\u2019ll type it out')
      askNext()
    }
  }

  /** Free text answers the open question, so typed detail is never lost. */
  function sendChatText() {
    const text = chatText.value.trim()
    if (!text) return
    if (currentQuestion) {
      commitAnswer(currentQuestion, [text], text)
      return
    }
    chatText.value = ''
  }

  const onBackClick = () => opts.onBack()
  const onPickFiles = () => {
    if (!busy) fileInput.click()
  }
  const onTypeClick = () => startInterview()
  const onFileChange = () => {
    if (fileInput.files?.length) void addFiles(fileInput.files)
    fileInput.value = ''
  }
  const onInput = () => paint()
  const onKeyDown = (ke: KeyboardEvent) => {
    // Enter sends; Shift+Enter keeps the newline for multi-line rule lists.
    if (ke.key === 'Enter' && !ke.shiftKey) {
      ke.preventDefault()
      void submit()
    }
  }
  const onDragOver = (ev: DragEvent) => {
    ev.preventDefault()
    composerEl.classList.add('is-drop')
  }
  const onDragLeave = () => composerEl.classList.remove('is-drop')
  const onDrop = (ev: DragEvent) => {
    ev.preventDefault()
    composerEl.classList.remove('is-drop')
    if (ev.dataTransfer?.files?.length) void addFiles(ev.dataTransfer.files)
  }

  const onChatKeyDown = (ke: KeyboardEvent) => {
    if (ke.key === 'Enter' && !ke.shiftKey) {
      ke.preventDefault()
      sendChatText()
    }
  }

  q('[data-sx-obj-back]')!.addEventListener('click', onBackClick)
  q('[data-sx-obj-upload]')!.addEventListener('click', onPickFiles)
  q('[data-sx-obj-type]')!.addEventListener('click', onTypeClick)
  rootEl
    .querySelectorAll<HTMLButtonElement>('[data-sx-obj-attach]')
    .forEach((btn) => btn.addEventListener('click', onPickFiles))
  q('[data-sx-obj-chat-send]')!.addEventListener('click', sendChatText)
  chatText.addEventListener('keydown', onChatKeyDown)
  fileInput.addEventListener('change', onFileChange)
  textarea.addEventListener('input', onInput)
  textarea.addEventListener('keydown', onKeyDown)
  sendBtn.addEventListener('click', () => void submit())
  composerEl.addEventListener('dragover', onDragOver)
  composerEl.addEventListener('dragleave', onDragLeave)
  composerEl.addEventListener('drop', onDrop)

  paint()

  return {
    focusComposer: () => textarea.focus(),
    dispose: () => {
      for (const t of timers) window.clearTimeout(t)
      host.replaceChildren()
    },
  }
}
