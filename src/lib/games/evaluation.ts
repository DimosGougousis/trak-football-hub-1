import { i18n } from '@/lib/i18n'
import type { Tables } from '@/integrations/supabase/types'
import { playerPlan, type PlayerPlans } from './lineup'
import type { Review } from './reviews'

/* TRAK-288 (Games 6/8): the evaluation after full time, as the coach fills it and as save_game_evaluation keeps it
   (20261029100000_game_evaluations.sql). A draft only the coach reads, against the plan as it locked at kick-off.
   Publishing is TRAK-289. */

export type DidJob = 'yes' | 'partly' | 'not_yet'
export type Against = 'below' | 'met' | 'above'
export type PlanWorked = 'didnt' | 'partly' | 'worked'
/** TRAK-518 (Imad, 20 Nov): null until the coach answers; nothing is answered for them. */
export type Answer = { didJob: DidJob | null; against: Against | null; note: string }
/** One of our goals: who scored and who assisted, by squad row; null when not recorded (a guest). TRAK-447: `own` marks an
 *  own goal, which credits nobody (no scorer, no assist). */
export type ScoredGoal = { scorer: string | null; assist: string | null; own?: boolean }
export type EvaluationForm = {
  ourScore: number; theirScore: number; goals: ScoredGoal[]; howTheyScored: string
  /** Did the plan work, for each of the plan's goals in order; null until answered. */
  planWorked: (PlanWorked | null)[]
  /** By squad row, once the coach ticks or unticks them; until then a starter played and the bench didn't. */
  played: Record<string, boolean>
  answers: Record<string, Answer>
  /** TRAK-519: who started in place of a starter who didn't play: the starter's squad row → the player's. */
  instead: Record<string, string>
}

/** TRAK-374 (Imad, 5 Nov): "Did the job?" reads No, Partly, Yes. The saved values stay; players still read "Not this
 *  time" for No (reviews.ts). */
export const DID_JOB: { value: DidJob; label: string; summary: string }[] = [
  { value: 'not_yet', label: 'No', summary: 'Didn’t do the job' },
  { value: 'partly', label: 'Partly', summary: 'Did part of the job' },
  { value: 'yes', label: 'Yes', summary: 'Did the job' },
]
export const AGAINST: { value: Against; label: string }[] = [
  { value: 'below', label: 'Below' }, { value: 'met', label: 'Met' }, { value: 'above', label: 'Above' },
]
export const PLAN_WORKED: { value: PlanWorked; label: string }[] = [
  { value: 'didnt', label: 'Didn’t' }, { value: 'partly', label: 'Partly' }, { value: 'worked', label: 'Worked' },
]
/** The database's limits. */
export const EVALUATION_LIMITS = { score: 99, howTheyScored: 2000, note: 500 }

const EMPTY: Answer = { didJob: null, against: null, note: '' }
export const answerOf = (form: EvaluationForm, id: string): Answer => form.answers[id] ?? EMPTY
export const hasPlayed = (form: EvaluationForm, id: string, starter: boolean) => form.played[id] ?? starter
/** TRAK-518: "Against expectation" is in, and "Did the job?" too when the plan gave a job (TRAK-447: no job, not asked). */
export const isAnswered = (answer: Answer, hasJob: boolean) => answer.against != null && (!hasJob || answer.didJob != null)
/** TRAK-447: a player the plan gave no job has no "Did the job" to say, so the line is how they did against what was asked. */
export const summary = (answer: Answer, hasJob = true) => {
  if (!isAnswered(answer, hasJob)) return i18n.t('coachMatches:notAnswered')
  const against = i18n.t(`coachMatches:against_${answer.against}` as 'coachMatches:saved')
  return hasJob ? `${i18n.t(`coachMatches:didJob_${answer.didJob}_sum` as 'coachMatches:saved')} · ${against}` : against
}

/** Who the evaluation lists: the starters by slot, then everyone else who can be recorded and wasn't left out. */
export function lineUpAtKickOff<P extends { id: string }>(plans: PlayerPlans, eligible: P[]) {
  const starters = eligible.filter(p => playerPlan(plans, p.id).role === 'starter')
    .sort((a, b) => (playerPlan(plans, a.id).slot ?? 0) - (playerPlan(plans, b.id).slot ?? 0))
  return { starters, bench: eligible.filter(p => playerPlan(plans, p.id).role === 'bench') }
}

type Saved = {
  evaluation: Pick<Tables<'game_evaluations'>, 'our_score' | 'their_score' | 'goals' | 'how_they_scored' | 'plan_worked'> | null
  players: (Pick<Tables<'game_evaluation_players'>, 'squad_player_id' | 'played' | 'did_job' | 'against_expectation'>
    & Partial<Pick<Tables<'game_evaluation_players'>, 'started_for'>>)[]
  notes: Pick<Tables<'game_evaluation_notes'>, 'squad_player_id' | 'note'>[]
}

/** A saved draft as the form shows it. Nothing saved yet: 0–0, and everyone at their default. */
export function evaluationToForm({ evaluation, players, notes }: Saved): EvaluationForm {
  const scored = (Array.isArray(evaluation?.goals) ? evaluation.goals : []) as ScoredGoal[]
  const note = new Map(notes.map(n => [n.squad_player_id, n.note]))
  return {
    ...withScore({ ourScore: 0, goals: scored } as EvaluationForm, evaluation?.our_score ?? 0),
    theirScore: evaluation?.their_score ?? 0,
    howTheyScored: evaluation?.how_they_scored ?? '',
    planWorked: (evaluation?.plan_worked ?? []) as (PlanWorked | null)[],
    played: Object.fromEntries(players.map(p => [p.squad_player_id, p.played])),
    answers: Object.fromEntries(players.filter(p => p.played).map(p => [p.squad_player_id,
      { didJob: p.did_job as DidJob, against: p.against_expectation as Against, note: note.get(p.squad_player_id) ?? '' }])),
    instead: Object.fromEntries(players.filter(p => p.started_for).map(p => [p.started_for!, p.squad_player_id])),
  }
}

