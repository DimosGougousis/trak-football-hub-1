import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { localTodayISO, toInstant } from '@/lib/event-time'
import { atMorningToday } from '../../../../tests/support/clock'
import { eventStep } from '../../../../tests/support/event-steps'

/**
 * TRAK-230 (20 Oct live run, S4/S7; Kostas, 21 Oct, option A): once an event
 * has started, what families were told is fixed. The schedule offers no Edit
 * and no Cancel for it, and a link asking for either says why; a draft whose
 * time has passed can still be published or deleted. The database refuses the
 * change too (supabase/tests/started_event_locked.sql), and its words reach
 * the coach as they are.
 */

const COACH = { id: 'coach-230' }
const EVENTS = `${SUPABASE_URL}/rest/v1/coach_calendar_events`
const today = localTodayISO()
const LOCKED = "This event has started, so it can't be changed. Use its register or match log instead."
const row = (id: string, title: string, time: string, over: Record<string, unknown> = {}) => ({
  id, coach_user_id: COACH.id, title, event_type: 'training', starts_at: toInstant(today, time), ends_at: null,
  event_date: today, start_time: `${time}:00`, end_time: null, venue: 'Main Pitch', opponent: null, notes: null,
  published: true, source: 'manual', meet_time: null, kit: null, home_away: null, status: 'scheduled',
  cancel_reason: null, series_id: null, ...over,
})
// The clock is 09:00: Early (08:00) has started, Late (18:00) hasn't.
const EARLY = row('early', 'Early', '08:00')
const LATE = row('late', 'Late', '18:00')
const DRAFT = row('draft', 'Old draft', '07:00', { published: false })

let patches: string[]
beforeEach(() => {
  atMorningToday()
  signInAs(COACH)
  patches = []
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Dora', invite_code: 'ABCD' }]),
    http.get(EVENTS, () => HttpResponse.json([EARLY, LATE, DRAFT])),
    table('coach_sessions', []),
    table('squad_players', []),
    rpc('feature_on', () => true),
    http.patch(EVENTS, ({ request }) => {
      patches.push(decodeURIComponent(new URL(request.url).search))
      return HttpResponse.json({ code: 'P0001', message: LOCKED, details: null, hint: null }, { status: 400 })
    }),
    http.get(`${SUPABASE_URL}/rest/v1/event_absences`, () => HttpResponse.json([])),
  )
})
afterEach(() => { server.events.removeAllListeners(); vi.useRealTimers() })

const toastText = () => [...document.querySelectorAll('[data-sonner-toast]')].map(t => t.textContent ?? '').join(' | ')

describe('TRAK-230: a started event is fixed', { timeout: 20_000 }, () => {
  it('the list offers Edit and Cancel only for what is still to come; a passed draft can still be published or deleted', async () => {
    renderApp('/coach/schedule')
    await screen.findByText('Late', { selector: 'p' })
    await waitFor(() => expect(screen.queryByRole('note', { name: 'This screen is coming soon' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Edit Late' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel Late' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Early' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel Early' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit Old draft' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Publish Old draft' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Old draft' })).toBeInTheDocument()
  })

  it.each(['edit', 'cancel'])("a ?%s= link for a started event says why and opens nothing", async action => {
    renderApp(`/coach/schedule?${action}=early`)
    await waitFor(() => expect(toastText()).toContain(LOCKED))
    expect(screen.queryByRole('dialog', { name: /Edit event|Cancel event/ })).toBeNull()
    expect(patches).toEqual([])
  })

  it("an edit opened before the start and saved after it shows the database's reason", async () => {
    renderApp('/coach/schedule')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Late' }))
    const sheet = screen.getByRole('dialog', { name: 'Edit event' })
    // The coach is still in the form when 18:00 passes; the database refuses the save.
    await eventStep(sheet, 'Review')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save changes' }))
    expect(await within(sheet).findByText(LOCKED)).toBeInTheDocument()
    expect(patches).toHaveLength(1)
  })
})
