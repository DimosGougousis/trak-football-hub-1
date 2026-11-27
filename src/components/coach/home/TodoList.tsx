import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Button } from '@/components/arc/button/button'
import { LoadError } from '@/components/trak/LoadError'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'
import { MatchAction } from '@/components/coach/games/MatchAction'
import { NextStep } from '@/components/coach/CoachWeekStrip'
import { NEXT_STEP_SIZE, NEXT_STEP_WIDTH } from '@/components/coach/next-step'
import { phoneEventTime } from '@/lib/event-time'
import { evalDay } from '@/lib/evaluation'
import { planPath, herePath } from '@/lib/training/plans'
import { squadName, type WeekItem } from '@/lib/coach-week'
import { dateLocale, useTranslation } from '@/lib/i18n'
import type { EventRow } from '@/lib/coach-events'
import type { HomeTodoEvent } from './useHomeTodos'
import { TodoPreview, type PreviewKind } from './TodoPreview'

/* TRAK-608 (New Home 2/8, spec TRAK-606): Home's To-do. One numbered list in homeTodos()'s order (TRAK-607): an urgent
   to-do has a yellow number, a done one a green tick, and a button that can't be used yet is greyed and says when it
   opens. Each keeps the app's own next step: the week's (Take register, Share), the match's split button (TRAK-333),
   or the training's planner. */

const hhmm = (ms: number) => format(new Date(ms), 'HH:mm')

export function TodoList({ items, failed, onRetry, coachId, showSquad, onChanged, onOpenReports }: {
  /** null while loading. */
  items: HomeTodoEvent[] | null
  failed: boolean
  onRetry: () => void
  coachId: string
  /** Under All, for a coach of two squads or more: each to-do names its squad. */
  showSquad: boolean
  onChanged: () => void
  /** Reports ready opens the squad's reports, picking that squad under All. */
  onOpenReports: (squad: string | null) => void
}) {
  const { t } = useTranslation()
  const urgent = !!items?.some(({ todo }) => todo.urgent && !todo.done)
  // TRAK-609: which previews are open; each starts closed.
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const toggle = (key: string) => setOpen(now => { const next = new Set(now); if (!next.delete(key)) next.add(key); return next })
  return <section aria-labelledby="todo-title" className="grid gap-3">
    <h2 id="todo-title" className="text-lg font-medium text-ink">{t('coachHome:todoTitle')}</h2>
    {failed ? <LoadError what={t('coachHome:todoWhat')} onRetry={onRetry} />
      : !items ? <LoadingSkeleton label={t('coachHome:todoLoading')} lines={3} className="rounded-2xl border border-line bg-surface p-5" />
      : !items.length ? <p className="rounded-2xl border border-line bg-surface p-5 text-sm text-ink-2">{t('coachHome:todoNone')}</p>
      : <ol className="arc overflow-hidden rounded-2xl border border-line bg-surface">
        {items.map(({ todo, row }, index) => <li key={todo.key} className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-t border-line/60 p-4 first:border-t-0 laptop:grid-cols-[28px_minmax(0,1fr)_auto] laptop:px-5">
          <span aria-hidden className={`grid size-7 place-items-center rounded-full border-[1.5px] text-[13px] font-semibold tabular-nums ${
            todo.done ? 'border-success bg-success text-on-brand' : todo.urgent ? 'border-attention bg-attention text-ink' : 'border-line-strong text-ink-2'}`}>
            {todo.done ? '✓' : index + 1}
          </span>
          <span className="grid min-w-0">
            <span className={`text-base font-medium ${todo.done ? 'text-ink-2' : 'text-ink'}`}>
              {todo.urgent && !todo.done && <span className="sr-only">{t('coachHome:urgent')}</span>}{title(todo, row, t)}
            </span>
            <span className="text-sm text-ink-2">{[showSquad ? squadName(todo.squad) : null, line(todo, row, t)].filter(Boolean).join(' · ')}</span>
            {row && previewOf(todo) && <PreviewToggle kind={previewOf(todo)!} open={open.has(todo.key)} onToggle={() => toggle(todo.key)} />}
            {row && previewOf(todo) && open.has(todo.key) && <TodoPreview kind={previewOf(todo)!} eventId={row.id} theme={row.training_theme ?? null} />}
          </span>
          <span className="col-start-2 laptop:col-start-auto">{action(todo, row, { t, coachId, onChanged, onOpenReports })}</span>
        </li>)}
      </ol>}
    {urgent && <p className="flex items-center gap-2 text-sm text-ink-3"><span aria-hidden className="size-3 rounded-full bg-attention" />{t('coachHome:todoUrgentKey')}</p>}
  </section>
}

