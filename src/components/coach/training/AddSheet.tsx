import { useEffect, useState } from 'react'
import { ChevronLeft, PenLine } from 'lucide-react'
import {
  LIBRARIES, SESSIONS, ageBandOf, ageLabel, forAge, kitItem, libraryOf, libraryOrder, searchLibrary, sessionLine, titleParts,
  type LibrarySession,
} from '@/lib/library/library'
import { ON_LIBRARY } from '@/lib/fixed-colours'
import { searchDrills, type Drill } from '@/lib/training/sessions'
import { bestFit, fromDrill, fromLibrary, type Practice } from '@/lib/training/plans'
import { PitchArt } from '@/components/library/LibraryArt'
import { SessionHeading } from '@/pages/coach/library/parts'
import { LoadError } from '@/components/trak'
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet'
import { Badge } from '@/components/arc/badge/badge'
import { Button } from '@/components/arc/button/button'
import { SearchField } from '@/components/arc/search-field/search-field'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { useDrills } from './useTraining'

/* TRAK-296 (Training 3/5, spec TRAK-293, mockup board 4B): add a practice to a plan, or swap one, from one sheet with
   three views: Write my own · My drills · Library. My drills puts the best fit for the slot first (the minutes
   closest to it). A Library session previews here, so the coach never leaves the plan, and nothing links out of
   Trak. */

export type AddView = 'write' | 'drills' | 'library'
/** What the sheet is for: a new practice at the end, or swapping practice `index`. `minutes` is the slot's, if known. */
export type AddTarget = { view: AddView; swap: { index: number; practice: Practice } | null; minutes: number | null }

const VIEWS = [{ value: 'write', label: 'Write my own' }, { value: 'drills', label: 'My drills' }, { value: 'library', label: 'Library' }]
const LIST_MAX = 30

export function AddSheet({ target, onClose, when, squad, inPlan, onUse, onWrite }: {
  target: AddTarget | null
  onClose: () => void
  /** The training's day, for the sheet's top line. */
  when: string
  /** The training's squad, for the Library's age group. */
  squad: string | null
  /** The coach's drills already in the plan. */
  inPlan: Set<string>
  onUse: (practice: Practice) => void
  onWrite: () => void
}) {
  const [view, setView] = useState<AddView>('drills')
  // Each opening starts on the view it was opened for.
  useEffect(() => { if (target) setView(target.view) }, [target])

  const swap = target?.swap ?? null
  const minutes = target?.minutes ?? null
  const title = swap ? `Swap “${swap.practice.name}”` : 'Add a practice'
  const where = [when, swap ? `practice ${swap.index + 1}` : null, minutes ? `about ${minutes} min` : null].filter(Boolean).join(' · ')

  return <BottomSheet className="arc" open={!!target} onOpenChange={open => { if (!open) onClose() }} detents={[0.92]}
    title={title} description={where}>
    <div className="grid gap-4 pb-4">
      <SegmentedControl label="Where from" value={view} options={VIEWS} onValueChange={next => setView(next as AddView)} />
      {view === 'write' ? <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4">
        <p className="text-[15px] text-ink-2">Type it yourself: a name, the minutes, what you’ll tell them.</p>
        <div><Button onClick={onWrite}><PenLine aria-hidden size={18} />Write it</Button></div>
      </div>
        : view === 'drills' ? <DrillsView minutes={minutes} inPlan={inPlan} onUse={drill => onUse(fromDrill(drill))} />
        : <LibraryView squad={squad} onUse={session => onUse(fromLibrary(session, minutes))} />}
    </div>
  </BottomSheet>
}

/* ── My drills ───────────────────────────────────────────────────────────── */

function DrillsView({ minutes, inPlan, onUse }: { minutes: number | null; inPlan: Set<string>; onUse: (drill: Drill) => void }) {
  const drills = useDrills()
  const [query, setQuery] = useState('')
  const all = drills.data ?? []
  // The best fit shows only before the coach searches, and only when there's a choice to make.
  const best = !query.trim() && minutes && all.length > 3 ? bestFit(all, minutes) : []
  const rest = searchDrills(all, query).filter(drill => !best.includes(drill))

  if (drills.error) return <LoadError what="your drills" onRetry={() => void drills.refetch()} retrying={drills.isFetching} />
  if (drills.isPending) return <p role="status" className="text-[13px] text-ink-3">Loading your drills…</p>
  if (all.length === 0) return <p className="text-[15px] text-ink-2">No drills yet. Tick “Save to My drills” when you write a practice, or add one in Training › Drills.</p>
  return <div className="grid gap-4">
    <SearchField label="Search my drills" placeholder="Search my drills" value={query} onValueChange={setQuery} />
    {best.length > 0 && <section aria-labelledby="best-fit" className="grid gap-2">
      <div>
        <h3 id="best-fit" className="text-base font-medium text-ink">Best fit for this slot</h3>
        <p className="text-[13px] text-ink-3">Your drills closest to {minutes} min.</p>
      </div>
      <ul className="grid gap-2">{best.map(drill => <li key={drill.id}><DrillOption drill={drill} inPlan={inPlan.has(drill.id)} onUse={onUse} /></li>)}</ul>
    </section>}
    <section aria-labelledby="all-drills" className="grid gap-2">
      <h3 id="all-drills" className="text-base font-medium text-ink">{best.length ? 'More of my drills' : 'My drills'}</h3>
      {rest.length === 0 ? <p className="text-[15px] text-ink-2">{query.trim() ? `No drill matches “${query.trim()}”.` : 'That’s all of them.'}</p>
        : <ul className="grid gap-2">{rest.map(drill => <li key={drill.id}><DrillOption drill={drill} inPlan={inPlan.has(drill.id)} onUse={onUse} /></li>)}</ul>}
    </section>
  </div>
}

