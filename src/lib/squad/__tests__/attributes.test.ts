import { describe, it, expect } from 'vitest'
import { weekStarts, attributeHeatmap, focusAttribute, type AttributeRow } from '../attributes'
import type { AssessmentRow } from '../snapshot'

const WEEKS = weekStarts('2026-10-21')
const dateOf = (iso: string) => iso.slice(0, 10)

const row = (id: string, date: string, tactical: number): AssessmentRow => ({
  squad_player_id: id, coach_rating: 5, created_at: `${date}T10:00:00Z`,
  work_rate: 5, technical: 5, physical: 5, coachability: 5, attitude: 5, tactical,
})
const tacticalRow = (rows: AssessmentRow[]) =>
  attributeHeatmap(rows, WEEKS, dateOf).find(r => r.key === 'tactical')!

describe('weekStarts', () => {
  it('gives six Mondays, oldest first', () => {
    expect(weekStarts('2026-10-21')).toEqual(['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'])
  })
  it('a Monday is its own week start; a Sunday belongs to the week before', () => {
    expect(weekStarts('2026-10-19', 1)).toEqual(['2026-10-19'])
    expect(weekStarts('2026-10-25', 1)).toEqual(['2026-10-19'])
  })
  it('honours count', () => {
    expect(weekStarts('2026-10-21', 2)).toEqual(['2026-10-12', '2026-10-19'])
  })
})

describe('attributeHeatmap', () => {
  it('returns the six attributes in order with labels', () => {
    const rows = attributeHeatmap([], WEEKS, dateOf)
    expect(rows.map(r => r.label)).toEqual(['Work rate', 'Technical', 'Physical', 'Coachability', 'Attitude', 'Tactical'])
    expect(rows[0]).toMatchObject({ weeks: [null, null, null, null, null, null], range: null, trend: null, fallingWeeks: 0 })
  })
  it('a cell is the weekly mean to one decimal place; an empty week is null and out of the trend', () => {
    const t = tacticalRow([
      row('a', '2026-09-14', 5), row('b', '2026-09-16', 6.5),
      row('a', '2026-10-05', 4), row('b', '2026-10-11', 4), row('c', '2026-10-11', 5),
    ])
    expect(t.weeks).toEqual([5.8, null, null, 4.3, null, null])
    expect(t.trend).toBe(-1.5)
  })
  it('range uses each child latest value; wide at 5 or more', () => {
    const wide = tacticalRow([row('a', '2026-10-05', 9), row('a', '2026-10-19', 2), row('b', '2026-10-19', 8)])
    expect(wide.range).toEqual({ min: 2, max: 8, wide: true })
    const narrow = tacticalRow([row('a', '2026-10-19', 6), row('b', '2026-10-19', 9)])
    expect(narrow.range).toEqual({ min: 6, max: 9, wide: false })
  })
  it('ignores assessments outside the weeks', () => {
    const t = tacticalRow([row('a', '2026-08-01', 3), row('a', '2026-10-19', 6)])
    expect(t.weeks).toEqual([null, null, null, null, null, 6])
  })
  it('trend is last minus first non-null week; fewer than two is null', () => {
    const avgs = [5.6, 5.4, 5.3, 5.2, 5.0, 5.1]
    const t = tacticalRow(avgs.map((v, i) => row('a', WEEKS[i], v)))
    expect(t.weeks).toEqual(avgs)
    expect(t.trend).toBe(-0.5)
    expect(t.fallingWeeks).toBe(0)
    expect(tacticalRow([row('a', '2026-10-19', 6)]).trend).toBeNull()
  })
  it('counts consecutive weekly drops back from the latest week', () => {
    const avgs = [5.6, 5.4, 5.3, 5.2, 5.0]
    const t = tacticalRow(avgs.map((v, i) => row('a', WEEKS[i + 1], v)))
    expect(t.fallingWeeks).toBe(4)
  })
})

const ar = (key: AttributeRow['key'], label: string, weeks: (number | null)[], range: AttributeRow['range'], fallingWeeks = 0): AttributeRow =>
  ({ key, label, weeks, range, trend: null, fallingWeeks })

describe('focusAttribute', () => {
  const rows = [
    ar('work_rate', 'Work rate', [7, 7.2], { min: 6, max: 9, wide: false }),
    ar('tactical', 'Tactical', [5.6, 5.1], { min: 2, max: 8, wide: true }),
    ar('physical', 'Physical', [6.3, null], { min: 5, max: 7, wide: false }),
  ]
  it('picks the lowest latest average and describes the spread', () => {
    const f = focusAttribute(rows)!
    expect(f.row.key).toBe('tactical')
    expect(f.sentence).toBe('Lowest average (5.1). The range is wide (2–8): a few children are carrying the rest.')
  })
  it('says how long it has been falling, and a narrow range ends plainly', () => {
    const f = focusAttribute([ar('tactical', 'Tactical', [6, 5.5, 5], { min: 4, max: 6, wide: false }, 2)])!
    expect(f.sentence).toBe('Lowest average (5.0), and falling for 2 weeks. The range is narrow (4–6).')
  })
  it('returns null when nothing is recorded', () => {
    expect(focusAttribute([])).toBeNull()
    expect(focusAttribute([ar('tactical', 'Tactical', [null, null], null)])).toBeNull()
  })
})
