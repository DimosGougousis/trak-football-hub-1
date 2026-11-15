import { afterEach, describe, expect, it } from 'vitest'
import { academyClock, meetLead, phoneClock, phoneEventTime } from '@/lib/event-time'

/**
 * TRAK-223 (20 Oct live run, S3): a phone moved to another zone kept showing
 * the same event times, with nothing saying whose clock they were. Imad, 23 Oct:
 * every screen shows the phone's own clock (19:00 in Athens reads 20:00 in
 * Dubai), with the academy's time as a second line only when the clocks differ.
 */

const real = process.env.TZ
afterEach(() => { process.env.TZ = real })
const on = (tz: string) => { process.env.TZ = tz }

// Rehearsal Athens on prod: 28 Oct 17:00 is 15:00Z (after the 25 Oct change); 24 Oct 11:00 is 08:00Z.
const WINTER = { date: '2026-10-28', time: '17:00', startsAt: '2026-10-28T15:00:00+00:00' }
const SUMMER = { date: '2026-10-24', time: '11:00', startsAt: '2026-10-24T08:00:00+00:00' }
const DUBAI = { date: '2026-10-28', time: '18:00', startsAt: '2026-10-28T14:00:00+00:00' }
const row = (e: typeof WINTER) => ({ event_date: e.date, start_time: `${e.time}:00`, starts_at: e.startsAt })

describe("Imad, 23 Oct: an event on this phone's clock", () => {
  it('reads 19:00 Athens as 20:00 in Dubai, and as itself in Athens', () => {
    on('Europe/Athens')
    expect(phoneEventTime(row({ ...WINTER, time: '19:00', startsAt: '2026-10-28T17:00:00+00:00' }))).toEqual({ date: '2026-10-28', time: '19:00' })
    on('Asia/Dubai')
    expect(phoneEventTime(row({ ...WINTER, time: '19:00', startsAt: '2026-10-28T17:00:00+00:00' }))).toEqual({ date: '2026-10-28', time: '21:00' })
    expect(phoneEventTime(row(SUMMER))).toEqual({ date: '2026-10-24', time: '12:00' })
  })

  it('moves the day when the phone is past midnight', () => {
    on('Asia/Dubai')
    expect(phoneEventTime({ event_date: '2026-10-28', start_time: '23:00:00', starts_at: '2026-10-28T21:00:00+00:00' }))
      .toEqual({ date: '2026-10-29', time: '01:00' })
  })

  it('an event with no time yet keeps the academy day, wherever the phone is', () => {
    on('America/New_York')
    expect(phoneEventTime({ event_date: '2026-10-28', start_time: null, starts_at: '2026-10-27T22:00:00+00:00' }))
      .toEqual({ date: '2026-10-28', time: null })
  })

  it('a meet time moves by the same gap as the start, across midnight too', () => {
    on('Asia/Dubai')
    expect(phoneClock(row(WINTER), '16:15:00')).toBe('18:15')
    expect(phoneClock({ event_date: '2026-10-28', start_time: '23:00:00', starts_at: '2026-10-28T21:00:00+00:00' }, '22:30')).toBe('00:30')
    on('Europe/Athens')
    expect(phoneClock(row(WINTER), '16:15:00')).toBe('16:15')
    expect(phoneClock(row(WINTER), null)).toBeNull()
  })
})

describe('TRAK-223: the academy line, only when the clocks differ', () => {
  it('says nothing on a phone in the academy zone, either side of the 25 Oct change, and in Dubai', () => {
    on('Europe/Athens')
    expect(academyClock(WINTER)).toBeNull()
    expect(academyClock(SUMMER)).toBeNull()
    on('Asia/Dubai')
    expect(academyClock(DUBAI)).toBeNull()
  })

  it("a phone on another clock gets the academy's own time and zone", () => {
    on('Asia/Dubai')
    expect(academyClock(WINTER)).toBe('17:00 Athens time')
    expect(academyClock(SUMMER)).toBe('11:00 Athens time')
    on('Europe/London')
    expect(academyClock(DUBAI)).toBe('18:00 Dubai time')
  })

  it("names the academy's day when it is a different day on this phone", () => {
    on('America/New_York')
    expect(academyClock({ date: '2026-10-28', time: '01:00', startsAt: '2026-10-27T23:00:00+00:00' })).toBe('Wed 01:00 Athens time')
  })

  it('no time, no instant, or an offset Trak does not know: no zone it cannot stand behind', () => {
    on('Europe/Athens')
    expect(academyClock({ ...WINTER, time: null })).toBeNull()
    expect(academyClock({ ...WINTER, startsAt: null })).toBeNull()
    expect(academyClock({ ...WINTER, startsAt: 'not a date' })).toBeNull()
    // An offset that isn't Dubai's or Athens's: the time isn't moved, so there's no second line either.
    expect(academyClock({ ...WINTER, startsAt: '2026-10-28T17:00:00+00:00' })).toBeNull()
    on('Asia/Dubai')
    expect(phoneEventTime({ event_date: '2026-10-28', start_time: '17:00:00', starts_at: '2099-01-01T13:00:00Z' })).toEqual({ date: '2026-10-28', time: '17:00' })
  })

  it('a meet time says how long before the start it is', () => {
    expect(meetLead('16:15', '17:00', 'match')).toBe('45 min before kick-off')
    expect(meetLead('16:00', '17:00', 'training')).toBe('1 h before the start')
    expect(meetLead('15:30', '17:00', 'match')).toBe('1 h 30 min before kick-off')
    expect(meetLead('17:00', '17:00', 'match')).toBeNull()
  })
})
