import { useState, type ReactNode } from 'react'
import { History } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useCoachSquad } from '@/lib/coach-squad'
import { squadName } from '@/lib/coach-week'
import { type GameState, type PlanProgress, gameState, gameStatus, orderGames } from '@/lib/games/loop'
import { gameTitle, gameWhen, useGameEvaluations, useGamePlanChanges, useGamePlans, useGameShares, useGames, type Game } from '@/components/coach/games/useGames'
import { matchResult } from '@/lib/games/results'
import { EVENT_COLOR } from '@/lib/coach-events'
import { LoadError, WIDE_COLUMN } from '@/components/trak'
import { PitchIcon } from '@/components/icons/PitchIcon'
import { Button } from '@/components/arc/button/button'
import { Countdown } from '@/components/arc/countdown/countdown'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { MatchAction } from '@/components/coach/games/MatchAction'
import { MorphBlock, SkeletonMorph } from '@/components/arc/skeleton-morph/skeleton-morph'
import { i18n, useTranslation } from '@/lib/i18n'
import { COMPETITION_WORD, MATCH_WORD } from '@/lib/games/match-words'
import { shown } from '@/lib/squad/trait-words'
import { PageTop } from '@/components/coach/PageTop'
import { CoachTrail } from '@/components/coach/CoachTrail'
import { SearchField } from '@/components/arc/search-field/search-field'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'
import { BTN, CARD, FOCUS, GOOD, LOST, QUIET, SectionHeading, SquadBadge, WAIT } from '@/components/coach/pitch-ready'

/* TRAK-283 (Games 1/8): Games home. The next game with where it is in its loop and its one next action, and every match of the squad in view. TRAK-320 (Imad, 30 Oct): a published match moves to Previous matches,
   newest first, with its result, and opens on its evaluation.
   TRAK-576: the season plan's pitch-ready look (TRAK-348, Tarek's 24 Nov mockup), as Events has it (TRAK-574): one column
   on every screen. The next match, the matches to come and the previous ones as bold bordered cards. The season's top scorers and assists (TRAK-321) are no longer on
   this page. TRAK-590 (Kostas, 26 Nov): no month strip; Home and Events show the month.
   TRAK-592 (Kostas, 26 Nov): as Training. Upcoming matches are those still to kick off; the played ones are on their own
   page behind a Past matches button at the bottom (Home's Needs you asks for their evaluation). TRAK-593: Upcoming
   matches shows 4, then Show all. */

/** Schedule's quick hand-over (TRAK-182 part 8): New event, on its first step, with Match picked. */
const ADD_MATCH = { quickEvent: { kind: 'match' } }
const PAST_PATH = '/coach/matches/past'
/** TRAK-593: as Upcoming trainings, the soonest 4 and then Show all. */
const UPCOMING_SHOWN = 4
/** The count on Past matches, as the season plan's quiet badge (as Past trainings'). */
const QUIET_COUNT = 'inline-flex items-center rounded-lg border-2 border-line bg-raised px-2 py-0.5 text-xs font-extrabold text-ink-2'
/** A placeholder that fills its column, as the card it grows into does. */
const FILL = { width: '100%' }
/** The season plan's badge for an Arc tone: green good, amber waiting, red lost, else quiet. */
const toneBadge = (tone: string) => tone === 'success' ? GOOD : tone === 'attention' || tone === 'warning' ? WAIT : tone === 'danger' ? LOST : QUIET
const details = (game: Game, time: string | null) => [
  time ? i18n.t('coachSquad:kickOffAt', { time }) : '',
  game.home_away === 'home' ? i18n.t('coachSchedule:home') : game.home_away === 'away' ? i18n.t('coachSchedule:away') : '',
  game.venue ?? '',
].filter(Boolean).join(' · ')

