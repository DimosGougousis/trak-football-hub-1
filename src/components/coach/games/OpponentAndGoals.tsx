import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock, Plus } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { Tables } from '@/integrations/supabase/types'
import {
  FORMATIONS, LIMITS, MAX_GOALS, MAX_KEY_PLAYERS, STRENGTHS, emptyGoal, emptyKeyPlayer, formToPlan, numberProblem, planToForm,
  type Goal, type KeyPlayer, type PlanForm, type Strength,
} from '@/lib/games/plan'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { RadioGroup } from '@/components/arc/radio-group/radio-group'
import { Select } from '@/components/arc/select/select'
import { Textarea } from '@/components/arc/textarea/textarea'

/* TRAK-284 (Games 2/8): plan step 1, opponent and goals (TRAK-282), saved as a draft only the coach sees. The
   shirt number is a plain input with the number pad, not Arc's number-field: it's a code, and it can be blank
   (Imad, 28 Oct). A failed save keeps everything typed and says so, as Schedule's does. */

const SAVE_FAILED = "Couldn't save the plan. Check your connection and try again; everything you typed is still here."
const NUMBER_FIRST = 'A shirt number goes from 1 to 99. Fix the one marked above, then save.'
const UNSURE = 'unsure'
const FORMATION_OPTIONS = [{ value: UNSURE, label: 'Not sure yet' }, ...FORMATIONS.map(shape => ({ value: shape, label: shape }))]
const card = 'grid min-w-0 content-start gap-4 rounded-2xl border border-line bg-surface p-5'

