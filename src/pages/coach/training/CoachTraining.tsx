import { useTranslation } from '@/lib/i18n'
import { TRAINING_WORD } from '@/lib/training/words'
import { shown as shownWord } from '@/lib/squad/trait-words'
import { useLayoutEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { AlertTriangle, Check, CheckCircle2, Copy, History, Info, TrafficCone, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCoachSquad } from '@/lib/coach-squad'
import { localTodayISO, phoneEventTime } from '@/lib/event-time'
import { splitTrainings, trainingMinutes } from '@/lib/training/sessions'
import { useTrainingEnded } from '@/lib/training/ended'
import { herePath, planPath, sessionSummary } from '@/lib/training/plans'
import { registerProblem } from '@/lib/event-register'
import { againLabel, loopSteps, nextTraining, searchPast, trainingBadge, type Phase } from '@/lib/training/next'
import { gameWhen } from '@/components/coach/games/useGames'
import {
  useDrafts, useHere, useNotes, usePastTrainings, usePlannedTrainings, useRegisters, useTrainings, type Draft, type Training,
} from '@/components/coach/training/useTraining'
import { NotesForm } from '@/components/coach/training/NotesForm'
import { EVENT_COLOR, startedLocked } from '@/lib/coach-events'
import { squadName } from '@/lib/coach-week'
import { NOTE_STEP } from '@/lib/event-edit'
import { CopyTargetSheet, PastPlanSheet, type PlanToCopy } from '@/components/coach/training/PastPlanSheet'
import { CoachTrail } from '@/components/coach/CoachTrail'
import { PitchViewRoute, ToTab, TrainingRoute } from './CoachTrainingPlan'
import { AllDrills, ChangePractice, DrillPage, LibraryHome, MyDrills, PracticePage } from './DrillLibrary'
import { LoadError, WIDE_COLUMN } from '@/components/trak'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { Countdown } from '@/components/arc/countdown/countdown'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { ScrollArea } from '@/components/arc/scroll-area/scroll-area'
import { Stepper } from '@/components/arc/stepper/stepper'
import { SearchField } from '@/components/arc/search-field/search-field'
import { GlassSegmented } from '@/components/arc/glass-segmented/glass-segmented'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'
import { EditIcon } from '@/components/trak/IconAction'
import { PageTop } from '@/components/coach/PageTop'
import { BADGE, BTN, CARD, FOCUS, GOOD, LOST, QUIET, SectionHeading, WAIT } from '@/components/coach/pitch-ready'

/* TRAK-294 (Training 1/5, spec TRAK-293): Training home, behind the academy's training switch. Sessions lists the
   coach's trainings from Schedule (Coming up, then Last week); Drills holds My drills, then the Library's tiles.
   Homework and Value of the month are parked (TRAK-293). TRAK-295 (Training 2/5): a training coming up says whether
   it's planned; Plan this session and New session asked how (TRAK-339: no more), and a plan has its own pages. TRAK-296: a
   drill can be added to the next training not planned yet. TRAK-298: Last week says which trainings are closed (ended
   with their register taken) and opens each one's page. TRAK-310 (Kostas, 29 Oct): a training coming up has View plan
   and Edit plan, or Create plan, and New session is gone, since every training coming up has its own Create plan.
   TRAK-311 (Kostas, 29 Oct): View plan opens View, and a training last week has the same buttons. TRAK-339 (Training
   redo 1/5, spec TRAK-338): Sessions is laid out like Matches, from the 2 Nov prototype; see below. TRAK-387 (Drill
   Library 3/11): Drills is the new Library (DrillLibrary.tsx); the coach's own drills left it (Kostas, 8 Nov). */

export const TRAINING_PATH = '/coach/training'
const PAST_PATH = `${TRAINING_PATH}/past`
/** Kostas, 3 Nov: the mockup's row of four; the rest one tap away. */
const UPCOMING_SHOWN = 4
/** Schedule's quick hand-over (TRAK-182 part 8): New event, on its first step, with Training picked. */
const ADD_TRAINING = { quickEvent: { kind: 'training' } }
/** The season plan's badge for an Arc tone: green good, amber waiting, red lost, else quiet. */
const toneBadge = (tone: string) => tone === 'success' ? GOOD : tone === 'attention' || tone === 'warning' ? WAIT : tone === 'danger' ? LOST : QUIET
/** The count on Past trainings, as the season plan's quiet badge. */
const QUIET_COUNT = 'inline-flex items-center rounded-lg border-2 border-line bg-raised px-2 py-0.5 text-xs font-extrabold text-ink-2'
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
      <Route path="past" element={<PastTrainings />} />
      {/* TRAK-387 (Drill Library 3/11): Drills is the new Library. */}
      <Route path="drills" element={<Page view="drills"><LibraryHome /></Page>} />
      <Route path="drills/mine" element={<MyDrills />} />
      <Route path="drills/all" element={<AllDrills />} />
      <Route path="drills/change" element={<ChangePractice />} />
      <Route path="drills/kind/:kind" element={<PracticePage />} />
      <Route path="drills/d/:drillId" element={<DrillPage />} />
      <Route path="drills/*" element={<Navigate to={`${TRAINING_PATH}/drills`} replace />} />
      {/* TRAK-456: a training's page, built like a match's: Logistics, Training plan and After training tabs (?tab=). */}
      <Route path=":eventId" element={<TrainingRoute />} />
      {/* Plan session and Who's here were pages of their own; an open tab or an older link lands on the tab. */}
      <Route path=":eventId/plan" element={<ToTab tab="plan" />} />
      <Route path=":eventId/here" element={<ToTab tab="after" />} />
      <Route path=":eventId/view" element={<PitchViewRoute />} />
      {/* TRAK-309: View was Run it, at /run. An open tab or an older link (Home's Today card) still lands on it. */}
      <Route path=":eventId/run" element={<Navigate to="../view" relative="path" replace />} />
      <Route path="*" element={<Navigate to={TRAINING_PATH} replace />} />
    </Routes>
  )
}

