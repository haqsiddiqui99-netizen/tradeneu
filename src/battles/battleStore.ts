import type { StoredSession } from '../data/sessionStore'

const LS_BATTLES = 'suplexity-battles-v1'

export type BattleRecord = {
  id: string
  sessionAId: string
  sessionBId: string
  sessionAName: string
  sessionBName: string
  pnlA: number
  pnlB: number
  margin: number
  winner: 'a' | 'b' | 'tie'
  ranAt: number
}

function sessionPnl(session: StoredSession): number {
  const bt = session.lastBacktest?.netPnl
  const journal = session.replayState?.account.realizedPnL
  if (bt != null && Math.abs(bt) > 1e-6) return bt
  if (journal != null) return journal
  return bt ?? journal ?? 0
}

function readRaw(): BattleRecord[] {
  try {
    const raw = localStorage.getItem(LS_BATTLES)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (b): b is BattleRecord =>
        !!b &&
        typeof b === 'object' &&
        typeof (b as BattleRecord).id === 'string' &&
        typeof (b as BattleRecord).ranAt === 'number',
    )
  } catch {
    return []
  }
}

function writeRaw(battles: BattleRecord[]): void {
  try {
    localStorage.setItem(LS_BATTLES, JSON.stringify(battles))
  } catch {
    /* quota */
  }
}

export function listBattles(): BattleRecord[] {
  return readRaw().sort((a, b) => b.ranAt - a.ranAt)
}

export function recordBattle(sessionA: StoredSession, sessionB: StoredSession): BattleRecord {
  const pnlA = sessionPnl(sessionA)
  const pnlB = sessionPnl(sessionB)
  const margin = pnlA - pnlB
  let winner: BattleRecord['winner'] = 'tie'
  if (margin > 1e-6) winner = 'a'
  else if (margin < -1e-6) winner = 'b'

  const record: BattleRecord = {
    id: `battle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionAId: sessionA.id,
    sessionBId: sessionB.id,
    sessionAName: sessionA.name,
    sessionBName: sessionB.name,
    pnlA,
    pnlB,
    margin,
    winner,
    ranAt: Date.now(),
  }
  const next = [record, ...readRaw()].slice(0, 100)
  writeRaw(next)
  return record
}
