import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { Tables } from '@/integrations/supabase/types'
import { WEEK, cleanDrill, type Drill, type DrillDraft } from '@/lib/training/sessions'

/* TRAK-294 (Training 1/5): the coach's own trainings for Training home, not cancelled (a published event is cancelled,
   never deleted), from a week ago on; and the coach's own drills (coach_drills, only they read them). */

export type Training = Pick<Tables<'coach_calendar_events'>, 'id' | 'squad' | 'title' | 'published' | 'status' | 'starts_at'
  | 'ends_at' | 'event_date' | 'start_time' | 'venue'>

export function useTrainings() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['coach', user?.id, 'trainings'],
    enabled: !!user,
    queryFn: async (): Promise<Training[]> => {
      // A training a week and a day ago can still have ended inside the last seven days (one with no time lasts all day).
      const from = new Date(Date.now() - WEEK - 24 * 60 * 60_000).toISOString()
      const { data, error } = await supabase.from('coach_calendar_events')
        .select('id, squad, title, published, status, starts_at, ends_at, event_date, start_time, venue')
        .eq('coach_user_id', user!.id).eq('event_type', 'training').neq('status', 'cancelled').gte('starts_at', from)
        .order('starts_at')
      if (error) throw error
      return data ?? []
    },
  })
}

const DRILL_COLUMNS = 'id, name, minutes, how, tell, area, numbers, direction, targets, conditions, updated_at'

export function useDrills() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['coach', user?.id, 'drills'],
    enabled: !!user,
    queryFn: async (): Promise<Drill[]> => {
      const { data, error } = await supabase.from('coach_drills').select(DRILL_COLUMNS)
        .eq('coach_user_id', user!.id).order('updated_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

/** Adds a drill, or changes one when it has an id. The database stamps the coach and refuses another's drill. */
export function useSaveDrill() {
  const { user } = useAuth()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: DrillDraft }) => {
      const drill = cleanDrill(draft)
      const { error } = id
        ? await supabase.from('coach_drills').update(drill).eq('id', id).eq('coach_user_id', user!.id).select('id').single()
        : await supabase.from('coach_drills').insert(drill).select('id').single()
      if (error) throw error
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['coach', user?.id, 'drills'] }),
  })
}

export function useDeleteDrill() {
  const { user } = useAuth()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('coach_drills').delete().eq('id', id).eq('coach_user_id', user!.id).select('id').single()
      if (error) throw error
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['coach', user?.id, 'drills'] }),
  })
}
