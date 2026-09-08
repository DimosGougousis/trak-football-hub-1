import { describe, it, expect, vi, afterEach } from 'vitest'
import { calculateStreak } from '../streaks'

/** Helper: create a Date for a given Monday, then offset by days within that week. */
function makeMatch(isoDate: string) {
  return { created_at: new Date(isoDate).toISOString() }
}

/** Get a date string N weeks ago from a reference date (same day of week). */
function weeksAgo(n: number, from: Date = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() - n * 7)
  return d.toISOString().split('T')[0] + 'T12:00:00Z'
}

describe('calculateStreak', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns zeros when there are no matches', () => {
    const result = calculateStreak([])
    expect(result.current).toBe(0)
    expect(result.best).toBe(0)
    expect(result.lastMatchDate).toBe('')
    expect(result.isActive).toBe(false)
  })

  it('returns current: 1 for a single match this week', () => {
    // Fix time to a Wednesday so "this week" is stable
    const wednesday = new Date('2025-03-12T12:00:00Z') // a Wednesday
    vi.setSystemTime(wednesday)

    const match = makeMatch('2025-03-10T18:00:00Z') // Monday same week
    const result = calculateStreak([match])

    expect(result.current).toBe(1)
    expect(result.best).toBe(1)
    expect(result.isActive).toBe(true)
  })

  it('counts 5 consecutive weeks correctly', () => {
    const now = new Date('2025-03-12T12:00:00Z')
    vi.setSystemTime(now)

    const matches = [
      makeMatch(weeksAgo(0, now)),
      makeMatch(weeksAgo(1, now)),
      makeMatch(weeksAgo(2, now)),
      makeMatch(weeksAgo(3, now)),
      makeMatch(weeksAgo(4, now)),
    ]
    const result = calculateStreak(matches)

    expect(result.current).toBe(5)
    expect(result.best).toBe(5)
    expect(result.isActive).toBe(true)
  })

  it('breaks streak when there is a gap', () => {
    const now = new Date('2025-03-12T12:00:00Z')
    vi.setSystemTime(now)

    const matches = [
      makeMatch(weeksAgo(0, now)), // this week
      makeMatch(weeksAgo(1, now)), // last week
      // gap: weeksAgo(2) missing
      makeMatch(weeksAgo(3, now)), // 3 weeks ago
      makeMatch(weeksAgo(4, now)), // 4 weeks ago
    ]
    const result = calculateStreak(matches)

    expect(result.current).toBe(2)
    expect(result.best).toBe(2) // both runs are length 2
    expect(result.isActive).toBe(true)
  })

  it('preserves best streak even if current is lower', () => {
    const now = new Date('2025-03-12T12:00:00Z')
    vi.setSystemTime(now)

    // Old streak of 4, then gap, then current streak of 1
    const matches = [
      makeMatch(weeksAgo(0, now)),  // current: 1

      // gap at weeksAgo(1)

      makeMatch(weeksAgo(8, now)),
      makeMatch(weeksAgo(9, now)),
      makeMatch(weeksAgo(10, now)),
      makeMatch(weeksAgo(11, now)),
    ]
    const result = calculateStreak(matches)

    expect(result.current).toBe(1)
    expect(result.best).toBe(4)
  })

  it('streak is active if last match was previous week (at risk)', () => {
    const now = new Date('2025-03-12T12:00:00Z')
    vi.setSystemTime(now)

    const matches = [
      makeMatch(weeksAgo(1, now)), // last week only
      makeMatch(weeksAgo(2, now)),
      makeMatch(weeksAgo(3, now)),
    ]
    const result = calculateStreak(matches)

    expect(result.current).toBe(3)
    expect(result.isActive).toBe(true)
  })

  it('streak is broken if no match in current or previous week', () => {
    const now = new Date('2025-03-12T12:00:00Z')
    vi.setSystemTime(now)

    const matches = [
      makeMatch(weeksAgo(3, now)),
      makeMatch(weeksAgo(4, now)),
    ]
    const result = calculateStreak(matches)

    expect(result.current).toBe(0)
    expect(result.best).toBe(2)
    expect(result.isActive).toBe(false)
  })

  it('handles year boundary correctly', () => {
    // Straddle Dec 2024 / Jan 2025
    const now = new Date('2025-01-08T12:00:00Z') // Wed, ISO week 2 of 2025
    vi.setSystemTime(now)

    const matches = [
      makeMatch('2025-01-06T12:00:00Z'), // Mon, week 2 of 2025
      makeMatch('2024-12-30T12:00:00Z'), // Mon, week 1 of 2025 (ISO)
      makeMatch('2024-12-23T12:00:00Z'), // Mon, week 52 of 2024
    ]
    const result = calculateStreak(matches)

    expect(result.current).toBe(3)
    expect(result.best).toBe(3)
    expect(result.isActive).toBe(true)
  })

  it('multiple matches in same week count as one week', () => {
    const now = new Date('2025-03-12T12:00:00Z')
    vi.setSystemTime(now)

    const matches = [
      makeMatch(weeksAgo(0, now)),
      makeMatch(weeksAgo(0, now)), // duplicate same week
      makeMatch(weeksAgo(1, now)),
    ]
    const result = calculateStreak(matches)

    expect(result.current).toBe(2)
    expect(result.best).toBe(2)
  })
})
