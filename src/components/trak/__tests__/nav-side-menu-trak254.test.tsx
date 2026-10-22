/**
 * TRAK-254 gave a coach on a laptop a side menu inside NavBar. TRAK-259 (Imad,
 * 22 Oct) moved every coach's nav into the coach's frame (CoachFrame), so NavBar
 * renders nothing for a coach; players and parents keep today's bottom bar on
 * every screen. The frame's own tests are coach-frame-trak259.test.tsx.
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

describe('NavBar', () => {
  it('renders nothing for a coach, on a phone or a laptop (the frame has their nav)', () => {
    for (const laptop of [false, true]) {
      screenIs(laptop)
      const { container } = render(<NavBar role="coach" activeTab="/coach/home" onNavigate={vi.fn()} />)
      expect(container.innerHTML).toBe('')
      cleanup()
    }
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
})
