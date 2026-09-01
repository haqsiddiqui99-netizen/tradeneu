import { icons } from '../icons'
import type { ClosedReplayTrade, ReplayTradeJournal } from './replayPositions'
import {
  normalizeJournalBlocks,
  normalizeJournalScreenshots,
  type ReplayJournalBlock,
  type ReplayJournalBlockType,
  type ReplayJournalScreenshot,
  type ReplayJournalScreenshotAlign,
} from './replayPositions'

type JournalPanelOpts = {
  formatPrice: (value: number) => string
  formatMoney: (value: number) => string
  getTrades: () => ClosedReplayTrade[]
  onChange: (tradeNum: number, journal: ReplayTradeJournal) => void
  onJumpToEntry: (timeSec: number) => void
  onCaptureScreenshot: () => Promise<string | null>
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
  return {
    notes: '',
    rating: '',
    tags: [],
    screenshots: [],
    blocks: [],
    updatedAt: Date.now(),
  }
}

function cloneJournal(journal: ReplayTradeJournal): ReplayTradeJournal {
  return {
    ...journal,
    tags: [...journal.tags],
    screenshots: normalizeJournalScreenshots(journal.screenshots),
    blocks: normalizeJournalBlocks(journal.blocks),
  }
}

function formatCaptionDate(sec: number): string {
  const date = new Date(sec * 1000)
  const time = date
    .toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })
    .replace(/\s/g, '')
  const day = date.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  })
  return `${time} ${day}`
}

function defaultShotCaption(asset: string, trade: ClosedReplayTrade): string {
  return `${asset}, ${trade.direction === 'long' ? 'buy' : 'sell'} ${formatCaptionDate(trade.entryTime)}`
}

function downloadDataUrl(src: string, filename: string) {
  const a = document.createElement('a')
  a.href = src
  a.download = filename
  a.click()
}

type JournalCommand = {
  id: string
  title: string
  description: string
  icon: string
  shortcut?: string
}

const journalCommandSections: Array<{ title: string; items: JournalCommand[] }> = [
  {
    title: 'Templates',
    items: [
      { id: 'beginner', title: 'Beginner', description: 'Favourited template', icon: '🎨' },
      { id: 'daily-report', title: 'Daily report card', description: 'Favourited template', icon: '🎨' },
      { id: 'new-template-1', title: 'New template', description: 'Template', icon: '🎨' },
      { id: 'new-template-2', title: 'New template', description: 'Template', icon: '🎨' },
      { id: 'new-template-3', title: 'New template', description: 'Template', icon: '🎨' },
    ],
  },
  {
    title: 'Screenshots',
    items: [
      {
        id: 'screenshot',
        title: 'Screenshot',
        description: 'Capture the chart and insert it here',
        icon: '📷',
      },
    ],
  },
  {
    title: 'Headings',
    items: [
      { id: 'heading-1', title: 'Heading 1', description: 'Top-level heading', icon: 'H₁', shortcut: 'CTRL-ALT-1' },
      { id: 'heading-2', title: 'Heading 2', description: 'Key section heading', icon: 'H₂', shortcut: 'CTRL-ALT-2' },
      { id: 'heading-3', title: 'Heading 3', description: 'Subsection and group heading', icon: 'H₃', shortcut: 'CTRL-ALT-3' },
    ],
  },
  {
    title: 'Basic blocks',
    items: [
      { id: 'quote', title: 'Quote', description: 'Quote or excerpt', icon: '☷' },
      { id: 'toggle-list', title: 'Toggle List', description: 'List with hideable sub-items', icon: '▸☰', shortcut: 'CTRL-SHIFT-6' },
      { id: 'numbered-list', title: 'Numbered List', description: 'List with ordered items', icon: '1☷', shortcut: 'CTRL-SHIFT-7' },
      { id: 'bullet-list', title: 'Bullet List', description: 'List with unordered items', icon: '•☷', shortcut: 'CTRL-SHIFT-8' },
      { id: 'check-list', title: 'Check List', description: 'List with checkboxes', icon: '☑', shortcut: 'CTRL-SHIFT-9' },
      { id: 'paragraph', title: 'Paragraph', description: 'The body of your document', icon: 'T', shortcut: 'CTRL-ALT-0' },
      { id: 'code-block', title: 'Code Block', description: 'Code block with syntax highlighting', icon: '⌨', shortcut: 'CTRL-ALT-C' },
      { id: 'divider', title: 'Divider', description: 'Visually divide blocks', icon: '—' },
    ],
  },
  {
    title: 'Advanced',
    items: [{ id: 'table', title: 'Table', description: 'Table with editable cells', icon: '▦' }],
  },
  {
    title: 'Media',
    items: [
      { id: 'image', title: 'Image', description: 'Resizable image with caption', icon: '▣' },
      { id: 'video', title: 'Video', description: 'Resizable video with caption', icon: '▤' },
      { id: 'audio', title: 'Audio', description: 'Embedded audio with caption', icon: '🔊' },
      { id: 'file', title: 'File', description: 'Embedded file', icon: '▱' },
    ],
  },
  {
    title: 'Subheadings',
    items: [
      { id: 'toggle-heading-1', title: 'Toggle Heading 1', description: 'Toggleable top-level heading', icon: 'H₁' },
      { id: 'toggle-heading-2', title: 'Toggle Heading 2', description: 'Toggleable key section heading', icon: 'H₂' },
      { id: 'toggle-heading-3', title: 'Toggle Heading 3', description: 'Toggleable subsection and group heading', icon: 'H₃' },
      { id: 'heading-4', title: 'Heading 4', description: 'Minor subsection heading', icon: 'H₄', shortcut: 'CTRL-ALT-4' },
      { id: 'heading-5', title: 'Heading 5', description: 'Small subsection heading', icon: 'H₅', shortcut: 'CTRL-ALT-5' },
      { id: 'heading-6', title: 'Heading 6', description: 'Lowest-level heading', icon: 'H₆', shortcut: 'CTRL-ALT-6' },
    ],
  },
  {
    title: 'Others',
    items: [{ id: 'emoji', title: 'Emoji', description: 'Search for and insert an emoji', icon: '●' }],
  },
]

