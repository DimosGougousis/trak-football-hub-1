/**
 * TRAK-182 (Imad, 15 Oct): an event on Home opens in a bottom sheet where it
 * is, instead of "Open" taking the coach to the whole calendar. The coach
 * sees Publish / Published, Copy WhatsApp link, Edit and Attending (coming /
 * can't make it); families see "Confirmed." and never other children's names.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { SUPABASE_URL } from '../../../../tests/msw/supabase'
import { LoadedWeekStrip, WeekStrip, weekDays, type StripEvent } from '@/components/trak/WeekStrip'
import { EventSheet } from '@/components/trak/EventSheet'
import { EventSheetCoach } from '@/components/coach/EventSheetCoach'

const endpoint = (name: string) => `${SUPABASE_URL}/rest/v1/${name}`
const today = new Date()
const day = weekDays(today).find(d => d >= today.toLocaleDateString('en-CA')) ?? weekDays(today)[6]
const event = (over: Partial<StripEvent>): StripEvent => ({
  id: 'ev-1', kind: 'match', title: 'League', date: day, time: '17:00', meetTime: '16:15', venue: 'Rivals Park',
  kit: 'White', opponent: 'Rivals FC', homeAway: 'away', status: 'scheduled', cancelReason: null, sequence: 0,
  updatedAt: null, familyNote: 'Bring water', ...over,
})
const row = (over: Record<string, unknown>) => ({
  id: 'ev-1', coach_user_id: 'coach-1', event_type: 'match', title: 'League', event_date: day, start_time: '17:00:00',
  starts_at: `${day}T13:00:00Z`, published: false, status: 'scheduled', series_id: null, ...over,
})

let eventRow: Record<string, unknown>
let patched: Record<string, unknown>[]
beforeEach(() => {
  eventRow = row({}); patched = []
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  server.use(
    http.get(endpoint('coach_calendar_events'), () => HttpResponse.json(eventRow)),
    http.patch(endpoint('coach_calendar_events'), async ({ request }) => {
      patched.push(await request.json() as Record<string, unknown>)
      eventRow = { ...eventRow, published: true }
      return HttpResponse.json([{ id: 'ev-1' }])
    }),
    http.get(endpoint('coach_sessions'), () => HttpResponse.json({ code: 'PGRST116', details: 'Results contain 0 rows', message: 'none' }, { status: 406 })),
    http.get(endpoint('squad_players'), () => HttpResponse.json([
      { id: 'sp-1', player_name: 'Ade Okafor' }, { id: 'sp-2', player_name: 'Bea Lin' }, { id: 'sp-3', player_name: 'Cal Moss' }])),
    http.get(endpoint('event_absences'), () => HttpResponse.json([{ squad_player_id: 'sp-2', reason: 'School trip' }])),
  )
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function Where() { return <p data-testid="where">{useLocation().pathname + useLocation().search}</p> }
function renderStrip(events: StripEvent[], role: 'coach' | 'parent') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/home']}>
    <Routes><Route path="*" element={<>
      <WeekStrip events={events} today={new Date(`${day}T12:00:00`)} renderSheet={(e, trigger) => (
        <EventSheet event={e} role={role} trigger={trigger}>
          {role === 'coach' && <EventSheetCoach event={e} coachId="coach-1" onChanged={() => {}} />}
        </EventSheet>
      )} />
      <Where />
    </>} /></Routes>
  </MemoryRouter></QueryClientProvider>)
}

describe('TRAK-182: the event sheet', () => {
  it('opens the coach\'s event where it is, not the calendar, and publishes a draft', async () => {
    const user = userEvent.setup()
    renderStrip([event({ draft: true })], 'coach')
    await user.click(screen.getByRole('button', { name: /Rivals FC/ }))
    const sheet = await screen.findByRole('dialog', { name: 'vs Rivals FC' })
    expect(screen.getByTestId('where')).toHaveTextContent('/home')
    expect(within(sheet).getByText(/· Away$/)).toBeInTheDocument()
    expect(within(sheet).getByText('16:15')).toBeInTheDocument()
    expect(within(sheet).getByText('17:00')).toBeInTheDocument()
    expect(within(sheet).getByText('Draft. Only you see this.')).toBeInTheDocument()
    expect(within(sheet).getByText('White')).toBeInTheDocument()
    await user.click(await within(sheet).findByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(patched).toEqual([{ published: true }]))
  })

  it('stays open while the week reloads after Publish', async () => {
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    // A real reload takes a network round trip; an instant one hides a blanked week.
    const load = vi.fn(async () => { await new Promise(r => setTimeout(r, 50)); return { data: [{ ...eventRow, start_time: '17:00:00', opponent: 'Rivals FC', home_away: 'away', event_type: 'match' }], error: null } })
    render(<QueryClientProvider client={client}><MemoryRouter>
      <LoadedWeekStrip load={load} loadKey="coach-1" renderSheet={(e, trigger, refresh) => (
        <EventSheet event={e} role="coach" trigger={trigger}><EventSheetCoach event={e} coachId="coach-1" onChanged={refresh} /></EventSheet>
      )} />
    </MemoryRouter></QueryClientProvider>)
    await user.click(await screen.findByRole('button', { name: /Rivals FC/ }))
    const sheet = await screen.findByRole('dialog', { name: 'vs Rivals FC' })
    await user.click(await within(sheet).findByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('dialog', { name: 'vs Rivals FC' })).toBeInTheDocument()
    expect(await within(screen.getByRole('dialog')).findByRole('button', { name: 'Published' })).toBeDisabled()
  })

  it('shows a published event\'s link, Edit and who is coming', async () => {
    eventRow = row({ published: true })
    const user = userEvent.setup() // installs its own clipboard; replace it after
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderStrip([event({})], 'coach')
    await user.click(screen.getByRole('button', { name: /Rivals FC/ }))
    const sheet = await screen.findByRole('dialog', { name: 'vs Rivals FC' })
    expect(within(sheet).getByText('Published.')).toBeInTheDocument()
    expect(await within(sheet).findByRole('button', { name: 'Published' })).toBeDisabled()
    await user.click(within(sheet).getByRole('button', { name: 'Copy WhatsApp link' }))
    expect(writeText).toHaveBeenCalledWith('https://trakfootball.com/event/ev-1')
    expect(await within(sheet).findByText('Coming · 2')).toBeInTheDocument()
    expect(within(sheet).getByText("Can't make it · 1")).toBeInTheDocument()
    expect(within(sheet).getByText('Bea Lin')).toBeInTheDocument()
    expect(within(sheet).getByText('School trip')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Edit' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/coach/schedule?edit=ev-1')
  })

  it('tells a family "Confirmed." with no coach actions and no other children', async () => {
    const user = userEvent.setup()
    renderStrip([event({})], 'parent')
    await user.click(screen.getByRole('button', { name: /Rivals FC/ }))
    const sheet = await screen.findByRole('dialog', { name: 'vs Rivals FC' })
    expect(within(sheet).getByText('Confirmed.')).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: /Publish|Edit|WhatsApp/ })).not.toBeInTheDocument()
    expect(within(sheet).queryByText('Attending')).not.toBeInTheDocument()
    expect(within(sheet).queryByText('Bea Lin')).not.toBeInTheDocument()
  })

  it('says Training ground for a training and shows a cancellation', async () => {
    const user = userEvent.setup()
    renderStrip([event({ kind: 'training', title: 'Finishing', opponent: null, homeAway: null, meetTime: null, status: 'cancelled', cancelReason: 'Pitch flooded' })], 'parent')
    await user.click(screen.getByRole('button', { name: /Finishing/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Finishing' })
    expect(within(sheet).getByText(/· Training ground$/)).toBeInTheDocument()
    expect(within(sheet).getByText('Cancelled.')).toBeInTheDocument()
    expect(within(sheet).getByText('Pitch flooded')).toBeInTheDocument()
  })
})
