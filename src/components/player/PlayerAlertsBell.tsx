import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertsBell } from '@/components/trak/AlertsBell'
import { eventAlert } from '@/lib/parent-data'
import { noteFirstSeen, readFirstSeen, type PlayerEvent } from '@/lib/player-events'

/* TRAK-163 (Imad, 12 Oct): players get the parent's bell for their squad's
   events: new, changed (with the new time) and cancelled, counted since the
   bell last closed on this device. The events are the ones Home already
   loaded, so the bell can't disagree with the screen under it. */
export function PlayerAlertsBell({ userId, events }: { userId: string; events: PlayerEvent[] }) {
  const navigate = useNavigate()
  const firstSeenKey = `trak:player-alerts-events:${userId}`
  useEffect(() => { noteFirstSeen(firstSeenKey, events) }, [firstSeenKey, events])
  // Read before this render's events are recorded as first seen.
  const firstSeen = readFirstSeen(firstSeenKey)
  const alerts = events.map(event => eventAlert(event, firstSeen))
    .sort((a, b) => (Date.parse(b.date ?? '') || 0) - (Date.parse(a.date ?? '') || 0))

  return (
    <AlertsBell storageKey={`trak:player-alerts-seen:${userId}`}
      alerts={alerts.map(alert => ({
        ...alert,
        tone: alert.cancelled ? 'warning' as const : undefined,
        action: { label: 'Open event', onSelect: () => navigate(`/player/event/${alert.targetId}`) },
      }))} />
  )
}
