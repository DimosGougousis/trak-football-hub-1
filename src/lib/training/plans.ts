import type { Json, Tables } from '@/integrations/supabase/types'
import { blankDrill, cleanDrill, type DrillDraft } from './sessions'

/* TRAK-295 (Training 2/5, spec TRAK-293): a training's plan, kept apart from the screens. A practice carries what a
   drill does, plus where it came from. The plan is saved whole by save_training_plan(); its limits are the
   database's (training_plan_practices), so change both together. */

export const PLAN_MAX = 12

/** Write my own, for one training. */
export const planPath = (eventId: string) => `/coach/training/${eventId}/plan`

export type PracticeSource = 'own' | 'drill' | 'library'
export type Practice = DrillDraft & {
  source: PracticeSource
  drill_id: string | null
  library_session: string | null
  /** Written here and ticked "Save to My drills": the save makes it one of the coach's drills too. */
  saveToDrills: boolean
}

/** A new practice to write: "Save to My drills" starts ticked (mockup board 3A). */
export const blankPractice = (): Practice => ({
  ...blankDrill(), source: 'own', drill_id: null, library_session: null, saveToDrills: true,
})

export type SavedPractice = Pick<Tables<'training_plan_practices'>, 'position' | 'name' | 'minutes' | 'how' | 'tell' | 'area'
  | 'numbers' | 'direction' | 'targets' | 'conditions' | 'source' | 'drill_id' | 'library_session'>

/** The saved practices, in order, ready to change. One already saved is never saved to My drills again. */
export function fromSaved(rows: SavedPractice[]): Practice[] {
  return [...rows].sort((a, b) => a.position - b.position).map(({ position: _p, source, ...row }) => ({
    ...row, source: source as PracticeSource, saveToDrills: false,
  }))
}

/** What save_training_plan() takes: the practices in order, trimmed. */
export function toSave(practices: Practice[]): Json {
  return practices.map(({ saveToDrills, source, drill_id, library_session, ...draft }) => ({
    ...cleanDrill(draft), source, drill_id, library_session, save_to_drills: source === 'own' && saveToDrills,
  }))
}

/** The tag beside a practice. Written here and ticked for My drills, it is the coach's drill once saved. */
export function sourceLabel(practice: Pick<Practice, 'source' | 'saveToDrills'>): string {
  if (practice.source === 'library') return 'Library'
  return practice.source === 'drill' || practice.saveToDrills ? 'Your drill' : 'Written here'
}

export const plannedMinutes = (practices: Pick<Practice, 'minutes'>[]) => practices.reduce((sum, p) => sum + p.minutes, 0)

/** "40 of 90 min planned" and what's left, or just "40 min planned" when the training has no length. */
export function minutesLine(planned: number, length: number | null): { planned: string; left: string | null } {
  if (!length) return { planned: `${planned} min planned`, left: null }
  const left = length - planned
  return {
    planned: `${planned} of ${length} min planned`,
    left: left > 0 ? `${left} min left` : left < 0 ? `${-left} min over` : 'Fills the session',
  }
}

/** The list with one practice moved up (-1) or down (+1); unchanged at either end. */
export function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

/* "How do you want to plan it?" remembers the coach's last way, on this device ("You used this last time"). Copy a
   past session is Training 4/5; Build it with Trak is parked (TRAK-293). */

export type PlanWay = 'write'
const wayKey = (userId: string) => `trak:training:plan-way:${userId}`

export function lastPlanWay(userId: string | undefined): PlanWay | null {
  if (!userId) return null
  try {
    return localStorage.getItem(wayKey(userId)) === 'write' ? 'write' : null
  } catch {
    return null
  }
}

export function rememberPlanWay(userId: string | undefined, way: PlanWay) {
  if (!userId) return
  try {
    localStorage.setItem(wayKey(userId), way)
  } catch {
    // Private windows can refuse storage; the sheet then just doesn't say which way was last.
  }
}
