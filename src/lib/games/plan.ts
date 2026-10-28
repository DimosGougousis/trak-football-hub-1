import type { Tables } from '@/integrations/supabase/types'

/* TRAK-284 (Games 2/8): the plan's first step, opponent and goals, as the coach types it and as the database keeps
   it (game_plans). Only the coach ever reads it. */

export type Strength = 'weaker' | 'similar' | 'stronger'
export type KeyPlayer = { number: string; position: string; note: string }
export type Goal = { title: string; looksLike: string }
export type PlanForm = { strength: Strength | null; theirFormation: string | null; keyPlayers: KeyPlayer[]; scouting: string; goals: Goal[] }
type SavedPlan = Pick<Tables<'game_plans'>, 'strength' | 'their_formation' | 'key_players' | 'scouting' | 'goals'>

export const MAX_GOALS = 3
export const MAX_KEY_PLAYERS = 11
/** The database's limits (20261028100000_game_plans.sql), so typing never runs past them. */
export const LIMITS = { position: 40, note: 300, scouting: 2000, title: 80, looksLike: 300 }

export const STRENGTHS: { value: Strength; label: string; description: string }[] = [
  { value: 'weaker', label: 'Weaker', description: 'Below our level. We expect to have the ball.' },
  { value: 'similar', label: 'Similar', description: 'Our level. It could go either way.' },
  { value: 'stronger', label: 'Stronger', description: 'Above our level. We expect to defend more.' },
]

// ponytail: 11-a-side shapes only. TRAK-285 adds the format (11, 9, 7 or 5 a side); this list then follows it.
export const FORMATIONS = ['4-4-2', '4-3-3', '4-2-3-1', '4-1-4-1', '4-4-1-1', '3-5-2', '3-4-3', '5-3-2', '5-4-1']

export const emptyGoal = (): Goal => ({ title: '', looksLike: '' })
export const emptyKeyPlayer = (): KeyPlayer => ({ number: '', position: '', note: '' })

/** A saved plan as the form shows it. No plan yet is an empty form with one goal to fill. */
export function planToForm(row: SavedPlan | null): PlanForm {
  const players = (Array.isArray(row?.key_players) ? row.key_players : []) as { number: number | null; position: string; note: string }[]
  const goals = (Array.isArray(row?.goals) ? row.goals : []) as { title: string; looks_like: string }[]
  return {
    strength: (row?.strength ?? null) as Strength | null,
    theirFormation: row?.their_formation ?? null,
    keyPlayers: players.map(p => ({ number: p.number == null ? '' : String(p.number), position: p.position, note: p.note })),
    scouting: row?.scouting ?? '',
    goals: goals.length ? goals.map(g => ({ title: g.title, looksLike: g.looks_like })) : [emptyGoal()],
  }
}

/** Why a typed shirt number can't be saved. Blank means it isn't known. */
export function numberProblem(text: string): string | null {
  return text === '' || (/^\d{1,2}$/.test(text) && Number(text) >= 1) ? null : 'From 1 to 99'
}

/** What Save draft writes: rows left empty are dropped and text is trimmed. Only when no shirt number has a problem. */
export function formToPlan(form: PlanForm) {
  return {
    strength: form.strength,
    their_formation: form.theirFormation,
    key_players: form.keyPlayers
      .map(p => ({ number: p.number === '' ? null : Number(p.number), position: p.position.trim(), note: p.note.trim() }))
      .filter(p => p.number !== null || p.position || p.note),
    scouting: form.scouting.trim(),
    goals: form.goals.map(g => ({ title: g.title.trim(), looks_like: g.looksLike.trim() })).filter(g => g.title || g.looks_like),
  }
}
