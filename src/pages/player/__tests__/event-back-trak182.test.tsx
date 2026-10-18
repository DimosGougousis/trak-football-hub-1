/**
 * TRAK-182 (live run 3, 16 Oct): opened from Home's event sheet, the event
 * page's Back went to the events list, and Back again to Home; the player's
 * went to Sessions. Back now returns where the page was opened from, in one
 * step. Opened any other way (a link, the bell), it goes to the list as before.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useNavigationType } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { rpc, rpcRows, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { AuthProvider } from '@/contexts/AuthContext'
import PlayerEvent from '@/pages/player/PlayerEvent'

const PLAYER = { id: 'player-182-back' }
const EVENT = {
  id: 'ev-1', coach_user_id: 'coach-1', published: true, event_type: 'training', title: 'Finishing',
  event_date: '2026-11-14', start_time: '10:00:00', starts_at: '2026-11-14T10:00:00Z',
  venue: 'Main pitch', opponent: null, meet_time: null, kit: null, home_away: null,
  status: 'scheduled', cancel_reason: null, sequence: 0,
}

beforeEach(() => {
  signInAs(PLAYER)
  server.use(
    rpcRows('child_events', [EVENT]),
    rpc('my_consent_status', () => ({ required: false, age: 13, consent_age: 15, threshold: 18, own_choice: false })),
    http.get(`${SUPABASE_URL}/rest/v1/event_absences`, () => HttpResponse.json([])),
  )
})
afterEach(() => cleanup())

// POP: Back stepped back in history (one step); PUSH would add another page to step through.
function Landed({ name }: { name: string }) { return <h1>{`${name} (${useNavigationType()})`}</h1> }
/** The page's own Back, not the tab bar's buttons. */
const back = async (name: string) => (await screen.findAllByRole('button', { name })).find(b => !b.closest('nav'))!

function at(entries: (string | { pathname: string; state: unknown })[]) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}><AuthProvider><Routes>
      <Route path="/player/home" element={<Landed name="Player Home" />} />
      <Route path="/player/matches" element={<Landed name="Player Sessions" />} />
      <Route path="/player/event/:id" element={<PlayerEvent />} />
    </Routes></AuthProvider></MemoryRouter>
  </QueryClientProvider>)
}

describe("TRAK-182: the event page's Back", () => {
  it('opened from Home, Back says Home and returns there in one step', async () => {
    at(['/player/home', { pathname: '/player/event/ev-1', state: { from: '/player/home' } }])
    await userEvent.click(await back('Home'))
    expect(await screen.findByRole('heading', { name: 'Player Home (POP)' })).toBeInTheDocument()
  })

  it('opened some other way, Back goes to Sessions', async () => {
    at(['/player/event/ev-1'])
    await userEvent.click(await back('Sessions'))
    expect(await screen.findByRole('heading', { name: 'Player Sessions (PUSH)' })).toBeInTheDocument()
  })
})
