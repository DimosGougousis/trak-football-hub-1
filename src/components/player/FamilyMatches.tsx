import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import { dateLocale, useTranslation } from '@/lib/i18n'
import { LoadError, MobileShell, NavBar } from '@/components/trak'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'
import { FamilyPageTitle } from '@/components/trak/FamilyPageTitle'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { fetchParentEvents, fetchParentMatches } from '@/lib/parent-data'
import { academyLine, eventHeading, noteEventsShown, type PlayerEvent } from '@/lib/player-events'
import { venueParts } from '@/lib/venue-link'
import { useSharedRoles } from '@/lib/games/shared-plans'
import { useReviews } from '@/lib/games/reviews'
import { wasOpened } from '@/lib/games/news'
import { PreviousMatches } from './PreviousMatches'

/* TRAK-441 slice 4 (spec "Matches (was Sessions)", Imad 12 Nov), behind family_look: the player's Matches tab in the
   coach's look. Next match (his place once the plan is shared, the plan a button away, New until he opens it), Coming
   up, Previous matches. Matches only: no filter chips, and team training is on Trainings (slice 7). Two columns on a
   laptop. */

const ROLES = new Set(['starter', 'bench', 'not_selected'])
const EVER = new Date(0).toISOString()
const card = 'rounded-2xl border border-line bg-surface p-5 laptop:p-6'
const h2 = 'text-lg font-medium text-ink'
const column = 'grid grid-cols-[minmax(0,1fr)] gap-6 laptop:gap-8'

export function FamilyMatches() {
  const { user } = useAuth()
  const me = user?.id ?? ''
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // The family reads (child_events, the match rows), as the parent's Events page reads them for a child.
  const events = useQuery({ queryKey: ['player', me, 'upcoming'], queryFn: ({ signal }) => fetchParentEvents(me, signal), enabled: !!me, networkMode: 'always' })
  const matches = useQuery({ queryKey: ['player', me, 'matches'], queryFn: ({ signal }) => fetchParentMatches(me, signal), enabled: !!me, networkMode: 'always' })
  // A failed read of these only leaves the badges off.
  const reviews = useReviews(me)
  const roles = useSharedRoles(me)

  // ponytail: the matches among the next 20 events (fetchParentEvents' limit); a match-only read if a squad trains daily.
  const ahead = (events.data ?? []).filter(event => event.kind === 'match')
  const next = ahead.find(event => event.status !== 'cancelled')
  const coming = ahead.filter(event => event !== next)
  // Shown, so the match page can say what moved since (TRAK-134).
  useEffect(() => { if (events.data) noteEventsShown(me, events.data.filter(event => event.kind === 'match')) }, [me, events.data])

  const day = (event: PlayerEvent) => format(parseISO(event.date), 'EEE d MMM', { locale: dateLocale() })
  const side = (event: PlayerEvent) => event.homeAway ? t(event.homeAway === 'home' ? 'coachSchedule:home' : 'coachSchedule:away') : null
  const title = (event: PlayerEvent) => event.opponent ? `vs ${event.opponent}` : eventHeading(event)

  return (
    <MobileShell width="wide">
      <div className="pt-3 pb-4">
        <FamilyPageTitle title={t('nav:matches')} />
        {events.isError || matches.isError
          ? <LoadError what={t('coachMatches:matchesWhat')} retrying={events.isFetching || matches.isFetching}
              onRetry={() => { void events.refetch(); void matches.refetch() }} />
          : events.isPending || matches.isPending ? <LoadingSkeleton label={t('coachSquad:fmMatchesLoading')} lines={4} rows={2} />
          : <div className="arc grid grid-cols-[minmax(0,1fr)] gap-6 laptop:grid-cols-2 laptop:items-start laptop:gap-8">
            <div className={column}>
              {next ? <NextMatch event={next} title={title(next)} role={roles.data?.get(next.id)}
                line={[next.date === format(new Date(), 'yyyy-MM-dd') ? t('coachHome:today') : day(next),
                  next.time && t('coachSquad:kickOffAt', { time: next.time }), academyLine(next), side(next),
                  next.venue && venueParts(next.venue).text].filter(Boolean).join(' · ')}
                unopened={!wasOpened(me, me, 'plan', next.id, EVER)} />
                : <section aria-labelledby="next-match" className={card}>
                  <h2 id="next-match" className={h2}>{t('coachMatches:nextMatch')}</h2>
                  <p className="mt-2 text-[15px] text-ink-2">{t('coachMatches:noMatchComing')}</p>
                </section>}
              {coming.length > 0 && <section aria-labelledby="coming-up">
                <h2 id="coming-up" className={`${h2} mb-2`}>{t('common:comingUp')}</h2>
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">{coming.map(event => <li key={event.id}>
                  <Link to={`/player/event/${event.id}`}
                    className="flex items-center gap-3 rounded-2xl px-5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-[15px] font-medium text-ink">{title(event)}</span>
                      <span className="truncate text-sm text-ink-3">{[day(event), event.time, side(event)].filter(Boolean).join(' · ')}</span>
                    </span>
                    {event.status === 'cancelled' && <Badge tone="danger" size="sm">{t('coachHome:noteCancelled')}</Badge>}
                  </Link>
                </li>)}</ul>
              </section>}
            </div>
            <div className={column}>
              <PreviousMatches matches={matches.data} reviewed={reviews.data?.bySession} readerId={me} childId={me}
                open={(match, eventId) => ({ to: eventId ? `/player/event/${eventId}` : `/player/match/${match.id}` })} />
            </div>
          </div>}
      </div>
      <NavBar role="player" activeTab={pathname} onNavigate={navigate} />
    </MobileShell>
  )
}

/** The next match: who, when and where in one line, his place once the plan is shared, and the plan (or the match) a
 *  button away, with New beside it until he has opened the plan. */
function NextMatch({ event, title, line, role, unopened }: {
  event: PlayerEvent; title: string; line: string; role: string | undefined; unopened: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const shared = !!role && ROLES.has(role)
  return <section aria-labelledby="next-match" className={card}>
    <div className="flex items-center justify-between gap-3">
      <h2 id="next-match" className={h2}>{t('coachMatches:nextMatch')}</h2>
      {shared && <Badge tone={role === 'starter' ? 'success' : 'neutral'} dot>{t(`common:you_${role as 'starter'}`)}</Badge>}
    </div>
    <p className="mt-3 break-words text-[22px] font-medium leading-tight tracking-[-0.01em] text-ink">{title}</p>
    <p className="mt-2 text-[15px] text-ink-2">{line}</p>
    <div className="mt-4 flex items-center gap-3">
      <Button onClick={() => navigate(`/player/event/${event.id}${shared ? '#game-plan' : ''}`)}>{t(shared ? 'common:openGamePlan' : 'common:openMatch')}</Button>
      {shared && unopened && <Badge tone="success" size="sm">{t('common:new')}</Badge>}
    </div>
  </section>
}
