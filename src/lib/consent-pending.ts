import { supabase } from '@/integrations/supabase/client'

/* TRAK-312: coach pages asked about consent once per player (27 requests for a 27-player roster, on every load).
   This asks once for the whole list. The database answers with the ids the coach can't record anything about yet:
   their players still waiting for consent (the same check as coach_squad_player_consent_required), and any id that
   isn't on their current roster. */

/** The ids, from `ids`, still waiting for consent. One request; throws if the check fails, so a read that needs it
 *  fails too (never an empty squad). */
export async function consentPendingIds(ids: string[], signal?: AbortSignal): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const request = supabase.rpc('coach_squad_players_consent_pending' as never, { p_squad_player_ids: ids } as never)
  const { data, error } = await (signal ? request.abortSignal(signal) : request)
  if (error) throw error
  if (!Array.isArray(data)) throw new Error('The consent check gave no answer')
  return new Set(data as string[])
}

/** For each id, in order: `true` waiting for consent, `false` ready. When the check fails every answer is `null`
 *  ("couldn't be checked"), which the register screens count as not confirmed. */
export async function consentRequired(ids: string[], signal?: AbortSignal): Promise<(boolean | null)[]> {
  try {
    const pending = await consentPendingIds(ids, signal)
    return ids.map(id => pending.has(id))
  } catch {
    return ids.map(() => null)
  }
}
