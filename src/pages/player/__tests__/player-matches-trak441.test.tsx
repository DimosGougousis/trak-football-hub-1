/**
 * TRAK-441 slice 4 (spec "Matches (was Sessions)", Imad 12 Nov), behind the academy's family_look switch: the player's
 * Matches tab in the coach's look. Next match (who, when, his role, Open game plan and New while unopened), Coming up
 * (the other matches ahead), Previous matches (result, and "Review in" while the coach's review is unread). Matches
 * only: no filter chips, no training in the lists. Training history stays under them until the Trainings slice takes
 * it. With the switch off, today's Sessions page. Test people are named after footballers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { rpc, rpcRows, table } from '../../../../tests/msw/supabase'
import { SIDE_MENU_QUERY } from '@/lib/side-menu-screen'
import { markOpened } from '@/lib/games/news'

let n = 0
let PLAYER = { id: 'matches-player' }
let switchOn = true
const realMatchMedia = window.matchMedia
function screenIs(laptop: boolean) {
  window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: laptop && query === SIDE_MENU_QUERY })) as typeof window.matchMedia
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(laptop ? 1440 : 390)
}
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString('en-CA')
const event = (id: string, type: string, extra: Record<string, unknown>) => ({ id, event_type: type, title: null, status: 'scheduled', sequence: 0,
  updated_at: '2026-11-01T00:00:00Z', ...extra })
const EVENTS = [
  event('ev-parkview', 'match', { opponent: 'Parkview Athletic U16', home_away: 'home', venue: 'Rehearsal Park', event_date: day(0), start_time: '23:30:00' }),
  event('ev-training', 'training', { title: 'Passing drills', venue: 'Rehearsal Park', event_date: day(1), start_time: '18:00:00' }),
  event('ev-riverside', 'match', { opponent: 'Riverside Academy U16', home_away: 'away', event_date: day(7), start_time: '10:00:00' }),
]
const MATCH_ROWS = [
  { id: 'm-lakeside', session_id: 'sess-lakeside', opponent: 'Lakeside FC U16', competition: 'League', match_date: '2026-11-06', team_score: 2, opponent_score: 1 },
  { id: 'm-marina', session_id: 'sess-marina', opponent: 'Marina United U16', competition: 'Tournament', match_date: '2026-10-31', team_score: 1, opponent_score: 1 },
  { id: 'm-hillcrest', session_id: null, opponent: 'Hillcrest Juniors U16', competition: 'Friendly', match_date: '2026-10-24', team_score: 0, opponent_score: 1 },
  { id: 'm-northgate', session_id: null, opponent: 'Northgate Boys U16', competition: 'League', match_date: '2026-10-17', team_score: 3, opponent_score: 0 },
  { id: 'm-eastfield', session_id: null, opponent: 'Eastfield Rovers U16', competition: 'League', match_date: '2026-10-10', team_score: 2, opponent_score: 2 },
].map(row => ({ created_at: `${row.match_date}T12:00:00Z`, venue: null, computed_rating: null, ...row }))

beforeEach(() => {
  localStorage.clear()
  switchOn = true
  PLAYER = { id: `matches-player-${++n}` }
  signInAs(PLAYER)
  server.use(
    table('profiles', [{ user_id: PLAYER.id, role: 'player', full_name: 'Giourkas Seitaridis' }]),
    table('squad_players', [{ id: 'sq-1', coach_user_id: 'coach-1' }]),
    table('game_for_family', [{ event_id: 'ev-parkview', squad_player_id: 'sq-1', role: 'starter', shared_at: '2026-11-13T19:00:00Z', changed_at: null, coach_name: 'Otto Rehhagel' }]),
    table('game_for_player', []), table('game_lineup_for_players', []),
    table('game_review_for_family', [
      { event_id: 'ev-lakeside', session_id: 'sess-lakeside', squad_player_id: 'sq-1', published_at: '2026-11-07T09:00:00Z' },
      { event_id: 'ev-marina', session_id: 'sess-marina', squad_player_id: 'sq-1', published_at: '2026-11-01T09:00:00Z' },
    ]),
    table('matches', MATCH_ROWS), table('event_absences', []),
    rpcRows('child_events', EVENTS), rpcRows('family_training_history', [{ session_id: 's-1', session_date: '2026-11-11', focus: ['Pressing'], attendance: 'present' }]),
    rpcRows('family_academy', [{ name: 'Rehearsal FC', logo_url: null }]),
    rpc('my_consent_status', () => ({ required: false, invited_parent: null })),
    rpc('family_feature_on', ({ p_feature }) => switchOn && p_feature === 'family_look'),
  )
})
afterEach(() => { cleanup(); window.matchMedia = realMatchMedia; vi.restoreAllMocks(); delete document.documentElement.dataset.layout })

describe("TRAK-441 slice 4: the player's Matches in the coach's look", () => {
  it('a phone: the title, Next match with his role, Open game plan and New; matches only, no filter chips', async () => {
    screenIs(false)
    renderApp('/player/matches')
    const next = await screen.findByRole('region', { name: 'Next match' }, { timeout: 5000 })
    expect(screen.getByRole('heading', { level: 1, name: 'Matches' })).toBeInTheDocument()
    expect(within(next).getByText('vs Parkview Athletic U16')).toBeInTheDocument()
    expect(within(next).getByText('Today · Kick-off 23:30 · Home · Rehearsal Park')).toBeInTheDocument()
    expect(await within(next).findByText('You start')).toBeInTheDocument()
    expect(within(next).getByText('New')).toBeInTheDocument()

    const coming = screen.getByRole('region', { name: 'Coming up' })
    expect(within(coming).getByRole('link', { name: /vs Riverside Academy U16/ })).toHaveAttribute('href', '/player/event/ev-riverside')
    expect(within(coming).getByText(/10:00 · Away/)).toBeInTheDocument()
    expect(within(coming).queryByText('vs Parkview Athletic U16')).toBeNull()
    // Matches only: no training in the lists, and no filter chips.
    expect(screen.queryByText('Passing drills')).toBeNull()
    for (const chip of ['All', 'League', 'Tournament', 'Friendly']) expect(screen.queryByRole('button', { name: chip })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Sessions' })).toBeNull()
    // The button opens the match page at the game plan.
    await userEvent.click(within(next).getByRole('button', { name: 'Open game plan' }))
    await waitFor(() => expect(window.location.pathname + window.location.hash).toBe('/player/event/ev-parkview#game-plan'))
  })

  it('Previous matches: the result, "Review in" until the review is opened, the four latest then All', async () => {
    screenIs(false)
    // The Marina United review was opened on this device; Lakeside's wasn't.
    markOpened(PLAYER.id, PLAYER.id, 'review', 'ev-marina')
    renderApp('/player/matches')
    const played = await screen.findByRole('region', { name: 'Previous matches' }, { timeout: 5000 })
    const lakeside = await within(played).findByRole('link', { name: /vs Lakeside FC U16/ })
    expect(lakeside).toHaveAttribute('href', '/player/event/ev-lakeside')
    expect(lakeside).toHaveTextContent('Fri 6 Nov · League')
    expect(within(lakeside).getByText('Review in')).toBeInTheDocument()
    expect(within(lakeside).getByText('Won 2–1')).toBeInTheDocument()
    const marina = within(played).getByRole('link', { name: /vs Marina United U16/ })
    expect(within(marina).queryByText('Review in')).toBeNull()
    expect(within(marina).getByText('Drew 1–1')).toBeInTheDocument()
    // No review: the old match page.
    expect(within(played).getByRole('link', { name: /vs Hillcrest Juniors U16/ })).toHaveAttribute('href', '/player/match/m-hillcrest')
    expect(within(played).getAllByRole('link')).toHaveLength(4)
    expect(within(played).queryByText('vs Eastfield Rovers U16')).toBeNull()
    await userEvent.click(within(played).getByRole('button', { name: 'All 5' }))
    expect(within(played).getAllByRole('link')).toHaveLength(5)
    expect(within(played).getByText('Drew 2–2')).toBeInTheDocument()
    // Training history stays on this page until the Trainings slice takes it.
    expect(await screen.findByText('Pressing')).toBeInTheDocument()
  })

  it('an opened game plan is not New', async () => {
    screenIs(false)
    markOpened(PLAYER.id, PLAYER.id, 'plan', 'ev-parkview')
    renderApp('/player/matches')
    const next = await screen.findByRole('region', { name: 'Next match' }, { timeout: 5000 })
    expect(await within(next).findByText('You start')).toBeInTheDocument()
    expect(within(next).queryByText('New')).toBeNull()
  })

  it('a laptop: the title is the top bar\'s, not the page\'s', async () => {
    screenIs(true)
    renderApp('/player/matches')
    await screen.findByRole('navigation', { name: 'Trak' }, { timeout: 5000 })
    await screen.findByRole('region', { name: 'Next match' })
    expect(screen.queryByRole('heading', { level: 1, name: 'Matches' })).toBeNull()
    expect(await screen.findByRole('region', { name: 'Previous matches' })).toBeInTheDocument()
  }, 15_000)

  it("with the switch off: today's Sessions page, with its filter chips", async () => {
    switchOn = false
    screenIs(false)
    renderApp('/player/matches')
    expect(await screen.findByRole('heading', { name: 'Sessions' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'League' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Next match' })).toBeNull()
  })
})
