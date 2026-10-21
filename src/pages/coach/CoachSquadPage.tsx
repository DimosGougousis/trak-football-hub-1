import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/arc/avatar/avatar'
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet'
import { SearchField } from '@/components/arc/search-field/search-field'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { LayoutGroup } from 'motion/react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell, NavBar, BandPill } from '@/components/trak'
import { QuickAdd } from '@/components/coach/QuickAdd'
import { scoreToBand } from '@/lib/rating-engine'
import { Users, WifiOff } from 'lucide-react'
import { fetchWaitReason } from '@/lib/wait-reason'
import type { Tables } from '@/integrations/supabase/types'
import { remember, remembered } from '@/lib/screen-memory'
import { useCoachSquad } from '@/lib/coach-squad'
import { useQuery } from '@tanstack/react-query'
import { loadTrainingAttendance } from '@/lib/attendance-rate'

// TRAK-180: what Squad last showed a coach (see screen-memory).
type SquadMemory = { players: any[]; assessments: Record<string, number>; consent: Record<string, ConsentStatus> }

// Short labels so five fit one row on a phone; the value is the stored position.
const POSITIONS = [
  { value: 'All', label: 'All' }, { value: 'Goalkeeper', label: 'GK' }, { value: 'Defender', label: 'DEF' },
  { value: 'Midfielder', label: 'MID' }, { value: 'Attacker', label: 'ATT' },
]

/* J5: the squad marks each player "Ready to assess" or why they aren't yet:
   no parent approval ('waiting'), or approved but not signed up ('signup',
   TRAK-99). 'notReady' when the gate says no but the reason couldn't be read;
   'unknown' when the gate check itself failed. The screen never claims a
   player is ready on a guess. The database still refuses the write either way. */
type ConsentStatus = 'ready' | 'waiting' | 'signup' | 'player' | 'notReady' | 'unknown'

const CONSENT_CHIP: Record<ConsentStatus, { label: string; color: string; bg: string }> = {
  ready:    { label: 'Ready to assess',               color: 'rgb(var(--t-brand))',             bg: 'rgb(var(--t-brand) / 0.10)' },
  waiting:  { label: 'Waiting for parent',            color: 'rgb(var(--t-warning))',     bg: 'rgb(var(--t-warning) / 0.10)' },
  signup:   { label: 'Waiting for player to sign up', color: 'rgb(var(--t-warning))',     bg: 'rgb(var(--t-warning) / 0.10)' },
  player:   { label: 'Waiting for player to agree',   color: 'rgb(var(--t-warning))',     bg: 'rgb(var(--t-warning) / 0.10)' },
  notReady: { label: 'Not ready to assess',           color: 'rgb(var(--t-warning))',     bg: 'rgb(var(--t-warning) / 0.10)' },
  unknown:  { label: 'Status unknown',                color: 'rgb(var(--t-ink-3))', bg: 'rgb(var(--t-raised))' },
}

/** The gate first, the same predicate the RLS policy evaluates; the reason only for a player it refuses. */
async function squadStatus(squadPlayerId: string): Promise<ConsentStatus> {
  const { data: required, error } = await supabase.rpc('coach_squad_player_consent_required' as never, { p_squad_player_id: squadPlayerId } as never)
  if (error || typeof required !== 'boolean') return 'unknown'
  if (!required) return 'ready'
  const reason = await fetchWaitReason(squadPlayerId)
  return reason === 'parent' ? 'waiting' : reason === 'signup' ? 'signup' : reason === 'player' ? 'player' : 'notReady'
}