export default function CoachGames() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const coachSquad = useCoachSquad(user?.id)
  const navigate = useNavigate()
  const games = useGames()
  const plans = useGamePlans()
  const shares = useGameShares()
  const evaluations = useGameEvaluations()
  // TRAK-305: All or one squad, as picked at the top of the frame.
  const { everySquad } = coachSquad
  // The countdown's end moves the next game on, so the clock is read again then.
  const [now, setNow] = useState(() => Date.now())
  const inView = (games.data ?? []).filter(game => everySquad || coachSquad.eventInSquad(game.squad))
  const { next, games: ordered } = orderGames(inView, now)
  // TRAK-286: edits since sharing, for shared matches still to kick off. A failed read shows them as shared.
  const changes = useGamePlanChanges(ordered.filter(game => shares.data?.has(game.id) && now < Date.parse(game.starts_at)).map(game => game.id))
  const progress = (game: Game): PlanProgress => ({ drafted: plans.data?.has(game.id), shared: shares.data?.has(game.id), sharedAt: shares.data?.get(game.id),
    changes: changes.data?.get(game.id)?.length, evaluated: evaluations.data?.has(game.id), published: !!evaluations.data?.get(game.id)?.publishedAt })
  const stateOf = (game: Game) => gameStatus(game, now, progress(game))
  const [allUpcoming, setAllUpcoming] = useState(false)
  const upcoming = ordered.filter(game => Date.parse(game.starts_at) > now)
  const played = ordered.filter(game => Date.parse(game.starts_at) <= now)
  const loading = games.isPending || plans.isPending || shares.isPending || evaluations.isPending

  return (
    <div className="min-h-screen bg-ground pb-24">
      <div className={WIDE_COLUMN}>
        {/* TRAK-376 (Imad, 5 Nov): on a phone the avatar opens the side menu, where the squad picker is. TRAK-422: PageTop. */}
        <PageTop title={t('nav:matches')} pill={<SquadBadge>{everySquad ? t('coachHome:allSquads') : squadName(coachSquad.squad)}</SquadBadge>} />

        {games.error || plans.error || shares.error || evaluations.error
            ? <LoadError what={t('coachMatches:matchesWhat')} onRetry={() => { void games.refetch(); void plans.refetch(); void shares.refetch(); void evaluations.refetch() }}
                retrying={games.isFetching || plans.isFetching || shares.isFetching || evaluations.isFetching} />
          : !loading && ordered.length === 0 ? (
            <div className={`${CARD} arc mt-2`}>
              <EmptyState icon={<PitchIcon size={24} strokeWidth={1.5} />} title={t('coachMatches:noMatchesYet')}
                description={t('coachMatches:noMatchesBody')}
                action={<Button onClick={() => navigate('/coach/schedule', { state: ADD_MATCH })}>{t('coachMatches:addMatch')}</Button>} />
            </div>
          ) : <SkeletonMorph loading={loading} stagger={0} loadingLabel={t('coachSquad:fmMatchesLoading')}>
            {/* TRAK-461: while the matches load, each part of the page is a placeholder of its shape that grows into it. */}
            <div className="grid gap-6 sm:gap-7">
              <MorphBlock height={196} radius={16} className="grid min-w-0" style={FILL}>{!loading && (next ? <NextGame game={next} state={stateOf(next)} step={gameState(next, now, progress(next))} onKickOff={() => setNow(Date.now())} /> : (
                <section aria-labelledby="next-game" className={`${CARD} grid gap-3 p-5 sm:p-6`}>
                  <SectionHeading id="next-game" bar="bg-ink">{t('coachMatches:nextMatch')}</SectionHeading>
                  <p className="text-sm font-semibold text-ink-2">{t('coachMatches:noMatchComing')}</p>
                  <Link to="/coach/schedule" state={ADD_MATCH} className={`${BTN} w-fit`}>{t('coachMatches:addMatch')}</Link>
                </section>
              ))}</MorphBlock>

              <MorphBlock height={160} radius={16} className="grid min-w-0" style={FILL}>{!loading && upcoming.length > 0 &&
                <MatchList id="upcoming-matches" title={t('coachMatches:upcomingMatches')} bar="bg-success"
                  rows={(allUpcoming ? upcoming : upcoming.slice(0, UPCOMING_SHOWN)).map(game => {
                    const state = stateOf(game)
                    const { day, time } = gameWhen(game)
                    return { game, to: `/coach/matches/${game.id}`, line: [day, time, everySquad ? game.squad : null].filter(Boolean).join(' · '),
                      badge: <span className={toneBadge(state.tone)}>{shown(MATCH_WORD, state.label)}</span> }
                  })}
                  more={upcoming.length > UPCOMING_SHOWN && <div className="arc"><button type="button" className={BTN} onClick={() => setAllUpcoming(!allUpcoming)}>
                    {allUpcoming ? t('coachTraining:showFewer') : t('coachTraining:showAll', { count: upcoming.length })}</button></div>} />}</MorphBlock>

              {!loading && <div className="arc flex flex-wrap items-center gap-3 border-t-2 border-line-soft pt-5">
                <button type="button" className={BTN} onClick={() => navigate(PAST_PATH)}><History aria-hidden size={16} />{t('coachMatches:pastMatches')}
                  <span className={QUIET_COUNT}>{played.length}</span></button>
              </div>}
            </div>
          </SkeletonMorph>}
      </div>
    </div>
  )
}

