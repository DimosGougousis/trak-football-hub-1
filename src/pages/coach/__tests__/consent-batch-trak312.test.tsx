/**
 * TRAK-312 (seen live 29 Oct): every load of a coach page sent one consent request per player, 27 for Dora's
 * 27-player roster. The page now asks once for the whole roster, whatever its size, and a failed answer still fails
 * the read: never an empty squad.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, rpcRows, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { forgetScreens } from '@/lib/screen-memory'

let COACH = { id: 'coach-312' }
let n = 0
const players = (coachId: string) => Array.from({ length: 27 }, (_, i) => ({
  id: `sq-${i + 1}`, coach_user_id: coachId, player_name: `Player ${String(i + 1).padStart(2, '0')}`,
  position: 'Midfielder', shirt_number: i + 1, age_group: ['U16', 'U17', 'U18'][i % 3],
}))

let single = 0
let batches: string[][] = []

function coachReads(batch: () => Response = () => HttpResponse.json(['sq-2'])) {
  server.use(
    table('player_watches', []),
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach Rehearsal' }]),
    table('squad_players', players(COACH.id)),
    table('coach_assessments', []),
    table('coach_sessions', []),
    rpc('feature_on', args => args.p_feature !== 'season_plan'),
    rpc('coach_squad_season', () => []),
    table('squad_player_profiles', []),
    table('squad_player_also_plays', []), table('squad_player_roles', []),
    table('player_objectives', []),
    rpcRows('coach_player_birth_dates', []),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/coach_squad_player_consent_required`, () => { single++; return HttpResponse.json(false) }),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/coach_squad_players_consent_pending`, async ({ request }) => {
      batches.push(((await request.json()) as { p_squad_player_ids: string[] }).p_squad_player_ids)
      return batch()
    }),
  )
}

beforeEach(() => { localStorage.clear(); single = 0; batches = []; COACH = { id: `coach-312-${++n}` }; signInAs(COACH) })
afterEach(() => { cleanup(); forgetScreens(); localStorage.clear() })

describe('TRAK-312: one consent check per page load', { timeout: 20_000 }, () => {
  it('Squad with 27 players asks about consent once, for all 27', async () => {
    coachReads()
    renderApp('/coach/squad')
    const panel = await screen.findByRole('region', { name: 'Players' }, { timeout: 5000 })
    expect(await within(panel).findByRole('button', { name: /Player 27/ }, { timeout: 5000 })).toBeInTheDocument()

    expect(single).toBe(0)
    expect(batches).toHaveLength(1)
    expect(new Set(batches[0])).toEqual(new Set(players(COACH.id).map(p => p.id)))
  })

  it('a failed consent check fails the read: Try again, never an empty squad', async () => {
    coachReads(() => HttpResponse.json({ message: 'unavailable' }, { status: 500 }))
    renderApp('/coach/squad')
    expect(await screen.findByText("Couldn't load your squad", undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByText('Your squad is being prepared')).toBeNull()
    expect(screen.queryByRole('button', { name: /Player 01/ })).toBeNull()
  })
})
