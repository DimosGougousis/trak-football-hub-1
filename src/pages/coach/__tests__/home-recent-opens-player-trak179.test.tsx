import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc } from '../../../../tests/msw/supabase'

/**
 * TRAK-179, live run 3 (16 Oct): on coach Home, a Recent assessments row
 * opened the assessment editor. It opens the player's profile, as Squad →
 * Open profile does; the assessment is one tap further, in their history.
 */
const COACH = { id: 'coach-179' }

afterEach(() => cleanup())

function serve() {
    server.use(
      table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
      table('coach_details', [{ user_id: COACH.id, team: 'U16s', coach_role: 'Head Coach' }]),
      table('squad_players', [{ id: 'sp-1', coach_user_id: COACH.id, player_name: 'Ade Okafor', created_at: '2026-09-01T00:00:00Z' }]),
      table('coach_assessments', [{ id: 'a-1', coach_user_id: COACH.id, squad_player_id: 'sp-1', coach_rating: 7,
        created_at: '2026-10-15T10:00:00Z', appearance: 'training', squad_players: { player_name: 'Ade Okafor' } }]),
      table('coach_sessions', []),
      table('session_attendance', []),
      table('coach_calendar_events', []),
      rpc('feature_on', () => true),
      rpc('coach_squad_player_consent_required', () => false),
    )
}

describe('TRAK-179: a Recent assessments row on Home opens the player', () => {
  it("goes to the player's profile, not the assessment editor", async () => {
    signInAs(COACH)
    serve()
    renderApp('/coach/home')
    await userEvent.click(await screen.findByRole('button', { name: /^Open Ade Okafor's profile/ }))
    await waitFor(() => expect(window.location.pathname).toBe('/coach/player/sp-1'))
  }, 20_000)

  // TRAK-200 (Imad, 18 Oct): Back on that profile returns to Home, not Squad.
  it('Back on the profile returns to Home', async () => {
    signInAs(COACH)
    serve()
    renderApp('/coach/home')
    await userEvent.click(await screen.findByRole('button', { name: /^Open Ade Okafor's profile/ }))
    await waitFor(() => expect(window.location.pathname).toBe('/coach/player/sp-1'))
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }))
    await waitFor(() => expect(window.location.pathname).toBe('/coach/home'))
  }, 20_000)

  it('a profile opened with no history behind it goes Back to Squad', async () => {
    signInAs(COACH)
    serve()
    renderApp('/coach/player/sp-1')
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }))
    await waitFor(() => expect(window.location.pathname).toBe('/coach/squad'))
  }, 20_000)
})
