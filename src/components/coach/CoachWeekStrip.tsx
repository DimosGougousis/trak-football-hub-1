import { useEffect, useState } from 'react'
import { addDays } from 'date-fns'
import { supabase } from '@/integrations/supabase/client'
import { LoadError } from '@/components/trak'
import { useFeature } from '@/components/trak/parked'
import { WeekStrip, type StripEvent } from '@/components/trak/WeekStrip'
import { toPlayerEvent } from '@/lib/player-events'

/**
 * TRAK-163: the coach's next seven days on Home, drafts included (marked), so
 * the schedule is visible without hunting for it. Only where events are
 * switched on for the academy (TRAK-124); every event opens the Schedule.
 */
export function CoachWeekStrip({ coachId }: { coachId: string }) {
  const eventsOn = useFeature('events')
  const [events, setEvents] = useState<StripEvent[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!eventsOn) return
    let cancelled = false
    setFailed(false)
    const today = new Date()
    supabase.from('coach_calendar_events').select('*')
      .eq('coach_user_id', coachId)
      .gte('event_date', today.toLocaleDateString('en-CA'))
      .lte('event_date', addDays(today, 6).toLocaleDateString('en-CA'))
      .order('event_date', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        // A failed read is not an empty week (the J4 standard).
        if (error) { setFailed(true); return }
        setEvents((data ?? []).flatMap(row => {
          const event = toPlayerEvent(row as Record<string, unknown>)
          return event ? [{ ...event, draft: !(row as { published?: boolean }).published }] : []
        }))
      })
    return () => { cancelled = true }
  }, [coachId, eventsOn, reloadKey])

  if (!eventsOn) return null
  if (failed) return <div className="mb-4"><LoadError what="your week" onRetry={() => setReloadKey(k => k + 1)} /></div>
  if (!events) return null
  return <WeekStrip events={events} eventHref={() => '/coach/schedule'} />
}
