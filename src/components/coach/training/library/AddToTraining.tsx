import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Plus } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useAuth } from '@/contexts/AuthContext'
import { useCoachSquad } from '@/lib/coach-squad'
import { splitTrainings } from '@/lib/training/sessions'
import { planPath, type PlannerState } from '@/lib/training/plans'
import type { LibraryDrill } from '@/lib/training/library'
import { gameWhen } from '@/components/coach/games/useGames'
import { useDrafts, usePastSessions, useTrainings, type Training } from '../useTraining'
import { LoadError } from '@/components/trak'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet'
import { Button } from '@/components/arc/button/button'

/* TRAK-391 (Drill Library 6/11, parent TRAK-384): Add to training, on a drill's page. A pop-up lists the trainings
   coming up (of the squad picked at the top, or all); picking one opens Plan session with the drill added as a new
   part at the end (Kostas, 8 Nov), at the players and level set on the page. Nothing is saved until the coach saves.
   Once a training coming up holds the drill, in its plan or its draft, the button says "Added to <day>" and opens it. */

type Status = 'planned' | 'draft' | 'none'
const STATUS = { planned: 'coachTraining:libPlanned', draft: 'coachTraining:libDraft', none: 'coachTraining:notPlanned' } as const satisfies Record<Status, string>

/** The trainings coming up, each with how far its plan is and whether it already holds the drill. */
function useComingUp(drill: LibraryDrill) {
  const { user } = useAuth()
  const coachSquad = useCoachSquad(user?.id)
  const trainings = useTrainings()
  const drafts = useDrafts()
  const planned = usePastSessions()
  const reads = [trainings, drafts, planned]
  const inView = (trainings.data ?? []).filter(t => coachSquad.everySquad || coachSquad.eventInSquad(t.squad))
  const rows = splitTrainings(inView, Date.now()).comingUp.map(training => {
    const draft = drafts.data?.get(training.id)
    const plan = planned.data?.find(s => s.id === training.id)
    const status: Status = draft ? 'draft' : plan ? 'planned' : 'none'
    const holds = !!draft?.parts.some(p => p.drill?.source === 'trak' && p.drill.trak_drill === drill.id)
      || !!plan?.practices.some(p => p.source === 'trak' && p.trak_drill === drill.id)
    return { training, status, holds }
  })
  return {
    rows,
    everySquad: coachSquad.everySquad,
    pending: reads.some(r => r.isPending),
    error: reads.some(r => r.error),
    retry: () => reads.forEach(r => void r.refetch()),
    retrying: reads.some(r => r.isFetching),
  }
}

export function AddToTraining({ drill, players, level }: { drill: LibraryDrill; players: number; level: number }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const coming = useComingUp(drill)
  const added = coming.rows.find(r => r.holds)?.training
  const add = (training: Training) => {
    const state: PlannerState = { addLibrary: { drill: drill.id, players, level } }
    navigate(planPath(training.id), { state })
  }

  return <div className="grid gap-1.5">
    {added ? <Link to={planPath(added.id)}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-4 text-[15px] font-medium text-brand hover:bg-brand/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <Check aria-hidden size={18} />{t('coachTraining:libAddedTo', { day: gameWhen(added).day })}</Link>
      : <Button size="lg" className="w-full" disabled={coming.pending} onClick={() => setOpen(true)}><Plus aria-hidden size={18} />{t('coachTraining:libAddToTraining')}</Button>}
    {added && <button type="button" onClick={() => setOpen(true)}
      className="justify-self-center rounded px-1 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {t('coachTraining:libAddToAnother')}</button>}

    <BottomSheet className="arc" open={open} onOpenChange={setOpen} detents={[0.92]} title={t('coachTraining:libWhichTraining', { name: drill.name })}
      description={t('coachTraining:libJoinsPlan')}>
      <div className="grid gap-4 pb-4">
        {coming.error ? <LoadError what={t('coachTraining:libYourTrainingsWhat')} onRetry={coming.retry} retrying={coming.retrying} />
          : coming.pending ? <LoadingSkeleton label={t('coachTraining:loadingTrainings')} rows={2} />
          : !coming.rows.length ? <p className="rounded-xl bg-raised px-4 py-3 text-[15px] text-ink-2">
            {t('coachTraining:libNoComing')}</p>
          : <ul aria-label={t('coachTraining:libComingUp')} className="grid divide-y divide-line rounded-xl border border-line">
            {coming.rows.map(({ training, status, holds }) => {
              const { day, time } = gameWhen(training)
              return <li key={training.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="truncate text-[15px] font-medium text-ink">{training.title}</span>
                  <span className="text-sm text-ink-3">{[day, time, coming.everySquad ? training.squad : null,
                    holds ? t('coachTraining:libHasDrill') : t(STATUS[status])].filter(Boolean).join(' · ')}</span>
                </span>
                <Button size="sm" variant="secondary" aria-label={t('coachTraining:libAddToAria', { title: training.title, day })} onClick={() => add(training)}>{t('coachTraining:libAdd')}</Button>
              </li>
            })}
          </ul>}
        <div className="flex justify-end"><Button variant="secondary" onClick={() => setOpen(false)}>{t('coachSchedule:cancel')}</Button></div>
      </div>
    </BottomSheet>
  </div>
}
