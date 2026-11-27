/**
 * TRAK-612 (New Home 6/8, spec TRAK-606): the coach's own to-dos. A dotted "Add a to-do" step at the end of the To-do
 * opens in place: the words, Today / Tomorrow / Pick a date, and Urgent. Not linked to an event, not in + Create. It
 * shows "Added by you" and Done; an urgent one goes to the top. Test people are named after footballers. The academy's
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
const todo = () => screen.findByRole('region', { name: 'To-do' }, { timeout: 5000 })
const openAdd = async () => {
  await userEvent.click(await within(await todo()).findByRole('button', { name: 'Add a to-do' }, { timeout: 5000 }))
  return screen.getByRole('form', { name: 'Add a to-do' })
}

describe("TRAK-612: the coach's own to-dos", { timeout: 20_000 }, () => {
  it('adds one for today: it joins the list, "Added by you", with Done', async () => {
    home({ events: [] })
    ownTodos()
    renderApp('/coach/home')
    const form = await openAdd()
    await userEvent.type(within(form).getByRole('textbox', { name: 'What do you need to do?' }), "Call Omar's dad")
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(posted).toEqual([{ title: "Call Omar's dad", due_on: '2026-11-04', urgent: false }]))
    const row = (await within(await todo()).findByText("Call Omar's dad", {}, { timeout: 5000 })).closest('li')!
    expect(row).toHaveTextContent('Added by you')
    expect(within(row).getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('for tomorrow: saved for that day, and it says so', async () => {
    home({ events: [] })
    ownTodos()
    renderApp('/coach/home')
    const form = await openAdd()
    await userEvent.type(within(form).getByRole('textbox', { name: 'What do you need to do?' }), 'Book the minibus')
    await userEvent.click(within(form).getByRole('button', { name: 'Tomorrow' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(posted).toEqual([{ title: 'Book the minibus', due_on: '2026-11-05', urgent: false }]))
    expect(await screen.findByText('Added for Thu 5 Nov. It shows on your to-do that day.')).toBeInTheDocument()
    expect(within(await todo()).queryByText('Book the minibus')).toBeNull()
  })

  it('an urgent one goes to the top, above a training of today', async () => {
    home({ events: [event('t1', 'training', '2026-11-04T16:00')], practices: [practice('t1', 1, 'Rondos 4v1', 15)] })
    ownTodos()
    renderApp('/coach/home')
    await within(await todo()).findByText("Today's training plan", {}, { timeout: 5000 })
    const form = await openAdd()
    await userEvent.type(within(form).getByRole('textbox', { name: 'What do you need to do?' }), 'Order new bibs')
    await userEvent.click(within(form).getByRole('button', { name: 'Urgent' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(posted[0]).toMatchObject({ urgent: true }))
    const first = await waitFor(() => {
      const item = within(screen.getByRole('region', { name: 'To-do' })).getAllByRole('listitem')[0]
      expect(item).toHaveTextContent('Order new bibs')
      return item
    })
    expect(within(first).getByText('Urgent:')).toBeInTheDocument()
  })

  it('Done ticks it; it stays, ticked, for the day', async () => {
    home({ events: [] })
    ownTodos()
    mine = [{ id: 'own-a', coach_user_id: COACH.id, title: 'Send the photos', due_on: '2026-11-03', urgent: false, done_at: null, created_at: '2026-11-03T08:00:00Z' }]
    renderApp('/coach/home')
    const row = (await within(await todo()).findByText('Send the photos', {}, { timeout: 5000 })).closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(patched).toEqual([expect.objectContaining({ id: 'own-a', done_at: expect.any(String) })]))
    expect(await within(row).findByText('✓ Done')).toBeInTheDocument()
  })
})
