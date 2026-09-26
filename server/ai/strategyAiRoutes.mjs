/**
 * server/ai/strategyAiRoutes.mjs
 *
 * "AI strategy builder" endpoints (fxreplay-style):
 *   POST /api/ai/strategy/objectify — turn a trader's free-text rules into a
 *     precise StrategyDefinition JSON object ("I have a strategy" flow).
 *   POST /api/ai/strategy/generate — design a brand-new StrategyDefinition
 *     from a short trader profile ("I need a strategy" flow).
 *
 * Requires OPENAI_API_KEY (server env only, see .env.local.example). Without
 * it both routes reply 503 `ai_not_configured` so the UI can show a clear
 * message instead of a generic failure.
 *
 * The JSON shape requested from the model mirrors `StrategyDefinition` in
 * src/backtest/BacktestTypes.ts — keep the indicator/operator lists and the
 * schema description below in sync with that file if it changes.
 */

import { readSessionFromRequest } from '../auth/sessionCookie.mjs'
import { readGuestFromRequest } from '../guest/guestCookie.mjs'

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'

// Keep in sync with `IndicatorKey` in src/backtest/BacktestTypes.ts.
const INDICATOR_KEYS = [
  'close', 'open', 'high', 'low', 'volume',
  'ema9', 'ema21', 'ema50', 'ema200',
  'sma9', 'sma21', 'sma50', 'sma200',
  'rsi14',
  'atr14',
  'macd_line', 'macd_signal', 'macd_hist',
  'bb_upper', 'bb_middle', 'bb_lower',
  'vwap',
  'adx14',
]

// Keep in sync with `StrategyCondition['op']` in src/backtest/BacktestTypes.ts.
const OPERATORS = ['>', '<', '>=', '<=', 'cross_above', 'cross_below', 'equals']

const SCHEMA_DESCRIPTION = `Return ONE JSON object (no markdown, no commentary, no code fences) matching this exact shape:

{
  "id": string,               // any short slug, e.g. "ai_strategy_1"
  "name": string,             // short human-readable name
  "direction": "long" | "short" | "both",
  "entryConditions": [ { "lhs": IndicatorKey, "op": Operator, "rhs": IndicatorKey | number }, ... ],  // 1+ items, ALL must hold true together
  "exitConditions":  [ { "lhs": IndicatorKey, "op": Operator, "rhs": IndicatorKey | number }, ... ],  // 1+ items, ALL must hold true together
  "stopLoss":   { "type": "fixed_pct", "value": number } | { "type": "atr_mult", "value": number } | { "type": "fixed_price", "value": number },
  "takeProfit": { "type": "rr_ratio", "value": number } | { "type": "fixed_pct", "value": number } | { "type": "fixed_price", "value": number } | { "type": "none" },
  "positionSize": { "type": "fixed_units", "units": number } | { "type": "fixed_risk", "riskPct": number } | { "type": "pct_equity", "pct": number },
  "sessionFilter": { "fromHour": number, "toHour": number } | omit,   // UTC hours 0-23
  "dayFilter": number[] | omit,          // 0=Sun..6=Sat
  "maxOpenTrades": number | omit,
  "cooldownBarsAfterLoss": number | omit
}

IndicatorKey must be one of: ${INDICATOR_KEYS.join(', ')}.
Operator must be one of: ${OPERATORS.join(', ')} ("cross_above"/"cross_below" only make sense between two IndicatorKeys, not raw numbers).
Every field you include must use exactly these key names and value shapes — this JSON is parsed directly into a backtesting engine, not shown as prose.`

const FEW_SHOT_EXAMPLE = JSON.stringify({
  id: 'ema_cross_example',
  name: 'EMA 9/21 Crossover',
  direction: 'long',
  entryConditions: [{ lhs: 'ema9', op: 'cross_above', rhs: 'ema21' }],
  exitConditions: [{ lhs: 'ema9', op: 'cross_below', rhs: 'ema21' }],
  stopLoss: { type: 'atr_mult', value: 1.5 },
  takeProfit: { type: 'rr_ratio', value: 2 },
  positionSize: { type: 'fixed_risk', riskPct: 1 },
  sessionFilter: { fromHour: 8, toHour: 18 },
  dayFilter: [1, 2, 3, 4, 5],
})

