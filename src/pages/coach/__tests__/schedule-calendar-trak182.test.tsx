import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { atMorningToday } from '../../../../tests/support/clock'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { addDays, format } from 'date-fns'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { localTodayISO, toInstant } from '@/lib/event-time'

/**
 * TRAK-182 (Imad's 6e/6l): Schedule's month has a dot per event. Each day's
 * label carries the count, so a screen reader hears which days are busy.
 * TRAK-574 (Dimos, 25 Nov): the month is one low strip of its days, not a
 * square grid, so the tapped day's events show under it without scrolling.
 */
const COACH = { id: 'coach-182-cal' }
const today = localTodayISO()
// Mid-month, so both days are in the month shown on load.
const other = format(addDays(new Date(`${today}T12:00:00`), new Date(`${today}T12:00:00`).getDate() < 15 ? 3 : -3), 'yyyy-MM-dd')
const row = (id: string, date: string, over: Record<string, unknown>) => ({
  id, coach_user_id: COACH.id, event_type: 'training', title: 'Training', starts_at: toInstant(date, '17:00'), ends_at: null,
  event_date: date, start_time: '17:00:00', venue: null, opponent: null, notes: null, published: true, source: 'manual',
  meet_time: null, kit: null, home_away: null, status: 'scheduled', cancel_reason: null, series_id: null, ...over,
})
const fullDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { dateStyle: 'full' })

// TRAK-255: today's 17:00 and 19:00 events are still to come, so no day reads "needs you" yet.
afterEach(() => vi.useRealTimers())
beforeEach(() => {
  atMorningToday()
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    http.get(`${SUPABASE_URL}/rest/v1/coach_calendar_events`, () => HttpResponse.json([
      row('a', today, { title: 'Finishing' }),
      row('b', today, { event_type: 'match', title: 'vs Rovers', opponent: 'Rovers', starts_at: toInstant(today, '19:00'), start_time: '19:00:00' }),
      row('c', other, { title: 'Recovery', status: 'cancelled', cancel_reason: 'Pitch closed' }),
    ])),
    table('coach_sessions', []),
    table('squad_players', []),
    rpc('feature_on', () => true),
  )
})

describe('TRAK-182, TRAK-574: the month strip on Events', () => {
  it('shows a hollow ring for cancelled events, while scheduled events stay filled', async () => {
    renderApp('/coach/schedule')
    const busy = await screen.findByRole('gridcell', { name: `${fullDate(today)}, 2 events` })
    const cancelled = screen.getByRole('gridcell', { name: `${fullDate(other)}, 1 event` })
    const ring = cancelled.querySelector<HTMLElement>('[aria-hidden="true"] > span')!
    expect(ring.style.background).toBe('transparent')
    expect(ring.style.borderStyle).toBe('solid')
    expect(parseFloat(ring.style.borderWidth)).toBeGreaterThan(0)
    const filled = busy.querySelector<HTMLElement>('[aria-hidden="true"] > span')!
    expect(filled.style.background).not.toBe('transparent')
    expect(filled.style.borderStyle).not.toBe('solid')
  })

  it('counts each day\'s events, lists all the month\'s days in one strip, and lists a tapped day', async () => {
    renderApp('/coach/schedule')
    const busy = await screen.findByRole('gridcell', { name: `${fullDate(today)}, 2 events` })
    expect(busy).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('gridcell', { name: `${fullDate(other)}, 1 event` })).toBeInTheDocument()
    // TRAK-574: the month is one strip of its own days, from the 1st to the last, each naming its weekday (no blank cells).
    const days = within(screen.getByRole('row')).getAllByRole('gridcell')
    const first = new Date(`${today}T12:00:00`)
    first.setDate(1)
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12)
    expect(days).toHaveLength(last.getDate())
    expect(days[0].getAttribute('aria-label')).toMatch(new RegExp(`^${first.toLocaleDateString('en-GB', { weekday: 'long' })}, 1 `))
    expect(days[0]).toHaveTextContent(first.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2))
    expect(days.at(-1)!.getAttribute('aria-label')).toMatch(new RegExp(`^${last.toLocaleDateString('en-GB', { weekday: 'long' })}, ${last.getDate()} `))

    await userEvent.click(screen.getByRole('gridcell', { name: `${fullDate(other)}, 1 event` }))
    expect(await screen.findByText('Recovery')).toBeInTheDocument()
    expect(screen.queryByText('Finishing')).toBeNull()
  })
})
