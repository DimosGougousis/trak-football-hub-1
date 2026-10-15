import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { ChevronRight } from 'lucide-react'
import { LoadError } from '@/components/trak/LoadError'
import { eventHeading, toPlayerEvent, type PlayerEvent } from '@/lib/player-events'
// The coach calendar's colours (TRAK-159, founders 12 Oct): one constant everywhere.
import { CANCELLED_COLOR, EVENT_COLOR } from '@/lib/coach-events'

export interface StripEvent extends PlayerEvent {
  /** Coach only: a draft families can't see yet. */
  draft?: boolean
  /** A completed coach session, rather than a planned calendar entry. */
  sessionId?: string
}

/** Monday to Sunday of the week `today` is in, as YYYY-MM-DD (Imad, 12 Oct). */
export function weekDays(today: Date): string[] {
  const monday = startOfWeek(today, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => format(addDays(monday, i), 'yyyy-MM-dd'))
}

/** How a role opens an event: a sheet around the row's trigger (TRAK-182), given a refresh for after a change. */
export type RenderEventSheet = (event: StripEvent, trigger: ReactElement, refresh: () => void) => ReactNode

/**
 * TRAK-163: this week, Monday to Sunday, under the Home header (the Therabody
 * strip). Today is selected; a day with events shows a dot per event; tapping
 * a day lists its events. TRAK-182: each event opens in a bottom sheet where
 * it is (not the calendar); a coach's logged session opens its saved record.
 */
export function WeekStrip({ events, renderSheet, sessionHref, refresh = () => {}, today = new Date() }: {
  events: StripEvent[]
  renderSheet: RenderEventSheet
  sessionHref?: (event: StripEvent) => string
  refresh?: () => void
  today?: Date
}) {
  const [day, setDay] = useState(format(today, 'yyyy-MM-dd'))
  const onDay = (date: string) => events.filter(event => event.date === date)
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
  const chosen = onDay(day)

  return (
    <section aria-label="This week" className="arc mb-5">
      <SegmentedControl className="arc-week" label="This week" value={day} onValueChange={setDay}
        options={weekDays(today).map(value => {
          const date = parseISO(value)
          const dots = onDay(value)
          // M T W T F S S, as in the Therabody strip; the full date is read out.
          return {
            value,
            label: format(date, 'EEEEE'),
            accessory: <><span className="sr-only">{format(date, 'EEEE d MMMM')}</span>{dots.length > 0 && <span className="inline-flex gap-[3px]" aria-label={`${dots.length} ${dots.length === 1 ? 'event' : 'events'}`}>
              {dots.slice(0, 3).map(event => <span key={event.id} aria-hidden="true" className="w-[5px] h-[5px] rounded-full"
                style={{ background: event.status === 'cancelled' ? CANCELLED_COLOR : EVENT_COLOR[event.kind] }} />)}
            </span>}</>,
          }
        })} />
      <p className="text-[11px] tracking-[0.08em] uppercase text-white/35 mt-3 mb-1" style={{ fontFamily: "'DM Mono', monospace" }}>
        {format(parseISO(day), 'EEEE d MMMM')}
      </p>
      {chosen.length === 0 ? <p className="text-[13px] text-white/45 py-2">Nothing planned.</p> : (
        <ul className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {chosen.map(event => {
            const label = <>
              <span aria-hidden="true" className="w-[7px] h-[7px] rounded-full shrink-0"
                style={{ background: event.status === 'cancelled' ? CANCELLED_COLOR : EVENT_COLOR[event.kind] }} />
              <span className="w-12 shrink-0 text-[13px] text-white/60">{event.sessionId ? 'Logged' : event.time ?? 'TBC'}</span>
              <span className="flex-1 min-w-0 truncate text-[14px] text-white/90">{eventHeading(event)}</span>
              {event.status === 'cancelled' && <span className="text-[12px]" style={{ color: CANCELLED_COLOR }}>Cancelled</span>}
              {event.draft && <span className="text-[12px] text-white/45">Draft</span>}
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-white/40" />
            </>
            const row = 'w-full flex items-center gap-3 min-h-12 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md'
            return <li key={event.id}>
              {event.sessionId && sessionHref
                ? <Link to={sessionHref(event)} className={row}>{label}</Link>
                : renderSheet(event, <button type="button" className={row}>{label}</button>, refresh)}
            </li>
          })}
        </ul>
      )}
    </section>
  )
}

type WeekRows = PromiseLike<{ data: unknown[] | null; error: unknown }>

/**
 * The strip with its own read of this week, past days included (Home's lists
 * only load from today). `loadKey` names whose week it is. A failed read is
 * an error with Retry, never an empty week (the J4 standard).
 */
export function LoadedWeekStrip({ load, loadKey, renderSheet, sessionHref }: {
  load: (from: string, to: string) => WeekRows
  loadKey: string
  renderSheet: RenderEventSheet
  sessionHref?: (event: StripEvent) => string
}) {
  const [events, setEvents] = useState<StripEvent[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let cancelled = false
    const days = weekDays(new Date())
    setFailed(false)
    setEvents(null)
    loadRef.current(days[0], days[6]).then(({ data, error }) => {
      if (cancelled) return
      if (error) { setFailed(true); return }
      setEvents((data ?? []).flatMap(row => {
        const event = toPlayerEvent(row as Record<string, unknown>)
        const source = row as { published?: boolean; sessionId?: string }
        return event ? [{ ...event, draft: source.published === false, sessionId: source.sessionId }] : []
      }))
    }, () => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [loadKey, attempt])

  if (failed) return <div className="mb-4"><LoadError what="this week" onRetry={() => setAttempt(n => n + 1)} /></div>
  if (!events) return null
  return <WeekStrip events={events} renderSheet={renderSheet} sessionHref={sessionHref} refresh={() => setAttempt(n => n + 1)} />
}
