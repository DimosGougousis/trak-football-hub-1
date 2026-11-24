import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/arc/badge/badge'
import { CategoryBar } from '@/components/trak/CategoryBar'
import { LoadError } from '@/components/trak/LoadError'
import { wasOpened } from '@/lib/games/news'
import { useTranslation } from '@/lib/i18n'
import { ratingsOn, reportMonth, useFamilyReports } from '@/lib/player-report'
import type { ParentAssessment } from '@/lib/parent-assessments'

const CATEGORIES = [['coachAssess:sliderWorkRate', 'work_rate'], ['coachHome:attributeTactical', 'tactical'], ['coachHome:attributeAttitude', 'attitude'],
  ['coachHome:attributeTechnical', 'technical'], ['coachHome:attributePhysical', 'physical'], ['coachAssess:sliderCoachability', 'coachability']] as const

/** The six bands as the coach's bars: the bar in the band's colour and the band's word, no number (Imad, 12 Nov). A
 *  category the coach left out has no bar. Home's Latest report, the evaluation page and Profile's My card. */
export function BandBars({ assessment }: { assessment: Pick<ParentAssessment, typeof CATEGORIES[number][1]> }) {
  const { t } = useTranslation()
  return <div className="space-y-2.5">
    {CATEGORIES.map(([label, key]) => {
      const score = assessment[key]
      return score != null && Number.isFinite(score) ? <CategoryBar key={key} label={t(label)} score={score} /> : null
    })}
  </div>
}

/**
 * TRAK-441 slice 2.5 (mockup, 12 Nov), then TRAK-529 (Reports 6/10): Home's latest report, the player's and the
 * parent's, read from the copy each may read. His bands on its report day as the coach's bars (words, no numbers);
 * "New" until the report's page has shown on this device. No report yet, no card.
 */
export function LatestReport({ childId, readerId, as }: { childId: string; readerId: string; as: 'player' | 'parent' }) {
  const { t } = useTranslation()
  const reports = useFamilyReports(childId, as === 'player')
  // A failed read says so, rather than look like "no report yet".
  if (reports.isError) return <LoadError what={t('common:latestReport')} onRetry={() => { void reports.refetch() }} />
  const latest = reports.data?.[0]
  if (!latest) return null
  const now = ratingsOn(latest.report, latest.report.report_day)
  const fresh = !wasOpened(readerId, childId, 'report', latest.evaluation_id, latest.sent_at)
  return <section aria-labelledby="latest-report" className="arc grid gap-4 rounded-2xl border border-line bg-surface p-5 laptop:p-6">
    <div className="flex items-center justify-between gap-3">
      <h2 id="latest-report" className="text-lg font-medium text-ink">{t('common:latestReport')}</h2>
      <span className="flex items-center gap-2 text-sm text-ink-3">
        {reportMonth(latest.report.report_day)}{fresh && <Badge tone="success" size="sm">{t('common:new')}</Badge>}
      </span>
    </div>
    {now && <BandBars assessment={now} />}
    <Link to={`/${as}/report/${encodeURIComponent(latest.evaluation_id)}`}
      className="inline-flex min-h-11 items-center gap-1 justify-self-start text-sm font-medium text-brand focus-visible:ring-2 focus-visible:ring-primary rounded-md">
      {t('common:openReport')} <ArrowRight size={16} aria-hidden="true" />
    </Link>
  </section>
}
