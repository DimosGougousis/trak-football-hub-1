import { useId } from 'react'
import { Input } from '@/components/arc/input/input'
import { DRILL_DETAILS, DRILL_LIMITS, DRILL_MINUTES, detailCount, type DrillDetail, type DrillDraft } from '@/lib/training/sessions'

/* TRAK-294/295: the fields New drill and the planner's practice share, so a drill and a practice read the same. */

const pill = (on: boolean) =>
  `min-h-11 min-w-12 rounded-xl border px-3.5 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? 'border-brand bg-brand/10 text-brand' : 'border-line bg-surface text-ink'}`
export const textArea = 'min-h-24 w-full resize-y rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

/** The minutes, picked from 10 to 30. */
export function MinutesPicks({ legend, value, onChange }: { legend: string; value: number; onChange: (minutes: number) => void }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {DRILL_MINUTES.map(minutes => <button key={minutes} type="button" aria-pressed={value === minutes}
          className={pill(value === minutes)} onClick={() => onChange(minutes)}>{minutes}</button>)}
      </div>
    </fieldset>
  )
}

/** What you'll tell them, optional. */
export function TellField({ value, onChange }: { value: string; onChange: (tell: string) => void }) {
  const id = useId()
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">What you’ll tell them <span className="font-normal text-ink-3">(optional)</span></label>
      <textarea id={id} value={value} maxLength={DRILL_LIMITS.tell} rows={2} className={textArea}
        onChange={e => onChange(e.target.value)} />
    </div>
  )
}

/** Add details: the five every Trak practice can carry, folded away until one is filled. */
export function DetailFields({ draft, onChange }: { draft: DrillDraft; onChange: (key: DrillDetail, value: string) => void }) {
  return (
    <details className="rounded-xl border border-dashed border-line bg-raised px-3.5 py-2" open={detailCount(draft) > 0 || undefined}>
      <summary className="flex min-h-11 cursor-pointer list-none flex-col justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="text-[15px] font-medium text-ink">Add details <span className="font-normal text-ink-3">(optional)</span></span>
        <span className="text-sm text-ink-3">Area, numbers, direction, targets, conditions</span>
      </summary>
      <div className="grid gap-4 pt-3 pb-2">
        {DRILL_DETAILS.map(detail => <Input key={detail.key} label={detail.label} placeholder={detail.example}
          value={draft[detail.key]} maxLength={DRILL_LIMITS.detail} autoComplete="off" onChange={e => onChange(detail.key, e.target.value)} />)}
      </div>
    </details>
  )
}
