import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { forgetScreens } from '@/lib/screen-memory'

/**
 * TRAK-197 (Kostas's 16 Oct list, items 9 + 10) and TRAK-196 (item 8): coach
 * Home is one quiet line, the week, the Player overview (at most 5, most
 * urgent first) and two quick actions. With two squads it follows the squad
 * picked in the header (Imad, 18 Oct).
 */
const NOW = new Date('2026-11-30T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
const JOINED = '2026-10-20T08:00:00Z'
let coach = 0
let COACH = { id: 'coach-197-0' }

const player = (id: string, name: string, age_group = 'U16') =>
  ({ id, coach_user_id: COACH.id, player_name: name, age_group, status: 'active', created_at: JOINED })
// Four Monday trainings, newest first; t1's event had a "Can't make it".
const TRAININGS = ['2026-11-23', '2026-11-16', '2026-11-09', '2026-11-02']
  .map((session_date, i) => ({ id: `t${i + 1}`, coach_user_id: COACH.id, session_type: 'training', session_date, event_id: i === 0 ? 'e1' : null, squad: null }))

type Row = Record<string, unknown>
function home(over: { players: ReturnType<typeof player>[]; assessments?: Row[]; present?: [string, string][]; absences?: Row[]; details?: Row }) {
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Angelos Basinas', invite_code: 'ABCD' }]),
    table('coach_details', [over.details ?? { user_id: COACH.id, coach_role: 'Head Coach', team: 'U16s', organization_id: 'org-1' }]),
    table('organizations', [{ id: 'org-1', name: 'Synthetic Athens' }]),
    table('squad_players', over.players),
    table('coach_assessments', over.assessments ?? []),
    table('coach_sessions', TRAININGS.map(t => ({ ...t, coach_user_id: COACH.id }))),
    table('session_attendance', (over.present ?? []).map(([session_id, squad_player_id]) => ({ session_id, squad_player_id }))),
    table('event_absences', over.absences ?? []),
    table('coach_calendar_events', []),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('feature_on', () => true),
  )
}
// Everyone in `ids` came to every training, so each register counts as taken.
const cameToAll = (...ids: string[]) => TRAININGS.flatMap(t => ids.map(id => [t.id, id] as [string, string]))
const overview = () => screen.getByRole('region', { name: 'Player overview' })
// The first look waits for the lazy Home to load.
const region = () => screen.findByRole('region', { name: 'Player overview' }, { timeout: 5000 })
// Each row is a button (it opens the player); its name starts "Open <name>'s profile".
const rows = () => within(overview()).getAllByRole('button', { name: /^Open .*'s profile/ })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  // A fresh coach each test: the app's query cache outlives a test and would keep the last one's squads.
  COACH = { id: `coach-197-${++coach}` }
  signInAs(COACH)
})
afterEach(() => { vi.useRealTimers(); cleanup(); forgetScreens(); localStorage.clear() })

describe('TRAK-196: one quiet line', () => {
  it('reads "Head Coach · academy · squad", with no greeting, no chips and no season card', async () => {
    home({ players: [player('a', 'Ade Okafor')], assessments: [{ squad_player_id: 'a', created_at: daysAgo(1) }], present: cameToAll('a') })
    renderApp('/coach/home')
    expect(await screen.findByText('Head Coach · Synthetic Athens · U16s')).toBeInTheDocument()
    await within(await region()).findByText('Ade Okafor')
    expect(screen.queryByText(/^Good (morning|afternoon|evening)/)).toBeNull()
    expect(screen.queryByText('Active')).toBeNull()
    for (const gone of ['THIS SEASON', 'Players in squad', 'Squad bands', 'RECENT ASSESSMENTS', 'Squad Overview', 'Coach Assistant']) {
      expect(screen.queryByText(gone)).toBeNull()
    }
  })
})

