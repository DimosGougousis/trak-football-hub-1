import { supabase } from '@/integrations/supabase/client'
import { teamKitSetSchema, type TeamKitSet } from '@/lib/kit-templates'

/** RLS limits both reads and writes to this coach's current academy. */
export async function loadTeamKits(coachId: string, squad: string | null): Promise<TeamKitSet | null> {
  const { data, error } = await supabase.from('coach_team_kits').select('kits')
    .eq('coach_user_id', coachId).eq('squad', squad ?? '').maybeSingle()
  if (error) throw error
  return data ? teamKitSetSchema.parse(data.kits) : null
}

export async function saveTeamKits(coachId: string, squad: string | null, kits: TeamKitSet): Promise<TeamKitSet> {
  const { data, error } = await supabase.from('coach_team_kits').upsert({
    coach_user_id: coachId, squad: squad ?? '', kits: teamKitSetSchema.parse(kits),
  }, { onConflict: 'organization_id,coach_user_id,squad' }).select('kits').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('No team kit set was saved')
  return teamKitSetSchema.parse(data.kits)
}
