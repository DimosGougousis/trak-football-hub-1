import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { addDays, format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useFeature } from '@/components/trak/parked'
import { weekDays, type StripEvent } from '@/components/trak/WeekStrip'
import { EventSheet } from '@/components/trak/EventSheet'
import { LoadError } from '@/components/trak/LoadError'
import { EventSheetCoach } from '@/components/coach/EventSheetCoach'
import { SessionLog } from '@/components/coach/SessionLog'
import { TakeRegister } from '@/components/coach/TakeRegister'
import { BottomSheet } from '@/components/arc/bottom-sheet/bottom-sheet'
import { ShareEventButton, ShareIcon } from '@/components/coach/ShareEventButton'
import { Button } from '@/components/arc/button/button'
import { WeekPicker, type WeekDay } from '@/components/arc/blocks/availability-picker/week-picker'
import { useCoachSquad } from '@/lib/coach-squad'
import { coachWeek, type WeekItem, type WeekSession } from '@/lib/coach-week'
import { publishEvent } from '@/lib/event-publish'
import { shareableFromRow, squadLabelFrom, whatsAppShareText } from '@/lib/event-share'
import { eventHeading, toPlayerEvent } from '@/lib/player-events'
import type { EventRow } from '@/lib/coach-events'

/**
 * TRAK-163: the coach's week on Home, drafts included, so the schedule is visible without hunting for it.
 * TRAK-262 (Imad, 22 Oct): as Arc's week picker in Tarek's colour key, with one next step per event beside
 * Details, which opens the event sheet (TRAK-182) with everything else. Only where events are on.
 */
export function CoachWeekStrip({ coachId, version = 0, everySquad = false }: {
  coachId: string
  /** A new version (the "+" saved a draft) reloads the week in place. */
  version?: number
  /** TRAK-262: Home's All pill. */
  everySquad?: boolean
}) {
  const eventsOn = useFeature('events')
  const { squad, eventInSquad } = useCoachSquad(coachId)
  if (!eventsOn) return null
  // Another coach remounts, so a late answer for the last one never shows.
  return <CoachWeek key={coachId} coachId={coachId} version={version}
    inView={everySquad ? () => true : eventInSquad} squadLabel={everySquad ? 'All squads' : squad} />
}

async function loadWeek(coachId: string, from: string, to: string): Promise<{ events: EventRow[]; sessions: WeekSession[] }> {
  // Every squad's events: a draft's clash counts them all, as the database does (TRAK-218). A day either side, as a
  // late or early event can fall in this week on this phone's clock (Imad, 23 Oct); the week keeps only its own days.
  const day = (date: string, by: number) => format(addDays(parseISO(date), by), 'yyyy-MM-dd')
  const events = await supabase.from('coach_calendar_events').select('*')
    .eq('coach_user_id', coachId).gte('event_date', day(from, -1)).lte('event_date', day(to, 1))
    .order('event_date', { ascending: true })
  if (events.error) throw events.error
  // A date correction can move a completed session to another week; its old calendar entry stays hidden.
  // IDs are UUID columns from the coach's event rows, never free text.
  const eventIds = (events.data ?? []).map(event => event.id)
  const thisWeek = `and(session_date.gte.${from},session_date.lte.${to})`
  const sessions = await supabase.from('coach_sessions').select('id, event_id, title, session_type, session_date, venue, squad')
    .eq('coach_user_id', coachId)
    .or(eventIds.length ? `${thisWeek},event_id.in.(${eventIds.join(',')})` : thisWeek)
    .order('session_date', { ascending: true })
  if (sessions.error) throw sessions.error
  return { events: (events.data ?? []) as EventRow[], sessions: (sessions.data ?? []) as WeekSession[] }
}

const weekTitle = (offset: number, monday: string) =>
  offset === 0 ? 'This week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : `Week of ${format(parseISO(monday), 'd MMMM')}`

