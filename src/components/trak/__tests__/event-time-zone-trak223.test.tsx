import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { EventSheet } from '@/components/trak/EventSheet'
import { EventDetails } from '@/components/player/EventDetails'
import { toPlayerEvent } from '@/lib/player-events'

/**
 * TRAK-223 (20 Oct live run, S3), turned round by Imad on 23 Oct: the event
 * sheet (every role) and the family event page show the time on this phone's
 * clock (19:00 Athens reads 20:00 in Dubai), with the academy's own time as a
 * second line only when the clocks differ. A phone in the academy's zone shows
 * no zone at all. The meet time moves with the start.
 */

const real = process.env.TZ
afterEach(() => { cleanup(); process.env.TZ = real })

// Rehearsal Athens, 28 Oct (after the 25 Oct change): 17:00 Athens = 15:00Z. Read on the phone's clock, as the app does.
const athens = () => toPlayerEvent({
  id: 'ev-1', event_type: 'match', title: null, event_date: '2026-10-28', start_time: '17:00:00', meet_time: '16:15:00',
  venue: 'Municipal Ground', opponent: 'AEK Athens U16', home_away: 'home', status: 'scheduled', sequence: 0,
  starts_at: '2026-10-28T15:00:00+00:00',
})!

async function openSheet(role: 'parent' | 'player') {
  render(<MemoryRouter><EventSheet event={athens()} role={role} trigger={<button>Open</button>} /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button', { name: 'Open' }))
  return screen.findByRole('dialog', { name: 'vs AEK Athens U16' })
}

describe("Imad, 23 Oct: event times on this phone's clock", () => {
  it('on a phone in Athens: 17:00, with no zone line', async () => {
    process.env.TZ = 'Europe/Athens'
    const sheet = await openSheet('parent')
    expect(within(sheet).getByText('17:00')).toBeInTheDocument()
    expect(within(sheet).queryByText(/Athens time|Dubai time|on this phone/)).toBeNull()
    expect(within(sheet).getByText('16:15, 45 min before kick-off')).toBeInTheDocument()
  })

  it("on a phone in Dubai: 19:00, then the academy's 17:00 Athens time", async () => {
    process.env.TZ = 'Asia/Dubai'
    const sheet = await openSheet('player')
    expect(within(sheet).getByText('19:00')).toBeInTheDocument()
    expect(within(sheet).getByText('17:00 Athens time')).toBeInTheDocument()
    expect(within(sheet).getByText('18:15, 45 min before kick-off')).toBeInTheDocument()
  })

  it("the event page: the phone's time, with the academy's beside it when they differ", () => {
    process.env.TZ = 'Europe/London'
    render(<EventDetails event={athens()} />)
    const details = screen.getByRole('list', { name: 'Event details' })
    expect(within(details).getByText('15:00 (17:00 Athens time)')).toBeInTheDocument()
    expect(within(details).getByText('14:15, 45 min before kick-off')).toBeInTheDocument()
  })
})
