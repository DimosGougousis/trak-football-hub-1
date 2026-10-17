import { useEffect, useState } from 'react'
import { Avatar } from '@/components/arc/avatar/avatar'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell, NavBar, MetadataLabel, BandPill, LoadError} from '@/components/trak'
import { QuickAdd } from '@/components/coach/QuickAdd'
import { Zap } from 'lucide-react'
import { HomeHeader, HomeTitle } from '@/components/trak/HomeHeader'
import { CoachWeekStrip } from '@/components/coach/CoachWeekStrip'
import { scoreToBand } from '@/lib/rating-engine'
import { BANDS } from '@/lib/types'
import { calculateSquadAnalytics, missedLastSession, playerOverview, type SquadAnalytics } from '@/lib/squad-analytics'
import { localTodayISO } from '@/lib/event-time'
import { trackEvent } from '@/lib/telemetry'
import { openable } from '@/lib/openable'
import { timeOfDayGreeting } from '@/lib/greeting'
import { remember, remembered } from '@/lib/screen-memory'

// Derived from BANDS rather than restated. CLAUDE.md says colours never live
// outside the BANDS config, and this file had a seventh-hand copy of them: the
// two maps happened to agree today, which is exactly how a colour survives a
// rename in one place and not the other. Two more copies exist in
// src/lib/clubMock.ts and src/lib/matchDetailHelpers.ts — player-side files,
// flagged to Tarek rather than edited here.
const BAND_COLORS: Record<string, string> = Object.fromEntries(
  BANDS.map(b => [b.word.toLowerCase(), b.color]),
)

// Player overview flags. Not band colours: these describe what a coach should
// look at, not how a child played.
const FLAG_COLORS = { attention: 'rgb(var(--t-orange))', missed: 'rgb(var(--t-warning))', improved: 'rgb(var(--t-success))' } as const

// A count not answered yet is "…", and one that failed is "—" (the banner
// above says why). Only an answered read may print a number, zero included.
// The failure is checked first: after a refresh whose re-read failed, the
// number kept from the earlier run is no longer an answer (Imad's #203 review).
const countText = (n: number | null, failed: boolean) => (failed ? '—' : n !== null ? n : '…')

const NO_FAILURES = { squad: false, assessments: false, recent: false, sessions: false }
type HomeMemory = {
  playerCount: number | null; assessments: any[]; allAssessments: any[] | null; sessionCount: number | null
  coachDetails: any; squadAnalytics: SquadAnalytics | null; missed: { playerId: string; name: string }[]; missedFailed: boolean
}

