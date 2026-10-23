import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc } from '../../../../tests/msw/supabase'
import { forgetScreens } from '@/lib/screen-memory'

// TRAK-262 (Imad, 22 Oct): a coach's first open of Home shows the onboarding, four steps, once per device.
// Every other test runs as a device that has seen it (src/test/setup.ts); this one uses the real check.
vi.unmock('@/lib/coach-onboarding')

const COACH = { id: 'coach-262-onboarding' }

beforeEach(() => {
  localStorage.clear()
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Angelos Basinas' }]),
    table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U16s', organization_id: 'org-1' }]),
    table('organizations', [{ id: 'org-1', name: 'Synthetic Athens' }]),
    table('squad_players', [{ id: 'a', coach_user_id: COACH.id, player_name: 'Ade Okafor', age_group: 'U16', status: 'active', created_at: '2026-10-01T08:00:00Z' }]),
    table('coach_assessments', []),
    table('coach_sessions', []),
    table('coach_calendar_events', []),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('feature_on', () => true),
  )
})
afterEach(() => { cleanup(); forgetScreens(); localStorage.clear() })

describe('TRAK-262: coach onboarding', () => {
  it('opens on the first visit, walks four steps, and stays closed after', async () => {
    renderApp('/coach/home')
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 })
    expect(within(dialog).getByText('Your week, at a glance')).toBeInTheDocument()
    for (const title of ['Your squad, one player at a time', 'Everything starts with +', "You're ready"]) {
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Next' }))
      expect(await within(dialog).findByText(title)).toBeInTheDocument()
    }
    expect(within(dialog).getByText(/Synthetic Athens has 1 squad and 1 player\./)).toBeInTheDocument()
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Get started' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    cleanup()
    forgetScreens()
    renderApp('/coach/home')
    expect(await screen.findByRole('heading', { name: 'Squad shape' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
