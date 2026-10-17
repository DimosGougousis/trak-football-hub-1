import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate, type NavigateOptions } from 'react-router-dom'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Check, ClipboardCheck, ClipboardPen, Plus, Swords, CalendarPlus, Dumbbell, X } from 'lucide-react'
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

/* TRAK-182 part 8 (Imad, 15 Oct; plan 8a–8g): a "+" above the tab bar that
   becomes a menu, then the shortest form that makes a real record, then a
   check, and back to "+". One surface changes shape, anchored to the corner
   the "+" sits in, on springs that start from wherever it is (a second tap
   mid-move reverses it). Built from Arc's free parts and motion; Arc's Pro
   "action morph" is not used. Only "New event" finishes here (a draft
   families never see). A match log needs every player's facts (J4: nothing
   invented), so it continues on the log's Squad step; a training is logged
   on its own screen, or its register is taken when today has one. */
type Face = 'closed' | 'menu' | 'event' | 'match' | 'done'

const SPRING = { type: 'spring', bounce: 0, visualDuration: 0.35 } as const
const CHECK_SPRING = { type: 'spring', bounce: 0.3, visualDuration: 0.35 } as const
const field = 'w-full rounded-[12px] border border-line bg-ground px-3 py-2.5 text-[16px] text-ink placeholder-ink-3 outline-none focus-visible:ring-2 focus-visible:ring-primary'

/** The top row of the open surface: Back (on a form), its title, and X, which
 *  closes it from anywhere (Imad, 16 Oct, as Arc's action menu does). */
