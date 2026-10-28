import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  blankPractice, fromSaved, lastPlanWay, minutesLine, move, plannedMinutes, rememberPlanWay, sourceLabel, toSave,
  type SavedPractice,
} from '../plans'

/* TRAK-295 (Training 2/5): a plan's rules, apart from the screens. */

const saved = (position: number, name: string, over: Partial<SavedPractice> = {}): SavedPractice => ({
  position, name, minutes: 15, how: '', tell: '', area: '', numbers: '', direction: '', targets: '', conditions: '',
  source: 'own', drill_id: null, library_session: null, ...over,
})

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('a plan’s practices', () => {
  it('a new practice is written here and ticked for My drills', () => {
    expect(blankPractice()).toMatchObject({ name: '', minutes: 15, source: 'own', saveToDrills: true })
  })

  it('the saved practices come back in order, never to be saved to My drills again', () => {
    const practices = fromSaved([saved(2, 'Finishing 3v2'), saved(1, 'Rondos 4v1', { source: 'drill', drill_id: 'd-1' })])
    expect(practices.map(p => p.name)).toEqual(['Rondos 4v1', 'Finishing 3v2'])
    expect(practices.every(p => !p.saveToDrills)).toBe(true)
    expect(practices[0]).toMatchObject({ source: 'drill', drill_id: 'd-1' })
    expect(practices[0]).not.toHaveProperty('position')
  })

  it('saving sends them trimmed, and asks for a drill only for a practice written here and ticked', () => {
    const own = { ...blankPractice(), name: '  Pressing on the trigger ', tell: ' Press when their 6 turns. ' }
    const kept = { ...blankPractice(), name: 'Rondos', source: 'drill' as const, drill_id: 'd-1' }
    const notKept = { ...blankPractice(), name: 'Game 8v8', saveToDrills: false }
    expect(toSave([own, kept, notKept])).toEqual([
      expect.objectContaining({ name: 'Pressing on the trigger', tell: 'Press when their 6 turns.', source: 'own', save_to_drills: true }),
      expect.objectContaining({ name: 'Rondos', source: 'drill', drill_id: 'd-1', save_to_drills: false }),
      expect.objectContaining({ name: 'Game 8v8', source: 'own', save_to_drills: false }),
    ])
    expect(toSave([own])).toEqual([expect.not.objectContaining({ saveToDrills: expect.anything() })])
  })

  it('each says where it came from', () => {
    expect(sourceLabel({ source: 'own', saveToDrills: false })).toBe('Written here')
    expect(sourceLabel({ source: 'own', saveToDrills: true })).toBe('Your drill')
    expect(sourceLabel({ source: 'drill', saveToDrills: false })).toBe('Your drill')
    expect(sourceLabel({ source: 'library', saveToDrills: false })).toBe('Library')
  })

  it('moves one up or down, and never past either end', () => {
    expect(move(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b'])
    expect(move(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    const list = ['a', 'b']
    expect(move(list, 0, -1)).toBe(list)
    expect(move(list, 1, 1)).toBe(list)
  })
})

describe('the minutes', () => {
  it('adds up the practices', () => {
    expect(plannedMinutes([{ minutes: 15 }, { minutes: 25 }])).toBe(40)
    expect(plannedMinutes([])).toBe(0)
  })

  it('says how many of the training’s minutes are planned, and what’s left or over', () => {
    expect(minutesLine(40, 90)).toEqual({ planned: '40 of 90 min planned', left: '50 min left' })
    expect(minutesLine(90, 90)).toEqual({ planned: '90 of 90 min planned', left: 'Fills the session' })
    expect(minutesLine(100, 90)).toEqual({ planned: '100 of 90 min planned', left: '10 min over' })
  })

  it('with no length for the training, just what’s planned', () => {
    expect(minutesLine(40, null)).toEqual({ planned: '40 min planned', left: null })
  })
})

describe('the last way the coach planned', () => {
  it('is remembered per coach, on this device', () => {
    expect(lastPlanWay('coach-a')).toBeNull()
    rememberPlanWay('coach-a', 'write')
    expect(lastPlanWay('coach-a')).toBe('write')
    expect(lastPlanWay('coach-b')).toBeNull()
    expect(lastPlanWay(undefined)).toBeNull()
  })

  it('a device that refuses storage just forgets it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
    expect(() => rememberPlanWay('coach-a', 'write')).not.toThrow()
    expect(lastPlanWay('coach-a')).toBeNull()
  })
})
