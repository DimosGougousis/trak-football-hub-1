// @story J5
/**
 * TRAK-526 (Reports 3/10, Imad 21 Nov): Assess player asks about the player's objectives after Ratings, as the squad
 * evaluation does: every open objective needs an answer before the assessment saves, and the coach can add one. The
 * bands and the answers go in one call. A squad with no shared season plan has no Objectives step.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { pickOption } from '@/test/arc-select'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CoachAssessPage from '@/pages/coach/CoachAssessPage'
import { server } from '../../../../tests/msw/server'
import { SUPABASE_URL } from '../../../../tests/msw/supabase'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

function queries() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }
}

const auth = vi.hoisted(() => ({ user: { id: 'coach-a' }, profile: { full_name: 'Coach A' } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn(), startTimer: () => () => 100 }))

const endpoint = (table: string) => `${SUPABASE_URL}/rest/v1/${table}`
let shared: string | null
let saves: Record<string, unknown>[]
let inserts: number

beforeEach(() => {
  shared = '2026-10-01T09:00:00Z'; saves = []; inserts = 0
  server.use(
    http.get(endpoint('squad_players'), () => HttpResponse.json([{ id: 'player-a', player_name: 'Alex Synthetic', age_group: 'U16', position: 'Attacker' }])),
    http.get(endpoint('coach_assessments'), () => HttpResponse.json([])),
    http.post(endpoint('coach_assessments'), () => { inserts += 1; return HttpResponse.json([{ id: 'direct' }]) }),
    http.get(endpoint('coach_shared_feedback'), () => HttpResponse.json([])),
    http.get(endpoint('coach_assessment_notes'), () => HttpResponse.json([])),
    ...['coach_assessment_notes', 'coach_shared_feedback'].map(table => http.post(endpoint(table), () => HttpResponse.json([]))),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/coach_squad_player_consent_required`, () => HttpResponse.json(false)),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/feature_on`, async ({ request }) => HttpResponse.json((await request.json() as { p_feature: string }).p_feature === 'season_plan')),
    http.get(endpoint('season_plans'), () => HttpResponse.json({ id: 'plan-1', squad: 'U16', shared_at: shared, starts_on: '2026-08-03', ends_on: '2027-05-30',
      positions_known: 'yes', watch_rule: 't2', last_shared_at: shared, unshared_parts: [], unshared_players: [], eval_every: 'month', eval_day: 0 })),
    http.get(endpoint('player_objectives'), () => HttpResponse.json([
      { id: 'obj-a', squad_player_id: 'player-a', title: 'Shoot first time', source: 'own', season_objective_id: null, created_at: '2026-10-01T09:00:00Z', status: 'open', retired_at: null },
      { id: 'obj-b', squad_player_id: 'player-a', title: 'Press from the front', source: 'own', season_objective_id: null, created_at: '2026-10-01T09:00:00Z', status: 'open', retired_at: null },
    ])),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/save_assessment_with_objectives`, async ({ request }) => {
      saves.push(await request.json() as Record<string, unknown>)
      return HttpResponse.json('assessment-1')
    }),
  )
})
afterEach(() => cleanup())

function showForm() {
  render(<MemoryRouter initialEntries={['/coach/assess']}><Routes>
    <Route path="/coach/assess" element={<CoachAssessPage />} />
    <Route path="/coach/home" element={<p>Coach home</p>} />
  </Routes></MemoryRouter>, queries())
}
const next = () => screen.getByRole('button', { name: 'Next' })
const NAMES = ['Player', 'Ratings', 'Objectives', 'Message & note', 'Review']
const steps = () => within(screen.getByRole('navigation', { name: 'Assessment steps' })).getAllByRole('listitem')
  .map(item => NAMES.find(name => item.textContent?.includes(name)))

describe('TRAK-526: Assess asks about objectives', { timeout: 30_000 }, () => {
  it('asks after Ratings, waits for every answer, and saves the bands and answers in one call', async () => {
    const user = userEvent.setup()
    showForm()
    await pickOption('Player', 'Alex Synthetic')
    await waitFor(() => expect(steps()).toEqual(['Player', 'Ratings', 'Objectives', 'Message & note', 'Review']))
    await waitFor(() => expect(next()).toBeEnabled())
    await user.click(next())
    await user.click(next())
    const first = await screen.findByRole('group', { name: 'Progress on Shoot first time' })
    const second = screen.getByRole('group', { name: 'Progress on Press from the front' })
    expect(next()).toBeDisabled()
    await user.click(within(first).getByRole('button', { name: 'On track' }))
    expect(next()).toBeDisabled()
    await user.click(within(second).getByRole('button', { name: 'Met' }))
    await user.type(await screen.findByLabelText('Add another objective'), 'Scan before receiving')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.click(next())
    await user.click(next())
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Coach home')
    expect(inserts).toBe(0)
    expect(saves).toHaveLength(1)
    expect(saves[0]).toMatchObject({
      p_assessment_id: null,
      p_row: { squad_player_id: 'player-a', work_rate: 5 },
      p_progress: [{ player_objective_id: 'obj-a', status: 'on_track' }, { player_objective_id: 'obj-b', status: 'met' }],
      p_add: ['Scan before receiving'],
    })
  })

  it('a squad with no shared plan has no Objectives step and saves as before', async () => {
    shared = null
    const user = userEvent.setup()
    showForm()
    await pickOption('Player', 'Alex Synthetic')
    await waitFor(() => expect(next()).toBeEnabled())
    expect(steps()).toEqual(['Player', 'Ratings', 'Message & note', 'Review'])
    for (let i = 0; i < 3; i++) await user.click(next())
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Coach home')
    expect(saves).toHaveLength(0)
    expect(inserts).toBe(1)
  })
})
