/**
 * TRAK-580 (coach–player P03): when the coach changes a published event, the database asks the player to see it (a
 * "seen" task, TRAK-578). Home's week says "Changed" on that event until the player opens it, on any of their devices;
 * opening it (Details on Home, or the event's page) records seen once per change, with no button. The event page says
 * when the coach changed it, even on a device that never saw the old version. Test people are named after footballers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { rpc, rpcRows, table } from '../../../../tests/msw/supabase'
import { unseenEventChanges, type MyTask } from '@/lib/tasks'

let n = 0
let PLAYER = { id: 'seen-player' }
let answered: boolean
let outdated: boolean
let seenCalls: string[]
const today = new Date().toLocaleDateString('en-CA')
const TRAINING = { id: 'tuesday', event_type: 'training', title: 'Finishing', event_date: today, start_time: '23:30:00',
  status: 'scheduled', sequence: 3, updated_at: '2026-11-26T09:00:00Z' }
const seenTask = (over: Partial<MyTask> = {}): MyTask => ({ task_id: 'seen-1', title: 'Finishing', source_type: 'event', source_id: 'tuesday',
  answer_kind: 'seen', due_at: null, time_zone: 'Asia/Dubai', answered, outdated, ...over })

beforeEach(() => {
  localStorage.clear()
  PLAYER = { id: `seen-player-${++n}` }
  answered = false
  outdated = false
  seenCalls = []
  signInAs(PLAYER)
  server.use(
    table('profiles', [{ user_id: PLAYER.id, role: 'player', full_name: 'Angelos Basinas' }]),
    table('player_details', [{ position: 'Midfielder', current_club: 'Rehearsal FC', age_group: 'U16' }]),
    table('squad_players', [{ id: 'squad-1', coach_user_id: 'coach-1' }]), table('coach_assessments', []),
    table('coach_shared_feedback', []), table('game_for_family', []), table('game_for_player', []),
    table('game_review_for_family', []), table('matches', []), table('event_absences', []),
    rpcRows('child_events', [TRAINING]), rpcRows('season_plan_for_player', []),
    rpcRows('family_academy', [{ name: 'Rehearsal FC', logo_url: null }]), rpcRows('child_training_attendance', []),
    rpc('get_player_invites_for_current_user', () => []),
    rpc('my_consent_status', () => ({ required: false, invited_parent: null })),
    rpc('family_feature_on', ({ p_feature }) => p_feature === 'family_look'),
    rpc('my_tasks', () => [seenTask()]),
    rpc('respond_to_task', ({ p_task_id }) => { seenCalls.push(String(p_task_id)); answered = true; outdated = false; return null }),
  )
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const weekEntry = () => screen.findByRole('button', { name: /^Finishing, / }, { timeout: 5000 })

describe('TRAK-580: a changed event, until the player opens it', { timeout: 20_000 }, () => {
  it('Home\'s week says Changed; Details records seen once, and the mark goes', async () => {
    renderApp('/player/home')
    expect(await weekEntry()).toHaveAccessibleName(/, Changed$/)
    await userEvent.click(screen.getByRole('button', { name: 'Details' }))
    const sheet = await screen.findByRole('dialog')
    await waitFor(() => expect(seenCalls).toEqual(['seen-1']))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(sheet).not.toBeInTheDocument())
    await waitFor(async () => expect(await weekEntry()).not.toHaveAccessibleName(/Changed/))
    await userEvent.click(screen.getByRole('button', { name: 'Details' }))
    await screen.findByRole('dialog')
    expect(seenCalls).toEqual(['seen-1'])
  })

  it('a change already seen: no mark, and opening records nothing', async () => {
    answered = true
    renderApp('/player/home')
    expect(await weekEntry()).not.toHaveAccessibleName(/Changed/)
    await userEvent.click(screen.getByRole('button', { name: 'Details' }))
    await screen.findByRole('dialog')
    expect(seenCalls).toEqual([])
  })

  it('a newer change than the one seen asks again', async () => {
    answered = true
    outdated = true
    renderApp('/player/home')
    expect(await weekEntry()).toHaveAccessibleName(/, Changed$/)
  })

  it('the event page records seen once, and says when the coach changed it on a device that never saw it before', async () => {
    renderApp('/player/event/tuesday')
    const changed = await screen.findByRole('status', { name: 'What changed' }, { timeout: 5000 })
    expect(within(changed).getByText('Your coach changed it on Thu 26 Nov.')).toBeInTheDocument()
    await waitFor(() => expect(seenCalls).toEqual(['seen-1']))
  })

  it('a cancelled event says so itself: the page records seen, with no "changed it on" line', async () => {
    server.use(rpcRows('child_events', [{ ...TRAINING, status: 'cancelled', cancel_reason: 'Pitch closed' }]))
    renderApp('/player/event/tuesday')
    await waitFor(() => expect(seenCalls).toEqual(['seen-1']), { timeout: 5000 })
    expect(screen.queryByText(/Your coach changed it on/)).toBeNull()
  })

  it('the event page records nothing for a change already seen', async () => {
    answered = true
    renderApp('/player/event/tuesday')
    await screen.findAllByText('Finishing', {}, { timeout: 5000 })
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(seenCalls).toEqual([])
    expect(screen.queryByRole('status', { name: 'What changed' })).toBeNull()
  })

  it('only an event\'s "seen" asks, unseen or outdated, count as changed events', () => {
    answered = false
    outdated = false
    const tasks = [seenTask(), seenTask({ task_id: 'seen-2', source_id: 'friday', answered: true }),
      seenTask({ task_id: 'seen-3', source_id: 'sunday', answered: true, outdated: true }),
      seenTask({ task_id: 'manual-1', source_type: 'manual', source_id: null, answer_kind: 'got_it' })]
    expect([...unseenEventChanges(tasks)]).toEqual([['tuesday', 'seen-1'], ['sunday', 'seen-3']])
    expect(unseenEventChanges(undefined).size).toBe(0)
  })
})
