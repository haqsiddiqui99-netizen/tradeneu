import './app.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import {
  canonicalPathFromLegacy,
  CHART_PAGE_PATH,
  HOME_PAGE_PATH,
  LOGIN_PAGE_PATH,
  normalizeAppPath,
} from './appPaths'
import { resolveAuthSession } from './auth/authSession'
import { mountDashboardApp } from './home/mountDashboardApp'
import { mountLoginGate } from './login/mountLoginGate'

const root = document.querySelector('#root') as HTMLElement

async function bootstrap(): Promise<void> {
  const legacyRedirect = canonicalPathFromLegacy(window.location.pathname)
  if (legacyRedirect) {
    window.location.replace(legacyRedirect + window.location.search + window.location.hash)
    return
  }

  const path = normalizeAppPath(window.location.pathname)

  const authed = await resolveAuthSession()

  if (path === LOGIN_PAGE_PATH) {
    mountLoginGate(root, () => {
      window.location.assign(HOME_PAGE_PATH)
    })
    return
  }

  if (path === HOME_PAGE_PATH || path === CHART_PAGE_PATH) {
    if (!authed) {
      window.location.replace(LOGIN_PAGE_PATH)
      return
    }
    mountDashboardApp(root)
    return
  }

  // `/` and unknown paths → login or dashboard
  window.location.replace(authed ? HOME_PAGE_PATH : LOGIN_PAGE_PATH)
}

void bootstrap()
