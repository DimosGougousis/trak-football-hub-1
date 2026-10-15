import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import type { PlayerEvent } from '@/lib/player-events'

/* TRAK-137 (J8.14, Imad 8 Oct): like a school register, everyone counts as
   coming; a guardian reports the exception (or, since TRAK-183, a player at or
   above their academy's consent age, for themselves). The database decides who may and
   until when (report_cant_make_it / undo_cant_make_it, kickoff), so this page
   only shows its answer. Hidden on cancelled and past days, like the lists. */
async function fetchAbsence(childId: string, eventId: string, signal: AbortSignal) {
  const squad = await supabase.from('squad_players').select('id').eq('linked_player_id', childId)
    .abortSignal(signal).retry(false)
  if (squad.error) throw squad.error
  const ids = (squad.data ?? []).map(row => row.id)
  if (!ids.length) return null
  const { data, error } = await supabase.from('event_absences').select('reason').eq('event_id', eventId)
    .in('squad_player_id', ids).abortSignal(signal).retry(false).maybeSingle()
  if (error) throw error
  return data
}

/** `self`: the player reporting for themselves, at or above their academy's
 *  consent age (TRAK-183). The words say "you"; the database decides. */
export function CantMakeIt({ event, child, self = false }: { event: PlayerEvent; child: { id: string; name: string }; self?: boolean }) {
  const reasonId = useId()
  const client = useQueryClient()
  const [writing, setWriting] = useState(false)
  const [reason, setReason] = useState('')
  const key = ['parent', 'absence', child.id, event.id]
  const absence = useQuery({ queryKey: key, queryFn: ({ signal }) => fetchAbsence(child.id, event.id, signal) })
  const change = useMutation({
    mutationFn: async (report: boolean) => {
      const { error } = report
        ? await supabase.rpc('report_cant_make_it', { p_event_id: event.id, p_child: child.id, p_reason: reason.trim() || undefined })
        : await supabase.rpc('undo_cant_make_it', { p_event_id: event.id, p_child: child.id })
      if (error) throw error
    },
    onSuccess: () => { setWriting(false); setReason(''); return client.invalidateQueries({ queryKey: key }) },
  })

  if (event.status === 'cancelled' || event.date < new Date().toLocaleDateString('en-CA')) return null
  const refusal = change.error && <p role="alert" className="text-sm text-destructive mt-2">{change.error.message}</p>
  const button = 'min-h-11 px-4 rounded-lg border border-border text-sm text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50'

  return (
    <section aria-label="Attendance" className="rounded-xl border border-border bg-card p-4">
      {absence.isError ? <>
        <p className="text-sm text-foreground">Couldn't check whether {self ? "you're" : `${child.name} is`} coming.</p>
        <button type="button" onClick={() => { void absence.refetch() }} className={`${button} mt-3`}>Retry</button>
      </> : absence.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading…</p>
        : absence.data ? <>
          <p className="text-sm text-foreground">You told the coach {self ? 'you' : child.name} can't make it.</p>
          {absence.data.reason && <p className="text-sm text-muted-foreground mt-1">{absence.data.reason}</p>}
          <button type="button" disabled={change.isPending} onClick={() => change.mutate(false)} className={`${button} mt-3`}>Undo</button>
          {refusal}
        </> : writing ? <>
          <label htmlFor={reasonId} className="block text-sm text-foreground mb-2">Reason (optional, the coach sees it)</label>
          <textarea id={reasonId} value={reason} maxLength={140} rows={2} onChange={e => setReason(e.target.value)}
            className="w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-primary" />
          <div className="flex gap-2 mt-3">
            <button type="button" disabled={change.isPending} onClick={() => change.mutate(true)} className={button}>Tell the coach</button>
            <button type="button" onClick={() => { setWriting(false); change.reset() }} className={button}>Cancel</button>
          </div>
          {refusal}
        </> : <>
          <p className="text-sm text-muted-foreground mb-3">Everyone counts as coming. Only say if {self ? 'you' : child.name} can't.</p>
          <button type="button" onClick={() => setWriting(true)} className={button}>Can't make it</button>
        </>}
    </section>
  )
}
