import './app.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import { CHART_PAGE_PATH, HOME_PAGE_PATH, LOGIN_PAGE_PATH, normalizeAppPath } from './appPaths'
import { mountDashboardApp } from './home/mountDashboardApp'
import { hasLoginSession, mountLoginGate } from './login/mountLoginGate'

const root = document.querySelector('#root') as HTMLElement

const pathname = window.location.pathname.replace(/\/$/, '') || '/'
const path = normalizeAppPath(window.location.pathname)

if (
  (path === LOGIN_PAGE_PATH || path === HOME_PAGE_PATH || path === CHART_PAGE_PATH) &&
  pathname !== path
) {
  window.location.replace(path + window.location.search + window.location.hash)
} else if (path === LOGIN_PAGE_PATH) {
  mountLoginGate(root, () => {
    window.location.assign(HOME_PAGE_PATH)
  })
} else if (path === HOME_PAGE_PATH) {
  if (!hasLoginSession()) {
    window.location.replace(LOGIN_PAGE_PATH)
  } else {
    mountDashboardApp(root)
  }
} else if (path === CHART_PAGE_PATH) {
  if (!hasLoginSession()) {
    window.location.replace(LOGIN_PAGE_PATH)
  } else {
    mountDashboardApp(root)
  }
} else if (path === '/') {
  window.location.replace(hasLoginSession() ? HOME_PAGE_PATH : LOGIN_PAGE_PATH)
} else {
  window.location.replace(hasLoginSession() ? HOME_PAGE_PATH : LOGIN_PAGE_PATH)
}
