/**
 * TRAK-461 (walk-through of 11 Nov), a player's page: while its roles, profile and assessments load, each is a
 * placeholder of its size that grows into it (Arc's Skeleton morph). Each part says it is loading once; the
 * placeholders are hidden from screen readers. Test people are named after footballers.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { forgetScreens } from '@/lib/screen-memory'

let n = 0
let COACH = { id: 'coach-461' }
let release: () => void = () => {}

beforeEach(() => {
  localStorage.clear()
  COACH = { id: `coach-461-${++n}` }
  const held = new Promise<void>(resolve => { release = resolve })
  const after = async (rows: unknown[]) => { await held; return HttpResponse.json(rows) }
  signInAs(COACH)
  server.use(
    table('player_watches', []),
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Otto Rehhagel', invite_code: 'ABCD' }]),
    table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16', organization_id: 'org-1' }]),
    table('organizations', [{ id: 'org-1', name: 'Rehearsal FC', logo_url: null }]),
    table('squad_players', [{ id: 'p1', coach_user_id: COACH.id, player_name: 'Traianos Dellas', age_group: 'U16', status: 'active',
      shirt_number: 5, position: 'Defender', created_at: '2026-09-01T08:00:00Z', linked_player_id: 'child-p1' }]),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('feature_on', () => true),
    http.get(`${SUPABASE_URL}/rest/v1/season_plans`, () => HttpResponse.json([{ id: 'plan-1', squad: 'U16', starts_on: null, ends_on: null, shared_at: null, positions_known: 'yes' }])),
    table('season_objectives', []), table('training_notes', []), table('player_objectives', []),
    table('squad_player_also_plays', []), table('squad_position_history', []),
    rpc('coach_player_birth_dates', () => []), rpc('coach_squad_season', () => []),
    table('coach_assessment_notes', []), table('coach_shared_feedback', []), table('coach_sessions', []),
    // The three reads the page waits on, held until the test lets them go.
    http.get(`${SUPABASE_URL}/rest/v1/squad_player_roles`, () => after([])),
    http.get(`${SUPABASE_URL}/rest/v1/squad_player_profiles`, () => after([{ squad_player_id: 'p1', preferred_foot: 'right', nationality: 'Greek', traits: [] }])),
    http.get(`${SUPABASE_URL}/rest/v1/coach_assessments`, ({ request }) =>
      new URL(request.url).searchParams.get('select')?.includes('coach_sessions') ? after([]) : HttpResponse.json([])),
  )
})
afterEach(() => { release(); cleanup(); forgetScreens(); localStorage.clear() })

const PARTS = ["Loading Traianos's roles…", "Loading Traianos's profile…", "Loading Traianos's assessments…"]

describe("TRAK-461: a player's page loads as placeholders that grow into it", { timeout: 30_000 }, () => {
  it('roles, profile and assessments: one placeholder each, heard once each, then each holds its part', async () => {
    renderApp('/coach/squad/player/p1')
    const regions = await Promise.all(PARTS.map(async label => {
      const status = await screen.findByText(label, {}, { timeout: 5000 })
      expect(status).toHaveAttribute('role', 'status')
      expect(screen.getAllByText(label)).toHaveLength(1)
      const region = status.closest('[aria-busy="true"]') as HTMLElement
      expect(region.querySelectorAll('[data-state="skeleton"]')).toHaveLength(1)
      return region
    }))
    release()
    expect(await screen.findByText('Greek')).toBeInTheDocument()
    expect(await screen.findByText('None yet')).toBeInTheDocument()
    await waitFor(() => { for (const region of regions) expect(region.querySelectorAll('[data-state="skeleton"]')).toHaveLength(0) })
    for (const label of PARTS) expect(screen.queryByText(label)).toBeNull()
  })
})
