import { useEffect } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { MobileShell, NavBar } from '@/components/trak'
import { ParentChildSelector, ParentFamilyContent, ParentLoadError, ParentLoading } from '@/components/parent/ParentFamily'
import { ParentAssessmentCard } from '@/components/parent/ParentAssessmentCard'
import { useParentChildren } from '@/contexts/ParentChildrenContext'
import { useParentAssessment } from '@/hooks/useParentAssessments'
import { trackEvent } from '@/lib/telemetry'
import { ChevronLeft } from 'lucide-react'

export default function ParentAssessment() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedChild } = useParentChildren()
  const origin = location.state as { matchId?: unknown; childId?: unknown } | null
  const matchId = sessionId && origin?.childId === selectedChild?.id && typeof origin?.matchId === 'string'
    ? origin.matchId : null
  const query = useParentAssessment(sessionId ? { kind: 'session', id: sessionId } : id ? { kind: 'assessment', id } : null)
  const assessment = !query.isError ? query.data?.assessment : null
  const shownId = assessment?.id
  useEffect(() => {
    if (shownId) void trackEvent('assessment_viewed', { assessment_id: shownId })
  }, [shownId])
  return <MobileShell>
    <div className="pt-3 pb-4">
      {/* TRAK-204 (Kostas, 19 Oct): an event opened by mistake goes straight back, as Match details does.
          With nothing behind it (a link opened fresh), Back goes to Events. */}
      <div className="flex items-center justify-between gap-3">
        <button type="button" aria-label="Back" onClick={() => { if (location.key !== 'default') navigate(-1); else navigate('/parent/matches') }}
          className="inline-flex min-h-11 min-w-11 -ml-2 items-center justify-center rounded-xl text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary">
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <Link to="/parent/assessments" className="inline-flex min-h-11 items-center text-sm text-muted-foreground">All assessments</Link>
      </div>
      <h1 className="text-xl text-foreground mb-5">Coach assessment</h1>
      <ParentChildSelector />
      <ParentFamilyContent>
        {query.isError ? <ParentLoadError message="Couldn't load this assessment." onRetry={() => { void query.refetch() }} />
          : query.isPending ? <ParentLoading />
            : assessment ? <ParentAssessmentCard assessment={assessment} showOpenLink={false} />
              : <p className="py-6 text-sm text-muted-foreground">{sessionId
                ? `${selectedChild?.name} hasn't been assessed for this ${matchId ? 'match' : 'session'} yet.`
                : `This assessment isn't available for ${selectedChild?.name}.`}</p>}
        {matchId && <Link to={`/parent/match/${encodeURIComponent(matchId)}`} className="inline-flex min-h-11 items-center mt-3 text-sm text-primary focus-visible:ring-2 focus-visible:ring-primary">Match details</Link>}
      </ParentFamilyContent>
    </div>
    <NavBar role="parent" activeTab="/parent/matches" onNavigate={navigate} />
  </MobileShell>
}
