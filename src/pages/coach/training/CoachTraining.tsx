import { useLayoutEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCoachSquad } from '@/lib/coach-squad'
import { localTodayISO, phoneEventTime } from '@/lib/event-time'
import { LIBRARIES, SESSIONS, libraryPath } from '@/lib/library/library'
import { ON_LIBRARY } from '@/lib/fixed-colours'
import { searchDrills, splitTrainings, trainingMinutes, type Drill } from '@/lib/training/sessions'
import { gameWhen } from '@/components/coach/games/useGames'
import { useDrills, usePlannedTrainings, useTrainings, type Training } from '@/components/coach/training/useTraining'
import { DrillSheet } from '@/components/coach/training/DrillSheet'
import { PlanWaySheet } from '@/components/coach/training/PlanWaySheet'
import { PlanEditorRoute, PlanRoute } from './CoachTrainingPlan'
import { CoachMenuButton } from '@/components/coach/CoachFrame'
import { SquadPills } from '@/components/coach/home/SquadPills'
import { LoadError } from '@/components/trak'
import { PitchIcon } from '@/components/icons/PitchIcon'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { SearchField } from '@/components/arc/search-field/search-field'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'

/* TRAK-294 (Training 1/5, spec TRAK-293): Training home, behind the academy's training switch. Sessions lists the
   coach's trainings from Schedule (Coming up, then Last week); Drills holds My drills, then the Library's tiles.
   Homework and Value of the month are parked (TRAK-293). TRAK-295 (Training 2/5): a training coming up says whether
   it's planned; Plan this session and New session ask how (PlanWaySheet), and a plan has its own pages. */

export const TRAINING_PATH = '/coach/training'
/** Schedule's quick hand-over (TRAK-182 part 8): New event, on its first step, with Training picked. */
const ADD_TRAINING = { quickEvent: { kind: 'training' } }
const linkClass = 'rounded text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

