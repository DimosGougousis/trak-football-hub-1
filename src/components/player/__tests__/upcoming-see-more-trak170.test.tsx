import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '../../../../tests/msw/server'
import { rpc } from '../../../../tests/msw/supabase'
import { UpcomingEvents } from '../UpcomingEvents'

/**
 * TRAK-170 (J8.7, live run 2): the player's Sessions tab listed 20 upcoming
 * events, so the match they'd just been assessed on sat far below. The list
 * shows the next 3, then "See more".
 */

const event = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `ev-${n}`, event_type: 'training', title: `Session ${n}`, event_date: `2099-11-${String(10 + n).padStart(2, '0')}`,
  start_time: '18:00:00', starts_at: `2099-11-${String(10 + n).padStart(2, '0')}T14:00:00Z`, meet_time: null, venue: 'Main pitch',
  kit: null, opponent: null, home_away: null, status: 'scheduled', cancel_reason: null, sequence: 0, updated_at: '2026-10-12T10:00:00Z', ...extra,
})

afterEach(cleanup)
const mount = () => render(<MemoryRouter><UpcomingEvents playerUserId="player-170" /></MemoryRouter>)

describe('J8.7 Sessions: the next 3 upcoming events, then See more', () => {
  it('shows 3 of 5, and See more opens the rest', async () => {
    server.use(rpc('child_events', () => [1, 2, 3, 4, 5].map(n => event(n))))
    mount()
    const list = await screen.findByRole('region', { name: 'Upcoming' })
    expect(await within(list).findByText('Session 1')).toBeInTheDocument()
    expect(within(list).getAllByRole('link')).toHaveLength(3)
    expect(within(list).queryByText('Session 4')).toBeNull()
    const more = within(list).getByRole('button', { name: 'See more (2)' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(more)
    expect(within(list).getAllByRole('link')).toHaveLength(5)
    await userEvent.click(within(list).getByRole('button', { name: 'Show fewer' }))
    expect(within(list).getAllByRole('link')).toHaveLength(3)
  })

  it('offers no button when there are 3 or fewer', async () => {
    server.use(rpc('child_events', () => [1, 2, 3].map(n => event(n))))
    mount()
    const list = await screen.findByRole('region', { name: 'Upcoming' })
    expect(await within(list).findByText('Session 3')).toBeInTheDocument()
    expect(within(list).queryByRole('button', { name: /See more/ })).toBeNull()
  })

  it('a cancelled event in the first 3 stays visible, marked cancelled', async () => {
    server.use(rpc('child_events', () => [event(1, { status: 'cancelled', cancel_reason: 'Pitch closed' }), event(2), event(3), event(4)]))
    mount()
    const list = await screen.findByRole('region', { name: 'Upcoming' })
    expect(await within(list).findByText('Cancelled')).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'See more (1)' })).toBeInTheDocument()
  })
})
