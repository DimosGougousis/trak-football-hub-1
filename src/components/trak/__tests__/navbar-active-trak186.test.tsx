/**
 * TRAK-186 (live run 3, 16 Oct): on the coach's Sessions → History, the bottom
 * bar stopped marking Sessions, as if the coach had left it. A tab stays marked
 * on every page under it, and says so to screen readers (aria-current).
 * Since the Sessions tab went (Kostas, 20 Oct), its pages mark Home, where they open from.
 */
import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc } from '../../../../tests/msw/supabase'

const COACH = { id: 'coach-186' }

function coach() {
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Angelos Basinas', invite_code: 'ABCD' }]),
    table('coach_sessions', []), table('squad_players', []), table('coach_details', []),
    rpc('feature_on', () => true),
  )
}
const tab = (name: string) => within(screen.getByRole('navigation')).getByRole('button', { name: new RegExp(name, 'i') })

const tabNames = () => within(screen.getByRole('navigation')).getAllByRole('button').map(b => b.textContent)

describe('TRAK-186: the coach\'s logging pages keep Home marked', () => {
  // Kostas, 20 Oct: no Sessions tab. Home's "Log a match or training" and the "+" open it.
  it('has no Sessions tab', async () => {
    coach()
    renderApp('/coach/home')
    await screen.findByRole('navigation')
    // TRAK-211: Feedback (Feedback and assessment) sits after Squad.
    expect(tabNames()).toEqual(['Home', 'Squad', 'Feedback', 'Trainings', 'Profile'])
  }, 20_000)

  it('marks Home on "What are you logging?"', async () => {
    coach()
    renderApp('/coach/sessions')
    await screen.findByText('What are you logging?')
    expect(tab('Home')).toHaveAttribute('aria-current', 'page')
    expect(tab('Squad')).not.toHaveAttribute('aria-current')
  }, 20_000)

  it('still marks Home on History', async () => {
    coach()
    renderApp('/coach/sessions/list')
    await screen.findByRole('navigation')
    expect(tab('Home')).toHaveAttribute('aria-current', 'page')
    expect(tab('Squad')).not.toHaveAttribute('aria-current')
  }, 20_000)
})
