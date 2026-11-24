import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** good: done; needs: needs the coach; neutral: a plain fact. */
export type Tone = 'good' | 'needs' | 'neutral'

const LOOK: Record<Tone, string> = {
  good: 'text-success bg-success/10 border-success/25',
  needs: 'text-warning bg-attention/10 border-attention/25',
  neutral: 'text-ink-2 bg-raised border-line',
}
const DEFAULT_ICON: Record<Tone, 'check' | 'dot' | 'none'> = { good: 'check', needs: 'dot', neutral: 'none' }

/** Design standard: a status in words, tone on tint. The words carry the meaning; the colour and icon only add to it. */
export function StatusPill({ tone, size = 'md', icon = DEFAULT_ICON[tone], children }: {
  tone: Tone
  size?: 'sm' | 'md'
  icon?: 'check' | 'dot' | 'none'
  children: ReactNode
}) {
  return <span className={cn('inline-flex w-fit items-center gap-1.5 rounded-full border font-semibold tabular-nums', LOOK[tone],
    size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm')}>
    {icon === 'check' && <Check aria-hidden="true" size={14} strokeWidth={2.75} className="shrink-0" />}
    {icon === 'dot' && <span aria-hidden="true" data-dot className={cn('size-1.5 shrink-0 rounded-full', tone === 'needs' ? 'bg-attention' : 'bg-current')} />}
    <span>{children}</span>
  </span>
}
