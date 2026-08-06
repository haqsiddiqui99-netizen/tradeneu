export type GuestSessionResult = {
  guestId: string
  email: string
  isNew: boolean
}

function clientHints() {
  let timezone = ''
  let locale = ''
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    /* ignore */
  }
  try {
    locale = navigator.language || ''
  } catch {
    /* ignore */
  }
  return { timezone, locale }
}

async function postGuestSession(
  action: 'register' | 'ping',
  page?: string,
): Promise<GuestSessionResult | null> {
  try {
    const { timezone, locale } = clientHints()
    const res = await fetch('/api/guest/session', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        page: page?.trim() || '',
        timezone,
        locale,
      }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as {
      ok?: boolean
      guestId?: string
      email?: string
      isNew?: boolean
    }
    if (!body.ok || !body.guestId || !body.email) return null
    return {
      guestId: body.guestId,
      email: body.email,
      isNew: body.isNew === true,
    }
  } catch {
    return null
  }
}

/** Register or refresh a guest server session (sets HTTP-only cookie). */
export async function registerGuestSession(page?: string): Promise<GuestSessionResult | null> {
  return postGuestSession('register', page)
}

/** Lightweight heartbeat — updates last seen without counting a new visit. */
export async function pingGuestSession(page?: string): Promise<void> {
  await postGuestSession('ping', page)
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null

/** Keep guest presence fresh while the app is open (dashboard, etc.). */
export function startGuestHeartbeat(page = 'app'): () => void {
  stopGuestHeartbeat()
  void pingGuestSession(page)
  heartbeatTimer = setInterval(() => {
    void pingGuestSession(page)
  }, 90_000)
  return stopGuestHeartbeat
}

export function stopGuestHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}
