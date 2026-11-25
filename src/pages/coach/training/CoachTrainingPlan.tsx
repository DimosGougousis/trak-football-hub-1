import { TOP_BAR as RAIL_TOP_BAR } from '@/components/arc/blocks/sidebar-rail/sidebar-rail'
import { useTranslation } from '@/lib/i18n'
import { partName, TRAINING_WORD } from '@/lib/training/words'
import { shown } from '@/lib/squad/trait-words'
import { useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CalendarDays, Check, Clock, Eye, MapPin, Notebook, Share, Users } from 'lucide-react'
import { DRILL_DETAILS, trainingEnd, trainingMinutes } from '@/lib/training/sessions'
import { loopState, practiceStarts } from '@/lib/training/loop'
import { againLabel } from '@/lib/training/next'
import { fromSaved, planPath, viewPath, type Practice } from '@/lib/training/plans'
import { useAuth } from '@/contexts/AuthContext'
import { useCoachSquad } from '@/lib/coach-squad'
import { useSideMenuScreen } from '@/lib/side-menu-screen'
import type { EventRow } from '@/lib/coach-events'
import { gameWhen } from '@/components/coach/games/useGames'
import { useNotes, usePlan, useRegisters, useTraining, type Plan, type Training } from '@/components/coach/training/useTraining'
import { CoachTrail } from '@/components/coach/CoachTrail'
import { RegisterSheet } from '@/components/coach/training/RegisterSheet'
import { NotesForm } from '@/components/coach/training/NotesForm'
import { LoadError, WIDE_COLUMN } from '@/components/trak'
import { Logistics, useLogisticsEdit } from '@/pages/coach/CoachGame'
import { Planner, type PlannerOpen } from './Planner'
import { WhosHere } from './WhosHere'
import { Badge } from '@/components/arc/badge/badge'
import { PageHeader, PageHeaderPanel, type PageHeaderAction } from '@/components/arc/blocks/page-header/page-header'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'
import { INNER_TITLE } from '@/components/coach/PageTop'

/* TRAK-295 (Training 2/5, spec TRAK-293, mockup boards 3A and 5): a training's plan; only the coach sees it. TRAK-298
   (Training 5/5): the page runs the loop: Who's here opens the existing register, and the training closes on its own
   once it has ended with its register taken (Kostas, 28 Oct). View (/coach/training/:eventId/view) is the plan read at
   the pitch side (TRAK-309). TRAK-456 (Imad, 16 Nov): a training's page is built like a match's, so a coach learns one
   layout: Arc's Page header over three tabs, Logistics, Training plan (the planner, its last step Review & share) and
   After training (Who's here, then Notes); the tab lives in the URL (?tab=). The tabs took the old step strip's place;
   Plan session (/plan) and Who's here (/here) were pages of their own and now land on their tab. TRAK-429: the coach
   pages' width. */

const TRAINING_PATH = '/coach/training'
const linkClass = 'rounded text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
/* Each label is a word key, read in the language showing. */
const TABS = [
  { id: 'logistics', label: 'coachMatches:actLogistics' }, { id: 'plan', label: 'coachHome:trainingPlan' }, { id: 'after', label: 'coachTraining:afterTraining' },
] as const
type Tab = (typeof TABS)[number]['id']
type Row = Training & EventRow
/** The laptop's top bar is pinned above the page; the header pins under it, as a match's. */
const TOP_BAR = `${RAIL_TOP_BAR}px`
const icon = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const
const metaIcon = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const

