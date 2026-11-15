import { supabase } from '@/integrations/supabase/client'

const DAY = 24 * 60 * 60 * 1000

/**
 * TRAK-182 (Imad, 18 Oct; pilot coach's item 15): a player's training
 * attendance, on the same rules as the coach's Feedback and assessment tab (TRAK-197, TRAK-211,
 * player-attention.ts), so the two never disagree:
 * - trainings only (a player not picked for a match didn't miss it);
 * - the player's squad's trainings, or whole-roster ones;
 * - only trainings whose register was taken (someone ticked present);
 * - only trainings on or after the day the player joined the roster.
 * None counted: null, never 0%.
 */
export function trainingAttendance(
  sessions: { id: string; squad: string | null; session_date: string | null }[],
  present: Map<string, Set<string>>,
  player: { id: string; joined: string; ageGroup: string | null },
): { attended: number; total: number; percent: number } | null {
  const joined = Date.parse(player.joined)
  const counted = sessions.filter(s => s.session_date
    && (present.get(s.id)?.size ?? 0) > 0
    && (s.squad == null || s.squad === player.ageGroup?.trim())
    // created_at is UTC and the date is the academy's day: joined by the end of that day.
    && joined < Date.parse(`${s.session_date}T00:00:00Z`) + DAY)
  if (!counted.length) return null
  const attended = counted.filter(s => present.get(s.id)!.has(player.id)).length
  return { attended, total: counted.length, percent: Math.round((attended / counted.length) * 100) }
}

/** The coach's reads behind it: their logged trainings, and who was ticked present at each. */
export async function loadTrainingAttendance(coachId: string, player: { id: string; created_at: string; age_group: string | null }) {
  const sessions = await supabase.from('coach_sessions').select('id, squad, session_date')
    .eq('coach_user_id', coachId).eq('session_type', 'training').gte('session_date', player.created_at.slice(0, 10))
  if (sessions.error) throw sessions.error
  const ids = (sessions.data ?? []).map(s => s.id)
  if (!ids.length) return null
  const marks = await supabase.from('session_attendance').select('session_id, squad_player_id')
    .in('session_id', ids).eq('status', 'present')
  if (marks.error) throw marks.error
  const present = new Map<string, Set<string>>()
  for (const m of marks.data ?? []) {
    if (!present.has(m.session_id)) present.set(m.session_id, new Set())
    present.get(m.session_id)!.add(m.squad_player_id)
  }
  return trainingAttendance(sessions.data ?? [], present, { id: player.id, joined: player.created_at, ageGroup: player.age_group })
}
