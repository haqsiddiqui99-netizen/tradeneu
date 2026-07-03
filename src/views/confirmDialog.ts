import './confirmDialog.css'

export type ConfirmDialogOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Style confirm as destructive (delete, etc.). */
  danger?: boolean
}

let dialogEl: HTMLDialogElement | null = null
let titleEl: HTMLElement | null = null
let messageEl: HTMLElement | null = null
let btnConfirm: HTMLButtonElement | null = null
let btnCancel: HTMLButtonElement | null = null
let settle: ((ok: boolean) => void) | null = null

function ensureDialog(): HTMLDialogElement {
  if (dialogEl) return dialogEl

  dialogEl = document.createElement('dialog')
  dialogEl.className = 'sx-confirm-dlg'
  dialogEl.setAttribute('aria-labelledby', 'sx-confirm-title')
  dialogEl.innerHTML = `
    <div class="sx-confirm-dlg__panel" role="document">
      <h2 class="sx-confirm-dlg__title" id="sx-confirm-title"></h2>
      <p class="sx-confirm-dlg__message" id="sx-confirm-message"></p>
      <div class="sx-confirm-dlg__actions">
        <button type="button" class="sx-confirm-dlg__btn sx-confirm-dlg__btn--cancel" data-sx-confirm-cancel>Cancel</button>
        <button type="button" class="sx-confirm-dlg__btn sx-confirm-dlg__btn--confirm" data-sx-confirm-ok>OK</button>
      </div>
    </div>
  `
  document.body.appendChild(dialogEl)

  titleEl = dialogEl.querySelector('#sx-confirm-title')
  messageEl = dialogEl.querySelector('#sx-confirm-message')
  btnConfirm = dialogEl.querySelector('[data-sx-confirm-ok]')
  btnCancel = dialogEl.querySelector('[data-sx-confirm-cancel]')

  const finish = (ok: boolean) => {
    if (!settle) return
    const fn = settle
    settle = null
    dialogEl?.close()
    fn(ok)
  }

  btnConfirm?.addEventListener('click', () => finish(true))
  btnCancel?.addEventListener('click', () => finish(false))
  dialogEl.addEventListener('cancel', (e) => {
    e.preventDefault()
    finish(false)
  })
  dialogEl.addEventListener('close', () => {
    if (settle) finish(false)
  })

  return dialogEl
}

/** In-app confirm — replaces browser `window.confirm` for dashboard actions. */
export function confirmDialog(opts: ConfirmDialogOptions): Promise<boolean> {
  const dlg = ensureDialog()
  if (settle) {
    settle(false)
    settle = null
  }

  if (titleEl) titleEl.textContent = opts.title?.trim() || 'Confirm'
  if (messageEl) messageEl.textContent = opts.message
  if (btnConfirm) {
    btnConfirm.textContent = opts.confirmLabel?.trim() || 'OK'
    btnConfirm.classList.toggle('sx-confirm-dlg__btn--danger', Boolean(opts.danger))
  }
  if (btnCancel) btnCancel.textContent = opts.cancelLabel?.trim() || 'Cancel'

  return new Promise<boolean>((resolve) => {
    settle = resolve
    dlg.showModal()
    requestAnimationFrame(() => btnCancel?.focus())
  })
}
