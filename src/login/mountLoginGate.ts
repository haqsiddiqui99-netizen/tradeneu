import './loginGate.css'
import { HOME_PAGE_PATH } from '../appPaths'
import { fetchAuthServerStatus, loginUser, registerUser } from '../auth/authApi'
import { mirrorServerUser } from '../auth/authSession'
import { writeDisplayName } from '../home/dashboardUserPrefs'
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
    <div class="sx-login__mesh" aria-hidden="true"></div>
    <div class="sx-login__noise" aria-hidden="true"></div>
    <div class="sx-login__orb sx-login__orb--a" aria-hidden="true"></div>
    <div class="sx-login__orb sx-login__orb--b" aria-hidden="true"></div>
    <div class="sx-login__orb sx-login__orb--c" aria-hidden="true"></div>

    <div class="sx-login__toast" id="sx-login-toast" hidden role="alertdialog" aria-modal="true" aria-labelledby="sx-login-toast-title">
      <div class="sx-login__toast-backdrop" data-sx-toast-close aria-hidden="true"></div>
      <div class="sx-login__toast-panel">
        <div class="sx-login__toast-icon" aria-hidden="true">!</div>
        <h2 class="sx-login__toast-title" id="sx-login-toast-title">Something went wrong</h2>
        <p class="sx-login__toast-msg" id="sx-login-toast-msg"></p>
        <button type="button" class="sx-login__toast-btn" id="sx-login-toast-ok">OK</button>
      </div>
    </div>

    <form class="sx-login__panel" id="sx-login-form">
      <div class="sx-login__brand" id="sx-login-title">TRADENEU</div>
      <p class="sx-login__signup">
        <span data-sx-login-prompt>First time here?</span>
        <button type="button" class="sx-login__link" id="sx-login-signup">Create account</button>
      </p>
      <p class="sx-login__hint" id="sx-login-offline-hint" hidden></p>

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
        <label class="sx-login__label" for="sx-login-mobile">Mobile number</label>
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
            <input class="sx-login__input" id="sx-login-mobile" name="mobile" type="tel" autocomplete="tel-national" placeholder="10-digit mobile" inputmode="numeric" />
          </div>
        </div>
      </div>

      <div class="sx-login__field">
        <label class="sx-login__label" for="sx-login-pass">Password</label>
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
          <input class="sx-login__input sx-login__input--inset" id="sx-login-pass2" name="passwordConfirm" type="password" autocomplete="new-password" placeholder="Re-enter password" minlength="8" />
        </div>
      </div>

      <div class="sx-login__forgot-wrap sx-login__field--signin-only">
        <button type="button" class="sx-login__link" id="sx-login-forgot">Forgot your password?</button>
      </div>

      <button type="submit" class="sx-login__submit" id="sx-login-submit">Sign in <span class="sx-login__submit-arrow" aria-hidden="true">→</span></button>
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
  const submitBtn = wrap.querySelector('#sx-login-submit') as HTMLButtonElement
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
    if (signupPrompt) {
      signupPrompt.textContent = signupMode ? 'Already have an account?' : 'First time here?'
    }
    signupBtn.textContent = signupMode ? 'Sign in' : 'Create account'
    submitBtn.innerHTML = signupMode
      ? 'Create account <span class="sx-login__submit-arrow" aria-hidden="true">→</span>'
      : 'Sign in <span class="sx-login__submit-arrow" aria-hidden="true">→</span>'
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
    showError('Terms of Service — replace with your legal URL when publishing.', 'Terms of Service')
  })
  privacy.addEventListener('click', () => {
    showError('Privacy Policy — replace with your legal URL when publishing.', 'Privacy Policy')
  })

  syncSignupMode()

  void fetchAuthServerStatus().then((status) => {
    if (!offlineHintEl) return
    if (status.online && status.localAuth) {
      offlineHintEl.hidden = true
      return
    }
    offlineHintEl.hidden = false
    if (status.reason === 'outdated_api') {
      offlineHintEl.textContent =
        'Account API is outdated. Stop the old server on port 3001, then run npm run dev and try again.'
    } else {
      offlineHintEl.textContent =
        'Account server is offline. Run npm run dev (starts API on port 3001) before creating an account.'
    }
  })
}
