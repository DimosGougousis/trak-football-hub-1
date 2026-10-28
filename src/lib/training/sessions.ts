/* TRAK-294 (Training 1/5, spec TRAK-293): Training home's two lists and My drills' rules, kept apart from the screens.
   The clock is an instant (now, starts_at, ends_at), so the phone's time zone never moves a training between lists:
   the database sets both instants on the academy's clock (TRAK-175). */

export type TrainingEvent = { id: string; starts_at: string; ends_at: string | null; start_time: string | null }

const MINUTE = 60_000
export const WEEK = 7 * 24 * 60 * MINUTE

/** When a training is over: its end, or 90 minutes after a timed start; one with no time lasts its whole day
 *  (as TRAK-230 locks it). */
export function trainingEnd(event: TrainingEvent): number {
  const start = Date.parse(event.starts_at)
  if (event.ends_at) return Date.parse(event.ends_at)
  return event.start_time ? start + 90 * MINUTE : start + 24 * 60 * MINUTE
}

/** How long a training is, in minutes, when it has a start and an end time. */
export function trainingMinutes(event: TrainingEvent): number | null {
  if (!event.start_time || !event.ends_at) return null
  const minutes = Math.round((Date.parse(event.ends_at) - Date.parse(event.starts_at)) / MINUTE)
  return minutes > 0 ? minutes : null
}

/** Coming up: every training not over yet, today's included, soonest first. Last week: those over in the past seven
 *  days, newest first. */
export function splitTrainings<T extends TrainingEvent>(events: T[], now: number): { comingUp: T[]; lastWeek: T[] } {
  const start = (event: T) => Date.parse(event.starts_at)
  const comingUp = events.filter(event => trainingEnd(event) > now).sort((a, b) => start(a) - start(b))
  const lastWeek = events.filter(event => trainingEnd(event) <= now && trainingEnd(event) > now - WEEK)
    .sort((a, b) => start(b) - start(a))
  return { comingUp, lastWeek }
}

/* My drills (coach_drills). The limits are the database's checks; change both together. */

export const DRILL_MINUTES = [10, 15, 20, 25, 30] as const
export const DRILL_LIMITS = { name: 80, how: 1000, tell: 500, detail: 120 } as const

/** The five details every Trak practice can carry, in the mockup's order. */
export const DRILL_DETAILS = [
  { key: 'area', label: 'Area', example: 'e.g. 20 × 30 m' },
  { key: 'numbers', label: 'Numbers', example: 'e.g. 4v4 + 2' },
  { key: 'direction', label: 'Direction', example: 'e.g. Directional, to two goals' },
  { key: 'targets', label: 'Targets', example: 'e.g. End lines' },
  { key: 'conditions', label: 'Conditions', example: 'e.g. Two touches' },
] as const

export type DrillDetail = (typeof DRILL_DETAILS)[number]['key']
export type DrillDraft = { name: string; minutes: number; how: string; tell: string } & Record<DrillDetail, string>
export type Drill = DrillDraft & { id: string; updated_at: string }

export const blankDrill = (): DrillDraft => ({
  name: '', minutes: 15, how: '', tell: '', area: '', numbers: '', direction: '', targets: '', conditions: '',
})

/** What the coach typed, ready to save: spaces trimmed at both ends. */
export function cleanDrill(draft: DrillDraft): DrillDraft {
  const out = { ...draft }
  for (const key of ['name', 'how', 'tell', ...DRILL_DETAILS.map(d => d.key)] as const) out[key] = draft[key].trim()
  return out
}

/** Why a drill (or a plan's practice) can't be saved yet, or null when it can. The name is the only thing it must
 *  have. */
export function drillProblem(draft: DrillDraft, what: 'drill' | 'practice' = 'drill'): string | null {
  const drill = cleanDrill(draft)
  if (!drill.name) return `Give the ${what} a name.`
  if (drill.name.length > DRILL_LIMITS.name) return `Keep the name to ${DRILL_LIMITS.name} characters.`
  if (drill.how.length > DRILL_LIMITS.how) return `Keep "How it works" to ${DRILL_LIMITS.how} characters.`
  if (drill.tell.length > DRILL_LIMITS.tell) return `Keep "What you'll tell them" to ${DRILL_LIMITS.tell} characters.`
  const long = DRILL_DETAILS.find(d => drill[d.key].length > DRILL_LIMITS.detail)
  return long ? `Keep ${long.label} to ${DRILL_LIMITS.detail} characters.` : null
}

/** How many of the five details a drill has. */
export const detailCount = (drill: DrillDraft) => DRILL_DETAILS.filter(d => drill[d.key].trim()).length

/** The drills whose name or "how it works" holds every word typed, in the order given. */
export function searchDrills<T extends DrillDraft>(drills: T[], query: string): T[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return drills
  return drills.filter(drill => {
    const text = `${drill.name} ${drill.how}`.toLocaleLowerCase()
    return words.every(word => text.includes(word))
  })
}
