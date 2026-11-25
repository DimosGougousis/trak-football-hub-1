import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Tone } from './StatusPill'

const FILL: Record<Tone, string> = { good: 'bg-success', needs: 'bg-attention', neutral: 'bg-ink' }

/** Design standard: a big figure with its caption on the baseline, and an optional thin progress bar (0 to 1). */
export function NumberBlock({ value, caption, progress, tone = 'neutral' }: {
  value: ReactNode
  caption: string
  progress?: number
  tone?: Tone
}) {
  const share = progress == null ? null : Math.min(1, Math.max(0, progress))
  return <div className="grid gap-3">
    <p className="flex flex-wrap items-baseline gap-x-2.5">
      <span className="text-4xl font-extrabold tracking-tight text-ink tabular-nums">{value}</span>
      <span className="text-[15px] font-medium text-ink-3">{caption}</span>
    </p>
    {share != null && <div role="progressbar" aria-label={caption} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
      <div className={cn('h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500', FILL[tone])} style={{ width: `${share * 100}%` }} />
    </div>}
  </div>
}
