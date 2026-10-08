/**
 * Small running-P&L sparkline shared by the dashboard hero card and the public
 * landing page. Kept in its own module so the landing route doesn't have to
 * import the whole dashboard shell just to draw one chart.
 *
 * Styling lives with each caller's stylesheet: the SVG only emits `sx-spark`
 * class names plus an `is-profit` / `is-loss` / `is-flat` tone.
 */

/**
 * Illustrative figures for the "example session" card shown before a trader has
 * any real data. Labelled as an example on screen so it can't be mistaken for
 * their own results. The curve closes at the +4.2R the card quotes.
 */
export const HERO_EXAMPLE_CURVE = [0, 0.5, -0.3, 0.8, 0.4, 1.4, 1.1, 2, 1.6, 2.5, 2.2, 3, 3.5, 3.1, 4.2]
export const HERO_EXAMPLE_PRICE = '2,398.40'
export const HERO_EXAMPLE_NET = '+4.2R'
export const HERO_EXAMPLE_WINRATE = '58%'

/**
 * Tinted by the closing value so a losing session reads red at a glance. The
 * baseline is pinned to 0 so a flat or single-trade series still draws something
 * meaningful, and a dashed break-even line marks where the session went
 * underwater.
 */
let sparkSeq = 0

export function buildHeroSparkSvg(points: number[], opts?: { marker?: string }): string {
  if (points.length === 0) return ''
  const width = 100
  const height = 48
  const padY = 6
  const series = points.length === 1 ? [0, points[0]!] : points
  const min = Math.min(...series, 0)
  const max = Math.max(...series, 0)
  const span = max - min || 1
  const stepX = width / (series.length - 1)
  const pairs = series.map((v, i) => {
    const x = i * stepX
    const y = padY + (height - padY * 2) - ((v - min) / span) * (height - padY * 2)
    return { x, y }
  })
  const line = pairs.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  const zeroY = padY + (height - padY * 2) - ((0 - min) / span) * (height - padY * 2)
  const last = pairs[pairs.length - 1]!
  const closing = series[series.length - 1] ?? 0
  const tone = closing < 0 ? 'is-loss' : closing > 0 ? 'is-profit' : 'is-flat'
  const id = `sx-spark-${++sparkSeq}`
  const grids = [0.28, 0.55, 0.82]
    .map((t) => {
      const y = (padY + (height - padY * 2) * t).toFixed(2)
      return `<line class="sx-spark__grid" x1="0" y1="${y}" x2="${width}" y2="${y}" />`
    })
    .join('')
  const marker = opts?.marker
    ? `<svg class="sx-spark__tag" x="${Math.max(0, last.x - 18).toFixed(2)}" y="${Math.max(0, last.y - 14).toFixed(2)}" width="16" height="7" viewBox="0 0 36 14" preserveAspectRatio="xMidYMid meet">
        <rect width="36" height="14" rx="7" fill="currentColor" />
        <text x="18" y="10" text-anchor="middle" fill="#fff" font-size="8" font-family="Inter, Segoe UI, sans-serif" font-weight="700">${opts.marker.replace(/[&<>]/g, '')}</text>
      </svg>`
    : ''
  return `<svg class="sx-spark ${tone}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity="0.45" />
          <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${grids}
      <polygon class="sx-spark__fill" fill="url(#${id})" points="0,${height} ${line} ${width},${height}" />
      <line class="sx-spark__zero" x1="0" y1="${zeroY.toFixed(2)}" x2="${width}" y2="${zeroY.toFixed(2)}" />
      <polyline class="sx-spark__line" points="${line}" />
      <svg class="sx-spark__dot" x="${(last.x - 2.2).toFixed(2)}" y="${(last.y - 2.6).toFixed(2)}" width="4.4" height="5.2" viewBox="0 0 12 12" preserveAspectRatio="xMidYMid meet">
        <circle cx="6" cy="6" r="5" fill="currentColor" opacity="0.28" />
        <circle cx="6" cy="6" r="2.4" fill="#fff" />
      </svg>
      ${marker}
    </svg>`
}
