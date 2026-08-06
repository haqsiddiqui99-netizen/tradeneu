export type TelemetryEventName =
  | 'session_created'
  | 'backtest_completed'
  | 'asset_practice'
  | 'presence_ping'

export async function postTelemetryEvent(
  event: TelemetryEventName,
  payload?: Record<string, string | number | boolean>,
): Promise<void> {
  try {
    await fetch('/api/telemetry/event', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload: payload ?? {} }),
    })
  } catch {
    /* best-effort — do not block UX */
  }
}
