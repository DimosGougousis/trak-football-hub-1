import { useReducer, type ReactNode } from 'react'
import { NotificationCenter, type NotificationItem } from '@/components/arc/notification-center/notification-center'
import { alertKey, dismissAlert, isAlertRead, markAllSeen, readBellState, relativeLabel, setAlertRead } from '@/lib/alert-read-state'

export interface BellAlert {
  id: string
  title: string
  description: string
  /** When it was recorded or last changed. */
  date: string | null
  tone?: NotificationItem['tone']
  details?: ReactNode
  action?: NotificationItem['action']
}

/**
 * TRAK-163: the bell at the top right of parent and player Home, built on
 * Arc's notification center. The badge counts what arrived since the bell
 * last closed (TRAK-74's rule), and closing it reads everything shown.
 * `storageKey` null means the person isn't known yet: no bell.
 */
export function AlertsBell({ alerts, storageKey, notice, onOpen }: {
  alerts: BellAlert[]
  storageKey: string | null
  /** Loading or a failed read; the list is then empty, not "All clear". */
  notice?: ReactNode
  onOpen?: () => void
}) {
  const [, stored] = useReducer((n: number) => n + 1, 0)
  if (!storageKey) return null
  const state = readBellState(storageKey)
  const shown = alerts.filter(alert => !state.dismissed.has(alertKey(alert)))
  const byId = new Map(shown.map(alert => [alert.id, alert]))
  const items: NotificationItem[] = shown.map(alert => ({
    id: alert.id,
    title: alert.title,
    description: alert.description,
    time: relativeLabel(alert.date),
    read: isAlertRead(alert, state),
    tone: alert.tone,
    details: alert.details,
    action: alert.action,
  }))

  return (
    <div className="arc">
      <NotificationCenter label="Alerts" notifications={items} notice={notice}
        onOpenChange={open => {
          if (open) { onOpen?.(); return }
          markAllSeen(storageKey, shown)
          stored()
        }}
        onReadChange={(item, read) => { const alert = byId.get(item.id); if (alert) { setAlertRead(storageKey, alert, read); stored() } }}
        onDismiss={item => { const alert = byId.get(item.id); if (alert) { dismissAlert(storageKey, alert); stored() } }} />
    </div>
  )
}
