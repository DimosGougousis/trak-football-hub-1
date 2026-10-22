import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PlayerSeason, SeasonMatch, seasonSummary } from '@/lib/squad/season'
import { dayMonth as dayLabel, OWED_BELOW } from '@/lib/squad/format'
import { Card, Missing } from './parts'
import { SquadLoadError } from './SquadLoadError'
import { useSeason } from './useSeason'
import type { SquadRoster } from './useSquadRoster'

/* TRAK-250: Squad > Season. Everything builds up from the matches the coach has logged, from the
   season's first match. Minutes come first, goals second. Coach-only: never shown to players or parents. */

type Running = ReturnType<typeof seasonSummary>['running'][number]

const matchLabel = (m: SeasonMatch) => (m.opponent ? `${dayLabel(m.date)} vs ${m.opponent}` : dayLabel(m.date))
const logHref = (m: SeasonMatch) => (m.sessionId ? `/coach/sessions/${m.sessionId}` : '/coach/sessions/list')

function Tile({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <div role="group" aria-label={label} className="rounded-[14px] border border-line bg-surface p-4">
      <p className="text-[12px] font-medium text-ink-3">{label}</p>
      <p className="mt-1 text-[26px] font-medium leading-tight tracking-[-0.01em] text-ink">{children}</p>
      {note && <p className="mt-0.5 text-[12px] text-ink-3">{note}</p>}
    </div>
  )
}

const record = (p: Running) => `${p.w}–${p.d}–${p.l}`

/** The chart's hover card: the totals after that match, and the won–drawn–lost record. */
function RunningTip({ active, payload }: { active?: boolean; payload?: { payload: Running }[] }) {
  const point = active ? payload?.[0]?.payload : undefined
  if (!point) return null
  return (
    <div className="rounded-[10px] border border-line bg-raised px-3 py-2 text-[12px] text-ink">
      <p className="font-medium">{dayLabel(point.date)}</p>
      <p>Goals for {point.goalsFor} · against {point.goalsAgainst}</p>
      <p>Record {record(point)} <span className="text-ink-3">(won–drawn–lost)</span></p>
    </div>
  )
}

function RunningChart({ running }: { running: Running[] }) {
  return (
    <Card title="How the season built up">
      <div role="img" aria-label="How the season built up: goals for and against, added up match by match" className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={running} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="rgb(var(--t-line))" vertical={false} />
            <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: 'rgb(var(--t-ink-3))', fontSize: 11 }}
              axisLine={{ stroke: 'rgb(var(--t-line))' }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: 'rgb(var(--t-ink-3))', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<RunningTip />} />
            <Line name="Goals for" dataKey="goalsFor" type="monotone" stroke="rgb(var(--t-brand))" strokeWidth={2.5}
              dot={{ r: 3 }} isAnimationActive={false} />
            <Line name="Goals against" dataKey="goalsAgainst" type="monotone" stroke="rgb(var(--t-ink-3))" strokeWidth={2}
              dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 flex gap-4 text-[12px] text-ink-3">
        <span><span aria-hidden style={{ color: 'rgb(var(--t-brand))' }}>●</span> Goals for</span>
        <span><span aria-hidden style={{ color: 'rgb(var(--t-ink-3))' }}>●</span> Goals against</span>
      </p>
      <p id="season-record" className="mt-3 text-[12px] font-medium text-ink-3">Record after each match (won–drawn–lost)</p>
      <ol aria-labelledby="season-record" className="mt-1.5 flex flex-wrap gap-1.5">
        {running.map((p, i) => (
          <li key={i} className="rounded-[8px] bg-raised px-2 py-1 text-[11px] text-ink">
            <span className="text-ink-3">{dayLabel(p.date)}</span> {record(p)}
          </li>
        ))}
      </ol>
    </Card>
  )
}

