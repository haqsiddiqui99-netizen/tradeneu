/** Capture chart canvases inside a container into a single PNG canvas. */
export function captureChartSnapshotCanvas(container: HTMLElement): HTMLCanvasElement | null {
  const canvases = Array.from(container.querySelectorAll('canvas'))
  if (!canvases.length) return null
  const rect = container.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(rect.width * dpr))
  const h = Math.max(1, Math.round(rect.height * dpr))
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return null
  const bg = getComputedStyle(container).backgroundColor
  if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
  }
  for (const c of canvases) {
    const cr = c.getBoundingClientRect()
    if (cr.width <= 0 || cr.height <= 0) continue
    const x = (cr.left - rect.left) * dpr
    const y = (cr.top - rect.top) * dpr
    // Draw at the canvas's actual on-screen (CSS) size scaled by dpr, not its
    // internal pixel-buffer size - those can differ (e.g. a canvas rendered at
    // a different internal ratio than the current window.devicePixelRatio),
    // which previously stretched/cropped the resulting snapshot.
    const dw = cr.width * dpr
    const dh = cr.height * dpr
    ctx.drawImage(c, x, y, dw, dh)
  }
  return out
}

function isTransparentColor(color: string): boolean {
  if (!color || color === 'transparent') return true
  const m = color.match(/rgba?\(([^)]+)\)/)
  if (!m) return false
  const parts = m[1]!.split(',').map((p) => parseFloat(p.trim()))
  return parts.length === 4 && parts[3] === 0
}

/** Deep-clones a node, inlining every computed style onto each element so it renders
 *  correctly when serialized outside the live document (e.g. inside an SVG <foreignObject>,
 *  which has no access to this page's stylesheets). */
function inlineComputedStyles(node: Node): Node {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? '')
  if (!(node instanceof Element)) return node.cloneNode(false)
  const clone = node.cloneNode(false) as Element
  const cs = getComputedStyle(node)
  let cssText = ''
  for (let i = 0; i < cs.length; i++) {
    const prop = cs.item(i)
    cssText += `${prop}:${cs.getPropertyValue(prop)};`
  }
  clone.setAttribute('style', cssText)
  clone.removeAttribute('id')
  Array.from(node.childNodes).forEach((child) => clone.appendChild(inlineComputedStyles(child)))
  return clone
}

/** Rasterizes a plain-HTML (non-canvas) element - e.g. a chart's header/footer bar of
 *  text and buttons - into an <img>, by inlining its computed styles and rendering it
 *  through an SVG <foreignObject>. Returns null if the element isn't currently visible. */
async function domSubtreeToImage(el: HTMLElement, dpr: number): Promise<{ img: HTMLImageElement; width: number; height: number } | null> {
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const clone = inlineComputedStyles(el) as HTMLElement
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  const serialized = new XMLSerializer().serializeToString(clone)
  const outW = Math.max(1, Math.round(rect.width * dpr))
  const outH = Math.max(1, Math.round(rect.height * dpr))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${rect.width} ${rect.height}"><foreignObject x="0" y="0" width="${rect.width}" height="${rect.height}">${serialized}</foreignObject></svg>`
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Failed to rasterize DOM subtree'))
      image.src = url
    })
    return { img, width: rect.width, height: rect.height }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Captures a chart's full visual "chrome" - e.g. its symbol/OHLC header bar, the
 * chart canvases themselves, and its time-range footer bar - as one composite PNG
 * canvas, even though the header/footer are plain HTML (not canvases). Floating
 * overlays that live *inside* a canvas-bearing region (like a replay "select bar"
 * toolbar drawn on top of the chart) are intentionally skipped, since only the
 * canvases within such a region are composited.
 */
