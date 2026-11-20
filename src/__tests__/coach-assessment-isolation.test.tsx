import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { setSlider, sliderValue, sliderDisabled } from '../../tests/support/slider'
import { assessStep, nextButton, saveAssessment } from '../../tests/support/assess-steps'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CoachAssessPage from '@/pages/coach/CoachAssessPage'
import { server } from '../../tests/msw/server'
import { SUPABASE_URL } from '../../tests/msw/supabase'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { pickOption } from '@/test/arc-select'

// TRAK-176: coach screens read the coach's squads through the query cache.
function queries() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }
}

const auth = vi.hoisted(() => ({ user: { id: 'coach-a' }, profile: { full_name: 'Coach A' } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn(), startTimer: () => () => 100 }))

const endpoint = (table: string) => `${SUPABASE_URL}/rest/v1/${table}`
const assessmentA = { id: 'assessment-a', squad_player_id: 'player-a', created_at: '2026-09-20T18:00:00Z', work_rate: 8, tactical: 8, attitude: 8,
  technical: 8, physical: 8, coachability: 8, appearance: 'sub', session_id: 'session-1' }
interface Write { table: string; method: string; id: string | null; body: Record<string, unknown> }
let writes: Write[]
let reads: string[]
let releases: (() => void)[]

function gate() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  releases.push(release)
  return { promise, release }
}

function showForm(path = '/coach/assess') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/coach/assess" element={<CoachAssessPage />} />
    <Route path="/coach/home" element={<p>Coach home</p>} />
  </Routes></MemoryRouter>, queries())
}

const selector = () => screen.getAllByRole('combobox')[0]
const noteBox = () => screen.getByPlaceholderText(/First touch under pressure/)
const feedbackBox = () => screen.getByPlaceholderText(/Great week/)

// TRAK-500: Alex's saved assessment is edited by opening it (TRAK-69); selecting a player starts a new one.
async function openAlex() {
  const view = showForm(`/coach/assess?assessment=${assessmentA.id}`)
  await screen.findByText('Alex Synthetic')
  await waitFor(() => expect(reads).toContain('player-a'))
  return view
}

// TRAK-182: the player is chosen on the first step; the message and note have their own.
const PLAYER_NAME: Record<string, string> = { 'player-a': 'Alex Synthetic', 'player-b': 'Bella Synthetic' }
async function selectPlayer(player: string) {
  if (!screen.queryByRole('combobox', { name: 'Player' })) await assessStep('Player')
  // TRAK-425: a picked player shows once, as a card; Change brings the list back.
  const change = screen.queryByRole('button', { name: 'Change' })
  if (change) await userEvent.click(change)
  await pickOption('Player', PLAYER_NAME[player])
  await waitFor(() => expect(nextButton()).toBeEnabled())
}

beforeEach(() => {
  writes = []; reads = []; releases = []
  auth.user = { id: 'coach-a' }
  server.use(
    http.get(endpoint('squad_players'), () => HttpResponse.json([
      { id: 'player-a', player_name: 'Alex Synthetic' },
      { id: 'player-b', player_name: 'Bella Synthetic' },
    ])),
    // Read only by id (TRAK-500), and only coach A's row, as the owner-scoped query asks.
    http.get(endpoint('coach_assessments'), ({ request }) => {
      const params = new URL(request.url).searchParams
      reads.push(params.get('squad_player_id')?.replace('eq.', '') ?? '')
      const mine = params.get('coach_user_id') === 'eq.coach-a' && params.get('id') === `eq.${assessmentA.id}`
      return HttpResponse.json(mine ? [assessmentA] : [])
    }),
    http.get(endpoint('coach_shared_feedback'), () => HttpResponse.json([
      { body: 'Published feedback for Alex', published_at: '2026-09-19T12:00:00Z' },
    ])),
    http.get(endpoint('coach_assessment_notes'), () => HttpResponse.json([])),
    ...['coach_assessments', 'coach_assessment_notes', 'coach_shared_feedback'].flatMap(table =>
      ['post', 'patch'].map(method => http[method as 'post' | 'patch'](endpoint(table), async ({ request }) => {
        const body = await request.json() as Record<string, unknown>
        writes.push({ table, method, id: new URL(request.url).searchParams.get('id'), body })
        const id = new URL(request.url).searchParams.get('id')?.replace('eq.', '')
        return HttpResponse.json(table === 'coach_assessments' ? [{ id: method === 'post' ? 'assessment-b' : id }] : [])
      }))),
  )
})

