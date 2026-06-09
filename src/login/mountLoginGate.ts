import './loginGate.css'
import { HOME_PAGE_PATH } from '../appPaths'

const STORAGE_KEY = 'suplexity-auth'

export function clearLoginSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* noop */
  }
}

/** Official-style multicolor “G” (24×24), widely used for Sign in with Google. */
const googleIcon = `<svg class="sx-login__google-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`

const lockIcon = `<svg class="sx-login__field-ico" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M7 11V8a5 5 0 0110 0v3"/><rect x="5" y="11" width="14" height="10" rx="2"/></svg>`

const eyeIcon = `<svg class="sx-login__eye-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`

export function hasLoginSession(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function mountLoginGate(root: HTMLElement, onEnter?: () => void): void {
  root.replaceChildren()

  const wrap = document.createElement('div')
  wrap.className = 'sx-login'
  wrap.setAttribute('role', 'dialog')
  wrap.setAttribute('aria-modal', 'true')
  wrap.setAttribute('aria-labelledby', 'sx-login-title')
  wrap.innerHTML = `
    <div class="sx-login__mesh" aria-hidden="true"></div>
    <div class="sx-login__noise" aria-hidden="true"></div>
    <div class="sx-login__orb sx-login__orb--a" aria-hidden="true"></div>
    <div class="sx-login__orb sx-login__orb--b" aria-hidden="true"></div>
    <div class="sx-login__orb sx-login__orb--c" aria-hidden="true"></div>
    <form class="sx-login__panel" id="sx-login-form">
      <div class="sx-login__brand" id="sx-login-title">SUPLEXITY</div>
      <p class="sx-login__signup">
        First time here?
        <button type="button" class="sx-login__link" id="sx-login-signup">Sign up for free</button>
      </p>
      <button type="button" class="sx-login__google" id="sx-login-google">
        ${googleIcon}
        <span>Sign in with Google</span>
      </button>
      <div class="sx-login__or" role="separator"><span>Or</span></div>
      <div class="sx-login__field">
        <label class="sr-only" for="sx-login-email">Email</label>
        <div class="sx-login__input-wrap">
          <span class="sx-login__input-prefix" aria-hidden="true">@</span>
          <input class="sx-login__input sx-login__input--inset" id="sx-login-email" name="email" type="text" autocomplete="username" placeholder="Email" />
        </div>
      </div>
      <div class="sx-login__field">
        <label class="sr-only" for="sx-login-pass">Password</label>
        <div class="sx-login__input-wrap">
          <span class="sx-login__input-prefix sx-login__input-prefix--ico" aria-hidden="true">${lockIcon}</span>
          <input class="sx-login__input sx-login__input--inset" id="sx-login-pass" name="password" type="password" autocomplete="current-password" placeholder="Password" />
          <button type="button" class="sx-login__eye" id="sx-login-eye" title="Show password" aria-label="Show password">${eyeIcon}</button>
        </div>
      </div>
      <div class="sx-login__forgot-wrap">
        <button type="button" class="sx-login__link" id="sx-login-forgot">Forgot your password?</button>
      </div>
      <button type="submit" class="sx-login__submit">Sign in <span class="sx-login__submit-arrow" aria-hidden="true">→</span></button>
      <p class="sx-login__legal">
        By using our services you agree to our
        <button type="button" class="sx-login__link sx-login__link--inline" id="sx-login-terms">Terms of Service</button>
        and
        <button type="button" class="sx-login__link sx-login__link--inline" id="sx-login-privacy">Privacy Policy</button>.
      </p>
    </form>
  `

  root.appendChild(wrap)

  const form = wrap.querySelector('#sx-login-form') as HTMLFormElement
  const signup = wrap.querySelector('#sx-login-signup') as HTMLButtonElement
  const googleBtn = wrap.querySelector('#sx-login-google') as HTMLButtonElement
  const forgot = wrap.querySelector('#sx-login-forgot') as HTMLButtonElement
  const passInput = wrap.querySelector('#sx-login-pass') as HTMLInputElement
  const eye = wrap.querySelector('#sx-login-eye') as HTMLButtonElement
  const terms = wrap.querySelector('#sx-login-terms') as HTMLButtonElement
  const privacy = wrap.querySelector('#sx-login-privacy') as HTMLButtonElement

  const commit = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* private mode */
    }
    if (onEnter) onEnter()
    else window.location.assign(HOME_PAGE_PATH)
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    commit()
  })
  signup.addEventListener('click', () => commit())
  googleBtn.addEventListener('click', () => commit())

  let eyeShowing = false
  eye.addEventListener('click', () => {
    eyeShowing = !eyeShowing
    passInput.type = eyeShowing ? 'text' : 'password'
    eye.setAttribute('aria-label', eyeShowing ? 'Hide password' : 'Show password')
    eye.setAttribute('title', eyeShowing ? 'Hide password' : 'Show password')
  })

  forgot.addEventListener('click', () => {
    window.alert('Password reset — wire your email provider or auth API when ready.')
  })
  terms.addEventListener('click', () => {
    window.alert('Terms of Service — replace with your legal URL or page.')
  })
  privacy.addEventListener('click', () => {
    window.alert('Privacy Policy — replace with your legal URL or page.')
  })
}