export default function CoachTraining() {
  const { pathname } = useLocation()
  const navigation = useNavigationType()
  // As the Library's pages do: a page the coach opens (a plan once saved, too) starts at its top; Back (POP) is left to
  // the browser, which returns them to their place.
  useLayoutEffect(() => {
    if (navigation !== 'POP') (document.scrollingElement ?? document.documentElement).scrollTo(0, 0)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps -- only a new page moves to the top

  return (
    <Routes>
      <Route index element={<SessionsView />} />
      <Route path="drills" element={<DrillsView />} />
      <Route path=":eventId" element={<PlanRoute />} />
      <Route path=":eventId/plan" element={<PlanEditorRoute />} />
      <Route path="*" element={<Navigate to={TRAINING_PATH} replace />} />
    </Routes>
  )
}

function Page({ view, aside, action, children }: { view: 'sessions' | 'drills'; aside?: ReactNode; action: ReactNode; children: ReactNode }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-ground pb-28">
      <div className="mx-auto w-full max-w-[1040px] px-5 tablet:px-8">
        <header className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-6 pb-4">
          <CoachMenuButton name={profile?.full_name || 'Coach'} />
          <h1 className="text-[22px] font-medium tracking-[-0.01em] text-ink">Training</h1>
          <div className="arc">
            <SegmentedControl label="Training view" value={view}
              options={[{ value: 'sessions', label: 'Sessions' }, { value: 'drills', label: 'Drills' }]}
              onValueChange={next => navigate(next === 'drills' ? `${TRAINING_PATH}/drills` : TRAINING_PATH)} />
          </div>
          <div className="arc ml-auto">{action}</div>
          {aside && <div className="basis-full">{aside}</div>}
        </header>
        {children}
      </div>
    </div>
  )
}

/* ── Sessions ───────────────────────────────────────────────────────────── */

function SessionsView() {
  const { user } = useAuth()
  const coachSquad = useCoachSquad(user?.id)
  const navigate = useNavigate()
  const trainings = useTrainings()
  const planned = usePlannedTrainings()
  // "How do you want to plan it?": for one training, or, from New session, asking which first.
  const [planning, setPlanning] = useState<{ training: Training | null } | null>(null)
  // TRAK-266: All first and picked, as Home, Squad, Schedule and Games open.
  const [allPicked, setAllPicked] = useState(true)
  const everySquad = allPicked && coachSquad.squads.length >= 2
  const inView = (trainings.data ?? []).filter(t => everySquad || coachSquad.eventInSquad(t.squad))
  const { comingUp, lastWeek } = splitTrainings(inView, Date.now())
  const addTraining = () => navigate('/coach/schedule', { state: ADD_TRAINING })
  const isPlanned = (training: Training) => planned.data?.has(training.id)

  return (
    <Page view="sessions"
      action={<Button onClick={() => setPlanning({ training: null })}><Plus aria-hidden size={18} />New session</Button>}
      aside={coachSquad.squad && coachSquad.squads.length >= 2 && (
        <SquadPills squads={coachSquad.squads} value={everySquad ? 'All' : coachSquad.squad}
          onChange={pick => { setAllPicked(pick === 'All'); if (pick !== 'All') coachSquad.setSquad(pick) }} />
      )}>
      {trainings.error ? <LoadError what="your trainings" onRetry={() => void trainings.refetch()} retrying={trainings.isFetching} />
        : trainings.isPending ? <p role="status" className="pt-14 text-center text-[13px] text-ink-3">Loading your trainings…</p>
        : <div className="grid max-w-[720px] gap-8">
          <section aria-labelledby="coming-up" className="grid gap-3">
            <h2 id="coming-up" className="text-lg font-medium text-ink">Coming up</h2>
            {comingUp.length === 0 ? (
              <div className="arc">
                <EmptyState icon={<PitchIcon size={24} strokeWidth={1.5} />} title="No training coming up"
                  description="Add a training in Schedule. You'll plan it here."
                  action={<Button onClick={addTraining}>Add a training</Button>} />
              </div>
            ) : <ul className="grid gap-3">
              {comingUp.map(training => <li key={training.id}><ComingUp training={training} showSquad={everySquad}
                planned={planned.data ? !!isPlanned(training) : null} onPlan={() => setPlanning({ training })} /></li>)}
            </ul>}
          </section>

          {lastWeek.length > 0 && <section aria-labelledby="last-week" className="grid gap-3">
            <h2 id="last-week" className="text-lg font-medium text-ink">Last week</h2>
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-5">
              {lastWeek.map(training => {
                const { day } = gameWhen(training)
                return <li key={training.id}>
                  <Link to={`/coach/schedule?event=${training.id}`}
                    className="flex min-h-14 flex-col justify-center py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                    <span className="text-[15px] text-ink"><span className="font-medium">{day}</span> · {training.title}</span>
                    {everySquad && training.squad && <span className="text-sm text-ink-3">{training.squad}</span>}
                  </Link>
                </li>
              })}
            </ul>
          </section>}
        </div>}
      <PlanWaySheet open={!!planning} onOpenChange={open => { if (!open) setPlanning(null) }} training={planning?.training ?? null}
        choices={comingUp.filter(training => !isPlanned(training))} onAddTraining={addTraining} />
    </Page>
  )
}

/** One training coming up: when and where, its title and length, and whether it's planned (null while that's read). */
function ComingUp({ training, showSquad, planned, onPlan }: { training: Training; showSquad: boolean; planned: boolean | null; onPlan: () => void }) {
  const { day, time, academy } = gameWhen(training)
  const today = phoneEventTime(training).date === localTodayISO()
  const minutes = trainingMinutes(training)
  return (
    <article aria-label={`${day}, ${training.title}`} className="arc grid gap-2 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-brand">{[today ? 'Today' : null, day, time, training.venue].filter(Boolean).join(' · ')}</p>
        {planned !== null && <Badge tone={planned ? 'success' : 'warning'} size="sm">{planned ? 'Planned' : 'Not planned'}</Badge>}
      </div>
      <p className="text-lg font-medium text-ink break-words">{training.title}</p>
      <p className="text-sm text-ink-3">{[minutes ? `${minutes} min` : null, showSquad ? training.squad : null,
        training.published ? null : 'Not published yet', academy].filter(Boolean).join(' · ')}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2">
        {planned === false && <Button size="sm" onClick={onPlan}>Plan this session</Button>}
        {planned && <Link to={`${TRAINING_PATH}/${training.id}`} className={linkClass}>Open the plan</Link>}
        <Link to={`/coach/schedule?event=${training.id}`} className={linkClass}>Open in Schedule</Link>
      </div>
    </article>
  )
}

/* ── Drills ─────────────────────────────────────────────────────────────── */

function DrillsView() {
  const drills = useDrills()
  const [query, setQuery] = useState('')
  // The sheet: closed, a new drill, or one of the coach's drills to change.
  const [sheet, setSheet] = useState<{ drill: Drill | null } | null>(null)
  const shown = searchDrills(drills.data ?? [], query)

  return (
    <Page view="drills" action={<Button onClick={() => setSheet({ drill: null })}><Plus aria-hidden size={18} />New drill</Button>}>
      <div className="arc max-w-[560px]">
        <SearchField label="Search my drills" placeholder="Search my drills" value={query} onValueChange={setQuery} />
      </div>

      <section aria-labelledby="my-drills" className="mt-7">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="my-drills" className="text-lg font-medium text-ink">My drills</h2>
          <p className="text-sm text-ink-3">Only you see these.</p>
        </div>
        {drills.error ? <div className="mt-3"><LoadError what="your drills" onRetry={() => void drills.refetch()} retrying={drills.isFetching} /></div>
          : drills.isPending ? <p role="status" className="mt-3 text-[13px] text-ink-3">Loading your drills…</p>
          : (drills.data ?? []).length === 0 ? <p className="mt-3 text-[15px] text-ink-2">No drills yet. Add one with New drill, and use it in any session.</p>
          : shown.length === 0 ? <p className="mt-3 text-[15px] text-ink-2">No drill matches “{query.trim()}”.</p>
          : <ul className="mt-3 grid gap-3 tablet:grid-cols-2 laptop:grid-cols-3">
            {shown.map(drill => <li key={drill.id}>
              <button type="button" onClick={() => setSheet({ drill })} aria-label={`${drill.name}, ${drill.minutes} min. Edit`}
                className="flex h-full w-full flex-col gap-1 rounded-2xl border border-line bg-surface p-4 text-left transition-transform active:scale-[.98] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words text-[15px] font-medium text-ink">{drill.name}</span>
                  <span className="flex-none text-sm text-ink-3">{drill.minutes} min</span>
                </span>
                {drill.how && <span className="line-clamp-2 text-sm text-ink-2">{drill.how}</span>}
              </button>
            </li>)}
          </ul>}
      </section>

      <section aria-labelledby="from-library" className="mt-9">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="from-library" className="text-lg font-medium text-ink">From the Library</h2>
          <p className="text-sm text-ink-3">When you want ideas</p>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2.5 tablet:grid-cols-4">
          {LIBRARIES.map(library => <li key={library.key}>
            <Link to={libraryPath(library.key)}
              className="flex h-20 flex-col justify-end rounded-[10px] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              style={{ background: library.colour, color: ON_LIBRARY }}>
              <span className="text-[15px] font-medium leading-tight">{library.label}</span>
              <span className="text-[12px]">{SESSIONS.filter(s => s.library === library.name).length} sessions</span>
            </Link>
          </li>)}
        </ul>
      </section>

      <DrillSheet open={!!sheet} drill={sheet?.drill ?? null} onOpenChange={open => { if (!open) setSheet(null) }} />
    </Page>
  )
}
