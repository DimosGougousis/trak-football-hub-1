import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell } from '@/components/trak'
import { QuickAdd } from '@/components/coach/QuickAdd'
import { HomeHeader } from '@/components/trak/HomeHeader'
import { CoachAlertsBell } from '@/components/coach/CoachAlertsBell'
import { CoachWeekStrip } from '@/components/coach/CoachWeekStrip'
import { CoachMenuButton } from '@/components/coach/CoachFrame'
import { TodoList } from '@/components/coach/home/TodoList'
import { HomeGreeting } from '@/components/coach/home/HomeGreeting'
import { useHomeTodos } from '@/components/coach/home/useHomeTodos'
import { NeedsYou, type OwedEvent } from '@/components/coach/home/NeedsYou'
import { SeasonPlanCard } from '@/components/coach/home/SeasonPlanCard'
import { planSquad } from '@/lib/season-plan'
import { useFeature } from '@/components/trak/parked'
import { useSquadRoster } from '@/components/coach/squad/useSquadRoster'
import { useCoachSquad } from '@/lib/coach-squad'
import { useSideMenuScreen } from '@/lib/side-menu-screen'
import { needsYou } from '@/lib/coach-needs-you'
import { unplacedBySquad } from '@/lib/positions'
import { useWatchList } from '@/components/coach/season-plan/useWatching'
import { useSquadEvaluations } from '@/components/coach/season-plan/useEvaluation'
import { useStuckObjectives } from '@/components/coach/season-plan/useObjectiveProgress'
import { usePlayerObjectives } from '@/components/coach/season-plan/usePlayerObjectives'
import { StuckSheet, type StuckTarget } from '@/components/coach/season-plan/StuckSheet'
import { Button } from '@/components/arc/button/button'
import { NEXT_STEP_SIZE, NEXT_STEP_WIDTH } from '@/components/coach/next-step'
import { useLanguage } from '@/lib/i18n'
import { PageTitle, PageTop } from '@/components/coach/PageTop'

/* TRAK-262 (Imad, 22 Oct): coach Home on Arc. Squad pills (each squad, then All, which is Home's only); the week
   in Tarek's colour key with one next step per event; the Squad shape radar; Needs you. "Assess a player" and
   "Log a match" left: the "+" has both. TRAK-266: no onboarding for now (Imad, 22 Oct).
   Imad, 23 Oct: no role and academy line under the header. TRAK-304 (Kostas, 28 Oct): where Training or Games is
   switched on, Today (that day's training or game plan) takes Squad shape's place; on a phone it comes first. */

