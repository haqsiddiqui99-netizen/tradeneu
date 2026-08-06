import { readTelemetryEvents } from './telemetryStore.mjs'

const LIVE_THRESHOLD_MS = 2 * 60 * 1000

function normalizeAsset(raw) {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
  return s.length >= 2 && s.length <= 24 ? s : ''
}

function parseAssetList(raw) {
  if (!raw) return []
  return String(raw)
    .split(/[,;]+/)
    .map((s) => normalizeAsset(s))
    .filter(Boolean)
}

function ensureAssetMap(map, asset) {
  if (!map.has(asset)) {
    map.set(asset, { totalMs: 0, users: new Set(), sessionCount: 0 })
  }
  return map.get(asset)
}

function ensureUserMap(map, email) {
  if (!map.has(email)) {
    map.set(email, {
      assets: new Map(),
      lastActivityAt: 0,
      liveAsset: null,
      livePage: null,
      liveAt: null,
    })
  }
  return map.get(email)
}

function ensureUserAsset(userRow, asset) {
  if (!userRow.assets.has(asset)) {
    userRow.assets.set(asset, { totalMs: 0, sessionCount: 0, lastAt: 0 })
  }
  return userRow.assets.get(asset)
}

/** @param {string} dataDir @param {Array<{ email: string, name?: string }>} users */
export function summarizeActivity(dataDir, users = []) {
  const events = readTelemetryEvents(dataDir, { limit: 5000 })
  const now = Date.now()
  const assetTotals = new Map()
  const byUser = new Map()
  const nameByEmail = new Map(
    users.map((u) => [String(u.email || '').toLowerCase(), u.name || '']),
  )

  for (const e of events) {
    const email = String(e.email || '')
      .trim()
      .toLowerCase()
    if (!email) continue
    const ts = typeof e.ts === 'number' ? e.ts : 0
    const payload = e.payload && typeof e.payload === 'object' ? e.payload : {}
    const userRow = ensureUserMap(byUser, email)

    if (ts > userRow.lastActivityAt) userRow.lastActivityAt = ts

    if (e.event === 'asset_practice') {
      const asset = normalizeAsset(payload.asset)
      const durationMs = Number(payload.durationMs)
      if (!asset || !Number.isFinite(durationMs) || durationMs <= 0) continue

      const total = ensureAssetMap(assetTotals, asset)
      total.totalMs += durationMs
      total.users.add(email)

      const ua = ensureUserAsset(userRow, asset)
      ua.totalMs += durationMs
      if (ts > ua.lastAt) ua.lastAt = ts
    }

    if (e.event === 'presence_ping') {
      const asset = normalizeAsset(payload.asset)
      const page = String(payload.page || 'chart').slice(0, 32)
      if (ts >= (userRow.liveAt ?? 0)) {
        userRow.liveAt = ts
        userRow.liveAsset = asset || null
        userRow.livePage = page
      }
    }

    if (e.event === 'session_created') {
      const assets = parseAssetList(payload.assets)
      const list = assets.length ? assets : ['UNKNOWN']
      for (const asset of list) {
        const total = ensureAssetMap(assetTotals, asset)
        total.sessionCount += 1
        total.users.add(email)
        const ua = ensureUserAsset(userRow, asset)
        ua.sessionCount += 1
        if (ts > ua.lastAt) ua.lastAt = ts
      }
    }
  }

  const totals = [...assetTotals.entries()]
    .map(([asset, row]) => ({
      asset,
      totalMs: Math.round(row.totalMs),
      userCount: row.users.size,
      sessionCount: row.sessionCount,
    }))
    .sort((a, b) => b.totalMs - a.totalMs || b.sessionCount - a.sessionCount || a.asset.localeCompare(b.asset))

  const userRows = [...byUser.entries()]
    .map(([email, row]) => {
      const isLive = row.liveAt != null && now - row.liveAt <= LIVE_THRESHOLD_MS
      const assets = [...row.assets.entries()]
        .map(([asset, a]) => ({
          asset,
          totalMs: Math.round(a.totalMs),
          sessionCount: a.sessionCount,
          lastAt: a.lastAt || null,
        }))
        .sort((a, b) => b.totalMs - a.totalMs || b.sessionCount - a.sessionCount)

      return {
        email,
        name: nameByEmail.get(email) || '',
        lastActivityAt: row.lastActivityAt || null,
        isLive,
        liveAsset: isLive ? row.liveAsset : null,
        livePage: isLive ? row.livePage : null,
        liveAt: isLive ? row.liveAt : null,
        assets,
        totalPracticeMs: assets.reduce((sum, a) => sum + a.totalMs, 0),
      }
    })
    .sort((a, b) => {
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1
      return (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0)
    })

  const liveUsers = userRows.filter((u) => u.isLive)
  const liveCount = liveUsers.length
  const testingToday = userRows.filter((u) => u.lastActivityAt && u.lastActivityAt >= now - 86_400_000).length

  return {
    liveCount,
    testingToday,
    topAsset: totals[0]?.asset ?? null,
    totals,
    users: userRows,
    liveUsers,
  }
}
