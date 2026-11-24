/**
 * TRAK-529 (Reports 6/10, Imad 21 Nov): the report a player and his parents read, from the copies Reports 5/10 stores.
 * The player reads his own copy: the coach's note, where he is now (the overall band, what moved up, the radar), the
 * season so far, match by match with his job, objectives and trainings. A parent reads the parents' copy: the same,
 * with no job and no "Did the job?", and the report's note to the player and parents (TRAK-531, Imad 21 Nov), never
 * the player's copy, whose note can be an older message for him alone. Words, no scores. Test people are footballers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../tests/support/render-app'
import { signInAs } from '../../../tests/support/session'
import { server } from '../../../tests/msw/server'
import { rpc, rpcRows, table, SUPABASE_URL } from '../../../tests/msw/supabase'
import { SIDE_MENU_QUERY } from '@/lib/side-menu-screen'
import { wasOpened } from '@/lib/games/news'

let n = 0
let READER = { id: 'reader-529' }
const CHILD = 'child-maldini-529'
const realMatchMedia = window.matchMedia
function screenIs(laptop: boolean) {
  window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: laptop && query === SIDE_MENU_QUERY })) as typeof window.matchMedia
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(laptop ? 1440 : 390)
}

const six = (work_rate: number, technical: number, physical: number, coachability: number, attitude: number, tactical: number) =>
  ({ work_rate, technical, physical, coachability, attitude, tactical })
// October's report: Attitude and Tactical move up a band (Steady to Good); the rest stay where they were.
const REPORT = {
  squad_player_id: 'sq-529', player_name: 'Paolo Maldini', squad: 'U16',
  season_starts_on: '2026-08-01', period_from: '2026-09-28', report_day: '2026-10-25', last_report_day: '2026-09-27',
  assessments: [{ id: 'a-sep', day: '2026-09-27', ...six(7, 7, 7, 8, 6, 6) }, { id: 'a-oct', day: '2026-10-25', ...six(8, 7, 7, 9, 8, 7) }],
  before_season: null,
  matches: [
    { event_id: 'm-oly', day: '2026-10-04', opponent: 'Olympiacos', home_away: 'home', our_score: 2, their_score: 1,
      job: 'Win every header', played: true, did_job: 'partly', against_expectation: 'above' },
    { event_id: 'm-pao', day: '2026-10-18', opponent: 'Panathinaikos', home_away: 'away', our_score: 0, their_score: 0,
      job: 'Hold the line', played: false, did_job: null, against_expectation: null },
  ],
  objectives: [{ id: 'o1', title: 'Talk to the back line', at_last_report: 'some_progress', now: 'on_track' }],
  trainings: { attended: 7, total: 8 },
}
const SENT = '2026-10-25T18:00:00Z'
const PLAYER_ROW = { evaluation_id: 'ev-oct', sent_at: SENT, report: REPORT, note: 'Keep talking to Nesta.' }
// The parents' copy as send_reports() stores it: no job, no "Did the job?"; its note is the report's, to both.
const strip = ({ job: _job, did_job: _did, ...rest }: typeof REPORT.matches[number]) => rest
const FAMILY_ROW = { evaluation_id: 'ev-oct', sent_at: SENT, report: { ...REPORT, matches: REPORT.matches.map(strip) }, note: 'A big month for Paolo.' }

let asked: string[] = []
const reports = (name: 'report_for_player' | 'report_for_family', rows: unknown[]) =>
  http.get(`${SUPABASE_URL}/rest/v1/${name}`, ({ request }) => { asked.push(`${name}?${new URL(request.url).searchParams.toString()}`); return HttpResponse.json(rows) })

function asPlayer() {
  READER = { id: CHILD }
  signInAs(READER)
  server.use(
    table('profiles', [{ user_id: CHILD, role: 'player', full_name: 'Paolo Maldini' }]),
    table('player_details', [{ position: 'Defender', current_club: 'Rehearsal FC', age_group: 'U16' }]),
    rpc('my_consent_status', () => ({ required: false, invited_parent: null })),
  )
}

function asParent() {
  READER = { id: `parent-529-${++n}` }
  signInAs(READER)
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/profiles`, ({ request }) => {
      const asked = new URL(request.url).searchParams.get('user_id') ?? ''
      if (asked.includes(READER.id)) return HttpResponse.json({ id: 'p', user_id: READER.id, role: 'parent', full_name: 'Cesare Maldini', nationality: null })
      return HttpResponse.json([{ user_id: CHILD, full_name: 'Paolo Maldini' }])
    }),
    table('player_parent_links', [{ player_user_id: CHILD }]), table('parental_consents', []),
    rpcRows('get_children_awaiting_consent', []), rpcRows('get_roster_children_awaiting_consent', []),
    rpcRows('get_my_child_logins', []), rpcRows('get_my_approved_children_awaiting_signup', []),
    rpc('guardian_consent_applies', () => true),
  )
}

beforeEach(() => {
  localStorage.clear()
  asked = []
  server.use(
    table('squad_players', [{ id: 'sq-529', coach_user_id: 'coach-529' }]),
    reports('report_for_player', [PLAYER_ROW]), reports('report_for_family', [FAMILY_ROW]),
    rpcRows('family_academy', [{ name: 'Rehearsal FC', logo_url: null }]),
    rpc('family_feature_on', ({ p_feature }) => p_feature === 'family_look'),
  )
})
afterEach(() => { cleanup(); window.matchMedia = realMatchMedia; vi.restoreAllMocks(); delete document.documentElement.dataset.layout })

describe('TRAK-529: the report a player and his parents read', () => {
  it("the player: his October report, the coach's note, what moved up, his matches with his job, objectives and trainings", async () => {
    asPlayer()
    screenIs(false)
    renderApp('/player/report/ev-oct')
    expect(await screen.findByRole('heading', { name: 'October report', level: 1 }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('28 Sep – 25 Oct')).toBeInTheDocument()
    const note = screen.getByRole('region', { name: 'From your coach' })
    expect(within(note).getByText('Keep talking to Nesta.')).toBeInTheDocument()
    expect(screen.getByText('Moved up: Attitude, Tactical')).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Paolo’s six areas, now and at the last report' })).toBeInTheDocument()
    const matches = screen.getByRole('region', { name: 'Match by match' })
    expect(within(matches).getByText('Job: Win every header')).toBeInTheDocument()
    expect(within(matches).getByText('Partly')).toBeInTheDocument()
    expect(within(matches).getByText('Above')).toBeInTheDocument()
    expect(within(matches).getByText('Didn’t play')).toBeInTheDocument()
    const objectives = screen.getByRole('region', { name: 'Objectives' })
    expect(within(objectives).getByText('Talk to the back line')).toBeInTheDocument()
    expect(within(objectives).getByText('On track')).toBeInTheDocument()
    expect(screen.getByText('Match jobs done')).toBeInTheDocument()
    expect(screen.getByText('Trainings attended').nextElementSibling).toHaveTextContent('7 of 8')
    // Words, never a score.
    expect(document.body.textContent).not.toMatch(/\b\d\.\d\b/)
    expect(asked.every(read => read.startsWith('report_for_player?'))).toBe(true)
    // Opened: Home's card stops saying New on this device.
    await waitFor(() => expect(wasOpened(CHILD, CHILD, 'report', 'ev-oct', SENT)).toBe(true))
  })

  it("the parent: the same report about Paolo with the report's note, no job and no \"Did the job?\", and never the player's copy", async () => {
    asParent()
    // Even if the copy carried the jobs, the parent's page shows none of them.
    server.use(reports('report_for_family', [{ ...FAMILY_ROW, report: REPORT }]))
    screenIs(false)
    renderApp('/parent/report/ev-oct')
    expect(await screen.findByRole('heading', { name: 'October report', level: 1 }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('Moved up: Attitude, Tactical')).toBeInTheDocument()
    const matches = screen.getByRole('region', { name: 'Match by match' })
    expect(within(matches).getByText('Above')).toBeInTheDocument()
    expect(within(matches).queryByText('Partly')).toBeNull()
    expect(within(matches).getByText('Didn’t play')).toBeInTheDocument()
    expect(screen.queryByText('Match jobs done')).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Note from the coach' })).getByText('A big month for Paolo.')).toBeInTheDocument()
    const shown = document.body.textContent ?? ''
    // The jobs, and the player's own message from his copy.
    for (const secret of ['Win every header', 'Hold the line', 'Keep talking to Nesta.']) expect(shown).not.toContain(secret)
    expect(shown).not.toMatch(/\bjobs?\b/i)
    // Only the parents' copy is read.
    expect(asked.length).toBeGreaterThan(0)
    for (const read of asked) expect(read).toMatch(/^report_for_family\?/)
    await waitFor(() => expect(wasOpened(READER.id, CHILD, 'report', 'ev-oct', SENT)).toBe(true))
  })

  it('a report that is not his says so', async () => {
    asPlayer()
    screenIs(false)
    renderApp('/player/report/ev-other')
    expect(await screen.findByText('This report isn’t here.', {}, { timeout: 5000 })).toBeInTheDocument()
  })
})
