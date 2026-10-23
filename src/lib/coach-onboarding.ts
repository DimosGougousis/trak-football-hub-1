/** TRAK-262 (Imad, 22 Oct): coach Home's onboarding shows on a device's first open, once. */
const KEY = 'trak:coach-onboarded'

/** Storage unavailable counts as seen: never nag on every open. */
export function onboardingSeen(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return true }
}

export function markOnboardingSeen(): void {
  try { localStorage.setItem(KEY, '1') } catch { /* shown again next visit */ }
}
