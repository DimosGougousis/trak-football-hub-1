import { cleanup, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParentChildrenProvider } from '@/contexts/ParentChildrenContext'
import ParentMatches from '../ParentMatches'
import { server } from '../../../../tests/msw/server'
import { SUPABASE_URL, rpc } from '../../../../tests/msw/supabase'

const auth = vi.hoisted(() => ({ user: { id: 'parent-history' }, profile: { role: 'parent', full_name: 'Synthetic Parent' } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ ...auth, signOut: vi.fn(), refreshProfile: vi.fn() }) }))
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }))
const endpoint = (name: string) => `${SUPABASE_URL}/rest/v1/${name}`
// Six past matches, newest first: Rovers 1 … Rovers 6.
const MATCHES = Array.from({ length: 6 }, (_, i) => ({
  id: `m${i + 1}`, user_id: 'Alex', session_id: null, opponent: `Synthetic Rovers ${i + 1}`,
  created_at: `2026-10-${String(12 - i).padStart(2, '0')}T10:00:00Z`, match_date: `2026-10-${String(12 - i).padStart(2, '0')}`,
  team_score: 2, opponent_score: 1, computed_rating: 8, competition: 'League', venue: 'Home',
  position: 'ST', age_group: 'U14', minutes_played: null, goals: 0, assists: 0,
}))
const clients: QueryClient[] = []
beforeEach(() => {
  server.use(
    http.get(endpoint('player_parent_links'), () => HttpResponse.json([{ player_user_id: 'Alex' }])),
    http.get(endpoint('profiles'), () => HttpResponse.json([{ user_id: 'Alex', full_name: 'Alex Example' }])),
    http.get(endpoint('matches'), ({ request }) => {
      const select = new Set(new URL(request.url).searchParams.get('select')?.split(',').map(s => s.trim()))
      return HttpResponse.json(MATCHES.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => select.has('*') || select.has(key)))))
    }),
    http.get(endpoint('player_details'), () => HttpResponse.json([])),
    http.get(endpoint('squad_players'), () => HttpResponse.json([])),
    http.get(endpoint('coach_assessments'), () => HttpResponse.json([])),
    http.get(endpoint('recognition_awards'), () => HttpResponse.json([])),
    rpc('family_training_history', () => []), rpc('child_events', () => []),
    rpc('get_children_awaiting_consent', () => []), rpc('get_roster_children_awaiting_consent', () => []),
    rpc('get_my_child_logins', () => []), rpc('get_my_approved_children_awaiting_signup', () => []),
  )
})
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()) })

function renderEvents() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/parent/matches']}>
    <ParentChildrenProvider><Routes><Route path="/parent/matches" element={<ParentMatches />} /></Routes></ParentChildrenProvider>
  </MemoryRouter></QueryClientProvider>)
}

// TRAK-214 (Kostas, 16 Oct list item 3, asked again 20 Oct): past matches on the
// guardian's Events tab are boxed cards under their own heading, like Upcoming.
describe('TRAK-214 guardian Events: Match history', () => {
  it('is its own section, between Upcoming and Training, each match a boxed card', async () => {
    renderEvents()
    const history = await screen.findByRole('region', { name: 'Match history' })
    expect(within(history).getByText('MATCH HISTORY')).toBeInTheDocument()
    const card = await within(history).findByRole('link', { name: /Synthetic Rovers 1/ })
    // The same box as an Upcoming card (UpcomingEventCard): rounded, padded, one per match.
    // (jsdom drops rgb(var(--t-…)) colours, so the surface and border are checked in the browser.)
    expect(card).toHaveClass('rounded-[14px]', 'p-3.5')
    expect(card).toHaveTextContent('Synthetic Rovers 1')
    expect(card).toHaveTextContent('League · Home')
    expect(card).toHaveTextContent('W 2–1')

    const upcoming = screen.getByRole('region', { name: 'Upcoming' })
    const training = await screen.findByRole('region', { name: 'Training' })
    expect(upcoming.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(history.compareDocumentPosition(training) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the latest 3, then See more adds the rest', async () => {
    renderEvents()
    const history = await screen.findByRole('region', { name: 'Match history' })
    expect(await within(history).findAllByRole('link')).toHaveLength(3)
    expect(within(history).queryByRole('link', { name: /Synthetic Rovers 4/ })).not.toBeInTheDocument()
    await userEvent.click(within(history).getByRole('button', { name: 'See more (3)' }))
    expect(within(history).getAllByRole('link')).toHaveLength(6)
    expect(within(history).getByRole('button', { name: 'Show fewer' })).toBeInTheDocument()
  })
})
