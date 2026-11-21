import { supabase } from '@/integrations/supabase/client'
import type { CoachAssessment } from '@/components/coach/CoachAssessmentCard'
import { isProgress, type Progress } from '@/lib/objective-progress'

/** TRAK-526: one objective in an assessment's check-in: its answer, or an objective the coach added. */
export type AssessmentObjective = { title: string; status: Progress | 'added' }

export type PlayerAssessments = {
  /** Newest first, with the session each was written for. */
  list: (CoachAssessment & Record<string, unknown>)[]
  notes: Record<string, string>
  messages: Record<string, string>
  /** Whether each assessment's message reached the player; undefined when that read failed. */
  sent: Record<string, boolean> | undefined
  /** TRAK-526: each assessment's objectives and answers; undefined when that read failed. */
  objectives: Record<string, AssessmentObjective[]> | undefined
}

/** One player's assessments by this coach, with their private notes and messages: the player page (TRAK-252) and
 *  Squad's profile panel (TRAK-263). A failed assessments read throws; a failed notes or messages read doesn't. */
export async function loadPlayerAssessments(playerId: string, coachId: string): Promise<PlayerAssessments> {
  const { data, error } = await supabase.from('coach_assessments').select('*, coach_sessions(title, session_date)')
    .eq('squad_player_id', playerId).eq('coach_user_id', coachId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const list = (data ?? []) as PlayerAssessments['list']
  if (!list.length) return { list, notes: {}, messages: {}, sent: {}, objectives: {} }
  const ids = list.map(a => a.id)
  // TRAK-526: a squad evaluation's answers stay in objective_progress, read through the evaluation and this player.
  const evaluations = [...new Set(list.map(a => a.evaluation_id as string | null).filter((id): id is string => !!id))]
  const [{ data: notes }, shared, own, fromEvaluations] = await Promise.all([
    supabase.from('coach_assessment_notes').select('assessment_id, note').in('assessment_id', ids),
    supabase.from('coach_shared_feedback' as never).select('assessment_id, body, published_at').in('assessment_id', ids),
    supabase.from('assessment_objectives' as never).select('assessment_id, status, added_title, player_objectives(title)').in('assessment_id', ids),
    evaluations.length ? supabase.from('objective_progress').select('evaluation_id, status, player_objectives!inner(title, squad_player_id)')
      .in('evaluation_id', evaluations).eq('player_objectives.squad_player_id', playerId) : Promise.resolve({ data: [], error: null }),
  ])
  type Answer = { status: string | null; added_title?: string | null; player_objectives: { title: string } | null }
  const said = (row: Answer): AssessmentObjective | null => row.added_title ? { title: row.added_title, status: 'added' }
    : row.player_objectives && isProgress(row.status) ? { title: row.player_objectives.title, status: row.status } : null
  const objectives: Record<string, AssessmentObjective[]> | undefined = own.error || fromEvaluations.error ? undefined : {}
  if (objectives) {
    for (const row of (own.data ?? []) as unknown as (Answer & { assessment_id: string })[]) {
      const one = said(row)
      if (one) (objectives[row.assessment_id] ??= []).push(one)
    }
    for (const a of list) {
      if (!a.evaluation_id) continue
      for (const row of (fromEvaluations.data ?? []) as unknown as (Answer & { evaluation_id: string })[]) {
        const one = row.evaluation_id === a.evaluation_id ? said(row) : null
        if (one) (objectives[a.id] ??= []).push(one)
      }
    }
  }
  const feedback = (shared.data ?? []) as unknown as { assessment_id: string; body: string; published_at: string | null }[]
  return {
    list,
    notes: Object.fromEntries((notes ?? []).map(n => [n.assessment_id, n.note])),
    messages: shared.error ? {} : Object.fromEntries(feedback.map(f => [f.assessment_id, f.body])),
    sent: shared.error ? undefined
      : Object.fromEntries(ids.map(id => [id, feedback.some(f => f.assessment_id === id && f.published_at != null)])),
    objectives,
  }
}
