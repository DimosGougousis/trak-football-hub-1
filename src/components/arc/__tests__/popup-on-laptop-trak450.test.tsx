/**
 * TRAK-450 (11 Nov walk-through): on a laptop, pop-ups felt narrow and rose from the bottom edge like on a phone.
 * Every pop-up goes through Arc's BottomSheet, so on a laptop it is now a card in the middle of the screen: one width
 * and one set of margins for all of them, no grabber, no slide from the bottom. Phones keep the sheet. The keyboard
 * still works: Escape closes, and focus goes back to the button that opened it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BottomSheet } from '../bottom-sheet/bottom-sheet'
import { SIDE_MENU_QUERY } from '@/lib/side-menu-screen'

const realMatchMedia = window.matchMedia
function screenIs(laptop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: laptop && query === SIDE_MENU_QUERY, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}
afterEach(() => { cleanup(); window.matchMedia = realMatchMedia })

const Popup = ({ wide = false }: { wide?: boolean }) =>
  <BottomSheet title="New formation" wide={wide} trigger={<button type="button">New formation</button>}>
    <label>Name<input /></label>
  </BottomSheet>

describe('TRAK-450: pop-ups on a laptop', () => {
  it('a laptop gets a card: no grabber, and it can be closed with Escape, focus back on the button', async () => {
    screenIs(true)
    const user = userEvent.setup()
    render(<Popup />)
    const opener = screen.getByRole('button', { name: 'New formation' })
    await user.click(opener)
    const dialog = await screen.findByRole('dialog', { name: 'New formation' })
    expect(dialog).toHaveAttribute('data-card')
    expect(screen.queryByRole('button', { name: /Expand sheet|Collapse sheet/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(opener).toHaveFocus()
  })

  it('a phone keeps the bottom sheet with its grabber', async () => {
    screenIs(false)
    const user = userEvent.setup()
    render(<Popup />)
    await user.click(screen.getByRole('button', { name: 'New formation' }))
    const dialog = await screen.findByRole('dialog', { name: 'New formation' })
    expect(dialog).not.toHaveAttribute('data-card')
    expect(screen.getByRole('button', { name: 'Expand sheet' })).toBeInTheDocument()
  })

  it('one width and one set of margins for every card; wider than the old 36rem sheet', () => {
    const css = readFileSync(resolve(__dirname, '../bottom-sheet/bottom-sheet.module.css'), 'utf8')
    const rule = (name: string) => css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))?.[1] ?? ''
    expect(rule('card')).toContain('width: min(100%, 42rem)')
    expect(rule('cardHeader')).toContain('padding: var(--space-6) var(--space-6) var(--space-4)')
    expect(rule('cardBody')).toContain('padding: var(--space-1) var(--space-6) var(--space-6)')
    // In the middle of the screen, at least 32 px from each edge; never anchored to the bottom.
    expect(rule('cardFrame')).toContain('place-items: center')
    expect(rule('cardFrame')).toContain('padding: var(--space-8)')
    expect(rule('card')).not.toMatch(/bottom:/)
  })
})
