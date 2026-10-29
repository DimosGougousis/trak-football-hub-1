import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ClipboardCheck, Moon } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { EventRow } from '@/lib/coach-events'
import type { PlayerPlans } from '@/lib/games/lineup'
import { formToSave, hasPlayed, lineUpAtKickOff, type EvaluationForm } from '@/lib/games/evaluation'
import { useWhoCanCome } from './useGames'
import { ResultStep } from './ResultStep'
import { TeamStep } from './TeamStep'
import { PlayersStep } from './PlayersStep'
import { LoadError } from '@/components/trak'
import { Alert } from '@/components/arc/alert/alert'
import { Button } from '@/components/arc/button/button'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Stepper } from '@/components/arc/stepper/stepper'

/* TRAK-288 (Games 6/8): the Evaluation tab. It opens at full time; before that it says when. Result, Team and Players,
   read against the plan as it locked at kick-off, as one draft only the coach sees: Save draft · sleep on it saves
   every step at once and never publishes. Publish is TRAK-289. The game page holds what's entered and the step, above
   its tabs, as it does for the plan. In the app only: no email, no push. */

const STEPS = [{ id: 'result', label: 'Result' }, { id: 'team', label: 'Team' }, { id: 'players', label: 'Players' }, { id: 'publish', label: 'Publish' }]
const NEXT = ['Next: Team', 'Next: Players']
const SAVE_FAILED = "Couldn't save the evaluation. Check your connection and try again; everything you entered is still here."

export function Evaluation({ game, opensAt, plans, planGoals, form, onFormChange, step, onStep, savedAt }: {
  game: EventRow
  /** Full time as the header shows it ("12:30") while it's still to come; null once it has passed. */
  opensAt: string | null
  /** The line-up and the plan's goals, as they locked at kick-off. */
  plans: PlayerPlans; planGoals: string[]
  form: EvaluationForm; onFormChange: (form: EvaluationForm) => void; step: number; onStep: (step: number) => void
  /** When the draft was last saved; null before its first save. */
  savedAt: string | null
}) {
  const { user } = useAuth()
  const client = useQueryClient()
  const who = useWhoCanCome(game)
  const [savedNow, setSavedNow] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  // Every change counts, so a save that lands after more typing doesn't say "Saved" for what it never sent.
  const version = useRef(0)
  const change = (next: EvaluationForm) => {
    version.current += 1
    onFormChange(next)
    setSavedNow(false)
    setProblem(null)
  }

  const save = useMutation({
    mutationFn: async ({ args }: { args: ReturnType<typeof formToSave>; version: number }) => {
      const { error } = await supabase.rpc('save_game_evaluation', args)
      if (error) throw error
    },
    onSuccess: (_, sent) => {
      if (sent.version === version.current) setSavedNow(true)
      void client.invalidateQueries({ queryKey: ['coach', user?.id, 'game-evaluation', game.id] })
      void client.invalidateQueries({ queryKey: ['coach', user?.id, 'game-evaluations'] })
      void client.invalidateQueries({ queryKey: ['coach', user?.id, 'owed-events'] })
    },
    // The database says why it refused: not full time yet, published, or a child who can't be recorded.
    onError: (error: { code?: string; message?: string }) =>
      setProblem((error.code === 'P0001' || error.code === '42501') && error.message ? error.message : SAVE_FAILED),
  })

  if (opensAt !== null) {
    return <div className="pt-4"><EmptyState icon={<ClipboardCheck size={24} strokeWidth={1.5} />} title={`Opens at full time, ${opensAt}`}
      description="The result, whether the plan worked, and each player against what you expected. Only you see it until you publish it." /></div>
  }
  if (who.error) return <div className="pt-4"><LoadError what="who played" onRetry={who.retry} /></div>
  if (who.isPending) return <p role="status" className="pt-6 text-center text-[13px] text-ink-3">Loading who played…</p>

  const { starters, bench } = lineUpAtKickOff(plans, who.players)
  const listed = [...starters.map(p => ({ id: p.id, starter: true })), ...bench.map(p => ({ id: p.id, starter: false }))]
  const named = (players: typeof starters) => players.map(p => ({ id: p.id, name: p.name }))
  const played = [...starters.filter(p => hasPlayed(form, p.id, true)), ...bench.filter(p => hasPlayed(form, p.id, false))]

  return (
    <div className="grid gap-5 pt-4">
      <Alert tone="info" icon={Moon} open={savedAt !== null} title={savedAt ? `Draft saved ${format(new Date(savedAt), 'HH:mm')}` : 'Draft saved'}>
        Only you can see it.
      </Alert>
      <Stepper steps={STEPS} current={step} onStepSelect={onStep} label="Evaluation" />
      {step === 0 ? <ResultStep form={form} onFormChange={change} starters={named(starters)} bench={named(bench)} />
        : step === 1 ? <TeamStep eventId={game.id} form={form} onFormChange={change} goals={planGoals} />
        : <PlayersStep eventId={game.id} form={form} onFormChange={change} played={named(played)} plans={plans} />}
      <div className="flex flex-wrap items-center gap-3">
        {step > 0 && <Button variant="ghost" onClick={() => onStep(step - 1)}>Back</Button>}
        <span className="ml-auto text-sm text-ink-3">Draft · only you see it</span>
        <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate({ args: formToSave(game.id, form, listed), version: version.current })}>
          <Moon size={16} aria-hidden="true" />{savedNow ? 'Saved' : 'Save draft · sleep on it'}</Button>
        {step < 2 && <Button onClick={() => onStep(step + 1)}>{NEXT[step]}</Button>}
      </div>
      {problem && <p role="alert" className="text-right text-[15px] text-danger">{problem}</p>}
    </div>
  )
}
