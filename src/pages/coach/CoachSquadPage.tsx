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
import { scoreToBand } from '@/lib/rating-engine'
import { Users, WifiOff } from 'lucide-react'
import { fetchWaitReason } from '@/lib/wait-reason'
import type { Tables } from '@/integrations/supabase/types'

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
type ConsentStatus = 'ready' | 'waiting' | 'signup' | 'notReady' | 'unknown'

const CONSENT_CHIP: Record<ConsentStatus, { label: string; color: string; bg: string }> = {
  ready:    { label: 'Ready to assess',               color: '#C8F25A',             bg: 'rgba(200,242,90,0.10)' },
  waiting:  { label: 'Waiting for parent',            color: 'rgb(251,191,36)',     bg: 'rgba(251,191,36,0.10)' },
  signup:   { label: 'Waiting for player to sign up', color: 'rgb(251,191,36)',     bg: 'rgba(251,191,36,0.10)' },
  notReady: { label: 'Not ready to assess',           color: 'rgb(251,191,36)',     bg: 'rgba(251,191,36,0.10)' },
  unknown:  { label: 'Status unknown',                color: 'rgba(255,255,255,0.45)', bg: 'rgba(255,255,255,0.06)' },
}

/** The gate first, the same predicate the RLS policy evaluates; the reason only for a player it refuses. */
async function squadStatus(squadPlayerId: string): Promise<ConsentStatus> {
  const { data: required, error } = await supabase.rpc('coach_squad_player_consent_required' as never, { p_squad_player_id: squadPlayerId } as never)
  if (error || typeof required !== 'boolean') return 'unknown'
  if (!required) return 'ready'
  const reason = await fetchWaitReason(squadPlayerId)
  return reason === 'parent' ? 'waiting' : reason === 'signup' ? 'signup' : 'notReady'
}

