import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { server } from '../../../../tests/msw/server'
import { SUPABASE_URL } from '../../../../tests/msw/supabase'
import { LoadedWeekStrip, WeekStrip, type StripEvent } from '../WeekStrip'
import { EVENT_COLOR } from '@/lib/coach-events'

/**
 * TRAK-231 (20 Oct live run, S2/S5/S6): Today was too subtle once another day
 * was picked, a family's own "Can't make it" didn't show in the strip, and
 * cancellations need to be unmistakable. Shapes and words as well as colour.
 */

const today = new Date(2026, 9, 21, 12) // Wednesday 21 October
const base = { time: '17:00', venue: null, meetTime: null, kit: null, opponent: null, homeAway: null, familyNote: null,
  cancelReason: null, sequence: 0, updatedAt: '2026-10-20T00:00:00Z' }
const training = { ...base, id: 'ev-t', kind: 'training', title: 'Training', date: '2026-10-21', status: 'scheduled' } as unknown as StripEvent
const match = { ...base, id: 'ev-m', kind: 'match', title: 'League', opponent: 'Rivals FC', date: '2026-10-23', status: 'scheduled' } as unknown as StripEvent

const sheet = (_event: StripEvent, trigger: React.ReactElement) => trigger

describe('TRAK-231: Today stays plain to see', () => {
  it('today carries a visible mark, the only day that does, whichever day is picked', async () => {
    render(<WeekStrip events={[]} renderSheet={sheet} today={today} />)
    const strip = screen.getByRole('group', { name: 'This week' })
    const todayButton = within(strip).getByRole('button', { name: /Wednesday 21 October, today/ })
    expect(todayButton.querySelector('[data-today-mark]')).not.toBeNull()
    expect(strip.querySelectorAll('[data-today-mark]')).toHaveLength(1)
    await userEvent.click(within(strip).getByRole('button', { name: /Friday 23 October/ }))
    expect(todayButton.querySelector('[data-today-mark]')).not.toBeNull()
  })

  it('the day heading says Today on today, and only then', async () => {
    render(<WeekStrip events={[]} renderSheet={sheet} today={today} />)
    expect(screen.getByText(/^Today · Wednesday 21 October$/i, { selector: 'p' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Friday 23 October/ }))
    expect(screen.getByText(/^Friday 23 October$/i, { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText(/^Today ·/i, { selector: 'p' })).toBeNull()
  })
})

describe('TRAK-231: the family\'s own "Can\'t make it" shows in the strip', () => {
  it('an event they said they can\'t make says so on its row, with a dimmed dot', () => {
    render(<WeekStrip events={[{ ...training, absent: true }]} renderSheet={sheet} today={today} />)
    const row = screen.getByRole('button', { name: /Training/ })
    expect(within(row).getByText("Can't make it")).toBeInTheDocument()
    const dot = screen.getByRole('button', { name: /Wednesday 21 October/ }).querySelector('[data-absent]')
    expect(dot).not.toBeNull()
  })

  it('the loaded strip reads this child\'s own absences for the week, and only theirs', async () => {
    // TRAK-291: the loaded strip reads the real clock, so it runs on this file's Wednesday 21 October, as the others do.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(today)
    onTestFinished(() => { vi.useRealTimers() })
    const asked: string[] = []
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/squad_players`, ({ request }) => {
        asked.push(new URL(request.url).search)
        return HttpResponse.json([{ id: 'sp-own' }])
      }),
      http.get(`${SUPABASE_URL}/rest/v1/event_absences`, ({ request }) => {
        asked.push(new URL(request.url).search)
        return HttpResponse.json([{ event_id: 'ev-t' }])
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <LoadedWeekStrip loadKey="child-1" absentFor="child-1" renderSheet={sheet}
        load={() => Promise.resolve({ data: [training, match].map(e => ({ id: e.id, event_type: e.kind, title: e.title, event_date: e.date, start_time: '17:00:00', status: 'scheduled', opponent: e.opponent, sequence: 0, updated_at: '2026-10-20T00:00:00Z' })), error: null })} />
    </QueryClientProvider>)
    const rowsFor = async (name: RegExp) => screen.findByRole('button', { name })
    await userEvent.click(await screen.findByRole('button', { name: /Wednesday 21 October/ }))
    await waitFor(async () => expect(within(await rowsFor(/Training/)).getByText("Can't make it")).toBeInTheDocument())
    expect(asked.join(' ')).toContain('linked_player_id=eq.child-1')
    expect(asked.join(' ')).toContain('squad_player_id=in.%28sp-own%29')
  })
})

describe('TRAK-231: the event palette (TRAK-275, 23 Oct)', () => {
  it('match is purple, training green, other teal', () => {
    const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
    const [mr, mg, mb] = rgb(EVENT_COLOR.match)
    expect(mb - mr).toBeGreaterThan(60); expect(mr - mg).toBeGreaterThan(60)
    const [tr, tg, tb] = rgb(EVENT_COLOR.training)
    expect(tg).toBeGreaterThan(tr + 60); expect(tg).toBeGreaterThan(tb + 60)
    const [or, og, ob] = rgb(EVENT_COLOR.other)
    expect(og).toBeGreaterThan(or + 60); expect(ob).toBeGreaterThan(or + 60)
  })
})
