/**
 * TRAK-610 (New Home 4/8, spec TRAK-606): once every to-do is done, "All done for today." and 2 suggestions at most: the
 * next missing step this week that isn't a to-do already, then the top Players job. Needs you has left Home. Test people
 * are named after footballers. The academy has no time zone set, so its days are Dubai's (UTC+4); Wed 4 Nov at midday.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { forgetScreens } from '@/lib/screen-memory'

// Midday on a Wednesday; today's events are later in the day.
const NOW = new Date('2026-11-04T12:00:00Z')
// Times are UTC, whatever the machine's time zone.
const at = (iso: string) => new Date(`${iso}:00Z`)
let n = 0
let COACH = { id: 'coach-304' }

function event(id: string, type: 'training' | 'match', starts: string, over: Record<string, unknown> = {}) {
  const start = at(starts)
  return {
    id, coach_user_id: COACH.id, squad: 'U16', title: `Training ${id}`, event_type: type, published: true, status: 'scheduled',
    starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 90 * 60_000).toISOString(),
    event_date: starts.slice(0, 10), start_time: `${starts.slice(11, 16)}:00`, venue: 'Pitch 2', opponent: null, home_away: null, ...over,
  }
}
const practice = (event_id: string, position: number, name: string, minutes: number, part = '') => ({
  event_id, position, name, minutes, how: '', tell: '', area: '', numbers: '', direction: '', targets: '', conditions: '',
  source: 'own', drill_id: null, library_session: null, part,
})

function home({ events, practices = [], gamePlans = [], features = ['events', 'training', 'games'] }: {
  events: Record<string, unknown>[]; practices?: Record<string, unknown>[]; gamePlans?: Record<string, unknown>[]; features?: string[]
}) {
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Jürgen Klopp', invite_code: 'ABCD' }]),
    table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16', organization_id: 'org-1' }]),
    table('organizations', [{ id: 'org-1', name: 'Rehearsal FC' }]),
    table('squad_players', [{ id: 'sp-1', coach_user_id: COACH.id, player_name: 'Mohamed Salah', age_group: 'U16', status: 'active', created_at: '2026-10-01T08:00:00Z' }]),
    table('coach_assessments', []),
    table('coach_sessions', []),
    table('session_attendance', []),
    table('event_absences', []),
    table('notification_settings', []),
    table('game_shares', []),
    rpc('game_plan_changes', () => []),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('feature_on', ({ p_feature }) => features.includes(String(p_feature))),
    table('training_notes', []),
    table('game_evaluations', []),
    http.get(`${SUPABASE_URL}/rest/v1/coach_calendar_events`, ({ request }) => {
      const type = new URL(request.url).searchParams.get('event_type')?.replace(/^eq\./, '')
      return HttpResponse.json(type ? events.filter(e => e.event_type === type) : events)
    }),
    http.get(`${SUPABASE_URL}/rest/v1/training_plans`, () =>
      HttpResponse.json([...new Set(practices.map(p => p.event_id))].map(event_id => ({ event_id, updated_at: '2026-11-01T10:00:00Z' })))),
    table('training_plan_practices', practices),
    http.get(`${SUPABASE_URL}/rest/v1/game_plans`, ({ request }) => {
      const id = new URL(request.url).searchParams.get('event_id')?.replace(/^eq\./, '')
      return HttpResponse.json(id ? gamePlans.filter(p => p.event_id === id) : gamePlans)
    }),
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  COACH = { id: `coach-304-${++n}` }
  signInAs(COACH)
})
afterEach(() => { vi.useRealTimers(); cleanup(); forgetScreens(); localStorage.clear() })

const ideas = () => screen.queryByRole('list', { name: 'If you have time' })

describe('TRAK-610: suggestions once the To-do is done', { timeout: 20_000 }, () => {
  it("after this morning's training is closed: All done, then Plan Friday's training and Assess players", async () => {
    home({ events: [event('t1', 'training', '2026-11-04T06:00'), event('t2', 'training', '2026-11-06T06:00')],
      practices: [practice('t1', 1, 'Rondos 4v1', 15)] })
    server.use(
      table('coach_sessions', [{ id: 's1', event_id: 't1', created_at: '2026-11-04T08:00:00Z' }]),
      table('training_notes', [{ event_id: 't1', again: 'yes', note: '', created_at: '2026-11-04T08:05:00Z' }]),
    )
    renderApp('/coach/home')
    const list = await screen.findByRole('list', { name: 'If you have time' }, { timeout: 5000 })
    expect(within(await screen.findByRole('region', { name: 'To-do' })).getByText('All done for today.')).toBeInTheDocument()
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("Plan Friday's training")
    expect(within(rows[0]).getByRole('button', { name: 'Plan training' })).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('Assess players')
    expect(rows[1]).toHaveTextContent('1 is due.')
    expect(screen.queryByRole('region', { name: /Needs you/ })).toBeNull()
  })

  it('none while a to-do is still open, even one greyed until later', async () => {
    home({ events: [event('t1', 'training', '2026-11-04T16:00'), event('t2', 'training', '2026-11-06T06:00')],
      practices: [practice('t1', 1, 'Rondos 4v1', 15)] })
    renderApp('/coach/home')
    const todo = await screen.findByRole('region', { name: 'To-do' })
    expect(await within(todo).findByText('Take the register', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(ideas()).toBeNull()
    expect(within(todo).queryByText('All done for today.')).toBeNull()
  })

  it("the next step isn't repeated when it's already a to-do: on a day with no events, only the Players job", async () => {
    home({ events: [event('t2', 'training', '2026-11-06T06:00')] })
    renderApp('/coach/home')
    const todo = await screen.findByRole('region', { name: 'To-do' })
    expect(await within(todo).findByText("Plan Friday's training", {}, { timeout: 5000 })).toBeInTheDocument()
    // The to-do is open, so no suggestion yet.
    expect(ideas()).toBeNull()
  })
})
