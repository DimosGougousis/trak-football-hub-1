import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { EventRow } from '@/lib/coach-events'
import { formToPlan, numberProblem, type PlanForm } from '@/lib/games/plan'
import { rowsToSave } from '@/lib/games/lineup'
import { useWhoCanCome } from './useGames'
import { OpponentAndGoals } from './OpponentAndGoals'
import { LineUpAndJobs } from './LineUpAndJobs'
import { Button } from '@/components/arc/button/button'
import { Stepper } from '@/components/arc/stepper/stepper'

/* TRAK-284, TRAK-285 (Games 2 and 3/8): the Game plan tab. Opponent and goals, then Line-up and jobs; Share (TRAK-286)
   shows in the stepper as what comes next. One draft, only the coach sees it: Save draft keeps both steps, and a failed
   save keeps everything typed and says so, as Schedule's does. The game page holds what's typed and the step, above its
   tabs, so a look at Logistics never loses them. */

const STEPS = [{ id: 'opponent', label: 'Opponent and goals' }, { id: 'line-up', label: 'Line-up and jobs' }, { id: 'share', label: 'Share' }]
const SAVE_FAILED = "Couldn't save the plan. Check your connection and try again; everything you typed is still here."

export function GamePlan({ game, form, onFormChange, step, onStep }: {
  game: EventRow; form: PlanForm; onFormChange: (form: PlanForm) => void; step: number; onStep: (step: number) => void
}) {
  const { user } = useAuth()
  const client = useQueryClient()
  const who = useWhoCanCome(game)
  const [tried, setTried] = useState(false)
  const [savedNow, setSavedNow] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  // Every change counts, so a save that lands after more typing doesn't say "Saved" for what it never sent.
  const version = useRef(0)
  const change = (next: PlanForm) => {
    version.current += 1
    onFormChange(next)
    setSavedNow(false)
    setProblem(null)
  }

  const save = useMutation({
    mutationFn: async ({ plan, players }: { plan: ReturnType<typeof formToPlan>; players: ReturnType<typeof rowsToSave>; version: number }) => {
      const { error } = await supabase.from('game_plans').upsert({ event_id: game.id, ...plan })
      if (error) throw error
      if (players.length === 0) return
      const { error: lineUpError } = await supabase.from('game_plan_players').upsert(players)
      if (lineUpError) throw lineUpError
    },
    onSuccess: (_, sent) => {
      if (sent.version === version.current) setSavedNow(true)
      void client.invalidateQueries({ queryKey: ['coach', user?.id, 'game-plan', game.id] })
      void client.invalidateQueries({ queryKey: ['coach', user?.id, 'game-players', game.id] })
      void client.invalidateQueries({ queryKey: ['coach', user?.id, 'game-plans'] })
    },
    onError: () => setProblem(SAVE_FAILED),
  })
  const submit = () => {
    setTried(true)
    if (form.keyPlayers.some(player => numberProblem(player.number))) {
      return setProblem(step === 0 ? 'A shirt number goes from 1 to 99. Fix the one marked above, then save.'
        : 'A key player’s shirt number in Opponent and goals goes from 1 to 99. Fix it there, then save.')
    }
    // Only children who can still be recorded. Until that's known, every row goes and the database checks each one.
    const eligible = who.isPending || who.error ? null : new Set(who.players.map(player => player.id))
    save.mutate({ plan: formToPlan(form), players: rowsToSave(game.id, form.players, eligible), version: version.current })
  }

  return (
    <div className="grid gap-5 pt-4">
      <Stepper steps={STEPS} current={step} onStepSelect={onStep} label="Game plan" />
      {step === 0
        ? <OpponentAndGoals eventId={game.id} opponent={game.opponent ?? null} form={form} onFormChange={change} tried={tried} />
        : <LineUpAndJobs form={form} onFormChange={change} who={who} />}
      <div className="flex flex-wrap items-center gap-3">
        {step > 0 && <Button variant="ghost" onClick={() => onStep(step - 1)}>Back</Button>}
        <span className="ml-auto text-sm text-ink-3">Draft · only you see it</span>
        <Button variant="secondary" loading={save.isPending} onClick={submit}>{savedNow ? 'Saved' : 'Save draft'}</Button>
        {step === 0 && <Button onClick={() => onStep(1)}>Next: Line-up and jobs</Button>}
      </div>
      {problem && <p role="alert" className="text-right text-[15px] text-danger">{problem}</p>}
    </div>
  )
}