/** One row per goal we scored: a lower score drops the last ones. */
export const withScore = (form: EvaluationForm, ourScore: number): EvaluationForm =>
  ({ ...form, ourScore, goals: Array.from({ length: ourScore }, (_, i) => form.goals[i] ?? { scorer: null, assist: null }) })

/** Someone who didn't play scored nothing and assisted nothing. */
export function setPlayed(form: EvaluationForm, id: string, played: boolean): EvaluationForm {
  const goals = played ? form.goals
    : form.goals.map(goal => ({ scorer: goal.scorer === id ? null : goal.scorer, assist: goal.assist === id ? null : goal.assist }))
  const next = { ...form, played: { ...form.played, [id]: played }, goals }
  // TRAK-519: a starter ticked again needs nobody in their place.
  return played && form.instead[id] ? startInstead(next, id, null) : next
}

/** TRAK-519 (Imad, 21 Nov): who started in place of a starter who didn't play; null for nobody. "Came on" stays for
 *  who came off the bench. */
export function startInstead(form: EvaluationForm, starter: string, player: string | null): EvaluationForm {
  const before = form.instead[starter]
  const rest = { ...form, instead: Object.fromEntries(Object.entries(form.instead).filter(([id]) => id !== starter)) }
  const cleared = before ? setPlayed(rest, before, false) : rest
  return player ? { ...setPlayed(cleared, player, true), instead: { ...cleared.instead, [starter]: player } } : cleared
}

/** Who played in line-up order: each starter, or who started in their place (TRAK-519), then who came on. */
export function whoPlayed<P extends { id: string }>(form: EvaluationForm, starters: P[], bench: P[]): P[] {
  const instead = new Set(Object.values(form.instead))
  return [...starters.flatMap(s => hasPlayed(form, s.id, true) ? [s] : bench.filter(b => b.id === form.instead[s.id])),
    ...bench.filter(b => !instead.has(b.id) && hasPlayed(form, b.id, false))]
}

/** What save_game_evaluation takes: every player listed; answers and a note only for those who played; how they scored
 *  only if they did (TRAK-374: the box hides at 0). */
export function formToSave(eventId: string, form: EvaluationForm, listed: { id: string; starter: boolean }[]) {
  const played = new Set(listed.filter(p => hasPlayed(form, p.id, p.starter)).map(p => p.id))
  const who = (id: string | null) => (id && played.has(id) ? id : null)
  const startedFor = new Map(Object.entries(form.instead).filter(([starter]) => !played.has(starter)).map(([starter, id]) => [id, starter]))
  return {
    p_event_id: eventId, p_our_score: form.ourScore, p_their_score: form.theirScore,
    p_goals: form.goals.map(goal => goal.own ? { scorer: null, assist: null, own: true } : { scorer: who(goal.scorer), assist: who(goal.assist) }),
    p_how_they_scored: form.theirScore > 0 ? form.howTheyScored.trim() : '', p_plan_worked: form.planWorked,
    p_players: listed.map(({ id }) => {
      if (!played.has(id)) return { id, played: false }
      const answer = answerOf(form, id)
      return { id, played: true, did_job: answer.didJob, against_expectation: answer.against, note: answer.note.trim(),
        ...(startedFor.has(id) && { started_for: startedFor.get(id) }) }
    }),
  }
}

/** TRAK-289: the Publish step's line: who played, how many still wait for an answer (TRAK-518), and how many notes. */
export function publishSummary(form: EvaluationForm, listed: { id: string; starter: boolean }[], plans: PlayerPlans) {
  const played = listed.filter(p => hasPlayed(form, p.id, p.starter))
  return {
    players: played.length,
    left: played.filter(p => !isAnswered(answerOf(form, p.id), !!playerPlan(plans, p.id).job.trim())).length,
    notes: played.filter(p => answerOf(form, p.id).note.trim()).length,
  }
}

/** Publishing waits for an answer to "Did the plan work?" for each of the plan's goals. */
export const planAnswered = (form: EvaluationForm, goals: number) =>
  form.planWorked.length >= goals && form.planWorked.slice(0, goals).every(answer => answer != null)

/** What a player or their parent will read once it's published, from the draft and the plan as it locked. */
export function previewReview(form: EvaluationForm, id: string, plans: PlayerPlans, coachName: string | null, as: 'player' | 'parent'): Review {
  const plan = playerPlan(plans, id)
  const answer = answerOf(form, id)
  const note = answer.note.trim()
  const player = as === 'player'
  // TRAK-319: the job, "did the job" and the note are the player's alone.
  return {
    eventId: '', sessionId: null, ourScore: form.ourScore, theirScore: form.theirScore, job: player ? plan.job : '',
    // TRAK-447: no job in the plan, no "did the job" to read.
    // A published evaluation has every answer (TRAK-518); the published page is the only place this preview shows.
    didJob: player && plan.job.trim() ? answer.didJob : null, expectation: plan.expectation, context: plan.context, against: answer.against ?? 'met',
    coachName, note: player && note ? note : null,
  }
}
