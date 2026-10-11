import { localTodayISO } from '@/lib/event-time'

/** TRAK-157: the pure parts of the coach's date and time wheel (TimeReel). */
export type ReelOption = { value: string, label: string }

// A first tap on any column fills the rest from this, so a time is never half.
const BASE_TIME = '18:00'
export const pad = (n: number) => String(n).padStart(2, '0')

export function parse(time: string) {
  const [h, m] = (time || BASE_TIME).split(':').map(Number)
  return { hour: String(h % 12 || 12), minute: pad(m), half: h < 12 ? 'AM' : 'PM' }
}
export function compose(hour: string, minute: string, half: string) {
  return `${pad((Number(hour) % 12) + (half === 'PM' ? 12 : 0))}:${minute}`
}
export function clockLabel(time: string) {
  const { hour, minute, half } = parse(time)
  return `${hour}:${minute} ${half}`
}

const atNoon = (iso: string) => new Date(`${iso}T12:00:00`)
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const shortDay = (iso: string) => atNoon(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
export const longDay = (iso: string) => atNoon(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** Two months back (a late entry) to about a season ahead, plus the date itself. */
export function dayOptions(selected: string): ReelOption[] {
  const today = localTodayISO()
  const start = atNoon(today)
  start.setDate(start.getDate() - 60)
  const days: string[] = []
  for (let i = 0; i <= 460; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(isoOf(d))
  }
  if (selected && !days.includes(selected)) days.push(selected)
  days.sort()
  return days.map(iso => ({ value: iso, label: dayOptionLabel(iso) }))
}

/** A day as its row reads: Today, Tomorrow, or "Tue 20 Oct". */
export function dayOptionLabel(iso: string) {
  const today = localTodayISO()
  const tomorrow = isoOf(new Date(atNoon(today).getTime() + 86_400_000))
  return iso === today ? 'Today' : iso === tomorrow ? 'Tomorrow' : shortDay(iso)
}