/** A titled list of matches, one bold bordered card each: the match's stripe on its left edge, as Events' cards. */
function MatchList({ id, title, bar, rows, more }: { id?: string; title?: string; bar?: string; rows: { game: Game; to: string; line: string; badge: ReactNode }[]; more?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-3.5">
      {id && <SectionHeading id={id} bar={bar ?? 'bg-success'}>{title}</SectionHeading>}
      <ul aria-label={id ? undefined : title} className="grid gap-3">
        {rows.map(({ game, to, line, badge }) => <li key={game.id}>
          <Link to={to}
            className={`relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl border-2 border-line bg-surface p-4 pl-6 shadow-sm transition-all hover:border-ink hover:shadow-md active:scale-[.99] motion-reduce:transition-none sm:pl-7 ${FOCUS}`}>
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: EVENT_COLOR.match }} />
            <span className="grid min-w-0">
              <span className="truncate text-base font-black tracking-tight text-ink sm:text-lg">{gameTitle(game)}</span>
              <span className="truncate text-xs font-semibold text-ink-2">{line}</span>
            </span>
            <span className="shrink-0">{badge}</span>
          </Link>
        </li>)}
      </ul>
      {more}
    </section>
  )
}

/** TRAK-592 (Kostas, 26 Nov): every match whose kick-off has passed, newest first, on a page of its own as Past
 *  trainings: its result once published, else where it stands (Full time, Evaluation draft); the whole card opens it. */
