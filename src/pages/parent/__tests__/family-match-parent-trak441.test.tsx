/**
 * TRAK-441 slice 3.3 (Imad, 12 Nov): with the academy's family_look switch on, a guardian's match page is the coach's
 * match header with two tabs: Logistics and Evaluation. "Theodoros starts" is the header's badge. The page never
 * holds the child's job, the coach's note or the line-up, and never asks the database for them (TRAK-319, G4). Test
 * people are named after footballers.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParentChildrenProvider } from '@/contexts/ParentChildrenContext'
import ParentEvent from '../ParentEvent'
import { server } from '../../../../tests/msw/server'
import { SUPABASE_URL } from '../../../../tests/msw/supabase'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'dellas', email: 'dellas@test.invalid' },
    profile: { full_name: 'Traianos Dellas', role: 'parent' },
    signOut: vi.fn(), refreshProfile: vi.fn(),
  }),
}))
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }))

const endpoint = (name: string) => `${SUPABASE_URL}/rest/v1/${name}`
const MATCH = {
  id: 'g1', event_type: 'match', title: 'League', opponent: 'Parkview Athletic', home_away: 'away', event_date: '2099-11-14',
  start_time: '10:00:00', starts_at: '2099-11-14T06:00:00Z', meet_time: null, venue: 'Lakeside Ground', kit: 'Blue shirts',
  status: 'scheduled', cancel_reason: null, sequence: 0, family_note: null,
}
const NAMES: Record<string, string> = { zagorakis: 'Theodoros Zagorakis', 'coach-1': 'Otto Rehhagel' }
const PLAN = { event_id: 'g1', squad_player_id: 'zagorakis-squad', role: 'starter', job: '', has_note: false,
  shared_at: '2099-11-10T15:30:00Z', changed_at: null, coach_name: 'Otto Rehhagel' }
const REVIEW = { event_id: 'g1', session_id: 's1', squad_player_id: 'zagorakis-squad', our_score: 1, their_score: 1,
  expectation: 'usual', context: ['first_start'], against_expectation: 'met', coach_name: 'Otto Rehhagel', published_at: '2099-11-14T10:00:00Z' }
let reviews: object[]
let askedForChildOnly: string[]

beforeEach(() => {
  localStorage.clear()
  reviews = []
  askedForChildOnly = []
  const one = (rows: () => object[]) => ({ request }: { request: Request }) =>
    (request.headers.get('Accept') ?? '').includes('vnd.pgrst.object') ? HttpResponse.json(rows()[0] ?? null) : HttpResponse.json(rows())
  // What only the child may read: his plan copy, the line-up and his review copy.
  const childOnly = ({ request }: { request: Request }) => { askedForChildOnly.push(request.url); return HttpResponse.json([]) }
  server.use(
    http.post(endpoint('rpc/family_feature_on'), () => HttpResponse.json(true)),
    http.get(endpoint('player_parent_links'), () => HttpResponse.json([{ player_user_id: 'zagorakis' }])),
    http.get(endpoint('profiles'), ({ request }) => {
      const asked = new URL(request.url).searchParams.get('user_id') ?? ''
      return HttpResponse.json(Object.keys(NAMES).filter(id => asked.includes(id)).map(user_id => ({ user_id, full_name: NAMES[user_id] })))
    }),
    http.get(endpoint('squad_players'), ({ request }) => {
      const child = new URL(request.url).searchParams.get('linked_player_id')?.replace(/^eq\./, '')
      return HttpResponse.json(child ? [{ id: `${child}-squad`, coach_user_id: 'coach-1' }] : [])
    }),
    http.get(endpoint('event_absences'), () => HttpResponse.json([])),
    http.post(endpoint('rpc/child_events'), one(() => [MATCH])),
    http.get(endpoint('game_for_family'), one(() => [PLAN])),
    http.get(endpoint('game_review_for_family'), one(() => reviews)),
    http.get(endpoint('game_for_player'), childOnly),
    http.get(endpoint('game_lineup_for_players'), childOnly),
    http.get(endpoint('game_review_for_player'), childOnly),
  )
})
const clients: QueryClient[] = []
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()) })

function renderParent() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
  clients.push(client)
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/parent/event/g1']}>
    <ParentChildrenProvider><Routes><Route path="/parent/event/:id" element={<ParentEvent />} /></Routes></ParentChildrenProvider>
  </MemoryRouter></QueryClientProvider>)
}
const matchTabs = () => within(screen.getByRole('tablist', { name: 'vs Parkview Athletic' })).getAllByRole('tab').map(tab => tab.textContent)

describe('TRAK-441: a guardian\'s match page in the coach\'s look', () => {
  it('before the match: two tabs, "Theodoros starts" in the header, Can\'t make it in Logistics, and nothing of the child\'s own', async () => {
    renderParent()
    expect(await screen.findByRole('heading', { level: 1, name: 'vs Parkview Athletic' })).toBeInTheDocument()
    expect(screen.getByText('Theodoros starts')).toBeInTheDocument()
    expect(screen.getByText('Lakeside Ground')).toBeInTheDocument()
    expect(matchTabs()).toEqual(['Logistics', 'Evaluation'])
    expect(screen.getByRole('tab', { name: 'Logistics' })).toHaveAttribute('aria-selected', 'true')

    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByRole('list', { name: 'Event details' })).toHaveTextContent('KitBlue shirts')
    expect(await within(panel).findByRole('button', { name: /Can.t make it/ })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Events')

    // G4, TRAK-319: no job, no note, no line-up, and no request for the child's own copies.
    expect(document.body.textContent).not.toMatch(/job|note|line-up|only you/i)
    expect(screen.queryByRole('region', { name: 'Line-up' })).toBeNull()
    expect(askedForChildOnly).toEqual([])
  })

  it('after the match: the result is the badge and Evaluation opens, marked New: what was asked and how it went, never the job or the note', async () => {
    reviews = [REVIEW]
    renderParent()
    expect(await screen.findByText('Drew 1–1')).toBeInTheDocument()
    expect(screen.queryByText('Theodoros starts')).toBeNull()
    expect(matchTabs()).toEqual(['Logistics', 'EvaluationNew'])
    expect(screen.getByRole('tab', { name: /Evaluation/ })).toHaveAttribute('aria-selected', 'true')

    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByRole('heading', { name: 'How it went for Theodoros' })).toBeInTheDocument()
    expect(within(panel).getByText('Your normal game. (first start)')).toBeInTheDocument()
    expect(within(panel).getByText('Met')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/job|note|line-up|only you/i)
    expect(askedForChildOnly).toEqual([])
  })
})
