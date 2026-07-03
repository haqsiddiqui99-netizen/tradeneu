import type { StoredSession } from '../data/sessionStore'
import { fetchMlHealth } from '../ml/mlApi'
import { fetchMarketDataHealth } from '../data/marketDataHealth'

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
    return `Hi! I can summarize your lab activity and explain Suplexity features. ${sessionSummary(sessions)}`
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
  if (/twelve|data|live|demo|api|vercel|deploy/.test(q)) {
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
  const chatFooter = opts.drawer.querySelector('.border-t') as HTMLElement | null
  const input = opts.drawer.querySelector('#sx-dash-ai-chat-input') as HTMLTextAreaElement | null
  if (!body || !chatFooter || !input) return () => {}

  body.replaceChildren()

  const statusEl = document.createElement('p')
  statusEl.className =
    'sx-ai-chat__status rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs leading-relaxed text-zinc-400'
  statusEl.dataset.sxAiStatus = ''
  statusEl.textContent = 'Checking services...'

  const messagesEl = document.createElement('div')
  messagesEl.className =
    'sx-ai-chat__messages flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto'
  messagesEl.dataset.sxAiMessages = ''
  messagesEl.setAttribute('role', 'log')
  messagesEl.setAttribute('aria-live', 'polite')

  body.appendChild(statusEl)
  body.appendChild(messagesEl)

  const sendBtn = document.createElement('button')
  sendBtn.type = 'button'
  sendBtn.className =
    'mt-2 w-full rounded-xl border border-sky-400/40 bg-gradient-to-r from-sky-600 to-blue-700 px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110'
  sendBtn.dataset.sxAiSend = ''
  sendBtn.textContent = 'Send'
  chatFooter.appendChild(sendBtn)

  input.disabled = false
  input.placeholder = 'Ask about sessions, backtests, prop rules...'
  input.removeAttribute('disabled')

  const messages: ChatMessage[] = [
    {
      role: 'assistant',
      text: 'I summarize your local session data and explain Suplexity features. I do not give live trading advice.',
    },
  ]
  renderMessages(messagesEl, messages)

  void Promise.all([fetchMarketDataHealth(), fetchMlHealth()]).then(([health, ml]) => {
    const parts: string[] = []
    if (health.apiReachable && health.twelveDataKeyConfigured) parts.push('Market API · live key OK')
    else if (health.apiReachable) parts.push('Market API · demo (no Twelve Data key)')
    else parts.push('Market API · offline')
    parts.push(ml ? `ML · ${ml.model}` : 'ML · offline')
    statusEl.textContent = parts.join(' · ')
  })

  const send = () => {
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    messages.push({ role: 'user', text })
    messages.push({ role: 'assistant', text: buildReply(text, opts.getSessions()) })
    renderMessages(messagesEl, messages)
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
    input.disabled = true
    input.placeholder = 'Message AI (coming soon)...'
  }
}
