import { useMemo } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { SquadDirectory, type PositionGroup, type SquadPlayer } from '@/components/arc/blocks/team-directory/squad-directory'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { CoachTrail } from '@/components/coach/CoachTrail'
import { useSideMenuScreen } from '@/lib/side-menu-screen'
import { needsYou } from '@/lib/coach-needs-you'
import { BANDS } from '@/lib/types'
import { bandMoves } from '@/lib/squad/snapshot'
import { useSeasonPlan } from '@/lib/season-plan'
import { isPosition } from '@/lib/positions'
import { POSITION_WORD } from '@/lib/position-words'
import { useTranslation } from '@/lib/i18n'
import { PlayerProfile } from './PlayerProfile'
import { PlayerReport, SentReport } from './PlayerReport'
import { WatchBadge } from '@/components/coach/season-plan/WatchFirst'
import { useWatchList } from '@/components/coach/season-plan/useWatching'
import { useSharedPlans } from '@/components/coach/season-plan/useEvaluation'
import { usePlayerFacts } from './usePlayerFacts'
import type { SquadRoster } from './useSquadRoster'

const GROUP: Record<string, PositionGroup> = { Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Attacker: 'ATT', Forward: 'ATT' }
const TREND = 6

/**
 * TRAK-263 (Imad, 22 Oct): Squad's Players view, replacing Snapshot. Every roster player in Arc's team directory
 * (position filters, search by name or shirt number). Imad, 23 Oct: each row ends with a sparkline of the player's
 * ratings, and there's no band bar above. TRAK-351 (Tarek, 3 Nov): a player opens as their own full page, with no list
 * beside it; the list stays mounted behind it, so going back finds its filter and search as left. TRAK-428: on a phone
 * the trail is the page's one way back; on a laptop, where the trail is in the top bar, the page keeps its Back button
 * (Imad, 19 Nov: "it does no harm").
 */
