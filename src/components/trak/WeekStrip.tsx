import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, format, parseISO } from 'date-fns'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Accordion } from '@/components/arc/accordion/accordion'
import { eventHeading, type EventKind, type PlayerEvent } from '@/lib/player-events'

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

/**
 * TRAK-163: the next seven days under the Home header (the Therabody strip).
 * A day with events shows a dot per event; tapping it lists that day's events,
 * each opening to its details. `eventHref` is the role's event page.
 */
export function WeekStrip({ events, eventHref, today = new Date() }: {
  events: StripEvent[]
  eventHref: (event: StripEvent) => string
  today?: Date
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const [day, setDay] = useState(format(today, 'yyyy-MM-dd'))
  const onDay = (date: string) => events.filter(event => event.date === date)
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
  const chosen = onDay(day)

  return (
    <section aria-label="This week" className="arc mb-5">
      <SegmentedControl label="Next 7 days" value={day} onValueChange={setDay}
        options={days.map((date, i) => {
          const value = format(date, 'yyyy-MM-dd')
          const dots = onDay(value)
          return {
            value,
            label: i === 0 ? 'Today' : format(date, 'EEE d'),
            accessory: dots.length > 0 && <span className="ml-1.5 inline-flex gap-[3px]" aria-label={`${dots.length} ${dots.length === 1 ? 'event' : 'events'}`}>
              {dots.slice(0, 3).map(event => <span key={event.id} aria-hidden="true" className="w-[5px] h-[5px] rounded-full"
                style={{ background: event.status === 'cancelled' ? 'transparent' : EVENT_KIND_COLOR[event.kind], boxShadow: event.status === 'cancelled' ? 'inset 0 0 0 1px #a1a1aa' : undefined }} />)}
            </span>,
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
