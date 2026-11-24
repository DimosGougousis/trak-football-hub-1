import { useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, UserRound } from 'lucide-react'
import { MobileShell, NavBar } from '@/components/trak'
import { ParentChildSelector, ParentFamilyContent, ParentLoadError, ParentLoading } from '@/components/parent/ParentFamily'
import { ParentAssessmentCard } from '@/components/parent/ParentAssessmentCard'
import { useParentChildren } from '@/contexts/ParentChildrenContext'
import { useParentAssessment } from '@/hooks/useParentAssessments'
import { EvaluationProgressCard } from '@/components/player/EvaluationProgressCard'
import { useEvaluationProgress } from '@/lib/evaluation-progress'
import { trackEvent } from '@/lib/telemetry'
import { markOpened, wasOpened } from '@/lib/games/news'
import { ChevronLeft } from 'lucide-react'
import { Badge } from '@/components/arc/badge/badge'
import { useFamilyLook } from '@/components/trak/FamilyFrame'
import { FamilyPage, familyCard, familyColumns, familyH2, familyStack } from '@/components/trak/FamilyPage'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'
import { BandBars } from '@/components/player/LatestEvaluation'
import { evalDay } from '@/lib/evaluation'
import { useTranslation } from '@/lib/i18n'
import { firstName } from '@/lib/parent-data'

/** TRAK-402: mounted only for an evaluation's assessment. The coach's note stays the child's: a family reads the band, the
    six ratings and this Progress, and is told so in one line. */
function EvaluationProgress({ assessmentId, childId, name }: { assessmentId: string; childId: string; name: string }) {
  const progress = useEvaluationProgress([assessmentId], childId)
  return <div className="mt-4 grid gap-3">
    {progress.isError
      ? <ParentLoadError message="Couldn't load the progress." onRetry={() => { void progress.refetch() }} />
      : <EvaluationProgressCard objectives={progress.data?.get(assessmentId)?.objectives ?? []} />}
    <p className="text-sm text-muted-foreground">{`Your coach's note is for ${name}. You see the band, the six ratings and the progress.`}</p>
  </div>
}

/** TRAK-441 slice 5: Progress in the coach's card; no line about the note. */
function EvaluationProgressLook({ assessmentId, childId }: { assessmentId: string; childId: string }) {
  const { t } = useTranslation()
  const progress = useEvaluationProgress([assessmentId], childId)
  return progress.isError
    ? <p role="alert" className="text-[15px] text-ink-2">{t('common:couldntLoadProgress')}{' '}
      <button type="button" onClick={() => { void progress.refetch() }} className="font-medium text-brand underline underline-offset-2">{t('coachTraining:tryAgain')}</button></p>
    : <EvaluationProgressCard objectives={progress.data?.get(assessmentId)?.objectives ?? []} look />
}

