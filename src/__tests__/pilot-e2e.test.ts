import { describe, it, expect } from 'vitest'
import { computeMatchScore, scoreToBand } from '../lib/rating-engine'
import { BANDS } from '../lib/types'

describe('pilot readiness checks', () => {
  it('all 7 bands have display config', () => {
    const bands = ['exceptional', 'standout', 'good', 'steady', 'mixed', 'developing', 'difficult']
    bands.forEach(b => {
      const config = BANDS.find(c => c.word.toLowerCase() === b)
      expect(config).toBeDefined()
      expect(config!.color).toBeTruthy()
      expect(config!.bg).toBeTruthy()
      expect(config!.border).toBeTruthy()
    })
  })

  it('scoreToBand covers full range without gaps', () => {
    for (let s = 4.0; s <= 10.0; s += 0.01) {
      const band = scoreToBand(parseFloat(s.toFixed(2)))
      expect(typeof band).toBe('string')
      expect(band.length).toBeGreaterThan(0)
    }
  })

  it('all 4 positions produce valid scores', () => {
    const positions = ['gk', 'def', 'mid', 'att'] as const
    positions.forEach(pos => {
      const score = computeMatchScore({
        position: pos, competition: 'league', venue: 'home', opponent: 'Test',
        score_us: 1, score_them: 1, minutes_played: 80, card: 'none',
        body_condition: 'good', self_rating: 'average',
        position_inputs: {}, is_friendly: false,
      })
      expect(score).toBeGreaterThanOrEqual(4.0)
      expect(score).toBeLessThanOrEqual(10.0)
    })
  })

  it('no decimal number in scoreToBand output', () => {
    for (let s = 4.0; s <= 10.0; s += 0.1) {
      const band = scoreToBand(s)
      expect(typeof band).toBe('string')
      expect(band).not.toMatch(/\d+\.\d+/)
    }
  })
})
