import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { BandPill } from '@/components/trak'
import { BANDS, type BandType } from '@/lib/types'
import { bandMoves, bandSpread, nextSteps, type BandMove } from '@/lib/squad/snapshot'
import type { SquadRoster } from './useSquadRoster'

/* TRAK-250: Squad > Snapshot. Each child's latest band, compared only with their
   own previous assessment. Coach-only: it is never shown to players or parents. */

const RECENT_TRAININGS = 4
const FETCH_TRAININGS = 12
const DAY = 24 * 60 * 60 * 1000

const bandIndex = (band: BandType) => BANDS.findIndex(b => b.word.toLowerCase() === band)
const bandColor = (band: BandType) => BANDS[bandIndex(band)]?.color ?? BANDS[BANDS.length - 1].color
const bandWord = (band: BandType) => BANDS[bandIndex(band)]?.word ?? band

type Session = { id: string; squad: string | null; session_date: string | null; session_type: string }
type Mark = { session_id: string; squad_player_id: string; status: string }
/** A training whose register was taken (someone is ticked present), and who was. */
type Registered = { id: string; date: string; present: string[] }

/** PostgREST value quoting, so a squad name with a comma or bracket cannot change the filter. */
const quoted = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/**
 * This coach's last four trainings for the squad (or whole-roster ones) whose register was taken, newest first.
 * Same rules as attendance-rate.ts: the register only stores who was present, so a training nobody was ticked
 * at is not a miss for anyone.
 */
async function loadRegistered(coachId: string, squad: string | null): Promise<Registered[]> {
  let query = supabase.from('coach_sessions').select('id, squad, session_date, session_type')
    .eq('coach_user_id', coachId).eq('session_type', 'training')
  if (squad) query = query.or(`squad.is.null,squad.eq.${quoted(squad)}`)
  const sessions = await query.order('session_date', { ascending: false }).limit(FETCH_TRAININGS)
  if (sessions.error) throw sessions.error
  const recent = ((sessions.data ?? []) as Session[])
    .filter(s => s.session_type === 'training' && !!s.session_date && (squad === null || s.squad == null || s.squad === squad))
  if (recent.length === 0) return []

  const marks = await supabase.from('session_attendance').select('session_id, squad_player_id, status')
    .in('session_id', recent.map(s => s.id)).eq('status', 'present')
  if (marks.error) throw marks.error
  const present = new Map<string, string[]>()
  for (const m of (marks.data ?? []) as Mark[]) {
    if (m.status !== 'present') continue
    const list = present.get(m.session_id)
    if (list) list.push(m.squad_player_id)
    else present.set(m.session_id, [m.squad_player_id])
  }
  return recent
    .filter(s => (present.get(s.id)?.length ?? 0) > 0)
    .sort((a, b) => b.session_date!.localeCompare(a.session_date!))
    .slice(0, RECENT_TRAININGS)
    .map(s => ({ id: s.id, date: s.session_date!, present: present.get(s.id)! }))
}

/** Per child, those registered trainings (from the day they joined the roster) at which they were not ticked present. */
function missedCounts(registered: Registered[], players: { id: string; created_at: string | null }[]): Record<string, number> {
  const missed: Record<string, number> = {}
  for (const p of players) {
    const joined = p.created_at ? Date.parse(p.created_at) : Number.NEGATIVE_INFINITY
    // created_at is UTC and the date is the academy's day: joined by the end of that day.
    const counted = registered.filter(r => joined < Date.parse(`${r.date}T00:00:00Z`) + DAY)
    missed[p.id] = counted.filter(r => !r.present.includes(p.id)).length
  }
  return missed
}

