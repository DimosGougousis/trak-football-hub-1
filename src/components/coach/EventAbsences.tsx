import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

/* TRAK-137 (J8.14): who a guardian said can't make it, on the coach's event
   card. One read for all of the coach's events (RLS: the event's coach reads
   its absences), shared by every card. Names come from the coach's own roster;
   families never see this. Refreshes on reload or refocus. */
async function fetchAbsences(signal: AbortSignal): Promise<Map<string, string[]>> {
  const { data, error } = await supabase.from('event_absences').select('event_id, squad_player_id')
    .abortSignal(signal).retry(false)
  if (error) throw error
  const ids = [...new Set((data ?? []).map(row => row.squad_player_id))]
  const names = new Map<string, string>()
  if (ids.length) {
    const roster = await supabase.from('squad_players').select('id, player_name').in('id', ids)
      .abortSignal(signal).retry(false)
    if (roster.error) throw roster.error
    for (const row of roster.data ?? []) names.set(row.id, row.player_name || 'A player')
  }
  const byEvent = new Map<string, string[]>()
  for (const row of data ?? []) {
    byEvent.set(row.event_id, [...(byEvent.get(row.event_id) ?? []), names.get(row.squad_player_id) ?? 'A player'])
  }
  return byEvent
}

export function EventAbsences({ coachId, eventId }: { coachId: string; eventId: string }) {
  const query = useQuery({
    queryKey: ['coach', coachId, 'event-absences'],
    queryFn: ({ signal }) => fetchAbsences(signal),
  })
  // A failed read must not look like "everyone is coming".
  if (query.isError) return <p className="text-[11px] mt-0.5 text-white/45">Couldn't load who can't make it.</p>
  const names = query.data?.get(eventId)
  if (!names?.length) return null
  return (
    <p className="text-[11px] mt-0.5 text-white/70" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {names.length} can't make it: {[...names].sort().join(', ')}
    </p>
  )
}
