/**
 * TRAK-530 (Reports 7/10, Imad 21 Nov): the family's Profile lists the reports, and the bell says "New report from
 * Coach {name}" for the latest one and opens it, for the player and the parent; nothing in the new look links to an
 * assessment any more. Opening a report counts for the pilot (feedback_opened, assessment_viewed). Footballers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../tests/support/render-app'
import { signInAs } from '../../../tests/support/session'
import { server } from '../../../tests/msw/server'
import { rpc, rpcRows, table, SUPABASE_URL } from '../../../tests/msw/supabase'

let n = 0
let READER = { id: 'reader-530' }
const CHILD = 'child-maldini-530'
const COACH = 'coach-ancelotti-530'
const realMatchMedia = window.matchMedia
function phone() {
  window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: false })) as typeof window.matchMedia
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390)
}

const day = (id: string, report_day: string) => ({
  evaluation_id: id, sent_at: `${report_day}T18:00:00Z`, note: '',
  report: { squad_player_id: 'sq-530', player_name: 'Paolo Maldini', squad: 'U16', season_starts_on: '2026-08-01',
    period_from: '2026-08-01', report_day, last_report_day: null, before_season: null, matches: [], objectives: [],
    trainings: { attended: 0, total: 0 },
    assessments: [{ id: `a-${id}`, day: report_day, work_rate: 8, technical: 7, physical: 7, coachability: 8, attitude: 7, tactical: 7 }] },
})
// Sent within the bell's window: today's report day.
const today = new Date().toISOString().slice(0, 10)
const REPORTS = [day('ev-aug', '2026-08-30'), day('ev-sep', '2026-09-27'), day('ev-now', today)]
// An evaluation's assessment, published, as before reports: the new look no longer alerts it or links to it.
const ASSESSMENT = { id: 'old-eval', squad_player_id: 'sq-530', session_id: null, evaluation_id: 'ev-sep', coach_user_id: COACH,
  created_at: new Date().toISOString(), coach_rating: 7, work_rate: 8, tactical: 7, attitude: 7, technical: 7, physical: 7, coachability: 8 }

let asked: string[] = []
let events: { event_type: string; metadata: Record<string, unknown> }[] = []
const reports = (name: 'report_for_player' | 'report_for_family') =>
  http.get(`${SUPABASE_URL}/rest/v1/${name}`, () => { asked.push(name); return HttpResponse.json(REPORTS) })
const profiles = (me: Record<string, unknown>) => http.get(`${SUPABASE_URL}/rest/v1/profiles`, ({ request }) => {
  const id = new URL(request.url).searchParams.get('user_id') ?? ''
  if (id.includes(String(me.user_id))) return HttpResponse.json(request.headers.get('Accept')?.includes('pgrst.object') ? me : [me])
  return HttpResponse.json([{ user_id: COACH, full_name: 'Carlo Ancelotti' }, { user_id: CHILD, full_name: 'Paolo Maldini' }])
})

function asPlayer() {
  READER = { id: CHILD }
  signInAs(READER)
  server.use(
    profiles({ id: 'p', user_id: CHILD, role: 'player', full_name: 'Paolo Maldini' }),
    table('player_details', [{ position: 'Defender', current_club: 'Rehearsal FC', age_group: 'U16' }]),
    table('coach_shared_feedback', [{ body: 'Keep talking to Nesta.', published_at: ASSESSMENT.created_at }]),
    table('game_for_player', []),
    rpc('get_player_invites_for_current_user', () => []),
    rpc('my_consent_status', () => ({ required: false, invited_parent: null })),
  )
}

function asParent() {
  READER = { id: `parent-530-${++n}` }
  signInAs(READER)
  server.use(
    profiles({ id: 'p', user_id: READER.id, role: 'parent', full_name: 'Cesare Maldini', nationality: null }),
    table('player_parent_links', [{ player_user_id: CHILD }]), table('parental_consents', []), table('player_details', []),
    rpcRows('get_children_awaiting_consent', []), rpcRows('get_roster_children_awaiting_consent', []),
    rpcRows('get_my_child_logins', []), rpcRows('get_my_approved_children_awaiting_signup', []),
    rpc('guardian_consent_applies', () => true),
  )
}

beforeEach(() => {
  localStorage.clear()
  asked = []
  events = []
  server.use(
    table('squad_players', [{ id: 'sq-530', coach_user_id: COACH }]),
    table('coach_assessments', [ASSESSMENT]), table('recognition_awards', []), table('matches', []),
    table('game_for_family', []), table('game_review_for_family', []), table('event_absences', []),
    table('notification_settings', []), table('player_parent_links', []),
    reports('report_for_player'), reports('report_for_family'),
    rpcRows('child_events', []), rpcRows('season_plan_for_player', []), rpcRows('family_training_history', []),
    rpcRows('family_academy', [{ name: 'Rehearsal FC', logo_url: null }]), rpcRows('child_training_attendance', []),
    rpc('evaluation_progress', () => []),
    rpc('family_feature_on', ({ p_feature }) => p_feature === 'family_look'),
    http.post(`${SUPABASE_URL}/rest/v1/telemetry_events`, async ({ request }) => {
      events.push(await request.json() as typeof events[number]); return new HttpResponse(null, { status: 201 })
    }),
  )
  phone()
})
afterEach(() => { cleanup(); window.matchMedia = realMatchMedia; vi.restoreAllMocks(); delete document.documentElement.dataset.layout })

const reportLinks = (region: HTMLElement) => within(region).getAllByRole('link').map(link => [link.textContent, link.getAttribute('href')])

describe('TRAK-530: the family Profile and the bell point to reports', () => {
  it("the player's Profile lists his three reports, newest first, each opening its report; none opens an assessment", async () => {
    asPlayer()
    renderApp('/player/profile')
    const list = await screen.findByRole('region', { name: 'Reports' }, { timeout: 5000 })
    const links = reportLinks(list)
    expect(links.map(([, href]) => href)).toEqual(['/player/report/ev-now', '/player/report/ev-sep', '/player/report/ev-aug'])
    expect(links[1][0]).toMatch(/^September report/)
    expect(document.querySelector('a[href*="/feedback/"], a[href*="/assessment"]')).toBeNull()
    expect(asked).toEqual(['report_for_player'])
  })

  it("the parent's Profile lists the same three for Paolo, from the parents' copy", async () => {
    asParent()
    renderApp('/parent/profile')
    const list = await screen.findByRole('region', { name: 'Paolo’s reports' }, { timeout: 5000 })
    expect(reportLinks(list).map(([, href]) => href)).toEqual(['/parent/report/ev-now', '/parent/report/ev-sep', '/parent/report/ev-aug'])
    expect(document.querySelector('a[href*="/feedback/"], a[href*="/assessment"]')).toBeNull()
    expect(new Set(asked)).toEqual(new Set(['report_for_family']))
  })

  it('"All assessments" is "All reports" for a parent', async () => {
    asParent()
    renderApp('/parent/assessments')
    expect(await screen.findByRole('heading', { name: 'All reports', level: 1 }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /report/ }).map(link => link.getAttribute('href')).filter(href => href?.startsWith('/parent/report/')))
      .toEqual(['/parent/report/ev-now', '/parent/report/ev-sep', '/parent/report/ev-aug'])
  })

  for (const as of ['player', 'parent'] as const) {
    it(`the ${as}'s bell: one "New report from Coach Carlo Ancelotti" that opens the report, and no assessment alert`, async () => {
      if (as === 'player') asPlayer(); else asParent()
      renderApp(`/${as}/home`)
      await screen.findByRole('region', { name: 'Latest report' }, { timeout: 5000 })
      await userEvent.click(screen.getByRole('button', { name: /^Alerts/ }))
      const panel = await screen.findByRole('dialog', { name: 'Alerts' })
      await waitFor(() => expect(within(panel).getAllByRole('button', { name: /^New report from Coach Carlo Ancelotti/ })).toHaveLength(1))
      expect(within(panel).queryByText(/New assessment/)).toBeNull()
      await userEvent.click(within(panel).getByRole('button', { name: /^New report from Coach Carlo Ancelotti.*Show details$/ }))
      await userEvent.click(within(panel).getByRole('button', { name: 'Open report' }))
      await waitFor(() => expect(window.location.pathname).toBe(`/${as}/report/ev-now`))
      // Read on this device: back on Home, the bell has nothing unread.
      await screen.findByRole('heading', { level: 1, name: /report$/ })
      window.history.back()
      await screen.findByRole('region', { name: 'Latest report' }, { timeout: 5000 })
      await waitFor(() => expect(screen.getByRole('button', { name: /^Alerts/ })).toHaveAccessibleName('Alerts'))
    }, 15_000)
  }

  it("a report opened from Home's card is read in the bell too", async () => {
    asPlayer()
    renderApp('/player/home')
    await screen.findByRole('region', { name: 'Latest report' }, { timeout: 5000 })
    await waitFor(() => expect(screen.getByRole('button', { name: /^Alerts/ })).toHaveAccessibleName('Alerts, 1 unread'))
    await userEvent.click(within(screen.getByRole('region', { name: 'Latest report' })).getByRole('link', { name: /Open report/ }))
    await screen.findByRole('heading', { level: 1, name: /report$/ })
    window.history.back()
    await screen.findByRole('region', { name: 'Latest report' }, { timeout: 5000 })
    await waitFor(() => expect(screen.getByRole('button', { name: /^Alerts/ })).toHaveAccessibleName('Alerts'))
  }, 15_000)

  for (const [as, type] of [['player', 'feedback_opened'], ['parent', 'assessment_viewed']] as const) {
    it(`opening a report counts for the pilot: ${type}, with the report day's assessment`, async () => {
      if (as === 'player') asPlayer(); else asParent()
      renderApp(`/${as}/report/ev-sep`)
      await screen.findByRole('heading', { name: 'September report', level: 1 }, { timeout: 5000 })
      await waitFor(() => expect(events.filter(event => event.event_type === type).map(event => event.metadata))
        .toEqual([{ assessment_id: 'a-ev-sep', evaluation_id: 'ev-sep' }]))
    })
  }
})
