import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/* TRAK-574 (Dimos, 25 Nov): the month on Events and Matches as one low strip across the top of the page instead of a square grid, so a
   coach taps a day and reads its events straight under it without scrolling. One row holds the month's days in order;
   each names its weekday. A laptop shows the whole month; a phone scrolls the row sideways, the picked day kept in view.
   Each day keeps Arc's calendar contract (TRAK-182, TRAK-255): a gridcell named "<full date>, N events[, needs you]",
   aria-selected when picked, today's aria-current, a dot per event (a hollow ring when cancelled) and the needs-you
   corner flag. */

export type StripMark = string | { color: string; hollow?: boolean }

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const sameDay = (a?: Date, b?: Date) => !!a && !!b && dayKey(a) === dayKey(b)
const addDays = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
const daysOf = (month: Date) => Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() },
  (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))

const NAV = 'grid h-9 w-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

export function MonthStrip({ value, onChange, month, onMonthChange, locale, today = new Date(), marks, attention }: {
  /** The picked day; none on Matches while no match is coming. */
  value?: Date
  onChange: (date: Date) => void
  month: Date
  onMonthChange: (month: Date) => void
  locale: string
  /** The viewer's today (tests pin it). */
  today?: Date
  marks?: (date: Date) => StripMark[]
  attention?: (date: Date) => boolean
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const shown = monthStart(month)
  const days = useMemo(() => daysOf(shown), [shown.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps -- by month
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(shown)
  const weekdayOf = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  const row = useRef<HTMLDivElement>(null)
  const focusRequest = useRef<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const inMonth = (date?: Date) => !!date && date.getFullYear() === shown.getFullYear() && date.getMonth() === shown.getMonth()
  // Roving tab stop: the day last focused, else the picked day, else today, else the 1st.
  const tabbable = (focused && days.some(d => dayKey(d) === focused) && focused)
    || (value && inMonth(value) && dayKey(value)) || (inMonth(today) && dayKey(today)) || dayKey(days[0])

  const goTo = (target: Date) => {
    if (!inMonth(target)) onMonthChange(monthStart(target))
  }
  const todayIdle = inMonth(today) && sameDay(value, today)

  // The picked day (else today) stays in view: the row scrolls sideways, never the page.
  const centreOn = value && inMonth(value) ? dayKey(value) : inMonth(today) ? dayKey(today) : null
  useLayoutEffect(() => {
    const strip = row.current
    const cell = centreOn ? strip?.querySelector<HTMLElement>(`[data-date="${centreOn}"]`) : null
    if (strip && cell && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = cell.offsetLeft - (strip.clientWidth - cell.offsetWidth) / 2
  }, [centreOn, shown.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps -- on a new day or month

  // Keyboard focus lands on the day it moved to, in the new month too.
  useLayoutEffect(() => {
    const key = focusRequest.current
    const cell = key ? row.current?.querySelector<HTMLButtonElement>(`[data-date="${key}"]`) : null
    if (cell) { focusRequest.current = null; cell.focus() }
  })

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    const moves: Record<string, Date> = {
      ArrowLeft: addDays(date, -1), ArrowRight: addDays(date, 1), ArrowUp: addDays(date, -7), ArrowDown: addDays(date, 7),
      Home: days[0], End: days[days.length - 1],
      PageUp: new Date(date.getFullYear(), date.getMonth() - 1, 1), PageDown: new Date(date.getFullYear(), date.getMonth() + 1, 1),
    }
    const next = moves[event.key]
    if (!next) return
    event.preventDefault()
    focusRequest.current = dayKey(next)
    setFocused(dayKey(next))
    goTo(next)
  }

  return <div className="grid min-w-0 gap-2">
    <div className="flex items-center justify-between gap-3">
      <h2 id={titleId} className="text-base font-black tracking-tight text-ink sm:text-lg">{monthLabel}</h2>
      <div className="flex items-center gap-1">
        <button type="button" aria-disabled={todayIdle || undefined}
          aria-label={`${t('coachHome:today')}, ${today.toLocaleDateString(locale, { dateStyle: 'full' })}`}
          className={cn('h-9 rounded-full px-3 text-sm font-bold text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', todayIdle && 'opacity-40')}
          onClick={() => { if (todayIdle) return; goTo(today); onChange(today) }}>
          {t('coachHome:today')}
        </button>
        <button type="button" className={NAV} aria-label="Previous month" onClick={() => onMonthChange(new Date(shown.getFullYear(), shown.getMonth() - 1, 1))}>
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <button type="button" className={NAV} aria-label="Next month" onClick={() => onMonthChange(new Date(shown.getFullYear(), shown.getMonth() + 1, 1))}>
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>

    {/* data-present: the month on screen, as Arc's calendar marks it (tests and links find a day by it). */}
    <div role="grid" aria-label={monthLabel} data-present className="-mx-1 min-w-0">
      <div ref={row} role="row"
        className="grid grid-flow-col auto-cols-[minmax(42px,1fr)] overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:thin] sm:auto-cols-[minmax(30px,1fr)]">
        {days.map(date => {
          const key = dayKey(date)
          const selected = sameDay(date, value)
          const isToday = sameDay(date, today)
          const dots = marks?.(date) ?? []
          const needsYou = attention?.(date) ?? false
          const label = date.toLocaleDateString(locale, { dateStyle: 'full' })
          const weekend = date.getDay() === 0 || date.getDay() === 6
          return <button key={key} type="button" role="gridcell" data-date={key}
            aria-label={(dots.length ? `${label}, ${dots.length} ${dots.length === 1 ? 'event' : 'events'}` : label) + (needsYou ? ', needs you' : '')}
            data-attention={needsYou || undefined} aria-selected={selected} aria-current={isToday ? 'date' : undefined}
            tabIndex={key === tabbable ? 0 : -1}
            onFocus={() => setFocused(key)} onKeyDown={event => onKeyDown(event, date)} onClick={() => onChange(date)}
            className={cn('group relative flex flex-col items-center gap-1 rounded-xl px-0.5 py-1.5 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              // A new week starts with a thin line, so the weeks still read inside one row.
              date.getDay() === 1 && date.getDate() > 1 && 'before:absolute before:inset-y-2 before:left-0 before:w-px before:bg-line',
              selected && 'bg-raised')}>
            {/* TRAK-270: coach Home's corner flag, in the day's top right. */}
            {needsYou && <span aria-hidden="true" className="absolute right-1 top-1 h-[9px] w-[9px] rounded-tr-[4px] bg-attention"
              style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)', filter: 'drop-shadow(0 0 .6px rgb(var(--t-warning)))' }} />}
            <span className={cn('text-[11px] font-bold uppercase leading-none', selected ? 'text-ink' : weekend ? 'text-ink-3' : 'text-ink-2')}>
              {weekdayOf.format(date).slice(0, 2)}
            </span>
            <span className={cn('grid h-8 w-8 place-items-center rounded-full text-sm tabular-nums leading-none',
              selected ? 'bg-brand font-black text-on-brand' : isToday ? 'font-black text-ink ring-1 ring-ink' : 'font-semibold text-ink')}>
              {date.getDate()}
            </span>
            <span aria-hidden="true" className={cn('flex h-1.5 items-center gap-0.5', selected && dots.length > 0 && 'rounded-full bg-surface')}>
              {dots.slice(0, 3).map((mark, index) => {
                const { color, hollow } = typeof mark === 'string' ? { color: mark, hollow: false } : mark
                return <span key={index} className="box-border h-1.5 w-1.5 rounded-full"
                  style={hollow ? { background: 'transparent', border: `1.5px solid ${color}` } : { background: color }} />
              })}
            </span>
          </button>
        })}
      </div>
    </div>
  </div>
}
