import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PlayerFace } from '@/components/trak/PlayerFace'
import { RadarChart } from '@/components/arc/radar-chart/radar-chart'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { CategoryBar } from '@/components/trak/CategoryBar'
import { LoadError } from '@/components/trak/LoadError'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'
import { useSquadEvaluations } from '@/components/coach/season-plan/useEvaluation'
import { ATTRIBUTES } from '@/lib/squad/attributes'
import { ATTRIBUTE_WORD } from '@/lib/squad/attribute-words'
import { progressLabel, type Progress } from '@/lib/objective-progress'
import { useTranslation } from '@/lib/i18n'
import { BANDS } from '@/lib/types'
import { scoreColor } from '@/lib/rating-engine'
import {
  bandOfScore, loadPlayerReport, loadSentReports, overallOf, playerReportKey, reportDate, reportDayOf, reportMonth, reportSummary,
  sentReportsKey, withEntry,
  type PlayerReport as Report, type ReportAssessment, type ReportRatings,
} from '@/lib/player-report'

/* TRAK-527 (Reports 4/10, Imad 21 Nov): Squad › a player's page › View report. The report the squad's plan is working
   towards, as it fills up: the coach's alone until Reports 5/10 sends it. The mockup's second report, with the 21 Nov
   decisions: bands as words, matches from published evaluations only; no "Trak suggests", "Read by", pencil on the
   bands, changing a match result, or helper lines. */

const TITLE = 'text-base font-semibold text-ink'
const CARD = 'grid content-start gap-3 rounded-2xl border border-line bg-surface p-5 laptop:p-6'

export function PlayerReport({ playerId, name, squad, coachId }: { playerId: string; name: string; squad: string | null; coachId: string }) {
  const { t } = useTranslation()
  const first = name.split(' ')[0]
  const evaluations = useSquadEvaluations(coachId, squad ? [squad] : [])
  const mine = evaluations.list.find(e => e.squad === squad)
  const days = mine ? reportDayOf(mine.plan, mine.due, mine.sentDays) : null
  const report = useQuery({
    queryKey: playerReportKey(coachId, playerId, days?.reportDay ?? null),
    queryFn: () => loadPlayerReport(playerId, days!.reportDay, days!.lastReportDay),
    enabled: !!days,
  })

  if (evaluations.failed || report.isError) return <LoadError what={t('coachSquad:reportWhat', { name: first })}
    onRetry={() => { evaluations.retry(); void report.refetch() }} />
  if (!evaluations.ready || (days && !report.data)) return <LoadingSkeleton label={t('coachSquad:loadingReport', { name: first })} lines={4} />
  // Reports follow the evaluation: a squad whose plan isn't shared, or has no dates, has no report.
  if (!days || !report.data) return <p className="text-sm text-ink-2">{t('coachSquad:noReportYet')}</p>
  return <ReportBody report={report.data} name={name} />
}

/** TRAK-531: report day's Preview, the report as Send will store it: the ratings and answers on screen, and the note. */
export function ReportPreview({ playerId, name, coachId, reportDay, lastReportDay, ratings, progress, note }: {
  playerId: string; name: string; coachId: string; reportDay: string; lastReportDay: string | null
  ratings: ReportRatings; progress: Partial<Record<string, Progress>>; note: string
}) {
  const { t } = useTranslation()
  const first = name.split(' ')[0]
  const report = useQuery({ queryKey: playerReportKey(coachId, playerId, reportDay), queryFn: () => loadPlayerReport(playerId, reportDay, lastReportDay) })
  if (report.isError) return <LoadError what={t('coachSquad:reportWhat', { name: first })} onRetry={() => { void report.refetch() }} />
  if (!report.data) return <LoadingSkeleton label={t('coachSquad:loadingReport', { name: first })} lines={4} />
  return <ReportBody report={withEntry(report.data, ratings, progress)} name={name} note={note} />
}

