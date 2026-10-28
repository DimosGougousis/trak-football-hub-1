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
import { ShareStep } from './ShareStep'
import { Button } from '@/components/arc/button/button'
import { Stepper } from '@/components/arc/stepper/stepper'

/* TRAK-284, TRAK-285, TRAK-286 (Games 2 to 4/8): the Game plan tab. Opponent and goals, Line-up and jobs, then Share.
   One draft, only the coach sees it: Save draft keeps both steps, and a failed save keeps everything typed and says so,
   as Schedule's does. Sharing saves what's typed first, so what goes out is what's on screen. The game page holds what's
   typed and the step, above its tabs, so a look at Logistics never loses them. */

const STEPS = [{ id: 'opponent', label: 'Opponent and goals' }, { id: 'line-up', label: 'Line-up and jobs' }, { id: 'share', label: 'Share' }]
const SAVE_FAILED = "Couldn't save the plan. Check your connection and try again; everything you typed is still here."
const SHARE_FAILED = "Couldn't share the plan. Check your connection and try again; everything you typed is still here."

export function GamePlan({ game, form, onFormChange, step, onStep, sharedAt, changes }: {
  game: EventRow; form: PlanForm; onFormChange: (form: PlanForm) => void; step: number; onStep: (step: number) => void
  /** TRAK-286: when the plan was first shared, or null; and whose copies a share would change now. */
  sharedAt: string | null; changes: string[]
}) {
  const { user, profile } = useAuth()
  const client = useQueryClient()
  const who = useWhoCanCome(game)
  const [tried, setTried] = useState(false)
  const [savedNow, setSavedNow] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [shareProblem, setShareProblem] = useState<string | null>(null)
  // Every change counts, so a save that lands after more typing doesn't say "Saved" for what it never sent.
  const version = useRef(0)
  const change = (next: PlanForm) => {
    version.current += 1
    onFormChange(next)
    setSavedNow(false)
    setProblem(null)
    setShareProblem(null)
  }

  /** What Save draft and Share write, or why it can't be saved yet. */
  const draft = () => {
    setTried(true)
    if (form.keyPlayers.some(player => numberProblem(player.number))) {
      return step === 0 ? 'A shirt number goes from 1 to 99. Fix the one marked above, then save.'
        : 'A key player’s shirt number in Opponent and goals goes from 1 to 99. Fix it there, then save.'
    }
    // Only children who can still be recorded. Until that's known, every row goes and the database checks each one.
    const eligible = who.isPending || who.error ? null : new Set(who.players.map(player => player.id))
    return { plan: formToPlan(form), players: rowsToSave(game.id, form.players, eligible), version: version.current }
  }
  const write = async ({ plan, players }: Exclude<ReturnType<typeof draft>, string>) => {
    const { error } = await supabase.from('game_plans').upsert({ event_id: game.id, ...plan })
    if (error) throw error
    if (players.length === 0) return
    const { error: lineUpError } = await supabase.from('game_plan_players').upsert(players)
    if (lineUpError) throw lineUpError
  }
  const refresh = (shared: boolean) => Promise.all([
    client.invalidateQueries({ queryKey: ['coach', user?.id, 'game-plan', game.id] }),
    client.invalidateQueries({ queryKey: ['coach', user?.id, 'game-players', game.id] }),
    client.invalidateQueries({ queryKey: ['coach', user?.id, 'game-plans'] }),
    client.invalidateQueries({ queryKey: ['coach', user?.id, 'game-plan-changes'] }),
    shared && client.invalidateQueries({ queryKey: ['coach', user?.id, 'game-shares'] }),
  ])

  const save = useMutation({
    mutationFn: write,
    onSuccess: (_, sent) => {
      if (sent.version === version.current) setSavedNow(true)
      void refresh(false)
    },
    onError: () => setProblem(SAVE_FAILED),
  })
  const submit = () => {
    const next = draft()
    if (typeof next === 'string') return setProblem(next)
    save.mutate(next)
  }

  // TRAK-286: Share now and Share the changes. The database checks the logistics, the tick and kick-off, and says why.
  const share = useMutation({
    mutationFn: async ({ sent, talked }: { sent: Exclude<ReturnType<typeof draft>, string>; talked: boolean }) => {
      await write(sent)
      const { error } = await supabase.rpc('share_game_plan', { p_event_id: game.id, p_talked: talked })
      if (error) throw error
    },
    // Awaited, so the step shows the shared plan as soon as the button stops loading.
    onSuccess: async (_, { sent }) => {
      if (sent.version === version.current) setSavedNow(true)
      await refresh(true)
    },
    onError: (error: { code?: string; message?: string }) => setShareProblem(error.code === 'P0001' && error.message ? error.message : SHARE_FAILED),
  })
  const shareNow = (talked: boolean) => {
    const next = draft()
    if (typeof next === 'string') return setShareProblem(next)
    setShareProblem(null)
    share.mutate({ sent: next, talked })
  }

  return (
    <div className="grid gap-5 pt-4">
      <Stepper steps={STEPS} current={step} onStepSelect={onStep} label="Game plan" />
      {step === 0 ? <OpponentAndGoals eventId={game.id} opponent={game.opponent ?? null} form={form} onFormChange={change} tried={tried} />
        : step === 1 ? <LineUpAndJobs form={form} onFormChange={change} who={who} />
        : <ShareStep game={game} form={form} who={who} sharedAt={sharedAt} changes={changes} coachName={profile?.full_name?.trim() || null}
            onShare={shareNow} sharing={share.isPending} problem={shareProblem} />}
      <div className="flex flex-wrap items-center gap-3">
        {step > 0 && <Button variant="ghost" onClick={() => onStep(step - 1)}>Back</Button>}
        <span className="ml-auto text-sm text-ink-3">Draft · only you see it</span>
        <Button variant="secondary" loading={save.isPending} onClick={submit}>{savedNow ? 'Saved' : 'Save draft'}</Button>
        {step < 2 && <Button onClick={() => onStep(step + 1)}>{step === 0 ? 'Next: Line-up and jobs' : 'Next: Share'}</Button>}
      </div>
      {problem && <p role="alert" className="text-right text-[15px] text-danger">{problem}</p>}
    </div>
  )
}
