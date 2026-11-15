import { supabase } from '@/integrations/supabase/client'

/* TRAK-250: who the coach ticked Confirmed for an event, and who a guardian reported can't make it. Squad >
   Availability and Games' line-up (TRAK-285) read the same rows under the same query keys. Only `squad_player_id`
   is ever selected: an absence's reason is not read. */

export const confirmedKey = (coachId: string | undefined, eventId: string | undefined) =>
  ['coach', coachId, 'squad-availability', 'confirmed', eventId] as const
export const absentKey = (coachId: string | undefined, eventId: string | undefined) =>
  ['coach', coachId, 'squad-availability', 'absent', eventId] as const

export async function loadConfirmed(eventId: string): Promise<string[]> {
  const { data, error } = await supabase.from('event_confirmations').select('squad_player_id').eq('event_id', eventId)
  if (error) throw error
  return (data ?? []).map(row => row.squad_player_id)
}

export async function loadReportedAbsent(eventId: string): Promise<string[]> {
  const { data, error } = await supabase.from('event_absences').select('squad_player_id').eq('event_id', eventId)
  if (error) throw error
  return (data ?? []).map(row => row.squad_player_id)
}