export async function captureChartSnapshotWithChrome(elements: Array<HTMLElement | null | undefined>): Promise<HTMLCanvasElement | null> {
  const visible = elements.filter((el): el is HTMLElement => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  })
  if (!visible.length) return null

  const dpr = window.devicePixelRatio || 1
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const el of visible) {
    const r = el.getBoundingClientRect()
    left = Math.min(left, r.left)
    top = Math.min(top, r.top)
    right = Math.max(right, r.right)
    bottom = Math.max(bottom, r.bottom)
  }
  const originX = left
  const originY = top
  const w = Math.max(1, Math.round((right - left) * dpr))
  const h = Math.max(1, Math.round((bottom - top) * dpr))

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)

  for (const el of visible) {
    const canvases = Array.from(el.querySelectorAll('canvas'))
    if (canvases.length) {
      const bg = getComputedStyle(el).backgroundColor
      if (!isTransparentColor(bg)) {
        const r = el.getBoundingClientRect()
        ctx.fillStyle = bg
        ctx.fillRect((r.left - originX) * dpr, (r.top - originY) * dpr, r.width * dpr, r.height * dpr)
      }
      for (const c of canvases) {
        const cr = c.getBoundingClientRect()
        if (cr.width <= 0 || cr.height <= 0) continue
        const x = (cr.left - originX) * dpr
        const y = (cr.top - originY) * dpr
        const dw = cr.width * dpr
        const dh = cr.height * dpr
        ctx.drawImage(c, x, y, dw, dh)
      }
    } else {
      const rasterized = await domSubtreeToImage(el, dpr)
      if (rasterized) {
        const r = el.getBoundingClientRect()
        ctx.drawImage(rasterized.img, (r.left - originX) * dpr, (r.top - originY) * dpr, r.width * dpr, r.height * dpr)
      }
    }
  }
  return out
}

export function chartSnapshotFilename(symbol: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
  return `${symbol.replace(/\//g, '-')}-${stamp}.png`
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}

/** Matches a typical widescreen chart screenshot's proportions (~1024x480, i.e. ~60:40). */
const CHART_SNAPSHOT_TARGET_ASPECT = 1024 / 482

/** Build a compact image suitable for storing inside a trade journal. Fills the whole
 *  targetAspect frame with the actual captured chart content (no blank letterbox bars) -
 *  a source that's flatter than the target gets stretched taller to fill the frame, so
 *  the *chart itself* looks like a normal widescreen chart card, not just a small
 *  screenshot floating in extra blank space. */
export function chartSnapshotPreviewDataUrl(
  canvas: HTMLCanvasElement,
  maxWidth = 1200,
  targetAspect = CHART_SNAPSHOT_TARGET_ASPECT,
): string | null {
  const outW = Math.max(1, Math.round(Math.min(maxWidth, canvas.width)))
  const outH = Math.max(1, Math.round(outW / targetAspect))

  const preview = document.createElement('canvas')
  preview.width = outW
  preview.height = outH
  const ctx = preview.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(canvas, 0, 0, outW, outH)
  return preview.toDataURL('image/webp', 0.86)
}

export function downloadChartSnapshotCanvas(canvas: HTMLCanvasElement, filename: string): void {
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}

export async function copyChartSnapshotCanvas(canvas: HTMLCanvasElement): Promise<boolean> {
  const blob = await canvasToPngBlob(canvas)
  if (!blob || !navigator.clipboard?.write) return false
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}

export async function copyChartShareLink(link: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(link)
    return true
  } catch {
    return false
  }
}

export function openChartSnapshotInNewTab(canvas: HTMLCanvasElement): boolean {
  const url = canvas.toDataURL('image/png')
  const tab = window.open('', '_blank', 'noopener,noreferrer')
  if (!tab) return false
  tab.document.title = 'Chart snapshot'
  tab.document.body.style.margin = '0'
  tab.document.body.style.background = '#131722'
  const img = tab.document.createElement('img')
  img.src = url
  img.alt = 'Chart snapshot'
  img.style.display = 'block'
  img.style.maxWidth = '100%'
  tab.document.body.appendChild(img)
  return true
}
