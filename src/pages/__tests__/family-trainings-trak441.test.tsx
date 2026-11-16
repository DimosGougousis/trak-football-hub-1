/**
 * TRAK-441 slice 7 (mockup, 12 Nov): with the academy's family_look switch on, a player's Trainings tab is the coach's
 * look: Team training (how many counted trainings he was at, a bar, and his latest trainings, There or Missed), then
 * the catalogue's libraries as cards with their counts. A card opens the catalogue on that library. "Set for you" is
 * not built. With the switch off the tab is the catalogue as it was. Test people are named after footballers.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../../../tests/support/render-app'
import { signInAs } from '../../../tests/support/session'
import { server } from '../../../tests/msw/server'
import { table, rpc, rpcRows } from '../../../tests/msw/supabase'

afterEach(cleanup)

const CATALOGUE = '/trainings/coaching-session-catalogue.html'
// What family_training_history gives, newest first: the trainings he was recorded at (the register's "present"; old
// registers also wrote "late" and "absent").
const HISTORY = [
  { session_id: 's5', session_date: '2026-11-13', focus: ['Passing'], attendance: 'present' },
  { session_id: 's4', session_date: '2026-11-11', focus: null, attendance: 'late' },
  { session_id: 's3', session_date: '2026-11-09', focus: null, attendance: 'present' },
  { session_id: 's2', session_date: '2026-11-04', focus: null, attendance: 'absent' },
  { session_id: 's1', session_date: '2026-11-02', focus: null, attendance: 'present' },
]

let n = 0
function player({ look = true, counted = [{ attended: 21, total: 24 }] as object[], history = HISTORY as object[] } = {}) {
  const id = `karagounis-${++n}`
  signInAs({ id })
  server.use(
    table('profiles', [{ user_id: id, role: 'player', full_name: 'Giorgos Karagounis' }]),
    table('matches', []), table('player_details', []), table('squad_players', []), table('coach_assessments', []),
    rpcRows('child_events', []),
    rpc('get_player_invites_for_current_user', () => []),
    rpc('my_consent_status', () => ({ required: false, invited_parent: null })),
    rpc('my_session_is_live', () => true),
    rpc('family_feature_on', ({ p_feature }) => look && p_feature === 'family_look'),
    rpcRows('child_training_attendance', counted as Record<string, unknown>[]),
    rpcRows('family_training_history', history as Record<string, unknown>[]),
  )
}

describe('TRAK-441: the player\'s Trainings in the coach\'s look', () => {
  it('Team training: the count, the bar, and his latest four trainings, There or Missed', async () => {
    player()
    renderApp('/player/trainings')
    expect(await screen.findByRole('heading', { level: 1, name: 'Trainings' })).toBeInTheDocument()
    const team = await screen.findByRole('region', { name: 'Team training' })
    expect(await within(team).findByText('21 of 24')).toBeInTheDocument()
    const bar = within(team).getByRole('progressbar', { name: 'Team training' })
    expect(bar).toHaveAttribute('aria-valuenow', '21')
    expect(bar).toHaveAttribute('aria-valuemax', '24')
    expect(within(team).getAllByRole('listitem').map(row => row.textContent))
      .toEqual(['Fri 13 NovThere', 'Wed 11 NovThere', 'Mon 9 NovThere', 'Wed 4 NovMissed'])
    // Nothing built on data that doesn't exist yet.
    expect(screen.queryByText(/Set for you/)).toBeNull()
    expect(screen.queryByTitle('Coaching Session Catalogue')).toBeNull()
  }, 20_000)

  it('Catalogue: every library as a card with its count, largest first, each opening the catalogue on it', async () => {
    player()
    renderApp('/player/trainings')
    const catalogue = await screen.findByRole('region', { name: 'Catalogue' })
    const cards = within(catalogue).getAllByRole('link')
    expect(cards.map(card => card.textContent)).toEqual([
      'All sessions196', 'Technical82', 'Defending53', 'Attacking22', 'Goalkeeping16', 'Physical15', 'Transition5', 'Psychological3',
    ])
    await userEvent.click(within(catalogue).getByRole('link', { name: /Defending/ }))
    const frame = await screen.findByTitle('Coaching Session Catalogue')
    expect(frame).toHaveAttribute('src', `${CATALOGUE}?${new URLSearchParams({ lib: 'Tactical – Defending' })}`)
    // Coaching sessions stays on the catalogue (all of it); it doesn't fall back to the Trainings page.
    await userEvent.click(screen.getByRole('tab', { name: 'Coaching sessions' }))
    expect(await screen.findByTitle('Coaching Session Catalogue')).toHaveAttribute('src', CATALOGUE)
  }, 20_000)

  it('All sessions opens the whole catalogue', async () => {
    player()
    renderApp('/player/trainings')
    await userEvent.click(await screen.findByRole('link', { name: /All sessions/ }))
    expect(await screen.findByTitle('Coaching Session Catalogue')).toHaveAttribute('src', CATALOGUE)
  }, 20_000)

  it('with nothing recorded yet, Team training says so, with no count', async () => {
    player({ counted: [], history: [] })
    renderApp('/player/trainings')
    const team = await screen.findByRole('region', { name: 'Team training' })
    expect(await within(team).findByText('No training recorded yet.')).toBeInTheDocument()
    expect(within(team).queryByRole('progressbar')).toBeNull()
  }, 20_000)

  it('with the switch off the tab is the catalogue as it was', async () => {
    player({ look: false })
    renderApp('/player/trainings')
    expect(await screen.findByTitle('Coaching Session Catalogue')).toHaveAttribute('src', CATALOGUE)
    expect(screen.getByRole('tab', { name: 'Coaching sessions' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('region', { name: 'Team training' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Catalogue' })).toBeNull()
  }, 20_000)
})