function Header({ title, onBack, onClose }: { title: string; onBack?: () => void; onClose: () => void }) {
  const icon = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-raised active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
  return (
    <div className="-mx-1 -mt-1 mb-1 flex items-center gap-1">
      {onBack && <button type="button" aria-label="Back to Create" onClick={onBack} className={icon}><ArrowLeft size={18} aria-hidden="true" /></button>}
      <p className={`flex-1 text-[15px] font-medium text-ink ${onBack ? '' : 'pl-2'}`}>{title}</p>
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

/** Keeps the surface above the on-screen keyboard (8g): the visual viewport shrinks when it opens. */
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

export function QuickAdd({ onSaved }: { onSaved?: () => void }) {
  const { user } = useAuth()
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
  const plus = useRef<HTMLButtonElement>(null)

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

  const back = () => { setError(null); setFace(f => f === 'event' || f === 'match' ? 'menu' : 'closed') }
  const close = () => { setError(null); setFace('closed') }

  // Back to "+" puts focus back on it, as a closing menu does.
  useEffect(() => { if (face === 'closed' && document.activeElement !== document.body) plus.current?.focus({ preventScroll: true }) }, [face])
  // Focus goes into the surface: the first menu item, or the form's first field.
  useEffect(() => {
    if (face === 'menu' || face === 'event' || face === 'match') {
      surface.current?.querySelector<HTMLElement>('[role="menuitem"], input, button[aria-pressed]')?.focus({ preventScroll: true })
    }
  }, [face])
  // A tap outside steps back one state.
  useEffect(() => {
    if (face === 'closed' || face === 'done') return
    const away = (e: PointerEvent) => {
      const target = e.target as Node
      // Arc's pickers open in a portal; a tap inside one is not "outside".
      if (surface.current?.contains(target) || (target as Element).closest?.('[role="dialog"], [role="listbox"]')) return
      back()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [face])

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

  const [doneText, setDoneText] = useState('')
  const done = (text: string) => {
    setFace('done')
    setDoneText(text)
  }
  // The check shows for 1.1 s, then "+" again. The timer belongs to the done face,
  // so leaving it or unmounting clears it (Tarek, 16 Oct: it fired after a test's page was gone).
  useEffect(() => {
    if (face !== 'done') return
    const timer = window.setTimeout(() => setFace('closed'), 1100)
    return () => window.clearTimeout(timer)
  }, [face])

  const datePassed = pastDateProblem(date, localTodayISO())
  const eventForm = (): EventForm => ({ ...blankForm(date), kind, time, opponent: kind === 'match' ? opponent : '', homeAway: kind === 'match' ? homeAway : '' })
  const saveDraft = async () => {
    if (!user || saving) return
    const form = eventForm()
    const problem = formProblem(form) ?? pastDateProblem(form.date, localTodayISO())
    if (problem) { setError(problem); return }
    setSaving(true)
    // As Schedule's Save draft: a new event starts unpublished; families never see a draft.
    const { data, error: failed } = await supabase.from('coach_calendar_events')
      .insert([{ ...formToRow(form), ...newDraftFields(user.id) }]).select('id')
    setSaving(false)
    if (failed || !data?.length) { setError(clashMessage(failed) ?? "Couldn't save the draft. Check your connection and try again."); return }
    setTime(''); setOpponent(''); setHomeAway('')
    onSaved?.()
    done('Draft saved. Publish it from Schedule.')
  }
  // Leaving closes the surface first: on Schedule itself nothing remounts, so it
  // would otherwise stay open over the sheet it hands to (Tarek, #319).
  const go = (to: string, options?: NavigateOptions) => { close(); navigate(to, options) }
  const moreDetails = () => go('/coach/schedule', { state: { quickEvent: eventForm() } })
  const continueMatch = () => {
    if (!opponent.trim() || scoreUs === '' || scoreThem === '') { setError('Add the opponent and the score.'); return }
    if (!homeAway) { setError('Say whether it was home or away.'); return }
    if (date > localTodayISO()) { setError("A match can't be logged before it's played."); return }
    go('/coach/sessions/add', { state: { quickMatch: { opponent: opponent.trim(), venue: homeAway === 'home' ? 'Home' : 'Away', scoreUs, scoreThem, date } } })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); back(); return }
    if (face === 'menu' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const items = [...(surface.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
      const at = items.indexOf(document.activeElement as HTMLElement)
      items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
    }
    // The form keeps focus inside it, as a small dialog does.
    if ((face === 'event' || face === 'match') && e.key === 'Tab') {
      const focusable = [...(surface.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]') ?? [])]
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
  }

  const round = face === 'closed' || face === 'done'
  const item = 'flex w-full min-h-11 items-center gap-3 rounded-[12px] px-3 text-left text-[15px] text-ink hover:bg-raised focus-visible:bg-raised focus-visible:outline-none active:scale-[0.98] transition-transform'

  return <>
    {/* Room under the last row, so the "+" never covers it. */}
    <div aria-hidden="true" className="h-16" />
    <div data-quick-add className="fixed z-40 pointer-events-none"
      style={{
        right: 'max(16px, calc((100vw - 430px) / 2 + 16px))',
        bottom: `calc(${Math.max(keyboard + 12, 76)}px + env(safe-area-inset-bottom))`,
      }}>
      <LayoutGroup>
        <motion.div ref={surface} layout={!reduced} onKeyDown={onKeyDown}
          role={face === 'event' || face === 'match' ? 'dialog' : undefined}
          aria-label={face === 'event' ? 'New event' : face === 'match' ? 'Log a match' : undefined}
          transition={face === 'done' ? CHECK_SPRING : SPRING}
          // Clip (never "hidden", which focus can scroll) while the shape morphs; a
          // form lets its pickers out, and they open upward: the surface sits at
          // the bottom of the screen, so opening down ran off it (Imad, 16 Oct).
          style={{ borderRadius: round ? 28 : 22, originX: 1, originY: 1 }}
          className={`arc pointer-events-auto border border-line shadow-[0_12px_40px_rgba(0,0,0,0.5)]
            bg-surface/90 backdrop-blur-xl [@media(prefers-reduced-transparency:reduce)]:bg-surface [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none
            [&_[role=listbox]]:top-auto [&_[role=listbox]]:bottom-[calc(100%+6px)] [&_[role=listbox]]:origin-bottom
            [&_[aria-label$=calendar]]:top-auto [&_[aria-label$=calendar]]:bottom-[calc(100%+8px)] [&_[aria-label$=calendar]]:origin-bottom-left
            [&_[aria-label$=calendar]]:bg-raised [&_[role=listbox]]:bg-raised
            ${face === 'event' || face === 'match' ? 'overflow-visible' : 'overflow-clip'}
            ${round ? 'w-14 h-14' : face === 'menu' ? 'w-[232px]' : 'w-[min(340px,calc(100vw-32px))]'}`}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={face} initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.18 }} className={round ? 'w-full h-full' : 'p-3'}>

              {face === 'closed' && (
                <button ref={plus} type="button" aria-label="Quick add" aria-haspopup="menu" aria-expanded="false"
                  // Opens on press (8d). The press must not then focus this fading "+", or
                  // it would take focus back from the menu's first item.
                  onPointerDown={() => setFace('menu')} onMouseDown={e => e.preventDefault()} onClick={() => setFace('menu')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFace('menu') } }}
                  className="flex w-full h-full items-center justify-center bg-primary text-on-brand active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
                  <Plus size={24} strokeWidth={2.2} aria-hidden="true" />
                </button>
              )}

              {face === 'done' && (
                <div role="status" className="flex w-full h-full items-center justify-center bg-primary text-on-brand">
                  <motion.span initial={reduced ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={CHECK_SPRING}>
                    <Check size={26} strokeWidth={2.6} aria-hidden="true" />
                  </motion.span>
                  <span className="sr-only">{doneText}</span>
                </div>
              )}

              {face === 'menu' && (
                <>
                <Header title="Create" onClose={close} />
                <div role="menu" aria-label="Quick add" className="space-y-0.5">
                  {register && (
                    <button type="button" role="menuitem" className={item}
                      onClick={() => go(`/coach/schedule?register=${register.id}`)}>
                      <ClipboardCheck size={18} aria-hidden="true" className="text-primary" />
                      <span className="flex-1 min-w-0 truncate">Take register · {register.title}</span>
                    </button>
                  )}
                  <button type="button" role="menuitem" className={item} onClick={() => go('/coach/sessions/add')}>
                    <Dumbbell size={18} aria-hidden="true" className="text-ink-2" />Log training
                  </button>
                  <button type="button" role="menuitem" className={item} onClick={() => { setError(null); setFace('match') }}>
                    <Swords size={18} aria-hidden="true" className="text-ink-2" />Log match
                  </button>
                  {/* Imad, 16 Oct (Kostas's item 9): assessing is one of the coach's quick actions. */}
                  <button type="button" role="menuitem" className={item} onClick={() => go('/coach/assess')}>
                    <ClipboardPen size={18} aria-hidden="true" className="text-ink-2" />Assess player
                  </button>
                  <button type="button" role="menuitem" className={item} onClick={() => { if (!eventsOn) { comingSoon(); return } setError(null); setFace('event') }}>
                    <CalendarPlus size={18} aria-hidden="true" className="text-ink-2" />New event
                  </button>
                </div>
                </>
              )}

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
                  {/* One per row: each picker's panel opens across the surface's full width. */}
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
                  <p className="text-[12px] text-ink-3">Next: who played, their minutes, goals and assists.</p>
                  <Button size="md" className="w-full" onClick={continueMatch}>Continue</Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
    </div>
  </>
}
