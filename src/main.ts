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
import { resolveAuthSession, getAuthUser, isAdminUser, isGuestAuthUser } from './auth/authSession'
import { fetchAdminMe, resolveAuthedHomePath } from './admin/adminApi'
import { registerGuestSession, startGuestHeartbeat, pingGuestSession } from './guest/guestSessionApi'
import { mountDashboardApp } from './home/mountDashboardApp'
import { mountLoginGate } from './login/mountLoginGate'
import { mountAdminPage } from './views/mountAdminPage'

const root = document.querySelector('#root') as HTMLElement

async function bootstrap(): Promise<void> {
  const legacyRedirect = canonicalPathFromLegacy(window.location.pathname)
  if (legacyRedirect) {
    window.location.replace(legacyRedirect + window.location.search + window.location.hash)
    return
  }

  const parsed = parseAppPath(normalizeAppPath(window.location.pathname))
  const authed = await resolveAuthSession()
  let isAdmin = isAdminUser(getAuthUser())
  if (authed && !isAdmin) {
    const admin = await fetchAdminMe()
    isAdmin = admin?.isAdmin === true
  }

  if (!parsed) {
    window.location.replace(
      authed ? (isAdmin ? resolveAppPath('admin') : resolveAppPath('dashboard')) : appPath(DEFAULT_LOCALE_TAG, 'login'),
    )
    return
  }

  applyLocaleFromPath(window.location.pathname)

  if (authed && isGuestAuthUser(getAuthUser())) {
    const guestPage =
      parsed.page === 'chart' ? 'chart' : parsed.page === 'dashboard' ? 'dashboard' : 'app'
    void pingGuestSession(guestPage)
    startGuestHeartbeat(guestPage)
  }

  if (parsed.page === 'login') {
    if (authed) {
      window.location.replace(isAdmin ? resolveAppPath('admin', parsed.localeTag) : dashboardPathForUser())
      return
    }
    mountLoginGate(root, () => {
      void resolveAuthedHomePath().then((path) => window.location.assign(path))
    })
    return
  }

  if (parsed.page === 'dashboard' || parsed.page === 'chart') {
    if (!authed) {
      window.location.replace(resolveAppPath('login', parsed.localeTag))
      return
    }
    if (isAdmin) {
      window.location.replace(resolveAppPath('admin', parsed.localeTag))
      return
    }
    await mountDashboardApp(root)
    return
  }

  if (parsed.page === 'admin') {
    if (!authed) {
      window.location.replace(resolveAppPath('login', parsed.localeTag))
      return
    }
    if (!isAdmin) {
      window.location.replace(resolveAppPath('dashboard', parsed.localeTag))
      return
    }
    mountAdminPage(root)
    return
  }

  window.location.replace(authed ? await resolveAuthedHomePath() : resolveAppPath('login'))
}

void bootstrap()
