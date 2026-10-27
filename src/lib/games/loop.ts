/* TRAK-283 (Games 1/8): where a match is in its loop (TRAK-282), from the event alone. The plan (TRAK-284 to 287)
   and the evaluation (TRAK-288, 289) add their own states. The clock is an instant (now, starts_at, ends_at), so
   the device's time zone never matters: the database sets both instants on the academy's clock (TRAK-175). */

export type GameEvent = { id: string; published: boolean; starts_at: string; ends_at: string | null }
export type GameState = 'logistics' | 'plan' | 'locked' | 'fullTime'
export type GameTab = 'logistics' | 'plan' | 'evaluation'

/** The loop as the stepper draws it (TRAK-282). */
export const LOOP_STEPS = ['Logistics', 'Plan', 'Shared', 'Kick-off', 'Evaluation', 'Published'] as const

/** Each state's badge, its place on the loop and the one next action, if any. */
export const STATE: Record<GameState, {
  label: string; tone: 'neutral' | 'info' | 'warning'; step: number; action?: { label: string; tab: GameTab }
}> = {
  // Publishing the match in Schedule is "share the logistics" (TRAK-282, step 1).
  logistics: { label: 'Logistics not shared', tone: 'neutral', step: 0, action: { label: 'Share the logistics', tab: 'logistics' } },
  plan: { label: 'Plan not written', tone: 'warning', step: 1, action: { label: 'Write the plan', tab: 'plan' } },
  locked: { label: 'Locked at kick-off', tone: 'info', step: 3 },
  // ponytail: no action until the evaluation exists (TRAK-288), which also decides which past matches still need one.
  fullTime: { label: 'Full time', tone: 'neutral', step: 4 },
}

/** Full time: the event's end, or 90 minutes after kick-off when it has none, as the database reads it (event_wall_end). */
export function fullTime(game: GameEvent): number {
  return game.ends_at ? Date.parse(game.ends_at) : Date.parse(game.starts_at) + 90 * 60_000
}

export function gameState(game: GameEvent, now: number): GameState {
  if (!game.published) return 'logistics' // a draft can still be published after its time (TRAK-230)
  if (now < Date.parse(game.starts_at)) return 'plan'
  return now < fullTime(game) ? 'locked' : 'fullTime'
}

/** Upcoming matches soonest first, then past ones newest first, as the mockup orders them. The next game is the
 *  soonest that hasn't kicked off. */
export function orderGames<T extends GameEvent>(games: T[], now: number): { next: T | null; games: T[] } {
  const kickOff = (game: T) => Date.parse(game.starts_at)
  const upcoming = games.filter(game => kickOff(game) > now).sort((a, b) => kickOff(a) - kickOff(b))
  const past = games.filter(game => kickOff(game) <= now).sort((a, b) => kickOff(b) - kickOff(a))
  return { next: upcoming[0] ?? null, games: [...upcoming, ...past] }
}
