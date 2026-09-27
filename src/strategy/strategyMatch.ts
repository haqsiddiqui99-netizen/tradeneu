/**
 * src/strategy/strategyMatch.ts
 *
 * Scores the playbook against a trader's profile.
 *
 * Deliberately deterministic: the trader sees exactly which parts of their
 * profile drove the ranking, and the flow still works with no AI key set.
 * Each dimension contributes a weight when it matches and produces a caveat
 * when it does not, so a match card can show both sides honestly.
 */
import { newCustomStrategyId } from './strategyStore'
import type { StrategyDefinition } from '../backtest/BacktestTypes'
import type { PlaybookEntry, PlaybookLevel, PlaybookMarket, PlaybookPace, PlaybookSession } from './strategyPlaybook'
import { STRATEGY_PLAYBOOK } from './strategyPlaybook'
import type { StrategyProfile } from './strategyProfile'
import { t, type MessageKey } from '../i18n'

type MatchReason = { key: MessageKey; vars?: Record<string, string | number> }

export type StrategyMatch = {
  entry: PlaybookEntry
  /** 0\u2013100, rounded. */
  score: number
  fits: string[]
  caveats: string[]
}

const WEIGHTS = {
  market: 30,
  pace: 22,
  session: 18,
  risk: 14,
  level: 10,
  commitment: 6,
}

const MARKET_KEYS: Record<PlaybookMarket, MessageKey> = {
  forex: 'strategy.profile.q.markets.opt.forex',
  futures: 'strategy.profile.q.markets.opt.futures',
  crypto: 'strategy.profile.q.markets.opt.crypto',
  stocks: 'strategy.profile.q.markets.opt.stocks',
}

const PACE_KEYS: Record<PlaybookPace, MessageKey> = {
  scalp: 'strategy.match.pace.scalp',
  intraday: 'strategy.match.pace.intraday',
  swing: 'strategy.match.pace.swing',
}

const SESSION_KEYS: Record<PlaybookSession, MessageKey> = {
  asia: 'strategy.match.session.asia',
  london: 'strategy.match.session.london',
  newyork: 'strategy.match.session.newyork',
  overlap: 'strategy.match.session.overlap',
  any: 'strategy.match.session.any',
}

const COMMITMENT_KEYS: Record<string, MessageKey> = {
  under1: 'strategy.match.commitment.under1',
  '1to3': 'strategy.match.commitment.1to3',
  full: 'strategy.match.commitment.full',
}

const LEVEL_KEYS: Record<PlaybookLevel, MessageKey> = {
  beginner: 'strategy.match.level.beginner',
  intermediate: 'strategy.match.level.intermediate',
  advanced: 'strategy.match.level.advanced',
}

const RISK_KEYS: Record<string, MessageKey> = {
  conservative: 'strategy.profile.q.risk.opt.conservative',
  balanced: 'strategy.profile.q.risk.opt.balanced',
  aggressive: 'strategy.profile.q.risk.opt.aggressive',
}

const LEVEL_ORDER: Record<PlaybookLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
}

const EXPERIENCE_LEVEL: Record<string, number> = { new: 0, under2: 1, over2: 2 }

const COMMITMENT_ORDER: Record<string, number> = { under1: 0, '1to3': 1, full: 2 }

