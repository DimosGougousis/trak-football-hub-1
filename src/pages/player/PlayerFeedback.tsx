import { useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell, NavBar } from '@/components/trak'
import { trackEvent } from '@/lib/telemetry'
import { markOpened, wasOpened } from '@/lib/games/news'
import { Badge } from '@/components/arc/badge/badge'
import { useFamilyLook } from '@/components/trak/FamilyFrame'
import { FamilyPage, familyCard, familyColumns, familyH2, familyStack } from '@/components/trak/FamilyPage'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'
import { BandBars } from '@/components/player/LatestEvaluation'
import { evalDay } from '@/lib/evaluation'
import { useTranslation } from '@/lib/i18n'
import { AssessmentBands, type AssessmentScores } from '@/components/player/AssessmentBands'
import { EvaluationProgressCard } from '@/components/player/EvaluationProgressCard'
import { useEvaluationProgress } from '@/lib/evaluation-progress'

// TRAK-401: evaluation is set when this assessment closed a season evaluation (published with no session).
// TRAK-441 slice 5: the day and the coach, for the coach's page header and "From Coach …".
type Loaded = { scores: AssessmentScores | null; evaluation: boolean; created: string | null; coach: string | null }
type FeedbackState =
  | { status: 'loading' | 'error' }
  | ({ status: 'empty' } & Loaded)
  | ({ status: 'ready'; body: string } & Loaded)

/** Mounted only for an evaluation's assessment, so a session assessment makes no progress request. */
function EvaluationProgress({ assessmentId, look = false }: { assessmentId: string; look?: boolean }) {
  const { t } = useTranslation()
  const progress = useEvaluationProgress([assessmentId])
  if (progress.isError) return look
    ? <p role="alert" className="text-[15px] text-ink-2">{t('common:couldntLoadProgress')}{' '}
      <button type="button" onClick={() => void progress.refetch()} className="font-medium text-brand">{t('coachTraining:tryAgain')}</button></p>
    : <div role="alert" className="space-y-3">
      <p className="text-muted-foreground">Couldn't load your progress. Please try again.</p>
      <button onClick={() => void progress.refetch()} className="min-h-11 rounded-xl bg-primary px-5 text-primary-foreground">Retry</button>
    </div>
  return <EvaluationProgressCard objectives={progress.data?.get(assessmentId)?.objectives ?? []} look={look} />
}

export default function PlayerFeedback() {
  const { assessmentId } = useParams<{ assessmentId: string }>()
  const { user } = useAuth()
  // Remount before paint on identity/assessment changes to clear old messages.
  return <FeedbackMessage key={`${user?.id}:${assessmentId}`} account={user} assessmentId={assessmentId} />
}

function FeedbackMessage({ account, assessmentId }: { account: { id: string } | null; assessmentId?: string }) {
  const look = useFamilyLook()
  const [state, setState] = useState<FeedbackState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setState({ status: 'loading' })
    const load = async () => {
      if (!account || !assessmentId) {
        setState({ status: 'error' })
        return
      }
      try {
        // G7 permits only explicitly published coach words, including in DEV.
        // This migrated table is not yet in the repository's generated types.
        // TRAK-171 (live run 3): the screen shows this assessment's bands too,
        // as Home does; a failed read of them is said, not hidden.
        const [{ data, error }, bands] = await Promise.all([
          (supabase as SupabaseClient).from('coach_shared_feedback')
            .select('body').eq('assessment_id', assessmentId)
            .not('published_at', 'is', null).abortSignal(controller.signal).returns<{ body: unknown }[]>().maybeSingle(),
          supabase.from('coach_assessments')
            .select('work_rate, tactical, attitude, technical, physical, coachability, evaluation_id, created_at, coach_user_id')
            .eq('id', assessmentId).abortSignal(controller.signal).maybeSingle(),
        ])
        if (!current) return
        if (error) throw error
        if (bands.error) throw bands.error
        const scores = (bands.data as AssessmentScores | null) ?? null
        const loaded = { scores, evaluation: !!bands.data?.evaluation_id, created: bands.data?.created_at ?? null, coach: bands.data?.coach_user_id ?? null }
        if (!data) setState({ status: 'empty', ...loaded })
        else if (typeof data.body !== 'string' || !data.body.trim()) setState({ status: 'error' })
        else setState({ status: 'ready', body: data.body, ...loaded })
      } catch {
        if (current) setState({ status: 'error' })
      }
    }
    void load()
    return () => { current = false; controller.abort() }
  }, [account, assessmentId, attempt])

  useEffect(() => {
    // Count only a message that has committed to the screen, never empty/error.
    if (state.status === 'ready' && assessmentId) trackEvent('feedback_opened', { assessment_id: assessmentId })
    // TRAK-441: once the evaluation shows, Home's Latest evaluation stops saying New on this device.
    if ((state.status === 'ready' || state.status === 'empty') && account && assessmentId) markOpened(account.id, account.id, 'evaluation', assessmentId)
  }, [state, assessmentId, account])

  const evaluation = (state.status === 'ready' || state.status === 'empty') && state.evaluation
  if (look) return <FeedbackPage state={state} assessmentId={assessmentId} readerId={account?.id} onRetry={() => setAttempt(value => value + 1)} />
  return (
    <MobileShell>
      <main className="py-6 space-y-6">
        <Link to="/player/home" className="inline-flex min-h-11 items-center text-sm text-muted-foreground">Back to home</Link>
        <h1 className="text-2xl font-semibold text-foreground">{evaluation ? 'Evaluation' : 'Coach feedback'}</h1>
        {state.status === 'loading' && <p role="status" className="text-muted-foreground">Loading feedback…</p>}
        {state.status === 'error' && <div role="alert" className="space-y-3">
          <p className="text-muted-foreground">Couldn't load feedback. Please try again.</p>
          <button onClick={() => setAttempt(value => value + 1)} className="min-h-11 rounded-xl bg-primary px-5 text-primary-foreground">Retry</button>
        </div>}
        {/* An evaluation's note is optional, so no note is not "still writing". */}
        {state.status === 'empty' && !state.evaluation && <p className="text-muted-foreground">Your coach is still writing your feedback.</p>}
        {state.status === 'ready' && !state.evaluation && <p className="whitespace-pre-wrap break-words rounded-2xl border border-border bg-card p-5 leading-relaxed text-foreground">{state.body}</p>}
        {(state.status === 'ready' || state.status === 'empty') && state.scores &&
          // TRAK-229: a light card like the rest; the bands carry their own colours.
          <section className="rounded-2xl border border-border bg-card p-5"><AssessmentBands scores={state.scores} /></section>}
        {/* TRAK-401: the evaluation reads bands, then Progress, then the coach's note, which only the player sees. */}
        {evaluation && assessmentId && <EvaluationProgress assessmentId={assessmentId} />}
        {state.status === 'ready' && state.evaluation && <section aria-label="From your coach" className="grid gap-1 rounded-2xl bg-brand/[0.12] p-4">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">From your coach, only you see this</p>
          <p className="whitespace-pre-wrap break-words text-[16px] leading-relaxed text-foreground">{state.body}</p>
        </section>}
      </main>
    </MobileShell>
  )
}