/** The training and its plan, read together, so the page never shows "Not planned" before the plan arrives. */
function WithTraining({ children }: { children: (training: Row, plan: Plan | null) => ReactNode }) {
  const { eventId } = useParams()
  const { t } = useTranslation()
  const training = useTraining(eventId)
  const plan = usePlan(eventId)
  return (
    <div className="min-h-screen bg-ground pb-28">
      <div className={WIDE_COLUMN}>
        {training.error || plan.error
          ? <div className="pt-10"><LoadError what={t('coachTraining:thisTrainingWhat')} onRetry={() => { void training.refetch(); void plan.refetch() }}
              retrying={training.isFetching || plan.isFetching} /></div>
          : training.isPending || plan.isPending ? <LoadingSkeleton label={t('coachTraining:loadingTraining')} lines={4} rows={2} className="pt-6" />
          : !training.data ? <div className="grid gap-3 pt-10">
              <p className="text-[15px] text-ink-2">{t('coachTraining:notOnSchedule')}</p>
              <Link to={TRAINING_PATH} className={linkClass}>{t('coachTraining:backToTraining')}</Link>
            </div>
          // Keyed by training: a route that only changes :eventId must never carry one plan's typing into another's.
          : <div key={training.data.id}>{children(training.data, plan.data)}</div>}
      </div>
    </div>
  )
}

/** /plan and /here, the pages before TRAK-456: their tab, with what they were opened with (a plan to copy, a drill). */
export function ToTab({ tab }: { tab: Tab }) {
  const { eventId } = useParams()
  const { state } = useLocation()
  return <Navigate to={`${TRAINING_PATH}/${eventId}?tab=${tab}`} state={state} replace />
}

/* ── The training's page (TRAK-456) ───────────────────────────────────────── */

export function TrainingRoute() {
  return <WithTraining>{(training, plan) => <TrainingPage training={training} plan={plan} />}</WithTraining>
}