function joinLabels(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} ${t('strategy.match.joinAnd')} ${items[1]}`
  return `${items.slice(0, -1).join(', ')} ${t('strategy.match.joinAnd')} ${items.at(-1)!}`
}

function joinSlash(items: string[]): string {
  return items.join('/')
}

function marketLabel(m: PlaybookMarket): string {
  return t(MARKET_KEYS[m])
}

function sessionLabel(s: PlaybookSession): string {
  return t(SESSION_KEYS[s])
}

function resolveReasons(reasons: MatchReason[]): string[] {
  return reasons.map((r) => t(r.key, r.vars))
}

function defineMatch(
  entry: PlaybookEntry,
  score: number,
  fitReasons: MatchReason[],
  caveatReasons: MatchReason[],
): StrategyMatch {
  const match = { entry, score, fitReasons, caveatReasons } as StrategyMatch & {
    fitReasons: MatchReason[]
    caveatReasons: MatchReason[]
  }
  Object.defineProperties(match, {
    fits: {
      get(): string[] {
        return resolveReasons(match.fitReasons)
      },
      enumerable: true,
    },
    caveats: {
      get(): string[] {
        return resolveReasons(match.caveatReasons)
      },
      enumerable: true,
    },
  })
  return match
}

function scoreEntry(entry: PlaybookEntry, profile: StrategyProfile): StrategyMatch {
  let score = 0
  const fitReasons: MatchReason[] = []
  const caveatReasons: MatchReason[] = []

  // Market — the strongest signal; a mismatch here is the main caveat traders care about.
  const wanted = profile.markets
  if (!wanted.length) {
    score += WEIGHTS.market * 0.5
  } else if (wanted.some((m) => entry.markets.includes(m))) {
    score += WEIGHTS.market
    const shared = wanted.filter((m) => entry.markets.includes(m)).map((m) => marketLabel(m))
    fitReasons.push({ key: 'strategy.match.fit.tradesMarkets', vars: { markets: joinLabels(shared) } })
  } else {
    caveatReasons.push({
      key: 'strategy.match.caveat.markets',
      vars: {
        builtFor: joinSlash(entry.markets.map((m) => marketLabel(m))),
        wanted: joinSlash(wanted.map((m) => marketLabel(m))),
      },
    })
  }

  // Pace
  if (!profile.pace) {
    score += WEIGHTS.pace * 0.5
  } else if (entry.pace === profile.pace) {
    score += WEIGHTS.pace
    fitReasons.push({ key: 'strategy.match.fit.pace', vars: { pace: t(PACE_KEYS[profile.pace]) } })
  } else {
    caveatReasons.push({
      key: 'strategy.match.caveat.pace',
      vars: {
        entryPace: t(PACE_KEYS[entry.pace]),
        profilePace: t(PACE_KEYS[profile.pace]),
      },
    })
  }

  // Session — "any" on either side is a soft match rather than a miss.
  const sessions = profile.sessions
  if (!sessions.length || sessions.includes('any') || entry.sessions.includes('any')) {
    score += WEIGHTS.session * 0.7
    if (entry.sessions.includes('any')) fitReasons.push({ key: 'strategy.match.fit.flexSession' })
  } else if (sessions.some((s) => entry.sessions.includes(s))) {
    score += WEIGHTS.session
    const shared = sessions.filter((s) => entry.sessions.includes(s)).map((s) => sessionLabel(s))
    fitReasons.push({ key: 'strategy.match.fit.session', vars: { sessions: joinLabels(shared) } })
  } else {
    caveatReasons.push({
      key: 'strategy.match.caveat.session',
      vars: { entrySessions: joinSlash(entry.sessions.map((s) => sessionLabel(s))) },
    })
  }

  // Risk appetite
  if (!profile.risk) {
    score += WEIGHTS.risk * 0.5
  } else if (entry.risk === profile.risk) {
    score += WEIGHTS.risk
    fitReasons.push({ key: 'strategy.match.fit.risk', vars: { risk: t(RISK_KEYS[profile.risk]) } })
  } else {
    score += WEIGHTS.risk * 0.35
    caveatReasons.push({
      key: 'strategy.match.caveat.risk',
      vars: {
        entryRisk: t(RISK_KEYS[entry.risk]),
        profileRisk: t(RISK_KEYS[profile.risk]),
      },
    })
  }

  // Experience vs difficulty — being over-qualified is fine, under-qualified is not.
  const traderLevel = profile.experience ? EXPERIENCE_LEVEL[profile.experience] ?? 1 : 1
  const entryLevel = LEVEL_ORDER[entry.level]
  if (entryLevel <= traderLevel) {
    score += WEIGHTS.level
    if (entryLevel < traderLevel) fitReasons.push({ key: 'strategy.match.fit.experienceOver' })
    else
      fitReasons.push({
        key: 'strategy.match.fit.experienceMatch',
        vars: { level: t(LEVEL_KEYS[entry.level]) },
      })
  } else {
    score += WEIGHTS.level * 0.3
    caveatReasons.push({
      key: 'strategy.match.caveat.level',
      vars: { level: t(LEVEL_KEYS[entry.level]) },
    })
  }

  // Daily commitment
  const have = profile.commitment ? COMMITMENT_ORDER[profile.commitment] ?? 1 : 1
  const needs = COMMITMENT_ORDER[entry.commitment] ?? 1
  if (needs <= have) {
    score += WEIGHTS.commitment
  } else {
    caveatReasons.push({
      key: 'strategy.match.caveat.commitment',
      vars: {
        needs: t(COMMITMENT_KEYS[entry.commitment]!),
        have: t(COMMITMENT_KEYS[profile.commitment ?? '1to3']!),
      },
    })
  }

  return defineMatch(entry, Math.round(score), fitReasons, caveatReasons)
}

/** Best matches first. Returns the top `limit` entries. */
export function rankStrategies(profile: StrategyProfile, limit = 3): StrategyMatch[] {
  return STRATEGY_PLAYBOOK.map((entry) => scoreEntry(entry, profile))
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit)
}

const RISK_PCT: Record<string, number> = { conservative: 0.5, balanced: 1, aggressive: 2 }

/**
 * Turns a match into a saveable strategy. Position sizing is re-based on the
 * trader's stated risk appetite rather than the template's default, since that
 * is the one field they explicitly told us about.
 */
export function strategyFromMatch(
  match: StrategyMatch,
  profile: StrategyProfile,
): StrategyDefinition {
  const riskPct = RISK_PCT[profile.risk ?? 'balanced'] ?? 1
  return {
    ...match.entry.definition,
    id: newCustomStrategyId(),
    name: match.entry.name,
    positionSize: { type: 'fixed_risk', riskPct },
  }
}
