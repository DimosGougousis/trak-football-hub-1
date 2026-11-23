/**
 * TRAK-441 slice 5 (mockup 12 Nov), behind the academy's family_look switch: the parent's season and evaluation in the
 * coach's page header. The bands are the coach's bars with the band's word, never a number; the evaluation has no note
 * and never says there is one, and the note is never asked for. With the switch off, each page is today's. Test people
 * are named after footballers.
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
let PARENT = { id: 'season-profile-parent' }
const CHILD = 'child-giourkas-sp'
const NOTE = 'Tires after an hour; keep it between us.'
let switchOn = true
let noteReads = 0
const realMatchMedia = window.matchMedia
function screenIs(laptop: boolean) {
  window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: laptop && query === SIDE_MENU_QUERY })) as typeof window.matchMedia
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(laptop ? 1440 : 390)
}

const PLAN = {
  squad_player_id: 'sq-sp', squad: 'U16', coach_name: 'Otto Rehhagel', time_zone: 'Asia/Dubai',
  starts_on: '2098-09-01', ends_on: '2099-06-30', eval_every: 'month', eval_day: 0, last_evaluation_on: null,
  position: 'Right back', also_plays: ['Centre back'], roles: [],
  season_objectives: [{ id: 'so-1', place: 1, title: 'Win the ball back in their half', looks_like: 'We press as a unit.' }],
  objectives: [{ id: 'po-1', slot: 1, title: 'Deliver from wide areas', status: 'open', current: 'on_track', supports: null,
    history: [{ due_on: '2026-10-11', status: 'not_yet' }, { due_on: '2026-11-08', status: 'on_track' }] }],
  is_new: false, shared_at: '2098-09-01T10:00:00Z',
}
const EVALUATION = { id: 'eval-sp', squad_player_id: 'sq-sp', session_id: null, evaluation_id: 'ev-1', created_at: '2026-11-08T10:00:00Z',
  coach_user_id: 'coach-sp', coach_rating: 7.5, work_rate: 9.2, tactical: 7.1, attitude: 8.2, technical: 7.4, physical: 6.3, coachability: 8.5,
  private_note: NOTE }

beforeEach(() => {
  localStorage.clear()
  switchOn = true
  noteReads = 0
  PARENT = { id: `season-profile-parent-${++n}` }
  signInAs(PARENT)
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/profiles`, ({ request }) => {
      const asked = new URL(request.url).searchParams.get('user_id') ?? ''
      if (asked.includes(PARENT.id)) return HttpResponse.json({ id: 'p', user_id: PARENT.id, role: 'parent', full_name: 'Eleni Seitaridi', nationality: null })
      return HttpResponse.json([{ user_id: CHILD, full_name: 'Giourkas Seitaridis' }])
    }),
    http.get(`${SUPABASE_URL}/rest/v1/coach_assessments`, ({ request }) => {
      const id = new URL(request.url).searchParams.get('id')
      const found = [EVALUATION].filter(row => !id || id === `eq.${row.id}`)
      return HttpResponse.json(request.headers.get('accept')?.includes('vnd.pgrst.object') ? (found[0] ?? null) : found)
    }),
    http.get(`${SUPABASE_URL}/rest/v1/coach_shared_feedback`, () => { noteReads++; return HttpResponse.json([{ body: NOTE }]) }),
    table('player_parent_links', [{ player_user_id: CHILD }]),
    table('player_details', [{ position: 'Defender', current_club: 'Rehearsal FC', age_group: 'U16' }]),
    table('parental_consents', [{ id: '7b0e3c3a-4a3c-4a6b-9d2a-3d1f0c2b1a11' }]), table('squad_players', [{ id: 'sq-sp', coach_user_id: 'coach-sp' }]),
    table('recognition_awards', []), table('matches', []), table('game_for_family', []), table('game_review_for_family', []),
    table('notification_settings', [{ event_reminders: true }]),
    rpcRows('child_events', []), rpcRows('family_training_history', []), rpcRows('get_children_awaiting_consent', []),
    rpcRows('get_roster_children_awaiting_consent', []), rpcRows('get_my_child_logins', []), rpcRows('get_my_approved_children_awaiting_signup', []),
    rpcRows('season_plan_for_player', [PLAN]), rpc('mark_season_plan_seen', () => null),
    rpc('evaluation_progress', () => [{ assessment_id: 'eval-sp', due_on: '2026-11-08', objectives: PLAN.objectives.map(o => ({ id: o.id, title: o.title, status: 'on_track', history: o.history })) }]),
    rpcRows('family_academy', [{ name: 'Rehearsal FC', logo_url: null }]),
    rpcRows('my_calendar_link', [{ created_at: '2026-11-01T10:00:00Z', last_fetched_at: '2026-11-15T10:00:00Z' }]),
    rpc('guardian_consent_applies', () => true),
    rpc('family_feature_on', ({ p_feature }) => switchOn && p_feature === 'family_look'),
  )
})
afterEach(() => { cleanup(); window.matchMedia = realMatchMedia; vi.restoreAllMocks(); delete document.documentElement.dataset.layout })

const BAND_WORDS = /Exceptional|Standout|Good|Steady|Mixed|Developing/
/** A parent's page never has the coach's note, the job, or the words for them. */
function expectNothingHeldBack() {
  const shown = document.body.textContent ?? ''
  expect(shown).not.toContain(NOTE)
  expect(shown).not.toMatch(/\b(jobs?|notes?)\b/i)
}

