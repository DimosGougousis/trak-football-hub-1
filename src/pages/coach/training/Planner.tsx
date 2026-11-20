import { useTranslation } from '@/lib/i18n'
import { partName, partNote } from '@/lib/training/words'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useWeekRoster } from '@/lib/coach-squad'
import type { EventRow } from '@/lib/coach-events'
import { hasStarted } from '@/lib/event-register'
import { shareableFromRow, squadLabelFrom, whatsAppShareText } from '@/lib/event-share'
import { shareEventText } from '@/lib/share-event'
import { trainingMinutes } from '@/lib/training/sessions'
import { useTrainingEnded } from '@/lib/training/ended'
import { libraryDrill, squadPlayers, type LibraryDrill } from '@/lib/training/library'
import type { PlannerState } from '@/lib/training/plans'
import { partInfo, type PartType } from '@/lib/training/shelf'
import {
  NOTE_MAX, PARTS_MAX, PART_NAME_MAX, candidates, fromLibrary, hasOwnDrills, isStandard, libraryOf, libraryPart, isSameDrill, lastShape, minuteOptions, moveTo, newKey,
  partsFromSaved, partsFromShape, planProblem, partColour, shownFor, standardShape, tagFor, usageOf,
  usualFor, type Part, type PastPlan, type PlanDrill, type Usage,
} from '@/lib/training/parts'
import { gameWhen } from '@/components/coach/games/useGames'
import {
  useBookmarks, useDrafts, usePastSessions, useSaveDraft, useSavePlan, useSquadSize, type Draft, type Plan, type Training,
} from '@/components/coach/training/useTraining'
import { ActionTile, DrillTile, SessionCard, TimeBar, TotalLine } from '@/components/coach/training/PlannerParts'
import { AddPartSheet, MoreDrillsSheet, ViewDrillSheet } from '@/components/coach/training/PlannerSheets'
import { ShareIcon } from '@/components/coach/ShareEventButton'
import type { useLogisticsEdit } from '@/pages/coach/CoachGame'
import { useParked } from '@/components/trak/parked'
import { LoadError } from '@/components/trak'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { Stepper } from '@/components/arc/stepper/stepper'
import { Textarea } from '@/components/arc/textarea/textarea'
import { LoadingSkeleton } from '@/components/trak/LoadingSkeleton'
import { EditIcon, RemoveIcon } from '@/components/trak/IconAction'
import { PlanReview, type ReviewRow } from '@/components/arc/blocks/plan-review/plan-review'

/* TRAK-340 (Training redo 2/5, spec TRAK-338, 2 Nov prototype): Plan session. A plan is a list of parts; the coach goes
   through them one step each, then Review, and saves the plan whole. A new plan starts from the parts the coach saved
   last time, or Trak's five (Kostas, 2 Nov: some coaches don't follow the standard five, so the shape is theirs). Each
   part offers three drills, the usual one picked, plus See more and Write your own. Your session, beside it, is the
   whole session at a glance, where parts are moved, removed and added. A draft keeps it for later, only the
   coach's. Replaces Write my own (TRAK-295). TRAK-392 (Drill Library 7/11): the drills are the Library's, fitted to
   the training's squad; View drill shows one with Easier / Harder, and the level set there is saved with the plan.
   Write your own left with coach-made drills (Kostas, 8 Nov); plans saved before keep their drills as saved.
   TRAK-404 (Kostas, 10 Nov): less on the page. The three choices show names only (View drill has the rest); no
   logistics line, guide lines or "We picked a drill" line; the step bar jumps to any step; × alone removes a part; and
   there's no Save as draft: every change saves the draft by itself, so leaving never asks. TRAK-456 (Imad, 16 Nov): the
   planner is the Training plan tab of a training's page, built like a match's. Its last step is Review & share, the
   match's Review card: the plan's parts at a glance, a pencil each, and Share, which sends the training's details to the
   squad's WhatsApp group as Events does. The plan itself never leaves the coach. A saved plan is changed here too (it
   was a page of its own, TRAK-341). */

const TRAINING_PATH = '/coach/training'
const REVIEW = 'review'
type Logistics = Pick<ReturnType<typeof useLogisticsEdit>, 'open' | 'publish'>

type Start = { parts: Part[]; note: string; at: string; fromShape: boolean; copiedFrom: string | null; dirty: boolean
  /** TRAK-391: what happened to the Library drill sent from its page. */
  added?: { name: string; how: 'added' | 'there' | 'full'; part?: string } }
