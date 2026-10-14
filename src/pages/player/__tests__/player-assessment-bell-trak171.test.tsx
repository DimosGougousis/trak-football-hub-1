import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { rpc, rpcRows, table, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { PlayerAlertsBell } from '@/components/player/PlayerAlertsBell'

const assessment = { id: 'assessment-training', squad_player_id: 'squad-1', coach_user_id: 'coach-1',
  created_at: '2026-10-12T10:00:00Z', work_rate: 8, tactical: 8, attitude: 8, technical: 8, physical: 8, coachability: 8, coach_rating: 8 }
let feedback: Record<string, unknown>[]
beforeEach(() => {
  localStorage.clear()
  signInAs({ id: 'player-bell' })
  feedback = [{ body: 'Keep pressing after losing the ball.', published_at: '2026-10-13T10:00:00Z' }]
  server.use(
    table('profiles', [{ user_id: 'player-bell', role: 'player', full_name: 'Synthetic Player' }]),
    table('matches', []), table('player_details', []),
    table('squad_players', [{ id: 'squad-1', coach_user_id: 'coach-1' }]),
    table('coach_assessments', [assessment]),
    http.get(`${SUPABASE_URL}/rest/v1/coach_shared_feedback`, ({ request }) => {
      const query = new URL(request.url).searchParams
      expect(query.get('published_at')).toBe('not.is.null')
      expect(query.get('assessment_id')).toBe('eq.assessment-training')
      return HttpResponse.json(feedback)
    }),
    rpcRows('child_events', []),
    rpc('get_player_invites_for_current_user', () => []),
    rpc('my_consent_status', () => ({ required: false, invited_parent: null })),
  )
})
afterEach(cleanup)

describe('TRAK-171: published assessment in the player bell', () => {
  it('alerts for a published training assessment and opens that saved message', async () => {
    renderApp('/player/home')
    await screen.findByText('Keep pressing after losing the ball.')
    await userEvent.click(screen.getByRole('button', { name: 'Alerts, 1 unread' }))
    const panel = await screen.findByRole('dialog', { name: 'Alerts' })
    await userEvent.click(within(panel).getByRole('button', { name: /New coach assessment/ }))
    await userEvent.click(await within(panel).findByRole('button', { name: 'Open assessment' }))
    expect(await screen.findByRole('heading', { name: 'Coach feedback' })).toBeInTheDocument()
    expect(await screen.findByText('Keep pressing after losing the ball.')).toBeInTheDocument()
  })

  it.each([{ rows: [] }, { rows: [{ body: '', published_at: '2026-10-13T10:00:00Z' }] },
    { rows: [{ body: 'Unpublished draft', published_at: null }] }])('does not alert for absent, empty or unpublished feedback: $rows', async ({ rows }) => {
    feedback = rows
    renderApp('/player/home')
    await screen.findByText('LATEST COACH ASSESSMENT')
    await userEvent.click(await screen.findByRole('button', { name: 'Alerts' }))
    expect(within(await screen.findByRole('dialog', { name: 'Alerts' })).queryByText('New coach assessment')).not.toBeInTheDocument()
  })

  it('never shows the previous player’s assessment under another account', async () => {
    render(<MemoryRouter><PlayerAlertsBell userId="another-player" events={[]}
      assessment={{ userId: 'previous-player', id: 'private-assessment', publishedAt: '2026-10-13T10:00:00Z' }} /></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: 'Alerts' }))
    expect(within(await screen.findByRole('dialog', { name: 'Alerts' })).queryByText('New coach assessment')).not.toBeInTheDocument()
  })

  it('offers Retry if publication cannot be checked', async () => {
    server.use(http.get(`${SUPABASE_URL}/rest/v1/coach_shared_feedback`, () => HttpResponse.json({ message: 'offline' }, { status: 500 })))
    renderApp('/player/home')
    await screen.findByText(/Couldn't load your coach's message/)
    await userEvent.click(screen.getByRole('button', { name: 'Alerts' }))
    const panel = await screen.findByRole('dialog', { name: 'Alerts' })
    expect(within(panel).getByText(/couldn't load assessment alerts/i)).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(within(panel).queryByText('New coach assessment')).not.toBeInTheDocument()
  })
})
