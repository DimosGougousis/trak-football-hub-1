import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, type NavigateOptions } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ClipboardCheck, ClipboardPen, Plus, Swords, CalendarPlus, Dumbbell, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { localTodayISO } from '@/lib/event-time'
import { blankForm, clashMessage, dateAsDay, dayAsDate, formProblem, formToRow, newDraftFields, pastDateProblem, type EventForm, type EventRow } from '@/lib/coach-events'
import { useFeature, useParked } from '@/components/trak/parked'
import { registerProblem } from '@/lib/event-register'
import { Button } from '@/components/arc/button/button'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { DatePicker } from '@/components/arc/date-picker/date-picker'
import { TimePicker } from '@/components/arc/time-picker/time-picker'
import { GlassMenu, type GlassMenuGroup } from '@/components/arc/glass-menu/glass-menu'
import { useCoachSquad } from '@/lib/coach-squad'
import { useCreateSaved } from './coach-frame-context'

/* TRAK-182 part 8 (Imad, 15 Oct): the coach's "+" opens a menu, then the
   shortest form that makes a real record. Only "New event" finishes here (a
   draft families never see). A match log needs every player's facts (J4:
   nothing invented), so it continues on the log's Squad step; a training is
   logged on its own screen, or its register is taken when today has one.
   TRAK-259 (Imad, 22 Oct): the "+" is Arc's glass menu, merged into the glass
   tab bar on a phone and "+ Create" at a laptop's top right; the forms open
   beside it. */
type Face = 'closed' | 'menu' | 'event' | 'match'

const SPRING = { type: 'spring', bounce: 0, visualDuration: 0.35 } as const
const field = 'w-full rounded-[12px] border border-line bg-ground px-3 py-2.5 text-[16px] text-ink placeholder-ink-3 outline-none focus-visible:ring-2 focus-visible:ring-primary'

/** The top row of a form: Back to the menu, its title, and X, which closes it (Imad, 16 Oct). */
function Header({ title, onBack, onClose }: { title: string; onBack: () => void; onClose: () => void }) {
  const icon = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-raised active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
  return (
    <div className="-mx-1 -mt-1 mb-1 flex items-center gap-1">
      <button type="button" aria-label="Back to Create" onClick={onBack} className={icon}><ArrowLeft size={18} aria-hidden="true" /></button>
      <p className="flex-1 text-[15px] font-medium text-ink">{title}</p>
      <button type="button" aria-label="Close quick add" onClick={onClose} className={icon}><X size={18} aria-hidden="true" /></button>
    </div>
  )
}

/** Home or away as two pressed buttons: it starts unanswered, as on Schedule,
 *  so a fixture is never saved as Home because nobody chose (Tarek, #319). */
function HomeAway({ value, onChange }: { value: '' | 'home' | 'away'; onChange: (v: 'home' | 'away') => void }) {
  return (
    <div role="group" aria-label="Home or away" className="grid grid-cols-2 gap-2">
      {(['home', 'away'] as const).map(v => (
        <Button key={v} size="sm" variant={value === v ? 'primary' : 'secondary'} aria-pressed={value === v} onClick={() => onChange(v)}>
          {v === 'home' ? 'Home' : 'Away'}
        </Button>
      ))}
    </div>
  )
}

/** Keeps a form above the on-screen keyboard (8g): the visual viewport shrinks when it opens. */
function useKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) }
  }, [])
  return inset
}

/** Pages keep saying `<QuickAdd onSaved={…} />`: inside the coach's frame (TRAK-259) the "+" is the frame's,
 *  and this only tells the page when it saved something. */
export function QuickAdd({ onSaved }: { onSaved?: () => void; corner?: 'top' | 'bottom'; sideMenuOnly?: boolean }) {
  useCreateSaved(onSaved)
  return null
}

