import './app.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import { CHART_PAGE_PATH, HOME_PAGE_PATH, LOGIN_PAGE_PATH, normalizeAppPath } from './appPaths'
import { resolveAuthSession } from './auth/authSession'
import { mountDashboardApp } from './home/mountDashboardApp'
import { mountLoginGate } from './login/mountLoginGate'

const root = document.querySelector('#root') as HTMLElement

async function bootstrap(): Promise<void> {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/'
  const path = normalizeAppPath(window.location.pathname)

  if (
    (path === LOGIN_PAGE_PATH || path === HOME_PAGE_PATH || path === CHART_PAGE_PATH) &&
    pathname !== path
  ) {
    window.location.replace(path + window.location.search + window.location.hash)
    return
  }

  const authed = await resolveAuthSession()

  if (path === LOGIN_PAGE_PATH) {
    if (authed) {
      window.location.replace(HOME_PAGE_PATH)
      return
    }
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

  if (path === '/') {
    window.location.replace(authed ? HOME_PAGE_PATH : LOGIN_PAGE_PATH)
    return
  }

  window.location.replace(authed ? HOME_PAGE_PATH : LOGIN_PAGE_PATH)
}

void bootstrap()
