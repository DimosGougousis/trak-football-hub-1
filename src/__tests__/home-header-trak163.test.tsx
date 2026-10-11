import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { HomeHeader, HomeTitle } from '@/components/trak/HomeHeader'
import { WeekStrip, type StripEvent } from '@/components/trak/WeekStrip'
import { PlayerAlertsBell } from '@/components/player/PlayerAlertsBell'
import type { PlayerEvent } from '@/lib/player-events'

// TRAK-163 (Imad, 12 Oct): calendar top left, name in the middle, bell top
// right; the next seven days under it; players get the parent's bell.

const event = (over: Partial<StripEvent> = {}): StripEvent => ({
  id: 'e1', kind: 'training', title: 'Technical', date: '2026-10-12', time: '18:00', meetTime: '17:30',
  venue: 'Main pitch', kit: 'Blue bibs', opponent: null, homeAway: null, status: 'scheduled', cancelReason: null,
  sequence: 1, updatedAt: '2026-10-11T19:00:00Z', ...over,
})

function EventPage() { return <p>Event page {useParams().id}</p> }
const at = (ui: JSX.Element) => render(
  <MemoryRouter initialEntries={['/home']}>
    <Routes>
      <Route path="/home" element={ui} />
      <Route path="/player/event/:id" element={<EventPage />} />
      <Route path="/calendar" element={<p>Calendar page</p>} />
    </Routes>
  </MemoryRouter>)

describe('home header', () => {
  it('opens the calendar from the top left and shows the name', async () => {
    at(<HomeHeader calendarTo="/calendar" center={<HomeTitle>Dora Fotiadi</HomeTitle>} />)
    expect(screen.getByRole('heading', { name: 'Dora Fotiadi' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Calendar' }))
    expect(await screen.findByText('Calendar page')).toBeInTheDocument()
  })
})

describe('week strip', () => {
  const today = new Date('2026-10-12T09:00:00')
  it("shows today's events, opens one, and says when a day has nothing", async () => {
    at(<WeekStrip today={today} eventHref={e => `/player/event/${e.id}`} events={[
      event(),
      event({ id: 'e2', kind: 'match', title: null, opponent: 'Palm United', homeAway: 'away', date: '2026-10-16', time: '17:00' }),
    ]} />)
    const days = screen.getByRole('group', { name: 'Next 7 days' })
    expect(within(days).getAllByRole('button')).toHaveLength(7)
    expect(within(days).getByRole('button', { name: /Today/, pressed: true })).toBeInTheDocument()
    expect(within(within(days).getByRole('button', { name: /Fri 16/ })).getByLabelText('1 event')).toBeInTheDocument()
    expect(within(within(days).getByRole('button', { name: /Wed 14/ })).queryByLabelText(/event/)).toBeNull()
    // One event today: it opens straight away with its details.
    expect(screen.getByText('18:00 · Technical')).toBeInTheDocument()
    expect(screen.getByText('Main pitch')).toBeInTheDocument()
    expect(screen.getByText('Kit: Blue bibs')).toBeInTheDocument()

    await userEvent.click(within(days).getByRole('button', { name: /Fri 16/ }))
    expect(screen.getByText('Friday 16 October')).toBeInTheDocument()
    expect(screen.getByText('17:00 · Match vs Palm United (away)')).toBeInTheDocument()

    await userEvent.click(within(days).getByRole('button', { name: /Wed 14/ }))
    expect(screen.getByText('Nothing planned.')).toBeInTheDocument()

    await userEvent.click(within(days).getByRole('button', { name: /Fri 16/ }))
    await userEvent.click(screen.getByRole('link', { name: 'Open' }))
    expect(await screen.findByText('Event page e2')).toBeInTheDocument()
  })

  it('marks a cancelled event, a draft and a missing time', () => {
    at(<WeekStrip today={today} eventHref={() => '/calendar'} events={[
      event({ status: 'cancelled', cancelReason: 'Pitch closed' }),
      event({ id: 'e3', time: null, draft: true, title: 'Fitness' }),
    ]} />)
    expect(screen.getByText('18:00 · Technical · Cancelled')).toBeInTheDocument()
    expect(screen.getByText('Time to be confirmed · Fitness · Draft')).toBeInTheDocument()
    expect(screen.getByLabelText('2 events')).toBeInTheDocument()
  })
})

describe('player bell', () => {
  beforeEach(() => localStorage.clear())
  const events: PlayerEvent[] = [event(), event({ id: 'e2', title: 'Fitness', time: '19:30', updatedAt: '2026-10-11T20:00:00Z' })]

  it('counts new events, says "Changed" after an edit, and clears when closed', async () => {
    const { rerender } = render(<MemoryRouter><PlayerAlertsBell userId="hugo" events={events} /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Alerts, 2 unread' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Alerts/ }))
    const panel = await screen.findByRole('dialog', { name: 'Alerts' })
    expect(within(panel).getByText('New: Technical')).toBeInTheDocument()
    expect(within(panel).getByText('Mon 12 Oct, 18:00 · Main pitch')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument())

    // The coach moves Technical to 19:00: it counts again, as a change.
    rerender(<MemoryRouter><PlayerAlertsBell userId="hugo" events={[
      event({ time: '19:00', sequence: 2, updatedAt: '2026-10-12T08:00:00Z' }), events[1],
    ]} /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Alerts, 1 unread' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Alerts/ }))
    expect(within(await screen.findByRole('dialog', { name: 'Alerts' })).getByText('Changed: Technical')).toBeInTheDocument()
  })

  it('opens the event', async () => {
    at(<PlayerAlertsBell userId="hugo" events={events} />)
    await userEvent.click(await screen.findByRole('button', { name: /^Alerts/ }))
    const panel = await screen.findByRole('dialog', { name: 'Alerts' })
    await userEvent.click(within(panel).getByRole('button', { name: /New: Fitness/ }))
    await userEvent.click(await within(panel).findByRole('button', { name: 'Open event' }))
    expect(await screen.findByText('Event page e2')).toBeInTheDocument()
  })
})
