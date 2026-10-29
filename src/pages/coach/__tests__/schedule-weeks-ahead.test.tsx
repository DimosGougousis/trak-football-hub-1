import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { toInstant } from '@/lib/event-time'

/**
 * Dimos, 29 Oct: Schedule's calendar opens on this week, on the top row, and
 * the four weeks after it, so the coming month is in view whatever the date.
 * A link to an event further away shows the weeks it falls in.
 */
const COACH = { id: 'coach-weeks-ahead' }
const row = (id: string, date: string, title: string) => ({
  id, coach_user_id: COACH.id, event_type: 'training', title, starts_at: toInstant(date, '17:00'), ends_at: null,
  event_date: date, start_time: '17:00:00', venue: null, opponent: null, notes: null, published: true, source: 'manual',
  meet_time: null, kit: null, home_away: null, status: 'scheduled', cancel_reason: null, series_id: null,
})
const days = () => [...document.querySelectorAll<HTMLElement>('[data-present] [data-date]')].map(day => day.dataset.date!)

afterEach(() => vi.useRealTimers())
beforeEach(() => {
  // Thursday 29 October 2026, the morning.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 29, 9))
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    http.get(`${SUPABASE_URL}/rest/v1/coach_calendar_events`, () => HttpResponse.json([
      row('soon', '2026-11-26', 'Late November'),
      row('later', '2027-01-20', 'January training'),
    ])),
    table('coach_sessions', []),
    table('squad_players', []),
    rpc('feature_on', () => true),
  )
})

describe("Schedule's calendar: this week and the four after it", () => {
  it('opens with this week on top and runs to the end of November', async () => {
    renderApp('/coach/schedule')
    const grid = await screen.findByRole('grid', { name: /^26 Oct\s*–\s*29 Nov 2026$/ })
    expect(within(grid).getAllByRole('row')).toHaveLength(5)
    expect(days()[0]).toBe('2026-10-26')
    expect(days().at(-1)).toBe('2026-11-29')
    // An event four weeks out is on the first screen, with its dot.
    expect(await screen.findByRole('gridcell', { name: /26 November 2026, 1 event$/ })).toBeInTheDocument()
  })

  it('a link to an event in January shows the weeks around it', async () => {
    renderApp('/coach/schedule?event=later')
    expect(await screen.findByText('January training')).toBeInTheDocument()
    expect(days()).toContain('2027-01-20')
    await userEvent.click(screen.getByRole('button', { name: /^Today/ }))
    expect(days()[0]).toBe('2026-10-26')
  })
})
