/**
 * TRAK-250: Squad is a tabbed coach workspace (Snapshot, Attributes, Season,
 * Availability) with one shared roster read. This file holds the shell tests;
 * each tab's own tests are appended as the tab lands.
 */
import { it, expect, describe, beforeEach, afterEach } from 'vitest'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { registerAuthUser } from '../../../../tests/msw/auth-sessions'
import { forgetScreens } from '@/lib/screen-memory'
import { supabase } from '@/integrations/supabase/client'

// The app's query cache outlives a test, so each test is its own coach.
let COACH = { id: 'coach-250-shell' }
let n = 0

const PLAYERS = [
  { id: 'sq-nia', coach_user_id: 'coach-250-shell', player_name: 'Nia Rehearsal', position: 'Midfielder', shirt_number: 8, age_group: 'U10' },
  { id: 'sq-theo', coach_user_id: 'coach-250-shell', player_name: 'Theo Rehearsal', position: 'Defender', shirt_number: 4, age_group: 'U12' },
  { id: 'sq-ida', coach_user_id: 'coach-250-shell', player_name: 'Ida Rehearsal', position: 'Goalkeeper', shirt_number: 1, age_group: 'U12' },
]

function coachReads(players: Record<string, unknown>[] = PLAYERS) {
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Coach Rehearsal', nationality: 'AE' }]),
    table('squad_players', players),
    table('coach_assessments', []),
    table('coach_sessions', []),
    rpc('coach_squad_player_consent_required', () => false),
    rpc('feature_on', () => true),
  )
}

beforeEach(() => { localStorage.clear(); COACH = { id: `coach-250-shell-${++n}` }; signInAs(COACH) })
afterEach(() => { cleanup(); forgetScreens(); localStorage.clear() })

const tab = (name: string) => screen.findByRole('tab', { name })
const panelNames = (panel: HTMLElement) => within(panel).getAllByRole('listitem').map(li => li.textContent).sort()