function ResultChip({ result }: { result: SeasonMatch['result'] }) {
  const tone = result === 'W' ? 'success' : result === 'L' ? 'danger' : 'ink-3'
  return (
    <span className="inline-flex h-7 w-8 shrink-0 items-center justify-center rounded-[8px] text-[12px] font-medium"
      style={{ background: `rgb(var(--t-${tone}) / 0.14)`, color: result === 'D' ? 'rgb(var(--t-ink-2))' : `rgb(var(--t-${tone}))` }}>
      {result}<span className="sr-only">{result === 'W' ? 'on' : result === 'L' ? 'ost' : 'rawn'}</span>
    </span>
  )
}

function PlayerRow({ season, name, number }: { season: PlayerSeason; name: string | undefined; number: number | null | undefined }) {
  const owed = season.pct !== null && season.pct < OWED_BELOW
  return (
    <tr className="border-t border-line">
      <td className="px-3 py-2.5 text-[13px] text-ink-3">{number ?? <Missing />}</td>
      <th scope="row" className="px-3 py-2.5 text-left text-[14px] font-medium text-ink">
        {name ? (
          <Link to={`/coach/player/${season.squadPlayerId}`}
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{name}</Link>
        ) : 'This player'}
        {owed && (
          <span className="ml-2 inline-block rounded-[8px] px-2 py-0.5 align-middle text-[11px] font-medium text-ink"
            style={{ background: 'rgb(var(--t-warning) / 0.18)' }}>minutes owed</span>
        )}
      </th>
      <td className="px-3 py-2.5 text-center text-[13px] text-ink-2">{season.apps}</td>
      <td className="px-3 py-2.5 text-right text-[13px] text-ink-2">{season.minutes === null ? <Missing /> : season.minutes}</td>
      <td className="px-3 py-2.5">
        {season.pct === null ? <div className="text-right text-[13px] text-ink-3"><Missing /></div> : (
          <div className="flex items-center gap-2">
            <div aria-hidden className="h-2 min-w-[80px] flex-1 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full"
                style={{ width: `${Math.min(100, season.pct)}%`, background: owed ? 'rgb(var(--t-warning))' : 'rgb(var(--t-brand))' }} />
            </div>
            <span className="w-10 text-right text-[13px] text-ink">{season.pct}%</span>
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-center text-[13px] text-ink-3">{season.goals}</td>
      <td className="px-3 py-2.5 text-center text-[13px] text-ink-3">{season.assists}</td>
    </tr>
  )
}

/** Lowest share of available minutes first; children with no share last; then by name. */
const byMinutesThenName = (names: Map<string, string>) => (a: PlayerSeason, b: PlayerSeason) => {
  const byPct = a.pct === null || b.pct === null ? Number(a.pct === null) - Number(b.pct === null) : a.pct - b.pct
  return byPct || (names.get(a.squadPlayerId) ?? '').localeCompare(names.get(b.squadPlayerId) ?? '')
}

/** A roster child with no match rows yet: no appearances, nothing recorded. */
const noMatches = (squadPlayerId: string): PlayerSeason =>
  ({ squadPlayerId, apps: 0, minutes: null, available: null, pct: null, goals: 0, assists: 0 })

export function SeasonTab({ roster }: { roster: SquadRoster }) {
  const { window, summary, isPending, error, retry } = useSeason()
  const { players, consentPending } = roster

  const known = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
  // Every eligible child on the roster has a row, played or not; a consent-pending child is left out.
  const sorted = useMemo(() => {
    const names = new Map(players.map(p => [p.id, p.player_name]))
    const played = summary?.players ?? []
    const seen = new Set(played.map(p => p.squadPlayerId))
    const unplayed = players.filter(p => !consentPending.has(p.id) && !seen.has(p.id)).map(p => noMatches(p.id))
    return [...played, ...unplayed].sort(byMinutesThenName(names))
  }, [summary, players, consentPending])

  if (error) return <SquadLoadError onRetry={retry} title="Couldn't load the season" />
  if (isPending || !summary) return <p role="status" className="pt-14 text-center text-[13px] text-ink-3">Loading the season…</p>

  const { matches, record, minutes, matchesWithoutMinutes, mismatches } = summary
  const sub = `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`
    + (matchesWithoutMinutes > 0 ? ` · ${matchesWithoutMinutes} without minutes, not counted` : '')

  return (
    <div className="pt-2">
      <h2 className="text-[20px] font-medium tracking-[-0.01em] text-ink">{window.label}</h2>
      <p className="mt-1 text-[12px] text-ink-3">{sub}</p>

      {matches.length === 0 ? (
        <div className="mt-5 rounded-[14px] border border-line bg-surface p-5">
          <p className="text-[15px] font-medium text-ink-2">No matches logged this season yet</p>
          <p className="mt-1 text-[12px] text-ink-3">Once you log a match, the season builds up here from its first game.</p>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <Tile label="Played">{matches.length}</Tile>
            <Tile label="Won · drawn · lost">{record.w} · {record.d} · {record.l}</Tile>
            <Tile label="Goals for – against">{summary.goalsFor} – {summary.goalsAgainst}</Tile>
            <Tile label="Minutes balance" note={minutes ? `lowest → highest · median ${minutes.median}%` : undefined}>
              {minutes ? (
                <>{minutes.lowest}% <span className="text-[15px] font-medium text-ink-3">→ {minutes.highest}%</span></>
              ) : <Missing />}
            </Tile>
          </div>

          {mismatches.length > 0 && (
            <div role="status" className="mt-3.5 rounded-[12px] px-4 py-3 text-[13px] text-ink"
              style={{ background: 'rgb(var(--t-warning) / 0.12)', border: '1px solid rgb(var(--t-warning) / 0.35)' }}>
              <b className="font-medium">Numbers don't add up:</b>{' '}
              player goals total {matches.reduce((sum, m) => sum + m.scorerGoals, 0)}, match scores total {summary.goalsFor}.{' '}
              Check the match log for{' '}
              {mismatches.map((m, i) => (
                <span key={m.key}>
                  {i > 0 && ', '}
                  <Link to={logHref(m)} className="font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm">
                    {matchLabel(m)}
                  </Link>
                </span>
              ))}.
            </div>
          )}

          <div className="mt-4"><RunningChart running={summary.running} /></div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section aria-label="Players" className="min-w-0 rounded-[14px] border border-line bg-surface p-2.5">
              <div tabIndex={0} role="region" aria-label="Player minutes table"
                className="overflow-x-auto rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                <table className="w-full min-w-[620px] border-collapse">
                  <caption className="sr-only">Each child's season, lowest share of available minutes first</caption>
                  <thead>
                    <tr className="text-[12px] font-medium text-ink-3">
                      <th scope="col" className="px-3 py-2 text-left">#</th>
                      <th scope="col" className="px-3 py-2 text-left">Player</th>
                      <th scope="col" className="px-3 py-2 text-center">Apps</th>
                      <th scope="col" className="px-3 py-2 text-right">Minutes</th>
                      <th scope="col" className="w-[220px] px-3 py-2 text-left">% of available</th>
                      <th scope="col" className="px-3 py-2 text-center">Goals</th>
                      <th scope="col" className="px-3 py-2 text-center">Assists</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(s => (
                      <PlayerRow key={s.squadPlayerId} season={s} name={known.get(s.squadPlayerId)?.player_name}
                        number={known.get(s.squadPlayerId)?.shirt_number} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-label="Results" className="min-w-0 rounded-[14px] border border-line bg-surface">
              <h3 className="px-4 pt-4 pb-2 text-[13px] font-medium text-ink">Results</h3>
              <ul className="divide-y divide-line">
                {[...matches].reverse().map(m => (
                  <li key={m.key} className="flex items-center gap-3 px-4 py-2.5">
                    <ResultChip result={m.result} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{m.opponent ?? 'Opponent not recorded'}</p>
                      <p className="text-[11px] text-ink-3">{dayLabel(m.date)}</p>
                    </div>
                    <b className="text-[14px] font-medium text-ink">{m.for}–{m.against}</b>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      <p className="mt-6 text-[12px] text-ink-3">
        Minutes are measured against the most minutes anyone played in that match. Coach-only; never shown to players or parents.
      </p>
    </div>
  )
}
