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

      <div class="sx-strat-obj__body">
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

  const onBackClick = () => opts.onBack()
  const onPickFiles = () => {
    if (!busy) fileInput.click()
  }
  const onTypeClick = () => {
    textarea.focus()
    composerEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
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

  q('[data-sx-obj-back]')!.addEventListener('click', onBackClick)
  q('[data-sx-obj-upload]')!.addEventListener('click', onPickFiles)
  q('[data-sx-obj-attach]')!.addEventListener('click', onPickFiles)
  q('[data-sx-obj-type]')!.addEventListener('click', onTypeClick)
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
      host.replaceChildren()
    },
  }
}
