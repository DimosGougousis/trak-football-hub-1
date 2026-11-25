import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCoachSquad } from '@/lib/coach-squad'
import { squadName } from '@/lib/coach-week'
import { actionLink, type GameAction, type GameState, type PlanProgress, gameState, gameStatus, orderGames } from '@/lib/games/loop'
import { gameTitle, gameWhen, useGameEvaluations, useGamePlanChanges, useGamePlans, useGameShares, useGames, type Game } from '@/components/coach/games/useGames'
import { matchResult } from '@/lib/games/results'
import { EVENT_COLOR } from '@/lib/coach-events'
import { LoadError, WIDE_COLUMN } from '@/components/trak'
import { PitchIcon } from '@/components/icons/PitchIcon'
import { Button } from '@/components/arc/button/button'
import { MonthStrip } from '@/components/coach/MonthStrip'
import { Countdown } from '@/components/arc/countdown/countdown'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { MatchAction } from '@/components/coach/games/MatchAction'
import { MorphBlock, SkeletonMorph } from '@/components/arc/skeleton-morph/skeleton-morph'
import { currentLanguage, dateLocale, i18n, useTranslation } from '@/lib/i18n'
import { COMPETITION_WORD, MATCH_WORD } from '@/lib/games/match-words'
import { shown } from '@/lib/squad/trait-words'
import { PageTop } from '@/components/coach/PageTop'
import { BADGE, BTN, CARD, FOCUS, GOOD, LOST, QUIET, SectionHeading, WAIT } from '@/components/coach/pitch-ready'

/* TRAK-283 (Games 1/8): Games home. The next game with where it is in its loop and its one next action, the open
   drafts, and every match of the squad in view. TRAK-320 (Imad, 30 Oct): a published match moves to Previous matches,
   newest first, with its result, and opens on its evaluation.
   TRAK-576: the season plan's pitch-ready look (TRAK-348, Tarek's 24 Nov mockup), as Events has it (TRAK-574): one column
   on every screen. The month of matches on top, the open drafts straight under it, then the next match, the matches to
   come and the previous ones as bold bordered cards. The season's top scorers and assists (TRAK-321) are no longer on
   this page. */