describe('TRAK-197: the Player overview', { timeout: 20_000 }, () => {
  it('lists the most urgent first, says each level in words, and why', async () => {
    home({
      players: [player('ok', 'Olly Steady'), player('warn', 'Wes Late'), player('urg', 'Uma Away')],
      assessments: ['ok', 'warn', 'urg'].map(id => ({ squad_player_id: id, created_at: daysAgo(2) })),
      // Uma missed t1–t3; Wes missed only the last; Olly came to all.
      present: [...cameToAll('ok'), ['t2', 'warn'], ['t3', 'warn'], ['t4', 'warn'], ['t4', 'urg']],
    })
    renderApp('/coach/home')
    await region()
    await waitFor(() => expect(rows()).toHaveLength(3), { timeout: 5000 })
    expect(rows().map(r => within(r).getByText(/^(Urgent|Warning|On track)$/).textContent)).toEqual(['Urgent', 'Warning', 'On track'])
    expect(within(rows()[0]).getByText('Uma Away')).toBeInTheDocument()
    expect(within(rows()[0]).getByText('Missed 3 of the last 4 trainings')).toBeInTheDocument()
    expect(within(rows()[1]).getByText('Missed the last training')).toBeInTheDocument()
    expect(within(rows()[2]).getByText('Assessed 2 days ago')).toBeInTheDocument()
  })

  it("shows the Can't make it reason to the coach", async () => {
    home({
      players: [player('a', 'Ade Okafor')],
      assessments: [{ squad_player_id: 'a', created_at: daysAgo(2) }],
      present: [['t1', 'x'], ['t2', 'a'], ['t3', 'a'], ['t4', 'a']],
      absences: [{ event_id: 'e1', squad_player_id: 'a', reason: 'Ill' }],
    })
    renderApp('/coach/home')
    expect(await within(await region()).findByText("Missed the last training (Can't make it: Ill)")).toBeInTheDocument()
  })

  it('shows at most 5, and points to Squad for the rest who need attention', async () => {
    const players = Array.from({ length: 8 }, (_, i) => player(`p${i}`, `Player ${i}`))
    // Nobody assessed for 5 weeks: all 8 are Urgent.
    home({ players, assessments: players.map(p => ({ squad_player_id: p.id, created_at: daysAgo(35) })), present: cameToAll(...players.map(p => p.id)) })
    renderApp('/coach/home')
    await region()
    await waitFor(() => expect(rows()).toHaveLength(5), { timeout: 5000 })
    const more = within(overview()).getByRole('link', { name: '3 more need attention · Squad' })
    await userEvent.click(more)
    await waitFor(() => expect(window.location.pathname).toBe('/coach/squad'))
  })

  it('a row opens that player', async () => {
    home({ players: [player('a', 'Ade Okafor')], present: cameToAll('a') })
    renderApp('/coach/home')
    await userEvent.click(await screen.findByRole('button', { name: "Open Ade Okafor's profile: Urgent" }))
    await waitFor(() => expect(window.location.pathname).toBe('/coach/player/a'))
  })

  it('with two squads, shows only the squad picked, and switches with it', async () => {
    home({
      players: [player('u14', 'Ade Okafor', 'U14'), player('u16', 'Bo Lind', 'U16')],
      present: cameToAll('u14', 'u16'),
    })
    localStorage.setItem(`trak:coach-squad:${COACH.id}`, 'U16')
    renderApp('/coach/home')
    expect(await within(await region()).findByText('Bo Lind')).toBeInTheDocument()
    expect(within(overview()).queryByText('Ade Okafor')).toBeNull()
    expect(screen.getByText('Head Coach · Synthetic Athens · U16')).toBeInTheDocument()

    // The new squad's reads held: the old squad's rows must not stand in for it.
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    server.use(http.get(`${SUPABASE_URL}/rest/v1/coach_assessments`, async () => { await held; return HttpResponse.json([]) }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Squad' }), 'U14')
    expect(within(overview()).queryByText('Bo Lind')).toBeNull()
    expect(within(overview()).getByRole('status')).toHaveTextContent('Loading your players…')
    release()
    expect(await within(overview()).findByText('Ade Okafor')).toBeInTheDocument()
    expect(within(overview()).queryByText('Bo Lind')).toBeNull()
    expect(screen.getByText('Head Coach · Synthetic Athens · U14')).toBeInTheDocument()
  })

  it("a training only the other squad had doesn't count against this squad", async () => {
    home({
      players: [player('u16', 'Bo Lind', 'U16')],
      assessments: [{ squad_player_id: 'u16', created_at: daysAgo(1) }],
      present: cameToAll('u16'),
    })
    // A newer U14 training Bo wasn't on: not his squad's, so not missed.
    server.use(table('coach_sessions', [
      { id: 't0', coach_user_id: COACH.id, session_type: 'training', session_date: '2026-11-27', event_id: null, squad: 'U14' },
      ...TRAININGS.map(t => ({ ...t, coach_user_id: COACH.id })),
    ]), table('squad_players', [player('u14', 'Ade Okafor', 'U14'), player('u16', 'Bo Lind', 'U16')]),
    table('session_attendance', [['t0', 'u14'], ...cameToAll('u16')].map(([session_id, squad_player_id]) => ({ session_id, squad_player_id }))))
    localStorage.setItem(`trak:coach-squad:${COACH.id}`, 'U16')
    renderApp('/coach/home')
    expect(await within(await region()).findByText('Assessed 1 day ago')).toBeInTheDocument()
  })
})

describe('TRAK-197: two quick actions', () => {
  it('Assess a player opens the assessment; Log a match or training opens the log chooser', async () => {
    home({ players: [player('a', 'Ade Okafor')], present: cameToAll('a') })
    renderApp('/coach/home')
    await userEvent.click(await screen.findByRole('button', { name: 'Assess a player' }))
    await waitFor(() => expect(window.location.pathname).toBe('/coach/assess'))
    cleanup()
    renderApp('/coach/home')
    await userEvent.click(await screen.findByRole('button', { name: 'Log a match or training' }))
    await waitFor(() => expect(window.location.pathname).toBe('/coach/sessions'))
  })

  it('stay when the overview fails, so the coach can still work', async () => {
    home({ players: [player('a', 'Ade Okafor')] })
    server.use(http.get(`${SUPABASE_URL}/rest/v1/coach_assessments`, () => HttpResponse.json({ message: 'down' }, { status: 500 })))
    renderApp('/coach/home')
    expect(await within(await region()).findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Assess a player' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log a match or training' })).toBeInTheDocument()
  })
})
