import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Check, MessageCircle, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { Avatar } from '@/components/arc/avatar/avatar'
import { AvatarGroup } from '@/components/arc/avatar-group/avatar-group'
import { TakeRegister } from '@/components/coach/TakeRegister'
import { clashMessage, type EventRow } from '@/lib/coach-events'
import { hasStarted, registerProblem } from '@/lib/event-register'
import { shareableFromRow, squadLabelFrom, whatsAppShareUrl } from '@/lib/event-share'
import type { StripEvent } from '@/components/trak/WeekStrip'

/* TRAK-182: the coach's part of the event sheet. Publish (a draft) or
   Published; after the event, Take register (J8.15). Share to WhatsApp (the
   J8.16 message, which links the event's own page), Edit and Cancel (Schedule's
   own sheets). Attending follows the register model (Imad, 15 Oct): everyone
   is coming unless a guardian said they can't (TRAK-137); once the register is
   taken it shows who came. A weekly series publishes from Schedule, which asks
   "this week or the following" (#279). */
type Person = { id: string; name: string }
type Squad = {
  label: string
  childNames: string[]
  coming: Person[]
  away: (Person & { reason: string | null })[]
  /** Who the register marked present, once it is taken. */
  came: Person[] | null
  /** Not counted: consent not active (or not confirmed), as on the register. */
  waiting: Person[]
}

async function fetchEvent(id: string, signal: AbortSignal): Promise<{ row: EventRow; sessionId: string | null }> {
  const [event, session] = await Promise.all([
    supabase.from('coach_calendar_events').select('*').eq('id', id).abortSignal(signal).maybeSingle(),
    supabase.from('coach_sessions').select('id').eq('event_id', id).abortSignal(signal).maybeSingle(),
  ])
  if (event.error) throw event.error
  if (!event.data) throw new Error('This event is no longer on your schedule.')
  // A failed read is an error, not "no register yet" (Kostas, #310): guessing
  // would offer Take register on an event whose register exists.
  if (session.error) throw session.error
  return { row: event.data as EventRow, sessionId: session.data?.id ?? null }
}

async function fetchSquad(coachId: string, eventId: string, sessionId: string | null, signal: AbortSignal): Promise<Squad> {
  const [roster, absences, attendance] = await Promise.all([
    supabase.from('squad_players').select('id, player_name, age_group, status').eq('coach_user_id', coachId)
      .order('player_name').abortSignal(signal),
    supabase.from('event_absences').select('squad_player_id, reason').eq('event_id', eventId).abortSignal(signal),
    sessionId
      ? supabase.from('session_attendance').select('squad_player_id, status').eq('session_id', sessionId).abortSignal(signal)
      : Promise.resolve({ data: null, error: null }),
  ])
  if (roster.error) throw roster.error
  if (absences.error) throw absences.error
  if (attendance.error) throw attendance.error
  const rows = roster.data ?? []
  const reasons = new Map((absences.data ?? []).map(a => [a.squad_player_id, a.reason as string | null]))
  const current = rows.filter(p => p.status !== 'coach_departed')
  // As the register (TakeRegister): only a child whose consent is active counts
  // (Kostas, #310). A failed check counts as not confirmed.
  // ponytail: one check per player, as the register does; a batch RPC if squads grow past ~40.
  const required = await Promise.all(current.map(p =>
    supabase.rpc('coach_squad_player_consent_required' as never, { p_squad_player_id: p.id } as never)
      .abortSignal(signal).then(({ data, error }) => (error || typeof data !== 'boolean' ? null : data))))
  const players = current.filter((_, i) => required[i] === false).map(p => ({ id: p.id, name: p.player_name || 'Player' }))
  const waiting = current.filter((_, i) => required[i] !== false).map(p => ({ id: p.id, name: p.player_name || 'Player' }))
  const present = attendance.data
    ? new Set((attendance.data as { squad_player_id: string; status: string }[]).filter(a => a.status === 'present').map(a => a.squad_player_id))
    : null
  return {
    // As Schedule's share: departed names count too, so a reason naming one stays out.
    label: squadLabelFrom(rows),
    childNames: rows.map(p => p.player_name ?? '').filter(Boolean),
    coming: players.filter(p => !reasons.has(p.id)),
    away: players.filter(p => reasons.has(p.id)).map(p => ({ ...p, reason: reasons.get(p.id) ?? null })),
    came: present && players.filter(p => present.has(p.id)),
    waiting,
  }
}

function People({ heading, people }: { heading: string; people: Person[] }) {
  return <>
    <p className="text-[13px] text-white/60 mb-2">{heading} · {people.length}</p>
    {people.length > 0 && (
      <div className="arc flex items-center gap-3">
        <AvatarGroup members={people.map(p => ({ name: p.name }))} max={6} size="sm" label={heading} />
        <p className="text-[12px] text-white/50 truncate">{people.map(p => p.name.split(' ')[0]).join(', ')}</p>
      </div>
    )}
  </>
}