/** A report: as it fills up, or, with `sentAt`, as it was sent (TRAK-528); with the note to the player and parents. */
function ReportBody({ report, name, sentAt, note }: { report: Report; name: string; sentAt?: string; note?: string }) {
  const { t } = useTranslation()
  const first = name.split(' ')[0]
  const s = reportSummary(report)
  const period = `${reportDate(report.period_from)} – ${reportDate(report.report_day)}`
  const was = s.overallBefore ? t('coachSquad:reportWas', { band: s.overallBefore.word }) : t('coachSquad:reportNoLast')

  return <div className="grid gap-4">
    <article aria-label={t('coachSquad:reportOf', { name: first, month: reportMonth(report.report_day) })} className={`${CARD} gap-4`}>
      <div className="flex flex-wrap items-center gap-4">
        <PlayerFace name={name} size="lg" />
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="break-words text-xl font-medium text-ink">{t('coachSquad:reportOf', { name: first, month: reportMonth(report.report_day) })}</h2>
          <p className="text-sm text-ink-2">{period}</p>
        </div>
        {/* On a phone the state sits on its own line under the title; on a laptop, at the card's right. */}
        <div className="w-full laptop:w-auto">{sentAt
          ? <Badge tone="success" size="md">{t('coachSquad:reportSent', { date: reportDate(sentAt) })}</Badge>
          : <Badge tone="attention" size="md">{t('coachSquad:reportInProgress', { date: reportDate(report.report_day) })}</Badge>}</div>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-3 laptop:grid-cols-4">
        <Tile label={t('coachSquad:reportOverall')} sub={was}>
          {s.overall ? <span style={{ color: s.overall.text }}>{s.overall.word}</span> : '—'}
        </Tile>
        <Tile label={t('coachSquad:reportJobs')} sub={t('coachSquad:reportJobsSub')}>
          {s.jobs.played ? t('coachSquad:reportOutOf', { n: s.jobs.done, total: s.jobs.played }) : '—'}
        </Tile>
        <Tile label={t('coachSquad:reportObjectives')} sub={t('coachSquad:reportObjectivesSub')}>
          {s.objectives.total ? t('coachSquad:reportOutOf', { n: s.objectives.onTrack, total: s.objectives.total }) : '—'}
        </Tile>
        <Tile label={t('coachSquad:reportTrainings')} sub={t('coachSquad:reportTrainingsSub')}>
          {s.trainings.total ? t('coachSquad:reportOutOf', { n: s.trainings.attended, total: s.trainings.total }) : '—'}
        </Tile>
      </dl>
    </article>

    {note?.trim() && <section aria-labelledby={`note-${report.squad_player_id}`} className={CARD}>
      <h3 id={`note-${report.squad_player_id}`} className={TITLE}>{t('coachSquad:reportNote')}</h3>
      <p className="whitespace-pre-line break-words text-sm text-ink">{note.trim()}</p>
    </section>}

    <div className="grid gap-4 laptop:grid-cols-2 laptop:items-start">
      <ThenAndNow report={report} now={s.now} before={s.before} first={first} />
      <section aria-labelledby={`season-${report.squad_player_id}`} className={CARD}>
        <h3 id={`season-${report.squad_player_id}`} className={TITLE}>{t('coachSquad:seasonSoFar')}</h3>
        {report.assessments.length ? <SeasonLadder report={report} />
          : <p className="text-sm text-ink-3">{t('coachSquad:noSeasonAssessment')}</p>}
      </section>
    </div>

    <div className="grid gap-4 laptop:grid-cols-2 laptop:items-start">
      <Matches report={report} />
      <Objectives report={report} />
    </div>
  </div>
}

/** TRAK-528 (Reports 5/10): the reports he was sent, newest first, each opening as it was sent. Nothing before the
 *  first one. */
export function SentReports({ playerId, name, coachId, onOpen }: { playerId: string; name: string; coachId: string; onOpen: (evaluationId: string) => void }) {
  const { t } = useTranslation()
  const first = name.split(' ')[0]
  const sent = useQuery({ queryKey: sentReportsKey(coachId, playerId), queryFn: () => loadSentReports(playerId) })
  if (sent.isError) return <LoadError what={t('coachSquad:sentReportsWhat', { name: first })} onRetry={() => { void sent.refetch() }} />
  if (!sent.data?.length) return null
  const id = `sent-reports-${playerId}`
  return <section aria-labelledby={id} className="grid gap-2">
    <h4 id={id} className={TITLE}>{t('coachSquad:sentReports')}</h4>
    <ul className="m-0 grid list-none p-0">
      {sent.data.map(r => {
        const month = reportMonth(r.report.report_day)
        return <li key={r.evaluation_id} className="flex items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
          <span className="grid min-w-0 gap-0.5">
            <span className="text-sm font-medium text-ink">{t('coachSquad:sentReportName', { month })}</span>
            <span className="text-xs text-ink-3">{t('coachSquad:reportSent', { date: reportDate(r.sent_at) })}</span>
          </span>
          <Button variant="secondary" size="sm" aria-label={t('coachSquad:openReportName', { name: first, month })}
            onClick={() => onOpen(r.evaluation_id)}>{t('coachSquad:openReport')}</Button>
        </li>
      })}
    </ul>
  </section>
}

