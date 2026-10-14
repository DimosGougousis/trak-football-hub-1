import { Link } from 'react-router-dom'
import { ParentAssessmentBands, ParentRating } from './ParentFamily'
import { formatParentDate } from '@/lib/parent-data'
import type { ParentAssessment } from '@/lib/parent-assessments'

export function ParentAssessmentCard({ assessment, coachName, active = true, showOpenLink = true }: {
  assessment: ParentAssessment; coachName: string; active?: boolean; showOpenLink?: boolean
}) {
  return <div className="rounded-xl bg-card border border-border p-5">
    <div className="flex items-center justify-between gap-2 mb-4">
      <div className="min-w-0">
        <p className="text-sm text-foreground break-words">{coachName}</p>
        <p className="text-xs text-muted-foreground mt-1">{formatParentDate(assessment.created_at)}</p>
      </div>
      <ParentRating rating={assessment.coach_rating} missing="Not assessed" />
    </div>
    <ParentAssessmentBands assessment={assessment} />
    {showOpenLink && <Link to={`/parent/assessment/${encodeURIComponent(assessment.id)}`} tabIndex={active ? 0 : -1}
      className="inline-flex min-h-11 items-center mt-3 text-sm text-primary focus-visible:ring-2 focus-visible:ring-primary">Open assessment</Link>}
  </div>
}