export default function CoachSquadPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [players, setPlayers] = useState<any[]>([])
  const [assessments, setAssessments] = useState<Record<string, number>>({})
  const [consent, setConsent] = useState<Record<string, ConsentStatus>>({})
  const [posFilter, setPosFilter] = useState<string>('All')
  const [ageFilter, setAgeFilter] = useState<string>('All')
  const [query, setQuery] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  // The account and Retry count of the last squad read that finished. A run
  // for the same pair is a background refresh (see the load below).
  const loadedFor = useRef<{ userId: string; retry: number } | null>(null)

  // Age group label: prefer the age_group text column ('U12'), fall back to legacy integer age
  const ageLabel = (p: any): string | null => p.age_group ?? (p.age != null ? String(p.age) : null)

  // Derive age groups present in the squad (sorted)
  const ageGroups = Array.from(
    new Set(players.map(ageLabel).filter(Boolean))
  ).sort() as string[]

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

  const search = query.trim().toLowerCase().replace(/^#/, '')
  const filtered = players.filter(p => {
    const posMatch = posFilter === 'All' || p.position?.toLowerCase() === posFilter.toLowerCase()
    const ageMatch = ageFilter === 'All' || ageLabel(p) === ageFilter
    const searchMatch = !search || String(p.player_name ?? '').toLowerCase().includes(search) || String(p.shirt_number ?? '') === search
    return posMatch && ageMatch && searchMatch
  })
  const clearFilters = () => { setPosFilter('All'); setAgeFilter('All'); setQuery('') }


  return (
    <MobileShell>
      {/* TRAK-182 (Imad's 6d/6g): a squad directory built from Arc's free parts:
          search, filters, avatar rows, and a player panel in a bottom sheet. */}
      <div className="flex items-baseline justify-between px-5 pt-4 pb-1 shrink-0">
        <h1 className="text-[22px] font-medium tracking-[-0.01em] text-white/95">Squad</h1>
        {players.length > 0 && <p className="text-[13px] text-white/45">{players.length} {players.length === 1 ? 'player' : 'players'}</p>}
      </div>

      {players.length > 0 && (
        <div className="arc px-5 pt-2 pb-3 space-y-3 shrink-0 [&_label]:sr-only">
          <SearchField label="Search players" placeholder="Name or shirt number" value={query} onValueChange={setQuery} />
          {/* Age groups only when the coach has two or more (U14 and U16, TRAK-176). */}
          {ageGroups.length >= 2 && (
            <LayoutGroup id="age">
              <SegmentedControl label="Age group" value={ageFilter} onValueChange={setAgeFilter}
                options={['All', ...ageGroups].map(age => ({ value: age, label: age }))} />
            </LayoutGroup>
          )}
          {/* Each control's highlight shares Arc's layoutId; a group keeps the two from swapping it. */}
          <LayoutGroup id="position">
            <SegmentedControl label="Position" value={posFilter} onValueChange={setPosFilter} options={POSITIONS} />
          </LayoutGroup>
        </div>
      )}

      {/* Squad list */}
      <div className="flex-1 overflow-y-auto px-5 pb-24">
        {loadFailed ? (
          <div className="flex flex-col items-center text-center pt-14 px-6">
            <div
              className="w-14 h-14 rounded-[16px] flex items-center justify-center mb-4"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}
            >
              <WifiOff size={22} className="text-[rgb(251,191,36)]" strokeWidth={1.5} />
            </div>
            <p className="text-[15px] text-white/70 font-medium mb-1">Couldn't load your squad</p>
            <p className="text-[12px] text-white/35 leading-relaxed mb-5">
              {navigator.onLine
                ? "We couldn't reach Trak just now. Nothing has been lost — your squad is safe."
                : 'You appear to be offline. Nothing has been lost — your squad is safe.'}
            </p>
            <button
              onClick={() => setRetry(r => r + 1)}
              className="px-5 py-2.5 rounded-[10px] text-[13px] font-medium text-black"
              style={{ background: '#C8F25A' }}
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          players.length === 0 ? (
            <div className="flex flex-col items-center text-center pt-14 px-6">
              <div
                className="w-14 h-14 rounded-[16px] flex items-center justify-center mb-4"
                style={{ background: 'rgba(200,242,90,0.08)', border: '1px solid rgba(200,242,90,0.15)' }}
              >
                <Users size={22} className="text-[#C8F25A]" strokeWidth={1.5} />
              </div>
              <p className="text-[15px] text-white/70 font-medium mb-1">Your squad is being prepared</p>
              <p className="text-[12px] text-white/35 leading-relaxed mb-5">
                Your academy will add players to this squad.
              </p>
            </div>
          ) : (
            <div className="pt-8 text-center">
              <p className="text-[13px] text-white/45 mb-2">{search ? 'No players match that search.' : 'No players match that filter.'}</p>
              <button
                onClick={clearFilters}
                className="text-[11px] text-[#C8F25A]"
              >
                Clear filters
              </button>
            </div>
          )
        ) : (
          <ul>
            {filtered.map(p => {
              const score = assessments[p.id] ?? p.overall_score ?? null
              return (
                <li key={p.id}>
                  <PlayerPanel player={p} age={ageLabel(p)} score={score} status={consent[p.id]} trigger={
                    <button type="button"
                      className="w-full flex items-center gap-3 py-3 border-b border-white/[0.05] active:bg-white/[0.03] transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md">
                      <Avatar name={p.player_name || '?'} size="md" className="arc" aria-hidden />
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-white/[0.9] truncate">{p.player_name}</p>
                        <p className="text-[12px] text-white/45 mt-0.5 truncate">{metaLine(p, ageLabel(p))}</p>
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

/** The player panel: who they are, whether they can be assessed and why not, their band, and where to go next. */
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
            {status ? <StatusChip status={status} /> : <p className="text-[13px] text-white/50">Checking status…</p>}
            <div className="flex items-center gap-2 text-[13px] text-white/60">
              {score !== null ? <>Latest band <BandPill band={scoreToBand(score)} /></> : 'Not assessed yet'}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={status !== 'ready'} className={`${button} bg-white text-black`}
            onClick={() => navigate('/coach/assess', { state: { preselectedPlayerId: player.id } })}>Assess</button>
          <button type="button" className={`${button} border border-white/15 text-white/85`}
            onClick={() => navigate(`/coach/player/${player.id}`)}>Open profile</button>
        </div>
      </div>
    </BottomSheet>
  )
}
