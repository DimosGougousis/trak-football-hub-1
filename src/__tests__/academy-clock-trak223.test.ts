import { afterEach, describe, expect, it } from 'vitest'
import { academyClock, meetLead } from '@/lib/event-time'

/**
 * TRAK-223 (20 Oct live run, S3): a phone moved to another zone kept showing
 * the same event times, with nothing saying whose clock they were. Trak keeps
 * academy time (the rehearsal script's rule), so it now names the academy's
 * clock, and the time on this phone when that differs.
 */

const real = process.env.TZ
afterEach(() => { process.env.TZ = real })
const on = (tz: string) => { process.env.TZ = tz }

// Rehearsal Athens on prod: 28 Oct 17:00 is 15:00Z (after the 25 Oct change); 24 Oct 11:00 is 08:00Z.
const WINTER = { date: '2026-10-28', time: '17:00', startsAt: '2026-10-28T15:00:00+00:00' }
const SUMMER = { date: '2026-10-24', time: '11:00', startsAt: '2026-10-24T08:00:00+00:00' }
const DUBAI = { date: '2026-10-28', time: '18:00', startsAt: '2026-10-28T14:00:00+00:00' }

describe('TRAK-223: whose clock an event time is on', () => {
  it('names Athens either side of the 25 Oct clock change, and Dubai', () => {
    on('Europe/Athens')
    expect(academyClock(WINTER)).toEqual({ zone: 'Athens time', here: null })
    expect(academyClock(SUMMER)).toEqual({ zone: 'Athens time', here: null })
    on('Asia/Dubai')
    expect(academyClock(DUBAI)).toEqual({ zone: 'Dubai time', here: null })
  })

  it('a phone on another clock also gets the time there; the academy time itself never moves', () => {
    on('Asia/Dubai')
    expect(academyClock(WINTER)).toEqual({ zone: 'Athens time', here: '19:00 on this phone' })
    expect(academyClock(SUMMER)).toEqual({ zone: 'Athens time', here: '12:00 on this phone' })
    on('Europe/London')
    expect(academyClock(WINTER)).toEqual({ zone: 'Athens time', here: '15:00 on this phone' })
    expect(academyClock(DUBAI)).toEqual({ zone: 'Dubai time', here: '14:00 on this phone' })
  })

  it('says the day when it is a different day on this phone', () => {
    on('America/New_York')
    expect(academyClock({ date: '2026-10-28', time: '01:00', startsAt: '2026-10-27T23:00:00+00:00' }))
      .toEqual({ zone: 'Athens time', here: 'Tue 19:00 on this phone' })
  })

  it('no time, no instant, or an offset Trak does not know: no zone it cannot stand behind', () => {
    on('Europe/Athens')
    expect(academyClock({ ...WINTER, time: null })).toBeNull()
    expect(academyClock({ ...WINTER, startsAt: null })).toBeNull()
    expect(academyClock({ ...WINTER, startsAt: 'not a date' })).toBeNull()
    expect(academyClock({ ...WINTER, startsAt: '2026-10-28T17:00:00+00:00' })?.zone).toBe('academy time')
  })

  it('a meet time says how long before the start it is', () => {
    expect(meetLead('16:15', '17:00', 'match')).toBe('45 min before kick-off')
    expect(meetLead('16:00', '17:00', 'training')).toBe('1 h before the start')
    expect(meetLead('15:30', '17:00', 'match')).toBe('1 h 30 min before kick-off')
    expect(meetLead('17:00', '17:00', 'match')).toBeNull()
  })
})
