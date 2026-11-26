/**
 * TRAK-339 (Training redo 1/5, spec TRAK-338, 2 Nov prototype): Training home laid out like Matches. The Next training
 * card shows one training and its next action. TRAK-584 (Kostas, 25 Nov): in the Next match card's style: the badge as
 * Matches', one split button (Plan session, Continue plan, View plan, Who's here, Notes) with the rest behind its chevron,
 * the countdown always; after it, Notes ("Would you run this session again?") in a sheet, saved or skipped. Upcoming trainings is a row; Past trainings is a button at the bottom that opens
 * its own page, where a plan can be copied into a training coming up. Test people are named after footballers.
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
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const onTheMinute = (ms: number) => Math.ceil(ms / MINUTE) * MINUTE
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const hm = (ms: number) => new Date(ms).toISOString().slice(11, 16)

let n = 0
let COACH = { id: 'coach-339' }
function training(id: string, start: number, over: Record<string, unknown> = {}) {
  return {
    id, coach_user_id: COACH.id, squad: 'U16', title: `Training ${id}`, event_type: 'training', published: true, status: 'scheduled',
    starts_at: new Date(start).toISOString(), ends_at: new Date(start + 90 * MINUTE).toISOString(),
    event_date: ymd(start), start_time: `${hm(start)}:00`, venue: 'Pitch 2', family_note: null, ...over,
  }
}
const practice = (position: number, name: string, over: Record<string, unknown> = {}) => ({
  position, name, minutes: 15, how: '', tell: '', area: '', numbers: '', direction: '', targets: '', conditions: '',
  source: 'own', drill_id: null, library_session: null, ...over,
})

/** Trainings, plans, registers (completed sessions by event) and Notes as the database keeps them. Notes written are
 *  kept for the test to read. */