/** TRAK-528: one report he was sent, by its report day's evaluation, as it was sent. */
export function SentReport({ playerId, evaluationId, name, coachId }: { playerId: string; evaluationId: string; name: string; coachId: string }) {
  const { t } = useTranslation()
  const first = name.split(' ')[0]
  const sent = useQuery({ queryKey: sentReportsKey(coachId, playerId), queryFn: () => loadSentReports(playerId) })
  if (sent.isError) return <LoadError what={t('coachSquad:reportWhat', { name: first })} onRetry={() => { void sent.refetch() }} />
  if (!sent.data) return <LoadingSkeleton label={t('coachSquad:loadingReport', { name: first })} lines={4} />
  const one = sent.data.find(r => r.evaluation_id === evaluationId)
  return one ? <ReportBody report={one.report} name={name} sentAt={one.sent_at} note={one.note} />
    : <p className="text-sm text-ink-2">{t('coachSquad:reportNotFound')}</p>
}

function Tile({ label, sub, children }: { label: string; sub: string; children: ReactNode }) {
  return <div className="grid min-w-0 content-start gap-1 rounded-xl border border-line p-4">
    <dt className="text-sm font-semibold text-ink-3">{label}</dt>
    <dd className="m-0 grid gap-1">
      <span className="text-xl font-medium text-ink">{children}</span>
      <span className="text-xs text-ink-3">{sub}</span>
    </dd>
  </div>
}

const sixOf = (a: ReportAssessment) => Object.fromEntries(ATTRIBUTES.map(([k]) => [k, a[k]]))

/** The six areas at the last report and now, as one radar of both (TRAK-547: no band list under it). */
function ThenAndNow({ report, now, before, first }: { report: Report; now: ReportAssessment | null; before: ReportAssessment | null; first: string }) {
  const { t } = useTranslation()
  const id = `then-${report.squad_player_id}`
  return <section aria-labelledby={id} className={CARD}>
    <div className="grid gap-1">
      <h3 id={id} className={TITLE}>{t('coachSquad:reportThenNow')}</h3>
      <p className="text-sm text-ink-3">{report.last_report_day
        ? t('coachSquad:reportAgainst', { date: reportDate(report.last_report_day) }) : t('coachSquad:reportFirst')}</p>
    </div>
    {!now ? <div role="group" aria-label={t('coachSquad:noAssessmentYet')} className="grid gap-2.5">
        {ATTRIBUTES.map(([k]) => <CategoryBar key={k} label={t(ATTRIBUTE_WORD[k])} />)}
      </div>
      // TRAK-547 (Kostas, 22 Nov): the hexagon alone; no list of the six bands under it.
      : <div className="border-t border-line pt-3">
          <RadarChart label={t('coachSquad:reportRadar', { name: first })} size={240} rings={5} max={10}
            axes={ATTRIBUTES.map(([k]) => ({ key: k, label: t(ATTRIBUTE_WORD[k]) }))}
            series={[{ key: 'now', label: t('coachSquad:reportNow'), values: sixOf(now) },
              ...(before ? [{ key: 'last', label: t('coachSquad:reportLast'), values: sixOf(before) }] : [])]}
            formatValue={value => bandOfScore(value).word} />
        </div>}
  </section>
}

