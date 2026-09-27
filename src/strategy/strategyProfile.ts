/**
 * src/strategy/strategyProfile.ts
 *
 * The six calibration questions behind "I need a strategy", plus the profile
 * shape they produce. Kept separate from the view so the question set can be
 * reordered or extended without touching rendering logic.
 */
import type { MessageKey } from '../i18n'
import type { PlaybookMarket, PlaybookRisk, PlaybookSession } from './strategyPlaybook'

export type ProfileExperience = 'new' | 'under2' | 'over2'
export type ProfilePace = 'scalp' | 'intraday' | 'swing'
export type ProfileCommitment = 'under1' | '1to3' | 'full'

export type StrategyProfile = {
  experience?: ProfileExperience
  markets: PlaybookMarket[]
  pace?: ProfilePace
  commitment?: ProfileCommitment
  sessions: PlaybookSession[]
  risk?: PlaybookRisk
  /** Free-text answers keyed by question id, for anything picked as "Something else". */
  custom: Record<string, string>
}

export function emptyProfile(): StrategyProfile {
  return { markets: [], sessions: [], custom: {} }
}

export type ProfileQuestion = {
  id: keyof Omit<StrategyProfile, 'custom'>
  promptKey: MessageKey
  /** Shown under the prompt for multi-select questions. */
  subPromptKey?: MessageKey
  multi?: boolean
  options: { value: string; labelKey: MessageKey }[]
}

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
  {
    id: 'experience',
    promptKey: 'strategy.profile.q.experience.prompt',
    options: [
      { value: 'new', labelKey: 'strategy.profile.q.experience.opt.new' },
      { value: 'under2', labelKey: 'strategy.profile.q.experience.opt.under2' },
      { value: 'over2', labelKey: 'strategy.profile.q.experience.opt.over2' },
    ],
  },
  {
    id: 'markets',
    promptKey: 'strategy.profile.q.markets.prompt',
    subPromptKey: 'strategy.profile.q.markets.subPrompt',
    multi: true,
    options: [
      { value: 'forex', labelKey: 'strategy.profile.q.markets.opt.forex' },
      { value: 'futures', labelKey: 'strategy.profile.q.markets.opt.futures' },
      { value: 'crypto', labelKey: 'strategy.profile.q.markets.opt.crypto' },
      { value: 'stocks', labelKey: 'strategy.profile.q.markets.opt.stocks' },
    ],
  },
  {
    id: 'pace',
    promptKey: 'strategy.profile.q.pace.prompt',
    options: [
      { value: 'scalp', labelKey: 'strategy.profile.q.pace.opt.scalp' },
      { value: 'intraday', labelKey: 'strategy.profile.q.pace.opt.intraday' },
      { value: 'swing', labelKey: 'strategy.profile.q.pace.opt.swing' },
    ],
  },
  {
    id: 'commitment',
    promptKey: 'strategy.profile.q.commitment.prompt',
    options: [
      { value: 'under1', labelKey: 'strategy.profile.q.commitment.opt.under1' },
      { value: '1to3', labelKey: 'strategy.profile.q.commitment.opt.1to3' },
      { value: 'full', labelKey: 'strategy.profile.q.commitment.opt.full' },
    ],
  },
  {
    id: 'sessions',
    promptKey: 'strategy.profile.q.sessions.prompt',
    subPromptKey: 'strategy.profile.q.sessions.subPrompt',
    multi: true,
    options: [
      { value: 'asia', labelKey: 'strategy.profile.q.sessions.opt.asia' },
      { value: 'london', labelKey: 'strategy.profile.q.sessions.opt.london' },
      { value: 'newyork', labelKey: 'strategy.profile.q.sessions.opt.newyork' },
      { value: 'overlap', labelKey: 'strategy.profile.q.sessions.opt.overlap' },
      { value: 'any', labelKey: 'strategy.profile.q.sessions.opt.any' },
    ],
  },
  {
    id: 'risk',
    promptKey: 'strategy.profile.q.risk.prompt',
    options: [
      { value: 'conservative', labelKey: 'strategy.profile.q.risk.opt.conservative' },
      { value: 'balanced', labelKey: 'strategy.profile.q.risk.opt.balanced' },
      { value: 'aggressive', labelKey: 'strategy.profile.q.risk.opt.aggressive' },
    ],
  },
]

/** Reads a question's current answer as a list, so single and multi share code. */
export function answerFor(profile: StrategyProfile, question: ProfileQuestion): string[] {
  const value = profile[question.id]
  if (Array.isArray(value)) return value
  return value ? [String(value)] : []
}

export function applyAnswer(
  profile: StrategyProfile,
  question: ProfileQuestion,
  values: string[],
): void {
  if (question.multi) {
    // Both multi-select fields are string-array unions; the cast keeps the
    // question table generic without widening StrategyProfile itself.
    ;(profile[question.id] as unknown as string[]) = values
    return
  }
  ;(profile[question.id] as unknown as string | undefined) = values[0]
}
