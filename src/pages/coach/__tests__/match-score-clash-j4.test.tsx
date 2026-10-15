import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { logStep, saveLog } from '../../../../tests/support/log-steps'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'

/**
 * TRAK-153 (J4). TRAK-149's database refuses a player saved with a different
 * score for a match already saved ("This match is already saved as 2-0 …").
 * The screen used to save the session and attendance first, so that refusal
 * left a second session with the wrong score that the coach can't delete.
 * Now the screen asks coach_match_score_clash() before writing anything.
 * The same goes for TRAK-149's other match-level refusal, goals counted across
 * saves ("2 goals entered, but the team scored 1"), which a later save adding
 * a scorer to a saved 1-0 used to hit after its session was in (Imad, #270).
 */

const COACH = { id: 'coach-1' }
const PLAYER = {
  id: 'squad-1', coach_user_id: COACH.id, player_name: 'Ade Okafor', linked_player_id: 'player-1',
  position: 'Attacker', age_group: 'U16', age: 15,
}
const toastText = () => [...document.querySelectorAll('[data-sonner-toast]')].map(t => t.textContent ?? '').join(' | ')

let writes: string[]
let clashArgs: Record<string, unknown>[]

function fixtures(clash: () => unknown) {
  writes = []
  clashArgs = []
  server.use(
    table('profiles', [{ id: 'p-coach', user_id: COACH.id, role: 'coach', full_name: 'Coach Vasilis', invite_code: 'ABCD' }]),
    table('squad_players', [PLAYER]),
    table('coach_sessions', []),
    http.post(`${SUPABASE_URL}/rest/v1/coach_sessions`, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>
      writes.push('session')
      return HttpResponse.json({ id: 'session-1', ...body }, { status: 201 })
    }),
    http.post(`${SUPABASE_URL}/rest/v1/session_attendance`, () => { writes.push('attendance'); return HttpResponse.json([], { status: 201 }) }),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('coach_match_score_clash', args => { clashArgs.push(args); return clash() }),
    rpc('log_match_for_player', () => { writes.push('match row'); return null }),
  )
}

async function fillOneZeroWin(opponent = 'Olympiakos U16', goals = 0, assists = 0) {
  const user = userEvent.setup()
  renderApp('/coach/sessions/quick')
  await user.type(await screen.findByPlaceholderText('Opponent name'), opponent)
  const [scoreUs, scoreThem] = screen.getAllByPlaceholderText('0')
  await user.type(scoreUs, '1')
  await user.type(scoreThem, '0')
  await logStep('Squad')
  await user.click(await screen.findByRole('button', { name: 'Mark played' }))
  await user.type(screen.getByRole('spinbutton', { name: `Minutes played by ${PLAYER.player_name}` }), '70')
  await user.click(screen.getByRole('button', { name: goals > 0 ? `One more goals for ${PLAYER.player_name}` : `One fewer goals for ${PLAYER.player_name}` }))
  if (assists === 0) await user.click(screen.getByRole('button', { name: `One fewer assists for ${PLAYER.player_name}` }))
  for (let i = 0; i < assists; i++) await user.click(screen.getByRole('button', { name: `One more assists for ${PLAYER.player_name}` }))
  return user
}

async function saveOneZeroWin(opponent = 'Olympiakos U16', goals = 0, assists = 0) {
  const user = await fillOneZeroWin(opponent, goals, assists)
  await saveLog('Save match')
}

