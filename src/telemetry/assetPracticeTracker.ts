import { postTelemetryEvent } from './telemetryApi'

const HEARTBEAT_MS = 45_000
const MIN_FLUSH_MS = 5_000

type ActiveTrack = {
  asset: string
  sessionId: string
  page: string
  lastFlushAt: number
}

let active: ActiveTrack | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let visBound = false

function normalizeAsset(asset: string): string {
  return asset.trim().toUpperCase()
}

async function sendPresence(): Promise<void> {
  if (!active) return
  await postTelemetryEvent('presence_ping', {
    asset: active.asset,
    sessionId: active.sessionId,
    page: active.page,
  })
}

function flushDuration(force = false): void {
  if (!active) return
  const now = Date.now()
  const durationMs = now - active.lastFlushAt
  if (!force && durationMs < MIN_FLUSH_MS) return
  void postTelemetryEvent('asset_practice', {
    asset: active.asset,
    durationMs: Math.max(1, Math.round(durationMs)),
    sessionId: active.sessionId,
    page: active.page,
  })
  active.lastFlushAt = now
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    flushDuration(true)
  } else if (active) {
    active.lastFlushAt = Date.now()
    void sendPresence()
  }
}

function bindVisibility(): void {
  if (visBound) return
  document.addEventListener('visibilitychange', onVisibilityChange)
  visBound = true
}

function unbindVisibility(): void {
  if (!visBound) return
  document.removeEventListener('visibilitychange', onVisibilityChange)
  visBound = false
}

export function startAssetPracticeTracking(opts: {
  asset: string
  sessionId?: string | null
  page?: string
}): void {
  stopAssetPracticeTracking()
  const asset = normalizeAsset(opts.asset)
  if (!asset) return

  active = {
    asset,
    sessionId: opts.sessionId?.trim() || '',
    page: opts.page?.trim() || 'chart',
    lastFlushAt: Date.now(),
  }

  bindVisibility()
  void sendPresence()
  heartbeatTimer = setInterval(() => {
    flushDuration(true)
    void sendPresence()
  }, HEARTBEAT_MS)
}

export function setTrackedAsset(asset: string): void {
  if (!active) return
  const next = normalizeAsset(asset)
  if (!next || next === active.asset) return
  flushDuration(true)
  active.asset = next
  active.lastFlushAt = Date.now()
  void sendPresence()
}

export function stopAssetPracticeTracking(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  flushDuration(true)
  active = null
  unbindVisibility()
}
