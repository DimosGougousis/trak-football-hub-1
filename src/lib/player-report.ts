import { format, parseISO } from 'date-fns'
import { supabase } from '@/integrations/supabase/client'
import { dateLocale } from '@/lib/i18n'
import { scoreToBand } from '@/lib/rating-engine'
import { bandConfig, type BandConfig } from '@/lib/types'
import { evaluationDates, rhythmOf, type EvaluationDue } from '@/lib/evaluation'
import type { Progress } from '@/lib/objective-progress'
import { ATTRIBUTES, type AttributeKey } from '@/lib/squad/attributes'

/* TRAK-527 (Reports 4/10, Imad 21 Nov): one player's report for one report day, for the coach. Report days cut the
   season into periods: the season plan's evaluation dates (evaluation.ts), the first period from the season's first
   day. coach_player_report() gathers the period's facts; this file turns them into what the page shows, with the same
   bands as the player's page (scoreToBand, the overall rounded to one decimal as coach_rating is). */

export type ReportRatings = Record<AttributeKey, number>
export type ReportAssessment = { id: string; day: string } & ReportRatings
export type ReportMatch = {
  event_id: string; day: string; opponent: string | null; home_away: string | null
  our_score: number | null; their_score: number | null; job: string; played: boolean
  did_job: 'yes' | 'partly' | 'not_yet' | null; against_expectation: 'below' | 'met' | 'above' | null
}
export type ReportObjective = { id: string; title: string; at_last_report: Progress | null; now: Progress | null }
export type PlayerReport = {
  squad_player_id: string; player_name: string; squad: string
  season_starts_on: string; period_from: string; report_day: string; last_report_day: string | null
  assessments: ReportAssessment[]; before_season: ReportAssessment | null
  matches: ReportMatch[]; objectives: ReportObjective[]; trainings: { attended: number; total: number }
}

export const playerReportKey = (coachId: string | undefined, playerId: string, reportDay: string | null) =>
  ['coach', coachId, 'player-report', playerId, reportDay] as const

export async function loadPlayerReport(playerId: string, reportDay: string, lastReportDay: string | null): Promise<PlayerReport> {
  const { data, error } = await supabase.rpc('coach_player_report', {
    p_squad_player_id: playerId, p_report_day: reportDay, p_last_report_day: lastReportDay ?? undefined,
  })
  if (error) throw error
  return data as unknown as PlayerReport
}

/** TRAK-528 (Reports 5/10): a report as it was sent, the coach's copy (report_for_player). */
export type SentReport = { evaluation_id: string; sent_at: string; report: PlayerReport }

export const sentReportsKey = (coachId: string | undefined, playerId: string) => ['coach', coachId, 'sent-reports', playerId] as const

/** The player's sent reports, the latest report day first. */
export async function loadSentReports(playerId: string): Promise<SentReport[]> {
  const { data, error } = await supabase.from('report_for_player').select('evaluation_id, sent_at, report').eq('squad_player_id', playerId)
  if (error) throw error
  return (data as unknown as SentReport[]).sort((a, b) => b.report.report_day.localeCompare(a.report.report_day))
}

/** The report a squad's plan is working towards: the date that's due, or else the next one (the season's last once
 *  none is left), and the report day before it. Null without a date. */
export function reportDayOf(plan: { starts_on: string | null; ends_on: string | null; eval_every?: string | null; eval_day?: number | null },
  due: EvaluationDue): { reportDay: string; lastReportDay: string | null } | null {
  const dates = evaluationDates({ startsOn: plan.starts_on, endsOn: plan.ends_on, ...rhythmOf(plan) })
  const reportDay = due.dueOn ?? due.next ?? dates.at(-1) ?? null
  if (!reportDay) return null
  return { reportDay, lastReportDay: dates.filter(d => d < reportDay).at(-1) ?? null }
}

const round1 = (n: number) => Math.round(n * 10) / 10
export const overallOf = (r: ReportRatings) => round1(ATTRIBUTES.reduce((sum, [key]) => sum + r[key], 0) / ATTRIBUTES.length)
export const bandOfScore = (score: number): BandConfig => bandConfig(scoreToBand(score))

/** His six ratings on `day`: the latest assessment on or before it, from before the season if none since. */
export function ratingsOn(report: PlayerReport, day: string): ReportAssessment | null {
  const all = [...(report.before_season ? [report.before_season] : []), ...report.assessments]
  return all.filter(a => a.day <= day).at(-1) ?? null
}

const onTrack = (status: Progress | null) => status === 'on_track' || status === 'met'

/** The four tiles and the two sets of bands. */
export function reportSummary(report: PlayerReport) {
  const now = ratingsOn(report, report.report_day)
  const before = report.last_report_day ? ratingsOn(report, report.last_report_day) : null
  const played = report.matches.filter(m => m.played)
  return {
    now, before,
    overall: now ? bandOfScore(overallOf(now)) : null,
    overallBefore: before ? bandOfScore(overallOf(before)) : null,
    jobs: { done: played.filter(m => m.did_job === 'yes').length, played: played.length },
    objectives: { onTrack: report.objectives.filter(o => onTrack(o.now)).length, total: report.objectives.length },
    trainings: report.trainings,
  }
}

/** The month a report is named for (the report day's), and a day as the report shows it ("29 Nov"). */
export const reportMonth = (day: string) => format(parseISO(day), 'LLLL', { locale: dateLocale() })
export const reportDate = (day: string) => format(parseISO(day), 'd MMM', { locale: dateLocale() })