export function OpponentAndGoals({ eventId, opponent, saved }: { eventId: string; opponent: string | null; saved: Tables<'game_plans'> | null }) {
  const { user } = useAuth()
  const client = useQueryClient()
  const [form, setForm] = useState(() => planToForm(saved))
  const [tried, setTried] = useState(false)
  const [savedNow, setSavedNow] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  // Every change counts, so a save that lands after more typing doesn't say "Saved" for what it never sent.
  const version = useRef(0)
  const change = (next: Partial<PlanForm>) => {
    version.current += 1
    setForm(current => ({ ...current, ...next }))
    setSavedNow(false)
    setProblem(null)
  }
  const setGoal = (index: number, next: Partial<Goal>) => change({ goals: form.goals.map((goal, i) => i === index ? { ...goal, ...next } : goal) })
  const setPlayer = (index: number, next: Partial<KeyPlayer>) =>
    change({ keyPlayers: form.keyPlayers.map((player, i) => i === index ? { ...player, ...next } : player) })

  const save = useMutation({
    mutationFn: async ({ plan }: { plan: ReturnType<typeof formToPlan>; version: number }) => {
      const { error } = await supabase.from('game_plans').upsert({ event_id: eventId, ...plan })
      if (error) throw error
    },
    onSuccess: (_, sent) => {
      if (sent.version === version.current) setSavedNow(true)
      void client.invalidateQueries({ queryKey: ['coach', user?.id, 'game-plan', eventId] })
      void client.invalidateQueries({ queryKey: ['coach', user?.id, 'game-plans'] })
    },
    onError: () => setProblem(SAVE_FAILED),
  })
  const submit = () => {
    setTried(true)
    if (form.keyPlayers.some(player => numberProblem(player.number))) return setProblem(NUMBER_FIRST)
    save.mutate({ plan: formToPlan(form), version: version.current })
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 laptop:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] laptop:items-start">
        <section aria-labelledby="plan-goals" className={card}>
          <div>
            <h2 id="plan-goals" className="text-lg font-medium text-ink">Your goals</h2>
            <p className="mt-1 text-sm text-ink-3">Up to three. Players see them once you share the plan.</p>
          </div>
          <ol className="grid gap-5">
            {form.goals.map((goal, index) => <li key={index}>
              <fieldset className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                <legend className="sr-only">Goal {index + 1}</legend>
                <span aria-hidden="true" className="row-span-3 grid size-7 place-items-center rounded-full bg-ink text-sm font-medium text-surface">{index + 1}</span>
                <Input label="Goal" value={goal.title} maxLength={LIMITS.title} placeholder="Win it back in their half"
                  onChange={event => setGoal(index, { title: event.target.value })} />
                <Textarea label="What it looks like" rows={2} value={goal.looksLike} maxLength={LIMITS.looksLike}
                  placeholder="Press when their keeper plays short." onChange={event => setGoal(index, { looksLike: event.target.value })} />
                {form.goals.length > 1 && <span><Button variant="ghost" size="sm" aria-label={`Remove goal ${index + 1}`}
                  onClick={() => change({ goals: form.goals.filter((_, i) => i !== index) })}>Remove</Button></span>}
              </fieldset>
            </li>)}
          </ol>
          {form.goals.length < MAX_GOALS && <span><Button variant="ghost" size="sm" onClick={() => change({ goals: [...form.goals, emptyGoal()] })}>
            <Plus size={16} aria-hidden="true" />Add a goal</Button></span>}
        </section>

        <div className="grid min-w-0 gap-4">
          <section aria-labelledby="plan-strength" className={card}>
            <div>
              <h2 id="plan-strength" className="text-lg font-medium text-ink">How strong are {opponent ?? 'they'}?</h2>
              <p className="mt-1 text-sm text-ink-3">Only you see this. It sits beside every player in the evaluation.</p>
            </div>
            <RadioGroup label="Strength" name={`strength-${eventId}`} options={STRENGTHS} value={form.strength ?? ''}
              onValueChange={value => change({ strength: value as Strength })} />
          </section>

          <section aria-labelledby="plan-their-players" className={card}>
            <div>
              <h2 id="plan-their-players" className="text-lg font-medium text-ink">Their likely line-up</h2>
              <p className="mt-1 text-sm text-ink-3">Only you see this. Shirt numbers and positions, never names: they’re another club’s players.</p>
            </div>
            <Select label="Their formation" options={FORMATION_OPTIONS} value={form.theirFormation ?? UNSURE}
              onValueChange={value => change({ theirFormation: value === UNSURE ? null : value })} />
            {form.keyPlayers.length === 0 ? <p className="text-sm text-ink-2">No key players yet.</p> : <ul className="grid gap-5">
              {form.keyPlayers.map((player, index) => <li key={index}>
                <fieldset className="grid gap-3">
                  <legend className="sr-only">Key player {index + 1}</legend>
                  <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
                    <Input label="Number" inputMode="numeric" autoComplete="off" maxLength={2} value={player.number}
                      error={tried ? numberProblem(player.number) ?? undefined : undefined}
                      onChange={event => setPlayer(index, { number: event.target.value.replace(/\D/g, '').slice(0, 2) })} />
                    <Input label="Position" value={player.position} maxLength={LIMITS.position} placeholder="Striker"
                      onChange={event => setPlayer(index, { position: event.target.value })} />
                  </div>
                  <Textarea label="Note" rows={2} value={player.note} maxLength={LIMITS.note} placeholder="Quick. Runs in behind."
                    onChange={event => setPlayer(index, { note: event.target.value })} />
                  <span><Button variant="ghost" size="sm" aria-label={`Remove key player ${index + 1}`}
                    onClick={() => change({ keyPlayers: form.keyPlayers.filter((_, i) => i !== index) })}>Remove</Button></span>
                </fieldset>
              </li>)}
            </ul>}
            {form.keyPlayers.length < MAX_KEY_PLAYERS && <span><Button variant="ghost" size="sm"
              onClick={() => change({ keyPlayers: [...form.keyPlayers, emptyKeyPlayer()] })}><Plus size={16} aria-hidden="true" />Add a key player</Button></span>}
          </section>

          <section aria-labelledby="plan-scouting" className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="plan-scouting" className="text-lg font-medium text-ink">Scouting</h2>
              <Badge size="sm" icon={<Lock size={12} />}>Only you</Badge>
            </div>
            <Textarea label="What you know about them" rows={4} value={form.scouting} maxLength={LIMITS.scouting}
              placeholder="Their keeper often plays short to the left centre-back." onChange={event => change({ scouting: event.target.value })} />
          </section>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-sm text-ink-3">Draft · only you see it</span>
        <Button variant="secondary" loading={save.isPending} onClick={submit}>{savedNow ? 'Saved' : 'Save draft'}</Button>
      </div>
      {problem && <p role="alert" className="text-right text-[15px] text-danger">{problem}</p>}
    </div>
  )
}