function buildSystemPrompt() {
  return [
    'You are a trading-strategy compiler for the Tradeneu backtesting engine.',
    'You translate a trader\'s intent into ONE strict, valid JSON object describing entry/exit rules, stop loss, take profit and position sizing.',
    'You never explain yourself, never wrap the JSON in markdown fences, and never add fields outside the schema.',
    '',
    SCHEMA_DESCRIPTION,
    '',
    `Example of a valid response:\n${FEW_SHOT_EXAMPLE}`,
  ].join('\n')
}

function resolveIdentity(req) {
  const session = readSessionFromRequest(req)
  if (session?.email) return session.email
  const guest = readGuestFromRequest(req)
  if (guest?.guestId) return `guest:${guest.guestId}`
  return null
}

async function callOpenAi(userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    const err = new Error('missing_api_key')
    err.code = 'missing_api_key'
    throw err
  }
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'

  const res = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const err = new Error(`openai_error_${res.status}`)
    err.code = 'ai_request_failed'
    err.detail = detail.slice(0, 800)
    throw err
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    const err = new Error('empty_completion')
    err.code = 'ai_request_failed'
    throw err
  }
  return content
}

function handleAiError(res, err) {
  if (err?.code === 'missing_api_key') {
    res.status(503).json({ ok: false, error: 'ai_not_configured' })
    return
  }
  // eslint-disable-next-line no-console
  console.error('[ai/strategy]', err?.message || err, err?.detail ? `— ${err.detail}` : '')
  res.status(502).json({ ok: false, error: 'ai_request_failed' })
}

export function mountStrategyAiRoutes(app) {
  app.post('/api/ai/strategy/objectify', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const identity = resolveIdentity(req)
    if (!identity) {
      res.status(401).json({ ok: false, error: 'not_authenticated' })
      return
    }

    const description = String(req.body?.description || '').trim()
    if (!description) {
      res.status(400).json({ ok: false, error: 'description_required' })
      return
    }
    // Matches the composer's counter in src/strategy/strategyObjectifyView.ts.
    if (description.length > 10000) {
      res.status(400).json({ ok: false, error: 'description_too_long' })
      return
    }

    try {
      const userPrompt = [
        'The trader already has a strategy in mind, described below in their own words.',
        'Objectify it: keep their intent, but turn every vague idea into a precise condition using only the allowed indicators/operators.',
        'Do not invent an unrelated strategy — stay faithful to what they described. If a detail is missing (e.g. no stop mentioned), pick a sensible default.',
        '',
        'Trader\'s rules:',
        '"""',
        description,
        '"""',
      ].join('\n')
      const content = await callOpenAi(userPrompt)
      res.json({ ok: true, strategyJson: content })
    } catch (err) {
      handleAiError(res, err)
    }
  })

  app.post('/api/ai/strategy/generate', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const identity = resolveIdentity(req)
    if (!identity) {
      res.status(401).json({ ok: false, error: 'not_authenticated' })
      return
    }

    const market = String(req.body?.market || '').trim().slice(0, 100)
    const timeframe = String(req.body?.timeframe || '').trim().slice(0, 50)
    const riskTolerance = String(req.body?.riskTolerance || '').trim().slice(0, 50)
    const style = String(req.body?.style || '').trim().slice(0, 100)
    const notes = String(req.body?.notes || '').trim().slice(0, 2000)

    if (!market && !timeframe && !riskTolerance && !style && !notes) {
      res.status(400).json({ ok: false, error: 'input_required' })
      return
    }

    try {
      const userPrompt = [
        'Design a brand-new strategy for this trader profile — pick a coherent, testable rule set that fits it well:',
        market ? `Market / instrument: ${market}` : null,
        timeframe ? `Timeframe: ${timeframe}` : null,
        riskTolerance ? `Risk tolerance: ${riskTolerance}` : null,
        style ? `Preferred trading style: ${style}` : null,
        notes ? `Additional notes from the trader: ${notes}` : null,
      ]
        .filter(Boolean)
        .join('\n')
      const content = await callOpenAi(userPrompt)
      res.json({ ok: true, strategyJson: content })
    } catch (err) {
      handleAiError(res, err)
    }
  })
}
