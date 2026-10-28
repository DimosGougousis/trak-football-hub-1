import { Link } from 'react-router-dom'
import { CalendarCheck } from 'lucide-react'
import { localTodayISO, phoneEventTime } from '@/lib/event-time'
import { trainingEnd } from '@/lib/training/sessions'
import { fromSaved, plannedMinutes } from '@/lib/training/plans'
import { loopState, LOOP_STEPS } from '@/lib/training/loop'
import { STATE, fullTime, gameState } from '@/lib/games/loop'
import { usePastSessions, useRegisters, useTrainings, type Training } from '@/components/coach/training/useTraining'
import { gameTitle, gameWhen, useGamePlan, useGamePlans, useGameShares, useGames, type Game } from '@/components/coach/games/useGames'
import { LoadError } from '@/components/trak/LoadError'
import { Badge } from '@/components/arc/badge/badge'

/* TRAK-304 (Kostas, 28 Oct): when the coach opens Trak on a training or match day, Home shows that day's plan, as a
   reminder of what the coach planned and how to run it. It takes Squad shape's place; the week stays. Today's trainings
   (Training's plan and loop) and matches (Games' plan), in time order; with nothing today, the next one coming up.
   Only where Training or Games is switched on; coach only. */

type Item = { kind: 'training'; event: Training } | { kind: 'match'; event: Game }

const linkClass = 'rounded text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
const isToday = (event: { event_date: string | null; start_time: string | null; starts_at: string }) =>
  phoneEventTime(event).date === localTodayISO()

export function TodayPlan({ trainingOn, gamesOn, inView }: {
  trainingOn: boolean
  gamesOn: boolean
  /** Whether an event's squad is in Home's view (its squad pills). */
  inView: (squad: string | null) => boolean
}) {
  const trainings = useTrainings()
  const games = useGames(gamesOn)
  const failed = (trainingOn && trainings.isError) || (gamesOn && games.isError)
  const pending = (trainingOn && trainings.isPending) || (gamesOn && games.isPending)
  const now = Date.now()

  // In Home's view, soonest first. Today's stay all day, over or not: the card is a reminder of what was done too.
  // With nothing today, the next one not over yet.
  const items: Item[] = [
    ...(trainingOn ? trainings.data ?? [] : []).map(event => ({ kind: 'training' as const, event })),
    ...(gamesOn ? games.data ?? [] : []).map(event => ({ kind: 'match' as const, event })),
  ].filter(item => inView(item.event.squad)).sort((a, b) => Date.parse(a.event.starts_at) - Date.parse(b.event.starts_at))
  const today = items.filter(item => isToday(item.event))
  const ahead = (item: Item) => (item.kind === 'training' ? trainingEnd(item.event) : fullTime(item.event)) > now
  const next = today.length ? null : items.find(ahead) ?? null

  return <section className="arc rounded-2xl border border-line bg-surface p-5" aria-labelledby="today-plan-title">
    <div className="grid gap-0.5">
      <h2 id="today-plan-title" className="text-lg font-medium text-ink">Today</h2>
      <p className="text-sm text-ink-3">{today.length ? 'Your plan for today' : 'Nothing today'}</p>
    </div>
    {failed ? <div className="mt-4"><LoadError what="today’s plan" onRetry={() => { void trainings.refetch(); void games.refetch() }} /></div>
      : pending ? <div role="status" aria-label="Loading today’s plan" className="mt-4 h-[180px] rounded-xl bg-raised animate-pulse motion-reduce:animate-none" />
      : today.length ? <ul className="mt-4 grid gap-4 divide-y divide-line">
        {today.map(item => <li key={item.event.id} className="pt-4 first:pt-0">
          {item.kind === 'training' ? <TodayTraining training={item.event} /> : <TodayMatch game={item.event} />}
        </li>)}
      </ul>
      : next ? <div className="mt-4 grid gap-2">
        <p className="text-[15px] text-ink-2">Next up</p>
        <Link to={next.kind === 'training' ? `/coach/training/${next.event.id}` : `/coach/games/${next.event.id}`}
          className="flex items-center gap-3 rounded-xl bg-raised px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <CalendarCheck aria-hidden size={20} className="flex-none text-brand" />
          <span className="min-w-0">
            <span className="block text-[15px] font-medium text-ink break-words">{next.kind === 'training' ? next.event.title : gameTitle(next.event)}</span>
            <span className="block text-sm text-ink-3">{when(next.event)}</span>
          </span>
        </Link>
      </div>
      : <p className="mt-4 text-sm text-ink-2">No training or match coming up. Add one in Schedule.</p>}
  </section>
}

