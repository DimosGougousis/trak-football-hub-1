/**
 * TRAK-456 (Imad, 16 Nov): a training's page is built like a match's. Arc's Page header over three tabs, Logistics,
 * Training plan and After training; the planner's last step is Review & share, the plan's parts in the match's Review
 * card with a pencil each, and Share sends the training's details to the squad's WhatsApp group, never the plan (the plan
 * is the coach's only). Plan session opens the Training plan tab; the old addresses land on their tab. Test people are
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
let COACH = { id: 'coach-456' }
function training(id: string, start: number, over: Record<string, unknown> = {}) {
  return {
    id, coach_user_id: COACH.id, squad: 'U16', title: `Training ${id}`, event_type: 'training', published: true, status: 'scheduled',
    starts_at: new Date(start).toISOString(), ends_at: new Date(start + 90 * MINUTE).toISOString(),
    event_date: ymd(start), start_time: `${hm(start)}:00`, venue: 'Pitch 2', family_note: null, kit: null, meet_time: null, ...over,
  }
}
const trak = (position: number, id: string, name: string, part: string, part_type: string, minutes = 15) => ({
  position, name, minutes, how: '', tell: '', area: '', numbers: '', direction: '', targets: '', conditions: '',
  source: 'trak', drill_id: null, library_session: null, part, part_type, trak_drill: id, players_kind: null, group_size: null,
})
const SAVED = [trak(1, 'w1', 'Dynamic warm-up', 'Dry warm-up', 'warmup', 10), trak(2, 'r1', 'Rondo 4 v 2', 'Rondo', 'rondo', 15)]

/** Trainings, plans and registers as the database keeps them. */
function database(events: Record<string, unknown>[], plans: Record<string, Record<string, unknown>[]> = {}, registers: Record<string, string> = {}) {
  const eq = (url: URL, key: string) => url.searchParams.get(key)?.match(/^eq\.(.*)$/)?.[1]
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/coach_calendar_events`, ({ request }) => {
      const id = eq(new URL(request.url), 'id')
      return HttpResponse.json(id ? events.filter(e => e.id === id) : events)
    }),
    http.get(`${SUPABASE_URL}/rest/v1/training_plans`, ({ request }) => {
      const id = eq(new URL(request.url), 'event_id')
      const rows = Object.keys(plans).map(event_id => ({ event_id, updated_at: '2026-11-01T10:00:00Z', note: '' }))
      return HttpResponse.json(id ? rows.filter(r => r.event_id === id) : rows)
    }),
    http.get(`${SUPABASE_URL}/rest/v1/training_plan_practices`, ({ request }) => {
      const id = eq(new URL(request.url), 'event_id')
      if (id) return HttpResponse.json(plans[id] ?? [])
      return HttpResponse.json(Object.entries(plans).flatMap(([event_id, rows]) => rows.map(row => ({ event_id, ...row }))))
    }),
    http.get(`${SUPABASE_URL}/rest/v1/coach_sessions`, () =>
      HttpResponse.json(Object.entries(registers).map(([event_id, id]) => ({ id, event_id })))),
    http.post(`${SUPABASE_URL}/rest/v1/training_plan_drafts`, async ({ request }) =>
      HttpResponse.json({ event_id: (await request.json() as Record<string, unknown>).event_id })),
  )
}

beforeEach(() => {
  COACH = { id: `coach-456-${++n}` }
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Jürgen Klopp', invite_code: 'ABCD' }]),
    table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16', organization_id: 'org-1' }]),
    table('organizations', [{ id: 'org-1', name: 'Rehearsal FC', logo_url: null }]),
    table('squad_players', [
      { id: 'sp-1', coach_user_id: COACH.id, player_name: 'Mohamed Salah', age_group: 'U16', status: 'active' },
      { id: 'sp-2', coach_user_id: COACH.id, player_name: 'Virgil van Dijk', age_group: 'U16', status: 'active' },
    ]),
    table('session_attendance', [{ squad_player_id: 'sp-1', session_id: 'session-done', status: 'present' }]),
    table('event_absences', []),
    table('coach_drills', []),
    table('coach_drill_bookmarks', []),
    table('training_notes', []),
    table('training_plan_drafts', []),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('feature_on', () => true),
  )
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const tabs = () => within(screen.getByRole('tablist', { name: 'This training' })).getAllByRole('tab')
const selected = () => tabs().find(tab => tab.getAttribute('aria-selected') === 'true')?.textContent

describe('TRAK-456: a training’s page is laid out like a match’s', { timeout: 30_000 }, () => {
  it('has the match page’s header and three tabs, Logistics, Training plan and After training, and no step strip', async () => {
    database([training('soon', onTheMinute(Date.now() + DAY))], { soon: SAVED })
    renderApp('/coach/training/soon')
    expect(await screen.findByRole('heading', { level: 1, name: 'Training soon' })).toBeInTheDocument()
    await waitFor(() => expect(tabs().map(tab => tab.textContent)).toEqual([expect.stringMatching(/^Logistics/), 'Training plan', 'After training']))
    expect(selected()).toMatch(/^Logistics/)
    // Logistics: the event as the match's tab shows it, with Edit as a pencil.
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('Pitch 2')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Edit event' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Training loop' })).toBeNull()
  })

  it('Plan session on Training opens the page on its Training plan tab', async () => {
    const user = userEvent.setup()
    database([training('soon', onTheMinute(Date.now() + DAY))])
    renderApp('/coach/training')
    await user.click(await screen.findByRole('button', { name: 'Plan session' }))
    await waitFor(() => expect(`${window.location.pathname}${window.location.search}`).toBe('/coach/training/soon?tab=plan'))
    await waitFor(() => expect(selected()).toBe('Training plan'))
    expect(await screen.findByRole('region', { name: 'Dry warm-up' })).toBeInTheDocument()
  })

  it('the plan’s last step is Review & share: each part at a glance with its pencil, which opens that part', async () => {
    const user = userEvent.setup()
    database([training('soon', onTheMinute(Date.now() + DAY))], { soon: SAVED })
    renderApp('/coach/training/soon?tab=plan')
    const steps = await screen.findByRole('navigation', { name: 'Planning steps' })
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('Review & share')
    const review = screen.getByRole('region', { name: 'Training plan review' })
    const parts = within(within(review).getByRole('list', { name: 'The plan' })).getAllByRole('listitem').map(li => li.textContent)
    expect(parts).toEqual([expect.stringContaining('Logistics'), expect.stringContaining('Dry warm-up'), expect.stringContaining('Rondo')])
    expect(parts[2]).toContain('Rondo 4 v 2')
    expect(within(review).getByRole('button', { name: 'Edit dry warm-up' })).toBeInTheDocument()
    await user.click(within(review).getByRole('button', { name: 'Edit rondo' }))
    expect(await screen.findByRole('region', { name: 'Rondo' })).toBeInTheDocument()
  })

  it('Share sends the training’s details to WhatsApp, and never the plan’s drills', async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    database([training('soon', onTheMinute(Date.now() + DAY))], { soon: SAVED })
    renderApp('/coach/training/soon?tab=plan')
    const review = await screen.findByRole('region', { name: 'Training plan review' })
    await user.click(await within(review).findByRole('button', { name: 'Share' }))
    expect(open).toHaveBeenCalledTimes(1)
    const url = String(open.mock.calls[0][0])
    expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/)
    const text = decodeURIComponent(url.split('?text=')[1])
    expect(text).toContain('TRAINING | U16 Training')
    expect(text).toContain('Pitch 2')
    expect(text).toContain('https://trakfootball.com/event/soon')
    for (const drill of ['Dynamic warm-up', 'Rondo', 'Dry warm-up']) expect(text).not.toContain(drill)
  })

  it('After training has Who’s here, the register; once it’s over, Notes too', async () => {
    database([
      training('today', onTheMinute(Date.now() - 20 * MINUTE)),
      training('done', onTheMinute(Date.now() - DAY)),
    ], { today: SAVED, done: SAVED }, { done: 'session-done' })
    renderApp('/coach/training/today?tab=after')
    await waitFor(() => expect(selected()).toBe('After training'))
    expect(await screen.findByRole('button', { name: 'Mohamed Salah: present' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save and close' })).toBeNull()

    cleanup()
    renderApp('/coach/training/done?tab=after')
    expect(await screen.findByText('1 of 2 here.')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Would you run this session again?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save and close' })).toBeInTheDocument()
  })

  it('the old Plan session and Who’s here addresses land on their tabs', async () => {
    database([training('soon', onTheMinute(Date.now() + DAY))], { soon: SAVED })
    renderApp('/coach/training/soon/plan')
    await waitFor(() => expect(`${window.location.pathname}${window.location.search}`).toBe('/coach/training/soon?tab=plan'))
    await waitFor(() => expect(selected()).toBe('Training plan'))

    cleanup()
    renderApp('/coach/training/soon/here')
    await waitFor(() => expect(`${window.location.pathname}${window.location.search}`).toBe('/coach/training/soon?tab=after'))
    await waitFor(() => expect(selected()).toBe('After training'))
  })
})
