import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { ClipboardList, Zap } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell, NavBar } from '@/components/trak'
import { Avatar } from '@/components/arc/avatar/avatar'
import { QuickAdd } from '@/components/coach/QuickAdd'
import { HomeHeader } from '@/components/trak/HomeHeader'
import { CoachSquadSwitcher } from '@/components/coach/CoachSquadSwitcher'
import { CoachWeekStrip } from '@/components/coach/CoachWeekStrip'
import { useCoachSquad } from '@/lib/coach-squad'
import { playerAttention, type AttentionLevel, type AttentionRow } from '@/lib/player-attention'
import { localTodayISO } from '@/lib/event-time'
import { openable } from '@/lib/openable'
import { remember, remembered } from '@/lib/screen-memory'

/* TRAK-197 (Kostas's 16 Oct list, items 9 + 10): coach Home is the week, then
   who needs attention, then the two things a coach does most. The season card,
   the counts, Recent assessments and the band chart went: each is in Squad or
   Sessions. TRAK-196 (item 8): one quiet line replaces the greeting and the
   chips that looked like buttons. With two squads, all of it follows the squad
   picked in the header (TRAK-176). */

const SHOWN = 5
const LEVEL: Record<AttentionLevel, { word: string; color: string }> = {
  urgent: { word: 'Urgent', color: '#f87171' },
  warning: { word: 'Warning', color: '#facc15' },
  'on-track': { word: 'On track', color: '#4ade80' },
}

/** `squad` is the one it was read for: after a switch, the other squad's rows never show. */
type Overview = { squad: string | null; rows: AttentionRow[]; players: number }
type HomeMemory = { overview: Overview; line: string }

