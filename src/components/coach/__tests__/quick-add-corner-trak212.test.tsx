import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc } from '../../../../tests/msw/supabase'

/**
 * TRAK-212: on coach Home the "+" sits in the header's empty top-right slot,
 * fixed, so it stays in reach however far the page scrolls. Schedule has its
 * own controls up there, so its "+" stays above the tab bar.
 */

const COACH = { id: 'coach-corner' }

beforeEach(() => {
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach', invite_code: 'ABCD' }]),
    table('coach_details', []),
    table('coach_calendar_events', []),
    table('coach_sessions', []),
    table('squad_players', []),
    table('session_attendance', []),
    table('event_absences', []),
    rpc('feature_on', () => true),
  )
})

const corner = async () => (await screen.findByRole('button', { name: 'Quick add' })).closest<HTMLElement>('[data-quick-add]')!

describe('TRAK-212: where the quick-add "+" sits', { timeout: 20_000 }, () => {
  it('is pinned to the top right on coach Home', async () => {
    renderApp('/coach/home')
    const box = await corner()
    expect(box).toHaveAttribute('data-corner', 'top')
    expect(box).toHaveClass('fixed')
  })

  it('stays above the tab bar on Schedule', async () => {
    renderApp('/coach/schedule')
    const box = await corner()
    expect(box).toHaveAttribute('data-corner', 'bottom')
  })
})
