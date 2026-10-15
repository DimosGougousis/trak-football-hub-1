import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'

/**
 * TRAK-137 (J8.14): before the event, the coach sees who a guardian said can't
 * make it, on the event's card. Names come from the coach's own roster; a
 * failed read never looks like "everyone is coming".
 */
let COACH = { id: 'coach-137' }
const NOW = new Date('2026-10-14T08:00:00Z') // 12:00 in Dubai
const row = (over: Record<string, unknown>) => ({
  coach_user_id: COACH.id, event_type: 'training', starts_at: '2026-10-14T13:00:00Z', ends_at: null,
  event_date: '2026-10-14', start_time: '17:00:00', venue: 'Academy Pitch 2', opponent: null, notes: null,
  published: true, source: 'manual', meet_time: null, kit: null, home_away: null, status: 'scheduled',
  cancel_reason: null, series_id: null, ...over,
})

let absenceReply: () => Response
function fixtures() {
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    table('coach_calendar_events', [row({ id: 'ev-a', title: 'Finishing' }), row({ id: 'ev-b', title: 'Evening', start_time: '19:00:00' })]),
    table('coach_sessions', []),
    table('session_attendance', []),
    table('squad_players', [{ id: 'sp-1', player_name: 'Bea Lin', status: 'active' }, { id: 'sp-2', player_name: 'Ade Okafor', status: 'active' }]),
    http.get(`${SUPABASE_URL}/rest/v1/event_absences`, () => absenceReply()),
    rpc('feature_on', () => true),
    rpc('coach_squad_player_consent_required', () => false),
  )
}

describe('TRAK-137: the coach sees who can\'t make it', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
  afterEach(() => vi.useRealTimers())

  it('lists the names on that event\'s card only', async () => {
    absenceReply = () => HttpResponse.json([
      { event_id: 'ev-a', squad_player_id: 'sp-1' }, { event_id: 'ev-a', squad_player_id: 'sp-2' },
    ])
    fixtures()
    renderApp('/coach/schedule')
    expect(await screen.findByText("2 can't make it: Ade Okafor, Bea Lin")).toBeInTheDocument()
    expect(screen.getAllByText(/can't make it/)).toHaveLength(1)
  })

  it('says a failed read failed', async () => {
    absenceReply = () => HttpResponse.json({ code: 'XX000', message: 'unavailable' }, { status: 500 })
    COACH = { id: 'coach-137-fail' } // the app's query cache outlives a test
    fixtures()
    renderApp('/coach/schedule')
    expect((await screen.findAllByText("Couldn't load who can't make it.")).length).toBeGreaterThan(0)
  })
})