type T = ReturnType<typeof useTranslation>['t']

/** TRAK-609: what a to-do can preview, once there's something written: a plan, saved Notes, a drafted evaluation. */
function previewOf(todo: HomeTodoEvent['todo']): PreviewKind | null {
  if (todo.kind === 'training-plan') return todo.step === 'plan' ? null : 'training-plan'
  if (todo.kind === 'match-plan') return todo.step === 'plan' || todo.step === 'logistics' ? null : 'match-plan'
  if (todo.kind === 'notes') return todo.done ? 'notes' : null
  if (todo.kind === 'publish') return 'evaluation'
  return null
}

const TOGGLE: Record<PreviewKind, ['coachHome:previewPlanShow' | 'coachHome:previewNotesShow' | 'coachHome:previewEvaluationShow',
  'coachHome:previewPlanHide' | 'coachHome:previewNotesHide' | 'coachHome:previewEvaluationHide']> = {
  'training-plan': ['coachHome:previewPlanShow', 'coachHome:previewPlanHide'],
  'match-plan': ['coachHome:previewPlanShow', 'coachHome:previewPlanHide'],
  notes: ['coachHome:previewNotesShow', 'coachHome:previewNotesHide'],
  evaluation: ['coachHome:previewEvaluationShow', 'coachHome:previewEvaluationHide'],
}

