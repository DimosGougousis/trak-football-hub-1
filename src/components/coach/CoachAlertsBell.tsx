import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/integrations/supabase/client'
import { AlertsBell, type BellAlert } from '@/components/trak/AlertsBell'
import { LoadError } from '@/components/trak/LoadError'
import { useFeature } from '@/components/trak/parked'

/* TRAK-232 (live run, 20 Oct; bell top right per TRAK-233, Imad 21 Oct): the
   coach's bell says who can't make it. One alert per player per event, from
   the absences the coach can already read (RLS: their own events only). The
   reason stays on the event, never in the bell. Undo deletes the absence, so
   its alert goes; a new report is a new alert. Past and cancelled events drop
   out: after the event the register covers it. Read state is per device. */
type Absence = { event_id: string; squad_player_id: string; reported_at: string }
type AbsenceEvent = { id: string; title: string; event_date: string | null; status: string | null }

export interface AbsenceAlert { eventId: string; squadPlayerId: string; firstName: string; event: string; day: string; reportedAt: string }

async function fetchAbsenceAlerts(coachId: string, today: string, signal: AbortSignal): Promise<AbsenceAlert[]> {
  const absences = await supabase.from('event_absences').select('event_id, squad_player_id, reported_at')
    .abortSignal(signal).retry(false)
  if (absences.error) throw absences.error
  const rows = (absences.data ?? []) as Absence[]
  if (!rows.length) return []
  const [events, roster] = await Promise.all([
    // Only this coach's own events, even if they are also a guardian.
    supabase.from('coach_calendar_events').select('id, title, event_date, status').eq('coach_user_id', coachId)
      .in('id', [...new Set(rows.map(row => row.event_id))]).gte('event_date', today)
      .abortSignal(signal).retry(false),
    supabase.from('squad_players').select('id, player_name')
      .in('id', [...new Set(rows.map(row => row.squad_player_id))])
      .abortSignal(signal).retry(false),
  ])
  if (events.error) throw events.error
  if (roster.error) throw roster.error
  const byId = new Map(((events.data ?? []) as AbsenceEvent[]).map(event => [event.id, event]))
  const names = new Map((roster.data ?? []).map(row => [row.id, row.player_name]))
  return rows.flatMap(row => {
    const event = byId.get(row.event_id)
    if (!event?.event_date || event.event_date < today || event.status === 'cancelled') return []
    const firstName = names.get(row.squad_player_id)?.trim().split(/\s+/)[0] || 'A player'
    return [{ eventId: event.id, squadPlayerId: row.squad_player_id, firstName, event: event.title, day: format(parseISO(event.event_date), 'EEE d MMM'), reportedAt: row.reported_at }]
  })
}

export function CoachAlertsBell({ coachId }: { coachId: string }) {
  const navigate = useNavigate()
  const eventsOn = useFeature('events')
  const today = format(new Date(), 'yyyy-MM-dd')
  const query = useQuery({
    queryKey: ['coach', coachId, 'absence-alerts', today],
    queryFn: ({ signal }) => fetchAbsenceAlerts(coachId, today, signal),
    enabled: eventsOn,
  })
  if (!eventsOn) return null

  const alerts: BellAlert[] = (query.data ?? []).map(alert => ({
    id: `absence-${alert.eventId}-${alert.squadPlayerId}`,
    title: `${alert.firstName} can't make it`,
    description: `${alert.event}, ${alert.day}`,
    date: alert.reportedAt,
    action: { label: 'Open event', onSelect: () => navigate(`/coach/schedule?event=${alert.eventId}`) },
  }))
  alerts.sort((a, b) => (Date.parse(b.date ?? '') || 0) - (Date.parse(a.date ?? '') || 0))

  return (
    <AlertsBell storageKey={`trak:coach-alerts-seen:${coachId}`} alerts={alerts}
      // Opening the bell re-reads, so an undo since the last read is gone.
      onOpen={() => { void query.refetch() }}
      notice={query.isError ? <LoadError what="alerts" onRetry={() => { void query.refetch() }} /> : undefined} />
  )
}
