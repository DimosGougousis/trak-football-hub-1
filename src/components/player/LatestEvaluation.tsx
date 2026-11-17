import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/arc/badge/badge'
import { CategoryBar } from '@/components/trak/CategoryBar'
import { formatParentDate } from '@/lib/parent-data'
import { wasOpened } from '@/lib/games/news'
import { useTranslation } from '@/lib/i18n'
import type { ParentAssessment } from '@/lib/parent-assessments'

const CATEGORIES = [['coachAssess:sliderWorkRate', 'work_rate'], ['coachHome:attributeTactical', 'tactical'], ['coachHome:attributeAttitude', 'attitude'],
  ['coachHome:attributeTechnical', 'technical'], ['coachHome:attributePhysical', 'physical'], ['coachAssess:sliderCoachability', 'coachability']] as const

/** The six bands as the coach's bars: the bar in the band's colour and the band's word, no number (Imad, 12 Nov). A
 *  category the coach left out has no bar. Home's Latest evaluation, the evaluation page and Profile's My card. */
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
 * TRAK-441 slice 2.5 (mockup, 12 Nov): the player's latest evaluation on Home, in the coach's band bars (words, no
 * numbers). "New" until its page has shown on this device; a category the coach left out has no bar.
 */
export function LatestEvaluation({ assessment, readerId, childId = readerId, href = `/player/feedback/${encodeURIComponent(assessment.id)}` }: {
  assessment: ParentAssessment
  readerId: string
  /** A parent's child; a player reads their own. */
  childId?: string
  /** The evaluation's page for this reader. */
  href?: string
}) {
  const fresh = !wasOpened(readerId, childId, 'evaluation', assessment.id, assessment.created_at ?? '')
  return <section aria-labelledby="latest-evaluation" className="arc grid gap-4 rounded-2xl border border-line bg-surface p-5 laptop:p-6">
    <div className="flex items-center justify-between gap-3">
      <h2 id="latest-evaluation" className="text-lg font-medium text-ink">Latest evaluation</h2>
      <span className="flex items-center gap-2 text-sm text-ink-3">
        {formatParentDate(assessment.created_at)}{fresh && <Badge tone="success" size="sm">New</Badge>}
      </span>
    </div>
    <BandBars assessment={assessment} />
    <Link to={href}
      className="inline-flex min-h-11 items-center gap-1 justify-self-start text-sm font-medium text-brand focus-visible:ring-2 focus-visible:ring-primary rounded-md">
      Open evaluation <ArrowRight size={16} aria-hidden="true" />
    </Link>
  </section>
}