/** TRAK-441 slice 5 (mockup, 12 Nov), behind family_look: the same content in the coach's page header. Bands as the
 *  coach's bars (words, no number), then Progress and the coach's note; two columns on a laptop. The note has no
 *  "only you" line (Imad: no helper lines). */
function FeedbackPage({ state, assessmentId, readerId, onRetry }: { state: FeedbackState; assessmentId?: string; readerId?: string; onRetry: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loaded = state.status === 'ready' || state.status === 'empty' ? state : null
  const coach = useQuery({
    queryKey: ['coach-name', loaded?.coach],
    queryFn: async () => (await supabase.from('profiles').select('full_name').eq('user_id', loaded!.coach!).maybeSingle()).data?.full_name?.trim() || null,
    enabled: !!loaded?.coach && state.status === 'ready',
  })
  // "New" as the page opened: showing it marks it opened (above), and New stays for this visit.
  const fresh = useRef<boolean>()
  if (fresh.current === undefined && loaded && readerId && assessmentId) fresh.current = !wasOpened(readerId, readerId, 'evaluation', assessmentId, loaded.created ?? '')
  const shell = (body: JSX.Element) => <MobileShell width="wide">
    <div className="pb-28">{body}</div>
    <NavBar role="player" activeTab="/player/home" onNavigate={navigate} />
  </MobileShell>
  if (state.status === 'loading') return shell(<LoadingSkeleton className="pt-12" label={t('common:loadingEvaluation')} lines={4} />)
  const note = state.status === 'ready' && <section aria-label={coach.data ? t('common:fromCoach', { name: coach.data }) : t('common:fromYourCoach')} className={familyCard}>
    <h2 className={familyH2}>{coach.data ? t('common:fromCoach', { name: coach.data }) : t('common:fromYourCoach')}</h2>
    <p className="mt-2 whitespace-pre-wrap break-words text-[15px] text-ink-2">{state.body}</p>
  </section>
  return shell(<FamilyPage title={loaded?.evaluation ? t('nav:evaluation') : t('common:coachFeedback')} from={{ label: t('nav:home'), href: '/player/home' }}
    status={fresh.current ? <Badge tone="success" dot>{t('common:new')}</Badge> : undefined}
    details={loaded?.created ? <span><strong>{evalDay(loaded.created)}</strong></span> : undefined}>
    {!loaded ? <p role="alert" className="text-[15px] text-ink-2">{t('common:couldntLoadFeedback')}{' '}
      <button type="button" onClick={onRetry} className="font-medium text-brand">{t('coachTraining:tryAgain')}</button></p>
      : <div className={familyColumns}>
        {loaded.scores && <section aria-label={t('common:bands')} className={familyCard}>
          <h2 className={`${familyH2} mb-3`}>{t('common:bands')}</h2><BandBars assessment={loaded.scores} />
        </section>}
        <div className={familyStack}>
          {loaded.evaluation && assessmentId && <EvaluationProgress assessmentId={assessmentId} look />}
          {note}
          {/* An evaluation's note is optional, so no note is not "still writing". */}
          {state.status === 'empty' && !loaded.evaluation && <p className="text-[15px] text-ink-2">{t('common:stillWriting')}</p>}
        </div>
      </div>}
  </FamilyPage>)
}
