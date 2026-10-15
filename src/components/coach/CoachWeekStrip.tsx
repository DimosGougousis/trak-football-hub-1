import { supabase } from '@/integrations/supabase/client'
import { useFeature } from '@/components/trak/parked'
import { LoadedWeekStrip } from '@/components/trak/WeekStrip'
import { EventSheet } from '@/components/trak/EventSheet'
import { EventSheetCoach } from '@/components/coach/EventSheetCoach'

/**
 * TRAK-163: the coach's week on Home, drafts included (marked), so the
 * schedule is visible without hunting for it. Logged sessions open their
 * saved record; planned events open in a bottom sheet (TRAK-182) with Publish,
 * Copy WhatsApp link, Edit and Attending. Only where events are on.
 */
export function CoachWeekStrip({ coachId }: { coachId: string }) {
  if (!useFeature('events')) return null
  return (
    <LoadedWeekStrip key={coachId} loadKey={coachId}
      sessionHref={event => `/coach/sessions/${event.sessionId}`}
      renderSheet={(event, trigger, refresh) => (
        <EventSheet event={event} role="coach" trigger={trigger}>
          <EventSheetCoach event={event} coachId={coachId} onChanged={refresh} />
        </EventSheet>
      )}
      load={async (from, to) => {
        const events = await supabase.from('coach_calendar_events').select('*')
          .eq('coach_user_id', coachId).gte('event_date', from).lte('event_date', to)
          .order('event_date', { ascending: true })
        if (events.error) return { data: null, error: events.error }
        // A date correction can move a completed session to another week.
        // Keep its old calendar entry hidden, regardless of the session date.
        // IDs are UUID columns from the coach's event rows, never free text.
        const eventIds = (events.data ?? []).map(event => event.id)
        const thisWeek = `and(session_date.gte.${from},session_date.lte.${to})`
        const sessions = await supabase.from('coach_sessions').select('id, event_id, title, session_type, session_date, venue')
          .eq('coach_user_id', coachId)
          .or(eventIds.length ? `${thisWeek},event_id.in.(${eventIds.join(',')})` : thisWeek)
          .order('session_date', { ascending: true })
        if (sessions.error) return { data: null, error: sessions.error }
        const completedEvents = new Set((sessions.data ?? []).map(session => session.event_id).filter(Boolean))
        return { error: null, data: [
          ...(events.data ?? []).filter(event => !completedEvents.has(event.id)),
          ...(sessions.data ?? []).filter(session => session.session_date && session.session_date >= from && session.session_date <= to).map(session => ({
            id: `session:${session.id}`, sessionId: session.id, published: true,
            title: session.title || 'Session', event_date: session.session_date, venue: session.venue,
            event_type: session.session_type === 'match' || session.session_type === 'training' ? session.session_type : 'other',
          })),
        ] }
      }} />
  )
}
