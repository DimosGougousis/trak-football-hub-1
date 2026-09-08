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

describe('scoreToBand', () => {
  it('maps 9.0+ to exceptional', () => {
    expect(scoreToBand(9.5)).toBe('exceptional')
    expect(scoreToBand(9.0)).toBe('exceptional')
  })
  it('maps 8.0-8.99 to standout', () => {
    expect(scoreToBand(8.5)).toBe('standout')
    expect(scoreToBand(8.99)).toBe('standout')
  })
  it('maps 7.0-7.99 to good', () => {
    expect(scoreToBand(7.5)).toBe('good')
  })
  it('maps 6.0-6.99 to steady', () => {
    expect(scoreToBand(6.5)).toBe('steady')
  })
  it('maps 4.0-5.99 to mixed', () => {
    expect(scoreToBand(5.0)).toBe('mixed')
    expect(scoreToBand(4.0)).toBe('mixed')
  })
  it('maps 2.0-3.99 to developing', () => {
    expect(scoreToBand(3.0)).toBe('developing')
    expect(scoreToBand(2.0)).toBe('developing')
  })
  it('maps below 2.0 to difficult', () => {
    expect(scoreToBand(0)).toBe('difficult')
    expect(scoreToBand(1.99)).toBe('difficult')
  })
  it('returns a string, never a number', () => {
    const result = scoreToBand(7.5)
    expect(typeof result).toBe('string')
  })

  // Boundary condition tests
  it('scoreToBand(10) → exceptional (top of scale)', () => {
    expect(scoreToBand(10)).toBe('exceptional')
  })

  it('scoreToBand(0) → difficult (bottom of scale)', () => {
    expect(scoreToBand(0)).toBe('difficult')
  })

  it('scoreToBand(5) → mixed (middle of scale)', () => {
    expect(scoreToBand(5)).toBe('mixed')
  })

  it('scoreToBand(6.5) → steady (default fallback value used throughout the app)', () => {
    expect(scoreToBand(6.5)).toBe('steady')
  })

  // Band boundary ±0.01 tests
  it('boundary at 9.0: 8.99 → standout, 9.0 → exceptional', () => {
    expect(scoreToBand(8.99)).toBe('standout')
    expect(scoreToBand(9.0)).toBe('exceptional')
  })

  it('boundary at 8.0: 7.99 → good, 8.0 → standout', () => {
    expect(scoreToBand(7.99)).toBe('good')
    expect(scoreToBand(8.0)).toBe('standout')
  })

  it('boundary at 7.0: 6.99 → steady, 7.0 → good', () => {
    expect(scoreToBand(6.99)).toBe('steady')
    expect(scoreToBand(7.0)).toBe('good')
  })

  it('boundary at 6.0: 5.99 → mixed, 6.0 → steady', () => {
    expect(scoreToBand(5.99)).toBe('mixed')
    expect(scoreToBand(6.0)).toBe('steady')
  })

  it('boundary at 4.0: 3.99 → developing, 4.0 → mixed', () => {
    expect(scoreToBand(3.99)).toBe('developing')
    expect(scoreToBand(4.0)).toBe('mixed')
  })

  it('boundary at 2.0: 1.99 → difficult, 2.0 → developing', () => {
    expect(scoreToBand(1.99)).toBe('difficult')
    expect(scoreToBand(2.0)).toBe('developing')
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
  it('produces Standout for GK worked example', () => {
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
    expect(scoreToBand(score)).toBe('standout')
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
  it('produces Mixed for DEF loss worked example', () => {
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
    expect(scoreToBand(score)).toBe('mixed')
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