/** Schedule's quick hand-over (TRAK-182 part 8): New event, on its first step, with Match picked. */
const ADD_MATCH = { quickEvent: { kind: 'match' } }
/** A placeholder that fills its column, as the card it grows into does. */
const FILL = { width: '100%' }
/** A played match whose evaluation is published, on the month and in its key. */
const PLAYED_COLOR = 'rgb(var(--t-success))'
/** TRAK-270: the amber corner of "needs you", here a day with a draft still open. */
const DRAFT_COLOR = 'rgb(var(--t-attention))'
/** The season plan's badge for an Arc tone: green good, amber waiting, red lost, else quiet. */
const toneBadge = (tone: string) => tone === 'success' ? GOOD : tone === 'attention' || tone === 'warning' ? WAIT : tone === 'danger' ? LOST : QUIET
/** A calendar day as the database writes an event's date, in the phone's own day. */
const dayKey = (date: Date) => format(date, 'yyyy-MM-dd')
const gameDay = (game: Game) => game.event_date ?? dayKey(new Date(game.starts_at))
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
  const open = (game: Game, action: Omit<GameAction, 'label'>) => navigate(actionLink(game.id, action))
  const progress = (game: Game): PlanProgress => ({ drafted: plans.data?.has(game.id), shared: shares.data?.has(game.id), sharedAt: shares.data?.get(game.id),
    changes: changes.data?.get(game.id)?.length, evaluated: evaluations.data?.has(game.id), published: !!evaluations.data?.get(game.id)?.publishedAt })
  const stateOf = (game: Game) => gameStatus(game, now, progress(game))
  // TRAK-284: a plan draft stays open until it's shared (TRAK-286) or its match kicks off and locks it (TRAK-287).
  // TRAK-288: an evaluation draft stays open until it's published (TRAK-289).
  const drafts = [
    ...ordered.filter(game => plans.data?.has(game.id) && !shares.data?.has(game.id) && now < Date.parse(game.starts_at))
      .map(game => ({ game, what: t('coachHome:gamePlan'), saved: plans.data!.get(game.id)!, tab: 'plan' as const })),
    ...ordered.flatMap(game => {
      const evaluation = evaluations.data?.get(game.id)
      return evaluation && !evaluation.publishedAt ? [{ game, what: t('nav:evaluation'), saved: evaluation.savedAt, tab: 'evaluation' as const }] : []
    }),
  ]

  const published = (game: Game) => !!evaluations.data?.get(game.id)?.publishedAt
  const previous = ordered.filter(published)
  const loading = games.isPending || plans.isPending || shares.isPending || evaluations.isPending

  // The month: a dot on each match day (green once its evaluation is published), the amber corner where a draft is open.
  const byDay = new Map<string, Game[]>()
  for (const game of ordered) byDay.set(gameDay(game), [...(byDay.get(gameDay(game)) ?? []), game])
  const draftDays = new Set(drafts.map(({ game }) => gameDay(game)))
  const [month, setMonth] = useState<Date | null>(null)
  const shownMonth = month ?? (next ? new Date(`${gameDay(next)}T12:00:00`) : new Date())
  // Picking a match day opens its match: its evaluation once published, else the match.
  const pick = (date: Date) => {
    const game = byDay.get(dayKey(date))?.[0]
    if (game) navigate(published(game) ? `/coach/matches/${game.id}?tab=evaluation` : `/coach/matches/${game.id}`)
  }

  return (
    <div className="min-h-screen bg-ground pb-24">
      <div className={WIDE_COLUMN}>
        {/* TRAK-376 (Imad, 5 Nov): on a phone the avatar opens the side menu, where the squad picker is. TRAK-422: PageTop. */}
        <PageTop title={t('nav:matches')} pill={<span className={BADGE}>{everySquad ? t('coachHome:allSquads') : squadName(coachSquad.squad)}</span>} />

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
              {/* ── The month of matches as Events' low strip across the top (TRAK-574), not a square grid. ── */}
              <MorphBlock height={190} radius={16} className="grid min-w-0" style={FILL}>{!loading &&
                <section aria-label={t('coachMatches:matchCalendar')} className={`${CARD} arc grid gap-3 px-4 py-3 sm:px-5`}>
                  <MonthStrip locale={currentLanguage() === 'en' ? 'en-GB' : currentLanguage()}
                    value={next ? new Date(`${gameDay(next)}T12:00:00`) : undefined} onChange={pick}
                    month={shownMonth} onMonthChange={setMonth}
                    marks={date => (byDay.get(dayKey(date)) ?? []).map(game => published(game) ? PLAYED_COLOR : EVENT_COLOR.match)}
                    attention={date => draftDays.has(dayKey(date))} />
                  <div role="group" aria-label={t('coachSchedule:colourKey')}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 border-t-2 border-line-soft pt-2.5">
                    <Key mark={<span className="h-2.5 w-2.5 rounded-full" style={{ background: EVENT_COLOR.match }} />}>{t('coachSchedule:kindMatch')}</Key>
                    <Key mark={<span className="h-2.5 w-2.5 rounded-full" style={{ background: PLAYED_COLOR }} />}>{t('coachMatches:keyPlayed')}</Key>
                    <Key mark={<span className="h-2.5 w-2.5" style={{ filter: 'drop-shadow(0 0 .6px rgb(var(--t-warning)))' }}>
                      <span className="block h-full w-full" style={{ background: DRAFT_COLOR, clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} /></span>}>{t('coachMatches:keyDraft')}</Key>
                  </div>
                </section>}</MorphBlock>

              {/* ── TRAK-284: plan drafts. TRAK-288: evaluation drafts. Under the month, as the season plan's
                  "Not shared yet" box: amber while any is open. ── */}
              <MorphBlock height={120} radius={16} className="grid min-w-0" style={FILL}>{!loading &&
                <section aria-labelledby="open-drafts" className={`arc grid gap-3 rounded-2xl border-2 p-4 sm:p-5 ${drafts.length ? 'border-attention bg-attention/10' : 'border-line bg-surface'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex items-center gap-3">
                      {drafts.length > 0 && <AlertTriangle aria-hidden size={20} strokeWidth={2.25} className="shrink-0 text-warning" />}
                      <h2 id="open-drafts" className="text-base font-extrabold text-ink">{t('coachMatches:openDrafts')}</h2>
                    </span>
                    {drafts.length === 0 && <span className={GOOD}><CheckCircle2 aria-hidden size={14} strokeWidth={2.5} />{t('coachMatches:noDrafts')}</span>}
                  </div>
                  {drafts.length > 0 && <ul className="grid gap-2">
                    {drafts.map(({ game, what, saved, tab }) => <li key={`${tab}:${game.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border-2 border-line bg-surface px-4 py-3">
                      <span className="grid min-w-0">
                        <span className="truncate text-base font-black tracking-tight text-ink">{gameTitle(game)}</span>
                        <span className="truncate text-xs font-semibold text-ink-2">{t('coachMatches:savedAt', { what, when: format(new Date(saved), 'EEE d MMM, HH:mm', { locale: dateLocale() }) })}</span>
                      </span>
                      <button type="button" className={`${BTN} shrink-0`} aria-label={t(tab === 'plan' ? 'coachMatches:openPlanOf' : 'coachMatches:openEvaluationOf', { title: gameTitle(game) })}
                        onClick={() => open(game, { tab })}>{t('coachMatches:open')}</button>
                    </li>)}
                  </ul>}
                </section>}</MorphBlock>

              <MorphBlock height={196} radius={16} className="grid min-w-0" style={FILL}>{!loading && (next ? <NextGame game={next} state={stateOf(next)} step={gameState(next, now, progress(next))} onKickOff={() => setNow(Date.now())} /> : (
                <section aria-labelledby="next-game" className={`${CARD} grid gap-3 p-5 sm:p-6`}>
                  <SectionHeading id="next-game" bar="bg-ink">{t('coachMatches:nextMatch')}</SectionHeading>
                  <p className="text-sm font-semibold text-ink-2">{t('coachMatches:noMatchComing')}</p>
                  <Link to="/coach/schedule" state={ADD_MATCH} className={`${BTN} w-fit`}>{t('coachMatches:addMatch')}</Link>
                </section>
              ))}</MorphBlock>

              <MorphBlock height={160} radius={16} className="grid min-w-0" style={FILL}>{!loading &&
                <MatchList id="your-matches" title={t('coachMatches:yourMatches')} bar="bg-success"
                  rows={ordered.filter(game => !published(game)).map(game => {
                    const state = stateOf(game)
                    const { day, time } = gameWhen(game)
                    return { game, to: `/coach/matches/${game.id}`, line: [day, time, everySquad ? game.squad : null].filter(Boolean).join(' · '),
                      badge: <span className={toneBadge(state.tone)}>{shown(MATCH_WORD, state.label)}</span> }
                  })} />}</MorphBlock>

              {previous.length > 0 && <MatchList id="previous-matches" title={t('coachMatches:previousMatches')} bar="bg-line-strong"
                rows={previous.map(game => {
                  const { ourScore: our, theirScore: their } = evaluations.data!.get(game.id)!
                  // TRAK-362: said the same way as on Home's Season plan card.
                  const result = matchResult(our, their)
                  const competition = game.competition && game.competition in COMPETITION_WORD ? t(COMPETITION_WORD[game.competition as keyof typeof COMPETITION_WORD]) : undefined
                  return { game, to: `/coach/matches/${game.id}?tab=evaluation`, line: [gameWhen(game).day, competition, everySquad ? game.squad : null].filter(Boolean).join(' · '),
                    badge: <span className={toneBadge(result.tone)}>{result.label}</span> }
                })} />}
            </div>
          </SkeletonMorph>}
      </div>
    </div>
  )
}

function Key({ mark, children }: { mark: ReactNode; children: ReactNode }) {
  return <span className="flex items-center gap-2">{mark}<span className="text-xs font-bold text-ink-2">{children}</span></span>
}

/** A titled list of matches, one bold bordered card each: the match's stripe on its left edge, as Events' cards. */
function MatchList({ id, title, bar, rows }: { id: string; title: string; bar: string; rows: { game: Game; to: string; line: string; badge: ReactNode }[] }) {
  return (
    <section aria-labelledby={id} className="grid gap-3.5">
      <SectionHeading id={id} bar={bar}>{title}</SectionHeading>
      <ul className="grid gap-3">
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
    </section>
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
