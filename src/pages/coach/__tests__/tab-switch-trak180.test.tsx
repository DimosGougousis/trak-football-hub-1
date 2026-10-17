import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { forgetScreens, remember, remembered } from '@/lib/screen-memory'

/**
 * TRAK-180 (J4, Kostas on his iPhone, 15 Oct): switching Home ↔ Squad flashed
 * "Your squad is being prepared" for a squad with players, and an all-Loading
 * Home, then read everything again from nothing. Squad now says it is loading
 * until its read answers, and a revisit shows what the screen last showed
 * while the reads refresh it.
 */
const COACH = { id: 'coach-1' }
const PLAYERS = [
  { id: 'sp-1', coach_user_id: COACH.id, player_name: 'Ade Okafor', position: 'Midfielder', created_at: '2026-09-01T00:00:00Z' },
  { id: 'sp-2', coach_user_id: COACH.id, player_name: 'Bo Lind', position: 'Defender', created_at: '2026-09-01T00:00:00Z' },
]
const heroCount = () => screen.getByText('Players in squad').previousElementSibling?.textContent?.trim()

/** The coach's reads; squad_players waits for `gate` when one is given. */
function coachReads(players: typeof PLAYERS | [], gate?: Promise<void>) {
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach Vasilis', invite_code: 'ABCD' }]),
    table('coach_details', [{ user_id: COACH.id, team: 'U15s', coach_role: 'Head Coach' }]),
    table('coach_assessments', []),
    table('session_attendance', []),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('feature_on', () => true),
    http.get(`${SUPABASE_URL}/rest/v1/coach_sessions`, ({ request }) =>
      new URL(request.url).searchParams.get('limit') === '1'
        ? HttpResponse.json([])
        : HttpResponse.json([], { headers: { 'Content-Range': '*/0' } })),
    http.get(`${SUPABASE_URL}/rest/v1/squad_players`, async () => {
      if (gate) await gate
      return HttpResponse.json(players)
    }),
  )
}

afterEach(() => { cleanup(); forgetScreens() })

describe('TRAK-180 switching between Home and Squad', () => {
  it('Squad says it is loading, never "being prepared", until its read answers', async () => {
    signInAs(COACH)
    let release!: () => void
    coachReads(PLAYERS, new Promise<void>(resolve => { release = resolve }))
    renderApp('/coach/squad')
    expect(await screen.findByRole('status')).toHaveTextContent(/Loading your squad/)
    expect(screen.queryByText('Your squad is being prepared')).toBeNull()
    release()
    expect(await screen.findByText('Ade Okafor')).toBeInTheDocument()
    expect(screen.queryByText(/Loading your squad/)).toBeNull()
  })

  it('an empty squad still says "being prepared", once the read has answered', async () => {
    signInAs(COACH)
    coachReads([])
    renderApp('/coach/squad')
    expect(await screen.findByText('Your squad is being prepared')).toBeInTheDocument()
  })

  it('going back to Squad and to Home shows what they last showed at once, then refreshes', async () => {
    signInAs(COACH)
    const user = userEvent.setup()
    coachReads(PLAYERS)
    renderApp('/coach/squad')
    expect(await screen.findByText('Ade Okafor')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Home$/i }))
    await waitFor(() => expect(heroCount()).toBe('2'))

    // From here every squad read is held: only the memory can show players.
    let release!: () => void
    coachReads(PLAYERS, new Promise<void>(resolve => { release = resolve }))
    await user.click(screen.getByRole('button', { name: /^Squad$/i }))
    expect(screen.getByText('Ade Okafor')).toBeInTheDocument()
    expect(screen.queryByText('Your squad is being prepared')).toBeNull()
    expect(screen.queryByText(/Loading your squad/)).toBeNull()

    await user.click(screen.getByRole('button', { name: /^Home$/i }))
    expect(heroCount()).toBe('2')
    release()
    await waitFor(() => expect(heroCount()).toBe('2'))
  })

  it("a revisit whose recent-assessments read fails doesn't show the last visit's list", async () => {
    signInAs(COACH)
    const user = userEvent.setup()
    coachReads(PLAYERS)
    const recent = [{ id: 'a-1', coach_user_id: COACH.id, squad_player_id: 'sp-1', coach_rating: 7,
      created_at: '2026-09-20T10:00:00Z', squad_players: { player_name: 'Ade Okafor' } }]
    server.use(table('coach_assessments', recent))
    renderApp('/coach/home')
    expect(await screen.findByRole('button', { name: /Open Ade Okafor's profile/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Squad$/i }))
    expect(await screen.findByText('Ade Okafor')).toBeInTheDocument()

    // Only the recent list (limit 5) fails this time.
    server.use(http.get(`${SUPABASE_URL}/rest/v1/coach_assessments`, ({ request }) =>
      new URL(request.url).searchParams.get('limit') === '5'
        ? HttpResponse.json({ message: 'unavailable' }, { status: 500 })
        : HttpResponse.json(recent)))
    await user.click(screen.getByRole('button', { name: /^Home$/i }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Open Ade Okafor's profile/ })).toBeNull())
  })

  it("keeps each account's screens apart, and forgets them all on sign-out", () => {
    remember('coach-squad', 'coach-1', { players: PLAYERS })
    expect(remembered('coach-squad', 'coach-1')).toEqual({ players: PLAYERS })
    expect(remembered('coach-squad', 'coach-2')).toBeUndefined()
    expect(remembered('coach-squad', null)).toBeUndefined()
    forgetScreens()
    expect(remembered('coach-squad', 'coach-1')).toBeUndefined()
  })
})
