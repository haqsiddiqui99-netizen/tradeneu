/**
 * src/ai/strategyAiClient.ts
 *
 * Thin fetch wrapper around the server-side AI strategy builder endpoints
 * (see server/ai/strategyAiRoutes.mjs). Both flows return the raw JSON text
 * from the model — callers should run it through `parseStrategyJson` from
 * strategyBuilderFields.ts, which validates + fills in any missing fields.
 */

export type StrategyAiObjectifyInput = {
  description: string
}

export type StrategyAiGenerateInput = {
  market?: string
  timeframe?: string
  riskTolerance?: string
  style?: string
  session?: string
  direction?: string
  indicators?: string
  riskPerTrade?: string
  maxOpenTrades?: string
  stopStyle?: string
  targetStyle?: string
  notes?: string
}

export type StrategyAiResult =
  | { ok: true; strategyJson: string }
  | { ok: false; error: string }

async function postStrategyAi(path: string, body: unknown): Promise<StrategyAiResult> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) {
      return { ok: false, error: String(data?.error || `request_failed_${res.status}`) }
    }
    return { ok: true, strategyJson: String(data.strategyJson || '') }
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

/** "I have a strategy" flow — turn free-text rules into a precise StrategyDefinition. */
export function objectifyStrategy(input: StrategyAiObjectifyInput): Promise<StrategyAiResult> {
  return postStrategyAi('/api/ai/strategy/objectify', input)
}

/** "I need a strategy" flow — design a new StrategyDefinition from a short profile. */
export function generateStrategy(input: StrategyAiGenerateInput): Promise<StrategyAiResult> {
  return postStrategyAi('/api/ai/strategy/generate', input)
}

export function describeStrategyAiError(error: string): string {
  switch (error) {
    case 'ai_not_configured':
      return 'The AI strategy builder isn\u2019t configured yet \u2014 an admin needs to set OPENAI_API_KEY on the server.'
    case 'not_authenticated':
      return 'Please sign in to use the AI strategy builder.'
    case 'description_required':
      return 'Paste your strategy rules first.'
    case 'description_too_long':
      return 'That\u2019s a lot of text \u2014 try trimming it to the essential rules.'
    case 'input_required':
      return 'Tell us a little about the strategy you want first.'
    case 'network_error':
      return 'Could not reach the server. Check your connection and try again.'
    case 'ai_request_failed':
      return 'The AI could not generate a strategy just now. Please try again in a moment.'
    default:
      return 'Something went wrong talking to the AI strategy builder.'
  }
}