export default function CoachHomePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const coachSquad = useCoachSquad(user?.id)
  // TRAK-182 part 8: a quick-add draft shows in the week at once.
  const [weekVersion, setWeekVersion] = useState(0)
  // TRAK-180: a revisit starts from what Home last showed this coach for this
  // squad; the reads below still run and replace it.
  const [seed] = useState(() => remembered<HomeMemory>('coach-home', user?.id))
  // null = not answered yet: never "everyone's on track" before we know.
  const [answered, setOverview] = useState<Overview | null>(seed?.overview ?? null)
  const overview = answered && answered.squad === coachSquad.squad ? answered : null
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [details, setDetails] = useState<{ coach_role: string | null; team: string | null; academy: string | null } | null>(null)

  // The quiet line's facts: role and academy. Not part of the overview, so a
  // failure here leaves the line shorter, never the overview blank.
  useEffect(() => {
    if (!user) return
    let stale = false
    ;(async () => {
      const { data } = await supabase.from('coach_details').select('coach_role, team, organization_id').eq('user_id', user.id).maybeSingle()
      const orgId = (data as { organization_id?: string | null } | null)?.organization_id
      const org = orgId ? (await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle()).data : null
      if (!stale) setDetails({ coach_role: data?.coach_role ?? null, team: data?.team ?? null, academy: (org as { name?: string } | null)?.name ?? null })
    })()
    return () => { stale = true }
  }, [user])

  useEffect(() => {
    if (!user) return
    // A failed squads read is a failed overview (Retry asks again), never the whole roster.
    if (coachSquad.failed) { setOverview(null); setFailed(true); return }
    if (!coachSquad.ready) return
    let stale = false
    setFailed(false)
    const fail = () => { if (!stale) { setOverview(null); setFailed(true) } }
    ;(async () => {
      const [roster, assessments, sessions] = await Promise.all([
        supabase.from('squad_players').select('id, player_name, created_at, age_group, status').eq('coach_user_id', user.id),
        supabase.from('coach_assessments').select('squad_player_id, created_at').eq('coach_user_id', user.id),
        // A few more than four: a session with no register taken doesn't count,
        // and the other squad's are filtered out below.
        supabase.from('coach_sessions').select('id, session_date, event_id, squad')
          .eq('coach_user_id', user.id).eq('session_type', 'training').lte('session_date', localTodayISO())
          .order('session_date', { ascending: false }).limit(24),
      ])
      if (stale) return
      if (roster.error || assessments.error || sessions.error) return fail()
      const players = (roster.data ?? []).filter(p => p.status !== 'coach_departed' && coachSquad.inSquad(p.age_group))
      const trainings = (sessions.data ?? []).filter(s => s.session_date && coachSquad.eventInSquad(s.squad))
        .map(s => ({ id: s.id, session_date: s.session_date as string, event_id: s.event_id }))
      const sessionIds = trainings.map(t => t.id)
      const eventIds = trainings.map(t => t.event_id).filter((id): id is string => !!id)
      const [attendance, absences, ...consent] = await Promise.all([
        sessionIds.length ? supabase.from('session_attendance').select('session_id, squad_player_id').in('session_id', sessionIds).eq('status', 'present')
          : Promise.resolve({ data: [], error: null }),
        eventIds.length ? supabase.from('event_absences').select('event_id, squad_player_id, reason').in('event_id', eventIds)
          : Promise.resolve({ data: [], error: null }),
        // Same check as the J4 screens: a child waiting for a parent can't be
        // ticked or assessed, so nothing about them is flagged.
        ...players.map(p => supabase.rpc('coach_squad_player_consent_required' as never, { p_squad_player_id: p.id } as never) as unknown as Promise<{ data: boolean | null; error: unknown }>),
      ])
      if (stale) return
      // Any unknown answer could make a flag wrong, so none are shown.
      if (attendance.error || absences.error || consent.some(c => c.error || typeof c.data !== 'boolean')) return fail()
      const present = new Map<string, Set<string>>()
      for (const a of (attendance.data ?? []) as { session_id: string; squad_player_id: string }[]) {
        if (!present.has(a.session_id)) present.set(a.session_id, new Set())
        present.get(a.session_id)!.add(a.squad_player_id)
      }
      const absenceReasons = new Map<string, Map<string, string | null>>()
      for (const a of (absences.data ?? []) as { event_id: string; squad_player_id: string; reason: string | null }[]) {
        if (!absenceReasons.has(a.event_id)) absenceReasons.set(a.event_id, new Map())
        absenceReasons.get(a.event_id)!.set(a.squad_player_id, a.reason)
      }
      const playerIds = new Set(players.map(p => p.id))
      setOverview({
        squad: coachSquad.squad,
        players: players.length,
        rows: playerAttention({
          roster: players,
          waitingForParent: new Set(players.filter((_, i) => consent[i].data === true).map(p => p.id)),
          assessments: (assessments.data ?? []).filter(a => playerIds.has(a.squad_player_id)),
          trainings,
          present,
          absenceReasons,
          now: Date.now(),
        }),
      })
    })().catch(fail)
    return () => { stale = true }
  }, [user, coachSquad.ready, coachSquad.failed, coachSquad.squad, attempt]) // eslint-disable-line react-hooks/exhaustive-deps -- inSquad/eventInSquad follow coachSquad.squad

  // "Head Coach · Rehearsal Athens · U16": the squad picked, else the coach's team.
  const line = [details?.coach_role, details?.academy, coachSquad.squad ?? details?.team].filter(Boolean).join(' · ')

  // Only an answered overview is kept for the next visit.
  useEffect(() => {
    if (user && overview && !failed) remember<HomeMemory>('coach-home', user.id, { overview, line })
  }, [user, overview, failed, line])

  const shown = overview?.rows.slice(0, SHOWN) ?? []
  const moreFlagged = overview ? overview.rows.slice(SHOWN).filter(r => r.level !== 'on-track').length : 0
  const retry = () => { if (coachSquad.failed) coachSquad.retry(); setAttempt(n => n + 1) }

  return (
    <MobileShell>
      {/* TRAK-212: the "+" (QuickAdd) is pinned to the header's empty right slot. */}
      <div className="pt-3 pb-24">
        {/* TRAK-163: the calendar is top left; TRAK-176: the squad switcher in the middle. */}
        <HomeHeader calendarTo="/coach/schedule" center={<CoachSquadSwitcher coachId={user?.id} name={profile?.full_name || 'Coach'} />} />
        {/* TRAK-196: one quiet line, as player and parent Home have it. */}
        {(line || seed?.line) && <p className="text-xs text-muted-foreground text-center -mt-1 pb-4">{line || seed?.line}</p>}
        {user && <CoachWeekStrip coachId={user.id} version={weekVersion} />}

        <section aria-label="Player overview" className="rounded-[18px] border border-white/[0.07] p-4 mt-3" style={{ background: '#101012' }}>
          <h2 className="text-[9px] font-medium tracking-[0.08em] uppercase mb-2.5 text-white/30" style={{ fontFamily: "'DM Mono', monospace" }}>
            Player overview
          </h2>
          {failed ? (
            <p role="alert" className="text-[12px] text-white/60" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Couldn't load your players.{' '}
              <button type="button" onClick={retry} className="underline text-[#C8F25A]">Retry</button>
            </p>
          ) : !overview ? (
            <p role="status" className="text-[12px] text-white/40" style={{ fontFamily: "'DM Sans', sans-serif" }}>Loading your players…</p>
          ) : overview.players === 0 ? (
            <div>
              <p className="text-[13px] font-medium text-white/70" style={{ fontFamily: "'DM Sans', sans-serif" }}>Your squad is being prepared</p>
              <p className="text-[10px] mt-0.5 text-white/35" style={{ fontFamily: "'DM Mono', monospace" }}>Your academy will add players to this squad.</p>
            </div>
          ) : shown.length === 0 ? (
            // Everyone left is waiting for a parent: nothing can be said about them yet.
            <p className="text-[12px] text-white/50" style={{ fontFamily: "'DM Sans', sans-serif" }}>Your players are waiting for a parent's approval.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {shown.map(row => (
                  <li key={row.playerId}
                    className="flex items-center gap-3 rounded-[10px] py-2.5 px-3 cursor-pointer active:scale-[0.99] transition-transform"
                    style={{ background: 'rgba(255,255,255,0.03)', borderLeft: `3px solid ${LEVEL[row.level].color}` }}
                    // TRAK-179: the player's profile, as Squad → Open profile.
                    {...openable(`Open ${row.name}'s profile: ${LEVEL[row.level].word}`, () => navigate(`/coach/player/${row.playerId}`))}>
                    <Avatar name={row.name} size="sm" className="arc flex-shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px] font-medium text-white/80" style={{ fontFamily: "'DM Sans', sans-serif" }}>{row.name}</span>
                        {/* The word, never colour alone. */}
                        <span className="flex-shrink-0 text-[9px] font-medium uppercase tracking-[0.08em]"
                          style={{ fontFamily: "'DM Mono', monospace", color: LEVEL[row.level].color }}>{LEVEL[row.level].word}</span>
                      </p>
                      {row.reasons.map(reason => (
                        <p key={reason} className="text-[11px] text-white/50 mt-[2px]" style={{ fontFamily: "'DM Sans', sans-serif" }}>{reason}</p>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              {moreFlagged > 0 && (
                <Link to="/coach/squad" className="inline-flex min-h-11 items-center text-[12px] text-[#C8F25A]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {moreFlagged} more need attention · Squad
                </Link>
              )}
            </>
          )}
        </section>

        {/* The two things a coach does most (item 10). The "+" stays for quick versions.
            Hidden only for a squad known to be empty: a failed overview mustn't stop the coach working. */}
        {overview?.players !== 0 && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button type="button" onClick={() => navigate('/coach/assess')}
              className="rounded-[14px] border p-4 text-left active:scale-[0.98] transition-transform"
              style={{ background: 'rgba(200,242,90,0.06)', borderColor: 'rgba(200,242,90,0.2)' }}>
              <Zap size={16} color="#C8F25A" fill="#C8F25A" strokeWidth={1.5} aria-hidden="true" />
              <span className="block mt-2 text-[14px] font-semibold text-[#C8F25A]" style={{ fontFamily: "'DM Sans', sans-serif" }}>Assess a player</span>
            </button>
            <button type="button" onClick={() => navigate('/coach/sessions')}
              className="rounded-[14px] border border-white/[0.07] p-4 text-left active:scale-[0.98] transition-transform"
              style={{ background: '#101012' }}>
              <ClipboardList size={16} color="rgba(255,255,255,0.8)" strokeWidth={1.75} aria-hidden="true" />
              <span className="block mt-2 text-[14px] font-semibold text-white/85" style={{ fontFamily: "'DM Sans', sans-serif" }}>Log a match or training</span>
            </button>
          </div>
        )}
      </div>
      <QuickAdd corner="top" onSaved={() => setWeekVersion(v => v + 1)} />
      <NavBar role="coach" activeTab={location.pathname} onNavigate={navigate} />
    </MobileShell>
  )
}
