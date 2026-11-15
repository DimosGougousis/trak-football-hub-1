import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { rpc, rpcRows, table, SUPABASE_URL } from '../../../../tests/msw/supabase'

/**
 * TRAK-172 follow-up (Imad, 19 Oct): the player's Home shows their coach
 * assessments as the same swipe cards the parent has, latest first, each
 * opening that assessment. The coach's message on the latest stays below.
 */
const row = (n: number, day: string) => ({ id: `as-${n}`, squad_player_id: 'squad-1', coach_user_id: 'coach-1',
  created_at: `2026-10-${day}T10:00:00Z`, work_rate: 6 + n, tactical: 6, attitude: 7, technical: 6, physical: 7, coachability: 8, coach_rating: 7 })
const ROWS = [row(1, '15'), row(2, '08'), row(3, '01')]

beforeEach(() => {
  localStorage.clear()
  signInAs({ id: 'player-carousel' })
  server.use(
    table('profiles', [{ user_id: 'player-carousel', role: 'player', full_name: 'Synthetic Player' }]),
    table('matches', []), table('player_details', []),
    table('squad_players', [{ id: 'squad-1', coach_user_id: 'coach-1' }]),
    table('coach_assessments', ROWS),
    http.get(`${SUPABASE_URL}/rest/v1/coach_shared_feedback`, () =>
      HttpResponse.json([{ body: 'Keep pressing after losing the ball.', published_at: '2026-10-15T12:00:00Z' }])),
    rpcRows('child_events', []),
    rpc('get_player_invites_for_current_user', () => []),
    rpc('my_consent_status', () => ({ required: false, invited_parent: null })),
  )
})
afterEach(cleanup)

describe("TRAK-172: the player's coach assessments as swipe cards", () => {
  it('shows the latest five as cards, one at a time, each opening that assessment', async () => {
    renderApp('/player/home')
    const section = await screen.findByRole('region', { name: 'Latest coach assessment' })
    expect(await within(section).findByText('1 of 3')).toBeInTheDocument()
    const first = within(section).getByRole('group', { name: 'Assessment 1 of 3' })
    expect(within(first).getByRole('link', { name: 'Open assessment' })).toHaveAttribute('href', '/player/feedback/as-1')
    await userEvent.click(within(section).getByRole('button', { name: 'Next assessment' }))
    expect(within(section).getByText('2 of 3')).toBeInTheDocument()
    // Players have no all-assessments page: no last slide or link to one.
    expect(within(section).queryByText('All assessments')).toBeNull()
    // The coach's message on the latest stays on Home.
    expect(screen.getByText('Keep pressing after losing the ball.')).toBeInTheDocument()
  })
})
