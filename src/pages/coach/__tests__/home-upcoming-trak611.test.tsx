/**
 * TRAK-611 (New Home 5/8, spec TRAK-606): Upcoming, in the week strip's place on Home. Every training and match from
 * tomorrow to 7 days ahead, in two cards, each with its next missing step as its to-do's button, "✓ Ready" when nothing
 * is missing, and "In To-do" when the step is in today's list. Test people are named after footballers. The academy's
 * days are Dubai's (UTC+4); now is Wed 4 Nov at midday.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { forgetScreens } from '@/lib/screen-memory'

// Midday on a Wednesday; today's events are later in the day.
const NOW = new Date('2026-11-04T12:00:00Z')
// Times are UTC, whatever the machine's time zone.
const at = (iso: string) => new Date(`${iso}:00Z`)
let n = 0
let COACH = { id: 'coach-304' }

function event(id: string, type: 'training' | 'match', starts: string, over: Record<string, unknown> = {}) {
  const start = at(starts)
  return {
    id, coach_user_id: COACH.id, squad: 'U16', title: `Training ${id}`, event_type: type, published: true, status: 'scheduled',
    starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 90 * 60_000).toISOString(),
    event_date: starts.slice(0, 10), start_time: `${starts.slice(11, 16)}:00`, venue: 'Pitch 2', opponent: null, home_away: null, ...over,
  }
}
const practice = (event_id: string, position: number, name: string, minutes: number, part = '') => ({
  event_id, position, name, minutes, how: '', tell: '', area: '', numbers: '', direction: '', targets: '', conditions: '',
  source: 'own', drill_id: null, library_session: null, part,
})

function home({ events, practices = [], gamePlans = [], features = ['events', 'training', 'games'] }: {
  events: Record<string, unknown>[]; practices?: Record<string, unknown>[]; gamePlans?: Record<string, unknown>[]; features?: string[]
}) {
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Jürgen Klopp', invite_code: 'ABCD' }]),
    table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16', organization_id: 'org-1' }]),
    table('organizations', [{ id: 'org-1', name: 'Rehearsal FC' }]),
    table('squad_players', [{ id: 'sp-1', coach_user_id: COACH.id, player_name: 'Mohamed Salah', age_group: 'U16', status: 'active', created_at: '2026-10-01T08:00:00Z' }]),
    table('coach_assessments', []),
    table('coach_sessions', []),
    table('session_attendance', []),
    table('event_absences', []),
    table('notification_settings', []),
    table('game_shares', []),
    rpc('game_plan_changes', () => []),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('feature_on', ({ p_feature }) => features.includes(String(p_feature))),
    table('training_notes', []),
    table('game_evaluations', []),
    http.get(`${SUPABASE_URL}/rest/v1/coach_calendar_events`, ({ request }) => {
      const type = new URL(request.url).searchParams.get('event_type')?.replace(/^eq\./, '')
      return HttpResponse.json(type ? events.filter(e => e.event_type === type) : events)
    }),
    http.get(`${SUPABASE_URL}/rest/v1/training_plans`, () =>
      HttpResponse.json([...new Set(practices.map(p => p.event_id))].map(event_id => ({ event_id, updated_at: '2026-11-01T10:00:00Z' })))),
    table('training_plan_practices', practices),
    http.get(`${SUPABASE_URL}/rest/v1/game_plans`, ({ request }) => {
      const id = new URL(request.url).searchParams.get('event_id')?.replace(/^eq\./, '')
      return HttpResponse.json(id ? gamePlans.filter(p => p.event_id === id) : gamePlans)
    }),
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  COACH = { id: `coach-304-${++n}` }
  signInAs(COACH)
})
afterEach(() => { vi.useRealTimers(); cleanup(); forgetScreens(); localStorage.clear() })

const card = async (name: 'Trainings' | 'Matches') => screen.findByRole('region', { name }, { timeout: 5000 })
const rowOf = async (name: 'Trainings' | 'Matches', text: string | RegExp) =>
  (await within(await card(name)).findByText(text, {}, { timeout: 5000 })).closest('li')!

describe('TRAK-611: Upcoming on coach Home', { timeout: 20_000 }, () => {
  it('tomorrow to 7 days ahead, each with its next step or ✓ Ready; not today, not further', async () => {
    home({ events: [
      event('today', 'training', '2026-11-04T16:00', { title: 'Today session' }),
      event('thu', 'training', '2026-11-05T14:00', { title: 'Finishing' }),
      event('fri', 'training', '2026-11-06T14:00', { title: 'Pressing' }),
      event('sat', 'match', '2026-11-07T10:00', { title: 'League', opponent: 'Parkview Athletic' }),
      event('far', 'training', '2026-11-13T14:00', { title: 'Too far' }),
    ], practices: [practice('fri', 1, 'Rondos 4v1', 15), practice('today', 1, 'Rondos 4v1', 15)],
      gamePlans: [{ event_id: 'sat', formation: '4-3-3', format: 11, goals: [], updated_at: '2026-11-03T10:00:00Z' }] })
    renderApp('/coach/home')
    expect(within(await rowOf('Trainings', 'Finishing')).getByRole('button', { name: 'Plan training' })).toBeInTheDocument()
    expect(within(await rowOf('Trainings', 'Pressing')).getByText('✓ Ready')).toBeInTheDocument()
    expect(within(await rowOf('Matches', 'vs Parkview Athletic')).getByRole('button', { name: 'Share plan' })).toBeInTheDocument()
    expect(within(await card('Trainings')).queryByText('Today session')).toBeNull()
    expect(within(await card('Trainings')).queryByText('Too far')).toBeNull()
  })

  it("a step already in today's To-do says In To-do", async () => {
    // A day with no events: Thursday's plan is a to-do, so Upcoming points there.
    home({ events: [event('thu', 'training', '2026-11-05T14:00', { title: 'Finishing' })] })
    renderApp('/coach/home')
    expect(within(await rowOf('Trainings', 'Finishing')).getByText('In To-do')).toBeInTheDocument()
  })

  it('an empty week says so; the week strip has left Home', async () => {
    home({ events: [] })
    renderApp('/coach/home')
    expect(await within(await card('Trainings')).findByText('None this week.', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(within(await card('Matches')).getByText('None this week.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'This week' })).toBeNull()
  })

  it('with Matches off, there is no Matches card', async () => {
    home({ events: [], features: ['events', 'training'] })
    renderApp('/coach/home')
    await card('Trainings')
    expect(screen.queryByRole('region', { name: 'Matches' })).toBeNull()
  })
})