/** Each assessment of the season as a dot on the band ladder, this period shaded. */
function SeasonLadder({ report }: { report: Report }) {
  const { t } = useTranslation()
  // Narrow enough that the words stay readable on a phone, where the chart is about 310 px wide.
  const W = 380, H = 220, L = 80, R = 10, TOP = 12, BOTTOM = 26
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000
  const d0 = day(report.season_starts_on), d1 = Math.max(day(report.report_day), d0 + 1)
  const x = (iso: string) => L + (day(iso) - d0) / (d1 - d0) * (W - L - R)
  const points = report.assessments.map(a => ({ day: a.day, score: overallOf(a) }))
  // TRAK-556: an average rounds before it takes a band, so a band starts half a point under its whole score (Good at
  // 6.5); the lines sit there, so every dot sits between its own band's lines.
  const floor = (b: { minScore: number }) => Math.max(0, b.minScore - 0.5)
  const low = Math.min(...points.map(p => p.score)) < 4.5 ? 0 : 4.5
  const y = (v: number) => TOP + (10 - v) / (10 - low) * (H - TOP - BOTTOM)
  // The bands' floors, from the top, down to the lowest shown.
  const steps = BANDS.filter(b => floor(b) >= low)
  const from = Math.max(x(report.period_from), L)
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t('coachSquad:reportLadder', { count: points.length })} className="block">
    <rect x={from} y={TOP} width={Math.max(0, x(report.report_day) - from)} height={H - TOP - BOTTOM} style={{ fill: 'rgb(var(--t-brand))', fillOpacity: 0.07 }} />
    {steps.map((b, i) => {
      const top = i === 0 ? 10 : floor(steps[i - 1])
      return <g key={b.word}>
        <line x1={L} x2={W - R} y1={y(floor(b))} y2={y(floor(b))} style={{ stroke: 'rgb(var(--t-line))' }} />
        <text x={L - 10} y={(y(floor(b)) + y(top)) / 2 + 4} textAnchor="end" style={{ fill: 'rgb(var(--t-ink-3))', font: '13px var(--t-font)' }}>{b.word}</text>
      </g>
    })}
    {points.length > 1 && <path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ')}
      style={{ fill: 'none', stroke: 'rgb(var(--t-brand))', strokeWidth: 2.5, strokeLinejoin: 'round', strokeLinecap: 'round' }} />}
    {points.map((p, i) => <circle key={i} cx={x(p.day)} cy={y(p.score)} r={5} fill={scoreColor(p.score)} style={{ stroke: 'rgb(var(--t-surface))', strokeWidth: 2 }}>
      <title>{`${reportDate(p.day)}: ${bandOfScore(p.score).word}`}</title>
    </circle>)}
    <text x={L} y={H - 6} style={{ fill: 'rgb(var(--t-ink-3))', font: '12px var(--t-font)' }}>{reportDate(report.season_starts_on)}</text>
    <text x={W - R} y={H - 6} textAnchor="end" style={{ fill: 'rgb(var(--t-ink-3))', font: '12px var(--t-font)' }}>{reportDate(report.report_day)}</text>
  </svg>
}

/** The period's matches with a published evaluation: his job, did the job, against what was expected. */
function Matches({ report }: { report: Report }) {
  const { t } = useTranslation()
  const id = `matches-${report.squad_player_id}`
  return <section aria-labelledby={id} className={CARD}>
    <h3 id={id} className={TITLE}>{t('coachSquad:reportMatches')}</h3>
    {report.matches.length === 0 ? <p className="text-sm text-ink-3">{t('coachSquad:reportNoMatches')}</p>
      : <ul className="m-0 grid list-none p-0">
        {report.matches.map(m => <li key={m.event_id} className="grid grid-cols-[3.75rem_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-line py-2.5 first:border-t-0">
          <span className="whitespace-nowrap text-sm text-ink-3">{reportDate(m.day)}</span>
          <span className="grid min-w-0 gap-0.5">
            <span className="break-words text-sm text-ink">{t(m.home_away === 'away' ? 'coachSquad:reportAt' : 'coachSquad:reportVs', { opponent: m.opponent ?? t('coachSquad:reportOpponent') })}
              {m.our_score != null && m.their_score != null && <span className="text-ink-3"> · {m.our_score}–{m.their_score}</span>}</span>
            {m.job && <span className="break-words text-xs text-ink-3">{t('coachSquad:reportJob', { job: m.job })}</span>}
          </span>
          {m.played && m.did_job ? <span className="grid justify-items-end text-sm">
              <span className="font-medium text-ink">{t(`coachMatches:didJob_${m.did_job}`)}</span>
              {m.against_expectation && <span className="text-xs text-ink-3">{t(`coachMatches:against_${m.against_expectation}`)}</span>}
            </span>
            : <span className="text-sm text-ink-3">{t('coachSquad:reportDidntPlay')}</span>}
        </li>)}
      </ul>}
  </section>
}

/** Each objective's answer at the last report and now. */
function Objectives({ report }: { report: Report }) {
  const { t } = useTranslation()
  const id = `objectives-${report.squad_player_id}`
  return <section aria-labelledby={id} className={CARD}>
    <h3 id={id} className={TITLE}>{t('coachSquad:reportObjectivesTitle')}</h3>
    {report.objectives.length === 0 ? <p className="text-sm text-ink-3">{t('coachSquad:reportNoObjectives')}</p>
      : <ul className="m-0 grid list-none p-0">
        {report.objectives.map(o => <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-t border-line py-2.5 first:border-t-0">
          <span className="break-words text-sm font-medium text-ink">{o.title}</span>
          <span className="text-right text-sm">
            {report.last_report_day && o.at_last_report !== o.now && <span className="text-ink-3">{progressLabel(o.at_last_report ?? 'unrated')} → </span>}
            <span className="font-medium text-ink">{progressLabel(o.now ?? 'unrated')}</span>
          </span>
        </li>)}
      </ul>}
  </section>
}
