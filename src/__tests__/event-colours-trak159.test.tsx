import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { WeekStrip, type StripEvent } from '@/components/trak/WeekStrip'
import { UpcomingEventCard } from '@/components/player/UpcomingEventCard'
import { CANCELLED_COLOR, EVENT_COLOR } from '@/lib/coach-events'

// TRAK-159 / TRAK-171 item 3 (founders, 12 Oct): cancelled = red, match =
// green, training = blue, other orange, everywhere: the coach calendar, the
// Home strip and the family lists, all from the one constant.

const event = (over: Partial<StripEvent> = {}): StripEvent => ({
  id: 'e1', kind: 'training', title: 'Technical', date: '2026-10-12', time: '18:00', meetTime: null,
  venue: null, kit: null, opponent: null, homeAway: null, status: 'scheduled', cancelReason: null,
  sequence: 1, updatedAt: '2026-10-11T19:00:00Z', familyNote: null, ...over,
})
const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

describe('Home week strip colours', () => {
  it('a dot per event in its type colour, and red for a cancelled one', () => {
    render(<MemoryRouter><WeekStrip today={new Date('2026-10-12T09:00:00')} renderSheet={(_, trigger) => trigger} events={[
      event({ id: 't', kind: 'training', time: '17:00' }),
      event({ id: 'm', kind: 'match', time: '18:00', opponent: 'Olympiakos' }),
      event({ id: 'c', kind: 'training', time: '19:00', status: 'cancelled' }),
    ]} /></MemoryRouter>)
    const dots = [...screen.getByLabelText('3 events').children] as HTMLElement[]
    expect(dots.map(d => d.style.background)).toEqual([
      rgb(EVENT_COLOR.training), rgb(EVENT_COLOR.match), rgb(CANCELLED_COLOR),
    ])
  })
})

describe('family event card colours', () => {
  const stripe = (kind: StripEvent['kind'], status: StripEvent['status'] = 'scheduled') => {
    const { container, unmount } = render(<MemoryRouter>
      <UpcomingEventCard event={event({ kind, status, opponent: 'Olympiakos' })} changed={false} />
    </MemoryRouter>)
    const colour = (container.querySelector('a > div') as HTMLElement).style.background
    unmount()
    return colour
  }

  it('training blue, match green, cancelled red', () => {
    expect(stripe('training')).toBe(rgb(EVENT_COLOR.training))
    expect(stripe('match')).toBe(rgb(EVENT_COLOR.match))
    expect(stripe('training', 'cancelled')).toBe(rgb(CANCELLED_COLOR))
  })
})
