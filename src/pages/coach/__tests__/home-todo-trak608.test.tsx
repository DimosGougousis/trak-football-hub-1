/**
 * TRAK-608 (New Home 2/8, spec TRAK-606): coach Home opens with a greeting and the To-do, in the Today card's and Squad
 * shape's place. One numbered list in homeTodos()'s order (TRAK-607): an urgent to-do has a yellow number and the list
 * ends with the Urgent key; each keeps the app's own next step; a button that can't be used yet is greyed. Test people
 * are named after footballers. The academy has no time zone set, so its days are Dubai's (UTC+4).
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

const todo = () => screen.findByRole('region', { name: 'To-do' }, { timeout: 5000 })
const rowOf = async (text: string | RegExp) => (await within(await todo()).findByText(text, {}, { timeout: 5000 })).closest('li')!
const titles = async () => {
  const list = await todo()
  await waitFor(() => expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0), { timeout: 5000 })
  // TRAK-612: the dotted "Add a to-do" step at the end isn't a to-do.
  return within(list).getAllByRole('listitem').filter(li => !within(li).queryByRole('button', { name: 'Add a to-do' }))
    .map(li => li.querySelector('span.grid > span')!.textContent!.replace(/^Urgent: /, ''))
}

describe('TRAK-608: the To-do on coach Home', { timeout: 20_000 }, () => {
  it('a training today: its plan (shared), the register from the start, notes after the end; Squad shape is gone', async () => {
    home({ events: [event('t1', 'training', '2026-11-04T16:00', { title: 'Pressing zones' })], practices: [practice('t1', 1, 'Rondos 4v1', 15)] })
    renderApp('/coach/home')
    expect(await titles()).toEqual(["Today's training plan", 'Take the register', 'Write session notes'])
    expect(within(await rowOf("Today's training plan")).getByText('✓ Shared')).toBeInTheDocument()
    expect(within(await rowOf('Take the register')).getByRole('button', { name: /^From / })).toBeDisabled()
    expect(within(await rowOf('Write session notes')).getByRole('button', { name: /^After / })).toBeDisabled()
    expect(screen.queryByRole('region', { name: 'Squad shape' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Today' })).toBeNull()
    expect(screen.getByText('Training on today. Have a great session out there.')).toBeInTheDocument()
  })

  it('no plan on the day is urgent and says by when; Plan training opens the planner', async () => {
    const user = userEvent.setup()
    home({ events: [event('t1', 'training', '2026-11-04T16:00')] })
    renderApp('/coach/home')
    const row = await rowOf('No plan for today\'s training yet')
    expect(within(row).getByText('Urgent:')).toBeInTheDocument()
    expect(within(row).getByText(/^Plan it before /)).toBeInTheDocument()
    expect(within(await todo()).getByText('Urgent')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Plan training' }))
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/coach/training/t1?tab=plan'))
  })

  it('a planned training still a draft offers Share', async () => {
    home({ events: [event('t1', 'training', '2026-11-04T16:00', { published: false })], practices: [practice('t1', 1, 'Rondos 4v1', 15)] })
    renderApp('/coach/home')
    expect(within(await rowOf("Today's training plan")).getByRole('button', { name: 'Share' })).toBeInTheDocument()
  })

  it('a match today comes first: its plan is urgent until shared, with the match\'s own next step', async () => {
    home({ events: [
      event('t1', 'training', '2026-11-04T14:00'),
      event('m1', 'match', '2026-11-04T15:00', { title: 'League', opponent: 'Parkview Athletic' }),
    ], practices: [practice('t1', 1, 'Rondos 4v1', 15)] })
    renderApp('/coach/home')
    expect((await titles())[0]).toBe('No plan for Parkview Athletic yet')
    expect(within(await rowOf('No plan for Parkview Athletic yet')).getByRole('button', { name: 'Write plan' })).toBeInTheDocument()
    expect(screen.getByText("Match day. You've done the work this week. Good luck out there.")).toBeInTheDocument()
  })

  it('with nothing today, the next training\'s plan', async () => {
    home({ events: [event('t2', 'training', '2026-11-06T16:00')] })
    renderApp('/coach/home')
    expect(await titles()).toEqual(["Plan Friday's training"])
    expect(screen.getByText('Nothing on today. A good day to get ahead on the week.')).toBeInTheDocument()
  })

  it('with All picked, a coach of two age groups sees which one each to-do is for', async () => {
    home({ events: [event('t1', 'training', '2026-11-04T16:00'), event('t2', 'training', '2026-11-04T17:00', { squad: 'U14' })],
      practices: [practice('t1', 1, 'Rondos 4v1', 15), practice('t2', 1, 'Rondos 4v1', 15)] })
    server.use(table('squad_players', [
      { id: 'sp-1', coach_user_id: COACH.id, player_name: 'Mohamed Salah', age_group: 'U16', status: 'active', created_at: '2026-10-01T08:00:00Z' },
      { id: 'sp-2', coach_user_id: COACH.id, player_name: 'Virgil van Dijk', age_group: 'U14', status: 'active', created_at: '2026-10-01T08:00:00Z' },
    ]))
    renderApp('/coach/home')
    const rows = await within(await todo()).findAllByText(/^U1[46] · /, {}, { timeout: 5000 })
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  // TRAK-615 (Kostas, live check of 27 Nov): two to-dos with the same title say which event each is for.
  it("two matches to evaluate and a training's notes each name their event and day", async () => {
    home({ events: [
      event('m1', 'match', '2026-11-01T10:00', { title: 'League', opponent: 'Parkview Athletic' }),
      event('m2', 'match', '2026-11-02T10:00', { title: 'League', opponent: 'Parkview Athletic' }),
      event('t3', 'training', '2026-11-03T10:00', { title: 'Finishing' }),
    ], practices: [practice('t3', 1, 'Rondos 4v1', 15)] })
    renderApp('/coach/home')
    const list = await screen.findByRole('region', { name: 'To-do' }, { timeout: 5000 })
    expect(await within(list).findByText('vs Parkview Athletic · Sun 1 Nov', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(within(list).getByText('vs Parkview Athletic · Mon 2 Nov')).toBeInTheDocument()
    expect(within(list).getAllByText(/^Finishing · Tue 3 Nov · \d\d:\d\d$/).length).toBeGreaterThan(0)
  })

  it('with Training and Games off, a training asks only for its register', async () => {
    home({ events: [event('t1', 'training', '2026-11-04T16:00')], features: ['events'] })
    renderApp('/coach/home')
    expect(await titles()).toEqual(['Take the register'])
  })

  it('the greeting and the To-do come before Upcoming (TRAK-611)', async () => {
    home({ events: [event('t1', 'training', '2026-11-04T16:00')], practices: [practice('t1', 1, 'Rondos 4v1', 15)] })
    renderApp('/coach/home')
    const list = await todo()
    const week = await screen.findByRole('region', { name: /^Upcoming/ }, { timeout: 5000 })
    expect(list.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
