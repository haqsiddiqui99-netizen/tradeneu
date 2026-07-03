import type { PropChallengeEval, PropChallengeStatus } from './propTypes'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderPropBanner(el: HTMLElement, eval_: PropChallengeEval | null): void {
  if (!eval_) {
    el.hidden = true
    el.innerHTML = ''
    return
  }

  const status: PropChallengeStatus = eval_.status
  const mod =
    status === 'passed' ? 'rw-prop-banner--passed' : status === 'failed' ? 'rw-prop-banner--failed' : 'rw-prop-banner--active'

  el.className = `rw-prop-banner ${mod}`
  el.hidden = false
  el.innerHTML = `
    <div class="rw-prop-banner__head">
      <span class="rw-prop-banner__dot" aria-hidden="true"></span>
      <strong class="rw-prop-banner__title">${escapeHtml(eval_.headline)}</strong>
    </div>
    <p class="rw-prop-banner__detail">${escapeHtml(eval_.detail)}</p>
    ${
      status === 'active'
        ? `<div class="rw-prop-banner__track" aria-hidden="true">
            <div class="rw-prop-banner__fill" style="width:${Math.round(eval_.profitProgressPct)}%"></div>
          </div>`
        : ''
    }
  `
}

export function propStatusLabel(status: PropChallengeStatus | undefined): string {
  if (status === 'passed') return 'Passed'
  if (status === 'failed') return 'Failed'
  if (status === 'active') return 'In progress'
  return 'Not started'
}
