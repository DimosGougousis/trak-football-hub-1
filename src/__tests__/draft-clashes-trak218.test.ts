import { describe, it, expect } from 'vitest'
import { draftClashes, type EventRow } from '@/lib/coach-events'

/**
 * TRAK-218: the schedule names, on each draft, the live event that would
 * refuse its Publish. Same rule as the database's (TRAK-158,
 * supabase/tests/event_overlap.sql), so the coach sees it before tapping.
 */

const DAY = '2026-11-02'
const ev = (id: string, over: Partial<EventRow> = {}): EventRow => ({
  id, title: id, event_type: 'training', starts_at: `${DAY}T14:00:00Z`, ends_at: null,
  event_date: DAY, start_time: '18:00:00', end_time: '19:30:00', published: false, status: 'scheduled', ...over,
})
const GAME = ev('Game Day', { published: true, event_type: 'match', start_time: '17:00:00', end_time: '18:30:00' })

describe('TRAK-218: which drafts clash with a live event', () => {
  it('names the live event and its times for an overlapping draft', () => {
    expect(draftClashes([GAME, ev('d1')]).get('d1')).toEqual({ title: 'Game Day', start: '17:00', end: '18:30' })
  })

  it('back-to-back, another day, or no start time is no clash', () => {
    const clashes = draftClashes([GAME,
      ev('after', { start_time: '18:30:00', end_time: '20:00:00' }),
      ev('before', { start_time: '15:30:00', end_time: '17:00:00' }),
      ev('other-day', { event_date: '2026-11-03' }),
      ev('no-time', { start_time: null, end_time: null }),
    ])
    expect([...clashes.keys()]).toEqual([])
  })

  it('only published, not cancelled events count: drafts may overlap each other', () => {
    const clashes = draftClashes([
      ev('cancelled', { published: true, status: 'cancelled', start_time: '17:00:00' }),
      ev('other-draft', { start_time: '17:00:00' }),
      ev('d1'),
    ])
    expect(clashes.has('d1')).toBe(false)
    expect(clashes.has('other-draft')).toBe(false)
  })

  it('a live event never clashes with itself or is marked', () => {
    expect(draftClashes([GAME]).size).toBe(0)
  })

  it('no end counts as 90 minutes; an end past midnight is read from the instants', () => {
    const late = ev('late', { published: true, start_time: '22:30:00', end_time: null,
      starts_at: `${DAY}T18:30:00Z`, ends_at: `${DAY}T20:30:00Z` })
    const clashes = draftClashes([
      ev('open-ended', { published: true, start_time: '10:00:00', end_time: null }),
      ev('at-11', { start_time: '11:00:00', end_time: '12:00:00' }),
      late,
      ev('at-23', { start_time: '23:00:00', end_time: null }),
    ])
    expect(clashes.get('at-11')).toEqual({ title: 'open-ended', start: '10:00', end: '11:30' })
    expect(clashes.get('at-23')).toEqual({ title: 'late', start: '22:30', end: '00:30' })
  })

  it('of two clashes it names the earlier, as the database does', () => {
    const later = ev('Fitness', { published: true, start_time: '19:00:00', end_time: '20:00:00' })
    expect(draftClashes([later, GAME, ev('d1', { end_time: '19:30:00' })]).get('d1')?.title).toBe('Game Day')
  })
})
