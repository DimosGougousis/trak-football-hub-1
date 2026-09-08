// Password rules must mirror the Supabase Auth policy for this project.
// The server requires a lowercase letter, an uppercase letter, a digit and a
// symbol; validating only length client-side meant users were rejected by
// Supabase with a raw error that dumps the full character sets, e.g.
//   "Password should contain at least one character of each:
//    abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$…"
// Keep these in sync if the Auth policy changes.

export const PASSWORD_MIN = 8

/** Shown in placeholders and helper text so the rule is visible before submit. */
export const PASSWORD_HINT = 'Password (8+ chars, upper, lower, number, symbol)'

const SYMBOLS = "!@#$%^&*()_+\\-=\\[\\]{};':\"|<>?,./`~"

/** Returns a human-readable error, or null when the password is acceptable. */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters`
  }
  const missing: string[] = []
  if (!/[a-z]/.test(password)) missing.push('a lowercase letter')
  if (!/[A-Z]/.test(password)) missing.push('an uppercase letter')
  if (!/[0-9]/.test(password)) missing.push('a number')
  if (!new RegExp(`[${SYMBOLS}]`).test(password)) missing.push('a symbol (e.g. !)')

  if (missing.length === 0) return null
  if (missing.length === 1) return `Password needs ${missing[0]}`
  return `Password needs ${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
}
