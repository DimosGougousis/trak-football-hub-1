import { useEffect, useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { useParked } from '@/components/trak/parked'
import {
  DRILL_DETAILS, DRILL_LIMITS, DRILL_MINUTES, blankDrill, detailCount, drillProblem, type Drill, type DrillDraft,
} from '@/lib/training/sessions'
import { useDeleteDrill, useSaveDrill } from './useTraining'

/* TRAK-294 (Training 1/5): New drill, and the same sheet to change or delete one of the coach's drills (mockup board
   4A+). A sheet on a phone, a window on a laptop (Arc's bottom sheet). A failed save keeps everything typed. */

const SAVE_FAILED = "Couldn't save the drill. Check your connection and try again. Nothing you typed is lost."
const DELETE_FAILED = "Couldn't delete the drill. Check your connection and try again."

const pill = (on: boolean) =>
  `min-h-11 min-w-12 rounded-xl border px-3.5 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? 'border-brand bg-brand/10 text-brand' : 'border-line bg-surface text-ink'}`
const area = 'min-h-24 w-full resize-y rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

const toDraft = (drill: Drill | null): DrillDraft => {
  if (!drill) return blankDrill()
  const { id: _id, updated_at: _at, ...draft } = drill
  return draft
}

export function DrillSheet({ open, drill, onOpenChange }: { open: boolean; drill: Drill | null; onOpenChange: (open: boolean) => void }) {
  const { parked, comingSoon } = useParked()
  const [draft, setDraft] = useState<DrillDraft>(() => toDraft(drill))
  const [problem, setProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const save = useSaveDrill()
  const remove = useDeleteDrill()
  const howId = useId()
  const tellId = useId()

  // Each opening starts from the drill picked (or a blank one), never from the last one typed.
  useEffect(() => {
    if (!open) return
    setDraft(toDraft(drill)); setProblem(null); setConfirming(false)
  }, [open, drill])

  const set = <K extends keyof DrillDraft>(key: K, value: DrillDraft[K]) => setDraft(d => ({ ...d, [key]: value }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (parked) return comingSoon()
    const why = drillProblem(draft)
    setProblem(why)
    if (why) return
    save.mutate({ id: drill?.id, draft }, {
      onSuccess: () => { toast.success(drill ? 'Drill saved' : 'Added to My drills'); onOpenChange(false) },
      onError: () => setProblem(SAVE_FAILED),
    })
  }
  const deleteDrill = () => {
    if (parked) return comingSoon()
    if (!drill) return
    remove.mutate(drill.id, {
      onSuccess: () => { toast.success('Drill deleted'); onOpenChange(false) },
      onError: () => { setConfirming(false); setProblem(DELETE_FAILED) },
    })
  }

  return <BottomSheet className="arc" open={open} onOpenChange={onOpenChange} detents={[0.92]}
    title={drill ? 'Edit drill' : 'New drill'} description="Write it once, use it in any session. Only you see it.">
    <form onSubmit={submit} noValidate className="grid gap-5 pb-4">
      <Input label="Name" value={draft.name} maxLength={DRILL_LIMITS.name} autoComplete="off" required
        onChange={e => set('name', e.target.value)} />

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium text-ink">Usual minutes</legend>
        <div className="flex flex-wrap gap-2">
          {DRILL_MINUTES.map(minutes => <button key={minutes} type="button" aria-pressed={draft.minutes === minutes}
            className={pill(draft.minutes === minutes)} onClick={() => set('minutes', minutes)}>{minutes}</button>)}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <label htmlFor={howId} className="text-sm font-medium text-ink">How it works</label>
        <textarea id={howId} value={draft.how} maxLength={DRILL_LIMITS.how} rows={3} className={area}
          onChange={e => set('how', e.target.value)} />
      </div>
      <div className="grid gap-2">
        <label htmlFor={tellId} className="text-sm font-medium text-ink">What you’ll tell them <span className="font-normal text-ink-3">(optional)</span></label>
        <textarea id={tellId} value={draft.tell} maxLength={DRILL_LIMITS.tell} rows={2} className={area}
          onChange={e => set('tell', e.target.value)} />
      </div>

      <details className="rounded-xl border border-dashed border-line bg-raised px-3.5 py-2" open={detailCount(draft) > 0 || undefined}>
        <summary className="flex min-h-11 cursor-pointer list-none flex-col justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <span className="text-[15px] font-medium text-ink">Add details <span className="font-normal text-ink-3">(optional)</span></span>
          <span className="text-sm text-ink-3">Area, numbers, direction, targets, conditions</span>
        </summary>
        <div className="grid gap-4 pt-3 pb-2">
          {DRILL_DETAILS.map(detail => <Input key={detail.key} label={detail.label} placeholder={detail.example}
            value={draft[detail.key]} maxLength={DRILL_LIMITS.detail} autoComplete="off" onChange={e => set(detail.key, e.target.value)} />)}
        </div>
      </details>

      {problem && <p role="alert" className="text-[15px] text-danger">{problem}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={save.isPending} disabled={save.isPending || remove.isPending}>Save drill</Button>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        {drill && (confirming
          ? <span className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-2">Delete this drill?</span>
            <Button type="button" variant="danger" size="sm" loading={remove.isPending} onClick={deleteDrill}>Delete</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep it</Button>
          </span>
          : <Button type="button" variant="ghost" className="ml-auto" onClick={() => setConfirming(true)}>Delete drill</Button>)}
      </div>
    </form>
  </BottomSheet>
}
