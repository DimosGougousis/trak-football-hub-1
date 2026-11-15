import { supabase } from '@/integrations/supabase/client'
import { askToEmailFamilies } from '@/lib/event-emails'
import { clashMessage } from '@/lib/coach-events'

/** Publish one event (TRAK-182), from its sheet or Home's week (TRAK-262). Families are emailed too (TRAK-135).
 *  A clash is refused with the database's own sentence (TRAK-158). A weekly series publishes from Schedule instead. */
export async function publishEvent(id: string): Promise<void> {
  const { data, error } = await supabase.from('coach_calendar_events').update({ published: true }).eq('id', id).select('id')
  if (error || !data?.length) throw new Error(clashMessage(error) ?? "Couldn't publish. Try again.")
  askToEmailFamilies()
}
