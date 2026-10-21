import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useCoachSquad } from '@/lib/coach-squad'
import type { Tables } from '@/integrations/supabase/types'
import type { AssessmentRow } from '@/lib/squad/snapshot'

/**
 * TRAK-250: the reads every Squad tab shares, so switching tab asks for nothing
 * again. The roster is the coach's own children (a departed one drops out) in
 * the squad picked; consent and assessments are asked for that roster only.
 * A failed read is an `error`, never an empty squad.
 */
const ROOT = (userId: string | undefined) => ['coach', userId, 'squad-roster'] as const

async function loadPlayers(coachId: string): Promise<Tables<'squad_players'>[]> {
  const { data, error } = await supabase.from('squad_players').select('*').eq('coach_user_id', coachId).order('player_name')
  if (error) throw error
  return (data ?? []).filter(row => row.status !== 'coach_departed')
}

/** The same predicate the RLS policy evaluates: `true` means the child still waits for consent. A failed check fails the read. */
async function loadConsentPending(ids: string[]): Promise<string[]> {
  const answers = await Promise.all(ids.map(async id => {
    const { data, error } = await supabase.rpc('coach_squad_player_consent_required' as never, { p_squad_player_id: id } as never)
    if (error) throw error
    if (typeof data !== 'boolean') throw new Error('The consent check gave no answer')
    return data ? id : null
  }))
  return answers.filter((id): id is string => id !== null)
}

async function loadAssessments(ids: string[]): Promise<AssessmentRow[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('coach_assessments')
    .select('squad_player_id, coach_rating, created_at, work_rate, technical, physical, coachability, attitude, tactical')
    .in('squad_player_id', ids)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(row => ({ ...row, created_at: row.created_at ?? '' }))
}

export function useSquadRoster() {
  const { user } = useAuth()
  const userId = user?.id
  const client = useQueryClient()
  const { squad, squads, setSquad, inSquad, ready, failed, retry: retrySquads } = useCoachSquad(userId)

  const all = useQuery({ queryKey: [...ROOT(userId), 'players'], queryFn: () => loadPlayers(userId!), enabled: !!userId })
  // Until the squads are known the squad in view is a guess, so nothing is shown (no flash of every squad).
  const players = ready && all.data ? all.data.filter(p => inSquad(p.age_group)) : []
  const ids = players.map(p => p.id).sort()
  const idsKey = ids.join(',')
  const dependent = !!userId && ready && all.isSuccess

  const consent = useQuery({ queryKey: [...ROOT(userId), 'consent', idsKey], queryFn: () => loadConsentPending(ids), enabled: dependent })
  const assessments = useQuery({ queryKey: [...ROOT(userId), 'assessments', idsKey], queryFn: () => loadAssessments(ids), enabled: dependent })

  const error = (failed ? new Error("Couldn't load your squads") : null) ?? all.error ?? consent.error ?? assessments.error ?? null

  return {
    squad,
    squads,
    setSquad,
    players,
    consentPending: new Set(consent.data ?? []),
    assessments: assessments.data ?? [],
    /** True until every read has answered; a failed read is `error`, not pending. */
    isPending: !error && (!ready || all.isPending || consent.isPending || assessments.isPending),
    error,
    retry: () => {
      retrySquads()
      void client.invalidateQueries({ queryKey: ROOT(userId) })
    },
  }
}

export type SquadRoster = ReturnType<typeof useSquadRoster>
