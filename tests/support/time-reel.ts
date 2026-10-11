import { within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { dayOptionLabel } from '@/lib/time-reel'

/**
 * TRAK-157: the event form's day and time are a wheel (TimeReel), not text
 * fields. Tests pick rows the way a tap does; each column is a listbox named
 * "<label> day/hour/minute/AM or PM".
 */
const option = (scope: HTMLElement, column: string, name: string) =>
  within(within(scope).getByRole('listbox', { name: column })).getByRole('option', { name })

export async function pickDay(scope: HTMLElement, label: string, iso: string) {
  await userEvent.click(option(scope, `${label} day`, dayOptionLabel(iso)))
}

/** "18:30" → taps 6, 30, PM on the named wheel. */
export async function pickTime(scope: HTMLElement, label: string, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  await userEvent.click(option(scope, `${label} hour`, String(h % 12 || 12)))
  await userEvent.click(option(scope, `${label} minute`, String(m).padStart(2, '0')))
  await userEvent.click(option(scope, `${label} AM or PM`, h < 12 ? 'AM' : 'PM'))
}

/** What the wheel holds now, as "HH:MM" read off its chosen rows ('' when none). */
export function shownTime(scope: HTMLElement, label: string): string {
  const chosen = (column: string) => within(within(scope).getByRole('listbox', { name: `${label} ${column}` }))
    .queryAllByRole('option').find(o => o.getAttribute('aria-selected') === 'true')?.textContent ?? ''
  const [hour, minute, half] = [chosen('hour'), chosen('minute'), chosen('AM or PM')]
  if (!hour) return ''
  return `${String((Number(hour) % 12) + (half === 'PM' ? 12 : 0)).padStart(2, '0')}:${minute}`
}
