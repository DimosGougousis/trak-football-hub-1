import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc } from '../../../../tests/msw/supabase'

/**
 * TRAK-212 put the "+" in coach Home's empty top-right slot. TRAK-233 (Imad,
 * 21 Oct) gave that slot to the coach's bell (TRAK-232), so the "+" floats
 * bottom right on Home too, as on every other coach tab.
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
  it('floats bottom right on coach Home, where the bell has the top right', async () => {
    renderApp('/coach/home')
    const box = await corner()
    expect(box).toHaveAttribute('data-corner', 'bottom')
    expect(box).toHaveClass('fixed')
    expect(await screen.findByRole('button', { name: /^Alerts/ })).toBeInTheDocument()
  })

  it('stays above the tab bar on Schedule', async () => {
    renderApp('/coach/schedule')
    const box = await corner()
    expect(box).toHaveAttribute('data-corner', 'bottom')
  })
})
