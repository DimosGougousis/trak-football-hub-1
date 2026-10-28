import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { Tables } from '@/integrations/supabase/types'
import { WEEK, cleanDrill, type Drill, type DrillDraft } from '@/lib/training/sessions'
import { toSave, type Practice, type SavedPractice } from '@/lib/training/plans'

/* TRAK-294 (Training 1/5): the coach's own trainings for Training home, not cancelled (a published event is cancelled,
   never deleted), from a week ago on; and the coach's own drills (coach_drills, only they read them).
   TRAK-295 (Training 2/5): one training, its plan, which trainings are planned, and saving a plan whole.
   TRAK-297 (Training 4/5): every planned session, to copy. Nothing new is stored: a past session is its plan.
   TRAK-298 (Training 5/5): which trainings have their register taken (the loop's Who's here and Close). */

export type Training = Pick<Tables<'coach_calendar_events'>, 'id' | 'squad' | 'title' | 'published' | 'status' | 'starts_at'
  | 'ends_at' | 'event_date' | 'start_time' | 'venue'>

const TRAINING_COLUMNS = 'id, squad, title, published, status, starts_at, ends_at, event_date, start_time, venue'

export function useTrainings() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['coach', user?.id, 'trainings'],
    enabled: !!user,
    queryFn: async (): Promise<Training[]> => {
      // A training a week and a day ago can still have ended inside the last seven days (one with no time lasts all day).
      const from = new Date(Date.now() - WEEK - 24 * 60 * 60_000).toISOString()
      const { data, error } = await supabase.from('coach_calendar_events')
        .select(TRAINING_COLUMNS)
        .eq('coach_user_id', user!.id).eq('event_type', 'training').neq('status', 'cancelled').gte('starts_at', from)
        .order('starts_at')
      if (error) throw error
      return data ?? []
    },
  })
}

/** One of the coach's trainings, cancelled or not, or null when it isn't theirs or isn't a training. */
export function useTraining(eventId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['coach', user?.id, 'training', eventId],
    enabled: !!user && !!eventId,
    queryFn: async (): Promise<Training | null> => {
      const { data, error } = await supabase.from('coach_calendar_events').select(TRAINING_COLUMNS)
        .eq('id', eventId!).eq('coach_user_id', user!.id).eq('event_type', 'training').maybeSingle()
      if (error) throw error
      return data
    },
  })
}

const PRACTICE_COLUMNS = 'position, name, minutes, how, tell, area, numbers, direction, targets, conditions, source, drill_id, library_session'
export type Plan = { updatedAt: string; practices: SavedPractice[] }

/** A training's plan, or null before its first save. Only its coach reads it (the database's rule). */
export function usePlan(eventId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['coach', user?.id, 'training-plan', eventId],
    enabled: !!user && !!eventId,
    queryFn: async (): Promise<Plan | null> => {
      const plan = await supabase.from('training_plans').select('updated_at').eq('event_id', eventId!).maybeSingle()
      if (plan.error) throw plan.error
      if (!plan.data) return null
      const practices = await supabase.from('training_plan_practices').select(PRACTICE_COLUMNS)
        .eq('event_id', eventId!).order('position')
      if (practices.error) throw practices.error
      return { updatedAt: plan.data.updated_at, practices: practices.data ?? [] }
    },
  })
}

/** The trainings the coach has planned. The database returns only their own plans. */
export function usePlannedTrainings() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['coach', user?.id, 'training-plans'],
    enabled: !!user,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('training_plans').select('event_id')
      if (error) throw error
      return new Set((data ?? []).map(plan => plan.event_id))
    },
  })
}

/** The coach's trainings whose register is taken, to the completed session it made (one per event, TRAK-138). */
export function useRegisters() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['coach', user?.id, 'training-registers'],
    enabled: !!user,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.from('coach_sessions').select('id, event_id')
        .eq('coach_user_id', user!.id).not('event_id', 'is', null)
      if (error) throw error
      return new Map((data ?? []).flatMap(row => row.event_id ? [[row.event_id, row.id] as const] : []))
    },
  })
}

export type PastSession = Training & { practices: SavedPractice[] }

/** Every training the coach has planned, with its practices, newest first. The database returns only their own. */
export function usePastSessions(enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['coach', user?.id, 'past-sessions'],
    enabled: !!user && enabled,
    queryFn: async (): Promise<PastSession[]> => {
      const plans = await supabase.from('training_plans').select('event_id')
      if (plans.error) throw plans.error
      const ids = (plans.data ?? []).map(plan => plan.event_id)
      if (!ids.length) return []
      const [events, practices] = await Promise.all([
        supabase.from('coach_calendar_events').select(TRAINING_COLUMNS).eq('coach_user_id', user!.id).in('id', ids),
        supabase.from('training_plan_practices').select(`event_id, ${PRACTICE_COLUMNS}`).in('event_id', ids).order('position'),
      ])
      if (events.error) throw events.error
      if (practices.error) throw practices.error
      return (events.data ?? []).map(event => ({
        ...event,
        practices: (practices.data ?? []).filter(p => p.event_id === event.id).map(({ event_id: _e, ...p }) => p),
      })).filter(session => session.practices.length > 0)
        .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))
    },
  })
}

/** Saves the whole plan in one go (save_training_plan: every practice or none). A practice ticked "Save to My drills"
 *  joins My drills in the same save. */
export function useSavePlan(eventId: string) {
  const { user } = useAuth()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (practices: Practice[]) => {
      const { error } = await supabase.rpc('save_training_plan', { p_event_id: eventId, p_practices: toSave(practices) })
      if (error) throw error
    },
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: ['coach', user?.id, 'training-plan', eventId] }),
      client.invalidateQueries({ queryKey: ['coach', user?.id, 'training-plans'] }),
      client.invalidateQueries({ queryKey: ['coach', user?.id, 'past-sessions'] }),
      client.invalidateQueries({ queryKey: ['coach', user?.id, 'drills'] }),
    ]),
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
