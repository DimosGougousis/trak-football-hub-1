/**
 * Session times, stored as a real instant rather than a naive wall clock.
 *
 * The schedule used to build `starts_at` as `${date}T${time}:00` — no offset —
 * and hand it to a timestamptz column. A string with no offset is read in the
 * connection's timezone, which for PostgREST is UTC, so a coach in Dubai
 * entering 18:00 stored 18:00Z, four hours later than they meant.
 *
 * It looked fine to the coach only because the schedule read the value back by
 * slicing characters out of the raw ISO string, recovering the same UTC wall
 * clock it had sent. The player screen did the honest thing — `new Date(...)`
 * then render in the device's zone — and so showed 22:00 for a 6pm session.
 * Two bugs that cancelled on one screen and not on the other.
 *
 * These helpers keep one rule: a date and time typed by a person are always
 * interpreted in that person's own timezone, in both directions.
 */

/** Build an absolute instant from wall-clock parts entered locally. */
export function toInstant(date: string, time?: string | null): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = (time || '00:00').split(':').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0).toISOString()
}

/** Split an instant back into the local date and time a person would read. */
export function localParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  }
}

/**
 * Whether an event carries a real kick-off time or is still to be confirmed.
 * The convention is local midnight, which is what toInstant writes when the
 * coach leaves the time blank.
 */
export function isTimeTBC(iso: string): boolean {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return true
  return d.getHours() === 0 && d.getMinutes() === 0
}

/**
 * Normalise a value that may already be an instant, or may be a naive
 * `YYYY-MM-DDTHH:mm` with no offset — which is what the schedule parser returns.
 * A naive value is read as the coach's local wall clock, never as UTC.
 */
export function normalizeInstant(value: string | null | undefined): string | null {
  if (!value) return null
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value.trim())
  if (hasOffset) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const [datePart, timePart] = value.trim().split('T')
  if (!datePart) return null
  return toInstant(datePart, timePart ? timePart.slice(0, 5) : null)
}
