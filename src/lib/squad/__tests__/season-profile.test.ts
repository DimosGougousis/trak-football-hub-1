import { describe, it, expect } from 'vitest'
import { seasonAverages } from '../season-profile'
import type { AssessmentRow } from '../snapshot'

const dateOf = (iso: string) => iso.slice(0, 10)
const row = (player: string, created_at: string, value: number, technical = value): AssessmentRow => ({
  squad_player_id: player, coach_rating: 7, created_at,
  work_rate: value, technical, physical: value, coachability: value, attitude: value, tactical: value,
})

describe('season averages', () => {
  it("averages a player's assessments since 1 July, per attribute", () => {
    const { players } = seasonAverages([
      row('a', '2026-09-01T10:00:00Z', 6, 8), row('a', '2026-10-01T10:00:00Z', 7, 5),
    ], '2026-07-01', dateOf)
    expect(players.get('a')).toEqual({ count: 2, scores: expect.objectContaining({ work_rate: 6.5, technical: 6.5 }) })
  })

  it('leaves out last season', () => {
    const { players } = seasonAverages([row('a', '2026-06-30T10:00:00Z', 2), row('a', '2026-07-01T10:00:00Z', 8)], '2026-07-01', dateOf)
    expect(players.get('a')?.scores.physical).toBe(8)
    expect(players.get('a')?.count).toBe(1)
  })

  it("the squad's average counts each player once, however often assessed", () => {
    const { squad } = seasonAverages([
      row('a', '2026-09-01T10:00:00Z', 8), row('a', '2026-09-08T10:00:00Z', 8), row('a', '2026-09-15T10:00:00Z', 8),
      row('b', '2026-09-01T10:00:00Z', 4),
    ], '2026-07-01', dateOf)
    expect(squad?.attitude).toBe(6)
  })

  it('a season with no assessments has no squad average and no players', () => {
    expect(seasonAverages([], '2026-07-01', dateOf)).toEqual({ players: new Map(), squad: null })
  })
})