export default function CoachSquadPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // TRAK-180: a revisit starts from what this screen last showed this coach,
  // and the reads below refresh it as a background run (TRAK-79).
  const [seed] = useState(() => remembered<SquadMemory>('coach-squad', user?.id))
  const [players, setPlayers] = useState<any[]>(seed?.players ?? [])
  const [assessments, setAssessments] = useState<Record<string, number>>(seed?.assessments ?? {})
  const [consent, setConsent] = useState<Record<string, ConsentStatus>>(seed?.consent ?? {})
  // Whether the squad has answered at all: until then it is loading, not empty.
  const [loaded, setLoaded] = useState(Boolean(seed))
  const [posFilter, setPosFilter] = useState<string>('All')
  const [query, setQuery] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  // The account and Retry count of the last squad read that finished. A run
  // for the same pair is a background refresh (see the load below).
  const loadedFor = useRef<{ userId: string; retry: number } | null>(seed && user ? { userId: user.id, retry: 0 } : null)

  // Age group label: prefer the age_group text column ('U12'), fall back to legacy integer age
  const ageLabel = (p: any): string | null => p.age_group ?? (p.age != null ? String(p.age) : null)

  // TRAK-176: with two squads the coach sees the one picked (here or on Home).
  const { squads, squad, setSquad, inSquad } = useCoachSquad(user?.id)
  const inView = players.filter(p => inSquad(ageLabel(p)))

  useEffect(() => {
    if (!user) return
    let cancelled = false
    // AuthContext hands out a new user object on every same-account token
    // refresh (hourly, and on returning to the tab), which re-runs this load.
    // That re-run keeps the chips on screen and replaces them from its own
    // checks, instead of blinking them all off (TRAK-79). A first load, a
    // Retry and a different account still start from nothing.
    const background = loadedFor.current?.userId === user.id && loadedFor.current.retry === retry
    // A background run also keeps a failure on screen until its own read
    // succeeds, so a refresh never shows an empty squad in its place (UC-X02;
    // Tarek, #149 review).
    if (!background) { setConsent({}); setLoadFailed(false) }

    // Fetch squad players.
    // The error must be checked: falling through to `data || []` renders a
    // failed read as an empty squad, so a coach offline with a full roster is
    // shown "Your squad is being prepared".
    supabase
      .from('squad_players')
      .select('*')
      .eq('coach_user_id', user.id)
      .order('player_name')
      .then(({ data, error }) => {
        if (cancelled) return
        loadedFor.current = { userId: user.id, retry }
        if (error) {
          setLoadFailed(true)
          return
        }
        setLoadFailed(false)
        setPlayers(data || [])
        setLoaded(true)
        // One check per player, the same predicate the RLS policy evaluates. A
        // pilot squad is about 25 players, so this stays a handful of requests.
        void Promise.all((data || []).map(p =>
          squadStatus(p.id).then((status): [string, ConsentStatus] => [p.id, status]),
        )).then(entries => { if (!cancelled) setConsent(Object.fromEntries(entries)) })
      })

    // Fetch latest assessment per player for band display.
    // A failure here is not fatal — the squad still renders, just without
    // bands — but it must not be mistaken for "nobody has been assessed".
    // No .eq('coach_user_id', ...): the band should show the academy's latest
    // assessment, not only this coach's. K7's migration adds the read policy
    // that makes that possible — dropping the filter alone would have changed
    // nothing, because "Coaches can select own assessments" was itself scoped
    // to auth.uid().
    //
    // RLS does the scoping now, which is the right place for it: a colleague's
    // assessment on a roster row in this academy is visible, another academy's
    // is not, and a departed coach sees neither.
    supabase
      .from('coach_assessments')
      .select('squad_player_id, coach_rating, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        const latest: Record<string, number> = {}
        for (const a of data) {
          if (a.squad_player_id && latest[a.squad_player_id] === undefined && a.coach_rating != null) {
            latest[a.squad_player_id] = Number(a.coach_rating)
          }
        }
        setAssessments(latest)
      })

    return () => { cancelled = true }
  }, [user, retry])

  useEffect(() => {
    if (user && loaded && !loadFailed) remember<SquadMemory>('coach-squad', user.id, { players, assessments, consent })
  }, [user, loaded, loadFailed, players, assessments, consent])

  const search = query.trim().toLowerCase().replace(/^#/, '')
  const filtered = inView.filter(p => {
    const posMatch = posFilter === 'All' || p.position?.toLowerCase() === posFilter.toLowerCase()
    const searchMatch = !search || String(p.player_name ?? '').toLowerCase().includes(search) || String(p.shirt_number ?? '') === search
    return posMatch && searchMatch
  })
  const clearFilters = () => { setPosFilter('All'); setQuery('') }

  return (
    <MobileShell width="wide">
      {/* TRAK-182 (Imad's 6d/6g): a squad directory built from Arc's free parts:
          search, filters, avatar rows, and a player panel in a bottom sheet. */}
      <div className="flex items-baseline justify-between px-5 pt-4 pb-1 shrink-0">
        <h1 className="text-[22px] font-medium tracking-[-0.01em] text-ink">Squad</h1>
        {inView.length > 0 && <p className="text-[13px] text-ink-3">{squad ? `${squad} · ` : ''}{inView.length} {inView.length === 1 ? 'player' : 'players'}</p>}
      </div>

      {players.length > 0 && (
        <div className="arc px-5 pt-2 pb-3 space-y-3 shrink-0 [&_label]:sr-only">
          <SearchField label="Search players" placeholder="Name or shirt number" value={query} onValueChange={setQuery} />
          {/* TRAK-176: the coach's squads, when there are two or more; the pick is shared with Home. */}
          {squad && squads.length >= 2 && (
            <LayoutGroup id="age">
              <div className="flex justify-center">
                <SegmentedControl label="Squad" value={squad} onValueChange={setSquad}
                  options={squads.map(age => ({ value: age, label: age }))} />
              </div>
            </LayoutGroup>
          )}
          {/* Each control's highlight shares Arc's layoutId; a group keeps the two from swapping it.
              Centred under the search (Imad, 16 Oct). */}
          <LayoutGroup id="position">
            <div className="flex justify-center">
              <SegmentedControl label="Position" value={posFilter} onValueChange={setPosFilter} options={POSITIONS} />
            </div>
          </LayoutGroup>
        </div>
      )}

      {/* Squad list */}
      <div className="flex-1 overflow-y-auto px-5 pb-40">
        {loadFailed ? (
          <div className="flex flex-col items-center text-center pt-14 px-6">
            <div
              className="w-14 h-14 rounded-[16px] flex items-center justify-center mb-4"
              style={{ background: 'rgb(var(--t-warning) / 0.08)', border: '1px solid rgb(var(--t-warning) / 0.15)' }}
            >
              <WifiOff size={22} className="text-warning" strokeWidth={1.5} />
            </div>
            <p className="text-[15px] text-ink-2 font-medium mb-1">Couldn't load your squad</p>
            <p className="text-[12px] text-ink-3 leading-relaxed mb-5">
              {navigator.onLine
                ? "We couldn't reach Trak just now. Nothing has been lost — your squad is safe."
                : 'You appear to be offline. Nothing has been lost — your squad is safe.'}
            </p>
            <button
              onClick={() => setRetry(r => r + 1)}
              className="px-5 py-2.5 rounded-[10px] text-[13px] font-medium text-on-brand"
              style={{ background: 'rgb(var(--t-brand))' }}
            >
              Try again
            </button>
          </div>
        ) : !loaded ? (
          <p role="status" className="pt-14 text-center text-[13px] text-ink-3">Loading your squad…</p>
        ) : filtered.length === 0 ? (
          players.length === 0 ? (
            <div className="flex flex-col items-center text-center pt-14 px-6">
              <div
                className="w-14 h-14 rounded-[16px] flex items-center justify-center mb-4"
                style={{ background: 'rgb(var(--t-brand) / 0.08)', border: '1px solid rgb(var(--t-brand) / 0.15)' }}
              >
                <Users size={22} className="text-brand" strokeWidth={1.5} />
              </div>
              <p className="text-[15px] text-ink-2 font-medium mb-1">Your squad is being prepared</p>
              <p className="text-[12px] text-ink-3 leading-relaxed mb-5">
                Your academy will add players to this squad.
              </p>
            </div>
          ) : (
            <div className="pt-8 text-center">
              <p className="text-[13px] text-ink-3 mb-2">{search ? 'No players match that search.' : 'No players match that filter.'}</p>
              <button
                onClick={clearFilters}
                className="text-[11px] text-brand"
              >
                Clear filters
              </button>
            </div>
          )
        ) : (
          // TRAK-252: side by side on a coach's tablet (2) or laptop (3).
          <ul className="tablet:grid tablet:grid-cols-2 tablet:gap-x-6 laptop:grid-cols-3">
            {filtered.map(p => {
              const score = assessments[p.id] ?? p.overall_score ?? null
              return (
                <li key={p.id}>
                  <PlayerPanel player={p} age={ageLabel(p)} score={score} status={consent[p.id]} trigger={
                    <button type="button"
                      className="w-full flex items-center gap-3 py-3 border-b border-line active:bg-raised transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md">
                      <Avatar name={p.player_name || '?'} size="md" className="arc" aria-hidden />
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-ink truncate">{p.player_name}</p>
                        <p className="text-[12px] text-ink-3 mt-0.5 truncate">{metaLine(p, ageLabel(p))}</p>
                        {consent[p.id] && <StatusChip status={consent[p.id]} />}
                      </div>
                      {score !== null && <BandPill band={scoreToBand(score)} />}
                    </button>
                  } />
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <QuickAdd />
      <NavBar role="coach" activeTab={location.pathname} onNavigate={navigate} />
    </MobileShell>
  )
}

type SquadRow = Tables<'squad_players'>

const metaLine = (p: SquadRow, age: string | null) =>
  [p.position || 'Position not set', p.shirt_number ? `#${p.shirt_number}` : null, age].filter(Boolean).join(' · ')

function StatusChip({ status }: { status: ConsentStatus }) {
  const chip = CONSENT_CHIP[status]
  return <span className="inline-flex items-center h-[20px] px-2 mt-1 rounded-[6px] text-[11px] font-medium"
    style={{ color: chip.color, background: chip.bg }}>{chip.label}</span>
}

/** TRAK-182 (Imad, 18 Oct; pilot coach's item 15): training attendance, read when the panel opens.
    Nothing while loading, on a failed read, before any training counts (never a false 0%), or for a
    child waiting for a parent (they can't be ticked). Same rules as the Feedback and assessment tab (TRAK-211). */
function AttendanceLine({ player }: { player: SquadRow }) {
  const { user } = useAuth()
  const rate = useQuery({
    queryKey: ['coach', user?.id, 'attendance', player.id],
    enabled: Boolean(user && player.created_at),
    queryFn: () => loadTrainingAttendance(user!.id, { id: player.id, created_at: player.created_at!, age_group: player.age_group }),
  })
  if (!rate.data) return null
  return <p className="text-[13px] text-ink-2"><span className="text-ink">Attendance {rate.data.percent}%</span>
    {' · '}<span>{rate.data.attended} of {rate.data.total} trainings</span></p>
}

/** The player panel: who they are, the status chip (whether they can be assessed), their band, and where to go next. */
function PlayerPanel({ player, age, score, status, trigger }: {
  player: SquadRow; age: string | null; score: number | null; status: ConsentStatus | undefined; trigger: JSX.Element
}) {
  const navigate = useNavigate()
  const name = player.player_name || 'Player'
  const button = 'inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-5 text-[14px] font-medium focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50'
  return (
    <BottomSheet trigger={trigger} title={name} description={metaLine(player, age)} detents={[0.5, 0.92]} className="arc">
      <div className="space-y-5 pb-4">
        <div className="flex items-center gap-4">
          <Avatar name={name} size="lg" className="arc" aria-hidden />
          <div className="space-y-1">
            {status ? <StatusChip status={status} /> : <p className="text-[13px] text-ink-2">Checking status…</p>}
            <div className="flex items-center gap-2 text-[13px] text-ink-2">
              {score !== null ? <>Latest band <BandPill band={scoreToBand(score)} /></> : 'Not assessed yet'}
            </div>
            {status === 'ready' && <AttendanceLine player={player} />}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={status !== 'ready'} className={`${button} bg-brand text-on-brand`}
            onClick={() => navigate('/coach/assess', { state: { preselectedPlayerId: player.id } })}>Assess</button>
          <button type="button" className={`${button} border border-line-strong text-ink`}
            onClick={() => navigate(`/coach/player/${player.id}`)}>Open profile</button>
        </div>
      </div>
    </BottomSheet>
  )
}
