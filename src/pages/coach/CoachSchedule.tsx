import { useEffect, useState, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Pencil, Send, Trash2, Ban, X, FileUp, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { displayEventTime, localTodayISO } from '@/lib/event-time'
import { useCoachSquad } from '@/lib/coach-squad'
import { askToEmailFamilies } from '@/lib/event-emails'
import { useAuth } from '@/contexts/AuthContext'
import { MobileShell, NavBar, LoadError } from '@/components/trak'
import { QuickAdd } from '@/components/coach/QuickAdd'
import { useParked } from '@/components/trak/parked'
import {
  CANCELLED_COLOR, DURATIONS, clashMessage, draftClashes, EVENT_COLOR, lockedMessage, STARTED_LOCKED, startedLocked, EVENT_KINDS, FAMILY_NOTE_MAX, NO_TIME_COLOR, WEEKDAYS, blankForm, blankRepeat, canDelete, cancelPatch, dateAsDay, dayAsDate, eventTitle, formProblem, formToRow, newDraftFields,
  isCancelled, pastDateProblem, repeatProblem, rowToForm, savedVenues, seriesDates, seriesRows, thisAndFollowing, whatProblem,
  type Clash, type EventForm, type EventKind, type EventRow, type Repeat,
} from '@/lib/coach-events'
import { TRAINING_THEMES, catalogueLink, type TrainingTheme } from '@/lib/training-theme'
import { FixtureImport } from '@/components/coach/FixtureImport'
import { DatePicker } from '@/components/arc/date-picker/date-picker'
import { Calendar } from '@/components/arc/calendar/calendar'
import { TimePicker } from '@/components/arc/time-picker/time-picker'
import { Stepper } from '@/components/arc/stepper/stepper'
import { Button } from '@/components/arc/button/button'
import { FIXTURE_IMPORT_ENABLED, fixtureInsertRows, scheduleFixtureKeys } from '@/lib/fixture-import'
import type { Fixture } from '@/lib/fixtures-csv'
import { familyNoteProblem, shareableFromRow, squadLabelFrom, whatsAppShareText } from '@/lib/event-share'
import { ShareEventButton, ShareIcon } from '@/components/coach/ShareEventButton'
import { hasStarted, registerProblem } from '@/lib/event-register'
import { TakeRegister } from '@/components/coach/TakeRegister'
import { EventAbsences } from '@/components/coach/EventAbsences'
import { withAlpha } from '@/lib/with-alpha'

/* TRAK-127 (J8.4): the coach creates, edits and cancels events. A save is a
   draft only the coach sees; Publish sends it to families (Imad, 9 Oct). Once
   published, an edit goes live on save. A cancel keeps the event on the
   schedule as Cancelled; only a draft nobody has seen can be deleted. The AI
   "Read Schedule" import is gone (G7): fixtures come in by CSV (J8.6).
   TRAK-128 (J8.5): a training repeats weekly until an end date, one row per
   date under one series_id. Editing, cancelling, publishing or deleting a
   week of a series asks: only this week, or this and following weeks.
   TRAK-138 (J8.15): once a training or "other" event has started, the coach
   takes its register here and it becomes the completed session; a match that
   has kicked off opens the J4 match log with its date and opponent. */

// ── Types ────────────────────────────────────────────────────────────────────

type ShownType = EventKind | 'tournament'

type CalEvent = {
  id: string
  title: string
  type: ShownType
  date: string        // YYYY-MM-DD
  time?: string       // HH:MM
  source: 'calendar' | 'session'
  row?: EventRow
  opponent?: string
  venue?: string
}

// ── Colours ──────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<ShownType, string> = EVENT_COLOR

const TYPE_LABEL: Record<ShownType, string> = {
  match: 'Match', training: 'Training', tournament: 'Tournament', other: 'Other',
}

// ── Calendar helpers ─────────────────────────────────────────────────────────

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function toDateStr(d: Date) {
  // Use LOCAL date parts — toISOString() converts to UTC, which shifts the
  // date back a day for users in timezones ahead of UTC (e.g. Europe), making
  // events land on the wrong calendar cell.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatEventDay(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

/** A write that changed no row was refused (RLS filters, it doesn't error). */
function failed(error: unknown, data: unknown[] | null) {
  return !!error || !data?.length
}

const SAVE_FAILED = "Couldn't save the event. Check your connection and try again; your details are still here."


const inputClass = 'w-full bg-ground border border-line rounded-[12px] px-3 py-2.5 text-[14px] text-ink placeholder-ink-3 outline-none'
const font = { fontFamily: 'var(--t-font)' }
const mono = { fontFamily: 'var(--t-font-mono)' }

function Chip({ on, color = 'rgb(var(--t-brand))', onClick, children }: { on: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className="px-3 py-1.5 rounded-full text-xs transition-colors"
      style={{
        background: on ? `${withAlpha(color, 0.13)}` : 'rgb(var(--t-raised))',
        color: on ? color : 'rgb(var(--t-ink-3))',
        border: `1px solid ${on ? withAlpha(color, 0.33) : 'rgb(var(--t-line))'}`,
        ...font,
      }}>
      {children}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[9px] tracking-[0.1em] uppercase text-ink-3" style={mono}>{label}</span>
      {children}
    </label>
  )
}

/** A training's theme: the catalogue's seven libraries, and a link into it. */
function ThemeChoice({ theme, onChange }: { theme: TrainingTheme | ''; onChange: (theme: TrainingTheme) => void }) {
  const picked = TRAINING_THEMES.find(t => t.key === theme)
  return (
    <div className="space-y-2">
      <span id="training-theme" className="block text-[9px] tracking-[0.1em] uppercase text-ink-3" style={mono}>Theme</span>
      <div role="radiogroup" aria-labelledby="training-theme" className="grid grid-cols-2 gap-2">
        {TRAINING_THEMES.map(t => {
          const on = t.key === theme
          return (
            <label key={t.key} className="flex items-start gap-2 rounded-[12px] px-3 py-2 cursor-pointer transition-colors"
              style={{
                background: on ? withAlpha(TYPE_COLOR.training, 0.1) : 'rgb(var(--t-ground))',
                border: `1px solid ${on ? withAlpha(TYPE_COLOR.training, 0.33) : 'rgb(var(--t-line))'}`,
                ...font,
              }}>
              <input type="radio" name="training-theme" value={t.key} checked={on} onChange={() => onChange(t.key)}
                className="mt-[2px] w-3.5 h-3.5 shrink-0" style={{ accentColor: TYPE_COLOR.training }} />
              <span className="min-w-0">
                <span className="block text-[13px] leading-tight" style={{ color: on ? TYPE_COLOR.training : 'rgb(var(--t-ink))' }}>{t.label}</span>
                <span className="block text-[11px] text-ink-3 mt-0.5 whitespace-nowrap">{t.sessions} sessions · {t.topics} {t.topics === 1 ? 'topic' : 'topics'}</span>
              </span>
            </label>
          )
        })}
      </div>
      {/* A new tab, so the event being set up stays as it is. */}
      <a href={catalogueLink(theme)} target="_blank" rel="noopener"
        className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: TYPE_COLOR.training, ...font }}>
        {picked ? `Find ${picked.label} sessions in the Trainings Catalogue` : 'Browse all sessions in the Trainings Catalogue'}
        <ExternalLink size={12} aria-hidden />
      </a>
    </div>
  )
}

