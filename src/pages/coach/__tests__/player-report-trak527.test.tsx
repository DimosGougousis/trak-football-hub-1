/**
 * TRAK-527 (Reports 4/10, Imad 21 Nov): Squad › a player's page has "View report" under Assess where the squad's season
 * plan is shared. It opens the report the plan is working towards, as it fills up: the title, the period and "In
 * progress · send on", four tiles, then and now, the season so far, match by match and the objectives. Bands as words.
 * A squad with no shared plan keeps Assess as it is. Phone width; synthetic people.
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

let COACH = { id: 'coach-527' }
let n = 0
const six = (v: number, coachability = v) => ({ work_rate: v, tactical: v, attitude: v, technical: v, physical: v, coachability })

const REPORT: PlayerReport = {
  squad_player_id: 's1', player_name: 'Nikos Synthetic', squad: 'U16',
  season_starts_on: '2026-09-01', period_from: '2026-10-26', report_day: '2026-11-29', last_report_day: '2026-10-25',
  before_season: null,
  assessments: [{ id: 'a1', day: '2026-10-10', ...six(6) }, { id: 'a2', day: '2026-11-15', ...six(7, 8) }],
  matches: [
    { event_id: 'm1', day: '2026-11-01', opponent: 'North FC', home_away: 'home', our_score: 2, their_score: 1, job: 'Press their left back',
      played: true, did_job: 'yes', against_expectation: 'above' },
    { event_id: 'm2', day: '2026-11-08', opponent: 'South FC', home_away: 'away', our_score: 0, their_score: 0, job: 'Hold the ball',
      played: true, did_job: 'partly', against_expectation: 'met' },
    { event_id: 'm3', day: '2026-11-15', opponent: 'East FC', home_away: 'home', our_score: 3, their_score: 0, job: '',
      played: false, did_job: null, against_expectation: null },
  ],
  objectives: [
    { id: 'o1', title: 'Scan before receiving', at_last_report: 'not_yet', now: 'on_track' },
    { id: 'o2', title: 'Shoot first time', at_last_report: 'some_progress', now: 'some_progress' },
  ],
  trainings: { attended: 7, total: 8 },
}

function squad({ shared, report = REPORT }: { shared: boolean; report?: PlayerReport }) {
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Synthetic Coach' }]),
    table('squad_players', [{ id: 's1', coach_user_id: COACH.id, player_name: 'Nikos Synthetic', position: 'Midfielder', shirt_number: 8,
      age_group: 'U16', status: 'active', created_at: '2026-08-01T08:00:00Z' }]),
    table('coach_assessments', []), table('coach_sessions', []),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('coach_squad_season', () => []),
    rpc('feature_on', ({ p_feature }) => shared && p_feature === 'season_plan'),
    table('season_plans', [{ id: 'plan-1', squad: 'U16', starts_on: '2026-09-01', ends_on: '2027-06-30', shared_at: shared ? '2026-10-01T08:00:00Z' : null,
      unshared_parts: [], unshared_players: [] }]),
    table('season_evaluations', []), table('coach_details', []),
    table('player_watches', []), table('squad_player_profiles', []), rpcRows('coach_player_birth_dates', []),
    table('player_objectives', []), table('objective_progress', []), table('season_objectives', []),
    table('squad_player_roles', []), table('squad_player_also_plays', []),
    rpc('coach_player_report', () => report),
  )
}

beforeEach(() => {
  localStorage.clear()
  COACH = { id: `coach-527-${++n}` }
  signInAs(COACH)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => { cleanup(); forgetScreens(); localStorage.clear(); vi.restoreAllMocks() })

const trail = () => screen.getByRole('navigation', { name: 'Breadcrumb trail' })

describe('TRAK-527 a player\'s report', () => {
  it('opens from "View report" under Assess, at its own address, with the report as it fills up', async () => {
    const user = userEvent.setup()
    squad({ shared: true })
    renderApp('/coach/squad/player/s1')
    const assess = await screen.findByRole('button', { name: 'Assess Nikos' })
    const view = await screen.findByRole('button', { name: 'View Nikos’s report' })
    // Under Assess: the next button on the page.
    expect(assess.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(view)
    await waitFor(() => expect(window.location.pathname).toBe('/coach/squad/player/s1/report'))

    const card = await screen.findByRole('article', { name: 'Nikos’s November report' })
    expect(within(card).getByRole('heading', { name: 'Nikos’s November report' })).toBeInTheDocument()
    expect(within(card).getByText('26 Oct – 29 Nov')).toBeInTheDocument()
    expect(within(card).getByText('In progress · send on 29 Nov')).toBeInTheDocument()
    // The tiles: the band now (7, 7, 7, 7, 7 and 8 average 7.2) and at the last report (6), jobs done of the matches
    // played, objectives on track, trainings attended.
    const tile = (label: string) => within(card).getByText(label).closest('div')!
    expect(within(tile('Overall')).getByText('Good')).toBeInTheDocument()
    expect(within(tile('Overall')).getByText('Last report: Steady')).toBeInTheDocument()
    expect(within(tile('Match jobs done')).getByText('1 of 2')).toBeInTheDocument()
    expect(within(tile('Objectives on track')).getByText('1 of 2')).toBeInTheDocument()
    expect(within(tile('Trainings attended')).getByText('7 of 8')).toBeInTheDocument()

    const then = screen.getByRole('region', { name: 'Then and now' })
    expect(within(then).getByText('Now, against the report of 25 Oct')).toBeInTheDocument()
    // Each of the six areas, in the player's page's order, from the last report's band to now's.
    expect(within(then).getAllByRole('definition').map(row => row.textContent))
      .toEqual(['Steady → Good', 'Steady → Good', 'Steady → Good', 'Steady → Standout', 'Steady → Good', 'Steady → Good'])

    expect(within(screen.getByRole('region', { name: 'Season so far' })).getByRole('img', { name: '2 assessments this season' })).toBeInTheDocument()

    const matches = within(screen.getByRole('region', { name: 'Match by match' })).getAllByRole('listitem')
    expect(matches).toHaveLength(3)
    expect(within(matches[0]).getByText('v North FC')).toBeInTheDocument()
    expect(within(matches[0]).getByText('Job: Press their left back')).toBeInTheDocument()
    expect(within(matches[0]).getByText('Yes')).toBeInTheDocument()
    expect(within(matches[0]).getByText('Above')).toBeInTheDocument()
    expect(within(matches[1]).getByText('at South FC')).toBeInTheDocument()
    expect(within(matches[1]).getByText('Partly')).toBeInTheDocument()
    expect(within(matches[2]).getByText('Didn’t play')).toBeInTheDocument()

    const objectives = within(screen.getByRole('region', { name: 'Objectives' })).getAllByRole('listitem')
    expect(within(objectives[0]).getByText('Not yet →')).toBeInTheDocument()
    expect(within(objectives[0]).getByText('On track')).toBeInTheDocument()
    expect(within(objectives[1]).queryByText(/→/)).toBeNull()

    expect(within(trail()).getByText('Report')).toBeInTheDocument()
    expect(within(trail()).getByRole('link', { name: 'Nikos Synthetic' })).toBeInTheDocument()
  })

  it('asks for the report the plan is working towards, the day after the last report on', async () => {
    const asked: Record<string, unknown>[] = []
    squad({ shared: true })
    server.use(rpc('coach_player_report', args => { asked.push(args); return REPORT }))
    renderApp('/coach/squad/player/s1/report')
    await screen.findByRole('article', { name: 'Nikos’s November report' })
    expect(asked[0].p_squad_player_id).toBe('s1')
    // Every month on the last Sunday: the report day is a Sunday, and the last report the one before it.
    const day = new Date(`${asked[0].p_report_day}T12:00:00Z`)
    expect(day.getUTCDay()).toBe(0)
    if (asked[0].p_last_report_day) expect(String(asked[0].p_last_report_day) < String(asked[0].p_report_day)).toBe(true)
  })

  it('shows empty bands for a player never assessed, and says when there are no matches or objectives', async () => {
    squad({ shared: true, report: { ...REPORT, last_report_day: null, period_from: '2026-09-01', assessments: [], matches: [], objectives: [],
      trainings: { attended: 0, total: 0 } } })
    renderApp('/coach/squad/player/s1/report')
    const card = await screen.findByRole('article', { name: 'Nikos’s November report' })
    expect(within(card).getByText('First report')).toBeInTheDocument()
    const then = screen.getByRole('region', { name: 'Then and now' })
    expect(within(then).getByText('The first report: the starting point')).toBeInTheDocument()
    expect(within(then).getByRole('group', { name: 'No assessment yet.' })).toBeInTheDocument()
    expect(screen.getByText('No match evaluated in this period yet.')).toBeInTheDocument()
    expect(screen.getByText('No objectives yet.')).toBeInTheDocument()
  })

  it('a squad with no shared plan keeps Assess as it is: no View report', async () => {
    squad({ shared: false })
    renderApp('/coach/squad/player/s1')
    expect(await screen.findByRole('button', { name: 'Assess Nikos' })).toBeInTheDocument()
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(screen.queryByRole('button', { name: 'View Nikos’s report' })).toBeNull()
  })
})
