// @story J5
/**
 * TRAK-559 (phone review, 23 Nov): Assess player in 3 steps, not 5. Player and bands, then objectives and notes, then
 * review and save. Saving is unchanged, and a saved draft opens again with its bands, answers and notes.
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

const auth = vi.hoisted(() => ({ user: { id: 'coach-a' }, profile: { full_name: 'Coach A' } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn(), startTimer: () => () => 100 }))

const endpoint = (table: string) => `${SUPABASE_URL}/rest/v1/${table}`
let shared: string | null
let saves: Record<string, unknown>[]
let feedback: Record<string, unknown>[]
let notes: Record<string, unknown>[]

beforeEach(() => {
  shared = '2026-10-01T09:00:00Z'; saves = []; feedback = []; notes = []
  server.use(
    http.get(endpoint('squad_players'), () => HttpResponse.json([{ id: 'player-a', player_name: 'Alex Synthetic', age_group: 'U16', position: 'Attacker' }])),
    // A saved draft, for ?assessment=draft-1: both of the page's reads of it get this row.
    http.get(endpoint('coach_assessments'), () => HttpResponse.json({ id: 'draft-1', squad_player_id: 'player-a', created_at: '2026-11-20T09:00:00Z', coach_sessions: null,
      work_rate: 8, tactical: 5, attitude: 5, technical: 5, physical: 5, coachability: 5, appearance: null, published_at: null })),
    http.post(endpoint('coach_assessments'), () => HttpResponse.json([{ id: 'direct' }])),
    http.get(endpoint('coach_shared_feedback'), () => HttpResponse.json({ body: 'Great pressing today', published_at: null })),
    http.get(endpoint('coach_assessment_notes'), () => HttpResponse.json({ note: 'Work on the first touch' })),
    http.post(endpoint('coach_shared_feedback'), async ({ request }) => { feedback.push(await request.json() as Record<string, unknown>); return HttpResponse.json([]) }),
    http.post(endpoint('coach_assessment_notes'), async ({ request }) => { notes.push(await request.json() as Record<string, unknown>); return HttpResponse.json([]) }),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/coach_squad_player_consent_required`, () => HttpResponse.json(false)),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/feature_on`, async ({ request }) => HttpResponse.json((await request.json() as { p_feature: string }).p_feature === 'season_plan')),
    http.get(endpoint('season_plans'), () => HttpResponse.json({ id: 'plan-1', squad: 'U16', shared_at: shared, starts_on: '2026-08-03', ends_on: '2027-05-30',
      positions_known: 'yes', watch_rule: 't2', last_shared_at: shared, unshared_parts: [], unshared_players: [], eval_every: 'month', eval_day: 0 })),
    http.get(endpoint('player_objectives'), () => HttpResponse.json([
      { id: 'obj-a', squad_player_id: 'player-a', title: 'Shoot first time', source: 'own', season_objective_id: null, created_at: '2026-10-01T09:00:00Z', status: 'open', retired_at: null },
    ])),
    http.get(endpoint('assessment_objectives'), () => HttpResponse.json([
      { player_objective_id: 'obj-a', status: 'on_track', added_title: null, applied_at: null, player_objectives: { title: 'Shoot first time' } },
    ])),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/save_assessment_with_objectives`, async ({ request }) => {
      saves.push(await request.json() as Record<string, unknown>)
      return HttpResponse.json('assessment-1')
    }),
  )
})
afterEach(() => cleanup())

function showForm(path = '/coach/assess') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/coach/assess" element={<CoachAssessPage />} />
    <Route path="/coach/home" element={<p>Coach home</p>} />
  </Routes></MemoryRouter></QueryClientProvider>)
}
const next = () => screen.getByRole('button', { name: 'Next' })
const stepNames = () => within(screen.getByRole('navigation', { name: 'Assessment steps' })).getAllByRole('listitem')
  .map(item => ['Player & bands', 'Objectives & notes', 'Message & note', 'Review'].find(name => item.textContent?.includes(name)))

describe('TRAK-559: Assess player in 3 steps', { timeout: 30_000 }, () => {
  it('player and bands, then objectives and notes, then review; saves the bands, answers and note (TRAK-532: no message)', async () => {
    const user = userEvent.setup()
    showForm()

    // Step 1: no bands until a player is selected, then the player and the bands on one step.
    expect(screen.queryByRole('slider', { name: 'Work Rate' })).not.toBeInTheDocument()
    await pickOption('Player', 'Alex Synthetic')
    // The player's squad has a shared plan, so the second step names its objectives.
    await waitFor(() => expect(stepNames()).toEqual(['Player & bands', 'Objectives & notes', 'Review']))
    expect(await screen.findByRole('slider', { name: 'Work Rate' })).toBeInTheDocument()
    expect(screen.getByText('Alex Synthetic')).toBeInTheDocument()
    await waitFor(() => expect(next()).toBeEnabled())
    await user.click(next())

    // Step 2: the objectives and the private note together; Next waits for every answer. TRAK-532: with a shared plan
    // the assessment stays with the coach, so there is no message to the player.
    const progress = await screen.findByRole('group', { name: 'Progress on Shoot first time' })
    expect(screen.queryByLabelText('Message to Alex')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Private note/)).toBeInTheDocument()
    expect(next()).toBeDisabled()
    await user.click(within(progress).getByRole('button', { name: 'Met' }))
    await user.type(screen.getByLabelText(/Private note/), 'Ready for U17')
    await user.click(next())

    // Step 3: review and one Save (no Publish, no Save draft).
    expect(await screen.findByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Coach home')
    expect(saves).toHaveLength(1)
    expect(saves[0]).toMatchObject({ p_assessment_id: null, p_row: { squad_player_id: 'player-a', work_rate: 5 },
      p_progress: [{ player_objective_id: 'obj-a', status: 'met' }] })
    expect(feedback).toEqual([])
    expect(notes).toMatchObject([{ assessment_id: 'assessment-1', note: 'Ready for U17' }])
  })

  it('a saved draft opens again with its bands, objective answers and note', async () => {
    const user = userEvent.setup()
    showForm('/coach/assess?assessment=draft-1')
    expect(await screen.findByText('Alex Synthetic')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Work Rate' })).toHaveAttribute('aria-valuenow', '8'))
    await waitFor(() => expect(next()).toBeEnabled())
    await user.click(next())
    const progress = await screen.findByRole('group', { name: 'Progress on Shoot first time' })
    await waitFor(() => expect(within(progress).getByRole('button', { name: 'On track' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByLabelText('Message to Alex')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText(/Private note/)).toHaveValue('Work on the first touch'))
  })

  it('a squad with no shared plan still has 3 steps: the second holds the message and the note', async () => {
    shared = null
    const user = userEvent.setup()
    showForm()
    await pickOption('Player', 'Alex Synthetic')
    await waitFor(() => expect(next()).toBeEnabled())
    expect(stepNames()).toEqual(['Player & bands', 'Message & note', 'Review'])
    await user.click(next())
    expect(screen.getByLabelText('Message to Alex')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /^Progress on/ })).not.toBeInTheDocument()
  })
})
