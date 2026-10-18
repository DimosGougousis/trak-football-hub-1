/**
 * TRAK-171 (live run 3, Tarek; Imad agreed): the player's calendar button
 * opened Sessions, a second door to the same list. It opens a month calendar
 * of the player's own events, like the coach's: a dot per event, the chosen
 * day's events below, each opening the event sheet. A failed read says so,
 * never an empty month.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, rpcRows, rpcError } from '../../../../tests/msw/supabase'

const PLAYER = { id: 'player-calendar-171' }
const event = (id: string, extra: Record<string, unknown> = {}) => ({
  id, coach_user_id: 'coach-1', published: true, event_type: 'training', title: 'Finishing',
  event_date: '2026-11-14', start_time: '10:00:00', starts_at: '2026-11-14T06:00:00Z',
  venue: 'Main pitch', opponent: null, meet_time: null, kit: null, home_away: null,
  status: 'scheduled', cancel_reason: null, sequence: 0, ...extra,
})
const MATCH = event('ev-1', { event_type: 'match', title: 'League', opponent: 'Rivals FC', home_away: 'away', venue: 'Rivals Park' })
const TRAINING = event('ev-2', { event_date: '2026-11-17', start_time: '17:30:00', starts_at: '2026-11-17T13:30:00Z' })

function setup(events: Record<string, unknown>[] | 'fail' = [MATCH, TRAINING]) {
  server.use(
    table('profiles', [{ id: 'p', user_id: PLAYER.id, role: 'player', full_name: 'Synthetic Player' }]),
    table('player_details', []),
    events === 'fail' ? rpcError('child_events', 500, { code: 'XX000', message: 'unavailable' }) : rpcRows('child_events', events),
    rpc('my_consent_status', () => ({ required: false, invited_parent: null })),
  )
}

beforeEach(() => {
  // 14 Nov 2026, 12:00 in Dubai: the month the events are in.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00Z'))
  signInAs(PLAYER)
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe("TRAK-171: the player's month calendar", () => {
  it("shows the month with a dot per event, today's events, and another day's on tap", async () => {
    setup()
    renderApp('/player/calendar')
    expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeInTheDocument()
    const month = await screen.findByRole('grid', { name: /November 2026/ })
    expect(await within(month).findByRole('gridcell', { name: /14 November 2026, 1 event/ })).toBeInTheDocument()
    expect(within(month).getByRole('gridcell', { name: /17 November 2026, 1 event/ })).toBeInTheDocument()
    const day = screen.getByRole('region', { name: 'Day' })
    expect(await within(day).findByRole('button', { name: /Rivals FC/ })).toBeInTheDocument()
    await userEvent.click(within(month).getByRole('gridcell', { name: /17 November 2026/ }))
    expect(await within(day).findByRole('button', { name: /Finishing/ })).toBeInTheDocument()
    expect(within(day).queryByRole('button', { name: /Rivals FC/ })).toBeNull()
  })

  it('an event opens the event sheet, with the full page one tap away', async () => {
    setup()
    renderApp('/player/calendar')
    await userEvent.click(await within(await screen.findByRole('region', { name: 'Day' })).findByRole('button', { name: /Rivals FC/ }))
    const sheet = await screen.findByRole('dialog', { name: 'vs Rivals FC' })
    expect(within(sheet).getByRole('link', { name: 'Open event page' })).toHaveAttribute('href', '/player/event/ev-1')
  })

  it('a failed read says so and offers Retry, never an empty month', async () => {
    setup('fail')
    renderApp('/player/calendar')
    expect(await screen.findByText(/couldn't load your calendar/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.queryByText('Nothing planned.')).toBeNull()
  })
})