function CoachWeek({ coachId, version, inView, squadLabel }: {
  coachId: string
  version: number
  inView: (squad: string | null | undefined) => boolean
  squadLabel: string | null
}) {
  const [offset, setOffset] = useState(0)
  const dates = useMemo(() => weekDays(addDays(new Date(), offset * 7)), [offset])
  const [week, setWeek] = useState<{ monday: string; events: EventRow[]; sessions: WeekSession[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // The share message names the squad and leaves out players' names (J8.16), as the event sheet's Share.
  const roster = useQuery({
    queryKey: ['coach', coachId, 'week-roster'],
    queryFn: async () => {
      const { data, error } = await supabase.from('squad_players').select('player_name, age_group, status').eq('coach_user_id', coachId)
      if (error) throw error
      return data ?? []
    },
  })

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    // A reload (after Publish) keeps the week on screen, so an open sheet stays open.
    loadWeek(coachId, dates[0], dates[6]).then(
      data => { if (!cancelled) setWeek({ monday: dates[0], ...data }) },
      () => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [coachId, dates, version, attempt])

  if (failed) return <div className="mb-4"><LoadError what="this week" onRetry={() => setAttempt(n => n + 1)} /></div>
  if (!week || week.monday !== dates[0]) {
    return <div role="status" aria-label="Loading this week" className="h-[320px] rounded-2xl border border-line bg-surface animate-pulse motion-reduce:animate-none" />
  }

  const refresh = () => setAttempt(n => n + 1)
  const byDate = coachWeek({ dates, events: week.events, sessions: week.sessions, inView })
  const strips = new Map<string, { item: WeekItem; event: StripEvent }>()
  for (const item of [...byDate.values()].flat()) {
    const event = toPlayerEvent(item.source)
    if (event) strips.set(item.id, { item, event: { ...event, draft: item.source.published === false, sessionId: item.sessionId } })
  }
  const today = format(new Date(), 'yyyy-MM-dd')
  const days: WeekDay[] = dates.map(date => ({
    id: date,
    short: format(parseISO(date), 'EEE'),
    date: format(parseISO(date), 'd'),
    full: format(parseISO(date), 'EEEE d MMMM'),
    today: date === today,
    // A match reads "vs Rivals FC", as everywhere events show.
    events: (byDate.get(date) ?? []).filter(item => strips.has(item.id))
      .map(({ id, kind, time, state, note }) => ({ id, kind, title: eventHeading(strips.get(id)!.event), time, state, note })),
  }))

  return <WeekPicker key={dates[0]} title={weekTitle(offset, dates[0])}
    subtitle={[`${format(parseISO(dates[0]), 'd')}–${format(parseISO(dates[6]), 'd MMMM')}`, squadLabel].filter(Boolean).join(' · ')}
    days={days} onPrevWeek={() => setOffset(n => n - 1)} onNextWeek={() => setOffset(n => n + 1)}
    renderDetails={(id, trigger) => {
      const { event } = strips.get(id)!
      return <EventSheet event={event} role="coach" trigger={trigger}>
        {/* A logged session's sheet shows its log, read only, with Edit log (Imad, 23 Oct; before: who came and Open session). */}
        {event.sessionId
          ? <SessionLog sessionId={event.sessionId} coachId={coachId} />
          : <EventSheetCoach event={event} coachId={coachId} onChanged={refresh} />}
      </EventSheet>
    }}
    renderPrimary={id => <NextStep item={strips.get(id)!.item} coachId={coachId} roster={roster.data} onChanged={refresh} />} />
}

/** The chosen event's one next step (TRAK-262). A weekly series' Publish uses Schedule's own sheet. */
function NextStep({ item, coachId, roster, onChanged }: {
  item: WeekItem
  coachId: string
  roster: { player_name: string | null; age_group: string | null; status: string | null }[] | undefined
  onChanged: () => void
}) {
  const navigate = useNavigate()
  const [publishing, setPublishing] = useState(false)
  const row = item.row
  const go = (label: string, onClick: () => void, disabled = false) =>
    <Button size="sm" className="min-w-[128px]" disabled={disabled} onClick={onClick}>{label}</Button>

  if (item.step === 'publish' && row) return go(publishing ? 'Publishing…' : 'Publish', () => {
    if (row.series_id) return navigate(`/coach/schedule?publish=${row.id}`)
    setPublishing(true)
    publishEvent(row.id).then(
      () => { toast.success('Published to the squad'); onChanged() },
      (error: Error) => toast.error(error.message),
    ).finally(() => setPublishing(false))
  }, publishing)
  if (item.step === 'share' && row) {
    // As the sheet's Share: an event for one squad names that squad; null is the whole roster.
    const rows = roster?.filter(p => row.squad == null || p.age_group?.trim() === row.squad)
    if (!rows) return go('Share with families', () => {}, true)
    return <ShareEventButton text={whatsAppShareText(shareableFromRow(row, squadLabelFrom(rows)), { childNames: rows.map(p => p.player_name ?? '').filter(Boolean) })}
      className="arc inline-flex h-9 min-w-[128px] items-center justify-center gap-2 rounded-full bg-brand px-4 text-[14px] font-medium text-on-brand focus-visible:ring-2 focus-visible:ring-primary">
      <ShareIcon size={16} />Share with families
    </ShareEventButton>
  }
  // Imad, 23 Oct: the register opens here. Schedule shows only the squad last picked, so an event of another squad
  // (Home on All) was never found there, and Schedule stayed on today.
  if (item.step === 'register' && row) return <StepSheet label="Take register" title="Take register" description={item.title}>
    {close => <TakeRegister eventId={row.id} coachId={coachId} sessionId={null} squad={row.squad ?? null} onSaved={() => { close(); onChanged() }} />}
  </StepSheet>
  if (item.step === 'log' && row) return go('Log it', () => navigate('/coach/sessions/quick', {
    state: { fromEvent: { eventId: row.id, date: row.event_date, opponent: row.opponent, homeAway: row.home_away, squad: row.squad ?? null } },
  }))
  // Imad, 23 Oct: View log shows the log; editing is one tap further, inside it.
  if (item.step === 'view' && item.sessionId) {
    const sessionId = item.sessionId
    return <StepSheet label="View log" title={item.title} description="Logged">{() => <SessionLog sessionId={sessionId} coachId={coachId} />}</StepSheet>
  }
  return null
}

/** A next step that opens in a sheet over Home rather than another page. */
function StepSheet({ label, title, description, children }: {
  label: string
  title: string
  description: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return <BottomSheet open={open} onOpenChange={setOpen} title={title} description={description} detents={[0.62, 0.92]} className="arc"
    trigger={<Button size="sm" className="min-w-[128px]">{label}</Button>}>
    <div className="pb-4">{open && children(() => setOpen(false))}</div>
  </BottomSheet>
}