export default function ParentAssessment() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedChild, parentId } = useParentChildren()
  const origin = location.state as { matchId?: unknown; childId?: unknown } | null
  const matchId = sessionId && origin?.childId === selectedChild?.id && typeof origin?.matchId === 'string'
    ? origin.matchId : null
  const query = useParentAssessment(sessionId ? { kind: 'session', id: sessionId } : id ? { kind: 'assessment', id } : null)
  const assessment = !query.isError ? query.data?.assessment : null
  const shownId = assessment?.id
  useEffect(() => {
    if (shownId) void trackEvent('assessment_viewed', { assessment_id: shownId })
  }, [shownId])
  // TRAK-441: once it shows, Home's Latest evaluation stops saying New for this parent on this device.
  const childId = selectedChild?.id
  // "New" as the page opened (TRAK-441 slice 5): showing it marks it opened (below), and New stays for this visit.
  const fresh = useRef<boolean>()
  if (fresh.current === undefined && assessment && parentId && childId) fresh.current = !wasOpened(parentId, childId, 'evaluation', assessment.id, assessment.created_at ?? '')
  useEffect(() => {
    if (shownId && parentId && childId) markOpened(parentId, childId, 'evaluation', shownId)
  }, [shownId, parentId, childId])
  const { t } = useTranslation()
  const look = useFamilyLook()
  // TRAK-441 slice 5 (mockup, 12 Nov), behind family_look: the coach's page header, the bands as his bars and Progress.
  // No note, and nothing that says there is one (Imad, 12 Nov). An evaluation sits under Home; a match's under Events.
  if (look) {
    const name = selectedChild ? firstName(selectedChild) : ''
    const progress = assessment?.evaluation_id && selectedChild && <EvaluationProgressLook assessmentId={assessment.id} childId={selectedChild.id} />
    return <MobileShell width="wide">
      <div className="pb-28"><ParentFamilyContent>
        {query.isPending ? <LoadingSkeleton className="pt-12" label={t('common:loadingEvaluation')} lines={4} />
          : <FamilyPage title={assessment?.evaluation_id ? t('nav:evaluation') : t('common:coachAssessment')}
            from={sessionId ? { label: t('nav:events'), href: '/parent/matches' } : { label: t('nav:home'), href: '/parent/home' }}
            status={fresh.current ? <Badge tone="success" dot>{t('common:new')}</Badge> : undefined}
            details={<>{assessment?.created_at && <span><strong>{evalDay(assessment.created_at)}</strong></span>}<span><UserRound size={14} strokeWidth={1.75} aria-hidden="true" />{name}</span></>}>
            {query.isError ? <p role="alert" className="text-[15px] text-ink-2">{t('common:couldntLoadFeedback')}{' '}
              <button type="button" onClick={() => { void query.refetch() }} className="font-medium text-brand underline underline-offset-2">{t('coachTraining:tryAgain')}</button></p>
              : <div className={familyColumns}>
                <div className={familyStack}>
                  {assessment ? <section aria-label={t('common:bands')} className={familyCard}>
                    <h2 className={`${familyH2} mb-3`}>{t('common:bands')}</h2><BandBars assessment={assessment} />
                  </section> : <p className="text-[15px] text-ink-2">{sessionId
                    ? t(matchId ? 'common:notAssessedMatch' : 'common:notAssessedSession', { name: selectedChild?.name })
                    : t('common:assessmentUnavailable', { name: selectedChild?.name })}</p>}
                </div>
                <div className={familyStack}>
                  {progress}
                  <div className="flex flex-wrap gap-x-6">
                    {matchId && <Link to={`/parent/match/${encodeURIComponent(matchId)}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
                      {t('common:matchDetails')} <ArrowRight size={16} aria-hidden="true" /></Link>}
                    <Link to="/parent/assessments" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
                      {t('common:allAssessments')} <ArrowRight size={16} aria-hidden="true" /></Link>
                  </div>
                </div>
              </div>}
          </FamilyPage>}
      </ParentFamilyContent></div>
      <NavBar role="parent" activeTab={sessionId ? '/parent/matches' : '/parent/home'} onNavigate={navigate} />
    </MobileShell>
  }
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
      <h1 className="text-xl text-foreground mb-5">{assessment?.evaluation_id ? 'Evaluation' : 'Coach assessment'}</h1>
      <ParentChildSelector />
      <ParentFamilyContent>
        {query.isError ? <ParentLoadError message="Couldn't load this assessment." onRetry={() => { void query.refetch() }} />
          : query.isPending ? <ParentLoading />
            : assessment ? <>
              <ParentAssessmentCard assessment={assessment} showOpenLink={false} />
              {assessment.evaluation_id && selectedChild && <EvaluationProgress assessmentId={assessment.id} childId={selectedChild.id} name={selectedChild.name} />}
            </>
              : <p className="py-6 text-sm text-muted-foreground">{sessionId
                ? `${selectedChild?.name} hasn't been assessed for this ${matchId ? 'match' : 'session'} yet.`
                : `This assessment isn't available for ${selectedChild?.name}.`}</p>}
        {matchId && <Link to={`/parent/match/${encodeURIComponent(matchId)}`} className="inline-flex min-h-11 items-center mt-3 text-sm text-primary focus-visible:ring-2 focus-visible:ring-primary">Match details</Link>}
      </ParentFamilyContent>
    </div>
    <NavBar role="parent" activeTab="/parent/matches" onNavigate={navigate} />
  </MobileShell>
}
