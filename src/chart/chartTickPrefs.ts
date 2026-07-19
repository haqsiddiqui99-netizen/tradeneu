const LS_FULL_SESSION_TICKS = 'suplexity-chart-full-session-ticks'

/** When true, tick intervals use the full session tick series (progressive load) instead of a cursor window. */
export function readFullSessionTicks(): boolean {
  try {
    return localStorage.getItem(LS_FULL_SESSION_TICKS) === '1'
  } catch {
    return false
  }
}

export function writeFullSessionTicks(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(LS_FULL_SESSION_TICKS, '1')
    else localStorage.removeItem(LS_FULL_SESSION_TICKS)
  } catch {
    /* noop */
  }
}
