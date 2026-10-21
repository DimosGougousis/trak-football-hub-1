import { MapPin } from 'lucide-react'
import { eventDay, eventHeading, eventTime, meetText, type PlayerEvent } from '@/lib/player-events'
import { academyClock } from '@/lib/event-time'
import { CANCELLED_COLOR } from '@/lib/coach-events'
import { withAlpha } from '@/lib/with-alpha'
import { venueParts } from '@/lib/venue-link'

/**
 * Every detail of one event (TRAK-130), shared by the player's and the
 * parent's event pages (TRAK-131) so both show exactly the same thing.
 * Cancelled stays visible, with the coach's reason. Kit and the family note
 * show on every kind of event (TRAK-161).
 */
export function EventDetails({ event: e, changes = [] }: {
  event: PlayerEvent
  /** TRAK-134: what moved since this device last saw it (changesSinceSeen). */
  changes?: string[]
}) {
  const cancelled = e.status === 'cancelled'
  // TRAK-161: home or away sits on the venue line, "Olympiacos Stadium (Away)".
  const side = e.kind === 'match' && e.homeAway ? (e.homeAway === 'home' ? 'Home' : 'Away') : null
  // TRAK-225: a pasted Maps link opens that place; the row shows the name without it.
  const place = e.venue ? venueParts(e.venue) : null
  const venueText = place?.text || null
  const venue = venueText && side ? `${venueText} (${side})` : venueText ?? side
  // TRAK-223: "17:00 Athens time (19:00 on this phone)": the academy's clock, named.
  const clock = academyClock(e)
  const rows: [string, string][] = [
    ['Date', eventDay(e)],
    ['Time', `${eventTime(e)}${clock ? ` ${clock.zone}` : ''}${clock?.here ? ` (${clock.here})` : ''}`],
    ...(e.meetTime ? [['Meet', meetText(e, e.meetTime)] as [string, string]] : []),
    ...(venue ? [['Venue', venue] as [string, string]] : []),
    ...(e.kit ? [['Kit', e.kit] as [string, string]] : []),
    ...(e.familyNote ? [['Notes', e.familyNote] as [string, string]] : []),
  ]
  return (
    <div className="space-y-4">
      <h1 className={`text-[22px] font-medium ${cancelled ? 'line-through text-ink-2' : 'text-ink'}`}>{eventHeading(e)}</h1>
      {changes.length > 0 && (
        <div role="status" aria-label="What changed" className="rounded-[14px] px-4 py-3 border border-primary/40">
          <p className="text-[13px] font-semibold text-primary">Changed since you last looked</p>
          <ul className="mt-1 space-y-0.5">
            {changes.map(line => <li key={line} className="text-[13px] text-ink">{line}</li>)}
          </ul>
        </div>
      )}
      {cancelled && (
        <div className="rounded-[14px] px-4 py-3" style={{ border: `1px solid ${withAlpha(CANCELLED_COLOR, 0.5)}` }}>
          <p className="text-[13px] font-semibold" style={{ color: CANCELLED_COLOR }}>This event is cancelled.</p>
          {e.cancelReason && <p className="text-[13px] text-ink-2 mt-1">{e.cancelReason}</p>}
        </div>
      )}
      <ul aria-label="Event details" className="rounded-[18px] divide-y divide-line"
        style={{ background: 'rgb(var(--t-surface))', border: '1px solid rgb(var(--t-line))' }}>
        {rows.map(([label, value]) => (
          <li key={label} className="flex justify-between gap-4 px-4 py-3 text-[13px]">
            <span className="text-ink-3">{label}</span>
            <span className="text-ink text-right">{value}</span>
          </li>
        ))}
      </ul>
      {place && !cancelled && (
        <a href={place.mapsUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[13px] text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-primary rounded-md">
          <MapPin size={14} aria-hidden="true" />Open in Maps
        </a>
      )}
    </div>
  )
}
