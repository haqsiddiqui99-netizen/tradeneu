import { readSessionFromRequest } from '../auth/sessionCookie.mjs'
import { readGuestFromRequest } from '../guest/guestCookie.mjs'
import { guestIdFromTelemetryEmail, guestTelemetryEmail } from '../guest/requestMeta.mjs'
import { incrementGuestSessionCreates } from '../guest/guestStore.mjs'
import { appendTelemetryEvent, TELEMETRY_EVENTS } from './telemetryStore.mjs'

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  const out = {}
  for (const [k, v] of Object.entries(payload)) {
    if (typeof k !== 'string' || k.length > 64) continue
    if (v == null) continue
    if (typeof v === 'string' && v.length <= 512) out[k] = v
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (typeof v === 'boolean') out[k] = v
  }
  return out
}

export function recordAuthLogin(dataDir, user, provider) {
  appendTelemetryEvent(dataDir, {
    event: 'login',
    email: user.email,
    provider: provider || user.provider || 'local',
    payload: { name: user.name || '' },
  })
}

function resolveTelemetryIdentity(req) {
  const session = readSessionFromRequest(req)
  if (session?.email) {
    return { email: session.email, provider: session.provider || 'local' }
  }
  const guest = readGuestFromRequest(req)
  if (guest?.guestId) {
    return { email: guestTelemetryEmail(guest.guestId), provider: 'guest' }
  }
  return null
}

export function mountTelemetryRoutes(app, { dataDir }) {
  app.post('/api/telemetry/event', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const identity = resolveTelemetryIdentity(req)
    if (!identity?.email) {
      res.status(401).json({ ok: false, error: 'not_authenticated' })
      return
    }

    const event = String(req.body?.event || '').trim()
    if (!TELEMETRY_EVENTS.has(event)) {
      res.status(400).json({ ok: false, error: 'invalid_event' })
      return
    }
    if (event === 'login') {
      res.status(400).json({ ok: false, error: 'login_recorded_server_side' })
      return
    }

    const result = appendTelemetryEvent(dataDir, {
      event,
      email: identity.email,
      provider: identity.provider,
      payload: sanitizePayload(req.body?.payload),
    })

    if (!result.ok) {
      res.status(500).json({ ok: false, error: result.error || 'persist_failed' })
      return
    }

    if (event === 'session_created') {
      const guestId = guestIdFromTelemetryEmail(identity.email)
      if (guestId) incrementGuestSessionCreates(dataDir, guestId)
    }

    res.json({ ok: true, id: result.id })
  })
}
