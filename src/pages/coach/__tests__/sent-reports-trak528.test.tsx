/**
 * TRAK-528 (Reports 5/10, Imad 21 Nov): a player's page lists the reports he was sent, newest first, each with Open. An
 * opened sent report is the report as it was sent, and says "Sent {date}" where an open one says "In progress". Phone
 * width; synthetic people.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, rpcRows } from '../../../../tests/msw/supabase'
import { forgetScreens } from '@/lib/screen-memory'
import type { PlayerReport } from '@/lib/player-report'

let COACH = { id: 'coach-528' }
let n = 0
const six = (v: number) => ({ work_rate: v, tactical: v, attitude: v, technical: v, physical: v, coachability: v })

const OCTOBER: PlayerReport = {
  squad_player_id: 's1', player_name: 'Nikos Synthetic', squad: 'U16',
  season_starts_on: '2026-09-01', period_from: '2026-09-28', report_day: '2026-10-25', last_report_day: '2026-09-27',
  before_season: null,
  assessments: [{ id: 'a1', day: '2026-09-27', ...six(5) }, { id: 'a2', day: '2026-10-25', ...six(7) }],
  matches: [{ event_id: 'm1', day: '2026-10-04', opponent: 'North FC', home_away: 'home', our_score: 2, their_score: 1,
    job: 'Press their left back', played: true, did_job: 'yes', against_expectation: 'above' }],
  objectives: [], trainings: { attended: 3, total: 4 },
}
const SEPTEMBER: PlayerReport = { ...OCTOBER, period_from: '2026-09-01', report_day: '2026-09-27', last_report_day: null,
  assessments: [{ id: 'a1', day: '2026-09-27', ...six(5) }], matches: [] }

function squad(sent: { evaluation_id: string; sent_at: string; report: PlayerReport }[]) {
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Synthetic Coach' }]),
    table('squad_players', [{ id: 's1', coach_user_id: COACH.id, player_name: 'Nikos Synthetic', position: 'Midfielder', shirt_number: 8,
      age_group: 'U16', status: 'active', created_at: '2026-08-01T08:00:00Z' }]),
    table('coach_assessments', []), table('coach_sessions', []),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('coach_squad_season', () => []),
    rpc('feature_on', ({ p_feature }) => p_feature === 'season_plan'),
    table('season_plans', [{ id: 'plan-1', squad: 'U16', starts_on: '2026-09-01', ends_on: '2027-06-30', shared_at: '2026-09-01T08:00:00Z',
      unshared_parts: [], unshared_players: [] }]),
    table('season_evaluations', []), table('coach_details', []),
    table('player_watches', []), table('squad_player_profiles', []), rpcRows('coach_player_birth_dates', []),
    table('player_objectives', []), table('objective_progress', []), table('season_objectives', []),
    table('squad_player_roles', []), table('squad_player_also_plays', []),
    rpc('coach_player_report', () => ({ ...OCTOBER, period_from: '2026-10-26', report_day: '2026-11-29', last_report_day: '2026-10-25' })),
    // Oldest first, as the database could return them: the page puts the newest first.
    table('report_for_player', sent),
  )
}

beforeEach(() => {
  localStorage.clear()
  COACH = { id: `coach-528-${++n}` }
  signInAs(COACH)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => { cleanup(); forgetScreens(); localStorage.clear(); vi.restoreAllMocks() })

describe('TRAK-528 a player\'s sent reports', () => {
  it('lists the sent reports newest first, and Open shows one as it was sent', async () => {
    const user = userEvent.setup()
    squad([
      { evaluation_id: 'ev-sep', sent_at: '2026-09-27T16:00:00Z', report: SEPTEMBER },
      { evaluation_id: 'ev-oct', sent_at: '2026-10-25T16:00:00Z', report: OCTOBER },
    ])
    renderApp('/coach/squad/player/s1')
    const reports = await screen.findByRole('region', { name: 'Reports' })
    const rows = within(reports).getAllByRole('listitem')
    expect(rows.map(row => within(row).getByText(/report$/).textContent)).toEqual(['October report', 'September report'])
    expect(within(rows[0]).getByText('Sent 25 Oct')).toBeInTheDocument()

    await user.click(within(rows[0]).getByRole('button', { name: 'Open Nikos’s October report' }))
    await waitFor(() => expect(window.location.pathname).toBe('/coach/squad/player/s1/report/ev-oct'))
    const card = await screen.findByRole('article', { name: 'Nikos’s October report' })
    expect(within(card).getByText(/^28 Sept? – 25 Oct$/)).toBeInTheDocument()
    expect(within(card).getByText('Sent 25 Oct')).toBeInTheDocument()
    expect(within(card).queryByText(/In progress/)).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Match by match' })).getByText('Job: Press their left back')).toBeInTheDocument()
  })

  it('shows no Reports list before the first report is sent', async () => {
    squad([])
    renderApp('/coach/squad/player/s1')
    expect(await screen.findByRole('button', { name: 'View Nikos’s report' })).toBeInTheDocument()
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(screen.queryByRole('region', { name: 'Reports' })).toBeNull()
  })
})
