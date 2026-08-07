import { parseAdminEmails } from './adminAccess.mjs'
import { authStorageStatus, getUserByEmail, saveUser } from './userPersistence.mjs'
import {
  createPasswordCreds,
  newUserId,
  normalizeEmail,
  verifyPassword,
} from './userStore.mjs'

/**
 * Create missing local accounts for emails listed in ADMIN_EMAILS when
 * ADMIN_BOOTSTRAP_PASSWORD is set (Railway / first deploy).
 * Skips emails that already exist. Never overwrites existing passwords.
 */
export async function bootstrapAdminUsers(dataDir) {
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim()
  if (!password || password.length < 8) return

  const storage = authStorageStatus()
  if (!storage.ready) {
    console.warn('[auth] Admin bootstrap skipped — account storage not ready')
    return
  }

  const emails = parseAdminEmails()
  if (!emails.length) {
    console.warn('[auth] ADMIN_BOOTSTRAP_PASSWORD is set but ADMIN_EMAILS is empty — skip admin bootstrap')
    return
  }

  const name = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || 'Admin'
  const mobileRaw = String(process.env.ADMIN_BOOTSTRAP_MOBILE || '1000000000').replace(/\D/g, '')
  const mobile = mobileRaw.length >= 10 ? mobileRaw : '1000000000'
  const country = process.env.ADMIN_BOOTSTRAP_COUNTRY?.trim().slice(0, 64) || ''
  const forceReset = process.env.ADMIN_BOOTSTRAP_RESET?.trim() === '1'

  for (const email of emails) {
    const normalized = normalizeEmail(email)
    const existing = await getUserByEmail(dataDir, normalized)
    if (existing && !forceReset) {
      if (!verifyPassword(password, existing.passwordSalt, existing.passwordHash)) {
        console.warn(
          `[auth] Admin bootstrap: ${normalized} already exists with a different password — sign in or set ADMIN_BOOTSTRAP_RESET=1 once to reset`,
        )
      }
      continue
    }

    const { passwordHash, passwordSalt } = createPasswordCreds(password)
    const now = Date.now()
    const user = existing
      ? {
          ...existing,
          passwordHash,
          passwordSalt,
          name: existing.name || name,
          lastLoginAt: now,
        }
      : {
          id: newUserId(),
          name,
          email: normalized,
          mobile,
          country,
          passwordHash,
          passwordSalt,
          createdAt: now,
          lastLoginAt: now,
        }

    await saveUser(dataDir, user)
    console.log(`[auth] Bootstrapped admin account: ${normalized}${existing ? ' (password reset)' : ''}`)
  }
}
