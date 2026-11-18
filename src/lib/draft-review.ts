import { supabase } from '@/integrations/supabase/client'
import { displayEventTime } from '@/lib/event-time'
import { isCancelled, startedLocked, type EventRow } from '@/lib/coach-events'

/* TRAK-154 (J8.6): every draft still to come, in one place, published in one tap, so a season's imported fixtures or a
   weekly series never depend on the coach remembering each one. */

/** The drafts a coach can still publish, earliest first: not published, not cancelled, not started (the database
 *  refuses any change to a started event, TRAK-230, and one refusal would stop the whole publish). */
export function upcomingDrafts(rows: EventRow[], now = Date.now()): EventRow[] {
  return rows.filter(r => !r.published && !isCancelled(r) && !startedLocked(r, now))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

/** The drafts by month of their day (the academy's), in order: [["2026-11", [...]], ["2026-12", [...]]]. */
export function draftsByMonth(drafts: EventRow[]): [string, EventRow[]][] {
  const months = new Map<string, EventRow[]>()
  for (const row of drafts) {
    const month = displayEventTime(row).date.slice(0, 7)
    months.set(month, [...(months.get(month) ?? []), row])
  }
  return [...months]
}

/** One update for every ticked draft, so a clash refuses them all (TRAK-218). Only drafts still scheduled change, and
 *  the ids the database confirms are what was published: the count is never assumed (J4's no-silent-loss rule). */
export async function publishDrafts(ids: string[]): Promise<{ published: string[]; error: unknown }> {
  const { data, error } = await supabase.from('coach_calendar_events').update({ published: true })
    .in('id', ids).eq('published', false).eq('status', 'scheduled').select('id')
  return { published: (data ?? []).map(row => row.id as string), error }
}