describe("TRAK-441 slice 5: the parent's season in the coach's look", () => {
  it("a phone: Giourkas's season in the page header with the trail, his position, his objectives, the squad's; no helper line", async () => {
    screenIs(false)
    renderApp('/parent/season')
    expect(await screen.findByRole('heading', { level: 1, name: 'Giourkas’s season' }, { timeout: 5000 })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/parent/home')
    expect(screen.getByText('2098/99')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Giourkas’s position' })).getByText('Right back')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Giourkas’s objectives' })).getByText('On track')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Squad objectives' })).getByText('Win the ball back in their half')).toBeInTheDocument()
    // TRAK-536: the helper line is gone from both looks (TRAK-494); today's page is the one with a "Back" link.
    expect(screen.queryByRole('link', { name: 'Back' })).toBeNull()
    expectNothingHeldBack()
  })

  it("with the switch off: today's page", async () => {
    switchOn = false
    screenIs(false)
    renderApp('/parent/season')
    expect(await screen.findByRole('heading', { level: 1, name: /^Giourkas.s season$/ }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/parent/home')
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull()
  })
})

describe("TRAK-441 slice 5: the parent's evaluation in the coach's look", () => {
  it('Bands as bars with words and no number, Progress, and no note nor a line about one', async () => {
    screenIs(false)
    renderApp('/parent/assessment/eval-sp')
    expect(await screen.findByRole('heading', { level: 1, name: 'Evaluation' }, { timeout: 5000 })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/parent/home')
    expect(screen.getByText('Sun 8 Nov')).toBeInTheDocument()
    const bands = screen.getByRole('region', { name: 'Bands' })
    expect(within(bands).getAllByText(BAND_WORDS)).toHaveLength(6)
    expect(bands.textContent).not.toMatch(/\d/)
    expect(within(await screen.findByRole('region', { name: 'Progress' })).getByText('Deliver from wide areas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /All assessments/ })).toHaveAttribute('href', '/parent/assessments')
    expectNothingHeldBack()
    expect(noteReads).toBe(0)
  })

  it("with the switch off: today's page", async () => {
    switchOn = false
    screenIs(false)
    renderApp('/parent/assessment/eval-sp')
    expect(await screen.findByText(/Your coach's note is for/, {}, { timeout: 5000 })).toBeInTheDocument()
  })
})
