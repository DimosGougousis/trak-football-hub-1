import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Accordion } from '@/components/arc/accordion/accordion'
import { LoadError } from '@/components/trak/LoadError'
import { eventHeading, toPlayerEvent, type EventKind, type PlayerEvent } from '@/lib/player-events'

/** Agreed in the J8 live run, 11 Oct: training blue, match red, other orange; the same
 *  shades as the coach calendar in #276 (TRAK-159).
 *  ponytail: copied until #276 merges, then import its constant from lib/coach-events. */
const EVENT_KIND_COLOR: Record<EventKind, string> = {
  training: '#60a5fa',
  match: '#f87171',
  tournament: '#c084fc',
  other: '#fb923c',
}

export interface StripEvent extends PlayerEvent {
  /** Coach only: a draft families can't see yet. */
  draft?: boolean
}

/** Monday to Sunday of the week `today` is in, as YYYY-MM-DD (Imad, 12 Oct). */
export function weekDays(today: Date): string[] {
  const monday = startOfWeek(today, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => format(addDays(monday, i), 'yyyy-MM-dd'))
}

/**
 * TRAK-163: this week, Monday to Sunday, under the Home header (the Therabody
 * strip). Today is selected; a day with events shows a dot per event; tapping
 * a day lists its events, each opening to its details.
 */
export function WeekStrip({ events, eventHref, today = new Date() }: {
  events: StripEvent[]
  eventHref: (event: StripEvent) => string
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
                style={{ background: event.status === 'cancelled' ? 'transparent' : EVENT_KIND_COLOR[event.kind], boxShadow: event.status === 'cancelled' ? 'inset 0 0 0 1px #a1a1aa' : undefined }} />)}
            </span>}</>,
          }
        })} />
      <p className="text-[11px] tracking-[0.08em] uppercase text-white/35 mt-3 mb-1" style={{ fontFamily: "'DM Mono', monospace" }}>
        {format(parseISO(day), 'EEEE d MMMM')}
      </p>
      {chosen.length === 0 ? <p className="text-[13px] text-white/45 py-2">Nothing planned.</p> : (
        <Accordion key={day} defaultOpen={chosen.length === 1 ? 0 : -1} items={chosen.map(event => ({
          title: `${event.time ?? 'Time to be confirmed'} · ${eventHeading(event)}${event.status === 'cancelled' ? ' · Cancelled' : ''}${event.draft ? ' · Draft' : ''}`,
          content: <div className="space-y-1 text-[13px] text-white/70">
            {event.status === 'cancelled' && <p className="text-[#a1a1aa]">Cancelled{event.cancelReason ? `: ${event.cancelReason}` : ''}</p>}
            {event.venue && <p>{event.venue}{event.homeAway ? ` (${event.homeAway === 'home' ? 'Home' : 'Away'})` : ''}</p>}
            {event.meetTime && <p>Meet {event.meetTime}</p>}
            {event.kit && <p>Kit: {event.kit}</p>}
            <Link to={eventHref(event)} className="inline-block pt-1 text-primary">Open</Link>
          </div>,
        }))} />
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
export function LoadedWeekStrip({ load, loadKey, eventHref }: {
  load: (from: string, to: string) => WeekRows
  loadKey: string
  eventHref: (event: StripEvent) => string
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
        return event ? [{ ...event, draft: (row as { published?: boolean }).published === false }] : []
      }))
    }, () => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [loadKey, attempt])

  if (failed) return <div className="mb-4"><LoadError what="this week" onRetry={() => setAttempt(n => n + 1)} /></div>
  if (!events) return null
  return <WeekStrip events={events} eventHref={eventHref} />
}