export default function CoachHomePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // TRAK-180: a revisit starts from what Home last showed this coach; every
  // read below still runs and replaces it, and a failure clears its value.
  // TRAK-182 part 8: a quick-add draft shows in the week at once.
  const [weekVersion, setWeekVersion] = useState(0)
  const [seed] = useState(() => remembered<HomeMemory>('coach-home', user?.id))
  // null = not answered yet (TRAK-92). Starting these at 0 told a coach with a
  // full season "0 players · 0 total · 0 sessions" until the reads came back.
  const [playerCount, setPlayerCount] = useState<number | null>(seed?.playerCount ?? null)
  const [assessments, setAssessments] = useState<any[]>(seed?.assessments ?? [])
  const [allAssessments, setAllAssessments] = useState<any[] | null>(seed?.allAssessments ?? null)
  // One flag per read (TRAK-92, Imad's #203 review). A single shared flag was
  // cleared by whichever read succeeded next, so a failed session count lost
  // its banner and sat on "…" for good.
  const [failed, setFailed] = useState(NO_FAILURES)
  const loadFailed = Object.values(failed).some(Boolean)
  const [sessionCount, setSessionCount] = useState<number | null>(seed?.sessionCount ?? null)
  const [coachDetails, setCoachDetails] = useState<any>(seed?.coachDetails ?? null)
  const [squadAnalytics, setSquadAnalytics] = useState<SquadAnalytics | null>(seed?.squadAnalytics ?? null)
  // A failed read's value from an earlier run is no longer an answer, so it
  // goes with the failure. Otherwise the next run, which clears the flags,
  // prints that old 0 again while its own reads are still out (Imad's third
  // #203 review). The assessment read only runs after the squad answers, so a
  // failed squad read leaves the analytics unanswered too.
  const markFailed = (read: keyof typeof NO_FAILURES) => {
    setFailed(f => ({ ...f, [read]: true }))
    if (read === 'squad') setPlayerCount(null)
    if (read === 'squad' || read === 'assessments') { setAllAssessments(null); setSquadAnalytics(null) }
    if (read === 'sessions') setSessionCount(null)
    // TRAK-180: a list remembered from the last visit goes with its failure too.
    if (read === 'recent') setAssessments([])
  }
  // Distinguishes "nothing to show" from "we could not find out". Without it
  // the band strip and the distribution chart render their empty state on a
  // failed read, which is a claim about the squad rather than about the network.
  const analyticsFailed = failed.squad || failed.assessments
  // Who missed the last training (TRAK-72 item 4). A failed check is shown as
  // such, never as "everyone was there".
  const [missed, setMissed] = useState<{ playerId: string; name: string }[]>(seed?.missed ?? [])
  const [missedFailed, setMissedFailed] = useState(seed?.missedFailed ?? false)

  useEffect(() => {
    if (!user) return
    // A response from a previous run must not overwrite the current one's
    // state on an Auth refresh for the same account.
    let cancelled = false
    // A new run asks every read again, so an earlier run's failures no longer hold.
    setFailed(NO_FAILURES)
    /* Union of two fixes that arrived on this file from opposite directions,
       and I caused the overlap: #44 (this PR) already tracked a failed roster
       and analytics read via analyticsFailed, and #79 then added loadFailed
       for the SAME screen because I did not check what this branch already
       had. Neither is redundant now — analyticsFailed guards the band strip
       and distribution, loadFailed covers the two reads #44 never checked
       (recent assessments, session count) and suppresses their false zeros.
       Taking either side whole would have dropped the other's coverage. */
    // The last training's register, with the children who could not have been
    // ticked present (waiting for a parent) left out by missedLastSession.
    const loadMissed = async (roster: { id: string; player_name: string; created_at: string | null }[]) => {
      const { data: last, error: lastError } = await supabase.from('coach_sessions')
        .select('id, session_date, session_type')
        .eq('coach_user_id', user.id).eq('session_type', 'training')
        .lte('session_date', localTodayISO())
        .order('session_date', { ascending: false }).limit(1).maybeSingle()
      if (cancelled) return
      // Never flag the last visit's names beside "couldn't check" (TRAK-180).
      if (lastError) { setMissed([]); setMissedFailed(true); return }
      if (!last) { setMissed([]); setMissedFailed(false); return }
      const [attendance, ...consent] = await Promise.all([
        supabase.from('session_attendance').select('squad_player_id')
          .eq('session_id', last.id).eq('status', 'present'),
        ...roster.map(p => supabase.rpc('coach_squad_player_consent_required' as never,
          { p_squad_player_id: p.id } as never) as unknown as Promise<{ data: boolean | null; error: unknown }>),
      ])
      if (cancelled) return
      // Any unknown answer means the flag could be wrong, so none are shown.
      if (attendance.error || consent.some(c => c.error || typeof c.data !== 'boolean')) {
        setMissed([])
        setMissedFailed(true)
        return
      }
      setMissedFailed(false)
      setMissed(missedLastSession({
        roster,
        session: last,
        present: new Set((attendance.data ?? []).map(a => a.squad_player_id)),
        waitingForParent: new Set(roster.filter((_, i) => consent[i].data === true).map(p => p.id)),
      }))
    }

    supabase.from('squad_players').select('id, player_name, created_at').eq('coach_user_id', user.id)
      .then(({ data, error }) => {
        if (cancelled) return
        // A failed roster read is not an empty roster. Falling through to
        // `data || []` here reported the squad as 0 players AND handed
        // calculateSquadAnalytics an empty roster, which flags nobody and
        // bands nobody — a coach offline would be told their squad is empty
        // and that nothing needs attention. Both statements would be false.
        if (error) {
          console.error('Squad read failed:', error)
          markFailed('squad')
          return
        }
        const players = data || []
        setPlayerCount(players.length)
        void loadMissed(players)
        // Fetch all assessments for analytics
        supabase.from('coach_assessments').select('id, squad_player_id, coach_rating, created_at')
          .eq('coach_user_id', user.id)
          .order('created_at', { ascending: false })
          .then(({ data: allData, error: assessError }) => {
            if (cancelled) return
            if (assessError) {
              console.error('Assessment read failed:', assessError)
              markFailed('assessments')
              return
            }
            const allAssess = allData || []
            setAllAssessments(allAssess)
            const analytics = calculateSquadAnalytics(players, allAssess)
            setSquadAnalytics(analytics)
            trackEvent('squad_analytics_viewed', {})
          })
      })
    supabase.from('coach_assessments').select('*, squad_players(player_name)')
      .eq('coach_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { markFailed('recent'); return }
        setAssessments(data || [])
      })
    supabase.from('coach_sessions').select('id', { count: 'exact' }).eq('coach_user_id', user.id)
      .then(({ count, error }) => {
        if (cancelled) return
        if (error) { markFailed('sessions'); return }
        setSessionCount(count || 0)
      })
    supabase.from('coach_details').select('team, coach_role').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setCoachDetails(data))
    // No coach invite code here any more (TRAK-72 item 1): players join through
    // the academy roster (J1), so a code on the coach's home did nothing.

    return () => { cancelled = true }
  }, [user])

  // Only answered, unfailed values are kept for the next visit.
  useEffect(() => {
    if (!user || loadFailed || playerCount === null) return
    remember<HomeMemory>('coach-home', user.id,
      { playerCount, assessments, allAssessments, sessionCount, coachDetails, squadAnalytics, missed, missedFailed })
  }, [user, loadFailed, playerCount, assessments, allAssessments, sessionCount, coachDetails, squadAnalytics, missed, missedFailed])

  const greeting = timeOfDayGreeting()
  const overviewRows = squadAnalytics ? playerOverview(squadAnalytics, missed) : []

  // Squad bands: one chip per band that any player is currently in, in that
  // band's own colour.
  //
  // This strip used to collapse seven bands into four glyphs, and both halves
  // of that were wrong:
  //
  //   good + steady  -> one green check, in Good's green. Tarek saw it on a
  //                     real phone: "1 of the 3 classified as good should have
  //                     been steady." The screen could not tell them apart.
  //   developing +
  //   difficult      -> one dash, coloured rgb(var(--t-info)) — which BANDS assigns to
  //                     STEADY. The two weakest bands rendered in a mid-band
  //                     blue, so a struggling squad read as an unremarkable one.
  //
  // It also counted ASSESSMENTS while sitting beside the player count and
  // calling itself "Squad bands". The busiest coach in the pilot database has
  // 52 assessments across 21 players, so the strip added up to 52 next to a
  // squad of 21. squadBands takes each player's latest assessment instead.
  const squadBandChips = squadAnalytics
    ? BANDS.map(b => ({ word: b.word, color: b.color, count: squadAnalytics.squadBands[b.word.toLowerCase()] || 0 }))
        .filter(c => c.count > 0)
    : []

  // Trend: last 5 assessments for mini-chart. An unrated assessment is dropped
  // rather than drawn at the midpoint — a bar the coach never earned.
  const trendAssessments = (allAssessments ?? []).filter(a => a.coach_rating != null).slice(0, 5).reverse()
  const trendHeights = trendAssessments.map(a => {
    const r = Number(a.coach_rating)
    return Math.max(20, Math.min(100, ((r - 2) / 8) * 100))
  })

  // Max band count for bar chart scaling
  const maxBandCount = squadAnalytics
    ? Math.max(1, ...Object.values(squadAnalytics.bandDistribution))
    : 1

  return (
    <MobileShell>
      <div className="pt-3 pb-4">
        {/* TRAK-163: the calendar is top left (it replaces the "Smart Calendar" button), then the next seven days. */}
        <HomeHeader calendarTo="/coach/schedule" center={<HomeTitle>{profile?.full_name || 'Coach'}</HomeTitle>} />
        {user && <CoachWeekStrip coachId={user.id} version={weekVersion} />}

        {/* A failed load must not be reported as a season with nothing in it.
            Shown above the stats rather than replacing them, so anything that
            DID load still reaches the coach — partial truth beats a blank
            screen, and beats a confident zero. */}
        {loadFailed && (
          <div className="mb-4">
            <LoadError what="your squad" />
          </div>
        )}

        {/* Identity section */}
        <div className="py-2.5 pb-4">
          <p className="text-xs" style={{ color: 'rgb(var(--t-ink-3))' }}>{greeting}</p>
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 h-5 px-2.5 rounded-full border border-line text-[8px] font-medium tracking-[0.06em] uppercase"
              style={{
                fontFamily: 'var(--t-font-mono)',
                background: 'rgb(var(--t-raised))',
                color: 'rgb(var(--t-ink-3))',
              }}
            >
              <span className="w-1 h-1 rounded-full" style={{ background: 'rgb(var(--t-brand))' }} />
              Active
            </span>
            {coachDetails?.coach_role && (
              <span
                className="h-5 px-2.5 rounded-full border border-line text-[8px] font-medium tracking-[0.06em] uppercase inline-flex items-center"
                style={{
                  fontFamily: 'var(--t-font-mono)',
                  background: 'rgb(var(--t-raised))',
                  color: 'rgb(var(--t-ink-3))',
                }}
              >
                {coachDetails.coach_role}
              </span>
            )}
            {/* The age group alone (TRAK-72 item 11): it waited for the typed
                current_club, which is empty for staff Trak sets up, so it never
                showed. The academy's name is on Profile and Settings. */}
            {coachDetails?.team && (
              <span
                className="h-5 px-2.5 rounded-full border border-line text-[8px] font-medium tracking-[0.06em] uppercase inline-flex items-center"
                style={{
                  fontFamily: 'var(--t-font-mono)',
                  background: 'rgb(var(--t-raised))',
                  color: 'rgb(var(--t-ink-3))',
                }}
              >
                {coachDetails.team}
              </span>
            )}
          </div>
        </div>

        {/* Hero card */}
        <div
          className="relative overflow-hidden rounded-[24px] border border-line p-5 my-[6px] mb-[14px]"
          style={{ background: 'linear-gradient(135deg, rgb(var(--t-surface)) 0%, rgb(var(--t-surface)) 100%)' }}
        >
          {/* Radial glow ::after pseudo via div */}
          <div
            className="absolute -bottom-[60px] -right-[60px] w-[200px] h-[200px] rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgb(var(--t-brand) / 0.08) 0%, transparent 70%)' }}
          />

          <div className="flex items-start justify-between mb-4 relative z-10">
            {/* Left: player count */}
            <div>
              <MetadataLabel text="THIS SEASON" />
              <p
                className="text-[52px] leading-none mt-2"
                style={{
                  fontFamily: 'var(--t-font)',
                  fontWeight: 300,
                  letterSpacing: '-0.04em',
                  color: 'rgb(var(--t-brand))',
                }}
              >
                {countText(playerCount, failed.squad)}
              </p>
              <p
                className="text-[9px] mt-1.5 tracking-[0.04em]"
                style={{ fontFamily: 'var(--t-font-mono)', color: 'rgb(var(--t-ink-3))' }}
              >
                Players in squad
              </p>
            </div>

            {/* Right: assessments + trend chart */}
            <div className="text-right">
              <p
                className="text-[9px] font-medium tracking-[0.12em] uppercase mb-2"
                style={{ fontFamily: 'var(--t-font-mono)', color: 'rgb(var(--t-ink-3))' }}
              >
                Assessments
              </p>
              {trendHeights.length > 0 && (
                <div className="flex items-end gap-[3px] h-8 justify-end">
                  {trendHeights.map((h, i) => (
                    <div
                      key={i}
                      className="w-2.5 rounded-t"
                      style={{
                        height: `${h}%`,
                        background:
                          i >= trendHeights.length - 2
                            ? i === trendHeights.length - 1
                              ? 'rgb(var(--t-brand))'
                              : 'rgb(var(--t-brand) / 0.35)'
                            : 'rgb(var(--t-raised))',
                      }}
                    />
                  ))}
                </div>
              )}
              <p
                className="text-[13px] font-medium mt-1.5"
                style={{ fontFamily: 'var(--t-font)', color: 'rgb(var(--t-ink-3))' }}
              >
                {analyticsFailed ? 'Not available' : allAssessments ? `${allAssessments.length} total` : 'Loading…'}
              </p>
            </div>
          </div>

          {/* Band summary strip */}
          <div
            className="trak-dark flex items-center justify-between px-3 py-2.5 rounded-[10px] relative z-10"
            style={{ background: 'rgb(var(--t-surface))' }}
          >
            <div className="flex items-center gap-[7px]">
              <div className="w-[5px] h-[5px] rounded-full" style={{ background: 'rgb(var(--t-ink) / 0.2)' }} />
              <span
                className="text-[9px] font-medium tracking-[0.08em] uppercase"
                style={{ fontFamily: 'var(--t-font-mono)', color: 'rgb(var(--t-ink-3))' }}
              >
                Squad bands
              </span>
            </div>
            <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar">
              {analyticsFailed ? (
                <span
                  className="text-[10px]"
                  style={{ fontFamily: 'var(--t-font-mono)', color: 'rgb(var(--t-warning) / 0.7)' }}
                >
                  Couldn't load
                </span>
              ) : squadBandChips.length === 0 ? (
                <span
                  className="text-[10px]"
                  style={{ fontFamily: 'var(--t-font-mono)', color: 'rgb(var(--t-ink-3))' }}
                >
                  {squadAnalytics ? 'No assessments yet' : 'Loading…'}
                </span>
              ) : (
                squadBandChips.map(chip => (
                  // The word, not a glyph. Four glyphs cannot name seven bands,
                  // and a coach reading a colour alone is reading the thing that
                  // was wrong here in the first place.
                  <span
                    key={chip.word}
                    className="inline-flex items-center gap-1 text-xs whitespace-nowrap flex-shrink-0"
                    style={{ fontFamily: 'var(--t-font)', color: chip.color }}
                  >
                    {chip.count}
                    <span className="text-[9px]" style={{ fontFamily: 'var(--t-font-mono)' }}>
                      {chip.word}
                    </span>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick actions grid */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            onClick={() => navigate('/coach/squad')}
            className="rounded-[10px] p-[11px_8px] text-center active:scale-95 transition-transform"
            style={{ background: 'rgb(var(--t-raised))' }}
          >
            <p
              className="text-[22px] leading-none"
              style={{
                fontFamily: 'var(--t-font)',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                color: 'rgb(var(--t-ink))',
              }}
            >
              {countText(playerCount, failed.squad)}
            </p>
            <span
              className="text-[8px] font-medium tracking-[0.1em] uppercase mt-[5px] block"
              style={{ fontFamily: 'var(--t-font-mono)', color: 'rgb(var(--t-ink-3))' }}
            >
              {playerCount === 1 ? 'Player' : 'Players'}
            </span>
          </button>
          {/* The count is of past sessions, so the tile opens their history,
              not the log-a-session chooser (TRAK-72 item 3). */}
          <button
            onClick={() => navigate('/coach/sessions/list')}
            className="rounded-[10px] p-[11px_8px] text-center active:scale-95 transition-transform"
            style={{ background: 'rgb(var(--t-raised))' }}
          >
            <p
              className="text-[22px] leading-none"
              style={{
                fontFamily: 'var(--t-font)',
                fontWeight: 400,
                letterSpacing: '-0.02em',
                color: 'rgb(var(--t-ink))',
              }}
            >
              {countText(sessionCount, failed.sessions)}
            </p>
            <span
              className="text-[8px] font-medium tracking-[0.1em] uppercase mt-[5px] block"
              style={{ fontFamily: 'var(--t-font-mono)', color: 'rgb(var(--t-ink-3))' }}
            >
              Sessions
            </span>
          </button>
        </div>

        {/* Empty squad callout. Not after a failed re-read: the 0 is from
            the earlier run, and the squad may have changed since. */}
        {playerCount === 0 && !failed.squad && (
          <div
            className="w-full mt-3 rounded-[14px] border p-4 text-left"
            style={{ background: 'rgb(var(--t-surface))', borderColor: 'rgb(var(--t-line))' }}
          >
            <p className="text-[13px] font-medium text-ink-2" style={{ fontFamily: 'var(--t-font)' }}>
              Your squad is being prepared
            </p>
            <p className="text-[10px] mt-0.5 text-ink-3" style={{ fontFamily: 'var(--t-font-mono)' }}>
              Your academy will add players to this squad.
            </p>
          </div>
        )}

        {/* Full assessment entry */}
        {playerCount !== null && playerCount > 0 && (
          <button
            onClick={() => navigate('/coach/assess')}
            className="w-full mt-3 relative overflow-hidden rounded-[14px] border p-4 text-left active:scale-[0.98] transition-transform"
            style={{
              background: 'rgb(var(--t-brand) / 0.06)',
              borderColor: 'rgb(var(--t-brand) / 0.2)',
              boxShadow: '0 0 28px rgb(var(--t-brand) / 0.06)',
            }}
          >
            <div
              className="absolute -bottom-[40px] -right-[40px] w-[140px] h-[140px] rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgb(var(--t-brand) / 0.1) 0%, transparent 70%)' }}
            />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={16} color="rgb(var(--t-brand))" fill="rgb(var(--t-brand))" strokeWidth={1.5} />
                <span
                  className="text-[14px] font-semibold"
                  style={{ color: 'rgb(var(--t-brand))', fontFamily: 'var(--t-font)' }}
                >
                  Assess players
                </span>
              </div>
              <p
                className="text-[11px] mt-1"
                style={{ fontFamily: 'var(--t-font-mono)', color: 'rgb(var(--t-ink-3))' }}
              >
                Choose a player and record their assessment
              </p>
            </div>
          </button>
        )}

        {/* AI Tools. TRAK-163: "Smart Calendar" removed; the calendar is the header's top-left button. */}
        <div className="mt-3">
          <button
            onClick={() => navigate('/coach/assistant')}
            className="w-full rounded-[14px] border p-3.5 text-left active:scale-[0.98] transition-transform"
            style={{ background: 'rgb(var(--t-surface))', borderColor: 'rgb(var(--t-line))' }}
          >
            <p className="text-[13px] font-medium" style={{ color: 'rgb(var(--t-ink))' }}>Coach Assistant</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgb(var(--t-ink-3))' }}>Drills & session ideas</p>
          </button>
        </div>

        {/* Recent Assessments */}
        {assessments.length > 0 && (
          <div className="mt-5">
            <MetadataLabel text="RECENT ASSESSMENTS" />
            <div className="mt-2.5">
              {assessments.map(a => {
                const playerName = a.squad_players?.player_name || 'Player'
                const formattedDate = new Date(a.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                })
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-[14px] border border-line p-[13px_14px] mb-2 cursor-pointer active:scale-[0.99] transition-transform"
                    style={{ background: 'rgb(var(--t-surface))' }}
                    // TRAK-179 (16 Oct): the player's profile, as Squad → Open profile; the
                    // assessment is in their history there.
                    {...openable(`Open ${playerName}'s profile, assessed ${formattedDate}`,
                      () => navigate(`/coach/player/${a.squad_player_id}`))}
                  >
                    <Avatar name={playerName} size="md" className="arc" aria-hidden />
                    {/* Name + metadata */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[13px] font-medium truncate"
                        style={{ color: 'rgb(var(--t-ink))' }}
                      >
                        {playerName}
                      </p>
                      <p
                        className="text-[9px] mt-[3px] tracking-[0.04em]"
                        style={{ fontFamily: 'var(--t-font-mono)', color: 'rgb(var(--t-ink-3))' }}
                      >
                        {formattedDate} · {a.appearance || 'Assessment'}
                      </p>
                    </div>
                    {/* Band pill. No `|| 5` fallback: showing "Mixed" for an
                        assessment whose rating we do not have is an opinion
                        about a child that no coach recorded. */}
                    <div className="flex-shrink-0">
                      {a.coach_rating != null && <BandPill band={scoreToBand(Number(a.coach_rating))} />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Squad Overview */}
        {squadAnalytics && squadAnalytics.totalAssessments > 0 && (
          <div className="mt-5">
            <span
              className="text-[9px] font-medium tracking-[0.12em] uppercase block mb-3"
              style={{ fontFamily: 'var(--t-font-mono)', color: 'rgb(var(--t-ink-3))' }}
            >
              Squad Overview
            </span>

            {/* Band Distribution Bar Chart */}
            <div
              className="trak-dark rounded-[18px] border border-line p-4 mb-3"
              style={{ background: 'rgb(var(--t-surface))' }}
            >
              <span
                className="text-[9px] font-medium tracking-[0.08em] uppercase block mb-3"
                style={{ fontFamily: 'var(--t-font-mono)', color: 'rgb(var(--t-ink-3))' }}
              >
                Band Distribution · all assessments
              </span>
              <div className="flex flex-col gap-[7px]">
                {BANDS.map(b => {
                  const bandKey = b.word.toLowerCase()
                  const count = squadAnalytics.bandDistribution[bandKey] || 0
                  const widthPct = maxBandCount > 0 ? (count / maxBandCount) * 100 : 0
                  return (
                    <div key={bandKey} className="flex items-center gap-2">
                      <span
                        className="text-[10px] w-[90px] flex-shrink-0 text-right"
                        style={{
                          fontFamily: 'var(--t-font-mono)',
                          color: BAND_COLORS[bandKey] || 'rgb(var(--t-ink-3))',
                        }}
                      >
                        {b.word}
                      </span>
                      <div
                        className="flex-1 h-[14px] rounded-[4px] overflow-hidden"
                        style={{ background: 'rgb(var(--t-raised))' }}
                      >
                        {count > 0 && (
                          <div
                            className="h-full rounded-[4px] transition-all duration-500"
                            style={{
                              width: `${widthPct}%`,
                              minWidth: '4px',
                              background: BAND_COLORS[bandKey] || 'rgb(var(--t-ink) / 0.4)',
                              opacity: 0.7,
                            }}
                          />
                        )}
                      </div>
                      <span
                        className="text-[10px] w-[24px] text-right flex-shrink-0"
                        style={{
                          fontFamily: 'var(--t-font-mono)',
                          color: count > 0 ? 'rgb(var(--t-ink-2))' : 'rgb(var(--t-ink-3))',
                        }}
                      >
                        {count}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        )}

        {/* Player overview (TRAK-72 item 4): one list of short flags per
            player, replacing the separate Most Improved and Needs Attention
            cards. Outside the assessments gate, because "missed the last
            session" is about attendance, not assessments. */}
        {squadAnalytics && (overviewRows.length > 0 || missedFailed) && (
          <section
            aria-label="Player overview"
            className="rounded-[18px] border border-line p-4 mt-3"
            style={{ background: 'rgb(var(--t-surface))' }}
          >
            <span
              className="text-[9px] font-medium tracking-[0.08em] uppercase block mb-2.5"
              style={{ fontFamily: 'var(--t-font-mono)', color: 'rgb(var(--t-ink-3))' }}
            >
              Player overview
            </span>
            <ul className="flex flex-col gap-2">
              {overviewRows.map(row => (
                <li
                  key={row.playerId}
                  className="rounded-[10px] py-2.5 px-3"
                  style={{
                    background: 'rgb(var(--t-raised))',
                    borderLeft: `3px solid ${FLAG_COLORS[row.flags[0].kind]}`,
                  }}
                >
                  <p
                    className="text-[13px] font-medium"
                    style={{ fontFamily: 'var(--t-font)', color: 'rgb(var(--t-ink))' }}
                  >
                    {row.name}
                  </p>
                  <p className="flex flex-wrap gap-x-2 mt-[2px]">
                    {row.flags.map(flag => (
                      <span
                        key={flag.kind}
                        className="text-[10px]"
                        style={{ fontFamily: 'var(--t-font-mono)', color: FLAG_COLORS[flag.kind] }}
                      >
                        {flag.label}
                      </span>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
            {missedFailed && (
              <p className="text-[10px] text-ink-3 mt-2" style={{ fontFamily: 'var(--t-font)' }}>
                Couldn't check the last session's attendance. Reload to try again.
              </p>
            )}
          </section>
        )}
      </div>
      <QuickAdd onSaved={() => setWeekVersion(v => v + 1)} />
      <NavBar role="coach" activeTab={location.pathname} onNavigate={navigate} />
    </MobileShell>
  )
}