describe('J4: a match already saved with another score saves nothing', () => {
  beforeEach(() => signInAs(COACH))

  it('refuses before writing a session, attendance or a match row, and says the saved score', async () => {
    fixtures(() => [{ team_score: 2, opponent_score: 0 }])
    await saveOneZeroWin()
    await waitFor(() => expect(toastText()).toMatch(/already saved as 2-0/))
    expect(toastText()).toContain('vs Olympiakos U16 is already saved as 2-0')
    expect(toastText()).toMatch(/Nothing was saved/)
    expect(writes).toEqual([])
    // The coach keeps what they typed, to fix the score.
    await logStep('Match')
    expect(screen.getByPlaceholderText('Opponent name')).toHaveValue('Olympiakos U16')
  }, 20_000)

  it('asks with the match being saved: its date, the trimmed opponent and both scores', async () => {
    fixtures(() => [])
    await saveOneZeroWin('  Olympiakos U16 ')
    await waitFor(() => expect(writes).toContain('match row'))
    expect(clashArgs).toHaveLength(1)
    expect(clashArgs[0]).toMatchObject({ p_opponent: 'Olympiakos U16', p_team_score: 1, p_opponent_score: 0, p_goals: 0, p_assists: 0 })
    expect(clashArgs[0].p_match_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // No clash: the save goes ahead as before.
    expect(writes).toEqual(['session', 'attendance', 'match row'])
  }, 20_000)

  it('refuses a later save whose goals take a saved match past its score, before writing anything', async () => {
    // The coach saved 1-0 with another player scoring; now Ade is added, also scoring.
    fixtures(() => [{ team_score: 1, opponent_score: 0, saved_goals: 1 }])
    await saveOneZeroWin('Olympiakos U16', 1)
    await waitFor(() => expect(toastText()).toMatch(/Nothing was saved/))
    expect(clashArgs[0]).toMatchObject({ p_team_score: 1, p_opponent_score: 0, p_goals: 1 })
    expect(toastText()).toContain('vs Olympiakos U16 already has 1 goal saved; with these it would be 2, but the team scored 1.')
    expect(toastText()).not.toMatch(/already saved as/)
    expect(writes).toEqual([])
  }, 20_000)

  it('on a retry, counts only the goals of players not yet written', async () => {
    // A 2-0 with one goal each. Bea's row fails on the connection, so the coach
    // saves again; Ade's goal is in the saved goals by then and must not count twice.
    const BEA = { ...PLAYER, id: 'squad-2', player_name: 'Bea Lin', linked_player_id: 'player-2' }
    let beaTries = 0
    fixtures(() => [])
    server.use(
      table('squad_players', [PLAYER, BEA]),
      rpc('log_match_for_player', args => {
        if ((args as { p_user_id: string }).p_user_id === 'player-2' && beaTries++ === 0) return { status: 503, body: { message: 'upstream timeout' } }
        writes.push('match row'); return null
      }),
    )
    const user = userEvent.setup()
    renderApp('/coach/sessions/quick')
    await user.type(await screen.findByPlaceholderText('Opponent name'), 'Olympiakos U16')
    const [scoreUs, scoreThem] = screen.getAllByPlaceholderText('0')
    await user.type(scoreUs, '2')
    await user.type(scoreThem, '0')
    await logStep('Squad')
    for (const p of [PLAYER, BEA]) {
      await user.click((await screen.findAllByRole('button', { name: 'Mark played' }))[0])
      await user.type(screen.getByRole('spinbutton', { name: `Minutes played by ${p.player_name}` }), '70')
      await user.click(screen.getByRole('button', { name: `One more goals for ${p.player_name}` }))
      await user.click(screen.getByRole('button', { name: `One fewer assists for ${p.player_name}` }))
    }
    await saveLog('Save match')
    await waitFor(() => expect(toastText()).toMatch(/Press save again/))
    await saveLog('Save match')
    await waitFor(() => expect(writes.filter(w => w === 'match row')).toHaveLength(2))
    expect(clashArgs.map(a => a.p_goals)).toEqual([2, 1])
  }, 30_000)

  it('refuses a later save whose assists take a saved match past its score, before writing anything (TRAK-167)', async () => {
    // The coach saved 1-0 with its goal and one assist; now Ade is added with another assist.
    fixtures(() => [{ team_score: 1, opponent_score: 0, saved_goals: 1, saved_assists: 1 }])
    await saveOneZeroWin('Olympiakos U16', 0, 1)
    await waitFor(() => expect(toastText()).toMatch(/Nothing was saved/))
    expect(clashArgs[0]).toMatchObject({ p_goals: 0, p_assists: 1 })
    expect(toastText()).toContain('vs Olympiakos U16 already has 1 assist saved; with these it would be 2, but the team scored 1.')
    expect(writes).toEqual([])
  }, 20_000)

  it('saves nothing when the question itself fails, and says to try again', async () => {
    fixtures(() => ({ status: 503, body: { message: 'upstream timeout' } }))
    await saveOneZeroWin()
    await waitFor(() => expect(toastText()).toMatch(/Couldn't check this match/))
    expect(toastText()).toMatch(/Nothing was saved/)
    expect(writes).toEqual([])
  }, 20_000)
})

describe("J4: a match's assists cannot pass its score (TRAK-167)", () => {
  beforeEach(() => signInAs(COACH))

  it('says so on the form and keeps Save off when one player has 2 assists in a 1-0', async () => {
    fixtures(() => [])
    await fillOneZeroWin('Olympiakos U16', 1, 2)
    expect(await screen.findByText('2 assists entered, but the team scored 1')).toBeInTheDocument()
    // TRAK-182: the log is in steps; Next stays shut on Squad.
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(writes).toEqual([])
  }, 20_000)

  it('saves a 1-0 with its goal and one assist', async () => {
    fixtures(() => [])
    await saveOneZeroWin('Olympiakos U16', 1, 1)
    await waitFor(() => expect(writes).toEqual(['session', 'attendance', 'match row']))
  }, 20_000)
})
