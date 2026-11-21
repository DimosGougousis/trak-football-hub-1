import { i18n, useTranslation } from '@/lib/i18n'
import { lineWord, positionsShown } from '@/lib/position-words'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureState } from '@/components/trak/parked'
import { DEFAULT_FORMATION, FORMATIONS, FORMATS, lineName, slotsOf } from '@/lib/games/formations'
import { Undo2, X } from 'lucide-react'
import { fitFormat, followPosition, moveTo, playerPlan, type LineUpDrop, type PlayerPlan, type PlayerPlans } from '@/lib/games/lineup'
import type { PlanForm } from '@/lib/games/plan'
import { fitOf, slotPosition } from '@/lib/squad/formation-board'
import { useIsMobile } from '@/hooks/use-mobile'
import { usePlayerRoles } from '@/components/coach/squad/usePlayerRoles'
import { DragGhost } from '@/components/coach/squad/formations/FormationBoard'
import { usePointerSwap } from '@/components/coach/squad/formations/usePointerSwap'
import type { Candidate, useWhoCanCome } from './useGames'
import { ListFace, MarkersKey, Pitch, type LineUpSpot, type PitchPlayer } from './Pitch'
import { PlayerPanel, type Target } from './PlayerPanel'
import { LoadError } from '@/components/trak'
import { Alert } from '@/components/arc/alert/alert'
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet'
import { MorphSelect } from '@/components/arc/morph-select/morph-select'
import { shapeItems } from '@/lib/games/shape-items'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'

/* TRAK-285 (Games 3/8): plan step 2, line-up and jobs (TRAK-282; the mockup's Squad step merged in, Imad 27 Oct).    coach picks a format and a formation, places players who can come, and gives each a job and a note. Off the pitch,
   a player is on the bench unless the coach leaves them out (Imad, 28 Oct). The sheet is a bottom sheet on a phone,
   and a panel beside the pitch on a tablet or laptop, where the pitch stays in view. TRAK-287: locked at kick-off, the
   pitch and the sheet only show what was planned. TRAK-329 (Imad, 2 Nov): format and formation are one Arc morph
   select on the pitch's top left, a header per format, so a shape in another format switches the format.
   TRAK-358 (Season plan 10/18, spec TRAK-348): Formations' pitch, with Bench and Not selected as tabs beside it
   (under it on a tablet and a phone). A player drags onto a place, a face or a tab; tapping a place still picks who
   plays there, and tapping a face opens their sheet. Placed outside their position and Can also play, a player gets
   Out of position ticked; moved back, it goes, unless the coach ticked it. Everyone's job went: the faces carry the
   markers, and Review & share counts the starters with a job. TRAK-359 (Tarek, 3 Nov): a third tab, Not attending.
   Everyone is coming unless they're there. A family's "Can't make it" puts the child there, flagged, and the database
   keeps them there until the family undoes it; a report that comes after the coach placed them only flags them. */

const card = 'grid min-w-0 content-start gap-4 rounded-2xl border border-line bg-surface p-5'
/** A tab's name with its count under it, so three tabs fit the card on a phone and beside the pitch. The name is still
 *  "Bench · 6" to a screen reader. */
const TabLabel = ({ name, count }: { name: string; count: number }) =>
  <span className="grid justify-items-center leading-tight"><span>{name} </span><span className="text-xs">· {count}</span></span>
type List = 'bench' | 'not_selected' | 'not_attending'
const LISTS = { 'list:bench': 'bench', 'list:not_selected': 'not_selected', 'list:not_attending': 'not_attending' } as const

/** TRAK-360: the formation last copied into this match, and how many of its starters weren't coming or were skipped. */
export type FormationCopy = { name: string; format: number | null; notComing: number; skipped: number; byDefault: boolean }

