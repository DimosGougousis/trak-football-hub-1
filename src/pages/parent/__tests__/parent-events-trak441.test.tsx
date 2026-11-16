/**
 * TRAK-441 slice 4 (spec "Events", Imad 12 Nov), behind the academy's family_look switch: the parent's Events tab in
 * the coach's look. The child's events as day tiles, grouped by week, each saying what changed: Time changed,
 * Cancelled, Can't make it sent, and on a match whether the child starts. Never the job or the coach's note. With the
 * switch off, today's Events page. Test people are named after footballers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { addDays, format, startOfWeek } from 'date-fns'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { rpc, rpcRows, table, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { SIDE_MENU_QUERY } from '@/lib/side-menu-screen'

let n = 0
let PARENT = { id: 'parent-events-441' }
const CHILD = 'child-giourkas-events-441'
let switchOn = true
const realMatchMedia = window.matchMedia
function screenIs(laptop: boolean) {
  window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: laptop && query === SIDE_MENU_QUERY })) as typeof window.matchMedia
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(laptop ? 1440 : 390)
}
const today = format(new Date(), 'yyyy-MM-dd')
const nextMonday = startOfWeek(addDays(new Date(), 7), { weekStartsOn: 1 })
const nextWeek = (i: number) => format(addDays(nextMonday, i), 'yyyy-MM-dd')
const event = (id: string, type: string, extra: Record<string, unknown>) => ({ id, event_type: type, title: null, status: 'scheduled', sequence: 0,
  updated_at: '2026-11-01T00:00:00Z', venue: 'Rehearsal Park', ...extra })
const EVENTS = [
  event('ev-parkview', 'match', { opponent: 'Parkview Athletic U16', home_away: 'home', event_date: today, start_time: '23:30:00' }),
  event('ev-mon', 'training', { event_date: nextWeek(0), start_time: '18:30:00', sequence: 1 }),
  event('ev-wed', 'training', { event_date: nextWeek(2), start_time: '18:00:00' }),
  event('ev-fri', 'training', { event_date: nextWeek(4), start_time: '18:00:00', status: 'cancelled' }),
  event('ev-riverside', 'match', { opponent: 'Riverside Academy U16', home_away: 'away', event_date: nextWeek(5), start_time: '10:00:00' }),
]

beforeEach(() => {
  localStorage.clear()
  switchOn = true
  PARENT = { id: `parent-events-441-${++n}` }
  signInAs(PARENT)
  // This device saw Monday's training at 18:00 before the coach moved it to 18:30.
  localStorage.setItem(`trak:player-events-seen:${PARENT.id}`, JSON.stringify({ 'ev-mon': 0 }))
  localStorage.setItem(`trak:event-snapshots:${PARENT.id}`, JSON.stringify({ 'ev-mon': { sequence: 0, date: nextWeek(0), time: '18:00', venue: 'Rehearsal Park' } }))
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/profiles`, ({ request }) => {
      const asked = new URL(request.url).searchParams.get('user_id') ?? ''
      if (asked.includes(PARENT.id)) return HttpResponse.json({ id: 'p', user_id: PARENT.id, role: 'parent', full_name: 'Eleni Seitaridi', nationality: null })
      return HttpResponse.json([{ user_id: CHILD, full_name: 'Giourkas Seitaridis' }])
    }),
    table('player_parent_links', [{ player_user_id: CHILD }]),
    table('squad_players', [{ id: 'sq-441', coach_user_id: 'coach-441' }]),
    // The reads answer with the job and the notes, as if a later change asked for them: the page still shows none.
    table('game_for_family', [{ event_id: 'ev-parkview', squad_player_id: 'sq-441', role: 'starter', shared_at: '2026-11-13T19:00:00Z', changed_at: null,
      coach_name: 'Otto Rehhagel', job: 'Shadow their number nine', note: 'Keep him calm early' }]),
    table('game_review_for_family', [{ event_id: 'ev-lakeside', session_id: 'sess-lakeside', squad_player_id: 'sq-441', published_at: '2026-11-07T09:00:00Z',
      our_score: 2, their_score: 1, coach_name: 'Otto Rehhagel', job: 'Win every header', did_job: 'partly', note: 'Switched off late' }]),
    table('matches', [{ id: 'm-lakeside', session_id: 'sess-lakeside', opponent: 'Lakeside FC U16', competition: 'League', venue: null, match_date: '2026-11-06',
      created_at: '2026-11-06T12:00:00Z', team_score: 2, opponent_score: 1, computed_rating: 7.2 }]),
    table('event_absences', [{ event_id: 'ev-wed' }]),
    table('coach_assessments', []), table('recognition_awards', []), table('player_details', []), table('parental_consents', []),
    rpcRows('child_events', EVENTS), rpcRows('family_training_history', [{ session_id: 's-1', session_date: '2026-11-11', focus: ['Pressing'], attendance: 'present' }]),
    rpcRows('family_academy', [{ name: 'Rehearsal FC', logo_url: null }]), rpcRows('get_children_awaiting_consent', []),
    rpc('family_feature_on', ({ p_feature }) => switchOn && p_feature === 'family_look'),
  )
})
afterEach(() => { cleanup(); window.matchMedia = realMatchMedia; vi.restoreAllMocks(); delete document.documentElement.dataset.layout })

const row = (region: HTMLElement, name: RegExp) => within(region).getByRole('link', { name })

describe("TRAK-441 slice 4: the parent's Events in the coach's look", () => {
  it('a phone: the title, the child, and day tiles grouped by week, each with what changed', async () => {
    screenIs(false)
    renderApp('/parent/matches')
    const thisWeek = await screen.findByRole('region', { name: 'This week' }, { timeout: 5000 })
    expect(screen.getByRole('heading', { level: 1, name: 'Events' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Giourkas Seitaridis/ })).toBeInTheDocument()

    const parkview = row(thisWeek, /vs Parkview Athletic U16/)
    expect(parkview).toHaveAttribute('href', '/parent/event/ev-parkview')
    expect(parkview).toHaveTextContent(format(new Date(), 'EEE'))
    expect(parkview).toHaveTextContent('23:30 · Home')
    expect(await within(parkview).findByText('Giourkas starts')).toBeInTheDocument()

    const next = screen.getByRole('region', { name: 'Next week' })
    const monday = row(next, /^Mon/)
    expect(monday).toHaveTextContent(`Mon${format(nextMonday, 'd')}Training18:30 · Rehearsal Park`)
    expect(within(monday).getByText('Time changed')).toBeInTheDocument()
    expect(await within(row(next, /^Wed/)).findByText('Can’t make it sent')).toBeInTheDocument()
    expect(within(row(next, /^Fri/)).getByText('Cancelled')).toBeInTheDocument()
    const riverside = row(next, /vs Riverside Academy U16/)
    expect(riverside).toHaveTextContent('10:00 · Away')
    expect(within(riverside).queryByText(/starts|Changed|Cancelled|sent/)).toBeNull()
  })

  it('keeps the past: Previous matches opening the review, and the training history', async () => {
    screenIs(false)
    renderApp('/parent/matches')
    const played = await screen.findByRole('region', { name: 'Previous matches' }, { timeout: 5000 })
    const lakeside = await within(played).findByRole('link', { name: /vs Lakeside FC U16/ })
    expect(lakeside).toHaveAttribute('href', '/parent/event/ev-lakeside')
    expect(within(lakeside).getByText('Won 2–1')).toBeInTheDocument()
    expect(await screen.findByText('Pressing')).toBeInTheDocument()
  })

  it("privacy: the job and the coach's note never reach the parent's Events, nor a line saying they exist", async () => {
    screenIs(false)
    renderApp('/parent/matches')
    const thisWeek = await screen.findByRole('region', { name: 'This week' }, { timeout: 5000 })
    await within(thisWeek).findByText('Giourkas starts')
    await screen.findByRole('link', { name: /vs Lakeside FC U16/ })
    await screen.findByText('Pressing')
    const shown = document.body.textContent ?? ''
    for (const secret of ['Shadow their number nine', 'Keep him calm early', 'Win every header', 'Switched off late']) expect(shown).not.toContain(secret)
    expect(shown).not.toMatch(/\b(jobs?|notes?)\b/i)
  })

  it('a laptop: the title and the child are in the frame, not the page; the weeks are still there', async () => {
    screenIs(true)
    renderApp('/parent/matches')
    await screen.findByRole('navigation', { name: 'Trak' }, { timeout: 5000 })
    expect(await screen.findByRole('region', { name: 'This week' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Next week' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Events' })).toBeNull()
    expect(screen.getAllByRole('button', { name: /Giourkas Seitaridis/ })).toHaveLength(1)
  }, 15_000)

  it("with the switch off: today's Events page", async () => {
    switchOn = false
    screenIs(false)
    renderApp('/parent/matches')
    expect(await screen.findByText('MATCH HISTORY', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('UPCOMING')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'This week' })).toBeNull()
  })
})
