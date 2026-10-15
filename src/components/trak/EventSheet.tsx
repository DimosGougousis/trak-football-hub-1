import type { ReactElement, ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { Ban, CircleCheck, CircleDashed } from 'lucide-react'
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet'
import { CANCELLED_COLOR } from '@/lib/coach-events'
import type { StripEvent } from '@/components/trak/WeekStrip'

/* TRAK-182 (Imad, 15 Oct): an event opens in Arc's bottom sheet, laid out like
   a boarding pass. Title: the opponent ("vs Rivals FC") or the session's name.
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

const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5))
function gap(from: string, to: string): string | null {
  const m = minutes(to) - minutes(from)
  if (m <= 0) return null
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`
}

function sheetStatus(event: StripEvent, role: SheetRole): { text: string; tone: 'ok' | 'draft' | 'cancelled' } {
  if (event.status === 'cancelled') return { text: 'Cancelled.', tone: 'cancelled' }
  if (role === 'coach') return event.draft ? { text: 'Draft. Only you see this.', tone: 'draft' } : { text: 'Published.', tone: 'ok' }
  return { text: 'Confirmed.', tone: 'ok' }
}

function TimeRow({ event }: { event: StripEvent }) {
  const startLabel = event.kind === 'match' ? 'Kick-off' : 'Starts'
  if (!event.time) return <p className="text-[15px] text-white/80">Time to be confirmed</p>
  const meet = event.meetTime && event.meetTime < event.time ? event.meetTime : null
  const between = meet ? gap(meet, event.time) : null
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="text-[34px] leading-none font-medium tracking-[-0.02em] text-white/95">{meet ?? event.time}</p>
        <p className="text-[12px] text-white/50 mt-1">{meet ? 'Meet' : startLabel}{event.venue ? `, ${event.venue}` : ''}</p>
      </div>
      {meet && <>
        <div aria-hidden="true" className="flex-1 flex items-center gap-2 pb-6 text-[11px] text-white/40">
          <span className="flex-1 h-px bg-white/15" />{between}<span className="flex-1 h-px bg-white/15" />
        </div>
        <div className="text-right">
          <p className="text-[34px] leading-none font-medium tracking-[-0.02em] text-white/95">{event.time}</p>
          <p className="text-[12px] text-white/50 mt-1">{startLabel}</p>
        </div>
      </>}
    </div>
  )
}

export function EventSheet({ event, role, trigger, children }: {
  event: StripEvent
  role: SheetRole
  trigger: ReactElement
  children?: ReactNode
}) {
  const place = sheetPlace(event)
  const date = format(parseISO(event.date), 'EEE d MMM')
  const status = sheetStatus(event, role)
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
        <p className="flex items-center gap-2 text-[14px] text-white/80">
          <Icon size={16} aria-hidden="true" style={{ color }} />
          <span><span className="font-medium text-white/95">{status.text}</span>{event.time && event.meetTime && status.tone === 'ok' ? ` Meet ${event.meetTime}.` : ''}</span>
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
        {children}
      </div>
    </BottomSheet>
  )
}
