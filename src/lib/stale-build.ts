/**
 * TRAK-192: a tab left open across a deploy asks for a lazy screen file from
 * the old release. It's gone, and vercel.json rewrites every path to
 * index.html, so the browser gets HTML for a script and refuses it. Reloading
 * fetches the new release. Once per page, and not again within 30 s of the
 * last reload, so a release that's really broken never loops.
 */

const KEY = 'trak:stale-build-reload'
const WINDOW_MS = 30_000

// What each browser says when a lazy screen's file can't be loaded.
const MESSAGES = [
  /is not a valid JavaScript MIME type/i, // Safari, file answered with HTML
  /Importing a module script failed/i, // Safari
  /Failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /Unable to preload CSS/i, // Vite's own preload of the screen's styles
]

export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return MESSAGES.some(pattern => pattern.test(message))
}

/** Indirect so tests can count reloads; jsdom's location can't be stubbed. */
export const page = { reload: () => window.location.reload() }

let reloading = false

/**
 * Reloads for the new release, at most once per page and not within 30 s of
 * the last time. True when a reload is on its way, false when it was refused
 * (too soon, or no session storage to guard a loop with).
 */
export function reloadForNewBuild(now = Date.now()): boolean {
  if (reloading) return true
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0)
    if (last && now - last < WINDOW_MS) return false
    sessionStorage.setItem(KEY, String(now))
  } catch {
    return false
  }
  reloading = true
  page.reload()
  return true
}

/** Tests only: a fresh page. */
export function forgetStaleBuildReload() {
  reloading = false
}
