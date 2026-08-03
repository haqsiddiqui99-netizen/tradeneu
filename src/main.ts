import './app.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import {
  appPath,
  applyLocaleFromPath,
  canonicalPathFromLegacy,
  dashboardPathForUser,
  DEFAULT_LOCALE_TAG,
  normalizeAppPath,
  parseAppPath,
  resolveAppPath,
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

  const parsed = parseAppPath(normalizeAppPath(window.location.pathname))
  const authed = await resolveAuthSession()

  if (!parsed) {
    window.location.replace(
      authed ? resolveAppPath('dashboard') : appPath(DEFAULT_LOCALE_TAG, 'login'),
    )
    return
  }

  applyLocaleFromPath(window.location.pathname)

  if (parsed.page === 'login') {
    mountLoginGate(root, () => {
      window.location.assign(dashboardPathForUser())
    })
    return
  }

  if (parsed.page === 'dashboard' || parsed.page === 'chart') {
    if (!authed) {
      window.location.replace(resolveAppPath('login', parsed.localeTag))
      return
    }
    mountDashboardApp(root)
    return
  }

  window.location.replace(authed ? dashboardPathForUser() : resolveAppPath('login'))
}

void bootstrap()
