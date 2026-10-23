import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { SquadDirectory, type PositionGroup, type SquadPlayer } from '@/components/arc/blocks/team-directory/squad-directory'
import { Badge } from '@/components/arc/badge/badge'
import { needsYou } from '@/lib/coach-needs-you'
import { BANDS } from '@/lib/types'
import { bandMoves, bandSpread } from '@/lib/squad/snapshot'
import { seasonAverages } from '@/lib/squad/season-profile'
import { seasonWindow } from '@/lib/squad/season'
import { localParts, localTodayISO } from '@/lib/event-time'
import { PlayerProfile } from './PlayerProfile'
import { usePlayerFacts } from './usePlayerFacts'
import type { SquadRoster } from './useSquadRoster'

const GROUP: Record<string, PositionGroup> = { Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Attacker: 'ATT', Forward: 'ATT' }
const dateOf = (iso: string) => localParts(iso).date

/**
 * TRAK-263 (Imad, 22 Oct): Squad's Players view, replacing Snapshot. Every roster player in Arc's team directory
 * (position filters with counts, search by name or shirt number), each with their band and ↑/↓ against their own
 * previous assessment; the squad's band bar above; a player's profile beside the list, or under it on a phone.
 */
export function PlayersTab({ roster }: { roster: SquadRoster }) {
  const { user } = useAuth()
  const ids = useMemo(() => roster.players.map(p => p.id), [roster.players])
  const facts = usePlayerFacts(user?.id, ids)
  const moves = useMemo(() => bandMoves(roster.assessments), [roster.assessments])
  const season = useMemo(() => seasonAverages(roster.assessments, seasonWindow(localTodayISO()).from, dateOf), [roster.assessments])
  // TRAK-266 (Imad, 22 Oct): the colour key only where the coach is needed: amber for a player to assess or a draft
  // families can't see yet, by Home's Needs you rule. Everyone else gets no badge.
  const owed = useMemo(() => {
    const kinds = new Map<string, 'assess' | 'draft'>()
    for (const item of needsYou({ players: roster.players, waitingForParent: roster.consentPending, assessments: roster.assessments, now: Date.now() })) {
      if (!kinds.has(item.playerId)) kinds.set(item.playerId, item.kind)
    }
    return kinds
  }, [roster.players, roster.consentPending, roster.assessments])

  const players: SquadPlayer[] = roster.players.map(p => {
    const move = moves.get(p.id)
    return {
      id: p.id, name: p.player_name, position: p.position ?? '', group: GROUP[p.position ?? ''] ?? null, shirt: p.shirt_number,
      band: move ? BANDS.find(b => b.word.toLowerCase() === move.band)?.word ?? null : null, move: move?.move ?? 0,
      waiting: roster.consentPending.has(p.id),
      flag: owed.get(p.id) === 'assess' ? <Badge tone="warning" size="sm">Assess</Badge>
        : owed.get(p.id) === 'draft' ? <Badge tone="warning" size="sm">Draft</Badge> : undefined,
    }
  })
  const squadOf = new Map(roster.players.map(p => [p.id, p.age_group?.trim() || null]))
  const squadLabel = roster.squad ?? (roster.squads.length === 1 ? roster.squads[0] : null)

  return <SquadDirectory title={squadLabel ? `${squadLabel} players` : 'Players'} players={players}
    summary={<BandBar moves={moves} total={players.filter(p => !p.waiting).length} />}
    renderProfile={player => user && <PlayerProfile player={player} squad={squadOf.get(player.id) ?? squadLabel} coachId={user.id}
      facts={facts.data?.get(player.id)} factsFailed={facts.isError} onRetryFacts={() => { void facts.refetch() }}
      season={season.players.get(player.id)} squadSeason={season.squad} />} />
}

/** The squad's band spread, one colour per band, and how many went up or down since their own last assessment. */
function BandBar({ moves, total }: { moves: ReturnType<typeof bandMoves>; total: number }) {
  const spread = bandSpread(moves)
  const assessed = moves.size
  const up = [...moves.values()].filter(m => m.move === 1).length
  const down = [...moves.values()].filter(m => m.move === -1).length
  return <div className="grid gap-2">
    {assessed > 0 && <div className="flex h-2.5 overflow-hidden rounded-full bg-raised" aria-hidden>
      {spread.map(({ band, ids }) => ids.length ? <span key={band} style={{ flex: ids.length, background: BANDS.find(b => b.word.toLowerCase() === band)?.color }} /> : null)}
    </div>}
    <p className="text-sm text-ink-3">
      {assessed} of {total} assessed{assessed > 0 && ` · ↑ ${up} up and ↓ ${down} down since their last assessment`}
    </p>
  </div>
}