afterEach(() => {
  cleanup()
  for (const release of releases) release()
})

// TRAK-182: walking the steps adds real interaction; CI under load needs more than 5 s.
describe('full assessment player boundaries', { timeout: 20_000 }, () => {
  it('never saves into Alex’s opened assessment after switching to Bella', async () => {
    await openAlex()
    await assessStep('Message')
    await screen.findByDisplayValue('Published feedback for Alex')
    await selectPlayer('player-b')
    await saveAssessment()
    await screen.findByText('Coach home')
    // A new row for Bella; Alex's row is not touched.
    expect(writes.map(write => [write.table, write.method, write.body.squad_player_id])).toEqual([['coach_assessments', 'post', 'player-b']])
  })

  it('ignores Alex’s late shared-feedback response after selecting Bella', async () => {
    const pending = gate()
    let started = false
    server.use(http.get(endpoint('coach_shared_feedback'), async () => {
      started = true
      await pending.promise
      return HttpResponse.json([{ body: 'Late private-to-Alex feedback', published_at: '2026-09-19T12:00:00Z' }])
    }))
    await openAlex()
    await waitFor(() => expect(started).toBe(true))
    await selectPlayer('player-b')
    await act(async () => { pending.release(); await new Promise(resolve => setTimeout(resolve, 30)) })
    await assessStep('Message')
    expect(feedbackBox()).toHaveValue('')
    // J5: with no message there is nothing to publish, so no Publish action is offered.
    await assessStep('Review')
    expect(screen.queryByRole('button', { name: /^Publish/ })).toBeNull()
    await saveAssessment()
    await screen.findByText('Coach home')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ table: 'coach_assessments', method: 'post', body: { squad_player_id: 'player-b' } })
  })

  it('clears the previous player’s scores and private draft before saving a new assessment', async () => {
    await openAlex()
    await assessStep('Message')
    await screen.findByDisplayValue('Published feedback for Alex')
    await assessStep('Note')
    await userEvent.type(noteBox(), 'Private draft for Alex only')
    await selectPlayer('player-b')
    await assessStep('Message')
    await waitFor(() => expect(feedbackBox()).toHaveValue(''))
    await assessStep('Note')
    expect(noteBox()).toHaveValue('')
    await assessStep('Ratings')
    for (const slider of screen.getAllByRole('slider')) expect(sliderValue(slider)).toBe(5)
    setSlider(screen.getAllByRole('slider')[0], 6)
    await saveAssessment()
    await screen.findByText('Coach home')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ method: 'post', body: { squad_player_id: 'player-b', work_rate: 6, tactical: 5 } })
  })

  it('does not treat failed shared-feedback reads as an empty saved draft', async () => {
    let fail = true
    server.use(http.get(endpoint('coach_shared_feedback'), () => fail
      ? HttpResponse.json({ message: 'Synthetic feedback access denied' }, { status: 403 })
      : HttpResponse.json([{ body: 'Published feedback for Alex', published_at: '2026-09-19T12:00:00Z' }])))
    await openAlex()
    expect(await screen.findByRole('alert')).toHaveTextContent(/load/i)
    expect(nextButton()).toBeDisabled()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(nextButton()).toBeEnabled())
    await assessStep('Message')
    await screen.findByDisplayValue('Published feedback for Alex')
  })

  it('preserves an unsaved draft when the same account receives a refreshed user object', async () => {
    const view = await openAlex()
    await assessStep('Message')
    await screen.findByDisplayValue('Published feedback for Alex')
    await userEvent.clear(feedbackBox())
    await userEvent.type(feedbackBox(), 'Coach’s unfinished edit')
    auth.user = { id: 'coach-a' }
    view.rerender(<MemoryRouter><Routes>
      <Route path="/coach/assess" element={<CoachAssessPage />} />
      <Route path="/coach/home" element={<p>Coach home</p>} />
    </Routes></MemoryRouter>)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(feedbackBox()).toHaveValue('Coach’s unfinished edit')
    expect(reads.filter(player => player === 'player-a')).toHaveLength(1)
  })

  it('keeps a failed private-note save retryable without inserting a second assessment', async () => {
    let attempts = 0
    server.use(http.post(endpoint('coach_assessment_notes'), async ({ request }) => {
      const body = await request.json() as Record<string, unknown>
      writes.push({ table: 'coach_assessment_notes', method: 'post', id: null, body })
      attempts++
      return attempts === 1
        ? HttpResponse.json({ message: 'Synthetic note rejection' }, { status: 403 })
        : HttpResponse.json([])
    }))
    showForm()
    await selectPlayer('player-b')
    await assessStep('Note')
    await userEvent.type(noteBox(), 'Keep this private draft for Bella')
    await saveAssessment()
    await waitFor(() => expect(attempts).toBe(1))
    expect(screen.queryByText('Coach home')).not.toBeInTheDocument()
    await assessStep('Note')
    expect(noteBox()).toHaveValue('Keep this private draft for Bella')
    await saveAssessment()
    await screen.findByText('Coach home')
    const assessmentWrites = writes.filter(write => write.table === 'coach_assessments')
    expect(assessmentWrites.map(write => write.method)).toEqual(['post', 'patch'])
    expect(assessmentWrites[1].id).toBe('eq.assessment-b')
    expect(writes.filter(write => write.table === 'coach_assessment_notes')
      .every(write => write.body.assessment_id === 'assessment-b')).toBe(true)
  })

  it('loads and clears a private note independently of published feedback', async () => {
    server.use(http.get(endpoint('coach_assessment_notes'), () => HttpResponse.json([{ note: 'Existing private note' }])))
    await openAlex()
    await assessStep('Message')
    expect(await screen.findByDisplayValue('Published feedback for Alex')).toBe(feedbackBox())
    await assessStep('Note')
    await screen.findByDisplayValue('Existing private note')
    await userEvent.clear(noteBox())
    await saveAssessment()
    await screen.findByText('Coach home')
    expect(writes.find(write => write.table === 'coach_assessment_notes')?.body)
      .toMatchObject({ assessment_id: 'assessment-a', note: '' })
    // J5: the published message is unchanged, so it is left alone. Rewriting
    // it would re-stamp published_at and mark it "new" for the family again.
    expect(writes.find(write => write.table === 'coach_shared_feedback')).toBeUndefined()
  })

  it('clears the roster selection and draft when another coach signs in', async () => {
    const pending = gate()
    server.use(http.get(endpoint('squad_players'), async ({ request }) => {
      if (new URL(request.url).searchParams.get('coach_user_id') === 'eq.coach-b') {
        await pending.promise
        return HttpResponse.json([])
      }
      return HttpResponse.json([{ id: 'player-a', player_name: 'Alex Synthetic' }])
    }))
    const view = await openAlex()
    await assessStep('Message')
    await screen.findByDisplayValue('Published feedback for Alex')
    auth.user = { id: 'coach-b' }
    view.rerender(<MemoryRouter><Routes>
      <Route path="/coach/assess" element={<CoachAssessPage />} />
      <Route path="/coach/home" element={<p>Coach home</p>} />
    </Routes></MemoryRouter>)
    expect(selector()).toHaveValue('')
    expect(screen.queryByRole('option', { name: 'Alex Synthetic' })).not.toBeInTheDocument()
    // Back on the first step, with Alex's message gone and no way forward.
    expect(screen.queryByPlaceholderText(/Great week/)).toBeNull()
    expect(nextButton()).toBeDisabled()
    expect(writes).toEqual([])
  })
})