export function PlayersTab({ roster, openId = null, report = false, sent = null, onOpen = () => {}, onReport = () => {}, onSentReport = () => {}, onBack = () => {} }: {
  roster: SquadRoster
  /** The player whose page is open (their address, /coach/squad/player/:id), or null for the list. */
  openId?: string | null
  /** TRAK-527: the open player's report (/coach/squad/player/:id/report) in place of their page. */
  report?: boolean
  /** TRAK-528: with `report`, the evaluation of the sent report open (/coach/squad/player/:id/report/:evaluation). */
  sent?: string | null
  onOpen?: (id: string) => void
  onReport?: (id: string) => void
  onSentReport?: (id: string, evaluationId: string) => void
  onBack?: () => void
}) {
  const { user } = useAuth()
  const { t } = useTranslation()
  // A laptop's frame: the side menu, and the trail in the top bar (CoachFrame).
  const laptop = useSideMenuScreen()
  const ids = useMemo(() => roster.players.map(p => p.id), [roster.players])
  const facts = usePlayerFacts(user?.id, ids)
  const moves = useMemo(() => bandMoves(roster.assessments), [roster.assessments])
  // Imad, 23 Oct: each row's sparkline, the last six overall ratings, oldest first.
  const trends = useMemo(() => {
    const byPlayer = new Map<string, number[]>()
    for (const row of [...roster.assessments].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (row.coach_rating == null) continue
      byPlayer.set(row.squad_player_id, [...(byPlayer.get(row.squad_player_id) ?? []), row.coach_rating].slice(-TREND))
    }
    return byPlayer
  }, [roster.assessments])
  const squadLabel = roster.squad ?? (roster.squads.length === 1 ? roster.squads[0] : null)
  const seasonPlan = useSeasonPlan(user?.id, squadLabel)
  // TRAK-355: a watched player shows Watching, or Ready once their reminder is due, where the season plan is on.
  const watching = useWatchList(user?.id, roster, seasonPlan.on)
  const watchOf = new Map(watching.list.map(w => [w.playerId, w]))
  // TRAK-266 (Imad, 22 Oct): the colour key only where the coach is needed: amber for a player to assess or a draft
  // families can't see yet, by Home's Needs you rule. Everyone else gets no badge. TRAK-364: as on Home, a squad that's
  // evaluated (its season plan shared) has no per-player Assess; its evaluation is due on Home instead.
  const evaluated = useSharedPlans(user?.id, roster.squads).shared
  const owed = useMemo(() => {
    const kinds = new Map<string, 'assess' | 'draft'>()
    for (const item of needsYou({ players: roster.players, waitingForParent: roster.consentPending, assessments: roster.assessments, now: Date.now(),
      evaluatedSquads: evaluated })) {
      if (!kinds.has(item.playerId)) kinds.set(item.playerId, item.kind)
    }
    return kinds
  }, [roster.players, roster.consentPending, roster.assessments, evaluated])

  // TRAK-352: where the season plan is on, a consented player the coach hasn't placed says so. Elsewhere Squad is as it was.
  const positionOf = (p: (typeof roster.players)[number]) =>
    isPosition(p.position) ? t(POSITION_WORD[p.position])
      : !seasonPlan.on || roster.consentPending.has(p.id) ? p.position ?? '' : t('coachSquad:noPositionYet')
  const players: SquadPlayer[] = roster.players.map(p => {
    const move = moves.get(p.id)
    return {
      id: p.id, name: p.player_name, position: positionOf(p), group: GROUP[p.position ?? ''] ?? null, shirt: p.shirt_number,
      band: move ? BANDS.find(b => b.word.toLowerCase() === move.band)?.word ?? null : null, move: move?.move ?? 0,
      waiting: roster.consentPending.has(p.id),
      trend: trends.get(p.id),
      flag: watchOf.has(p.id) ? <WatchBadge watch={watchOf.get(p.id)} />
        // TRAK-423: a state, like Draft; the Assess button is on the player's page.
        : owed.get(p.id) === 'assess' ? <Badge tone="attention" size="sm">{t('coachHome:stateDue')}</Badge>
        : owed.get(p.id) === 'draft' ? <Badge tone="attention" size="sm">{t('coachHome:stateDraft')}</Badge> : undefined,
    }
  })
  const squadOf = new Map(roster.players.map(p => [p.id, p.age_group?.trim() || null]))

  const open = openId == null ? undefined : players.find(player => player.id === openId)
  return <>
    <div hidden={openId != null}>
      <SquadDirectory title={squadLabel ? t('coachSquad:squadPlayers', { squad: squadLabel }) : t('coachSquad:tabPlayers')} players={players} onOpen={player => onOpen(player.id)} />
    </div>
    {openId != null && <div className="grid gap-4 pt-4">
      {laptop && <span className="arc"><Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft size={16} aria-hidden="true" />{t('common:back')}</Button></span>}
      {/* TRAK-428: a player who isn't found still has the way back; the page is "Player", as in the laptop's top bar. */}
      <CoachTrail current={report ? t('coachSquad:report') : open?.name ?? t('nav:player')} />
      {/* TRAK-368: the page's title, as the older player page had it; the card's name is the visible one. */}
      {open && !report && <h1 className="sr-only">{open.name}</h1>}
      {/* TRAK-451: the page's card puts the standard room between its parts (TRAK-464). */}
      {/* TRAK-527: the report has a page of its own, where the player's page was. The report's title is its heading. */}
      {open && user && report ? (open.waiting ? <p className="text-sm text-ink-2">{t('coachSquad:waitingConsentBody', { name: open.name.split(' ')[0] })}</p>
        : sent ? <SentReport playerId={open.id} evaluationId={sent} name={open.name} coachId={user.id} />
        : <PlayerReport playerId={open.id} name={open.name} squad={squadOf.get(open.id) ?? squadLabel} coachId={user.id} />)
      : open && user ? <article aria-label={`${open.name}, ${open.position || t('coachSquad:noPositionYetLower')}`} className="grid gap-6 rounded-2xl border border-line bg-surface p-5 laptop:gap-8 laptop:p-6">
        <PlayerProfile player={open} squad={squadOf.get(open.id) ?? squadLabel} coachId={user.id}
          facts={facts.data?.get(open.id)} factsFailed={facts.isError} onRetryFacts={() => { void facts.refetch() }}
          placement={seasonPlan.on ? { position: roster.players.find(p => p.id === open.id)?.position ?? null } : undefined}
          // TRAK-527: reports follow the evaluation, so only a squad whose plan is shared has one.
          onViewReport={evaluated.has(squadOf.get(open.id) ?? squadLabel ?? '') ? () => onReport(open.id) : undefined}
          // TRAK-528: the reports he was sent; only a squad whose plan is shared sends any.
          onOpenReport={evaluated.has(squadOf.get(open.id) ?? squadLabel ?? '') ? evaluationId => onSentReport(open.id, evaluationId) : undefined} />
      </article> : !open && <p className="text-sm text-ink-2">{roster.squad == null || roster.squads.length <= 1
        // Every squad is in view, so the player isn't the coach's at all (TRAK-368: the older page's answer).
        ? t('coachSquad:playerNotFound')
        : t('coachSquad:playerOtherSquad')}</p>}
    </div>}
  </>
}
