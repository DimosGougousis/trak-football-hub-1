/**
 * TRAK-579 (coach–player P02): My tasks on the player's Home. One card per task the coach sent, with the one answer it
 * asks for (Got it, Done, Ready for review); the answer shows at once and Undo stays until the due time, when the card
 * goes. A Got it the coach has since changed comes back first, marked Updated. A failed save puts the card back and
 * says so. Nothing shows when there's nothing to answer, which is also every academy with the tasks switch off
 * (TRAK-578's my_tasks returns no rows then). Test people are named after footballers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, rpcRows } from '../../../../tests/msw/supabase'
import { dueLabel } from '@/lib/tasks'

// A new id per test: the app's query cache is keyed by user, so a shared id would carry one test's tasks into the next.
let n = 0
let PLAYER = { id: 'player-579' }
let answered: Record<string, boolean> = {}
let calls: { fn: string; args: Record<string, unknown> }[] = []
let reads = 0

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()
const task = (id: string, over: Record<string, unknown> = {}) => ({
  task_id: id, title: `Task ${id}`, source_type: 'manual', source_id: null, answer_kind: 'got_it',
  due_at: inDays(2), time_zone: 'Asia/Dubai', answered: false, outdated: false, ...over,
})

function setup(tasks: () => Record<string, unknown>[], answerReply?: () => unknown) {
  server.use(
    table('profiles', [{ id: 'p', user_id: PLAYER.id, role: 'player', full_name: 'Giorgos Karagounis' }]),
    table('player_details', [{ position: 'Midfielder', current_club: 'Rehearsal Athens', age_group: 'U16' }]),
    table('matches', []), table('squad_players', []),
    table('coach_assessments', []), table('coach_shared_feedback', []), table('recognition_awards', []),
    rpcRows('child_events', []),
    rpc('get_player_invites_for_current_user', () => []),
    rpc('my_consent_status', () => ({ required: false, invited_parent: null })),
    rpc('season_plan_for_player', () => []),
    rpc('my_tasks', () => { reads += 1; return tasks().map(t => ({ ...t, answered: answered[t.task_id as string] ?? t.answered })) }),
    rpc('respond_to_task', args => {
      calls.push({ fn: 'respond_to_task', args })
      const out = answerReply?.()
      if (!out) answered[args.p_task_id as string] = true
      return out ?? null
    }),
    rpc('undo_task_response', args => { calls.push({ fn: 'undo_task_response', args }); answered[args.p_task_id as string] = false; return null }),
  )
}

const section = () => screen.findByRole('region', { name: 'My tasks' })
const cards = (region: HTMLElement) => within(region).getAllByRole('article')

beforeEach(() => { answered = {}; calls = []; reads = 0; PLAYER = { id: `player-579-${++n}` }; signInAs(PLAYER) })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('TRAK-579: My tasks on the player Home', () => {
  it('shows nothing at all when there is nothing to answer (also: the switch off)', async () => {
    setup(() => [])
    renderApp('/player/home')
    await screen.findByText('Giorgos Karagounis')
    await waitFor(() => expect(reads).toBeGreaterThan(0))
    expect(screen.queryByRole('region', { name: 'My tasks' })).toBeNull()
  })

  it('shows three cards and See more for the rest, Updated first, then soonest due, then no due time', async () => {
    setup(() => [
      task('later', { due_at: inDays(5) }), task('none', { due_at: null }), task('soon', { due_at: inDays(1) }),
      task('changed', { due_at: inDays(4), answered: true, outdated: true }),
    ])
    renderApp('/player/home')
    const region = await section()
    expect(cards(region).map(c => within(c).getByRole('heading').textContent)).toEqual(['Task changed', 'Task soon', 'Task later'])
    await userEvent.click(within(region).getByRole('button', { name: 'See more (1)' }))
    expect(cards(region).map(c => within(c).getByRole('heading').textContent)).toEqual(['Task changed', 'Task soon', 'Task later', 'Task none'])
  })

  it('marks a changed Got it as Updated and asks again', async () => {
    setup(() => [task('changed', { answered: true, outdated: true })])
    renderApp('/player/home')
    const card = cards(await section())[0]
    expect(within(card).getByText('Updated')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Got it: Task changed' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /^Undo/ })).toBeNull()
  })

  it('each card says it is from the coach and when it is due, on the academy\'s clock', async () => {
    setup(() => [task('a', { title: 'Bring your shin pads', answer_kind: 'done' })])
    renderApp('/player/home')
    const card = cards(await section())[0]
    expect(within(card).getByText(`From Coach · ${dueLabel(inDays(2), 'Asia/Dubai')}`)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Done: Bring your shin pads' })).toBeInTheDocument()
    expect(dueLabel('2026-11-29T10:00:00Z', 'Asia/Dubai', Date.parse('2026-11-25T10:00:00Z'))).toBe('Due Sun 29 Nov')
    // 21:30 UTC is already the 26th in Dubai, still the 25th in Athens.
    expect(dueLabel('2026-11-25T21:30:00Z', 'Asia/Dubai', Date.parse('2026-11-25T10:00:00Z'))).toBe('Due Thu 26 Nov')
    expect(dueLabel('2026-11-25T21:30:00Z', 'Europe/Athens', Date.parse('2026-11-25T10:00:00Z'))).toBe('Due today')
  })

  it('Got it shows the tick at once, calls the database once, says so to a screen reader, and keeps it after a reload', async () => {
    setup(() => [task('a', { title: 'Read the plan for Tuesday' })])
    renderApp('/player/home')
    const region = await section()
    await userEvent.click(within(region).getByRole('button', { name: 'Got it: Read the plan for Tuesday' }))
    expect(within(region).getByRole('button', { name: 'Undo Got it: Read the plan for Tuesday' })).toBeInTheDocument()
    expect(within(region).getByRole('status')).toHaveTextContent('Got it: Read the plan for Tuesday')
    await waitFor(() => expect(calls).toEqual([{ fn: 'respond_to_task', args: { p_task_id: 'a' } }]))
    cleanup()
    renderApp('/player/home')
    expect(within(await section()).getByRole('button', { name: 'Undo Got it: Read the plan for Tuesday' })).toBeInTheDocument()
  })

  it('Undo takes the answer back', async () => {
    setup(() => [task('a', { answer_kind: 'ready_for_review', answered: true })])
    renderApp('/player/home')
    const region = await section()
    await userEvent.click(within(region).getByRole('button', { name: 'Undo Ready for review: Task a' }))
    expect(within(region).getByRole('button', { name: 'Ready for review: Task a' })).toBeInTheDocument()
    await waitFor(() => expect(calls).toEqual([{ fn: 'undo_task_response', args: { p_task_id: 'a' } }]))
  })

  it('a refused save puts the card back as it was and says it didn\'t save', async () => {
    setup(() => [task('a')], () => ({ status: 403, body: { code: '42501', message: 'This task isn\'t open for you' } }))
    renderApp('/player/home')
    const region = await section()
    await userEvent.click(within(region).getByRole('button', { name: 'Got it: Task a' }))
    expect(await screen.findByText('That didn\'t save. Try again.')).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: 'Got it: Task a' })).toBeInTheDocument()
    expect(cards(region)).toHaveLength(1)
  })

  it('Undo shows until the due time; then the card goes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    setup(() => [task('a', { answered: true, due_at: new Date(start + 1_500).toISOString() })])
    renderApp('/player/home')
    expect(within(await section()).getByRole('button', { name: 'Undo Got it: Task a' })).toBeInTheDocument()
    vi.setSystemTime(start + 60_000)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'My tasks' })).toBeNull(), { timeout: 4_000 })
  })

  it('a silent "seen" receipt never shows as a card', async () => {
    setup(() => [task('seen', { answer_kind: 'seen', source_type: 'event' }), task('a')])
    renderApp('/player/home')
    const region = await section()
    expect(cards(region)).toHaveLength(1)
    expect(within(region).queryByText('Task seen')).toBeNull()
  })

  it('offline, the answer buttons wait and say why', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      setup(() => [task('a'), task('b', { answered: true })])
      renderApp('/player/home')
      const region = await section()
      expect(within(region).getByText('You\'re offline. Try again when you\'re back online.')).toBeInTheDocument()
      expect(within(region).getByRole('button', { name: 'Got it: Task a' })).toBeDisabled()
      expect(within(region).getByRole('button', { name: 'Undo Got it: Task b' })).toBeDisabled()
    } finally { onLine.mockRestore() }
  })

  it('a failed read shows Retry in its own place, and the rest of Home stays', async () => {
    let fail = true
    setup(() => [task('a')])
    server.use(rpc('my_tasks', () => fail ? { status: 500, body: { message: 'boom' } } : [task('a')]))
    renderApp('/player/home')
    const region = await section()
    expect(screen.getByText('Giorgos Karagounis')).toBeInTheDocument()
    fail = false
    await userEvent.click(within(region).getByRole('button', { name: /Retry/ }))
    expect(await within(region).findByRole('button', { name: 'Got it: Task a' })).toBeInTheDocument()
  })

  it('names no teammate and counts nothing', async () => {
    setup(() => [task('a'), task('b'), task('c')])
    renderApp('/player/home')
    const region = await section()
    expect(within(region).getByRole('heading', { level: 2 }).textContent).toBe('My tasks')
    expect(region.textContent).not.toMatch(/\d+ of \d+|\d+\/\d+/)
  })
})
