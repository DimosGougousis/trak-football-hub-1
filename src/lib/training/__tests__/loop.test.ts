import { describe, expect, it } from 'vitest'
import { clockPlus, loopNote, loopState, practiceStarts } from '../loop'

/* TRAK-298 (Training 5/5): the loop's steps come from what exists; Close is automatic (Kostas, 28 Oct). TRAK-309: three
   steps, Plan → Who's here → Close. */

describe('the training loop', () => {
  it('starts at Plan', () => {
    expect(loopState({ planned: false, registered: false, started: false, over: false }))
      .toEqual({ done: [false, false, false], at: 0, closed: false })
  })

  it('once planned, Who’s here is next: "next" before the training, "now" once it has started', () => {
    const before = loopState({ planned: true, registered: false, started: false, over: false })
    expect(before.at).toBe(1)
    expect(loopNote(before, false)).toBe('next')
    expect(loopNote(before, true)).toBe('now')
  })

  it('with the register taken, Close is next until the training is over', () => {
    const on = loopState({ planned: true, registered: true, started: true, over: false })
    expect(on).toEqual({ done: [true, true, false], at: 2, closed: false })
    expect(loopNote(on, true)).toBe('next')
  })

  it('closes on its own once it has ended with its register taken: every step done', () => {
    expect(loopState({ planned: true, registered: true, started: true, over: true }))
      .toEqual({ done: [true, true, true], at: 3, closed: true })
  })

  it('an ended training without a register isn’t closed: Who’s here is still to do, now', () => {
    const missed = loopState({ planned: true, registered: false, started: true, over: true })
    expect(missed).toEqual({ done: [true, false, false], at: 1, closed: false })
    expect(loopNote(missed, true)).toBe('now')
  })

  it('a register without a plan closes it all the same; Plan stays not done', () => {
    expect(loopState({ planned: false, registered: true, started: true, over: true }))
      .toEqual({ done: [false, true, true], at: 0, closed: true })
  })
})

describe('View’s clock', () => {
  it('adds minutes on a 24-hour clock', () => {
    expect(clockPlus('18:00', 15)).toBe('18:15')
    expect(clockPlus('18:50', 25)).toBe('19:15')
    expect(clockPlus('23:50', 20)).toBe('00:10')
  })

  it('says when each practice starts, or nothing for a training with no time', () => {
    expect(practiceStarts('18:00', [{ minutes: 15 }, { minutes: 25 }, { minutes: 30 }])).toEqual(['18:00', '18:15', '18:40'])
    expect(practiceStarts(null, [{ minutes: 15 }])).toEqual([null])
  })
})
