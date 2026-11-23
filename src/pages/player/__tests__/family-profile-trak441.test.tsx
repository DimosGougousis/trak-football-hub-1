/**
 * TRAK-441 slice 6 (mockup 12 Nov), behind the academy's family_look switch: the player's Profile in the coach's look.
 * Who he is, My card (the latest evaluation's bars, no number, with its date and the earlier ones) and Account (each row
 * opening its place, Sign out signing out). With the switch off, today's Profile. Test people are named after footballers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const BAND_WORDS = /Exceptional|Good|Steady|Developing|Difficult/ // TRAK-556: the five bands

describe("TRAK-441 slice 6: the player's Profile in the coach's look", () => {
  // Live, 16 Nov: a player can't read his parent's name (the database hides it), so the row read "Your parent" and nothing.
  it("a linked parent whose name is hidden reads Linked, never an empty row", async () => {
    screenIs(false)
    server.use(http.get(`${SUPABASE_URL}/rest/v1/profiles`, ({ request }) => {
      const asked = new URL(request.url).searchParams.get('user_id') ?? ''
      if (asked.includes(PLAYER.id)) return HttpResponse.json({ id: 'p', user_id: PLAYER.id, role: 'player', full_name: 'Giourkas Seitaridis' })
      if (asked === 'eq.coach-1') return HttpResponse.json({ user_id: 'coach-1', full_name: 'Otto Rehhagel' })
      return HttpResponse.json([{ user_id: 'coach-1', full_name: 'Otto Rehhagel' }])
    }))
    renderApp('/player/profile')
    const account = await screen.findByRole('region', { name: 'Account' }, { timeout: 5000 })
    const row = (await within(account).findByText('Your parent')).closest('li') as HTMLElement
    expect(await within(row).findByText('Linked')).toBeInTheDocument()
  })

  it('who he is, My card with the latest bars and its date, earlier evaluations, and Account', async () => {
    screenIs(false)
    renderApp('/player/profile')
    expect(await screen.findByText('Right back · U16', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByText('Rehearsal FC · Coach Otto Rehhagel')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()

    const card = await screen.findByRole('region', { name: 'My card' })
    expect(within(card).getByText('Sun 8 Nov')).toBeInTheDocument()
    expect(within(card).getAllByText(BAND_WORDS)).toHaveLength(6)
    expect(within(card).queryByText(/^\d+(\.\d+)?$/)).toBeNull()
    expect(card.textContent).not.toMatch(/\d\.\d/)
    expect(within(card).getByRole('link', { name: /Open evaluation/ })).toHaveAttribute('href', '/player/feedback/eval-2')
    expect(within(card).getByRole('link', { name: /Sat 12 Sep/ })).toHaveAttribute('href', '/player/feedback/eval-1')

    const account = screen.getByRole('region', { name: 'Account' })
    expect(await within(account).findByRole('link', { name: /Calendar.*In your calendar/ })).toHaveAttribute('href', '/settings#calendar')
    expect(within(account).getByRole('link', { name: /Language.*English/ })).toHaveAttribute('href', '/settings#language')
    expect(await within(account).findByText('Eleni Seitaridi')).toBeInTheDocument()
    expect(within(account).getByText('Your parent')).toBeInTheDocument()
    expect(within(account).getByRole('link', { name: 'How Trak works' })).toHaveAttribute('href', '/how-it-works')
    expect(within(account).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(within(account).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    // The old blocks: Passport (parked) and the 0–99 style labels are gone.
    expect(screen.queryByText('MY PASSPORT')).toBeNull()
    expect(screen.queryByText('COACH ASSESSMENTS')).toBeNull()
  })

  it('Sign out signs the player out', async () => {
    screenIs(false)
    let out = 0
    server.use(http.post(`${SUPABASE_URL}/auth/v1/logout`, () => { out++; return new HttpResponse(null, { status: 204 }) }))
    renderApp('/player/profile')
    const account = await screen.findByRole('region', { name: 'Account' }, { timeout: 5000 })
    await userEvent.click(within(account).getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(out).toBe(1))
  })

  it("with the switch off: today's Profile", async () => {
    switchOn = false
    screenIs(false)
    renderApp('/player/profile')
    expect(await screen.findByText('COACH ASSESSMENTS', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('MY PASSPORT')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'My card' })).toBeNull()
  })
})
