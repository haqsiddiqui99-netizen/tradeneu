import type { ChartIndicatorId } from '../chart/chartIndicatorCatalog'
import type { SessionCreatedPayload } from '../sessionTypes'
import type { ReplayAccountPersisted } from '../replay/replayPositions'
import type { PropChallengeState } from '../prop/propTypes'

const LS_SESSIONS = 'suplexity-sessions-v1'
const LS_LAST_SESSION_ID = 'suplexity-last-session-id'
const LS_SESSION_OWNER = 'suplexity-sessions-owner-v1'
/** Legacy single-draft key — migrated once into the session list. */
const LS_LEGACY_DRAFT = 'suplexity-last-session-draft'

export type StoredSession = SessionCreatedPayload & {
  id: string
  createdAt: number
  updatedAt: number
  lastOpenedAt?: number
  lastStrategyId?: string
  lastBacktest?: SessionBacktestSnapshot
  replayState?: SessionReplaySnapshot
  propResult?: PropChallengeState
  activeChartIndicators?: ChartIndicatorId[]
}

export type SessionReplaySnapshot = {
  account: ReplayAccountPersisted
  replayBarIndex?: number
  savedAt: number
}

export type SessionBacktestSnapshot = {
  netPnl: number
  totalTrades: number
  winRate: number
  strategyId: string
  ranAt: number
}

function isValidPayload(p: Partial<SessionCreatedPayload>): p is SessionCreatedPayload {
  return (
    typeof p.name === 'string' &&
    typeof p.balance === 'string' &&
    typeof p.assets === 'string' &&
    (p.sessionType === 'backtest' || p.sessionType === 'prop')
  )
}

function readRawSessions(): StoredSession[] {
  try {
    const raw = localStorage.getItem(LS_SESSIONS)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((row): row is StoredSession => {
      if (!row || typeof row !== 'object') return false
      const s = row as Partial<StoredSession>
      return (
        typeof s.id === 'string' &&
        typeof s.createdAt === 'number' &&
        typeof s.updatedAt === 'number' &&
        isValidPayload(s)
      )
    })
  } catch {
    return []
  }
}

function writeRawSessions(sessions: StoredSession[]): void {
  try {
    localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions))
  } catch {
    /* quota / private mode */
  }
}

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function migrateLegacyDraftIfNeeded(sessions: StoredSession[]): StoredSession[] {
  if (sessions.length > 0) return sessions
  try {
    const raw = localStorage.getItem(LS_LEGACY_DRAFT)
    if (!raw) return sessions
    const o: unknown = JSON.parse(raw)
    if (!o || typeof o !== 'object' || !isValidPayload(o as SessionCreatedPayload)) return sessions
    const now = Date.now()
    const migrated: StoredSession = {
      ...(o as SessionCreatedPayload),
      id: newSessionId(),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    }
    writeRawSessions([migrated])
    localStorage.removeItem(LS_LEGACY_DRAFT)
    return [migrated]
  } catch {
    return sessions
  }
}

function sortSessions(sessions: StoredSession[]): StoredSession[] {
  return [...sessions].sort((a, b) => {
    const ao = a.lastOpenedAt ?? a.updatedAt
    const bo = b.lastOpenedAt ?? b.updatedAt
    return bo - ao
  })
}

/** All saved sessions, newest activity first. */
export function listSessions(): StoredSession[] {
  const migrated = migrateLegacyDraftIfNeeded(readRawSessions())
  return sortSessions(migrated)
}

export function getSession(id: string): StoredSession | null {
  return listSessions().find((s) => s.id === id) ?? null
}

export function createSession(payload: SessionCreatedPayload): StoredSession {
  const now = Date.now()
  const session: StoredSession = {
    ...payload,
    id: newSessionId(),
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  }
  const next = sortSessions([session, ...readRawSessions()])
  writeRawSessions(next)
  return session
}

