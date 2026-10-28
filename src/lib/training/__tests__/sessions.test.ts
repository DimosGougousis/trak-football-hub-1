/** TRAK-294 (Training 1/5): Training home's two lists and My drills' rules. */
import { describe, expect, it } from 'vitest'
import {
  DRILL_LIMITS, blankDrill, cleanDrill, detailCount, drillProblem, searchDrills, splitTrainings, trainingEnd, trainingMinutes,
} from '../sessions'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const NOW = Date.parse('2026-10-29T15:00:00Z')
const at = (ms: number) => new Date(ms).toISOString()
const training = (id: string, start: number, over: { ends_at?: string | null; start_time?: string | null } = {}) =>
  ({ id, starts_at: at(start), ends_at: at(start + 90 * MINUTE), start_time: '18:00:00', ...over })

describe('TRAK-294: when a training is over', () => {
  it('is its end, or 90 minutes after a timed start, or the end of its day with no time', () => {
    const start = NOW
    expect(trainingEnd(training('a', start))).toBe(start + 90 * MINUTE)
    expect(trainingEnd(training('b', start, { ends_at: null }))).toBe(start + 90 * MINUTE)
    expect(trainingEnd(training('c', start, { ends_at: null, start_time: null }))).toBe(start + DAY)
  })

  it('has a length only with a start and an end time', () => {
    expect(trainingMinutes(training('a', NOW))).toBe(90)
    expect(trainingMinutes(training('b', NOW, { ends_at: null }))).toBeNull()
    expect(trainingMinutes(training('c', NOW, { start_time: null }))).toBeNull()
  })
})

describe('TRAK-294: Coming up and Last week', () => {
  it('Coming up holds every training not over yet, today running included, soonest first', () => {
    const rows = [
      training('later', NOW + 3 * DAY),
      training('running', NOW - 30 * MINUTE),
      training('tomorrow', NOW + DAY),
      training('over', NOW - 2 * HOUR),
    ]
    expect(splitTrainings(rows, NOW).comingUp.map(r => r.id)).toEqual(['running', 'tomorrow', 'later'])
  })

  it('Last week holds those over in the past seven days, newest first, and nothing older', () => {
    const rows = [
      training('six-days', NOW - 6 * DAY),
      training('today-done', NOW - 2 * HOUR),
      training('eight-days', NOW - 8 * DAY),
      training('three-days', NOW - 3 * DAY),
    ]
    expect(splitTrainings(rows, NOW).lastWeek.map(r => r.id)).toEqual(['today-done', 'three-days', 'six-days'])
  })

  it("an untimed training stays coming up all its day", () => {
    const morning = training('untimed', NOW - 10 * HOUR, { ends_at: null, start_time: null })
    expect(splitTrainings([morning], NOW)).toEqual({ comingUp: [morning], lastWeek: [] })
  })
})

describe('TRAK-294: a drill', () => {
  it('needs a name, and nothing else', () => {
    expect(drillProblem(blankDrill())).toBe('Give the drill a name.')
    expect(drillProblem({ ...blankDrill(), name: '   ' })).toBe('Give the drill a name.')
    expect(drillProblem({ ...blankDrill(), name: 'Rondos 4v1' })).toBeNull()
    // TRAK-295: a plan's practice says so.
    expect(drillProblem(blankDrill(), 'practice')).toBe('Give the practice a name.')
  })

  it("is refused past the database's limits, each said plainly", () => {
    const ok = { ...blankDrill(), name: 'Rondos' }
    expect(drillProblem({ ...ok, name: 'x'.repeat(DRILL_LIMITS.name + 1) })).toMatch(/name to 80/)
    expect(drillProblem({ ...ok, how: 'x'.repeat(DRILL_LIMITS.how + 1) })).toMatch(/How it works/)
    expect(drillProblem({ ...ok, tell: 'x'.repeat(DRILL_LIMITS.tell + 1) })).toMatch(/tell them/)
    expect(drillProblem({ ...ok, targets: 'x'.repeat(DRILL_LIMITS.detail + 1) })).toBe('Keep Targets to 120 characters.')
    // Spaces at either end don't count.
    expect(drillProblem({ ...ok, name: ` ${'x'.repeat(DRILL_LIMITS.name)} ` })).toBeNull()
  })

  it('is saved trimmed, and counts its details', () => {
    const drill = cleanDrill({ ...blankDrill(), name: '  Rondos ', area: ' 10 × 10 m ', numbers: '  ' })
    expect(drill).toMatchObject({ name: 'Rondos', area: '10 × 10 m', numbers: '' })
    expect(detailCount(drill)).toBe(1)
  })

  it('is found by every word typed, in its name or how it works', () => {
    const drills = [
      { ...blankDrill(), name: 'Rondos 4v1', how: 'Keep the ball in a square' },
      { ...blankDrill(), name: '1v1 in channels', how: 'Attack the front foot' },
    ]
    expect(searchDrills(drills, '').map(d => d.name)).toEqual(['Rondos 4v1', '1v1 in channels'])
    expect(searchDrills(drills, 'RONDO').map(d => d.name)).toEqual(['Rondos 4v1'])
    expect(searchDrills(drills, 'front channels').map(d => d.name)).toEqual(['1v1 in channels'])
    expect(searchDrills(drills, 'rondo front')).toEqual([])
  })
})
