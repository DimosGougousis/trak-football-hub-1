import { supabase } from '@/integrations/supabase/client'
import type { Tables } from '@/integrations/supabase/types'

/** Parent readers never request the coach's message or private note. */
export const PARENT_ASSESSMENT_COLUMNS = 'id, session_id, created_at, coach_user_id, coach_rating, work_rate, tactical, attitude, technical, physical, coachability' as const
export type ParentAssessment = Pick<Tables<'coach_assessments'>,
  'id' | 'created_at' | 'coach_rating' | 'work_rate' | 'tactical' | 'attitude' | 'technical' | 'physical' | 'coachability'> & {
    coach_user_id: string | null
    session_id?: string | null
  }
export type AssessmentTarget = { kind: 'assessment' | 'session'; id: string }
export interface ParentAssessmentPage {
  assessments: ParentAssessment[]
  coachNames: Record<string, string>
  hasMore: boolean
}
const PAGE_SIZE = 20

export async function fetchCoachNames(ids: string[], signal: AbortSignal): Promise<Record<string, string>> {
  if (!ids.length) return {}
  const { data, error } = await supabase.from('profiles').select('user_id, full_name')
    .in('user_id', [...new Set(ids)]).abortSignal(signal).retry(false)
  if (error) throw error
  return Object.fromEntries((data ?? []).map(profile => [profile.user_id, profile.full_name || 'Coach']))
}

async function childSquadIds(childId: string, signal: AbortSignal): Promise<string[]> {
  const { data, error } = await supabase.from('squad_players').select('id')
    .eq('linked_player_id', childId).abortSignal(signal).retry(false)
  if (error) throw error
  return (data ?? []).map(row => row.id)
}

export async function fetchParentAssessmentPage(childId: string, page: number, signal: AbortSignal): Promise<ParentAssessmentPage> {
  if (!Number.isSafeInteger(page) || page < 0) throw new Error('Invalid assessment page')
  const ids = await childSquadIds(childId, signal)
  if (!ids.length) return { assessments: [], coachNames: {}, hasMore: false }
  const start = page * PAGE_SIZE
  const { data, error } = await supabase.from('coach_assessments').select(PARENT_ASSESSMENT_COLUMNS)
    .in('squad_player_id', ids).order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false }).range(start, start + PAGE_SIZE).abortSignal(signal).retry(false)
  if (error) throw error
  const assessments: ParentAssessment[] = (data ?? []).slice(0, PAGE_SIZE)
  const coachNames = await fetchCoachNames(assessments.map(row => row.coach_user_id).filter((id): id is string => !!id), signal)
  return { assessments, coachNames, hasMore: (data?.length ?? 0) > PAGE_SIZE }
}

/** An exact record, scoped to every roster row belonging to the selected child. */
export async function fetchParentAssessment(childId: string, target: AssessmentTarget, signal: AbortSignal): Promise<{
  assessment: ParentAssessment | null; coachName: string
}> {
  const ids = await childSquadIds(childId, signal)
  if (!ids.length) return { assessment: null, coachName: 'Coach' }
  const { data, error } = await supabase.from('coach_assessments').select(PARENT_ASSESSMENT_COLUMNS)
    .in('squad_player_id', ids).eq(target.kind === 'assessment' ? 'id' : 'session_id', target.id)
    .abortSignal(signal).retry(false).maybeSingle()
  if (error) throw error
  if (!data) return { assessment: null, coachName: 'Coach' }
  const coachNames = await fetchCoachNames(data.coach_user_id ? [data.coach_user_id] : [], signal)
  return { assessment: data, coachName: data.coach_user_id ? coachNames[data.coach_user_id] || 'Coach' : 'Coach' }
}
