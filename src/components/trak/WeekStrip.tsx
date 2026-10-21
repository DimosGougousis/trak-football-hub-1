import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { ChevronRight } from 'lucide-react'
import { LoadError } from '@/components/trak/LoadError'
import { eventHeading, toPlayerEvent, type PlayerEvent } from '@/lib/player-events'
// The coach calendar's colours (TRAK-159, founders 12 Oct): one constant everywhere.
import { CANCELLED_COLOR, EVENT_COLOR } from '@/lib/coach-events'

export interface StripEvent extends PlayerEvent {
  /** Coach only: a draft families can't see yet. */
  draft?: boolean
  /** A completed coach session, rather than a planned calendar entry. */
  sessionId?: string
  /** TRAK-231: this family said their child can't make it (their own report only). */
  absent?: boolean
}

/** TRAK-231: a dot per event. Cancelled is a hollow red ring; an event the
 *  family can't make keeps its colour but fades, beside the row's words. */
function dotStyle(event: StripEvent): CSSProperties {
  if (event.status === 'cancelled') return { background: 'transparent', border: `1.5px solid ${CANCELLED_COLOR}` }
  return { background: EVENT_COLOR[event.kind], opacity: event.absent ? 0.35 : 1 }
}

/** Monday to Sunday of the week `today` is in, as YYYY-MM-DD (Imad, 12 Oct). */
export function weekDays(today: Date): string[] {
  const monday = startOfWeek(today, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => format(addDays(monday, i), 'yyyy-MM-dd'))
}

/** How a role opens an event: a sheet around the row's trigger (TRAK-182), given a refresh for after a change. */
export type RenderEventSheet = (event: StripEvent, trigger: ReactElement, refresh: () => void) => ReactNode

/**
 * TRAK-163: this week, Monday to Sunday, under the Home header (the Therabody
 * strip). Today is selected; a day with events shows a dot per event; tapping
 * a day lists its events. TRAK-182: each event opens in a bottom sheet where
 * it is (not the calendar), a coach's logged session too (Imad, 16 Oct): it
 * used to jump straight to its saved record.
 */
export function WeekStrip({ events, renderSheet, refresh = () => {}, today = new Date() }: {
  events: StripEvent[]
  renderSheet: RenderEventSheet
  refresh?: () => void
  today?: Date
}) {
  const todayValue = format(today, 'yyyy-MM-dd')
  const [day, setDay] = useState(todayValue)
  const onDay = (date: string) => events.filter(event => event.date === date)
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
  const chosen = onDay(day)

  return (
    <section aria-label="This week" className="arc mb-5">
      <SegmentedControl className="arc-week" label="This week" value={day} onValueChange={setDay}
        options={weekDays(today).map(value => {
          const date = parseISO(value)
          const dots = onDay(value)
          // M T W T F S S, as in the Therabody strip; the full date is read out.
          return {
            value,
            label: format(date, 'EEEEE'),
            // TRAK-171 (Tarek, 16 Oct): today stays marked after another day is picked.
            accessory: <><span className={value === todayValue ? 'sr-only trak-today' : 'sr-only'}>{format(date, 'EEEE d MMMM')}{value === todayValue && ', today'}</span>{dots.length > 0 && <span className="inline-flex gap-[3px]" aria-label={`${dots.length} ${dots.length === 1 ? 'event' : 'events'}`}>
              {dots.slice(0, 3).map(event => <span key={event.id} aria-hidden="true" className="w-[6px] h-[6px] rounded-full"
                data-absent={event.absent || undefined} style={dotStyle(event)} />)}
            </span>}
            {/* TRAK-231: today keeps a brand bar under its letter, picked or not. */}
            {value === todayValue && <span data-today-mark aria-hidden="true" className="absolute inset-x-0 -bottom-[5px] h-[2px] rounded-full bg-brand" />}</>,
          }
        })} />
      <DayEvents day={day} today={day === todayValue} events={chosen} renderSheet={renderSheet} refresh={refresh} />
    </section>
  )
}