export function mountReplayTradeJournalPanel(root: HTMLElement, opts: JournalPanelOpts) {
  let trade: ClosedReplayTrade | null = null
  let asset = ''
  let activeTab: 'tags' | 'details' = 'tags'
  let screen: 'detail' | 'all' = 'detail'
  let allTab: 'trades' | 'calendar' = 'trades'
  let calendarMode: 'month' | 'year' = 'month'
  let calendarDate = new Date()
  let search = ''
  let selectedShot = -1
  let commandMenuOpen = false
  let pendingMediaType: ReplayJournalBlockType | null = null
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function currentJournal(): ReplayTradeJournal {
    return trade?.journal ? cloneJournal(trade.journal) : blankJournal()
  }

  function scheduleSave(next: ReplayTradeJournal) {
    if (!trade) return
    const tradeNum = trade.tradeNum
    trade.journal = next
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      opts.onChange(tradeNum, { ...cloneJournal(next), updatedAt: Date.now() })
      const modified = root.querySelector('[data-rw-journal-modified]')
      if (modified) modified.textContent = `Modified at ${new Date().toLocaleTimeString()}`
    }, 400)
  }

  function flushSave() {
    if (!saveTimer || !trade?.journal) return
    clearTimeout(saveTimer)
    saveTimer = null
    opts.onChange(trade.tradeNum, {
      ...cloneJournal(trade.journal),
      updatedAt: Date.now(),
    })
  }

  function shots(): ReplayJournalScreenshot[] {
    return normalizeJournalScreenshots(currentJournal().screenshots)
  }

  function saveShots(next: ReplayJournalScreenshot[]) {
    const journal = currentJournal()
    journal.screenshots = next
    scheduleSave(journal)
  }

  function blocks(): ReplayJournalBlock[] {
    return normalizeJournalBlocks(currentJournal().blocks)
  }

  function saveBlocks(next: ReplayJournalBlock[]) {
    const journal = currentJournal()
    journal.blocks = next
    scheduleSave(journal)
  }

  function blockId(): string {
    return `jb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  }

  function blockShell(block: ReplayJournalBlock, body: string): string {
    return `<div class="rw-trade-journal__block rw-trade-journal__block--${block.type}" data-rw-journal-block="${escapeHtml(block.id)}">
      <button type="button" class="rw-trade-journal__block-delete" data-rw-journal-block-delete="${escapeHtml(block.id)}" title="Remove block" aria-label="Remove block">${icons.trash}</button>
      ${body}
    </div>`
  }

  function editableBlock(
    block: ReplayJournalBlock,
    tag: 'div' | 'blockquote' | 'li' | 'code',
    placeholder: string,
  ): string {
    return `<${tag} class="rw-trade-journal__block-text" contenteditable="true" data-rw-journal-block-text="${escapeHtml(block.id)}" data-placeholder="${escapeHtml(placeholder)}">${escapeHtml(block.text ?? '')}</${tag}>`
  }

  function renderJournalBlock(block: ReplayJournalBlock): string {
    if (block.type === 'heading') {
      const level = Math.min(6, Math.max(1, Math.round(block.level ?? 1)))
      const tag = `h${level}`
      return blockShell(
        block,
        `<${tag} contenteditable="true" data-rw-journal-block-text="${escapeHtml(block.id)}" data-placeholder="Heading ${level}">${escapeHtml(block.text ?? '')}</${tag}>`,
      )
    }
    if (block.type === 'paragraph') {
      return blockShell(block, editableBlock(block, 'div', 'Type a paragraph'))
    }
    if (block.type === 'quote') {
      return blockShell(block, editableBlock(block, 'blockquote', 'Type a quote'))
    }
    if (block.type === 'toggle') {
      return blockShell(
        block,
        `<details${block.open !== false ? ' open' : ''} data-rw-journal-toggle="${escapeHtml(block.id)}">
          <summary contenteditable="true" data-rw-journal-block-caption="${escapeHtml(block.id)}">${escapeHtml(block.caption || 'Toggle heading')}</summary>
          <div class="rw-trade-journal__toggle-body" contenteditable="true" data-rw-journal-block-text="${escapeHtml(block.id)}" data-placeholder="Add details">${escapeHtml(block.text ?? '')}</div>
        </details>`,
      )
    }
    if (block.type === 'numbered-list' || block.type === 'bullet-list') {
      const tag = block.type === 'numbered-list' ? 'ol' : 'ul'
      return blockShell(block, `<${tag}>${editableBlock(block, 'li', 'List item')}</${tag}>`)
    }
    if (block.type === 'check-list') {
      return blockShell(
        block,
        `<label class="rw-trade-journal__check-block">
          <input type="checkbox" data-rw-journal-block-check="${escapeHtml(block.id)}"${block.checked ? ' checked' : ''} />
          ${editableBlock(block, 'div', 'Check list item')}
        </label>`,
      )
    }
    if (block.type === 'code') {
      return blockShell(block, `<pre>${editableBlock(block, 'code', 'Enter code')}</pre>`)
    }
    if (block.type === 'divider') {
      return blockShell(block, '<hr />')
    }
    if (block.type === 'table') {
      const rows = block.rows ?? [['', ''], ['', '']]
      const columnCount = rows[0]?.length ?? 0
      const dataRowCount = Math.max(0, rows.length - 1)
      const columnHandles = `<tr class="rw-trade-journal__table-handles">
        <td class="rw-trade-journal__table-gutter"></td>
        ${Array.from(
          { length: columnCount },
          (_, columnIndex) =>
            `<td><button type="button" class="rw-trade-journal__table-handle" data-rw-journal-table-remove="column" data-block-id="${escapeHtml(block.id)}" data-column="${columnIndex}" title="Remove column ${columnIndex + 1}" aria-label="Remove column ${columnIndex + 1}"${columnCount <= 1 ? ' disabled' : ''}></button></td>`,
        ).join('')}
      </tr>`
      const body = rows
        .map((row, rowIndex) => {
          const cellTag = rowIndex === 0 ? 'th' : 'td'
          const gutter =
            rowIndex === 0
              ? '<th class="rw-trade-journal__table-gutter"></th>'
              : `<td class="rw-trade-journal__table-gutter"><button type="button" class="rw-trade-journal__table-handle rw-trade-journal__table-handle--row" data-rw-journal-table-remove="row" data-block-id="${escapeHtml(block.id)}" data-row="${rowIndex}" title="Remove row ${rowIndex}" aria-label="Remove row ${rowIndex}"${rows.length <= 2 ? ' disabled' : ''}></button></td>`
          const cells = row
            .map(
              (cell, columnIndex) =>
                `<${cellTag} contenteditable="true" data-rw-journal-table-cell="${escapeHtml(block.id)}" data-row="${rowIndex}" data-column="${columnIndex}" data-placeholder="${rowIndex === 0 ? `Column ${columnIndex + 1}` : 'Value'}">${escapeHtml(cell)}</${cellTag}>`,
            )
            .join('')
          return `<tr>${gutter}${cells}</tr>`
        })
        .join('')
      return blockShell(
        block,
        `<div class="rw-trade-journal__table-tools">
          <div class="rw-trade-journal__table-stepper">
            <span>Rows</span>
            <button type="button" data-rw-journal-table-action="remove-row" data-block-id="${escapeHtml(block.id)}" aria-label="Remove last row"${rows.length <= 2 ? ' disabled' : ''}>−</button>
            <b>${dataRowCount}</b>
            <button type="button" data-rw-journal-table-action="row" data-block-id="${escapeHtml(block.id)}" aria-label="Add row">+</button>
          </div>
          <div class="rw-trade-journal__table-stepper">
            <span>Columns</span>
            <button type="button" data-rw-journal-table-action="remove-column" data-block-id="${escapeHtml(block.id)}" aria-label="Remove last column"${columnCount <= 1 ? ' disabled' : ''}>−</button>
            <b>${columnCount}</b>
            <button type="button" data-rw-journal-table-action="column" data-block-id="${escapeHtml(block.id)}" aria-label="Add column">+</button>
          </div>
        </div>
        <div class="rw-trade-journal__table-scroll"><table><tbody>${columnHandles}${body}</tbody></table></div>`,
      )
    }
    if (block.type === 'image') {
      return blockShell(
        block,
        `<img src="${escapeHtml(block.src ?? '')}" alt="${escapeHtml(block.caption || block.name || 'Journal image')}" />
         <div class="rw-trade-journal__media-caption" contenteditable="true" data-rw-journal-block-caption="${escapeHtml(block.id)}" data-placeholder="Add caption">${escapeHtml(block.caption ?? '')}</div>`,
      )
    }
    if (block.type === 'video') {
      return blockShell(
        block,
        `<video src="${escapeHtml(block.src ?? '')}" controls preload="metadata"></video>
         <div class="rw-trade-journal__media-caption" contenteditable="true" data-rw-journal-block-caption="${escapeHtml(block.id)}" data-placeholder="Add caption">${escapeHtml(block.caption ?? '')}</div>`,
      )
    }
    if (block.type === 'audio') {
      return blockShell(
        block,
        `<audio src="${escapeHtml(block.src ?? '')}" controls preload="metadata"></audio>
         <div class="rw-trade-journal__media-caption" contenteditable="true" data-rw-journal-block-caption="${escapeHtml(block.id)}" data-placeholder="Add caption">${escapeHtml(block.caption ?? '')}</div>`,
      )
    }
    return blockShell(
      block,
      `<a class="rw-trade-journal__file-block" href="${escapeHtml(block.src ?? '')}" download="${escapeHtml(block.name || 'attachment')}">${icons.download}<span>${escapeHtml(block.name || 'Download file')}</span></a>`,
    )
  }

  function renderJournalBlocks(): string {
    const list = blocks()
    if (!list.length) return ''
    return `<div class="rw-trade-journal__blocks">${list.map(renderJournalBlock).join('')}</div>`
  }

  function shotToolbar(index: number, shot: ReplayJournalScreenshot): string {
    const align = shot.align
    return `<div class="rw-trade-journal__shot-toolbar" data-rw-journal-shot-toolbar="${index}">
      <button type="button" title="Resize" data-rw-journal-shot-tool="crop">${icons.shotCrop}</button>
      <button type="button" title="Image" data-rw-journal-shot-tool="image">${icons.shotImage}</button>
      <button type="button" title="Caption" data-rw-journal-shot-tool="caption"${shot.showCaption ? ' class="is-active"' : ''}>${icons.shotText}</button>
      <button type="button" title="Delete" data-rw-journal-shot-tool="delete">${icons.trash}</button>
      <button type="button" title="Download" data-rw-journal-shot-tool="download">${icons.download}</button>
      <button type="button" title="Add screenshot" data-rw-journal-shot-tool="add" class="is-active">${icons.shotAdd}</button>
      <button type="button" title="Align left" data-rw-journal-shot-tool="align-left"${align === 'left' ? ' class="is-active"' : ''}>${icons.alignLeft}</button>
      <button type="button" title="Align center" data-rw-journal-shot-tool="align-center"${align === 'center' ? ' class="is-active"' : ''}>${icons.alignCenter}</button>
      <button type="button" title="Align right" data-rw-journal-shot-tool="align-right"${align === 'right' ? ' class="is-active"' : ''}>${icons.alignRight}</button>
    </div>`
  }

  function renderScreenshots(): string {
    const list = shots()
    if (!trade || !list.length) return ''
    const current = trade
    return `<div class="rw-trade-journal__screenshots">${list
      .map((shot, index) => {
        const selected = selectedShot === index
        const captionText = shot.caption || defaultShotCaption(asset, current)
        const caption = shot.showCaption
          ? `<figcaption class="rw-trade-journal__shot-caption rw-trade-journal__shot-caption--${shot.align}" contenteditable="true" data-rw-journal-caption="${index}">${escapeHtml(captionText)}</figcaption>`
          : ''
        return `<figure class="rw-trade-journal__screenshot${selected ? ' rw-trade-journal__screenshot--selected' : ''}" data-rw-journal-shot="${index}">
            ${selected ? shotToolbar(index, shot) : ''}
            ${caption}
            <div class="rw-trade-journal__shot-frame">
              <img src="${escapeHtml(shot.src)}" alt="${escapeHtml(shot.caption || `Chart screenshot ${index + 1}`)}" />
            </div>
          </figure>`
      })
      .join('')}</div>`
  }

  function renderCommandMenu(): string {
    if (!commandMenuOpen) return ''
    return `<div class="rw-trade-journal__command-menu" data-rw-journal-command-menu role="menu" aria-label="Insert template or block">
      ${journalCommandSections
        .map(
          (section) => `<section class="rw-trade-journal__command-section">
            <h3>${escapeHtml(section.title)}</h3>
            ${section.items
              .map(
                (item, index) => `<button type="button" role="menuitem" class="rw-trade-journal__command-item${section.title === 'Templates' && index === 0 ? ' rw-trade-journal__command-item--featured' : ''}" data-rw-journal-command="${escapeHtml(item.id)}">
                  <span class="rw-trade-journal__command-icon">${escapeHtml(item.icon)}</span>
                  <span class="rw-trade-journal__command-copy">
                    <strong>${escapeHtml(item.title)}</strong>
                    <small>${escapeHtml(item.description)}</small>
                  </span>
                  ${item.shortcut ? `<kbd>${escapeHtml(item.shortcut)}</kbd>` : ''}
                </button>`,
              )
              .join('')}
          </section>`,
        )
        .join('')}
    </div>`
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
    const screenshotHtml = renderScreenshots()
    const blockHtml = renderJournalBlocks()
    const mediaAccept =
      pendingMediaType === 'image'
        ? 'image/*'
        : pendingMediaType === 'video'
          ? 'video/*'
          : pendingMediaType === 'audio'
            ? 'audio/*'
            : '*/*'
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
        <div class="rw-trade-journal__editor${screenshotHtml ? ' rw-trade-journal__editor--with-screenshot' : ''}${blockHtml ? ' rw-trade-journal__editor--with-blocks' : ''}${journal.notes.trim() ? ' rw-trade-journal__editor--with-notes' : ''}">
          <div class="rw-trade-journal__editor-tools">
            <button type="button" data-rw-journal-command-toggle aria-label="Insert template or block" aria-expanded="${commandMenuOpen ? 'true' : 'false'}">＋</button>
            <span aria-hidden="true">⠿</span>
          </div>
          <textarea class="rw-trade-journal__notes" data-rw-journal-notes placeholder="Enter text or type '/' for commands">${escapeHtml(journal.notes)}</textarea>
          ${blockHtml}
          ${screenshotHtml}
          ${renderCommandMenu()}
          <input type="file" data-rw-journal-media-input accept="${mediaAccept}" hidden />
        </div>
        <div class="rw-trade-journal__commands">
          <button type="button" data-rw-journal-screenshot>${icons.camera}<span>/screenshots</span></button>
          <button type="button" data-rw-journal-template>${icons.palette}<span>/templates</span></button>
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
    commandMenuOpen = false
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
    } else if (target.matches('[data-rw-journal-caption]')) {
      const index = Number((target as HTMLElement).dataset.rwJournalCaption)
      const next = shots()
      if (!Number.isInteger(index) || !next[index]) return
      next[index] = { ...next[index], caption: (target as HTMLElement).innerText }
      saveShots(next)
    } else if (target.matches('[data-rw-journal-block-text]')) {
      const id = target.dataset.rwJournalBlockText
      const next = blocks()
      const index = next.findIndex((block) => block.id === id)
      if (index < 0) return
      next[index] = { ...next[index], text: target.innerText }
      saveBlocks(next)
    } else if (target.matches('[data-rw-journal-block-caption]')) {
      const id = target.dataset.rwJournalBlockCaption
      const next = blocks()
      const index = next.findIndex((block) => block.id === id)
      if (index < 0) return
      next[index] = { ...next[index], caption: target.innerText }
      saveBlocks(next)
    } else if (target.matches('[data-rw-journal-table-cell]')) {
      const id = target.dataset.rwJournalTableCell
      const row = Number(target.dataset.row)
      const column = Number(target.dataset.column)
      const next = blocks()
      const index = next.findIndex((block) => block.id === id)
      if (index < 0 || !next[index].rows?.[row]) return
      const rows = next[index].rows!.map((item) => [...item])
      rows[row][column] = target.innerText
      next[index] = { ...next[index], rows }
      saveBlocks(next)
    }
  }

  function fileDataUrl(file: File): Promise<string | null> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    })
  }

  async function onChange(event: Event) {
    if (!trade) return
    const target = event.target as HTMLElement
    if (target.matches('[data-rw-journal-rating]')) {
      scheduleSave({ ...currentJournal(), rating: (target as HTMLSelectElement).value })
    } else if (target.matches('[data-rw-journal-block-check]')) {
      const id = target.dataset.rwJournalBlockCheck
      const next = blocks()
      const index = next.findIndex((block) => block.id === id)
      if (index < 0) return
      next[index] = { ...next[index], checked: (target as HTMLInputElement).checked }
      saveBlocks(next)
    } else if (target.matches('[data-rw-journal-media-input]')) {
      const file = (target as HTMLInputElement).files?.[0]
      const type = pendingMediaType
      pendingMediaType = null
      if (!file || !type) return
      const src = await fileDataUrl(file)
      if (!src || !trade) return
      const next = blocks()
      next.push({
        id: blockId(),
        type,
        src,
        name: file.name,
        caption: '',
      })
      saveBlocks(next)
      render()
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (!trade) return
    const key = event.key.toLowerCase()
    const shortcut =
      event.ctrlKey && event.altKey
        ? key === '0'
          ? 'paragraph'
          : /^[1-6]$/.test(key)
            ? `heading-${key}`
            : key === 'c'
              ? 'code-block'
              : ''
        : event.ctrlKey && event.shiftKey
          ? ({ '6': 'toggle-list', '7': 'numbered-list', '8': 'bullet-list', '9': 'check-list' }[
              key
            ] ?? '')
          : ''
    if (shortcut) {
      event.preventDefault()
      void applyJournalCommand(shortcut)
      return
    }
    if (
      event.key === '/' &&
      (event.target as HTMLElement).matches('[data-rw-journal-notes]')
    ) {
      event.preventDefault()
      commandMenuOpen = true
      render()
      return
    }
    if (event.key === 'Escape' && commandMenuOpen) {
      event.preventDefault()
      commandMenuOpen = false
      render()
      return
    }
    if (event.key !== 'Enter') return
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

  function makeBlock(
    type: ReplayJournalBlockType,
    patch: Omit<ReplayJournalBlock, 'id' | 'type'> = {},
  ): ReplayJournalBlock {
    return { id: blockId(), type, ...patch }
  }

  function appendBlocks(items: ReplayJournalBlock[]) {
    saveBlocks([...blocks(), ...items])
    commandMenuOpen = false
    render()
    const inserted = items[0]
    if (!inserted) return
    const editable = root.querySelector<HTMLElement>(
      `[data-rw-journal-block="${inserted.id}"] [contenteditable="true"]`,
    )
    editable?.focus()
  }

  async function applyJournalCommand(command: string) {
    if (command === 'screenshot') {
      commandMenuOpen = false
      render()
      await addScreenshot()
      return
    }
    if (command === 'beginner') {
      appendBlocks([
        makeBlock('heading', { level: 2, text: 'Trade thesis' }),
        makeBlock('paragraph', { text: 'Describe why you took this trade.' }),
        makeBlock('heading', { level: 3, text: 'Entry reason' }),
        makeBlock('paragraph'),
        makeBlock('heading', { level: 3, text: 'Risk plan' }),
        makeBlock('check-list', { text: 'Followed my risk plan' }),
        makeBlock('heading', { level: 3, text: 'Lesson for next trade' }),
        makeBlock('paragraph'),
      ])
      return
    }
    if (command === 'daily-report') {
      appendBlocks([
        makeBlock('heading', { level: 1, text: 'Daily report card' }),
        makeBlock('heading', { level: 3, text: 'Market context' }),
        makeBlock('paragraph'),
        makeBlock('heading', { level: 3, text: 'Best trade' }),
        makeBlock('paragraph'),
        makeBlock('heading', { level: 3, text: 'Biggest mistake' }),
        makeBlock('paragraph'),
        makeBlock('check-list', { text: 'Maintained risk discipline' }),
        makeBlock('heading', { level: 3, text: 'Plan for tomorrow' }),
        makeBlock('paragraph'),
      ])
      return
    }
    if (command.startsWith('new-template-')) {
      appendBlocks([
        makeBlock('heading', { level: 2, text: 'New template' }),
        makeBlock('paragraph'),
      ])
      return
    }
    if (command === 'image' || command === 'video' || command === 'audio' || command === 'file') {
      pendingMediaType = command
      commandMenuOpen = false
      render()
      root.querySelector<HTMLInputElement>('[data-rw-journal-media-input]')?.click()
      return
    }
    const headingMatch = command.match(/^heading-([1-6])$/)
    if (headingMatch) {
      const level = Number(headingMatch[1])
      appendBlocks([makeBlock('heading', { level, text: `Heading ${level}` })])
      return
    }
    const toggleHeadingMatch = command.match(/^toggle-heading-([1-3])$/)
    if (toggleHeadingMatch) {
      appendBlocks([
        makeBlock('toggle', {
          caption: `Toggle Heading ${toggleHeadingMatch[1]}`,
          text: '',
          open: true,
        }),
      ])
      return
    }
    const blockByCommand: Record<string, ReplayJournalBlock> = {
      quote: makeBlock('quote'),
      'toggle-list': makeBlock('toggle', { caption: 'Toggle item', open: true }),
      'numbered-list': makeBlock('numbered-list'),
      'bullet-list': makeBlock('bullet-list'),
      'check-list': makeBlock('check-list'),
      paragraph: makeBlock('paragraph'),
      'code-block': makeBlock('code'),
      divider: makeBlock('divider'),
      table: makeBlock('table', { rows: [['Column 1', 'Column 2'], ['', '']] }),
      emoji: makeBlock('paragraph', { text: '🙂' }),
    }
    const block = blockByCommand[command]
    if (block) appendBlocks([block])
  }

  async function onClick(event: Event) {
    if (!trade) return
    const target = event.target as HTMLElement
    const command = target.closest<HTMLElement>('[data-rw-journal-command]')
    if (command?.dataset.rwJournalCommand) {
      await applyJournalCommand(command.dataset.rwJournalCommand)
      return
    }
    if (
      target.closest('[data-rw-journal-command-toggle]') ||
      target.closest('[data-rw-journal-template]')
    ) {
      commandMenuOpen = !commandMenuOpen
      render()
      return
    }
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
    const blockDelete = target.closest<HTMLElement>('[data-rw-journal-block-delete]')
    if (blockDelete?.dataset.rwJournalBlockDelete) {
      const id = blockDelete.dataset.rwJournalBlockDelete
      saveBlocks(blocks().filter((block) => block.id !== id))
      render()
      return
    }
    const tableRemove = target.closest<HTMLElement>('[data-rw-journal-table-remove]')
    if (tableRemove?.dataset.blockId) {
      const next = blocks()
      const index = next.findIndex((block) => block.id === tableRemove.dataset.blockId)
      if (index < 0) return
      const rows = (next[index].rows ?? []).map((row) => [...row])
      if (tableRemove.dataset.rwJournalTableRemove === 'row') {
        const row = Number(tableRemove.dataset.row)
        if (rows.length <= 2 || row < 1 || row >= rows.length) return
        rows.splice(row, 1)
      } else {
        const column = Number(tableRemove.dataset.column)
        if ((rows[0]?.length ?? 0) <= 1 || column < 0) return
        rows.forEach((row) => row.splice(column, 1))
      }
      next[index] = { ...next[index], rows }
      saveBlocks(next)
      render()
      return
    }
    const tableAction = target.closest<HTMLElement>('[data-rw-journal-table-action]')
    if (tableAction?.dataset.blockId) {
      const next = blocks()
      const index = next.findIndex((block) => block.id === tableAction.dataset.blockId)
      if (index < 0) return
      const rows = (next[index].rows ?? [['', ''], ['', '']]).map((row) => [...row])
      const action = tableAction.dataset.rwJournalTableAction
      if (action === 'row') {
        rows.push(Array.from({ length: rows[0]?.length || 2 }, () => ''))
      } else if (action === 'column') {
        rows.forEach((row, rowIndex) => row.push(rowIndex === 0 ? `Column ${row.length + 1}` : ''))
      } else if (action === 'remove-row') {
        if (rows.length <= 2) return
        rows.pop()
      } else if (action === 'remove-column') {
        if ((rows[0]?.length ?? 0) <= 1) return
        rows.forEach((row) => row.pop())
      }
      next[index] = { ...next[index], rows }
      saveBlocks(next)
      render()
      return
    }
    const toggle = target.closest<HTMLDetailsElement>('[data-rw-journal-toggle]')
    if (toggle) {
      window.setTimeout(() => {
        const next = blocks()
        const index = next.findIndex((block) => block.id === toggle.dataset.rwJournalToggle)
        if (index < 0) return
        next[index] = { ...next[index], open: toggle.open }
        saveBlocks(next)
      }, 0)
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
    const shotTool = target.closest<HTMLElement>('[data-rw-journal-shot-tool]')
    if (shotTool) {
      const figure = shotTool.closest<HTMLElement>('[data-rw-journal-shot]')
      const index = Number(figure?.dataset.rwJournalShot)
      const next = shots()
      const shot = next[index]
      if (!shot) return
      const tool = shotTool.dataset.rwJournalShotTool
      if (tool === 'caption') {
        next[index] = {
          ...shot,
          showCaption: !shot.showCaption,
          caption: shot.caption || defaultShotCaption(asset, trade),
        }
        saveShots(next)
        render()
        return
      }
      if (tool === 'delete') {
        next.splice(index, 1)
        selectedShot = next.length ? Math.min(index, next.length - 1) : -1
        saveShots(next)
        render()
        return
      }
      if (tool === 'download') {
        downloadDataUrl(shot.src, `trade-${trade.tradeNum}-screenshot-${index + 1}.webp`)
        return
      }
      if (tool === 'add') {
        await addScreenshot()
        return
      }
      if (tool === 'align-left' || tool === 'align-center' || tool === 'align-right') {
        const align = tool.replace('align-', '') as ReplayJournalScreenshotAlign
        next[index] = { ...shot, align, showCaption: true, caption: shot.caption || defaultShotCaption(asset, trade) }
        saveShots(next)
        render()
        return
      }
      return
    }
    const shotFigure = target.closest<HTMLElement>('[data-rw-journal-shot]')
    if (shotFigure) {
      const index = Number(shotFigure.dataset.rwJournalShot)
      if (selectedShot !== index) {
        selectedShot = index
        render()
      }
      return
    }
    if (target.closest('[data-rw-journal-screenshot]')) {
      await addScreenshot()
    }
  }

  async function addScreenshot() {
    if (!trade) return
    const tradeNum = trade.tradeNum
    const screenshot = await opts.onCaptureScreenshot()
    if (!screenshot || trade?.tradeNum !== tradeNum) return
    const next = shots()
    next.push({
      src: screenshot,
      caption: defaultShotCaption(asset, trade),
      align: 'left',
      showCaption: true,
    })
    selectedShot = next.length - 1
    saveShots(next)
    render()
  }

  root.addEventListener('input', onInput)
  root.addEventListener('change', onChange)
  root.addEventListener('keydown', onKeydown)
  root.addEventListener('click', onClick)

  return {
    open(nextTrade: ClosedReplayTrade, nextAsset: string) {
      flushSave()
      trade = {
        ...nextTrade,
        journal: nextTrade.journal ? cloneJournal(nextTrade.journal) : undefined,
      }
      asset = nextAsset
      screen = 'detail'
      activeTab = 'tags'
      commandMenuOpen = false
      selectedShot = shots().length ? 0 : -1
      root.hidden = false
      render()
    },
    refresh(nextTrade: ClosedReplayTrade) {
      if (trade?.tradeNum !== nextTrade.tradeNum) return
      trade = {
        ...nextTrade,
        journal: nextTrade.journal ? cloneJournal(nextTrade.journal) : undefined,
      }
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
