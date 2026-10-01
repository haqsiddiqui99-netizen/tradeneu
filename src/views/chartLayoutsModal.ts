import './chartLayoutsModal.css'
import { syncChartThemeToElement } from '../styles/syncChartTheme'
import { formatChartLayoutMeta, type ChartLayoutRecord } from '../chart/chartLayoutStore'

export type ChartLayoutsModalApi = {
  open: () => void
  close: () => void
  dispose: () => void
}

/** Recency is what the list opens on; the column header switches it to alphabetical. */
type SortMode = 'recent' | 'name'

const ICO_SEARCH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65"><circle cx="10.5" cy="10.5" r="6.25"/><path d="M15.2 15.2 21 21" stroke-linecap="round"/></svg>`
/** An arrow beside descending bars, as the reference draws it, rather than two opposed arrows. */
const ICO_SORT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16M6 20l-3-3M6 20l3-3"/><path d="M12 6h9M12 12h6M12 18h3"/></svg>`
/**
 * A lidded can with three ribs down it, traced off the reference: the handle splays from a 2.6-wide
 * flat top out to the lid, the lid overhangs the can on both sides, and the can narrows by 0.7 a
 * side on the way down so it reads as a bucket rather than a box.
 *
 * Two places knowingly depart from the reference. Its lid is a hollow capsule, but at the 19px this
 * renders at that capsule's interior would come to a third of a pixel, so the lid is one bar of the
 * same weight instead. Its strokes are also only a twentieth of the glyph's width, which would land
 * near half a pixel here, so the weight stays with the search and sort glyphs beside it; the ribs
 * are spaced 3 apart, which leaves them clear of each other and of the walls at that weight.
 */
const ICO_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.15 5.9 10.7 3h2.6l1.55 2.9"/><path d="M5 5.9h14"/><path d="M6.2 7.3 6.9 21h10.2l.7-13.7"/><path d="M9 9.8v8.6M12 9.8v8.6M15 9.8v8.6"/></svg>`

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type ChartLayoutNameDialogApi = {
  /** Resolves with the trimmed name, or null if the user backed out. */
  prompt: (args: { title: string; confirmLabel: string; value: string }) => Promise<string | null>
  dispose: () => void
}

/** Shared by Rename... and Make a copy... — both just need one name back. */
export function createChartLayoutNameDialog(): ChartLayoutNameDialogApi {
  const dlg = document.createElement('dialog')
  dlg.className = 'rw-layname-dlg'
  dlg.innerHTML = `
    <form class="rw-layname" method="dialog">
      <div class="rw-layname__head" data-rw-layname-title></div>
      <input
        type="text"
        class="rw-layname__input"
        data-rw-layname-input
        aria-label="Layout name"
        autocomplete="off"
        maxlength="80"
      />
      <div class="rw-layname__foot">
        <button type="button" class="rw-layname__btn" data-rw-layname-cancel>Cancel</button>
        <button type="submit" class="rw-layname__btn rw-layname__btn--go" data-rw-layname-ok></button>
      </div>
    </form>
  `
  document.body.appendChild(dlg)

  const title = dlg.querySelector('[data-rw-layname-title]') as HTMLElement
  const input = dlg.querySelector('[data-rw-layname-input]') as HTMLInputElement
  const btnOk = dlg.querySelector('[data-rw-layname-ok]') as HTMLButtonElement
  const btnCancel = dlg.querySelector('[data-rw-layname-cancel]') as HTMLButtonElement
  const form = dlg.querySelector('form') as HTMLFormElement

  let settle: ((value: string | null) => void) | null = null

  function finish(value: string | null) {
    const done = settle
    settle = null
    if (dlg.open) dlg.close()
    done?.(value)
  }

  input.addEventListener('input', () => {
    btnOk.disabled = !input.value.trim()
  })
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const value = input.value.trim()
    if (value) finish(value)
  })
  btnCancel.addEventListener('click', () => finish(null))
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault()
    finish(null)
  })

  return {
    prompt({ title: heading, confirmLabel, value }) {
      // A second prompt while one is open would strand the first promise.
      finish(null)
      syncChartThemeToElement(dlg)
      title.textContent = heading
      btnOk.textContent = confirmLabel
      input.value = value
      btnOk.disabled = !value.trim()
      if (typeof dlg.showModal === 'function') dlg.showModal()
      else dlg.setAttribute('open', '')
      requestAnimationFrame(() => {
        input.focus()
        input.select()
      })
      return new Promise<string | null>((resolve) => {
        settle = resolve
      })
    },
    dispose() {
      finish(null)
      dlg.remove()
    },
  }
}

