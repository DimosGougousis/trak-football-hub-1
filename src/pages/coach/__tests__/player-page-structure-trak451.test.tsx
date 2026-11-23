/**
 * TRAK-451 (walk-through of 11 Nov): a player's page in Squad gets structure. Inside the page's card, two smaller cards:
 * position, roles and the profile with Edit profile; then the season so far with the radar chart, a light line above the
 * chart. Every block has a bold title. TRAK-546 (Kostas, 22 Nov): "Season so far" and its radar come off; Position and
 * roles, and About, are a card each, About's pencil right of its title. Test people are named after footballers.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { forgetScreens } from '@/lib/screen-memory'

let n = 0
let COACH = { id: 'coach-451' }
let seasonPlan = true
const player = (id: string, name: string, position: string) => ({ id, coach_user_id: COACH.id, player_name: name, age_group: 'U16', status: 'active',
  shirt_number: 5, position, created_at: '2026-09-01T08:00:00Z', linked_player_id: `child-${id}` })
const recently = new Date(Date.now() - 3 * 86_400_000).toISOString()

beforeEach(() => {
  localStorage.clear()
  COACH = { id: `coach-451-${++n}` }
  seasonPlan = true
  signInAs(COACH)
  server.use(
    table('player_watches', []),
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Otto Rehhagel', invite_code: 'ABCD' }]),
    table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16', organization_id: 'org-1' }]),
    table('organizations', [{ id: 'org-1', name: 'Rehearsal FC', logo_url: null }]),
    http.get(`${SUPABASE_URL}/rest/v1/squad_players`, () => HttpResponse.json([player('p1', 'Traianos Dellas', 'Defender'), player('p2', 'Angelos Basinas', 'Midfielder')])),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('feature_on', args => args.p_feature !== 'season_plan' || seasonPlan),
    table('squad_player_also_plays', []), table('squad_player_roles', []), table('squad_position_history', []),
    http.get(`${SUPABASE_URL}/rest/v1/season_plans`, () => HttpResponse.json([{ id: 'plan-1', squad: 'U16', starts_on: null, ends_on: null, shared_at: null, positions_known: 'yes' }])),
    table('season_objectives', []), table('training_notes', []), table('player_objectives', []), table('squad_player_profiles', []),
    rpc('coach_player_birth_dates', () => []), rpc('coach_squad_season', () => []),
    // One assessment this season, so the season so far has a radar chart.
    table('coach_assessments', [{ id: 'a1', squad_player_id: 'p1', coach_user_id: COACH.id, created_at: recently, published_at: recently, coach_rating: 7,
      work_rate: 7, technical: 6, physical: 8, coachability: 7, attitude: 8, tactical: 6, session_id: null }]),
    table('coach_assessment_notes', []), table('coach_shared_feedback', []), table('coach_sessions', []),
    table('assessment_objectives', []), // TRAK-526: each card's objective check-in
  )
})
afterEach(() => { cleanup(); forgetScreens(); localStorage.clear() })

/** The smaller card a block sits in, inside the page's own card. */
const innerCard = (element: HTMLElement) => element.closest('[data-inner-card]')

describe("TRAK-451: a player's page has structure", () => {
  it('TRAK-546: two smaller cards, position and roles, and About with its pencil right of its title; no season radar', async () => {
    renderApp('/coach/squad/player/p1')
    const position = await screen.findByRole('heading', { name: 'Position and roles' })
    const about = await screen.findByRole('heading', { name: 'About Traianos' })
    expect(innerCard(position)).not.toBeNull()
    expect(innerCard(about)).not.toBeNull()
    expect(innerCard(about)).not.toBe(innerCard(position))
    // The pencil shares the title's row, as Position and roles' does.
    const pencil = await within(innerCard(about) as HTMLElement).findByRole('button', { name: /profile/i })
    expect(about.parentElement).toContainElement(pencil)
    expect(screen.queryByRole('heading', { name: 'Season so far' })).toBeNull()
    expect(screen.queryByRole('figure', { name: /Traianos Dellas/ })).toBeNull()
  })

  it('every block has a bold title, the same one each time', async () => {
    renderApp('/coach/squad/player/p1')
    await screen.findByRole('heading', { name: 'About Traianos' })
    // TRAK-461: the assessments grow into place once read.
    await screen.findByRole('heading', { name: 'Assessments', level: 4 })
    const titles = ['Position and roles', 'About Traianos', 'Objective', 'Assessments']
      .map(name => screen.getByRole('heading', { name, level: 4 }))
    for (const title of titles) expect(title).toHaveClass('font-semibold')
    expect(new Set(titles.map(title => title.className)).size).toBe(1)
  })

  it('without the season plan: the profile card alone, still titled, and no season radar', async () => {
    seasonPlan = false
    renderApp('/coach/squad/player/p1')
    const about = await screen.findByRole('heading', { name: 'About Traianos' })
    expect(screen.queryByRole('heading', { name: 'Position and roles' })).toBeNull()
    expect(innerCard(about)).not.toBeNull()
    expect(screen.queryByRole('heading', { name: 'Season so far' })).toBeNull()
  })
})
