import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

/**
 * TRAK-176 (Imad, 14 Oct): one coach login, two squads (U14 + U16). A squad is
 * the coach's roster rows with the same age_group. With two or more, the coach
 * picks one (remembered on this device) and every coach screen shows that one;
 * new events and logged sessions are saved with it. With one or none, nothing
 * changes: `squad` is null and everything counts.
 */
const storeKey = (coachId: string) => `trak:coach-squad:${coachId}`

function readPick(coachId: string): string | null {
  try { return localStorage.getItem(storeKey(coachId)) } catch { return null }
}

export async function loadSquads(coachId: string): Promise<string[]> {
  const { data, error } = await supabase.from('squad_players').select('age_group, status').eq('coach_user_id', coachId)
  if (error) throw error
  const groups = (data ?? [])
    .filter(row => row.status !== 'coach_departed')
    .map(row => row.age_group?.trim())
    .filter((group): group is string => !!group)
  return [...new Set(groups)].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
}

export function useCoachSquad(coachId: string | null | undefined) {
  const client = useQueryClient()
  const id = coachId ?? ''
  const squads = useQuery({ queryKey: ['coach', id, 'squads'], queryFn: () => loadSquads(id), enabled: !!coachId, staleTime: 60_000 })
  const pick = useQuery({ queryKey: ['coach', id, 'squad-pick'], queryFn: () => readPick(id), enabled: !!coachId, staleTime: Infinity })
  const list = squads.data ?? []
  // Until the squads load, the squad remembered here, so a screen never flashes every squad's rows.
  const squad = !squads.isSuccess ? (pick.data ?? null)
    : list.length >= 2 ? (pick.data && list.includes(pick.data) ? pick.data : list[0]) : null
  const setSquad = (next: string) => {
    try { localStorage.setItem(storeKey(id), next) } catch { /* storage unavailable: kept for this visit */ }
    client.setQueryData(['coach', id, 'squad-pick'], next)
  }
  return {
    squads: list,
    /** The selected squad, or null when the coach has fewer than two. */
    squad,
    /** False until the squads are known: a write must wait, or it could miss the squad. */
    ready: squads.isSuccess,
    failed: squads.isError,
    /** For a write refused while not ready: asks again and says why. */
    retry: () => {
      void squads.refetch()
      return squads.isError ? "Couldn't load your squads. Check your connection and try again." : 'Loading your squads. Try again in a moment.'
    },
    setSquad,
    /** A roster row's age group is in view. */
    inSquad: (ageGroup: string | null | undefined) => squad === null || ageGroup?.trim() === squad,
    /** An event or session is in view: its own squad, or the whole roster (null). */
    eventInSquad: (eventSquad: string | null | undefined) => squad === null || eventSquad == null || eventSquad === squad,
  }
}
