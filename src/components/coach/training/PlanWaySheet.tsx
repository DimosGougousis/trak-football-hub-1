import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PenLine } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { lastPlanWay, planPath, rememberPlanWay } from '@/lib/training/plans'
import { trainingMinutes } from '@/lib/training/sessions'
import { gameWhen } from '@/components/coach/games/useGames'
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import type { Training } from './useTraining'

/* TRAK-295 (Training 2/5, spec TRAK-293, mockup board 2): "How do you want to plan it?". Opened from a training, it
   asks how; opened from New session, it first asks which training. Write my own is the one way for now: Copy a past
   session joins it in Training 4/5, and Build it with Trak is parked. It remembers the coach's last way. */

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
  // Each opening starts again from the training it was opened for.
  useEffect(() => { if (open) setPicked(training) }, [open, training])

  const write = (chosen: Training) => {
    rememberPlanWay(user?.id, 'write')
    onOpenChange(false)
    navigate(planPath(chosen.id))
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

  const minutes = trainingMinutes(picked)
  return <BottomSheet className="arc" open={open} onOpenChange={onOpenChange} title="How do you want to plan it?"
    description={[when(picked), picked.venue, minutes ? `${minutes} min` : null].filter(Boolean).join(' · ')}>
    <div className="grid gap-4 pb-4">
      <button type="button" onClick={() => write(picked)}
        className="flex w-full flex-col gap-2.5 rounded-2xl border border-brand bg-surface p-[18px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span aria-hidden="true" className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <PenLine size={20} />
        </span>
        <span className="text-base font-medium text-ink">Write my own</span>
        <span className="text-sm text-ink-2">Type your practices: a name, the minutes, what you’ll tell them. Fastest when you already know.</span>
        {lastPlanWay(user?.id) === 'write' && <span><Badge size="sm">You used this last time</Badge></span>}
      </button>
      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Not now</Button>
      </div>
    </div>
  </BottomSheet>
}
