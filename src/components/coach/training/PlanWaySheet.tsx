import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Copy, PenLine } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  lastPlanWay, planPath, rememberPlanWay, searchSessions, sessionSummary, type PlanWay, type PlannerState,
} from '@/lib/training/plans'
import { trainingMinutes } from '@/lib/training/sessions'
import { gameWhen } from '@/components/coach/games/useGames'
import { LoadError } from '@/components/trak'
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { SearchField } from '@/components/arc/search-field/search-field'
import { usePastSessions, type PastSession, type Training } from './useTraining'

/* TRAK-295 (Training 2/5, spec TRAK-293, mockup board 2): "How do you want to plan it?". Opened from a training, it
   asks how; opened from New session, it first asks which training. It remembers the coach's last way. TRAK-297
   (Training 4/5, board 2b): Copy a past session shows once the coach has planned another session; copying opens Write
   my own filled in, and nothing saves until Save the plan. Build it with Trak is parked. */

const when = (training: Training) => {
  const { day, time } = gameWhen(training)
  return [day, time].filter(Boolean).join(' · ')
}

/** `training`: the one to plan. Null asks which of `choices` first (New session). */
export function PlanWaySheet({ open, onOpenChange, training, choices, onAddTraining }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  training: Training | null
  choices: Training[]
  onAddTraining: () => void
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [picked, setPicked] = useState<Training | null>(training)
  const [copying, setCopying] = useState(false)
  // Each opening starts again from the training it was opened for.
  useEffect(() => { if (open) { setPicked(training); setCopying(false) } }, [open, training])
  const past = usePastSessions(open)
  // Every planned session but this one; a failed read just leaves Copy out.
  const others = (past.data ?? []).filter(session => session.id !== picked?.id)

  const plan = (chosen: Training, way: PlanWay, state: PlannerState = null) => {
    rememberPlanWay(user?.id, way)
    onOpenChange(false)
    navigate(planPath(chosen.id), { state })
  }

  if (!picked) {
    return <BottomSheet className="arc" open={open} onOpenChange={onOpenChange} title="Which training?"
      description="Pick the training to plan.">
      <div className="grid gap-4 pb-4">
        {choices.length === 0 ? <>
          <p className="text-[15px] text-ink-2">Every training coming up is planned. Add a training in Schedule to plan another.</p>
          <div><Button onClick={() => { onOpenChange(false); onAddTraining() }}>Add a training</Button></div>
        </> : <ul className="grid gap-2">
          {choices.map(choice => <li key={choice.id}>
            <button type="button" onClick={() => setPicked(choice)}
              className="flex min-h-14 w-full flex-col justify-center rounded-xl border border-line bg-surface px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <span className="text-[15px] font-medium text-ink">{when(choice)}</span>
              <span className="text-sm text-ink-3">{[choice.title, choice.squad].filter(Boolean).join(' · ')}</span>
            </button>
          </li>)}
        </ul>}
      </div>
    </BottomSheet>
  }

  if (copying) {
    return <BottomSheet className="arc" open={open} onOpenChange={onOpenChange} detents={[0.92]} title="Copy a past session"
      description={`For ${when(picked)}. Every session you plan is kept here.`}>
      <CopyList sessions={others} error={!!past.error} onRetry={() => void past.refetch()} retrying={past.isFetching}
        onBack={() => setCopying(false)} onCopy={session => plan(picked, 'copy', { copy: session.practices, copiedFrom: `${session.title}, ${gameWhen(session).day}` })} />
    </BottomSheet>
  }

  const minutes = trainingMinutes(picked)
  const last = lastPlanWay(user?.id)
  return <BottomSheet className="arc" open={open} onOpenChange={onOpenChange} title="How do you want to plan it?"
    description={[when(picked), picked.venue, minutes ? `${minutes} min` : null].filter(Boolean).join(' · ')}>
    <div className="grid gap-4 pb-4">
      <div className="grid gap-3.5 tablet:grid-cols-2">
        <Way icon={<PenLine size={20} />} title="Write my own" last={last === 'write'} onPick={() => plan(picked, 'write')}
          text="Type your practices: a name, the minutes, what you’ll tell them. Fastest when you already know." />
        {others.length > 0 && <Way icon={<Copy size={20} />} title="Copy a past session" last={last === 'copy'} onPick={() => setCopying(true)}
          text={`Start from ${others[0].title}, or any session you’ve planned. Then change what you like.`} />}
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Not now</Button>
      </div>
    </div>
  </BottomSheet>
}

function Way({ icon, title, text, last, onPick }: { icon: ReactNode; title: string; text: string; last: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick}
      className={`flex w-full flex-col gap-2.5 rounded-2xl border bg-surface p-[18px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${last ? 'border-brand' : 'border-line'}`}>
      <span aria-hidden="true" className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">{icon}</span>
      <span className="text-base font-medium text-ink">{title}</span>
      <span className="text-sm text-ink-2">{text}</span>
      {last && <span><Badge size="sm">You used this last time</Badge></span>}
    </button>
  )
}

/** The coach's planned sessions, newest first, searchable by name or drill. */
function CopyList({ sessions, error, onRetry, retrying, onBack, onCopy }: {
  sessions: PastSession[]; error: boolean; onRetry: () => void; retrying: boolean; onBack: () => void; onCopy: (session: PastSession) => void
}) {
  const [query, setQuery] = useState('')
  const shown = searchSessions(sessions, query)
  return <div className="grid gap-4 pb-4">
    <div><Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft aria-hidden size={16} />Other ways to plan</Button></div>
    {error ? <LoadError what="your past sessions" onRetry={onRetry} retrying={retrying} /> : <>
      <SearchField label="Search past sessions" placeholder="Search by name or drill" value={query} onValueChange={setQuery} />
      {shown.length === 0 ? <p className="text-[15px] text-ink-2">No past session matches “{query.trim()}”.</p>
        : <ul aria-label="Past sessions" className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
          {shown.map(session => <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-ink break-words"><span className="font-medium">{session.title}</span>
                <span className="text-sm text-ink-3"> · {gameWhen(session).day}</span></p>
              <p className="text-[13px] text-ink-3 break-words">{sessionSummary(session.practices)}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => onCopy(session)} aria-label={`Copy ${session.title}, ${gameWhen(session).day}`}>Copy</Button>
          </li>)}
        </ul>}
      <p className="text-[13px] text-ink-3">Copying opens the planner with those practices filled in. Change anything before you save.</p>
    </>}
  </div>
}
