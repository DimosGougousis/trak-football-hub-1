/**
 * TRAK-501 (Imad, 19 Nov): a player's page in Squad shows the six bands even before the first assessment, empty, with
 * the small Assess under them; once assessed, the cards' bands as before, the same Assess under them. Bars carry no
 * number. Test people are named after footballers.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { BANDS } from '@/lib/types'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { rpc, rpcRows, table } from '../../../../tests/msw/supabase'

afterEach(cleanup)

const SIX = ['Work rate', 'Technical', 'Physical', 'Coachability', 'Attitude', 'Tactical']
const recently = new Date(Date.now() - 3 * 86_400_000).toISOString()

function coach(assessments: Record<string, unknown>[]) {
  const COACH = { id: `coach-501-${assessments.length}` }
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p-501', user_id: COACH.id, role: 'coach', full_name: 'Coach Synthetic', invite_code: null }]),
    table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16s', current_club: null, organization_id: null }]),
    table('squad_players', [{ id: 'sp-1', coach_user_id: COACH.id, player_name: 'Vasilis Torosidis', linked_player_id: 'child-1', position: 'Defender', shirt_number: 15, age_group: 'U16', status: 'active' }]),
    table('coach_assessments', assessments.map(a => ({ ...a, coach_user_id: COACH.id }))),
    table('coach_shared_feedback', []), table('coach_assessment_notes', []), table('coach_sessions', []), table('squad_player_profiles', []),
    table('assessment_objectives', []), // TRAK-526: each card's objective check-in
    rpc('coach_squad_player_consent_required', () => false),
    rpc('feature_on', () => false),
    rpc('coach_squad_season', () => []),
    rpcRows('coach_player_birth_dates', []),
  )
}

/** True when a comes before b in the page. */
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe("TRAK-501: a player's page shows the bands, empty until the first assessment", () => {
  it('never assessed: the six bands, empty and with no band word or number, and Assess under them', async () => {
    coach([])
    renderApp('/coach/squad/player/sp-1')
    const empty = await screen.findByRole('group', { name: 'No assessment yet.' })
    for (const label of SIX) expect(within(empty).getByText(label)).toBeInTheDocument()
    for (const band of BANDS) expect(within(empty).queryByText(band.word)).toBeNull()
    expect(empty.textContent).not.toMatch(/\d/)
    // The bands say it; the line doesn't say it again.
    expect(screen.queryByText('No assessment yet.')).toBeNull()
    expect(before(empty, screen.getByRole('button', { name: 'Assess Vasilis' }))).toBe(true)
  })

  it('assessed: the card with its bands as before, and the same Assess under it', async () => {
    coach([{ id: 'a1', squad_player_id: 'sp-1', created_at: recently, published_at: recently, coach_rating: 7,
      work_rate: 7, technical: 6, physical: 8, coachability: 7, attitude: 8, tactical: 6, session_id: null }])
    renderApp('/coach/squad/player/sp-1')
    const card = await screen.findByRole('group', { name: 'Assessment 1 of 1' })
    expect(within(card).getByText('Tactical')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'No assessment yet.' })).toBeNull()
    expect(before(card, screen.getByRole('button', { name: 'Assess Vasilis' }))).toBe(true)
  })
})
