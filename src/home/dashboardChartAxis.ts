// Shared Chart.js axis decoration for the dashboard and analytics charts.
import type { Plugin } from 'chart.js'

/**
 * Draws the vertical y-axis line down the left edge of the plot area, matching
 * the weight and colour of the solid zero line that acts as the x-axis.
 *
 * Chart.js would normally draw this via the y scale's `border`, but on these
 * charts `border.dash` is already doing the dotted-gridline work, and turning
 * the border on there would make the axis dashed too. Stroking it ourselves
 * keeps the gridlines untouched.
 *
 * Pair this with `grid.drawTicks: false` on the y scale so no tick stubs poke
 * out to the left of the line into the label gutter.
 */
export const sxAxisLinePlugin: Plugin = {
  id: 'sxAxisLine',
  afterDraw(chart) {
    const area = chart.chartArea
    if (!area) return
    const { ctx } = chart
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(area.left, area.top)
    ctx.lineTo(area.left, area.bottom)
    ctx.lineWidth = 1.25
    ctx.strokeStyle = '#9aa0ac'
    ctx.stroke()
    ctx.restore()
  },
}