describe('TRAK-250: the Squad shell', { timeout: 20_000 }, () => {
  it('opens on Snapshot and keeps the tab in the URL', async () => {
    const user = userEvent.setup()
    coachReads()
    renderApp('/coach/squad')
    expect(await tab('Snapshot')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tablist', { name: 'Squad views' })).toBeInTheDocument()
    expect(await screen.findByRole('tabpanel', { name: 'Snapshot' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Season' }))
    expect(screen.getByRole('tab', { name: 'Season' })).toHaveAttribute('aria-selected', 'true')
    expect(window.location.search).toContain('tab=season')
    expect(await screen.findByRole('tabpanel', { name: 'Season' })).toBeInTheDocument()

    cleanup()
    renderApp('/coach/squad?tab=attributes')
    expect(await tab('Attributes')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Snapshot' })).toHaveAttribute('aria-selected', 'false')

    cleanup()
    renderApp('/coach/squad?tab=nonsense')
    expect(await tab('Snapshot')).toHaveAttribute('aria-selected', 'true')
  })

  it('squad picker scopes every tab', async () => {
    const user = userEvent.setup()
    coachReads()
    renderApp('/coach/squad')
    // Two squads: the first (U10) shows until the coach picks the other.
    const first = await screen.findByRole('tabpanel', { name: 'Snapshot' })
    await within(first).findByText('Nia Rehearsal')
    expect(within(first).queryByText('Theo Rehearsal')).toBeNull()

    await user.click(within(screen.getByRole('group', { name: 'Squad' })).getByRole('button', { name: 'U12' }))
    await waitFor(() => expect(panelNames(screen.getByRole('tabpanel', { name: 'Snapshot' }))).toEqual(['Ida Rehearsal', 'Theo Rehearsal']))
    expect(screen.queryByText('Nia Rehearsal')).toBeNull()
  })

  it('a failed roster read shows Try again, never an empty squad', async () => {
    const user = userEvent.setup()
    coachReads()
    let failing = true
    server.use(http.get(`${SUPABASE_URL}/rest/v1/squad_players`, () =>
      failing ? HttpResponse.json({ message: 'unavailable' }, { status: 500 }) : HttpResponse.json(PLAYERS)))
    renderApp('/coach/squad')
    expect(await screen.findByText("Couldn't load your squad", undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByText('Your squad is being prepared')).toBeNull()

    failing = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    const panel = await screen.findByRole('tabpanel', { name: 'Snapshot' })
    expect(await within(panel).findByText('Nia Rehearsal')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your squad")).toBeNull()
  })

  it('an empty squad says it is being prepared, once the read has answered', async () => {
    coachReads([])
    renderApp('/coach/squad')
    expect(await screen.findByText('Your squad is being prepared')).toBeInTheDocument()
  })

  it('the old directory is gone', async () => {
    coachReads()
    renderApp('/coach/squad')
    await screen.findByRole('tabpanel', { name: 'Snapshot' })
    expect(screen.queryByRole('searchbox', { name: 'Search players' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Quick add' })).toBeNull()
  })

  // TRAK-79 / UC-X02 (from the retired squad-load-failure-refresh test): a same-account token
  // refresh must not replace a failure with an empty squad.
  it('keeps a load failure on screen, not an empty squad, across a token refresh', async () => {
    const user = userEvent.setup()
    coachReads()
    let failing = true
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/squad_players`, () =>
        failing ? HttpResponse.json({ message: 'synthetic failure' }, { status: 500 }) : HttpResponse.json(PLAYERS)),
      http.post(`${SUPABASE_URL}/auth/v1/token`, () => {
        const previous = JSON.parse(localStorage.getItem('sb-test-auth-token')!)
        const refreshed = structuredClone(previous.user)
        return HttpResponse.json({ ...previous, user: refreshed, access_token: registerAuthUser(refreshed),
          expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600 })
      }),
    )
    renderApp('/coach/squad')
    await screen.findByText("Couldn't load your squad", undefined, { timeout: 5000 })
    failing = false
    await act(async () => { const { error } = await supabase.auth.refreshSession(); expect(error).toBeNull() })
    await act(async () => { await new Promise(r => setTimeout(r, 100)) })
    expect(screen.getByText("Couldn't load your squad")).toBeInTheDocument()
    expect(screen.queryByText('Your squad is being prepared')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await within(await screen.findByRole('tabpanel', { name: 'Snapshot' })).findByText('Nia Rehearsal')).toBeInTheDocument()
  })

  // TRAK-79 (from the retired squad-consent-status test): another coach signing in on this
  // device never sees the first coach's children, not even while their own read is pending.
  it("a different coach never sees the previous coach's players", async () => {
    coachReads()
    renderApp('/coach/squad')
    await within(await screen.findByRole('tabpanel', { name: 'Snapshot' })).findByText('Nia Rehearsal')
    cleanup()

    const second = { id: `${COACH.id}-other` }
    signInAs(second)
    let release!: () => void
    const held = new Promise<void>(r => { release = r })
    server.use(
      table('profiles', [{ id: 'p2', user_id: second.id, role: 'coach', full_name: 'Other Coach', nationality: 'AE' }]),
      http.get(`${SUPABASE_URL}/rest/v1/squad_players`, async () => {
        await held
        return HttpResponse.json([{ id: 'sq-zed', coach_user_id: second.id, player_name: 'Zed Rehearsal', position: 'Attacker', shirt_number: 9, age_group: 'U14' }])
      }),
    )
    renderApp('/coach/squad')
    await screen.findByRole('tab', { name: 'Snapshot' })
    await screen.findByRole('status')
    expect(screen.queryByText('Nia Rehearsal')).toBeNull()
    release()
    expect(await screen.findByText('Zed Rehearsal')).toBeInTheDocument()
    expect(screen.queryByText('Nia Rehearsal')).toBeNull()
  })

  // A failed consent check is a failed read: the squad is never listed as if every child could be assessed.
  it('a failed consent check shows Try again, never the children as ready', async () => {
    coachReads()
    server.use(rpc('coach_squad_player_consent_required', () => ({ status: 500, body: { message: 'synthetic failure' } })))
    renderApp('/coach/squad')
    expect(await screen.findByText("Couldn't load your squad", undefined, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByText('Nia Rehearsal')).toBeNull()
  })
})
