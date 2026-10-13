import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { refusalWithNames, registerStart, type RegisterPlayer } from '@/lib/event-register'

/**
 * TRAK-138 (J8.15): the register of an event that went ahead. It opens
 * pre-filled from J8.14's "can't make it" (everyone present except those), or
 * as it was saved if the coach took it before. A child who can't be recorded
 * is never offered (G1), and the note says why. Taps mark present or absent;
 * Save sends the present list to take_event_register(), which makes or reuses
 * the event's one completed session and repeats every rule.
 *
 * Nothing is guessed: a squad, consent, absence or attendance read that fails
 * shows a retry, not a register.
 */
interface TakeRegisterProps {
  eventId: string
  coachId: string
  /** The completed session this event already has, if the register was taken. */
  sessionId: string | null
  onSaved: () => void
}

type Loaded = {
  players: RegisterPlayer[]
  notReady: RegisterPlayer[]
  familyReason: Map<string, string | null>
}

const font = { fontFamily: "'DM Sans', sans-serif" }
const SAVE_FAILED = "Couldn't save the register. Check your connection and save again; your ticks are still here."

export function TakeRegister({ eventId, coachId, sessionId, onSaved }: TakeRegisterProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [present, setPresent] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let superseded = false
    setLoaded(null)
    setLoadFailed(false)
    ;(async () => {
      const [squad, absences, attendance] = await Promise.all([
        supabase.from('squad_players').select('id, player_name, status').eq('coach_user_id', coachId).order('player_name'),
        supabase.from('event_absences').select('squad_player_id, reason').eq('event_id', eventId),
        sessionId
          ? supabase.from('session_attendance').select('squad_player_id, status').eq('session_id', sessionId)
          : Promise.resolve({ data: null, error: null }),
      ])
      if (squad.error || absences.error || attendance.error) throw new Error('register read failed')
      const rows = (squad.data ?? []).filter(p => p.status !== 'coach_departed')
      // Same check as the J4 screens; a failed check counts as not confirmed.
      const required = await Promise.all(rows.map(p =>
        supabase.rpc('coach_squad_player_consent_required' as never, { p_squad_player_id: p.id } as never)
          .then(({ data, error }) => (error || typeof data !== 'boolean' ? null : data))))
      const all: RegisterPlayer[] = rows.map((p, i) => ({
        id: p.id, name: p.player_name ?? 'Player', ready: required[i] === false,
        waitReason: required[i] === null ? "consent couldn't be checked" : 'waiting for a parent',
      }))
      const familyReason = new Map((absences.data ?? []).map(a => [a.squad_player_id as string, (a.reason as string | null) ?? null]))
      const start = registerStart(all, familyReason.keys())
      // Taken before: reopen as saved. Otherwise the family's word decides.
      const ready = new Set(all.filter(p => p.ready).map(p => p.id))
      const first = attendance.data
        ? new Set((attendance.data as { squad_player_id: string, status: string }[])
            .filter(a => a.status === 'present' && ready.has(a.squad_player_id)).map(a => a.squad_player_id))
        : start.present
      if (superseded) return
      setLoaded({ players: all.filter(p => p.ready), notReady: all.filter(p => !p.ready), familyReason })
      setPresent(first)
    })().catch(() => { if (!superseded) setLoadFailed(true) })
    return () => { superseded = true }
  }, [eventId, coachId, sessionId, attempt])

  const names = useMemo(() => new Map([...(loaded?.players ?? []), ...(loaded?.notReady ?? [])].map(p => [p.id, p.name])), [loaded])

  const toggle = (id: string) => {
    setError(null)
    setPresent(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    if (!loaded || saving) return
    setSaving(true)
    setError(null)
    const { error: rpcErr } = await supabase.rpc('take_event_register', { p_event_id: eventId, p_present: [...present] })
    setSaving(false)
    if (rpcErr) {
      // A rule refusal carries a sentence for the coach; saving again gets the
      // same answer, so show it. Anything else is the connection.
      setError(rpcErr.code === 'P0001' || rpcErr.code === '42501' ? refusalWithNames(rpcErr.message, names) : SAVE_FAILED)
      return
    }
    toast.success(`Register saved: ${present.size} present.`)
    onSaved()
  }

  if (loadFailed) {
    return (
      <p role="alert" className="text-[12px] text-white/55" style={font}>
        Couldn't load the register.{' '}
        <button type="button" onClick={() => setAttempt(n => n + 1)} className="underline text-[#C8F25A]">Retry</button>
      </p>
    )
  }
  if (!loaded) return <p className="text-[12px] text-white/40" style={font}>Loading your squad…</p>

  const absent = loaded.players.length - present.size
  return (
    <div className="space-y-3">
      {loaded.players.length === 0 ? (
        <p className="text-[12px] text-white/40" style={font}>No players to record yet.</p>
      ) : (
        <>
          <p className="text-[12px] text-white/50" style={font}>{present.size} present, {absent} absent</p>
          <ul className="space-y-1.5">
            {loaded.players.map(p => {
              const on = present.has(p.id)
              const family = loaded.familyReason.has(p.id)
              const reason = loaded.familyReason.get(p.id)
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => toggle(p.id)} aria-pressed={on}
                    aria-label={`${p.name}: ${on ? 'present' : 'absent'}`}
                    className="w-full flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left"
                    style={{ background: on ? 'rgba(200,242,90,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${on ? 'rgba(200,242,90,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: on ? '#C8F25A' : 'transparent', border: on ? 'none' : '1px solid rgba(255,255,255,0.25)' }}>
                      {on && <Check size={12} color="#000" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] text-white/88 truncate" style={font}>{p.name}</span>
                      {family && (
                        <span className="block text-[11px] text-white/45" style={font}>
                          {reason ? `Can't make it · ${reason}` : "Can't make it"}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px]" style={{ ...font, color: on ? '#C8F25A' : 'rgba(255,255,255,0.4)' }}>
                      {on ? 'Present' : 'Absent'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {loaded.notReady.length > 0 && (
        <p className="text-[11px] text-white/40" style={font}>
          Not recorded until a parent approves: {loaded.notReady.map(p => p.waitReason === 'waiting for a parent' ? p.name : `${p.name} (${p.waitReason})`).join(', ')}
        </p>
      )}
      {error && <p role="alert" className="text-[12px] text-[#f87171]" style={font}>{error}</p>}
      {loaded.players.length > 0 && (
        <button type="button" onClick={save} disabled={saving}
          className="w-full py-3 rounded-[12px] text-[14px] font-medium disabled:opacity-50"
          style={{ background: '#C8F25A', color: '#000' }}>
          {saving ? 'Saving…' : 'Save register'}
        </button>
      )}
    </div>
  )
}
