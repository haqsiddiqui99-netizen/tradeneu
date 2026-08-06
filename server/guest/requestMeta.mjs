/** Extract client IP and coarse location hints from an Express request. */
export function requestClientIp(req) {
  const forwarded = req.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first.slice(0, 64)
  }
  const realIp = req.get('x-real-ip')?.trim()
  if (realIp) return realIp.slice(0, 64)
  if (req.ip) return String(req.ip).slice(0, 64)
  if (req.socket?.remoteAddress) return String(req.socket.remoteAddress).slice(0, 64)
  return ''
}

export function requestClientCountry(req) {
  const fromHeader =
    req.get('cf-ipcountry') ||
    req.get('x-vercel-ip-country') ||
    req.get('cloudfront-viewer-country') ||
    req.get('x-appengine-country') ||
    ''
  return String(fromHeader).trim().slice(0, 64)
}

export function requestUserAgent(req) {
  return String(req.get('user-agent') || '')
    .trim()
    .slice(0, 256)
}

export function guestTelemetryEmail(guestId) {
  return `guest+${String(guestId).trim()}@tradeneu.local`
}

export function isGuestTelemetryEmail(email) {
  return /^guest\+[^@]+@tradeneu\.local$/i.test(String(email || ''))
}

export function guestIdFromTelemetryEmail(email) {
  const m = String(email || '').match(/^guest\+([^@]+)@tradeneu\.local$/i)
  return m ? m[1] : ''
}