/** TRAK-456: the page asks the planner to open a part (by its place), or Review & share (null). `n` counts the asks. */
export type PlannerOpen = { part: number | null; n: number }

/** Where the planner starts: a copied plan; a Library drill sent from its page; the draft; the saved plan (at Review &
 *  share); else the coach's last shape or Trak's five. */
function startFrom({ state, saved, draft, past, players, usage }: {
  state: PlannerState; saved: Plan | null; draft: Draft | undefined; past: PastPlan[]; players: number; usage: Usage
}): Start {
  const fresh = () => {
    const shape = lastShape(past)
    return { parts: partsFromShape(shape ?? standardShape(), players, usage), fromShape: !!shape }
  }
  if (state?.copy?.length) {
    const parts = partsFromSaved(state.copy).slice(0, PARTS_MAX)
    return { parts, note: '', at: parts[0].key, fromShape: false, copiedFrom: state.copiedFrom ?? null, dirty: true }
  }
  const library = state?.addLibrary ? libraryDrill(state.addLibrary.drill) : undefined
  if (state?.addLibrary && library) {
    // TRAK-391 (Kostas, 8 Nov): the drill joins the plan, the draft or the coach's usual shape as a new part at the end,
    // then Review. Already in it (the usual shape's starter drill since TRAK-392, or Back from Training after Save as
    // draft): not twice, but that part takes the players and level set on the drill's page. A full plan: said, not cut.
    const { players: setFor, level } = state.addLibrary
    const fromShape = !draft && !saved?.practices.length
    const base = draft ? draft.parts : saved?.practices.length ? partsFromSaved(saved.practices) : fresh().parts
    const note = draft?.note ?? saved?.note ?? ''
    const there = base.findIndex(p => libraryOf(p.drill)?.id === library.id)
    if (there >= 0) {
      const parts = base.map((p, i) => i === there ? { ...p, drill: fromLibrary(library, setFor, level) } : p)
      return { parts, note, at: REVIEW, fromShape, copiedFrom: null, dirty: true, added: { name: library.name, how: 'there', part: base[there].name } }
    }
    const how = base.length >= PARTS_MAX ? 'full' as const : 'added' as const
    const parts = how === 'added' ? [...base, libraryPart(library, setFor, level)] : base
    return { parts, note, at: REVIEW, fromShape, copiedFrom: null, dirty: how === 'added' || fromShape, added: { name: library.name, how } }
  }
  if (draft?.parts.length) {
    const at = draft.step < draft.parts.length ? draft.parts[draft.step].key : REVIEW
    return { parts: draft.parts, note: draft.note, at, fromShape: false, copiedFrom: null, dirty: false }
  }
  if (saved?.practices.length) return { parts: partsFromSaved(saved.practices), note: saved.note, at: REVIEW, fromShape: false, copiedFrom: null, dirty: false }
  const { parts, fromShape } = fresh()
  return { parts, note: '', at: parts[0]?.key ?? REVIEW, fromShape, copiedFrom: null, dirty: false }
}

/** Reads what the planner needs before it starts: drafts, the coach's past plans, and how many players the training's
 *  squad has (TRAK-392: the drills are fitted to it; unknown, they're fitted to 15). */
export function Planner({ training, saved, open, logistics }: {
  training: Training & EventRow; saved: Plan | null; open: PlannerOpen | null
  /** The page's Logistics edit (TRAK-331): Review & share's Logistics part opens it, and publishes a draft. */
  logistics: Logistics
}) {
  const { t } = useTranslation()
  const drafts = useDrafts()
  const past = usePastSessions()
  const size = useSquadSize(training.squad)
  const reads = [drafts, past]
  if (reads.some(r => r.error)) return <div className="pt-10"><LoadError what={t('coachTraining:yourPlansWhat')}
    onRetry={() => reads.forEach(r => void r.refetch())} retrying={reads.some(r => r.isFetching)} /></div>
  if (reads.some(r => r.isPending) || size.isPending) return <LoadingSkeleton label={t('coachTraining:loadingPlans')} rows={2} className="pt-6" />
  const pastPlans: PastPlan[] = (past.data ?? []).filter(s => s.id !== training.id).map(s => ({ day: gameWhen(s).day, practices: s.practices }))
  return <PlannerBody training={training} saved={saved} draft={drafts.data!.get(training.id)} past={pastPlans} players={squadPlayers(size.data)}
    open={open} logistics={logistics} />
}

