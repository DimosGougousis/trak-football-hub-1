/**
 * TRAK-441 slice 7: with the academy's family_look switch on, a guardian's training is the coach's page header, as a
 * match is: the title, the day, time and venue and the child once, then the Logistics a match has with the red Can't
 * make it. No tabs. Nothing of the child's own (job, note) and never the coach's training plan; the page doesn't ask
 * for them. Test people are named after footballers.
 */
import { cleanup, render, screen } from '@testing-library/react'
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
    user: { id: 'basinas', email: 'basinas@test.invalid' },
    profile: { full_name: 'Angelos Basinas', role: 'parent' },
    signOut: vi.fn(), refreshProfile: vi.fn(),
  }),
}))
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }))

const endpoint = (name: string) => `${SUPABASE_URL}/rest/v1/${name}`
const TRAINING = {
  id: 't1', event_type: 'training', title: null, opponent: null, home_away: null, event_date: '2099-11-16',
  start_time: '18:30:00', starts_at: '2099-11-16T14:30:00Z', meet_time: null, venue: 'Rehearsal Park', kit: 'Blue shirts',
  status: 'scheduled', cancel_reason: null, sequence: 0, family_note: null,
}
const NAMES: Record<string, string> = { katsouranis: 'Kostas Katsouranis', 'coach-1': 'Otto Rehhagel' }
const NOT_FOR_THIS_PAGE = ['training_plans', 'training_plan_practices', 'training_plan_drafts', 'training_notes',
  'game_for_family', 'game_for_player', 'game_lineup_for_players', 'game_review_for_family', 'game_review_for_player']
let look: boolean
let event: Record<string, unknown>
let asked: string[]

// TRAK-571: the page shows the phone's own clock (TRAK-223), so the phone is in the academy's zone here, whatever the
// computer running the test is set to (it passed in Dubai and failed in New York or on a UTC runner).
const realZone = process.env.TZ
beforeEach(() => {
  process.env.TZ = 'Asia/Dubai'
  localStorage.clear()
  look = true
  event = TRAINING
  asked = []
  server.use(
    http.post(endpoint('rpc/family_feature_on'), () => HttpResponse.json(look)),
    http.get(endpoint('player_parent_links'), () => HttpResponse.json([{ player_user_id: 'katsouranis' }])),
    http.get(endpoint('profiles'), ({ request }) => {
      const wanted = new URL(request.url).searchParams.get('user_id') ?? ''
      return HttpResponse.json(Object.keys(NAMES).filter(id => wanted.includes(id)).map(user_id => ({ user_id, full_name: NAMES[user_id] })))
    }),
    http.get(endpoint('squad_players'), ({ request }) => {
      const child = new URL(request.url).searchParams.get('linked_player_id')?.replace(/^eq\./, '')
      return HttpResponse.json(child ? [{ id: `${child}-squad`, coach_user_id: 'coach-1' }] : [])
    }),
    http.get(endpoint('event_absences'), () => HttpResponse.json([])),
    http.post(endpoint('rpc/child_events'), () => HttpResponse.json([event])),
    ...NOT_FOR_THIS_PAGE.map(name => http.get(endpoint(name), ({ request }) => { asked.push(request.url); return HttpResponse.json([]) })),
  )
})
const clients: QueryClient[] = []
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); process.env.TZ = realZone })

function renderParent() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
  clients.push(client)
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/parent/event/t1']}>
    <ParentChildrenProvider><Routes><Route path="/parent/event/:id" element={<ParentEvent />} /></Routes></ParentChildrenProvider>
  </MemoryRouter></QueryClientProvider>)
}

describe('TRAK-441: a guardian\'s training in the coach\'s look', () => {
  it('the header, the Logistics with Can\'t make it, no tabs, and nothing of the child\'s own or the coach\'s plan', async () => {
    renderParent()
    // The trail is the new page's alone (the old one has a Back button), so the switch has answered.
    expect(await screen.findByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Training' })).toBeInTheDocument()
    expect(screen.getByText('Mon 16 Nov')).toBeInTheDocument()
    expect(screen.getByText(/Starts 18:30/)).toBeInTheDocument()
    expect(screen.getByText('Rehearsal Park')).toBeInTheDocument()
    expect(screen.getByText('Kostas')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Events')

    expect(screen.getByRole('list', { name: 'Event details' })).toHaveTextContent('KitBlue shirts')
    expect(screen.getByRole('list', { name: 'Event details' })).not.toHaveTextContent(/Venue|Rehearsal Park/)
    expect(await screen.findByRole('button', { name: /Can.t make it/ })).toBeInTheDocument()

    expect(screen.queryByRole('tab', { name: /Logistics|Evaluation/ })).toBeNull()
    expect(document.body.textContent).not.toMatch(/job|note|line-up|only you|game plan|evaluation/i)
    expect(asked).toEqual([])
  })

  it('a cancelled training has the Cancelled badge and no Can\'t make it', async () => {
    event = { ...TRAINING, status: 'cancelled', cancel_reason: 'Pitch closed.' }
    renderParent()
    expect(await screen.findByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('Pitch closed.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Can.t make it/ })).toBeNull()
  })

  it('with the switch off the page stays as it was', async () => {
    look = false
    renderParent()
    expect(await screen.findByRole('list', { name: 'Event details' })).toHaveTextContent('VenueRehearsal Park')
    expect(screen.getByRole('button', { name: /Events/ })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull()
  })
})
