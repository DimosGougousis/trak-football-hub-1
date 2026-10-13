/**
 * TRAK-168: where to go after signing in, when someone signed out opened a
 * shared event link. Only an event link is ever remembered, so this can't be
 * used to send people to another page or site. Kept for this tab only.
 */
const KEY = 'trak:return-to'
const EVENT_PATH = /^\/event\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function rememberReturnTo(path: string) {
  try {
    if (EVENT_PATH.test(path)) sessionStorage.setItem(KEY, path)
    else sessionStorage.removeItem(KEY)
  } catch { /* storage unavailable: they land on Home instead */ }
}

/** The remembered event link, once; null when there is none. */
export function takeReturnTo(): string | null {
  try {
    const path = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return path && EVENT_PATH.test(path) ? path : null
  } catch { return null }
}
