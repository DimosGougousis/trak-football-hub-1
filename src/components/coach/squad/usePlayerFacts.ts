import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import type { PreferredFoot } from '@/lib/player-traits'

export type PlayerFacts = { foot: PreferredFoot | null; nationality: string | null; traits: string[]; born: string | null }

const ROOT = (coachId: string | undefined) => ['coach', coachId, 'player-facts'] as const

/**
 * TRAK-263: what the coach knows about each player beyond the roster (TRAK-260): foot, nationality and traits, read
 * by the player's own coach only, and the roster's date of birth. A failed read is an error, never "Not set".
 */
export function usePlayerFacts(coachId: string | undefined, ids: string[]) {
  return useQuery({
    queryKey: [...ROOT(coachId), ids.join(',')],
    enabled: !!coachId && ids.length > 0,
    queryFn: async () => {
      const [profiles, births] = await Promise.all([
        supabase.from('squad_player_profiles').select('squad_player_id, preferred_foot, nationality, traits').in('squad_player_id', ids),
        supabase.rpc('coach_player_birth_dates', {}),
      ])
      if (profiles.error) throw profiles.error
      if (births.error) throw births.error
      const born = new Map((births.data ?? []).map(b => [b.squad_player_id, b.date_of_birth]))
      const facts = new Map<string, PlayerFacts>(ids.map(id => [id, { foot: null, nationality: null, traits: [], born: born.get(id) ?? null }]))
      for (const p of profiles.data ?? []) {
        facts.set(p.squad_player_id, { ...facts.get(p.squad_player_id)!, foot: p.preferred_foot as PreferredFoot | null, nationality: p.nationality, traits: p.traits })
      }
      return facts
    },
  })
}

/** Saves one player's foot, nationality and traits; the database refuses anything outside its lists. */
export function useSavePlayerFacts(coachId: string | undefined) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, foot, nationality, traits }: { id: string } & Omit<PlayerFacts, 'born'>) => {
      const { error } = await supabase.from('squad_player_profiles')
        .upsert({ squad_player_id: id, preferred_foot: foot, nationality, traits }, { onConflict: 'squad_player_id' })
      if (error) throw error
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ROOT(coachId) }),
  })
}