function TrainingPage({ training, plan }: { training: Row; plan: Plan | null }) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const coachSquad = useCoachSquad(user?.id)
  const wide = useSideMenuScreen()
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.find(entry => entry.id === params.get('tab'))?.id ?? 'logistics'
  const registers = useRegisters()
  const notes = useNotes()
  const logistics = useLogisticsEdit(training)
  const [log, setLog] = useState(false)
  // What the page asks the planner to open (Review & share, or a part), kept as the planner stays mounted under its tab.
  const [open, setOpen] = useState<PlannerOpen | null>(null)
  // A plan saved from Who's here starts the planner again from what's saved.
  const [fresh, setFresh] = useState(0)
  const [now] = useState(() => Date.now())
  const cancelled = training.status === 'cancelled'
  const sessionId = registers.data?.get(training.id) ?? null
  const started = Date.parse(training.starts_at) <= now
  const over = trainingEnd(training) <= now
  const loop = loopState({ planned: !!plan, registered: !!sessionId, noted: !!notes.data?.has(training.id), started, over })
  const { day, time, academy } = gameWhen(training)
  const minutes = trainingMinutes(training)
  const squad = coachSquad.squads.length >= 2 && training.squad ? training.squad : undefined

  const show = (next: Tab) => setParams({ tab: next }, { replace: true })
  /** The Training plan tab, at a part or at Review & share. */
  const openPlan = (part: number | null = null) => {
    setOpen(current => ({ part, n: (current?.n ?? 0) + 1 }))
    show('plan')
    window.scrollTo({ top: 0 })
  }
  // Before it starts, Review & share, as a match's header; from the start, Who's here.
  const primary: PageHeaderAction | undefined = cancelled || loop.closed ? undefined
    : !started ? { key: 'review', label: t('coachMatches:reviewShare'), icon: <Share {...icon} />, onSelect: () => {
      openPlan()
      requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('plan-share')?.scrollIntoView?.({ block: 'center' })))
    } }
    : tab !== 'after' ? { key: 'here', label: t('coachTraining:loopHere'), icon: <Users {...icon} />, onSelect: () => show('after') }
    : undefined
  // View, the plan at the pitch side; once closed, the log.
  const secondary: PageHeaderAction[] = cancelled ? []
    : loop.closed ? [{ key: 'log', label: t('coachTraining:viewLog'), icon: <Notebook {...icon} />, onSelect: () => setLog(true) }]
    : plan ? [{ key: 'view', label: t('coachTraining:view'), icon: <Eye {...icon} />, onSelect: () => navigate(viewPath(training.id)) }]
    : []
  const status = cancelled ? <Badge tone="danger" dot>{t('coachHome:noteCancelled')}</Badge>
    : loop.closed ? <Badge tone="success" dot>{t('coachTraining:closedBadge')}</Badge>
    : <Badge tone={plan ? 'success' : 'attention'} dot>{plan ? t('coachTraining:readyBadge') : t('coachTraining:notPlanned')}</Badge>

  return <>
    <PageHeader className="[--ph-bleed:1.25rem] tablet:[--ph-bleed:2rem]" top={wide ? TOP_BAR : '0px'}
      title={training.title} status={status}
      // TRAK-367: the trail says which training by its day, as a training's name can be long. TRAK-569 (phone review,
      // 23 Nov): no coach avatar beside it (the side menu isn't needed here), as a match's page.
      crumbs={<CoachTrail current={day} />}
      details={<>
        <span><CalendarDays {...metaIcon} /><strong>{day}</strong></span>
        {time && <span><Clock {...metaIcon} />{[time, minutes ? t('coachHome:minutes', { count: minutes }) : null, academy].filter(Boolean).join(' · ')}</span>}
        {training.venue && <span><MapPin {...metaIcon} /><strong>{training.venue}</strong></span>}
        {training.squad && <span><Users {...metaIcon} />{training.squad}</span>}
      </>}
      primary={primary} secondary={secondary}
      tabsLabel={t('coachTraining:thisTraining')} value={tab} onValueChange={next => show(next as Tab)}
      tabs={cancelled ? [] : TABS.map(entry => ({ value: entry.id, label: t(entry.label),
        extra: entry.id === 'logistics' && training.published ? <><Check size={14} strokeWidth={2} aria-hidden="true" /><span className="sr-only">{t('coachMatches:srShared')}</span></> : undefined }))}>
      {cancelled ? <Cancelled plan={plan} /> : <>
        <PageHeaderPanel value="logistics">
          <div className="grid gap-4">
            <Logistics row={training} squad={squad} onEdit={logistics.open} publish={logistics.publish} />
            <div><Link to={`/coach/schedule?event=${training.id}`} className={linkClass}>{t('coachTraining:openInSchedule')}</Link></div>
          </div>
        </PageHeaderPanel>
        {/* Mounted under every tab, so what's typed in the plan lives on while Logistics is open. */}
        <PageHeaderPanel value="plan" shown={tab === 'plan'}>
          <Planner key={fresh} training={training} saved={plan} open={open} logistics={logistics} />
        </PageHeaderPanel>
        <PageHeaderPanel value="after">
          <div className="grid gap-6 laptop:gap-8 pt-4">
            {registers.error && <p role="alert" className="text-sm text-danger">{t('coachTraining:couldntCheckRegister')} <button type="button"
              className={`min-h-11 ${linkClass}`} onClick={() => void registers.refetch()}>{t('coachTraining:tryAgain')}</button></p>}
            <WhosHere training={training} plan={plan} onPlan={part => openPlan(part ?? null)} onSaved={() => setFresh(n => n + 1)} />
            {over && <AfterNotes training={training} planned={!!plan} onReview={() => openPlan()} />}
          </div>
        </PageHeaderPanel>
      </>}
    </PageHeader>
    {logistics.sheet}
    <RegisterSheet training={training} sheet={log ? 'log' : null} sessionId={sessionId} onClose={() => setLog(false)} />
  </>
}

/** Notes, once the training is over: the question and the note, or what was answered. */
function AfterNotes({ training, planned, onReview }: { training: Row; planned: boolean; onReview: () => void }) {
  const { t } = useTranslation()
  const notes = useNotes()
  const saved = notes.data?.get(training.id)
  const answer = againLabel(saved?.again)
  if (notes.isPending || (saved && !answer && !saved.note)) return null
  return <section aria-labelledby="notes" className="arc grid gap-4 rounded-2xl border border-line bg-surface p-5 laptop:p-6">
    <h2 id="notes" className="text-lg font-medium text-ink">{t('coachTraining:loopNotes')}</h2>
    {saved ? <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
      {answer && <Badge size="sm" tone={saved.again === 'no' ? 'warning' : 'success'}>{t('coachTraining:runItAgain', { answer: shown(TRAINING_WORD, answer) })}</Badge>}
      {saved.note && <span className="break-words">“{saved.note}”</span>}
    </p>
      : <NotesForm training={training} planned={planned} onReview={onReview} onClosed={() => {}} />}
  </section>
}

