import './loginGate.css'
import { HOME_PAGE_PATH } from '../appPaths'
import { fetchAuthServerStatus, loginUser, registerUser } from '../auth/authApi'
import { clearAllAuthSessions, getAuthUser, GUEST_AUTH_EMAIL, mirrorServerUser, setGuestLoginSession } from '../auth/authSession'
import { writeDisplayName } from '../home/dashboardUserPrefs'
import { openLegalDocModal } from '../legal/legalDocModal'
import {
  buildFullMobile,
  findDialOption,
  formatDialLabel,
  formatDialOptionLabel,
  LOGIN_DIAL_OPTIONS,
  type DialOption,
  validateLocalMobile,
} from './loginCountryCodes'

export {
  clearAllAuthSessions,
  clearLoginSession,
  hasLoginSession,
  resolveAuthSession,
  setGuestLoginSession,
} from '../auth/authSession'

const lockIcon = `<svg class="sx-login__field-ico" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M7 11V8a5 5 0 0110 0v3"/><rect x="5" y="11" width="14" height="10" rx="2"/></svg>`

const eyeIcon = `<svg class="sx-login__eye-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`

const chevronDown = `<svg class="sx-login__dial-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`

const dialMenuHtml = LOGIN_DIAL_OPTIONS.map(
  (opt, i) =>
    `<button type="button" class="sx-login__dial-option${i === 0 ? ' sx-login__dial-option--active' : ''}" role="option" data-dial="${opt.dial}" data-name="${opt.name}" aria-selected="${i === 0 ? 'true' : 'false'}">${formatDialOptionLabel(opt)}</button>`,
).join('')

