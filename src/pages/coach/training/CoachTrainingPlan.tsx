import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ClipboardList, PenLine, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DRILL_DETAILS, DRILL_LIMITS, drillProblem, trainingMinutes } from '@/lib/training/sessions'
import {
  PLAN_MAX, blankPractice, fromSaved, minutesLine, move, planPath, plannedMinutes, sourceLabel, type Practice,
} from '@/lib/training/plans'
import { gameWhen } from '@/components/coach/games/useGames'
import { usePlan, useSavePlan, useTraining, type Plan, type Training } from '@/components/coach/training/useTraining'
import { DetailFields, MinutesPicks, TellField } from '@/components/coach/training/fields'
import { LoopStrip } from '@/components/coach/training/LoopStrip'
import { PlanWaySheet } from '@/components/coach/training/PlanWaySheet'
import { useParked } from '@/components/trak/parked'
import { LoadError } from '@/components/trak'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { Checkbox } from '@/components/arc/checkbox/checkbox'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Input } from '@/components/arc/input/input'

/* TRAK-295 (Training 2/5, spec TRAK-293, mockup boards 3A and 5): a training's plan. Write my own
   (/coach/training/:eventId/plan) types practices one at a time and saves the plan whole; the plan
   (/coach/training/:eventId) shows it with the loop. Only the coach sees either. Adding from My drills or the Library
   is Training 3/5; Copy a past session 4/5; Who's here, Run it and Close 5/5. */

const SAVE_FAILED = "Couldn't save the plan. Check your connection and try again. Nothing you typed is lost."
const TRAINING_PATH = '/coach/training'
const linkClass = 'rounded text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
const iconButton = 'inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl text-ink-2 hover:bg-raised disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

/** The training and its plan, read together, so the page never shows "Not planned" before the plan arrives. */
function WithTraining({ children }: { children: (training: Training, plan: Plan | null) => ReactNode }) {
  const { eventId } = useParams()
  const training = useTraining(eventId)
  const plan = usePlan(eventId)
  return (
    <div className="min-h-screen bg-ground pb-28">
      <div className="mx-auto w-full max-w-[1040px] px-5 tablet:px-8">
        {training.error || plan.error
          ? <div className="pt-10"><LoadError what="this training" onRetry={() => { void training.refetch(); void plan.refetch() }}
              retrying={training.isFetching || plan.isFetching} /></div>
          : training.isPending || plan.isPending ? <p role="status" className="pt-14 text-center text-[13px] text-ink-3">Loading the training…</p>
          : !training.data ? <div className="grid gap-3 pt-10">
              <p className="text-[15px] text-ink-2">This training isn’t on your schedule.</p>
              <Link to={TRAINING_PATH} className={linkClass}>Back to Training</Link>
            </div>
          // Keyed by training: a route that only changes :eventId must never carry one plan's typing into another's.
          : <div key={training.data.id}>{children(training.data, plan.data)}</div>}
      </div>
    </div>
  )
}