export function CoachPastMatches() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const coachSquad = useCoachSquad(user?.id)
  const games = useGames()
  const plans = useGamePlans()
  const shares = useGameShares()
  const evaluations = useGameEvaluations()
  const [query, setQuery] = useState('')
  const { everySquad } = coachSquad
  const now = Date.now()
  const played = (games.data ?? []).filter(game => (everySquad || coachSquad.eventInSquad(game.squad)) && Date.parse(game.starts_at) <= now)
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))
  const competitionOf = (game: Game) => game.competition && game.competition in COMPETITION_WORD ? t(COMPETITION_WORD[game.competition as keyof typeof COMPETITION_WORD]) : undefined
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shownGames = played.filter(game => { const text = [gameTitle(game), competitionOf(game) ?? ''].join(' ').toLowerCase(); return words.every(word => text.includes(word)) })
  const loading = games.isPending || plans.isPending || shares.isPending || evaluations.isPending
  const failed = games.error || plans.error || shares.error || evaluations.error

  return (
    <div className="min-h-screen bg-ground pb-28">
      <div className={WIDE_COLUMN}>
        <PageTop className="arc" title={t('coachMatches:pastMatches')} trail={<CoachTrail current={t('coachMatches:pastMatches')} />} />
        {failed ? <LoadError what={t('coachMatches:pastWhat')} onRetry={() => { void games.refetch(); void evaluations.refetch() }} retrying={games.isFetching || evaluations.isFetching} />
          : loading ? <LoadingSkeleton label={t('coachMatches:loadingPast')} lines={2} rows={4} className="pt-6" />
          : played.length === 0 ? <div className="arc"><EmptyState icon={<History size={24} strokeWidth={1.5} />} title={t('coachMatches:noPastYet')}
              description={t('coachMatches:pastKept')} /></div>
          : <div className="grid gap-4">
            <div className="arc max-w-[560px]">
              <SearchField label={t('coachMatches:searchPast')} placeholder={t('coachMatches:searchPastPh')} value={query} onValueChange={setQuery} />
            </div>
            {shownGames.length === 0 ? <p className="text-[15px] text-ink-2">{t('coachMatches:noPastMatch', { query: query.trim() })}</p>
              : <MatchList title={t('coachMatches:pastMatches')} rows={shownGames.map(game => {
                const evaluation = evaluations.data?.get(game.id)
                const line = [gameWhen(game).day, competitionOf(game), everySquad ? game.squad : null].filter(Boolean).join(' · ')
                if (evaluation?.publishedAt) {
                  // TRAK-362: said the same way as on Home's Season plan card.
                  const result = matchResult(evaluation.ourScore, evaluation.theirScore)
                  return { game, to: `/coach/matches/${game.id}?tab=evaluation`, line, badge: <span className={toneBadge(result.tone)}>{result.label}</span> }
                }
                const state = gameStatus(game, now, { drafted: plans.data?.has(game.id), shared: shares.data?.has(game.id), sharedAt: shares.data?.get(game.id),
                  evaluated: !!evaluation, published: false })
                return { game, to: `/coach/matches/${game.id}`, line, badge: <span className={toneBadge(state.tone)}>{shown(MATCH_WORD, state.label)}</span> }
              })} />}
          </div>}
      </div>
    </div>
  )
}

/** The next match: its next action as a split button (TRAK-333) and the countdown to kick-off. A static panel, not a
 *  link. TRAK-333 (Imad, 2 Nov): no loop stepper; it served no purpose here. */
function NextGame({ game, state, step, onKickOff }: {
  game: Game; state: ReturnType<typeof gameStatus>; step: GameState; onKickOff: () => void
}) {
  const { t } = useTranslation()
  const { day, time, academy } = gameWhen(game)
  return (
    <section aria-labelledby="next-game" className={`${CARD} arc relative flex min-w-0 flex-col gap-4 overflow-hidden p-5 pl-7 sm:p-6 sm:pl-8`}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: EVENT_COLOR.match }} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading id="next-game" bar="bg-ink">{t('coachMatches:nextMatch')}</SectionHeading>
        <span className={toneBadge(state.tone)}>{shown(MATCH_WORD, state.label)}</span>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <p className="text-[22px] font-black tracking-tight text-ink break-words sm:text-2xl">{gameTitle(game)}</p>
        <p className="text-sm font-semibold text-ink-2">{[day, details(game, time)].filter(Boolean).join(' · ')}</p>
        {academy && <p className="text-xs font-semibold text-ink-3">{academy}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <MatchAction state={step} eventId={game.id} />
        <Countdown variant="compact" units={['days', 'hours', 'minutes']} target={game.starts_at}
          label={t('coachMatches:kickOffIn')} completeLabel={t('coachMatches:locked')} onComplete={onKickOff} className="ml-auto" />
      </div>
    </section>
  )
}