export function EventSheetCoach({ event, coachId, onChanged }: { event: StripEvent; coachId: string; onChanged: () => void }) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const [registering, setRegistering] = useState(false)
  const details = useQuery({ queryKey: ['coach', 'event', event.id], queryFn: ({ signal }) => fetchEvent(event.id, signal) })
  const sessionId = details.data?.sessionId ?? null
  const squad = useQuery({
    queryKey: ['coach', coachId, 'attending', event.id, sessionId],
    queryFn: ({ signal }) => fetchSquad(coachId, event.id, sessionId, signal),
    enabled: details.isSuccess,
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

  const row = details.data?.row
  const cancelled = event.status === 'cancelled'
  const canRegister = row && registerProblem(row) === null
  const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-medium focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60'
  const quiet = `${button} border border-white/15 text-white/85`

  return (
    <div className="space-y-5">
      {details.isError ? (
        <p role="alert" className="text-[13px] text-white/70">{details.error.message}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {cancelled ? null : canRegister ? (
            <button type="button" onClick={() => setRegistering(true)} className={`${button} bg-white text-black`}>
              {sessionId ? 'Edit register' : 'Take register'}
            </button>
          ) : row?.published ? (
            <button type="button" disabled className={`${button} bg-white/10 text-white/80`}><Check size={16} aria-hidden="true" />Published</button>
          ) : (
            <button type="button" disabled={!row || publish.isPending} className={`${button} bg-white text-black`}
              onClick={() => row && (row.series_id ? navigate(`/coach/schedule?publish=${row.id}`) : publish.mutate(row))}>
              {publish.isPending ? 'Publishing…' : 'Publish'}
            </button>
          )}
          {/* A draft has nothing to share (J8.16); a cancellation is shared with its reason. */}
          {row?.published && squad.data && (
            <a href={whatsAppShareUrl(shareableFromRow(row, squad.data.label), { childNames: squad.data.childNames })}
              target="_blank" rel="noopener noreferrer" className={quiet}>
              <MessageCircle size={16} aria-hidden="true" />Share to WhatsApp
            </a>
          )}
          {!cancelled && <>
            <button type="button" onClick={() => navigate(`/coach/schedule?edit=${event.id}`)} className={quiet}>
              <Pencil size={16} aria-hidden="true" />Edit
            </button>
            {/* A published event is cancelled, never deleted; a draft is edited or deleted in Schedule. */}
            {row?.published && !hasStarted(row) && (
              <button type="button" onClick={() => navigate(`/coach/schedule?cancel=${event.id}`)} className={quiet}>
                <Ban size={16} aria-hidden="true" />Cancel event
              </button>
            )}
          </>}
        </div>
      )}

      {registering && row && (
        <TakeRegister eventId={row.id} coachId={coachId} sessionId={sessionId}
          onSaved={() => { setRegistering(false); void client.invalidateQueries({ queryKey: ['coach', 'event', event.id] }); onChanged() }} />
      )}

      {!cancelled && row && (
        <section aria-labelledby={`attending-${event.id}`}>
          <h3 id={`attending-${event.id}`} className="text-[15px] font-medium text-white/95 mb-2">Attending</h3>
          {!row.published ? (
            <p className="text-[13px] text-white/60">Families see this once you publish.</p>
          ) : squad.isError ? (
            <p role="alert" className="text-[13px] text-white/70">Couldn't load who's coming.{' '}
              <button type="button" className="underline" onClick={() => { void squad.refetch() }}>Retry</button></p>
          ) : !squad.data ? <p role="status" className="text-[13px] text-white/50">Loading…</p>
          : squad.data.coming.length + squad.data.away.length + squad.data.waiting.length === 0 ? (
            <p className="text-[13px] text-white/60">No players in your squad yet.</p>
          ) : squad.data.came ? (
            <People heading="Came" people={squad.data.came} />
          ) : <>
            <People heading="Coming" people={squad.data.coming} />
            {squad.data.away.length > 0 && <>
              <p className="text-[13px] text-white/60 mt-4 mb-2">Can't make it · {squad.data.away.length}</p>
              <ul className="space-y-2">
                {squad.data.away.map(p => (
                  <li key={p.id} className="flex items-center gap-3">
                    <Avatar name={p.name} size="sm" className="arc" aria-hidden />
                    <span className="text-[14px] text-white/90">{p.name}</span>
                    {p.reason && <span className="text-[12px] text-white/50 truncate">{p.reason}</span>}
                  </li>
                ))}
              </ul>
            </>}
          </>}
          {squad.data && squad.data.waiting.length > 0 && (
            <p className="text-[12px] text-white/45 mt-4">
              Not counted until consent is active · {squad.data.waiting.length}: {squad.data.waiting.map(p => p.name.split(' ')[0]).join(', ')}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
