import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { Tables } from '@/integrations/supabase/types'
import { academyClock, displayEventTime, phoneEventTime } from '@/lib/event-time'
import { weekdayDayMonth } from '@/lib/squad/format'

/* TRAK-283: the coach's own matches for Games, not cancelled (a published event is cancelled, never deleted).
   The squad pills filter them on screen, as Schedule's do. */
export type Game = Pick<Tables<'coach_calendar_events'>, 'id' | 'squad' | 'title' | 'published' | 'status' | 'starts_at'
  | 'ends_at' | 'event_date' | 'start_time' | 'opponent' | 'home_away' | 'venue'>

export function useGames() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['coach', user?.id, 'games'],
    enabled: !!user,
    queryFn: async (): Promise<Game[]> => {
      const { data, error } = await supabase.from('coach_calendar_events')
        .select('id, squad, title, published, status, starts_at, ends_at, event_date, start_time, opponent, home_away, venue')
        .eq('coach_user_id', user!.id).eq('event_type', 'match').neq('status', 'cancelled').order('starts_at')
      if (error) throw error
      return data ?? []
    },
  })
}

export const gameTitle = (game: Pick<Game, 'opponent' | 'title'>) => game.opponent ? `vs ${game.opponent}` : game.title

/** When a game is, on this phone's clock (Imad, 23 Oct), and the academy's own time when that differs. */
export function gameWhen(game: Pick<Game, 'event_date' | 'start_time' | 'starts_at'>) {
  const here = phoneEventTime(game)
  const academy = displayEventTime(game)
  return { day: weekdayDayMonth(here.date), time: here.time, academy: academyClock({ ...academy, startsAt: game.starts_at }) }
}