/** The coach's "+". `bar`: round, in the phone's glass tab bar, opening upward. `top`: "+ Create" at a laptop's top right. */
export function CoachCreate({ placement, onSaved }: { placement: 'bar' | 'top'; onSaved?: () => void }) {
  const { user } = useAuth()
  // TRAK-176: a new event belongs to the squad picked; wait until the squads are known.
  const coachSquad = useCoachSquad(user?.id)
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const keyboard = useKeyboardInset()
  // Events switched off for the academy (TRAK-124): New event and the register
  // say "Coming soon", as Schedule does; logging is not an events feature.
  const eventsOn = useFeature('events')
  const { comingSoon } = useParked()
  const [face, setFace] = useState<Face>('closed')
  const [register, setRegister] = useState<EventRow | null>(null)
  const surface = useRef<HTMLDivElement>(null)
  const bar = placement === 'bar'

  // New event: the fields a valid draft needs. Log match: what the log's first step needs.
  const [kind, setKind] = useState<'training' | 'match'>('training')
  const [date, setDate] = useState(localTodayISO)
  const [time, setTime] = useState('')
  const [opponent, setOpponent] = useState('')
  const [homeAway, setHomeAway] = useState<'' | 'home' | 'away'>('')
  const [scoreUs, setScoreUs] = useState('')
  const [scoreThem, setScoreThem] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const back = () => { setError(null); setFace('menu') }
  const close = () => { setError(null); setFace('closed') }
  const form = face === 'event' || face === 'match'

  // Focus goes into the form, after the menu's own focus return to the "+".
  useEffect(() => {
    if (!form) return
    const frame = requestAnimationFrame(() => requestAnimationFrame(() =>
      surface.current?.querySelector<HTMLElement>('input, button[aria-pressed]')?.focus({ preventScroll: true })))
    return () => cancelAnimationFrame(frame)
  }, [form, face])
  // A tap outside a form steps back to the menu.
  useEffect(() => {
    if (!form) return
    const away = (e: PointerEvent) => {
      const target = e.target as Node
      // Arc's pickers open in a portal; a tap inside one is not "outside".
      if (surface.current?.contains(target) || (target as Element).closest?.('[role="dialog"], [role="listbox"], [data-quick-add-trigger]')) return
      back()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [form])

  // Today's training whose register can open now: the menu offers it first.
  useEffect(() => {
    if (face !== 'menu' || !user || !eventsOn) return
    let cancelled = false
    supabase.from('coach_calendar_events').select('*').eq('coach_user_id', user.id).eq('event_date', localTodayISO())
      .eq('published', true).then(({ data }) => {
        if (!cancelled) setRegister(((data ?? []) as EventRow[]).find(row => !registerProblem(row)) ?? null)
      })
    return () => { cancelled = true }
  }, [face, user, eventsOn])

  const datePassed = pastDateProblem(date, localTodayISO())
  const eventForm = (): EventForm => ({ ...blankForm(date), kind, time, opponent: kind === 'match' ? opponent : '', homeAway: kind === 'match' ? homeAway : '' })
  const saveDraft = async () => {
    if (!user || saving) return
    const draft = eventForm()
    const problem = formProblem(draft) ?? pastDateProblem(draft.date, localTodayISO())
    if (problem) { setError(problem); return }
    if (!coachSquad.ready) { setError(coachSquad.retry()); return }
    setSaving(true)
    // As Schedule's Save draft: a new event starts unpublished; families never see a draft.
    const { data, error: failed } = await supabase.from('coach_calendar_events')
      .insert([{ ...formToRow(draft), ...newDraftFields(user.id, coachSquad.squad) }]).select('id')
    setSaving(false)
    if (failed || !data?.length) { setError(clashMessage(failed) ?? "Couldn't save the draft. Check your connection and try again."); return }
    setTime(''); setOpponent(''); setHomeAway('')
    onSaved?.()
    close()
    toast.success('Draft saved. Publish it from Schedule.')
  }
  // Leaving closes the form first: on Schedule itself nothing remounts, so it
  // would otherwise stay open over the sheet it hands to (Tarek, #319).
  const go = (to: string, options?: NavigateOptions) => { close(); navigate(to, options) }
  const moreDetails = () => go('/coach/schedule', { state: { quickEvent: eventForm() } })
  const continueMatch = () => {
    if (!opponent.trim() || scoreUs === '' || scoreThem === '') { setError('Add the opponent and the score.'); return }
    if (!homeAway) { setError('Say whether it was home or away.'); return }
    if (date > localTodayISO()) { setError("A match can't be logged before it's played."); return }
    go('/coach/sessions/add', { state: { quickMatch: { opponent: opponent.trim(), venue: homeAway === 'home' ? 'Home' : 'Away', scoreUs, scoreThem, date } } })
  }

  const choose = (id: string) => {
    setError(null)
    if (id === 'register' && register) go(`/coach/schedule?register=${register.id}`)
    else if (id === 'training') go('/coach/sessions/add')
    else if (id === 'assess') go('/coach/assess')
    else if (id === 'match') setFace('match')
    else if (id === 'event') { if (eventsOn) setFace('event'); else { close(); comingSoon() } }
  }
  const groups: GlassMenuGroup[] = [
    ...(register ? [{ id: 'today', items: [{ id: 'register', label: `Take register · ${register.title}`, icon: <ClipboardCheck /> }] }] : []),
    { id: 'create', items: [
      { id: 'training', label: 'Log training', icon: <Dumbbell /> },
      { id: 'match', label: 'Log match', icon: <Swords /> },
      // Imad, 16 Oct (Kostas's item 9): assessing is one of the coach's quick actions.
      { id: 'assess', label: 'Assess player', icon: <ClipboardPen /> },
      { id: 'event', label: 'New event', icon: <CalendarPlus /> },
    ] },
  ]

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); back(); return }
    // The form keeps focus inside it, as a small dialog does.
    if (e.key === 'Tab') {
      const focusable = [...(surface.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]') ?? [])]
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
  }

  // Beside the "+": above the phone's tab bar (and the keyboard), or under a laptop's top bar.
  const position = bar
    ? { right: 'max(16px, env(safe-area-inset-right))', bottom: `calc(${Math.max(keyboard + 12, 92)}px + env(safe-area-inset-bottom))` }
    : { right: '16px', top: '68px' }

  return <>
    <div data-quick-add-trigger className={bar ? 'h-full w-full' : undefined}>
      <GlassMenu label="Quick add" triggerLabel={bar ? 'Quick add' : undefined} groups={groups} align="end" side={bar ? 'top' : 'bottom'} round={bar} width={264}
        open={face === 'menu'} onOpenChange={open => setFace(current => open ? 'menu' : current === 'menu' ? 'closed' : current)} onSelect={choose}>
        <Plus size={bar ? 22 : 16} strokeWidth={2.2} aria-hidden="true" className="text-brand" />{!bar && 'Create'}
      </GlassMenu>
    </div>
    {createPortal(<AnimatePresence>
      {form && <motion.div key="quick-add-form" ref={surface} data-quick-add data-corner={bar ? 'bottom' : 'top'} onKeyDown={onKeyDown}
        role="dialog" aria-label={face === 'event' ? 'New event' : 'Log a match'}
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }} transition={SPRING}
        // At the bottom the pickers open upward: opening down ran off the screen (Imad, 16 Oct).
        style={{ ...position, originX: 1, originY: bar ? 1 : 0 }}
        className={`arc fixed z-[70] w-[min(340px,calc(100vw-32px))] rounded-[22px] border border-line p-3 shadow-[0_12px_40px_rgba(0,0,0,0.2)]
          bg-surface/90 backdrop-blur-xl [@media(prefers-reduced-transparency:reduce)]:bg-surface [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none
          ${bar ? `[&_[role=listbox]]:top-auto [&_[role=listbox]]:bottom-[calc(100%+6px)] [&_[role=listbox]]:origin-bottom
          [&_[aria-label$=calendar]]:top-auto [&_[aria-label$=calendar]]:bottom-[calc(100%+8px)] [&_[aria-label$=calendar]]:origin-bottom-left` : ''}
          [&_[aria-label$=calendar]]:bg-raised [&_[role=listbox]]:bg-raised`}>

        {face === 'event' && (
          <div className="space-y-3">
            <Header title="New event" onBack={back} onClose={close} />
            <SegmentedControl label="Event type" value={kind} onValueChange={v => { setKind(v as 'training' | 'match'); setError(null) }}
              options={[{ value: 'training', label: 'Training' }, { value: 'match', label: 'Match' }]} />
            {kind === 'match' && <>
              <input aria-label="Opponent" value={opponent} onChange={e => { setOpponent(e.target.value); setError(null) }}
                placeholder="Opponent" className={field} />
              <HomeAway value={homeAway} onChange={v => { setHomeAway(v); setError(null) }} />
            </>}
            {/* One per row: each picker's panel opens across the form's full width. */}
            <div className="space-y-3">
              <DatePicker label="Date" className="arc-trak-field" value={dayAsDate(date)} clearable={false}
                onChange={d => { if (d) { setDate(dateAsDay(d)); setError(null) } }} placeholder="Pick a date"
                format={{ weekday: 'short', day: 'numeric', month: 'short' }} locale="en-GB" />
              <TimePicker label={kind === 'match' ? 'Kickoff' : 'Start'} className="arc-trak-field" value={time}
                onChange={t => { setTime(t); setError(null) }} minuteStep={5} format="12h" placeholder="Pick a time" emptyAt="17:00" />
            </div>
            {/* TRAK-127: New event is for what's coming; a past day offers the logs. */}
            {datePassed ? (
              <div role="alert" className="space-y-2">
                <p className="text-[12px] text-danger">{datePassed}</p>
                <div className="flex gap-2">
                  <Button size="md" variant="secondary" className="flex-1" onClick={() => { setError(null); setFace('match') }}>Log match</Button>
                  <Button size="md" variant="secondary" className="flex-1" onClick={() => go('/coach/sessions/add', { state: { logDate: date } })}>Log training</Button>
                </div>
              </div>
            ) : error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
            <div className="flex gap-2">
              <Button size="md" variant="ghost" className="flex-1" onClick={moreDetails}>More details</Button>
              <Button size="md" className="flex-1" loading={saving} disabled={!!datePassed} onClick={() => void saveDraft()}>Save draft</Button>
            </div>
          </div>
        )}

        {face === 'match' && (
          <div className="space-y-3">
            <Header title="Log a match" onBack={back} onClose={close} />
            <input aria-label="Opponent" value={opponent} onChange={e => { setOpponent(e.target.value); setError(null) }}
              placeholder="Opponent" className={field} />
            <HomeAway value={homeAway} onChange={v => { setHomeAway(v); setError(null) }} />
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <input aria-label="Our score" inputMode="numeric" value={scoreUs} placeholder="Us"
                onChange={e => { setScoreUs(e.target.value.replace(/\D/g, '').slice(0, 2)); setError(null) }} className={`${field} text-center`} />
              <span aria-hidden="true" className="text-ink-3">–</span>
              <input aria-label="Their score" inputMode="numeric" value={scoreThem} placeholder="Them"
                onChange={e => { setScoreThem(e.target.value.replace(/\D/g, '').slice(0, 2)); setError(null) }} className={`${field} text-center`} />
            </div>
            <DatePicker label="Date" className="arc-trak-field" value={dayAsDate(date)} clearable={false}
              onChange={d => { if (d) { setDate(dateAsDay(d)); setError(null) } }} placeholder="Pick a date"
              format={{ weekday: 'short', day: 'numeric', month: 'short' }} locale="en-GB" />
            {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
            <p className="text-[12px] text-ink-3">Next: who played, their goals and assists.</p>
            <Button size="md" className="w-full" onClick={continueMatch}>Continue</Button>
          </div>
        )}
      </motion.div>}
    </AnimatePresence>, document.body)}
  </>
}
