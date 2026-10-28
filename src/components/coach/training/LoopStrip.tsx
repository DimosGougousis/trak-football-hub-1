import { Check } from 'lucide-react'

/* TRAK-295 (Training 2/5, spec TRAK-293): every training's loop, Plan → Who's here → Run it → Close, and where this
   one is. Who's here, Run it and Close are Training 5/5. */

const STEPS = ['Plan', 'Who’s here', 'Run it', 'Close'] as const

/** `at` is the step the training is on; the steps before it are done. `note` says why it's there, e.g. "now". */
export function LoopStrip({ at, note }: { at: number; note: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <ol aria-label="Training loop" className="flex flex-wrap items-center gap-1.5">
        {STEPS.map((step, i) => {
          const done = i < at
          const current = i === at
          return <li key={step} aria-current={current ? 'step' : undefined} className="flex items-center gap-1.5 text-[13px]">
            {i > 0 && <span aria-hidden="true" className="text-ink-3">→</span>}
            <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 ${done ? 'bg-brand font-medium text-on-brand'
              : current ? 'border-[1.5px] border-brand bg-brand/10 font-medium text-brand' : 'bg-raised text-ink-3'}`}>
              {done && <Check aria-hidden size={14} />}
              {i + 1} · {step}
              {done && <span className="sr-only">(done)</span>}
              {current && <span className="font-normal">({note})</span>}
            </span>
          </li>
        })}
      </ol>
      <span className="text-[13px] text-ink-3">The loop closes when you close the session.</span>
    </div>
  )
}
