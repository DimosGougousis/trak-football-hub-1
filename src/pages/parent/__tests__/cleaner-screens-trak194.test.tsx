/**
 * TRAK-194 (Kostas, 16 Oct list, items 4, 5, 6): the parent's Home shows a thing
 * once, an assessment reads as the coach's view of the child, and Profile has no
 * copy of Settings.
 * 4. Home has no "Recent matches": the Matches tab lists every match.
 * 5. An assessment card leads with its date and never names the coach
 *    ("Dora Fotiadi · Good" read as the parent rating the coach).
 * 6. Profile has no Account block (name + email): Settings shows both.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParentChildrenProvider } from '@/contexts/ParentChildrenContext'
import ParentHome from '../ParentHome'
import ParentMatches from '../ParentMatches'
import ParentAssessments from '../ParentAssessments'
import ParentAssessment from '../ParentAssessment'
import ParentProfilePage from '../ParentProfilePage'
import { server } from '../../../../tests/msw/server'
import { SUPABASE_URL } from '../../../../tests/msw/supabase'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'parent-194', email: 'parent194@synthetic.test.invalid' },
  profile: { full_name: 'Angelos Charisteas', role: 'parent' },
  signOut: vi.fn(), refreshProfile: vi.fn(),
}) }))
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }))

const COACH_NAME = 'Angelos Basinas'
const endpoint = (name: string) => `${SUPABASE_URL}/rest/v1/${name}`
const assessment = {
  id: 'a-1', squad_player_id: 'squad-1', session_id: null, coach_user_id: 'coach-1',
  created_at: '2026-10-13T10:00:00Z', coach_rating: 8,
  work_rate: 8, tactical: 8, attitude: 8, technical: 8, physical: 8, coachability: 8,
}
const match = {
  id: 'm-1', created_at: '2026-10-11T11:00:00Z', match_date: '2026-10-11', opponent: 'Panathinaikos U16',
  competition: 'League', venue: null, computed_rating: 7, team_score: 2, opponent_score: 1,
}
const clients: QueryClient[] = []
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')

// jsdom has no scrolling; the carousel calls scrollTo.
beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }))
afterAll(() => {
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
})

beforeEach(() => {
  server.use(
    // TRAK-286: no shared game plan.
    http.get(endpoint('game_for_family'), () => HttpResponse.json([])),
    http.get(endpoint('game_for_player'), () => HttpResponse.json([])),
    http.get(endpoint('player_parent_links'), () => HttpResponse.json([{ player_user_id: 'child-1' }])),
    http.get(endpoint('profiles'), ({ request }) => {
      const filter = new URL(request.url).searchParams.get('user_id') ?? ''
      const rows = [{ user_id: 'child-1', full_name: 'Giorgos Giakoumakis' }, { user_id: 'coach-1', full_name: COACH_NAME }]
      return HttpResponse.json(rows.filter(row => filter.includes(row.user_id)))
    }),
    http.get(endpoint('squad_players'), () => HttpResponse.json([{ id: 'squad-1' }])),
    http.get(endpoint('coach_assessments'), () => HttpResponse.json([assessment], { headers: { 'Content-Range': '0-0/1' } })),
    http.get(endpoint('coach_shared_feedback'), () => HttpResponse.json([])),
    http.get(endpoint('player_details'), () => HttpResponse.json([{ position: 'Attacker', current_club: 'Rehearsal Athens', age_group: 'U14' }])),
    http.get(endpoint('matches'), () => HttpResponse.json([match])),
    http.get(endpoint('recognition_awards'), () => HttpResponse.json([])),
    http.get(endpoint('parental_consents'), () => HttpResponse.json([])),
    http.post(endpoint('rpc/get_roster_children_awaiting_consent'), () => HttpResponse.json([])),
    http.post(endpoint('rpc/get_children_awaiting_consent'), () => HttpResponse.json([])),
    http.post(endpoint('rpc/get_my_approved_children_awaiting_signup'), () => HttpResponse.json([])),
    http.post(endpoint('rpc/get_my_child_logins'), () => HttpResponse.json([])),
    http.post(endpoint('rpc/get_my_child_credentials'), () => HttpResponse.json([])),
    http.post(endpoint('rpc/child_events'), () => HttpResponse.json([])),
    http.post(endpoint('rpc/family_training_history'), () => HttpResponse.json([])),
  )
})
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()) })

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
  clients.push(client)
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
    <ParentChildrenProvider><Routes>
      <Route path="/parent/home" element={<ParentHome />} />
      <Route path="/parent/matches" element={<ParentMatches />} />
      <Route path="/parent/assessments" element={<ParentAssessments />} />
      <Route path="/parent/assessment/:id" element={<ParentAssessment />} />
      <Route path="/parent/profile" element={<ParentProfilePage />} />
    </Routes></ParentChildrenProvider>
  </MemoryRouter></QueryClientProvider>)
}

describe('TRAK-194: the parent screens show each thing once', () => {
  it('4. Home has no "Recent matches"; the Matches tab still lists the match', async () => {
    renderAt('/parent/home')
    await screen.findByRole('region', { name: 'Latest coach assessment' })
    expect(screen.queryByRole('region', { name: 'Recent matches' })).toBeNull()
    expect(screen.queryByText('RECENT MATCHES')).toBeNull()
    expect(screen.queryByText('Panathinaikos U16')).toBeNull()
    cleanup()
    renderAt('/parent/matches')
    expect(await screen.findByText(/Panathinaikos U16/)).toBeInTheDocument()
  })

  it('5. the Home assessment card leads with the date and never names the coach', async () => {
    renderAt('/parent/home')
    const card = await screen.findByRole('group', { name: 'Assessment 1 of 1' })
    expect(within(card).getByText('13 Oct')).toBeInTheDocument()
    expect(within(card).queryByText(COACH_NAME)).toBeNull()
    expect(within(card).queryByText('Coach')).toBeNull()
  })

  it('5. the Assessments list and one assessment\'s page lead with the date, with no coach name', async () => {
    renderAt('/parent/assessments')
    const row = await screen.findByRole('link', { name: /13 Oct/ })
    expect(row).toHaveAttribute('href', '/parent/assessment/a-1')
    expect(within(row).queryByText(COACH_NAME)).toBeNull()
    expect(within(row).queryByText('Coach')).toBeNull()
    cleanup()
    renderAt('/parent/assessment/a-1')
    expect(await screen.findByText('13 Oct')).toBeInTheDocument()
    expect(screen.queryByText(COACH_NAME)).toBeNull()
  })

  it('6. Profile has no Account block; Settings is one tap away', async () => {
    renderAt('/parent/profile')
    expect(await screen.findByRole('button', { name: /settings/i })).toBeInTheDocument()
    expect(screen.queryByText('ACCOUNT')).toBeNull()
    expect(screen.queryByText('parent194@synthetic.test.invalid')).toBeNull()
  })
})
