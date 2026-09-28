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
export function buildHeroSparkSvg(points: number[]): string {
  if (points.length === 0) return ''
  const width = 100
  const height = 36
  const series = points.length === 1 ? [0, points[0]!] : points
  const min = Math.min(...series, 0)
  const max = Math.max(...series, 0)
  const span = max - min || 1
  const stepX = width / (series.length - 1)
  const coords = series.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / span) * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const line = coords.join(' ')
  const zeroY = height - ((0 - min) / span) * height
  const closing = series[series.length - 1] ?? 0
  const tone = closing < 0 ? 'is-loss' : closing > 0 ? 'is-profit' : 'is-flat'
  const gradientId = `sx-spark-grad-${tone}`
  return `<svg class="sx-spark ${tone}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity="0.3" />
          <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
      </defs>
      <polygon class="sx-spark__fill" fill="url(#${gradientId})" points="0,${height} ${line} ${width},${height}" />
      <line class="sx-spark__zero" x1="0" y1="${zeroY.toFixed(2)}" x2="${width}" y2="${zeroY.toFixed(2)}" />
      <polyline class="sx-spark__line" points="${line}" />
    </svg>`
}
