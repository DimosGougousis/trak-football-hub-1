/**
 * TRAK-85 (Imad, 16 Oct live run): awards are parked for the pilot, so the
 * coach's player profile shows no Award button at all, rather than one that
 * opens a "Coming soon" screen. The parked /coach/award route itself, and its
 * closed backend (G7), are unchanged.
 */
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table } from '../../../../tests/msw/supabase'

const COACH = { id: 'coach-85' }

describe('TRAK-85: the coach\'s player profile while awards are parked', () => {
  it('offers Assess and no Award button', async () => {
    signInAs(COACH)
    server.use(
      table('profiles', [{ id: 'p-85', user_id: COACH.id, role: 'coach', full_name: 'Coach Synthetic', invite_code: null }]),
      table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16s', current_club: null, organization_id: null }]),
      // The page reads one roster row by id (maybeSingle), so serve exactly one.
      table('squad_players', [{ id: 'sp-1', coach_user_id: COACH.id, player_name: 'Kostas Tsimikas', linked_player_id: 'child-1', position: 'Defender', shirt_number: 21 }]),
      table('coach_assessments', []),
      table('coach_shared_feedback', []),
    )
    renderApp('/coach/player/sp-1')
    expect(await screen.findByRole('button', { name: /^Assess Kostas/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /award/i })).toBeNull()
  })
})
