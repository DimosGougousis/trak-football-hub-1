import { Link } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useFeature } from '@/components/trak/parked'
import { LoadedWeekStrip } from '@/components/trak/WeekStrip'
import { EventSheet } from '@/components/trak/EventSheet'
import { EventSheetCoach } from '@/components/coach/EventSheetCoach'
import { LoggedAttendance } from '@/components/coach/LoggedAttendance'
import { useCoachSquad } from '@/lib/coach-squad'

/**
 * TRAK-163: the coach's week on Home, drafts included (marked), so the
 * schedule is visible without hunting for it. Logged sessions open their
 * saved record from a sheet; planned events open in a bottom sheet (TRAK-182) with Publish,
 * Copy WhatsApp link, Edit and Attending. Only where events are on.
 */
export function CoachWeekStrip({ coachId, version = 0 }: { coachId: string; version?: number }) {
  const eventsOn = useFeature('events')
  const { squad, eventInSquad } = useCoachSquad(coachId)
  if (!eventsOn) return null
  return (
    // A new `version` (the quick-add saved a draft) or squad reloads the week in place.
    <LoadedWeekStrip key={coachId} loadKey={`${coachId}:${version}:${squad ?? ''}`}
      renderSheet={(event, trigger, refresh) => (
        <EventSheet event={event} role="coach" trigger={trigger}>
          {/* A logged session's sheet says so, shows who came (TRAK-182) and opens its saved record (Imad, 16 Oct). */}
          {event.sessionId
            ? <>
                <Link to={`/coach/sessions/${event.sessionId}`}
                  className="flex min-h-11 w-full items-center justify-center rounded-xl bg-white/[0.08] text-[14px] font-medium text-white/90 focus-visible:ring-2 focus-visible:ring-primary">
                  Open session
                </Link>
                <LoggedAttendance sessionId={event.sessionId} coachId={coachId} />
              </>
            : <EventSheetCoach event={event} coachId={coachId} onChanged={refresh} />}
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
        const sessions = await supabase.from('coach_sessions').select('id, event_id, title, session_type, session_date, venue, squad')
          .eq('coach_user_id', coachId)
          .or(eventIds.length ? `${thisWeek},event_id.in.(${eventIds.join(',')})` : thisWeek)
          .order('session_date', { ascending: true })
        if (sessions.error) return { data: null, error: sessions.error }
        const completedEvents = new Set((sessions.data ?? []).map(session => session.event_id).filter(Boolean))
        // TRAK-182 (live run 3): a logged match looks like its planned match: the event's
        // kick-off, venue, kit and home or away, while the date is still the event's.
        const planned = new Map((events.data ?? []).map(event => [event.id, event]))
        const fromEvent = (session: { event_id: string | null; session_type: string | null; session_date: string | null }) => {
          const event = session.event_id ? planned.get(session.event_id) : undefined
          if (!event || session.session_type !== 'match' || event.event_date !== session.session_date) return {}
          const { start_time, starts_at, kit, kit_snapshot, opponent, home_away, venue } = event
          return { start_time, starts_at, kit, kit_snapshot, opponent, home_away, venue }
        }
        return { error: null, data: [
          ...(events.data ?? []).filter(event => !completedEvents.has(event.id) && eventInSquad(event.squad)),
          ...(sessions.data ?? []).filter(session => eventInSquad(session.squad) && session.session_date && session.session_date >= from && session.session_date <= to).map(session => ({
            ...fromEvent(session),
            id: `session:${session.id}`, sessionId: session.id, published: true,
            title: session.title || 'Session', event_date: session.session_date, ...(session.venue && { venue: session.venue }),
            event_type: session.session_type === 'match' || session.session_type === 'training' ? session.session_type : 'other',
          })),
        ] }
      }} />
  )
}
