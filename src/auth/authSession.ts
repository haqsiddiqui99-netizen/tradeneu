import { fetchServerAuthUser, logoutServerSession, type ServerAuthUser } from './authApi'
import { assignSessionsToUser } from '../data/sessionStore'
import { writeDisplayName } from '../home/dashboardUserPrefs'

const SS_SESSION = 'suplexity-auth'

export type AuthUser = {
  id?: string
  email: string
  loggedInAt: number
  name?: string
  mobile?: string
  country?: string
  picture?: string
  provider?: 'local'
}

function serverUserToAuthUser(user: ServerAuthUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    loggedInAt: user.loggedInAt ?? Date.now(),
    name: user.name || undefined,
    mobile: user.mobile || undefined,
    country: user.country || undefined,
    picture: user.picture || undefined,
    provider: 'local',
  }
}

function writeLocalSession(user: AuthUser): void {
  try {
    sessionStorage.setItem(SS_SESSION, JSON.stringify(user))
  } catch {
    sessionStorage.setItem(SS_SESSION, '1')
  }
}

function readLocalSession(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SS_SESSION)
    if (!raw || raw === '1') return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const u = parsed as AuthUser
    if (typeof u.email !== 'string') return null
    return {
      id: u.id,
      email: u.email,
      loggedInAt: u.loggedInAt ?? Date.now(),
      name: u.name,
      mobile: u.mobile,
      country: u.country,
      picture: u.picture,
      provider: 'local',
    }
  } catch {
    return null
  }
}

function applyUserProfile(user: ServerAuthUser): void {
  const name = user.name?.trim()
  if (name) writeDisplayName(name)
  else {
    const localPart = user.email.split('@')[0]?.trim()
    if (localPart && localPart.length >= 2) writeDisplayName(localPart)
  }
}

export function hasLocalLoginSession(): boolean {
  return readLocalSession() !== null
}

/** Sync check — mirrored session only. Prefer resolveAuthSession() on boot. */
export function hasLoginSession(): boolean {
  return hasLocalLoginSession()
}

export function getAuthUser(): AuthUser | null {
  return readLocalSession()
}

export function clearLoginSession(): void {
  try {
    sessionStorage.removeItem(SS_SESSION)
  } catch {
    /* noop */
  }
}

export async function clearAllAuthSessions(): Promise<void> {
  clearLoginSession()
  await logoutServerSession()
}

export function mirrorServerUser(user: ServerAuthUser, opts?: { freshAccount?: boolean }): void {
  assignSessionsToUser(user.email, { reset: opts?.freshAccount ?? false })
  writeLocalSession(serverUserToAuthUser(user))
  applyUserProfile(user)
}

/** Resolve auth from HTTP-only session cookie; mirror into sessionStorage. */
export async function resolveAuthSession(): Promise<boolean> {
  const serverUser = await fetchServerAuthUser()
  if (serverUser) {
    mirrorServerUser(serverUser)
    return true
  }
  clearLoginSession()
  return false
}
