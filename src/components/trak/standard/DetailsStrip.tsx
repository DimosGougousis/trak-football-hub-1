import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { StatusPill } from './StatusPill'

/** Design standard: the strip of facts under a page's title (season dates, report cadence), between two hairlines, with
 *  an optional "next" callout and an action at the end. Goes in PageTop's `below`. */
export function DetailsStrip({ items, callout, action }: {
  items: { icon: LucideIcon; label: string; value: ReactNode }[]
  callout?: ReactNode
  action?: ReactNode
}) {
  return <div className="flex flex-col justify-between gap-4 border-y border-line py-4 laptop:flex-row laptop:items-center">
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-[15px]">
      {items.map(({ icon: Icon, label, value }) => <div key={label} className="flex items-center gap-2.5">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-3" />
        <span className="font-medium text-ink-3">{label}</span>
        <span className="font-semibold text-ink tabular-nums">{value}</span>
      </div>)}
      {callout && <StatusPill tone="needs">{callout}</StatusPill>}
    </div>
    {action && <div className="shrink-0 self-start laptop:self-auto">{action}</div>}
  </div>
}
