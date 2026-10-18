/**
 * TRAK-189 (Tarek, 17 Oct): the rating bands keep their own bright colours so
 * a player's six metrics tell apart at a glance, which only reads on a dark
 * card. A band colour on the light page is 1.2–2.7:1 (axe, 18 Oct, on How Trak
 * Works and the player's Coach Assessments), so every element painted in a band
 * colour must sit inside a `.trak-dark` card.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderApp } from '../../tests/support/render-app'
import { signInAs } from '../../tests/support/session'
import { server } from '../../tests/msw/server'
import { table, rpc } from '../../tests/msw/supabase'
import { BANDS } from '@/lib/types'

const PLAYER = { id: 'player-bands-189' }
const rgb = (hex: string) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
const BAND_RGB = new Set(BANDS.map(b => b.color).filter(c => c.startsWith('#')).map(rgb))

/** Every element whose text or fill is a band colour, and whether it sits on a dark card. */
function bandPainted() {
  return [...document.body.querySelectorAll<HTMLElement>('[style]')]
    .filter(el => BAND_RGB.has(el.style.color) || BAND_RGB.has(el.style.backgroundColor) || BAND_RGB.has(el.style.background))
    .map(el => ({ text: (el.textContent || el.outerHTML).trim().slice(0, 40), dark: !!el.closest('.trak-dark') }))
}

beforeEach(() => {
  signInAs(PLAYER)
  server.use(
    table('profiles', [{ id: 'p', user_id: PLAYER.id, role: 'player', full_name: 'Manos Synthetic' }]),
    table('player_details', [{ user_id: PLAYER.id, position: 'Defender', shirt_number: 13 }]),
    table('matches', []),
    table('squad_players', [{ id: 'squad-1', coach_user_id: 'coach-1', linked_player_id: PLAYER.id, status: 'active' }]),
    table('coach_assessments', [{ id: 'as-1', squad_player_id: 'squad-1', coach_user_id: 'coach-1', created_at: '2026-10-12T10:00:00Z',
      work_rate: 9, tactical: 6, attitude: 8, technical: 5, physical: 7, coachability: 3 }]),
    table('player_parent_links', []),
    rpc('get_player_invites_for_current_user', () => []),
    rpc('my_consent_status', () => ({ required: false, invited_parent: null })),
  )
})
afterEach(() => cleanup())

describe('TRAK-189: band colours only on dark cards', () => {
  it('How Trak Works: the band list and the band words', async () => {
    renderApp('/how-it-works')
    await screen.findByText('PERFORMANCE BANDS')
    const painted = bandPainted()
    expect(painted.length).toBeGreaterThan(6)
    expect(painted.filter(p => !p.dark)).toEqual([])
  })

  it("the player's Coach Assessments", async () => {
    renderApp('/player/profile')
    await screen.findByText('COACH ASSESSMENTS')
    await screen.findByText('Exceptional')
    const painted = bandPainted()
    expect(painted.length).toBeGreaterThan(6)
    expect(painted.filter(p => !p.dark)).toEqual([])
  })
})
