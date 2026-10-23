import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../../../../tests/support/render-app'
import { signInAs } from '../../../../tests/support/session'
import { server } from '../../../../tests/msw/server'
import { table, rpc } from '../../../../tests/msw/supabase'
import { SIDE_MENU_QUERY } from '@/lib/side-menu-screen'
import { BARLESS, placeOf } from '@/lib/coach-places'

/**
 * TRAK-259 (Imad, 22 Oct): the coach's frame. Phone: a glass tab bar (Home,
 * Squad, Library) with the "+" at its right; on Home the avatar (top left)
 * opens the side menu, and the calendar sits beside the bell. Laptop: the
 * sidebar (the club, Home, Calendar, Squads, Library, Settings, the coach) and
 * "+ Create" at the top right. Feedback and Profile left the nav, not the app.
 */

const COACH = { id: 'coach-frame' }
const realMatchMedia = window.matchMedia
function screenIs(laptop: boolean) {
  window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: laptop && query === SIDE_MENU_QUERY })) as typeof window.matchMedia
}

beforeEach(() => {
  signInAs(COACH)
  server.use(
    table('profiles', [{ id: 'p', user_id: COACH.id, role: 'coach', full_name: 'Otto Rehhagel', invite_code: 'ABCD' }]),
    table('coach_details', [{ user_id: COACH.id, coach_role: 'Head Coach', team: 'U14', organization_id: 'org-1' }]),
    table('organizations', [{ id: 'org-1', name: 'Rehearsal FC' }]),
    table('coach_calendar_events', []),
    table('coach_sessions', []),
    table('squad_players', [
      { id: 'sp-1', coach_user_id: COACH.id, player_name: 'Angelos Charisteas', age_group: 'U14', status: 'active' },
      { id: 'sp-2', coach_user_id: COACH.id, player_name: 'Theodoros Zagorakis', age_group: 'U16', status: 'active' },
    ]),
    table('session_attendance', []),
    table('event_absences', []),
    rpc('feature_on', () => true),
  )
})
afterEach(() => { window.matchMedia = realMatchMedia })

describe('TRAK-259: the coach\'s frame', { timeout: 20_000 }, () => {
  it('on a phone: Home, Squad and Library in the glass tab bar, with the "+" beside them', async () => {
    screenIs(false)
    renderApp('/coach/home')
    const tabs = await screen.findByRole('tablist', { name: 'Coach' })
    expect(within(tabs).getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Home', 'Squad', 'Library'])
    expect(within(tabs).getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true')
    const nav = tabs.closest('nav')!
    expect(within(nav).getByRole('button', { name: 'Quick add' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Feedback|Profile|Calendar/ })).toBeNull()

    await userEvent.click(within(tabs).getByRole('tab', { name: 'Library' }))
    await waitFor(() => expect(window.location.pathname).toBe('/coach/trainings'))
  })

  it('on a phone: Home\'s avatar opens the side menu; the calendar sits beside the bell', async () => {
    screenIs(false)
    renderApp('/coach/home')
    const header = (await screen.findByRole('button', { name: 'Open menu' })).closest('header')!
    expect(within(header).getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '/coach/schedule')
    expect(within(header).getByRole('button', { name: /^Alerts/ })).toBeInTheDocument()

    await userEvent.click(within(header).getByRole('button', { name: 'Open menu' }))
    const menu = await screen.findByRole('dialog', { name: 'Menu' })
    expect(await within(menu).findByText('Rehearsal FC')).toBeInTheDocument()
    for (const row of ['Home', 'Calendar', 'Squads', 'U14', 'U16', 'Library', 'Settings']) {
      expect(within(menu).getByRole('button', { name: new RegExp(`^${row}`) })).toBeInTheDocument()
    }
    expect(within(menu).getByText('Otto Rehhagel')).toBeInTheDocument()
    expect(within(menu).getByText('Head Coach')).toBeInTheDocument()

    await userEvent.click(within(menu).getByRole('button', { name: 'Settings' }))
    await waitFor(() => expect(window.location.pathname).toBe('/settings'))
  })

  it('on a laptop: the sidebar, and "+ Create" at the top right', async () => {
    screenIs(true)
    renderApp('/coach/home')
    const sidebar = await screen.findByRole('navigation', { name: 'Rehearsal FC' })
    for (const row of ['Home', 'Calendar', 'Squads', 'Library', 'Settings']) {
      expect(within(sidebar).getByRole('button', { name: new RegExp(`^${row}`) })).toBeInTheDocument()
    }
    expect(within(sidebar).queryByRole('button', { name: /Feedback|Profile/ })).toBeNull()
    expect(within(sidebar).getByRole('button', { name: /^Home/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Create' })).toHaveAttribute('aria-haspopup', 'menu')
    expect(screen.queryByRole('tablist', { name: 'Coach' })).toBeNull()

    // A squad's row picks that squad and opens Squad.
    await userEvent.click(within(sidebar).getByRole('button', { name: 'U16' }))
    await waitFor(() => expect(window.location.pathname).toBe('/coach/squad'))
    await waitFor(() => expect(within(sidebar).getByRole('button', { name: 'U16' })).toHaveAttribute('aria-current', 'page'))
  })

  it('Feedback and Profile still open by their address', async () => {
    screenIs(false)
    renderApp('/coach/feedback')
    expect(await screen.findByRole('tablist', { name: 'Coach' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/coach/feedback')
  })

  it('keeps the phone bar off pages that had none: their own actions sit at the bottom', async () => {
    for (const path of ['/settings', '/coach/manual', '/coach/player/sp-1', '/coach/sessions/add', '/coach/sessions/quick', '/coach/sessions/abc'])
      expect(BARLESS.test(path)).toBe(true)
    for (const path of ['/coach/home', '/coach/sessions', '/coach/sessions/list', '/coach/assess', '/coach/squad', '/coach/trainings'])
      expect(BARLESS.test(path)).toBe(false)
    screenIs(false)
    renderApp('/settings')
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: 'Coach' })).toBeNull()
  })

  it('knows which row a page belongs to', () => {
    expect(placeOf('/coach/player/abc')).toEqual({ screen: 'squad', title: 'Player' })
    expect(placeOf('/coach/sessions/list')).toEqual({ screen: 'home', title: 'Log' })
    expect(placeOf('/coach/schedule')).toEqual({ screen: 'calendar', title: 'Calendar' })
    expect(placeOf('/coach/homework')).toEqual({ screen: null, title: 'Trak' })
  })
})
