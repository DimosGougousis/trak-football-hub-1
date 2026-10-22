/* TRAK-250: small pure helpers the Squad tabs share. */

/** Below this share of available minutes a child is owed minutes (Season chip, Availability colour). */
export const OWED_BELOW = 50

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** `2026-10-17` -> `17 Oct`. Not locale-formatted, so it reads the same on every device. */
export const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`

/** `2026-10-24` -> `Sat 24 Oct`, from the calendar date itself so no time zone can move the day. */
export function weekdayDayMonth(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return ''
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`
}

/** PostgREST value quoting for an `or=` filter, so a squad name with a comma or bracket cannot change the filter. */
export const quoted = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
