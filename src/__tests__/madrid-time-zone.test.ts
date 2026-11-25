import { afterEach, describe, expect, it } from 'vitest'
import { academyClock, phoneEventTime } from '@/lib/event-time'
import { buildCalendarFeed, type FeedEvent } from '../../supabase/functions/_shared/ical-feed'
import { lookupFromRpc } from '../../supabase/functions/calendar-feed/handler'

/**
 * An academy can run on Madrid time (Spain), beside Dubai and Athens (TRAK-175): DC Eleven plays in Marbella. A phone
 * elsewhere shows the event on its own clock with the academy's as a second line, and the calendar feed writes the
 * event in Madrid time with Spain's summer and winter clocks, so phones convert it.
 */

const original = process.env.TZ
afterEach(() => { process.env.TZ = original })

// 10:00 in Marbella on Sat 28 Nov 2026 is 09:00 UTC (winter, UTC+1).
const WINTER = { date: '2026-11-28', time: '10:00', startsAt: '2026-11-28T09:00:00+00:00' }

describe('a Madrid academy on another phone', () => {
  it('reads 10:00 Madrid as 13:00 on a phone in Dubai, with the academy time beside it', () => {
    process.env.TZ = 'Asia/Dubai'
    expect(phoneEventTime({ event_date: WINTER.date, start_time: `${WINTER.time}:00`, starts_at: WINTER.startsAt }))
      .toEqual({ date: '2026-11-28', time: '13:00' })
    expect(academyClock(WINTER)).toBe('10:00 Madrid time')
  })

  it('says nothing more on a phone in Spain', () => {
    process.env.TZ = 'Europe/Madrid'
    expect(academyClock(WINTER)).toBeNull()
  })
})

describe('the calendar feed for a Madrid academy', () => {
  const event: FeedEvent = {
    id: '0f8a1c2e-0000-4000-8000-0000000000aa', kind: 'match', squadLabel: 'U12', date: '2026-11-28', startTime: '10:00',
    endTime: '11:30', meetTime: '09:15', opponent: 'CD Cultural', homeAway: 'away', venue: 'Campo Vázquez Cultural, Marbella',
    kit: null, status: 'scheduled', sequence: 0, updatedAt: '2026-11-25T10:00:00.000Z', timeZone: 'Europe/Madrid',
  }
  const feed = () => buildCalendarFeed([event]).replace(/\r\n[ \t]/g, '').split('\r\n')

  it('writes the start in Madrid time and describes Spain\'s clocks', () => {
    const all = feed()
    expect(all).toContain('DTSTART;TZID=Europe/Madrid:20261128T100000')
    const zone = all.slice(all.indexOf('TZID:Europe/Madrid'), all.indexOf('END:VTIMEZONE') + 1)
    expect(zone).toEqual(expect.arrayContaining(['TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'TZNAME:CET']))
    expect(all.join('\n')).toContain('Madrid time')
  })

  it('accepts a Madrid event from the database instead of refusing it', () => {
    expect(lookupFromRpc({ events: [event], child_names: [] })).toEqual({ found: true, events: [event], childNames: [] })
  })
})
