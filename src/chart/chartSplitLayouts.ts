/**
 * Split-screen chart arrangements.
 *
 * TradingView's own multi-chart layouts are a Trading Platform feature and our package is the
 * plain Charting Library, so `setLayout()` is a no-op here and we arrange the panes ourselves.
 * The trees below are transcribed from the layout definitions the library bundle ships, so the
 * ids, the pane ordering and the resulting shapes match TradingView's picker exactly.
 *
 * `h` lays its children out side by side (splitting width); `v` stacks them (splitting height).
 * Leaves are chart indices, which are deliberately not sequential — `2-1` really does put chart
 * 2 next to chart 0 on the top row.
 */

export type SplitNode = number | { dir: 'h' | 'v'; kids: SplitNode[] }

const h = (...kids: SplitNode[]): SplitNode => ({ dir: 'h', kids })
const v = (...kids: SplitNode[]): SplitNode => ({ dir: 'v', kids })

const LAYOUTS: Record<string, SplitNode> = {
  s: 0,

  '2h': h(0, 1),
  '2v': v(0, 1),

  '3h': h(0, 1, 2),
  '3v': v(0, 1, 2),
  '3s': h(0, v(1, 2)),
  '3r': h(v(0, 1), 2),
  '2-1': v(h(0, 2), 1),
  '1-2': v(0, h(1, 2)),

  '4': v(h(0, 2), h(1, 3)),
  '4v': v(0, 1, 2, 3),
  '4h': h(0, 1, 2, 3),
  '4s': h(0, v(1, 2, 3)),
  '4s-l': h(v(1, 2, 3), 0),
  '1-3': v(0, h(1, 2, 3)),
  '3-1': v(h(0, 1, 2), 3),
  '2-2-l': h(0, 1, v(2, 3)),
  '2-2-r': h(v(0, 1), 2, 3),
  '2-2': v(h(0, 1), v(2, 3)),

  '1-4': v(0, h(1, 2, 3, 4)),
  '5h': h(0, 1, 2, 3, 4),
  '5v': v(0, 1, 2, 3, 4),
  '5s': h(0, v(1, 2, 3, 4)),
  '5s-l': h(v(1, 2, 3, 4), 0),
  '2-3': v(h(0, 1), h(2, 3, 4)),
  '3-2': v(h(0, 1, 2), h(3, 4)),
  '4-1': v(h(0, 1, 2, 3), 4),
  '2-3-l': h(0, 1, v(2, 3, 4)),
  '2-3-r': h(v(0, 1, 2), 3, 4),

  '6': v(h(0, 2, 4), h(1, 3, 5)),
  '6h': h(0, 1, 2, 3, 4, 5),
  '6v': v(0, 1, 2, 3, 4, 5),
  '6c': v(h(0, 1), h(2, 3), h(4, 5)),
  '2-4': v(h(0, 1), h(2, 3, 4, 5)),
  '4-2': v(h(0, 1, 2, 3), h(4, 5)),

  '4-3': v(h(0, 1, 2, 3), h(4, 5, 6)),
  '7h': h(0, 1, 2, 3, 4, 5, 6),
  '7s': h(0, v(1, 2, 3, 4, 5, 6)),

  '8': v(h(0, 2, 4, 6), h(1, 3, 5, 7)),
  '8c': v(h(0, 1), h(2, 3), h(4, 5), h(6, 7)),
  '8h': h(0, 1, 2, 3, 4, 5, 6, 7),
  '8v': v(0, 1, 2, 3, 4, 5, 6, 7),
}

/** Picker rows, keyed by chart count — mirrors the order TradingView lists them in. */
export const SPLIT_LAYOUT_ROWS: Array<{ count: number; ids: string[] }> = [
  { count: 1, ids: ['s'] },
  { count: 2, ids: ['2h', '2v'] },
  { count: 3, ids: ['3h', '3v', '3s', '3r', '2-1', '1-2'] },
  { count: 4, ids: ['4', '4v', '4h', '4s', '4s-l', '1-3', '3-1', '2-2-l', '2-2-r', '2-2'] },
  { count: 5, ids: ['1-4', '5h', '5v', '5s', '5s-l', '2-3', '3-2', '4-1', '2-3-l', '2-3-r'] },
  { count: 6, ids: ['6', '6h', '6v', '6c', '2-4', '4-2'] },
  { count: 7, ids: ['4-3', '7h', '7s'] },
  { count: 8, ids: ['8', '8c', '8h', '8v'] },
]

export const DEFAULT_SPLIT_LAYOUT = 's'

export type SplitPane = {
  /** Chart index this cell hosts. Pane 0 is always the primary, fully-wired chart. */
  chart: number
  /** Fractions of the grid box, 0..1. */
  x: number
  y: number
  w: number
  h: number
}

type Divider = { x1: number; y1: number; x2: number; y2: number }

function walk(
  node: SplitNode,
  box: { x: number; y: number; w: number; h: number },
  panes: SplitPane[],
  dividers: Divider[],
): void {
  if (typeof node === 'number') {
    panes.push({ chart: node, ...box })
    return
  }
  const n = node.kids.length
  if (n === 0) return
  if (node.dir === 'h') {
    const w = box.w / n
    for (let i = 0; i < n; i++) {
      const x = box.x + i * w
      if (i > 0) dividers.push({ x1: x, y1: box.y, x2: x, y2: box.y + box.h })
      walk(node.kids[i]!, { x, y: box.y, w, h: box.h }, panes, dividers)
    }
    return
  }
  const hh = box.h / n
  for (let i = 0; i < n; i++) {
    const y = box.y + i * hh
    if (i > 0) dividers.push({ x1: box.x, y1: y, x2: box.x + box.w, y2: y })
    walk(node.kids[i]!, { x: box.x, y, w: box.w, h: hh }, panes, dividers)
  }
}

export function isSplitLayoutId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(LAYOUTS, id)
}

/** Cells in the order they should be mounted, sorted by chart index. */
export function splitLayoutPanes(id: string): SplitPane[] {
  const node = LAYOUTS[id]
  if (node === undefined) return splitLayoutPanes(DEFAULT_SPLIT_LAYOUT)
  const panes: SplitPane[] = []
  walk(node, { x: 0, y: 0, w: 1, h: 1 }, panes, [])
  return panes.sort((a, b) => a.chart - b.chart)
}

export function splitLayoutChartCount(id: string): number {
  return splitLayoutPanes(id).length
}

/**
 * TradingView draws these as one rounded outline with internal divider lines rather than a set
 * of separate boxes, so the cells read as panes of a single chart area.
 */
export function splitLayoutIconSvg(id: string): string {
  const node = LAYOUTS[id]
  if (node === undefined) return splitLayoutIconSvg(DEFAULT_SPLIT_LAYOUT)
  const dividers: Divider[] = []
  walk(node, { x: 0, y: 0, w: 1, h: 1 }, [], dividers)

  // 1px inset keeps the outline's own stroke inside the viewBox.
  const S = 22
  const to = (f: number) => +(1 + f * (S - 2)).toFixed(2)
  const lines = dividers
    .map((d) => `<path d="M${to(d.x1)} ${to(d.y1)}L${to(d.x2)} ${to(d.y2)}"/>`)
    .join('')

  return `<svg viewBox="0 0 ${S} ${S}" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="1" y="1" width="${S - 2}" height="${S - 2}" rx="2.5"/>${lines}</svg>`
}
