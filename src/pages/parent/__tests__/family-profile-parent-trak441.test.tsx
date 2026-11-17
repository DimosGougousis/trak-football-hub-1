/**
 * TRAK-441 slice 6 (mockup 12 Nov), behind the academy's family_look switch: the parent's Profile in the coach's look.
 * Who they are, Your children with consent, and Account, keeping consent withdrawal. Nothing on it names a job or a
 * note. With the switch off, today's Profile. Test people are named after footballers.
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

describe("TRAK-441 slice 6: the parent's Profile in the coach's look", () => {
  it('who they are, Your children with consent, and Account; consent withdrawal is still there', async () => {
    screenIs(false)
    renderApp('/parent/profile')
    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getAllByText('Eleni Seitaridi').length).toBeGreaterThan(0)
    const children = await screen.findByRole('region', { name: 'Your children' })
    expect(within(children).getByText('Giourkas Seitaridis')).toBeInTheDocument()
    expect(await within(children).findByText('U16 · Right back')).toBeInTheDocument()
    expect(await within(children).findByText('Consent given')).toBeInTheDocument()

    const account = screen.getByRole('region', { name: 'Account' })
    expect(await within(account).findByRole('link', { name: /Calendar.*In your calendar/ })).toHaveAttribute('href', '/settings#calendar')
    expect(await within(account).findByRole('link', { name: /Emails.*On/ })).toHaveAttribute('href', '/settings#notifications')
    expect(within(account).getByRole('link', { name: /Language.*English/ })).toHaveAttribute('href', '/settings#language')
    expect(within(account).getByRole('link', { name: 'How Trak works' })).toHaveAttribute('href', '/how-it-works')
    expect(within(account).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(within(account).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    const consent = within(account).getByRole('button', { name: 'Consent' })
    expect(consent).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Withdraw consent for Giourkas Seitaridis' })).toBeNull()
    await userEvent.click(consent)
    expect(consent).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByRole('button', { name: 'Withdraw consent for Giourkas Seitaridis' })).toBeInTheDocument()
    expect(screen.queryByText('CONNECTIONS')).toBeNull()
    expectNothingHeldBack()
  })

  it("with the switch off: today's Profile", async () => {
    switchOn = false
    screenIs(false)
    renderApp('/parent/profile')
    expect(await screen.findByText('CONNECTIONS', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Withdraw consent for Giourkas Seitaridis' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Your children' })).toBeNull())
  })
})
