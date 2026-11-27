/**
 * TRAK-423 (walk-through of 11 Nov): one look for a row's small actions. "Assess" and "Finish draft" are Arc's small
 * button wherever they appear (TRAK-614: Home's Needs you, where they first were, has gone). Squad's row
 * tag is a state ("Due"), not a second Assess. Edit is the pencil, never the word. Test people are named after footballers.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Button } from '@/components/arc/button/button'
import { BTN_DARK } from '@/components/coach/pitch-ready'
import { PlanReview } from '@/components/arc/blocks/plan-review/plan-review'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { rpc, rpcRows, table } from '../../../../tests/msw/supabase'

afterEach(cleanup)

describe("TRAK-423: a player's page and Squad", () => {
  const coach = () => {
    const COACH = { id: 'coach-423' }
    signInAs(COACH)
    server.use(
      table('profiles', [{ id: 'p-423', user_id: COACH.id, role: 'coach', full_name: 'Coach Synthetic', invite_code: null }]),
      table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16s', current_club: null, organization_id: null }]),
      table('squad_players', [{ id: 'sp-1', coach_user_id: COACH.id, player_name: 'Kostas Tsimikas', linked_player_id: 'child-1', position: 'Defender', shirt_number: 21, age_group: 'U16', status: 'active' }]),
      table('coach_assessments', []), table('coach_shared_feedback', []), table('coach_assessment_notes', []),
      table('coach_sessions', []), table('squad_player_profiles', []),
      rpc('coach_squad_player_consent_required', () => false),
      rpc('feature_on', () => false),
      rpc('coach_squad_season', () => []),
      rpcRows('coach_player_birth_dates', []),
    )
  }

  it("a player's page: Assess is the season plan's main button, named for the player", async () => {
    coach()
    // Dimos, 25 Nov: the player's page follows the season plan's look, so Assess is its dark button.
    renderApp('/coach/squad/player/sp-1')
    const assess = await screen.findByRole('button', { name: 'Assess Kostas' })
    expect(assess).toHaveTextContent(/^Assess$/)
    expect(assess.className).toBe(BTN_DARK)
  })
  // Squad's row tag ("Due", not "Assess") is checked in squad-views-trak250, which has a player owed an assessment.
})

describe('TRAK-423: Edit is the pencil', () => {
  it("the match's Review & share rows: a pencil named for the part, no Edit word", () => {
    render(<PlanReview title="Game plan review" band={{ status: 'good', label: 'Ready to share' }}
      rows={[{ id: 'logistics', label: 'Logistics', status: 'good', onEdit: () => {} }]} />)
    const edit = screen.getByRole('button', { name: 'Edit logistics' })
    expect(edit).toHaveTextContent(/^$/)
    expect(edit.querySelector('svg')).not.toBeNull()
  })
})