function Arrow({ move }: { move: BandMove['move'] }) {
  if (move === 0) return null
  return (
    <span role="img" aria-label={move === 1 ? 'moved up' : 'moved down'} className="font-medium"
      style={{ color: move === 1 ? 'rgb(var(--t-success))' : 'rgb(var(--t-danger))' }}>
      {move === 1 ? '↑' : '↓'}
    </span>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = `snapshot-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`
  return (
    <section aria-labelledby={id} className="rounded-[14px] border border-line bg-surface p-4">
      <h3 id={id} className="text-[13px] font-medium text-ink mb-3">{title}</h3>
      {children}
    </section>
  )
}

function NameChips({ title, names }: { title: string; names: string[] }) {
  if (names.length === 0) return null
  return (
    <div className="mt-5">
      <h3 className="text-[12px] font-medium text-ink-3 mb-2">{title}</h3>
      <ul className="flex flex-wrap gap-2">
        {names.map(name => <li key={name} className="rounded-[8px] bg-raised px-2.5 py-1.5 text-[13px] text-ink">{name}</li>)}
      </ul>
    </div>
  )
}

export function SnapshotTab({ roster }: { roster: SquadRoster }) {
  const { user } = useAuth()
  const userId = user?.id
  const { players, consentPending, assessments, squad } = roster

  const moves = useMemo(() => bandMoves(assessments), [assessments])
  const spread = useMemo(() => bandSpread(moves), [moves])
  const names = useMemo(() => Object.fromEntries(players.map(p => [p.id, p.player_name])), [players])

  const trainings = useQuery({
    queryKey: ['coach', userId, 'squad-snapshot', 'missed', squad ?? 'all'],
    queryFn: () => loadRegistered(userId!, squad),
    enabled: !!userId,
  })

  const moved = useMemo(() => [...moves.values()]
    .filter(m => m.move !== 0 && m.previous)
    .sort((a, b) => {
      const size = (m: BandMove) => Math.abs(bandIndex(m.band) - bandIndex(m.previous!))
      return size(b) - size(a) || a.move - b.move
    }), [moves])
  const missed = useMemo(() => missedCounts(trainings.data ?? [], players), [trainings.data, players])
  const steps = useMemo(() => nextSteps([...moves.values()], names, missed), [moves, names, missed])

  const admitted = players.filter(p => !consentPending.has(p.id))
  const notAssessed = admitted.filter(p => !moves.has(p.id)).map(p => p.player_name)
  const notAdmitted = players.filter(p => consentPending.has(p.id)).map(p => p.player_name)
  const assessed = moves.size

  return (
    <div className="pt-2">
      <h2 className="text-[20px] font-medium tracking-[-0.01em] text-ink">Squad snapshot</h2>
      <p className="mt-1 text-[12px] text-ink-3">
        Latest band per child · {assessed} assessed · {notAdmitted.length} not yet admitted
      </p>

      {assessed === 0 ? (
        <div className="mt-5 rounded-[14px] border border-line bg-surface p-5">
          <p className="text-[15px] font-medium text-ink-2">No assessments yet</p>
          <p className="mt-1 text-[12px] text-ink-3">Once you assess a child, their band appears here.</p>
        </div>
      ) : (
        <>
          <div className="mt-5 rounded-[14px] border border-line bg-surface p-4">
            <div
              role="img"
              aria-label={`Band spread: ${spread.filter(s => s.ids.length).map(s => `${s.ids.length} ${bandWord(s.band)}`).join(', ')}`}
              className="flex h-[18px] overflow-hidden rounded-full bg-raised"
            >
              {spread.filter(s => s.ids.length > 0).map(s => (
                <div key={s.band} style={{ flexGrow: s.ids.length, background: bandColor(s.band), borderRight: '2px solid rgb(var(--t-surface))' }} />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {spread.map(s => (
                <div key={s.band} role="group" aria-label={bandWord(s.band)} className="min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <BandPill band={s.band} />
                    <b className="text-[13px] font-medium text-ink">{s.ids.length}</b>
                  </div>
                  {s.ids.length === 0 ? <p className="mt-2.5 text-[12px] text-ink-3" aria-hidden>—</p> : (
                    <ul className="mt-2.5 flex flex-col gap-1">
                      {s.ids.map(id => (
                        <li key={id} className="flex items-center justify-between gap-1 rounded-[8px] bg-raised px-2 py-1.5 text-[13px] text-ink">
                          <span className="min-w-0 truncate">{names[id] ?? 'This player'}</span>
                          <Arrow move={moves.get(id)!.move} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card title="Changes since last assessment">
              {moved.length === 0 ? <p className="text-[13px] text-ink-3">No band has changed since the last assessment.</p> : (
                <ul className="divide-y divide-line">
                  {moved.map(m => (
                    <li key={m.squadPlayerId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium text-ink">{names[m.squadPlayerId] ?? 'This player'} <Arrow move={m.move} /></p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <BandPill band={m.previous!} />
                          <span aria-hidden className="text-ink-3">→</span>
                          <span className="sr-only">to</span>
                          <BandPill band={m.band} />
                        </div>
                      </div>
                      <Link to={`/coach/player/${m.squadPlayerId}`}
                        className="inline-flex min-h-11 items-center rounded-[10px] border border-line-strong px-3 text-[13px] font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        Open profile<span className="sr-only"> for {names[m.squadPlayerId] ?? 'this player'}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="What the coach does next">
              {trainings.isPending ? <p role="status" className="text-[13px] text-ink-3">Checking recent training…</p>
                : steps.length === 0 ? <p className="text-[13px] text-ink-3">Nothing to follow up this week.</p>
                : (
                  <ul className="flex flex-col gap-1.5 text-[13px] text-ink">
                    {steps.map(step => <li key={step}>{step}</li>)}
                  </ul>
                )}
              {trainings.isError && (
                <p className="mt-3 text-[12px] text-ink-3">Recent training attendance couldn't be read, so these suggestions leave out missed sessions.</p>
              )}
            </Card>
          </div>
        </>
      )}

      <NameChips title="Not assessed yet" names={notAssessed} />
      <NameChips title="Not yet admitted" names={notAdmitted} />

      <p className="mt-6 text-[12px] text-ink-3">
        Each child is compared only with their own previous assessment. Coach-only; never shown to players or parents as a ranking.
      </p>
    </div>
  )
}
