/**
 * TRAK-613 (New Home 7/8, spec TRAK-606): Change order. The coach moves to-dos up and down; their order holds until
 * midnight, saved on the account (coach_home_order). The coach's own to-dos also get Urgent (which moves it to the top)
 * and ✕. Test people are named after footballers. The academy's days are Dubai's (UTC+4); now is Wed 4 Nov at midday.
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

type Own = { id: string; coach_user_id: string; title: string; due_on: string; urgent: boolean; done_at: string | null; created_at: string }
let mine: Own[] = []
let posted: Record<string, unknown>[] = []
let patched: Record<string, unknown>[] = []
function ownTodos() {
  mine = []; posted = []; patched = []
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/coach_todos`, () => HttpResponse.json(mine)),
    http.post(`${SUPABASE_URL}/rest/v1/coach_todos`, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>
      posted.push(body)
      mine.push({ id: `own-${mine.length + 1}`, coach_user_id: COACH.id, done_at: null, created_at: new Date().toISOString(), urgent: false, ...body } as Own)
      return new HttpResponse(null, { status: 201 })
    }),
    http.patch(`${SUPABASE_URL}/rest/v1/coach_todos`, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>
      const id = new URL(request.url).searchParams.get('id')?.replace(/^eq\./, '')
      patched.push({ id, ...body })
      mine = mine.map(row => (row.id === id ? { ...row, ...body } as Own : row))
      return new HttpResponse(null, { status: 204 })
    }),
  )
}
let savedOrder: string[] | null = null
let orderPosts: Record<string, unknown>[] = []
let deleted: string[] = []
function homeOrder() {
  savedOrder = null; orderPosts = []; deleted = []
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/coach_home_order`, () => HttpResponse.json(savedOrder ? { item_keys: savedOrder } : null)),
    http.post(`${SUPABASE_URL}/rest/v1/coach_home_order`, async ({ request }) => {
      const body = await request.json() as { item_keys: string[] }
      orderPosts.push(body)
      savedOrder = body.item_keys
      return new HttpResponse(null, { status: 201 })
    }),
    http.delete(`${SUPABASE_URL}/rest/v1/coach_todos`, ({ request }) => {
      deleted.push(new URL(request.url).searchParams.get('id')?.replace(/^eq\./, '') ?? '')
      return new HttpResponse(null, { status: 204 })
    }),
  )
}
const todo = () => screen.findByRole('region', { name: 'To-do' }, { timeout: 5000 })
const titles = async () => {
  const list = await todo()
  return within(list).getAllByRole('listitem').filter(li => li.querySelector('span.grid > span'))
    .map(li => li.querySelector('span.grid > span')!.textContent!.replace(/^Urgent: /, ''))
}
const training = () => home({ events: [event('t1', 'training', '2026-11-04T16:00')], practices: [practice('t1', 1, 'Rondos 4v1', 15)] })

describe('TRAK-613: Change order', { timeout: 20_000 }, () => {
  it('moves a to-do up, saves the order for today, and Done brings the buttons back', async () => {
    training(); ownTodos(); homeOrder()
    renderApp('/coach/home')
    await within(await todo()).findByText('Write session notes', {}, { timeout: 5000 })
    await userEvent.click(screen.getByRole('button', { name: 'Change order' }))
    expect(within(await todo()).queryByRole('button', { name: /^From / })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Move up: Write session notes' }))
    await waitFor(() => expect(orderPosts).toEqual([expect.objectContaining({ day: '2026-11-04', item_keys: ['training-plan:t1', 'notes:t1', 'register:t1'] })]))
    expect(['all', 'U16']).toContain(orderPosts[0].squad_view)
    expect(await titles()).toEqual(["Today's training plan", 'Write session notes', 'Take the register'])
    expect(screen.getByRole('button', { name: 'Move up: Today\'s training plan' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(within(await todo()).getByRole('button', { name: /^From / })).toBeDisabled()
  })

  it("a saved order for today is the list's order", async () => {
    training(); ownTodos(); homeOrder()
    savedOrder = ['notes:t1', 'register:t1', 'training-plan:t1']
    renderApp('/coach/home')
    await within(await todo()).findByText('Write session notes', {}, { timeout: 5000 })
    await waitFor(async () => expect(await titles()).toEqual(['Write session notes', 'Take the register', "Today's training plan"]))
  })

  it('an own to-do marked urgent goes to the top; ✕ removes it', async () => {
    training(); ownTodos(); homeOrder()
    mine = [{ id: 'own-a', coach_user_id: COACH.id, title: 'Order new bibs', due_on: '2026-11-04', urgent: false, done_at: null, created_at: '2026-11-04T08:00:00Z' }]
    renderApp('/coach/home')
    await within(await todo()).findByText('Order new bibs', {}, { timeout: 5000 })
    await userEvent.click(screen.getByRole('button', { name: 'Change order' }))
    const row = within(await todo()).getByText('Order new bibs').closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: 'Urgent' }))
    await waitFor(() => expect(patched).toEqual([expect.objectContaining({ id: 'own-a', urgent: true })]))
    await waitFor(() => expect(orderPosts.at(-1)?.item_keys).toEqual(['own:own-a', 'training-plan:t1', 'register:t1', 'notes:t1']))
    await userEvent.click(screen.getByRole('button', { name: 'Remove: Order new bibs' }))
    await waitFor(() => expect(deleted).toEqual(['own-a']))
  })
})
