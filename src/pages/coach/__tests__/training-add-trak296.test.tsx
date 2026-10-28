/**
 * TRAK-296 (Training 3/5, spec TRAK-293): a plan's practices come from My drills or the Library too. "Add another"
 * offers Write it · From My drills · From the Library, and each practice offers Swap; both open one sheet with three
 * views. My drills puts the best fit for the slot first and says which drills are already in the plan. A Library
 * session previews inside the sheet, with no link out of Trak, and becomes a practice with its library's tag. From
 * Training › Drills, a drill can be added to the next training not planned yet. Test people are named after
 * footballers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const onTheMinute = (ms: number) => Math.ceil(ms / MINUTE) * MINUTE
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const hm = (ms: number) => new Date(ms).toISOString().slice(11, 16)

let n = 0
let COACH = { id: 'coach-296' }
function training(id: string, start: number, over: Record<string, unknown> = {}) {
  return {
    id, coach_user_id: COACH.id, squad: 'U16', title: `Training ${id}`, event_type: 'training', published: true, status: 'scheduled',
    starts_at: new Date(start).toISOString(), ends_at: new Date(start + 90 * MINUTE).toISOString(),
    event_date: ymd(start), start_time: `${hm(start)}:00`, venue: 'Pitch 2', ...over,
  }
}
const practice = (position: number, name: string, over: Record<string, unknown> = {}) => ({
  position, name, minutes: 15, how: '', tell: '', area: '', numbers: '', direction: '', targets: '', conditions: '',
  source: 'own', drill_id: null, library_session: null, ...over,
})
const drill = (id: string, name: string, minutes: number) => ({
  id, name, minutes, how: `How ${name} works.`, tell: '', area: '', numbers: '', direction: '', targets: '', conditions: '',
  updated_at: '2026-10-27T10:00:00Z',
})
// Newest first, as the database returns them.
const DRILLS = [
  drill('d-10', 'Rondos 4v1', 10), drill('d-30', 'Game 8v8', 30), drill('d-15', '1v1 in channels', 15),
  drill('d-25', 'Pressing on the trigger', 25), drill('d-20', 'Finishing 3v2', 20),
]
const DUELS = 'pressing-and-covering-session-pressing-duels'

/** The coach's trainings and plans, as in TRAK-295's tests; save_training_plan keeps each call's arguments. */
function database(events: Record<string, unknown>[], start: Record<string, Record<string, unknown>[]> = {}) {
  const plans = new Map(Object.entries(start))
  const saves: Record<string, unknown>[] = []
  const eq = (url: URL, key: string) => url.searchParams.get(key)?.replace(/^eq\./, '')
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/coach_calendar_events`, ({ request }) => {
      const id = eq(new URL(request.url), 'id')
      return HttpResponse.json(id ? events.filter(e => e.id === id) : events)
    }),
    http.get(`${SUPABASE_URL}/rest/v1/training_plans`, ({ request }) => {
      const id = eq(new URL(request.url), 'event_id')
      const rows = [...plans.keys()].map(event_id => ({ event_id, updated_at: '2026-10-28T10:00:00Z' }))
      return HttpResponse.json(id ? rows.filter(r => r.event_id === id) : rows)
    }),
    http.get(`${SUPABASE_URL}/rest/v1/training_plan_practices`, ({ request }) =>
      HttpResponse.json(plans.get(eq(new URL(request.url), 'event_id')!) ?? [])),
    rpc('save_training_plan', args => {
      saves.push(args)
      plans.set(String(args.p_event_id), (args.p_practices as Record<string, unknown>[]).map((p, i) => ({ ...p, position: i + 1 })))
      return null
    }),
  )
  return saves
}

beforeEach(() => {
  COACH = { id: `coach-296-${++n}` }
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Jürgen Klopp', invite_code: 'ABCD' }]),
    table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16', organization_id: 'org-1' }]),
    table('organizations', [{ id: 'org-1', name: 'Rehearsal FC', logo_url: null }]),
    table('squad_players', [{ id: 'sp-1', coach_user_id: COACH.id, player_name: 'Mohamed Salah', age_group: 'U16', status: 'active' }]),
    table('coach_sessions', []),
    table('session_attendance', []),
    table('event_absences', []),
    table('coach_drills', DRILLS),
    rpc('feature_on', () => true),
  )
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

const practices = () => within(screen.getByRole('list', { name: 'Practices' })).queryAllByRole('listitem')
  .map(item => item.querySelector('p')?.textContent)
const names = (region: HTMLElement) => within(region).getAllByRole('article').map(a => a.getAttribute('aria-label'))

describe('TRAK-296: adding from My drills', { timeout: 30_000 }, () => {
  it('puts the best fit for the slot first, says which drills are already in, and adds a copy of the one used', async () => {
    const user = userEvent.setup()
    // 70 of 90 minutes planned: a slot of about 20.
    const saves = database([training('soon', onTheMinute(Date.now() + DAY))], {
      soon: [practice(1, 'Rondos 4v1', { minutes: 10, source: 'drill', drill_id: 'd-10' }), practice(2, 'Game 8v8', { minutes: 60 })],
    })
    renderApp('/coach/training/soon/plan')
    await waitFor(() => expect(practices()).toEqual(['Rondos 4v1', 'Game 8v8']))
    await user.click(screen.getByRole('button', { name: 'From My drills' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add a practice' })
    expect(within(sheet).getByText(/about 20 min/)).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'My drills', pressed: true })).toBeInTheDocument()

    const best = await within(sheet).findByRole('region', { name: 'Best fit for this slot' })
    expect(names(best)).toEqual(['Finishing 3v2', '1v1 in channels', 'Pressing on the trigger'])
    const more = within(sheet).getByRole('region', { name: 'More of my drills' })
    expect(names(more)).toEqual(['Rondos 4v1', 'Game 8v8'])
    expect(within(within(more).getByRole('article', { name: 'Rondos 4v1' })).getByText('Already in this plan')).toBeInTheDocument()

    // A search replaces the best fit with every drill that matches.
    await user.type(within(sheet).getByRole('searchbox', { name: 'Search my drills' }), 'press')
    await waitFor(() => expect(within(sheet).queryByRole('region', { name: 'Best fit for this slot' })).toBeNull())
    expect(names(within(sheet).getByRole('region', { name: 'My drills' }))).toEqual(['Pressing on the trigger'])
    await user.click(within(sheet).getByRole('button', { name: 'Use Pressing on the trigger' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add a practice' })).toBeNull())
    expect(practices()).toEqual(['Rondos 4v1', 'Game 8v8', 'Pressing on the trigger'])

    await user.click(screen.getByRole('button', { name: 'Save the plan' }))
    await waitFor(() => expect(saves).toHaveLength(1))
    expect((saves[0].p_practices as unknown[])[2]).toEqual(expect.objectContaining({
      name: 'Pressing on the trigger', minutes: 25, how: 'How Pressing on the trigger works.', source: 'drill', drill_id: 'd-25', save_to_drills: false,
    }))
  })

  it('on an empty plan, My drills and the Library are on offer beside the new practice until the coach types', async () => {
    const user = userEvent.setup()
    database([training('soon', onTheMinute(Date.now() + DAY))])
    renderApp('/coach/training/soon/plan')
    const form = await screen.findByRole('form', { name: 'Practice 1' })
    expect(screen.getByRole('button', { name: 'From My drills' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'From My drills' }))
    await user.click(await screen.findByRole('button', { name: 'Use Game 8v8' }))
    await waitFor(() => expect(practices()).toEqual(['Game 8v8']))
    expect(form).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Write it' }))
    await user.type(within(await screen.findByRole('form', { name: 'Practice 2' })).getByLabelText('Name'), 'Cool-down')
    expect(screen.queryByRole('button', { name: 'From My drills' })).toBeNull()
  })
})

describe('TRAK-296: adding from the Library', { timeout: 30_000 }, () => {
  it('browses a library for the squad’s ages, previews a session in place, and adds it with its library’s tag', async () => {
    const user = userEvent.setup()
    const saves = database([training('soon', onTheMinute(Date.now() + DAY))], { soon: [practice(1, 'Rondos 4v1', { minutes: 15 })] })
    renderApp('/coach/training/soon/plan')
    await waitFor(() => expect(practices()).toEqual(['Rondos 4v1']))
    await user.click(screen.getByRole('button', { name: 'From the Library' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add a practice' })
    expect(within(sheet).getByText('Ages 12–16')).toBeInTheDocument()
    expect(within(within(sheet).getByRole('list', { name: 'Libraries' })).getAllByRole('button')).toHaveLength(7)
    await user.click(within(sheet).getByRole('button', { name: 'Defending' }))
    const sessions = within(sheet).getByRole('list', { name: 'Library sessions' })
    expect(within(sessions).getByRole('article', { name: 'Pressing duels' })).toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'Preview Pressing duels' }))
    expect(await within(sheet).findByRole('heading', { name: 'Pressing duels' })).toBeInTheDocument()
    expect(within(sheet).getByText('Players will learn to')).toBeInTheDocument()
    // Nothing in the sheet leaves the plan, let alone Trak.
    expect(within(sheet).queryAllByRole('link')).toEqual([])
    await user.click(within(sheet).getByRole('button', { name: 'Use this' }))

    await waitFor(() => expect(practices()).toEqual(['Rondos 4v1', 'Pressing duels']))
    expect(screen.getByText('Library · Defending')).toBeInTheDocument()
    expect(screen.getByText('50×40-yard pitch · 13 players')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save the plan' }))
    await waitFor(() => expect(saves).toHaveLength(1))
    // 15 of 90 planned: room for 30.
    expect((saves[0].p_practices as unknown[])[1]).toEqual(expect.objectContaining({
      name: 'Pressing duels', minutes: 30, source: 'library', library_session: DUELS, drill_id: null, save_to_drills: false,
    }))
  })

  it('search finds sessions across the libraries; Show every age widens it', async () => {
    const user = userEvent.setup()
    database([training('soon', onTheMinute(Date.now() + DAY))], { soon: [practice(1, 'Rondos 4v1')] })
    renderApp('/coach/training/soon/plan')
    await user.click(await screen.findByRole('button', { name: 'From the Library' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add a practice' })
    await user.type(within(sheet).getByRole('searchbox', { name: 'Search the Library' }), 'pressing duels')
    expect(await within(sheet).findByRole('article', { name: 'Pressing duels' })).toBeInTheDocument()
    await user.clear(within(sheet).getByRole('searchbox', { name: 'Search the Library' }))
    await user.type(within(sheet).getByRole('searchbox', { name: 'Search the Library' }), 'volcanoes')
    // A Play Phase session is for ages 4–6: hidden for a U16 squad until every age is asked for.
    expect(await within(sheet).findByText('No session matches “volcanoes”.')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Show every age' }))
    expect(await within(sheet).findByRole('article', { name: 'Volcanoes and craters' })).toBeInTheDocument()
  })
})

describe('TRAK-296: swapping a practice', { timeout: 30_000 }, () => {
  it('Swap replaces the practice in its place, from My drills or written instead', async () => {
    const user = userEvent.setup()
    database([training('soon', onTheMinute(Date.now() + DAY))],
      { soon: [practice(1, 'Warm-up'), practice(2, 'Old game', { minutes: 25 }), practice(3, 'Cool-down', { minutes: 10 })] })
    renderApp('/coach/training/soon/plan')
    await waitFor(() => expect(practices()).toEqual(['Warm-up', 'Old game', 'Cool-down']))
    await user.click(screen.getByRole('button', { name: 'Swap Old game' }))
    let sheet = await screen.findByRole('dialog', { name: 'Swap “Old game”' })
    expect(within(sheet).getByText(/practice 2 · about 25 min/)).toBeInTheDocument()
    expect(names(within(sheet).getByRole('region', { name: 'Best fit for this slot' }))[0]).toBe('Pressing on the trigger')
    await user.click(within(sheet).getByRole('button', { name: 'Use Pressing on the trigger' }))
    await waitFor(() => expect(practices()).toEqual(['Warm-up', 'Pressing on the trigger', 'Cool-down']))

    await user.click(screen.getByRole('button', { name: 'Swap Cool-down' }))
    sheet = await screen.findByRole('dialog', { name: 'Swap “Cool-down”' })
    await user.click(within(sheet).getByRole('button', { name: 'Write my own' }))
    await user.click(within(sheet).getByRole('button', { name: 'Write it' }))
    const form = await screen.findByRole('form', { name: 'Practice 3' })
    await user.type(within(form).getByLabelText('Name'), 'Stretch and talk')
    await user.click(within(form).getByRole('button', { name: 'Keep changes' }))
    await waitFor(() => expect(practices()).toEqual(['Warm-up', 'Pressing on the trigger', 'Stretch and talk']))
  })
})

describe('TRAK-296: Add to the next training from Training › Drills', { timeout: 30_000 }, () => {
  it('a drill card adds the drill to the next training not planned yet, once', async () => {
    const user = userEvent.setup()
    const now = Date.now()
    const saves = database([training('planned', onTheMinute(now + DAY)), training('next', onTheMinute(now + 2 * DAY))],
      { planned: [practice(1, 'Rondos 4v1')] })
    renderApp('/coach/training/drills')
    const card = await screen.findByRole('button', { name: /^Add Finishing 3v2 to / })
    await user.click(card)
    await waitFor(() => expect(window.location.pathname).toBe('/coach/training/next/plan'))
    await waitFor(() => expect(practices()).toEqual(['Finishing 3v2']))
    expect(screen.queryByRole('form')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save the plan' }))
    await waitFor(() => expect(saves).toHaveLength(1))
    expect(saves[0]).toEqual({ p_event_id: 'next', p_practices: [expect.objectContaining({ name: 'Finishing 3v2', source: 'drill', drill_id: 'd-20' })] })
  })

  it('with every training coming up planned, a drill card offers no Add to', async () => {
    database([training('planned', onTheMinute(Date.now() + DAY))], { planned: [practice(1, 'Rondos 4v1')] })
    renderApp('/coach/training/drills')
    expect(await screen.findByRole('button', { name: 'Finishing 3v2, 20 min. Edit' })).toBeInTheDocument()
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(screen.queryByRole('button', { name: /^Add Finishing 3v2 to / })).toBeNull()
  })
})