function Header({ training, children }: { training: Training; children: ReactNode }) {
  const { day, time, academy } = gameWhen(training)
  const minutes = trainingMinutes(training)
  return (
    <header className="arc grid gap-4 pt-5 pb-2">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-ink-3">
        <Link to={TRAINING_PATH} className={linkClass}>Training</Link><span aria-hidden="true">›</span><span className="text-ink">{day}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <p className="text-[11px] font-medium uppercase tracking-[.09em] text-brand">Training</p>
          <h1 className="text-[26px] font-medium tracking-[-0.01em] text-ink">{[day, time].filter(Boolean).join(' · ')}</h1>
          <p className="text-sm text-ink-2 break-words">{[training.title, training.venue, minutes ? `${minutes} min` : null].filter(Boolean).join(' · ')}</p>
          {academy && <p className="text-sm text-ink-3">{academy}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </header>
  )
}

/** The details a practice has, in the mockup's order: "20 × 30 m · 4v4 + 2". */
const detailsLine = (practice: Practice) => DRILL_DETAILS.map(d => practice[d.key].trim()).filter(Boolean).join(' · ')

function PracticeRow({ practice, actions }: { practice: Practice; actions?: ReactNode }) {
  const details = detailsLine(practice)
  const tag = sourceLabel(practice)
  return (
    <div className="arc flex flex-wrap items-start gap-x-3.5 gap-y-1 rounded-2xl border border-line bg-surface px-4 py-3.5 tablet:flex-nowrap tablet:px-5">
      <span className="w-11 flex-none pt-px text-center text-base font-medium text-ink">{practice.minutes}<span className="block text-[11px] font-normal text-ink-3">min</span></span>
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="text-[15px] font-medium text-ink break-words">{practice.name}</p>
        {practice.tell.trim() && <p className="text-sm text-ink-2 break-words">“{practice.tell.trim()}”</p>}
        {details && <p className="text-sm text-ink-3 break-words">{details}</p>}
        <span><Badge size="sm" tone={tag === 'Your drill' ? 'success' : 'neutral'}>{tag}</Badge></span>
      </div>
      {/* On a phone the buttons sit under the practice, so its name keeps the width. */}
      {actions && <div className="flex w-full justify-end tablet:w-auto">{actions}</div>}
    </div>
  )
}

/* ── Write my own ─────────────────────────────────────────────────────────── */

export function PlanEditorRoute() {
  return <WithTraining>{(training, plan) => training.status === 'cancelled'
    ? <><Header training={training}><Badge tone="danger">Cancelled</Badge></Header>
      <p className="pt-4 text-[15px] text-ink-2">This training was cancelled, so its plan can’t change.</p></>
    : <Editor training={training} saved={plan} />}</WithTraining>
}

type Writing = { index: number | null; draft: Practice }

function Editor({ training, saved }: { training: Training; saved: Plan | null }) {
  const { parked, comingSoon } = useParked()
  const navigate = useNavigate()
  const save = useSavePlan(training.id)
  const [practices, setPractices] = useState<Practice[]>(() => fromSaved(saved?.practices ?? []))
  // The practice being written: a new one (index null) or one of the list. An empty plan starts with one open.
  const [writing, setWriting] = useState<Writing | null>(() => saved?.practices.length ? null : { index: null, draft: blankPractice() })
  const [problem, setProblem] = useState<string | null>(null)
  const line = minutesLine(plannedMinutes(practices), trainingMinutes(training))
  const full = practices.length >= PLAN_MAX

  const keep = (practice: Practice) => {
    if (!writing) return
    setPractices(list => writing.index === null ? [...list, practice] : list.map((p, i) => i === writing.index ? practice : p))
    setWriting(null); setProblem(null)
  }
  const savePlan = () => {
    if (parked) return comingSoon()
    // A new practice nobody has typed into yet isn't in the way.
    const typing = writing && (writing.index !== null || writing.draft.name.trim())
    if (typing) return setProblem(writing.index === null
      ? `Add practice ${practices.length + 1} or cancel it first.` : `Finish changing practice ${writing.index + 1} first.`)
    if (!practices.length) return setProblem('Add a practice first.')
    setWriting(null)
    save.mutate(practices, {
      onSuccess: () => { toast.success('Plan saved'); navigate(`${TRAINING_PATH}/${training.id}`) },
      // The database's own words when it refuses (a cancelled training, too many practices); typing is kept.
      onError: error => setProblem('code' in error && error.code === 'P0001' ? `${error.message}.` : SAVE_FAILED),
    })
  }

  return <>
    <Header training={training}>
      <Badge>Only you see it</Badge>
      <Button loading={save.isPending} onClick={savePlan}>Save the plan</Button>
    </Header>
    <div className="pt-2"><LoopStrip at={0} note="now" /></div>

    <div className="mt-6 grid max-w-[720px] gap-3">
      <div>
        <p className="flex justify-between gap-3 text-[13px]"><span className="font-medium text-ink">{line.planned}</span>
          {line.left && <span className="text-ink-3">{line.left}</span>}</p>
      </div>

      {problem && <p role="alert" className="text-[15px] text-danger">{problem}</p>}

      <ol aria-label="Practices" className="grid gap-2.5">
        {practices.map((practice, i) => <li key={i}>
          {writing?.index === i
            ? <PracticeForm number={i + 1} isNew={false} draft={writing.draft} onChange={draft => setWriting({ index: i, draft })}
              onKeep={keep} onCancel={() => { setWriting(null); setProblem(null) }} />
            : <PracticeRow practice={practice} actions={<div className="flex flex-none">
              <button type="button" className={iconButton} aria-label={`Edit ${practice.name}`} disabled={!!writing}
                onClick={() => { setProblem(null); setWriting({ index: i, draft: practice }) }}><Pencil aria-hidden size={18} /></button>
              <button type="button" className={iconButton} aria-label={`Move ${practice.name} up`} disabled={i === 0 || !!writing}
                onClick={() => setPractices(list => move(list, i, -1))}><ArrowUp aria-hidden size={18} /></button>
              <button type="button" className={iconButton} aria-label={`Move ${practice.name} down`} disabled={i === practices.length - 1 || !!writing}
                onClick={() => setPractices(list => move(list, i, 1))}><ArrowDown aria-hidden size={18} /></button>
              <button type="button" className={iconButton} aria-label={`Remove ${practice.name}`} disabled={!!writing}
                onClick={() => setPractices(list => list.filter((_, at) => at !== i))}><Trash2 aria-hidden size={18} /></button>
            </div>} />}
        </li>)}
      </ol>

      {writing?.index === null && <PracticeForm number={practices.length + 1} isNew draft={writing.draft}
        onChange={draft => setWriting({ index: null, draft })} onKeep={keep} onCancel={() => { setWriting(null); setProblem(null) }} />}

      {!writing && (full
        ? <p className="text-sm text-ink-3">A plan holds up to {PLAN_MAX} practices.</p>
        : <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-ink-2">Add another:</span>
          <div className="arc"><Button variant="secondary" size="sm" onClick={() => { setProblem(null); setWriting({ index: null, draft: blankPractice() }) }}>
            <PenLine aria-hidden size={16} />Write it</Button></div>
        </div>)}
    </div>
  </>
}

/** One practice, written here: a name, the minutes, what you'll tell them, the five details, and Save to My drills.
 *  Kept apart from the list until Add practice, so Cancel loses only this practice's typing. The page holds the
 *  typing, so Save the plan knows a practice is half-written. */
function PracticeForm({ number, isNew, draft, onChange, onKeep, onCancel }: {
  number: number; isNew: boolean; draft: Practice; onChange: (draft: Practice) => void; onKeep: (p: Practice) => void; onCancel: () => void
}) {
  const [problem, setProblem] = useState<string | null>(null)
  const set = <K extends keyof Practice>(key: K, value: Practice[K]) => onChange({ ...draft, [key]: value })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const why = drillProblem(draft, 'practice')
    setProblem(why)
    if (!why) onKeep({ ...draft, name: draft.name.trim() })
  }
  return (
    <form onSubmit={submit} noValidate aria-label={`Practice ${number}`}
      className="arc grid gap-4 rounded-2xl border-[1.5px] border-brand bg-surface p-4 tablet:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium text-ink">Practice {number}</h2>
        <span className="text-[13px] text-ink-3">Write it yourself</span>
      </div>
      <Input label="Name" value={draft.name} maxLength={DRILL_LIMITS.name} autoComplete="off" required autoFocus
        onChange={e => set('name', e.target.value)} />
      <MinutesPicks legend="Minutes" value={draft.minutes} onChange={minutes => set('minutes', minutes)} />
      <TellField value={draft.tell} onChange={tell => set('tell', tell)} />
      <DetailFields draft={draft} onChange={set} />
      {draft.source === 'own' && <Checkbox label="Save to My drills, so I can reuse it" checked={draft.saveToDrills}
        onCheckedChange={on => set('saveToDrills', on === true)} />}
      {problem && <p role="alert" className="text-[15px] text-danger">{problem}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{isNew ? 'Add practice' : 'Keep changes'}</Button>
      </div>
    </form>
  )
}

/* ── The plan ─────────────────────────────────────────────────────────────── */

export function PlanRoute() {
  return <WithTraining>{(training, plan) => <PlanView training={training} plan={plan} />}</WithTraining>
}

function PlanView({ training, plan }: { training: Training; plan: Plan | null }) {
  const navigate = useNavigate()
  const [asking, setAsking] = useState(false)
  const cancelled = training.status === 'cancelled'
  const practices = fromSaved(plan?.practices ?? [])
  const total = plannedMinutes(practices)

  return <>
    <Header training={training}>
      {cancelled ? <Badge tone="danger">Cancelled</Badge> : plan ? <>
        <Badge tone="success">Ready</Badge>
        <Button variant="secondary" onClick={() => navigate(planPath(training.id))}>Change the plan</Button>
      </> : <>
        <Badge tone="warning">Not planned</Badge>
        <Button onClick={() => setAsking(true)}>Plan this session</Button>
      </>}
    </Header>
    {!cancelled && <div className="pt-2"><LoopStrip at={plan ? 1 : 0} note={plan ? 'next' : 'now'} /></div>}

    <section aria-labelledby="practices" className="mt-6 grid max-w-[720px] gap-2.5">
      {plan ? <>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="practices" className="text-lg font-medium text-ink">Practices</h2>
          <span className="text-[13px] text-ink-3">{practices.length} {practices.length === 1 ? 'practice' : 'practices'} · {total} min</span>
        </div>
        <ol className="grid gap-2.5">{practices.map((practice, i) => <li key={i}><PracticeRow practice={practice} /></li>)}</ol>
      </> : <>
        <h2 id="practices" className="sr-only">Practices</h2>
        <div className="arc">
          <EmptyState icon={<ClipboardList size={24} strokeWidth={1.5} />} title={cancelled ? 'This training was cancelled' : 'Not planned yet'}
            description={cancelled ? 'It had no plan.' : 'Plan it your way. Only you see the plan.'}
            action={cancelled ? undefined : <Button onClick={() => setAsking(true)}>Plan this session</Button>} />
        </div>
      </>}
      <Link to={`/coach/schedule?event=${training.id}`} className={`mt-2 justify-self-start ${linkClass}`}>Open in Schedule</Link>
    </section>

    <PlanWaySheet open={asking} onOpenChange={setAsking} training={training} choices={[]}
      onAddTraining={() => navigate('/coach/schedule')} />
  </>
}
