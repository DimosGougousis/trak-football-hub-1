import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { Avatar } from '@/components/arc/avatar/avatar'
import { AvatarGroup } from '@/components/arc/avatar-group/avatar-group'
import { TakeRegister } from '@/components/coach/TakeRegister'
import { clashMessage, type EventRow } from '@/lib/coach-events'
import { registerProblem } from '@/lib/event-register'
import { eventLink } from '@/lib/event-share'
import type { StripEvent } from '@/components/trak/WeekStrip'

/* TRAK-182: the coach's part of the event sheet. Publish (a draft) or
   Published; after the event, Take register (J8.15). Copy WhatsApp link (the
   event's own page, TRAK-168) and Edit (Schedule's form). Attending follows
   the register model (Imad, 15 Oct): everyone is coming unless a guardian
   said they can't (TRAK-137). A weekly series publishes from Schedule, which
   asks "this week or the following" (#279). */
type Attending = { coming: { id: string; name: string }[]; away: { id: string; name: string; reason: string | null }[] }

async function fetchEvent(id: string, signal: AbortSignal): Promise<{ row: EventRow; sessionId: string | null }> {
  const [event, session] = await Promise.all([
    supabase.from('coach_calendar_events').select('*').eq('id', id).abortSignal(signal).maybeSingle(),
    supabase.from('coach_sessions').select('id').eq('event_id', id).abortSignal(signal).maybeSingle(),
  ])
  if (event.error) throw event.error
  if (!event.data) throw new Error('This event is no longer on your schedule.')
  return { row: event.data as EventRow, sessionId: session.error ? null : (session.data?.id ?? null) }
}

async function fetchAttending(coachId: string, eventId: string, signal: AbortSignal): Promise<Attending> {
  const [roster, absences] = await Promise.all([
    supabase.from('squad_players').select('id, player_name').eq('coach_user_id', coachId)
      .neq('status', 'coach_departed').order('player_name').abortSignal(signal),
    supabase.from('event_absences').select('squad_player_id, reason').eq('event_id', eventId).abortSignal(signal),
  ])
  if (roster.error) throw roster.error
  if (absences.error) throw absences.error
  const reasons = new Map((absences.data ?? []).map(a => [a.squad_player_id, a.reason as string | null]))
  const players = (roster.data ?? []).map(p => ({ id: p.id, name: p.player_name || 'Player' }))
  return {
    coming: players.filter(p => !reasons.has(p.id)),
    away: players.filter(p => reasons.has(p.id)).map(p => ({ ...p, reason: reasons.get(p.id) ?? null })),
  }
}

export function EventSheetCoach({ event, coachId, onChanged }: { event: StripEvent; coachId: string; onChanged: () => void }) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const [registering, setRegistering] = useState(false)
  const details = useQuery({ queryKey: ['coach', 'event', event.id], queryFn: ({ signal }) => fetchEvent(event.id, signal) })
  const attending = useQuery({
    queryKey: ['coach', coachId, 'attending', event.id],
    queryFn: ({ signal }) => fetchAttending(coachId, event.id, signal),
    enabled: event.status !== 'cancelled',
  })
  const publish = useMutation({
    mutationFn: async (row: EventRow) => {
      const { data, error } = await supabase.from('coach_calendar_events').update({ published: true }).eq('id', row.id).select('id')
      if (error || !data?.length) throw new Error(clashMessage(error) ?? "Couldn't publish. Try again.")
    },
    onSuccess: () => {
      toast.success('Published to the squad')
      void client.invalidateQueries({ queryKey: ['coach', 'event', event.id] })
      onChanged()
    },
    onError: error => toast.error(error.message),
  })

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(eventLink(event.id))
      toast.success('Link copied. Paste it in your WhatsApp group.')
    } catch {
      toast.error("Couldn't copy the link. Try again.")
    }
  }

  const row = details.data?.row
  const canRegister = row && registerProblem(row) === null
  const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-medium focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60'

  return (
    <div className="space-y-5">
      {details.isError ? (
        <p role="alert" className="text-[13px] text-white/70">{details.error.message}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {event.status === 'cancelled' ? null : canRegister ? (
            <button type="button" onClick={() => setRegistering(true)} className={`${button} bg-white text-black`}>
              {details.data?.sessionId ? 'Edit register' : 'Take register'}
            </button>
          ) : row?.published ? (
            <button type="button" disabled className={`${button} bg-white/10 text-white/80`}><Check size={16} aria-hidden="true" />Published</button>
          ) : (
            <button type="button" disabled={!row || publish.isPending} className={`${button} bg-white text-black`}
              onClick={() => row && (row.series_id ? navigate(`/coach/schedule?publish=${row.id}`) : publish.mutate(row))}>
              {publish.isPending ? 'Publishing…' : 'Publish'}
            </button>
          )}
          {row?.published && event.status !== 'cancelled' && (
            <button type="button" onClick={() => { void copyLink() }} className={`${button} border border-white/15 text-white/85`}>
              <Copy size={16} aria-hidden="true" />Copy WhatsApp link
            </button>
          )}
          <button type="button" onClick={() => navigate(`/coach/schedule?edit=${event.id}`)}
            className={`${button} border border-white/15 text-white/85`}>
            <Pencil size={16} aria-hidden="true" />Edit
          </button>
        </div>
      )}

      {registering && row && (
        <TakeRegister eventId={row.id} coachId={coachId} sessionId={details.data?.sessionId ?? null}
          onSaved={() => { setRegistering(false); void client.invalidateQueries({ queryKey: ['coach', 'event', event.id] }); onChanged() }} />
      )}

      {event.status !== 'cancelled' && (
        <section aria-labelledby={`attending-${event.id}`}>
          <h3 id={`attending-${event.id}`} className="text-[15px] font-medium text-white/95 mb-2">Attending</h3>
          {attending.isError ? (
            <p role="alert" className="text-[13px] text-white/70">Couldn't load who's coming.{' '}
              <button type="button" className="underline" onClick={() => { void attending.refetch() }}>Retry</button></p>
          ) : !attending.data ? <p role="status" className="text-[13px] text-white/50">Loading…</p> : <>
            <p className="text-[13px] text-white/60 mb-2">Coming · {attending.data.coming.length}</p>
            {attending.data.coming.length > 0 && (
              <div className="arc flex items-center gap-3">
                <AvatarGroup members={attending.data.coming.map(p => ({ name: p.name }))} max={6} size="sm" label="Coming" />
                <p className="text-[12px] text-white/50 truncate">{attending.data.coming.map(p => p.name.split(' ')[0]).join(', ')}</p>
              </div>
            )}
            {attending.data.away.length > 0 && <>
              <p className="text-[13px] text-white/60 mt-4 mb-2">Can't make it · {attending.data.away.length}</p>
              <ul className="space-y-2">
                {attending.data.away.map(p => (
                  <li key={p.id} className="flex items-center gap-3">
                    <Avatar name={p.name} size="sm" className="arc" aria-hidden />
                    <span className="text-[14px] text-white/90">{p.name}</span>
                    {p.reason && <span className="text-[12px] text-white/50 truncate">{p.reason}</span>}
                  </li>
                ))}
              </ul>
            </>}
          </>}
        </section>
      )}
    </div>
  )
}
