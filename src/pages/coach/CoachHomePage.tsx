import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell } from '@/components/trak'
import { QuickAdd } from '@/components/coach/QuickAdd'
import { HomeHeader, HomeTitle } from '@/components/trak/HomeHeader'
import { CoachAlertsBell } from '@/components/coach/CoachAlertsBell'
import { CoachWeekStrip, NextStep } from '@/components/coach/CoachWeekStrip'
import { squadName } from '@/lib/coach-week'
import { CoachMenuButton } from '@/components/coach/CoachFrame'
import { SquadPills } from '@/components/coach/home/SquadPills'
import { SquadShape } from '@/components/coach/home/SquadShape'
import { NeedsYou, type OwedEvent } from '@/components/coach/home/NeedsYou'
import { useOwedEvents } from '@/components/coach/home/useOwedEvents'
import { gameTitle, gameWhen, useGames } from '@/components/coach/games/useGames'
import { needsAPlan } from '@/lib/games/loop'
import { useFeature } from '@/components/trak/parked'
import { eventHeading, toPlayerEvent } from '@/lib/player-events'
import { useSquadRoster } from '@/components/coach/squad/useSquadRoster'
import { useCoachSquad } from '@/lib/coach-squad'
import { useSideMenuScreen } from '@/lib/side-menu-screen'
import { needsYou } from '@/lib/coach-needs-you'
import { squadShape } from '@/lib/squad/shape'
import { localParts, localTodayISO } from '@/lib/event-time'

/* TRAK-262 (Imad, 22 Oct): coach Home on Arc. Squad pills (each squad, then All, which is Home's only); the week
   in Tarek's colour key with one next step per event; the Squad shape radar; Needs you. "Assess a player" and
   "Log a match" left: the "+" has both. TRAK-266: no onboarding for now (Imad, 22 Oct).
   Imad, 23 Oct: no role and academy line under the header. */

