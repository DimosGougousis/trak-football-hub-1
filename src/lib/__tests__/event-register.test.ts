import { describe, it, expect } from 'vitest'
import { registerProblem, registerStart, type RegisterPlayer } from '@/lib/event-register'

/**
 * TRAK-138 (J8.15): how the register opens, before the coach taps anything.
 * Everyone counts as coming unless their family said "can't make it" (J8.14),
 * like a school register; a child who can't be recorded is never pre-ticked
 * (Coach OS ticked a player who had declined). The database repeats every rule
 * (supabase/tests/event_register.sql); these are what the screen shows first.
 */

const player = (id: string, over: Partial<RegisterPlayer> = {}): RegisterPlayer =>
  ({ id, name: `Player ${id}`, ready: true, ...over })

describe('the register opens pre-filled', () => {
  it('a training with 2 "can\'t make it": those 2 absent, the rest present', () => {
    const squad = ['a', 'b', 'c', 'd', 'e'].map(id => player(id))
    const start = registerStart(squad, ['b', 'd'])
    expect([...start.present].sort()).toEqual(['a', 'c', 'e'])
    expect(start.absentByFamily).toEqual(['b', 'd'])
    expect(start.cannotRecord).toEqual([])
  })

  it('never pre-ticks a child who can\'t be recorded, and says why', () => {
    const start = registerStart([player('a'), player('w', { ready: false, waitReason: 'Waiting for parent' })], [])
    expect([...start.present]).toEqual(['a'])
    expect(start.cannotRecord).toEqual([{ id: 'w', reason: 'Waiting for parent' }])
  })

  it('an absence for someone no longer in the squad changes nothing', () => {
    const start = registerStart([player('a')], ['gone'])
    expect([...start.present]).toEqual(['a'])
    expect(start.absentByFamily).toEqual([])
  })
})

describe('which events have a register', () => {
  const now = new Date('2026-10-14T14:00:00Z') // 18:00 in Dubai
  const event = (over: Record<string, unknown> = {}) => ({
    event_type: 'training', published: true, status: 'scheduled', event_date: '2026-10-14', start_time: '17:00:00',
    starts_at: '2026-10-14T13:00:00Z', ...over,
  })

  it('a published training that has started has one', () => {
    expect(registerProblem(event(), now)).toBeNull()
    expect(registerProblem(event({ event_type: 'other' }), now)).toBeNull()
    expect(registerProblem(event({ event_date: '2026-10-01' }), now)).toBeNull()
  })

  it('not before it starts, in Dubai time, whatever the phone says (TRAK-67)', () => {
    expect(registerProblem(event({ start_time: '19:00:00' }), now)).toBe('The register opens once the event has started')
    expect(registerProblem(event({ event_date: '2026-10-15' }), now)).toBe('The register opens once the event has started')
    // No time yet: it opens at the start of its day.
    expect(registerProblem(event({ start_time: null }), now)).toBeNull()
  })

  it('never for a draft, a cancelled event or a match', () => {
    expect(registerProblem(event({ published: false }), now)).toBe('Only a published event has a register')
    expect(registerProblem(event({ status: 'cancelled' }), now)).toBe('This event was cancelled, so it has no register')
    expect(registerProblem(event({ event_type: 'match' }), now)).toBe('A match is recorded in the match log, with its score and minutes')
  })
})
