/**
 * TRAK-250: Squad is a tabbed coach workspace (Snapshot, Attributes, Availability,
 * Games Statistics) with one shared roster read. This file holds the shell tests;
 * each tab's own tests are appended as the tab lands.
 */
import { it, expect, describe, beforeEach, afterEach, vi } from 'vitest'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { registerAuthUser } from '../../../../tests/msw/auth-sessions'
import { forgetScreens } from '@/lib/screen-memory'
import { supabase } from '@/integrations/supabase/client'
import { localTodayISO } from '@/lib/event-time'
import { seasonWindow } from '@/lib/squad/season'

// jsdom lays nothing out, so recharts' ResponsiveContainer would measure 0×0 and warn. A fixed size instead.
vi.mock('recharts', async importOriginal => {
  const recharts = await importOriginal<typeof import('recharts')>()
  const { cloneElement } = await import('react')
  return {
    ...recharts,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      <div style={{ width: 800, height: 220 }}>{cloneElement(children, { width: 800, height: 220 } as never)}</div>,
  }
})

// The app's query cache outlives a test, so each test is its own coach.
let COACH = { id: 'coach-250-shell' }
let n = 0

const PLAYERS = [
  { id: 'sq-nia', coach_user_id: 'coach-250-shell', player_name: 'Nia Rehearsal', position: 'Midfielder', shirt_number: 8, age_group: 'U10' },
  { id: 'sq-theo', coach_user_id: 'coach-250-shell', player_name: 'Theo Rehearsal', position: 'Defender', shirt_number: 4, age_group: 'U12' },
  { id: 'sq-ida', coach_user_id: 'coach-250-shell', player_name: 'Ida Rehearsal', position: 'Goalkeeper', shirt_number: 1, age_group: 'U12' },
]

function coachReads(players: Record<string, unknown>[] = PLAYERS) {
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach Rehearsal', nationality: 'AE' }]),
    table('squad_players', players),
    table('coach_assessments', []),
    table('coach_sessions', []),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('feature_on', () => true),
    rpc('coach_squad_season', () => []),
  )
}

beforeEach(() => { localStorage.clear(); COACH = { id: `coach-250-shell-${++n}` }; signInAs(COACH) })
afterEach(() => { cleanup(); forgetScreens(); localStorage.clear() })

const tab = (name: string) => screen.findByRole('tab', { name })
const panelNames = (panel: HTMLElement) => within(panel).getAllByRole('listitem').map(li => li.textContent).sort()

