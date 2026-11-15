import { describe, it, expect } from 'vitest'
import { squadShape } from '../shape'
import type { AssessmentRow } from '../snapshot'

const dateOf = (iso: string) => iso.slice(0, 10)
const row = (player: string, created_at: string, value: number, coach_rating: number | null = 7): AssessmentRow => ({
  squad_player_id: player, coach_rating, created_at,
  work_rate: value, technical: value, physical: value, coachability: value, attitude: value, tactical: value,
})

describe('squad shape', () => {
  it('averages each attribute over this month and last month separately', () => {
    const shape = squadShape([
      row('a', '2026-10-05T10:00:00Z', 8), row('b', '2026-10-12T10:00:00Z', 5),
      row('a', '2026-09-20T10:00:00Z', 6), row('b', '2026-08-30T10:00:00Z', 1),
    ], '2026-10-22', dateOf)
    expect(shape.thisMonth?.technical).toBe(6.5)
    expect(shape.lastMonth?.technical).toBe(6)
  })

  it('a month with no assessments is null, never zero', () => {
    expect(squadShape([row('a', '2026-10-05T10:00:00Z', 8)], '2026-10-22', dateOf).lastMonth).toBeNull()
    expect(squadShape([], '2026-10-22', dateOf)).toEqual({ thisMonth: null, lastMonth: null, bands: {} })
  })

  it('January compares with the December before', () => {
    expect(squadShape([row('a', '2025-12-31T10:00:00Z', 4)], '2026-01-10', dateOf).lastMonth?.physical).toBe(4)
  })

  it("counts each player once, in their latest rated assessment's band", () => {
    const shape = squadShape([
      row('a', '2026-09-01T10:00:00Z', 5, 9.2), row('a', '2026-10-01T10:00:00Z', 5, 6.1),
      row('b', '2026-10-01T10:00:00Z', 5, 6.4), row('c', '2026-10-02T10:00:00Z', 5, null),
    ], '2026-10-22', dateOf)
    expect(shape.bands).toEqual({ steady: 2 })
  })
})
