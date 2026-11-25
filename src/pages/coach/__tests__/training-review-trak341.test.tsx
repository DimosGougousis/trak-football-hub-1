/**
 * TRAK-341 (Training redo 3/5, spec TRAK-338, 2 Nov prototype): a saved plan's Review page. Kostas, 30 Oct: editing a
 * saved plan is a screen like Review; Edit opens only that part, × removes one (Undo puts it back), Add a part adds one.
 * Each change saves the plan whole and comes back here. A plan from before parts shows each name once. Test people are
 * named after footballers.
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
let COACH = { id: 'coach-341' }
function training(id: string, start: number, over: Record<string, unknown> = {}) {
  return {
    id, coach_user_id: COACH.id, squad: 'U16', title: `Training ${id}`, event_type: 'training', published: true, status: 'scheduled',
    starts_at: new Date(start).toISOString(), ends_at: new Date(start + 90 * MINUTE).toISOString(),
    event_date: ymd(start), start_time: `${hm(start)}:00`, venue: 'Pitch 2', family_note: null, ...over,
  }
}
const practice = (position: number, name: string, over: Record<string, unknown> = {}) => ({
  position, name, minutes: 15, how: '', tell: '', area: '', numbers: '', direction: '', targets: '', conditions: '',
  source: 'own', drill_id: null, library_session: null, part: '', part_type: null, trak_drill: null, players_kind: null, group_size: null, ...over,
})
const trak = (position: number, id: string, name: string, part: string, part_type: string, minutes = 15) =>
  practice(position, name, { source: 'trak', trak_drill: id, part, part_type, minutes })

/** Trainings, plans, drafts and My drills as the database keeps them; saves, drafts and drills written are kept. */
function database(events: Record<string, unknown>[], start: Record<string, Record<string, unknown>[]> = {},
  { drafts = [] as Record<string, unknown>[], drills = [] as Record<string, unknown>[] } = {}) {
  const plans = new Map(Object.entries(start))
  const saves: Record<string, unknown>[] = []
  const draftsSent: Record<string, unknown>[] = []
  const drillsSent: Record<string, unknown>[] = []
  const eq = (url: URL, key: string) => url.searchParams.get(key)?.match(/^eq\.(.*)$/)?.[1]
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/coach_calendar_events`, ({ request }) => {
      const id = eq(new URL(request.url), 'id')
      return HttpResponse.json(id ? events.filter(e => e.id === id) : events)
    }),
    http.get(`${SUPABASE_URL}/rest/v1/training_plans`, ({ request }) => {
      const id = eq(new URL(request.url), 'event_id')
      const rows = [...plans.keys()].map(event_id => ({ event_id, updated_at: '2026-11-01T10:00:00Z', note: '' }))
      return HttpResponse.json(id ? rows.filter(r => r.event_id === id) : rows)
    }),
    http.get(`${SUPABASE_URL}/rest/v1/training_plan_practices`, ({ request }) => {
      const id = eq(new URL(request.url), 'event_id')
      if (id) return HttpResponse.json(plans.get(id) ?? [])
      return HttpResponse.json([...plans].flatMap(([event_id, rows]) => rows.map(row => ({ event_id, ...row }))))
    }),
    http.get(`${SUPABASE_URL}/rest/v1/training_plan_drafts`, () => HttpResponse.json(drafts)),
    http.post(`${SUPABASE_URL}/rest/v1/training_plan_drafts`, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>
      draftsSent.push(body)
      return HttpResponse.json({ event_id: body.event_id })
    }),
    http.get(`${SUPABASE_URL}/rest/v1/coach_drills`, () => HttpResponse.json(drills)),
    http.post(`${SUPABASE_URL}/rest/v1/coach_drills`, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>
      drillsSent.push(body)
      return HttpResponse.json({ id: `drill-new-${drillsSent.length}`, updated_at: '2026-11-03T10:00:00Z', tell: '', area: '', numbers: '',
        direction: '', targets: '', conditions: '', ...body })
    }),
    rpc('save_training_plan', args => {
      saves.push(args)
      plans.set(String(args.p_event_id), (args.p_practices as Record<string, unknown>[]).map((p, i) => ({ ...p, position: i + 1 })))
      return null
    }),
  )
  return { saves, draftsSent, drillsSent }
}

beforeEach(() => {
  COACH = { id: `coach-341-${++n}` }
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Jürgen Klopp', invite_code: 'ABCD' }]),
    table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16', organization_id: 'org-1' }]),
    table('organizations', [{ id: 'org-1', name: 'Rehearsal FC', logo_url: null }]),
    table('squad_players', [{ id: 'sp-1', coach_user_id: COACH.id, player_name: 'Mohamed Salah', age_group: 'U16', status: 'active' }]),
    table('coach_sessions', []),
    table('session_attendance', []),
    table('event_absences', []),
    table('training_notes', []),
    rpc('feature_on', () => true),
  )
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

const plan = () => within(screen.getByRole('list', { name: 'The plan' })).getAllByRole('listitem').map(li => li.textContent?.replace(/\s+/g, ' ').trim())
const sent = (save: Record<string, unknown>) => (save.p_practices as Record<string, unknown>[]).map(p => `${p.part || p.name}: ${p.name} ${p.minutes}`)
const SAVED = { soon: [trak(1, 'w1', 'Dynamic warm-up', 'Dry warm-up', 'warmup', 10), trak(2, 'r1', 'Rondo 4 v 2', 'Rondo', 'rondo', 15)] }
const session = () => within(screen.getByRole('list', { name: 'Parts of the session' })).getAllByRole('listitem')

/* TRAK-456 (Imad, 16 Nov): a saved plan's Review is the planner's last step, Review & share, on the training page's
   Training plan tab: the match's Review card, a pencil per part. A part changes, goes or comes in the planner, and the
   plan saves whole on Save the plan. */
describe('TRAK-341: a saved plan’s Review page', { timeout: 30_000 }, () => {
  it('shows the whole plan part by part, with a pencil on each, Add a part, and no Change the plan', async () => {
    database([training('soon', onTheMinute(Date.now() + DAY))], SAVED)
    renderApp('/coach/training/soon?tab=plan')
    expect(await screen.findByRole('region', { name: 'Training plan review' })).toBeInTheDocument()
    expect(plan()).toEqual(['Logistics', 'Dry warm-upDynamic warm-up · 10 min', 'RondoRondo 4 v 2 · 15 min'])
    expect(screen.getByRole('button', { name: 'Edit rondo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a part' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change the plan' })).toBeNull()
    expect(screen.getByText('25 of 90 min')).toBeInTheDocument()
  })

  it('a pencil opens that part; Review & share, then Save the plan saves the plan whole', async () => {
    const user = userEvent.setup()
    const { saves } = database([training('soon', onTheMinute(Date.now() + DAY))], SAVED)
    renderApp('/coach/training/soon?tab=plan')
    await user.click(await screen.findByRole('button', { name: 'Edit rondo' }))
    const rondo = await screen.findByRole('region', { name: 'Rondo' })
    // TRAK-392: the old plan's drill still shows as it was saved, beside the Library's.
    expect(within(rondo).getByRole('button', { name: /^Rondo 4 v 2/, pressed: true })).toHaveTextContent('Trak drill')
    await user.click(within(rondo).getByRole('button', { name: /^Four corners/ }))
    await user.click(within(rondo).getByRole('button', { name: '20 min' }))
    await user.click(screen.getByRole('button', { name: 'Review & share' }))
    await user.click(await screen.findByRole('button', { name: 'Save the plan' }))
    await waitFor(() => expect(saves).toHaveLength(1))
    expect(sent(saves[0])).toEqual(['Dry warm-up: Dynamic warm-up 10', 'Rondo: Four corners 20'])
    await waitFor(() => expect(window.location.pathname).toBe('/coach/training'))
  })

  it('Back from a part changes nothing', async () => {
    const user = userEvent.setup()
    const { saves } = database([training('soon', onTheMinute(Date.now() + DAY))], SAVED)
    renderApp('/coach/training/soon?tab=plan')
    await user.click(await screen.findByRole('button', { name: 'Edit dry warm-up' }))
    await screen.findByRole('region', { name: 'Dry warm-up' })
    await user.click(screen.getByRole('button', { name: 'Review & share' }))
    expect(await screen.findByRole('region', { name: 'Training plan review' })).toBeInTheDocument()
    expect(saves).toHaveLength(0)
  })

  it('the bin removes a part; Undo puts it back; a plan with no parts can’t be saved', async () => {
    const user = userEvent.setup()
    const { saves } = database([training('soon', onTheMinute(Date.now() + DAY))], SAVED)
    renderApp('/coach/training/soon?tab=plan')
    await user.click(await screen.findByRole('button', { name: 'Edit dry warm-up' }))
    await screen.findByRole('region', { name: 'Dry warm-up' })
    await user.click(screen.getAllByRole('button', { name: 'Remove Dry warm-up' })[0])
    await waitFor(() => expect(session()).toHaveLength(1))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(session()).toHaveLength(2))
    expect(saves).toHaveLength(0)

    cleanup()
    const one = database([training('one', onTheMinute(Date.now() + DAY))], { one: [trak(1, 'r1', 'Rondo 4 v 2', 'Rondo', 'rondo')] })
    renderApp('/coach/training/one?tab=plan')
    await user.click(await screen.findByRole('button', { name: 'Edit rondo' }))
    await user.click((await screen.findAllByRole('button', { name: 'Remove Rondo' }))[0])
    await user.click(await screen.findByRole('button', { name: 'Save the plan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/part/)
    expect(one.saves).toHaveLength(0)
  })

  it('Add a part picks one, opens it with its usual drill, and Save the plan saves it at the end', async () => {
    const user = userEvent.setup()
    const { saves } = database([training('soon', onTheMinute(Date.now() + DAY))], SAVED)
    renderApp('/coach/training/soon?tab=plan')
    await user.click(await screen.findByRole('button', { name: 'Add a part' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add a part' })
    await user.click(within(sheet).getByRole('button', { name: /^Game/ }))
    await user.click(within(sheet).getByRole('button', { name: 'Add part' }))
    expect(within(await screen.findByRole('region', { name: 'Game' })).getByRole('button', { name: /^Pass then score/, pressed: true })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Review & share' }))
    await user.click(await screen.findByRole('button', { name: 'Save the plan' }))
    await waitFor(() => expect(saves).toHaveLength(1))
    expect(sent(saves[0])).toEqual(['Dry warm-up: Dynamic warm-up 10', 'Rondo: Rondo 4 v 2 15', 'Game: Pass then score 25'])
  })

  it('a plan from before parts shows each name once', async () => {
    database([training('old', onTheMinute(Date.now() + DAY))], { old: [practice(1, 'Technique'), practice(2, 'Progressing to the target', { minutes: 20 })] })
    renderApp('/coach/training/old?tab=plan')
    await screen.findByRole('region', { name: 'Training plan review' })
    expect(plan()).toEqual(['Logistics', 'Technique15 min', 'Progressing to the target20 min'])
  })
})

describe('TRAK-341: the planner’s Cancel', { timeout: 30_000 }, () => {
  it('on the first part, with nothing changed, goes back to Training, never out of Trak', async () => {
    const user = userEvent.setup()
    database([training('soon', onTheMinute(Date.now() + DAY))])
    renderApp('/coach/training/soon/plan')
    await screen.findByRole('region', { name: 'Dry warm-up' })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(window.location.pathname).toBe('/coach/training'))
  })
})
