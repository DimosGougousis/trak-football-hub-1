/**
 * TRAK-182, live run 3 (16 Oct, Imad): assessing a player for a training still
 * asked "Appearance: Started, Sub or Training". The session is already a
 * training, so the question goes, and the assessment saves as a training. A
 * match still asks.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CoachAssessPage from '@/pages/coach/CoachAssessPage'
import { saveAssessment } from '../../../../tests/support/assess-steps'
import { server } from '../../../../tests/msw/server'
import { SUPABASE_URL } from '../../../../tests/msw/supabase'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// TRAK-176: coach screens read the coach's squads through the query cache.
function queries() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }
}

const auth = vi.hoisted(() => ({ user: { id: 'coach-182' }, profile: { full_name: 'Coach' } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn(), startTimer: () => () => 100 }))

const endpoint = (table: string) => `${SUPABASE_URL}/rest/v1/${table}`
const SESSIONS = [
  { id: 'session-gym', title: 'Physical — Gym work', session_date: '2026-10-15', session_type: 'training' },
  { id: 'session-match', title: 'vs PAOK U16', session_date: '2026-10-15', session_type: 'match' },
]
let posted: Record<string, unknown>[]

beforeEach(() => {
  posted = []
  server.use(
    http.get(endpoint('squad_players'), () => HttpResponse.json([{ id: 'player-a', player_name: 'Kostas Tsimikas' }])),
    http.get(endpoint('coach_sessions'), () => HttpResponse.json(SESSIONS)),
    http.get(endpoint('session_attendance'), () => HttpResponse.json(SESSIONS.map(s => ({ session_id: s.id })))),
    http.get(endpoint('coach_assessments'), () => HttpResponse.json([])),
    http.post(endpoint('coach_assessments'), async ({ request }) => {
      posted.push(await request.json() as Record<string, unknown>)
      return HttpResponse.json([{ id: 'assessment-1' }])
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
const select = (label: string) => screen.getByRole('combobox', { name: label }) as HTMLSelectElement
async function choose(sessionId: string) {
  await screen.findByRole('option', { name: 'Kostas Tsimikas' })
  await userEvent.selectOptions(select('Player'), 'player-a')
  await screen.findByRole('option', { name: /Gym work/ })
  await userEvent.selectOptions(select('Session'), sessionId)
  // Loaded: a training opens Next; a match first asks Appearance (enabled once the form is ready).
  await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Appearance' }) ?? screen.getByRole('button', { name: 'Next' })).toBeEnabled())
}

describe('TRAK-182: no Appearance question for a training', { timeout: 20_000 }, () => {
  it('a training asks no Appearance and saves as a training', async () => {
    showForm()
    await choose('session-gym')
    expect(screen.queryByText('APPEARANCE')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Started' })).toBeNull()
    await saveAssessment()
    await screen.findByText('Coach home')
    expect(posted).toHaveLength(1)
    expect(posted[0].appearance).toBe('training')
  })

  // Pilot coach's item 13 (Imad, 19 Oct): a match asks Started, Sub or Didn't play, in Arc's select.
  it("a match asks Started, Sub or Didn't play, and saves the choice", async () => {
    showForm()
    await choose('session-match')
    const appearance = screen.getByRole('combobox', { name: 'Appearance' })
    // Imad, 19 Oct (J4, no invented defaults): nothing is pre-picked, and Next waits for a choice.
    expect(appearance).not.toHaveTextContent(/Started|Sub|Didn't play/)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    // By keyboard, as Radix supports it (jsdom has no pointer capture).
    appearance.focus()
    await userEvent.keyboard('{Enter}')
    expect((await screen.findAllByRole('option')).map(o => o.textContent)).toEqual(['Started', 'Sub', "Didn't play"])
    await userEvent.keyboard('{End}{Enter}')
    await waitFor(() => expect(appearance).toHaveTextContent("Didn't play"))
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    await saveAssessment()
    await screen.findByText('Coach home')
    expect(posted).toHaveLength(1)
    expect(posted[0].appearance).toBe('didnt_play')
  })
})
