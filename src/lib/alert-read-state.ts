import { format } from 'date-fns'

/**
 * TRAK-163: what the bell (parent and player) has shown on this device.
 *
 * - `key` holds the newest alert time seen when the bell last closed, the same
 *   value and key the parent bell has used since TRAK-74, so nothing reads as
 *   new again after this change.
 * - `key:read` holds alerts the person marked read or unread one by one.
 * - `key:dismissed` holds alerts they dismissed.
 *
 * An alert is identified with its date, so an event the coach changes later
 * comes back as unread. Without storage (private mode) everything simply
 * reads as unread, as before.
 */
export interface DatedAlert { id: string; date: string | null }

export interface BellState {
  seen: number
  overrides: Record<string, boolean>
  dismissed: Set<string>
}

const time = (date: string | null) => Date.parse(date ?? '') || 0
export const alertKey = (alert: DatedAlert) => `${alert.id}@${alert.date ?? ''}`

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

export function readBellState(key: string): BellState {
  const overrides = readJson<Record<string, boolean>>(`${key}:read`, {})
  const dismissed = readJson<string[]>(`${key}:dismissed`, [])
  return {
    seen: Number(readJson<number>(key, 0)) || 0,
    overrides: overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {},
    dismissed: new Set(Array.isArray(dismissed) ? dismissed : []),
  }
}

export function isAlertRead(alert: DatedAlert, state: BellState): boolean {
  return state.overrides[alertKey(alert)] ?? time(alert.date) <= state.seen
}

/** The bell closed: everything shown so far is read. */
export function markAllSeen(key: string, alerts: DatedAlert[]) {
  const { seen } = readBellState(key)
  write(key, String(Math.max(seen, ...alerts.map(alert => time(alert.date)))))
}

export function setAlertRead(key: string, alert: DatedAlert, read: boolean) {
  const { overrides } = readBellState(key)
  write(`${key}:read`, JSON.stringify({ ...overrides, [alertKey(alert)]: read }))
}

export function dismissAlert(key: string, alert: DatedAlert) {
  const { dismissed } = readBellState(key)
  write(`${key}:dismissed`, JSON.stringify([...dismissed, alertKey(alert)]))
}

/** "Just now", "45m", "5h", "Yesterday", then "3 Oct": when the alert came, never a second event date (TRAK-160). */
export function relativeLabel(date: string | null, now: Date = new Date()): string {
  const at = time(date)
  if (!at) return ''
  const minutes = Math.floor((now.getTime() - at) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 24 * 60 && new Date(at).toDateString() === now.toDateString()) return `${Math.floor(minutes / 60)}h`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (new Date(at).toDateString() === yesterday.toDateString()) return 'Yesterday'
  return format(at, 'd MMM')
}