function database(events: Record<string, unknown>[], plans: Record<string, Record<string, unknown>[]> = {},
  registers: Record<string, string> = {}, startNotes: Record<string, unknown>[] = []) {
  const notes = [...startNotes]
  const written: Record<string, unknown>[] = []
  // One row by eq.<id>; every row asked for by in.(…); everything when unfiltered.
  const eq = (url: URL, key: string) => url.searchParams.get(key)?.match(/^eq\.(.*)$/)?.[1]
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/coach_calendar_events`, ({ request }) => {
      const id = eq(new URL(request.url), 'id')
      return HttpResponse.json(id ? events.filter(e => e.id === id) : events)
    }),
    http.get(`${SUPABASE_URL}/rest/v1/training_plans`, ({ request }) => {
      const id = eq(new URL(request.url), 'event_id')
      const rows = Object.keys(plans).map(event_id => ({ event_id, updated_at: '2026-11-01T10:00:00Z' }))
      return HttpResponse.json(id ? rows.filter(r => r.event_id === id) : rows)
    }),
    http.get(`${SUPABASE_URL}/rest/v1/training_plan_practices`, ({ request }) => {
      const id = eq(new URL(request.url), 'event_id')
      if (id) return HttpResponse.json(plans[id] ?? [])
      return HttpResponse.json(Object.entries(plans).flatMap(([event_id, rows]) => rows.map(row => ({ event_id, ...row }))))
    }),
    http.get(`${SUPABASE_URL}/rest/v1/coach_sessions`, () =>
      HttpResponse.json(Object.entries(registers).map(([event_id, id]) => ({ id, event_id })))),
    http.get(`${SUPABASE_URL}/rest/v1/training_notes`, () => HttpResponse.json(notes)),
    http.post(`${SUPABASE_URL}/rest/v1/training_notes`, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>
      written.push(body)
      notes.push(body)
      return HttpResponse.json({ event_id: body.event_id })
    }),
  )
  return written
}

beforeEach(() => {
  COACH = { id: `coach-339-${++n}` }
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Jürgen Klopp', invite_code: 'ABCD' }]),
    table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16', organization_id: 'org-1' }]),
    table('organizations', [{ id: 'org-1', name: 'Rehearsal FC', logo_url: null }]),
    table('squad_players', [
      { id: 'sp-1', coach_user_id: COACH.id, player_name: 'Mohamed Salah', age_group: 'U16', status: 'active' },
      { id: 'sp-2', coach_user_id: COACH.id, player_name: 'Virgil van Dijk', age_group: 'U16', status: 'active' },
    ]),
    table('session_attendance', [{ session_id: 'session-done', squad_player_id: 'sp-1', status: 'present' },
      { session_id: 'session-done', squad_player_id: 'sp-2', status: 'present' }]),
    table('event_absences', []),
    table('coach_drills', []),
    table('training_plan_drafts', []),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('feature_on', () => true),
  )
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

/** TRAK-584: the card is the "Next training" region, as Matches' is "Next match"; the training's name is under the label. */
async function nextCard(title: string) {
  const card = await screen.findByRole('region', { name: 'Next training' }, { timeout: 5000 })
  await within(card).findByText(title, { selector: 'p' }, { timeout: 5000 })
  return card
}
const menu = async (user: ReturnType<typeof userEvent.setup>, card: HTMLElement, main: string) => {
  await user.click(within(card).getByRole('button', { name: `${main} more actions` }))
  const items = (await screen.findAllByRole('menuitem')).map(item => item.textContent)
  await user.keyboard('{Escape}')
  return items
}

describe('TRAK-339: the Next training card', { timeout: 30_000 }, () => {
  // TRAK-584 (Kostas, 25 Nov): in the Next match card's style. A label over the name, the badge as Matches', one split
  // button, the countdown; no loop stepper and no message to players on the card (it's edited in Events).
  it('not planned: Plan not written, and Plan session goes straight to the planner; Use a past plan and Logistics behind it', async () => {
    const user = userEvent.setup()
    database([training('soon', onTheMinute(Date.now() + 2 * DAY), { title: 'Pressing triggers', family_note: 'Bring shin pads.' }),
      training('later', onTheMinute(Date.now() + 4 * DAY))])
    renderApp('/coach/training')
    const card = await nextCard('Pressing triggers')
    // TRAK-422 (Kostas, 13 Nov): the page has the one coach page title, "Training", like every coach page.
    expect(screen.getByRole('heading', { level: 1, name: 'Training' })).not.toHaveClass('sr-only')
    expect(within(card).getByRole('heading', { level: 2, name: 'Next training' })).toBeInTheDocument()
    expect(within(card).getByText('Plan not written')).toBeInTheDocument()
    expect(within(card).getByText(/Pitch 2 · 90 min/)).toBeInTheDocument()
    expect(within(card).queryByRole('list', { name: 'Where this training is' })).toBeNull()
    expect(within(card).queryByText('Bring shin pads.')).toBeNull()
    expect(within(card).getByRole('timer', { name: 'Starts in' })).toBeInTheDocument()
    expect(await menu(user, card, 'Plan session')).toEqual(['Use a past plan', 'Logistics'])
    await user.click(within(card).getByRole('button', { name: 'Plan session' }))
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/coach/training/soon?tab=plan'))
    expect(screen.queryByRole('dialog', { name: 'How do you want to plan it?' })).toBeNull()
  })

  it('planned: Plan ready, View plan opens the plan, Logistics the training’s first tab', async () => {
    const user = userEvent.setup()
    database([training('soon', onTheMinute(Date.now() + 2 * DAY))], { soon: [practice(1, 'Rondo 4 v 2')] })
    renderApp('/coach/training')
    const card = await nextCard('Training soon')
    expect(await within(card).findByText('Plan ready')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Plan session' })).toBeNull()
    await user.click(within(card).getByRole('button', { name: 'View plan more actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Logistics' }))
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/coach/training/soon?tab=logistics'))
    window.history.back()
    await waitFor(() => expect(window.location.pathname).toBe('/coach/training'))
    await user.click(within(await nextCard('Training soon')).getByRole('button', { name: 'View plan' }))
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/coach/training/soon?tab=plan'))
  })

  it('later today, planned: still Plan ready and View plan, as a match keeps Plan shared until kick-off', async () => {
    database([training('today', onTheMinute(Date.now() + 2 * MINUTE))], { today: [practice(1, 'Rondo 4 v 2')] })
    renderApp('/coach/training')
    const card = await nextCard('Training today')
    expect(await within(card).findByText('Plan ready')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'View plan' })).toBeInTheDocument()
  })

  it('on now: Started, and Who’s here opens the register; View plan and Logistics behind it', async () => {
    const user = userEvent.setup()
    database([training('today', onTheMinute(Date.now() - 20 * MINUTE))], { today: [practice(1, 'Rondo 4 v 2')] })
    renderApp('/coach/training')
    const card = await nextCard('Training today')
    expect(within(card).getByText('Started', { selector: 'span:not([aria-hidden])' })).toBeInTheDocument()
    expect(await menu(user, card, 'Who’s here')).toEqual(['View plan', 'Logistics'])
    // TRAK-342: Who's here is its own page.
    await user.click(within(card).getByRole('button', { name: 'Who’s here' }))
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/coach/training/today?tab=after'))
    expect(await screen.findByRole('button', { name: 'Mohamed Salah: present' })).toBeInTheDocument()
  })

  it('after the training: Finished; Notes opens in a sheet, and Save and close keeps the answer and moves the card on', async () => {
    const user = userEvent.setup()
    const written = database([
      training('done', onTheMinute(Date.now() - 3 * HOUR), { title: 'Defending the box' }),
      training('next', onTheMinute(Date.now() + 2 * DAY), { title: 'Counter-attacks' }),
    ], { done: [practice(1, 'Rondo 4 v 2')] }, { done: 'session-done' })
    renderApp('/coach/training')
    const card = await nextCard('Defending the box')
    expect(within(card).getAllByText('Finished').length).toBeGreaterThan(0)
    expect(within(card).queryByText('Would you run this session again?')).toBeNull()
    expect(await menu(user, card, 'Notes')).toEqual(['View plan', 'Logistics'])
    await user.click(within(card).getByRole('button', { name: 'Notes' }))
    const sheet = await screen.findByRole('dialog', { name: 'Notes' })
    expect(within(sheet).getByText('Would you run this session again?')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Yes, with changes' }))
    await user.type(within(sheet).getByLabelText('A note for next time'), '  Rondo grids too small. ')
    await user.click(within(sheet).getByRole('button', { name: 'Save and close' }))
    await waitFor(() => expect(written).toEqual([{ event_id: 'done', again: 'changes', note: 'Rondo grids too small.' }]))
    expect(await screen.findByText('Defending the box is closed.')).toBeInTheDocument()
    expect(await nextCard('Counter-attacks')).toBeInTheDocument()
  })

  it('Skip and close keeps a row with no answer, so the card moves on all the same', async () => {
    const user = userEvent.setup()
    const written = database([training('done', onTheMinute(Date.now() - 3 * HOUR), { title: 'Defending the box' })])
    renderApp('/coach/training')
    const card = await nextCard('Defending the box')
    // No plan, so nothing to view behind Notes; nor Review today's plan in the sheet.
    expect(await menu(user, card, 'Notes')).toEqual(['Logistics'])
    await user.click(within(card).getByRole('button', { name: 'Notes' }))
    const sheet = await screen.findByRole('dialog', { name: 'Notes' })
    expect(within(sheet).queryByRole('button', { name: 'Review today’s plan' })).toBeNull()
    await user.click(within(sheet).getByRole('button', { name: 'Skip and close' }))
    await waitFor(() => expect(written).toEqual([{ event_id: 'done', again: null, note: '' }]))
    expect(await screen.findByText('No training coming up')).toBeInTheDocument()
  })

  it('a training that ended over a day ago doesn’t wait for Notes: the card shows the next one', async () => {
    database([training('old', onTheMinute(Date.now() - 2 * DAY)), training('next', onTheMinute(Date.now() + DAY))])
    renderApp('/coach/training')
    const card = await nextCard('Training next')
    expect(within(card).queryByText('Training old')).toBeNull()
  })

  it('Upcoming trainings: every one coming up, soonest first, each with its badge', async () => {
    const now = Date.now()
    database([training('later', onTheMinute(now + 5 * DAY), { title: 'Finishing' }), training('soon', onTheMinute(now + 2 * DAY), { title: 'Pressing' })],
      { later: [practice(1, 'Rondo 4 v 2')] })
    renderApp('/coach/training')
    const row = (await screen.findAllByRole('region', { name: 'Upcoming trainings' }))[0]
    const links = within(row).getAllByRole('link')
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/coach/training/soon', '/coach/training/later'])
    expect(links[0]).toHaveTextContent('Plan not written')
    await waitFor(() => expect(links[1]).toHaveTextContent('Plan ready'))
  })
})

describe('TRAK-339: Past trainings', { timeout: 30_000 }, () => {
  it('a button at the bottom opens them: newest first, each a card as Upcoming trainings\u2019 that opens its training (TRAK-591)', async () => {
    const user = userEvent.setup()
    const now = Date.now()
    database([
      training('older', onTheMinute(now - 9 * DAY), { title: 'First session' }),
      training('done', onTheMinute(now - 3 * DAY), { title: 'Pressing' }),
      training('next', onTheMinute(now + DAY), { title: 'Counter-attacks' }),
    ], { done: [practice(1, 'Rondo 4 v 2'), practice(2, 'Counter-pressing 5 v 3', { minutes: 25 })] }, { done: 'session-done' },
    [{ event_id: 'done', again: 'yes', note: 'Keep the five-second rule.' }])
    renderApp('/coach/training')
    const button = await screen.findByRole('button', { name: /^Past trainings/ })
    await waitFor(() => expect(button).toHaveTextContent('2'))
    await user.click(button)
    await waitFor(() => expect(window.location.pathname).toBe('/coach/training/past'))
    const list = await screen.findByRole('list', { name: 'Past trainings' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Pressing')
    // Kostas, 26 Nov: who came is the badge, "2 attended"; with no register, "Finished".
    await waitFor(() => expect(within(items[0]).getByText('2 attended').className).toMatch(/\bborder-success\b/))
    expect(within(items[1]).getByText('Finished')).toBeInTheDocument()
    // The plan and the Notes are on the training's page, not the row; no buttons on a row.
    expect(items[0]).not.toHaveTextContent(/practices|Run it again|five-second/)
    expect(within(list).queryAllByRole('button')).toHaveLength(0)

    // The search still finds a training by its note.
    await user.type(screen.getByRole('searchbox', { name: 'Search past trainings' }), 'five-second')
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1))
    // The whole card opens the training.
    await user.click(within(list).getByRole('link', { name: /Pressing/ }))
    await waitFor(() => expect(window.location.pathname).toBe('/coach/training/done'))
  })

  it('with none yet, says so', async () => {
    database([training('next', onTheMinute(Date.now() + DAY))])
    renderApp('/coach/training/past')
    expect(await screen.findByText('No past trainings yet')).toBeInTheDocument()
  })
})
