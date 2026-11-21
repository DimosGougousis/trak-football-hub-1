/**
 * TRAK-525 (Reports 2/10, Imad 21 Nov): the rhythm is every month, every 3 months, every 6 months or Custom (2 to 26
 * weeks). The two plans on prod (21 Nov, both monthly) keep their dates; every 3 and 6 months land on the last chosen
 * day of every third or sixth month of the season; Custom follows every 2 and 6 weeks' rule; the season ends with a
 * report when the rhythm would leave its last four weeks without one.
 */
import { describe, expect, it } from 'vitest'
import { evaluationDates, isEvalEvery, rhythmOf, rhythmText, weeksOf } from '@/lib/evaluation'

describe('TRAK-525 the two plans on prod keep their dates', () => {
  it('monthly on the last Monday, 3 Aug 2026 to 1 May 2027', () => {
    expect(evaluationDates({ startsOn: '2026-08-03', endsOn: '2027-05-01', every: 'month', day: 1 })).toEqual([
      '2026-08-31', '2026-09-28', '2026-10-26', '2026-11-30', '2026-12-28', '2027-01-25', '2027-02-22', '2027-03-29', '2027-04-26'])
  })
  it('monthly on the last Sunday, 3 Aug 2026 to 30 May 2027', () => {
    expect(evaluationDates({ startsOn: '2026-08-03', endsOn: '2027-05-30', every: 'month', day: 0 })).toEqual([
      '2026-08-30', '2026-09-27', '2026-10-25', '2026-11-29', '2026-12-27', '2027-01-31', '2027-02-28', '2027-03-28', '2027-04-25', '2027-05-30'])
  })
})

describe('TRAK-525 the new choices', () => {
  const season = { startsOn: '2026-09-01', endsOn: '2027-05-31' }
  it('every 3 months: the last chosen day of the 3rd, 6th and 9th month', () => {
    expect(evaluationDates({ ...season, every: '3m', day: 0 })).toEqual(['2026-11-29', '2027-02-28', '2027-05-30'])
  })
  it('every 6 months: the 6th month, then a last report at the season\'s end', () => {
    expect(evaluationDates({ ...season, every: '6m', day: 0 })).toEqual(['2027-02-28', '2027-05-30'])
  })
  it('Custom follows every 2 and 6 weeks: a full gap from the start, moved on to the day', () => {
    expect(evaluationDates({ ...season, every: '4w', day: 6 }).slice(0, 3)).toEqual(['2026-10-03', '2026-10-31', '2026-11-28'])
    expect(evaluationDates({ ...season, every: '2w', day: 6 }).slice(0, 2)).toEqual(['2026-09-19', '2026-10-03'])
  })
  it('a last report when the rhythm leaves the last four weeks without one, and none added when it does not', () => {
    // Every 26 weeks from 1 Sep: 1 Mar; the season ends 31 May, so its last Sunday (30 May) is added.
    expect(evaluationDates({ ...season, every: '26w', day: 0 })).toEqual(['2027-03-07', '2027-05-30'])
    // Every 3 months already ends on 30 May: nothing more.
    expect(evaluationDates({ ...season, every: '3m', day: 0 }).at(-1)).toBe('2027-05-30')
  })
})

describe('TRAK-525 the stored values', () => {
  it('accepts the month choices and 2 to 26 weeks, nothing else', () => {
    for (const ok of ['month', '3m', '6m', '2w', '6w', '26w']) expect(isEvalEvery(ok)).toBe(true)
    for (const no of ['1w', '27w', '12m', 'weekly', '', null]) expect(isEvalEvery(no)).toBe(false)
    expect(weeksOf('month')).toBeNull()
    expect(weeksOf('9w')).toBe(9)
  })
  it('a plan saved as every 2 or 6 weeks reads as Custom with its weeks', () => {
    expect(rhythmOf({ eval_every: '2w', eval_day: 6 })).toEqual({ every: '2w', day: 6 })
    expect(rhythmText('6w', 0)).toBe('every 6 weeks, on Sunday')
    expect(rhythmText('3m', 0)).toBe('every 3 months, on the last Sunday')
    expect(rhythmText('6m', 1)).toBe('every 6 months, on the last Monday')
  })
})
