import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { EventDetails } from '../EventDetails'
import { toPlayerEvent, type PlayerEvent } from '@/lib/player-events'

/**
 * TRAK-161 (J8.8, live run 11 Oct): the event page families and players read.
 * Home or away sits on the venue line; Kit shows on every kind of event; and a
 * short family note sits under Kit. Dora had typed "Green kits. Shin guards
 * are optional" into Kit because there was nowhere else to say it.
 */

afterEach(cleanup)

const match: PlayerEvent = {
  id: 'ev-1', kind: 'match', title: null, date: '2026-10-17', time: '10:00', meetTime: '09:15',
  venue: 'Olympiacos Stadium', kit: 'White', opponent: 'Synthetic Rovers', homeAway: 'away',
  status: 'scheduled', cancelReason: null, sequence: 1, updatedAt: null, familyNote: null,
}
const training: PlayerEvent = {
  ...match, id: 'ev-2', kind: 'training', title: 'Training', opponent: null, homeAway: null,
  venue: 'Main pitch', kit: null,
}

function rows() {
  return within(screen.getByRole('list', { name: 'Event details' })).getAllByRole('listitem')
    .map(li => [...li.children].map(c => c.textContent))
}

describe('TRAK-161 the event page', () => {
  it('puts away on the venue line, with no separate home-or-away row', () => {
    render(<EventDetails event={match} />)
    expect(rows()).toContainEqual(['Venue', 'Olympiacos Stadium (Away)'])
    expect(screen.queryByText('Home or away')).toBeNull()
  })

  it('and home the same way', () => {
    render(<EventDetails event={{ ...match, homeAway: 'home', venue: 'Main pitch' }} />)
    expect(rows()).toContainEqual(['Venue', 'Main pitch (Home)'])
  })

  it('still says home or away when the venue is not known yet', () => {
    render(<EventDetails event={{ ...match, venue: null }} />)
    expect(rows()).toContainEqual(['Venue', 'Away'])
  })

  it('shows Kit on a training too', () => {
    render(<EventDetails event={{ ...training, kit: 'Green kits' }} />)
    expect(rows()).toContainEqual(['Kit', 'Green kits'])
  })

  it('shows the family note under Kit', () => {
    render(<EventDetails event={{ ...training, kit: 'Green kits', familyNote: 'Bring extra water, it\'s a hot day' }} />)
    const labels = rows().map(([label]) => label)
    expect(rows()).toContainEqual(['Notes', 'Bring extra water, it\'s a hot day'])
    expect(labels.indexOf('Notes')).toBe(labels.indexOf('Kit') + 1)
  })

  it('leaves out Kit and Notes when there are none', () => {
    render(<EventDetails event={training} />)
    const labels = rows().map(([label]) => label)
    expect(labels).not.toContain('Kit')
    expect(labels).not.toContain('Notes')
  })

  it('never puts home or away on a training', () => {
    render(<EventDetails event={{ ...training, homeAway: 'away' }} />)
    expect(rows()).toContainEqual(['Venue', 'Main pitch'])
  })
})

describe('TRAK-161 toPlayerEvent reads the family note', () => {
  const row = { id: 'ev-3', event_type: 'training', event_date: '2026-10-17', start_time: '17:00', starts_at: '2026-10-17T13:00:00Z' }

  it('as typed', () => {
    expect(toPlayerEvent({ ...row, family_note: '  Shin guards on  ' })?.familyNote).toBe('Shin guards on')
  })

  it('as none when blank or missing', () => {
    expect(toPlayerEvent({ ...row, family_note: '   ' })?.familyNote).toBeNull()
    expect(toPlayerEvent(row)?.familyNote).toBeNull()
  })

  it('never from the coach-only notes column', () => {
    expect(toPlayerEvent({ ...row, notes: 'Coach only' })?.familyNote).toBeNull()
  })
})
