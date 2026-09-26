/**
 * src/strategy/strategyProfile.ts
 *
 * The six calibration questions behind "I need a strategy", plus the profile
 * shape they produce. Kept separate from the view so the question set can be
 * reordered or extended without touching rendering logic.
 */
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
  prompt: string
  /** Shown under the prompt for multi-select questions. */
  subPrompt?: string
  multi?: boolean
  options: { value: string; label: string }[]
}

export const PROFILE_QUESTIONS: ProfileQuestion[] = [
  {
    id: 'experience',
    prompt: 'How long have you been trading?',
    options: [
      { value: 'new', label: 'Just starting out' },
      { value: 'under2', label: 'Less than 2 years' },
      { value: 'over2', label: '2+ years' },
    ],
  },
  {
    id: 'markets',
    prompt: 'Which markets interest you most?',
    subPrompt: 'Select all that apply',
    multi: true,
    options: [
      { value: 'forex', label: 'Forex' },
      { value: 'futures', label: 'Futures' },
      { value: 'crypto', label: 'Crypto' },
      { value: 'stocks', label: 'Stocks' },
    ],
  },
  {
    id: 'pace',
    prompt: 'What pace suits you?',
    options: [
      { value: 'scalp', label: 'Scalping \u2014 minutes' },
      { value: 'intraday', label: 'Intraday \u2014 hours' },
      { value: 'swing', label: 'Swing \u2014 days' },
    ],
  },
  {
    id: 'commitment',
    prompt: 'How much screen time can you give it daily?',
    options: [
      { value: 'under1', label: 'Under 1 hour' },
      { value: '1to3', label: '1\u20133 hours' },
      { value: 'full', label: 'A full session' },
    ],
  },
  {
    id: 'sessions',
    prompt: 'Which trading sessions do you trade?',
    subPrompt: 'Select all that apply',
    multi: true,
    options: [
      { value: 'asia', label: 'Asian session' },
      { value: 'london', label: 'London session' },
      { value: 'newyork', label: 'New York session' },
      { value: 'overlap', label: 'London + New York overlap' },
      { value: 'any', label: 'Whenever I can' },
    ],
  },
  {
    id: 'risk',
    prompt: 'What\u2019s your appetite for risk?',
    options: [
      { value: 'conservative', label: 'Conservative' },
      { value: 'balanced', label: 'Balanced' },
      { value: 'aggressive', label: 'Aggressive' },
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
