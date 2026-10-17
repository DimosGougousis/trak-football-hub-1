import { Link } from 'react-router-dom'
import { ParentAssessmentBands, ParentRating } from './ParentFamily'
import { formatParentDate } from '@/lib/parent-data'
import type { ParentAssessment } from '@/lib/parent-assessments'

/** TRAK-194 (Kostas, 16 Oct): the date leads and the coach isn't named; "Dora Fotiadi · Good" read as the parent rating the coach. */
export function ParentAssessmentCard({ assessment, active = true, showOpenLink = true }: {
  assessment: ParentAssessment; active?: boolean; showOpenLink?: boolean
}) {
  return <div className="rounded-xl bg-card border border-border p-5">
    <div className="flex items-center justify-between gap-2 mb-4">
      <p className="min-w-0 text-sm text-foreground">{formatParentDate(assessment.created_at)}</p>
      <ParentRating rating={assessment.coach_rating} missing="Not assessed" />
    </div>
    <ParentAssessmentBands assessment={assessment} />
    {showOpenLink && <Link to={`/parent/assessment/${encodeURIComponent(assessment.id)}`} tabIndex={active ? 0 : -1}
      className="inline-flex min-h-11 items-center mt-3 text-sm text-primary focus-visible:ring-2 focus-visible:ring-primary">Open assessment</Link>}
  </div>
}
