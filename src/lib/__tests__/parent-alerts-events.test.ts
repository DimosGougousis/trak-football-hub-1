import { describe, expect, it } from 'vitest'
import { parentAlerts, type ParentMatch } from '../parent-data'
import type { PlayerEvent } from '../player-events'

// TRAK-134 (J8.11): the parent's bell lists the selected child's events next
// to matches and assessments: new, changed (with the new time) or cancelled.
// When it changed is updated_at, so the bell's seen rule counts it.

const event = (over: Partial<PlayerEvent> = {}): PlayerEvent => ({
  id: 'ev-1', kind: 'training', title: 'Training', date: '2099-11-16', time: '18:00', meetTime: null,
  venue: 'Main pitch', kit: null, opponent: null, homeAway: null, status: 'scheduled', cancelReason: null,
  sequence: 2, updatedAt: '2026-10-10T08:00:00Z', ...over,
})
const alertsFor = (events: PlayerEvent[], eventsFirstSeen: Record<string, number> = {}) =>
  parentAlerts([], undefined, { awards: false, events, eventsFirstSeen })

describe('parentAlerts: events', () => {
  it('lists an event the bell has not seen before as new, dated when it last changed', () => {
    expect(alertsFor([event()])).toEqual([{
      id: 'event-ev-1', kind: 'event', targetId: 'ev-1', title: 'New: Training',
      description: 'Mon 16 Nov, 18:00 · Main pitch', date: '2026-10-10T08:00:00Z',
    }])
  })

  it('says "Changed" with the new day and time once the coach edits an event the bell already had', () => {
    const [alert] = alertsFor([event({ sequence: 3, time: '18:30' })], { 'ev-1': 2 })
    expect(alert.title).toBe('Changed: Training')
    expect(alert.description).toBe('Now Mon 16 Nov, 18:30 · Main pitch')
  })

  it('keeps an unedited event as new, however often the bell has shown it', () => {
    expect(alertsFor([event()], { 'ev-1': 2 })[0].title).toBe('New: Training')
  })

  it('says "Cancelled" with the reason, ahead of any change', () => {
    const [alert] = alertsFor([event({
      kind: 'match', opponent: 'Rivals FC', homeAway: 'away', status: 'cancelled', cancelReason: 'Pitch closed', sequence: 4,
    })], { 'ev-1': 2 })
    expect(alert.title).toBe('Cancelled: Match vs Rivals FC (away)')
    expect(alert.description).toBe('Mon 16 Nov, 18:00 · Pitch closed')
  })

  it('never shows midnight for an event with no time yet', () => {
    expect(alertsFor([event({ time: null, venue: null })])[0].description).toBe('Mon 16 Nov, time to be confirmed')
  })

  it('sorts events in with matches, newest change first', () => {
    const match = {
      id: 'm-1', opponent: 'Rivals FC', competition: 'League', created_at: '2026-10-09T08:00:00Z',
      team_score: 1, opponent_score: 0,
    } as ParentMatch
    const alerts = parentAlerts([match], undefined, {
      awards: false, eventsFirstSeen: {},
      events: [event({ id: 'old', updatedAt: '2026-10-08T08:00:00Z' }), event({ id: 'new' })],
    })
    expect(alerts.map(a => a.id)).toEqual(['event-new', 'match-m-1', 'event-old'])
  })

  it('adds no events where none are passed (the Alerts page)', () => {
    expect(parentAlerts([], undefined)).toEqual([])
  })
})
