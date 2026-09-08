import { describe, it, expect } from 'vitest'
import { deriveCardStats, type CoachInputs } from '../cardStats'

/**
 * The regression these guard is a real one: the card-stat columns on
 * coach_assessments are INTEGER, and returning 6.5 made Postgres reject the
 * entire assessment insert. A coach saw "Could not save assessment" with no
 * way to tell why, on the flow the pilot's load-bearing hypothesis measures.
 */

const inputs = (over: Partial<CoachInputs> = {}): CoachInputs => ({
  workRate: 5, tactical: 5, attitude: 5, technical: 5, physical: 5, coachability: 5,
  ...over,
})

describe('deriveCardStats', () => {
  it('returns whole numbers for every stat', () => {
    const stats = deriveCardStats(inputs({ technical: 7, tactical: 6, attitude: 8, coachability: 5 }))
    for (const [name, value] of Object.entries(stats)) {
      expect(Number.isInteger(value), `${name} = ${value} must be an integer`).toBe(true)
    }
  })

  it('rounds a half-point average rather than emitting a decimal', () => {
    // technical 7 + tactical 6 = 13 / 2 = 6.5 — the exact case that failed.
    expect(deriveCardStats(inputs({ technical: 7, tactical: 6 })).technique).toBe(7)
    // attitude 8 + coachability 5 = 13 / 2 = 6.5
    expect(deriveCardStats(inputs({ attitude: 8, coachability: 5 })).spirit).toBe(7)
  })

  it('stays integral across every slider combination', () => {
    for (let a = 0; a <= 10; a++) {
      for (let b = 0; b <= 10; b++) {
        const s = deriveCardStats(inputs({ technical: a, tactical: b, attitude: a, coachability: b }))
        expect(Number.isInteger(s.technique)).toBe(true)
        expect(Number.isInteger(s.spirit)).toBe(true)
      }
    }
  })

  it('passes single-source stats through unchanged', () => {
    const s = deriveCardStats(inputs({ attitude: 9, technical: 3, workRate: 7 }))
    expect(s.consistency).toBe(9)
    expect(s.impact).toBe(3)
    expect(s.workrate).toBe(7)
  })

  it('clamps to the 0..10 range the columns expect', () => {
    expect(deriveCardStats(inputs({ attitude: 42 })).consistency).toBe(10)
    expect(deriveCardStats(inputs({ technical: -5 })).impact).toBe(0)
  })
})
