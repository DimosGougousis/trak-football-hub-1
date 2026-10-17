import { eventDay, eventHeading, eventTime, type PlayerEvent } from '@/lib/player-events'
import { CANCELLED_COLOR } from '@/lib/coach-events'

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
  const venue = e.venue && side ? `${e.venue} (${side})` : e.venue ?? side
  const rows: [string, string][] = [
    ['Date', eventDay(e)],
    ['Time', eventTime(e)],
    ...(e.meetTime ? [['Meet', e.meetTime] as [string, string]] : []),
    ...(venue ? [['Venue', venue] as [string, string]] : []),
    ...(e.kit ? [['Kit', e.kit] as [string, string]] : []),
    ...(e.familyNote ? [['Notes', e.familyNote] as [string, string]] : []),
  ]
  return (
    <div className="space-y-4">
      <h1 className={`text-[22px] font-medium ${cancelled ? 'line-through text-white/50' : 'text-white/90'}`}>{eventHeading(e)}</h1>
      {changes.length > 0 && (
        <div role="status" aria-label="What changed" className="rounded-[14px] px-4 py-3 border border-primary/40">
          <p className="text-[13px] font-semibold text-primary">Changed since you last looked</p>
          <ul className="mt-1 space-y-0.5">
            {changes.map(line => <li key={line} className="text-[13px] text-white/80">{line}</li>)}
          </ul>
        </div>
      )}
      {cancelled && (
        <div className="rounded-[14px] px-4 py-3" style={{ border: `1px solid ${CANCELLED_COLOR}80` }}>
          <p className="text-[13px] font-semibold" style={{ color: CANCELLED_COLOR }}>This event is cancelled.</p>
          {e.cancelReason && <p className="text-[13px] text-white/70 mt-1">{e.cancelReason}</p>}
        </div>
      )}
      <ul aria-label="Event details" className="rounded-[18px] divide-y divide-white/[0.06]"
        style={{ background: '#101012', border: '1px solid rgba(255,255,255,0.06)' }}>
        {rows.map(([label, value]) => (
          <li key={label} className="flex justify-between gap-4 px-4 py-3 text-[13px]">
            <span className="text-white/45">{label}</span>
            <span className="text-white/85 text-right">{value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