describe('TRAK-250: the Squad shell', { timeout: 20_000 }, () => {
  it('opens on Snapshot and keeps the tab in the URL', async () => {
    const user = userEvent.setup()
    coachReads()
    renderApp('/coach/squad')
    expect(await tab('Snapshot')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tablist', { name: 'Squad views' })).toBeInTheDocument()
    expect(await screen.findByRole('tabpanel', { name: 'Snapshot' })).toBeInTheDocument()

    expect(within(screen.getByRole('tablist', { name: 'Squad views' })).getAllByRole('tab').map(t => t.textContent)).toEqual(['Snapshot', 'Attributes', 'Availability', 'Games Statistics'])
    await user.click(screen.getByRole('tab', { name: 'Games Statistics' }))
    expect(screen.getByRole('tab', { name: 'Games Statistics' })).toHaveAttribute('aria-selected', 'true')
    expect(window.location.search).toContain('tab=games')
    expect(await screen.findByRole('tabpanel', { name: 'Games Statistics' })).toBeInTheDocument()

    cleanup()
    renderApp('/coach/squad?tab=attributes')
    expect(await tab('Attributes')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Snapshot' })).toHaveAttribute('aria-selected', 'false')

    cleanup()
    renderApp('/coach/squad?tab=nonsense')
    expect(await tab('Snapshot')).toHaveAttribute('aria-selected', 'true')

    // "season" is no longer a tab id.
    cleanup()
    renderApp('/coach/squad?tab=season')
    expect(await tab('Snapshot')).toHaveAttribute('aria-selected', 'true')
  })

  it('squad picker scopes every tab', async () => {
    const user = userEvent.setup()
    coachReads()
    renderApp('/coach/squad')
    // Two squads: the first (U10) shows until the coach picks the other.
    const first = await screen.findByRole('tabpanel', { name: 'Snapshot' })
    await within(first).findByText('Nia Rehearsal')
    expect(within(first).queryByText('Theo Rehearsal')).toBeNull()

    await user.click(within(screen.getByRole('group', { name: 'Squad' })).getByRole('button', { name: 'U12' }))
    await waitFor(() => expect(panelNames(screen.getByRole('tabpanel', { name: 'Snapshot' }))).toEqual(['Ida Rehearsal', 'Theo Rehearsal']))
    expect(screen.queryByText('Nia Rehearsal')).toBeNull()
  })

  it('a failed roster read shows Try again, never an empty squad', async () => {
    const user = userEvent.setup()
    coachReads()
    let failing = true
    server.use(http.get(`${SUPABASE_URL}/rest/v1/squad_players`, () =>
      failing ? HttpResponse.json({ message: 'unavailable' }, { status: 500 }) : HttpResponse.json(PLAYERS)))
    renderApp('/coach/squad')
    expect(await screen.findByText("Couldn't load your squad", undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByText('Your squad is being prepared')).toBeNull()

    failing = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    const panel = await screen.findByRole('tabpanel', { name: 'Snapshot' })
    expect(await within(panel).findByText('Nia Rehearsal')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your squad")).toBeNull()
  })

  it('an empty squad says it is being prepared, once the read has answered', async () => {
    coachReads([])
    renderApp('/coach/squad')
    expect(await screen.findByText('Your squad is being prepared')).toBeInTheDocument()
  })

  it('the old directory is gone', async () => {
    coachReads()
    renderApp('/coach/squad')
    await screen.findByRole('tabpanel', { name: 'Snapshot' })
    expect(screen.queryByRole('searchbox', { name: 'Search players' })).toBeNull()
    // TRAK-259: the only "+" is the coach's frame's, in the glass tab bar.
    expect(screen.getAllByRole('button', { name: 'Quick add' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Quick add' }).closest('nav')).toHaveAttribute('aria-label', 'Coach')
  })

  // TRAK-79 / UC-X02 (from the retired squad-load-failure-refresh test): a same-account token
  // refresh must not replace a failure with an empty squad.
  it('keeps a load failure on screen, not an empty squad, across a token refresh', async () => {
    const user = userEvent.setup()
    coachReads()
    let failing = true
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/squad_players`, () =>
        failing ? HttpResponse.json({ message: 'synthetic failure' }, { status: 500 }) : HttpResponse.json(PLAYERS)),
      http.post(`${SUPABASE_URL}/auth/v1/token`, () => {
        const previous = JSON.parse(localStorage.getItem('sb-test-auth-token')!)
        const refreshed = structuredClone(previous.user)
        return HttpResponse.json({ ...previous, user: refreshed, access_token: registerAuthUser(refreshed),
          expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600 })
      }),
    )
    renderApp('/coach/squad')
    await screen.findByText("Couldn't load your squad", undefined, { timeout: 5000 })
    failing = false
    await act(async () => { const { error } = await supabase.auth.refreshSession(); expect(error).toBeNull() })
    await act(async () => { await new Promise(r => setTimeout(r, 100)) })
    expect(screen.getByText("Couldn't load your squad")).toBeInTheDocument()
    expect(screen.queryByText('Your squad is being prepared')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await within(await screen.findByRole('tabpanel', { name: 'Snapshot' })).findByText('Nia Rehearsal')).toBeInTheDocument()
  })

  // TRAK-79 (from the retired squad-consent-status test): another coach signing in on this
  // device never sees the first coach's children, not even while their own read is pending.
  it("a different coach never sees the previous coach's players", async () => {
    coachReads()
    renderApp('/coach/squad')
    await within(await screen.findByRole('tabpanel', { name: 'Snapshot' })).findByText('Nia Rehearsal')
    cleanup()

    const second = { id: `${COACH.id}-other` }
    signInAs(second)
    let release!: () => void
    const held = new Promise<void>(r => { release = r })
    server.use(
      table('profiles', [{ id: 'p2', user_id: second.id, role: 'coach', full_name: 'Other Coach', nationality: 'AE' }]),
      http.get(`${SUPABASE_URL}/rest/v1/squad_players`, async () => {
        await held
        return HttpResponse.json([{ id: 'sq-zed', coach_user_id: second.id, player_name: 'Zed Rehearsal', position: 'Attacker', shirt_number: 9, age_group: 'U14' }])
      }),
    )
    renderApp('/coach/squad')
    await screen.findByRole('tab', { name: 'Snapshot' })
    await screen.findByRole('status')
    expect(screen.queryByText('Nia Rehearsal')).toBeNull()
    release()
    expect(await screen.findByText('Zed Rehearsal')).toBeInTheDocument()
    expect(screen.queryByText('Nia Rehearsal')).toBeNull()
  })

  // A failed consent check is a failed read: the squad is never listed as if every child could be assessed.
  it('a failed consent check shows Try again, never the children as ready', async () => {
    coachReads()
    server.use(rpc('coach_squad_player_consent_required', () => ({ status: 500, body: { message: 'synthetic failure' } })))
    renderApp('/coach/squad')
    expect(await screen.findByText("Couldn't load your squad", undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByText('Nia Rehearsal')).toBeNull()
  })
})

// ---- Snapshot tab (task 4) -------------------------------------------------------------------
const rating = (squad_player_id: string, coach_rating: number, created_at: string) => ({
  squad_player_id, coach_rating, created_at, work_rate: 5, technical: 5, physical: 5, coachability: 5, attitude: 5, tactical: 5,
})
const SNAP_PLAYERS = [
  { id: 'sq-leo', coach_user_id: 'x', player_name: 'Leo M.', position: 'Midfielder', shirt_number: 8, age_group: 'U12' },
  { id: 'sq-sami', coach_user_id: 'x', player_name: 'Sami K.', position: 'Attacker', shirt_number: 9, age_group: 'U12' },
  { id: 'sq-new', coach_user_id: 'x', player_name: 'Newcomer R.', position: 'Defender', shirt_number: 3, age_group: 'U12' },
]
const TRAININGS = ['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15'].map((session_date, i) => (
  { id: `ses-${i}`, coach_user_id: 'x', session_type: 'training', squad: null, session_date, title: 'Training' }))
// The register only stores who was ticked present: an absent child simply has no row.
const present = (session: number, squad_player_id: string) => ({ id: `a-${squad_player_id}-${session}`, session_id: `ses-${session}`, squad_player_id, status: 'present' })
const MARKS = [
  present(3, 'sq-leo'),
  ...[0, 1, 2, 3].map(i => present(i, 'sq-sami')),
]

describe('TRAK-250: Snapshot tab', { timeout: 20_000 }, () => {
  it('snapshot shows spread, moves and next steps', async () => {
    coachReads(SNAP_PLAYERS)
    server.use(
      table('coach_assessments', [
        rating('sq-leo', 6.5, '2026-09-01T10:00:00Z'), rating('sq-leo', 5.0, '2026-10-01T10:00:00Z'),
        rating('sq-sami', 8.2, '2026-09-01T10:00:00Z'), rating('sq-sami', 9.1, '2026-10-01T10:00:00Z'),
      ]),
      table('coach_sessions', TRAININGS),
      table('session_attendance', MARKS),
    )
    renderApp('/coach/squad')
    const panel = await screen.findByRole('tabpanel', { name: 'Snapshot' })

    expect(await within(panel).findByText(/2 assessed/)).toBeInTheDocument()
    const mixed = within(panel).getByRole('group', { name: 'Mixed' })
    const chip = within(mixed).getByText(/Leo M\./).closest('li')!
    expect(chip).toHaveTextContent('↓')
    expect(within(panel).getByRole('group', { name: 'Exceptional' })).toHaveTextContent('Sami K.')
    expect(within(panel).getByRole('img', { name: /Band spread/ })).toBeInTheDocument()

    const changes = within(panel).getByRole('region', { name: 'Changes since last assessment' })
    expect(within(changes).getByText('Leo M.', { exact: false, selector: 'p' })).toBeInTheDocument()
    const open = within(changes).getByRole('link', { name: /Open profile.*Leo M\./ })
    expect(open).toHaveAttribute('href', '/coach/player/sq-leo')

    expect(await within(panel).findByText('Talk to Leo M.: a drop and missed sessions.')).toBeInTheDocument()
    // The child without an assessment is still on screen.
    expect(within(panel).getByText('Newcomer R.')).toBeInTheDocument()
  })

  it("every name in the band columns and chips links to the child's profile", async () => {
    coachReads(SNAP_PLAYERS)
    server.use(
      table('coach_assessments', [rating('sq-leo', 6.5, '2026-09-01T10:00:00Z'), rating('sq-leo', 5.0, '2026-10-01T10:00:00Z')]),
      rpc('coach_squad_player_consent_required', args => args.p_squad_player_id === 'sq-sami'),
    )
    renderApp('/coach/squad')
    const panel = await screen.findByRole('tabpanel', { name: 'Snapshot' })
    const mixed = await within(panel).findByRole('group', { name: 'Mixed' })
    expect(within(mixed).getByRole('link', { name: /Leo M\./ })).toHaveAttribute('href', '/coach/player/sq-leo')
    expect(within(panel).getByRole('link', { name: 'Newcomer R.' })).toHaveAttribute('href', '/coach/player/sq-new')
    expect(within(panel).getByRole('link', { name: 'Sami K.' })).toHaveAttribute('href', '/coach/player/sq-sami')
  })

  it('empty squad', async () => {
    coachReads(SNAP_PLAYERS)
    renderApp('/coach/squad')
    const panel = await screen.findByRole('tabpanel', { name: 'Snapshot' })
    expect(await within(panel).findByText(/0 assessed/)).toBeInTheDocument()
    expect(within(panel).getByText('No assessments yet')).toBeInTheDocument()
  })

  it('a training with no register taken is not a miss', async () => {
    coachReads(SNAP_PLAYERS)
    server.use(
      table('coach_assessments', [rating('sq-leo', 6.5, '2026-09-01T10:00:00Z'), rating('sq-leo', 5.0, '2026-10-01T10:00:00Z')]),
      // Two newer trainings nobody was ticked at; Leo missed only one of the four registered ones.
      table('coach_sessions', [...TRAININGS, ...['2026-10-19', '2026-10-20'].map((session_date, i) =>
        ({ id: `ses-${4 + i}`, coach_user_id: 'x', session_type: 'training', squad: null, session_date, title: 'Training' }))]),
      table('session_attendance', [present(0, 'sq-leo'), present(3, 'sq-leo'), ...[0, 1, 2, 3].map(i => present(i, 'sq-sami'))]),
    )
    renderApp('/coach/squad')
    const panel = await screen.findByRole('tabpanel', { name: 'Snapshot' })
    expect(await within(panel).findByText('Check in with Leo M.')).toBeInTheDocument()
    expect(within(panel).queryByText(/a drop and missed sessions/)).toBeNull()
  })

  it('a failed attendance read keeps the bands and leaves out the missed-sessions wording', async () => {
    coachReads(SNAP_PLAYERS)
    server.use(
      table('coach_assessments', [rating('sq-leo', 6.5, '2026-09-01T10:00:00Z'), rating('sq-leo', 5.0, '2026-10-01T10:00:00Z')]),
      http.get(`${SUPABASE_URL}/rest/v1/coach_sessions`, () => HttpResponse.json({ message: 'unavailable' }, { status: 500 })),
    )
    renderApp('/coach/squad')
    const panel = await screen.findByRole('tabpanel', { name: 'Snapshot' })
    expect(await within(panel).findByText('Check in with Leo M.')).toBeInTheDocument()
    expect(within(panel).getByRole('group', { name: 'Mixed' })).toHaveTextContent('Leo M.')
    expect(within(panel).queryByText(/a drop and missed sessions/)).toBeNull()
  })
})

// ---- Attributes tab (task 5) -----------------------------------------------------------------
/** Noon, local time, on the Monday `weeksAgo` weeks before this week's Monday: always inside that heatmap week. */
function mondayNoon(weeksAgo: number) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - weeksAgo * 7, 12)
  return d.toISOString()
}
const attrs = (squad_player_id: string, created_at: string, tactical: number) => ({
  squad_player_id, coach_rating: 6, created_at, work_rate: 7, technical: 7, physical: 7, coachability: 7, attitude: 7, tactical,
})
const cellsOf = (panel: HTMLElement, attribute: string) =>
  within(within(panel).getByRole('row', { name: new RegExp(`^${attribute}`) })).getAllByRole('cell')

describe('TRAK-250: Attributes tab', { timeout: 20_000 }, () => {
  it('attributes heatmap and focus', async () => {
    coachReads(SNAP_PLAYERS)
    server.use(table('coach_assessments', [
      attrs('sq-leo', mondayNoon(1), 4),
      attrs('sq-leo', mondayNoon(0), 3),
      attrs('sq-sami', mondayNoon(0), 8),
    ]))
    renderApp('/coach/squad?tab=attributes')
    const panel = await screen.findByRole('tabpanel', { name: 'Attributes' })

    const tactical = await waitFor(() => cellsOf(panel, 'Tactical'))
    // Six weeks, then Range and Trend; the four weeks with nothing recorded read as a dash, never 0.
    expect(tactical).toHaveLength(8)
    for (const i of [0, 1, 2, 3]) expect(tactical[i]).toHaveTextContent('—')
    expect(tactical[4]).toHaveTextContent('4.0')
    expect(tactical[5]).toHaveTextContent('5.5')
    expect(tactical[6]).toHaveTextContent('3–8')
    expect(tactical[6]).toHaveTextContent('wide')
    expect(tactical[7]).toHaveTextContent('↑ 1.5')
    expect(within(panel).getAllByRole('columnheader').filter(h => /^\d{1,2} [A-Z][a-z]{2}$/.test(h.textContent ?? ''))).toHaveLength(6)

    expect(cellsOf(panel, 'Work rate')[5]).toHaveTextContent('7.0')
    expect(cellsOf(panel, 'Work rate')[6]).toHaveTextContent('narrow')

    const focus = within(panel).getByRole('region', { name: 'Focus this week' })
    expect(within(focus).getByRole('heading', { name: 'Tactical' })).toBeInTheDocument()
    expect(focus).toHaveTextContent('Lowest average (5.5)')
    expect(within(focus).getByRole('link', { name: 'Open Trainings →' })).toHaveAttribute('href', '/coach/trainings')
    expect(within(panel).getByText('How to read the range')).toBeInTheDocument()
    expect(within(panel).getByText(/Coach-only/)).toBeInTheDocument()
  })

  it('empty squad', async () => {
    coachReads(SNAP_PLAYERS)
    renderApp('/coach/squad?tab=attributes')
    const panel = await screen.findByRole('tabpanel', { name: 'Attributes' })
    expect(await within(panel).findByText('No assessments in the last 6 weeks')).toBeInTheDocument()
    expect(within(panel).queryByRole('table')).toBeNull()
  })

  it('assessments older than six weeks are an empty heatmap, not zeros', async () => {
    coachReads(SNAP_PLAYERS)
    server.use(table('coach_assessments', [attrs('sq-leo', mondayNoon(10), 4)]))
    renderApp('/coach/squad?tab=attributes')
    const panel = await screen.findByRole('tabpanel', { name: 'Attributes' })
    expect(await within(panel).findByText('No assessments in the last 6 weeks')).toBeInTheDocument()
  })
})

// ---- Games Statistics tab (task 6; renamed from Season, Dimos 22 Oct) ----------------------------
// The RPC still returns minutes_played; Trak does not capture minutes, so nothing on screen reads it.
const seasonRow = (match_date: string, opponent: string, session_id: string | null, team_score: number, opponent_score: number,
  squad_player_id: string, minutes_played: number | null, goals = 0, assists = 0) =>
  ({ match_date, opponent, session_id, team_score, opponent_score, squad_player_id, minutes_played, goals, assists })
// Three matches: W 4-1, L 1-3 (its scorers add up to 0, not 1), W 2-0 logged without minutes.
const SEASON_ROWS = [
  seasonRow('2026-09-05', 'Parkview U12', 's-1', 4, 1, 'sq-leo', 48, 2), seasonRow('2026-09-05', 'Parkview U12', 's-1', 4, 1, 'sq-sami', 48, 2),
  seasonRow('2026-09-05', 'Parkview U12', 's-1', 4, 1, 'sq-new', 19),
  seasonRow('2026-09-12', 'Riverside U12', 's-2', 1, 3, 'sq-leo', 48), seasonRow('2026-09-12', 'Riverside U12', 's-2', 1, 3, 'sq-sami', 48, 0, 1),
  seasonRow('2026-09-12', 'Riverside U12', 's-2', 1, 3, 'sq-new', 20),
  seasonRow('2026-09-19', 'Lakeside U12', 's-3', 2, 0, 'sq-leo', null, 2), seasonRow('2026-09-19', 'Lakeside U12', 's-3', 2, 0, 'sq-sami', null),
]
const tile = (panel: HTMLElement, name: string) => within(panel).getByRole('group', { name })
const GAMES = 'Games Statistics'
const seasonLine = (matches: string) => `${seasonWindow(localTodayISO()).label} · ${matches}`
/** Nothing about minutes played, in any wording, and no percentage. */
function noMinutes(el: HTMLElement) {
  expect(el).not.toHaveTextContent(/minute/i)
  expect(el).not.toHaveTextContent('%')
  expect(el).not.toHaveTextContent(/owed|of available|not counted/i)
}

describe('TRAK-250: Games Statistics tab', { timeout: 20_000 }, () => {
  it('games statistics build up from logged matches', async () => {
    coachReads(SNAP_PLAYERS)
    const asked: Record<string, unknown>[] = []
    server.use(rpc('coach_squad_season', args => { asked.push(args); return SEASON_ROWS }))
    renderApp('/coach/squad?tab=games')
    const panel = await screen.findByRole('tabpanel', { name: GAMES })

    const window_ = seasonWindow(localTodayISO())
    expect(await within(panel).findByRole('heading', { name: GAMES })).toBeInTheDocument()
    expect(asked[0]).toEqual({ p_from: window_.from, p_to: window_.to, p_squad: null })
    expect(await within(panel).findByText(seasonLine('3 matches'))).toBeInTheDocument()
    expect(within(panel).getAllByRole('group').map(g => g.getAttribute('aria-label')))
      .toEqual(['Played', 'Won · drawn · lost', 'Goals for – against'])
    expect(within(tile(panel, 'Played')).getByText('3')).toBeInTheDocument()
    expect(within(tile(panel, 'Won · drawn · lost')).getByText('2 · 0 · 1')).toBeInTheDocument()
    expect(within(tile(panel, 'Goals for – against')).getByText('7 – 4')).toBeInTheDocument()

    expect(within(panel).getByRole('img', { name: /How the season built up/ })).toBeInTheDocument()

    // #, Player, Apps, Goals, Assists; most appearances first, then by name.
    const table_ = within(panel).getByRole('table')
    expect(within(table_).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['#', 'Player', 'Apps', 'Goals', 'Assists'])
    const rows = within(table_).getAllByRole('row').slice(1)
    expect(rows.map(r => within(r).getByRole('rowheader').textContent)).toEqual(['Leo M.', 'Sami K.', 'Newcomer R.'])
    expect(within(rows[0]).getAllByRole('cell').map(c => c.textContent)).toEqual(['8', '3', '4', '0'])
    expect(within(rows[1]).getAllByRole('cell').map(c => c.textContent)).toEqual(['9', '3', '2', '1'])
    expect(within(rows[2]).getAllByRole('cell').map(c => c.textContent)).toEqual(['3', '2', '0', '0'])
    expect(within(rows[2]).getByRole('link', { name: 'Newcomer R.' })).toHaveAttribute('href', '/coach/player/sq-new')

    // The L 1-3 match has no scorer for its goal; the callout names it and links to its log.
    const callout = within(panel).getByRole('status')
    expect(callout).toHaveTextContent("Numbers don't add up: player goals total 6, match scores total 7.")
    expect(within(callout).getByRole('link', { name: '12 Sep vs Riverside U12' })).toHaveAttribute('href', '/coach/sessions/s-2')
    expect(within(callout).queryByRole('link', { name: /Parkview/ })).toBeNull()

    const results = within(panel).getByRole('region', { name: 'Results' })
    const items = within(results).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Lakeside U12')
    expect(items[0]).toHaveTextContent('W')
    expect(items[1]).toHaveTextContent('L')
    expect(items[1]).toHaveTextContent('1–3')

    noMinutes(panel)
    expect(within(panel).queryByRole('group', { name: 'Minutes balance' })).toBeNull()
  })

  it('a roster child with no match rows appears with 0 apps; a consent-pending one does not', async () => {
    coachReads([...SNAP_PLAYERS,
      { id: 'sq-wait', coach_user_id: 'x', player_name: 'Waiting W.', position: 'Defender', shirt_number: 5, age_group: 'U12' }])
    server.use(
      rpc('coach_squad_player_consent_required', args => args.p_squad_player_id === 'sq-wait'),
      rpc('coach_squad_season', () => SEASON_ROWS.filter(r => r.squad_player_id !== 'sq-new')),
    )
    renderApp('/coach/squad?tab=games')
    const panel = await screen.findByRole('tabpanel', { name: GAMES })
    const table_ = await within(panel).findByRole('table')
    const rows = within(table_).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    const newcomer = rows.find(r => r.textContent?.includes('Newcomer R.'))!
    expect(newcomer).toBe(rows[2])
    expect(within(newcomer).getAllByRole('cell').map(c => c.textContent)).toEqual(['3', '0', '0', '0'])
    expect(within(table_).queryByText('Waiting W.')).toBeNull()
    noMinutes(panel)
  })

  it('the running chart shows the won-drawn-lost record after each match', async () => {
    coachReads(SNAP_PLAYERS)
    server.use(rpc('coach_squad_season', () => SEASON_ROWS))
    renderApp('/coach/squad?tab=games')
    const panel = await screen.findByRole('tabpanel', { name: GAMES })
    const record = await within(panel).findByRole('list', { name: 'Record after each match (won–drawn–lost)' })
    const items = within(record).getAllByRole('listitem')
    expect(items.map(i => i.textContent)).toEqual(['5 Sep 1–0–0', '12 Sep 1–0–1', '19 Sep 2–0–1'])
  })

  it('empty season', async () => {
    coachReads(SNAP_PLAYERS)
    server.use(rpc('coach_squad_season', () => []))
    renderApp('/coach/squad?tab=games')
    const panel = await screen.findByRole('tabpanel', { name: GAMES })
    expect(await within(panel).findByText('No matches logged this season yet')).toBeInTheDocument()
    expect(within(panel).getByText(seasonLine('0 matches'))).toBeInTheDocument()
    expect(within(panel).queryByRole('table')).toBeNull()
    noMinutes(panel)
  })

  it('a match logged without minutes counts like any other: one match, its apps and goals', async () => {
    coachReads(SNAP_PLAYERS)
    server.use(rpc('coach_squad_season', () => [seasonRow('2026-09-19', 'Lakeside U12', 's-3', 2, 0, 'sq-leo', null, 2)]))
    renderApp('/coach/squad?tab=games')
    const panel = await screen.findByRole('tabpanel', { name: GAMES })
    expect(await within(panel).findByText(seasonLine('1 match'))).toBeInTheDocument()
    const leo = within(within(panel).getByRole('table')).getAllByRole('row')[1]
    expect(within(leo).getAllByRole('cell').map(c => c.textContent)).toEqual(['8', '1', '2', '0'])
    noMinutes(panel)
  })

  it('a failed season read shows Try again inside the tab, never an empty season', async () => {
    const user = userEvent.setup()
    coachReads(SNAP_PLAYERS)
    let failing = true
    server.use(rpc('coach_squad_season', () => failing ? { status: 500, body: { message: 'unavailable' } } : SEASON_ROWS))
    renderApp('/coach/squad?tab=games')
    const panel = await screen.findByRole('tabpanel', { name: GAMES })
    expect(await within(panel).findByText("Couldn't load the season", undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(within(panel).queryByText('No matches logged this season yet')).toBeNull()
    failing = false
    await user.click(within(panel).getByRole('button', { name: 'Try again' }))
    expect(await within(panel).findByText(seasonLine('3 matches'))).toBeInTheDocument()
    expect(within(panel).queryByText("Couldn't load the season")).toBeNull()
  })

  it('picking a squad asks for that squad only', async () => {
    const user = userEvent.setup()
    coachReads()
    const asked: Record<string, unknown>[] = []
    server.use(rpc('coach_squad_season', args => { asked.push(args); return [] }))
    renderApp('/coach/squad?tab=games')
    await within(await screen.findByRole('tabpanel', { name: GAMES })).findByText('No matches logged this season yet')
    expect(asked.at(-1)).toMatchObject({ p_squad: 'U10' })

    await user.click(within(screen.getByRole('group', { name: 'Squad' })).getByRole('button', { name: 'U12' }))
    await waitFor(() => expect(asked.at(-1)).toMatchObject({ p_squad: 'U12' }))
  })
})

// ---- Availability tab (task 7) ---------------------------------------------------------------
const AV_PLAYERS = [
  { id: 'c1', coach_user_id: 'x', player_name: 'Zayd B.', position: 'Goalkeeper', shirt_number: 1, age_group: 'U10' },
  { id: 'c2', coach_user_id: 'x', player_name: 'Rayan S.', position: 'Midfielder', shirt_number: 8, age_group: 'U10' },
  { id: 'c3', coach_user_id: 'x', player_name: 'Leo M.', position: 'Defender', shirt_number: 4, age_group: 'U10' },
  { id: 'c4', coach_user_id: 'x', player_name: 'Hamza Q.', position: 'Attacker', shirt_number: 9, age_group: 'U10' },
]
const MATCH_EVENT = {
  id: 'ev-1', coach_user_id: 'x', squad: null, title: 'Match', event_type: 'match', published: true, status: 'scheduled',
  starts_at: '2026-10-24T05:30:00Z', event_date: '2026-10-24', start_time: '09:30:00',
  opponent: 'Marina FC U10', home_away: 'home', venue: 'Academy pitch 1',
}
const TRAINING_EVENT = {
  id: 'ev-2', coach_user_id: 'x', squad: 'U10', title: 'Tuesday training', event_type: 'training', published: true, status: 'scheduled',
  starts_at: '2026-10-27T14:00:00Z', event_date: '2026-10-27', start_time: null,
  opponent: null, home_away: null, venue: null,
}

/** The coach's upcoming events, and what is recorded against them. Tests change `confirmed` between reads. */
function availabilityReads(init: {
  events?: Record<string, unknown>[]
  confirmed?: Record<string, string[]>
  absent?: Record<string, Record<string, unknown>[]>
  season?: Record<string, unknown>[]
} = {}) {
  const state = {
    confirmed: init.confirmed ?? ({} as Record<string, string[]>),
    absent: init.absent ?? ({} as Record<string, Record<string, unknown>[]>),
    absenceUrls: [] as string[],
    confirmationUrls: [] as string[],
    seasonAsks: 0,
  }
  const eventOf = (request: Request) => new URL(request.url).searchParams.get('event_id')?.replace(/^eq\./, '') ?? ''
  coachReads(AV_PLAYERS)
  server.use(
    table('coach_calendar_events', init.events ?? [MATCH_EVENT]),
    http.get(`${SUPABASE_URL}/rest/v1/event_confirmations`, ({ request }) => {
      state.confirmationUrls.push(request.url)
      return HttpResponse.json((state.confirmed[eventOf(request)] ?? []).map(squad_player_id => ({ squad_player_id })))
    }),
    http.get(`${SUPABASE_URL}/rest/v1/event_absences`, ({ request }) => {
      state.absenceUrls.push(request.url)
      return HttpResponse.json(state.absent[eventOf(request)] ?? [])
    }),
    rpc('coach_squad_season', () => { state.seasonAsks += 1; return init.season ?? [] }),
  )
  return state
}
const column = (panel: HTMLElement, name: string) => within(panel).getByRole('region', { name })
const columnLater = (panel: HTMLElement, name: string) => within(panel).findByRole('region', { name })
const child = (panel: HTMLElement, col: string, name: RegExp) => within(column(panel, col)).queryByRole('button', { name })

describe('TRAK-250: Availability tab', { timeout: 20_000 }, () => {
  it('availability splits confirmed and not confirmed', async () => {
    const state = availabilityReads({
      confirmed: { 'ev-1': ['c1'] },
      absent: { 'ev-1': [{ squad_player_id: 'c2', reason: 'Dentist' }] },
    })
    renderApp('/coach/squad?tab=availability')
    const panel = await screen.findByRole('tabpanel', { name: 'Availability' })

    expect(await within(panel).findByRole('heading', { name: 'Sat 24 Oct · vs Marina FC U10' })).toBeInTheDocument()
    expect(panel).toHaveTextContent('Match')
    expect(panel).toHaveTextContent('Kick-off 09:30 · Home · Academy pitch 1')

    const zayd = await within(await columnLater(panel, 'Confirmed')).findByRole('button', { name: /Zayd B\./ })
    expect(zayd).toHaveAttribute('aria-pressed', 'true')
    expect(zayd).toHaveTextContent('Goalkeeper')
    const rayan = child(panel, 'Not confirmed', /Rayan S\./)!
    expect(rayan).toHaveAttribute('aria-pressed', 'false')
    expect(rayan).toHaveTextContent("Reported can't make it")
    expect(within(column(panel, 'Confirmed')).queryByText("Reported can't make it")).toBeNull()
    expect(child(panel, 'Confirmed', /Rayan S\./)).toBeNull()

    // The reason is never read, never rendered.
    expect(panel).not.toHaveTextContent('Dentist')
    expect(state.absenceUrls.length).toBeGreaterThan(0)
    for (const url of [...state.absenceUrls, ...state.confirmationUrls]) {
      expect(new URL(url).searchParams.get('select')).toBe('squad_player_id')
    }

    expect(panel).toHaveTextContent('1 confirmed · 3 not confirmed')
    expect(panel).toHaveTextContent('Goalkeepers: Zayd B.')
    expect(panel).toHaveTextContent("Confirmations come from your WhatsApp group; families don't see them in Trak.")
    expect(within(panel).queryByRole('button', { name: /Remind/ })).toBeNull()
  })

  it('a confirmed goalkeeper with a reported absence is still confirmed, and shows the tag', async () => {
    availabilityReads({ confirmed: { 'ev-1': ['c1'] }, absent: { 'ev-1': [{ squad_player_id: 'c1' }] } })
    renderApp('/coach/squad?tab=availability')
    const panel = await screen.findByRole('tabpanel', { name: 'Availability' })
    const zayd = await within(await columnLater(panel, 'Confirmed')).findByRole('button', { name: /Zayd B\./ })
    await waitFor(() => expect(zayd).toHaveTextContent("Reported can't make it"))
    expect(panel).toHaveTextContent('Goalkeepers: Zayd B.')
    expect(within(panel).queryByText('No goalkeeper confirmed')).toBeNull()
  })

  it('tapping a child confirms them', async () => {
    const user = userEvent.setup()
    const state = availabilityReads({ confirmed: { 'ev-1': ['c1'] } })
    const calls: Record<string, unknown>[] = []
    server.use(rpc('confirm_event_attendance', args => {
      calls.push(args)
      state.confirmed['ev-1'] = [...state.confirmed['ev-1'], String(args.p_squad_player_id)]
      return null
    }))
    renderApp('/coach/squad?tab=availability')
    const panel = await screen.findByRole('tabpanel', { name: 'Availability' })
    await user.click(await within(await columnLater(panel, 'Not confirmed')).findByRole('button', { name: /Leo M\./ }))

    await waitFor(() => expect(calls).toEqual([{ p_event_id: 'ev-1', p_squad_player_id: 'c3' }]))
    await waitFor(() => expect(child(panel, 'Confirmed', /Leo M\./)).not.toBeNull())
    expect(child(panel, 'Not confirmed', /Leo M\./)).toBeNull()
    expect(panel).toHaveTextContent('2 confirmed · 2 not confirmed')
  })

  it('confirming by keyboard keeps focus on the child, now in Confirmed, and says so', async () => {
    const user = userEvent.setup()
    const state = availabilityReads({ confirmed: { 'ev-1': ['c1'] } })
    server.use(rpc('confirm_event_attendance', args => {
      state.confirmed['ev-1'] = [...state.confirmed['ev-1'], String(args.p_squad_player_id)]
      return null
    }))
    renderApp('/coach/squad?tab=availability')
    const panel = await screen.findByRole('tabpanel', { name: 'Availability' })
    const leo = await within(await columnLater(panel, 'Not confirmed')).findByRole('button', { name: /Leo M\./ })
    act(() => leo.focus())
    await user.keyboard('{Enter}')

    await waitFor(() => expect(child(panel, 'Confirmed', /Leo M\./)).not.toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(child(panel, 'Confirmed', /Leo M\./)))
    expect(within(panel).getByText('Leo M. confirmed')).toBeInTheDocument()
  })

  it('while a toggle is pending the buttons stay focusable and ignore taps', async () => {
    const user = userEvent.setup()
    availabilityReads({ confirmed: { 'ev-1': ['c1'] } })
    let release!: () => void
    const held = new Promise<void>(r => { release = r })
    const calls: unknown[] = []
    server.use(http.post(`${SUPABASE_URL}/rest/v1/rpc/confirm_event_attendance`, async ({ request }) => {
      calls.push(await request.json())
      await held
      return HttpResponse.json(null)
    }))
    renderApp('/coach/squad?tab=availability')
    const panel = await screen.findByRole('tabpanel', { name: 'Availability' })
    await user.click(await within(await columnLater(panel, 'Not confirmed')).findByRole('button', { name: /Leo M\./ }))
    const rayan = child(panel, 'Not confirmed', /Rayan S\./)!
    await waitFor(() => expect(rayan).toHaveAttribute('aria-disabled', 'true'))
    expect(rayan).not.toBeDisabled()
    await user.click(rayan)
    expect(calls).toHaveLength(1)
    release()
  })

  it('tapping a confirmed child takes the tick back', async () => {
    const user = userEvent.setup()
    const state = availabilityReads({ confirmed: { 'ev-1': ['c1', 'c3'] } })
    const calls: Record<string, unknown>[] = []
    server.use(rpc('unconfirm_event_attendance', args => {
      calls.push(args)
      state.confirmed['ev-1'] = state.confirmed['ev-1'].filter(id => id !== args.p_squad_player_id)
      return null
    }))
    renderApp('/coach/squad?tab=availability')
    const panel = await screen.findByRole('tabpanel', { name: 'Availability' })
    await user.click(await within(await columnLater(panel, 'Confirmed')).findByRole('button', { name: /Leo M\./ }))

    await waitFor(() => expect(calls).toEqual([{ p_event_id: 'ev-1', p_squad_player_id: 'c3' }]))
    await waitFor(() => expect(child(panel, 'Not confirmed', /Leo M\./)).not.toBeNull())
  })

  it('a refused confirm stays put', async () => {
    const user = userEvent.setup()
    availabilityReads({ confirmed: { 'ev-1': ['c1'] } })
    server.use(rpc('confirm_event_attendance', () => ({ status: 403, body: { message: 'This event has ended' } })))
    renderApp('/coach/squad?tab=availability')
    const panel = await screen.findByRole('tabpanel', { name: 'Availability' })
    await user.click(await within(await columnLater(panel, 'Not confirmed')).findByRole('button', { name: /Leo M\./ }))

    expect(await within(panel).findByRole('alert')).toHaveTextContent('This event has ended')
    expect(child(panel, 'Not confirmed', /Leo M\./)).not.toBeNull()
    expect(child(panel, 'Confirmed', /Leo M\./)).toBeNull()
  })

  it('no upcoming event', async () => {
    availabilityReads({ events: [] })
    renderApp('/coach/squad?tab=availability')
    const panel = await screen.findByRole('tabpanel', { name: 'Availability' })
    expect(await within(panel).findByText('No upcoming events')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: /schedule/i })).toHaveAttribute('href', '/coach/schedule')
    expect(within(panel).queryByRole('region', { name: 'Confirmed' })).toBeNull()
  })

  it('an event for another squad is not offered', async () => {
    availabilityReads({ events: [{ ...TRAINING_EVENT, squad: 'U12' }] })
    // Two squads, so U10 is the one in view.
    server.use(table('squad_players', [...AV_PLAYERS,
      { id: 'c9', coach_user_id: 'x', player_name: 'Omar T.', position: 'Defender', shirt_number: 5, age_group: 'U12' }]))
    renderApp('/coach/squad?tab=availability')
    const panel = await screen.findByRole('tabpanel', { name: 'Availability' })
    expect(await within(panel).findByText('No upcoming events')).toBeInTheDocument()
  })

  it('consent-pending child is not eligible', async () => {
    availabilityReads()
    server.use(rpc('coach_squad_player_consent_required', args => args.p_squad_player_id === 'c4'))
    renderApp('/coach/squad?tab=availability')
    const panel = await screen.findByRole('tabpanel', { name: 'Availability' })
    await within(await columnLater(panel, 'Not confirmed')).findByRole('button', { name: /Rayan S\./ })

    expect(panel).toHaveTextContent(/Not eligible:\s*Hamza Q\./)
    expect(within(panel).queryByRole('button', { name: /Hamza Q\./ })).toBeNull()
    expect(within(column(panel, 'Confirmed')).queryByText(/Hamza/)).toBeNull()
    expect(within(column(panel, 'Not confirmed')).queryByText(/Hamza/)).toBeNull()
    expect(panel).toHaveTextContent('0 confirmed · 3 not confirmed')
  })

  it('warns when no goalkeeper is confirmed', async () => {
    availabilityReads({ confirmed: { 'ev-1': ['c2'] } })
    renderApp('/coach/squad?tab=availability')
    const panel = await screen.findByRole('tabpanel', { name: 'Availability' })
    expect(await within(panel).findByText('No goalkeeper confirmed')).toBeInTheDocument()
    expect(within(panel).queryByText(/^Goalkeepers:/)).toBeNull()
  })

  it('steps through the upcoming events, each with its own confirmations', async () => {
    const user = userEvent.setup()
    availabilityReads({ events: [MATCH_EVENT, TRAINING_EVENT], confirmed: { 'ev-1': ['c1'], 'ev-2': ['c2', 'c3'] } })
    renderApp('/coach/squad?tab=availability')
    const panel = await screen.findByRole('tabpanel', { name: 'Availability' })
    await within(panel).findByRole('heading', { name: 'Sat 24 Oct · vs Marina FC U10' })
    expect(within(panel).getByRole('button', { name: 'Previous event' })).toBeDisabled()

    await user.click(within(panel).getByRole('button', { name: 'Next event' }))
    expect(await within(panel).findByRole('heading', { name: 'Tue 27 Oct · Tuesday training' })).toBeInTheDocument()
    expect(panel).toHaveTextContent('Training')
    await within(await columnLater(panel, 'Confirmed')).findByRole('button', { name: /Rayan S\./ })
    expect(child(panel, 'Confirmed', /Zayd B\./)).toBeNull()
    expect(within(panel).getByRole('button', { name: 'Next event' })).toBeDisabled()

    await user.click(within(panel).getByRole('button', { name: 'Previous event' }))
    expect(await within(panel).findByRole('heading', { name: 'Sat 24 Oct · vs Marina FC U10' })).toBeInTheDocument()
    await within(await columnLater(panel, 'Confirmed')).findByRole('button', { name: /Zayd B\./ })
  })

  const SEASON = [
    seasonRow('2026-09-05', 'Parkview U12', 's-1', 4, 1, 'c1', 48), seasonRow('2026-09-05', 'Parkview U12', 's-1', 4, 1, 'c2', 19),
    seasonRow('2026-09-05', 'Parkview U12', 's-1', 4, 1, 'c3', null),
  ]

  // Trak does not capture minutes played (Dimos, 22 Oct): no share per child, no "Minutes owed", and no season read.
  for (const [what, event, eventId] of [['a match', MATCH_EVENT, 'ev-1'], ['a training', TRAINING_EVENT, 'ev-2']] as const) {
    it(`shows no minutes or percentages for ${what}, and does not read the season`, async () => {
      const state = availabilityReads({ events: [event], confirmed: { [eventId]: ['c1'] }, season: SEASON })
      renderApp('/coach/squad?tab=availability')
      const panel = await screen.findByRole('tabpanel', { name: 'Availability' })
      await within(await columnLater(panel, 'Confirmed')).findByRole('button', { name: /Zayd B\./ })
      await within(await columnLater(panel, 'Not confirmed')).findByRole('button', { name: /Rayan S\./ })
      await act(async () => { await new Promise(r => setTimeout(r, 100)) })
      noMinutes(panel)
      expect(within(panel).queryByRole('region', { name: 'Minutes owed' })).toBeNull()
      expect(within(panel).queryByText("Minutes this season couldn't be loaded.")).toBeNull()
      expect(state.seasonAsks).toBe(0)
    })
  }

  it('a failed confirmations read shows Try again, never everyone as not confirmed', async () => {
    const user = userEvent.setup()
    const state = availabilityReads({ confirmed: { 'ev-1': ['c1'] } })
    let failing = true
    server.use(http.get(`${SUPABASE_URL}/rest/v1/event_confirmations`, () =>
      failing ? HttpResponse.json({ message: 'unavailable' }, { status: 500 })
        : HttpResponse.json(state.confirmed['ev-1'].map(squad_player_id => ({ squad_player_id })))))
    renderApp('/coach/squad?tab=availability')
    const panel = await screen.findByRole('tabpanel', { name: 'Availability' })
    expect(await within(panel).findByText("Couldn't load confirmations", undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(within(panel).queryByRole('region', { name: 'Not confirmed' })).toBeNull()

    failing = false
    await user.click(within(panel).getByRole('button', { name: 'Try again' }))
    expect(await within(await columnLater(panel, 'Confirmed')).findByRole('button', { name: /Zayd B\./ })).toBeInTheDocument()
  })

  it('a failed events read shows Try again, never "No upcoming events"', async () => {
    availabilityReads()
    server.use(http.get(`${SUPABASE_URL}/rest/v1/coach_calendar_events`, () => HttpResponse.json({ message: 'unavailable' }, { status: 500 })))
    renderApp('/coach/squad?tab=availability')
    const panel = await screen.findByRole('tabpanel', { name: 'Availability' })
    expect(await within(panel).findByText("Couldn't load upcoming events", undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(within(panel).queryByText('No upcoming events')).toBeNull()
  })
})
