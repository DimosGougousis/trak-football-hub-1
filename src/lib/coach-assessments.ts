import { supabase } from '@/integrations/supabase/client'
import type { CoachAssessment } from '@/components/coach/CoachAssessmentCard'

export type PlayerAssessments = {
  /** Newest first, with the session each was written for. */
  list: (CoachAssessment & Record<string, unknown>)[]
  notes: Record<string, string>
  messages: Record<string, string>
  /** Whether each assessment's message reached the player; undefined when that read failed. */
  sent: Record<string, boolean> | undefined
}

/** One player's assessments by this coach, with their private notes and messages: the player page (TRAK-252) and
 *  Squad's profile panel (TRAK-263). A failed assessments read throws; a failed notes or messages read doesn't. */
export async function loadPlayerAssessments(playerId: string, coachId: string): Promise<PlayerAssessments> {
  const { data, error } = await supabase.from('coach_assessments').select('*, coach_sessions(title, session_date)')
    .eq('squad_player_id', playerId).eq('coach_user_id', coachId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const list = (data ?? []) as PlayerAssessments['list']
  if (!list.length) return { list, notes: {}, messages: {}, sent: {} }
  const ids = list.map(a => a.id)
  const [{ data: notes }, shared] = await Promise.all([
    supabase.from('coach_assessment_notes').select('assessment_id, note').in('assessment_id', ids),
    supabase.from('coach_shared_feedback' as never).select('assessment_id, body, published_at').in('assessment_id', ids),
  ])
  const feedback = (shared.data ?? []) as unknown as { assessment_id: string; body: string; published_at: string | null }[]
  return {
    list,
    notes: Object.fromEntries((notes ?? []).map(n => [n.assessment_id, n.note])),
    messages: shared.error ? {} : Object.fromEntries(feedback.map(f => [f.assessment_id, f.body])),
    sent: shared.error ? undefined
      : Object.fromEntries(ids.map(id => [id, feedback.some(f => f.assessment_id === id && f.published_at != null)])),
  }
}
