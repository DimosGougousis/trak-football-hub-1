/**
 * TRAK-138 (J8.15): after the event, the coach takes the register and it
 * becomes the completed session (public.take_event_register). These are what
 * the screen shows before the coach taps anything; the database repeats every
 * rule.
 *
 * Everyone counts as coming unless their family said "can't make it" (J8.14),
 * like a school register. A child who can't be recorded (consent not active)
 * is never pre-ticked: Coach OS's register came ticked for a player who had
 * declined. Don't do that.
 */

/** One current squad player, as the J4 screens already load them. */
export interface RegisterPlayer {
  /** squad_players.id: what the register saves. */
  id: string
  name: string
  /** Consent confirmed now: only these can be marked present (G1). */
  ready: boolean
  /** Why not ready, for the note under the list. */
  waitReason?: string | null
}

export interface RegisterStart {
  /** Ticked when the register opens. */
  present: Set<string>
  /** Reported "can't make it" by their family, in squad order. */
  absentByFamily: string[]
  /** Never tickable, and why. */
  cannotRecord: { id: string; reason: string }[]
}

/** The register as it opens: everyone ready, minus the family-reported absences. */
export function registerStart(squad: RegisterPlayer[], absentSquadPlayerIds: Iterable<string>): RegisterStart {
  const absent = new Set(absentSquadPlayerIds)
  const present = new Set<string>()
  const absentByFamily: string[] = []
  const cannotRecord: { id: string; reason: string }[] = []
  for (const player of squad) {
    if (!player.ready) cannotRecord.push({ id: player.id, reason: player.waitReason ?? 'Not ready to record' })
    else if (absent.has(player.id)) absentByFamily.push(player.id)
    else present.add(player.id)
  }
  return { present, absentByFamily, cannotRecord }
}

/** The event fields the rule reads (coach_calendar_events). */
export interface RegisterEvent {
  event_type: string
  published: boolean
  status?: string | null
  event_date?: string | null
  start_time?: string | null
  starts_at: string
}

/**
 * When the event starts, as an instant. The database sets starts_at from
 * event_date + start_time on the academy's own clock (TRAK-175: Dubai, or
 * Athens with its clock changes), so the stored instant is the start.
 */
function startsAt(event: RegisterEvent): number {
  return Date.parse(event.starts_at)
}

/** Whether the event has started on the academy's clock: a register or match log can be taken. */
export function hasStarted(event: RegisterEvent, now: Date = new Date()): boolean {
  return startsAt(event) <= now.getTime()
}

/** Why this event has no register now, or null: the same words take_event_register() uses. */
export function registerProblem(event: RegisterEvent, now: Date = new Date()): string | null {
  if (!event.published) return 'Only a published event has a register'
  if (event.status === 'cancelled') return 'This event was cancelled, so it has no register'
  if (event.event_type !== 'training' && event.event_type !== 'other') {
    return 'A match is recorded in the match log, with its score and minutes'
  }
  if (!hasStarted(event, now)) return 'The register opens once the event has started'
  return null
}

/** A database refusal names squad rows by id; the coach knows names (as TRAK-151). */
export function refusalWithNames(message: string, names: Map<string, string>): string {
  let text = message
  // "about player <id>" reads "about Cal Moss".
  for (const [id, name] of names) text = text.split(`player ${id}`).join(name).split(id).join(name)
  return text
}
