import { describe, it, expect } from 'vitest'
import { bandMoves, bandSpread, type AssessmentRow, type BandMove } from '../snapshot'

const row = (id: string, rating: number | null, created_at: string): AssessmentRow => ({
  squad_player_id: id, coach_rating: rating, created_at,
  work_rate: 5, technical: 5, physical: 5, coachability: 5, attitude: 5, tactical: 5,
})

describe('bandMoves', () => {
  it('Leo Steady to Mixed is a drop', () => {
    const m = bandMoves([row('leo', 6.5, '2026-10-01T10:00:00Z'), row('leo', 5, '2026-10-08T10:00:00Z')]).get('leo')!
    expect(m).toEqual({ squadPlayerId: 'leo', band: 'mixed', previous: 'steady', move: -1 })
  })
  it('Sami Standout to Exceptional is a rise, whatever the row order', () => {
    const m = bandMoves([row('sami', 9.4, '2026-10-08T10:00:00Z'), row('sami', 8.2, '2026-10-01T10:00:00Z')]).get('sami')!
    expect(m).toMatchObject({ band: 'exceptional', previous: 'standout', move: 1 })
  })
  it('a single assessment has no previous band and no move', () => {
    const m = bandMoves([row('a', 7.5, '2026-10-01T10:00:00Z')]).get('a')!
    expect(m).toMatchObject({ band: 'good', previous: null, move: 0 })
  })
  it('the same band twice is no move', () => {
    const m = bandMoves([row('a', 7.1, '2026-10-01T10:00:00Z'), row('a', 7.9, '2026-10-08T10:00:00Z')]).get('a')!
    expect(m.move).toBe(0)
  })
  it('ignores a null coach_rating', () => {
    const moves = bandMoves([
      row('a', 6.5, '2026-10-01T10:00:00Z'), row('a', null, '2026-10-08T10:00:00Z'), row('b', null, '2026-10-08T10:00:00Z'),
    ])
    expect(moves.get('a')).toMatchObject({ band: 'steady', previous: null, move: 0 })
    expect(moves.has('b')).toBe(false)
  })
})

describe('bandMoves dropAfter', () => {
  const seq = (...ratings: number[]) => ratings.map((r, i) => row('x', r, `2026-10-0${i + 1}T10:00:00Z`))

  it('defaults to one lower step', () => {
    expect(bandMoves(seq(6.5, 5)).get('x')!.move).toBe(-1)
  })
  it('with 2, a drop needs two lower steps in a row: Good, Steady, Mixed', () => {
    const m = bandMoves(seq(7.5, 6.5, 5), 2).get('x')!
    expect(m).toMatchObject({ band: 'mixed', previous: 'steady', move: -1 })
  })
  it('with 2, Good, Good, Mixed is not a drop', () => {
    expect(bandMoves(seq(7.5, 7.2, 5), 2).get('x')!.move).toBe(0)
  })
  it('with 2, only two assessments with a drop is not a drop', () => {
    const m = bandMoves(seq(6.5, 5), 2).get('x')!
    expect(m).toMatchObject({ previous: 'steady', move: 0 })
  })
  it('a rise is still one step up whatever dropAfter is', () => {
    expect(bandMoves(seq(5, 6.5), 2).get('x')!.move).toBe(1)
  })
})

describe('bandSpread', () => {
  it('lists all seven bands in BANDS order with the children in each', () => {
    const moves = bandMoves([row('a', 9.5, '2026-10-01T10:00:00Z'), row('b', 5, '2026-10-01T10:00:00Z'), row('c', 5.5, '2026-10-01T10:00:00Z')])
    const spread = bandSpread(moves)
    expect(spread.map(s => s.band)).toEqual(['exceptional', 'standout', 'good', 'steady', 'mixed', 'developing', 'difficult'])
    expect(spread[0].ids).toEqual(['a'])
    expect(spread[4].ids).toEqual(['b', 'c'])
    expect(spread[6].ids).toEqual([])
  })
})

const mv = (id: string, move: -1 | 0 | 1): BandMove => ({ squadPlayerId: id, band: 'mixed', previous: 'steady', move })
const names = { leo: 'Leo M.', yusuf: 'Yusuf A.', sami: 'Sami R.', omar: 'Omar K.', ethan: 'Ethan P.' }