/** A cancelled training: no tabs, as a cancelled match; what was planned, read only. */
function Cancelled({ plan }: { plan: Plan | null }) {
  const { t } = useTranslation()
  const practices = fromSaved(plan?.practices ?? [])
  return <div className="grid gap-4 pt-4">
    <p className="text-[15px] text-ink-2">{t('coachTraining:cancelledCantChange')}</p>
    {practices.length > 0 && <ol aria-label={t('coachMatches:thePlan')} className="arc grid divide-y divide-line rounded-2xl border border-line bg-surface px-5 laptop:px-6">
      {practices.map((practice, i) => <li key={i} className="py-3 text-[15px] text-ink">{t('coachHome:minutes', { count: practice.minutes })} · {practice.name}</li>)}
    </ol>}
  </div>
}

/** The details a practice has, in the mockup's order: "20 × 30 m · 4v4 + 2". */
const detailsLine = (practice: Practice) => DRILL_DETAILS.map(d => practice[d.key].trim()).filter(Boolean).join(' · ')

/* ── View ─────────────────────────────────────────────────────────────────── */

export function PitchViewRoute() {
  return <WithTraining>{(training, plan) => <PitchView training={training} plan={plan} />}</WithTraining>
}

/** The plan at the pitch side, on a phone: big type, one practice per row, when each starts and how long it runs. */
function PitchView({ training, plan }: { training: Training; plan: Plan | null }) {
  const practices = fromSaved(plan?.practices ?? [])
  const { t } = useTranslation()
  const { day, time } = gameWhen(training)
  const starts = practiceStarts(time || null, practices)
  // TRAK-429: the coach pages' width, its title where theirs is.
  return <div className="grid gap-5 pt-5">
    {/* TRAK-334: opened from Training home's View plan, the trail goes back there; from the training's page, to that,
        which is also where it sits when opened from a link. TRAK-572: no coach avatar beside it, as on the training's page. */}
    <CoachTrail current={t('coachTraining:view')} parents={[{ label: day, href: `${TRAINING_PATH}/${training.id}` }]} />
    <header className="grid gap-1">
      <p className="text-[11px] font-medium uppercase tracking-[.09em] text-brand">{t('coachTraining:view')}</p>
      <h1 className={INNER_TITLE}>{[day, time].filter(Boolean).join(' · ')}</h1>
      <p className="text-base text-ink-2 break-words">{[training.title, training.venue].filter(Boolean).join(' · ')}</p>
    </header>
    {practices.length === 0 ? <p className="text-[17px] text-ink-2">{t('coachTraining:nothingPlannedYet')} <Link to={planPath(training.id)} className={linkClass}>{t('coachTraining:planIt')}</Link></p>
      : <ol aria-label="Practices to run" className="grid gap-3">
        {practices.map((practice, i) => {
          const details = detailsLine(practice)
          return <li key={i} className="flex gap-4 rounded-2xl border border-line bg-surface p-4 tablet:p-5">
            <div className="w-16 flex-none text-center">
              {starts[i] && <p className="text-[15px] font-medium text-brand">{starts[i]}</p>}
              <p className="text-[28px] font-medium leading-none text-ink">{practice.minutes}</p>
              <p className="text-[13px] text-ink-3">{t('coachTraining:minShort')}</p>
            </div>
            <div className="grid min-w-0 flex-1 content-start gap-1.5">
              {/* TRAK-341: the part it fills, when it isn't named after the drill. */}
              {practice.part && practice.part !== practice.name && <p className="text-[15px] font-medium text-brand break-words">{partName(practice.part)}</p>}
              <p className="text-[22px] font-medium leading-snug text-ink break-words">{practice.name}</p>
              {practice.tell.trim() && <p className="text-[19px] leading-snug text-ink break-words">“{practice.tell.trim()}”</p>}
              {details && <p className="text-[17px] text-ink-2 break-words">{details}</p>}
            </div>
          </li>
        })}
      </ol>}
  </div>
}
