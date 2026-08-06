import fs from 'fs'
import path from 'path'
import { isAdminEmail, requireAdminSession, requireAuthedSession } from '../auth/adminAccess.mjs'
import { readUsers } from '../auth/userPersistence.mjs'
import { publicUser } from '../auth/userStore.mjs'
import { readTelemetryEvents, summarizeTelemetry } from '../telemetry/telemetryStore.mjs'
import { summarizeGrowth, summarizeRevenue } from '../billing/billingStore.mjs'
import { summarizeActivity } from '../telemetry/activityStore.mjs'
import { summarizeGuests } from '../guest/guestStore.mjs'

/** @param {string} dataDir */
export function readGoogleUsers(dataDir) {
  try {
    const file = path.join(dataDir, 'google-users.json')
    if (!fs.existsSync(file)) return []
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? parsed.filter((r) => r?.email) : []
  } catch {
    return []
  }
}

function normalizeAdminUser(row) {
  return {
    email: row.email,
    name: row.name || '',
    provider: row.provider || 'local',
    mobile: row.mobile || '',
    country: row.country || '',
    picture: row.picture || '',
    createdAt: row.createdAt ?? null,
    lastLoginAt: row.lastLoginAt ?? null,
  }
}

/** Local accounts — keep registration timestamps; format mobile for display. */
function normalizeLocalAdminUser(row) {
  const pub = publicUser(row)
  return {
    email: pub.email,
    name: pub.name,
    provider: 'local',
    mobile: pub.mobile,
    country: pub.country,
    picture: '',
    createdAt: row.createdAt ?? null,
    lastLoginAt: row.lastLoginAt ?? null,
  }
}

async function listAllUsers(dataDir) {
  const byEmail = new Map()
  const local = await readUsers(dataDir)
  for (const row of local) {
    if (!row?.email) continue
    byEmail.set(String(row.email).toLowerCase(), normalizeLocalAdminUser(row))
  }
  for (const row of readGoogleUsers(dataDir)) {
    const key = String(row.email).toLowerCase()
    const existing = byEmail.get(key)
    if (existing) {
      byEmail.set(key, {
        ...existing,
        name: existing.name || row.name || '',
        picture: existing.picture || row.picture || '',
        lastLoginAt: Math.max(existing.lastLoginAt ?? 0, row.lastLoginAt ?? 0) || null,
      })
    } else {
      byEmail.set(key, normalizeAdminUser(row))
    }
  }
  return [...byEmail.values()].sort((a, b) => (b.lastLoginAt ?? 0) - (a.lastLoginAt ?? 0))
}

export function mountAdminRoutes(app, { dataDir }) {
  app.get('/api/admin/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const auth = requireAuthedSession(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error })
      return
    }
    res.json({
      ok: true,
      email: auth.session.email,
      isAdmin: isAdminEmail(auth.session.email),
    })
  })

  app.get('/api/admin/users', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const auth = requireAdminSession(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error })
      return
    }
    try {
      const users = await listAllUsers(dataDir)
      res.json({ ok: true, users, count: users.length })
    } catch (e) {
      console.error('[admin] users error:', e?.message || e)
      res.status(500).json({ ok: false, error: 'list_failed' })
    }
  })

  app.get('/api/admin/telemetry', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const auth = requireAdminSession(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error })
      return
    }
    const limit = Number(req.query.limit) || 200
    const event = typeof req.query.event === 'string' ? req.query.event : undefined
    const email = typeof req.query.email === 'string' ? req.query.email : undefined
    const since = req.query.since ? Number(req.query.since) : undefined
    const events = readTelemetryEvents(dataDir, { limit, event, email, since })
    res.json({ ok: true, events, count: events.length })
  })

  app.get('/api/admin/stats', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const auth = requireAdminSession(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error })
      return
    }
    res.json({ ok: true, stats: summarizeTelemetry(dataDir) })
  })

  app.get('/api/admin/growth', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const auth = requireAdminSession(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error })
      return
    }
    try {
      const users = await listAllUsers(dataDir)
      res.json({ ok: true, growth: summarizeGrowth(users) })
    } catch (e) {
      console.error('[admin] growth error:', e?.message || e)
      res.status(500).json({ ok: false, error: 'growth_failed' })
    }
  })

  app.get('/api/admin/revenue', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const auth = requireAdminSession(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error })
      return
    }
    try {
      const users = await listAllUsers(dataDir)
      res.json({ ok: true, revenue: summarizeRevenue(dataDir, users) })
    } catch (e) {
      console.error('[admin] revenue error:', e?.message || e)
      res.status(500).json({ ok: false, error: 'revenue_failed' })
    }
  })

  app.get('/api/admin/activity', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const auth = requireAdminSession(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error })
      return
    }
    try {
      const users = await listAllUsers(dataDir)
      res.json({ ok: true, activity: summarizeActivity(dataDir, users) })
    } catch (e) {
      console.error('[admin] activity error:', e?.message || e)
      res.status(500).json({ ok: false, error: 'activity_failed' })
    }
  })

  app.get('/api/admin/guests', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const auth = requireAdminSession(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error })
      return
    }
    try {
      const activity = summarizeActivity(dataDir, [])
      const guests = summarizeGuests(dataDir, activity.users)
      const liveCount = guests.filter((g) => g.isLive).length
      res.json({ ok: true, guests, count: guests.length, liveCount })
    } catch (e) {
      console.error('[admin] guests error:', e?.message || e)
      res.status(500).json({ ok: false, error: 'guests_failed' })
    }
  })
}
