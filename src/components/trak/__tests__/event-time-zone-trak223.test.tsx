import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { EventSheet } from '@/components/trak/EventSheet'
import { EventDetails } from '@/components/player/EventDetails'
import type { StripEvent } from '@/components/trak/WeekStrip'

/**
 * TRAK-223 (20 Oct live run, S3): testers' phones in Dubai showed the Athens
 * academy's 17:00 with nothing saying whose clock it was. The event sheet (every
 * role) and the family event page now name the academy's clock, add the time on
 * this phone when it differs, and give the meet time the same clock and its lead.
 */

const real = process.env.TZ
afterEach(() => { cleanup(); process.env.TZ = real })

// Rehearsal Athens, 28 Oct (after the 25 Oct change): 17:00 Athens = 15:00Z.
const ATHENS: StripEvent = {
  id: 'ev-1', kind: 'match', title: null, date: '2026-10-28', time: '17:00', meetTime: '16:15', venue: 'Municipal Ground',
  kit: null, opponent: 'AEK Athens U16', homeAway: 'home', status: 'scheduled', cancelReason: null, sequence: 0,
  updatedAt: null, familyNote: null, startsAt: '2026-10-28T15:00:00+00:00',
}

async function openSheet(role: 'parent' | 'player') {
  render(<MemoryRouter><EventSheet event={ATHENS} role={role} trigger={<button>Open</button>} /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button', { name: 'Open' }))
  return screen.findByRole('dialog', { name: 'vs AEK Athens U16' })
}

describe('TRAK-223: event times say whose clock they are on', () => {
  it('on a phone in Athens: the sheet says Athens time, nothing more', async () => {
    process.env.TZ = 'Europe/Athens'
    const sheet = await openSheet('parent')
    expect(within(sheet).getByText('17:00')).toBeInTheDocument()
    expect(within(sheet).getByText('Athens time')).toBeInTheDocument()
    expect(within(sheet).getByText('16:15 Athens time, 45 min before kick-off')).toBeInTheDocument()
    expect(within(sheet).queryByText(/on this phone/)).toBeNull()
  })

  it('on a phone in Dubai: still 17:00 Athens time, and 19:00 on this phone', async () => {
    process.env.TZ = 'Asia/Dubai'
    const sheet = await openSheet('player')
    expect(within(sheet).getByText('17:00')).toBeInTheDocument()
    expect(within(sheet).getByText('Athens time · 19:00 on this phone')).toBeInTheDocument()
  })

  it('the event page: Time and Meet name the clock too', () => {
    process.env.TZ = 'Europe/London'
    render(<EventDetails event={ATHENS} />)
    const details = screen.getByRole('list', { name: 'Event details' })
    expect(within(details).getByText('17:00 Athens time (15:00 on this phone)')).toBeInTheDocument()
    expect(within(details).getByText('16:15 Athens time, 45 min before kick-off')).toBeInTheDocument()
  })
})