export default function CoachHomePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const coachSquad = useCoachSquad(user?.id)
  const wide = useSideMenuScreen()
  // TRAK-182 part 8: a quick-add draft shows in the week at once.
  const [weekVersion, setWeekVersion] = useState(0)
  // TRAK-266 (Imad, 22 Oct): Home opens on All. All exists only with two squads or more.
  const [allPicked, setEverySquad] = useState(true)
  const everySquad = allPicked && coachSquad.squads.length >= 2
  const roster = useSquadRoster({ everySquad })
  const squadLabel = everySquad ? 'All squads' : coachSquad.squad ?? coachSquad.squads[0] ?? 'Your squad'

  // The coach's "Needs you" switch (Settings, TRAK-261): on unless turned off. A switch that can't be read shows the cards.
  const needsYouSwitch = useQuery({
    queryKey: ['coach', user?.id, 'needs-you'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('notification_settings').select('needs_you').eq('user_id', user!.id).maybeSingle()
      if (error) throw error
      return data?.needs_you ?? true
    },
  })

  const loaded = !roster.isPending && !roster.error
  const shape = useMemo(() => loaded ? squadShape(roster.assessments, localTodayISO(), iso => localParts(iso).date) : null,
    [loaded, roster.assessments])
  const cards = useMemo(() => loaded
    ? needsYou({ players: roster.players, waitingForParent: roster.consentPending, assessments: roster.assessments, now: Date.now() })
    : null, [loaded, roster.players, roster.consentPending, roster.assessments])

  // Imad, 24 Oct: events the week marks "Needs you" are in Needs you too, with the week's own next step.
  const client = useQueryClient()
  const eventsOn = useFeature('events')
  const owed = useOwedEvents(user?.id, everySquad ? () => true : coachSquad.eventInSquad, eventsOn)
  // TRAK-284: a match a week out or less, its logistics shared, without a shared plan.
  const gamesOn = useFeature('games')
  const games = useGames(gamesOn)
  // Shown once all have answered: events added in front of player cards already on screen left the row scrolled past them.
  const needsReady = (!eventsOn || owed.items !== null || owed.failed) && (!gamesOn || !games.isPending || games.isError)
  const owedChanged = () => {
    setWeekVersion(v => v + 1)
    void client.invalidateQueries({ queryKey: ['coach', user?.id, 'owed-events'] })
  }
  const owedEvents: OwedEvent[] = !user ? [] : (owed.items ?? []).map(item => {
    const event = toPlayerEvent(item.source)
    return {
      id: item.id,
      title: event ? eventHeading(event) : item.title,
      when: `${format(parseISO(item.date), 'EEE d MMM')}${item.time ? ` · ${item.time}` : ''}`,
      squad: coachSquad.squads.length >= 2 ? squadName(item.source.squad) : null,
      reason: item.kind === 'match' ? 'Played, not logged yet' : 'Started, no register yet',
      action: <NextStep item={item} coachId={user.id} roster={undefined} onChanged={owedChanged} />,
    }
  })
  const planEvents: OwedEvent[] = !gamesOn ? [] : needsAPlan((games.data ?? []).filter(game => everySquad || coachSquad.eventInSquad(game.squad)), Date.now())
    .map(game => {
      const { day, time } = gameWhen(game)
      return {
        id: game.id, title: gameTitle(game), when: [day, time].filter(Boolean).join(' · '),
        squad: coachSquad.squads.length >= 2 ? squadName(game.squad) : null,
        reason: 'Plan not shared',
        action: <Link to={`/coach/games/${game.id}?tab=plan`}
          className="arc inline-flex h-9 min-w-[128px] items-center justify-center gap-2 rounded-full bg-brand px-4 text-[14px] font-medium text-on-brand focus-visible:ring-2 focus-visible:ring-primary">Write the plan</Link>,
      }
    })

  const pills = coachSquad.squads.length >= 2 && coachSquad.squad
    ? <SquadPills squads={coachSquad.squads} value={everySquad ? 'All' : coachSquad.squad}
        onChange={pick => { setEverySquad(pick === 'All'); if (pick !== 'All') coachSquad.setSquad(pick) }} />
    : <HomeTitle>{profile?.full_name || 'Coach'}</HomeTitle>

  return (
    <MobileShell width={wide ? 'wide' : 'page'}>
      <div className="pt-3 pb-24">
        {/* TRAK-259: on a phone the avatar opens the menu and the calendar sits beside the bell; a laptop has both
            in the frame (the sidebar, the top bar). */}
        {wide
          ? <div className="mb-3 flex justify-start">{pills}</div>
          : <HomeHeader calendarTo="/coach/schedule" left={<CoachMenuButton name={profile?.full_name || 'Coach'} />}
              center={pills} right={user && <CoachAlertsBell coachId={user.id} />} />}

        <div className={wide ? 'grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start gap-6' : 'grid gap-5'}>
          {user && <CoachWeekStrip coachId={user.id} version={weekVersion} everySquad={everySquad} />}
          <SquadShape squadLabel={squadLabel} shape={shape} failed={!!roster.error} onRetry={roster.retry} />
        </div>
        {/* Shown once the switch is known, so a coach who turned it off never sees it flash in. */}
        {(needsYouSwitch.data === true || needsYouSwitch.isError) && <div className={wide ? 'mt-6' : 'mt-5'}>
          <NeedsYou items={needsReady ? cards : null} events={[...owedEvents, ...planEvents]} failed={!!roster.error || owed.failed || (gamesOn && games.isError)}
            onRetry={() => { roster.retry(); owed.retry(); if (gamesOn) void games.refetch() }}
            onOpen={item => item.kind === 'draft'
              // TRAK-200: the profile's assessment card says Draft and has Publish.
              ? navigate(`/coach/player/${item.playerId}`)
              : navigate('/coach/assess', { state: { preselectedPlayerId: item.playerId } })} />
        </div>}
      </div>
      <QuickAdd onSaved={() => setWeekVersion(v => v + 1)} />
    </MobileShell>
  )
}
