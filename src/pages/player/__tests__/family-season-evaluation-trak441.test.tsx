/**
 * TRAK-441 slice 5 (mockup 12 Nov), behind the academy's family_look switch: the player's My season and evaluation in
 * the coach's page header, with the trail in the page on a phone and in the top bar on a laptop. The bands are the
 * coach's bars with the band's word, never a number; the coach's note has no "only you" line. With the switch off, each
 * page is today's. Test people are named after footballers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { rpc, rpcRows, table, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { SIDE_MENU_QUERY } from '@/lib/side-menu-screen'

let n = 0
let PLAYER = { id: 'season-profile-player' }
let switchOn = true
const NOTE = 'Your crossing has come on a lot since October.'
const realMatchMedia = window.matchMedia
function screenIs(laptop: boolean) {
  window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: laptop && query === SIDE_MENU_QUERY })) as typeof window.matchMedia
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(laptop ? 1440 : 390)
}

const PLAN = {
  squad_player_id: 'squad-1', squad: 'U16', coach_name: 'Otto Rehhagel', time_zone: 'Asia/Dubai',
  starts_on: '2098-09-01', ends_on: '2099-06-30', eval_every: 'month', eval_day: 0, last_evaluation_on: null,
  position: 'Right back', also_plays: ['Centre back'], roles: [],
  season_objectives: [{ id: 'so-1', place: 1, title: 'Win the ball back in their half', looks_like: 'We press as a unit.' }],
  objectives: [{ id: 'po-1', slot: 1, title: 'Deliver from wide areas', status: 'open', current: 'on_track', supports: null,
    history: [{ due_on: '2026-10-11', status: 'not_yet' }, { due_on: '2026-11-08', status: 'on_track' }] }],
  is_new: false, shared_at: '2098-09-01T10:00:00Z',
}
const assessment = (id: string, created_at: string, evaluation: boolean) => ({ id, squad_player_id: 'squad-1', coach_user_id: 'coach-1',
  created_at, evaluation_id: evaluation ? 'ev-1' : null, session_id: null, coach_rating: 8,
  work_rate: 9.2, tactical: 7.1, attitude: 8.2, technical: 7.4, physical: 6.3, coachability: 8.5 })
const ROWS = [assessment('eval-2', '2026-11-08T10:00:00Z', true), assessment('eval-1', '2026-09-12T10:00:00Z', false)]

beforeEach(() => {
  localStorage.clear()
  switchOn = true
  PLAYER = { id: `season-profile-player-${++n}` }
  signInAs(PLAYER)
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/profiles`, ({ request }) => {
      const asked = new URL(request.url).searchParams.get('user_id') ?? ''
      if (asked.includes(PLAYER.id)) return HttpResponse.json({ id: 'p', user_id: PLAYER.id, role: 'player', full_name: 'Giourkas Seitaridis' })
      if (asked === 'eq.coach-1') return HttpResponse.json({ user_id: 'coach-1', full_name: 'Otto Rehhagel' })
      return HttpResponse.json([{ user_id: 'coach-1', full_name: 'Otto Rehhagel' }, { user_id: 'parent-1', full_name: 'Eleni Seitaridi' }])
    }),
    http.get(`${SUPABASE_URL}/rest/v1/coach_assessments`, ({ request }) => {
      const id = new URL(request.url).searchParams.get('id')
      const found = ROWS.filter(row => !id || id === `eq.${row.id}`)
      return HttpResponse.json(request.headers.get('accept')?.includes('vnd.pgrst.object') ? (found[0] ?? null) : found)
    }),
    table('player_details', [{ user_id: PLAYER.id, position: 'Defender', current_club: 'Sign-up FC', age_group: 'U16', shirt_number: 2 }]),
    table('squad_players', [{ id: 'squad-1', coach_user_id: 'coach-1', linked_player_id: PLAYER.id, status: 'active' }]),
    table('player_parent_links', [{ parent_user_id: 'parent-1' }]),
    table('coach_shared_feedback', [{ body: NOTE, published_at: '2026-11-08T10:00:00Z' }]),
    table('notification_settings', [{ event_reminders: true }]),
    rpcRows('season_plan_for_player', [PLAN]),
    rpc('mark_season_plan_seen', () => null),
    rpc('evaluation_progress', () => [{ assessment_id: 'eval-2', due_on: '2026-11-08', objectives: PLAN.objectives.map(o => ({ id: o.id, title: o.title, status: 'on_track', history: o.history })) }]),
    rpcRows('family_academy', [{ name: 'Rehearsal FC', logo_url: null }]),
    rpcRows('my_calendar_link', [{ created_at: '2026-11-01T10:00:00Z', last_fetched_at: '2026-11-15T10:00:00Z' }]),
    rpc('get_player_invites_for_current_user', () => []),
    rpc('my_consent_status', () => ({ required: false, invited_parent: null })),
    rpc('family_feature_on', ({ p_feature }) => switchOn && p_feature === 'family_look'),
  )
})
afterEach(() => { cleanup(); window.matchMedia = realMatchMedia; vi.restoreAllMocks(); delete document.documentElement.dataset.layout })

const BAND_WORDS = /Exceptional|Standout|Good|Steady|Mixed|Developing/

describe("TRAK-441 slice 5: the player's My season in the coach's look", () => {
  it('a phone: the page header with the trail, the season pill, the next evaluation and three cards', async () => {
    screenIs(false)
    renderApp('/player/season')
    expect(await screen.findByRole('heading', { level: 1, name: 'My season' }, { timeout: 5000 })).toBeInTheDocument()
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(trail).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/player/home')
    expect(screen.getByText('2098/99')).toBeInTheDocument()
    expect(screen.getByText(/Next evaluation/)).toBeInTheDocument()
    const position = screen.getByRole('region', { name: 'Your position' })
    expect(within(position).getByText('Right back')).toBeInTheDocument()
    expect(within(position).getByText('Can also play Centre back')).toBeInTheDocument()
    const own = screen.getByRole('region', { name: 'Your objectives' })
    expect(within(own).getByText('Deliver from wide areas')).toBeInTheDocument()
    expect(within(own).getByText('On track')).toBeInTheDocument()
    const squad = screen.getByRole('region', { name: 'Squad objectives' })
    expect(within(squad).getByText('Win the ball back in their half')).toBeInTheDocument()
    expect(within(squad).getByText('We press as a unit.')).toBeInTheDocument()
    // Removed so nothing is said twice: "Set by Coach Otto" and the old Back link.
    expect(screen.queryByText(/Set by/)).toBeNull()
    expect(screen.queryByRole('link', { name: /Back/ })).toBeNull()
  })

  it('a laptop: the trail is the top bar\'s, not the page\'s', async () => {
    screenIs(true)
    renderApp('/player/season')
    await screen.findByRole('navigation', { name: 'Trak' }, { timeout: 5000 })
    const page = await screen.findByRole('region', { name: 'My season' })
    expect(within(page).queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Home' }).length).toBeGreaterThan(0)
  }, 15_000)

  it("with the switch off: today's page", async () => {
    switchOn = false
    screenIs(false)
    renderApp('/player/season')
    expect(await screen.findByText(/^Set by Otto Rehhagel\./, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back/ })).toBeInTheDocument()
  })
})

describe("TRAK-441 slice 5: the player's evaluation in the coach's look", () => {
  it('Bands as the coach\'s bars with words and no number, Progress, and the coach\'s note with no "only you"', async () => {
    screenIs(false)
    renderApp('/player/feedback/eval-2')
    expect(await screen.findByRole('heading', { level: 1, name: 'Evaluation' }, { timeout: 5000 })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/player/home')
    expect(screen.getByText('Sun 8 Nov')).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()
    const bands = screen.getByRole('region', { name: 'Bands' })
    for (const label of ['Work Rate', 'Tactical', 'Attitude', 'Technical', 'Physical', 'Coachability']) expect(within(bands).getByText(label)).toBeInTheDocument()
    expect(within(bands).getAllByText(BAND_WORDS)).toHaveLength(6)
    expect(bands.textContent).not.toMatch(/\d/)
    const progress = await screen.findByRole('region', { name: 'Progress' })
    expect(within(progress).getByText('Deliver from wide areas')).toBeInTheDocument()
    const note = await screen.findByRole('region', { name: 'From Coach Otto Rehhagel' })
    expect(within(note).getByText(NOTE)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/only you/i)
  })

  it("with the switch off: today's page", async () => {
    switchOn = false
    screenIs(false)
    renderApp('/player/feedback/eval-2')
    expect(await screen.findByText('From your coach, only you see this', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeInTheDocument()
  })
})
