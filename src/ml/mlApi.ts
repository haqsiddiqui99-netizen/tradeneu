/** Client for Python ML service (dev: Vite proxies `/api/ml` → port 8001). */

export type MlHealth = {
  ok: boolean
  torch: string
  device: string
  model: string
}

export type MlPredictResult = {
  logits: number[]
  probs: number[]
  feature_dim: number
  window_used: number
}

function mlBase(): string {
  const o = import.meta.env.VITE_ML_API_BASE as string | undefined
  if (o && String(o).trim()) return String(o).replace(/\/$/, '')
  return ''
}

function mlUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const b = mlBase()
  if (b) return `${b}${p}`
  return new URL(`api/ml${p}`, document.baseURI).href
}

export async function fetchMlHealth(): Promise<MlHealth | null> {
  try {
    const res = await fetch(mlUrl('/health'), { credentials: 'same-origin' })
    if (!res.ok) return null
    return (await res.json()) as MlHealth
  } catch {
    return null
  }
}

/** Each row: open, high, low, close, volume (oldest first). */
export async function predictBarsMl(bars: number[][]): Promise<MlPredictResult | null> {
  try {
    const res = await fetch(mlUrl('/v1/predict'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ bars }),
    })
    if (!res.ok) return null
    return (await res.json()) as MlPredictResult
  } catch {
    return null
  }
}