function DrillOption({ drill, inPlan, onUse }: { drill: Drill; inPlan: boolean; onUse: (drill: Drill) => void }) {
  return (
    <article aria-label={drill.name} className="grid gap-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 break-words text-[15px] font-medium text-ink">{drill.name}</p>
        <span className="flex-none text-sm text-ink-3">{drill.minutes} min</span>
      </div>
      {drill.how && <p className="line-clamp-2 text-sm text-ink-2">{drill.how}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => onUse(drill)} aria-label={`Use ${drill.name}`}>Use this</Button>
        {inPlan && <Badge size="sm" tone="success">Already in this plan</Badge>}
      </div>
    </article>
  )
}

/* ── Library ─────────────────────────────────────────────────────────────── */

function LibraryView({ squad, onUse }: { squad: string | null; onUse: (session: LibrarySession) => void }) {
  const [query, setQuery] = useState('')
  const [libraryKey, setLibraryKey] = useState<string | null>(null)
  const [preview, setPreview] = useState<LibrarySession | null>(null)
  // The training's age group, until the coach asks for every age.
  const squadBand = squad ? ageBandOf(squad) : null
  const [everyAge, setEveryAge] = useState(false)
  const band = everyAge ? null : squadBand

  if (preview) return <SessionPreview session={preview} onBack={() => setPreview(null)} onUse={() => onUse(preview)} />

  const library = LIBRARIES.find(l => l.key === libraryKey)
  const sessions = (query.trim() ? searchLibrary(query)
    : library ? SESSIONS.filter(s => s.library === library.name).sort(libraryOrder) : [])
    .filter(s => !s.is_programme && forAge(s, band))

  return <div className="grid gap-4">
    <SearchField label="Search the Library" placeholder="Search: pressing, 1v1, crosses…" value={query} onValueChange={setQuery} />
    {squadBand && <p className="flex flex-wrap items-center gap-x-3 text-[13px] text-ink-3">
      {everyAge ? 'Every age' : ageLabel(squadBand)}
      <button type="button" onClick={() => setEveryAge(on => !on)}
        className="min-h-11 rounded font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {everyAge ? `Only ${ageLabel(squadBand).toLowerCase()}` : 'Show every age'}</button>
    </p>}

    {!query.trim() && !library ? <ul aria-label="Libraries" className="grid grid-cols-2 gap-2.5 tablet:grid-cols-3">
      {LIBRARIES.map(l => <li key={l.key}>
        <button type="button" onClick={() => setLibraryKey(l.key)}
          className="flex h-16 w-full flex-col justify-end rounded-[10px] p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          style={{ background: l.colour, color: ON_LIBRARY }}>
          <span className="text-[15px] font-medium leading-tight">{l.label}</span>
        </button>
      </li>)}
    </ul> : <>
      {!query.trim() && library && <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setLibraryKey(null)}><ChevronLeft aria-hidden size={16} />All libraries</Button>
        <h3 className="text-base font-medium text-ink">{library.label}</h3>
      </div>}
      {sessions.length === 0 ? <p className="text-[15px] text-ink-2">{query.trim() ? `No session matches “${query.trim()}”.` : 'No session for this age.'}</p>
        : <ul aria-label="Library sessions" className="grid gap-2">
          {sessions.slice(0, LIST_MAX).map(session => <li key={session.id}>
            <LibraryOption session={session} onPreview={() => setPreview(session)} onUse={() => onUse(session)} />
          </li>)}
        </ul>}
      {sessions.length > LIST_MAX && <p className="text-[13px] text-ink-3">Showing {LIST_MAX} of {sessions.length}. Search to narrow them down.</p>}
    </>}
  </div>
}

function LibraryOption({ session, onPreview, onUse }: { session: LibrarySession; onPreview: () => void; onUse: () => void }) {
  const library = libraryOf(session)
  const { title } = titleParts(session)
  return (
    <article aria-label={title} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5">
      <PitchArt seed={session.id} colour={library.colour} size={48} />
      <div className="grid min-w-0 flex-1 gap-2">
        <div className="min-w-0">
          <p className="break-words text-[15px] font-medium text-ink">{title}</p>
          <p className="text-[13px] text-ink-3">{[library.label, sessionLine(session)].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onUse} aria-label={`Use ${title}`}>Use this</Button>
          <Button size="sm" variant="secondary" onClick={onPreview} aria-label={`Preview ${title}`}>Preview</Button>
        </div>
      </div>
    </article>
  )
}

/** A Library session inside the sheet: what it's about, what players learn and the kit. No link leaves the plan. */
function SessionPreview({ session, onBack, onUse }: { session: LibrarySession; onBack: () => void; onUse: () => void }) {
  return <div className="grid gap-5">
    <div><Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft aria-hidden size={16} />Back to the list</Button></div>
    <SessionHeading session={session} level={2} />
    <p className="text-[15px] leading-relaxed text-ink-2">{session.summary}</p>
    {session.objectives.length > 0 && <section>
      <h3 className="mb-2 text-base font-medium text-ink">Players will learn to</h3>
      <ul className="grid list-disc gap-1.5 pl-5 text-[15px] leading-snug text-ink">{session.objectives.map(item => <li key={item}>{item}</li>)}</ul>
    </section>}
    {session.setup.length > 0 && <section>
      <h3 className="mb-2 text-base font-medium text-ink">You’ll need</h3>
      <p className="text-[15px] text-ink-2">{session.setup.map(kitItem).join(' · ')}</p>
    </section>}
    <p className="text-[12px] text-ink-3">From England Football Learning, {session.published}. © The FA</p>
    <div><Button onClick={onUse}>Use this</Button></div>
  </div>
}
