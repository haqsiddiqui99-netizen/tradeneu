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
    const x = (cr.left - rect.left) * dpr
    const y = (cr.top - rect.top) * dpr
    ctx.drawImage(c, x, y, c.width, c.height)
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
