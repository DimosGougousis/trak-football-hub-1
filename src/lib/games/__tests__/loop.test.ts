import { describe, expect, it } from 'vitest'
import { LOOP_STEPS, STATE, fullTime, gameState, orderGames, type GameEvent } from '../loop'

// Kick-off Sat 31 Oct 2026, 11:00 in Athens (09:00Z); the clock is an instant, so the device's zone never matters.
const KICK_OFF = Date.parse('2026-10-31T09:00:00Z')
const game = (over: Partial<GameEvent> = {}): GameEvent =>
  ({ id: 'g', published: true, starts_at: '2026-10-31T09:00:00+00:00', ends_at: '2026-10-31T10:30:00+00:00', ...over })

describe('gameState (TRAK-283)', () => {
  it('a match whose logistics are a draft waits for them, before and after kick-off', () => {
    expect(gameState(game({ published: false }), KICK_OFF - 1000)).toBe('logistics')
    expect(gameState(game({ published: false }), KICK_OFF + 1000)).toBe('logistics')
  })

  it('a published match before kick-off has no plan yet', () => {
    expect(gameState(game(), KICK_OFF - 1000)).toBe('plan')
  })

  it('locks at kick-off, to the second', () => {
    expect(gameState(game(), KICK_OFF)).toBe('locked')
    expect(gameState(game(), KICK_OFF + 1000)).toBe('locked')
  })

  it('reaches full time at the event\'s end, or 90 minutes after kick-off when it has none', () => {
    expect(gameState(game(), Date.parse('2026-10-31T10:29:59Z'))).toBe('locked')
    expect(gameState(game(), Date.parse('2026-10-31T10:30:00Z'))).toBe('fullTime')
    expect(fullTime(game({ ends_at: null }))).toBe(KICK_OFF + 90 * 60_000)
  })

  it('a moved match moves its states with it', () => {
    const moved = game({ starts_at: '2026-11-07T09:00:00+00:00', ends_at: '2026-11-07T10:30:00+00:00' })
    expect(gameState(moved, KICK_OFF + 1000)).toBe('plan')
  })

  it('names each state on the loop the stepper draws', () => {
    expect(LOOP_STEPS).toEqual(['Logistics', 'Plan', 'Shared', 'Kick-off', 'Evaluation', 'Published'])
    expect(LOOP_STEPS[STATE.logistics.step]).toBe('Logistics')
    expect(LOOP_STEPS[STATE.plan.step]).toBe('Plan')
    expect(LOOP_STEPS[STATE.locked.step]).toBe('Kick-off')
    expect(LOOP_STEPS[STATE.fullTime.step]).toBe('Evaluation')
  })

  it('offers one next action before kick-off, and none after it until the evaluation exists', () => {
    expect(STATE.logistics.action).toEqual({ label: 'Share the logistics', tab: 'logistics' })
    expect(STATE.plan.action).toEqual({ label: 'Write the plan', tab: 'plan' })
    expect(STATE.locked.action).toBeUndefined()
    expect(STATE.fullTime.action).toBeUndefined()
  })
})

describe('orderGames (TRAK-283)', () => {
  const at = (id: string, day: number) => game({ id, starts_at: `2026-10-${String(day).padStart(2, '0')}T09:00:00+00:00`, ends_at: null })
  const now = Date.parse('2026-10-20T12:00:00Z')

  it('lists upcoming matches soonest first, then past ones newest first; the next game is the soonest upcoming', () => {
    const { next, games } = orderGames([at('past-old', 3), at('later', 30), at('past-new', 17), at('soon', 24)], now)
    expect(games.map(g => g.id)).toEqual(['soon', 'later', 'past-new', 'past-old'])
    expect(next?.id).toBe('soon')
  })

  it('a match that has kicked off is no longer the next game', () => {
    const { next } = orderGames([at('today', 20), at('next-week', 27)], Date.parse('2026-10-20T09:00:00Z'))
    expect(next?.id).toBe('next-week')
  })

  it('with only past matches there is no next game', () => {
    expect(orderGames([at('past', 3)], now).next).toBeNull()
  })
})
