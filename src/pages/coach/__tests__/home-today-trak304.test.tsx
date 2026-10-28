/**
 * TRAK-304 (Kostas, 28 Oct): when the coach opens Trak on a training or match day, Home shows that day's plan in
 * Squad shape's place: a training's practices and next step, a match's formation and goals. With nothing today, the
 * next one coming up. Only where Training or Games is switched on (without them Home keeps Squad shape, as
 * coach-home-trak197 checks). Test people are named after footballers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
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
const practice = (event_id: string, position: number, name: string, minutes: number) => ({
  event_id, position, name, minutes, how: '', tell: '', area: '', numbers: '', direction: '', targets: '', conditions: '',
  source: 'own', drill_id: null, library_session: null,
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

const today = () => screen.findByRole('region', { name: 'Today' }, { timeout: 5000 })

describe('TRAK-304: today’s plan on coach Home', { timeout: 20_000 }, () => {
  it('a planned training today shows its practices and next step, in Squad shape’s place', async () => {
    home({
      events: [event('t1', 'training', '2026-11-04T16:00', { title: 'Pressing zones' })],
      practices: [practice('t1', 1, 'Rondos 4v1', 15), practice('t1', 2, 'Pressing on the trigger', 25)],
    })
    renderApp('/coach/home')
    const card = await today()
    const training = await within(card).findByRole('article', { name: 'Training, Pressing zones' })
    await waitFor(() => expect(within(training).getByText('Planned')).toBeInTheDocument())
    const list = within(training).getByRole('list', { name: 'Today’s practices' })
    expect(list).toHaveTextContent('15 minRondos 4v1')
    expect(list).toHaveTextContent('25 minPressing on the trigger')
    expect(list).toHaveTextContent('40 min in all')
    expect(within(training).getByText('Next: Who’s here')).toBeInTheDocument()
    expect(within(training).getByRole('link', { name: 'Run it' })).toHaveAttribute('href', '/coach/training/t1/run')
    expect(within(training).getByRole('link', { name: 'Open the plan' })).toHaveAttribute('href', '/coach/training/t1')
    expect(screen.queryByRole('region', { name: 'Squad shape' })).toBeNull()
  })

  it('on a phone the week comes first, then today’s plan (Kostas, 28 Oct)', async () => {
    home({ events: [event('t1', 'training', '2026-11-04T16:00', { title: 'Pressing zones' })] })
    renderApp('/coach/home')
    const card = await today()
    const week = await screen.findByRole('heading', { name: 'This week' }, { timeout: 5000 })
    expect(week.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Nothing moves it back up with CSS order.
    const ordered = (el: Element | null): boolean => !!el && ([...el.classList].some(c => /^-?order-/.test(c)) || ordered(el.parentElement))
    expect(ordered(card)).toBe(false)
  })

  it('a training today not planned yet says so, with Plan this session', async () => {
    home({ events: [event('t2', 'training', '2026-11-04T18:00', { title: 'Finishing' })] })
    renderApp('/coach/home')
    const training = await within(await today()).findByRole('article', { name: 'Training, Finishing' })
    await waitFor(() => expect(within(training).getByText('Not planned')).toBeInTheDocument())
    expect(within(training).getByRole('link', { name: 'Plan this session' })).toHaveAttribute('href', '/coach/training/t2')
  })

  it('a match today shows its game plan: formation and goals, with the game a tap away', async () => {
    home({
      events: [event('m1', 'match', '2026-11-04T17:00', { title: 'League', opponent: 'Everton', home_away: 'home' })],
      gamePlans: [{ event_id: 'm1', formation: '4-3-3', format: 11, goals: [{ title: 'Win it back in 5 seconds', looks_like: '' }],
        key_players: [], scouting: '', strength: null, their_formation: null, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z' }],
    })
    renderApp('/coach/home')
    const match = await within(await today()).findByRole('article', { name: 'Match, vs Everton' })
    await waitFor(() => expect(within(match).getByText('4-3-3')).toBeInTheDocument())
    expect(within(match).getByText('Win it back in 5 seconds')).toBeInTheDocument()
    expect(within(match).getByRole('link', { name: 'Open the game plan' })).toHaveAttribute('href', '/coach/games/m1?tab=plan')
  })

  it('a training earlier today stays on the card, closed, as a reminder of what was done', async () => {
    home({
      events: [event('t0', 'training', '2026-11-04T08:00', { title: 'Morning session' }), event('t9', 'training', '2026-11-06T18:00')],
      practices: [practice('t0', 1, 'Rondos 4v1', 15)],
    })
    server.use(table('coach_sessions', [{ id: 's0', event_id: 't0' }]))
    renderApp('/coach/home')
    const card = await today()
    const training = await within(card).findByRole('article', { name: 'Training, Morning session' })
    await waitFor(() => expect(within(training).getByText('Closed')).toBeInTheDocument())
    expect(within(card).queryByText('Nothing today')).toBeNull()
    expect(within(training).queryByRole('link', { name: 'Run it' })).toBeNull()
  })

  it('with nothing today, the next training or match coming up', async () => {
    home({ events: [event('t3', 'training', '2026-11-06T18:00', { title: 'Before Liverpool' })] })
    renderApp('/coach/home')
    const card = await today()
    await waitFor(() => expect(within(card).getByText('Nothing today')).toBeInTheDocument())
    expect(within(card).getByRole('link', { name: /Before Liverpool/ })).toHaveAttribute('href', '/coach/training/t3')
  })

  it('with Training and Games off, Home keeps Squad shape', async () => {
    home({ events: [event('t1', 'training', '2026-11-04T16:00')], features: ['events'] })
    renderApp('/coach/home')
    expect(await screen.findByRole('region', { name: 'Squad shape' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Today' })).toBeNull()
  })
})
