// @story J5
/**
 * TRAK-500 (Imad, 19 Nov): Assess player asks for no session. Step 1 is the
 * player alone, and each assessment is a new row with no session. It replaces
 * TRAK-68's one assessment per player per session.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { assessStep, nextButton, saveAssessment } from '../../../../tests/support/assess-steps'
import { pickOption } from '@/test/arc-select'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CoachAssessPage from '@/pages/coach/CoachAssessPage'
import { server } from '../../../../tests/msw/server'
import { SUPABASE_URL } from '../../../../tests/msw/supabase'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// TRAK-176: coach screens read the coach's squads through the query cache.
function queries() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }
}

const auth = vi.hoisted(() => ({ user: { id: 'coach-a' }, profile: { full_name: 'Coach A' } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn(), startTimer: () => () => 100 }))

const endpoint = (table: string) => `${SUPABASE_URL}/rest/v1/${table}`
type Row = { id: string; squad_player_id: string; session_id: string | null; created_at: string } & Record<string, unknown>
let rows: Row[]
let writes: { method: 'post' | 'patch'; id: string | null; body: Record<string, unknown> }[]

const eq = (params: URLSearchParams, key: string) => params.get(key)?.replace(/^eq\./, '')

beforeEach(() => {
  rows = []; writes = []
  server.use(
    http.get(endpoint('squad_players'), () => HttpResponse.json([
      { id: 'player-a', player_name: 'Alex Synthetic' },
      { id: 'player-b', player_name: 'Bella Synthetic' },
    ])),
    // A small assessments table: filters by player, session and created_at like PostgREST.
    http.get(endpoint('coach_assessments'), ({ request }) => {
      const p = new URL(request.url).searchParams
      const since = p.get('created_at')?.replace(/^gte\./, '')
      return HttpResponse.json(rows.filter(r =>
        r.squad_player_id === eq(p, 'squad_player_id')
        && (!p.has('session_id') || r.session_id === eq(p, 'session_id'))
        && (!since || r.created_at >= since)))
    }),
    http.post(endpoint('coach_assessments'), async ({ request }) => {
      const body = await request.json() as Record<string, unknown>
      const id = `assessment-${rows.length + 1}`
      rows.push({ ...body, id, squad_player_id: body.squad_player_id as string,
        session_id: (body.session_id as string) ?? null, created_at: new Date().toISOString() })
      writes.push({ method: 'post', id: null, body })
      return HttpResponse.json([{ id }])
    }),
    http.patch(endpoint('coach_assessments'), async ({ request }) => {
      const id = eq(new URL(request.url).searchParams, 'id') ?? null
      const body = await request.json() as Record<string, unknown>
      writes.push({ method: 'patch', id, body })
      return HttpResponse.json([{ id }])
    }),
    http.get(endpoint('coach_shared_feedback'), () => HttpResponse.json([])),
    http.get(endpoint('coach_assessment_notes'), () => HttpResponse.json([])),
    ...['coach_assessment_notes', 'coach_shared_feedback'].flatMap(table =>
      (['post', 'patch'] as const).map(method => http[method](endpoint(table), () => HttpResponse.json([])))),
    http.post(`${SUPABASE_URL}/rest/v1/rpc/coach_squad_player_consent_required`, () => HttpResponse.json(false)),
  )
})
afterEach(() => cleanup())

function showForm() {
  render(<MemoryRouter initialEntries={['/coach/assess']}><Routes>
    <Route path="/coach/assess" element={<CoachAssessPage />} />
    <Route path="/coach/home" element={<p>Coach home</p>} />
  </Routes></MemoryRouter>, queries())
}
async function assessAlex() {
  showForm()
  await pickOption('Player', 'Alex Synthetic')
  await saveAssessment()
  await screen.findByText('Coach home')
}

describe('TRAK-500: Assess player asks for no session', { timeout: 20_000 }, () => {
  it('step 1 asks for the player alone: no Session, no Started or Sub', async () => {
    showForm()
    await pickOption('Player', 'Alex Synthetic')
    await waitFor(() => expect(nextButton()).toBeEnabled())
    expect(screen.queryByRole('combobox', { name: 'Session' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Appearance' })).toBeNull()
    await assessStep('Review')
    expect(screen.queryByText('Session')).toBeNull()
  })

  it('assessing the same player twice gives two assessments, neither with a session', async () => {
    await assessAlex()
    cleanup()
    await assessAlex()
    expect(writes.map(write => write.method)).toEqual(['post', 'post'])
    expect(rows.map(row => [row.squad_player_id, row.session_id])).toEqual([['player-a', null], ['player-a', null]])
    for (const write of writes) expect(write.body).not.toHaveProperty('session_id')
  })
})
