import type { Tables } from '@/integrations/supabase/types'
import type { Format } from './formations'
import type { Expectation, PlayerPlans, Role } from './lineup'

/* TRAK-284 (Games 2/8): the plan's first step, opponent and goals, as the coach types it and as the database keeps
   it (game_plans). Only the coach ever reads it. TRAK-285: the second step adds the format, the formation and the
   line-up (game_plan_players). */

export type Strength = 'weaker' | 'similar' | 'stronger'
export type KeyPlayer = { number: string; position: string; note: string }
export type Goal = { title: string; looksLike: string }
export type PlanForm = {
  strength: Strength | null; theirFormation: string | null; keyPlayers: KeyPlayer[]; scouting: string; goals: Goal[]
  format: Format; formation: string | null; players: PlayerPlans
}
type SavedPlan = Pick<Tables<'game_plans'>, 'strength' | 'their_formation' | 'key_players' | 'scouting' | 'goals' | 'format' | 'formation'>
type SavedPlayer = Pick<Tables<'game_plan_players'>, 'squad_player_id' | 'role' | 'slot' | 'job' | 'note' | 'context' | 'expectation'>

export const MAX_GOALS = 3
export const MAX_KEY_PLAYERS = 11
/** The database's limits (20261028100000_game_plans.sql), so typing never runs past them. */
export const LIMITS = { position: 40, note: 300, scouting: 2000, title: 80, looksLike: 300 }

export const STRENGTHS: { value: Strength; label: string; description: string }[] = [
  { value: 'weaker', label: 'Weaker', description: 'Below our level. We expect to have the ball.' },
  { value: 'similar', label: 'Similar', description: 'Our level. It could go either way.' },
  { value: 'stronger', label: 'Stronger', description: 'Above our level. We expect to defend more.' },
]

export const emptyGoal = (): Goal => ({ title: '', looksLike: '' })
export const emptyKeyPlayer = (): KeyPlayer => ({ number: '', position: '', note: '' })

/** A saved plan as the form shows it. No plan yet is an empty form with one goal to fill, 11 a side. */
export function planToForm(row: SavedPlan | null, saved: SavedPlayer[] = []): PlanForm {
  const players = (Array.isArray(row?.key_players) ? row.key_players : []) as { number: number | null; position: string; note: string }[]
  const goals = (Array.isArray(row?.goals) ? row.goals : []) as { title: string; looks_like: string }[]
  return {
    strength: (row?.strength ?? null) as Strength | null,
    theirFormation: row?.their_formation ?? null,
    keyPlayers: players.map(p => ({ number: p.number == null ? '' : String(p.number), position: p.position, note: p.note })),
    scouting: row?.scouting ?? '',
    goals: goals.length ? goals.map(g => ({ title: g.title, looksLike: g.looks_like })) : [emptyGoal()],
    format: (row?.format ?? 11) as Format,
    formation: row?.formation ?? null,
    players: Object.fromEntries(saved.map(p => [p.squad_player_id, {
      role: p.role as Role, slot: p.slot, job: p.job, note: p.note, context: p.context, expectation: p.expectation as Expectation,
    }])),
  }
}

/** Why a typed shirt number can't be saved. Blank means it isn't known. */
export function numberProblem(text: string): string | null {
  return text === '' || (/^\d{1,2}$/.test(text) && Number(text) >= 1) ? null : 'From 1 to 99'
}

/** What Save draft writes to game_plans: rows left empty are dropped and text is trimmed. Only when no shirt number
 *  has a problem. The line-up goes to game_plan_players (`rowsToSave`). */
export function formToPlan(form: PlanForm) {
  return {
    strength: form.strength,
    their_formation: form.theirFormation,
    key_players: form.keyPlayers
      .map(p => ({ number: p.number === '' ? null : Number(p.number), position: p.position.trim(), note: p.note.trim() }))
      .filter(p => p.number !== null || p.position || p.note),
    scouting: form.scouting.trim(),
    goals: form.goals.map(g => ({ title: g.title.trim(), looks_like: g.looksLike.trim() })).filter(g => g.title || g.looks_like),
    format: form.format,
    formation: form.formation,
  }
}
