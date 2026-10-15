/**
 * TRAK-177: at an academy whose consent age is 15, the coach waits for a
 * 15–17 player to agree for themselves, so the squad says so instead of
 * "Waiting for parent", and the assess screen explains it.
 */
import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc } from '../../../../tests/msw/supabase'
import { WAIT_TITLE, waitText } from '@/lib/wait-reason'

describe('TRAK-177: waiting for the player, not a parent', () => {
  it('labels a 15–17 player who has not agreed yet', async () => {
    const COACH = { id: 'coach-wait-player' }
    signInAs(COACH)
    server.use(
      table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', nationality: 'GR' }]),
      table('squad_players', [
        { id: 'sq-own', coach_user_id: COACH.id, player_name: 'Nikos Own', position: 'Midfielder' },
        { id: 'sq-parent', coach_user_id: COACH.id, player_name: 'Eleni Young', position: 'Defender' },
      ]),
      table('coach_assessments', []),
      rpc('coach_squad_player_consent_required', () => true),
      rpc('coach_squad_player_wait_reason', args => args.p_squad_player_id === 'sq-own' ? 'player' : 'parent'),
    )
    renderApp('/coach/squad')
    const row = async (name: string) => (await screen.findByText(name)).closest('button') as HTMLElement
    expect(await within(await row('Nikos Own')).findByText('Waiting for player to agree')).toBeInTheDocument()
    expect(within(await row('Eleni Young')).getByText('Waiting for parent')).toBeInTheDocument()
  })

  it('explains it on the assess screen', () => {
    expect(WAIT_TITLE.player).toBe('Waiting for the player to agree')
    expect(waitText('player', 'Nikos')).toBe("You can assess Nikos once they've signed up and agreed for themselves.")
  })
})
