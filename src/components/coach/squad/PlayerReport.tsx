import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PlayerFace } from '@/components/trak/PlayerFace'
import { RadarChart } from '@/components/arc/radar-chart/radar-chart'
import { Badge } from '@/components/arc/badge/badge'
import { CategoryBar } from '@/components/trak/CategoryBar'
import { LoadError } from '@/components/trak/LoadError'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'
import { useSquadEvaluations } from '@/components/coach/season-plan/useEvaluation'
import { ATTRIBUTES } from '@/lib/squad/attributes'
import { ATTRIBUTE_WORD } from '@/lib/squad/attribute-words'
import { progressLabel } from '@/lib/objective-progress'
import { useTranslation } from '@/lib/i18n'
import { BANDS } from '@/lib/types'
import {
  bandOfScore, loadPlayerReport, overallOf, playerReportKey, reportDate, reportDayOf, reportMonth, reportSummary,
  type PlayerReport as Report, type ReportAssessment,
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
  const days = mine ? reportDayOf(mine.plan, mine.due) : null
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

function ReportBody({ report, name }: { report: Report; name: string }) {
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
        <div className="w-full laptop:w-auto"><Badge tone="attention" size="md">{t('coachSquad:reportInProgress', { date: reportDate(report.report_day) })}</Badge></div>
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

/** The six bands at the last report and now, with the radar of both. */
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
      : <>
        <div className="border-t border-line pt-3">
          <RadarChart label={t('coachSquad:reportRadar', { name: first })} size={240} rings={5} max={10}
            axes={ATTRIBUTES.map(([k]) => ({ key: k, label: t(ATTRIBUTE_WORD[k]) }))}
            series={[{ key: 'now', label: t('coachSquad:reportNow'), values: sixOf(now) },
              ...(before ? [{ key: 'last', label: t('coachSquad:reportLast'), values: sixOf(before) }] : [])]}
            formatValue={value => bandOfScore(value).word} />
        </div>
        <dl className="m-0 border-t border-line">
          {ATTRIBUTES.map(([k]) => {
            const band = bandOfScore(now[k]), then = before ? bandOfScore(before[k]) : null
            return <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-line py-2 last:border-b-0">
              <dt className="text-sm text-ink">{t(ATTRIBUTE_WORD[k])}</dt>
              <dd className="m-0 text-sm">
                {then && then.word !== band.word && <span className="text-ink-3">{then.word} → </span>}
                <span className="font-medium" style={{ color: band.text }}>{band.word}</span>
              </dd>
            </div>
          })}
        </dl>
      </>}
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
  const low = Math.min(...points.map(p => p.score)) < 4 ? 0 : 4
  const y = (v: number) => TOP + (10 - v) / (10 - low) * (H - TOP - BOTTOM)
  // The bands' floors, from the top, down to the lowest shown.
  const steps = BANDS.filter(b => b.minScore >= low)
  const from = Math.max(x(report.period_from), L)
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t('coachSquad:reportLadder', { count: points.length })} className="block">
    <rect x={from} y={TOP} width={Math.max(0, x(report.report_day) - from)} height={H - TOP - BOTTOM} style={{ fill: 'rgb(var(--t-brand))', fillOpacity: 0.07 }} />
    {steps.map((b, i) => {
      const top = i === 0 ? 10 : steps[i - 1].minScore
      return <g key={b.word}>
        <line x1={L} x2={W - R} y1={y(b.minScore)} y2={y(b.minScore)} style={{ stroke: 'rgb(var(--t-line))' }} />
        <text x={L - 10} y={(y(b.minScore) + y(top)) / 2 + 4} textAnchor="end" style={{ fill: 'rgb(var(--t-ink-3))', font: '13px var(--t-font)' }}>{b.word}</text>
      </g>
    })}
    {points.length > 1 && <path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ')}
      style={{ fill: 'none', stroke: 'rgb(var(--t-brand))', strokeWidth: 2.5, strokeLinejoin: 'round', strokeLinecap: 'round' }} />}
    {points.map((p, i) => <circle key={i} cx={x(p.day)} cy={y(p.score)} r={5} fill={bandOfScore(p.score).color} style={{ stroke: 'rgb(var(--t-surface))', strokeWidth: 2 }}>
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