function PlannerBody({ training, saved, draft, past, players, open, logistics }: {
  training: Training & EventRow; saved: Plan | null; draft: Draft | undefined; past: PastPlan[]; players: number; open: PlannerOpen | null
  logistics: Logistics
}) {
  const { parked, comingSoon } = useParked()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const usage = useMemo(() => usageOf(past), [past])
  const [start] = useState(() => startFrom({ state: location.state as PlannerState, saved, draft, past, players, usage }))
  const [parts, setPartsRaw] = useState(start.parts)
  const [note, setNote] = useState(start.note)
  const [at, setAt] = useState(start.at)
  const [dirty, setDirty] = useState(start.dirty)
  // Opened from Review & share to change one part: Back to Review & share, not Next.
  const [fromReview, setFromReview] = useState(start.at === REVIEW && !!saved)
  const [sheet, setSheet] = useState<'add' | 'more' | null>(null)
  const [viewing, setViewing] = useState<LibraryDrill | null>(null)
  const bookmarks = useBookmarks().data ?? []
  const [renaming, setRenaming] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const savePlan = useSavePlan(training.id)
  const saveDraft = useSaveDraft(training.id)
  const length = trainingMinutes(training)

  const setParts = (next: Part[]) => { setPartsRaw(next); setDirty(true); setProblem(null) }
  // TRAK-456: the page's Review & share, and Who's here's Change it myself, open a step from outside.
  const [seen, setSeen] = useState<number>()
  if (open && open.n !== seen) {
    setSeen(open.n)
    const key = open.part == null ? REVIEW : parts[open.part]?.key ?? REVIEW
    setAt(key)
    setFromReview(key !== REVIEW)
  }
  const step = at === REVIEW ? parts.length : Math.max(0, parts.findIndex(p => p.key === at))
  const part = at === REVIEW ? null : parts[step] ?? null
  const all = useMemo(() => part ? candidates(part.type, players) : [], [part?.type, players]) // eslint-disable-line react-hooks/exhaustive-deps -- by the part's type
  const update = (key: string, change: Partial<Part>) => setParts(parts.map(p => p.key === key ? { ...p, ...change } : p))
  const go = (index: number) => { setRenaming(null); setAt(index >= parts.length ? REVIEW : parts[index].key); document.scrollingElement?.scrollTo?.(0, 0) }

  const remove = (index: number) => {
    const gone = parts[index]
    const next = parts.filter((_, i) => i !== index)
    setParts(next)
    if (gone.key === at) setAt(next[Math.min(index, next.length - 1)]?.key ?? REVIEW)
    toast(t('coachTraining:removed', { name: partName(gone.name) }), { action: { label: t('coachTraining:undo'), onClick: () => {
      setPartsRaw(list => list.some(p => p.key === gone.key) ? list : [...list.slice(0, index), gone, ...list.slice(index)])
    } } })
  }
  const add = (type: PartType, name: string) => {
    if (parts.length >= PARTS_MAX) { setSheet(null); return setProblem(t('coachTraining:planMax', { max: PARTS_MAX })) }
    const part: Part = { key: newKey(), type, name, minutes: partInfo(type).mins, drill: usualFor(type, candidates(type, players), usage) }
    setParts([...parts, part])
    setSheet(null)
    // From Review, the new part opens to pick its drill, then comes back.
    if (at === REVIEW) { setFromReview(true); setAt(part.key) }
  }
  const pick = (drill: PlanDrill) => { if (part) update(part.key, { drill }); setSheet(null); setViewing(null) }
  const toStandard = () => {
    const next = partsFromShape(standardShape(), players, usage)
    setParts(next)
    setAt(next[0].key)
  }

  // TRAK-404 (Kostas, 10 Nov): every change saves the draft by itself, a moment after the coach stops; not once the plan
  // itself is being saved.
  const autosave = !parked
  const [drafted, setDrafted] = useState(false)
  const done = useRef(false)
  const latest = useRef({ step, parts, note })
  latest.current = { step, parts, note }
  const keepDraft = useRef(() => {})
  keepDraft.current = () => {
    if (!autosave || done.current) return
    saveDraft.mutate(latest.current, { onSuccess: () => setDrafted(true), onError: () => setProblem(t('coachTraining:planSaveFailed')) })
  }
  const pending = useRef(false)
  useEffect(() => {
    if (!autosave || !dirty) return
    setDrafted(false)
    pending.current = true
    const timer = setTimeout(() => { pending.current = false; keepDraft.current() }, 800)
    return () => clearTimeout(timer)
  }, [parts, note, step, dirty, autosave])
  // Leaving within that moment still keeps the change.
  useEffect(() => () => { if (pending.current) keepDraft.current() }, [])

  const save = () => {
    if (parked) return comingSoon()
    const why = planProblem(parts)
    if (why) return setProblem(why)
    done.current = true
    savePlan.mutate({ parts, note }, {
      onSuccess: () => {
        toast.success(t('coachTraining:planSaved'))
        // Training, which offers the next one to plan.
        navigate(TRAINING_PATH, { replace: true, state: { savedPlan: training.id } })
      },
      onError: error => { done.current = false; setProblem('code' in error && error.code === 'P0001' ? `${error.message}.` : t('coachTraining:planSaveFailed')) },
    })
  }
  const leave = () => navigate(TRAINING_PATH)

  const steps = [...parts.map(p => ({ id: p.key, label: partName(p.name) })), { id: REVIEW, label: t('coachMatches:reviewShare') }]

  // The page's header holds the training's name, when and where (TRAK-456), so the tab starts at its steps.
  return <div className="grid gap-6 laptop:gap-8 pt-4">
    {start.added && <p role="status" className={`rounded-xl px-4 py-3 text-sm ${start.added.how === 'full' ? 'bg-warning/15 text-ink' : 'bg-raised text-ink-2'}`}>
      {start.added.how === 'added' ? t('coachTraining:addedAtEnd', { name: start.added.name })
        : start.added.how === 'there' ? t('coachTraining:alreadyIn', { name: start.added.name, part: start.added.part ? partName(start.added.part) : '' })
        : t('coachTraining:notAddedFull', { name: start.added.name, max: PARTS_MAX })}</p>}
    {start.copiedFrom && <p role="status" className="rounded-xl bg-raised px-4 py-3 text-sm text-ink-2">
      {t('coachTraining:copiedFrom', { from: start.copiedFrom })}</p>}
    <div className="arc"><Stepper label={t('coachTraining:planningSteps')} steps={steps} current={step} onStepSelect={go} jumpAhead /></div>
    {problem && <p role="alert" className="text-[15px] text-danger">{problem}</p>}

    <div className={`grid gap-6 laptop:gap-8 ${part ? 'laptop:grid-cols-[minmax(0,1fr)_360px] laptop:items-start' : ''}`}>
      {part ? <section aria-label={partName(part.name)} className="arc grid min-w-0 gap-5 rounded-2xl border border-line bg-surface p-5 laptop:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid min-w-0 gap-1">
            <p className="text-[11px] font-medium uppercase tracking-[.09em] text-brand">{t('coachTraining:partOf', { n: step + 1, total: parts.length, note: partNote(part.type) })}</p>
            {renaming !== null ? <form className="flex flex-wrap items-end gap-2" onSubmit={e => {
              e.preventDefault()
              if (renaming.trim()) update(part.key, { name: renaming.trim().slice(0, PART_NAME_MAX) })
              setRenaming(null)
            }}>
              <div className="w-[260px]"><Input label={t('coachTraining:newPartName')} value={renaming} maxLength={PART_NAME_MAX} autoFocus
                onChange={e => setRenaming(e.target.value)} /></div>
              <Button size="sm" type="submit">{t('coachTraining:saveName')}</Button>
              <Button size="sm" variant="secondary" type="button" onClick={() => setRenaming(null)}>{t('coachSchedule:cancel')}</Button>
            </form> : <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[22px] font-medium text-ink break-words">{partName(part.name)}</h2>
              <EditIcon label={t('coachTraining:rename')} onClick={() => setRenaming(partName(part.name))} className="-my-2.5" />
            </div>}
          </div>
          {/* As the mockup: "How long?" on the same line as its minutes. */}
          <div className="flex flex-wrap items-center gap-2">
            <p id="how-long" className="text-sm font-medium text-ink-2">{t('coachTraining:howLong')}</p>
            <div role="group" aria-labelledby="how-long" className="flex flex-wrap gap-1.5">
              {minuteOptions(part.type, part.minutes).map(m => <button key={m} type="button" aria-pressed={part.minutes === m}
                onClick={() => update(part.key, { minutes: m })}
                className={`min-h-9 rounded-full border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${part.minutes === m ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-ink-2 hover:bg-raised'}`}>{m} min</button>)}
            </div>
          </div>
        </div>
        <div className="grid gap-3">
          <ul aria-label={t('coachTraining:drillsFor', { part: partName(part.name) })} className="grid gap-3 tablet:grid-cols-2 laptop:grid-cols-4">
            {shownFor(part.type, part.drill, all, usage).map(d => {
              const lib = libraryOf(d)
              // The tiles in a row share one height, so their View drill links line up.
              return <li key={`${d.source}:${d.trak_drill ?? d.drill_id ?? d.name}`} className="grid grid-rows-[1fr_auto] gap-1">
                <DrillTile drill={d} picked={isSameDrill(d, part.drill)} tag={tagFor(d, part.type, all, usage, bookmarks)} onPick={() => pick(d)} />
                {lib && <button type="button" aria-label={t('coachTraining:viewDrillNamed', { name: lib.name })} onClick={() => setViewing(lib)}
                  className="justify-self-start rounded px-1 py-1 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{t('coachTraining:viewDrill')}</button>}
              </li>
            })}
            {/* TRAK-404 (Kostas, 10 Nov): a fourth choice, any drill from the Drill Library. */}
            <li className="grid grid-rows-[1fr_auto] gap-1"><ActionTile icon="search" label={t('coachTraining:findAnother')} onClick={() => setSheet('more')} />
              {/* As tall as a View drill link, so this tile ends level with the others. */}
              <span aria-hidden className="invisible px-1 py-1 text-sm">{t('coachTraining:viewDrill')}</span></li>
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {fromReview ? <>
            <DraftNote saving={saveDraft.isPending} saved={drafted} />
            <span className="flex-1" />
            <RemoveButton name={partName(part.name)} onRemove={() => remove(step)} />
            <Button onClick={() => { setFromReview(false); go(parts.length) }}>{t('coachTraining:backToReview')}<ArrowRight aria-hidden size={16} /></Button>
          </> : <>
            <Button variant="secondary" onClick={() => step === 0 ? leave() : go(step - 1)}>{step === 0 ? t('coachSchedule:cancel') : t('common:back')}</Button>
            <DraftNote saving={saveDraft.isPending} saved={drafted} />
            <span className="flex-1" />
            <RemoveButton name={partName(part.name)} onRemove={() => remove(step)} />
            <Button onClick={() => go(step + 1)}>{t('coachTraining:nextNamed', { name: step + 1 < parts.length ? partName(parts[step + 1].name) : t('coachMatches:reviewShare') })}<ArrowRight aria-hidden size={16} /></Button>
          </>}
        </div>
      </section> : <ReviewShare training={training} parts={parts} length={length} note={note} onNote={value => { setNote(value); setDirty(true) }}
        onEdit={i => { setFromReview(true); go(i) }} onAdd={() => setSheet('add')} onBack={() => parts.length ? go(parts.length - 1) : leave()} onSave={save}
        saving={savePlan.isPending} draftNote={autosave ? <DraftNote saving={saveDraft.isPending} saved={drafted} /> : null} logistics={logistics} />}

      {/* TRAK-456: Review & share is one card, as a match's; Your session sits beside each part. */}
      {part && <SessionCard parts={parts} length={length} current={part.key} onOpen={key => setAt(key)} onReorder={setParts}
        onMove={(i, by) => setParts(moveTo(parts, i, i + by))} onRemove={remove} onAdd={() => setSheet('add')} onStandard={toStandard}
        fromShape={start.fromShape && !dirty} standard={isStandard(parts)} />}
    </div>

    <AddPartSheet open={sheet === 'add'} onClose={() => setSheet(null)} onAdd={add} />
    <MoreDrillsSheet part={sheet === 'more' ? part : null} players={players} usage={usage} bookmarks={bookmarks} onClose={() => setSheet(null)}
      onPick={pick} />
    <ViewDrillSheet drill={viewing} part={part} players={players} onClose={() => setViewing(null)} onUse={pick} />
  </div>
}

/** The last step, Review & share (TRAK-456), as a match's: Arc's Review card with the plan's parts at a glance, a pencil
 *  each, the Logistics first (Share needs the training published). In the card, how long it runs, the coach's note,
 *  Share and Save the plan. A saved plan opens here. */
function ReviewShare({ training, parts, length, note, onNote, onEdit, onAdd, onBack, onSave, saving, draftNote, logistics }: {
  training: Training & EventRow; parts: Part[]; length: number | null; note: string; onNote: (note: string) => void
  onEdit: (index: number) => void; onAdd: () => void; onBack: () => void; onSave: () => void; saving: boolean; draftNote: ReactNode; logistics: Logistics
}) {
  const { t } = useTranslation()
  const rows: ReviewRow[] = [
    { id: 'logistics', label: t('coachMatches:actLogistics'), status: training.published ? 'good' : 'risk', onEdit: logistics.open ?? undefined },
    // Its drill, unless the part is named after it (a plan from before parts), and its minutes.
    ...parts.map((part, i): ReviewRow => ({ id: part.key, label: partName(part.name), status: part.drill ? 'good' : 'watch', onEdit: () => onEdit(i),
      detail: [!part.drill ? t('coachTraining:noDrillYet') : part.drill.name !== part.name ? part.drill.name : null,
        t('coachHome:minutes', { count: part.minutes })].filter(Boolean).join(' · ') })),
  ]
  const incomplete = rows.filter(row => row.status !== 'good').length
  // TRAK-493: once the training is over the countdown says "Finished", never "Started".
  const ended = useTrainingEnded(training)
  return <div className="arc min-w-0">
    <PlanReview title={t('coachTraining:reviewTitle')} footerId="plan-share" rows={rows}
      band={incomplete ? { status: training.published ? 'watch' : 'risk', label: t('coachMatches:incompleteCount', { count: incomplete }) }
        : { status: 'good', label: t('coachTraining:readyBadge') }}
      countdown={{ label: t('coachTraining:startsIn'), end: training.starts_at, completeLabel: t(ended ? 'coachTraining:finished' : 'coachTraining:started') }}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1"><TimeBar parts={parts} length={length} /></div>
        <TotalLine parts={parts} length={length} />
      </div>
      <div><Button size="sm" variant="secondary" onClick={onAdd}><Plus aria-hidden size={16} />{t('coachTraining:addAPart')}</Button></div>
      {/* Kostas, 30 Oct: one optional note at the end, not one per drill. */}
      <Textarea label={t('coachTraining:noteForYou')} rows={2} maxLength={NOTE_MAX}
        value={note} onChange={e => onNote(e.target.value)} placeholder={t('coachTraining:noteForYouEx')} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onBack}>{t('common:back')}</Button>
        {draftNote}
        <span className="flex-1" />
        <TrainingShare training={training} publish={logistics.publish} />
        <Button loading={saving} onClick={onSave}>{t('coachTraining:savePlan')}</Button>
      </div>
    </PlanReview>
  </div>
}