/** One day's events as rows, each opening its sheet: the week strip's list, and the player's month calendar (TRAK-171). */
export function DayEvents({ day, today = false, events, renderSheet, refresh = () => {} }: {
  day: string
  /** TRAK-231: the heading says "Today · …" on today. */
  today?: boolean
  events: StripEvent[]
  renderSheet: RenderEventSheet
  refresh?: () => void
}) {
  return <>
    <p className="text-[11px] tracking-[0.08em] uppercase text-ink-3 mt-3 mb-1" style={{ fontFamily: 'var(--t-font-mono)' }}>
      {today && 'Today · '}{format(parseISO(day), 'EEEE d MMMM')}
    </p>
    {events.length === 0 ? <p className="text-[13px] text-ink-3 py-2">Nothing planned.</p> : (
      <ul className="divide-y divide-line border-y border-line">
        {events.map(event => {
          const label = <>
            <span aria-hidden="true" className="w-[7px] h-[7px] rounded-full shrink-0" style={dotStyle(event)} />
            <span className="w-12 shrink-0 text-[13px] text-ink-2">{event.sessionId ? 'Logged' : event.time ?? 'TBC'}</span>
            <span className="flex-1 min-w-0 truncate text-[14px] text-ink">{eventHeading(event)}</span>
            {event.status === 'cancelled' && <span className="text-[12px]" style={{ color: CANCELLED_COLOR }}>Cancelled</span>}
            {event.draft && <span className="text-[12px] text-ink-3">Draft</span>}
            {event.absent && event.status !== 'cancelled' && <span className="text-[12px] text-ink-2">Can't make it</span>}
            <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-3" />
          </>
          const row = 'w-full flex items-center gap-3 min-h-12 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md'
          return <li key={event.id}>{renderSheet(event, <button type="button" className={row}>{label}</button>, refresh)}</li>
        })}
      </ul>
    )}
  </>
}

type WeekRows = PromiseLike<{ data: unknown[] | null; error: unknown }>

/**
 * The strip with its own read of this week, past days included (Home's lists
 * only load from today). `loadKey` names whose week it is. A failed read is
 * an error with Retry, never an empty week (the J4 standard).
 */
export function LoadedWeekStrip({ load, loadKey, renderSheet, absentFor }: {
  load: (from: string, to: string) => WeekRows
  loadKey: string
  renderSheet: RenderEventSheet
  /** TRAK-231: a family strip, for this child: mark the events their family said they can't make. */
  absentFor?: string
}) {
  const [events, setEvents] = useState<StripEvent[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let cancelled = false
    const days = weekDays(new Date())
    setFailed(false)
    // A reload (after Publish in the sheet) keeps the week on screen, so an open
    // sheet stays open. Another person's week remounts: callers key by loadKey.
    loadRef.current(days[0], days[6]).then(({ data, error }) => {
      if (cancelled) return
      if (error) { setFailed(true); return }
      setEvents((data ?? []).flatMap(row => {
        const event = toPlayerEvent(row as Record<string, unknown>)
        const source = row as { published?: boolean; sessionId?: string }
        return event ? [{ ...event, draft: source.published === false, sessionId: source.sessionId }] : []
      }))
    }, () => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [loadKey, attempt])

  if (failed) return <div className="mb-4"><LoadError what="this week" onRetry={() => setAttempt(n => n + 1)} /></div>
  if (!events) return null
  const refresh = () => setAttempt(n => n + 1)
  return absentFor
    ? <FamilyWeekStrip childId={absentFor} events={events} renderSheet={renderSheet} refresh={refresh} />
    : <WeekStrip events={events} renderSheet={renderSheet} refresh={refresh} />
}

/** TRAK-231: a family's strip, with the events their child can't make marked. A failed read marks none. */
function FamilyWeekStrip({ childId, events, renderSheet, refresh }: {
  childId: string
  events: StripEvent[]
  renderSheet: RenderEventSheet
  refresh: () => void
}) {
  const eventIds = events.map(event => event.id)
  // Keyed under CantMakeIt's ['parent', 'absence', child], so a report or an undo in the sheet refreshes it.
  const absences = useQuery({
    queryKey: ['parent', 'absence', childId, 'week', eventIds.join(',')],
    queryFn: ({ signal }) => fetchOwnAbsences(childId, eventIds, signal),
    enabled: eventIds.length > 0,
  })
  const absent = absences.data
  return <WeekStrip events={absent ? events.map(event => ({ ...event, absent: absent.has(event.id) })) : events}
    renderSheet={renderSheet} refresh={refresh} />
}

/** The events this child's family (or the child, for themselves) said they can't make: their own rows only. */
async function fetchOwnAbsences(childId: string, eventIds: string[], signal: AbortSignal): Promise<Set<string>> {
  const squad = await supabase.from('squad_players').select('id').eq('linked_player_id', childId).abortSignal(signal)
  if (squad.error) throw squad.error
  const ids = (squad.data ?? []).map(row => row.id)
  if (!ids.length) return new Set()
  const { data, error } = await supabase.from('event_absences').select('event_id')
    .in('event_id', eventIds).in('squad_player_id', ids).abortSignal(signal)
  if (error) throw error
  return new Set((data ?? []).map(row => row.event_id))
}
