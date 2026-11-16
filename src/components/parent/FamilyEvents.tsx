import { useEffect, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarWeeks, format, parseISO, startOfWeek } from 'date-fns'
import { dateLocale, useTranslation } from '@/lib/i18n'
import { useSideMenuScreen } from '@/lib/side-menu-screen'
import { useParentChildren } from '@/contexts/ParentChildrenContext'
import { useParentEvents, useParentMatches } from '@/hooks/useParentData'
import { firstName, parentMatchHref } from '@/lib/parent-data'
import { isChanged, noteEventsShown, readSeenSequences, timeChangedSinceSeen, type PlayerEvent } from '@/lib/player-events'
import { venueParts } from '@/lib/venue-link'
import { useSharedRoles } from '@/lib/games/shared-plans'
import { useReviews } from '@/lib/games/reviews'
import { fetchAssessedSessionIds } from '@/lib/parent-assessments'
import { LoadError, MobileShell, NavBar } from '@/components/trak'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'
import { FamilyPageTitle } from '@/components/trak/FamilyPageTitle'
import { fetchOwnAbsences, weekTitle } from '@/components/trak/WeekStrip'
import { ChildSwitcher, ParentFamilyContent } from '@/components/parent/ParentFamily'
import { PreviousMatches } from '@/components/player/PreviousMatches'
import { TrainingHistory } from '@/components/player/TrainingHistory'
import { Badge } from '@/components/arc/badge/badge'

/* TRAK-441 slice 4 (spec "Events", Imad 12 Nov), behind family_look: the parent's Events in the coach's look. The
   chosen child's events as day tiles, grouped by week, each saying what changed (Cancelled, Time changed, Can't make
   it sent) or, on a match, the child's place. Never the job or the coach's note (TRAK-319). Under them, kept from
   today's page so nothing a parent reads now goes: the played matches and the training history. */

const KIND_WORD = { training: 'coachSchedule:kindTraining', match: 'coachSchedule:kindMatch', tournament: 'coachSchedule:kindTournament', other: 'coachSquad:chipEvent' } as const
const ROLES = new Set(['starter', 'bench', 'not_selected'])

