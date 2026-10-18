/**
 * TRAK-170 (live run 3, 16 Oct): with a match coming up on 17 Oct and none
 * played yet, player Sessions said "No matches found" under the filters, and
 * the count at the top read "0 matches" above that upcoming match. The list
 * and the count are about matches already played, so they say so.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, rpcRows } from '../../../../tests/msw/supabase'

const PLAYER = { id: 'player-170-past' }
const UPCOMING = {
  id: 'ev-1', coach_user_id: 'coach-1', published: true, event_type: 'match', title: 'League',
  event_date: '2099-10-17', start_time: '11:00:00', starts_at: '2099-10-17T08:00:00Z',
  venue: 'Municipal Ground', opponent: 'Panathinaikos U16', meet_time: null, kit: null, home_away: 'away',
  status: 'scheduled', cancel_reason: null, sequence: 0,
}

beforeEach(() => {
  signInAs(PLAYER)
  server.use(
    table('profiles', [{ id: 'p', user_id: PLAYER.id, role: 'player', full_name: 'Kostas Tsimikas' }]),
    table('matches', []), table('player_details', []), table('coach_assessments', []), table('recognition_awards', []),
    table('squad_players', [{ id: 'squad-1', coach_user_id: 'coach-1' }]),
    rpc('get_player_invites_for_current_user', () => []),
    rpc('family_training_history', () => []),
    rpc('my_consent_status', () => ({ required: false })),
    rpcRows('child_events', [UPCOMING]),
  )
})
afterEach(() => cleanup())

describe('TRAK-170: Sessions with a match coming up and none played', () => {
  it('says there are no past matches yet, and counts matches played', async () => {
    renderApp('/player/matches')
    expect(await within(await screen.findByRole('region', { name: 'Upcoming' })).findByText(/Panathinaikos/)).toBeInTheDocument()
    expect(await screen.findByText('No past matches yet.')).toBeInTheDocument()
    expect(screen.queryByText(/No matches found/)).toBeNull()
    expect(screen.getByText('0 matches played')).toBeInTheDocument()
  })

  it('names the competition when a filter is on', async () => {
    renderApp('/player/matches')
    await screen.findByText('No past matches yet.')
    await userEvent.click(screen.getByRole('button', { name: 'League' }))
    expect(screen.getByText('No past league matches yet.')).toBeInTheDocument()
  })
})
