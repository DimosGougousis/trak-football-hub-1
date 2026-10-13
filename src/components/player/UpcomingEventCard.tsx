import { Link } from 'react-router-dom'
import { eventDay, eventHeading, eventTime, type PlayerEvent } from '@/lib/player-events'
// The coach calendar's colours (TRAK-159, founders 12 Oct): one constant everywhere.
import { CANCELLED_COLOR, EVENT_COLOR } from '@/lib/coach-events'

/**
 * One upcoming event (TRAK-130). `nextUp` is the home card; otherwise a row
 * in the Sessions tab's list. Either opens the event page.
 */
export function UpcomingEventCard({ event, changed, nextUp = false, linkBase = '/player/event' }: {
  event: PlayerEvent
  changed: boolean
  nextUp?: boolean
  /** The event page's route; parents open /parent/event (J8.8). */
  linkBase?: string
}) {
  const cancelled = event.status === 'cancelled'
  const heading = eventHeading(event)
  const where = [event.meetTime ? `Meet ${event.meetTime}` : null, event.venue].filter(Boolean).join(' · ')
  return (
    <Link
      to={`${linkBase}/${event.id}`}
      aria-label={nextUp ? `Next up: ${heading}` : undefined}
      className="flex items-stretch gap-3 rounded-[14px] p-3.5"
      style={{ background: '#101012', border: `1px solid ${cancelled ? `${CANCELLED_COLOR}80` : 'rgba(255,255,255,0.06)'}` }}
    >
      <div className="w-1 rounded-full flex-shrink-0" style={{ background: cancelled ? CANCELLED_COLOR : EVENT_COLOR[event.kind] }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {cancelled && <span className="text-[10px] font-semibold" style={{ color: CANCELLED_COLOR }}>Cancelled</span>}
          {changed && <span className="text-[10px] font-semibold text-[#C8F25A]">Changed</span>}
        </div>
        <p className={`text-[13px] font-medium truncate ${cancelled ? 'line-through text-white/50' : 'text-white/88'}`}>{heading}</p>
        <p className="text-[11px] mt-0.5 text-white/55">{eventDay(event)} · {eventTime(event)}</p>
        {where && <p className="text-[11px] text-white/40 truncate">{where}</p>}
        {event.kind === 'match' && event.kit && <p className="text-[11px] text-white/40">Kit: {event.kit}</p>}
        {cancelled && event.cancelReason && <p className="text-[11px]" style={{ color: CANCELLED_COLOR }}>{event.cancelReason}</p>}
      </div>
    </Link>
  )
}
