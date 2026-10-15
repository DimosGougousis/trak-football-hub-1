/**
 * TRAK-183 (Imad, 15 Oct): a player who consents for themselves (at or above
 * their academy's consent age) says "Can't make it" on their own event page,
 * as a guardian does. Younger players don't see it: their guardian reports.
 * The database decides (absence_target); the page shows its answer.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, rpcRows, SUPABASE_URL } from '../../../../tests/msw/supabase'

// One player per test: the app's query cache is shared, keyed by user.
let PLAYER = { id: 'player-own-absence' }
// Far enough ahead that the page never treats it as past.
const EVENT = {
  id: 'ev-1', coach_user_id: 'coach-1', published: true, event_type: 'training', title: 'Training',
  event_date: '2099-11-14', start_time: '10:00:00', starts_at: '2099-11-14T06:00:00Z',
  venue: 'Main pitch', opponent: null, meet_time: null, kit: null, home_away: null,
  status: 'scheduled', cancel_reason: null, sequence: 0,
}
let reported: Record<string, unknown>[]
let absent: boolean
let statusAsked: boolean

function setup(age: number, consentAge: number) {
  reported = []
  absent = false
  statusAsked = false
  server.use(
    table('profiles', [{ id: 'p', user_id: PLAYER.id, role: 'player', full_name: 'Synthetic Player' }]),
    table('player_details', []),
    rpcRows('child_events', [EVENT]),
    rpc('my_consent_status', () => {
      statusAsked = true
      return { required: false, age, consent_age: consentAge, threshold: 18, own_choice: true }
    }),
    http.get(`${SUPABASE_URL}/rest/v1/squad_players`, () => HttpResponse.json([{ id: 'squad-1' }])),
    http.get(`${SUPABASE_URL}/rest/v1/event_absences`, () => HttpResponse.json(absent ? [{ reason: 'Exams' }] : [])),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/report_cant_make_it`, async ({ request }) => {
      reported.push(await request.json() as Record<string, unknown>)
      absent = true
      return new HttpResponse(null, { status: 204 })
    }),
  )
}

let n = 0
beforeEach(() => { PLAYER = { id: `player-own-absence-${++n}` }; signInAs(PLAYER) })

describe('TRAK-183: a player who consents for themselves says Can\'t make it', () => {
  it('a 16-year-old at a consent-age-15 academy reports for themselves', async () => {
    setup(16, 15)
    const user = userEvent.setup()
    renderApp('/player/event/ev-1')
    const attendance = await screen.findByRole('region', { name: 'Attendance' })
    expect(await within(attendance).findByText("Everyone counts as coming. Only say if you can't.")).toBeInTheDocument()
    await user.click(within(attendance).getByRole('button', { name: "Can't make it" }))
    await user.type(within(attendance).getByLabelText(/Reason/), 'Exams')
    await user.click(within(attendance).getByRole('button', { name: 'Tell the coach' }))
    await waitFor(() => expect(reported).toEqual([{ p_event_id: 'ev-1', p_child: PLAYER.id, p_reason: 'Exams' }]))
    expect(await within(attendance).findByText("You told the coach you can't make it.")).toBeInTheDocument()
  })

  it('a 14-year-old there sees no button: their guardian reports', async () => {
    setup(14, 15)
    renderApp('/player/event/ev-1')
    expect(await screen.findByText('Main pitch', { exact: false })).toBeInTheDocument()
    // The page has its answer before we look for the button.
    await waitFor(() => expect(statusAsked).toBe(true))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.queryByRole('region', { name: 'Attendance' })).toBeNull()
    expect(screen.queryByRole('button', { name: "Can't make it" })).toBeNull()
  })
})
