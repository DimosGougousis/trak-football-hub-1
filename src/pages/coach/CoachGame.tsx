import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { ChevronLeft, ClipboardCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { publishEvent } from '@/lib/event-publish'
import { useCoachSquad } from '@/lib/coach-squad'
import { rowToForm, startedLocked, type EventRow } from '@/lib/coach-events'
import { STATE, gameState, type GameTab } from '@/lib/games/loop'
import type { Tables } from '@/integrations/supabase/types'
import { gameTitle, gameWhen, useGame, useGamePlan } from '@/components/coach/games/useGames'
import { OpponentAndGoals } from '@/components/coach/games/OpponentAndGoals'
import { EventSummary } from '@/components/coach/EventSummary'
import { LoadError } from '@/components/trak'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { Countdown } from '@/components/arc/countdown/countdown'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Stepper } from '@/components/arc/stepper/stepper'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs'

/* TRAK-283 (Games 1/8): a game's page. Its header says where it is in the loop; Logistics, Game plan and
   Evaluation are peer panels of the one game (Arc tabs), and the panel lives in the URL (?tab=). Evaluation
   (TRAK-288) says what will happen there until it's built. TRAK-284: the Game plan's three steps, the first built;
   Line-up and jobs (TRAK-285) and Share (TRAK-286) show in its stepper as what comes next. */

const TABS: { id: GameTab; label: string }[] = [
  { id: 'logistics', label: 'Logistics' }, { id: 'plan', label: 'Game plan' }, { id: 'evaluation', label: 'Evaluation' },
]
const PLAN_STEPS = [{ id: 'opponent', label: 'Opponent and goals' }, { id: 'line-up', label: 'Line-up and jobs' }, { id: 'share', label: 'Share' }]
type Plan = UseQueryResult<Tables<'game_plans'> | null>
const linkClass = 'rounded text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

export default function CoachGame() {
  const { eventId } = useParams()
  const game = useGame(eventId)
  // Read beside the game, so the header's state never flips from "Plan not written" once the draft arrives.
  const plan = useGamePlan(eventId)
  return (
    <div className="min-h-screen bg-ground pb-24">
      <div className="mx-auto w-full max-w-[960px] px-5 tablet:px-8">
        <Link to="/coach/games" className={`mt-5 inline-flex items-center gap-1 ${linkClass}`}><ChevronLeft size={16} aria-hidden="true" />Games</Link>
        {game.error ? <div className="pt-6"><LoadError what="this game" onRetry={() => void game.refetch()} retrying={game.isFetching} /></div>
          : game.isPending || plan.isPending ? <p role="status" className="pt-14 text-center text-[13px] text-ink-3">Loading the game…</p>
          : !game.data ? <p className="pt-10 text-[15px] text-ink-2">This game isn’t in your games.</p>
          : <Game row={game.data} plan={plan} />}
      </div>
    </div>
  )
}

function Game({ row, plan }: { row: EventRow; plan: Plan }) {
  const { user } = useAuth()
  const coachSquad = useCoachSquad(user?.id)
  const [params, setParams] = useSearchParams()
  const tab = TABS.find(t => t.id === params.get('tab'))?.id ?? 'logistics'
  const [now, setNow] = useState(() => Date.now())
  const cancelled = row.status === 'cancelled'
  const state = STATE[gameState({ ...row, ends_at: row.ends_at ?? null }, now, !!plan.data)]
  const { day, time, academy } = gameWhen(row)
  const squad = coachSquad.squads.length >= 2 && row.squad ? row.squad : undefined
  const where = [day, time ? `Kick-off ${time}` : '', row.home_away === 'home' ? 'Home' : row.home_away === 'away' ? 'Away' : '', row.venue ?? '', squad ?? '']

  return <>
    <header className="arc grid gap-2 pt-4 pb-2">
      <h1 className="text-[26px] font-medium tracking-[-0.01em] text-ink break-words">{gameTitle(row)}</h1>
      <p className="text-sm text-ink-2">{where.filter(Boolean).join(' · ')}</p>
      {academy && <p className="text-sm text-ink-3">{academy}</p>}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {cancelled ? <Badge tone="danger">Cancelled</Badge> : <Badge tone={state.tone}>{state.label}</Badge>}
        {!cancelled && now < Date.parse(row.starts_at) && <Countdown variant="compact" units={['days', 'hours', 'minutes']}
          target={row.starts_at} label="Kick-off in" completeLabel="Locked" onComplete={() => setNow(Date.now())} />}
      </div>
    </header>

    {cancelled ? <p className="pt-4 text-[15px] text-ink-2">This match was cancelled.</p> : (
      <div className="arc pt-4">
        <Tabs value={tab} onValueChange={next => setParams({ tab: next }, { replace: true })}>
          <TabsList aria-label="This game">
            {TABS.map(t => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="logistics"><Logistics row={row} squad={squad} /></TabsContent>
          {/* Kept mounted while another tab is open, so switching tabs never loses what was typed. */}
          <TabsContent value="plan" forceMount>
            <div className="grid gap-5 pt-4">
              <Stepper steps={PLAN_STEPS} current={0} label="Game plan" />
              {plan.isError && plan.data === undefined
                ? <LoadError what="the plan" onRetry={() => void plan.refetch()} retrying={plan.isFetching} />
                : <OpponentAndGoals eventId={row.id} opponent={row.opponent ?? null} saved={plan.data ?? null} />}
            </div>
          </TabsContent>
          <TabsContent value="evaluation">
            <EmptyState icon={<ClipboardCheck size={24} strokeWidth={1.5} />} title="Evaluate it after full time"
              description="The result, whether the plan worked, and each player against what you expected. Only you see it until you publish it." />
          </TabsContent>
        </Tabs>
      </div>
    )}
  </>
}

/** Schedule's Review rows, read only; Schedule stays where the event is edited (?edit=). A draft publishes here, in
 *  place, as Home's event sheet publishes one (publishEvent: families are emailed the logistics, as today). */
function Logistics({ row, squad }: { row: EventRow; squad?: string }) {
  const client = useQueryClient()
  const publish = useMutation({
    mutationFn: () => publishEvent(row.id),
    onSuccess: () => {
      toast.success('Published to the squad')
      void client.invalidateQueries({ queryKey: ['coach'] })
    },
    onError: error => toast.error(error.message),
  })
  return (
    <div className="grid gap-4 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={row.published ? 'success' : 'neutral'}>{row.published ? 'Shared with families' : 'Draft'}</Badge>
        {!row.published && <Button loading={publish.isPending} onClick={() => publish.mutate()}>Publish</Button>}
        {/* TRAK-230: once it has started, what families were told is fixed. */}
        {!startedLocked(row) && <Link to={`/coach/schedule?edit=${row.id}`} className={linkClass}>Edit in Schedule</Link>}
      </div>
      <EventSummary form={rowToForm(row)} repeat={null} noteProblem={null} squad={squad} />
    </div>
  )
}
