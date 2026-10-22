/**
 * TRAK-254 (step 1 of the coach laptop plan): on a laptop a coach's tabs stand
 * in a side menu with words, the TRAK name and a Calendar tab. Off a laptop, and
 * for players and parents, the bottom bar is today's: no Calendar, no name, and a
 * side-menu-only bar renders nothing.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NavBar } from '../NavBar'
import { SIDE_MENU_QUERY } from '@/lib/side-menu-screen'

const realMatchMedia = window.matchMedia
function screenIs(laptop: boolean) {
  window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: laptop && query === SIDE_MENU_QUERY })) as typeof window.matchMedia
}

afterEach(() => { cleanup(); window.matchMedia = realMatchMedia })

const tabs = () => screen.getAllByRole('button').map(button => button.textContent)

describe('NavBar side menu', () => {
  it("is today's bottom bar for a coach off a laptop", () => {
    screenIs(false)
    render(<NavBar role="coach" activeTab="/coach/home" onNavigate={vi.fn()} />)
    expect(tabs()).toEqual(['Home', 'Squad', 'Feedback', 'Trainings', 'Profile'])
    expect(screen.queryByText('TRAK')).toBeNull()
  })

  it('gives a coach on a laptop the TRAK name and the Calendar, marked on its page', () => {
    screenIs(true)
    render(<NavBar role="coach" activeTab="/coach/schedule" onNavigate={vi.fn()} />)
    // TRAK-255: the coach's Calendar is called Schedule.
    expect(tabs()).toEqual(['Home', 'Schedule', 'Squad', 'Feedback', 'Trainings', 'Profile'])
    expect(screen.getByText('TRAK')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Schedule' }).getAttribute('aria-current')).toBe('page')
  })

  it("keeps a player's and a parent's bar on a laptop", () => {
    screenIs(true)
    render(<NavBar role="player" activeTab="/player/home" onNavigate={vi.fn()} />)
    expect(tabs()).toEqual(['Home', 'Sessions', 'Trainings', 'Card', 'Profile'])
    cleanup()
    render(<NavBar role="parent" activeTab="/parent/home" onNavigate={vi.fn()} />)
    expect(tabs()).toEqual(['Home', 'Events', 'Profile'])
    expect(screen.queryByText('TRAK')).toBeNull()
  })

  it('shows a side-menu-only bar on a laptop and nothing elsewhere', () => {
    screenIs(false)
    const phone = render(<NavBar role="coach" sideMenuOnly activeTab="/coach/profile" onNavigate={vi.fn()} />)
    expect(phone.container.innerHTML).toBe('')
    cleanup()
    screenIs(true)
    render(<NavBar role="coach" sideMenuOnly activeTab="/coach/profile" onNavigate={vi.fn()} />)
    expect(screen.getByRole('navigation')).toBeTruthy()
  })
})