export function updateSession(
  id: string,
  patch: Partial<SessionCreatedPayload> & {
    lastOpenedAt?: number
    lastStrategyId?: string
    lastBacktest?: SessionBacktestSnapshot
    replayState?: SessionReplaySnapshot
    propResult?: PropChallengeState
    activeChartIndicators?: ChartIndicatorId[]
  },
): StoredSession | null {
  const sessions = readRawSessions()
  const idx = sessions.findIndex((s) => s.id === id)
  if (idx < 0) return null
  const prev = sessions[idx]!
  const updated: StoredSession = {
    ...prev,
    ...patch,
    id: prev.id,
    createdAt: prev.createdAt,
    updatedAt: Date.now(),
  }
  sessions[idx] = updated
  writeRawSessions(sessions)
  return updated
}

export function touchSessionOpened(id: string): void {
  updateSession(id, { lastOpenedAt: Date.now() })
}

export function updateSessionBacktest(
  id: string,
  snapshot: SessionBacktestSnapshot,
): StoredSession | null {
  return updateSession(id, { lastBacktest: snapshot })
}

export function updateSessionReplay(
  id: string,
  snapshot: SessionReplaySnapshot,
): StoredSession | null {
  return updateSession(id, { replayState: snapshot })
}

export function updateSessionProp(
  id: string,
  propResult: PropChallengeState,
): StoredSession | null {
  return updateSession(id, { propResult })
}

export function updateSessionChartIndicators(
  id: string,
  activeChartIndicators: ChartIndicatorId[],
): StoredSession | null {
  return updateSession(id, { activeChartIndicators })
}

export function deleteSession(id: string): boolean {
  const sessions = readRawSessions().filter((s) => s.id !== id)
  if (sessions.length === readRawSessions().length) return false
  writeRawSessions(sessions)
  if (getLastSessionId() === id) setLastSessionId(null)
  return true
}

export function duplicateSession(id: string): StoredSession | null {
  const src = getSession(id)
  if (!src) return null
  const now = Date.now()
  const copy: StoredSession = {
    name: src.name.trim() ? `Copy of ${src.name.trim()}` : 'Copy of session',
    balance: src.balance,
    assets: src.assets,
    layout: src.layout,
    sessionType: src.sessionType,
    startDate: src.startDate,
    endDate: src.endDate,
    propRules: src.propRules,
    id: newSessionId(),
    createdAt: now,
    updatedAt: now,
  }
  const next = sortSessions([copy, ...readRawSessions()])
  writeRawSessions(next)
  return copy
}

export function sessionToPayload(session: StoredSession): SessionCreatedPayload {
  return {
    name: session.name,
    balance: session.balance,
    assets: session.assets,
    layout: session.layout,
    sessionType: session.sessionType,
    startDate: session.startDate,
    endDate: session.endDate,
    propRules: session.propRules,
  }
}

export function setLastSessionId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LS_LAST_SESSION_ID, id)
    else localStorage.removeItem(LS_LAST_SESSION_ID)
  } catch {
    /* noop */
  }
}

export function getLastSessionId(): string | null {
  try {
    const v = localStorage.getItem(LS_LAST_SESSION_ID)
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

function normalizeOwnerEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function getSessionOwnerEmail(): string | null {
  try {
    const v = localStorage.getItem(LS_SESSION_OWNER)?.trim()
    return v ? normalizeOwnerEmail(v) : null
  } catch {
    return null
  }
}

/** Remove all saved chart sessions for the current browser profile. */
export function clearAllSessions(): void {
  writeRawSessions([])
  setLastSessionId(null)
  try {
    localStorage.removeItem(LS_LEGACY_DRAFT)
  } catch {
    /* noop */
  }
}

/**
 * Bind local session storage to an account. Clears sessions when switching users
 * or when `reset` is true (new account registration).
 */
export function assignSessionsToUser(email: string, opts?: { reset?: boolean }): void {
  const normalized = normalizeOwnerEmail(email)
  if (!normalized) return
  const owner = getSessionOwnerEmail()
  if (opts?.reset || (owner && owner !== normalized)) {
    clearAllSessions()
  }
  try {
    localStorage.setItem(LS_SESSION_OWNER, normalized)
  } catch {
    /* noop */
  }
}

/** @deprecated Use session store; kept for one release of compatibility. */
export function saveSessionDraftCompat(payload: SessionCreatedPayload): void {
  try {
    localStorage.setItem(LS_LEGACY_DRAFT, JSON.stringify(payload))
  } catch {
    /* noop */
  }
}
