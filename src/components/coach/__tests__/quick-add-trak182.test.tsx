import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { pickTime } from '../../../../tests/support/arc-pickers'
import { localTodayISO, toInstant } from '@/lib/event-time'

/**
 * TRAK-182 part 8 (Imad's plan 8a–8g): the coach's "+" opens a menu, then the
 * shortest form that makes a real record, then a check, and back to "+".
 * New event saves a draft here; Log match continues on the log's Squad step;
 * today's started training offers its register. Escape steps back one state.
 */

const COACH = { id: 'coach-quick' }
const EVENTS = `${SUPABASE_URL}/rest/v1/coach_calendar_events`
let inserted: Record<string, unknown>[]
let rows: Record<string, unknown>[]

beforeEach(() => {
  signInAs(COACH)
  inserted = []
  rows = []
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    http.get(EVENTS, () => HttpResponse.json(rows)),
    http.post(EVENTS, async ({ request }) => {
      inserted.push(...await request.json() as Record<string, unknown>[])
      return HttpResponse.json([{ id: 'new-1' }], { status: 201 })
    }),
    table('coach_sessions', []),
    table('squad_players', []),
    table('session_attendance', []),
    table('event_absences', []),
    rpc('feature_on', () => true),
  )
})
afterEach(() => { server.events.removeAllListeners() })

async function openMenu() {
  renderApp('/coach/schedule')
  const plus = await screen.findByRole('button', { name: 'Quick add' })
  expect(plus).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(plus)
  return screen.findByRole('menu', { name: 'Quick add' })
}

describe('TRAK-182: the quick-add button', { timeout: 20_000 }, () => {
  it('opens a menu that arrow keys move through, and Escape returns to the "+"', async () => {
    const menu = await openMenu()
    const items = within(menu).getAllByRole('menuitem').map(i => i.textContent)
    expect(items).toEqual(['Log training', 'Log match', 'New event'])
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'Log training' })).toHaveFocus())
    await userEvent.keyboard('{ArrowDown}')
    expect(within(menu).getByRole('menuitem', { name: 'Log match' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(within(menu).getByRole('menuitem', { name: 'New event' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Quick add' })).toHaveFocus())
    // It fades out (0.1 s), then it's gone.
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('New event saves a draft families never see, then shows the check', async () => {
    const menu = await openMenu()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'New event' }))
    const form = await screen.findByRole('dialog', { name: 'New event' })
    await userEvent.click(within(form).getByRole('button', { name: 'Save draft' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Pick a start time')
    expect(inserted).toEqual([])
    await pickTime(userEvent, 'Start', '17:30')
    await userEvent.click(within(form).getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(inserted).toHaveLength(1))
    expect(inserted[0]).toMatchObject({ coach_user_id: COACH.id, event_type: 'training', published: false, start_time: '17:30:00', event_date: localTodayISO() })
    expect(await screen.findByText('Draft saved. Publish it from Schedule.')).toBeInTheDocument()
    // Then back to "+".
    expect(await screen.findByRole('button', { name: 'Quick add' }, { timeout: 3000 })).toBeInTheDocument()
  })

  it('a match draft needs its opponent, and Escape steps back to the menu', async () => {
    const menu = await openMenu()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'New event' }))
    const form = await screen.findByRole('dialog', { name: 'New event' })
    await userEvent.click(within(form).getByRole('button', { name: 'Match' }))
    await pickTime(userEvent, 'Kickoff', '16:00')
    await userEvent.click(within(form).getByRole('button', { name: 'Save draft' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Add the opponent')
    await userEvent.keyboard('{Escape}')
    expect(await screen.findByRole('menu', { name: 'Quick add' })).toBeInTheDocument()
    expect(inserted).toEqual([])
  })

  it('More details opens Schedule\'s full form with what was typed', async () => {
    const menu = await openMenu()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'New event' }))
    const form = await screen.findByRole('dialog', { name: 'New event' })
    await userEvent.click(within(form).getByRole('button', { name: 'Match' }))
    await userEvent.type(within(form).getByLabelText('Opponent'), 'Synthetic Rovers')
    await userEvent.click(within(form).getByRole('button', { name: 'More details' }))
    const sheet = await screen.findByRole('dialog', { name: 'New event' }, { timeout: 3000 })
    await waitFor(() => expect(within(sheet).getByLabelText('Opponent')).toHaveValue('Synthetic Rovers'))
    expect(inserted).toEqual([])
  })

  it('Log match takes the opponent and score, then continues on the log\'s Squad step', async () => {
    const menu = await openMenu()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Log match' }))
    const form = await screen.findByRole('dialog', { name: 'Log a match' })
    await userEvent.click(within(form).getByRole('button', { name: 'Continue' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Add the opponent and the score.')
    await userEvent.type(within(form).getByLabelText('Opponent'), 'Synthetic United')
    await userEvent.click(within(form).getByRole('button', { name: 'Away' }))
    await userEvent.type(within(form).getByLabelText('Our score'), '2')
    await userEvent.type(within(form).getByLabelText('Their score'), '1')
    await userEvent.click(within(form).getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('Squad'))
    await userEvent.click(screen.getByRole('button', { name: 'Back to Match' }))
    expect(screen.getByPlaceholderText('Opponent name')).toHaveValue('Synthetic United')
    const [us, them] = screen.getAllByPlaceholderText('0')
    expect(us).toHaveValue('2')
    expect(them).toHaveValue('1')
  })

  it("offers today's started training's register, which opens on Schedule", async () => {
    const today = localTodayISO()
    rows = [{
      id: 'today-1', coach_user_id: COACH.id, title: 'Finishing', event_type: 'training', published: true, status: 'scheduled',
      event_date: today, start_time: '00:00:00', starts_at: toInstant(today, '00:00'), ends_at: null, venue: null, opponent: null,
      notes: null, source: 'manual', meet_time: null, kit: null, home_away: null, cancel_reason: null,
    }]
    const menu = await openMenu()
    const register = await within(menu).findByRole('menuitem', { name: 'Take register · Finishing' })
    await userEvent.click(register)
    expect(await screen.findByRole('dialog', { name: 'Take register' }, { timeout: 3000 })).toBeInTheDocument()
  })
})
