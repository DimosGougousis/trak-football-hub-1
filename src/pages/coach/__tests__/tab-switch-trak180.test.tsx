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
// TRAK-197: Home lists its players in the Player overview, one row each.
const homeRow = (name: string) => screen.queryByRole('button', { name: new RegExp(`^Open ${name}'s profile`) })
// Home reads the squad, assessments, sessions and attendance before its rows show:
// over 1 s on GitHub's runner (#367's run, 19 Oct), so allow 5 s like the other coach waits.
const HOME_LOAD = { timeout: 5000 }

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
    await waitFor(() => expect(homeRow('Bo Lind')).not.toBeNull(), HOME_LOAD)

    // From here every squad read is held: only the memory can show players.
    let release!: () => void
    coachReads(PLAYERS, new Promise<void>(resolve => { release = resolve }))
    await user.click(screen.getByRole('button', { name: /^Squad$/i }))
    expect(screen.getByText('Ade Okafor')).toBeInTheDocument()
    expect(screen.queryByText('Your squad is being prepared')).toBeNull()
    expect(screen.queryByText(/Loading your squad/)).toBeNull()

    await user.click(screen.getByRole('button', { name: /^Home$/i }))
    expect(homeRow('Ade Okafor')).not.toBeNull()
    expect(screen.queryByText('Loading your players…')).toBeNull()
    release()
    await waitFor(() => expect(homeRow('Bo Lind')).not.toBeNull(), HOME_LOAD)
  }, 20_000) // four tab switches take longer than 5 s on GitHub's runners

  it("a revisit whose assessments read fails doesn't show the last visit's players", async () => {
    signInAs(COACH)
    const user = userEvent.setup()
    coachReads(PLAYERS)
    renderApp('/coach/home')
    await waitFor(() => expect(homeRow('Ade Okafor')).not.toBeNull(), HOME_LOAD)
    await user.click(screen.getByRole('button', { name: /^Squad$/i }))
    expect(await screen.findByText('Ade Okafor')).toBeInTheDocument()

    // The assessments decide each level, so a failed read can't keep the old list.
    server.use(http.get(`${SUPABASE_URL}/rest/v1/coach_assessments`, () =>
      HttpResponse.json({ message: 'unavailable' }, { status: 500 })))
    await user.click(screen.getByRole('button', { name: /^Home$/i }))
    expect(await screen.findByText(/Couldn't load your players/)).toBeInTheDocument()
    expect(homeRow('Ade Okafor')).toBeNull()
  }, 20_000)

  it("keeps each account's screens apart, and forgets them all on sign-out", () => {
    remember('coach-squad', 'coach-1', { players: PLAYERS })
    expect(remembered('coach-squad', 'coach-1')).toEqual({ players: PLAYERS })
    expect(remembered('coach-squad', 'coach-2')).toBeUndefined()
    expect(remembered('coach-squad', null)).toBeUndefined()
    forgetScreens()
    expect(remembered('coach-squad', 'coach-1')).toBeUndefined()
  })
})