export function LineUpAndJobs({ form, onFormChange, who, locked = false, copy = null }: {
  form: PlanForm; onFormChange: (form: PlanForm) => void; who: ReturnType<typeof useWhoCanCome>; locked?: boolean; copy?: FormationCopy | null
}) {
  const { user } = useAuth()
  const { t } = useTranslation()
  // TRAK-358: Can also play, so a placement outside it ticks Out of position.
  const roles = usePlayerRoles(user?.id)
  const phone = useIsMobile()
  const seasonPlan = useFeatureState('season_plan')
  const [target, setTarget] = useState<Target | null>(null)
  const [list, setList] = useState<List>('bench')
  // TRAK-513: Formations' Undo. Each move (a drag, a placement, a shape, a list) is a step back; typing a job isn't.
  const [history, setHistory] = useState<Pick<PlanForm, 'format' | 'formation' | 'players'>[]>([])
  const shape = form.formation ?? DEFAULT_FORMATION[form.format]
  const plan = (player: Candidate) => playerPlan(form.players, player.id)
  const familyReported = (id: string) => playerPlan(form.players, id).role === 'not_attending' && !!who.players.find(player => player.id === id)?.absent
  const inSlot = (slot: number) => who.players.find(player => plan(player).role === 'starter' && plan(player).slot === slot)

  /** Whether a plan stands outside the player's position and Can also play, on `on`'s places. */
  const outOn = (on: string) => (id: string, at: PlayerPlan) => {
    const player = who.players.find(candidate => candidate.id === id)
    return !!player && at.role === 'starter' && at.slot != null && at.slot <= slotsOf(on).length
      && fitOf({ id, position: player.position, also: roles.of(id).also }, slotPosition(on, at.slot)) === 'out'
  }
  const where = (players: PlayerPlans) => JSON.stringify(Object.keys(players).sort().map(id => [id, players[id].role, players[id].slot]))
  const remember = () => setHistory(was => [...was, { format: form.format, formation: form.formation, players: form.players }])
  const setPlayers = (players: PlayerPlans) => {
    if (where(players) !== where(form.players)) remember()
    onFormChange({ ...form, players: followPosition(form.players, players, outOn(shape), outOn(shape)) })
  }
  // A shape's lines add up to its format less the keeper, so each shape belongs to one format.
  const setShape = (formation: string) => {
    const format = FORMATS.find(size => FORMATIONS[size].includes(formation)) ?? form.format
    remember()
    onFormChange({ ...form, format, formation, players: followPosition(form.players, fitFormat(form.players, format), outOn(shape), outOn(formation)) })
  }
  // Undo puts everyone back where they stood and the shape back; what was typed since (jobs, notes) stays.
  const undo = () => {
    const last = history.at(-1)
    if (!last) return
    setHistory(was => was.slice(0, -1))
    const back = Object.fromEntries([...new Set([...Object.keys(last.players), ...Object.keys(form.players)])].map(id => {
      const then = playerPlan(last.players, id), now = form.players[id]
      return [id, now ? { ...now, role: then.role, slot: then.slot } : then]
    }))
    const lastShape = last.formation ?? DEFAULT_FORMATION[last.format]
    onFormChange({ ...form, format: last.format, formation: last.formation, players: followPosition(form.players, back, outOn(shape), outOn(lastShape)) })
  }
  // A drag: from a place or a face, onto a place, a face, or a list's tab or panel.
  const swap = usePointerSwap<LineUpSpot>((from, to) => {
    const id = from.startsWith('slot:') ? inSlot(Number(from.slice(5)))?.id : from.startsWith('player:') ? from.slice(7) : undefined
    // The database keeps a family-reported child in Not attending, so a drag doesn't try.
    if (!id || locked || familyReported(id)) return
    const where: LineUpDrop = to.startsWith('slot:') ? { kind: 'slot', slot: Number(to.slice(5)) }
      : to.startsWith('player:') ? { kind: 'player', id: to.slice(7) } : { kind: 'list', role: LISTS[to as keyof typeof LISTS] ?? 'bench' }
    const next = moveTo(form.players, id, where)
    if (next === form.players) return
    setPlayers(next)
    // Beside the pitch, the sheet follows the player just moved, as picking them for a place does.
    if (!phone) setTarget({ kind: 'player', id })
  })
  const drag = locked ? null : swap

  if (who.error || roles.isError) return <LoadError what={t('coachMatches:whoCanComeWhat')} onRetry={() => { who.retry(); void roles.refetch() }} />
  if (who.isPending || roles.isPending) return <LoadingSkeleton label={t('coachMatches:loadingWhoCanCome')} lines={1} avatar rows={4} className="pt-6" />

  const starters = new Map<number, PitchPlayer>()
  for (const player of who.players) {
    const { role, slot } = plan(player)
    if (role === 'starter' && slot != null && slot <= form.format) starters.set(slot, { ...player, plan: plan(player) })
  }
  const placed = new Set([...starters.values()].map(player => player.id))
  // Everyone is coming unless they're in Not attending, and on the bench unless they're on the pitch or left out. A
  // family's "Can't make it" is a flag on the face, wherever the child is.
  const bench = who.players.filter(player => !['not_selected', 'not_attending'].includes(plan(player).role) && !placed.has(player.id))
  const leftOut = who.players.filter(player => plan(player).role === 'not_selected')
  const notComing = who.players.filter(player => plan(player).role === 'not_attending')
  const title = target?.kind === 'slot' ? t('coachMatches:slotTitle', { line: lineWord(lineName(shape, target.slot)), slot: target.slot })
    : who.players.find(player => target && player.id === target.id)?.name ?? t('nav:player')
  const panel = target && <PlayerPanel target={target} players={form.players} onPlayers={setPlayers} candidates={who.players}
    shape={shape} onTarget={setTarget} locked={locked} />
  const open = (player: Candidate) => setTarget({ kind: 'player', id: player.id })
  const opened = (player: Candidate) => target?.kind === 'player' && target.id === player.id
  const detail = (player: Candidate) => `${player.shirt != null ? `#${player.shirt} · ` : ''}${positionsShown(player.position, roles.of(player.id).also)}`
  const faces = (players: Candidate[], words: 'bench' | 'not selected' | 'not attending') =>
    <ul role="group" aria-label={words === 'bench' ? t('coachSquad:fmBench') : words === 'not selected' ? t('coachMatches:notSelected') : t('coachMatches:notAttending')} className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 p-0">
      {players.map(player => <li key={player.id}>
        <ListFace player={player} plan={plan(player)} list={words} detail={detail(player)} on={opened(player)} onOpen={() => open(player)} swap={drag} />
      </li>)}
    </ul>
  // While a drag is over a tab or its panel, it lights up; each is a drop target until kick-off.
  const dropOn = (spot: LineUpSpot) => (drag ? { 'data-spot': spot } : {})
  const lit = (spot: LineUpSpot) => (drag?.drag?.over === spot ? 'ring-2 ring-brand' : '')

  const filled = starters.size, total = slotsOf(shape).slice(0, form.format).length
  const offPitch = <section aria-label={t('coachMatches:offThePitch')} className="arc grid min-w-0 content-start gap-3">
    {/* min-w-0: three tabs are wider than a phone's card, and the tab list scrolls within it rather than the page. */}
    <Tabs className="min-w-0" value={list} onValueChange={value => setList(value as List)}>
      <TabsList aria-label={t('coachMatches:offThePitch')}>
        <TabsTrigger value="bench" {...dropOn('list:bench')} className={`!min-w-0 !px-2 laptop:!px-1 laptop:!text-[13px] ${lit('list:bench')}`}><TabLabel name={t('coachSquad:fmBench')} count={bench.length} /></TabsTrigger>
        <TabsTrigger value="not_selected" {...dropOn('list:not_selected')} className={`!min-w-0 !px-2 laptop:!px-1 laptop:!text-[13px] ${lit('list:not_selected')}`}><TabLabel name={t('coachMatches:notSelected')} count={leftOut.length} /></TabsTrigger>
        <TabsTrigger value="not_attending" {...dropOn('list:not_attending')} className={`!min-w-0 !px-2 laptop:!px-1 laptop:!text-[13px] ${lit('list:not_attending')}`}><TabLabel name={t('coachMatches:notAttending')} count={notComing.length} /></TabsTrigger>
      </TabsList>
      {/* Both panels stay mounted, so a tab is never mid-animation when a drag lands; the other is hidden. The grid
          is inside each panel: a display class on the panel itself would override `hidden` and show both. */}
      <TabsContent value="bench" forceMount hidden={list !== 'bench'} {...dropOn('list:bench')} className={`rounded-xl ${lit('list:bench')}`}>
        {bench.length === 0
          ? <p className="text-sm text-ink-2">{starters.size + leftOut.length + notComing.length > 0 ? t('coachMatches:nobodyBench')
            : seasonPlan.on ? t('coachMatches:nobodySquad') : t('coachMatches:nobodyCanCome')}</p>
          : faces(bench, 'bench')}
      </TabsContent>
      <TabsContent value="not_selected" forceMount hidden={list !== 'not_selected'} {...dropOn('list:not_selected')} className={`rounded-xl ${lit('list:not_selected')}`}>
        <div className="grid gap-3">
        <p className="text-sm text-ink-3">{t('coachMatches:notSelectedNote')}</p>
        {leftOut.length === 0
          ? <p className="text-sm text-ink-2">{locked ? t('coachMatches:nobodyLeftOutLocked') : t('coachMatches:nobodyLeftOut')}</p>
          : faces(leftOut, 'not selected')}
        </div>
      </TabsContent>
      <TabsContent value="not_attending" forceMount hidden={list !== 'not_attending'} {...dropOn('list:not_attending')} className={`rounded-xl ${lit('list:not_attending')}`}>
        <div className="grid gap-3">
        <p className="text-sm text-ink-3">{t('coachMatches:notAttendingNote')}</p>
        {notComing.length === 0
          ? <p className="text-sm text-ink-2">{locked ? t('coachMatches:nobodyMarked') : t('coachMatches:everyoneComing')}</p>
          : faces(notComing, 'not attending')}
        </div>
      </TabsContent>
    </Tabs>
  </section>

  return (
    <div className="grid gap-4">
      {copy && <div className="arc"><Alert tone="info" title={copy.byDefault ? t('coachMatches:copyLoaded', { name: copy.name, count: copy.format ?? form.format }) : t('coachMatches:copiedFrom', { name: copy.name })}>
        {[copy.notComing > 0 && t('coachMatches:copyNotComing', { count: copy.notComing }),
          copy.skipped > 0 && t('coachMatches:copySkipped', { count: copy.skipped })].filter(Boolean).join(' ')}</Alert></div>}
      {/* TRAK-513 (Imad, 20 Nov): the same pitch, bench and controls as Squad › Formations, in one card: the format and
          shape above, the pitch on the left with the key, the count and Undo under it, and Bench, Not selected and Not
          attending on the right (under the pitch on a phone; beside it on a tablet too, where the sheet did). A selected player's job, context and
          expectation take the right column's place on a laptop, the pitch staying in view; a phone opens a sheet. */}
      <section aria-labelledby="plan-pitch" className={`${card} laptop:p-6`}>
        {locked ? <h2 id="plan-pitch" className="text-lg font-medium text-ink">{shape}</h2>
          : <>
            <h2 id="plan-pitch" className="sr-only">{shape}</h2>
            <div className="tablet:max-w-sm"><span className="arc"><MorphSelect label={t('coachSquad:fmFormatAndShape')} items={shapeItems()} value={shape} onValueChange={setShape}
              searchable={false} panelWidth={200} /></span></div>
          </>}
        <div className="grid gap-5 tablet:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] tablet:items-start">
          {/* On a laptop the pitch stays pinned under the match header's tabs, capped to the screen's height, so a drop
              onto a long list's tab still finds it (TRAK-323, TRAK-358). */}
          <div className="grid gap-3 laptop:sticky laptop:top-[calc(var(--ph-pinned,0px)+1rem)]">
            <Pitch shape={shape} format={form.format} starters={starters} swap={drag} className="laptop:max-w-[min(460px,calc((100dvh_-_var(--ph-pinned,0px)_-_20rem)*0.8))]"
              selected={target?.kind === 'slot' ? target.slot : target ? playerPlan(form.players, target.id).slot : null}
              onSelect={slot => setTarget(starters.has(slot) ? { kind: 'player', id: starters.get(slot)!.id } : { kind: 'slot', slot })} />
            <DragGhost drag={drag?.drag ?? null} />
            <MarkersKey />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-2">
              <span>{filled === total ? t('coachSquad:fmStartersBench', { starters: filled, bench: bench.length })
                : t('coachSquad:fmStartersPartial', { filled, total, count: total - filled, bench: bench.length })}</span>
              {!locked && <button type="button" onClick={undo} disabled={!history.length}
                className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-brand disabled:text-ink-3 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <Undo2 size={16} aria-hidden="true" />{t('coachSquad:fmUndo')}</button>}
            </div>
          </div>
          {/* The selected player's sheet tops the right column; the lists stay under it, so a face can still be dragged
              onto Bench, Not selected or Not attending while it's open. */}
          <div className="grid min-w-0 content-start gap-5">
            {!phone && target && <aside aria-label={title} className="grid min-w-0 content-start gap-4 rounded-xl border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-medium text-ink">{title}</h2>
                <button type="button" onClick={() => setTarget(null)} aria-label={t('coachMatches:closePlayer')}
                  className="grid size-10 shrink-0 place-items-center rounded-md text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X size={18} aria-hidden="true" /></button>
              </div>
              {panel}
            </aside>}
            {offPitch}
          </div>
        </div>
      </section>
      {phone && <BottomSheet className="arc" open={!!target} onOpenChange={next => { if (!next) setTarget(null) }} title={title} detents={[0.6, 0.92]}>{panel}</BottomSheet>}
    </div>
  )
}
