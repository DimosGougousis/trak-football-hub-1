import { useState } from 'react'
import { format } from 'date-fns'
import { Lock } from 'lucide-react'
import type { EventRow } from '@/lib/coach-events'
import type { PlanForm } from '@/lib/games/plan'
import { playerPlan } from '@/lib/games/lineup'
import { lineUpCounts, previewOf, readers } from '@/lib/games/share'
import { GamePlanSection } from '@/components/player/GamePlanSection'
import type { useWhoCanCome } from './useGames'
import { LoadError } from '@/components/trak'
import { Alert } from '@/components/arc/alert/alert'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Select } from '@/components/arc/select/select'
import { ShareReadiness } from '@/components/arc/blocks/release-readiness/share-readiness'

/* TRAK-286 (Games 4/8): plan step 3, Share (TRAK-282). Before the first share: the readiness checks and Share now,
   held back only by the logistics and the face-to-face tick (Imad, 28 Oct). After it: when it was shared and, for
   edits since, who they change and "Share the changes with N". Who sees what, and a preview drawn by the player's
   and the parent's own Game plan section. In the app only: no email, no push. TRAK-287: locked at kick-off, nothing
   is shared any more; the lock's alert says what wasn't. */

const card = 'grid min-w-0 content-start gap-4 rounded-2xl border border-line bg-surface p-5'
const first = (name: string) => name.split(/\s+/)[0] || name
const players = (n: number) => `${n} ${n === 1 ? 'player' : 'players'}`
const list = (names: string[]) => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

export function ShareStep({ game, form, who, sharedAt, changes, coachName, onShare, sharing, problem, locked = false }: {
  game: EventRow; form: PlanForm; who: ReturnType<typeof useWhoCanCome>; locked?: boolean
  /** When the plan was first shared; null while it's a draft. */
  sharedAt: string | null
  /** The squad rows whose copies a share would change now (game_plan_changes). */
  changes: string[]
  coachName: string | null
  onShare: (talked: boolean) => void
  sharing: boolean
  problem: string | null
}) {
  const [talked, setTalked] = useState(false)
  const [as, setAs] = useState<'player' | 'parent'>('player')
  const [pick, setPick] = useState<string | null>(null)

  if (who.error) return <LoadError what="who can come" onRetry={who.retry} />
  if (who.isPending) return <p role="status" className="pt-6 text-center text-[13px] text-ink-3">Loading who can come…</p>

  const reading = readers(form, who.players)
  const { placed, withJob } = lineUpCounts(form, who.players)
  const names = new Map(who.players.map(player => [player.id, player.name]))
  const changed = changes.map(id => names.get(id)).filter((name): name is string => !!name)
  const shown = reading.find(player => player.id === pick)
    ?? reading.find(player => playerPlan(form.players, player.id).role === 'starter') ?? reading[0]
  const role = (id: string) => ({ starter: '', bench: ' · bench', not_selected: ' · not selected' })[playerPlan(form.players, id).role]

  return (
    <div className="grid gap-4 tablet:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] tablet:items-start">
      <div className="grid min-w-0 gap-4">
        {sharedAt == null && locked ? (
          <section aria-labelledby="plan-not-shared" className={card}>
            <h2 id="plan-not-shared" className="text-lg font-medium text-ink">Not shared</h2>
            <p className="text-sm text-ink-2">It wasn’t shared before kick-off, so only you saw it.</p>
          </section>
        ) : sharedAt == null ? (
          <div className="arc">
            <ShareReadiness title="Share the plan" subtitle={`${players(reading.length)} and their families, in the app only`}
              actionLabel="Share now" onAction={() => onShare(talked)} busy={sharing} error={problem}
              checks={[
                { id: 'logistics', label: 'Logistics shared with families', required: true, done: game.published,
                  detail: game.published ? 'Families have the time and the place.' : 'Publish the match in Logistics first.' },
                { id: 'line-up', label: 'Line-up complete', done: placed === form.format,
                  detail: `${placed} of ${form.format} placed.${placed === form.format ? '' : ' You can share before it’s complete.'}` },
                { id: 'jobs', label: 'Every starter has a job', done: placed > 0 && withJob === placed,
                  detail: placed === 0 ? 'Nobody is on the pitch yet.' : `${withJob} of ${placed} starters have one.${withJob === placed ? '' : ' You can still share.'}` },
                { id: 'talked', label: 'I’ve talked selection through with the players, face to face', required: true, done: talked,
                  detail: 'Before this goes out. Players should hear it from you first.', onCheckedChange: setTalked },
              ]} />
          </div>
        ) : (
          <section aria-labelledby="plan-shared" className={`arc ${card}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="plan-shared" className="text-lg font-medium text-ink">Shared</h2>
              <Badge tone="success">Shared {format(new Date(sharedAt), 'EEE HH:mm')}</Badge>
            </div>
            <p className="text-sm text-ink-2">{players(reading.length)} and their families read it in the app.{locked ? '' : ' Edits stay with you until you share them.'}</p>
            <Alert tone="info" open={!locked && changes.length > 0} title="Changes not shared">
              {changed.length ? `${list(changed)}. ` : ''}Only they and their families get the update.
              <span className="mt-3 block"><Button size="sm" loading={sharing} onClick={() => onShare(false)}>Share the changes with {changes.length}</Button></span>
            </Alert>
            {problem && <p role="alert" className="text-sm text-danger">{problem}</p>}
          </section>
        )}

        <section aria-labelledby="plan-who" className={card}>
          <h2 id="plan-who" className="text-lg font-medium text-ink">Who sees what</h2>
          <ul className="divide-y divide-line">
            <li className="grid gap-0.5 py-3"><span className="text-sm font-medium text-ink">Each player</span>
              <span className="text-sm text-ink-3">The goals, their job, and your note to them.</span></li>
            <li className="grid gap-0.5 py-3"><span className="text-sm font-medium text-ink">Families</span>
              <span className="text-sm text-ink-3">The logistics and their player’s job, or “Not in the squad this week”. Never your note.</span></li>
            <li className="grid gap-0.5 py-3"><span className="flex items-center gap-1.5 text-sm font-medium text-ink">Only you<Lock size={14} aria-hidden="true" /></span>
              <span className="text-sm text-ink-3">Expectations and context, until you publish the evaluation. How strong they are and scouting, always.</span></li>
          </ul>
        </section>
      </div>

      <section aria-labelledby="plan-preview" className={`arc ${card}`}>
        <h2 id="plan-preview" className="text-lg font-medium text-ink">Preview</h2>
        {!shown ? <p className="text-sm text-ink-2">Nobody who can come is in this squad yet, so nobody would read it.</p> : <>
          <SegmentedControl label="Preview as" value={as} onValueChange={value => setAs(value as 'player' | 'parent')}
            options={[{ value: 'player', label: 'As the player' }, { value: 'parent', label: 'As the parent' }]} />
          <div className="max-w-[320px]">
            <Select label="Player" value={shown.id} onValueChange={setPick}
              options={reading.map(player => ({ value: player.id, label: `${player.name}${role(player.id)}` }))} />
          </div>
          <div className="rounded-[24px] border border-line bg-ground p-4">
            <GamePlanSection as={as} coachName={coachName} childName={first(shown.name)} plan={previewOf(form, shown.id, as)} />
          </div>
        </>}
      </section>
    </div>
  )
}
