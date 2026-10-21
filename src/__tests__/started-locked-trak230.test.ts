import { describe, expect, it } from 'vitest'
import { lockedMessage, startedLocked, STARTED_LOCKED } from '@/lib/coach-events'

/** TRAK-230 (Kostas, 21 Oct, option A): once an event has started, its details are fixed. */

const NOW = Date.parse('2026-10-24T09:00:00Z')

describe('TRAK-230: when an event locks', () => {
  it('a timed event locks at its start instant, not before', () => {
    expect(startedLocked({ starts_at: '2026-10-24T08:59:00Z', start_time: '11:59:00' }, NOW)).toBe(true)
    expect(startedLocked({ starts_at: '2026-10-24T09:00:00Z', start_time: '12:00:00' }, NOW)).toBe(true)
    expect(startedLocked({ starts_at: '2026-10-24T09:01:00Z', start_time: '12:01:00' }, NOW)).toBe(false)
  })

  it('an old event with no start time locks when its day is over', () => {
    // Academy midnight (Athens, +3) is 21:00Z the day before.
    expect(startedLocked({ starts_at: '2026-10-23T21:00:00Z', start_time: null }, NOW)).toBe(false)
    expect(startedLocked({ starts_at: '2026-10-22T21:00:00Z', start_time: null }, NOW)).toBe(true)
  })

  it("names the database's refusal, and only that one", () => {
    expect(lockedMessage({ code: 'P0001', message: STARTED_LOCKED })).toBe(STARTED_LOCKED)
    expect(lockedMessage({ code: 'P0001', message: 'This overlaps Game Day, 17:00–18:30. Change the time or cancel one.' })).toBeNull()
    expect(lockedMessage(null)).toBeNull()
  })
})