export default function CoachHomePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  // TRAK-407: the words, and a new render when the language changes.
  const { t, language } = useLanguage()
  const coachSquad = useCoachSquad(user?.id)
  const wide = useSideMenuScreen()
  // TRAK-182 part 8: a quick-add draft shows in the week at once.
  const [weekVersion, setWeekVersion] = useState(0)
  // TRAK-305: All or one squad, as picked at the top of the frame. All exists only with two squads or more.
  const { everySquad } = coachSquad
  const roster = useSquadRoster()

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
  // TRAK-364: where the season plan is on and a squad's plan is shared, the squad's evaluation takes the place of its
  // per-player Assess cards. Until that's known the cards wait, so none shows and then goes. A failed read only leaves
  // the evaluation out: the per-player cards show as before (the season plan's card says what failed).
  const evaluations = useSquadEvaluations(user?.id, coachSquad.squads)
  const cards = useMemo(() => loaded
    ? needsYou({ players: roster.players, waitingForParent: roster.consentPending, assessments: roster.assessments, now: Date.now(),
      evaluatedSquads: evaluations.failed ? undefined : evaluations.evaluated })
    // TRAK-407: the reasons are words, so a new language writes them again.
    : null, [loaded, roster.players, roster.consentPending, roster.assessments, evaluations.evaluated, evaluations.failed, language])

  // TRAK-608 (New Home 2/8): the To-do takes Needs you's event cards and the Today card. Needs you keeps its player
  // cards until 4/8 (TRAK-610) moves them into the suggestions.
  const gamesOn = useFeature('games')
  const trainingOn = useFeature('training')
  const inView = useCallback((squad: string | null) => everySquad || coachSquad.eventInSquad(squad), [everySquad, coachSquad])
  const reports = useMemo(() => evaluations.list.filter(e => e.due.dueOn && e.due.since).map(e => ({ squad: e.squad, since: e.due.since! })),
    [evaluations.list])
  const todos = useHomeTodos({ coachId: user?.id, inView, reports, trainingOn, gamesOn })
  const todosChanged = () => { setWeekVersion(v => v + 1); todos.refresh() }
  const needsReady = evaluations.ready
  // TRAK-352: where the season plan is on, one card per squad with consented players still to place. A newly
  // consented child has no position, so they join it.
  // Under All, a card picks its squad as the switcher does (TRAK-361): the season plan is one squad's, so All has to go.
  const seasonPlanOn = useFeature('season_plan')
  const positionEvents: OwedEvent[] = !seasonPlanOn || !loaded ? [] : unplacedBySquad(roster.players, roster.consentPending).map(({ squad, count }) => ({
    id: `positions:${squad ?? ''}`,
    title: t('coachHome:needPosition', { count }),
    when: '',
    squad: coachSquad.squads.length >= 2 ? squad : null,
    reason: t('coachHome:needPositionWhy'),
    action: <span className="arc"><Button size={NEXT_STEP_SIZE} className={NEXT_STEP_WIDTH} onClick={() => { if (everySquad && squad) coachSquad.pick(squad); navigate('/coach/season-plan/positions') }}>{t('coachHome:placeThem')}</Button></span>,
  }))
  // TRAK-355: a watched player whose reminder is due comes back, one card each, opening the step where they were left.
  const watching = useWatchList(user?.id, roster, seasonPlanOn)
  // TRAK-365: an objective with Not yet three evaluations in a row, one card each. Asked only where an evaluation exists.
  const [stuckTarget, setStuckTarget] = useState<StuckTarget | null>(null)
  const stuck = useStuckObjectives(user?.id, seasonPlanOn && evaluations.evaluated.size > 0)
  const heldObjectives = usePlayerObjectives(user?.id, seasonPlanOn && (stuck.data?.length ?? 0) > 0)
  const stuckEvents: OwedEvent[] = (stuck.data ?? []).flatMap(row => {
    const player = roster.players.find(p => p.id === row.squad_player_id)
    const objective = heldObjectives.of(row.squad_player_id).find(o => o.id === row.player_objective_id)
    const squad = player?.age_group?.trim() ?? null
    if (!player || !objective || (!everySquad && !coachSquad.inSquad(squad ?? ''))) return []
    return [{
      id: `stuck:${objective.id}`,
      title: t('coachHome:stuckTitle', { name: player.player_name.split(' ')[0] }),
      when: '',
      squad: coachSquad.squads.length >= 2 ? squad : null,
      reason: t('coachHome:stuckWhy', { objective: objective.title }),
      action: <span className="arc"><Button size={NEXT_STEP_SIZE} className={NEXT_STEP_WIDTH} onClick={() => setStuckTarget({ objectiveId: objective.id, objective: objective.title, playerId: player.id, playerName: player.player_name })}>{t('coachHome:choose')}</Button></span>,
    }]
  })
  const watchEvents: OwedEvent[] = !seasonPlanOn ? [] : watching.list.filter(w => w.ready).map(w => ({
    id: `watch:${w.playerId}`,
    // TRAK-494 (Kostas, 20 Nov): the title says why they're back; the line under it, who to set up.
    title: w.why === '4 weeks, the latest' ? t('coachHome:watchedFourWeeks') : w.why ?? '',
    when: '',
    squad: coachSquad.squads.length >= 2 ? w.squad : null,
    reason: t('coachHome:watchSetUp', { name: w.name.split(' ')[0] }),
    action: <span className="arc"><Button size={NEXT_STEP_SIZE} className={NEXT_STEP_WIDTH} onClick={() => { if (everySquad && w.squad) coachSquad.pick(w.squad); navigate(`/coach/season-plan/${w.step}?player=${w.playerId}`) }}>{t('coachHome:setUp')}</Button></span>,
  }))


  return (
    <MobileShell width="wide">
      <div className="pt-5 pb-24">
        {/* TRAK-259: on a phone the avatar opens the menu and the calendar sits beside the bell; a laptop has both
            in the frame (the sidebar, the top bar). */}
        {!wide && <HomeHeader calendarTo="/coach/schedule" left={<CoachMenuButton name={profile?.full_name || t('nav:coach')} />}
          center={<PageTitle><span className="truncate">{profile?.full_name || t('nav:coach')}</span></PageTitle>} right={user && <CoachAlertsBell coachId={user.id} />} />}
        {/* TRAK-422 (Kostas, 13 Nov): Home keeps the coach's name as its title, on a laptop too. */}
        {wide && <PageTop className="pt-0" menu={false} title={profile?.full_name || t('nav:coach')} />}

        {/* TRAK-608 (New Home 2/8): the greeting, then the To-do in the Today card's and Squad shape's place. The week
            stays under it until Upcoming replaces it (5/8, TRAK-611). */}
        <div className={wide ? 'grid gap-8' : 'grid gap-6'}>
          <HomeGreeting name={profile?.full_name || t('nav:coach')} day={todos.day} />
          {user && <TodoList items={todos.items} failed={todos.failed} onRetry={todos.retry} coachId={user.id}
            showSquad={everySquad && coachSquad.squads.length >= 2} onChanged={todosChanged}
            onOpenReports={squad => { if (everySquad && squad) coachSquad.pick(squad); navigate('/coach/evaluation') }} />}
          {user && <CoachWeekStrip coachId={user.id} version={weekVersion} everySquad={everySquad} />}
        </div>
        {/* Shown once the switch is known, so a coach who turned it off never sees it flash in. */}
        {(needsYouSwitch.data === true || needsYouSwitch.isError) && <div className={wide ? 'mt-8' : 'mt-6'}>
          <NeedsYou items={needsReady ? cards : null} events={[...stuckEvents, ...positionEvents, ...watchEvents]}
            failed={!!roster.error}
            onRetry={() => { roster.retry(); if (evaluations.failed) evaluations.retry() }}
            onOpen={item => item.kind === 'draft'
              // TRAK-200: the profile's assessment card says Draft and has Publish.
              ? navigate(`/coach/squad/player/${item.playerId}`)
              : navigate('/coach/assess', { state: { preselectedPlayerId: item.playerId } })} />
        </div>}
        {/* TRAK-350: the season plan, where the academy's switch is on; TRAK-361: the card that folds, one per squad under All. */}
        {user && <SeasonPlanCard coachId={user.id} squads={coachSquad.squads} squadsReady={coachSquad.ready} squadsFailed={coachSquad.failed} onRetry={coachSquad.retry}
          squad={planSquad(coachSquad)} everySquad={everySquad}
          onPick={coachSquad.pick} className={wide ? 'mt-8' : 'mt-6'} />}
      </div>
      {user && <StuckSheet coachId={user.id} target={stuckTarget} onClose={() => setStuckTarget(null)} onSwapped={id => navigate(`/coach/squad/player/${id}`)} />}
      <QuickAdd onSaved={todosChanged} />
    </MobileShell>
  )
}
