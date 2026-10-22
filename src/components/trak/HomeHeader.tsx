import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'

/**
 * TRAK-163 (Imad, 12 Oct): the top of every Home. Calendar on the left, the
 * person's name in the middle (the parent's child switcher), the bell on the
 * right. The coach's bell says who can't make it (TRAK-232).
 */
export function HomeHeader({ calendarTo, calendarLabel = 'Calendar', center, right }: {
  calendarTo: string
  /** TRAK-255: the coach's is called Schedule. */
  calendarLabel?: string
  center: ReactNode
  right?: ReactNode
}) {
  return (
    <header className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 mb-3">
      <Link to={calendarTo} aria-label={calendarLabel}
        className="w-[42px] h-[42px] rounded-[12px] flex items-center justify-center border border-border bg-card text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <CalendarDays size={19} strokeWidth={1.75} aria-hidden="true" />
      </Link>
      <div className="min-w-0 flex justify-center">{center}</div>
      <div className="flex justify-end">{right}</div>
    </header>
  )
}

export function HomeTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="truncate text-[19px] font-semibold text-foreground/90"
      style={{ fontFamily: 'var(--t-font)', letterSpacing: '-0.02em' }}>
      {children}
    </h1>
  )
}
