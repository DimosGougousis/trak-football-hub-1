import { describe, it, expect, beforeEach } from 'vitest'
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
 * TRAK-182 (Imad's 6e/6l): Schedule's month is Arc's calendar, Monday first
 * like the Home week strip, with a dot per event. Each day's label carries the
 * count, so a screen reader hears which days are busy.
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

beforeEach(() => {
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

describe('TRAK-182: Schedule month on Arc\'s calendar', () => {
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

  it('counts each day\'s events, starts weeks on Monday, and lists a tapped day', async () => {
    renderApp('/coach/schedule')
    const busy = await screen.findByRole('gridcell', { name: `${fullDate(today)}, 2 events` })
    expect(busy).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('gridcell', { name: `${fullDate(other)}, 1 event` })).toBeInTheDocument()
    const firstRow = within(screen.getAllByRole('row')[0]).getAllByRole('gridcell')
    expect(firstRow[0].getAttribute('aria-label')).toMatch(/^Monday/)
    // Tarek's #311 review: the day names over the columns start on Monday too,
    // or "Su" would sit over the Monday column with every other test green.
    const header = [...document.querySelectorAll('[aria-hidden="true"]')]
      .find(el => el.children.length === 7 && [...el.children].every(c => c.tagName === 'SPAN' && c.textContent?.length === 2))
    expect([...header!.children].map(c => c.textContent)).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'])

    await userEvent.click(screen.getByRole('gridcell', { name: `${fullDate(other)}, 1 event` }))
    expect(await screen.findByText('Recovery')).toBeInTheDocument()
    expect(screen.queryByText('Finishing')).toBeNull()
  })
})
