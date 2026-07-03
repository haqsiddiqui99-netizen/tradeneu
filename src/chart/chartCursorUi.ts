import './chartCursorUi.css'

export type ChartCursorUiApi = {
  /** Re-apply cursor state (e.g. after overlays toggle). */
  refresh: () => void
  dispose: () => void
}

/**
 * Crosshair cursor over the chart; grabbing hand while the user drags to pan (LWC scroll).
 */
export function mountChartCursorUi(opts: {
  chartHost: HTMLElement
  /** When true, custom cursors are suppressed (e.g. bar-pick overlay). */
  isBlocked?: () => boolean
}): ChartCursorUiApi {
  const { chartHost, isBlocked } = opts
  let pointerIn = false
  let dragging = false
  let activePointerId: number | null = null

  function clearClasses() {
    chartHost.classList.remove('rw-chart-cursor--cross', 'rw-chart-cursor--grabbing')
  }

  function apply() {
    clearClasses()
    if (isBlocked?.()) return
    if (dragging) {
      chartHost.classList.add('rw-chart-cursor--grabbing')
    } else if (pointerIn) {
      chartHost.classList.add('rw-chart-cursor--cross')
    }
  }

  const onPointerEnter = () => {
    pointerIn = true
    apply()
  }

  const onPointerLeave = () => {
    pointerIn = false
    dragging = false
    activePointerId = null
    apply()
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || isBlocked?.()) return
    if (!chartHost.contains(e.target as Node)) return
    dragging = true
    activePointerId = e.pointerId
    apply()
  }

  const endDrag = (e: PointerEvent) => {
    if (activePointerId != null && e.pointerId !== activePointerId) return
    dragging = false
    activePointerId = null
    apply()
  }

  const onPointerUp = (e: PointerEvent) => endDrag(e)
  const onPointerCancel = (e: PointerEvent) => endDrag(e)

  chartHost.addEventListener('pointerenter', onPointerEnter)
  chartHost.addEventListener('pointerleave', onPointerLeave)
  chartHost.addEventListener('pointerdown', onPointerDown, true)
  chartHost.addEventListener('pointerup', onPointerUp, true)
  chartHost.addEventListener('pointercancel', onPointerCancel, true)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)

  apply()

  return {
    refresh: apply,
    dispose() {
      chartHost.removeEventListener('pointerenter', onPointerEnter)
      chartHost.removeEventListener('pointerleave', onPointerLeave)
      chartHost.removeEventListener('pointerdown', onPointerDown, true)
      chartHost.removeEventListener('pointerup', onPointerUp, true)
      chartHost.removeEventListener('pointercancel', onPointerCancel, true)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      pointerIn = false
      dragging = false
      activePointerId = null
      clearClasses()
    },
  }
}