export function FamilyEvents() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const wide = useSideMenuScreen()
  const { parentId, selectedChild } = useParentChildren()
  const events = useParentEvents()
  const matches = useParentMatches()
  // A failed read of these only leaves the badges off.
  const reviews = useReviews(selectedChild?.id)
  const roles = useSharedRoles(selectedChild?.id)
  const list = events.data ?? []
  const ids = list.map(event => event.id)
  // Keyed under Can't make it's ['parent', 'absence', child], so a report or an undo refreshes it.
  const absences = useQuery({
    queryKey: ['parent', 'absence', selectedChild?.id, 'events', ids.join(',')],
    queryFn: ({ signal }) => fetchOwnAbsences(selectedChild!.id, ids, signal),
    enabled: !!selectedChild && ids.length > 0,
  })
  // What changed is read before this render's events are recorded as shown (TRAK-134).
  const seen = parentId ? readSeenSequences(parentId) : {}
  useEffect(() => { if (parentId && events.data) noteEventsShown(parentId, events.data) }, [parentId, events.data])

  const weeks: { monday: string; events: PlayerEvent[] }[] = []
  for (const event of list) {
    const monday = format(startOfWeek(parseISO(event.date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    if (weeks.at(-1)?.monday === monday) weeks.at(-1)!.events.push(event)
    else weeks.push({ monday, events: [event] })
  }

  const badge = (event: PlayerEvent): ReactNode => {
    const role = roles.data?.get(event.id)
    if (event.status === 'cancelled') return <Badge tone="danger" size="sm">{t('coachHome:noteCancelled')}</Badge>
    if (parentId && timeChangedSinceSeen(parentId, event)) return <Badge tone="warning" size="sm">{t('common:timeChanged')}</Badge>
    if (isChanged(event, seen)) return <Badge tone="warning" size="sm">{t('common:changed')}</Badge>
    if (absences.data?.has(event.id)) return <Badge size="sm">{t('common:cantMakeItSent')}</Badge>
    if (role && ROLES.has(role) && selectedChild) return <Badge tone={role === 'starter' ? 'success' : 'neutral'} size="sm">
      {t(`common:child_${role as 'starter'}`, { name: firstName(selectedChild) })}</Badge>
    return null
  }
  const line = (event: PlayerEvent) => {
    const place = event.venue ? venueParts(event.venue).text : null
    const side = event.homeAway ? t(event.homeAway === 'home' ? 'coachSchedule:home' : 'coachSchedule:away') : null
    return [event.time, event.kind === 'match' ? side ?? place : place].filter(Boolean).join(' · ')
  }

  return (
    <MobileShell width="wide">
      <div className="pt-3 pb-4">
        <FamilyPageTitle title={t('nav:events')} />
        {/* On a laptop the child is chosen in the side menu, where the coach chooses a squad. */}
        {!wide && <div className="mb-5"><ChildSwitcher /></div>}
        <ParentFamilyContent>
          {events.isError || matches.isError
            ? <LoadError retrying={events.isFetching || matches.isFetching} onRetry={() => { void events.refetch(); void matches.refetch() }} />
            : events.isPending || matches.isPending ? <LoadingSkeleton label={t('coachSquad:loadingUpcoming')} lines={4} rows={2} />
            : <div className="arc grid grid-cols-[minmax(0,1fr)] gap-6 laptop:grid-cols-2 laptop:items-start laptop:gap-8 [&>section]:mt-0">
              {weeks.map(week => <section key={week.monday} aria-labelledby={`week-${week.monday}`}>
                <h2 id={`week-${week.monday}`} className="mb-2 text-lg font-medium text-ink">
                  {weekTitle(differenceInCalendarWeeks(parseISO(week.monday), new Date(), { weekStartsOn: 1 }), week.monday)}</h2>
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">{week.events.map(event => <li key={event.id}>
                  <Link to={`/parent/event/${event.id}`}
                    className="flex items-center gap-3.5 rounded-2xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="grid w-11 flex-none justify-items-center rounded-xl border border-line py-1.5">
                      <span className="text-[12px] text-ink-3">{format(parseISO(event.date), 'EEE', { locale: dateLocale() })}</span>
                      <span className="text-[17px] font-medium leading-tight text-ink tabular-nums">{format(parseISO(event.date), 'd')}</span>
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-[15px] font-medium text-ink">
                        {event.kind === 'match' && event.opponent ? `vs ${event.opponent}` : event.title || t(KIND_WORD[event.kind])}</span>
                      <span className="truncate text-sm text-ink-3">{line(event)}</span>
                    </span>
                    {badge(event)}
                  </Link>
                </li>)}</ul>
              </section>)}
              {!weeks.length && <section className="rounded-2xl border border-line bg-surface p-5 laptop:p-6">
                <p className="text-[15px] text-ink-2">{t('coachSquad:noUpcoming')}</p>
              </section>}
              {selectedChild && parentId && <PreviousMatches matches={matches.data} reviewed={reviews.data?.bySession} readerId={parentId} childId={selectedChild.id}
                open={(match, eventId) => ({ to: eventId ? `/parent/event/${eventId}` : parentMatchHref(match), state: { matchId: match.id, childId: selectedChild.id } })} />}
              {/* J6 (TRAK-77): the training the coach logged for this child. */}
              {selectedChild && <TrainingHistory key={selectedChild.id} playerUserId={selectedChild.id}
                assessmentHref={sessionId => `/parent/session/${encodeURIComponent(sessionId)}/assessment`}
                assessedSessions={(sessionIds, signal) => fetchAssessedSessionIds(selectedChild.id, sessionIds, signal)}
                waitingText="Training appears once you approve this child." />}
            </div>}
        </ParentFamilyContent>
      </div>
      <NavBar role="parent" activeTab={pathname} onNavigate={navigate} />
    </MobileShell>
  )
}
