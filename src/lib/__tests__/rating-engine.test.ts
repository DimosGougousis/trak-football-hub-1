import { describe, it, expect } from 'vitest'
import { computeMatchScore, scoreToBand } from '../rating-engine'
import type { MatchInput } from '../types'

const baseMatch: MatchInput = {
  position: 'att',
  competition: 'league',
  venue: 'home',
  opponent: 'Test FC',
  score_us: 1,
  score_them: 1,
  minutes_played: 80,
  card: 'none',
  body_condition: 'good',
  self_rating: 'average',
  position_inputs: {},
  is_friendly: false,
}

// TRAK-556 (Imad, 23 Nov): 10 Exceptional · 7–9 Good · 5–6 Steady · 3–4 Developing · 0–2 Difficult.
describe('scoreToBand', () => {
  it('gives every whole score its band from the table', () => {
    expect(Array.from({ length: 11 }, (_, s) => scoreToBand(s))).toEqual([
      'difficult', 'difficult', 'difficult', 'developing', 'developing', 'steady', 'steady', 'good', 'good', 'good', 'exceptional',
    ])
  })

  it('rounds an average to the nearest whole score first', () => {
    expect(scoreToBand(6.6)).toBe('good')
    expect(scoreToBand(9.5)).toBe('exceptional')
    expect(scoreToBand(9.4)).toBe('good')
    expect(scoreToBand(4.5)).toBe('steady')
    expect(scoreToBand(4.4)).toBe('developing')
    expect(scoreToBand(2.5)).toBe('developing')
    expect(scoreToBand(2.44)).toBe('difficult')
  })

  it('rounds as the average is shown, to one decimal first: 6.45 shows as 6.5 and is Good', () => {
    expect(scoreToBand(6.45)).toBe('good')
    expect(scoreToBand(6.44)).toBe('steady')
  })

  it('returns a string, never a number', () => {
    const result = scoreToBand(7.5)
    expect(typeof result).toBe('string')
  })
})

describe('computeMatchScore', () => {
  it('returns baseline ~6.6 for neutral inputs with 80min', () => {
    const score = computeMatchScore(baseMatch)
    // draw(0) + average(0) + no card(0) + good body(0) + 80min(+0.1)
    expect(score).toBeCloseTo(6.6, 1)
  })

  it('adds +0.3 for team win', () => {
    const score = computeMatchScore({ ...baseMatch, score_us: 2, score_them: 1 })
    expect(score).toBeCloseTo(6.9, 1)
  })

  it('subtracts -0.2 for team loss', () => {
    const score = computeMatchScore({ ...baseMatch, score_us: 0, score_them: 2 })
    expect(score).toBeCloseTo(6.4, 1)
  })

  it('applies friendly multiplier 0.8 to modifiers only', () => {
    const nonFriendly = computeMatchScore({
      ...baseMatch,
      score_us: 3, score_them: 0,
      self_rating: 'excellent', body_condition: 'fresh',
    })
    const friendly = computeMatchScore({
      ...baseMatch,
      score_us: 3, score_them: 0,
      self_rating: 'excellent', body_condition: 'fresh',
      is_friendly: true,
    })
    const nonFriendlyDelta = nonFriendly - 6.5
    const friendlyDelta = friendly - 6.5
    expect(friendlyDelta).toBeCloseTo(nonFriendlyDelta * 0.8, 1)
  })

  it('clamps score at minimum 4.0', () => {
    const score = computeMatchScore({
      ...baseMatch,
      score_us: 0, score_them: 5,
      self_rating: 'poor', card: 'red', body_condition: 'knock',
      minutes_played: 30,
      position_inputs: { goals: '0', assists: '0', shots_on_target: '0', attacking_threat: 'quiet', holdup_play: 'poor', pressing: 'low' },
    })
    expect(score).toBeGreaterThanOrEqual(4.0)
  })

  it('clamps score at maximum 10.0', () => {
    const score = computeMatchScore({
      ...baseMatch,
      score_us: 5, score_them: 0,
      self_rating: 'excellent', body_condition: 'fresh',
      position_inputs: { goals: '3+', assists: '2+', shots_on_target: '5+', attacking_threat: 'dominant', holdup_play: 'good', pressing: 'high' },
    })
    expect(score).toBeLessThanOrEqual(10.0)
  })

  // GK worked example
  it('produces Good for GK worked example (8.2)', () => {
    const score = computeMatchScore({
      ...baseMatch,
      position: 'gk',
      score_us: 1, score_them: 0,
      self_rating: 'good', body_condition: 'fresh',
      minutes_played: 80,
      position_inputs: {
        clean_sheet: 'yes', saves: '3-4', distribution: 'good',
        commanding: 'yes', errors: 'none',
      },
    })
    expect(scoreToBand(score)).toBe('good')
  })

  // ATT friendly worked example
  it('produces Good for ATT friendly worked example', () => {
    const score = computeMatchScore({
      ...baseMatch,
      position: 'att', competition: 'friendly',
      score_us: 1, score_them: 1,
      self_rating: 'excellent', card: 'yellow', body_condition: 'good',
      minutes_played: 75, is_friendly: true,
      position_inputs: {
        goals: '1', assists: '0', shots_on_target: '3-4',
        attacking_threat: 'dangerous', holdup_play: 'average', pressing: 'medium',
      },
    })
    expect(scoreToBand(score)).toBe('good')
  })

  // DEF loss worked example
  it('produces Steady for DEF loss worked example (5.6)', () => {
    const score = computeMatchScore({
      ...baseMatch,
      position: 'def',
      score_us: 0, score_them: 3,
      self_rating: 'average', body_condition: 'tired',
      minutes_played: 80,
      position_inputs: {
        duels: 'few', clearances: 'some', aerial: 'lost_most',
        positioning: 'no', goals_conceded: '3+', assists: '0',
      },
    })
    expect(scoreToBand(score)).toBe('steady')
  })

  // Boundary condition tests
  it('all-minimum inputs returns a finite number', () => {
    const score = computeMatchScore({
      ...baseMatch,
      score_us: 0, score_them: 5,
      minutes_played: 1,
      card: 'red',
      position_inputs: {},
    })
    expect(typeof score).toBe('number')
    expect(isNaN(score)).toBe(false)
    expect(score).toBeDefined()
  })

  it('all-maximum inputs returns a number between 0 and 10', () => {
    const score = computeMatchScore({
      ...baseMatch,
      score_us: 5, score_them: 0,
      minutes_played: 90,
      card: 'none',
      self_rating: 'excellent',
      body_condition: 'fresh',
      position_inputs: {},
    })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(10)
  })

  it('empty position_inputs does not throw', () => {
    expect(() =>
      computeMatchScore({ ...baseMatch, position_inputs: {} })
    ).not.toThrow()
  })
})

// TRAK-198: the quick match log records no minutes (NULL, "not recorded").
// Unknown minutes give no minutes modifier: not +0.1, and not the −0.1 that
// `null < 45` (true in JavaScript) would quietly apply.
describe('computeMatchScore with minutes not recorded', () => {
  it('rates as if minutes were neither long nor short', () => {
    const middling = computeMatchScore({ ...baseMatch, minutes_played: 60 })
    expect(computeMatchScore({ ...baseMatch, minutes_played: null })).toBe(middling)
    expect(computeMatchScore({ ...baseMatch, minutes_played: 30 })).toBeLessThan(middling)
    expect(computeMatchScore({ ...baseMatch, minutes_played: 80 })).toBeGreaterThan(middling)
  })
})