export function mountLoginGate(root: HTMLElement, onEnter?: () => void): void {
  root.replaceChildren()

  let signupMode = false
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  const wrap = document.createElement('div')
  wrap.className = 'sx-login'
  wrap.setAttribute('role', 'dialog')
  wrap.setAttribute('aria-modal', 'true')
  wrap.setAttribute('aria-labelledby', 'sx-login-title')
  wrap.innerHTML = `
    <div class="sx-login__bg" aria-hidden="true"></div>

    <div class="sx-login__toast" id="sx-login-toast" hidden role="alertdialog" aria-modal="true" aria-labelledby="sx-login-toast-title">
      <div class="sx-login__toast-backdrop" data-sx-toast-close aria-hidden="true"></div>
      <div class="sx-login__toast-panel">
        <div class="sx-login__toast-icon" aria-hidden="true">!</div>
        <h2 class="sx-login__toast-title" id="sx-login-toast-title">Something went wrong</h2>
        <p class="sx-login__toast-msg" id="sx-login-toast-msg"></p>
        <button type="button" class="sx-login__toast-btn" id="sx-login-toast-ok">OK</button>
      </div>
    </div>

    <div class="sx-login__shell">
      <div class="sx-login__ai-border" aria-hidden="true">
        <div class="sx-login__ai-ring"></div>
      </div>
      <div class="sx-login__ai-glow" aria-hidden="true"></div>
      <form class="sx-login__panel" id="sx-login-form">
        <div class="sx-login__head">
          <div class="sx-login__brand" id="sx-login-title">TRADENEU</div>
          <h2 class="sx-login__heading" data-sx-login-heading>Welcome back</h2>
          <p class="sx-login__signup">
            <span data-sx-login-prompt>First time here?</span>
            <button type="button" class="sx-login__link" id="sx-login-signup">Create account</button>
          </p>
        </div>

        <p class="sx-login__hint" id="sx-login-offline-hint" hidden></p>
        <p class="sx-login__hint sx-login__hint--authed" id="sx-login-authed-hint" hidden>
          Signed in —
          <button type="button" class="sx-login__link" id="sx-login-continue">Dashboard</button>
          ·
          <button type="button" class="sx-login__link" id="sx-login-signout">Sign out</button>
        </p>

        <button type="button" class="sx-login__google" id="sx-login-google">
          <svg class="sx-login__google-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
        <div class="sx-login__divider" aria-hidden="true"><span>or</span></div>

        <div class="sx-login__fields">
          <div class="sx-login__field sx-login__field--signup-only" data-signup-only hidden>
            <label class="sx-login__label" for="sx-login-name">Full name</label>
            <div class="sx-login__input-wrap">
              <input class="sx-login__input" id="sx-login-name" name="name" type="text" autocomplete="name" placeholder="Your full name" maxlength="80" />
            </div>
          </div>

          <div class="sx-login__field">
            <label class="sx-login__label" for="sx-login-email">Email</label>
            <div class="sx-login__input-wrap">
              <span class="sx-login__input-prefix" aria-hidden="true">@</span>
              <input class="sx-login__input sx-login__input--inset" id="sx-login-email" name="email" type="email" autocomplete="username" placeholder="you@example.com" required />
            </div>
          </div>

          <div class="sx-login__field sx-login__field--signup-only" data-signup-only hidden>
            <label class="sx-login__label" for="sx-login-mobile">Mobile</label>
            <div class="sx-login__phone-row">
              <div class="sx-login__dial-picker" data-dial-picker>
                <button type="button" class="sx-login__dial-trigger" id="sx-login-dial-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="Country code">
                  <span class="sx-login__dial-trigger-code" data-dial-code-label>+91</span>
                  ${chevronDown}
                </button>
                <div class="sx-login__dial-menu" id="sx-login-dial-menu" hidden role="listbox" aria-label="Country codes">
                  ${dialMenuHtml}
                </div>
                <input type="hidden" id="sx-login-dial" name="dial" value="91" />
                <input type="hidden" id="sx-login-dial-country" name="dialCountry" value="India" />
              </div>
              <div class="sx-login__input-wrap sx-login__input-wrap--phone">
                <input class="sx-login__input" id="sx-login-mobile" name="mobile" type="tel" autocomplete="tel-national" placeholder="Mobile" inputmode="numeric" />
              </div>
            </div>
          </div>

          <div class="sx-login__field">
            <div class="sx-login__label-row">
              <label class="sx-login__label" for="sx-login-pass">Password</label>
              <button type="button" class="sx-login__link sx-login__forgot sx-login__field--signin-only" id="sx-login-forgot">Forgot Password</button>
            </div>
            <div class="sx-login__input-wrap">
              <span class="sx-login__input-prefix sx-login__input-prefix--ico" aria-hidden="true">${lockIcon}</span>
              <input class="sx-login__input sx-login__input--inset" id="sx-login-pass" name="password" type="password" autocomplete="current-password" placeholder="Password" required minlength="8" />
              <button type="button" class="sx-login__eye" id="sx-login-eye" title="Show password" aria-label="Show password">${eyeIcon}</button>
            </div>
          </div>

          <div class="sx-login__field sx-login__field--signup-only" data-signup-only hidden>
            <label class="sx-login__label" for="sx-login-pass2">Confirm password</label>
            <div class="sx-login__input-wrap">
              <span class="sx-login__input-prefix sx-login__input-prefix--ico" aria-hidden="true">${lockIcon}</span>
              <input class="sx-login__input sx-login__input--inset" id="sx-login-pass2" name="passwordConfirm" type="password" autocomplete="new-password" placeholder="Confirm password" minlength="8" />
            </div>
          </div>
        </div>

        <div class="sx-login__actions">
          <button type="submit" class="sx-login__submit" id="sx-login-submit">Sign in</button>
          <div class="sx-login__foot">
            <button type="button" class="sx-login__skip" id="sx-login-skip">Login as Guest</button>
            <p class="sx-login__legal">
              <button type="button" class="sx-login__link sx-login__link--inline" id="sx-login-terms">Terms &amp; Condition</button>
              ·
              <button type="button" class="sx-login__link sx-login__link--inline" id="sx-login-privacy">Privacy</button>
            </p>
          </div>
        </div>
      </form>
    </div>
  `

  root.appendChild(wrap)

  const form = wrap.querySelector('#sx-login-form') as HTMLFormElement
  const signupBtn = wrap.querySelector('#sx-login-signup') as HTMLButtonElement
  const signupPrompt = wrap.querySelector('[data-sx-login-prompt]') as HTMLElement
  const forgot = wrap.querySelector('#sx-login-forgot') as HTMLButtonElement
  const nameInput = wrap.querySelector('#sx-login-name') as HTMLInputElement
  const emailInput = wrap.querySelector('#sx-login-email') as HTMLInputElement
  const dialInput = wrap.querySelector('#sx-login-dial') as HTMLInputElement
  const dialCountryInput = wrap.querySelector('#sx-login-dial-country') as HTMLInputElement
  const dialTrigger = wrap.querySelector('#sx-login-dial-trigger') as HTMLButtonElement
  const dialMenu = wrap.querySelector('#sx-login-dial-menu') as HTMLElement
  const dialCodeLabel = wrap.querySelector('[data-dial-code-label]') as HTMLElement
  const dialPicker = wrap.querySelector('[data-dial-picker]') as HTMLElement
  const mobileInput = wrap.querySelector('#sx-login-mobile') as HTMLInputElement
  const passInput = wrap.querySelector('#sx-login-pass') as HTMLInputElement
  const pass2Input = wrap.querySelector('#sx-login-pass2') as HTMLInputElement
  const eye = wrap.querySelector('#sx-login-eye') as HTMLButtonElement
  const terms = wrap.querySelector('#sx-login-terms') as HTMLButtonElement
  const privacy = wrap.querySelector('#sx-login-privacy') as HTMLButtonElement
  const offlineHintEl = wrap.querySelector('#sx-login-offline-hint') as HTMLElement
  const authedHintEl = wrap.querySelector('#sx-login-authed-hint') as HTMLElement
  const continueBtn = wrap.querySelector('#sx-login-continue') as HTMLButtonElement
  const signoutBtn = wrap.querySelector('#sx-login-signout') as HTMLButtonElement
  const submitBtn = wrap.querySelector('#sx-login-submit') as HTMLButtonElement
  const skipBtn = wrap.querySelector('#sx-login-skip') as HTMLButtonElement
  const googleBtn = wrap.querySelector('#sx-login-google') as HTMLButtonElement
  const signupOnlyFields = wrap.querySelectorAll<HTMLElement>('[data-signup-only]')
  const signinOnlyEls = wrap.querySelectorAll<HTMLElement>('.sx-login__field--signin-only')
  const toastEl = wrap.querySelector('#sx-login-toast') as HTMLElement
  const toastMsgEl = wrap.querySelector('#sx-login-toast-msg') as HTMLElement
  const toastTitleEl = wrap.querySelector('#sx-login-toast-title') as HTMLElement
  const toastOkBtn = wrap.querySelector('#sx-login-toast-ok') as HTMLButtonElement

  function hideToast() {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
    toastEl.hidden = true
    wrap.classList.remove('sx-login--toast-open')
  }

  function showError(msg: string, title = 'Please check your details') {
    if (!msg) {
      hideToast()
      return
    }
    toastTitleEl.textContent = title
    toastMsgEl.textContent = msg
    toastEl.hidden = false
    wrap.classList.add('sx-login--toast-open')
    toastOkBtn.focus()
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => hideToast(), 12000)
  }

  function closeDialMenu() {
    dialMenu.hidden = true
    dialPicker.classList.remove('sx-login__dial-picker--open')
    dialTrigger.setAttribute('aria-expanded', 'false')
  }

  function openDialMenu() {
    dialMenu.hidden = false
    dialPicker.classList.add('sx-login__dial-picker--open')
    dialTrigger.setAttribute('aria-expanded', 'true')
  }

  function selectDialOption(opt: DialOption) {
    dialInput.value = opt.dial
    dialCountryInput.value = opt.name
    dialCodeLabel.textContent = formatDialLabel(opt.dial)
    mobileInput.placeholder = opt.placeholder
    dialMenu.querySelectorAll<HTMLButtonElement>('.sx-login__dial-option').forEach((btn) => {
      const active = btn.dataset.dial === opt.dial && btn.dataset.name === opt.name
      btn.classList.toggle('sx-login__dial-option--active', active)
      btn.setAttribute('aria-selected', active ? 'true' : 'false')
    })
    closeDialMenu()
  }

  function getSelectedDial(): DialOption {
    return (
      findDialOption(dialInput.value, dialCountryInput.value) ??
      LOGIN_DIAL_OPTIONS[0]!
    )
  }

  function setSubmitting(busy: boolean) {
    submitBtn.disabled = busy
    signupBtn.disabled = busy
  }

  function validateSignupForm(): string | null {
    const name = nameInput.value.trim()
    if (name.length < 2) return 'Enter your full name (at least 2 characters).'
    const email = emailInput.value.trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.'
    const mobileErr = validateLocalMobile(dialInput.value, mobileInput.value)
    if (mobileErr) return mobileErr
    const password = passInput.value
    const confirm = pass2Input.value
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (password !== confirm) return 'Passwords do not match. Please re-enter the same password.'
    return null
  }

  function validateSigninForm(): string | null {
    const email = emailInput.value.trim()
    if (!email) return 'Enter your email address.'
    if (!passInput.value) return 'Enter your password.'
    return null
  }

  function syncSignupMode() {
    form.classList.toggle('sx-login__panel--signup', signupMode)
    const heading = wrap.querySelector('[data-sx-login-heading]')
    if (heading) heading.textContent = signupMode ? 'Create your account' : 'Welcome back'
    if (signupPrompt) {
      signupPrompt.textContent = signupMode ? 'Already have an account?' : 'First time here?'
    }
    signupBtn.textContent = signupMode ? 'Sign in' : 'Create account'
    submitBtn.textContent = signupMode ? 'Create account' : 'Sign in'
    passInput.autocomplete = signupMode ? 'new-password' : 'current-password'
    passInput.placeholder = signupMode ? 'At least 8 characters' : 'Password'
    signupOnlyFields.forEach((el) => {
      el.hidden = !signupMode
    })
    signinOnlyEls.forEach((el) => {
      el.hidden = signupMode
    })
    hideToast()
  }

  const enterApp = (user: { name: string; email: string }) => {
    hideToast()
    const name = user.name?.trim()
    if (name) writeDisplayName(name)
    else {
      const localPart = user.email.split('@')[0]?.trim()
      if (localPart && localPart.length >= 2) writeDisplayName(localPart)
    }
    if (onEnter) onEnter()
    else window.location.assign(HOME_PAGE_PATH)
  }

  dialTrigger.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (dialMenu.hidden) openDialMenu()
    else closeDialMenu()
  })

  dialMenu.querySelectorAll<HTMLButtonElement>('.sx-login__dial-option').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      const dial = btn.dataset.dial ?? ''
      const name = btn.dataset.name ?? ''
      const opt = findDialOption(dial, name)
      if (opt) selectDialOption(opt)
    })
  })

  document.addEventListener('click', (e) => {
    if (!dialPicker.contains(e.target as Node)) closeDialMenu()
  })

  selectDialOption(LOGIN_DIAL_OPTIONS[0]!)

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    hideToast()

    const clientError = signupMode ? validateSignupForm() : validateSigninForm()
    if (clientError) {
      showError(clientError)
      return
    }

    setSubmitting(true)

    void (async () => {
      try {
        if (signupMode) {
          const password = passInput.value
          const selected = getSelectedDial()
          const fullMobile = buildFullMobile(dialInput.value, mobileInput.value)
          const result = await registerUser({
            name: nameInput.value.trim(),
            email: emailInput.value,
            mobile: fullMobile,
            country: selected.name,
            password,
          })
          if (!result.ok) {
            showError(result.error, 'Could not create account')
            return
          }
          mirrorServerUser(result.user, { freshAccount: true })
          enterApp(result.user)
          return
        }

        const result = await loginUser(emailInput.value, passInput.value)
        if (!result.ok) {
          showError(result.error, 'Sign in failed')
          return
        }
        mirrorServerUser(result.user)
        enterApp(result.user)
      } finally {
        setSubmitting(false)
      }
    })()
  })

  signupBtn.addEventListener('click', () => {
    signupMode = !signupMode
    syncSignupMode()
  })

  skipBtn?.addEventListener('click', () => {
    hideToast()
    setGuestLoginSession()
    enterApp({ name: 'Guest', email: GUEST_AUTH_EMAIL })
  })

  googleBtn?.addEventListener('click', () => {
    hideToast()
    window.location.assign('/api/auth/google')
  })

  let eyeShowing = false
  eye.addEventListener('click', () => {
    eyeShowing = !eyeShowing
    passInput.type = eyeShowing ? 'text' : 'password'
    if (signupMode) pass2Input.type = eyeShowing ? 'text' : 'password'
    eye.setAttribute('aria-label', eyeShowing ? 'Hide password' : 'Show password')
    eye.setAttribute('title', eyeShowing ? 'Hide password' : 'Show password')
  })

  toastOkBtn.addEventListener('click', hideToast)
  wrap.querySelectorAll('[data-sx-toast-close]').forEach((el) => {
    el.addEventListener('click', hideToast)
  })

  forgot.addEventListener('click', () => {
    showError(
      'Password reset is not available yet. Contact support or create a new account with a different email.',
      'Forgot password',
    )
  })
  terms.addEventListener('click', () => {
    openLegalDocModal('terms')
  })
  privacy.addEventListener('click', () => {
    openLegalDocModal('privacy')
  })

  if (getAuthUser() && authedHintEl) authedHintEl.hidden = false
  continueBtn?.addEventListener('click', () => {
    if (onEnter) onEnter()
    else window.location.assign(HOME_PAGE_PATH)
  })
  signoutBtn?.addEventListener('click', () => {
    void clearAllAuthSessions().then(() => {
      if (authedHintEl) authedHintEl.hidden = true
      hideToast()
    })
  })

  syncSignupMode()

  const authError = new URLSearchParams(window.location.search).get('auth_error')
  if (authError) {
    const authErrorMessages: Record<string, string> = {
      google_not_configured:
        'Google sign-in is not set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local, then restart.',
      access_denied: 'Google sign-in was cancelled.',
      invalid_state: 'Google sign-in expired. Please try again.',
      email_not_verified: 'Your Google email is not verified.',
      oauth_failed: 'Google sign-in failed. Please try again.',
    }
    showError(authErrorMessages[authError] || `Google sign-in error: ${authError}`, 'Google sign-in')
    window.history.replaceState({}, '', window.location.pathname)
  }

  void fetchAuthServerStatus().then((status) => {
    if (!offlineHintEl) return
    if (status.online && status.localAuth && status.storageReady !== false) {
      offlineHintEl.hidden = true
      return
    }
    offlineHintEl.hidden = false
    if (status.reason === 'storage' && status.storageMessage) {
      offlineHintEl.textContent = status.storageMessage
    } else if (status.reason === 'outdated_api') {
      offlineHintEl.textContent =
        'Account API is outdated. Stop the old historic API server, then run npm run dev and try again.'
    } else {
      offlineHintEl.textContent =
        'Account server is offline. Run npm run dev (starts API on port 3100) before creating an account.'
    }
  })
}
