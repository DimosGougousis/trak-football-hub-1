import type { ReactElement, ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { Link } from 'react-router-dom'
import { Ban, CalendarPlus, CircleCheck, CircleDashed, Clock, MapPin } from 'lucide-react'
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet'
import { CANCELLED_COLOR } from '@/lib/coach-events'
import { relativeLabel } from '@/lib/alert-read-state'
import type { StripEvent } from '@/components/trak/WeekStrip'

/* TRAK-182 (Imad, 15 Oct): an event opens in Arc's bottom sheet. Since 16 Oct
   it reads less like a boarding pass: the start time is the headline, and the
   meet time sits with the details above Open in Maps. Title: the opponent ("vs Rivals FC") or the session's name.
   Under it: the date and Home / Away / Training ground. The time row runs from
   the meet time to the start, with the venue under it. Then one status line:
   Published / Draft for the coach, Confirmed for families. Role-specific parts
   (the coach's actions and Attending, the parent's Can't make it) come in as
   children. */
type SheetRole = 'coach' | 'parent' | 'player'

const KIND_NAME: Record<StripEvent['kind'], string> = { training: 'Training', match: 'Match', tournament: 'Tournament', other: 'Event' }

function sheetTitle(event: StripEvent): string {
  if (event.kind === 'match' && event.opponent) return `vs ${event.opponent}`
  return event.title ?? KIND_NAME[event.kind]
}

function sheetPlace(event: StripEvent): string | null {
  if (event.kind === 'match') return event.homeAway === 'home' ? 'Home' : event.homeAway === 'away' ? 'Away' : null
  return event.kind === 'training' ? 'Training ground' : null
}

function sheetStatus(event: StripEvent, role: SheetRole): { text: string; tone: 'ok' | 'draft' | 'cancelled' } {
  if (event.status === 'cancelled') return { text: 'Cancelled.', tone: 'cancelled' }
  if (event.sessionId) return { text: 'Logged.', tone: 'ok' }
  if (role === 'coach') return event.draft ? { text: 'Draft. Only you see this.', tone: 'draft' } : { text: 'Published.', tone: 'ok' }
  return { text: 'Confirmed.', tone: 'ok' }
}

/** "Updated 5h ago", "Updated yesterday": the coach changed it after publishing (TRAK-152 counts each change). */
function updatedNote(event: StripEvent): string | null {
  if (!event.sequence || !event.updatedAt || event.status === 'cancelled') return null
  const when = relativeLabel(event.updatedAt)
  if (!when) return null
  const lower = when === 'Just now' || when === 'Yesterday' ? when.toLowerCase() : when
  return `Updated ${/^\d+[mh]$/.test(when) ? `${when} ago` : lower}.`
}

/** The start time is the headline, with what it is and where under it. */
function TimeRow({ event }: { event: StripEvent }) {
  if (event.sessionId) return null // a logged session has no start time to show
  if (!event.time) return <p className="text-[15px] text-white/80">Time to be confirmed</p>
  return (
    <div>
      <p className="text-[34px] leading-none font-medium tracking-[-0.02em] text-white/95">{event.time}</p>
      <p className="text-[12px] text-white/50 mt-1">{event.kind === 'match' ? 'Kick-off' : 'Starts'}{event.venue ? `, ${event.venue}` : ''}</p>
    </div>
  )
}

/** An earlier meet time, as a detail rather than a second headline. */
const meetTime = (event: StripEvent) => event.time && event.meetTime && event.meetTime < event.time ? event.meetTime : null

export function EventSheet({ event, role, trigger, children }: {
  event: StripEvent
  role: SheetRole
  trigger: ReactElement
  children?: ReactNode
}) {
  const place = sheetPlace(event)
  const date = format(parseISO(event.date), 'EEE d MMM')
  const status = sheetStatus(event, role)
  const updated = updatedNote(event)
  const Icon = status.tone === 'cancelled' ? Ban : status.tone === 'draft' ? CircleDashed : CircleCheck
  const color = status.tone === 'cancelled' ? CANCELLED_COLOR : status.tone === 'draft' ? 'rgba(255,255,255,0.55)' : '#4ade80'
  const details = [
    event.status === 'cancelled' && event.cancelReason ? ['Reason', event.cancelReason] : null,
    event.kit ? ['Kit', event.kit] : null,
    event.familyNote ? ['Note', event.familyNote] : null,
  ].filter((row): row is [string, string] => !!row)

  return (
    <BottomSheet trigger={trigger} title={sheetTitle(event)} description={place ? `${date} · ${place}` : date}
      detents={[0.62, 0.92]} className="arc">
      <div className="space-y-4 pb-4">
        <TimeRow event={event} />
        {meetTime(event) && (
          <p className="flex items-center gap-2 text-[14px] text-white/80">
            <Clock size={16} aria-hidden="true" className="text-white/50" />Meet at {meetTime(event)}
          </p>
        )}
        {event.venue && event.status !== 'cancelled' && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue)}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 text-[14px] text-primary focus-visible:ring-2 focus-visible:ring-primary rounded-md">
            <MapPin size={16} aria-hidden="true" />Open in Maps
          </a>
        )}
        <p className="flex items-center gap-2 text-[14px] text-white/80">
          <Icon size={16} aria-hidden="true" style={{ color }} />
          <span><span className="font-medium text-white/95">{status.text}</span>{updated ? ` ${updated}` : ''}</span>
        </p>
        {details.length > 0 && (
          <dl className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {details.map(([term, value]) => (
              <div key={term} className="flex gap-4 py-2.5 text-[13px]">
                <dt className="w-16 shrink-0 text-white/45">{term}</dt>
                <dd className="text-white/85">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {/* Kostas's #310 review: the full page (Add to calendar, every detail) stays one tap away. */}
        {role !== 'coach' && (
          <Link to={`/${role}/event/${event.id}`}
            className="inline-flex min-h-11 items-center gap-2 text-[14px] text-primary focus-visible:ring-2 focus-visible:ring-primary rounded-md">
            <CalendarPlus size={16} aria-hidden="true" />Open event page
          </Link>
        )}
        {children}
      </div>
    </BottomSheet>
  )
}
