/**
 * TRAK-222 (20 Oct live run): the match log's "ALL 90" marked everyone as
 * played by resetting every row to a blank one, so goals, assists and cards a
 * coach had already entered were thrown away. Its label also promised 90
 * minutes, which the log never records.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { saveLog, logStep } from '../../../../tests/support/log-steps'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, insertInto, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'

const COACH = { id: 'coach-1' }
const ADE = { id: 'squad-1', coach_user_id: COACH.id, player_name: 'Ade Okafor',
  linked_player_id: 'player-1', position: 'Defender', age_group: 'U14', age: null }
const BEN = { ...ADE, id: 'squad-2', player_name: 'Ben White', linked_player_id: 'player-2', position: 'Midfielder' }

function setup() {
  const calls: Record<string, unknown>[] = []
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    table('squad_players', [ADE, BEN]),
    table('coach_sessions', []),
    insertInto('coach_sessions', body => ({ id: 'session-1', ...body })),
    insertInto('session_attendance', body => ({ id: 'att-1', ...body })),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('coach_match_score_clash', () => []),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/log_match_for_player`, async ({ request }) => {
      calls.push(await request.json() as Record<string, unknown>)
      return HttpResponse.json(null)
    }),
  )
  return calls
}

describe('TRAK-222: marking the whole squad as played', { timeout: 20_000 }, () => {
  beforeEach(() => signInAs(COACH))

  it('keeps the goals, assists and card already entered, and says only that everyone played', async () => {
    const calls = setup()
    const user = userEvent.setup()
    renderApp('/coach/sessions/add')
    await user.click(await screen.findByRole('button', { name: 'Match' }))
    await user.type(await screen.findByPlaceholderText('Opponent name'), 'Olympiakos U14')
    const [us, them] = screen.getAllByPlaceholderText('0')
    await user.type(us, '2')
    await user.type(them, '1')
    await logStep('Squad')

    // Ade first: played, one goal, no assists, a yellow card.
    await user.click(screen.getAllByRole('button', { name: 'Mark played' })[0])
    await user.click(screen.getByRole('button', { name: 'One more goals for Ade Okafor' }))
    await user.click(screen.getByRole('button', { name: 'One fewer assists for Ade Okafor' }))
    await user.click(screen.getByRole('button', { name: 'Yellow' }))

    // The bulk action names what it does; nothing implies 90 minutes.
    expect(screen.queryByRole('button', { name: /90/ })).toBeNull()
    const allPlayed = screen.getByRole('button', { name: /all played/i })
    // Tapped twice, as a coach might.
    await user.click(allPlayed)
    await user.click(allPlayed)
    expect(screen.getByText(/2 played/i)).toBeInTheDocument()

    // Ben still needs his own numbers; Ade's are kept.
    if (!screen.queryByRole('button', { name: 'One fewer goals for Ben White' }))
      await user.click(screen.getByRole('button', { name: 'Details for Ben White' }))
    await user.click(screen.getByRole('button', { name: 'One fewer goals for Ben White' }))
    await user.click(screen.getByRole('button', { name: 'One fewer assists for Ben White' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
    await saveLog('Save match')
    await waitFor(() => expect(calls).toHaveLength(2))
    const byChild = Object.fromEntries(calls.map(call => [call.p_user_id, call]))
    expect(byChild['player-1']).toMatchObject({ p_goals: 1, p_assists: 0, p_card_received: 'Yellow', p_minutes_played: null })
    expect(byChild['player-2']).toMatchObject({ p_goals: 0, p_assists: 0, p_card_received: 'None', p_minutes_played: null })
  })
})
