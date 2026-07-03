export type ServerAuthUser = {
  id: string
  email: string
  name: string
  mobile: string
  country: string
  picture?: string
  provider: string
  loggedInAt: number
}

export type RegisterInput = {
  name: string
  email: string
  mobile: string
  country?: string
  password: string
}

export type AuthApiResult =
  | { ok: true; user: ServerAuthUser }
  | { ok: false; error: string; offline?: boolean }

export type AuthServerStatus = {
  online: boolean
  localAuth: boolean
  reason?: 'offline' | 'outdated_api'
}

async function readResponsePayload(res: Response): Promise<{ json: unknown | null; text: string }> {
  const text = await res.text()
  if (!text.trim()) return { json: null, text }
  try {
    return { json: JSON.parse(text) as unknown, text }
  } catch {
    return { json: null, text }
  }
}

function formatNonJsonError(res: Response, text: string): string {
  const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 120)
  if (res.status === 502 || res.status === 503 || snippet.includes('ECONNREFUSED')) {
    return 'Account server is offline. Stop any old process on port 3001, then run: npm run dev'
  }
  if (res.status === 404 || snippet.includes('Cannot POST') || snippet.includes('<!DOCTYPE')) {
    return 'Account API not found. Restart with npm run dev so /api/auth/register is available.'
  }
  if (snippet) return `Server error (${res.status}): ${snippet}`
  return `Server error (${res.status}). Restart npm run dev and try again.`
}

async function parseAuthResponse(res: Response): Promise<AuthApiResult> {
  const { json, text } = await readResponsePayload(res)
  if (!json || typeof json !== 'object') {
    return { ok: false, error: formatNonJsonError(res, text), offline: res.status >= 502 }
  }
  const body = json as { ok?: boolean; user?: ServerAuthUser; error?: string }
  if (!res.ok || !body.ok || !body.user?.email) {
    return {
      ok: false,
      error: body.error || `Request failed (${res.status}).`,
      offline: res.status >= 502,
    }
  }
  return { ok: true, user: body.user }
}

export async function fetchServerAuthUser(): Promise<ServerAuthUser | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
    if (!res.ok) return null
    const { json } = await readResponsePayload(res)
    if (!json || typeof json !== 'object') return null
    const body = json as { ok?: boolean; user?: ServerAuthUser }
    if (!body.ok || !body.user?.email) return null
    return body.user
  } catch {
    return null
  }
}

export async function registerUser(input: RegisterInput): Promise<AuthApiResult> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    })
    return parseAuthResponse(res)
  } catch {
    return {
      ok: false,
      error: 'Cannot reach the account server. Run npm run dev and try again.',
      offline: true,
    }
  }
}

export async function loginUser(email: string, password: string): Promise<AuthApiResult> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    return parseAuthResponse(res)
  } catch {
    return {
      ok: false,
      error: 'Cannot reach the account server. Run npm run dev and try again.',
      offline: true,
    }
  }
}

export async function logoutServerSession(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  } catch {
    /* offline */
  }
}

export async function fetchAuthServerStatus(): Promise<AuthServerStatus> {
  try {
    const res = await fetch('/api/auth/config', { credentials: 'include', cache: 'no-store' })
    const { json } = await readResponsePayload(res)
    if (!res.ok || !json || typeof json !== 'object') {
      return { online: false, localAuth: false, reason: 'offline' }
    }
    const body = json as { ok?: boolean; authMode?: string; googleEnabled?: boolean }
    if (body.authMode === 'local') {
      return { online: true, localAuth: true }
    }
    // Old API build (Google-only config) — register route missing
    if ('googleEnabled' in body && body.authMode !== 'local') {
      return { online: true, localAuth: false, reason: 'outdated_api' }
    }
    if (!body.ok) return { online: false, localAuth: false, reason: 'offline' }
    return { online: true, localAuth: true }
  } catch {
    return { online: false, localAuth: false, reason: 'offline' }
  }
}

/** @deprecated use fetchAuthServerStatus */
export async function fetchAuthServerOnline(): Promise<boolean> {
  const s = await fetchAuthServerStatus()
  return s.online && s.localAuth
}