export function createChartLayoutsModal(opts: {
  getLayouts: () => ChartLayoutRecord[]
  getActiveId: () => string | null
  onPick: (id: string) => void
  onDelete: (id: string) => void
}): ChartLayoutsModalApi {
  const dlg = document.createElement('dialog')
  dlg.className = 'rw-layouts-dlg'
  dlg.setAttribute('aria-labelledby', 'rw-layouts-title')

  dlg.innerHTML = `
    <div class="rw-layouts">
      <div class="rw-layouts__head">
        <span id="rw-layouts-title">Layouts</span>
        <button type="button" class="rw-layouts__x" data-rw-layouts-close aria-label="Close">×</button>
      </div>
      <div class="rw-layouts__search">
        <span class="rw-layouts__search-ico" aria-hidden="true">${ICO_SEARCH}</span>
        <input
          type="search"
          class="rw-layouts__search-input"
          data-rw-layouts-search
          placeholder="Search"
          aria-label="Search layouts"
          autocomplete="off"
        />
      </div>
      <div class="rw-layouts__col">
        <span class="rw-layouts__col-lbl">Layout name</span>
        <button
          type="button"
          class="rw-layouts__sort"
          data-rw-layouts-sort
          aria-label="Change sort order"
        >${ICO_SORT}</button>
      </div>
      <div class="rw-layouts__body" data-rw-layouts-list role="listbox" aria-label="Saved layouts"></div>
    </div>
  `

  document.body.appendChild(dlg)

  const btnClose = dlg.querySelector('[data-rw-layouts-close]') as HTMLButtonElement
  const btnSort = dlg.querySelector('[data-rw-layouts-sort]') as HTMLButtonElement
  const inputSearch = dlg.querySelector('[data-rw-layouts-search]') as HTMLInputElement
  const list = dlg.querySelector('[data-rw-layouts-list]') as HTMLElement

  let sortMode: SortMode = 'recent'

  function visibleLayouts(): ChartLayoutRecord[] {
    const q = inputSearch.value.trim().toLowerCase()
    const rows = opts
      .getLayouts()
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.symbol.toLowerCase().includes(q))
    return sortMode === 'name'
      ? rows.sort((a, b) => a.name.localeCompare(b.name))
      : rows.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  function render() {
    btnSort.classList.toggle('rw-layouts__sort--name', sortMode === 'name')
    btnSort.title = sortMode === 'name' ? 'Sorted by name (A–Z)' : 'Sorted by last modified'

    const rows = visibleLayouts()
    if (!rows.length) {
      list.innerHTML = `<p class="rw-layouts__empty">${
        opts.getLayouts().length ? 'No layouts match that search.' : 'No saved layouts yet.'
      }</p>`
      return
    }

    const activeId = opts.getActiveId()
    list.innerHTML = rows
      .map(
        (r) => `
        <div
          class="rw-layouts__row${r.id === activeId ? ' rw-layouts__row--active' : ''}"
          data-rw-layout-id="${escapeHtml(r.id)}"
          role="option"
          tabindex="0"
          aria-selected="${r.id === activeId ? 'true' : 'false'}"
        >
          <span class="rw-layouts__name">${escapeHtml(r.name)}</span>
          <span class="rw-layouts__meta">${escapeHtml(formatChartLayoutMeta(r))}</span>
          <button
            type="button"
            class="rw-layouts__del"
            data-rw-layout-delete="${escapeHtml(r.id)}"
            title="Delete layout"
            aria-label="Delete ${escapeHtml(r.name)}"
          >${ICO_TRASH}</button>
        </div>`,
      )
      .join('')
  }

  function closeDialog() {
    if (dlg.open) dlg.close()
  }

  function pick(id: string) {
    closeDialog()
    opts.onPick(id)
  }

  list.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const del = target.closest<HTMLElement>('[data-rw-layout-delete]')
    if (del) {
      e.stopPropagation()
      opts.onDelete(del.dataset.rwLayoutDelete!)
      render()
      return
    }
    const row = target.closest<HTMLElement>('[data-rw-layout-id]')
    if (row) pick(row.dataset.rwLayoutId!)
  })

  list.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-rw-layout-id]')
    if (!row) return
    e.preventDefault()
    pick(row.dataset.rwLayoutId!)
  })

  inputSearch.addEventListener('input', render)
  btnSort.addEventListener('click', () => {
    sortMode = sortMode === 'recent' ? 'name' : 'recent'
    render()
  })
  btnClose.addEventListener('click', closeDialog)
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault()
    closeDialog()
  })

  return {
    open() {
      syncChartThemeToElement(dlg)
      inputSearch.value = ''
      render()
      if (typeof dlg.showModal === 'function') dlg.showModal()
      else dlg.setAttribute('open', '')
      requestAnimationFrame(() => inputSearch.focus())
    },
    close: closeDialog,
    dispose() {
      closeDialog()
      dlg.remove()
    },
  }
}
