import { supabase } from '@/integrations/supabase/client'

/**
 * TRAK-182 (Imad, 18 Oct; pilot coach's item 15): a player's training
 * attendance. Trainings only (a player not picked for a match didn't miss it);
 * the coach's recorded trainings of the player's squad (or the whole roster)
 * since the player joined. No recorded training: null, never 0%.
 */
export function trainingAttendance(
  sessions: { id: string; squad: string | null; session_date: string | null }[],
  presentSessionIds: string[],
  player: { joined: string; ageGroup: string | null },
): { attended: number; total: number; percent: number } | null {
  const since = player.joined.slice(0, 10)
  const counted = sessions.filter(s => s.session_date && s.session_date >= since
    && (s.squad == null || s.squad === player.ageGroup?.trim()))
  if (!counted.length) return null
  const present = new Set(presentSessionIds)
  const attended = counted.filter(s => present.has(s.id)).length
  return { attended, total: counted.length, percent: Math.round((attended / counted.length) * 100) }
}

/** The coach's reads behind it: their logged trainings, and this player's present marks. */
export async function loadTrainingAttendance(coachId: string, player: { id: string; created_at: string; age_group: string | null }) {
  const since = player.created_at.slice(0, 10)
  const [sessions, present] = await Promise.all([
    supabase.from('coach_sessions').select('id, squad, session_date')
      .eq('coach_user_id', coachId).eq('session_type', 'training').gte('session_date', since),
    supabase.from('session_attendance').select('session_id').eq('squad_player_id', player.id).eq('status', 'present'),
  ])
  if (sessions.error) throw sessions.error
  if (present.error) throw present.error
  return trainingAttendance(sessions.data ?? [], (present.data ?? []).map(row => row.session_id),
    { joined: player.created_at, ageGroup: player.age_group })
}
