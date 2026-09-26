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
import type { PlaybookEntry, PlaybookLevel } from './strategyPlaybook'
import { STRATEGY_PLAYBOOK } from './strategyPlaybook'
import type { StrategyProfile } from './strategyProfile'

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

const MARKET_LABELS: Record<string, string> = {
  forex: 'forex',
  futures: 'futures',
  crypto: 'crypto',
  stocks: 'stocks',
}

const PACE_LABELS: Record<string, string> = {
  scalp: 'minute-scale scalping',
  intraday: 'intraday holds',
  swing: 'multi-day swings',
}

const SESSION_LABELS: Record<string, string> = {
  asia: 'the Asian session',
  london: 'the London session',
  newyork: 'the New York session',
  overlap: 'the London/NY overlap',
  any: 'any session',
}

const COMMITMENT_LABELS: Record<string, string> = {
  under1: 'under an hour a day',
  '1to3': '1\u20133 hours a day',
  full: 'a full session',
}

const LEVEL_ORDER: Record<PlaybookLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
}

const EXPERIENCE_LEVEL: Record<string, number> = { new: 0, under2: 1, over2: 2 }

const COMMITMENT_ORDER: Record<string, number> = { under1: 0, '1to3': 1, full: 2 }

function scoreEntry(entry: PlaybookEntry, profile: StrategyProfile): StrategyMatch {
  let score = 0
  const fits: string[] = []
  const caveats: string[] = []

  // Market — the strongest signal; a mismatch here is the main caveat traders care about.
  const wanted = profile.markets
  if (!wanted.length) {
    score += WEIGHTS.market * 0.5
  } else if (wanted.some((m) => entry.markets.includes(m))) {
    score += WEIGHTS.market
    const shared = wanted.filter((m) => entry.markets.includes(m)).map((m) => MARKET_LABELS[m])
    fits.push(`Trades ${shared.join(' and ')}, which you picked`)
  } else {
    caveats.push(
      `Built for ${entry.markets.map((m) => MARKET_LABELS[m]).join('/')} rather than ${wanted
        .map((m) => MARKET_LABELS[m])
        .join('/')}`,
    )
  }

  // Pace
  if (!profile.pace) {
    score += WEIGHTS.pace * 0.5
  } else if (entry.pace === profile.pace) {
    score += WEIGHTS.pace
    fits.push(`Runs at your ${PACE_LABELS[profile.pace]} pace`)
  } else {
    caveats.push(
      `Holds for ${PACE_LABELS[entry.pace]}, not the ${PACE_LABELS[profile.pace]} you prefer`,
    )
  }

  // Session — "any" on either side is a soft match rather than a miss.
  const sessions = profile.sessions
  if (!sessions.length || sessions.includes('any') || entry.sessions.includes('any')) {
    score += WEIGHTS.session * 0.7
    if (entry.sessions.includes('any')) fits.push('Not tied to one session, so timing is flexible')
  } else if (sessions.some((s) => entry.sessions.includes(s))) {
    score += WEIGHTS.session
    const shared = sessions.filter((s) => entry.sessions.includes(s)).map((s) => SESSION_LABELS[s])
    fits.push(`Fires during ${shared.join(' and ')}`)
  } else {
    caveats.push(
      `Trades ${entry.sessions.map((s) => SESSION_LABELS[s]).join('/')}, outside the hours you gave`,
    )
  }

  // Risk appetite
  if (!profile.risk) {
    score += WEIGHTS.risk * 0.5
  } else if (entry.risk === profile.risk) {
    score += WEIGHTS.risk
    fits.push(`${profile.risk[0]!.toUpperCase()}${profile.risk.slice(1)} risk profile, like yours`)
  } else {
    score += WEIGHTS.risk * 0.35
    caveats.push(`Sized as ${entry.risk} while you picked ${profile.risk}`)
  }

  // Experience vs difficulty — being over-qualified is fine, under-qualified is not.
  const traderLevel = profile.experience ? EXPERIENCE_LEVEL[profile.experience] ?? 1 : 1
  const entryLevel = LEVEL_ORDER[entry.level]
  if (entryLevel <= traderLevel) {
    score += WEIGHTS.level
    if (entryLevel < traderLevel) fits.push('Mechanical enough to judge quickly at your experience')
    else fits.push(`Pitched at ${entry.level} level, matching your experience`)
  } else {
    score += WEIGHTS.level * 0.3
    caveats.push(`Rated ${entry.level} \u2014 a step up from where you said you are`)
  }

  // Daily commitment
  const have = profile.commitment ? COMMITMENT_ORDER[profile.commitment] ?? 1 : 1
  const needs = COMMITMENT_ORDER[entry.commitment] ?? 1
  if (needs <= have) {
    score += WEIGHTS.commitment
  } else {
    caveats.push(
      `Wants ${COMMITMENT_LABELS[entry.commitment]} but you have ${
        COMMITMENT_LABELS[profile.commitment ?? '1to3']
      }`,
    )
  }

  return { entry, score: Math.round(score), fits, caveats }
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