const when = (event: { event_date: string | null; start_time: string | null; starts_at: string }) => {
  const { day, time } = gameWhen(event)
  return [day, time].filter(Boolean).join(' · ')
}

/** Today's training: its time and title, its practices, and the loop's next step. */
function TodayTraining({ training }: { training: Training }) {
  const sessions = usePastSessions()
  const registers = useRegisters()
  const session = sessions.data?.find(s => s.id === training.id)
  const practices = fromSaved(session?.practices ?? [])
  const now = Date.now()
  const loop = loopState({
    planned: practices.length > 0, registered: !!registers.data?.has(training.id),
    started: Date.parse(training.starts_at) <= now, over: trainingEnd(training) <= now,
  })
  const page = `/coach/training/${training.id}`
  const { time } = gameWhen(training)
  return <article aria-label={`Training, ${training.title}`} className="grid gap-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-brand">{['Training', time, training.venue].filter(Boolean).join(' · ')}</p>
        <p className="text-base font-medium text-ink break-words">{training.title}</p>
      </div>
      {sessions.data && <Badge size="sm" tone={practices.length ? 'success' : 'warning'}>{practices.length ? 'Planned' : 'Not planned'}</Badge>}
    </div>
    {sessions.isError ? <LoadError what="the plan" onRetry={() => void sessions.refetch()} />
      : practices.length > 0 && <ol aria-label="Today’s practices" className="grid gap-1.5">
        {practices.map((practice, i) => <li key={i} className="flex items-baseline gap-3 text-[15px]">
          <span className="w-12 flex-none text-sm text-ink-3">{practice.minutes} min</span>
          <span className="min-w-0 text-ink break-words">{practice.name}</span>
        </li>)}
        <li className="text-sm text-ink-3">{plannedMinutes(practices)} min in all</li>
      </ol>}
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {!practices.length && sessions.data ? <Link to={page} className={linkClass}>Plan this session</Link>
        : <>
          {loop.at < 4 && loop.at > 0 && <span className="text-sm text-ink-2">Next: {LOOP_STEPS[loop.at]}</span>}
          {loop.closed && <span className="text-sm text-ink-2">Closed</span>}
          {practices.length > 0 && !loop.closed && <Link to={`${page}/run`} className={linkClass}>Run it</Link>}
          <Link to={page} className={linkClass}>Open the plan</Link>
        </>}
    </div>
  </article>
}

/** Today's match: its kick-off and opponent, where its plan is, the formation and the goals. */
function TodayMatch({ game }: { game: Game }) {
  const plans = useGamePlans()
  const shares = useGameShares()
  const plan = useGamePlan(game.id)
  const state = STATE[gameState(game, Date.now(), { drafted: plans.data?.has(game.id), shared: shares.data?.has(game.id) })]
  const goals = Array.isArray(plan.data?.goals) ? (plan.data!.goals as { title?: string }[]).map(g => g.title?.trim()).filter(Boolean) : []
  const { time } = gameWhen(game)
  return <article aria-label={`Match, ${gameTitle(game)}`} className="grid gap-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-brand">{['Match', time ? `Kick-off ${time}` : null, game.venue].filter(Boolean).join(' · ')}</p>
        <p className="text-base font-medium text-ink break-words">{gameTitle(game)}</p>
      </div>
      <Badge size="sm" tone={state.tone}>{state.label}</Badge>
    </div>
    {plan.data && (plan.data.formation || goals.length > 0) && <dl className="grid gap-1.5 text-[15px]">
      {plan.data.formation && <div className="flex gap-3"><dt className="w-20 flex-none text-sm text-ink-3">Formation</dt><dd className="text-ink">{plan.data.formation}</dd></div>}
      {goals.length > 0 && <div className="flex gap-3"><dt className="w-20 flex-none text-sm text-ink-3">Goals</dt>
        <dd className="min-w-0 text-ink"><ul className="grid gap-0.5">{goals.map(goal => <li key={goal}>{goal}</li>)}</ul></dd></div>}
    </dl>}
    <div><Link to={`/coach/games/${game.id}?tab=plan`} className={linkClass}>{plan.data ? 'Open the game plan' : 'Write the game plan'}</Link></div>
  </article>
}