function Page({ view, children }: { view: 'sessions' | 'drills'; children: ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const coachSquad = useCoachSquad(user?.id)
  return (
    <div className="min-h-screen bg-ground pb-28">
      <div className={WIDE_COLUMN}>
        {/* Kostas, 30 Oct: no visible title ("training" too repetitive). TRAK-422 (Kostas, 13 Nov): every coach page has
            the one title, Training too, with its Sessions / Drills switch beside it. */}
        <PageTop title={t('nav:training')} pill={<span className={BADGE}>{coachSquad.everySquad ? t('coachHome:allSquads') : squadName(coachSquad.squad)}</span>}>
          {/* TRAK-431 (Kostas, 16 Nov): every page's tabs are Squad's big glass pill. */}
          <div className="arc w-full tablet:w-[320px]">
            <GlassSegmented label={t('coachTraining:trainingView')} value={view} fullWidth
              options={[{ value: 'sessions', label: t('coachTraining:tabSessions') }, { value: 'drills', label: t('nav:drills') }]}
              onValueChange={next => navigate(next === 'drills' ? `${TRAINING_PATH}/drills` : TRAINING_PATH)} />
          </div>
        </PageTop>
        {children}
      </div>
    </div>
  )
}

/* ── Sessions ───────────────────────────────────────────────────────────── */

/* TRAK-339 (Training redo 1/5, spec TRAK-338, 2 Nov prototype): laid out like Matches. TRAK-577: in Matches' pitch-ready
   look (TRAK-576), one column on every screen: the Next training card (where it is in its loop and its one next action),
   the open drafts straight under it (amber while any is open), the trainings to come as bold bordered cards with the
   training stripe, and Past trainings at the very bottom (Kostas, 2 Nov). After a training, its Notes are asked on the
   card. */


function SessionsView() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const coachSquad = useCoachSquad(user?.id)
  const navigate = useNavigate()
  const trainings = useTrainings()
  const planned = usePlannedTrainings()
  const registers = useRegisters()
  const notes = useNotes()
  const drafts = useDrafts()
  const past = usePastTrainings()
  const location = useLocation()
  // TRAK-340: back from saving a plan, say so and offer the next one not planned yet.
  const [savedPlan, setSavedPlan] = useState<string | null>(() => (location.state as { savedPlan?: string } | null)?.savedPlan ?? null)
  // The countdown's end moves the card on, so the clock is read again then.
  const [now, setNow] = useState(() => Date.now())
  const [closed, setClosed] = useState<string | null>(null)
  const [allUpcoming, setAllUpcoming] = useState(false)
  // TRAK-305: All or one squad, as picked at the top of the frame.
  const { everySquad } = coachSquad
  const inView = (trainings.data ?? []).filter(t => everySquad || coachSquad.eventInSquad(t.squad))
  const isToday = (training: Training) => phoneEventTime(training).date === localTodayISO()
  const next = nextTraining(inView, now, id => !!notes.data?.has(id), isToday)
  const upcoming = splitTrainings(inView, now).comingUp
  const pastInView = (past.data ?? []).filter(t => everySquad || coachSquad.eventInSquad(t.squad))
  const reads = [trainings, planned, registers, notes, drafts]
  const justSaved = savedPlan ? inView.find(t => t.id === savedPlan) : undefined
  const nextToPlan = justSaved ? upcoming.find(t => t.id !== justSaved.id && !planned.data?.has(t.id)) : undefined

  return (
    <Page view="sessions">
      {reads.some(r => r.error) ? <LoadError what={t('coachTraining:yourTrainingsWhat')} onRetry={() => reads.forEach(r => void r.refetch())} retrying={reads.some(r => r.isFetching)} />
        : reads.some(r => r.isPending) ? <LoadingSkeleton label={t('coachTraining:loadingTrainings')} rows={3} className="pt-6" />
        : <div className="grid gap-6 sm:gap-7">
          {closed && <div role="status" className={`${CARD} arc flex flex-wrap items-center gap-3 px-5 py-3.5`}>
            <Check aria-hidden size={18} className="text-success" />
            <p className="min-w-0 flex-1 text-[15px] text-ink"><span className="font-medium">{t('coachTraining:closedMsg', { title: closed })}</span>
              <span className="text-ink-2">{t('coachTraining:nowInPast')}</span></p>
            <button type="button" className={BTN} onClick={() => navigate(PAST_PATH)}>{t('coachTraining:pastTrainings')}</button>
            <button type="button" aria-label={t('coachTraining:closeMessage')} onClick={() => setClosed(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X aria-hidden size={16} /></button>
          </div>}

          {justSaved && <div role="status" className={`${CARD} arc flex flex-wrap items-center gap-3 px-5 py-3.5`}>
            <Check aria-hidden size={18} className="text-success" />
            <p className="min-w-0 flex-1 text-[15px] text-ink"><span className="font-medium">{t('coachTraining:planSavedFor', { title: justSaved.title, day: gameWhen(justSaved).day })}</span>
              {nextToPlan && <span className="text-ink-2">{t('coachTraining:nextToPlan', { title: nextToPlan.title, day: gameWhen(nextToPlan).day })}</span>}</p>
            {nextToPlan && <Button size="sm" onClick={() => navigate(planPath(nextToPlan.id))}>
              {t(drafts.data?.has(nextToPlan.id) ? 'coachTraining:continueNamed' : 'coachTraining:planNamed', { title: nextToPlan.title })}</Button>}
            <button type="button" aria-label={t('coachTraining:closeMessage')} onClick={() => setSavedPlan(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X aria-hidden size={16} /></button>
          </div>}

          {/* TRAK-577: one column; Open drafts straight under the Next training. */}
          {next ? <NextTraining key={next.training.id} draft={drafts.data?.get(next.training.id)} training={next.training} phase={next.phase} planned={!!planned.data?.has(next.training.id)}
            sessionId={registers.data?.get(next.training.id) ?? null} onStart={() => setNow(Date.now())}
            onClosed={() => setClosed(next.training.title)} />
            : <div className={`${CARD} arc`}>
              <EmptyState icon={<TrafficCone size={24} strokeWidth={1.5} />} title={t('coachTraining:noTrainingComing')}
                description={t('coachTraining:addInSchedule')}
                action={<Button onClick={() => navigate('/coach/schedule', { state: ADD_TRAINING })}>{t('coachTraining:addTraining')}</Button>} />
            </div>}
          <OpenDrafts drafts={upcoming.filter(t => drafts.data?.has(t.id) && !planned.data?.has(t.id)).map(t => ({ training: t, draft: drafts.data!.get(t.id)! }))} />

          {upcoming.length > 0 && <section aria-labelledby="upcoming" className="grid min-w-0 gap-3.5">
            <SectionHeading id="upcoming" bar="bg-success">{t('coachTraining:upcomingTrainings')}</SectionHeading>
            <ul className="grid gap-3">
              {(allUpcoming ? upcoming : upcoming.slice(0, UPCOMING_SHOWN)).map(training => {
                const { day, time } = gameWhen(training)
                const badge = trainingBadge({ phase: isToday(training) ? 'day' : 'before', planned: !!planned.data?.has(training.id),
                  draft: drafts.data?.has(training.id) })
                return <li key={training.id}>
                  <Link to={`${TRAINING_PATH}/${training.id}`}
                    className={`relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl border-2 border-line bg-surface p-4 pl-6 shadow-sm transition-all hover:border-ink hover:shadow-md active:scale-[.99] motion-reduce:transition-none sm:pl-7 ${FOCUS}`}>
                    <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: EVENT_COLOR.training }} />
                    <span className="grid min-w-0">
                      <span className="truncate text-base font-black tracking-tight text-ink sm:text-lg">{training.title}</span>
                      <span className="truncate text-xs font-semibold text-ink-2">{[isToday(training) ? t('coachHome:today') : day, time, everySquad ? training.squad : null].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className={`${toneBadge(badge.tone)} shrink-0`}>{shownWord(TRAINING_WORD, badge.label)}</span>
                  </Link>
                </li>
              })}
            </ul>
            {upcoming.length > UPCOMING_SHOWN && <div className="arc"><button type="button" className={BTN} onClick={() => setAllUpcoming(!allUpcoming)}>
              {allUpcoming ? t('coachTraining:showFewer') : t('coachTraining:showAll', { count: upcoming.length })}</button></div>}
          </section>}

          <div className="arc flex flex-wrap items-center gap-3 border-t-2 border-line-soft pt-5">
            <button type="button" className={BTN} onClick={() => navigate(PAST_PATH)}><History aria-hidden size={16} />{t('coachTraining:pastTrainings')}
              {past.data && <span className={QUIET_COUNT}>{pastInView.length}</span>}</button>
          </div>
        </div>}
    </Page>
  )
}

/** The training the card shows: its name and badge, when and where, the loop, the message to families, and the one next
 *  action. After the training, its Notes. */
function NextTraining({ training, phase, planned, draft, sessionId, onStart, onClosed }: {
  training: Training; phase: Phase; planned: boolean; draft: Draft | undefined; sessionId: string | null; onStart: () => void; onClosed: () => void
}) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const here = useHere(sessionId ? [sessionId] : [])
  const [copying, setCopying] = useState(false)
  const { day, time, academy } = gameWhen(training)
  const minutes = trainingMinutes(training)
  const count = sessionId ? here.data?.get(sessionId) ?? null : null
  const badge = trainingBadge({ phase, planned, here: count, draft: !!draft })
  const stoppedAt = draft ? draft.parts[draft.step]?.name ?? t('coachMatches:reviewShare') : null
  const current = phase === 'after' ? 3 : planned || phase === 'day' ? 2 : 1
  // A step the card has moved past is ticked only if it really happened; otherwise it says what's missing (live check,
  // 3 Nov: a training ended with no register showed Who's here ticked).
  const steps = loopSteps({ current, planned, registered: !!sessionId }).map(step => ({ ...step, label: shownWord(TRAINING_WORD, step.label),
    ...('error' in step && step.error ? { error: shownWord(TRAINING_WORD, step.error) } : {}) }))
  const message = training.family_note?.trim()
  const locked = startedLocked(training)
  // TRAK-493: once the training is over its countdown says "Finished", never "Started".
  const ended = useTrainingEnded(training)
  // Who's here opens as the register does everywhere else: published, not cancelled, started.
  const registerWhy = registerProblem({ ...training, event_type: 'training' }, new Date())
  // TRAK-456: a plan, written or not, is the training page's Training plan tab.
  const plan = () => navigate(planPath(training.id))
  const review = plan

  return (
    <section aria-labelledby="next-training" className={`${CARD} arc relative flex min-w-0 flex-col gap-4 overflow-hidden p-5 pl-7 sm:p-6 sm:pl-8`}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: EVENT_COLOR.training }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1.5">
          {/* Kostas, 30 Oct: no "Next training" heading; the name and badge lead the card. */}
          <h2 id="next-training" className="text-[22px] font-black tracking-tight text-ink break-words sm:text-2xl">{training.title}</h2>
          <p className="text-sm font-semibold text-ink-2">{[phase !== 'before' && phoneEventTime(training).date === localTodayISO() ? t('coachHome:today') : day, time,
            training.venue, minutes ? t('coachHome:minutes', { count: minutes }) : null].filter(Boolean).join(' · ')}</p>
          {academy && <p className="text-xs font-semibold text-ink-3">{academy}</p>}
        </div>
        <span className={`${toneBadge(badge.tone)} shrink-0`}>{shownWord(TRAINING_WORD, badge.label)}</span>
      </div>

      <Stepper label={t('coachTraining:whereTrainingIs')} steps={steps} current={current} />

      {phase === 'after' ? <NotesForm training={training} planned={planned} onReview={review} onClosed={onClosed} />
        : <>
          {/* TRAK-367: always there to add one, until the training starts and its details are fixed. Edit opens the form at
              the note, in Schedule, which alone can save it to this training and the ones after. */}
          {(message || !locked) && <p className="flex items-start gap-2 rounded-xl bg-raised px-4 py-3 text-sm text-ink-2">
            <Info aria-hidden size={16} className="mt-1 flex-none text-ink-3" />
            <span className="min-w-0 flex-1 break-words"><span className="font-medium text-ink">{t('coachSchedule:messageToPlayers')}{message && ':'}</span> {message}</span>
            {/* TRAK-455: editing the message is a pencil; adding one keeps its words. */}
            {!locked && (message ? <EditIcon label={t('coachTraining:editMessage')} to={`/coach/schedule?edit=${training.id}&step=${NOTE_STEP}`} className="-my-2.5" />
              : <Link to={`/coach/schedule?edit=${training.id}&step=${NOTE_STEP}`} className={linkClass}>{t('coachTraining:addMessage')}</Link>)}
          </p>}
          <div className="flex flex-wrap items-center gap-3">
            {phase === 'day' ? <>
              <Button size="lg" disabled={!!registerWhy && !sessionId} onClick={() => navigate(herePath(training.id))}>{t('coachTraining:loopHere')}</Button>
              {planned ? <Button size="lg" variant="secondary" onClick={review}>{t('coachTraining:reviewPlan')}</Button>
                : <Button size="lg" variant="secondary" onClick={plan}>{t('coachTraining:planSession')}</Button>}
            </> : planned ? <>
              <Button size="lg" onClick={review}>{t('coachTraining:reviewPlan')}</Button>
              <EditIcon label={t('coachTraining:editPlan')} onClick={plan} />
            </> : draft ? <>
              <Button size="lg" onClick={plan}>{t('coachTraining:continuePlan')}</Button>
            </> : <>
              <Button size="lg" onClick={plan}>{t('coachTraining:planSession')}</Button>
              <Button size="lg" variant="secondary" onClick={() => setCopying(true)}><Copy aria-hidden size={16} />{t('coachTraining:usePastPlan')}</Button>
            </>}
            <Countdown variant="compact" units={['days', 'hours', 'minutes']} target={training.starts_at}
              label={t('coachTraining:startsIn')} completeLabel={t(ended ? 'coachTraining:finished' : 'coachTraining:started')} onComplete={onStart} className="ml-auto" />
          </div>
          {/* Kostas, 3 Nov: the mockup is clean; a line only when a button is waiting for the training to start. */}
          {phase === 'day' && registerWhy && !sessionId && <p className="text-sm text-ink-3">{t('coachTraining:hereOpens')}</p>}
          {stoppedAt && phase === 'before' && !planned && <p className="text-sm text-ink-3">{t('coachTraining:stoppedAt', { step: stoppedAt })}</p>}
        </>}

      <PastPlanSheet open={copying} onOpenChange={setCopying} training={training} />
    </section>
  )
}

/** Open drafts, under the Next training as Matches has them under its month (TRAK-577): plans the coach kept for later,
 *  with where they stopped, amber while any is open. Only the coach sees a draft. */
function OpenDrafts({ drafts }: { drafts: { training: Training; draft: Draft }[] }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return <section aria-labelledby="open-drafts" className={`arc grid gap-3 rounded-2xl border-2 p-4 sm:p-5 ${drafts.length ? 'border-attention bg-attention/10' : 'border-line bg-surface'}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex items-center gap-3">
        {drafts.length > 0 && <AlertTriangle aria-hidden size={20} strokeWidth={2.25} className="shrink-0 text-warning" />}
        <h2 id="open-drafts" className="text-base font-extrabold text-ink">{t('coachMatches:openDrafts')}</h2>
      </span>
      {drafts.length === 0 && <span className={GOOD}><CheckCircle2 aria-hidden size={14} strokeWidth={2.5} />{t('coachMatches:noDrafts')}</span>}
    </div>
    {drafts.length > 0 && <ul className="grid gap-2">
        {drafts.map(({ training, draft }) => <li key={training.id} className="flex items-center justify-between gap-3 rounded-xl border-2 border-line bg-surface px-4 py-3">
          <span className="grid min-w-0">
            <span className="truncate text-base font-black tracking-tight text-ink">{training.title}</span>
            <span className="truncate text-xs font-semibold text-ink-2">{t('coachTraining:stoppedAtLine', { day: gameWhen(training).day, step: draft.parts[draft.step]?.name ?? t('coachMatches:reviewShare') })}</span>
          </span>
          <button type="button" className={`${BTN} shrink-0`} aria-label={t('coachTraining:continueNamed', { title: training.title })} onClick={() => navigate(planPath(training.id))}>{t('coachSchedule:continue')}</button>
        </li>)}
      </ul>}
  </section>
}

/* ── Past trainings ─────────────────────────────────────────────────────── */

/** Every training that's over, newest first: what was planned, who came, and the Notes. View opens its page; Use this
 *  plan asks which training to copy it into (Kostas, 30 Oct: Past trainings is a list of its own, not a row on the
 *  front page). */
function PastTrainings() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const coachSquad = useCoachSquad(user?.id)
  const navigate = useNavigate()
  const past = usePastTrainings()
  const trainings = useTrainings()
  const registers = useRegisters()
  const [query, setQuery] = useState('')
  const [copying, setCopying] = useState<PlanToCopy | null>(null)
  const { everySquad } = coachSquad
  const inView = (past.data ?? []).filter(t => everySquad || coachSquad.eventInSquad(t.squad))
  const shown = searchPast(inView.map(t => ({ ...t, note: t.notes?.note ?? '' })), query)
  const here = useHere(inView.flatMap(t => registers.data?.get(t.id) ?? []))
  const coming = splitTrainings((trainings.data ?? []).filter(t => everySquad || coachSquad.eventInSquad(t.squad)), Date.now()).comingUp

  return (
    <div className="min-h-screen bg-ground pb-28">
      <div className={WIDE_COLUMN}>
        <PageTop className="arc" title={t('coachTraining:pastTrainings')} trail={<CoachTrail current={t('coachTraining:pastTrainings')} />} />
        {past.error ? <LoadError what={t('coachTraining:pastWhat')} onRetry={() => void past.refetch()} retrying={past.isFetching} />
          : past.isPending ? <LoadingSkeleton label={t('coachTraining:loadingPast')} lines={2} rows={4} className="pt-6" />
          : inView.length === 0 ? <div className="arc"><EmptyState icon={<History size={24} strokeWidth={1.5} />} title={t('coachTraining:noPastYet')}
              description={t('coachTraining:pastKept')} /></div>
          : <div className="grid gap-4">
            <div className="arc max-w-[560px]">
              <SearchField label={t('coachTraining:searchPast')} placeholder={t('coachTraining:searchPastPh')} value={query} onValueChange={setQuery} />
            </div>
            {shown.length === 0 ? <p className="text-[15px] text-ink-2">{t('coachTraining:noPastMatch', { query: query.trim() })}</p>
              : <ul aria-label={t('coachTraining:pastTrainings')} className="grid gap-3">
                {shown.map(training => {
                  const { day } = gameWhen(training)
                  const sessionId = registers.data?.get(training.id)
                  const count = sessionId ? here.data?.get(sessionId) : undefined
                  const answer = againLabel(training.notes?.again)
                  const again = answer ? shownWord(TRAINING_WORD, answer) : null
                  return <li key={training.id} className="arc flex flex-wrap items-start gap-x-6 gap-y-3 rounded-2xl border border-line bg-surface p-5 laptop:p-6">
                    <div className="grid min-w-0 flex-[1_1_16rem] gap-1.5">
                      <p className="text-sm text-ink-3">{[day, everySquad ? training.squad : null, count != null ? t('coachTraining:hereCount', { count }) : null].filter(Boolean).join(' · ')}</p>
                      <p className="text-lg font-medium text-ink break-words">{training.title}</p>
                      <p className="text-sm text-ink-2 break-words">{training.planned ? sessionSummary(training.practices) : t('coachTraining:noPlanWritten')}</p>
                      {(again || training.notes?.note) && <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                        {again && <Badge size="sm" tone={training.notes?.again === 'no' ? 'warning' : 'success'}>{t('coachTraining:runItAgain', { answer: again })}</Badge>}
                        {training.notes?.note && <span className="break-words">“{training.notes.note}”</span>}
                      </p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => navigate(`${TRAINING_PATH}/${training.id}`)}
                        aria-label={t('coachTraining:viewNamed', { title: training.title, day })}>{t('coachTraining:view')}</Button>
                      {training.planned && training.practices.length > 0 && <Button size="sm" aria-label={t('coachTraining:useThisPlanNamed', { title: training.title, day })}
                        onClick={() => setCopying({ title: training.title, day, practices: training.practices })}><Copy aria-hidden size={16} />{t('coachTraining:useThisPlan')}</Button>}
                    </div>
                  </li>
                })}
              </ul>}
          </div>}
      </div>
      <CopyTargetSheet plan={copying} trainings={coming} onClose={() => setCopying(null)} />
    </div>
  )
}
