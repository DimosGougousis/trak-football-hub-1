/**
 * TRAK-301 (28 Oct): crossing the side-menu width (a tablet turned, a laptop window resized) rebuilt the coach's
 * page, so anything typed but not saved was lost: a practice half-written in the planner, a match evaluation. The
 * sidebar now keeps the page at the same place in the tree on a phone and a laptop; only the frame changes around it.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SidebarRail } from '../blocks/sidebar-rail/sidebar-rail'

afterEach(cleanup)

const Frame = ({ narrow }: { narrow: boolean }) =>
  <SidebarRail narrow={narrow} label="Rehearsal FC" title="Training" brand={{ name: 'Rehearsal FC', logo: null }}
    items={[{ id: 'home', label: 'Home' }]} footerItem={{ id: 'settings', label: 'Settings' }} profile={{ name: 'Coach Synthetic', avatar: null }} active="home" onSelect={() => {}}>
    <label>Practice name<input /></label>
  </SidebarRail>

describe('TRAK-301: the page survives the frame changing width', () => {
  for (const [from, to] of [['laptop', 'phone'], ['phone', 'laptop']] as const) {
    it(`typing stays when a ${from} becomes a ${to}, and back`, async () => {
      const user = userEvent.setup()
      const { rerender } = render(<Frame narrow={from === 'phone'} />)
      const field = screen.getByRole('textbox', { name: 'Practice name' })
      await user.type(field, 'Rondo 4v2')

      rerender(<Frame narrow={to === 'phone'} />)
      // The same field, not a new empty one.
      expect(screen.getByRole('textbox', { name: 'Practice name' })).toBe(field)
      expect(field).toHaveValue('Rondo 4v2')
      // The frame did change: the laptop's sidebar is there only on a laptop.
      expect(screen.queryByRole('region', { name: 'Rehearsal FC' }) !== null).toBe(to === 'laptop')

      rerender(<Frame narrow={from === 'phone'} />)
      expect(screen.getByRole('textbox', { name: 'Practice name' })).toBe(field)
      expect(field).toHaveValue('Rondo 4v2')
    })
  }
})
