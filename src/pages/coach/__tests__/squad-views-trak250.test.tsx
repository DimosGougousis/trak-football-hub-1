/**
 * TRAK-250: Squad is a tabbed coach workspace (Snapshot, Attributes, Season,
 * Availability) with one shared roster read. This file holds the shell tests;
 * each tab's own tests are appended as the tab lands.
 */
import { it, expect, describe, beforeEach, afterEach } from 'vitest'
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

    await user.click(screen.getByRole('tab', { name: 'Season' }))
    expect(screen.getByRole('tab', { name: 'Season' })).toHaveAttribute('aria-selected', 'true')
    expect(window.location.search).toContain('tab=season')
    expect(await screen.findByRole('tabpanel', { name: 'Season' })).toBeInTheDocument()

    cleanup()
    renderApp('/coach/squad?tab=attributes')
    expect(await tab('Attributes')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Snapshot' })).toHaveAttribute('aria-selected', 'false')

    cleanup()
    renderApp('/coach/squad?tab=nonsense')
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
    expect(screen.queryByRole('button', { name: 'Quick add' })).toBeNull()
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