function PreviewToggle({ kind, open, onToggle }: { kind: PreviewKind; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  return <button type="button" aria-expanded={open} onClick={onToggle}
    className="mt-1 justify-self-start rounded text-sm font-medium text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    {t(TOGGLE[kind][open ? 1 : 0])} <span aria-hidden>{open ? '▴' : '▾'}</span>
  </button>
}
type Todo = HomeTodoEvent['todo']

const opponent = (row: EventRow | null) => row?.opponent || row?.title || ''
const when = (row: EventRow | null) => row ? phoneEventTime(row) : null

function title(todo: Todo, row: EventRow | null, t: T): string {
  switch (todo.kind) {
    case 'training-plan': return todo.step === 'plan' ? t('coachHome:todoNoTrainingPlan') : t('coachHome:todoTrainingPlan')
    case 'register': return t('coachHome:todoRegister')
    case 'notes': return t('coachHome:todoNotes')
    case 'match-plan': return todo.step === 'plan' || todo.step === 'logistics'
      ? t('coachHome:todoNoMatchPlan', { opponent: opponent(row) }) : t('coachHome:todoMatchPlan', { opponent: opponent(row) })
    case 'evaluate': return t('coachHome:todoEvaluate')
    case 'publish': return t('coachHome:todoPublish')
    case 'reports': return t('coachHome:reportsReady')
    case 'next-training': return t('coachHome:todoNextTraining', { day: row?.starts_at ? format(new Date(row.starts_at), 'EEEE', { locale: dateLocale() }) : '' })
    case 'next-match': return todo.step === 'logistics' ? t('coachHome:todoShareLogistics', { opponent: opponent(row) })
      : todo.step === 'plan' ? t('coachHome:todoWritePlan', { opponent: opponent(row) }) : t('coachHome:todoSharePlan', { opponent: opponent(row) })
  }
}

function line(todo: Todo, row: EventRow | null, t: T): string {
  const time = when(row)
  const event = [row?.event_type === 'match' ? null : row?.title, time?.time, row?.venue].filter(Boolean).join(' · ')
  switch (todo.kind) {
    case 'training-plan': return todo.step === 'plan' && time?.time ? t('coachHome:todoPlanBefore', { time: time.time }) : event
    case 'match-plan': return todo.step === 'plan' || todo.step === 'logistics'
      ? t('coachHome:todoWriteBefore', { time: time?.time ?? '' }) : event
    case 'evaluate': return t('coachHome:todoEvaluateWhy')
    case 'publish': return t('coachHome:todoPublishWhy')
    case 'reports': return t('coachHome:evaluationDueSince', { day: evalDay(new Date(todo.at).toISOString().slice(0, 10)) })
    case 'next-training': case 'next-match': return [time?.date ? evalDay(time.date) : null, time?.time].filter(Boolean).join(' · ')
    default: return event
  }
}

function action(todo: Todo, row: EventRow | null, { t, coachId, onChanged, onOpenReports }: { t: T; coachId: string; onChanged: () => void; onOpenReports: (squad: string | null) => void }) {
  const button = (label: string, onClick?: () => void, disabled = false) =>
    <Button size={NEXT_STEP_SIZE} className={NEXT_STEP_WIDTH} disabled={disabled} onClick={onClick}>{label}</Button>
  const pill = (label: string) => <span className="inline-flex rounded-full bg-success/10 px-2.5 py-1 text-sm font-medium text-success">{label}</span>
  if (!row && todo.kind !== 'reports') return null
  // Not yet: greyed, saying when it opens.
  if (!todo.done && todo.opensAt) {
    const label = todo.kind === 'register' ? t('coachHome:todoFrom', { time: hhmm(todo.opensAt) })
      : todo.kind === 'evaluate' ? t('coachHome:todoAfterFullTime') : t('coachHome:todoAfter', { time: hhmm(todo.opensAt) })
    return button(label, undefined, true)
  }
  switch (todo.kind) {
    case 'training-plan':
      if (todo.step === 'shared') return pill(t('coachHome:todoShared'))
      return <Go to={planPath(row!.id)} label={todo.step === 'plan' ? t('coachHome:todoPlanTraining') : t('coachHome:share')} />
    case 'next-training': return <Go to={planPath(row!.id)} label={t('coachHome:todoPlanTraining')} />
    case 'register':
      if (todo.done) return pill(t('coachHome:todoSaved'))
      return <NextStep item={weekItem(row!, 'register')} coachId={coachId} roster={undefined} onChanged={onChanged} />
    case 'notes':
      if (todo.done) return pill(t('coachHome:todoSaved'))
      return <Go to={herePath(row!.id)} label={t('coachHome:todoWriteNotes')} />
    case 'match-plan':
      if (todo.done) return pill(t('coachHome:todoShared'))
      return <MatchAction state={todo.step as never} eventId={row!.id} />
    case 'next-match': return <MatchAction state={todo.step as never} eventId={row!.id} />
    case 'evaluate':
      if (todo.done) return pill(t('coachHome:todoSaved'))
      return <MatchAction state="fullTime" eventId={row!.id} />
    case 'publish':
      if (todo.done) return pill(t('coachHome:todoPublished'))
      return <MatchAction state="evaluationDraft" eventId={row!.id} />
    case 'reports': return button(t('coachHome:open'), () => onOpenReports(todo.squad))
  }
}

function Go({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate()
  return <Button size={NEXT_STEP_SIZE} className={NEXT_STEP_WIDTH} onClick={() => navigate(to)}>{label}</Button>
}

/** The week's next step reads a week item; the register needs only its event's row. */
const weekItem = (row: EventRow, step: 'register'): WeekItem => ({
  id: row.id, date: row.event_date ?? '', kind: 'training', title: row.title, time: phoneEventTime(row).time,
  state: 'needs-you', note: '', step, source: row as unknown as Record<string, unknown>, row,
})
