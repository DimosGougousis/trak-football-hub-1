/**
 * TRAK-180 (J4): the last data a screen showed, so switching tabs back to it
 * paints that at once while its reads refresh it behind, instead of starting
 * from "Loading…" (or worse, an empty state) on every visit.
 *
 * Held in memory only: never on the device, gone on reload or sign-out. Kept
 * per account, so a different account can never be shown another's squad.
 */
const memory = new Map<string, unknown>()

const key = (screen: string, userId: string) => `${screen}\u0000${userId}`

/** What `screen` last showed this account, or undefined on a first visit. */
export function remembered<T>(screen: string, userId: string | null | undefined): T | undefined {
  return userId ? memory.get(key(screen, userId)) as T | undefined : undefined
}

/** Keep what `screen` is showing this account now. */
export function remember<T>(screen: string, userId: string, value: T): void {
  memory.set(key(screen, userId), value)
}

/** Forget every screen, for every account (sign-out). */
export function forgetScreens(): void {
  memory.clear()
}
