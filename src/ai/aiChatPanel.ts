import type { StoredSession } from '../data/sessionStore'

export type AiChatPanelOptions = {
  drawer: HTMLElement
  getSessions: () => StoredSession[]
}

type ChatMessage = { role: 'user' | 'assistant'; text: string }

function sessionSummary(sessions: StoredSession[]): string {
  if (!sessions.length) return 'You have no saved sessions yet.'
  const withBt = sessions.filter((s) => s.lastBacktest)
  const prop = sessions.filter((s) => s.sessionType === 'prop')
  const lines = [
    `${sessions.length} session${sessions.length === 1 ? '' : 's'} saved.`,
    withBt.length
      ? `${withBt.length} with a last backtest (best P&L: $${Math.max(...withBt.map((s) => s.lastBacktest!.netPnl)).toFixed(0)}).`
      : 'No backtests run yet.',
    prop.length ? `${prop.length} prop challenge session${prop.length === 1 ? '' : 's'}.` : '',
  ]
  return lines.filter(Boolean).join(' ')
}

function buildReply(userText: string, sessions: StoredSession[]): string {
  const q = userText.toLowerCase().trim()
  if (!q) return 'Ask me about sessions, backtests, prop rules, or market data setup.'

  if (/hello|hi|hey/.test(q)) {
    return `Hi! I can summarize your lab activity and explain Tradeneu features. ${sessionSummary(sessions)}`
  }
  if (/session|dashboard/.test(q)) {
    return sessionSummary(sessions) + ' Use **New Session** to create one, or open a row to resume replay.'
  }
  if (/backtest|strategy/.test(q)) {
    const withBt = sessions.filter((s) => s.lastBacktest)
    if (!withBt.length) {
      return 'No backtest results saved yet. Open a session chart, pick a strategy from the toolbar, and press **Backtest**.'
    }
    const best = [...withBt].sort((a, b) => b.lastBacktest!.netPnl - a.lastBacktest!.netPnl)[0]!
    const bt = best.lastBacktest!
    return `Your best saved backtest is "${best.name}" at $${bt.netPnl.toFixed(2)} net (${bt.totalTrades} trades, ${bt.winRate.toFixed(0)}% win). Use the Strategy page to build custom rules.`
  }
  if (/prop|challenge|drawdown/.test(q)) {
    const propSessions = sessions.filter((s) => s.sessionType === 'prop')
    if (!propSessions.length) {
      return 'Create a **Prop firm** session from the dashboard to practice profit targets and drawdown limits during paper replay.'
    }
    const passed = propSessions.filter((s) => s.propResult?.status === 'passed').length
    const failed = propSessions.filter((s) => s.propResult?.status === 'failed').length
    return `${propSessions.length} prop session${propSessions.length === 1 ? '' : 's'}: ${passed} passed, ${failed} failed. Trade in replay; rules evaluate on each bar.`
  }
  if (/journal|paper|trade|buy|sell/.test(q)) {
    const withJournal = sessions.filter((s) => (s.replayState?.account.closedTrades.length ?? 0) > 0)
    if (!withJournal.length) {
      return 'Paper trades are recorded when you buy/sell during bar replay. Open a session and use the order ticket on the chart.'
    }
    const total = withJournal.reduce((n, s) => n + (s.replayState?.account.closedTrades.length ?? 0), 0)
    return `${total} closed paper trade${total === 1 ? '' : 's'} across ${withJournal.length} session${withJournal.length === 1 ? '' : 's'}. Check the journal panel in the chart side rail.`
  }
  if (/twelve|data|live|demo|api|railway|deploy/.test(q)) {
    return 'Live bars need TWELVE_DATA_API_KEY on the server. Without it, charts show demo or bundled replay data. Check the chart feed pill for market API status.'
  }
  if (/battle|compare/.test(q)) {
    return 'Use Performance > Battles mode and Compare sessions to pit two sessions by backtest or journal P&L.'
  }
  if (/help|how/.test(q)) {
    return 'Try: summarize my sessions, last backtest, prop rules, paper journal, or live data setup.'
  }
  return (
    'I do not have a full LLM connected yet. ' +
    sessionSummary(sessions) +
    ' Try asking about sessions, backtests, prop challenges, or market data.'
  )
}

function renderMessages(host: HTMLElement, messages: ChatMessage[]) {
  host.replaceChildren()
  for (const msg of messages) {
    const bubble = document.createElement('div')
    bubble.className = 'sx-ai-chat__msg sx-ai-chat__msg--' + msg.role
    bubble.textContent = msg.text
    host.appendChild(bubble)
  }
  host.scrollTop = host.scrollHeight
}

export function mountAiChatPanel(opts: AiChatPanelOptions): () => void {
  const body = opts.drawer.querySelector('[data-sx-ai-chat-body]') as HTMLElement | null
  const chatFooter = opts.drawer.querySelector('.sx-ai-chat__composer') as HTMLElement | null
  const input = opts.drawer.querySelector('#sx-dash-ai-chat-input') as HTMLTextAreaElement | null
  if (!body || !chatFooter || !input) return () => {}

  body.replaceChildren()

  const messagesEl = document.createElement('div')
  messagesEl.className = 'sx-ai-chat__messages'
  messagesEl.dataset.sxAiMessages = ''
  messagesEl.setAttribute('role', 'log')
  messagesEl.setAttribute('aria-live', 'polite')

  const promptsEl = document.createElement('div')
  promptsEl.className = 'sx-ai-chat__prompts'

  body.appendChild(messagesEl)
  body.appendChild(promptsEl)

  const sendBtn = document.createElement('button')
  sendBtn.type = 'button'
  sendBtn.className = 'sx-ai-chat__send'
  sendBtn.dataset.sxAiSend = ''
  sendBtn.setAttribute('aria-label', 'Send')
  sendBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 4.2l6.2 6.2-1.4 1.4-3.8-3.8V19.5h-2V8l-3.8 3.8-1.4-1.4L12 4.2z"/></svg>'
  chatFooter.appendChild(sendBtn)

  input.disabled = false
  input.placeholder = 'Ask the desk…'
  input.rows = 1
  input.removeAttribute('disabled')

  const messages: ChatMessage[] = [
    {
      role: 'assistant',
      text: 'What should we look at? I can read the sessions on this desk.',
    },
  ]
  renderMessages(messagesEl, messages)

  const send = () => {
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    promptsEl.hidden = true
    messages.push({ role: 'user', text })
    messages.push({ role: 'assistant', text: buildReply(text, opts.getSessions()) })
    renderMessages(messagesEl, messages)
  }

  const prompts: Array<[string, string]> = [
    ['My sessions', 'Summarize my sessions'],
    ['Last backtest', 'What was my last backtest?'],
    ['Prop rules', 'How do prop rules work?'],
    ['Paper trades', 'Show my paper trades'],
  ]
  for (const [label, query] of prompts) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'sx-ai-chat__prompt'
    btn.textContent = label
    btn.addEventListener('click', () => {
      input.value = query
      send()
    })
    promptsEl.appendChild(btn)
  }

  const onSendClick = () => send()
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  sendBtn.addEventListener('click', onSendClick)
  input.addEventListener('keydown', onKey)

  return () => {
    sendBtn.removeEventListener('click', onSendClick)
    input.removeEventListener('keydown', onKey)
    sendBtn.remove()
    promptsEl.remove()
    input.disabled = true
    input.placeholder = 'Message AI (coming soon)...'
  }
}
