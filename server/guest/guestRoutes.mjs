import {
  readGuestFromRequest,
  setGuestCookie,
} from './guestCookie.mjs'
import {
  guestTelemetryEmail,
  requestClientCountry,
  requestClientIp,
  requestUserAgent,
} from './requestMeta.mjs'
import { upsertGuestSession } from './guestStore.mjs'

function requestSecure(req) {
  return req.secure === true || req.get('x-forwarded-proto') === 'https'
}

export function mountGuestRoutes(app, { dataDir }) {
  app.post('/api/guest/session', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const secure = requestSecure(req)
    const existing = readGuestFromRequest(req)
    const action = String(req.body?.action || 'register').trim().toLowerCase()
    const isRegister = action !== 'ping'

    const row = upsertGuestSession(dataDir, {
      guestId: existing?.guestId,
      ip: requestClientIp(req),
      country: requestClientCountry(req),
      timezone: String(req.body?.timezone || '').trim().slice(0, 64),
      locale: String(req.body?.locale || '').trim().slice(0, 32),
      userAgent: requestUserAgent(req),
      page: String(req.body?.page || '').trim().slice(0, 64),
      incrementVisit: isRegister && !!existing?.guestId,
    })

    setGuestCookie(res, row.id, { secure })

    res.json({
      ok: true,
      guestId: row.id,
      email: guestTelemetryEmail(row.id),
      isNew: !existing?.guestId,
    })
  })
}