/** Share: the training's details for the squad's WhatsApp group, as Events' Share (J8.16, TRAK-168): the squad's name,
 *  no child's, and never the plan. A draft is published first; once it has started there is nothing to tell. */
function TrainingShare({ training, publish }: { training: Training & EventRow; publish: Logistics['publish'] }) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const roster = useWeekRoster(user?.id)
  if (!training.published) return <Button variant="secondary" loading={publish.isPending} onClick={() => publish.mutate()}>{t('coachHome:publish')}</Button>
  if (hasStarted(training) || !roster.data) return null
  // As the event sheet's Share: an event for one squad names that squad; null is the whole roster.
  const rows = roster.data.filter(p => training.squad == null || p.age_group?.trim() === training.squad)
  const text = whatsAppShareText(shareableFromRow(training, squadLabelFrom(rows)), { childNames: rows.map(p => p.player_name ?? '').filter(Boolean) })
  return <Button variant="secondary" onClick={() => shareEventText(text)}><ShareIcon size={16} tight />{t('coachSchedule:share')}</Button>
}

/** TRAK-404: says quietly that the draft saved itself. */
function DraftNote({ saving, saved }: { saving: boolean; saved: boolean }) {
  const { t } = useTranslation()
  return <span role="status" className="text-sm text-ink-3">{saving ? t('coachTraining:savingDraft') : saved ? t('coachSchedule:draftSaved') : ''}</span>
}

/** TRAK-404 (Kostas, 10 Nov): an icon alone removes a part; its name is still read out. TRAK-455: a bin, not an ×. */
function RemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  const { t } = useTranslation()
  return <RemoveIcon label={t('coachTraining:removeNamed', { name })} onClick={onRemove} className="rounded-full" />
}
