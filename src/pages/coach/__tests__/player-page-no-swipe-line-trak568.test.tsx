/**
 * TRAK-568 (phone review, 23 Nov): a player with two or more assessments shows the cards' sliding row and no
 * "Swipe for earlier" line (Greek "Σύρετε για παλαιότερες"). Test people are named after footballers.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { rpc, rpcRows, table } from '../../../../tests/msw/supabase'

afterEach(cleanup)

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const assessment = (id: string, when: string) => ({ id, squad_player_id: 'sp-1', created_at: when, published_at: when, coach_rating: 7,
  work_rate: 7, technical: 6, physical: 8, coachability: 7, attitude: 8, tactical: 6, session_id: null })

function coach() {
  const COACH = { id: 'coach-568' }
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p-568', user_id: COACH.id, role: 'coach', full_name: 'Coach Synthetic', invite_code: null }]),
    table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16s', current_club: null, organization_id: null }]),
    table('squad_players', [{ id: 'sp-1', coach_user_id: COACH.id, player_name: 'Giorgos Karagounis', linked_player_id: 'child-1', position: 'Midfielder', shirt_number: 10, age_group: 'U16', status: 'active' }]),
    table('coach_assessments', [assessment('a1', daysAgo(3)), assessment('a2', daysAgo(10))].map(a => ({ ...a, coach_user_id: COACH.id }))),
    table('coach_shared_feedback', []), table('coach_assessment_notes', []), table('coach_sessions', []), table('squad_player_profiles', []),
    table('assessment_objectives', []),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('feature_on', () => false),
    rpc('coach_squad_season', () => []),
    rpcRows('coach_player_birth_dates', []),
  )
}

describe('TRAK-568: no "Swipe for earlier" on a player\'s page', () => {
  it('two assessments: the sliding row of cards, and no swipe line', async () => {
    coach()
    renderApp('/coach/squad/player/sp-1')
    const row = await screen.findByRole('region', { name: "Giorgos's assessments" })
    expect(within(row).getByRole('group', { name: 'Assessment 1 of 2' })).toBeInTheDocument()
    expect(within(row).getByRole('group', { name: 'Assessment 2 of 2' })).toBeInTheDocument()
    expect(screen.queryByText('Swipe for earlier')).toBeNull()
  })
})
