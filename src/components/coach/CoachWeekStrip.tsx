import { supabase } from '@/integrations/supabase/client'
import { useFeature } from '@/components/trak/parked'
import { LoadedWeekStrip } from '@/components/trak/WeekStrip'

/**
 * TRAK-163: the coach's week on Home, drafts included (marked), so the
 * schedule is visible without hunting for it. Only where events are switched
 * on for the academy (TRAK-124); every event opens the Schedule.
 */
export function CoachWeekStrip({ coachId }: { coachId: string }) {
  if (!useFeature('events')) return null
  return (
    <LoadedWeekStrip loadKey={coachId} eventHref={() => '/coach/schedule'}
      load={(from, to) => supabase.from('coach_calendar_events').select('*')
        .eq('coach_user_id', coachId).gte('event_date', from).lte('event_date', to)
        .order('event_date', { ascending: true })} />
  )
}