/** The meet-time list opens half an hour before the start: the usual gap. */
function halfHourBefore(time: string) {
  if (!time) return '17:00'
  const [h, m] = time.split(':').map(Number)
  const t = Math.max(0, h * 60 + m - 30)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** Arc's tokens for a picker in this form; the picker takes className="arc-trak-field" for Trak's label (TRAK-157). */
function ArcField({ children }: { children: React.ReactNode }) {
  return <div className="arc" style={font}>{children}</div>
}

// ── Component ────────────────────────────────────────────────────────────────

type Scope = 'one' | 'following'

type Sheet =
  | { kind: 'closed' }
  | { kind: 'edit'; row: EventRow | null; form: EventForm; repeat: Repeat; scope: Scope; step: number; error: string | null }
  | { kind: 'cancel'; row: EventRow; reason: string; scope: Scope; error: string | null }
  // TRAK-168: the event just cancelled, offered to the team group, and what was cancelled.
  | { kind: 'cancelled'; row: EventRow; note: string }
  | { kind: 'series'; action: 'publish' | 'delete'; row: EventRow; error: string | null }
  // TRAK-218: a series Publish the database refused; it stays until the coach closes it.
  | { kind: 'notPublished'; count: number; weeks: ClashingWeek[]; refusal: string }
  | { kind: 'import' }
  | { kind: 'register'; row: EventRow }

/* TRAK-182 (Imad's 7c): the event form one step per screen, related fields
   together, then Review with Publish or Save draft. An edit opens on What,
   where each step can be reopened from the stepper. */
const EVENT_STEPS = [
  { id: 'what', label: 'What' },
  { id: 'when', label: 'When' },
  { id: 'families', label: 'For families' },
  { id: 'review', label: 'Review' },
]
const REVIEW = EVENT_STEPS.length - 1

/** TRAK-127: a past date on New event, or moved to on an edit. */
function pastProblem(form: EventForm, editing: EventRow | null) {
  return pastDateProblem(form.date, localTodayISO(), editing ? rowToForm(editing).date : null)
}

/** What stops Next on a step: only what that step can fix. */
function stepProblem(step: number, form: EventForm, repeat: Repeat, editing: EventRow | null) {
  if (step === 0) return whatProblem(form)
  if (step === 1) return formProblem(form) ?? pastProblem(form, editing) ?? (editing ? null : repeatProblem(form, repeat))
  return null
}

/** How many events Review's save makes: a new weekly series is several. */
function seriesCount(sheet: { row: EventRow | null; form: EventForm; repeat: Repeat }) {
  const { row, form, repeat } = sheet
  return !row && repeat.on && form.kind !== 'match' && !repeatProblem(form, repeat)
    ? seriesDates(form.date, repeat.until, repeat.days).length : 1
}

/** Review: everything the save writes, in the order the steps asked for it. */
function EventSummary({ form, repeat, noteProblem }: {
  form: EventForm; repeat: Repeat | null; noteProblem: 'link' | 'name' | null
}) {
  const rows: [string, string][] = [
    ['Type', TYPE_LABEL[form.kind]],
    ...(form.kind === 'training' ? [['Theme', TRAINING_THEMES.find(t => t.key === form.theme)?.label ?? 'Not set'] as [string, string]] : []),
    ...(form.kind === 'match' ? [['Opponent', form.opponent.trim() + (form.homeAway ? ` (${form.homeAway === 'home' ? 'Home' : 'Away'})` : '')] as [string, string]] : []),
    ['Title', eventTitle(form)],
    ['Venue', form.venue.trim() || 'Not set'],
    [repeat?.on ? 'First date' : 'Date', form.date ? formatEventDay(form.date) : 'Not set'],
    [form.kind === 'match' ? 'Kickoff' : 'Start', form.time || 'Not set'],
    ['Meet', form.meetTime || 'At the start'],
    ['Length', `${form.duration} min`],
    ...(repeat?.on && form.kind !== 'match' && !repeatProblem(form, repeat)
      ? [['Repeats', `${repeat.days.map(d => WEEKDAYS[d]).join(', ')} until ${formatEventDay(repeat.until)}`] as [string, string]] : []),
    ['Kit', form.kit.trim() || 'None'],
    ['Note for families', form.familyNote.trim() || 'None'],
  ]
  return <>
    <dl className="rounded-[14px] border border-line divide-y divide-line" style={font}>
      {rows.map(([term, value]) => (
        <div key={term} className="flex gap-3 px-3 py-2.5 text-[13px]">
          <dt className="w-[38%] shrink-0 text-ink-3">{term}</dt>
          <dd className="flex-1 min-w-0 text-ink break-words">{value}</dd>
        </div>
      ))}
    </dl>
    {noteProblem && (
      <p role="status" className="text-[11px] text-warning" style={font}>
        Families won't see this note: {noteProblem === 'link' ? 'it has a link' : 'it names a player'}.
      </p>
    )}
  </>
}

/** TRAK-218: the weeks of a refused series that clash, earliest first. */
type ClashingWeek = { date: string; clash: Clash }
function clashingWeeks(ids: string[], rows: EventRow[]): ClashingWeek[] {
  const clashes = draftClashes(rows)
  return rows.filter(r => ids.includes(r.id) && clashes.has(r.id))
    .sort((a, b) => a.event_date!.localeCompare(b.event_date!))
    .map(r => ({ date: r.event_date!, clash: clashes.get(r.id)! }))
}
const overlapLine = ({ date, clash }: ClashingWeek) => `${formatEventDay(date)} overlaps ${clash.title}, ${clash.start}–${clash.end}.`
/** What to fix: the week's time, or the event it clashes with. */
function fixLine(weeks: ClashingWeek[]) {
  const titles = [...new Set(weeks.map(w => w.clash.title))]
  return `Change ${weeks.length > 1 ? 'those weeks’ times' : 'that week’s time'}, or cancel ${titles.length === 1 ? titles[0] : 'what they overlap'}`
}

const inSeries = (row: EventRow | null): row is EventRow & { series_id: string; event_date: string } =>
  !!row?.series_id && !!row.event_date

function ScopeChoice({ scope, onChange }: { scope: Scope; onChange: (s: Scope) => void }) {
  return (
    <div className="flex gap-2 flex-wrap" role="group" aria-label="Which weeks">
      <Chip on={scope === 'one'} onClick={() => onChange('one')}>Only this week</Chip>
      <Chip on={scope === 'following'} onClick={() => onChange('following')}>This and following weeks</Chip>
    </div>
  )
}

export default function CoachSchedule() {
  // TRAK-85: parked, so actions say "Coming soon" and send nothing.
  const { parked, comingSoon } = useParked()
  const navigate = useNavigate()
  const { user } = useAuth()
  // TRAK-176: the squad picked; its events and the whole-roster ones show, and new ones are saved for it.
  const coachSquad = useCoachSquad(user?.id)

  // Calendar view state
  const today = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selected,  setSelected]  = useState<string>(toDateStr(today))

  // Data
  const [calEvents, setCalEvents] = useState<EventRow[]>([])
  // Every squad's events: the overlap rule is per coach, not per squad (TRAK-218).
  const [coachEvents, setCoachEvents] = useState<EventRow[]>([])
  const [sessions,  setSessions]  = useState<any[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const [sheet, setSheet] = useState<Sheet>({ kind: 'closed' })
  const [saving, setSaving] = useState(false)

  /** Reads the calendar; returns the coach's events, or null when the read failed. */
  const loadData = async (): Promise<EventRow[] | null> => {
    if (!user) return null
    const [ev, sess] = await Promise.all([
      supabase.from('coach_calendar_events')
        .select('*').eq('coach_user_id', user.id).order('starts_at'),
      supabase.from('coach_sessions')
        // coach_sessions has no opponent column; naming one failed the whole read.
        .select('id, title, session_type, session_date, competition, venue, notes, event_id, squad')
        .eq('coach_user_id', user.id).order('session_date'),
    ])
    // A failed read is not an empty calendar (the J4 standard).
    setLoadFailed(!!ev.error || !!sess.error)
    const events = ev.error ? null : (ev.data as EventRow[]) || []
    if (events) {
      setCoachEvents(events)
      setCalEvents(events.filter(e => coachSquad.eventInSquad(e.squad)))
    }
    if (!sess.error) setSessions((sess.data || []).filter(s => coachSquad.eventInSquad(s.squad)))
    return events
  }

  useEffect(() => { loadData() }, [user, coachSquad.squad])

  // TRAK-139 (J8.16): the squad for the WhatsApp message title ("U15 Match"),
  // and its children's names, so coach-typed text naming one stays out.
  // Optional: a failed read leaves "Squad" and no reason, and never blocks
  // the calendar.
  const [squad, setSquad] = useState<{ label: string, childNames: string[] | null }>({ label: 'Squad', childNames: null })
  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase.from('squad_players').select('age_group, player_name, status').eq('coach_user_id', user.id)
      .then(({ data, error }) => {
        if (cancelled || error) return
        const rows = (data ?? []) as { age_group: string | null, player_name: string | null, status: string | null }[]
        setSquad({ label: squadLabelFrom(rows), childNames: rows.map(r => r.player_name ?? '').filter(Boolean) })
      })
    return () => { cancelled = true }
  }, [user])
  // TRAK-161: tell the coach as they type when families won't see the note.
  const noteProblem = sheet.kind === 'edit' ? familyNoteProblem(sheet.form.familyNote, squad.childNames) : null
  // TRAK-127: said as soon as a past day is picked, with the two logs.
  const datePassed = sheet.kind === 'edit' ? pastProblem(sheet.form, sheet.row) : null
  const logInstead = (to: 'match' | 'training') => {
    if (sheet.kind !== 'edit') return
    const { date, opponent, homeAway } = sheet.form
    setSheet({ kind: 'closed' })
    if (to === 'match') navigate('/coach/sessions/quick', { state: { fromEvent: { date, opponent: opponent.trim() || null, homeAway: homeAway || null } } })
    else navigate('/coach/sessions/add', { state: { logDate: date } })
  }

  const retry = async () => { setRetrying(true); await loadData(); setRetrying(false) }

  // Normalise both data sources into CalEvent[]
  const allEvents = useMemo<CalEvent[]>(() => {
    const ev: CalEvent[] = []
    for (const e of calEvents) {
      const shown = displayEventTime(e)
      ev.push({
        id:       e.id,
        title:    e.title,
        type:     (e.event_type in TYPE_LABEL ? e.event_type : 'other') as ShownType,
        date:     shown.date,
        // undefined rather than null keeps the existing "no time set" rendering.
        time:     shown.time ?? undefined,
        source:   'calendar',
        row:      e,
        opponent: e.opponent ?? undefined,
        venue:    e.venue ?? undefined,
      })
    }
    for (const s of sessions) {
      // A register's session is shown on its event, not as a second entry.
      if (s.event_id && calEvents.some(e => e.id === s.event_id)) continue
      ev.push({
        id:       s.id,
        title:    s.title || (s.session_type === 'match' ? 'Match' : 'Training'),
        type:     (s.session_type === 'match' ? 'match' : s.session_type === 'training' ? 'training' : 'other') as ShownType,
        date:     s.session_date ?? '',
        source:   'session',
        venue:    s.venue,
      })
    }
    return ev.filter(e => e.date)
  }, [calEvents, sessions])

  // TRAK-138: the completed session each event's register made, by event.
  const registerSession = useMemo(() => new Map<string, string>(
    sessions.filter(s => s.event_id).map(s => [s.event_id as string, s.id as string])), [sessions])

  const venues = useMemo(() => savedVenues(calEvents), [calEvents])
  // TRAK-218: each draft that would be refused says so, before Publish is tapped.
  const clashes = useMemo(() => draftClashes(coachEvents), [coachEvents])
  // TRAK-129 (J8.6): fixtures already on the schedule are skipped on import.
  const fixtureKeys = useMemo(() => scheduleFixtureKeys(calEvents), [calEvents])

  // Index events by date string for fast lookup
  const byDate = useMemo<Record<string, CalEvent[]>>(() => {
    const map: Record<string, CalEvent[]> = {}
    for (const e of allEvents) {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    }
    return map
  }, [allEvents])


  const selectedEvents = byDate[selected] ?? []

  const openNew = (date: string) =>
    setSheet({ kind: 'edit', row: null, form: blankForm(date), repeat: blankRepeat(date), scope: 'one', step: 0, error: null })
  // TRAK-182 (live run 3): an edit opens on the first step, filled in, not on Review.
  const openEdit = (row: EventRow) =>
    setSheet({ kind: 'edit', row, form: rowToForm(row), repeat: blankRepeat(''), scope: 'one', step: 0, error: null })
  const setForm = (patch: Partial<EventForm>) =>
    setSheet(s => {
      if (s.kind !== 'edit') return s
      // Until the coach turns repeat on, its weekday follows the first date.
      // A match never repeats: picking Match switches the repeat off, so a
      // hidden repeat can't save a series of identical matches.
      const repeat = patch.kind === 'match' ? { ...s.repeat, on: false }
        : patch.date && !s.repeat.on ? blankRepeat(patch.date) : s.repeat
      return { ...s, form: { ...s.form, ...patch }, repeat, error: null }
    })
  const setRepeat = (patch: Partial<Repeat>) =>
    setSheet(s => s.kind === 'edit' ? { ...s, repeat: { ...s.repeat, ...patch }, error: null } : s)
  const toggleDay = (day: number) =>
    setSheet(s => {
      if (s.kind !== 'edit') return s
      const days = s.repeat.days.includes(day) ? s.repeat.days.filter(d => d !== day) : [...s.repeat.days, day].sort()
      return { ...s, repeat: { ...s.repeat, days }, error: null }
    })

  const saveEvent = async (publishNow = false) => {
    if (parked) return comingSoon()
    if (!user || sheet.kind !== 'edit') return
    const { row: editing, form, repeat, scope } = sheet
    const problem = formProblem(form) ?? pastProblem(form, editing) ?? (editing ? null : repeatProblem(form, repeat))
    if (problem) { setSheet({ ...sheet, error: problem }); return }

    // This and following weeks: each week keeps its own date and takes the rest.
    if (editing && scope === 'following' && inSeries(editing)) {
      if (form.date !== rowToForm(editing).date) {
        setSheet({ ...sheet, error: 'To move the day, change only this week.' })
        return
      }
      const targets = thisAndFollowing(calEvents, editing)
      setSaving(true)
      const results = await Promise.all(targets.map(t =>
        supabase.from('coach_calendar_events')
          .update(formToRow({ ...form, date: displayEventTime(t).date })).eq('id', t.id).select('id')))
      setSaving(false)
      loadData()
      // Even a partial save may have changed a published week (TRAK-135).
      if (targets.some(t => t.published)) askToEmailFamilies()
      const saved = results.filter(r => !failed(r.error, r.data)).length
      if (saved < targets.length) {
        // Saving again rewrites every week the same way, so it is safe to retry;
        // a week refused for a clash needs the time changed first.
        const clash = results.map(r => clashMessage(r.error) ?? lockedMessage(r.error)).find(Boolean)
        setSheet({ ...sheet, error: `Saved ${saved} of ${targets.length} weeks. ${clash ?? 'Check your connection and save again.'}` })
        return
      }
      setSheet({ kind: 'closed' })
      if (publishNow) return publishSaved(targets.filter(t => !t.published && t.status === 'scheduled').map(t => t.id))
      toast.success(`Saved ${saved} weeks.${targets.some(t => t.published) ? ' Families see the change.' : ''}`)
      return
    }

    if (!editing && !coachSquad.ready) { setSheet({ ...sheet, error: coachSquad.retry() }); return }
    setSaving(true)
    const fresh = newDraftFields(user.id, coachSquad.squad)
    const series = !editing && repeat.on && form.kind !== 'match'
    const rows = series
      ? seriesRows(form, repeat, crypto.randomUUID()).map(r => ({ ...r, ...fresh }))
      : [{ ...formToRow(form), ...fresh }]
    // New events start as drafts; an edit leaves published alone, so a
    // published event's change goes live on save.
    const { data, error } = editing
      ? await supabase.from('coach_calendar_events').update(formToRow(form)).eq('id', editing.id).select('id')
      : await supabase.from('coach_calendar_events').insert(rows).select('id')
    setSaving(false)
    // Errors keep what was typed and say what failed (the J4 standard). A
    // series is one insert, so it saves whole or not at all.
    if (failed(error, data) || (!editing && data!.length !== rows.length)) { setSheet({ ...sheet, error: clashMessage(error) ?? lockedMessage(error) ?? SAVE_FAILED }); return }
    setSheet({ kind: 'closed' })
    setSelected(form.date)
    if (publishNow && !editing?.published) return publishSaved(editing ? [editing.id] : data!.map(r => r.id))
    loadData()
    if (editing?.published) askToEmailFamilies()
    toast.success(editing
      ? editing.published ? 'Saved. Families see the change.' : 'Draft saved'
      : series ? `Saved ${rows.length} events as drafts. Tap Publish when they’re ready.`
        : 'Saved as a draft. Tap Publish when it’s ready.')
  }

  /** Review's Publish: what was just saved goes out, as the list's Publish does.
      The save stands either way; a refused publish (a clash, TRAK-158) leaves
      drafts, published later from the list. */
  const publishSaved = async (ids: string[]) => {
    const { data, error } = await supabase.from('coach_calendar_events').update({ published: true }).in('id', ids).select('id')
    const rows = await loadData()
    // TRAK-218: one update, so a refusal publishes none of the series. Say
    // which week clashes in a box that stays, not a toast that goes.
    const refusal = clashMessage(error)
    if (ids.length > 1 && refusal) {
      setSheet({ kind: 'notPublished', count: ids.length, weeks: clashingWeeks(ids, rows ?? []), refusal })
      return
    }
    if (failed(error, data)) {
      toast.error(`Saved as ${ids.length > 1 ? 'drafts' : 'a draft'}, not published. ${clashMessage(error) ?? 'Tap Publish on the event to try again.'}`)
      return
    }
    toast.success(ids.length > 1 ? `Published ${ids.length} events to the squad` : 'Published to the squad')
  }

  const toStep = (step: number) => setSheet(s => s.kind === 'edit' ? { ...s, step, error: null } : s)
  const nextStep = () => {
    if (sheet.kind !== 'edit') return
    const problem = stepProblem(sheet.step, sheet.form, sheet.repeat, sheet.row)
    if (problem) setSheet({ ...sheet, error: problem })
    else toStep(sheet.step + 1)
  }

  const publish = async (row: EventRow) => {
    if (parked) return comingSoon()
    if (inSeries(row)) { setSheet({ kind: 'series', action: 'publish', row, error: null }); return }
    const { data, error } = await supabase.from('coach_calendar_events')
      .update({ published: true }).eq('id', row.id).select('id')
    if (failed(error, data)) { toast.error(clashMessage(error) ?? `Couldn't publish "${row.title}". Try again.`); return }
    loadData()
    toast.success('Published to the squad')
  }

  // TRAK-182 part 8: the quick-add's "More details" opens a new event here
  // with what the coach typed, on its first step.
  const location = useLocation()
  useEffect(() => {
    const quick = (location.state as { quickEvent?: Partial<EventForm> } | null)?.quickEvent
    if (!quick) return
    const date = quick.date || toDateStr(new Date())
    setSelected(date)
    setSheet({ kind: 'edit', row: null, form: { ...blankForm(date), ...quick }, repeat: blankRepeat(date), scope: 'one', step: 0, error: null })
    navigate(location.pathname + location.search, { replace: true, state: null })
  }, [location.state]) // eslint-disable-line react-hooks/exhaustive-deps -- on arrival, and on a new hand-over while here

  // TRAK-182: the event sheet on Home sends Edit (?edit=<id>), Cancel
  // (?cancel=<id>) and a weekly series' Publish (?publish=<id>, which asks
  // this week or following) here, to Schedule's own sheets.
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const action = (['edit', 'publish', 'cancel', 'register'] as const).find(a => params.has(a))
    const row = action ? calEvents.find(r => r.id === params.get(action)) : undefined
    if (!row) return
    setParams({}, { replace: true })
    if (row.event_date) {
      const [y, m] = row.event_date.split('-').map(Number)
      setViewYear(y); setViewMonth(m - 1); setSelected(row.event_date)
    }
    // TRAK-230: a started event isn't edited or cancelled, whatever the link says.
    if ((action === 'edit' || action === 'cancel') && startedLocked(row)) toast.error(STARTED_LOCKED)
    else if (action === 'edit') openEdit(row)
    else if (action === 'cancel') setSheet({ kind: 'cancel', row, reason: '', scope: 'one', error: null })
    // The quick-add's Take register (TRAK-182 part 8): only when it can open.
    else if (action === 'register') { if (!registerProblem(row)) setSheet({ kind: 'register', row }) }
    else void publish(row)
  }, [calEvents, params]) // eslint-disable-line react-hooks/exhaustive-deps -- once the rows load, and on a new link while here

  const confirmCancel = async () => {
    if (parked) return comingSoon()
    if (sheet.kind !== 'cancel') return
    const { row, scope } = sheet
    setSaving(true)
    const following = scope === 'following' && inSeries(row)
    const update = supabase.from('coach_calendar_events').update(cancelPatch(sheet.reason))
    // This and following: cancel only what families have seen. A draft week
    // cancelled would be stuck on the schedule (only drafts can be deleted),
    // so the drafts in the range are deleted instead.
    const { data, error } = following
      ? await update.eq('series_id', row.series_id).gte('event_date', row.event_date)
          .eq('status', 'scheduled').eq('published', true).select('id')
      : await update.eq('id', row.id).select('id')
    if (failed(error, data)) {
      setSaving(false)
      setSheet({ ...sheet, error: lockedMessage(error) ?? "Couldn't cancel the event. Check your connection and try again." })
      return
    }
    // Zero drafts is normal here, so only an error counts as a failure.
    const { data: removedDrafts, error: draftError } = following
      ? await supabase.from('coach_calendar_events').delete().eq('series_id', row.series_id)
          .gte('event_date', row.event_date).eq('published', false).eq('status', 'scheduled').select('id')
      : { data: null, error: null }
    setSaving(false)
    loadData()
    // A cancelled published event emails its families (TRAK-135); "this and
    // following" may reach published weeks after a draft one.
    if (row.published || following) askToEmailFamilies()
    if (draftError) {
      setSheet({ ...sheet, error: `Cancelled ${data!.length} published events, but couldn't remove the unpublished drafts after them. Delete them from the schedule.` })
      return
    }
    const removed = removedDrafts?.length ?? 0
    const note = (data!.length > 1
      ? `${data!.length} events cancelled. They stay on the schedule as Cancelled.`
      : 'Event cancelled. It stays on the schedule as Cancelled.')
      + (removed ? ` ${removed} unpublished draft${removed > 1 ? 's' : ''} removed.` : '')
    // TRAK-168 (Imad, 17 and 18 Oct): after cancelling, the coach tells the team
    // group, so the cancelled published event is offered straight to share.
    // "This and following" shares this week's event only; later weeks get no message.
    if (row.published) {
      setSheet({ kind: 'cancelled', row: { ...row, ...cancelPatch(sheet.reason) }, note })
      return
    }
    setSheet({ kind: 'closed' })
    toast.success(note)
  }

  /** Publish or delete a week of a series: only this week, or this and following. */
  const seriesAction = async (scope: Scope) => {
    if (parked) return comingSoon()
    if (sheet.kind !== 'series' || !inSeries(sheet.row)) return
    const { action, row } = sheet
    const table = supabase.from('coach_calendar_events')
    const query = action === 'publish' ? table.update({ published: true }) : table.delete()
    // Only drafts still scheduled: a published week is never deleted, and a
    // cancelled one stays as it is.
    const { data, error } = scope === 'one'
      ? await query.eq('id', row.id).select('id')
      : await query.eq('series_id', row.series_id).gte('event_date', row.event_date)
          .eq('published', false).eq('status', 'scheduled').select('id')
    if (failed(error, data)) {
      // TRAK-218: a refused "this and following" publishes none; name the week that clashes.
      const drafts = coachEvents.filter(r => r.series_id === row.series_id && r.event_date! >= row.event_date
        && !r.published && r.status === 'scheduled')
      const weeks = scope === 'following' && clashMessage(error) ? clashingWeeks(drafts.map(r => r.id), coachEvents) : []
      setSheet({ ...sheet, error: weeks.length
        ? `None of the ${drafts.length} drafts went out: ${weeks.map(overlapLine).join(' ')} ${fixLine(weeks)}, then publish again.`
        : clashMessage(error) ?? `Couldn't ${action} "${row.title}". Check your connection and try again.` })
      return
    }
    setSheet({ kind: 'closed' })
    loadData()
    const n = data!.length
    toast.success(action === 'publish'
      ? n > 1 ? `Published ${n} events to the squad` : 'Published to the squad'
      : n > 1 ? `Deleted ${n} drafts` : 'Draft deleted')
  }

  const deleteDraft = async (row: EventRow) => {
    if (parked) return comingSoon()
    if (!canDelete(row)) return
    if (inSeries(row)) { setSheet({ kind: 'series', action: 'delete', row, error: null }); return }
    const { data, error } = await supabase.from('coach_calendar_events').delete().eq('id', row.id).select('id')
    if (failed(error, data)) { toast.error(`Couldn't delete "${row.title}". Try again.`); return }
    if (sheet.kind === 'edit' && sheet.row?.id === row.id) setSheet({ kind: 'closed' })
    loadData()
    toast.success('Draft deleted')
  }

  // TRAK-129 (J8.6): one insert for the whole file, so it saves whole or not
  // at all. FixtureImport keeps every row and says so if this throws.
  const importFixtures = async (fixtures: Fixture[]) => {
    if (!user) throw new Error('Not signed in')
    if (!coachSquad.ready) throw new Error(coachSquad.retry())
    const rows = fixtureInsertRows(fixtures, user.id).map(row => ({ ...row, squad: coachSquad.squad }))
    const { data, error } = await supabase.from('coach_calendar_events').insert(rows).select('id')
    if (error || (data?.length ?? 0) !== rows.length) throw new Error("Couldn't save the fixtures")
    toast.success(`Added ${rows.length} ${rows.length === 1 ? 'fixture' : 'fixtures'} as drafts. Publish each when it's ready.`)
    await loadData()
  }

  return (
    <MobileShell>
      <div className="pt-3 pb-28 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-light text-ink tracking-tight"
            style={{ ...font, letterSpacing: '-0.02em' }}>
            Calendar
          </h1>
          <div className="flex items-center gap-2">
            {/* TRAK-162: the CSV import is parked; no coach is offered it. */}
            {FIXTURE_IMPORT_ENABLED && <button
              onClick={() => (parked ? comingSoon() : setSheet({ kind: 'import' }))}
              className="flex items-center justify-center w-8 h-8 rounded-full"
              style={{ background: 'rgb(var(--t-raised))' }}
              aria-label="Import fixtures">
              <FileUp size={15} color="rgb(var(--t-ink))" />
            </button>}
            <button
              onClick={() => openNew(selected)}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-brand"
              aria-label="Add event">
              <Plus size={16} color="rgb(var(--t-on-brand))" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {loadFailed && <LoadError what="your calendar" onRetry={retry} retrying={retrying} />}

        {/* ── Month (Arc calendar, TRAK-182) ───────────────────────────────── */}
        <div className="arc rounded-[18px] border border-line overflow-hidden" style={{ background: 'rgb(var(--t-surface))' }}>
          <div className="flex justify-center px-2 pt-2">
            <Calendar locale="en-GB" showToday
              value={new Date(`${selected}T12:00:00`)} onChange={date => setSelected(toDateStr(date))}
              month={new Date(viewYear, viewMonth, 1)}
              onMonthChange={month => { setViewYear(month.getFullYear()); setViewMonth(month.getMonth()) }}
              marks={date => (byDate[toDateStr(date)] ?? []).map(ev => ev.row && isCancelled(ev.row) ? { color: CANCELLED_COLOR, hollow: true } : TYPE_COLOR[ev.type])} />
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-line">
            {EVENT_KINDS.map(type => (
              <div key={type} className="flex items-center gap-1.5">
                <div className="w-[6px] h-[6px] rounded-full" style={{ background: TYPE_COLOR[type] }} />
                <span className="text-[8px] uppercase tracking-[0.08em]"
                  style={{ ...mono, color: 'rgb(var(--t-ink-3))' }}>
                  {TYPE_LABEL[type]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Selected day ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-medium tracking-[0.1em] uppercase text-ink-3" style={mono}>
              {formatEventDay(selected)}
            </span>
            <button
              onClick={() => openNew(selected)}
              className="text-[9px] tracking-[0.1em] uppercase text-brand"
              style={mono}>
              + Add
            </button>
          </div>

          {selectedEvents.length === 0 ? (
            <div className="rounded-[14px] border border-line px-4 py-5 text-center"
              style={{ background: 'rgb(var(--t-surface))' }}>
              <p className="text-[12px] text-ink-3">Nothing planned. Tap + Add to schedule an event.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map(ev => {
                const row = ev.row
                const cancelled = !!row && isCancelled(row)
                return (
                  <div key={ev.id}
                    className="rounded-[14px] px-4 py-3 flex items-start gap-3"
                    style={{ background: 'rgb(var(--t-surface))', border: '1px solid rgb(var(--t-line))' }}>
                    <div className="w-1 self-stretch rounded-full flex-shrink-0"
                      style={{ background: cancelled ? CANCELLED_COLOR : TYPE_COLOR[ev.type], minHeight: 28 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate"
                        style={{ color: 'rgb(var(--t-ink))', ...font, textDecoration: cancelled ? 'line-through' : undefined }}>
                        {ev.title}
                      </p>
                      <p className="text-[9px] mt-0.5" style={{ ...mono, color: 'rgb(var(--t-ink-3))' }}>
                        {/* TRAK-159: a scheduled event says its time, or that it has none. */}
                        {ev.time
                          ? <><span className="text-[11px] font-medium" style={{ color: 'rgb(var(--t-ink))' }}>{ev.time}</span>{' · '}</>
                          : row && <><span className="text-[10px] font-medium" style={{ color: NO_TIME_COLOR }}>No time set</span>{' · '}</>}
                        {TYPE_LABEL[ev.type]}{row?.series_id ? ' · Weekly' : ''}
                        {row?.meet_time ? ` · meet ${row.meet_time.slice(0, 5)}` : ''}
                        {row?.home_away ? ` · ${row.home_away === 'home' ? 'Home' : 'Away'}` : ''}
                        {ev.venue ? ` · ${ev.venue}` : ''}
                      </p>
                      {row?.kit && (
                        <p className="text-[9px] mt-0.5" style={{ ...mono, color: 'rgb(var(--t-ink-3))' }}>Kit: {row.kit}</p>
                      )}
                      {ev.source === 'session' && (
                        <span className="text-[8px] tracking-[0.06em] uppercase mt-0.5 inline-block"
                          style={{ color: 'rgb(var(--t-ink-3))', ...mono }}>
                          Logged
                        </span>
                      )}
                      {row && (
                        <span className="text-[8px] tracking-[0.06em] uppercase mt-0.5 inline-block"
                          style={{ color: cancelled ? CANCELLED_COLOR : row.published ? 'rgb(var(--t-brand))' : 'rgb(var(--t-ink-3))', ...mono }}>
                          {cancelled ? 'Cancelled' : row.published ? 'Published' : 'Draft · only you see this'}
                        </span>
                      )}
                      {row && !cancelled && clashes.has(row.id) && (() => {
                        const c = clashes.get(row.id)!
                        return <p className="text-[11px] mt-0.5 text-warning" style={font}>
                          {`Clashes with ${c.title}, ${c.start}–${c.end}. Change the time to publish it.`}
                        </p>
                      })()}
                      {row?.published && !cancelled && user && <EventAbsences coachId={user.id} eventId={row.id} />}
                      {cancelled && row?.cancel_reason && (
                        <p className="text-[11px] mt-0.5 text-ink-3" style={font}>{row.cancel_reason}</p>
                      )}
                      {row && !registerProblem(row) && (
                        <button onClick={parked ? comingSoon : () => setSheet({ kind: 'register', row })}
                          aria-label={`${registerSession.has(row.id) ? 'Edit register' : 'Take register'} for ${row.title}`}
                          className="mt-2 block text-[10px] tracking-[0.08em] uppercase text-brand" style={mono}>
                          {registerSession.has(row.id) ? 'Register taken · Edit' : 'Take register'}
                        </button>
                      )}
                      {/* TRAK-138: a logged match is its event, so it's logged once. */}
                      {row && row.event_type === 'match' && registerSession.has(row.id) && (
                        <p className="mt-2 text-[10px] tracking-[0.08em] uppercase text-ink-3" style={mono}>Match logged</p>
                      )}
                      {row && row.event_type === 'match' && row.published && !cancelled && hasStarted(row) && !registerSession.has(row.id) && (
                        <button aria-label={`Log match for ${row.title}`}
                          onClick={parked ? comingSoon : () => navigate('/coach/sessions/quick', {
                            state: { fromEvent: { eventId: row.id, date: row.event_date, opponent: row.opponent, homeAway: row.home_away, squad: row.squad ?? null } },
                          })}
                          className="mt-2 block text-[10px] tracking-[0.08em] uppercase text-success" style={mono}>
                          Log match
                        </button>
                      )}
                    </div>
                    {row && !cancelled && (
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {/* TRAK-230: once started, what families were told is fixed. */}
                        {!startedLocked(row) && <button onClick={() => openEdit(row)} aria-label={`Edit ${row.title}`}>
                          <Pencil size={14} color="rgb(var(--t-ink-2))" />
                        </button>}
                        {!row.published && (
                          <button onClick={() => publish(row)} aria-label={`Publish ${row.title}`}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium"
                            style={{ background: 'rgb(var(--t-brand))', color: 'rgb(var(--t-on-brand))', ...font }}>
                            <Send size={11} color="rgb(var(--t-on-brand))" />Publish
                          </button>
                        )}
                        {canDelete(row) ? (
                          <button onClick={() => deleteDraft(row)} aria-label={`Delete ${row.title}`}>
                            <Trash2 size={14} color="rgb(var(--t-ink-3))" />
                          </button>
                        ) : !startedLocked(row) && (
                          <button onClick={() => setSheet({ kind: 'cancel', row, reason: '', scope: 'one', error: null })}
                            aria-label={`Cancel ${row.title}`}>
                            <Ban size={14} color="rgb(var(--t-danger) / 0.8)" />
                          </button>
                        )}
                      </div>
                    )}
                    {/* TRAK-139 (J8.16), TRAK-168: Share opens the phone's share sheet (Viber
                        or WhatsApp; WhatsApp's link without one). Trak sends nothing; the
                        coach picks the group. Drafts have nothing to share yet. */}
                    {row?.published && (parked ? (
                      <button onClick={comingSoon} aria-label={`Share ${row.title}`} className="flex-shrink-0 text-ink-2">
                        <ShareIcon size={16} />
                      </button>
                    ) : (
                      <ShareEventButton text={whatsAppShareText(shareableFromRow(row, row.squad ?? squad.label), { childNames: squad.childNames })}
                        aria-label={`Share ${row.title}`} className="flex-shrink-0 text-brand">
                        <ShareIcon size={16} />
                      </ShareEventButton>
                    ))}
                    {ev.source === 'session' && (
                      <button
                        onClick={() => navigate('/coach/sessions/list')}
                        className="text-[9px] uppercase tracking-[0.08em] flex-shrink-0"
                        style={{ color: 'rgb(var(--t-ink-3))', ...mono }}>
                        View
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Event sheet: new or edit, one step per screen (TRAK-182) ──────── */}
      {sheet.kind === 'edit' && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: 'rgb(var(--t-scrim) / 0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setSheet({ kind: 'closed' }) }}>
          <div role="dialog" aria-label={sheet.row ? 'Edit event' : 'New event'}
            className="w-full max-w-[430px] rounded-t-[24px] px-5 pt-5 space-y-3 overflow-y-auto"
            style={{ background: 'rgb(var(--t-raised))', border: '1px solid rgb(var(--t-line))', maxHeight: '85vh', marginBottom: 64 }}>
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-medium text-ink" style={font}>
                {sheet.row ? 'Edit event' : 'New event'}
              </span>
              <button onClick={() => setSheet({ kind: 'closed' })} aria-label="Close">
                <X size={18} color="rgb(var(--t-ink-2))" />
              </button>
            </div>

            <div className="arc">
              <Stepper label="Event steps" steps={EVENT_STEPS} current={sheet.step} onStepSelect={toStep} />
            </div>

            {sheet.step === 0 && <>
              {/* An edit opens here, so a weekly series asks first which weeks change:
                  "This and following" keeps each week's own date (the When step). */}
              {inSeries(sheet.row) && (
                <ScopeChoice scope={sheet.scope}
                  onChange={scope => setSheet(s => s.kind === 'edit' ? { ...s, scope, error: null } : s)} />
              )}
              <div className="flex gap-2 flex-wrap" role="group" aria-label="Event type">
                {EVENT_KINDS.map(t => (
                  <Chip key={t} on={sheet.form.kind === t} color={TYPE_COLOR[t]} onClick={() => setForm({ kind: t })}>
                    {TYPE_LABEL[t]}
                  </Chip>
                ))}
              </div>

              {sheet.form.kind === 'training' && (
                <ThemeChoice theme={sheet.form.theme} onChange={theme => setForm({ theme })} />
              )}

              {sheet.form.kind === 'match' && (
                <>
                  <Field label="Opponent">
                    <input value={sheet.form.opponent} onChange={e => setForm({ opponent: e.target.value })}
                      placeholder="e.g. Al Wasl U15" className={inputClass} style={font} />
                  </Field>
                  <div className="flex gap-2" role="group" aria-label="Home or away">
                    <Chip on={sheet.form.homeAway === 'home'} onClick={() => setForm({ homeAway: sheet.form.homeAway === 'home' ? '' : 'home' })}>Home</Chip>
                    <Chip on={sheet.form.homeAway === 'away'} onClick={() => setForm({ homeAway: sheet.form.homeAway === 'away' ? '' : 'away' })}>Away</Chip>
                  </div>
                </>
              )}

              <Field label={sheet.form.kind === 'other' ? 'What is it' : 'Title (optional)'}>
                <input value={sheet.form.title} onChange={e => setForm({ title: e.target.value })}
                  placeholder={sheet.form.kind === 'match' ? `vs ${sheet.form.opponent || 'Opponent'}` : sheet.form.kind === 'training' ? 'Training' : 'e.g. Team photo'}
                  className={inputClass} style={font} />
              </Field>

              <Field label="Venue">
                <input value={sheet.form.venue} onChange={e => setForm({ venue: e.target.value })}
                  list="saved-venues" placeholder="Pick a saved venue or type a new one" className={inputClass} style={font} />
                <datalist id="saved-venues">
                  {venues.map(v => <option key={v} value={v} />)}
                </datalist>
              </Field>
            </>}

            {sheet.step === 1 && <>
              {/* TRAK-157: Arc's date and time pickers (founders, 12 Oct). A start
                  time is picked whole from the list; there is no "no time". */}
              <ArcField>
                <DatePicker label={sheet.repeat.on ? 'First date' : 'Date'} className="arc-trak-field"
                  value={dayAsDate(sheet.form.date)} onChange={date => { if (date) setForm({ date: dateAsDay(date) }) }}
                  disabled={sheet.scope === 'following'} clearable={false} placeholder="Pick a date"
                  format={{ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }} locale="en-GB" />
              </ArcField>
              <ArcField>
                <TimePicker label={sheet.form.kind === 'match' ? 'Kickoff' : 'Start'} className="arc-trak-field"
                  value={sheet.form.time} onChange={time => setForm({ time })}
                  minuteStep={5} format="12h" placeholder="Pick a start time" emptyAt="17:00" />
              </ArcField>

              {sheet.scope === 'following' && (
                <p className="text-[11px] text-ink-3" style={font}>Each week keeps its own date; everything else changes.</p>
              )}

              {/* Optional: empty means meet at the start time. */}
              <ArcField>
                <TimePicker label="Meet time (if earlier)" className="arc-trak-field"
                  value={sheet.form.meetTime} onChange={meetTime => setForm({ meetTime })}
                  minuteStep={5} format="12h" placeholder="Same as the start" emptyAt={halfHourBefore(sheet.form.time)}
                  disabled={!sheet.form.time} />
                {sheet.form.meetTime && (
                  <button type="button" onClick={() => setForm({ meetTime: '' })}
                    className="mt-1 text-[12px] text-ink-2" style={font}>
                    No separate meet time
                  </button>
                )}
              </ArcField>

              <div className="space-y-1">
                <span className="text-[9px] tracking-[0.1em] uppercase text-ink-3" style={mono}>Length</span>
                <div className="flex gap-2 flex-wrap" role="group" aria-label="Length">
                  {DURATIONS.map(d => (
                    <Chip key={d} on={sheet.form.duration === d} onClick={() => setForm({ duration: d })}>{d} min</Chip>
                  ))}
                </div>
              </div>

              {!sheet.row && sheet.form.kind !== 'match' && (
                <div className="space-y-2">
                  <Chip on={sheet.repeat.on} onClick={() => setRepeat({ on: !sheet.repeat.on })}>Repeats weekly</Chip>
                  {sheet.repeat.on && (
                    <>
                      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Repeat on">
                        {WEEKDAYS.map((label, day) => (
                          <Chip key={label} on={sheet.repeat.days.includes(day)} onClick={() => toggleDay(day)}>{label}</Chip>
                        ))}
                      </div>
                      <ArcField>
                        <DatePicker label="Ends on" className="arc-trak-field"
                          value={dayAsDate(sheet.repeat.until)} onChange={date => { if (date) setRepeat({ until: dateAsDay(date) }) }}
                          clearable={false} placeholder="Pick the last date"
                          format={{ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }} locale="en-GB" />
                      </ArcField>
                      {!repeatProblem(sheet.form, sheet.repeat) && (
                        <p className="text-[11px] text-ink-2" style={font}>
                          {seriesDates(sheet.form.date, sheet.repeat.until, sheet.repeat.days).length} events, last one {formatEventDay(sheet.repeat.until)}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </>}

            {sheet.step === 2 && <>
              {/* TRAK-161: kit and a family note on every kind of event. */}
              <Field label="Kit">
                <input value={sheet.form.kit} onChange={e => setForm({ kit: e.target.value })}
                  placeholder={sheet.form.kind === 'match' ? 'e.g. Red shirts, black shorts' : 'e.g. Green bibs, shin guards'} className={inputClass} style={font} />
              </Field>

              <div className="space-y-1">
                <Field label="Note for families">
                  <input value={sheet.form.familyNote} onChange={e => setForm({ familyNote: e.target.value })}
                    maxLength={FAMILY_NOTE_MAX} aria-describedby={noteProblem ? "family-note-hint family-note-problem" : "family-note-hint"}
                    placeholder="e.g. Bring extra water, it's a hot day" className={inputClass} style={font} />
                </Field>
                <p id="family-note-hint" className="text-[11px] text-ink-3" style={font}>
                  Players and parents see this. A note with a player's name or a link isn't shown to them.
                </p>
                {noteProblem && (
                  <p id="family-note-problem" role="status" className="text-[11px] text-warning" style={font}>
                    Families won't see this note: {noteProblem === 'link' ? 'it has a link' : 'it names a player'}.
                  </p>
                )}
              </div>
            </>}

            {sheet.step === REVIEW && <>
              {inSeries(sheet.row) && (
                <p className="text-[12px] text-ink-2" style={font}>
                  {sheet.scope === 'following' ? 'Saves this week and the following weeks.' : 'Saves only this week.'}
                </p>
              )}
              <EventSummary form={sheet.form} repeat={sheet.row ? null : sheet.repeat} noteProblem={noteProblem} />
            </>}

            {datePassed && (sheet.step === 1 || sheet.step === REVIEW) && (
              <div role="alert" className="rounded-[12px] p-3 space-y-2 border border-danger/30 bg-danger/[0.06]">
                <p className="text-[12px] text-danger" style={font}>{datePassed}</p>
                <div className="flex gap-2">
                  <Button size="md" variant="secondary" className="flex-1" onClick={() => logInstead('match')}>Log match</Button>
                  <Button size="md" variant="secondary" className="flex-1" onClick={() => logInstead('training')}>Log training</Button>
                </div>
              </div>
            )}

            {sheet.error && sheet.error !== datePassed && (
              <p role="alert" className="text-[12px] text-danger" style={font}>{sheet.error}</p>
            )}

            {sheet.step === REVIEW && sheet.row?.published && (
              <p className="text-[11px] text-ink-3" style={font}>Families see the change as soon as you save.</p>
            )}

            {/* The decision sits where the thumb is, as on the assessment. */}
            <div className="arc sticky bottom-0 -mx-5 px-5 pt-3 pb-5 flex gap-2 bg-raised border-t border-line">
              {sheet.step === REVIEW ? <>
                <Button size="lg" variant="secondary" aria-label={`Back to ${EVENT_STEPS[REVIEW - 1].label}`} onClick={() => toStep(REVIEW - 1)}>
                  <ChevronLeft size={18} aria-hidden="true" />
                </Button>
                {sheet.row?.published ? (
                  <Button size="lg" className="flex-1" loading={saving} disabled={!!datePassed} onClick={() => void saveEvent()}>Save changes</Button>
                ) : <>
                  <Button size="lg" variant="secondary" className="flex-1" loading={saving} disabled={!!datePassed} onClick={() => void saveEvent()}>
                    {seriesCount(sheet) > 1 ? `Save ${seriesCount(sheet)} drafts` : 'Save draft'}
                  </Button>
                  <Button size="lg" className="flex-1" loading={saving} disabled={!!datePassed} onClick={() => void saveEvent(true)}>
                    {seriesCount(sheet) > 1 ? `Publish ${seriesCount(sheet)}` : 'Publish'}
                  </Button>
                </>}
              </> : <>
                {sheet.step > 0 && (
                  <Button size="lg" variant="secondary" className="flex-1" aria-label={`Back to ${EVENT_STEPS[sheet.step - 1].label}`}
                    onClick={() => toStep(sheet.step - 1)}>Back</Button>
                )}
                <Button size="lg" className="flex-1" onClick={nextStep}>Next</Button>
              </>}
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel sheet ──────────────────────────────────────────────────── */}
      {sheet.kind === 'cancel' && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: 'rgb(var(--t-scrim) / 0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setSheet({ kind: 'closed' }) }}>
          <div role="dialog" aria-label="Cancel event"
            className="w-full max-w-[430px] rounded-t-[24px] p-5 space-y-3"
            style={{ background: 'rgb(var(--t-raised))', border: '1px solid rgb(var(--t-line))', marginBottom: 64 }}>
            <span className="text-[16px] font-medium text-ink block" style={font}>Cancel {sheet.row.title}?</span>
            <p className="text-[12px] text-ink-2" style={font}>
              It stays on everyone's schedule, marked Cancelled.
            </p>
            {inSeries(sheet.row) && (
              <ScopeChoice scope={sheet.scope}
                onChange={scope => setSheet(s => s.kind === 'cancel' ? { ...s, scope, error: null } : s)} />
            )}
            <Field label="Reason (optional)">
              <input value={sheet.reason}
                onChange={e => setSheet(s => s.kind === 'cancel' ? { ...s, reason: e.target.value, error: null } : s)}
                placeholder="e.g. Pitch waterlogged" className={inputClass} style={font} />
            </Field>
            {sheet.error && <p role="alert" className="text-[12px] text-danger" style={font}>{sheet.error}</p>}
            <button onClick={confirmCancel} disabled={saving}
              className="w-full py-3.5 rounded-[12px] text-[14px] font-medium"
              style={{ background: 'rgb(var(--t-danger))', color: 'rgb(var(--t-on-brand))', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Cancelling…' : 'Cancel event'}
            </button>
            <button onClick={() => setSheet({ kind: 'closed' })}
              className="w-full py-2 text-[13px] text-ink-2" style={font}>
              Keep event
            </button>
          </div>
        </div>
      )}

      {/* ── Cancelled: tell the team group (TRAK-168) ─────────────────────── */}
      {sheet.kind === 'cancelled' && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: 'rgb(var(--t-scrim) / 0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setSheet({ kind: 'closed' }) }}>
          <div role="dialog" aria-label="Event cancelled"
            className="w-full max-w-[430px] rounded-t-[24px] p-5 space-y-3"
            style={{ background: 'rgb(var(--t-raised))', border: '1px solid rgb(var(--t-line))', marginBottom: 64 }}>
            <span className="text-[16px] font-medium text-ink block" style={font}>Event cancelled</span>
            <p className="text-[12px] text-ink-2" style={font}>
              {sheet.note} Let the team group know.
            </p>
            {/* Nothing is sent until the coach picks a chat (the phone's share sheet, or WhatsApp's link). */}
            <ShareEventButton text={whatsAppShareText(shareableFromRow(sheet.row, sheet.row.squad ?? squad.label), { childNames: squad.childNames })}
              className="w-full py-3.5 rounded-[12px] text-[14px] font-medium flex items-center justify-center gap-2 bg-brand text-on-brand">
              <ShareIcon size={18} />Share
            </ShareEventButton>
            <button onClick={() => setSheet({ kind: 'closed' })}
              className="w-full py-2 text-[13px] text-ink-2" style={font}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Import sheet (TRAK-129, J8.6) ─────────────────────────────────── */}
      {sheet.kind === 'import' && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: 'rgb(var(--t-scrim) / 0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setSheet({ kind: 'closed' }) }}>
          <div role="dialog" aria-label="Import fixtures"
            className="w-full max-w-[430px] max-h-[85vh] overflow-y-auto rounded-t-[24px] p-5 space-y-3"
            style={{ background: 'rgb(var(--t-raised))', border: '1px solid rgb(var(--t-line))', marginBottom: 64 }}>
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-medium text-ink" style={font}>Import fixtures</span>
              <button onClick={() => setSheet({ kind: 'closed' })} aria-label="Close">
                <X size={18} className="text-ink-2" />
              </button>
            </div>
            <p className="text-[12px] text-ink-2" style={font}>
              Fixtures arrive as drafts. Families see each one once you publish it.
            </p>
            <FixtureImport existingKeys={fixtureKeys} onConfirm={importFixtures} />
          </div>
        </div>
      )}

      {/* ── Register sheet (TRAK-138, J8.15) ──────────────────────────────── */}
      {sheet.kind === 'register' && user && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: 'rgb(var(--t-scrim) / 0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setSheet({ kind: 'closed' }) }}>
          <div role="dialog" aria-label="Take register"
            className="w-full max-w-[430px] max-h-[85vh] overflow-y-auto rounded-t-[24px] p-5 space-y-3"
            style={{ background: 'rgb(var(--t-raised))', border: '1px solid rgb(var(--t-line))', marginBottom: 64 }}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[16px] font-medium text-ink" style={font}>
                {`Register: ${sheet.row.title}, ${formatEventDay(displayEventTime(sheet.row).date)}`}
              </span>
              <button onClick={() => setSheet({ kind: 'closed' })} aria-label="Close">
                <X size={18} className="text-ink-2" />
              </button>
            </div>
            <p className="text-[12px] text-ink-2" style={font}>
              Tap anyone who didn't come. Saving makes this the completed session; saving again updates it.
            </p>
            <TakeRegister eventId={sheet.row.id} coachId={user.id} sessionId={registerSession.get(sheet.row.id) ?? null} squad={sheet.row.squad ?? null}
              onSaved={() => { setSheet({ kind: 'closed' }); loadData() }} />
          </div>
        </div>
      )}

      {/* ── Series sheet: publish or delete which weeks ───────────────────── */}
      {sheet.kind === 'series' && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: 'rgb(var(--t-scrim) / 0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setSheet({ kind: 'closed' }) }}>
          <div role="dialog" aria-label={sheet.action === 'publish' ? 'Publish event' : 'Delete draft'}
            className="w-full max-w-[430px] rounded-t-[24px] p-5 space-y-3"
            style={{ background: 'rgb(var(--t-raised))', border: '1px solid rgb(var(--t-line))', marginBottom: 64 }}>
            <span className="text-[16px] font-medium text-ink block" style={font}>
              {sheet.action === 'publish' ? 'Publish' : 'Delete'} {sheet.row.title}, {formatEventDay(sheet.row.event_date!)}
            </span>
            <p className="text-[12px] text-ink-2" style={font}>
              {sheet.action === 'publish'
                ? 'This week is part of a weekly series. Families see what you publish.'
                : 'This week is part of a weekly series. Only drafts are deleted; published weeks stay.'}
            </p>
            {sheet.error && <p role="alert" className="text-[12px] text-danger" style={font}>{sheet.error}</p>}
            <button onClick={() => seriesAction('one')}
              className="w-full py-3 rounded-[12px] text-[14px] font-medium"
              style={{ background: sheet.action === 'publish' ? 'rgb(var(--t-brand))' : 'rgb(var(--t-raised))', color: sheet.action === 'publish' ? 'rgb(var(--t-on-brand))' : 'rgb(var(--t-ink))' }}>
              Only this week
            </button>
            <button onClick={() => seriesAction('following')}
              className="w-full py-3 rounded-[12px] text-[14px] font-medium"
              style={{ background: sheet.action === 'publish' ? 'rgb(var(--t-brand))' : 'rgb(var(--t-raised))', color: sheet.action === 'publish' ? 'rgb(var(--t-on-brand))' : 'rgb(var(--t-ink))' }}>
              This and following weeks
            </button>
            <button onClick={() => setSheet({ kind: 'closed' })}
              className="w-full py-2 text-[13px] text-ink-2" style={font}>
              Not now
            </button>
          </div>
        </div>
      )}

      {/* ── Not published: a refused series, until the coach closes it (TRAK-218) ── */}
      {sheet.kind === 'notPublished' && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: 'rgb(var(--t-scrim) / 0.75)' }}>
          <div role="dialog" aria-label="Not published"
            className="w-full max-w-[430px] rounded-t-[24px] p-5 space-y-3"
            style={{ background: 'rgb(var(--t-raised))', border: '1px solid rgb(var(--t-line))', marginBottom: 64 }}>
            <span className="text-[16px] font-medium text-ink block" style={font}>Not published</span>
            <p className="text-[12px] text-ink-2" style={font}>
              None of the {sheet.count} events went out. They’re saved as drafts only you can see.
            </p>
            {sheet.weeks.length ? <>
              <ul role="alert" className="space-y-1">
                {sheet.weeks.map(w => <li key={w.date} className="text-[12px] text-danger" style={font}>{overlapLine(w)}</li>)}
              </ul>
              <p className="text-[12px] text-ink-2" style={font}>
                {fixLine(sheet.weeks)}. Then tap Publish on the first week and choose This and following weeks.
              </p>
            </> : <p role="alert" className="text-[12px] text-danger" style={font}>{sheet.refusal}</p>}
            {sheet.weeks[0] && (
              <button onClick={() => {
                const date = sheet.weeks[0].date
                const [y, m] = date.split('-').map(Number)
                setViewYear(y); setViewMonth(m - 1); setSelected(date)
                setSheet({ kind: 'closed' })
              }}
                className="w-full py-3 rounded-[12px] text-[14px] font-medium"
                style={{ background: 'rgb(var(--t-brand))', color: 'rgb(var(--t-on-brand))' }}>
                Show {formatEventDay(sheet.weeks[0].date)}
              </button>
            )}
            <button onClick={() => setSheet({ kind: 'closed' })}
              className="w-full py-2 text-[13px] text-ink-2" style={font}>
              Close
            </button>
          </div>
        </div>
      )}

      <QuickAdd onSaved={loadData} />
      <NavBar role="coach" activeTab="/coach/schedule" onNavigate={p => navigate(p)} />
    </MobileShell>
  )
}
