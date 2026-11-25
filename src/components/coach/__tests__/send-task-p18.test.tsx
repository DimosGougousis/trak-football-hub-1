import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc } from '../../../../tests/msw/supabase'
import { dateOffered, pickDate } from '../../../../tests/support/arc-pickers'
import { localTodayISO } from '@/lib/event-time'

/**
 * Coach–player P18: from the coach's "+", Send a task to the whole squad or one player on it, asking for Got it, Done
 * or Ready for review by a day. Only where the academy's tasks switch is on; a player waiting for consent isn't
 * offered; the coach writes what to do (80 characters at most) and picks a day from today on. Test people are named
 * after footballers.
 */

// A new id per test: the app's query cache is keyed by user, so a shared id would carry one test's switch into the next.
let n = 0
let COACH = { id: 'coach-p18' }
let tasksOn: boolean
let sent: Record<string, unknown>[]

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}

beforeEach(() => {
  COACH = { id: `coach-p18-${++n}` }
  signInAs(COACH)
  tasksOn = true
  sent = []
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Otto Rehhagel', invite_code: 'ABCD' }]),
    table('coach_calendar_events', []), table('coach_sessions', []), table('session_attendance', []), table('event_absences', []),
    table('coach_assessments', []), table('coach_details', []),
    table('squad_players', [
      { id: 'sp-1', coach_user_id: COACH.id, player_name: 'Angelos Charisteas', age_group: 'U16', status: 'active', linked_player_id: 'u-1' },
      { id: 'sp-2', coach_user_id: COACH.id, player_name: 'Traianos Dellas', age_group: 'U16', status: 'active', linked_player_id: 'u-2' },
      { id: 'sp-3', coach_user_id: COACH.id, player_name: 'Stelios Giannakopoulos', age_group: 'U16', status: 'released', linked_player_id: 'u-3' },
    ]),
    rpc('coach_squad_players_consent_pending', () => ['sp-2']),
    rpc('feature_on', ({ p_feature }) => p_feature === 'events' || (p_feature === 'tasks' && tasksOn)),
    rpc('create_task', args => { sent.push(args); return 'task-1' }),
  )
})

async function openSendTask() {
  renderApp('/coach/schedule')
  await userEvent.click(await screen.findByRole('button', { name: 'Quick add' }))
  const menu = await screen.findByRole('menu', { name: 'Quick add' })
  await userEvent.click(await within(menu).findByRole('menuitem', { name: 'Send a task' }))
  return screen.findByRole('textbox', { name: 'What to do' })
}

describe('Coach–player P18: Send a task from "+"', { timeout: 20_000 }, () => {
  it('is not offered where the academy\'s tasks switch is off', async () => {
    tasksOn = false
    renderApp('/coach/schedule')
    await userEvent.click(await screen.findByRole('button', { name: 'Quick add' }))
    const menu = await screen.findByRole('menu', { name: 'Quick add' })
    await waitFor(() => expect(within(menu).getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Assess player', 'New event']))
  })

  it('sends a task to the whole squad, due by the day picked', async () => {
    const what = await openSendTask()
    await userEvent.type(what, 'Bring your shin pads')
    await userEvent.click(within(screen.getByRole('group', { name: 'They answer' })).getByRole('button', { name: 'Done' }))
    const day = addDays(localTodayISO(), 3)
    await pickDate(userEvent.setup(), 'Due', day)
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(sent).toEqual([{ p_squad: 'U16', p_squad_player_id: null, p_answer_kind: 'done', p_title: 'Bring your shin pads', p_due_on: day }]))
    expect(await screen.findByText('Sent to U16')).toBeInTheDocument()
  })

  it('sends a task to one player, and only offers active players with consent', async () => {
    await openSendTask()
    await userEvent.click(screen.getByRole('combobox', { name: 'To' }))
    const options = (await screen.findAllByRole('option')).map(o => o.textContent)
    expect(options).toEqual(['Whole squad', 'Angelos Charisteas'])
    await userEvent.click(screen.getByRole('option', { name: 'Angelos Charisteas' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'What to do' }), 'Your first touch')
    await pickDate(userEvent.setup(), 'Due', localTodayISO())
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(sent).toEqual([{ p_squad: 'U16', p_squad_player_id: 'sp-1', p_answer_kind: 'got_it', p_title: 'Your first touch', p_due_on: localTodayISO() }]))
    expect(await screen.findByText('Sent to Angelos Charisteas')).toBeInTheDocument()
  })

  it('asks for what to do and a day before sending, and keeps the words to 80 characters', async () => {
    const what = await openSendTask()
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Write what to do.')
    await userEvent.type(what, 'x'.repeat(85))
    expect(what).toHaveValue('x'.repeat(80))
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Select the day it\'s due.')
    expect(sent).toEqual([])
  })

  it('offers no day before today', async () => {
    await openSendTask()
    const user = userEvent.setup()
    expect(await dateOffered(user, 'Due', addDays(localTodayISO(), -1))).toBe(false)
    expect(await dateOffered(user, 'Due', localTodayISO())).toBe(true)
  })

  it('says so when the database refuses, and keeps the form', async () => {
    server.use(rpc('create_task', () => ({ status: 403, body: { code: '42501', message: 'This squad isn\'t one of yours' } })))
    const what = await openSendTask()
    await userEvent.type(what, 'Read the plan')
    await pickDate(userEvent.setup(), 'Due', addDays(localTodayISO(), 1))
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn\'t send it. Try again.')
    expect(what).toHaveValue('Read the plan')
  })
})
