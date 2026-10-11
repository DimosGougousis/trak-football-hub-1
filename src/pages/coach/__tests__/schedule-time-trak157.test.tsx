import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { localTodayISO, toInstant } from '@/lib/event-time'
import { pickDay, pickTime } from '../../../../tests/support/time-reel'

/**
 * TRAK-157 (J8.4), from the 11 Oct live run: Dora set the hour and minutes of
 * an 8-week Tuesday series but not AM/PM; the time field stayed empty, the form
 * didn't need one, and 8 published trainings said "Time to be confirmed". Now
 * the day and time are one wheel that only holds whole values, and no time is
 * something the coach chooses ("Time not set yet"), never what's left behind.
 */

const COACH = { id: 'coach-1' }
const today = localTodayISO()
const EVENTS = `${SUPABASE_URL}/rest/v1/coach_calendar_events`
const shift = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
// Dora's series: Tuesdays for 8 weeks, starting next Tuesday.
const TUE = shift(today, ((9 - new Date(`${today}T00:00:00Z`).getUTCDay()) % 7) || 7)
const LAST_TUE = shift(TUE, 7 * 7)

// An event saved before this fix, with no time.
const UNTIMED = {
  id: 'untimed-1', title: 'Training', coach_user_id: COACH.id, event_type: 'training', starts_at: toInstant(today, '00:00'),
  ends_at: null, event_date: today, start_time: null, venue: 'Main Venue', opponent: null, notes: null, published: true,
  source: 'manual', meet_time: null, kit: null, home_away: null, status: 'scheduled', cancel_reason: null, series_id: null,
}

let inserted: Record<string, unknown>[][]
function fixtures() {
  inserted = []
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Dora', invite_code: 'ABCD' }]),
    http.get(EVENTS, () => HttpResponse.json([UNTIMED])),
    table('coach_sessions', []),
    table('squad_players', []),
    rpc('feature_on', () => true),
    http.post(EVENTS, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>[]
      inserted.push(body)
      return HttpResponse.json(body.map((_, i) => ({ id: `written-${i}` })), { status: 201 })
    }),
  )
}

async function newEvent() {
  renderApp('/coach/schedule')
  await screen.findByText('Training', { selector: 'p' })
  await waitFor(() => expect(screen.queryByRole('note', { name: 'This screen is coming soon' })).toBeNull())
  await userEvent.click(screen.getByRole('button', { name: 'Add event' }))
  return screen.getByRole('dialog', { name: 'New event' })
}

describe('TRAK-157: a time is picked whole, or left out on purpose', () => {
  beforeEach(() => {
    signInAs(COACH)
    fixtures()
  })

  it('no time picked: Save says so and saves nothing', async () => {
    const sheet = await newEvent()
    await userEvent.type(within(sheet).getByLabelText('Venue'), 'Main Venue')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save draft' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Pick a start time, or choose “Time not set yet”')
    expect(inserted).toEqual([])
  }, 20_000)

  it('"Time not set yet" is a choice: the wheel rests, and the event saves with no time', async () => {
    const sheet = await newEvent()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Time not set yet' }))
    expect(within(sheet).getByRole('button', { name: 'Time not set yet' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sheet).getByRole('listbox', { name: 'Start hour' })).toHaveAttribute('aria-disabled', 'true')
    // No meet time without a start.
    expect(within(sheet).queryByRole('button', { name: 'Meet earlier' })).toBeNull()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(inserted).toHaveLength(1))
    expect(inserted[0][0]).toMatchObject({ start_time: null, meet_time: null })
  }, 20_000)

  it("Dora's series again: 8 Tuesdays at 6:00 PM, meet 5:30 PM, save 8 times with both", async () => {
    const sheet = await newEvent()
    await pickDay(sheet, 'Start', TUE)
    await pickTime(sheet, 'Start', '18:00')
    expect(within(sheet).getByText(/at 6:00 PM$/)).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Meet earlier' }))
    // It starts half an hour before; Dora's was exactly that.
    await userEvent.click(within(sheet).getByRole('button', { name: 'Repeats weekly' }))
    await userEvent.type(within(sheet).getByLabelText('Ends on'), LAST_TUE)
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save 8 drafts' }))
    await waitFor(() => expect(inserted).toHaveLength(1))
    expect(inserted[0]).toHaveLength(8)
    expect(inserted[0].every(r => r.start_time === '18:00:00' && r.meet_time === '17:30:00')).toBe(true)
  }, 20_000)

  it('an event saved with no time opens as "Time not set yet", and picking a time turns that off', async () => {
    renderApp('/coach/schedule')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Training' }))
    const sheet = screen.getByRole('dialog', { name: 'Edit event' })
    const later = within(sheet).getByRole('button', { name: 'Time not set yet' })
    expect(later).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(later)
    await pickTime(sheet, 'Start', '18:00')
    expect(within(sheet).getByRole('button', { name: 'Time not set yet' })).toHaveAttribute('aria-pressed', 'false')
  }, 20_000)
})
