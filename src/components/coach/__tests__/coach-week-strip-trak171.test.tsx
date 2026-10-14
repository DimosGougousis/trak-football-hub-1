import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { addDays, format, parseISO } from 'date-fns'
import { CoachWeekStrip } from '../CoachWeekStrip'
import { weekDays } from '@/components/trak/WeekStrip'

type Row = Record<string, unknown>
type Reply = { data: Row[] | null; error: unknown }

const database = vi.hoisted(() => ({
  read: vi.fn<(table: string, coachId: string, filter?: string) => Promise<Reply>>(),
}))

// The feature switch is independent of how the enabled strip loads its week.
vi.mock('@/components/trak/parked', () => ({ useFeature: () => true }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      let coachId = ''
      let filter: string | undefined
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          if (column === 'coach_user_id') coachId = value
          return query
        },
        gte: () => query,
        lte: () => query,
        or: (value: string) => { filter = value; return query },
        order: () => query,
        then: (resolve: (reply: Reply) => unknown, reject?: (error: unknown) => unknown) =>
          database.read(table, coachId, filter).then(resolve, reject),
      }
      return query
    },
  },
}))

const monday = weekDays(new Date())[0]
const today = format(new Date(), 'yyyy-MM-dd')
const planned = (coachId = 'coach-1'): Row => ({
  id: `planned-${coachId}`, coach_user_id: coachId, event_type: 'training',
  title: 'Planned training', event_date: monday, start_time: '18:00',
  published: true, status: 'scheduled',
})
const session = (id: string, title: string, type: string, date = monday): Row => ({
  id, title, session_type: type, session_date: date, coach_user_id: 'coach-1',
  competition: null, venue: null, notes: null,
})
const ok = (data: Row[]): Reply => ({ data, error: null })

function strip(coachId = 'coach-1') {
  return <MemoryRouter><CoachWeekStrip coachId={coachId} /></MemoryRouter>
}

async function chooseMonday() {
  const name = format(parseISO(monday), 'EEEE d MMMM')
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }))
}

describe('TRAK-171: coach Home week includes logged sessions', () => {
  beforeEach(() => {
    database.read.mockReset()
    // Motion preserves scroll position while opening; jsdom has no scrolling.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows logged training and match sessions alongside planned events, opening each saved session', async () => {
    database.read.mockImplementation(async table => ok(table === 'coach_calendar_events'
      ? [planned()]
      : [session('saved-training', 'Logged training', 'training'), session('saved-match', 'Logged match', 'match')]))
    render(strip())
    await chooseMonday()

    expect(await screen.findByRole('button', { name: /Planned training/ })).toBeInTheDocument()
    for (const [title, id] of [['Logged training', 'saved-training'], ['Logged match', 'saved-match']]) {
      const trigger = await screen.findByRole('button', { name: new RegExp(title) })
      fireEvent.click(trigger)
      const details = await screen.findByRole('region', { name: new RegExp(title) })
      expect(await within(details).findByRole('link', { name: 'Open' })).toHaveAttribute('href', `/coach/sessions/${id}`)
    }
  })

  it('shows Retry when the session read fails, then restores the complete week after retry', async () => {
    let sessionsFailed = true
    database.read.mockImplementation(async table => table === 'coach_calendar_events'
      ? ok([planned()])
      : sessionsFailed ? { data: null, error: new Error('Session read failed') }
        : ok([session('recovered', 'Recovered session', 'training')]))
    render(strip())

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load this week/i)
    expect(screen.queryByText('Nothing planned.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Planned training/ })).not.toBeInTheDocument()
    sessionsFailed = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await chooseMonday()
    expect(await screen.findByRole('button', { name: /Recovered session/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Planned training/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a completed planned event once as its logged session, without inventing a session time', async () => {
    database.read.mockImplementation(async table => ok(table === 'coach_calendar_events'
      ? [planned()]
      : [{ ...session('completed-training', 'Completed training', 'training'), event_id: 'planned-coach-1' }]))
    render(strip())
    await chooseMonday()

    const trigger = await screen.findByRole('button', { name: /Completed training/ })
    expect(screen.getAllByRole('button', { name: /Completed training/ })).toHaveLength(1)
    expect(trigger).toHaveTextContent(/Logged/)
    expect(trigger).not.toHaveTextContent(/18:00|Time to be confirmed/)
    expect(screen.queryByRole('button', { name: /Planned training/ })).not.toBeInTheDocument()
    fireEvent.click(trigger)
    const details = await screen.findByRole('region', { name: /Completed training/ })
    expect(await within(details).findByRole('link', { name: 'Open' })).toHaveAttribute('href', '/coach/sessions/completed-training')
  })

  it('does not let a late response restore the previous coach’s sessions after an account change', async () => {
    let releaseSessions!: (reply: Reply) => void
    const previousCoachSessions = new Promise<Reply>(resolve => { releaseSessions = resolve })
    database.read.mockImplementation((table, coachId) => {
      if (table === 'coach_sessions' && coachId === 'coach-1') return previousCoachSessions
      return Promise.resolve(ok(table === 'coach_sessions'
        ? [session('new-coach', 'Current coach session', 'match', today)] : []))
    })
    const view = render(strip())
    // Finish the immediate calendar response; the first session read remains pending.
    await act(async () => {})
    view.rerender(strip('coach-2'))
    expect(await screen.findByRole('button', { name: /Current coach session/ })).toBeInTheDocument()

    await act(async () => releaseSessions(ok([session('old-coach', 'Previous coach private session', 'match', today)])))
    expect(screen.getByRole('button', { name: /Current coach session/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Previous coach private session/ })).not.toBeInTheDocument()
  })

  it('does not restore a completed planned event when its linked session moves outside this week', async () => {
    const moved = {
      ...session('moved-training', 'Moved completed training', 'training', format(addDays(parseISO(monday), 7), 'yyyy-MM-dd')),
      event_id: 'planned-coach-1',
    }
    // The server only returns an out-of-week session if its event link is queried.
    database.read.mockImplementation(async (table, _coachId, filter) => ok(table === 'coach_calendar_events'
      ? [planned()]
      : filter?.includes('event_id') && filter.includes('planned-coach-1') ? [moved] : []))
    render(strip())
    await chooseMonday()

    expect(screen.queryByRole('button', { name: /Planned training/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Moved completed training/ })).not.toBeInTheDocument()
    expect(screen.getByText('Nothing planned.')).toBeInTheDocument()
  })
})
