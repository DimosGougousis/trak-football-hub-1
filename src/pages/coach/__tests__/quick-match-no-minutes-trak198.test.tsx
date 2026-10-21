import { describe, it, expect, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import App from '@/App'
import { renderApp } from '../../../../tests/support/render-app'
import { logStep, saveLog } from '../../../../tests/support/log-steps'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, insertInto, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'

/**
 * TRAK-198 (decided on the 16 Oct live-run call, Imad "go" 18 Oct): the quick
 * match log asks goals, assists and cards only. Grassroots coaches don't know
 * minutes, so it saves them as NULL ("not recorded"), and the rating takes no
 * minutes modifier. The full session log still asks minutes, as before.
 *
 * Quick = /coach/sessions/quick (the chooser's quick log, and Log match from
 * an event) and the "+" menu's played-match hand-over.
 */

const COACH = { id: 'coach-1' }
const STRIKER = {
  id: 'squad-1', coach_user_id: COACH.id, player_name: 'Ade Okafor', linked_player_id: 'player-1',
  position: 'Attacker', age_group: 'U16', age: 15,
}
const minutesField = () => screen.queryByRole('spinbutton', { name: `Minutes played by ${STRIKER.player_name}` })

type RpcBody = Record<string, unknown>

function captureMatchRpc(): RpcBody[] {
  const calls: RpcBody[] = []
  server.use(
    table('profiles', [{ id: 'p-coach', user_id: COACH.id, role: 'coach', full_name: 'Coach Vasilis', invite_code: 'ABCD' }]),
    table('squad_players', [STRIKER]),
    table('coach_sessions', []),
    insertInto('coach_sessions', body => ({ id: 'session-1', ...body })),
    insertInto('session_attendance', body => ({ id: 'att-1', ...body })),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('coach_match_score_clash', () => []),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/log_match_for_player`, async ({ request }) => {
      calls.push((await request.json()) as RpcBody)
      return HttpResponse.json(null)
    }),
  )
  return calls
}

/** The Match step: an opponent and 2–1. */
async function fillMatch() {
  const user = userEvent.setup()
  await user.type(await screen.findByPlaceholderText('Opponent name'), 'Synthetic Rovers')
  const [us, them] = screen.getAllByPlaceholderText('0')
  await user.type(us, '2')
  await user.type(them, '1')
}

/** The Squad step: the striker played, one goal, no assist, and `minutes` if the log asks. */
async function playStriker(minutes?: string) {
  const user = userEvent.setup()
  await screen.findByLabelText('Log steps')
  await logStep('Squad')
  await user.click(await screen.findByRole('button', { name: 'Mark played' }))
  if (minutes !== undefined) await user.type(minutesField()!, minutes)
  await user.click(screen.getByRole('button', { name: `One more goals for ${STRIKER.player_name}` }))
  await user.click(screen.getByRole('button', { name: `One fewer assists for ${STRIKER.player_name}` }))
}

async function save(calls: RpcBody[]): Promise<RpcBody> {
  const before = calls.length
  await saveLog('Save match')
  await waitFor(() => expect(calls.length).toBe(before + 1))
  const sent = calls[before]
  cleanup()
  return sent
}

/** The full log, switched to Match. */
async function fullLog() {
  renderApp('/coach/sessions/add')
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Match' }))
}

describe('TRAK-198: the quick match log asks no minutes', () => {
  beforeEach(() => signInAs(COACH))

  it('quick log: no minutes field; it saves "not recorded", rated as if minutes were neither long nor short', async () => {
    const calls = captureMatchRpc()
    renderApp('/coach/sessions/quick')
    await fillMatch()
    await playStriker()
    expect(minutesField()).not.toBeInTheDocument()
    const quick = await save(calls)
    expect(quick.p_minutes_played).toBeNull()
    expect(quick.p_goals).toBe(1)

    // Pilot coach's item 13 (Imad, 18 Oct): the full log asks no minutes either, so it rates the same.
    await fullLog()
    await fillMatch()
    await playStriker()
    const full = await save(calls)
    expect(full.p_minutes_played).toBeNull()
    expect(quick.p_computed_rating).toBe(full.p_computed_rating)
  }, 30_000)

  it('the "+" menu\'s played match is quick too: no minutes field, saved as not recorded', async () => {
    const calls = captureMatchRpc()
    // QuickAdd's hand-over (navigate state), as BrowserRouter stores it.
    window.history.pushState({ usr: { quickMatch: {
      opponent: 'Synthetic Rovers', venue: 'Home', scoreUs: '2', scoreThem: '1', date: '2026-10-10',
    } }, key: 'quick', idx: 0 }, '', '/coach/sessions/add')
    render(<App />)
    await playStriker()
    expect(minutesField()).not.toBeInTheDocument()
    expect((await save(calls)).p_minutes_played).toBeNull()
  }, 20_000)

  // Pilot coach's item 13 (Imad, 18 Oct): no minutes anywhere in the match log; Started/Sub stays (Imad, 19 Oct).
  it('full log: no minutes, Starter and Sub kept; goals and assists are enough to move on', async () => {
    captureMatchRpc()
    await fullLog()
    await fillMatch()
    await logStep('Squad')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Mark played' }))
    expect(minutesField()).not.toBeInTheDocument()
    const details = screen.getByRole('button', { name: `Details for ${STRIKER.player_name}` })
    if (details.getAttribute('aria-expanded') !== 'true') await userEvent.setup().click(details)
    expect(screen.getByRole('button', { name: /^starter$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sub$/i })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: `One fewer goals for ${STRIKER.player_name}` }))
    await userEvent.setup().click(screen.getByRole('button', { name: `One fewer assists for ${STRIKER.player_name}` }))
    expect(screen.queryByText(/still needs/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  }, 20_000)
})
