import { describe, expect, it } from 'vitest'
import { ratingsOn, reportDayOf, reportSummary, type PlayerReport } from '@/lib/player-report'

/* TRAK-527 (Reports 4/10): the report's figures, from what coach_player_report() gives. */

const six = (v: number) => ({ work_rate: v, tactical: v, attitude: v, technical: v, physical: v, coachability: v })
const base: PlayerReport = {
  squad_player_id: 's', player_name: 'Synthetic Player', squad: 'U16', season_starts_on: '2026-09-01',
  period_from: '2026-10-26', report_day: '2026-11-29', last_report_day: '2026-10-25',
  assessments: [], before_season: null, matches: [], objectives: [], trainings: { attended: 0, total: 0 },
}
const plan = { starts_on: '2026-09-01', ends_on: '2027-06-30', eval_every: 'month', eval_day: 0 }

describe('TRAK-527 report days', () => {
  const sent = ['2026-09-27', '2026-10-25']
  it('is the date that is due, else the next, with the last report sent before it', () => {
    expect(reportDayOf(plan, { dueOn: '2026-11-29', since: '2026-11-29', next: '2026-12-27' }, sent))
      .toEqual({ reportDay: '2026-11-29', lastReportDay: '2026-10-25' })
    expect(reportDayOf(plan, { dueOn: null, since: null, next: '2026-11-29' }, sent))
      .toEqual({ reportDay: '2026-11-29', lastReportDay: '2026-10-25' })
  })
  it('has no last report until one is sent, and is the season\'s last once none is left', () => {
    expect(reportDayOf(plan, { dueOn: null, since: null, next: '2026-09-27' }, [])).toEqual({ reportDay: '2026-09-27', lastReportDay: null })
    expect(reportDayOf(plan, { dueOn: null, since: null, next: '2026-11-29' }, [])).toEqual({ reportDay: '2026-11-29', lastReportDay: null })
    expect(reportDayOf(plan, { dueOn: null, since: null, next: null }, sent)?.reportDay).toBe('2027-06-27')
    expect(reportDayOf({ ...plan, ends_on: null }, { dueOn: null, since: null, next: null }, sent)).toBeNull()
  })
})

describe('TRAK-545 the open report starts after the last report actually sent', () => {
  // Prod's U16: sent on the monthly rhythm's 30 Aug, 27 Sep and 25 Oct, then on 22 Nov on a Custom rhythm, since put back
  // to monthly. The rhythm's date before 29 Nov is 25 Oct; the last report sent is 22 Nov.
  const sent = ['2026-10-25', '2026-08-30', '2026-11-22', '2026-09-27']
  it('counts from the last day sent, not the rhythm\'s date before the report day', () => {
    expect(reportDayOf(plan, { dueOn: null, since: null, next: '2026-11-29' }, sent))
      .toEqual({ reportDay: '2026-11-29', lastReportDay: '2026-11-22' })
  })
  it('ignores a day sent on or after the report day', () => {
    expect(reportDayOf(plan, { dueOn: '2026-11-22', since: '2026-11-22', next: '2026-11-29' }, sent))
      .toEqual({ reportDay: '2026-11-22', lastReportDay: '2026-10-25' })
  })
})

describe('TRAK-527 the bands', () => {
  it('shows the latest bands from before when nothing is new in the period, and none for a player never assessed', () => {
    const report = { ...base, assessments: [{ id: 'a', day: '2026-10-01', ...six(6) }] }
    expect(ratingsOn(report, report.report_day)?.id).toBe('a')
    expect(reportSummary(report).overall?.word).toBe('Steady')
    expect(reportSummary(report).overallBefore?.word).toBe('Steady')
    expect(reportSummary(base).now).toBeNull()
    expect(reportSummary(base).overall).toBeNull()
  })
  it('falls back to the latest assessment from before the season', () => {
    const report = { ...base, before_season: { id: 'old', day: '2026-06-01', ...six(4) } }
    expect(reportSummary(report).overall?.word).toBe('Mixed')
  })
})

describe('TRAK-527 the tiles', () => {
  it('counts jobs done of the matches played, objectives on track or met, and trainings', () => {
    const match = { event_id: 'm', day: '2026-11-01', opponent: 'X', home_away: 'home', our_score: 1, their_score: 0, job: '' }
    const report: PlayerReport = { ...base,
      matches: [{ ...match, played: true, did_job: 'yes', against_expectation: 'met' }, { ...match, event_id: 'n', played: true, did_job: 'partly', against_expectation: 'below' },
        { ...match, event_id: 'o', played: false, did_job: null, against_expectation: null }],
      objectives: [{ id: '1', title: 'A', at_last_report: null, now: 'met' }, { id: '2', title: 'B', at_last_report: null, now: 'on_track' },
        { id: '3', title: 'C', at_last_report: 'not_yet', now: null }],
      trainings: { attended: 3, total: 4 } }
    const s = reportSummary(report)
    expect(s.jobs).toEqual({ done: 1, played: 2 })
    expect(s.objectives).toEqual({ onTrack: 2, total: 3 })
    expect(s.trainings).toEqual({ attended: 3, total: 4 })
  })
})
