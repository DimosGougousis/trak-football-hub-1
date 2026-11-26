import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { server } from '../../../../tests/msw/server'
import { SUPABASE_URL } from '../../../../tests/msw/supabase'
import { LoadedWeekStrip } from '../WeekStrip'
import { UpcomingEventCard } from '@/components/player/UpcomingEventCard'
import { eventAlert } from '@/lib/parent-data'
import { venueName } from '@/lib/venue-link'
import type { PlayerEvent } from '@/lib/player-events'

/**
 * Imad, 26 Nov (DC Eleven demo): a venue the coach typed with its Google Maps link showed the whole link under the
 * match in the week. Since TRAK-225 a venue's Maps link is for "Open in Maps" only: every place that prints a venue
 * prints its words.
 */

const LINK = 'https://www.google.com/maps/search/?api=1&query=Pabell%C3%B3n%20Antonio%20Serrano%20Lima%2C%20Marbella'
const VENUE = `Pabellón Antonio Serrano Lima, Marbella, Spain ${LINK}`

describe('a venue is shown without its Maps link', () => {
  it('venueName keeps the words and drops the link', () => {
    expect(venueName(VENUE)).toBe('Pabellón Antonio Serrano Lima, Marbella, Spain')
    expect(venueName(LINK)).toBe('')
    expect(venueName('Pitch 2')).toBe('Pitch 2')
    expect(venueName(null)).toBe('')
  })

  it("in the week, under the match", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 11, 2, 12)) // Wednesday 2 December
    onTestFinished(() => { vi.useRealTimers() })
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/squad_players`, () => HttpResponse.json([{ id: 'sp-own' }])),
      http.get(`${SUPABASE_URL}/rest/v1/event_absences`, () => HttpResponse.json([])),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}>
      <LoadedWeekStrip picker loadKey="child-1" absentFor="child-1" renderSheet={(_event, trigger) => trigger}
        load={async () => ({ data: [{ id: 'ev-m', event_type: 'match', title: 'vs CD Peña Los Compadres', opponent: 'CD Peña Los Compadres',
          home_away: 'away', event_date: '2026-12-02', start_time: '10:00:00', status: 'scheduled', sequence: 0,
          updated_at: '2026-11-25T00:00:00Z', venue: VENUE }], error: null })} />
    </QueryClientProvider>)
    const row = await screen.findByRole('button', { name: /Pabellón Antonio Serrano Lima, Marbella, Spain/ })
    await waitFor(() => expect(row.textContent).not.toContain('https://'))
  })

  it('on the upcoming event card and in the family alert', () => {
    const event = { id: 'ev-m', kind: 'match', title: 'Match', opponent: 'CD Peña Los Compadres', date: '2026-12-05', time: '10:00',
      venue: VENUE, status: 'scheduled', sequence: 0, meetTime: null } as unknown as PlayerEvent
    render(<MemoryRouter><UpcomingEventCard event={event} changed={false} /></MemoryRouter>)
    expect(screen.getByText(/Pabellón Antonio Serrano Lima/).textContent).not.toContain('https://')
    expect(eventAlert(event, {}).description).not.toContain('https://')
    expect(eventAlert(event, {}).description).toContain('Pabellón Antonio Serrano Lima, Marbella, Spain')
  })
})
