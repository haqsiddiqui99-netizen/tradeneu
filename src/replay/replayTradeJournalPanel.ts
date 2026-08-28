import type { ClosedReplayTrade, ReplayTradeJournal } from './replayPositions'

type JournalPanelOpts = {
  formatPrice: (value: number) => string
  formatMoney: (value: number) => string
  getTrades: () => ClosedReplayTrade[]
  onChange: (tradeNum: number, journal: ReplayTradeJournal) => void
  onJumpToEntry: (timeSec: number) => void
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDateTime(sec: number): string {
  return new Date(sec * 1000).toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function blankJournal(): ReplayTradeJournal {
  return { notes: '', rating: '', tags: [], updatedAt: Date.now() }
}

export function mountReplayTradeJournalPanel(root: HTMLElement, opts: JournalPanelOpts) {
  let trade: ClosedReplayTrade | null = null
  let asset = ''
  let activeTab: 'tags' | 'details' = 'tags'
  let screen: 'detail' | 'all' = 'detail'
  let allTab: 'trades' | 'calendar' = 'trades'
  let calendarMode: 'month' | 'year' = 'month'
  let calendarDate = new Date()
  let search = ''
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function currentJournal(): ReplayTradeJournal {
    return trade?.journal
      ? { ...trade.journal, tags: [...trade.journal.tags] }
      : blankJournal()
  }

  function scheduleSave(next: ReplayTradeJournal) {
    if (!trade) return
    const tradeNum = trade.tradeNum
    trade.journal = next
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      opts.onChange(tradeNum, { ...next, tags: [...next.tags], updatedAt: Date.now() })
      const modified = root.querySelector('[data-rw-journal-modified]')
      if (modified) modified.textContent = `Modified at ${new Date().toLocaleTimeString()}`
    }, 400)
  }

  function flushSave() {
    if (!saveTimer || !trade?.journal) return
    clearTimeout(saveTimer)
    saveTimer = null
    opts.onChange(trade.tradeNum, {
      ...trade.journal,
      tags: [...trade.journal.tags],
      updatedAt: Date.now(),
    })
  }

  function renderBody() {
    if (!trade) return
    const journal = currentJournal()
    const tags = journal.tags
      .map(
        (tag, index) =>
          `<button type="button" class="rw-trade-journal__tag" data-rw-journal-remove-tag="${index}" title="Remove tag">${escapeHtml(tag)} <span>×</span></button>`,
      )
      .join('')
    const details = `
      <dl class="rw-trade-journal__details">
        <div><dt>Side</dt><dd>${trade.direction === 'long' ? 'Buy' : 'Sell'}</dd></div>
        <div><dt>Entry time</dt><dd>${escapeHtml(formatDateTime(trade.entryTime))}</dd></div>
        <div><dt>Exit time</dt><dd>${escapeHtml(formatDateTime(trade.exitTime))}</dd></div>
        <div><dt>Entry price</dt><dd>${escapeHtml(opts.formatPrice(trade.entryPrice))}</dd></div>
        <div><dt>Close average</dt><dd>${escapeHtml(opts.formatPrice(trade.exitPrice))}</dd></div>
        <div><dt>Size</dt><dd>${trade.qty} lots</dd></div>
        <div><dt>Realized PnL</dt><dd>${escapeHtml(opts.formatMoney(trade.pnl))}</dd></div>
        <div><dt>Exit reason</dt><dd>${escapeHtml(trade.exitReason.replace(/_/g, ' '))}</dd></div>
      </dl>`
    const body = root.querySelector('[data-rw-journal-lower-body]')
    if (body) {
      body.innerHTML =
        activeTab === 'details'
          ? details
          : `<div class="rw-trade-journal__tag-tools">
              <label class="rw-trade-journal__tag-input">
                <span>＋ Tag group</span>
                <input type="text" data-rw-journal-tag-input placeholder="Type a tag and press Enter" maxlength="30" />
              </label>
              <label class="rw-trade-journal__rating">
                <span>Trade Rating</span>
                <select data-rw-journal-rating>
                  <option value="">Add rating</option>
                  ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${journal.rating === String(n) ? ' selected' : ''}>${n} / 5</option>`).join('')}
                </select>
              </label>
              <div class="rw-trade-journal__tags">${tags || '<span class="rw-trade-journal__empty-tags">No tags added</span>'}</div>
            </div>`
    }
    root.querySelectorAll<HTMLElement>('[data-rw-journal-tab]').forEach((button) => {
      button.classList.toggle(
        'rw-trade-journal__subtab--active',
        button.dataset.rwJournalTab === activeTab,
      )
    })
  }

  function render() {
    if (!trade) return
    if (screen === 'all') {
      renderAll()
      return
    }
    const journal = currentJournal()
    root.innerHTML = `
      <div class="rw-trade-journal__header">
        <button type="button" class="rw-trade-journal__close" data-rw-journal-close aria-label="Close journal">×</button>
        <button type="button" class="rw-trade-journal__all" data-rw-journal-all>All trades</button>
        <span class="rw-trade-journal__modified" data-rw-journal-modified>${
          journal.updatedAt ? `Modified at ${new Date(journal.updatedAt).toLocaleTimeString()}` : ''
        }</span>
      </div>
      <div class="rw-trade-journal__content">
        <div class="rw-trade-journal__title-row">
          <h2>${escapeHtml(asset)}, ${trade.direction === 'long' ? 'buy' : 'sell'} <span>${escapeHtml(formatDateTime(trade.entryTime))}</span></h2>
          <button type="button" data-rw-journal-jump>Jump to entry</button>
        </div>
        <textarea class="rw-trade-journal__notes" data-rw-journal-notes placeholder="Enter text or type '/' for commands">${escapeHtml(journal.notes)}</textarea>
        <div class="rw-trade-journal__commands">
          <button type="button" data-rw-journal-screenshot>▣ /screenshots</button>
          <button type="button" data-rw-journal-template>◉ /templates</button>
        </div>
        <div class="rw-trade-journal__lower">
          <div class="rw-trade-journal__subtabs">
            <button type="button" data-rw-journal-tab="tags">Tag groups</button>
            <button type="button" data-rw-journal-tab="details">Details</button>
          </div>
          <div data-rw-journal-lower-body></div>
        </div>
      </div>`
    renderBody()
  }

  function tradeDateKey(sec: number): string {
    const date = new Date(sec * 1000)
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  }

  function renderTradeList(): string {
    const needle = search.trim().toLowerCase()
    const trades = [...opts.getTrades()]
      .reverse()
      .filter((item) => {
        if (!needle) return true
        return `${asset} ${item.direction === 'long' ? 'buy' : 'sell'} ${item.pnl}`.toLowerCase().includes(needle)
      })
    if (!trades.length) return '<div class="rw-trade-journal__all-empty">No trades found</div>'
    return `<div class="rw-trade-journal__trade-list">${trades
      .map((item) => {
        const pnlClass = item.pnl >= 0 ? 'rw-trade-journal__trade-pnl--up' : 'rw-trade-journal__trade-pnl--down'
        return `<button type="button" class="rw-trade-journal__trade-item" data-rw-journal-open-trade="${item.tradeNum}">
          <span class="rw-trade-journal__trade-file">▱</span>
          <strong>${escapeHtml(asset)}, ${item.direction === 'long' ? 'buy' : 'sell'}</strong>
          <span class="rw-trade-journal__trade-pnl ${pnlClass}">${escapeHtml(opts.formatMoney(item.pnl))}</span>
          <time>${escapeHtml(formatDateTime(item.exitTime))}</time>
        </button>`
      })
      .join('')}</div>`
  }

  function monthCalendar(): string {
    const year = calendarDate.getFullYear()
    const month = calendarDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const mondayOffset = (firstDay + 6) % 7
    const start = new Date(year, month, 1 - mondayOffset)
    const byDay = new Map<string, { count: number; pnl: number }>()
    for (const item of opts.getTrades()) {
      const date = new Date(item.exitTime * 1000)
      if (date.getFullYear() !== year || date.getMonth() !== month) continue
      const key = tradeDateKey(item.exitTime)
      const current = byDay.get(key) ?? { count: 0, pnl: 0 }
      current.count += 1
      current.pnl += item.pnl
      byDay.set(key, current)
    }
    const cells = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      const inMonth = date.getMonth() === month
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      const summary = byDay.get(key)
      const state = !inMonth
        ? ' rw-trade-journal__cal-day--outside'
        : summary
          ? summary.pnl >= 0
            ? ' rw-trade-journal__cal-day--win'
            : ' rw-trade-journal__cal-day--loss'
          : ''
      return `<div class="rw-trade-journal__cal-day${state}">
        <span class="rw-trade-journal__cal-number">${date.getDate()}</span>
        ${summary ? `<span>${summary.count} trade${summary.count === 1 ? '' : 's'}</span><strong>${escapeHtml(opts.formatMoney(summary.pnl))}</strong>` : ''}
      </div>`
    }).join('')
    return `<div class="rw-trade-journal__calendar-head">
      <div>
        <button type="button" data-rw-journal-calendar-nav="prev">‹</button>
        <strong>${calendarDate.toLocaleString('en-US', { month: 'long' })}</strong>
        <button type="button" data-rw-journal-calendar-nav="next">›</button>
      </div>
      <div>
        <button type="button" data-rw-journal-calendar-year="prev">‹</button>
        <strong>${year}</strong>
        <button type="button" data-rw-journal-calendar-year="next">›</button>
      </div>
    </div>
    <div class="rw-trade-journal__weekdays">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => `<span>${day}</span>`).join('')}</div>
    <div class="rw-trade-journal__calendar-grid">${cells}</div>`
  }

  function yearCalendar(): string {
    const year = calendarDate.getFullYear()
    const months = Array.from({ length: 12 }, (_, month) => {
      const trades = opts.getTrades().filter((item) => {
        const date = new Date(item.exitTime * 1000)
        return date.getFullYear() === year && date.getMonth() === month
      })
      const pnl = trades.reduce((sum, item) => sum + item.pnl, 0)
      const state = trades.length
        ? pnl >= 0
          ? ' rw-trade-journal__year-month--win'
          : ' rw-trade-journal__year-month--loss'
        : ''
      return `<button type="button" class="rw-trade-journal__year-month${state}" data-rw-journal-month="${month}">
        <strong>${new Date(year, month, 1).toLocaleString('en-US', { month: 'long' })}</strong>
        <span>${trades.length} trade${trades.length === 1 ? '' : 's'}</span>
        ${trades.length ? `<b>${escapeHtml(opts.formatMoney(pnl))}</b>` : ''}
      </button>`
    }).join('')
    return `<div class="rw-trade-journal__calendar-head rw-trade-journal__calendar-head--year">
      <button type="button" data-rw-journal-calendar-year="prev">‹</button>
      <strong>${year}</strong>
      <button type="button" data-rw-journal-calendar-year="next">›</button>
    </div><div class="rw-trade-journal__year-grid">${months}</div>`
  }

  function renderAll() {
    const calendar = calendarMode === 'month' ? monthCalendar() : yearCalendar()
    root.innerHTML = `
      <div class="rw-trade-journal__all-head">
        <button type="button" class="rw-trade-journal__close" data-rw-journal-close aria-label="Close journal">×</button>
        <div class="rw-trade-journal__all-tabs">
          <button type="button" data-rw-journal-all-tab="trades" class="${allTab === 'trades' ? 'rw-trade-journal__all-tab--active' : ''}">Trades</button>
          <button type="button" data-rw-journal-all-tab="calendar" class="${allTab === 'calendar' ? 'rw-trade-journal__all-tab--active' : ''}">Calendar</button>
        </div>
        <button type="button" class="rw-trade-journal__feedback">Give Feedback</button>
      </div>
      <div class="rw-trade-journal__all-content">
        ${
          allTab === 'trades'
            ? `<label class="rw-trade-journal__search"><span>⌕</span><input type="search" data-rw-journal-search placeholder="Search" value="${escapeHtml(search)}" /></label>${renderTradeList()}`
            : `<div class="rw-trade-journal__calendar-toolbar">
                <div></div>
                <div class="rw-trade-journal__calendar-modes">
                  <button type="button" data-rw-journal-calendar-mode="month" class="${calendarMode === 'month' ? 'rw-trade-journal__calendar-mode--active' : ''}">Month</button>
                  <button type="button" data-rw-journal-calendar-mode="year" class="${calendarMode === 'year' ? 'rw-trade-journal__calendar-mode--active' : ''}">Year</button>
                </div>
              </div>${calendar}`
        }
      </div>`
  }

  function close() {
    flushSave()
    trade = null
    root.hidden = true
  }

  function onInput(event: Event) {
    if (!trade) return
    const target = event.target as HTMLElement
    if (target.matches('[data-rw-journal-search]')) {
      search = (target as HTMLInputElement).value
      const selectionStart = (target as HTMLInputElement).selectionStart
      renderAll()
      const next = root.querySelector('[data-rw-journal-search]') as HTMLInputElement | null
      next?.focus()
      if (next && selectionStart != null) next.setSelectionRange(selectionStart, selectionStart)
    } else if (target.matches('[data-rw-journal-notes]')) {
      scheduleSave({ ...currentJournal(), notes: (target as HTMLTextAreaElement).value })
    }
  }

  function onChange(event: Event) {
    if (!trade) return
    const target = event.target as HTMLElement
    if (target.matches('[data-rw-journal-rating]')) {
      scheduleSave({ ...currentJournal(), rating: (target as HTMLSelectElement).value })
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (!trade || event.key !== 'Enter') return
    const target = event.target as HTMLElement
    if (!target.matches('[data-rw-journal-tag-input]')) return
    event.preventDefault()
    const input = target as HTMLInputElement
    const tag = input.value.trim()
    if (!tag) return
    const journal = currentJournal()
    if (!journal.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      journal.tags.push(tag)
      scheduleSave(journal)
    }
    input.value = ''
    renderBody()
  }

  function onClick(event: Event) {
    if (!trade) return
    const target = event.target as HTMLElement
    if (target.closest('[data-rw-journal-close]')) {
      close()
      return
    }
    if (target.closest('[data-rw-journal-all]')) {
      flushSave()
      screen = 'all'
      allTab = 'trades'
      renderAll()
      return
    }
    const allTabButton = target.closest<HTMLElement>('[data-rw-journal-all-tab]')
    if (allTabButton?.dataset.rwJournalAllTab) {
      allTab = allTabButton.dataset.rwJournalAllTab as 'trades' | 'calendar'
      renderAll()
      return
    }
    const openTrade = target.closest<HTMLElement>('[data-rw-journal-open-trade]')
    if (openTrade?.dataset.rwJournalOpenTrade) {
      const tradeNum = Number(openTrade.dataset.rwJournalOpenTrade)
      const selected = opts.getTrades().find((item) => item.tradeNum === tradeNum)
      if (selected) {
        trade = selected
        screen = 'detail'
        activeTab = 'tags'
        render()
      }
      return
    }
    const calendarModeButton = target.closest<HTMLElement>('[data-rw-journal-calendar-mode]')
    if (calendarModeButton?.dataset.rwJournalCalendarMode) {
      calendarMode = calendarModeButton.dataset.rwJournalCalendarMode as 'month' | 'year'
      renderAll()
      return
    }
    const calendarNav = target.closest<HTMLElement>('[data-rw-journal-calendar-nav]')
    if (calendarNav?.dataset.rwJournalCalendarNav) {
      calendarDate = new Date(
        calendarDate.getFullYear(),
        calendarDate.getMonth() + (calendarNav.dataset.rwJournalCalendarNav === 'next' ? 1 : -1),
        1,
      )
      renderAll()
      return
    }
    const yearNav = target.closest<HTMLElement>('[data-rw-journal-calendar-year]')
    if (yearNav?.dataset.rwJournalCalendarYear) {
      calendarDate = new Date(
        calendarDate.getFullYear() + (yearNav.dataset.rwJournalCalendarYear === 'next' ? 1 : -1),
        calendarDate.getMonth(),
        1,
      )
      renderAll()
      return
    }
    const monthButton = target.closest<HTMLElement>('[data-rw-journal-month]')
    if (monthButton?.dataset.rwJournalMonth) {
      calendarDate = new Date(calendarDate.getFullYear(), Number(monthButton.dataset.rwJournalMonth), 1)
      calendarMode = 'month'
      renderAll()
      return
    }
    if (target.closest('[data-rw-journal-jump]')) {
      opts.onJumpToEntry(trade.entryTime)
      return
    }
    const tab = target.closest<HTMLElement>('[data-rw-journal-tab]')
    if (tab?.dataset.rwJournalTab) {
      activeTab = tab.dataset.rwJournalTab as 'tags' | 'details'
      renderBody()
      return
    }
    const remove = target.closest<HTMLElement>('[data-rw-journal-remove-tag]')
    if (remove?.dataset.rwJournalRemoveTag != null) {
      const index = Number(remove.dataset.rwJournalRemoveTag)
      const journal = currentJournal()
      journal.tags.splice(index, 1)
      scheduleSave(journal)
      renderBody()
      return
    }
    if (target.closest('[data-rw-journal-template]')) {
      const textarea = root.querySelector('[data-rw-journal-notes]') as HTMLTextAreaElement | null
      if (!textarea) return
      const template =
        'Trade thesis:\\n\\nWhat went well:\\n\\nWhat could improve:\\n\\nLesson for next trade:\\n'
      if (!textarea.value.trim()) textarea.value = template
      else textarea.value += `\\n\\n${template}`
      scheduleSave({ ...currentJournal(), notes: textarea.value })
      textarea.focus()
      return
    }
    if (target.closest('[data-rw-journal-screenshot]')) {
      const textarea = root.querySelector('[data-rw-journal-notes]') as HTMLTextAreaElement | null
      if (!textarea) return
      textarea.value += `${textarea.value ? '\\n' : ''}[Chart screenshot: ${new Date().toLocaleString()}]`
      scheduleSave({ ...currentJournal(), notes: textarea.value })
      textarea.focus()
    }
  }

  root.addEventListener('input', onInput)
  root.addEventListener('change', onChange)
  root.addEventListener('keydown', onKeydown)
  root.addEventListener('click', onClick)

  return {
    open(nextTrade: ClosedReplayTrade, nextAsset: string) {
      flushSave()
      trade = { ...nextTrade, journal: nextTrade.journal ? { ...nextTrade.journal, tags: [...nextTrade.journal.tags] } : undefined }
      asset = nextAsset
      screen = 'detail'
      activeTab = 'tags'
      root.hidden = false
      render()
    },
    refresh(nextTrade: ClosedReplayTrade) {
      if (trade?.tradeNum !== nextTrade.tradeNum) return
      trade = { ...nextTrade, journal: nextTrade.journal ? { ...nextTrade.journal, tags: [...nextTrade.journal.tags] } : undefined }
    },
    destroy() {
      flushSave()
      root.removeEventListener('input', onInput)
      root.removeEventListener('change', onChange)
      root.removeEventListener('keydown', onKeydown)
      root.removeEventListener('click', onClick)
    },
  }
}
