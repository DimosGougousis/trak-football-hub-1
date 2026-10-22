import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useCoachSquad } from '@/lib/coach-squad'
import { localTodayISO } from '@/lib/event-time'
import { seasonSummary, seasonWindow, type SeasonRow } from '@/lib/squad/season'

/**
 * TRAK-250: this season's matches for the squad in view (1 July to 30 June), built from the
 * coach's own match logs, for the Games Statistics tab.
 * A failed read is an `error`, never an empty season. `summary` stays undefined until the read answers.
 */
async function loadSeason(from: string, to: string, squad: string | null): Promise<SeasonRow[]> {
  const { data, error } = await supabase.rpc('coach_squad_season', { p_from: from, p_to: to, p_squad: squad })
  if (error) throw error
  return data ?? []
}

export function useSeason() {
  const { user } = useAuth()
  const userId = user?.id
  const { squad, ready } = useCoachSquad(userId)
  const today = localTodayISO()
  const window = useMemo(() => seasonWindow(today), [today])

  const query = useQuery({
    queryKey: ['coach', userId, 'season', squad, window.from],
    queryFn: () => loadSeason(window.from, window.to, squad),
    // Until the squads are known the squad in view is a guess, so nothing is asked for.
    enabled: !!userId && ready,
  })
  const summary = useMemo(() => (query.data ? seasonSummary(query.data) : undefined), [query.data])

  return {
    window,
    summary,
    isPending: !query.isError && (!ready || query.isPending),
    error: query.error,
    retry: () => { void query.refetch() },
  }
}
